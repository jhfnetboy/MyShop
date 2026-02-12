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
      el("pre", { id: "itemOut" }),
      el("div", { id: "itemMetaOut" })
    ])
  );

  app.appendChild(el("hr"));

  app.appendChild(
    el("div", {}, [
      el("h2", { text: "Shop Roles" }),
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
      el("button", { text: "Set Roles", onclick: () => setShopRolesTx().catch((e) => setText("txOut", String(e))) })
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
      el("h2", { text: "Update Item (basic)" }),
      inputRow("itemId", "itemIdUpdate", "1"),
      inputRow("payToken", "payTokenUpdate"),
      inputRow("unitPrice", "unitPriceUpdate", "1000"),
      inputRow("nftContract", "nftContractUpdate"),
      inputRow("soulbound(true|false)", "soulboundUpdate", "true"),
      inputRow("tokenURI", "tokenURIUpdate", "ipfs://token"),
      inputRow("requiresSerial(true|false)", "requiresSerialUpdate", "true"),
      el("button", { text: "Update Item", onclick: () => updateItemTx().catch((e) => setText("txOut", String(e))) })
    ])
  );

  app.appendChild(el("hr"));

  app.appendChild(
    el("div", {}, [
      el("h2", { text: "Update Item Action" }),
      inputRow("itemId", "itemIdUpdateAction", "1"),
      inputRow("action", "actionUpdate", "0x0000000000000000000000000000000000000000"),
      inputRow("actionData(hex)", "actionDataUpdate", "0x"),
      el("button", {
        text: "Update Action",
        onclick: () => updateItemActionTx().catch((e) => setText("txOut", String(e)))
      })
    ])
  );

  app.appendChild(el("hr"));

  app.appendChild(
    el("div", {}, [
      el("h2", { text: "Item Page (versioned)" }),
      inputRow("itemId", "itemIdPage", "1"),
      inputRow("uri", "pageUri", "https://example.com"),
      inputRow("contentHash(bytes32 optional)", "pageHash", "0x" + "0".repeat(64)),
      el("button", {
        text: "Add Page Version",
        onclick: () => addItemPageTx().catch((e) => setText("txOut", String(e)))
      }),
      el("h3", { text: "Default Page" }),
      inputRow("itemId", "itemIdDefaultPage", "1"),
      inputRow("version", "defaultPageVersion", "1"),
      el("button", {
        text: "Set Default",
        onclick: () => setDefaultItemPageTx().catch((e) => setText("txOut", String(e)))
      })
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
      el("h2", { text: "Backup / Restore Items" }),
      inputRow("shopId", "shopIdExport", "1"),
      el("button", {
        text: "Export Shop Items (json)",
        onclick: () => exportShopItemsTx().catch((e) => setText("txOut", String(e)))
      }),
      el("h3", { text: "Import (paste json)" }),
      el("textarea", { id: "importJson", rows: "8", style: "width: 100%;", placeholder: "{...}" }),
      el("button", { text: "Import Items", onclick: () => importShopItemsTx().catch((e) => setText("txOut", String(e))) })
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
