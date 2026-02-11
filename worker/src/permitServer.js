import http from "node:http";
import { URL } from "node:url";

import { encodeAbiParameters, getAddress, http as httpTransport, keccak256, parseAbiParameters, toBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createPublicClient, createWalletClient } from "viem";

import { myShopItemsAbi } from "./abi.js";

export async function startPermitServer({
  rpcUrl,
  chain,
  itemsAddress,
  serialSignerPrivateKey,
  riskSignerPrivateKey,
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

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

      if (url.pathname === "/health") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      if (url.pathname === "/serial-permit") {
        if (!walletClients.serial) throw new Error("SERIAL_SIGNER_PRIVATE_KEY not set");
        const buyer = getAddress(_get(url, "buyer"));
        const itemId = BigInt(_get(url, "itemId"));
        const deadline = BigInt(_get(url, "deadline"));
        const nonce = await _resolveNonce(publicClient, itemsAddress, buyer, url.searchParams.get("nonce"));

        const serialHash = _resolveSerialHash(url);

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

        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            buyer,
            itemId: itemId.toString(),
            serialHash,
            deadline: deadline.toString(),
            nonce: nonce.toString(),
            signature,
            extraData
          })
        );
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

        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            shopOwner,
            maxItems: maxItems.toString(),
            deadline: deadline.toString(),
            nonce: nonce.toString(),
            signature
          })
        );
        return;
      }

      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "not_found" }));
    } catch (e) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
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

function _resolveSerialHash(url) {
  const serialHashParam = url.searchParams.get("serialHash");
  if (serialHashParam) return serialHashParam;
  const serial = _get(url, "serial");
  return keccak256(toBytes(serial));
}

