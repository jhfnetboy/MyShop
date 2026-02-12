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

      if (limiter.enabled && (url.pathname === "/serial-permit" || url.pathname === "/risk-allowance")) {
        _rateLimitOrThrow({ req, url, limiter });
      }

      if (url.pathname === "/serial-permit") {
        if (!walletClients.serial) throw new Error("SERIAL_SIGNER_PRIVATE_KEY not set");
        const buyer = getAddress(_get(url, "buyer"));
        const itemId = BigInt(_get(url, "itemId"));
        const deadline = BigInt(_get(url, "deadline"));
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
        if (!walletClients.risk) throw new Error("RISK_SIGNER_PRIVATE_KEY not set");
        const shopOwner = getAddress(_get(url, "shopOwner"));
        const maxItems = BigInt(_get(url, "maxItems"));
        const deadline = BigInt(_get(url, "deadline"));
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
        _json(res, 429, { ok: false, error: "rate_limited" });
        return;
      }
      _json(res, 400, { ok: false, error: e instanceof Error ? e.message : String(e) });
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
  if (!value) throw new Error(`Missing query param: ${key}`);
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
  if (nonceParam != null && nonceParam !== "") return BigInt(nonceParam);
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
  if (serialHashParam) return { serial: null, serialHash: serialHashParam };

  const serialParam = url.searchParams.get("serial");
  if (serialParam) return { serial: serialParam, serialHash: keccak256(toBytes(serialParam)) };

  if (!serialIssuerUrl) throw new Error("Missing query param: serial (or set SERIAL_ISSUER_URL)");

  const issued = await _issueSerial(serialIssuerUrl, {
    buyer,
    itemId: itemId.toString(),
    context: url.searchParams.get("context")
  });

  if (issued.serialHash) return { serial: issued.serial ?? null, serialHash: issued.serialHash };
  if (issued.serial) return { serial: issued.serial, serialHash: keccak256(toBytes(issued.serial)) };
  throw new Error("SERIAL_ISSUER_URL response must include serial or serialHash");
}

async function _issueSerial(serialIssuerUrl, payload) {
  const res = await fetch(serialIssuerUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!res.ok) throw new Error(`SERIAL_ISSUER_URL error: HTTP ${res.status}`);
  const json = await res.json();
  if (json == null || typeof json !== "object") throw new Error("SERIAL_ISSUER_URL returned non-object JSON");
  return json;
}
