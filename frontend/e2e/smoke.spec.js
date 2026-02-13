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

async function setConfig(page) {
  const cfg = buildCfg();
  await page.addInitScript(
    ([key, value]) => {
      localStorage.setItem(key, JSON.stringify(value));
    },
    [storageKey, cfg]
  );
}

test("diagnostics page renders and can check rpc", async ({ page }) => {
  await setConfig(page);

  try {
    await page.request.get(`${buildCfg().workerApiUrl}/health`, { timeout: 2000 });
  } catch {
    test.skip(true, "worker api not available (start ./scripts/regression_local.sh first)");
  }

  await page.goto("/#/diag");
  await expect(page.getByText("诊断（Diagnostics）")).toBeVisible();
  await expect(page.locator("#diagOut")).toContainText('"kind": "rpc"');
});

test("plaza and purchases pages render", async ({ page }) => {
  await setConfig(page);

  try {
    await page.request.get(`${buildCfg().workerApiUrl}/health`, { timeout: 2000 });
  } catch {
    test.skip(true, "worker api not available (start ./scripts/regression_local.sh first)");
  }

  await page.goto("/#/plaza");
  await expect(page.getByText("广场（All Shops）")).toBeVisible();
  await expect(page.getByText(/Shops \(/)).toBeVisible();

  await page.goto("/#/purchases");
  await expect(page.getByText("购买记录（Purchases）")).toBeVisible();
  await page.getByRole("button", { name: "Load" }).click();
  await expect(page.locator("#purchasesMeta")).toContainText("count=");
});
