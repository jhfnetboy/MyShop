import { expect, test } from "@playwright/test";
import { decodeAbiParameters, getAddress, parseAbiParameters, recoverTypedDataAddress } from "viem";

const storageKey = "myshop_frontend_config_v1";

function buildCfg() {
  return {
    rpcUrl: process.env.RPC_URL || "http://127.0.0.1:8545",
    chainId: process.env.CHAIN_ID ? Number(process.env.CHAIN_ID) : 31337,
    shopsAddress: process.env.SHOPS_ADDRESS || "0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9",
    itemsAddress: process.env.ITEMS_ADDRESS || "0x5FC8d32690cc91D4c39d9d3abcBD16989F875707",
    workerUrl: process.env.WORKER_URL || "http://127.0.0.1:8787",
    workerApiUrl: process.env.WORKER_API_URL || "http://127.0.0.1:8788"
  };
}

function demoItemId() {
  return process.env.ITEM_ID || "1";
}

function demoBuyerAddress() {
  return process.env.BUYER || "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
}

async function rpcCall(page, method, params = []) {
  const res = await page.request.post(buildCfg().rpcUrl, {
    data: { jsonrpc: "2.0", id: 1, method, params }
  });
  const json = await res.json();
  if (json?.error) {
    const err = new Error(json.error.message || "rpc error");
    err.code = json.error.code;
    err.data = json.error.data;
    throw err;
  }
  return json.result;
}

function decodeSerialExtraData(extraData) {
  const [serialHash, deadline, nonce, signature] = decodeAbiParameters(
    parseAbiParameters("bytes32 serialHash,uint256 deadline,uint256 nonce,bytes sig"),
    extraData
  );
  return { serialHash, deadline, nonce, signature };
}

async function getSerialSigner(page, cfgOverride = null) {
  const cfg = cfgOverride || buildCfg();
  const data = await rpcCall(page, "eth_call", [
    { to: cfg.itemsAddress, data: "0x39c3a998" },
    "latest"
  ]);
  const [addr] = decodeAbiParameters(parseAbiParameters("address"), data);
  return getAddress(addr);
}

async function setConfig(page, overrides = {}) {
  const cfg = { ...buildCfg(), ...overrides };
  await page.addInitScript(
    ([key, value]) => {
      localStorage.setItem(key, JSON.stringify(value));
    },
    [storageKey, cfg]
  );
}

async function installMockWallet(page, overrides = {}) {
  const cfg = { ...buildCfg(), ...overrides };
  const chainId = cfg.chainId;
  const rpcUrl = cfg.rpcUrl;
  const address = demoBuyerAddress();
  await page.addInitScript(
    ([rpcUrlInit, chainIdInit, addressInit]) => {
      let rpcId = 1;
      const listeners = new Map();
      const toChainIdHex = () => `0x${Number(chainIdInit).toString(16)}`;
      const request = async ({ method, params } = {}) => {
        if (method === "eth_chainId") return toChainIdHex();
        if (method === "eth_accounts") return [addressInit];
        if (method === "eth_requestAccounts") return [addressInit];
        if (
          (method === "eth_sendTransaction" || method === "eth_estimateGas") &&
          Array.isArray(params) &&
          params[0] &&
          typeof params[0] === "object"
        ) {
          params[0] = { from: addressInit, ...params[0] };
        }
        const res = await fetch(rpcUrlInit, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: rpcId++,
            method,
            params: Array.isArray(params) ? params : []
          })
        });
        const json = await res.json();
        if (json?.error) {
          const err = new Error(json.error.message || "rpc error");
          err.code = json.error.code;
          err.data = json.error.data;
          throw err;
        }
        return json.result;
      };
      const on = (event, handler) => {
        const key = String(event || "");
        if (!listeners.has(key)) listeners.set(key, new Set());
        listeners.get(key).add(handler);
      };
      const removeListener = (event, handler) => {
        const key = String(event || "");
        const set = listeners.get(key);
        if (!set) return;
        set.delete(handler);
      };
      window.ethereum = {
        isMyShopMock: true,
        request,
        on,
        removeListener
      };
    },
    [rpcUrl, chainId, address]
  );
}

function installErrorCapture(page) {
  if (page._myshopErrors) return;
  const errors = [];
  page.on("pageerror", (err) => {
    errors.push(`pageerror: ${String(err)}`);
  });
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      errors.push(`console: ${msg.text()}`);
    }
  });
  page._myshopErrors = errors;
}

function getCapturedErrors(page) {
  const errors = page._myshopErrors || [];
  return errors.slice(-10).join("\n");
}

async function requireWorkerApi(page) {
  try {
    await page.request.get(`${buildCfg().workerApiUrl}/health`, { timeout: 2000 });
  } catch {
    test.skip(true, "worker api not available (start ./scripts/regression_local.sh first)");
  }
}

async function requireRpc(page) {
  try {
    await rpcCall(page, "eth_blockNumber");
  } catch {
    test.skip(true, "rpc not available (start ./scripts/regression_local.sh first)");
  }
}

async function syncConfigFromWorker(page) {
  const res = await page.request.get(`${buildCfg().workerApiUrl}/config`);
  const json = await res.json();
  if (!json?.ok) throw new Error("invalid worker /config response");
  const base = buildCfg();
  const cfg = {
    ...base,
    rpcUrl: String(json.rpcUrl || ""),
    chainId: Number(json.chainId || 0),
    itemsAddress: String(json.itemsAddress || ""),
    shopsAddress: String(json.shopsAddress || "")
  };
  await setConfig(page, cfg);
  return cfg;
}

async function waitAppReady(page) {
  await expect(page.locator("#app")).toHaveCount(1);
  try {
    await expect(page.locator("h1")).toHaveText("MyShop Plaza");
    await expect(page.locator("#main")).toHaveCount(1);
  } catch (e) {
    const url = page.url();
    let title = "";
    try {
      title = await page.title();
    } catch {
      title = "";
    }
    let html = "";
    try {
      html = (await page.content()).slice(0, 600);
    } catch {
      html = "";
    }
    const captured = getCapturedErrors(page);
    throw new Error(
      `app did not render (url=${url} title=${title})\n${captured}\n${html}\n${String(e)}`
    );
  }
}

async function gotoHash(page, hash) {
  installErrorCapture(page);
  await page.goto("/");
  await waitAppReady(page);
  await page.evaluate((h) => {
    window.location.hash = h;
  }, hash);
}

async function installOkHealthRoutes(page) {
  await page.route("**/health", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true })
    });
  });
}

test("diagnostics page renders and can check rpc", async ({ page }) => {
  await setConfig(page);

  await requireWorkerApi(page);

  await gotoHash(page, "#/diag");
  await expect(page.getByText("诊断（Diagnostics）")).toBeVisible();
  await expect(page.locator("#diagOut")).toContainText('"kind": "rpc"');
});

test("plaza and purchases pages render", async ({ page }) => {
  await setConfig(page);

  await requireWorkerApi(page);

  await gotoHash(page, "#/plaza");
  await expect(page.getByText("广场（All Shops）")).toBeVisible();
  await expect(page.getByText(/Shops \(/)).toBeVisible();

  await gotoHash(page, "#/purchases");
  await expect(page.getByText("购买记录（Purchases）")).toBeVisible();
  await page.getByRole("button", { name: "Mine" }).click();
  await expect(page.locator("#txOut")).toContainText("[WalletRequired]");
  await page.getByRole("button", { name: "Load" }).click();
  await expect(page.locator("#purchasesMeta")).toContainText("count=");
});

test("purchases proof toggle renders", async ({ page }) => {
  await setConfig(page);
  await installOkHealthRoutes(page);

  await page.route("**/purchases**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        source: "index",
        count: 1,
        fromBlock: 1,
        toBlock: 1,
        indexedToBlock: 1,
        purchases: [
          {
            chainId: 31337,
            txHash: "0x" + "1".repeat(64),
            logIndex: 0,
            blockNumber: 1,
            itemId: "1",
            shopId: "1",
            buyer: "0x0000000000000000000000000000000000000001",
            recipient: "0x0000000000000000000000000000000000000002",
            quantity: "1",
            payToken: "0x0000000000000000000000000000000000000000",
            payAmount: "0",
            platformFeeAmount: "0",
            serialHash: "0x" + "0".repeat(64),
            firstTokenId: "1"
          }
        ]
      })
    });
  });

  await gotoHash(page, "#/purchases");
  await expect(page.getByText("购买记录（Purchases）")).toBeVisible();
  await page.getByRole("button", { name: "Load" }).click();
  await expect(page.locator("#purchasesList")).toContainText("item=#1");
  await page.getByRole("button", { name: "Proof" }).click();
  await expect(page.locator("#purchasesList")).toContainText('"kind": "MyShopPurchaseProof"');
});

test("shop console shows wallet-required gating", async ({ page }) => {
  await setConfig(page);
  await gotoHash(page, "#/shop-console");
  await expect(page.locator("#main")).toContainText("需要连接钱包");
});

test("roles page shows wallet-required gating", async ({ page }) => {
  await setConfig(page);
  await gotoHash(page, "#/roles");
  await expect(page.locator("#main")).toContainText("需要连接钱包");
});

test("protocol console shows wallet-required gating", async ({ page }) => {
  await setConfig(page);
  await gotoHash(page, "#/protocol-console");
  await expect(page.locator("#main")).toContainText("需要连接钱包");
});

test("roles page access check renders with wallet", async ({ page }) => {
  await setConfig(page);
  await requireRpc(page);
  await installMockWallet(page);

  await gotoHash(page, "#/roles?shopId=1");
  await page.getByRole("button", { name: "Connect Wallet" }).click();
  await expect(page.locator("#conn")).toContainText("connected:");

  await page.evaluate((h) => {
    window.location.hash = h;
  }, "#/roles?shopId=1&refresh=1");
  await expect(page.locator("#rolesOut")).toContainText('"pageAccess"');
});

test("protocol console shows role-required gating for non-owner", async ({ page }) => {
  await setConfig(page);
  await requireRpc(page);
  await installMockWallet(page);

  await gotoHash(page, "#/protocol-console");
  await page.getByRole("button", { name: "Connect Wallet" }).click();
  await expect(page.locator("#conn")).toContainText("connected:");

  await page.evaluate((h) => {
    window.location.hash = h;
  }, "#/protocol-console?refresh=1");
  await expect(page.locator("#main")).toContainText("需要权限");
});

test("buyer expired deadline shows actionable hint", async ({ page }) => {
  await setConfig(page);
  await requireWorkerApi(page);

  await gotoHash(page, `#/buyer?itemId=${encodeURIComponent(demoItemId())}`);
  await expect(page.locator("#main")).toContainText("买家入口");
  await page.locator("#buyItemId").fill(demoItemId());
  await page.locator("#buyBuyer").fill(demoBuyerAddress());
  await page.locator("#serialDeadline").fill("1");
  await page.getByRole("button", { name: "Fetch extraData" }).click();
  await expect(page.locator("#txOut")).toContainText("deadline_expired");
  await expect(page.locator("#txOut")).toContainText("Fix:");
});

test("buyer invalid config shows actionable hint", async ({ page }) => {
  await setConfig(page, { itemsAddress: "0x123" });
  await gotoHash(page, "#/buyer");
  await expect(page.locator("#main")).toContainText("买家入口");
  await page.getByRole("button", { name: "Read Item" }).click();
  await expect(page.locator("#txOut")).toContainText("[BadConfig]");
  await expect(page.locator("#txOut")).toContainText("Fix:");
});

test("buyer missing worker shows network hint", async ({ page }) => {
  await setConfig(page, { workerUrl: "http://127.0.0.1:65534" });
  await gotoHash(page, `#/buyer?itemId=${encodeURIComponent(demoItemId())}`);
  await expect(page.locator("#main")).toContainText("买家入口");
  await page.locator("#buyBuyer").fill(demoBuyerAddress());
  await page.getByRole("button", { name: "Fetch extraData" }).click();
  await expect(page.locator("#txOut")).toContainText("[NetworkError]");
  await expect(page.locator("#txOut")).toContainText("Fix:");
});

test("buyer happy-path approve + permit + buy", async ({ page }) => {
  await setConfig(page);
  await requireWorkerApi(page);
  const workerCfg = await syncConfigFromWorker(page);
  await installMockWallet(page, workerCfg);

  await gotoHash(page, `#/buyer?itemId=${encodeURIComponent(demoItemId())}`);
  await expect(page.locator("#main")).toContainText("买家入口");

  await page.getByRole("button", { name: "Connect Wallet" }).click();
  await expect(page.locator("#conn")).toContainText("connected:");
  await page.locator("#itemIdRead").fill(demoItemId());
  await page.locator("#buyItemId").fill(demoItemId());
  await page.locator("#buyQty").fill("1");
  await page.locator("#buyRecipient").fill(demoBuyerAddress());
  await page.locator("#buyBuyer").fill(demoBuyerAddress());
  await page.locator("#serial").fill("SERIAL-E2E");
  await page.locator("#serialDeadline").fill(String(Math.floor(Date.now() / 1000) + 3600));

  await page.getByRole("button", { name: "Read Item" }).click();
  await expect(page.locator("#itemOut")).toContainText("0x");

  await page.getByRole("button", { name: "Approve" }).click();
  await expect(page.locator("#txOut")).toContainText("confirmed", { timeout: 120_000 });

  await page.getByRole("button", { name: "Fetch extraData" }).click();
  await expect(page.locator("#txOut")).toContainText("serial extraData fetched");
  const extraDataValue = await page.locator("#buyExtraData").inputValue();
  const { serialHash, deadline, nonce, signature } = decodeSerialExtraData(extraDataValue);
  const buyer = getAddress(await page.locator("#buyBuyer").inputValue());
  const recovered = await recoverTypedDataAddress({
    domain: {
      name: "MyShop",
      version: "1",
      chainId: workerCfg.chainId,
      verifyingContract: getAddress(workerCfg.itemsAddress)
    },
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
    message: { itemId: BigInt(demoItemId()), buyer, serialHash, deadline, nonce },
    signature
  });
  const serialSigner = await getSerialSigner(page, workerCfg);
  expect(recovered).toBe(serialSigner);

  await page.getByRole("button", { name: "Buy" }).click();
  await expect(page.locator("#txOut")).toContainText("submitted:");
  const txOutText = await page.locator("#txOut").innerText();
  const hashMatch = txOutText.match(/submitted:\s*(0x[0-9a-fA-F]{64})/);
  expect(hashMatch).not.toBeNull();
  if (hashMatch) {
    const tx = await rpcCall(page, "eth_getTransactionByHash", [hashMatch[1]]);
    expect(tx?.from?.toLowerCase()).toBe(demoBuyerAddress().toLowerCase());
  }
  await expect(page.locator("#txOut")).toContainText("confirmed", { timeout: 120_000 });
  await expect(page).toHaveURL(/#\/purchases/);
  await expect(page.getByText("购买记录（Purchases）")).toBeVisible();

  await page.getByRole("button", { name: "Load" }).click();
  await expect(page.locator("#purchasesMeta")).toContainText("count=");
  await expect(page.locator("#purchasesList")).toContainText("item=#");
});

test("plaza worker rate_limited shows actionable hint", async ({ page }) => {
  await setConfig(page);
  await installOkHealthRoutes(page);

  let shopsReq = 0;
  await page.route("**/shops**", async (route) => {
    shopsReq += 1;
    if (shopsReq === 1) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          shops: [
            {
              shopId: "1",
              shop: {
                owner: "0x0000000000000000000000000000000000000001",
                treasury: "0x0000000000000000000000000000000000000002",
                metadataHash: "0x" + "0".repeat(64),
                paused: false
              }
            }
          ],
          nextCursor: null
        })
      });
      return;
    }
    await route.fulfill({
      status: 429,
      contentType: "application/json",
      body: JSON.stringify({ ok: false, error: "too many requests", errorCode: "rate_limited" })
    });
  });

  await page.route("**/items**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        items: [
          {
            itemId: "1",
            item: {
              shopId: "1",
              payToken: "0x0000000000000000000000000000000000000000",
              unitPrice: "0",
              nftContract: "0x0000000000000000000000000000000000000000",
              soulbound: false,
              tokenURI: "",
              action: "0x0000000000000000000000000000000000000000",
              actionData: "0x",
              requiresSerial: false,
              active: true
            }
          }
        ],
        nextCursor: null
      })
    });
  });

  await gotoHash(page, "#/plaza");
  await expect(page.getByText("广场（All Shops）")).toBeVisible();

  await page.selectOption("#plazaSource", "worker");
  await page.getByRole("button", { name: "Reload" }).click();
  await expect(page.locator("#txOut")).toContainText("rate_limited");
  await expect(page.locator("#txOut")).toContainText("Fix:");
});

test("plaza worker invalid_response shows actionable hint", async ({ page }) => {
  await setConfig(page);
  await installOkHealthRoutes(page);

  await page.route("**/shops**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        shops: [
          {
            shopId: "1",
            shop: {
              owner: "0x0000000000000000000000000000000000000001",
              treasury: "0x0000000000000000000000000000000000000002",
              metadataHash: "0x" + "0".repeat(64),
              paused: false
            }
          }
        ],
        nextCursor: null
      })
    });
  });

  let itemsReq = 0;
  await page.route("**/items**", async (route) => {
    itemsReq += 1;
    if (itemsReq === 1) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          items: [
            {
              itemId: "1",
              item: {
                shopId: "1",
                payToken: "0x0000000000000000000000000000000000000000",
                unitPrice: "0",
                nftContract: "0x0000000000000000000000000000000000000000",
                soulbound: false,
                tokenURI: "",
                action: "0x0000000000000000000000000000000000000000",
                actionData: "0x",
                requiresSerial: false,
                active: true
              }
            }
          ],
          nextCursor: null
        })
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "text/plain",
      body: "not-json"
    });
  });

  await gotoHash(page, "#/plaza");
  await expect(page.getByText("广场（All Shops）")).toBeVisible();

  await page.selectOption("#plazaSource", "worker");
  await page.getByRole("button", { name: "Reload" }).click();
  await expect(page.locator("#txOut")).toContainText("invalid_response");
  await expect(page.locator("#txOut")).toContainText("Fix:");
});

test("purchases index 404 shows actionable hint", async ({ page }) => {
  await setConfig(page);
  await installOkHealthRoutes(page);

  let purchasesReq = 0;
  await page.route("**/purchases**", async (route) => {
    purchasesReq += 1;
    if (purchasesReq === 1) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          source: "index",
          fromBlock: "0",
          toBlock: "0",
          indexedToBlock: "0",
          count: 0,
          purchases: []
        })
      });
      return;
    }
    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ ok: false, error: "not found" })
    });
  });

  await gotoHash(page, "#/purchases");
  await expect(page.getByText("购买记录（Purchases）")).toBeVisible();

  await page.selectOption("#purchasesSource", "index");
  await page.getByRole("button", { name: "Load" }).click();
  await expect(page.locator("#txOut")).toContainText("endpoint not found");
  await expect(page.locator("#txOut")).toContainText("Fix:");
});
