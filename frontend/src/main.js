import { createPublicClient, createWalletClient, custom, decodeEventLog, getAddress, http, isAddress, parseAbiItem, parseEther } from "viem";

import { loadConfig } from "./config.js";
import {
  createMyShopReadClient,
  decodeShopRolesMask,
  erc20Abi,
  myShopItemsAbi,
  myShopsAbi,
  SHOP_ROLE_ITEM_ACTION_EDITOR,
  SHOP_ROLE_ITEM_EDITOR,
  SHOP_ROLE_ITEM_MAINTAINER,
  SHOP_ROLE_SHOP_ADMIN
} from "./contracts.js";

const envCfg = loadConfig();
const storageKey = "myshop_frontend_config_v1";

function loadStoredConfig() {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed;
  } catch {
    return {};
  }
}

function saveStoredConfig(nextCfg) {
  localStorage.setItem(storageKey, JSON.stringify(nextCfg));
}

function buildChain(nextCfg) {
  const rpcUrl = nextCfg.rpcUrl || "http://127.0.0.1:8545";
  return {
    id: nextCfg.chainId || 31337,
    name: "custom",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } }
  };
}

function getRuntimeConfig() {
  const stored = loadStoredConfig();
  return {
    rpcUrl: stored.rpcUrl || envCfg.rpcUrl || "",
    chainId: stored.chainId || envCfg.chainId || 31337,
    shopsAddress: stored.shopsAddress || envCfg.shopsAddress || "",
    itemsAddress: stored.itemsAddress || envCfg.itemsAddress || "",
    workerUrl: stored.workerUrl || envCfg.workerUrl || "",
    workerApiUrl: stored.workerApiUrl || envCfg.workerApiUrl || ""
  };
}

let runtimeCfg = getRuntimeConfig();
let chain = buildChain(runtimeCfg);
let publicClient = createPublicClient({
  chain,
  transport: http(runtimeCfg.rpcUrl || "http://127.0.0.1:8545")
});

let walletClient = null;
let connectedAddress = null;
let connectedChainId = null;
let walletEventsBound = false;
let activeTxLabel = null;
let lastTx = { label: null, hash: null, status: null, blockNumber: null };

function setDisabledById(id, disabled) {
  const node = document.getElementById(id);
  if (!node) return;
  node.disabled = !!disabled;
}

function setDisabledMany(ids, disabled) {
  for (const id of ids || []) setDisabledById(id, disabled);
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === true) node.setAttribute(k, "");
    else node.setAttribute(k, v);
  }
  for (const child of children || []) {
    if (child === null || child === undefined || child === false) continue;
    if (child instanceof Node) node.appendChild(child);
    else node.appendChild(document.createTextNode(String(child)));
  }
  return node;
}

function inputRow(label, id, placeholder = "") {
  const input = el("input", { id, placeholder });
  return el("div", {}, [el("label", { for: id, text: label }), input]);
}

function val(id) {
  const node = document.getElementById(id);
  if (!node) return "";
  return node.value.trim();
}

function setText(id, text) {
  document.getElementById(id).textContent = text;
}

function updateTxPanel() {
  const panel = document.getElementById("txPanel");
  if (!panel) return;
  panel.innerHTML = "";
  if (!activeTxLabel && !lastTx?.label) return;

  const rows = [];
  if (activeTxLabel) rows.push(el("div", { text: `activeTx=${activeTxLabel}` }));
  if (lastTx?.label) rows.push(el("div", { text: `lastTxLabel=${lastTx.label}` }));
  if (lastTx?.hash) rows.push(el("div", {}, [el("span", { text: "lastTx=" }), txLinkNode(lastTx.hash)]));
  if (lastTx?.status)
    rows.push(el("div", { text: `lastTxStatus=${lastTx.status}${lastTx.blockNumber ? ` block=${lastTx.blockNumber}` : ""}` }));
  panel.appendChild(el("div", {}, [el("h3", { text: "Tx" }), ...rows]));
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

function isZeroAddress(addr) {
  if (!addr) return false;
  try {
    return getAddress(addr) === ZERO_ADDRESS;
  } catch {
    return String(addr).toLowerCase() === ZERO_ADDRESS;
  }
}

function shortHex(value, { head = 6, tail = 4 } = {}) {
  const s = String(value || "");
  if (!s.startsWith("0x")) return s;
  if (s.length <= 2 + head + tail) return s;
  return `${s.slice(0, 2 + head)}…${s.slice(-tail)}`;
}

function formatPayToken(payToken) {
  if (!payToken || isZeroAddress(payToken)) return "ETH";
  return shortHex(payToken);
}

function shortText(s, maxLen = 48) {
  const str = String(s || "");
  if (str.length <= maxLen) return str;
  const head = Math.max(0, Math.floor((maxLen - 3) / 2));
  const tail = Math.max(0, maxLen - 3 - head);
  return `${str.slice(0, head)}...${str.slice(str.length - tail)}`;
}

function formatItemSummary(item, { includeShopId } = {}) {
  const actionLabel = item.action && !isZeroAddress(item.action) ? shortHex(item.action) : "none";
  const nftLabel = item.nftContract && !isZeroAddress(item.nftContract) ? shortHex(item.nftContract) : "none";
  const tokenUriLabel = item.tokenURI ? shortText(item.tokenURI, 36) : "";
  const shopPart = includeShopId ? ` shopId=${item.shopId}` : "";
  const tokenUriPart = tokenUriLabel ? ` tokenURI=${tokenUriLabel}` : "";
  return ` src=${item.__source || ""}${shopPart} active=${item.active} payToken=${formatPayToken(item.payToken)} unitPrice=${item.unitPrice} requiresSerial=${item.requiresSerial} soulbound=${item.soulbound} action=${actionLabel} nft=${nftLabel}${tokenUriPart}`;
}

function sourceCountsLabel(list, getSource) {
  const counts = new Map();
  for (const it of list || []) {
    const s = String(getSource(it) || "unknown");
    counts.set(s, (counts.get(s) || 0) + 1);
  }
  const keys = Array.from(counts.keys()).sort();
  return keys.map((k) => `${k}=${counts.get(k)}`).join(" ");
}

function explorerBaseUrl(chainId) {
  const id = Number(chainId);
  if (id === 1) return "https://etherscan.io";
  if (id === 11155111) return "https://sepolia.etherscan.io";
  if (id === 137) return "https://polygonscan.com";
  if (id === 80001) return "https://mumbai.polygonscan.com";
  if (id === 10) return "https://optimistic.etherscan.io";
  if (id === 42161) return "https://arbiscan.io";
  if (id === 8453) return "https://basescan.org";
  return null;
}

function txLinkNode(txHash) {
  const base = explorerBaseUrl(chain?.id);
  if (!base || !txHash) return el("span", { text: String(txHash || "") });
  return el("a", { href: `${base}/tx/${txHash}`, target: "_blank", rel: "noreferrer", text: shortHex(txHash) });
}

function addressNode(addr) {
  if (!addr) return el("span", { text: "" });
  const base = explorerBaseUrl(chain?.id);
  if (!base || !String(addr).startsWith("0x")) return el("span", { text: String(addr) });
  return el("a", { href: `${base}/address/${addr}`, target: "_blank", rel: "noreferrer", text: shortHex(addr) });
}

function kv(label, valueNodeOrText) {
  const valueNode =
    valueNodeOrText && typeof valueNodeOrText === "object" && valueNodeOrText.nodeType
      ? valueNodeOrText
      : el("span", { text: String(valueNodeOrText ?? "") });
  return el("div", {}, [el("span", { text: `${label}: ` }), valueNode]);
}

class ApiError extends Error {
  constructor(message, { status, errorCode, errorDetails, url, retryAfterMs } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status ?? null;
    this.errorCode = errorCode ?? null;
    this.errorDetails = errorDetails ?? null;
    this.url = url ?? null;
    this.retryAfterMs = retryAfterMs ?? null;
  }
}

function getErrorText(e) {
  const parts = [];
  const push = (v) => {
    const s = String(v || "").trim();
    if (!s) return;
    if (parts.includes(s)) return;
    parts.push(s);
  };

  if (e && typeof e === "object") {
    if ("shortMessage" in e) push(e.shortMessage);
    if ("details" in e) push(e.details);
  }
  if (e instanceof Error) push(e.message);
  if (e && typeof e === "object" && "cause" in e) {
    const c = e.cause;
    if (c instanceof Error) push(c.message);
    if (c && typeof c === "object") {
      if ("shortMessage" in c) push(c.shortMessage);
      if ("details" in c) push(c.details);
    }
  }
  if (parts.length === 0) push(e);
  return parts.join(" | ");
}

function formatError(e) {
  const msg = getErrorText(e);

  if (e instanceof ApiError) {
    const code = e.errorCode || "api_error";
    if (code === "deadline_expired") return `[${code}] permit deadline must be in the future\nFix: set deadline(ts) to a future time, then refetch permit`;
    if (code === "missing_param") return `[${code}] missing param: ${e.errorDetails?.param || "unknown"}\nFix: fill the missing field and retry`;
    if (code === "invalid_param") return `[${code}] invalid param: ${e.errorDetails?.param || "unknown"}\nFix: correct the value format and retry`;
    if (code === "rate_limited")
      return `[${code}] too many requests\nFix: wait ${Math.max(1, Math.ceil(Number(e.retryAfterMs || 0) / 1000))}s and retry; reduce polling; consider switching data source to chain`;
    if (code === "signer_not_configured") return `[${code}] permit signer not configured on server\nFix: configure WORKER_URL signer env and redeploy worker`;
    if (code === "serial_issuer_error") return `[${code}] serial issuer error\nFix: retry; if persists, check worker logs and signer health`;
    if (code === "method_not_allowed") return `[${code}] method not allowed`;
    if (code === "invalid_response") return `[${code}] invalid JSON response from server\nFix: check WORKER_API_URL points to query server`;
    if (code === "http_error" && e.status === 404) return `[${code}] endpoint not found\nFix: check WORKER_URL/WORKER_API_URL and path`;
    if (code === "http_error" && e.status === 429)
      return `[${code}] too many requests\nFix: wait ${Math.max(1, Math.ceil(Number(e.retryAfterMs || 0) / 1000))}s and retry`;
    const meta = [];
    if (e.status) meta.push(`status=${e.status}`);
    if (e.url) meta.push(`url=${e.url}`);
    const suffix = meta.length ? ` (${meta.join(" ")})` : "";
    return `[${code}]${suffix} ${msg}`;
  }

  if (e && typeof e === "object" && "code" in e) {
    const rawCode = e.code;
    const code = typeof rawCode === "string" ? Number(rawCode) : rawCode;
    if (code === 4001) return "[UserRejected] request rejected in wallet\nFix: confirm in wallet, or retry";
    if (code === 4100) return "[WalletUnauthorized] wallet not authorized\nFix: connect wallet and approve the request";
    if (code === 4200) return "[WalletUnsupported] wallet does not support this request\nFix: switch wallet/network, or update wallet";
    if (code === 4900) return "[WalletDisconnected] wallet disconnected\nFix: open wallet and reconnect";
    if (code === 4901) return "[ChainDisconnected] wallet chain disconnected\nFix: switch network in wallet, then retry";
    if (code === -32002) return "[WalletPending] wallet request already pending\nFix: open wallet popup and complete/reject the pending request";
  }

  if (msg.includes("Missing window.ethereum")) return "[WalletMissing] missing wallet provider\nFix: install/enable a wallet (e.g. MetaMask) and reload";
  if (msg.startsWith("Invalid address:")) return `[BadConfig] ${msg}\nFix: open Config and paste a valid address`;
  if (msg.toLowerCase().includes("failed to fetch")) return "[NetworkError] network request failed\nFix: check RPC_URL / WORKER_URL / WORKER_API_URL, then retry";
  if (msg.toLowerCase().includes("err_connection_refused") || msg.toLowerCase().includes("econnrefused"))
    return "[NetworkError] connection refused\nFix: start RPC/worker servers and confirm URLs/ports, then retry";
  if (msg.toLowerCase().includes("networkerror") && msg.toLowerCase().includes("fetch"))
    return "[NetworkError] network request failed\nFix: check RPC_URL / WORKER_URL / WORKER_API_URL, then retry";
  if (msg.toLowerCase().includes("load failed"))
    return "[NetworkError] network request failed\nFix: check RPC_URL / WORKER_URL / WORKER_API_URL, then retry";
  if (msg.includes("NotOwner")) return "[NoPermission] protocol owner required\nFix: connect the protocol owner wallet";
  if (msg.includes("NotShopOwner")) return "[NoPermission] shop owner/operator required\nFix: connect shop owner wallet or grant role in Shop Console (S-04)";
  if (msg.includes("InvalidRole")) return "[NoPermission] missing role\nFix: grant shop role in Shop Console (S-04) and retry";
  if (msg.includes("SignatureExpired")) return "[SignatureExpired] permit signature expired\nFix: refetch permit (extraData) with a new future deadline";
  if (msg.includes("InvalidSignature")) return "[InvalidSignature] permit signature invalid\nFix: refetch permit; ensure buyer/itemId/serial/deadline match";
  if (msg.includes("NonceUsed")) return "[NonceUsed] nonce already used\nFix: refetch permit (extraData) to get a new nonce";
  if (msg.includes("SerialRequired")) return "[SerialRequired] this item requires SerialPermit\nFix: click Fetch Serial Permit to generate extraData, then buy";
  if (msg.includes("ActionNotAllowed")) return "[ActionNotAllowed] action not allowed\nFix: allow the action in Protocol Console (G-05), then retry";
  if (msg.includes("ShopPaused")) return "[ShopPaused] shop is paused\nFix: unpause the shop (S-05 / governance), then retry";
  if (msg.includes("ItemInactive")) return "[ItemInactive] item is inactive\nFix: activate the item (I-04), then retry";
  if (msg.includes("ItemNotFound")) return "[ItemNotFound] itemId not found\nFix: check itemId in plaza/item detail";
  if (msg.includes("ShopNotFound")) return "[ShopNotFound] shopId not found\nFix: check shopId in plaza/shop detail";
  if (msg.includes("MaxItemsReached")) return "[SoldOut] max items reached\nFix: increase maxItems via new item or update policy";
  if (msg.includes("InvalidAddress")) return "[InvalidAddress] invalid address\nFix: check address inputs and contract config";
  if (msg.toLowerCase().includes("invalid address")) return "[InvalidAddress] invalid address\nFix: check address inputs and contract config";
  if (msg.includes("InvalidPayment")) return "[InvalidPayment] invalid payment\nFix: check payToken, unitPrice, quantity, and ETH value/approval";
  if (msg.includes("TransferFailed")) return "[TransferFailed] token transfer failed\nFix: ensure ERC20 balance + allowance are sufficient, then retry";
  if (msg.toLowerCase().includes("insufficient allowance")) return "[InsufficientAllowance] ERC20 allowance too low\nFix: approve a larger amount, then buy again";
  if (msg.toLowerCase().includes("exceeds balance") || msg.toLowerCase().includes("insufficient balance"))
    return "[InsufficientBalance] insufficient token balance\nFix: top up token balance (or adjust quantity/price), then retry";
  if (msg.toLowerCase().includes("user rejected")) return "[UserRejected] transaction rejected in wallet\nFix: confirm in wallet, or retry";
  if (msg.toLowerCase().includes("insufficient funds")) return "[InsufficientFunds] insufficient ETH for gas\nFix: top up ETH for gas, then retry";

  return msg;
}

function showTxError(e) {
  const base = formatError(e);
  const parts = [base];
  if (!base.includes("Fix:")) {
    parts.push("\nFix: open 诊断（Diagnostics）检查 RPC/Worker，再检查 配置（Config）地址与 URL，然后重试。");
  }
  if (e && typeof e === "object" && "txHash" in e && e.txHash) {
    parts.push(`\nTx: ${String(e.txHash)}`);
  }
  const mismatch = getChainMismatch();
  if (mismatch) {
    parts.push(`\n[ChainMismatch] walletChainId=${mismatch.walletChainId} expectedChainId=${mismatch.expectedChainId}`);
    parts.push("Fix: switch your wallet network to expectedChainId, or update Config -> CHAIN_ID/RPC URL.");
  }
  setText("txOut", parts.join("\n"));
  updateTxPanel();
}

async function runWriteTx({ label, buttonIds = [], write }) {
  if (activeTxLabel) throw new Error(`transaction in progress: ${activeTxLabel}`);
  activeTxLabel = label;
  lastTx = { label, hash: null, status: "waiting_wallet", blockNumber: null };
  updateTxPanel();
  setDisabledMany(buttonIds, true);
  try {
    setText("txOut", `[${label}] waiting for wallet confirmation...`);
    const hash = await write();
    lastTx = { label, hash, status: "pending", blockNumber: null };
    updateTxPanel();
    setText("txOut", `[${label}] submitted: ${hash}\nstatus=pending`);
    const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 });
    const blockNumber = receipt.blockNumber != null ? String(receipt.blockNumber) : "";
    lastTx = { label, hash, status: receipt.status, blockNumber: blockNumber || null };
    updateTxPanel();
    setText("txOut", `[${label}] confirmed: ${hash}\nstatus=${receipt.status}${blockNumber ? ` block=${blockNumber}` : ""}`);
    if (receipt.status !== "success") {
      const err = new Error("[TxReverted] transaction reverted");
      err.txHash = hash;
      err.receipt = receipt;
      throw err;
    }
    return { hash, receipt };
  } finally {
    setDisabledMany(buttonIds, false);
    activeTxLabel = null;
    updateTxPanel();
  }
}

function getExpectedChainId() {
  const node = document.getElementById("chainId");
  const raw = node ? String(node.value || "").trim() : "";
  if (raw) return Number(raw);
  return runtimeCfg.chainId ? Number(runtimeCfg.chainId) : 0;
}

function getChainMismatch() {
  const expectedChainId = getExpectedChainId();
  if (!expectedChainId || connectedChainId == null) return null;
  if (Number(expectedChainId) === Number(connectedChainId)) return null;
  return { expectedChainId, walletChainId: connectedChainId };
}

function requireAddress(value, field) {
  if (!isAddress(value)) throw new Error(`Invalid address: ${field}`);
  return getAddress(value);
}

function requireHexBytes(value, field) {
  if (!value) return "0x";
  if (!/^0x[0-9a-fA-F]*$/.test(value)) throw new Error(`Invalid hex: ${field}`);
  return value;
}

function pick(obj, key, index) {
  const value = obj?.[key] ?? obj?.[index];
  if (value === undefined) throw new Error(`Unable to read ${key}`);
  return value;
}

function toHttpUri(uri) {
  if (!uri) return "";
  if (uri.startsWith("ipfs://")) return `https://ipfs.io/ipfs/${uri.slice("ipfs://".length)}`;
  return uri;
}

function normalizeBaseUrl(url) {
  const u = String(url || "").trim();
  if (!u) return "";
  return u.endsWith("/") ? u.slice(0, -1) : u;
}

function getPermitBaseUrl() {
  return normalizeBaseUrl(val("workerUrl") || runtimeCfg.workerUrl);
}

function getApiBaseUrl() {
  return normalizeBaseUrl(val("workerApiUrl") || runtimeCfg.workerApiUrl || getPermitBaseUrl());
}

async function fetchJson(url, { signal } = {}) {
  const res = await fetch(url, { signal });
  const retryAfterHeader = res.headers?.get ? res.headers.get("Retry-After") : null;
  const body = await res.text();
  let parsed = null;
  try {
    parsed = body ? JSON.parse(body) : null;
  } catch {
    parsed = null;
  }

  if (!res.ok) {
    const message = parsed?.error ? String(parsed.error) : `HTTP ${res.status}`;
    const retryAfterMs =
      typeof parsed?.retryAfterMs === "number" && Number.isFinite(parsed.retryAfterMs)
        ? parsed.retryAfterMs
        : retryAfterHeader
          ? Number(retryAfterHeader) * 1000
          : null;
    throw new ApiError(message, {
      status: res.status,
      errorCode: parsed?.errorCode ?? "http_error",
      errorDetails: parsed?.errorDetails ?? null,
      url,
      retryAfterMs
    });
  }

  if (!parsed || typeof parsed !== "object") {
    throw new ApiError("invalid JSON response", { status: res.status, errorCode: "invalid_response", url });
  }

  if (parsed?.ok === false || parsed?.error) {
    const message = parsed?.error ? String(parsed.error) : "request failed";
    throw new ApiError(message, {
      status: res.status,
      errorCode: parsed?.errorCode ?? "api_error",
      errorDetails: parsed?.errorDetails ?? null,
      url
    });
  }

  return parsed;
}

async function workerApiGet(path, params = {}) {
  const base = getApiBaseUrl();
  if (!base) throw new Error("workerApiUrl is required");
  const url = new URL(path, base);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    url.searchParams.set(k, String(v));
  }
  return fetchJson(url.toString());
}

async function workerPermitGet(path, params = {}) {
  const base = getPermitBaseUrl();
  if (!base) throw new Error("workerUrl is required");
  const url = new URL(path, base);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    url.searchParams.set(k, String(v));
  }
  return fetchJson(url.toString());
}

async function resolveShopsAddress() {
  const shopsAddressVal = val("shopsAddress") || runtimeCfg.shopsAddress;
  if (isAddress(shopsAddressVal)) return getAddress(shopsAddressVal);

  const itemsAddressVal = val("itemsAddress") || runtimeCfg.itemsAddress;
  if (!isAddress(itemsAddressVal)) throw new Error("shopsAddress is required (or provide valid itemsAddress)");
  const itemsAddress = getAddress(itemsAddressVal);
  const shopsAddress = await publicClient.readContract({
    address: itemsAddress,
    abi: myShopItemsAbi,
    functionName: "shops",
    args: []
  });
  return getAddress(shopsAddress);
}

async function fetchShop(shopId, { source } = {}) {
  const id = BigInt(shopId);
  if (source !== "chain") {
    try {
      const json = await workerApiGet("/shop", { shopId: id.toString() });
      if (json?.shop) return { ...json.shop, __source: "worker" };
      throw new Error("invalid worker response");
    } catch (e) {
      if (source === "worker") throw e;
    }
  }

  const shopsAddress = await resolveShopsAddress();
  const raw = await publicClient.readContract({
    address: shopsAddress,
    abi: myShopsAbi,
    functionName: "shops",
    args: [id]
  });
  return {
    owner: pick(raw, "owner", 0),
    treasury: pick(raw, "treasury", 1),
    metadataHash: pick(raw, "metadataHash", 2),
    paused: pick(raw, "paused", 3),
    __source: "chain"
  };
}

async function fetchItem(itemId, { source } = {}) {
  const id = BigInt(itemId);
  if (source !== "chain") {
    try {
      const json = await workerApiGet("/item", { itemId: id.toString() });
      if (json?.item) return { ...json.item, __source: "worker" };
      throw new Error("invalid worker response");
    } catch (e) {
      if (source === "worker") throw e;
    }
  }

  const itemsAddressVal = val("itemsAddress") || runtimeCfg.itemsAddress;
  const itemsAddress = requireAddress(itemsAddressVal, "itemsAddress");
  const raw = await publicClient.readContract({
    address: itemsAddress,
    abi: myShopItemsAbi,
    functionName: "items",
    args: [id]
  });
  return {
    shopId: pick(raw, "shopId", 0).toString(),
    payToken: pick(raw, "payToken", 1),
    unitPrice: pick(raw, "unitPrice", 2).toString(),
    nftContract: pick(raw, "nftContract", 3),
    soulbound: pick(raw, "soulbound", 4),
    tokenURI: pick(raw, "tokenURI", 5),
    action: pick(raw, "action", 6),
    actionData: pick(raw, "actionData", 7),
    requiresSerial: pick(raw, "requiresSerial", 8),
    active: pick(raw, "active", 9),
    __source: "chain"
  };
}

async function fetchShopList({ cursor = 1n, limit = 20, source } = {}) {
  if (source !== "chain") {
    try {
      const json = await workerApiGet("/shops", { cursor: cursor.toString(), limit: String(limit) });
      if (Array.isArray(json?.shops)) {
        const shops = json.shops.map((s) => {
          if (!s || typeof s !== "object") return s;
          if (s.shop && typeof s.shop === "object") return { ...s, shop: { ...s.shop, __source: "worker" } };
          if (s.owner || s.treasury) return { ...s, __source: "worker" };
          return s;
        });
        return { shops, nextCursor: json.nextCursor };
      }
      throw new Error("invalid worker response");
    } catch (e) {
      if (source === "worker") throw e;
    }
  }

  const shopsAddress = await resolveShopsAddress();
  const count = await publicClient.readContract({
    address: shopsAddress,
    abi: myShopsAbi,
    functionName: "shopCount",
    args: []
  });
  const max = BigInt(count);
  const list = [];
  for (let id = cursor; id <= max && list.length < limit; id++) {
    const shop = await fetchShop(id, { source: "chain" });
    list.push({ shopId: id.toString(), shop });
  }
  const next = cursor + BigInt(list.length);
  return { shops: list, nextCursor: next <= max ? next.toString() : null };
}

async function fetchItemList({ cursor = 1n, limit = 20, source } = {}) {
  if (source !== "chain") {
    try {
      const json = await workerApiGet("/items", { cursor: cursor.toString(), limit: String(limit) });
      if (Array.isArray(json?.items)) {
        const items = json.items.map((it) => {
          if (!it || typeof it !== "object") return it;
          if (it.item && typeof it.item === "object") return { ...it, item: { ...it.item, __source: "worker" } };
          if (it.shopId || it.payToken) return { ...it, __source: "worker" };
          return it;
        });
        return { items, nextCursor: json.nextCursor };
      }
      throw new Error("invalid worker response");
    } catch (e) {
      if (source === "worker") throw e;
    }
  }

  const itemsAddressVal = val("itemsAddress") || runtimeCfg.itemsAddress;
  const itemsAddress = requireAddress(itemsAddressVal, "itemsAddress");
  const count = await publicClient.readContract({
    address: itemsAddress,
    abi: myShopItemsAbi,
    functionName: "itemCount",
    args: []
  });
  const max = BigInt(count);
  const list = [];
  for (let id = cursor; id <= max && list.length < limit; id++) {
    const item = await fetchItem(id, { source: "chain" });
    list.push({ itemId: id.toString(), item });
  }
  const next = cursor + BigInt(list.length);
  return { items: list, nextCursor: next <= max ? next.toString() : null };
}

const purchasedEvent = parseAbiItem(
  "event Purchased(uint256 indexed itemId,uint256 indexed shopId,address indexed buyer,address recipient,uint256 quantity,address payToken,uint256 payAmount,uint256 platformFeeAmount,bytes32 serialHash,uint256 firstTokenId)"
);

async function fetchPurchases({ buyer, shopId, itemId, limit, source, fromBlock, toBlock } = {}) {
  if (source === "auto") source = undefined;

  const params = {
    buyer,
    shopId,
    itemId,
    limit: limit != null ? String(limit) : undefined,
    source,
    fromBlock,
    toBlock,
    include: "enrich"
  };
  if (source !== "chain") {
    try {
      const json = await workerApiGet("/purchases", params);
      if (Array.isArray(json?.purchases)) return json;
      throw new Error("invalid worker response");
    } catch (e) {
      if (source === "index") throw e;
    }
  }

  const itemsAddressVal = val("itemsAddress") || runtimeCfg.itemsAddress;
  const itemsAddress = requireAddress(itemsAddressVal, "itemsAddress");
  const latest = await publicClient.getBlockNumber();
  const to = toBlock ? BigInt(toBlock) : latest;
  const from = fromBlock ? BigInt(fromBlock) : latest > 5000n ? latest - 5000n : 0n;

  const args = {};
  if (buyer) args.buyer = requireAddress(buyer, "buyer");
  if (shopId) args.shopId = BigInt(shopId);
  if (itemId) args.itemId = BigInt(itemId);

  const logs = await publicClient.getLogs({
    address: itemsAddress,
    event: purchasedEvent,
    args: Object.keys(args).length ? args : undefined,
    fromBlock: from,
    toBlock: to
  });

  const max = Math.min(logs.length, limit != null ? Math.max(1, Number(limit)) : 200);
  const sliced = logs.slice(0, max);
  const purchases = [];

  for (const log of sliced) {
    const decoded = decodeEventLog({
      abi: myShopItemsAbi,
      data: log.data,
      topics: log.topics
    });
    const base = {
      chainId: chain.id,
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

    const item = await fetchItem(base.itemId);
    const shop = await fetchShop(base.shopId);
    purchases.push({ ...base, item, shop });
  }

  return {
    ok: true,
    source: "chain",
    fromBlock: from.toString(),
    toBlock: to.toString(),
    latest: latest.toString(),
    indexedToBlock: null,
    count: purchases.length,
    purchases
  };
}

async function fetchMetadataFromTokenUri(tokenURI) {
  const url = toHttpUri(tokenURI);
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    if (!json || typeof json !== "object") return null;
    return json;
  } catch {
    return null;
  }
}

async function connect() {
  if (!window.ethereum) throw new Error("Missing window.ethereum");
  walletClient = createWalletClient({
    chain,
    transport: custom(window.ethereum)
  });
  const [addr] = await walletClient.requestAddresses();
  connectedAddress = getAddress(addr);
  connectedChainId = await getConnectedChainId();
  setText("conn", `connected: ${connectedAddress}`);

  if (!walletEventsBound && window.ethereum?.on) {
    walletEventsBound = true;
    window.ethereum.on("chainChanged", () => {
      getConnectedChainId()
        .then((id) => {
          connectedChainId = id;
          render();
        })
        .catch(() => {});
    });
    window.ethereum.on("accountsChanged", (accounts) => {
      try {
        const a = Array.isArray(accounts) ? accounts[0] : null;
        connectedAddress = a ? getAddress(a) : null;
        setText("conn", connectedAddress ? `connected: ${connectedAddress}` : "not connected");
        render();
      } catch {
        connectedAddress = null;
        setText("conn", "not connected");
        render();
      }
    });
  }
}

async function getConnectedChainId() {
  if (!window.ethereum?.request) return null;
  try {
    const hex = await window.ethereum.request({ method: "eth_chainId" });
    if (!hex) return null;
    return Number.parseInt(String(hex), 16);
  } catch {
    return null;
  }
}

async function readItem() {
  const itemId = BigInt(val("itemIdRead"));
  const itemsAddress = requireAddress(val("itemsAddress"), "itemsAddress");
  const item = await publicClient.readContract({
    address: itemsAddress,
    abi: myShopItemsAbi,
    functionName: "items",
    args: [itemId]
  });
  setText("itemOut", JSON.stringify(item, null, 2));

  try {
    const payToken = pick(item, "payToken", 1);
    const buyPayToken = document.getElementById("buyPayToken");
    if (buyPayToken && !String(buyPayToken.value || "").trim()) buyPayToken.value = payToken;
  } catch {
  }

  const tokenURI = pick(item, "tokenURI", 5);
  const metaUrl = toHttpUri(tokenURI);
  let metadata = null;
  if (metaUrl) {
    try {
      const res = await fetch(metaUrl);
      metadata = await res.json();
    } catch {
      metadata = null;
    }
  }

  let page = null;
  try {
    const defaultVersion = await publicClient.readContract({
      address: itemsAddress,
      abi: myShopItemsAbi,
      functionName: "itemDefaultPageVersion",
      args: [itemId]
    });
    const v = BigInt(defaultVersion);
    if (v > 0n) {
      const raw = await publicClient.readContract({
        address: itemsAddress,
        abi: myShopItemsAbi,
        functionName: "getItemPage",
        args: [itemId, v]
      });
      page = {
        version: v.toString(),
        contentHash: pick(raw, "contentHash", 0),
        uri: pick(raw, "uri", 1)
      };
    }
  } catch {
    page = null;
  }

  const metaBox = document.getElementById("itemMetaOut");
  metaBox.innerHTML = "";

  if (metadata) {
    metaBox.appendChild(el("div", {}, [el("div", { text: `metadata.name: ${metadata.name ?? ""}` })]));
    metaBox.appendChild(el("div", {}, [el("div", { text: `metadata.description: ${metadata.description ?? ""}` })]));

    const image = toHttpUri(metadata.image || metadata.image_url || "");
    if (image) {
      metaBox.appendChild(el("img", { src: image, style: "max-width: 240px; display: block; margin: 8px 0;" }));
      metaBox.appendChild(el("a", { href: image, target: "_blank", rel: "noreferrer", text: "open image" }));
    }
    if (metadata.external_url) {
      metaBox.appendChild(
        el("div", {}, [el("a", { href: metadata.external_url, target: "_blank", rel: "noreferrer", text: "external_url" })])
      );
    }
  } else if (metaUrl) {
    metaBox.appendChild(el("div", { text: `metadata fetch failed: ${metaUrl}` }));
  }

  if (page) {
    metaBox.appendChild(el("hr"));
    metaBox.appendChild(el("div", { text: `default page version: ${page.version}` }));
    metaBox.appendChild(el("div", { text: `contentHash: ${page.contentHash}` }));
    metaBox.appendChild(el("a", { href: page.uri, target: "_blank", rel: "noreferrer", text: page.uri }));
  }
}

async function registerShop() {
  if (!walletClient || !connectedAddress) throw new Error("connect wallet first");
  const shopsAddress = requireAddress(val("shopsAddress"), "shopsAddress");
  const treasury = requireAddress(val("shopTreasury"), "treasury");
  const metadataHash = val("shopMetadataHash") || "0x" + "0".repeat(64);

  const hash = await walletClient.writeContract({
    address: shopsAddress,
    abi: myShopsAbi,
    functionName: "registerShop",
    args: [treasury, metadataHash],
    account: connectedAddress
  });
  setText("txOut", `registerShop tx: ${hash}`);
}

async function updateShopTx() {
  if (!walletClient || !connectedAddress) throw new Error("connect wallet first");
  const shopsAddress = requireAddress(val("shopsAddress"), "shopsAddress");
  const shopId = BigInt(val("shopIdUpdateShop"));
  const treasury = requireAddress(val("shopTreasuryUpdateShop"), "treasury");
  const metadataHash = val("shopMetadataHashUpdateShop") || "0x" + "0".repeat(64);
  const hash = await walletClient.writeContract({
    address: shopsAddress,
    abi: myShopsAbi,
    functionName: "updateShop",
    args: [shopId, treasury, metadataHash],
    account: connectedAddress
  });
  setText("txOut", `updateShop tx: ${hash}`);
}

async function setShopPausedTx() {
  if (!walletClient || !connectedAddress) throw new Error("connect wallet first");
  const shopsAddress = requireAddress(val("shopsAddress"), "shopsAddress");
  const shopId = BigInt(val("shopIdPause"));
  const paused = val("shopPaused") === "true";
  const hash = await walletClient.writeContract({
    address: shopsAddress,
    abi: myShopsAbi,
    functionName: "setShopPaused",
    args: [shopId, paused],
    account: connectedAddress
  });
  setText("txOut", `setShopPaused tx: ${hash}`);
}

async function readProtocolConfig() {
  const shopsAddress = requireAddress(val("shopsAddress"), "shopsAddress");
  const owner = await publicClient.readContract({ address: shopsAddress, abi: myShopsAbi, functionName: "owner", args: [] });
  const registry = await publicClient.readContract({ address: shopsAddress, abi: myShopsAbi, functionName: "registry", args: [] });
  const protocolTreasury = await publicClient.readContract({
    address: shopsAddress,
    abi: myShopsAbi,
    functionName: "platformTreasury",
    args: []
  });
  const listingFeeToken = await publicClient.readContract({
    address: shopsAddress,
    abi: myShopsAbi,
    functionName: "listingFeeToken",
    args: []
  });
  const listingFeeAmount = await publicClient.readContract({
    address: shopsAddress,
    abi: myShopsAbi,
    functionName: "listingFeeAmount",
    args: []
  });
  const protocolFeeBps = await publicClient.readContract({
    address: shopsAddress,
    abi: myShopsAbi,
    functionName: "platformFeeBps",
    args: []
  });
  setText(
    "platformOut",
    JSON.stringify(
      {
        shopsAddress,
        owner,
        registry,
        protocolTreasury,
        listingFeeToken,
        listingFeeAmount: listingFeeAmount.toString(),
        protocolFeeBps: protocolFeeBps.toString()
      },
      null,
      2
    )
  );
}

async function setRegistryTx() {
  if (!walletClient || !connectedAddress) throw new Error("connect wallet first");
  const shopsAddress = requireAddress(val("shopsAddress"), "shopsAddress");
  const registry = requireAddress(val("platformRegistry"), "registry");
  const hash = await walletClient.writeContract({
    address: shopsAddress,
    abi: myShopsAbi,
    functionName: "setRegistry",
    args: [registry],
    account: connectedAddress
  });
  setText("txOut", `setRegistry tx: ${hash}`);
}

async function setProtocolTreasuryTx() {
  if (!walletClient || !connectedAddress) throw new Error("connect wallet first");
  const shopsAddress = requireAddress(val("shopsAddress"), "shopsAddress");
  const treasury = requireAddress(val("platformTreasury"), "treasury");
  const hash = await walletClient.writeContract({
    address: shopsAddress,
    abi: myShopsAbi,
    functionName: "setPlatformTreasury",
    args: [treasury],
    account: connectedAddress
  });
  setText("txOut", `setProtocolTreasury tx: ${hash}`);
}

async function setListingFeeTx() {
  if (!walletClient || !connectedAddress) throw new Error("connect wallet first");
  const shopsAddress = requireAddress(val("shopsAddress"), "shopsAddress");
  const token = requireAddress(val("platformListingFeeToken"), "token");
  const amount = BigInt(val("platformListingFeeAmount"));
  const hash = await walletClient.writeContract({
    address: shopsAddress,
    abi: myShopsAbi,
    functionName: "setListingFee",
    args: [token, amount],
    account: connectedAddress
  });
  setText("txOut", `setListingFee tx: ${hash}`);
}

async function setProtocolFeeTx() {
  if (!walletClient || !connectedAddress) throw new Error("connect wallet first");
  const shopsAddress = requireAddress(val("shopsAddress"), "shopsAddress");
  const feeBps = Number(val("platformFeeBps"));
  const hash = await walletClient.writeContract({
    address: shopsAddress,
    abi: myShopsAbi,
    functionName: "setPlatformFee",
    args: [feeBps],
    account: connectedAddress
  });
  setText("txOut", `setProtocolFee tx: ${hash}`);
}

async function transferShopsOwnershipTx() {
  if (!walletClient || !connectedAddress) throw new Error("connect wallet first");
  const shopsAddress = requireAddress(val("shopsAddress"), "shopsAddress");
  const newOwner = requireAddress(val("shopsNewOwner"), "newOwner");
  const hash = await walletClient.writeContract({
    address: shopsAddress,
    abi: myShopsAbi,
    functionName: "transferOwnership",
    args: [newOwner],
    account: connectedAddress
  });
  setText("txOut", `transferOwnership(MyShops) tx: ${hash}`);
}

async function readItemsConfig() {
  const itemsAddress = requireAddress(val("itemsAddress"), "itemsAddress");
  const owner = await publicClient.readContract({ address: itemsAddress, abi: myShopItemsAbi, functionName: "owner", args: [] });
  const shops = await publicClient.readContract({ address: itemsAddress, abi: myShopItemsAbi, functionName: "shops", args: [] });
  const riskSigner = await publicClient.readContract({
    address: itemsAddress,
    abi: myShopItemsAbi,
    functionName: "riskSigner",
    args: []
  });
  const serialSigner = await publicClient.readContract({
    address: itemsAddress,
    abi: myShopItemsAbi,
    functionName: "serialSigner",
    args: []
  });
  setText(
    "itemsOut",
    JSON.stringify({ itemsAddress, owner, shops, riskSigner, serialSigner }, null, 2)
  );
}

async function setRiskSignerTx() {
  if (!walletClient || !connectedAddress) throw new Error("connect wallet first");
  const itemsAddress = requireAddress(val("itemsAddress"), "itemsAddress");
  const signer = requireAddress(val("itemsRiskSigner"), "signer");
  const hash = await walletClient.writeContract({
    address: itemsAddress,
    abi: myShopItemsAbi,
    functionName: "setRiskSigner",
    args: [signer],
    account: connectedAddress
  });
  setText("txOut", `setRiskSigner tx: ${hash}`);
}

async function setSerialSignerTx() {
  if (!walletClient || !connectedAddress) throw new Error("connect wallet first");
  const itemsAddress = requireAddress(val("itemsAddress"), "itemsAddress");
  const signer = requireAddress(val("itemsSerialSigner"), "signer");
  const hash = await walletClient.writeContract({
    address: itemsAddress,
    abi: myShopItemsAbi,
    functionName: "setSerialSigner",
    args: [signer],
    account: connectedAddress
  });
  setText("txOut", `setSerialSigner tx: ${hash}`);
}

async function setActionAllowedTx() {
  if (!walletClient || !connectedAddress) throw new Error("connect wallet first");
  const itemsAddress = requireAddress(val("itemsAddress"), "itemsAddress");
  const action = requireAddress(val("itemsActionAddress"), "action");
  const allowed = val("itemsActionAllowed") === "true";
  const hash = await walletClient.writeContract({
    address: itemsAddress,
    abi: myShopItemsAbi,
    functionName: "setActionAllowed",
    args: [action, allowed],
    account: connectedAddress
  });
  setText("txOut", `setActionAllowed tx: ${hash}`);
}

async function transferItemsOwnershipTx() {
  if (!walletClient || !connectedAddress) throw new Error("connect wallet first");
  const itemsAddress = requireAddress(val("itemsAddress"), "itemsAddress");
  const newOwner = requireAddress(val("itemsNewOwner"), "newOwner");
  const hash = await walletClient.writeContract({
    address: itemsAddress,
    abi: myShopItemsAbi,
    functionName: "transferOwnership",
    args: [newOwner],
    account: connectedAddress
  });
  setText("txOut", `transferOwnership(MyShopItems) tx: ${hash}`);
}

async function addItem() {
  if (!walletClient || !connectedAddress) throw new Error("connect wallet first");
  const itemsAddress = requireAddress(val("itemsAddress"), "itemsAddress");

  const p = {
    shopId: BigInt(val("shopIdAdd")),
    payToken: requireAddress(val("payToken"), "payToken"),
    unitPrice: BigInt(val("unitPrice")),
    nftContract: requireAddress(val("nftContract"), "nftContract"),
    soulbound: val("soulbound") === "true",
    tokenURI: val("tokenURI"),
    action: val("action") ? requireAddress(val("action"), "action") : "0x0000000000000000000000000000000000000000",
    actionData: requireHexBytes(val("actionData"), "actionData"),
    requiresSerial: val("requiresSerial") === "true",
    maxItems: BigInt(val("maxItems") || "0"),
    deadline: BigInt(val("riskDeadline") || "0"),
    nonce: BigInt(val("riskNonce") || "0"),
    signature: requireHexBytes(val("riskSig"), "riskSig")
  };

  const hash = await walletClient.writeContract({
    address: itemsAddress,
    abi: myShopItemsAbi,
    functionName: "addItem",
    args: [p],
    account: connectedAddress
  });
  setText("txOut", `addItem tx: ${hash}`);
}

async function fetchRiskSig() {
  const shopOwner = requireAddress(val("riskShopOwner"), "riskShopOwner");
  const maxItems = val("maxItems");
  const deadline = val("riskDeadline");
  const json = await workerPermitGet("/risk-allowance", { shopOwner, maxItems, deadline });
  document.getElementById("riskNonce").value = json.nonce;
  document.getElementById("riskSig").value = json.signature;
  setText("txOut", "risk signature fetched");
}

async function fetchSerialExtraData() {
  const itemId = val("buyItemId");
  const buyer = requireAddress(val("buyBuyer"), "buyer");
  const serial = val("serial");
  const deadline = val("serialDeadline");
  const json = await workerPermitGet("/serial-permit", { itemId, buyer, serial, deadline });
  document.getElementById("buyExtraData").value = json.extraData;
  setText("txOut", "serial extraData fetched");
}

async function approvePayToken() {
  if (!walletClient || !connectedAddress) throw new Error("connect wallet first");
  const itemsAddress = requireAddress(val("itemsAddress"), "itemsAddress");
  const payToken = requireAddress(val("buyPayToken"), "buyPayToken");
  const amount = BigInt(val("buyApproveAmount") || "0");
  await runWriteTx({
    label: "approve",
    buttonIds: ["btnApprove", "btnBuy"],
    write: () =>
      walletClient.writeContract({
        address: payToken,
        abi: erc20Abi,
        functionName: "approve",
        args: [itemsAddress, amount],
        account: connectedAddress
      })
  });
}

async function buy() {
  if (!walletClient || !connectedAddress) throw new Error("connect wallet first");
  const itemsAddress = requireAddress(val("itemsAddress"), "itemsAddress");
  const itemId = BigInt(val("buyItemId"));
  const quantity = BigInt(val("buyQty"));
  const recipient = requireAddress(val("buyRecipient"), "recipient");
  const extraData = requireHexBytes(val("buyExtraData"), "extraData");
  const ethValue = val("buyEthValue");

  await runWriteTx({
    label: `buy itemId=${itemId.toString()} qty=${quantity.toString()}`,
    buttonIds: ["btnApprove", "btnBuy"],
    write: () =>
      walletClient.writeContract({
        address: itemsAddress,
        abi: myShopItemsAbi,
        functionName: "buy",
        args: [itemId, quantity, recipient, extraData],
        account: connectedAddress,
        value: ethValue ? parseEther(ethValue) : undefined
      })
  });

  window.location.hash = `#/purchases?buyer=${encodeURIComponent(connectedAddress)}&itemId=${encodeURIComponent(
    itemId.toString()
  )}&source=auto`;
}

async function setShopRolesTx() {
  if (!walletClient || !connectedAddress) throw new Error("connect wallet first");
  const shopsAddress = requireAddress(val("shopsAddress"), "shopsAddress");
  const shopId = BigInt(val("shopIdRole"));
  const operator = requireAddress(val("roleOperator"), "operator");

  const shopAdmin = document.getElementById("roleShopAdmin").checked ? 1 : 0;
  const maintainer = document.getElementById("roleItemMaintainer").checked ? 2 : 0;
  const editor = document.getElementById("roleItemEditor").checked ? 4 : 0;
  const actionEditor = document.getElementById("roleItemActionEditor").checked ? 8 : 0;
  const roles = shopAdmin | maintainer | editor | actionEditor;

  const hash = await walletClient.writeContract({
    address: shopsAddress,
    abi: myShopsAbi,
    functionName: "setShopRoles",
    args: [shopId, operator, roles],
    account: connectedAddress
  });
  setText("txOut", `setShopRoles tx: ${hash}`);
}

async function updateItemTx() {
  if (!walletClient || !connectedAddress) throw new Error("connect wallet first");
  const itemsAddress = requireAddress(val("itemsAddress"), "itemsAddress");
  const itemId = BigInt(val("itemIdUpdate"));
  const p = {
    payToken: requireAddress(val("payTokenUpdate"), "payToken"),
    unitPrice: BigInt(val("unitPriceUpdate")),
    nftContract: requireAddress(val("nftContractUpdate"), "nftContract"),
    soulbound: val("soulboundUpdate") === "true",
    tokenURI: val("tokenURIUpdate"),
    requiresSerial: val("requiresSerialUpdate") === "true"
  };

  const hash = await walletClient.writeContract({
    address: itemsAddress,
    abi: myShopItemsAbi,
    functionName: "updateItem",
    args: [itemId, p],
    account: connectedAddress
  });
  setText("txOut", `updateItem tx: ${hash}`);
}

async function updateItemActionTx() {
  if (!walletClient || !connectedAddress) throw new Error("connect wallet first");
  const itemsAddress = requireAddress(val("itemsAddress"), "itemsAddress");
  const itemId = BigInt(val("itemIdUpdateAction"));
  const action = val("actionUpdate") ? requireAddress(val("actionUpdate"), "action") : "0x0000000000000000000000000000000000000000";
  const actionData = requireHexBytes(val("actionDataUpdate"), "actionData");

  const hash = await walletClient.writeContract({
    address: itemsAddress,
    abi: myShopItemsAbi,
    functionName: "updateItemAction",
    args: [itemId, action, actionData],
    account: connectedAddress
  });
  setText("txOut", `updateItemAction tx: ${hash}`);
}

async function setItemActiveTx() {
  if (!walletClient || !connectedAddress) throw new Error("connect wallet first");
  const itemsAddress = requireAddress(val("itemsAddress"), "itemsAddress");
  const itemId = BigInt(val("itemIdActive"));
  const active = val("itemActive") === "true";
  const hash = await walletClient.writeContract({
    address: itemsAddress,
    abi: myShopItemsAbi,
    functionName: "setItemActive",
    args: [itemId, active],
    account: connectedAddress
  });
  setText("txOut", `setItemActive tx: ${hash}`);
}

async function addItemPageTx() {
  if (!walletClient || !connectedAddress) throw new Error("connect wallet first");
  const itemsAddress = requireAddress(val("itemsAddress"), "itemsAddress");
  const itemId = BigInt(val("itemIdPage"));
  const uri = val("pageUri");
  const contentHash = val("pageHash") || "0x" + "0".repeat(64);

  const hash = await walletClient.writeContract({
    address: itemsAddress,
    abi: myShopItemsAbi,
    functionName: "addItemPageVersion",
    args: [itemId, uri, contentHash],
    account: connectedAddress
  });
  setText("txOut", `addItemPageVersion tx: ${hash}`);
}

async function setDefaultItemPageTx() {
  if (!walletClient || !connectedAddress) throw new Error("connect wallet first");
  const itemsAddress = requireAddress(val("itemsAddress"), "itemsAddress");
  const itemId = BigInt(val("itemIdDefaultPage"));
  const version = BigInt(val("defaultPageVersion"));

  const hash = await walletClient.writeContract({
    address: itemsAddress,
    abi: myShopItemsAbi,
    functionName: "setItemDefaultPageVersion",
    args: [itemId, version],
    account: connectedAddress
  });
  setText("txOut", `setItemDefaultPageVersion tx: ${hash}`);
}

async function exportShopItemsTx() {
  const itemsAddress = requireAddress(val("itemsAddress"), "itemsAddress");
  const shopId = BigInt(val("shopIdExport"));

  const count = await publicClient.readContract({
    address: itemsAddress,
    abi: myShopItemsAbi,
    functionName: "itemCount",
    args: []
  });

  const total = Number(BigInt(count));
  const list = [];

  for (let i = 1; i <= total; i++) {
    const itemId = BigInt(i);
    const raw = await publicClient.readContract({
      address: itemsAddress,
      abi: myShopItemsAbi,
      functionName: "items",
      args: [itemId]
    });
    const itemShopId = BigInt(pick(raw, "shopId", 0));
    if (itemShopId !== shopId) continue;

    const pageCount = await publicClient.readContract({
      address: itemsAddress,
      abi: myShopItemsAbi,
      functionName: "itemPageCount",
      args: [itemId]
    });
    const pageTotal = Number(BigInt(pageCount));
    const pages = [];
    for (let v = 1; v <= pageTotal; v++) {
      const pageRaw = await publicClient.readContract({
        address: itemsAddress,
        abi: myShopItemsAbi,
        functionName: "getItemPage",
        args: [itemId, BigInt(v)]
      });
      pages.push({
        version: String(v),
        contentHash: pick(pageRaw, "contentHash", 0),
        uri: pick(pageRaw, "uri", 1)
      });
    }

    const defaultVersion = await publicClient.readContract({
      address: itemsAddress,
      abi: myShopItemsAbi,
      functionName: "itemDefaultPageVersion",
      args: [itemId]
    });

    list.push({
      itemId: itemId.toString(),
      item: {
        shopId: pick(raw, "shopId", 0).toString(),
        payToken: pick(raw, "payToken", 1),
        unitPrice: pick(raw, "unitPrice", 2).toString(),
        nftContract: pick(raw, "nftContract", 3),
        soulbound: pick(raw, "soulbound", 4),
        tokenURI: pick(raw, "tokenURI", 5),
        action: pick(raw, "action", 6),
        actionData: pick(raw, "actionData", 7),
        requiresSerial: pick(raw, "requiresSerial", 8),
        active: pick(raw, "active", 9)
      },
      pages,
      defaultPageVersion: BigInt(defaultVersion).toString()
    });
  }

  const payload = {
    version: 1,
    chainId: chain.id,
    itemsAddress,
    shopId: shopId.toString(),
    exportedAt: new Date().toISOString(),
    items: list
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = el("a", { href: url, download: `myshop_shop_${shopId.toString()}_items.json` });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  setText("txOut", `exported ${list.length} items`);
}

async function importShopItemsTx() {
  if (!walletClient || !connectedAddress) throw new Error("connect wallet first");
  const itemsAddress = requireAddress(val("itemsAddress"), "itemsAddress");
  const text = val("importJson");
  if (!text) throw new Error("import json required");
  const data = JSON.parse(text);
  if (!Array.isArray(data.items)) throw new Error("invalid import json: items");

  for (const entry of data.items) {
    const it = entry.item;
    const p = {
      shopId: BigInt(it.shopId),
      payToken: requireAddress(it.payToken, "payToken"),
      unitPrice: BigInt(it.unitPrice),
      nftContract: requireAddress(it.nftContract, "nftContract"),
      soulbound: Boolean(it.soulbound),
      tokenURI: String(it.tokenURI || ""),
      action: it.action && it.action !== "0x0000000000000000000000000000000000000000" ? requireAddress(it.action, "action") : "0x0000000000000000000000000000000000000000",
      actionData: requireHexBytes(it.actionData || "0x", "actionData"),
      requiresSerial: Boolean(it.requiresSerial),
      maxItems: 0n,
      deadline: 0n,
      nonce: 0n,
      signature: "0x"
    };

    const hash = await walletClient.writeContract({
      address: itemsAddress,
      abi: myShopItemsAbi,
      functionName: "addItem",
      args: [p],
      account: connectedAddress
    });
    await publicClient.waitForTransactionReceipt({ hash });

    const newCount = await publicClient.readContract({
      address: itemsAddress,
      abi: myShopItemsAbi,
      functionName: "itemCount",
      args: []
    });
    const newItemId = BigInt(newCount);

    if (Array.isArray(entry.pages)) {
      for (const pg of entry.pages) {
        const pageHash = pg.contentHash || "0x" + "0".repeat(64);
        const pageUri = String(pg.uri || "");
        if (!pageUri) continue;
        const h2 = await walletClient.writeContract({
          address: itemsAddress,
          abi: myShopItemsAbi,
          functionName: "addItemPageVersion",
          args: [newItemId, pageUri, pageHash],
          account: connectedAddress
        });
        await publicClient.waitForTransactionReceipt({ hash: h2 });
      }
    }

    const defV = BigInt(entry.defaultPageVersion || "0");
    if (defV > 0n) {
      const h3 = await walletClient.writeContract({
        address: itemsAddress,
        abi: myShopItemsAbi,
        functionName: "setItemDefaultPageVersion",
        args: [newItemId, defV],
        account: connectedAddress
      });
      await publicClient.waitForTransactionReceipt({ hash: h3 });
    }
  }

  setText("txOut", "import done");
}

let routeState = { buyerItemId: null };
let lastServiceCheckAtMs = 0;
let lastServiceStatusText = "";

function getRoute() {
  const raw = window.location.hash || "#/plaza";
  const hash = raw.startsWith("#") ? raw.slice(1) : raw;
  const [path, queryStr] = hash.split("?");
  const parts = path.split("/").filter(Boolean);
  const query = {};
  if (queryStr) {
    const qs = new URLSearchParams(queryStr);
    for (const [k, v] of qs.entries()) query[k] = v;
  }
  return { raw, path, parts, query };
}

function navLink(label, href) {
  return el("a", { href, text: label, style: "margin-right: 12px;" });
}

function navLinkWithId(id, label, href) {
  return el("a", { id, href, text: label, style: "margin-right: 12px;" });
}

async function fetchJsonWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchJson(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function decodeShopRoles(rolesMask) {
  return decodeShopRolesMask(rolesMask).labels;
}

function applyConfigFromInputs() {
  const next = {
    rpcUrl: val("rpcUrl") || "",
    chainId: val("chainId") ? Number(val("chainId")) : 31337,
    shopsAddress: val("shopsAddress") || "",
    itemsAddress: val("itemsAddress") || "",
    workerUrl: val("workerUrl") || "",
    workerApiUrl: val("workerApiUrl") || ""
  };
  runtimeCfg = next;
  saveStoredConfig(next);
  chain = buildChain(next);
  publicClient = createPublicClient({
    chain,
    transport: http(next.rpcUrl || "http://127.0.0.1:8545")
  });
  walletClient = null;
  setText("txOut", "config applied (reconnect wallet if needed)");
}

async function loadConfigFromWorker() {
  const json = await workerApiGet("/config");
  if (!json?.ok) throw new Error("invalid worker /config response");
  document.getElementById("chainId").value = String(json.chainId ?? "");
  document.getElementById("rpcUrl").value = String(json.rpcUrl ?? "");
  document.getElementById("itemsAddress").value = String(json.itemsAddress ?? "");
  document.getElementById("shopsAddress").value = String(json.shopsAddress ?? "");
  setText("txOut", "loaded from worker /config");
}

async function renderPlaza(container) {
  container.appendChild(el("h2", { text: "广场（All Shops）" }));

  container.appendChild(el("div", { text: "数据源：默认 auto（优先 Worker Query API，失败则回退链上读取）。" }));

  const sourceSelect = el("select", { id: "plazaSource" }, [
    el("option", { value: "auto", text: "auto" }),
    el("option", { value: "worker", text: "worker" }),
    el("option", { value: "chain", text: "chain" })
  ]);

  container.appendChild(
    el("div", {}, [
      inputRow("shops limit", "plazaShopLimit", "20"),
      inputRow("items limit", "plazaItemLimit", "50"),
      el("div", {}, [el("label", { for: "plazaSource", text: "source" }), sourceSelect])
    ])
  );

  const listBox = el("div", { id: "plazaList" });
  container.appendChild(el("button", { text: "Reload", onclick: () => load().catch(showTxError) }));
  container.appendChild(listBox);

  async function load() {
    setText("txOut", "loading plaza...");
    listBox.innerHTML = "";
    const shopLimit = Number(val("plazaShopLimit") || "20");
    const itemLimit = Number(val("plazaItemLimit") || "50");
    const source = val("plazaSource") || "auto";
    const fetchSource = source === "auto" ? undefined : source;

    const { shops } = await fetchShopList({ cursor: 1n, limit: shopLimit, source: fetchSource });
    const { items } = await fetchItemList({ cursor: 1n, limit: itemLimit, source: fetchSource });

    const shopsById = new Map();
    for (const s of shops) shopsById.set(String(s.shopId), s.shop);

    listBox.appendChild(
      el("div", {
        text: `loaded: shops(${shops.length}) ${sourceCountsLabel(shops, (s) => s?.shop?.__source)} items(${items.length}) ${sourceCountsLabel(
          items,
          (it) => it?.item?.__source
        )}`
      })
    );

    const shopsEl = el("div", {}, [el("h3", { text: `Shops (${shops.length})` })]);
    for (const s of shops) {
      const shop = s.shop;
      shopsEl.appendChild(
        el("div", {}, [
          el("a", { href: `#/shop/${s.shopId}`, text: `Shop #${s.shopId}` }),
          el("span", { text: ` src=${shop.__source || ""}` }),
          el("span", { text: " owner=" }),
          addressNode(shop.owner),
          el("span", { text: " treasury=" }),
          addressNode(shop.treasury),
          el("span", { text: ` paused=${shop.paused}` })
        ])
      );
    }
    listBox.appendChild(shopsEl);

    const itemsEl = el("div", {}, [el("h3", { text: `Items (${items.length})` })]);
    for (const it of items) {
      const item = it.item;
      const shop = shopsById.get(String(item.shopId));
      itemsEl.appendChild(
        el("div", {}, [
          el("a", { href: `#/item/${it.itemId}`, text: `Item #${it.itemId}` }),
          el("span", {
            text: formatItemSummary(item, { includeShopId: true })
          }),
          shop ? el("span", {}, [el("span", { text: " shopOwner=" }), addressNode(shop.owner)]) : el("span", { text: "" }),
          el("button", {
            text: "Buy",
            style: "margin-left: 8px;",
            onclick: () => {
              routeState.buyerItemId = String(it.itemId);
              window.location.hash = "#/buyer";
            }
          })
        ])
      );
    }
    listBox.appendChild(itemsEl);

    setText("txOut", "plaza loaded");
  }

  document.getElementById("plazaShopLimit").value = "20";
  document.getElementById("plazaItemLimit").value = "50";
  document.getElementById("plazaSource").value = "auto";
  await load();
}

async function renderShopDetail(container, shopId) {
  container.appendChild(el("h2", { text: `Shop #${shopId}` }));
  const out = el("div", { id: "shopDetailOut" });
  const itemsBox = el("div", { id: "shopItemsBox" });
  container.appendChild(out);
  container.appendChild(itemsBox);

  const shop = await fetchShop(shopId);
  out.appendChild(kv("source", String(shop.__source || "")));
  out.appendChild(kv("owner", addressNode(shop.owner)));
  out.appendChild(kv("treasury", addressNode(shop.treasury)));
  out.appendChild(kv("metadataHash", shortHex(shop.metadataHash)));
  out.appendChild(kv("paused", String(shop.paused)));

  itemsBox.appendChild(el("h3", { text: "Items (scan first N items)" }));
  itemsBox.appendChild(inputRow("scan limit", "shopItemScanLimit", "200"));
  itemsBox.appendChild(
    el("button", {
      text: "Scan",
      onclick: () => scan().catch(showTxError)
    })
  );
  const list = el("div", { id: "shopItemsList" });
  itemsBox.appendChild(list);

  async function scan() {
    list.innerHTML = "";
    const scanLimit = Number(val("shopItemScanLimit") || "200");
    const { items } = await fetchItemList({ cursor: 1n, limit: scanLimit });
    const filtered = items.filter((x) => String(x.item.shopId) === String(shopId));
    if (filtered.length === 0) {
      list.appendChild(el("div", { text: "No items found for this shop in scanned range." }));
      setText("txOut", "shop items: 0");
      return;
    }
    list.appendChild(el("div", { text: `loaded: items(${filtered.length}) ${sourceCountsLabel(filtered, (it) => it?.item?.__source)}` }));
    for (const it of filtered) {
      const item = it.item;
      list.appendChild(
        el("div", {}, [
          el("a", { href: `#/item/${it.itemId}`, text: `Item #${it.itemId}` }),
          el("span", {
            text: formatItemSummary(item, { includeShopId: false })
          })
        ])
      );
    }
    setText("txOut", `shop items: ${filtered.length}`);
  }

  await scan();
}

function parseBytesLen(hex) {
  const s = String(hex || "");
  if (!s.startsWith("0x")) return null;
  return Math.max(0, Math.floor((s.length - 2) / 2));
}

function renderPurchasesList(container, { purchases, emptyText }) {
  container.innerHTML = "";
  if (!Array.isArray(purchases) || purchases.length === 0) {
    container.appendChild(el("div", { text: emptyText || "No purchases." }));
    return;
  }
  for (const p of purchases) {
    const serialHash = p.serialHash && String(p.serialHash) !== "0x0000000000000000000000000000000000000000000000000000000000000000" ? shortHex(p.serialHash) : "-";
    container.appendChild(
      el("div", {}, [
        el("span", { text: `block=${p.blockNumber ?? ""} ` }),
        txLinkNode(p.txHash),
        el("span", { text: " item=" }),
        el("a", { href: `#/item/${p.itemId}`, text: `#${p.itemId}` }),
        el("span", { text: " shop=" }),
        el("a", { href: `#/shop/${p.shopId}`, text: `#${p.shopId}` }),
        el("span", {
          text: ` qty=${p.quantity} payToken=${formatPayToken(p.payToken)} payAmount=${p.payAmount} fee=${p.platformFeeAmount} firstTokenId=${p.firstTokenId} serialHash=${serialHash} buyer=`
        }),
        addressNode(p.buyer),
        el("span", { text: " recipient=" }),
        addressNode(p.recipient)
      ])
    );
  }
}

async function renderItemDetail(container, itemId) {
  container.appendChild(el("h2", { text: `Item #${itemId}` }));
  const out = el("div", { id: "itemDetailOut" });
  const metaBox = el("div", { id: "itemDetailMeta" });
  container.appendChild(out);
  container.appendChild(metaBox);

  const item = await fetchItem(itemId);
  out.appendChild(kv("source", String(item.__source || "")));
  out.appendChild(kv("shopId", el("a", { href: `#/shop/${item.shopId}`, text: `Shop #${item.shopId}` })));
  out.appendChild(kv("active", String(item.active)));
  out.appendChild(kv("payToken", formatPayToken(item.payToken)));
  out.appendChild(kv("unitPrice", String(item.unitPrice)));
  out.appendChild(kv("requiresSerial", String(item.requiresSerial)));
  out.appendChild(kv("soulbound", String(item.soulbound)));
  out.appendChild(kv("nftContract", addressNode(item.nftContract)));
  out.appendChild(kv("action", item.action && !isZeroAddress(item.action) ? addressNode(item.action) : "none"));
  out.appendChild(kv("actionDataBytes", String(parseBytesLen(item.actionData) ?? "")));
  const tokenUriHttp = toHttpUri(item.tokenURI);
  out.appendChild(kv("tokenURI", tokenUriHttp ? el("a", { href: tokenUriHttp, target: "_blank", rel: "noreferrer", text: tokenUriHttp }) : item.tokenURI));

  try {
    const itemsAddressVal = val("itemsAddress") || runtimeCfg.itemsAddress;
    const itemsAddress = requireAddress(itemsAddressVal, "itemsAddress");
    const defaultVersion = await publicClient.readContract({
      address: itemsAddress,
      abi: myShopItemsAbi,
      functionName: "itemDefaultPageVersion",
      args: [BigInt(itemId)]
    });
    const v = BigInt(defaultVersion);
    if (v > 0n) {
      const raw = await publicClient.readContract({
        address: itemsAddress,
        abi: myShopItemsAbi,
        functionName: "getItemPage",
        args: [BigInt(itemId), v]
      });
      const uri = pick(raw, "uri", 1);
      const contentHash = pick(raw, "contentHash", 0);
      out.appendChild(kv("defaultPageVersion", v.toString()));
      out.appendChild(kv("pageContentHash", shortHex(contentHash)));
      out.appendChild(kv("pageUri", uri ? el("a", { href: uri, target: "_blank", rel: "noreferrer", text: uri }) : ""));
    } else {
      out.appendChild(kv("defaultPageVersion", "0"));
    }
  } catch {
    out.appendChild(kv("defaultPageVersion", "unknown"));
  }

  const meta = await fetchMetadataFromTokenUri(item.tokenURI);
  if (meta) {
    const name = String(meta.name || "");
    const desc = String(meta.description || "");
    metaBox.appendChild(el("div", { text: name ? `name: ${name}` : "" }));
    metaBox.appendChild(el("div", { text: desc ? `description: ${desc}` : "" }));
    const image = toHttpUri(meta.image || meta.image_url || "");
    if (image) metaBox.appendChild(el("img", { src: image, style: "max-width: 320px; display: block; margin: 8px 0;" }));
  }

  container.appendChild(el("hr"));
  container.appendChild(el("h3", { text: "Recent Purchases" }));
  const purchasesOut = el("div", { id: "purchasesOut" });
  container.appendChild(
    el("button", {
      text: "Reload Purchases",
      onclick: () => loadPurchases().catch(showTxError)
    })
  );
  container.appendChild(
    el("button", {
      text: "View All Purchases",
      style: "margin-left: 8px;",
      onclick: () => {
        window.location.hash = `#/purchases?itemId=${encodeURIComponent(String(itemId))}`;
      }
    })
  );
  container.appendChild(purchasesOut);

  async function loadPurchases() {
    const res = await fetchPurchases({ itemId: String(itemId), limit: 20 });
    const header = el("div", { text: `source=${res.source || ""} count=${res.count || 0} fromBlock=${res.fromBlock || ""} toBlock=${res.toBlock || ""} indexedToBlock=${res.indexedToBlock || ""}` });
    purchasesOut.innerHTML = "";
    purchasesOut.appendChild(header);
    const list = el("div", {});
    purchasesOut.appendChild(list);
    renderPurchasesList(list, { purchases: res.purchases, emptyText: "No purchases for this item." });
  }

  await loadPurchases();

  container.appendChild(
    el("button", {
      text: "Go Buy",
      onclick: () => {
        routeState.buyerItemId = String(itemId);
        window.location.hash = "#/buyer";
      }
    })
  );
}

async function renderPurchasesPage(container, query = {}) {
  container.appendChild(el("h2", { text: "购买记录（Purchases）" }));
  container.appendChild(el("div", { text: "数据源：默认走 Worker Index；也可切换为 chain 扫描（更慢但更接近链上真实）。" }));

  const sourceSelect = el("select", { id: "purchasesSource" }, [
    el("option", { value: "auto", text: "auto" }),
    el("option", { value: "index", text: "index" }),
    el("option", { value: "chain", text: "chain" })
  ]);

  container.appendChild(
    el("div", {}, [
      inputRow("buyer(optional)", "purchasesBuyer", query.buyer || connectedAddress || ""),
      inputRow("shopId(optional)", "purchasesShopId", query.shopId || ""),
      inputRow("itemId(optional)", "purchasesItemId", query.itemId || ""),
      inputRow("limit", "purchasesLimit", query.limit || "50"),
      inputRow("fromBlock(optional)", "purchasesFromBlock", query.fromBlock || ""),
      inputRow("toBlock(optional)", "purchasesToBlock", query.toBlock || ""),
      el("div", {}, [el("label", { for: "purchasesSource", text: "source" }), sourceSelect]),
      el("button", { text: "Load", onclick: () => load().catch(showTxError) })
    ])
  );
  document.getElementById("purchasesSource").value = query.source || "index";

  const meta = el("div", { id: "purchasesMeta" });
  const list = el("div", { id: "purchasesList" });
  container.appendChild(meta);
  container.appendChild(list);

  async function load() {
    setText("txOut", "loading purchases...");
    const buyer = val("purchasesBuyer") || undefined;
    const shopId = val("purchasesShopId") || undefined;
    const itemId = val("purchasesItemId") || undefined;
    const limit = Number(val("purchasesLimit") || "50");
    const fromBlock = val("purchasesFromBlock") || undefined;
    const toBlock = val("purchasesToBlock") || undefined;
    const source = val("purchasesSource") || "index";

    const res = await fetchPurchases({ buyer, shopId, itemId, limit, source, fromBlock, toBlock });
    meta.innerHTML = "";
    meta.appendChild(
      el("div", {
        text: `source=${res.source || ""} count=${res.count || 0} fromBlock=${res.fromBlock || ""} toBlock=${res.toBlock || ""} indexedToBlock=${res.indexedToBlock || ""}`
      })
    );
    renderPurchasesList(list, { purchases: res.purchases, emptyText: "No purchases matched filters." });
    setText("txOut", "purchases loaded");
  }

  await load();
}

async function renderBuyer(container) {
  container.appendChild(el("h2", { text: "买家入口（Buyer）" }));
  container.appendChild(el("div", { text: "流程：选 item →（可选）请求串号签名 → approve → buy" }));

  container.appendChild(
    el("div", {}, [
      el("h3", { text: "Read Item" }),
      inputRow("itemId", "itemIdRead", routeState.buyerItemId || "1"),
      el("button", { text: "Read Item", onclick: () => readItem().catch(showTxError) }),
      el("pre", { id: "itemOut" }),
      el("div", { id: "itemMetaOut" })
    ])
  );

  container.appendChild(el("hr"));

  container.appendChild(
    el("div", {}, [
      el("h3", { text: "Buy" }),
      inputRow("itemId", "buyItemId", routeState.buyerItemId || "1"),
      inputRow("qty", "buyQty", "1"),
      inputRow("recipient", "buyRecipient", connectedAddress || ""),
      inputRow("buyer(for permit)", "buyBuyer", connectedAddress || ""),
      inputRow("payToken(for approve)", "buyPayToken"),
      inputRow("approveAmount(uint256)", "buyApproveAmount", "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"),
      el("button", { id: "btnApprove", text: "Approve", onclick: () => approvePayToken().catch(showTxError) }),
      el("h4", { text: "Serial Permit (optional)" }),
      inputRow("serial", "serial", "SERIAL-001"),
      inputRow("deadline(ts)", "serialDeadline", String(Math.floor(Date.now() / 1000) + 3600)),
      inputRow("extraData(hex)", "buyExtraData", "0x"),
      el("button", { text: "Fetch extraData", onclick: () => fetchSerialExtraData().catch(showTxError) }),
      inputRow("ethValue(optional)", "buyEthValue", ""),
      el("button", { id: "btnBuy", text: "Buy", onclick: () => buy().catch(showTxError) })
    ])
  );

  routeState.buyerItemId = null;
}

async function renderShopConsole(container, query = {}) {
  container.appendChild(el("h2", { text: "店主/运营后台（Shop Owner / Operator）" }));
  container.appendChild(
    el("div", { text: "提示：写操作会校验 shop owner / protocol owner / shopRoles；失败时会给出可操作提示。" })
  );

  const accessOut = el("pre", { id: "shopAccessOut" });
  container.appendChild(
    el("div", {}, [
      el("h3", { text: "Access Check" }),
      inputRow("shopId", "shopIdAccess", query.shopId || "1"),
      el("button", {
        text: "Check Access",
        onclick: async () => {
          const shopId = BigInt(val("shopIdAccess"));
          const actor = getAddress(connectedAddress);
          const access = await getShopAccess({ shopId, actor });
          accessOut.textContent = JSON.stringify(access, null, 2);
          if (access.isProtocolOwner || access.isShopOwner || access.rolesMask !== 0) {
            window.location.hash = `#/shop-console?shopId=${shopId.toString()}`;
          }
        }
      }),
      accessOut
    ])
  );

  const refreshAccess = async () => {
    const shopId = BigInt(val("shopIdAccess"));
    const actor = getAddress(connectedAddress);
    const access = await getShopAccess({ shopId, actor });
    accessOut.textContent = JSON.stringify(access, null, 2);
    return access;
  };
  const initialAccess = await refreshAccess();

  if (!initialAccess.isProtocolOwner && !initialAccess.isShopOwner && initialAccess.rolesMask === 0) {
    container.appendChild(
      el("div", {
        style: "color: #b91c1c;",
        text: "当前钱包在该 shopId 下没有权限：无法进入店主后台。请切换 shopId 或切换钱包后重试。"
      })
    );
    return;
  }

  const guardShop = ({ shopIdInputId, anyRolesMask = 0 }) => async (action) => {
    const shopId = BigInt(val(shopIdInputId));
    await requireShopAccess({ shopId, anyRolesMask });
    return action();
  };
  const guardItem = ({ itemIdInputId, anyRolesMask = 0 }) => async (action) => {
    const itemId = BigInt(val(itemIdInputId));
    await requireItemAccess({ itemId, anyRolesMask });
    return action();
  };

  container.appendChild(
    el("div", {}, [
      el("h3", { text: "Shop Roles" }),
      inputRow("shopId", "shopIdRole", "1"),
      inputRow("operator", "roleOperator"),
      el("div", {}, [
        el("label", {}, [el("input", { id: "roleShopAdmin", type: "checkbox" }), el("span", { text: " shop admin(1)" })])
      ]),
      el("div", {}, [
        el("label", {}, [
          el("input", { id: "roleItemMaintainer", type: "checkbox", checked: true }),
          el("span", { text: " item maintainer(2)" })
        ])
      ]),
      el("div", {}, [
        el("label", {}, [
          el("input", { id: "roleItemEditor", type: "checkbox", checked: true }),
          el("span", { text: " item editor(4)" })
        ])
      ]),
      el("div", {}, [
        el("label", {}, [
          el("input", { id: "roleItemActionEditor", type: "checkbox", checked: true }),
          el("span", { text: " item+action editor(8)" })
        ])
      ]),
      el("button", {
        text: "Set Roles",
        onclick: () =>
          guardShop({ shopIdInputId: "shopIdRole", anyRolesMask: SHOP_ROLE_SHOP_ADMIN })(() => setShopRolesTx()).catch(showTxError)
      })
    ])
  );

  const roleOperatorEl = document.getElementById("roleOperator");
  if (roleOperatorEl && !String(roleOperatorEl.value || "").trim() && connectedAddress) roleOperatorEl.value = connectedAddress;

  container.appendChild(el("hr"));

  container.appendChild(
    el("div", {}, [
      el("h3", { text: "Register Shop" }),
      inputRow("treasury", "shopTreasury"),
      inputRow("metadataHash(bytes32)", "shopMetadataHash", "0x" + "0".repeat(64)),
      el("button", { text: "Register", onclick: () => registerShop().catch(showTxError) })
    ])
  );

  const shopTreasuryEl = document.getElementById("shopTreasury");
  if (shopTreasuryEl && !String(shopTreasuryEl.value || "").trim() && connectedAddress) shopTreasuryEl.value = connectedAddress;

  container.appendChild(el("hr"));

  container.appendChild(
    el("div", {}, [
      el("h3", { text: "Update Shop" }),
      inputRow("shopId", "shopIdUpdateShop", "1"),
      inputRow("treasury", "shopTreasuryUpdateShop"),
      inputRow("metadataHash(bytes32)", "shopMetadataHashUpdateShop", "0x" + "0".repeat(64)),
      el("button", {
        text: "Update",
        onclick: () =>
          guardShop({ shopIdInputId: "shopIdUpdateShop", anyRolesMask: SHOP_ROLE_SHOP_ADMIN })(() => updateShopTx()).catch(showTxError)
      })
    ])
  );

  container.appendChild(el("hr"));

  container.appendChild(
    el("div", {}, [
      el("h3", { text: "Pause Shop (shop admin or protocol governance)" }),
      inputRow("shopId", "shopIdPause", "1"),
      inputRow("paused(true|false)", "shopPaused", "true"),
      el("button", {
        text: "Set",
        onclick: () =>
          guardShop({ shopIdInputId: "shopIdPause", anyRolesMask: SHOP_ROLE_SHOP_ADMIN })(() => setShopPausedTx()).catch(showTxError)
      })
    ])
  );

  container.appendChild(el("hr"));

  container.appendChild(
    el("div", {}, [
      el("h3", { text: "Item Active (maintainer)" }),
      inputRow("itemId", "itemIdActive", "1"),
      inputRow("active(true|false)", "itemActive", "true"),
      el("button", {
        text: "Set Active",
        onclick: () =>
          guardItem({ itemIdInputId: "itemIdActive", anyRolesMask: SHOP_ROLE_SHOP_ADMIN | SHOP_ROLE_ITEM_MAINTAINER })(
            () => setItemActiveTx()
          ).catch(showTxError)
      })
    ])
  );

  container.appendChild(el("hr"));

  container.appendChild(
    el("div", {}, [
      el("h3", { text: "Update Item (basic)" }),
      inputRow("itemId", "itemIdUpdate", "1"),
      inputRow("payToken", "payTokenUpdate"),
      inputRow("unitPrice", "unitPriceUpdate", "1000"),
      inputRow("nftContract", "nftContractUpdate"),
      inputRow("soulbound(true|false)", "soulboundUpdate", "true"),
      inputRow("tokenURI", "tokenURIUpdate", "ipfs://token"),
      inputRow("requiresSerial(true|false)", "requiresSerialUpdate", "true"),
      el("button", {
        text: "Update Item",
        onclick: () =>
          guardItem({ itemIdInputId: "itemIdUpdate", anyRolesMask: SHOP_ROLE_SHOP_ADMIN | SHOP_ROLE_ITEM_EDITOR | SHOP_ROLE_ITEM_ACTION_EDITOR })(
            () => updateItemTx()
          ).catch(showTxError)
      })
    ])
  );

  container.appendChild(el("hr"));

  container.appendChild(
    el("div", {}, [
      el("h3", { text: "Update Item Action (action editor)" }),
      inputRow("itemId", "itemIdUpdateAction", "1"),
      inputRow("action", "actionUpdate", "0x0000000000000000000000000000000000000000"),
      inputRow("actionData(hex)", "actionDataUpdate", "0x"),
      el("button", {
        text: "Update Action",
        onclick: () =>
          guardItem({ itemIdInputId: "itemIdUpdateAction", anyRolesMask: SHOP_ROLE_SHOP_ADMIN | SHOP_ROLE_ITEM_ACTION_EDITOR })(() =>
            updateItemActionTx()
          ).catch(showTxError)
      })
    ])
  );

  container.appendChild(el("hr"));

  container.appendChild(
    el("div", {}, [
      el("h3", { text: "Item Page (versioned)" }),
      inputRow("itemId", "itemIdPage", "1"),
      inputRow("uri", "pageUri", "https://example.com"),
      inputRow("contentHash(bytes32 optional)", "pageHash", "0x" + "0".repeat(64)),
      el("button", {
        text: "Add Page Version",
        onclick: () =>
          guardItem({ itemIdInputId: "itemIdPage", anyRolesMask: SHOP_ROLE_SHOP_ADMIN | SHOP_ROLE_ITEM_EDITOR | SHOP_ROLE_ITEM_ACTION_EDITOR })(() =>
            addItemPageTx()
          ).catch(showTxError)
      }),
      el("h4", { text: "Default Page" }),
      inputRow("itemId", "itemIdDefaultPage", "1"),
      inputRow("version", "defaultPageVersion", "1"),
      el("button", {
        text: "Set Default",
        onclick: () =>
          guardItem({
            itemIdInputId: "itemIdDefaultPage",
            anyRolesMask: SHOP_ROLE_SHOP_ADMIN | SHOP_ROLE_ITEM_EDITOR | SHOP_ROLE_ITEM_ACTION_EDITOR
          })(() => setDefaultItemPageTx()).catch(showTxError)
      })
    ])
  );

  container.appendChild(el("hr"));

  container.appendChild(
    el("div", {}, [
      el("h3", { text: "Add Item" }),
      inputRow("shopId", "shopIdAdd", "1"),
      inputRow("payToken", "payToken"),
      inputRow("unitPrice", "unitPrice", "1000"),
      inputRow("nftContract", "nftContract"),
      inputRow("soulbound(true|false)", "soulbound", "true"),
      inputRow("tokenURI", "tokenURI", "ipfs://token"),
      inputRow("action(optional)", "action", "0x0000000000000000000000000000000000000000"),
      inputRow("actionData(hex)", "actionData", "0x"),
      inputRow("requiresSerial(true|false)", "requiresSerial", "true"),
      el("h4", { text: "Risk Allowance (optional)" }),
      inputRow("shopOwner", "riskShopOwner"),
      inputRow("maxItems", "maxItems", "10"),
      inputRow("deadline(ts)", "riskDeadline", String(Math.floor(Date.now() / 1000) + 3600)),
      inputRow("nonce(auto fill)", "riskNonce", ""),
      inputRow("signature(auto fill)", "riskSig", "0x"),
      el("button", { text: "Fetch Risk Sig", onclick: () => fetchRiskSig().catch(showTxError) }),
      el("button", {
        text: "Add",
        onclick: () =>
          guardShop({
            shopIdInputId: "shopIdAdd",
            anyRolesMask:
              SHOP_ROLE_SHOP_ADMIN | SHOP_ROLE_ITEM_MAINTAINER | SHOP_ROLE_ITEM_EDITOR | SHOP_ROLE_ITEM_ACTION_EDITOR
          })(() => addItem()).catch(showTxError)
      })
    ])
  );

  container.appendChild(el("hr"));

  container.appendChild(
    el("div", {}, [
      el("h3", { text: "Backup / Restore Items" }),
      inputRow("shopId", "shopIdExport", "1"),
      el("button", {
        text: "Export Shop Items (json)",
        onclick: () => exportShopItemsTx().catch(showTxError)
      }),
      el("h4", { text: "Import (paste json)" }),
      el("textarea", { id: "importJson", rows: "8", style: "width: 100%;", placeholder: "{...}" }),
      el("button", {
        text: "Import Items",
        onclick: () =>
          guardShop({
            shopIdInputId: "shopIdExport",
            anyRolesMask:
              SHOP_ROLE_SHOP_ADMIN | SHOP_ROLE_ITEM_MAINTAINER | SHOP_ROLE_ITEM_EDITOR | SHOP_ROLE_ITEM_ACTION_EDITOR
          })(() => importShopItemsTx()).catch(showTxError)
      })
    ])
  );
}

async function renderProtocolConsole(container, { canWrite }) {
  container.appendChild(el("h2", { text: "协议后台（Protocol）" }));
  if (!canWrite) container.appendChild(el("div", { text: "提示：当前钱包不是协议 owner，仍可 Read，但写操作会被禁用。" }));

  container.appendChild(
    el("div", {}, [
      el("h3", { text: "MyShops（协议参数）" }),
      el("button", { text: "Read", onclick: () => readProtocolConfig().catch(showTxError) }),
      el("pre", { id: "platformOut" }),
      inputRow("registry", "platformRegistry"),
      el("button", { text: "Set Registry", disabled: !canWrite, onclick: () => setRegistryTx().catch(showTxError) }),
      inputRow("platformTreasury", "platformTreasury"),
      el("button", { text: "Set Protocol Treasury", disabled: !canWrite, onclick: () => setProtocolTreasuryTx().catch(showTxError) }),
      inputRow("listingFeeToken", "platformListingFeeToken"),
      inputRow("listingFeeAmount(uint256)", "platformListingFeeAmount", "0"),
      el("button", { text: "Set Listing Fee", disabled: !canWrite, onclick: () => setListingFeeTx().catch(showTxError) }),
      inputRow("protocolFeeBps(uint16)", "platformFeeBps", "100"),
      el("button", { text: "Set Protocol Fee", disabled: !canWrite, onclick: () => setProtocolFeeTx().catch(showTxError) }),
      inputRow("newOwner", "shopsNewOwner"),
      el("button", {
        text: "Transfer MyShops Ownership",
        disabled: !canWrite,
        onclick: () => transferShopsOwnershipTx().catch(showTxError)
      })
    ])
  );

  container.appendChild(el("hr"));

  container.appendChild(
    el("div", {}, [
      el("h3", { text: "MyShopItems Config" }),
      el("button", { text: "Read", onclick: () => readItemsConfig().catch(showTxError) }),
      el("pre", { id: "itemsOut" }),
      inputRow("riskSigner", "itemsRiskSigner"),
      el("button", { text: "Set Risk Signer", disabled: !canWrite, onclick: () => setRiskSignerTx().catch(showTxError) }),
      inputRow("serialSigner", "itemsSerialSigner"),
      el("button", { text: "Set Serial Signer", disabled: !canWrite, onclick: () => setSerialSignerTx().catch(showTxError) }),
      inputRow("action", "itemsActionAddress"),
      inputRow("allowed(true|false)", "itemsActionAllowed", "true"),
      el("button", { text: "Set Action Allowed", disabled: !canWrite, onclick: () => setActionAllowedTx().catch(showTxError) }),
      inputRow("newOwner", "itemsNewOwner"),
      el("button", {
        text: "Transfer MyShopItems Ownership",
        disabled: !canWrite,
        onclick: () => transferItemsOwnershipTx().catch(showTxError)
      })
    ])
  );
}

function getCurrentCfgValue(id) {
  const node = document.getElementById(id);
  const v = node ? String(node.value || "").trim() : "";
  if (v) return v;
  return runtimeCfg[id] ? String(runtimeCfg[id]) : "";
}

async function getProtocolOwners() {
  const myshop = createMyShopReadClient({
    publicClient,
    shopsAddress: getCurrentCfgValue("shopsAddress"),
    itemsAddress: getCurrentCfgValue("itemsAddress")
  });
  return myshop.getProtocolOwners();
}

async function getShopAccess({ shopId, actor }) {
  requireAddress(getCurrentCfgValue("shopsAddress"), "shopsAddress");
  const myshop = createMyShopReadClient({
    publicClient,
    shopsAddress: getCurrentCfgValue("shopsAddress"),
    itemsAddress: getCurrentCfgValue("itemsAddress")
  });

  const owners = await myshop.getProtocolOwners();
  const shopOwner = await myshop.getShopOwner(shopId);
  const rolesMask = await myshop.getShopRolesMask(shopId, actor);
  const isProtocolOwner = myshop.isProtocolOwner(owners, actor);
  const isShopOwner = shopOwner === actor;

  return { isProtocolOwner, isShopOwner, rolesMask, shopOwner };
}

async function requireShopAccess({ shopId, anyRolesMask = 0, allowProtocolOwner = true, allowShopOwner = true }) {
  if (!connectedAddress) throw new Error("请先连接钱包");
  const actor = getAddress(connectedAddress);
  const access = await getShopAccess({ shopId, actor });
  if (allowProtocolOwner && access.isProtocolOwner) return;
  if (allowShopOwner && access.isShopOwner) return;
  if (anyRolesMask && (access.rolesMask & anyRolesMask) !== 0) return;
  throw new Error("无权限：该操作需要对应角色（shopRoles）或 shop owner / protocol owner");
}

async function getItemShopId(itemId) {
  const itemsAddressVal = requireAddress(getCurrentCfgValue("itemsAddress"), "itemsAddress");
  const item = await publicClient.readContract({
    address: itemsAddressVal,
    abi: myShopItemsAbi,
    functionName: "items",
    args: [itemId]
  });
  return BigInt(pick(item, "shopId", 0));
}

async function requireItemAccess({ itemId, anyRolesMask = 0, allowProtocolOwner = true, allowShopOwner = true }) {
  const shopId = await getItemShopId(itemId);
  return requireShopAccess({ shopId, anyRolesMask, allowProtocolOwner, allowShopOwner });
}

function renderWalletRequired(container, { title, required }) {
  container.appendChild(el("h2", { text: title }));
  container.appendChild(el("div", { text: `需要连接钱包：${required}` }));
  container.appendChild(el("div", { text: "请先点击顶部 Connect Wallet，然后重试。" }));
}

function renderRoleRequired(container, { title, required }) {
  container.appendChild(el("h2", { text: title }));
  container.appendChild(el("div", { text: `需要权限：${required}` }));
  container.appendChild(el("div", { text: "建议：先打开「角色」页面，选择 shopId 做一次 Access Check。" }));
}

async function renderConfig(container) {
  container.appendChild(el("h2", { text: "配置（Config）" }));

  container.appendChild(
    el("div", {}, [
      inputRow("RPC URL", "rpcUrl"),
      inputRow("CHAIN_ID", "chainId"),
      inputRow("SHOPS_ADDRESS", "shopsAddress"),
      inputRow("ITEMS_ADDRESS", "itemsAddress"),
      inputRow("WORKER_URL (permit)", "workerUrl"),
      inputRow("WORKER_API_URL (query)", "workerApiUrl"),
      el("button", {
        text: "Fill from env",
        onclick: () => {
          document.getElementById("rpcUrl").value = envCfg.rpcUrl || "";
          document.getElementById("chainId").value = envCfg.chainId ? String(envCfg.chainId) : "";
          document.getElementById("shopsAddress").value = envCfg.shopsAddress || "";
          document.getElementById("itemsAddress").value = envCfg.itemsAddress || "";
          document.getElementById("workerUrl").value = envCfg.workerUrl || "";
          document.getElementById("workerApiUrl").value = envCfg.workerApiUrl || "";
        }
      }),
      el("button", {
        text: "Fill from current",
        onclick: () => {
          document.getElementById("rpcUrl").value = runtimeCfg.rpcUrl || "";
          document.getElementById("chainId").value = runtimeCfg.chainId ? String(runtimeCfg.chainId) : "";
          document.getElementById("shopsAddress").value = runtimeCfg.shopsAddress || "";
          document.getElementById("itemsAddress").value = runtimeCfg.itemsAddress || "";
          document.getElementById("workerUrl").value = runtimeCfg.workerUrl || "";
          document.getElementById("workerApiUrl").value = runtimeCfg.workerApiUrl || "";
        }
      }),
      el("button", { text: "Load from Worker /config", onclick: () => loadConfigFromWorker().catch(showTxError) }),
      el("button", { text: "Save & Apply", onclick: () => applyConfigFromInputs() })
    ])
  );

  document.getElementById("rpcUrl").value = runtimeCfg.rpcUrl || "";
  document.getElementById("chainId").value = runtimeCfg.chainId ? String(runtimeCfg.chainId) : "";
  document.getElementById("shopsAddress").value = runtimeCfg.shopsAddress || "";
  document.getElementById("itemsAddress").value = runtimeCfg.itemsAddress || "";
  document.getElementById("workerUrl").value = runtimeCfg.workerUrl || "";
  document.getElementById("workerApiUrl").value = runtimeCfg.workerApiUrl || "";
}

async function renderRolesPage(container, query = {}) {
  container.appendChild(el("h2", { text: "角色与权限（Roles）" }));
  container.appendChild(el("div", { text: "用于确认：你是谁（protocol owner / shop owner / shopRoles）以及你能做什么。" }));

  container.appendChild(
    el("div", {}, [
      el("h3", { text: "页面 IA（Information Architecture）" }),
      el("div", { text: "广场：所有人可访问；买家：需要钱包；店主后台：需要 shop owner / operator；协议后台：需要 protocol owner。" })
    ])
  );

  const out = el("pre", { id: "rolesOut" });
  container.appendChild(
    el("div", {}, [
      inputRow("shopId", "rolesShopId", query.shopId || "1"),
      el("button", { text: "Check", onclick: () => load().catch(showTxError) }),
      out
    ])
  );

  async function load() {
    if (!connectedAddress) throw new Error("请先连接钱包");
    const shopId = BigInt(val("rolesShopId"));
    const actor = getAddress(connectedAddress);
    const owners = await getProtocolOwners();
    const access = await getShopAccess({ shopId, actor });
    const roles = decodeShopRoles(access.rolesMask);
    const pageAccess = {
      plaza: true,
      buyer: !!connectedAddress,
      purchases: true,
      roles: !!connectedAddress,
      shopConsole: access.isProtocolOwner || access.isShopOwner || access.rolesMask !== 0,
      protocolConsole: access.isProtocolOwner
    };

    out.textContent = JSON.stringify(
      {
        actor,
        protocolOwners: owners,
        shopId: shopId.toString(),
        shopOwner: access.shopOwner,
        isProtocolOwner: access.isProtocolOwner,
        isShopOwner: access.isShopOwner,
        rolesMask: access.rolesMask,
        roles,
        pageAccess,
        recommendedEntry: access.isProtocolOwner ? "protocol-console" : access.isShopOwner || roles.length ? "shop-console" : "buyer"
      },
      null,
      2
    );
  }

  await load();
}

async function renderDiagnostics(container) {
  container.appendChild(el("h2", { text: "诊断（Diagnostics）" }));

  const cfgBox = el("div", { id: "diagCfg" });
  const out = el("pre", { id: "diagOut" });
  container.appendChild(cfgBox);
  container.appendChild(
    el("div", {}, [
      el("button", { text: "Check RPC", onclick: () => checkRpc().catch(showTxError) }),
      el("button", { text: "Check Worker (permit)", style: "margin-left: 8px;", onclick: () => checkWorkerPermit().catch(showTxError) }),
      el("button", { text: "Check Worker API (query)", style: "margin-left: 8px;", onclick: () => checkWorkerApi().catch(showTxError) }),
      el("button", { text: "Open Config", style: "margin-left: 8px;", onclick: () => (window.location.hash = "#/config") })
    ])
  );
  container.appendChild(out);

  function write(obj) {
    out.textContent = JSON.stringify(obj, null, 2);
  }

  function currentCfgSnapshot() {
    return {
      rpcUrl: getCurrentCfgValue("rpcUrl"),
      chainId: getCurrentCfgValue("chainId"),
      shopsAddress: getCurrentCfgValue("shopsAddress"),
      itemsAddress: getCurrentCfgValue("itemsAddress"),
      workerUrl: getCurrentCfgValue("workerUrl"),
      workerApiUrl: getCurrentCfgValue("workerApiUrl")
    };
  }

  function renderCfg() {
    const c = currentCfgSnapshot();
    cfgBox.innerHTML = "";
    cfgBox.appendChild(el("div", { text: `rpcUrl=${c.rpcUrl || ""}` }));
    cfgBox.appendChild(el("div", { text: `chainId=${c.chainId || ""}` }));
    cfgBox.appendChild(el("div", { text: `shopsAddress=${c.shopsAddress || ""}` }));
    cfgBox.appendChild(el("div", { text: `itemsAddress=${c.itemsAddress || ""}` }));
    cfgBox.appendChild(el("div", { text: `workerUrl=${c.workerUrl || ""}` }));
    cfgBox.appendChild(el("div", { text: `workerApiUrl=${c.workerApiUrl || ""}` }));
  }

  async function safeHttpGet(baseUrl, path) {
    const base = normalizeBaseUrl(baseUrl);
    if (!base) throw new Error("base url is empty");
    const url = new URL(path, base);
    return fetchJson(url.toString());
  }

  async function checkRpc() {
    setText("txOut", "diagnostics: checking rpc...");
    const latest = await publicClient.getBlockNumber();
    write({
      ok: true,
      kind: "rpc",
      chainId: chain.id,
      latestBlock: latest.toString(),
      mismatch: getChainMismatch()
    });
    setText("txOut", "diagnostics: rpc ok");
  }

  async function checkWorkerPermit() {
    setText("txOut", "diagnostics: checking worker (permit)...");
    const base = getPermitBaseUrl();
    const health = await safeHttpGet(base, "/health");
    write({
      ok: true,
      kind: "worker_permit",
      baseUrl: base,
      health
    });
    setText("txOut", "diagnostics: worker (permit) ok");
  }

  async function checkWorkerApi() {
    setText("txOut", "diagnostics: checking worker api (query)...");
    const base = getApiBaseUrl();
    const health = await safeHttpGet(base, "/health");
    const config = await safeHttpGet(base, "/config");
    const indexer = await safeHttpGet(base, "/indexer");
    write({
      ok: true,
      kind: "worker_api",
      baseUrl: base,
      health,
      config,
      indexer
    });
    setText("txOut", "diagnostics: worker api ok");
  }

  renderCfg();
  await checkRpc();
}

function render() {
  const app = document.getElementById("app");
  app.innerHTML = "";

  const mismatch = getChainMismatch();
  const header = el("div", {}, [
    el("h1", { text: "MyShop Plaza" }),
    el("button", { text: "Connect Wallet", onclick: () => connect().catch(showTxError) }),
    el("div", { id: "conn", text: connectedAddress ? `connected: ${connectedAddress}` : "not connected" }),
    el("div", { id: "roleSummary", text: "" }),
    el("div", { id: "serviceSummary", text: "" }),
    mismatch
      ? el("div", {
          style: "color: #b45309;",
          text: `Chain mismatch: walletChainId=${mismatch.walletChainId} expectedChainId=${mismatch.expectedChainId}`
        })
      : null,
    el("div", {}, [
      navLink("广场", "#/plaza"),
      navLink("买家", "#/buyer"),
      navLink("购买记录", "#/purchases"),
      navLink("角色", "#/roles"),
      navLink("店主后台", "#/shop-console"),
      navLinkWithId("navProtocolConsole", "协议后台", "#/protocol-console"),
      navLink("诊断", "#/diag"),
      navLink("配置", "#/config")
    ])
  ]);
  app.appendChild(header);
  app.appendChild(el("hr"));

  const main = el("div", { id: "main" });
  app.appendChild(main);
  app.appendChild(el("hr"));
  app.appendChild(el("div", { id: "txPanel" }));
  app.appendChild(el("pre", { id: "txOut" }));
  updateTxPanel();

  const route = getRoute();

  (async () => {
    try {
      if (connectedAddress) {
        try {
          const owners = await getProtocolOwners();
          const addr = getAddress(connectedAddress);
          const isProtocolOwner =
            (owners.shopsOwner && owners.shopsOwner === addr) || (owners.itemsOwner && owners.itemsOwner === addr);
          setText("roleSummary", isProtocolOwner ? "role=protocolOwner" : "role=walletConnected");
          const navProtocol = document.getElementById("navProtocolConsole");
          if (navProtocol) navProtocol.style.display = isProtocolOwner ? "" : "none";
        } catch {
          setText("roleSummary", "role=walletConnected");
          const navProtocol = document.getElementById("navProtocolConsole");
          if (navProtocol) navProtocol.style.display = "none";
        }
      } else {
        setText("roleSummary", "");
        const navProtocol = document.getElementById("navProtocolConsole");
        if (navProtocol) navProtocol.style.display = "none";
      }

      const now = Date.now();
      const shouldRefreshService = now - lastServiceCheckAtMs > 5000;
      if (lastServiceStatusText) setText("serviceSummary", lastServiceStatusText);
      if (shouldRefreshService) {
        lastServiceCheckAtMs = now;
        (async () => {
          const parts = [];
          const permitBase = getPermitBaseUrl();
          const apiBase = getApiBaseUrl();

          if (permitBase) {
            try {
              await fetchJsonWithTimeout(new URL("/health", permitBase).toString(), 1500);
              parts.push("permit=ok");
            } catch {
              parts.push("permit=down");
            }
          } else {
            parts.push("permit=unset");
          }

          if (apiBase) {
            try {
              await fetchJsonWithTimeout(new URL("/health", apiBase).toString(), 1500);
              parts.push("api=ok");
            } catch {
              parts.push("api=down");
            }
          } else {
            parts.push("api=unset");
          }

          lastServiceStatusText = parts.join(" ");
          setText("serviceSummary", lastServiceStatusText);
        })();
      }

      if (route.parts.length === 0 || route.parts[0] === "plaza") {
        await renderPlaza(main);
        return;
      }
      if (route.parts[0] === "shop" && route.parts[1]) {
        await renderShopDetail(main, route.parts[1]);
        return;
      }
      if (route.parts[0] === "item" && route.parts[1]) {
        await renderItemDetail(main, route.parts[1]);
        return;
      }
      if (route.parts[0] === "purchases") {
        await renderPurchasesPage(main, route.query);
        return;
      }
      if (route.parts[0] === "buyer") {
        if (route.query.itemId) routeState.buyerItemId = String(route.query.itemId);
        await renderBuyer(main);
        return;
      }
      if (route.parts[0] === "roles") {
        if (!connectedAddress) {
          renderWalletRequired(main, { title: "角色与权限（Roles）", required: "any wallet" });
          return;
        }
        await renderRolesPage(main, route.query);
        return;
      }
      if (route.parts[0] === "shop-console") {
        if (!connectedAddress) {
          renderWalletRequired(main, { title: "店主/运营后台（Shop Owner / Operator）", required: "shop owner / operator" });
          return;
        }
        await renderShopConsole(main, route.query);
        return;
      }
      if (route.parts[0] === "protocol-console") {
        if (!connectedAddress) {
          renderWalletRequired(main, { title: "协议后台（Protocol）", required: "protocol owner" });
          return;
        }
        let canWrite = false;
        try {
          const owners = await getProtocolOwners();
          const addr = getAddress(connectedAddress);
          canWrite =
            (owners.shopsOwner && owners.shopsOwner === addr) || (owners.itemsOwner && owners.itemsOwner === addr);
        } catch {
          canWrite = false;
        }
        if (!canWrite) {
          renderRoleRequired(main, { title: "协议后台（Protocol）", required: "protocol owner" });
          return;
        }
        await renderProtocolConsole(main, { canWrite });
        return;
      }
      if (route.parts[0] === "config") {
        await renderConfig(main);
        return;
      }
      if (route.parts[0] === "diag") {
        await renderDiagnostics(main);
        return;
      }
      window.location.hash = "#/plaza";
    } catch (e) {
      showTxError(e);
    }
  })();
}

window.addEventListener("hashchange", render);
render();
