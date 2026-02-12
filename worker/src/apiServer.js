import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { URL } from "node:url";

import { decodeEventLog, getAddress, http as httpTransport, parseAbiItem } from "viem";
import { createPublicClient } from "viem";

import { myShopItemsAbi, myShopsAbi } from "./abi.js";

const purchasedEvent = parseAbiItem(
  "event Purchased(uint256 indexed itemId,uint256 indexed shopId,address indexed buyer,address recipient,uint256 quantity,address payToken,uint256 payAmount,uint256 platformFeeAmount,bytes32 serialHash,uint256 firstTokenId)"
);

export async function startApiServer({ rpcUrl, chain, itemsAddress, port }) {
  const client = createPublicClient({
    chain,
    transport: httpTransport(rpcUrl)
  });

  const items = getAddress(itemsAddress);
  const cache = {
    shopsAddress: null,
    itemById: new Map(),
    shopById: new Map(),
    itemCount: null,
    itemCountAtMs: 0,
    shopCount: null,
    shopCountAtMs: 0
  };

  const indexer = {
    enabled: process.env.ENABLE_INDEXER == null ? true : process.env.ENABLE_INDEXER === "1",
    pollIntervalMs: Number(process.env.INDEXER_POLL_INTERVAL_MS ?? "1000"),
    lookbackBlocks: BigInt(process.env.INDEXER_LOOKBACK_BLOCKS ?? "5000"),
    maxRecords: Number(process.env.INDEXER_MAX_RECORDS ?? "5000"),
    lastIndexedBlock: null,
    purchases: [],
    purchaseKeys: new Set(),
    running: false,
    stop: false,
    persist: {
      enabled: process.env.INDEXER_PERSIST === "1" || process.env.INDEXER_PERSIST_PATH != null,
      path: process.env.INDEXER_PERSIST_PATH ?? null,
      lastSavedAtMs: null,
      saveInFlight: false,
      saveScheduled: false,
      saveTimer: null,
      errors: 0
    }
  };

  if (indexer.persist.enabled) {
    indexer.persist.path =
      indexer.persist.path ??
      path.join(process.cwd(), "data", `indexer.${chain.id}.${items.toLowerCase()}.json`);
    await _loadIndexerState({ indexer, chainId: chain.id, itemsAddress: items });
  }

  if (indexer.enabled) {
    indexer.running = true;
    _startIndexer({ client, chainId: chain.id, itemsAddress: items, cache, indexer }).catch(() => {
      indexer.running = false;
    });
  }

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
        return _json(res, 200, { ok: true });
      }

      if (url.pathname === "/config") {
        const shopsAddress = await _resolveShopsAddress(client, items, cache);
        return _json(res, 200, {
          ok: true,
          chainId: chain.id,
          rpcUrl,
          itemsAddress: items,
          shopsAddress,
          indexer: {
            enabled: indexer.enabled,
            running: indexer.running,
            lastIndexedBlock: indexer.lastIndexedBlock?.toString() ?? null,
            cachedPurchases: indexer.purchases.length
          }
        });
      }

      if (url.pathname === "/indexer") {
        return _json(res, 200, {
          ok: true,
          enabled: indexer.enabled,
          running: indexer.running,
          pollIntervalMs: indexer.pollIntervalMs,
          lookbackBlocks: indexer.lookbackBlocks.toString(),
          maxRecords: indexer.maxRecords,
          lastIndexedBlock: indexer.lastIndexedBlock?.toString() ?? null,
          cachedPurchases: indexer.purchases.length,
          persist: {
            enabled: indexer.persist.enabled,
            path: indexer.persist.path,
            lastSavedAtMs: indexer.persist.lastSavedAtMs,
            errors: indexer.persist.errors
          }
        });
      }

      if (url.pathname === "/shop") {
        const shopId = BigInt(_get(url, "shopId"));
        const shop = await _getShop(client, items, shopId, cache);
        return _json(res, 200, { ok: true, shopId: shopId.toString(), shop });
      }

      if (url.pathname === "/shops") {
        const cursorParam = url.searchParams.get("cursor");
        const limitParam = url.searchParams.get("limit");
        const cursor = cursorParam ? BigInt(cursorParam) : 1n;
        const limit = limitParam ? Math.min(200, Math.max(1, Number(limitParam))) : 20;

        const shopsAddress = await _resolveShopsAddress(client, items, cache);
        const count = await _getShopCount(client, shopsAddress, cache);

        const shops = [];
        for (let id = cursor; id <= count && shops.length < limit; id++) {
          const shop = await _getShop(client, items, id, cache);
          shops.push({ shopId: id.toString(), shop });
        }

        const nextCursor = cursor + BigInt(shops.length);
        return _json(res, 200, {
          ok: true,
          cursor: cursor.toString(),
          nextCursor: nextCursor <= count ? nextCursor.toString() : null,
          shopCount: count.toString(),
          shops
        });
      }

      if (url.pathname === "/item") {
        const itemId = BigInt(_get(url, "itemId"));
        const item = await _getItem(client, items, itemId, cache);
        return _json(res, 200, { ok: true, itemId: itemId.toString(), item });
      }

      if (url.pathname === "/items") {
        const cursorParam = url.searchParams.get("cursor");
        const limitParam = url.searchParams.get("limit");
        const cursor = cursorParam ? BigInt(cursorParam) : 1n;
        const limit = limitParam ? Math.min(200, Math.max(1, Number(limitParam))) : 20;

        const count = await _getItemCount(client, items, cache);

        const itemsList = [];
        for (let id = cursor; id <= count && itemsList.length < limit; id++) {
          const item = await _getItem(client, items, id, cache);
          itemsList.push({ itemId: id.toString(), item });
        }

        const nextCursor = cursor + BigInt(itemsList.length);
        return _json(res, 200, {
          ok: true,
          cursor: cursor.toString(),
          nextCursor: nextCursor <= count ? nextCursor.toString() : null,
          itemCount: count.toString(),
          items: itemsList
        });
      }

      if (url.pathname === "/purchases") {
        const args = {};
        const buyer = url.searchParams.get("buyer");
        const shopId = url.searchParams.get("shopId");
        const itemId = url.searchParams.get("itemId");

        if (buyer) args.buyer = getAddress(buyer);
        if (shopId) args.shopId = BigInt(shopId);
        if (itemId) args.itemId = BigInt(itemId);

        const latest = await client.getBlockNumber();
        const fromBlock = url.searchParams.get("fromBlock")
          ? BigInt(url.searchParams.get("fromBlock"))
          : latest > 5000n
            ? latest - 5000n
            : 0n;
        const toBlock = url.searchParams.get("toBlock") ? BigInt(url.searchParams.get("toBlock")) : latest;

        const limitParam = url.searchParams.get("limit");
        const limit = limitParam ? Math.min(2000, Math.max(1, Number(limitParam))) : 200;

        const include = url.searchParams.get("include") ?? "enrich";
        const includeEnrich = include.includes("enrich");

        const source = (url.searchParams.get("source") ?? "index").toLowerCase();
        const useIndex = indexer.enabled && source !== "chain";

        const purchases = useIndex
          ? await _getPurchasesFromIndex({
              client,
              chainId: chain.id,
              itemsAddress: items,
              fromBlock,
              toBlock,
              buyer: args.buyer,
              shopId: args.shopId,
              itemId: args.itemId,
              limit,
              includeEnrich,
              cache,
              indexer
            })
          : await _getPurchasesFromChain({
              client,
              chainId: chain.id,
              itemsAddress: items,
              fromBlock,
              toBlock,
              args: Object.keys(args).length ? args : undefined,
              limit,
              includeEnrich,
              cache
            });

        return _json(res, 200, {
          ok: true,
          source: useIndex ? "index" : "chain",
          fromBlock: fromBlock.toString(),
          toBlock: toBlock.toString(),
          latest: latest.toString(),
          indexedToBlock: indexer.lastIndexedBlock?.toString() ?? null,
          count: purchases.length,
          purchases
        });
      }

      return _json(res, 404, { ok: false, error: "not_found" });
    } catch (e) {
      return _json(res, 400, { ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  });

  await new Promise((resolve) => server.listen(port, resolve));
  return {
    close: () =>
      new Promise((resolve, reject) => {
        indexer.stop = true;
        if (indexer.persist.enabled) {
          void _persistIndexerState({ indexer, chainId: chain.id, itemsAddress: items });
        }
        server.close((err) => (err ? reject(err) : resolve()));
      }),
    port
  };
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

function _get(url, key) {
  const value = url.searchParams.get(key);
  if (!value) throw new Error(`Missing query param: ${key}`);
  return value;
}

async function _resolveShopsAddress(client, itemsAddress, cache) {
  if (cache.shopsAddress) return cache.shopsAddress;
  cache.shopsAddress = getAddress(
    await client.readContract({
      address: itemsAddress,
      abi: myShopItemsAbi,
      functionName: "shops",
      args: []
    })
  );
  return cache.shopsAddress;
}

async function _getItem(client, itemsAddress, itemId, cache) {
  const key = itemId.toString();
  const cached = cache.itemById.get(key);
  if (cached) return cached;

  const rawItem = await client.readContract({
    address: itemsAddress,
    abi: myShopItemsAbi,
    functionName: "items",
    args: [itemId]
  });

  const item = {
    shopId: pick(rawItem, "shopId", 0).toString(),
    payToken: pick(rawItem, "payToken", 1),
    unitPrice: pick(rawItem, "unitPrice", 2).toString(),
    nftContract: pick(rawItem, "nftContract", 3),
    soulbound: pick(rawItem, "soulbound", 4),
    tokenURI: pick(rawItem, "tokenURI", 5),
    action: pick(rawItem, "action", 6),
    actionData: pick(rawItem, "actionData", 7),
    requiresSerial: pick(rawItem, "requiresSerial", 8),
    active: pick(rawItem, "active", 9)
  };

  cache.itemById.set(key, item);
  return item;
}

async function _getShop(client, itemsAddress, shopId, cache) {
  const key = shopId.toString();
  const cached = cache.shopById.get(key);
  if (cached) return cached;

  const shopsAddress = await _resolveShopsAddress(client, itemsAddress, cache);
  const rawShop = await client.readContract({
    address: shopsAddress,
    abi: myShopsAbi,
    functionName: "shops",
    args: [shopId]
  });

  const shop = {
    owner: pick(rawShop, "owner", 0),
    treasury: pick(rawShop, "treasury", 1),
    metadataHash: pick(rawShop, "metadataHash", 2),
    paused: pick(rawShop, "paused", 3)
  };

  cache.shopById.set(key, shop);
  return shop;
}

function pick(obj, key, index) {
  const value = obj?.[key] ?? obj?.[index];
  if (value === undefined) throw new Error(`Unable to read ${key}`);
  return value;
}

async function _getItemCount(client, itemsAddress, cache) {
  const now = Date.now();
  if (cache.itemCount != null && now - cache.itemCountAtMs < 1500) return cache.itemCount;
  const count = await client.readContract({
    address: itemsAddress,
    abi: myShopItemsAbi,
    functionName: "itemCount",
    args: []
  });
  cache.itemCount = BigInt(count);
  cache.itemCountAtMs = now;
  return cache.itemCount;
}

async function _getShopCount(client, shopsAddress, cache) {
  const now = Date.now();
  if (cache.shopCount != null && now - cache.shopCountAtMs < 1500) return cache.shopCount;
  const count = await client.readContract({
    address: shopsAddress,
    abi: myShopsAbi,
    functionName: "shopCount",
    args: []
  });
  cache.shopCount = BigInt(count);
  cache.shopCountAtMs = now;
  return cache.shopCount;
}

async function _getPurchasesFromChain({ client, chainId, itemsAddress, fromBlock, toBlock, args, limit, includeEnrich, cache }) {
  const logs = await client.getLogs({
    address: itemsAddress,
    event: purchasedEvent,
    args,
    fromBlock,
    toBlock
  });

  const sliced = logs.slice(0, Math.max(0, limit));
  const purchases = [];

  for (const log of sliced) {
    const base = _decodePurchasedLog({ chainId, log });
    if (!includeEnrich) {
      purchases.push(base);
      continue;
    }
    const item = await _getItem(client, itemsAddress, BigInt(base.itemId), cache);
    const shop = await _getShop(client, itemsAddress, BigInt(base.shopId), cache);
    purchases.push({ ...base, item, shop });
  }

  return purchases;
}

async function _getPurchasesFromIndex({
  client,
  chainId,
  itemsAddress,
  fromBlock,
  toBlock,
  buyer,
  shopId,
  itemId,
  limit,
  includeEnrich,
  cache,
  indexer
}) {
  if (fromBlock > BigInt(Number.MAX_SAFE_INTEGER) || toBlock > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("block range too large for in-memory indexer; use source=chain");
  }
  const from = Number(fromBlock);
  const to = Number(toBlock);

  const list = [];
  const buyerNorm = buyer ? buyer.toLowerCase() : null;
  const shopIdStr = shopId != null ? shopId.toString() : null;
  const itemIdStr = itemId != null ? itemId.toString() : null;

  for (let i = indexer.purchases.length - 1; i >= 0 && list.length < limit; i--) {
    const p = indexer.purchases[i];
    if (p.blockNumber < from || p.blockNumber > to) continue;
    if (buyerNorm && p.buyer.toLowerCase() !== buyerNorm) continue;
    if (shopIdStr && p.shopId !== shopIdStr) continue;
    if (itemIdStr && p.itemId !== itemIdStr) continue;
    list.push(p);
  }

  if (!includeEnrich) return list;

  const enriched = [];
  for (const p of list) {
    const item = await _getItem(client, itemsAddress, BigInt(p.itemId), cache);
    const shop = await _getShop(client, itemsAddress, BigInt(p.shopId), cache);
    enriched.push({ ...p, item, shop });
  }

  return enriched;
}

async function _loadIndexerState({ indexer, chainId, itemsAddress }) {
  const filePath = indexer.persist.path;
  if (!filePath) return;

  let raw;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("ENOENT")) return;
    indexer.persist.errors += 1;
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    indexer.persist.errors += 1;
    return;
  }

  if (parsed?.version !== 1) return;
  if (Number(parsed?.chainId) !== Number(chainId)) return;
  if (typeof parsed?.itemsAddress !== "string") return;
  if (getAddress(parsed.itemsAddress) !== getAddress(itemsAddress)) return;

  const lastIndexedBlock = parsed?.lastIndexedBlock != null ? BigInt(parsed.lastIndexedBlock) : null;
  const purchases = Array.isArray(parsed?.purchases) ? parsed.purchases : null;
  if (!purchases) return;

  indexer.purchases = purchases.slice(-indexer.maxRecords);
  indexer.purchaseKeys = new Set(indexer.purchases.map((p) => `${p.txHash}:${p.logIndex}`));
  if (lastIndexedBlock != null) {
    indexer.lastIndexedBlock = lastIndexedBlock;
  }
}

function _schedulePersistIndexerState({ indexer, chainId, itemsAddress }) {
  if (!indexer.persist.enabled) return;
  if (indexer.persist.saveInFlight) return;
  if (indexer.persist.saveScheduled) return;

  indexer.persist.saveScheduled = true;
  indexer.persist.saveTimer = setTimeout(() => {
    indexer.persist.saveScheduled = false;
    void _persistIndexerState({ indexer, chainId, itemsAddress });
  }, 200);
}

async function _persistIndexerState({ indexer, chainId, itemsAddress }) {
  if (!indexer.persist.enabled) return;
  if (indexer.persist.saveInFlight) return;

  const filePath = indexer.persist.path;
  if (!filePath) return;

  indexer.persist.saveInFlight = true;
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });

    const tmpPath = `${filePath}.tmp`;
    const payload = {
      version: 1,
      chainId: Number(chainId),
      itemsAddress,
      lastIndexedBlock: indexer.lastIndexedBlock?.toString() ?? null,
      purchases: indexer.purchases
    };
    await fs.writeFile(tmpPath, JSON.stringify(payload), "utf8");
    await fs.rename(tmpPath, filePath);
    indexer.persist.lastSavedAtMs = Date.now();
  } catch {
    indexer.persist.errors += 1;
  } finally {
    indexer.persist.saveInFlight = false;
  }
}

function _decodePurchasedLog({ chainId, log }) {
  const decoded = decodeEventLog({
    abi: myShopItemsAbi,
    data: log.data,
    topics: log.topics
  });

  return {
    chainId,
    txHash: log.transactionHash,
    logIndex: Number(log.logIndex),
    blockNumber: Number(log.blockNumber),
    itemId: decoded.args.itemId?.toString(),
    shopId: decoded.args.shopId?.toString(),
    buyer: decoded.args.buyer,
    recipient: decoded.args.recipient,
    quantity: decoded.args.quantity?.toString(),
    payToken: decoded.args.payToken,
    payAmount: decoded.args.payAmount?.toString(),
    platformFeeAmount: decoded.args.platformFeeAmount?.toString(),
    serialHash: decoded.args.serialHash,
    firstTokenId: decoded.args.firstTokenId?.toString()
  };
}

async function _startIndexer({ client, chainId, itemsAddress, cache, indexer }) {
  if (indexer.lastIndexedBlock == null) {
    const latest = await client.getBlockNumber();
    const startFrom = latest > indexer.lookbackBlocks ? latest - indexer.lookbackBlocks : 0n;
    indexer.lastIndexedBlock = startFrom > 0n ? startFrom - 1n : 0n;
  }

  while (!indexer.stop) {
    const tip = await client.getBlockNumber();
    const fromBlock = indexer.lastIndexedBlock + 1n;
    const toBlock = tip;

    if (fromBlock <= toBlock) {
      const logs = await client.getLogs({
        address: itemsAddress,
        event: purchasedEvent,
        fromBlock,
        toBlock
      });

      for (const log of logs) {
        const key = `${log.transactionHash}:${log.logIndex}`;
        if (indexer.purchaseKeys.has(key)) continue;
        indexer.purchaseKeys.add(key);

        const p = _decodePurchasedLog({ chainId, log });
        indexer.purchases.push(p);

        if (indexer.purchases.length > indexer.maxRecords) {
          const removed = indexer.purchases.splice(0, indexer.purchases.length - indexer.maxRecords);
          for (const r of removed) indexer.purchaseKeys.delete(`${r.txHash}:${r.logIndex}`);
        }
      }

      indexer.lastIndexedBlock = toBlock;
      _schedulePersistIndexerState({ indexer, chainId, itemsAddress });
    }

    await new Promise((r) => setTimeout(r, indexer.pollIntervalMs));
  }

  indexer.running = false;
}
