import { expect, test } from "@playwright/test";
import { getAddress } from "viem";

async function setConfig(page) {
  const storageKey = "myshop_frontend_config_v1";
  const cfg = {
    rpcUrl: process.env.RPC_URL || "http://127.0.0.1:8545",
    chainId: process.env.CHAIN_ID ? Number(process.env.CHAIN_ID) : 31337,
    shopsAddress: process.env.SHOPS_ADDRESS || "0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9",
    itemsAddress: process.env.ITEMS_ADDRESS || "0x5FC8d32690cc91D4c39d9d3abcBD16989F875707",
    workerUrl: process.env.WORKER_URL || "http://127.0.0.1:8787",
    workerApiUrl: process.env.WORKER_API_URL || "http://127.0.0.1:8788"
  };
  await page.addInitScript(
    ([key, value]) => {
      localStorage.setItem(key, JSON.stringify(value));
    },
    [storageKey, cfg]
  );
}

async function gotoPlaza(page) {
  await page.goto("/");
  await expect(page.locator("#app")).toHaveCount(1);
  await page.evaluate(() => {
    window.location.hash = "#/plaza";
  });
  await expect(page.getByText("广场（All Shops）")).toBeVisible();
}

test("plaza filters by community owner", async ({ page }) => {
  await setConfig(page);

  const ownerA = getAddress("0x0000000000000000000000000000000000000001");
  const ownerB = getAddress("0x0000000000000000000000000000000000000003");

  await page.route("**/shops**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        shops: [
          { shopId: "1", shop: { owner: ownerA, treasury: getAddress("0x0000000000000000000000000000000000000002"), metadataHash: "0x" + "0".repeat(64), paused: false } },
          { shopId: "2", shop: { owner: ownerB, treasury: getAddress("0x0000000000000000000000000000000000000002"), metadataHash: "0x" + "0".repeat(64), paused: false } }
        ],
        nextCursor: null
      })
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
              payToken: getAddress("0x0000000000000000000000000000000000000000"),
              unitPrice: "0",
              nftContract: getAddress("0x0000000000000000000000000000000000000000"),
              soulbound: false,
              tokenURI: "",
              action: getAddress("0x0000000000000000000000000000000000000000"),
              actionData: "0x",
              requiresSerial: false,
              active: true
            }
          },
          {
            itemId: "2",
            item: {
              shopId: "1",
              payToken: getAddress("0x0000000000000000000000000000000000000000"),
              unitPrice: "0",
              nftContract: getAddress("0x0000000000000000000000000000000000000000"),
              soulbound: false,
              tokenURI: "",
              action: getAddress("0x0000000000000000000000000000000000000000"),
              actionData: "0x",
              requiresSerial: false,
              active: true
            }
          },
          {
            itemId: "3",
            item: {
              shopId: "2",
              payToken: getAddress("0x0000000000000000000000000000000000000000"),
              unitPrice: "0",
              nftContract: getAddress("0x0000000000000000000000000000000000000000"),
              soulbound: false,
              tokenURI: "",
              action: getAddress("0x0000000000000000000000000000000000000000"),
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

  await gotoPlaza(page);
  await page.selectOption("#plazaSource", "worker");
  await page.locator("#plazaCommunityOwnerFilter").fill(ownerA);
  await page.getByRole("button", { name: "Reload" }).click();

  await expect(page.locator("#plazaList")).toContainText("Shops (1)");
  await expect(page.locator("#plazaList")).toContainText("Items (2)");
  await expect(page.locator("#plazaList")).toContainText("Shop #1");
  await expect(page.locator("#plazaList")).toContainText("Item #1");
  await expect(page.locator("#plazaList")).toContainText("Item #2");
  await expect(page.locator("#plazaList")).not.toContainText("Shop #2");
  await expect(page.locator("#plazaList")).not.toContainText("Item #3");
}
);
