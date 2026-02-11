import { createPublicClient, createWalletClient, custom, getAddress, http, isAddress, parseEther } from "viem";

import { loadConfig } from "./config.js";
import { erc20Abi, myShopItemsAbi, myShopsAbi } from "./contracts.js";

const cfg = loadConfig();

const chain = {
  id: cfg.chainId || 31337,
  name: "custom",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [cfg.rpcUrl || "http://127.0.0.1:8545"] } }
};

const publicClient = createPublicClient({
  chain,
  transport: http(cfg.rpcUrl || "http://127.0.0.1:8545")
});

let walletClient = null;
let connectedAddress = null;

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2).toLowerCase(), v);
    else node.setAttribute(k, v);
  }
  for (const child of children) node.appendChild(child);
  return node;
}

function inputRow(label, id, placeholder = "") {
  const input = el("input", { id, placeholder });
  return el("div", {}, [el("label", { for: id, text: label }), input]);
}

function val(id) {
  return document.getElementById(id).value.trim();
}

function setText(id, text) {
  document.getElementById(id).textContent = text;
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

async function connect() {
  if (!window.ethereum) throw new Error("Missing window.ethereum");
  walletClient = createWalletClient({
    chain,
    transport: custom(window.ethereum)
  });
  const [addr] = await walletClient.requestAddresses();
  connectedAddress = getAddress(addr);
  setText("conn", `connected: ${connectedAddress}`);
}

async function readShop() {
  const shopId = BigInt(val("shopIdRead"));
  const shopsAddress = requireAddress(val("shopsAddress"), "shopsAddress");
  const shop = await publicClient.readContract({
    address: shopsAddress,
    abi: myShopsAbi,
    functionName: "shops",
    args: [shopId]
  });
  setText("shopOut", JSON.stringify(shop, null, 2));
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
  const workerUrl = val("workerUrl");
  if (!workerUrl) throw new Error("workerUrl is required");
  const shopOwner = requireAddress(val("riskShopOwner"), "riskShopOwner");
  const maxItems = val("maxItems");
  const deadline = val("riskDeadline");
  const url = new URL("/risk-allowance", workerUrl);
  url.searchParams.set("shopOwner", shopOwner);
  url.searchParams.set("maxItems", maxItems);
  url.searchParams.set("deadline", deadline);
  const res = await fetch(url.toString());
  const json = await res.json();
  if (json.error) throw new Error(json.error);
  document.getElementById("riskNonce").value = json.nonce;
  document.getElementById("riskSig").value = json.signature;
  setText("txOut", "risk signature fetched");
}

async function fetchSerialExtraData() {
  const workerUrl = val("workerUrl");
  if (!workerUrl) throw new Error("workerUrl is required");
  const itemId = val("buyItemId");
  const buyer = requireAddress(val("buyBuyer"), "buyer");
  const serial = val("serial");
  const deadline = val("serialDeadline");
  const url = new URL("/serial-permit", workerUrl);
  url.searchParams.set("itemId", itemId);
  url.searchParams.set("buyer", buyer);
  if (serial) url.searchParams.set("serial", serial);
  url.searchParams.set("deadline", deadline);
  const res = await fetch(url.toString());
  const json = await res.json();
  if (json.error) throw new Error(json.error);
  document.getElementById("buyExtraData").value = json.extraData;
  setText("txOut", "serial extraData fetched");
}

async function approvePayToken() {
  if (!walletClient || !connectedAddress) throw new Error("connect wallet first");
  const itemsAddress = requireAddress(val("itemsAddress"), "itemsAddress");
  const payToken = requireAddress(val("buyPayToken"), "buyPayToken");
  const amount = BigInt(val("buyApproveAmount") || "0");
  const hash = await walletClient.writeContract({
    address: payToken,
    abi: erc20Abi,
    functionName: "approve",
    args: [itemsAddress, amount],
    account: connectedAddress
  });
  setText("txOut", `approve tx: ${hash}`);
}

async function buy() {
  if (!walletClient || !connectedAddress) throw new Error("connect wallet first");
  const itemsAddress = requireAddress(val("itemsAddress"), "itemsAddress");
  const itemId = BigInt(val("buyItemId"));
  const quantity = BigInt(val("buyQty"));
  const recipient = requireAddress(val("buyRecipient"), "recipient");
  const extraData = requireHexBytes(val("buyExtraData"), "extraData");
  const ethValue = val("buyEthValue");

  const hash = await walletClient.writeContract({
    address: itemsAddress,
    abi: myShopItemsAbi,
    functionName: "buy",
    args: [itemId, quantity, recipient, extraData],
    account: connectedAddress,
    value: ethValue ? parseEther(ethValue) : undefined
  });
  setText("txOut", `buy tx: ${hash}`);
}

function render() {
  const app = document.getElementById("app");
  app.innerHTML = "";

  app.appendChild(
    el("div", {}, [
      el("h1", { text: "MyShop Frontend Demo" }),
      el("button", { text: "Connect Wallet", onclick: () => connect().catch((e) => setText("txOut", String(e))) }),
      el("div", { id: "conn", text: "not connected" })
    ])
  );

  app.appendChild(el("hr"));

  app.appendChild(
    el("div", {}, [
      el("h2", { text: "Config" }),
      inputRow("RPC URL", "rpcUrl"),
      inputRow("CHAIN_ID", "chainId"),
      inputRow("SHOPS_ADDRESS", "shopsAddress"),
      inputRow("ITEMS_ADDRESS", "itemsAddress"),
      inputRow("WORKER_URL", "workerUrl"),
      el("button", {
        text: "Fill from env",
        onclick: () => {
          document.getElementById("rpcUrl").value = cfg.rpcUrl || "";
          document.getElementById("chainId").value = cfg.chainId ? String(cfg.chainId) : "";
          document.getElementById("shopsAddress").value = cfg.shopsAddress || "";
          document.getElementById("itemsAddress").value = cfg.itemsAddress || "";
          document.getElementById("workerUrl").value = cfg.workerUrl || "";
        }
      })
    ])
  );

  app.appendChild(el("hr"));

  app.appendChild(
    el("div", {}, [
      el("h2", { text: "Read" }),
      inputRow("shopId", "shopIdRead", "1"),
      el("button", { text: "Read Shop", onclick: () => readShop().catch((e) => setText("txOut", String(e))) }),
      el("pre", { id: "shopOut" }),
      inputRow("itemId", "itemIdRead", "1"),
      el("button", { text: "Read Item", onclick: () => readItem().catch((e) => setText("txOut", String(e))) }),
      el("pre", { id: "itemOut" })
    ])
  );

  app.appendChild(el("hr"));

  app.appendChild(
    el("div", {}, [
      el("h2", { text: "Register Shop" }),
      inputRow("treasury", "shopTreasury"),
      inputRow("metadataHash(bytes32)", "shopMetadataHash", "0x" + "0".repeat(64)),
      el("button", { text: "Register", onclick: () => registerShop().catch((e) => setText("txOut", String(e))) })
    ])
  );

  app.appendChild(el("hr"));

  app.appendChild(
    el("div", {}, [
      el("h2", { text: "Add Item" }),
      inputRow("shopId", "shopIdAdd", "1"),
      inputRow("payToken", "payToken"),
      inputRow("unitPrice", "unitPrice", "1000"),
      inputRow("nftContract", "nftContract"),
      inputRow("soulbound(true|false)", "soulbound", "true"),
      inputRow("tokenURI", "tokenURI", "ipfs://token"),
      inputRow("action(optional)", "action", "0x0000000000000000000000000000000000000000"),
      inputRow("actionData(hex)", "actionData", "0x"),
      inputRow("requiresSerial(true|false)", "requiresSerial", "true"),
      el("h3", { text: "Risk Allowance (optional)" }),
      inputRow("shopOwner", "riskShopOwner"),
      inputRow("maxItems", "maxItems", "10"),
      inputRow("deadline(ts)", "riskDeadline", String(Math.floor(Date.now() / 1000) + 3600)),
      inputRow("nonce(auto fill)", "riskNonce", ""),
      inputRow("signature(auto fill)", "riskSig", "0x"),
      el("button", { text: "Fetch Risk Sig", onclick: () => fetchRiskSig().catch((e) => setText("txOut", String(e))) }),
      el("button", { text: "Add", onclick: () => addItem().catch((e) => setText("txOut", String(e))) })
    ])
  );

  app.appendChild(el("hr"));

  app.appendChild(
    el("div", {}, [
      el("h2", { text: "Buy" }),
      inputRow("itemId", "buyItemId", "1"),
      inputRow("qty", "buyQty", "1"),
      inputRow("recipient", "buyRecipient"),
      inputRow("buyer(for permit)", "buyBuyer"),
      inputRow("payToken(for approve)", "buyPayToken"),
      inputRow("approveAmount(uint256)", "buyApproveAmount", "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"),
      el("button", { text: "Approve", onclick: () => approvePayToken().catch((e) => setText("txOut", String(e))) }),
      el("h3", { text: "Serial Permit (optional)" }),
      inputRow("serial", "serial", "SERIAL-001"),
      inputRow("deadline(ts)", "serialDeadline", String(Math.floor(Date.now() / 1000) + 3600)),
      inputRow("extraData(hex)", "buyExtraData", "0x"),
      el("button", { text: "Fetch extraData", onclick: () => fetchSerialExtraData().catch((e) => setText("txOut", String(e))) }),
      inputRow("ethValue(optional)", "buyEthValue", ""),
      el("button", { text: "Buy", onclick: () => buy().catch((e) => setText("txOut", String(e))) })
    ])
  );

  app.appendChild(el("hr"));
  app.appendChild(el("pre", { id: "txOut" }));
}

render();

