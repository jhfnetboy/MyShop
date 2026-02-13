import { expect, test } from "@playwright/test";

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

async function setConfig(page, overrides = {}) {
  const cfg = { ...buildCfg(), ...overrides };
  await page.addInitScript(
    ([key, value]) => {
      localStorage.setItem(key, JSON.stringify(value));
    },
    [storageKey, cfg]
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
  await page.getByRole("button", { name: "Load" }).click();
  await expect(page.locator("#purchasesMeta")).toContainText("count=");
});

test("shop console shows wallet-required gating", async ({ page }) => {
  await setConfig(page);
  await gotoHash(page, "#/shop-console");
  await expect(page.locator("#main")).toContainText("需要连接钱包");
});

test("buyer expired deadline shows actionable hint", async ({ page }) => {
  await setConfig(page);
  await requireWorkerApi(page);

  await gotoHash(page, `#/buyer?itemId=${encodeURIComponent(demoItemId())}`);
  await expect(page.locator("#main")).toContainText("买家入口");
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
  await page.getByRole("button", { name: "Fetch extraData" }).click();
  await expect(page.locator("#txOut")).toContainText("[NetworkError]");
  await expect(page.locator("#txOut")).toContainText("Fix:");
});
