import http from "node:http";
import { URL } from "node:url";

import { encodeAbiParameters, getAddress, http as httpTransport, keccak256, parseAbiParameters, toBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createPublicClient, createWalletClient } from "viem";

import { myShopItemsAbi } from "./abi.js";

class RateLimitError extends Error {
  constructor(message = "rate_limited") {
    super(message);
    this.name = "RateLimitError";
  }
}

class HttpError extends Error {
  constructor({ status, code, message, details }) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.details = details ?? null;
  }
}

export async function startPermitServer({
  rpcUrl,
  chain,
  itemsAddress,
  serialSignerPrivateKey,
  riskSignerPrivateKey,
  serialIssuerUrl,
  port
}) {
  const publicClient = createPublicClient({
    chain,
    transport: httpTransport(rpcUrl)
  });

  const walletClients = {
    serial: serialSignerPrivateKey
      ? createWalletClient({
          chain,
          transport: httpTransport(rpcUrl),
          account: privateKeyToAccount(serialSignerPrivateKey)
        })
      : null,
    risk: riskSignerPrivateKey
      ? createWalletClient({
          chain,
          transport: httpTransport(rpcUrl),
          account: privateKeyToAccount(riskSignerPrivateKey)
        })
      : null
  };

  const limiter = {
    enabled: process.env.PERMIT_RATE_LIMIT === "0" ? false : true,
    windowMs: Number(process.env.PERMIT_RATE_LIMIT_WINDOW_MS ?? "60000"),
    max: Number(process.env.PERMIT_RATE_LIMIT_MAX ?? "120"),
    buckets: new Map()
  };

  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === "OPTIONS") {
        res.writeHead(204, {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET,POST,OPTIONS",
          "access-control-allow-headers": "content-type"
        });
        res.end();
        return;
      }

      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

      if (url.pathname === "/health") {
        _json(res, 200, { ok: true });
        return;
      }

      if (url.pathname === "/config") {
        _requireMethod(req, ["GET"]);
        _json(res, 200, {
          ok: true,
          chainId: chain.id,
          itemsAddress: getAddress(itemsAddress),
          serialSignerConfigured: walletClients.serial != null,
          riskSignerConfigured: walletClients.risk != null,
          rateLimit: {
            enabled: limiter.enabled,
            windowMs: limiter.windowMs,
            max: limiter.max
          }
        });
        return;
      }

      if (limiter.enabled && (url.pathname === "/serial-permit" || url.pathname === "/risk-allowance")) {
        _rateLimitOrThrow({ req, url, limiter });
      }

      if (url.pathname === "/serial-permit") {
        _requireMethod(req, ["GET"]);
        if (!walletClients.serial) {
          throw new HttpError({
            status: 500,
            code: "signer_not_configured",
            message: "SERIAL_SIGNER_PRIVATE_KEY not set"
          });
        }
        const buyer = _getAddressParam(url, "buyer");
        const itemId = _getUintParam(url, "itemId", { min: 1n });
        const deadline = _getDeadlineParam(url, "deadline");
        const nonce = await _resolveNonce(publicClient, itemsAddress, buyer, url.searchParams.get("nonce"));

        const serialResult = await _resolveSerialHash({
          url,
          serialIssuerUrl,
          buyer,
          itemId
        });
        const serialHash = serialResult.serialHash;

        const signature = await walletClients.serial.signTypedData({
          domain: { name: "MyShop", version: "1", chainId: chain.id, verifyingContract: getAddress(itemsAddress) },
          types: {
            SerialPermit: [
              { name: "itemId", type: "uint256" },
              { name: "buyer", type: "address" },
              { name: "serialHash", type: "bytes32" },
              { name: "deadline", type: "uint256" },
              { name: "nonce", type: "uint256" }
            ]
          },
          primaryType: "SerialPermit",
          message: { itemId, buyer, serialHash, deadline, nonce }
        });

        const extraData = encodeAbiParameters(
          parseAbiParameters("bytes32 serialHash,uint256 deadline,uint256 nonce,bytes sig"),
          [serialHash, deadline, nonce, signature]
        );

        _json(res, 200, {
          ok: true,
          buyer,
          itemId: itemId.toString(),
          serial: serialResult.serial,
          serialHash,
          deadline: deadline.toString(),
          nonce: nonce.toString(),
          signature,
          extraData
        });
        return;
      }

      if (url.pathname === "/risk-allowance") {
        _requireMethod(req, ["GET"]);
        if (!walletClients.risk) {
          throw new HttpError({
            status: 500,
            code: "signer_not_configured",
            message: "RISK_SIGNER_PRIVATE_KEY not set"
          });
        }
        const shopOwner = _getAddressParam(url, "shopOwner");
        const maxItems = _getUintParam(url, "maxItems", { min: 1n });
        const deadline = _getDeadlineParam(url, "deadline");
        const nonce = await _resolveNonce(publicClient, itemsAddress, shopOwner, url.searchParams.get("nonce"));

        const signature = await walletClients.risk.signTypedData({
          domain: { name: "MyShop", version: "1", chainId: chain.id, verifyingContract: getAddress(itemsAddress) },
          types: {
            RiskAllowance: [
              { name: "shopOwner", type: "address" },
              { name: "maxItems", type: "uint256" },
              { name: "deadline", type: "uint256" },
              { name: "nonce", type: "uint256" }
            ]
          },
          primaryType: "RiskAllowance",
          message: { shopOwner, maxItems, deadline, nonce }
        });

        _json(res, 200, {
          ok: true,
          shopOwner,
          maxItems: maxItems.toString(),
          deadline: deadline.toString(),
          nonce: nonce.toString(),
          signature
        });
        return;
      }

      _json(res, 404, { ok: false, error: "not_found" });
    } catch (e) {
      if (e instanceof RateLimitError) {
        _json(res, 429, { ok: false, error: "rate_limited", errorCode: "rate_limited" });
        return;
      }
      if (e instanceof HttpError) {
        _json(res, e.status, {
          ok: false,
          error: e.message,
          errorCode: e.code,
          errorDetails: e.details
        });
        return;
      }
      _json(res, 500, { ok: false, error: e instanceof Error ? e.message : String(e), errorCode: "internal_error" });
    }
  });

  await new Promise((resolve) => server.listen(port, resolve));
  return {
    close: () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
    port
  };
}

function _get(url, key) {
  const value = url.searchParams.get(key);
  if (!value) {
    throw new HttpError({
      status: 400,
      code: "missing_param",
      message: `Missing query param: ${key}`,
      details: { param: key }
    });
  }
  return value;
}

function _json(res, status, obj) {
  res.writeHead(status, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type"
  });
  res.end(JSON.stringify(obj));
}

function _requireMethod(req, allowed) {
  const method = req.method ?? "GET";
  if (allowed.includes(method)) return;
  throw new HttpError({
    status: 405,
    code: "method_not_allowed",
    message: "Method not allowed",
    details: { method, allowed }
  });
}

function _getAddressParam(url, key) {
  const raw = _get(url, key);
  try {
    return getAddress(raw);
  } catch {
    throw new HttpError({
      status: 400,
      code: "invalid_param",
      message: `Invalid address param: ${key}`,
      details: { param: key, value: raw }
    });
  }
}

function _getUintParam(url, key, { min, max } = {}) {
  const raw = _get(url, key);
  if (!/^\d+$/.test(raw)) {
    throw new HttpError({
      status: 400,
      code: "invalid_param",
      message: `Invalid uint param: ${key}`,
      details: { param: key, value: raw }
    });
  }
  const value = BigInt(raw);
  if (min != null && value < min) {
    throw new HttpError({
      status: 400,
      code: "invalid_param",
      message: `Param out of range: ${key}`,
      details: { param: key, value: raw, min: min.toString() }
    });
  }
  if (max != null && value > max) {
    throw new HttpError({
      status: 400,
      code: "invalid_param",
      message: `Param out of range: ${key}`,
      details: { param: key, value: raw, max: max.toString() }
    });
  }
  return value;
}

function _getDeadlineParam(url, key) {
  const deadline = _getUintParam(url, key, { min: 1n });
  const nowSec = BigInt(Math.floor(Date.now() / 1000));
  if (deadline <= nowSec) {
    throw new HttpError({
      status: 400,
      code: "deadline_expired",
      message: "deadline must be in the future",
      details: { param: key, nowSec: nowSec.toString(), deadline: deadline.toString() }
    });
  }
  return deadline;
}

function _getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) return forwarded.split(",")[0].trim();
  if (Array.isArray(forwarded) && forwarded.length > 0 && forwarded[0].trim()) return forwarded[0].split(",")[0].trim();
  return req.socket.remoteAddress ?? "unknown";
}

function _rateLimitOrThrow({ req, url, limiter }) {
  const ip = _getClientIp(req);
  const key = `${ip}:${url.pathname}`;
  const now = Date.now();

  const existing = limiter.buckets.get(key);
  if (!existing || now - existing.windowStartMs >= limiter.windowMs) {
    limiter.buckets.set(key, { windowStartMs: now, count: 1 });
    return;
  }

  if (existing.count >= limiter.max) throw new RateLimitError();
  existing.count += 1;
}

async function _resolveNonce(publicClient, itemsAddress, user, nonceParam) {
  if (nonceParam != null && nonceParam !== "") {
    if (!/^\d+$/.test(nonceParam)) {
      throw new HttpError({
        status: 400,
        code: "invalid_param",
        message: "Invalid uint param: nonce",
        details: { param: "nonce", value: nonceParam }
      });
    }
    const nonce = BigInt(nonceParam);
    const maxNonce = BigInt(process.env.PERMIT_MAX_NONCE ?? "1000000");
    if (nonce > maxNonce) {
      throw new HttpError({
        status: 400,
        code: "invalid_param",
        message: "Param out of range: nonce",
        details: { param: "nonce", value: nonceParam, max: maxNonce.toString() }
      });
    }
    return nonce;
  }
  for (let i = 0n; i < 1000n; i++) {
    const used = await publicClient.readContract({
      address: getAddress(itemsAddress),
      abi: myShopItemsAbi,
      functionName: "usedNonces",
      args: [user, i]
    });
    if (!used) return i;
  }
  throw new Error("No free nonce found within 0..999");
}

async function _resolveSerialHash({ url, serialIssuerUrl, buyer, itemId }) {
  const serialHashParam = url.searchParams.get("serialHash");
  if (serialHashParam) {
    if (!/^0x[0-9a-fA-F]{64}$/.test(serialHashParam)) {
      throw new HttpError({
        status: 400,
        code: "invalid_param",
        message: "Invalid bytes32 param: serialHash",
        details: { param: "serialHash", value: serialHashParam }
      });
    }
    return { serial: null, serialHash: serialHashParam };
  }

  const serialParam = url.searchParams.get("serial");
  if (serialParam) {
    const maxLen = Number(process.env.PERMIT_MAX_SERIAL_LENGTH ?? "128");
    if (serialParam.length < 1 || serialParam.length > maxLen) {
      throw new HttpError({
        status: 400,
        code: "invalid_param",
        message: "Param out of range: serial",
        details: { param: "serial", minLength: 1, maxLength: maxLen }
      });
    }
    return { serial: serialParam, serialHash: keccak256(toBytes(serialParam)) };
  }

  if (!serialIssuerUrl) {
    throw new HttpError({
      status: 400,
      code: "missing_param",
      message: "Missing query param: serial (or set SERIAL_ISSUER_URL)",
      details: { param: "serial" }
    });
  }

  const context = url.searchParams.get("context");
  const maxContextLen = Number(process.env.PERMIT_MAX_CONTEXT_LENGTH ?? "256");
  if (context != null && context.length > maxContextLen) {
    throw new HttpError({
      status: 400,
      code: "invalid_param",
      message: "Param out of range: context",
      details: { param: "context", maxLength: maxContextLen }
    });
  }

  const issued = await _issueSerial(serialIssuerUrl, {
    buyer,
    itemId: itemId.toString(),
    context
  });

  if (issued.serialHash) return { serial: issued.serial ?? null, serialHash: issued.serialHash };
  if (issued.serial) return { serial: issued.serial, serialHash: keccak256(toBytes(issued.serial)) };
  throw new HttpError({
    status: 502,
    code: "serial_issuer_error",
    message: "SERIAL_ISSUER_URL response must include serial or serialHash"
  });
}

async function _issueSerial(serialIssuerUrl, payload) {
  let res;
  try {
    res = await fetch(serialIssuerUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch (e) {
    throw new HttpError({
      status: 502,
      code: "serial_issuer_error",
      message: e instanceof Error ? e.message : String(e)
    });
  }

  if (!res.ok) {
    throw new HttpError({
      status: 502,
      code: "serial_issuer_error",
      message: `SERIAL_ISSUER_URL error: HTTP ${res.status}`
    });
  }
  const json = await res.json();
  if (json == null || typeof json !== "object") {
    throw new HttpError({
      status: 502,
      code: "serial_issuer_error",
      message: "SERIAL_ISSUER_URL returned non-object JSON"
    });
  }
  return json;
}
