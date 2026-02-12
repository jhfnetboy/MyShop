import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import process from "node:process";
import net from "node:net";

import { encodeAbiParameters, getAddress, http, parseAbiParameters } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createPublicClient, createWalletClient } from "viem";

import { myShopItemsAbi, myShopsAbi } from "../../../frontend/src/contracts.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, "../../..");
const contractsDir = path.join(rootDir, "contracts");
const workerDir = path.join(rootDir, "worker");

const myShopItemsAdminReadAbi = [
  {
    type: "function",
    name: "shopItemCount",
    stateMutability: "view",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "DEFAULT_MAX_ITEMS_PER_SHOP",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }]
  }
] as const;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function findFreePort(startPort: number) {
  let port = startPort;
  while (true) {
    const isFree = await new Promise<boolean>((resolve) => {
      const server = net.createServer();
      server.once("error", () => resolve(false));
      server.once("listening", () => server.close(() => resolve(true)));
      server.listen(port, "127.0.0.1");
    });
    if (isFree) return port;
    port++;
  }
}

async function waitFor(fn: () => Promise<boolean>, timeoutMs: number, label: string) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await fn()) return;
    await sleep(100);
  }
  throw new Error(`Timeout waiting for ${label}`);
}

function parseDeployJson(output: string) {
  const lines = output.split(/\r?\n/).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (line.startsWith("{") && line.endsWith("}")) {
      return JSON.parse(line);
    }
  }
  throw new Error("Unable to parse deploy JSON from forge output");
}

function spawnLogged(command: string, args: string[], opts: { cwd?: string; env?: NodeJS.ProcessEnv }) {
  const child = spawn(command, args, {
    cwd: opts.cwd,
    env: opts.env,
    stdio: ["ignore", "pipe", "pipe"]
  });

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (d) => (stdout += d.toString()));
  child.stderr.on("data", (d) => (stderr += d.toString()));

  return {
    child,
    getStdout: () => stdout,
    getStderr: () => stderr,
    wait: () =>
      new Promise<{ code: number; stdout: string; stderr: string }>((resolve, reject) => {
        child.on("error", reject);
        child.on("close", (code) => resolve({ code: code ?? -1, stdout, stderr }));
      })
  };
}

async function fetchJson(url: string) {
  const res = await fetch(url);
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text}`);
  return JSON.parse(text);
}

async function writeAndWait(params: {
  walletClient: any;
  publicClient: any;
  request: any;
}) {
  const hash = await params.walletClient.writeContract({
    ...params.request,
    gas: 8_000_000n,
    maxFeePerGas: 10_000_000_000n,
    maxPriorityFeePerGas: 1_000_000_000n
  });
  const receipt = await params.publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error(`Transaction reverted: ${hash}`);
  }
  return hash;
}

async function sendAndWait(params: {
  walletClient: any;
  publicClient: any;
  request: { to: `0x${string}`; value: bigint };
}) {
  const hash = await params.walletClient.sendTransaction({
    ...params.request,
    gas: 21_000n,
    maxFeePerGas: 10_000_000_000n,
    maxPriorityFeePerGas: 1_000_000_000n
  });
  const receipt = await params.publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error(`Transaction reverted: ${hash}`);
  }
  return hash;
}

async function main() {
  const deployerPk = (process.env.DEPLOYER_PK ??
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80") as `0x${string}`;
  const buyerPk = (process.env.BUYER_PK ??
    "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d") as `0x${string}`;
  const riskSignerPk = (process.env.RISK_SIGNER_PK ??
    "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a") as `0x${string}`;
  const serialSignerPk = (process.env.SERIAL_SIGNER_PK ??
    "0x7c8521197cd533c301a916120409a63c809181144001a1c93a0280eb46c6495d") as `0x${string}`;

  const operatorPk = serialSignerPk;

  const rpcPort = await findFreePort(Number(process.env.ANVIL_PORT ?? "8545"));
  const permitPort = await findFreePort(Number(process.env.WORKER_PORT ?? "8787"));
  const apiPort = await findFreePort(Number(process.env.API_PORT ?? "8788"));

  const rpcUrl = `http://127.0.0.1:${rpcPort}`;

  const started: Array<() => Promise<void>> = [];
  try {
    const anvil = spawn("anvil", ["--port", String(rpcPort), "--silent"], {
      stdio: ["ignore", "pipe", "pipe"]
    });
    started.push(async () => {
      anvil.kill("SIGTERM");
    });

    const anvilOut: string[] = [];
    anvil.stdout.on("data", (d) => anvilOut.push(d.toString()));
    anvil.stderr.on("data", (d) => anvilOut.push(d.toString()));

    const chain = {
      id: 31337,
      name: "anvil",
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: [rpcUrl] } }
    } as const;

    const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });

    await waitFor(
      async () => {
        try {
          await publicClient.getBlockNumber();
          return true;
        } catch {
          return false;
        }
      },
      10_000,
      "anvil rpc"
    );

    const deploy = spawnLogged(
      "forge",
      ["script", "script/DeployDemo.s.sol:DeployDemo", "--rpc-url", rpcUrl, "--broadcast", "-vv"],
      {
        cwd: contractsDir,
        env: {
          ...process.env,
          DEPLOYER_PK: deployerPk,
          BUYER_PK: buyerPk,
          RISK_SIGNER_PK: riskSignerPk,
          SERIAL_SIGNER_PK: serialSignerPk
        }
      }
    );
    const deployResult = await deploy.wait();
    assert(deployResult.code === 0, `forge script failed: ${deployResult.stderr || deployResult.stdout}`);

    const demo = parseDeployJson(deployResult.stdout);
    const chainId = Number(demo.chainId);
    const shopsAddress = getAddress(demo.shops);
    const itemsAddress = getAddress(demo.items);
    const usdcAddress = getAddress(demo.usdc);
    const apntsAddress = getAddress(demo.apnts);
    const nftAddress = getAddress(demo.nft);
    const actionAddress = getAddress(demo.action);
    const shopId = BigInt(demo.shopId);
    const itemId = BigInt(demo.itemId);
    const buyer = getAddress(demo.buyer);
    const deployer = getAddress(demo.deployer);

    const chainForClients = {
      id: chainId,
      name: "demo",
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: [rpcUrl] } }
    } as const;

    const publicClient2 = createPublicClient({ chain: chainForClients, transport: http(rpcUrl) });

    const deployerWallet = createWalletClient({
      chain: chainForClients,
      transport: http(rpcUrl),
      account: privateKeyToAccount(deployerPk)
    });
    const buyerWallet = createWalletClient({
      chain: chainForClients,
      transport: http(rpcUrl),
      account: privateKeyToAccount(buyerPk)
    });
    const operatorWallet = createWalletClient({
      chain: chainForClients,
      transport: http(rpcUrl),
      account: privateKeyToAccount(operatorPk)
    });

    await sendAndWait({
      walletClient: deployerWallet,
      publicClient: publicClient2,
      request: { to: operatorWallet.account.address, value: 1n * 10n ** 18n }
    });

    const worker = spawn("node", ["src/index.js"], {
      cwd: workerDir,
      env: {
        ...process.env,
        MODE: "both",
        RPC_URL: rpcUrl,
        CHAIN_ID: String(chainId),
        ITEMS_ADDRESS: itemsAddress,
        PORT: String(permitPort),
        ENABLE_API: "1",
        API_PORT: String(apiPort),
        POLL_INTERVAL_MS: "200",
        LOOKBACK_BLOCKS: "50",
        SERIAL_SIGNER_PRIVATE_KEY: serialSignerPk,
        RISK_SIGNER_PRIVATE_KEY: riskSignerPk
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    started.push(async () => {
      worker.kill("SIGTERM");
    });

    const workerOut: string[] = [];
    worker.stdout.on("data", (d) => workerOut.push(d.toString()));
    worker.stderr.on("data", (d) => workerOut.push(d.toString()));

    await waitFor(async () => {
      try {
        const j = await fetchJson(`http://127.0.0.1:${permitPort}/health`);
        return j?.ok === true;
      } catch {
        return false;
      }
    }, 10_000, "permit server health");

    await waitFor(async () => {
      try {
        const j = await fetchJson(`http://127.0.0.1:${apiPort}/health`);
        return j?.ok === true;
      } catch {
        return false;
      }
    }, 10_000, "api server health");

    {
      const roles = 2 | 4 | 8;
      await writeAndWait({
        walletClient: deployerWallet,
        publicClient: publicClient2,
        request: {
          address: shopsAddress,
          abi: myShopsAbi,
          functionName: "setShopRoles",
          args: [shopId, operatorWallet.account.address, roles]
        }
      });

      const stored = await publicClient2.readContract({
        address: shopsAddress,
        abi: myShopsAbi,
        functionName: "shopRoles",
        args: [shopId, operatorWallet.account.address]
      });
      assert(Number(stored) === roles, `shopRoles mismatch: expected ${roles}, got ${stored}`);
    }

    {
      const newUri = "ipfs://token-ts";
      await writeAndWait({
        walletClient: operatorWallet,
        publicClient: publicClient2,
        request: {
          address: itemsAddress,
          abi: myShopItemsAbi,
          functionName: "updateItem",
          args: [
            itemId,
            {
              payToken: usdcAddress,
              unitPrice: 2000n,
              nftContract: nftAddress,
              soulbound: true,
              tokenURI: newUri,
              requiresSerial: true
            }
          ]
        }
      });

      const item = await publicClient2.readContract({
        address: itemsAddress,
        abi: myShopItemsAbi,
        functionName: "items",
        args: [itemId]
      });
      const tokenURI = Array.isArray(item) ? (item[5] as string) : (item as any).tokenURI;
      assert(tokenURI === newUri, `tokenURI not updated: ${tokenURI}`);
    }

    {
      const actionData = encodeAbiParameters(parseAbiParameters("address token,uint256 amount"), [apntsAddress, 60n * 10n ** 18n]);
      await writeAndWait({
        walletClient: operatorWallet,
        publicClient: publicClient2,
        request: {
          address: itemsAddress,
          abi: myShopItemsAbi,
          functionName: "updateItemAction",
          args: [itemId, actionAddress, actionData]
        }
      });

      const item = await publicClient2.readContract({
        address: itemsAddress,
        abi: myShopItemsAbi,
        functionName: "items",
        args: [itemId]
      });
      const action = Array.isArray(item) ? (item[6] as string) : (item as any).action;
      const storedActionData = Array.isArray(item) ? (item[7] as string) : (item as any).actionData;
      assert(getAddress(action) === actionAddress, `action not updated: ${action}`);
      assert(storedActionData === actionData, "actionData not updated");
    }

    {
      await writeAndWait({
        walletClient: operatorWallet,
        publicClient: publicClient2,
        request: {
          address: itemsAddress,
          abi: myShopItemsAbi,
          functionName: "setItemActive",
          args: [itemId, false]
        }
      });

      const item = await publicClient2.readContract({
        address: itemsAddress,
        abi: myShopItemsAbi,
        functionName: "items",
        args: [itemId]
      });
      const active = Array.isArray(item) ? (item[9] as boolean) : (item as any).active;
      assert(active === false, "item.active should be false");
    }

    {
      await writeAndWait({
        walletClient: operatorWallet,
        publicClient: publicClient2,
        request: {
          address: itemsAddress,
          abi: myShopItemsAbi,
          functionName: "setItemActive",
          args: [itemId, true]
        }
      });

      const item = await publicClient2.readContract({
        address: itemsAddress,
        abi: myShopItemsAbi,
        functionName: "items",
        args: [itemId]
      });
      const active = Array.isArray(item) ? (item[9] as boolean) : (item as any).active;
      assert(active === true, "item.active should be true");
    }

    {
      const zeroHash = `0x${"0".repeat(64)}` as const;
      await writeAndWait({
        walletClient: operatorWallet,
        publicClient: publicClient2,
        request: {
          address: itemsAddress,
          abi: myShopItemsAbi,
          functionName: "addItemPageVersion",
          args: [itemId, "https://example.com/v1", zeroHash]
        }
      });

      await writeAndWait({
        walletClient: operatorWallet,
        publicClient: publicClient2,
        request: {
          address: itemsAddress,
          abi: myShopItemsAbi,
          functionName: "addItemPageVersion",
          args: [itemId, "https://example.com/v2", zeroHash]
        }
      });

      await writeAndWait({
        walletClient: operatorWallet,
        publicClient: publicClient2,
        request: {
          address: itemsAddress,
          abi: myShopItemsAbi,
          functionName: "setItemDefaultPageVersion",
          args: [itemId, 1n]
        }
      });

      const page = await publicClient2.readContract({
        address: itemsAddress,
        abi: myShopItemsAbi,
        functionName: "getItemPage",
        args: [itemId, 1n]
      });
      const uri = Array.isArray(page) ? (page[1] as string) : (page as any).uri;
      assert(uri === "https://example.com/v1", `page uri mismatch: ${uri}`);
    }

    const addItemBase = {
      shopId,
      payToken: usdcAddress,
      unitPrice: 1000n,
      nftContract: nftAddress,
      soulbound: true,
      tokenURI: "ipfs://token-more",
      action: actionAddress,
      actionData: encodeAbiParameters(parseAbiParameters("address token,uint256 amount"), [apntsAddress, 1n]),
      requiresSerial: false
    };

    const defaultLimit = (await publicClient2.readContract({
      address: itemsAddress,
      abi: myShopItemsAdminReadAbi,
      functionName: "DEFAULT_MAX_ITEMS_PER_SHOP",
      args: []
    })) as bigint;

    let count = (await publicClient2.readContract({
      address: itemsAddress,
      abi: myShopItemsAdminReadAbi,
      functionName: "shopItemCount",
      args: [shopId]
    })) as bigint;

    if (count < defaultLimit) {
      const toAdd = defaultLimit - count;
      for (let i = 0n; i < toAdd; i++) {
        await writeAndWait({
          walletClient: deployerWallet,
          publicClient: publicClient2,
          request: {
            address: itemsAddress,
            abi: myShopItemsAbi,
            functionName: "addItem",
            args: [
              {
                ...addItemBase,
                tokenURI: `ipfs://token-${count + i}`,
                maxItems: 0n,
                deadline: 0n,
                nonce: 0n,
                signature: "0x"
              }
            ]
          }
        });
      }
    }

    count = (await publicClient2.readContract({
      address: itemsAddress,
      abi: myShopItemsAdminReadAbi,
      functionName: "shopItemCount",
      args: [shopId]
    })) as bigint;
    assert(count === defaultLimit, `shopItemCount expected ${defaultLimit}, got ${count}`);

    {
      let reverted = false;
      try {
        await writeAndWait({
          walletClient: deployerWallet,
          publicClient: publicClient2,
          request: {
            address: itemsAddress,
            abi: myShopItemsAbi,
            functionName: "addItem",
            args: [
              {
                ...addItemBase,
                tokenURI: "ipfs://token-over-default",
                maxItems: 0n,
                deadline: 0n,
                nonce: 0n,
                signature: "0x"
              }
            ]
          }
        });
      } catch {
        reverted = true;
      }
      assert(reverted, "expected addItem to revert once default max items reached");
    }

    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
    const risk = await fetchJson(
      `http://127.0.0.1:${permitPort}/risk-allowance?shopOwner=${deployer}&maxItems=${(defaultLimit + 3n).toString()}&deadline=${deadline.toString()}`
    );
    {
      await writeAndWait({
        walletClient: deployerWallet,
        publicClient: publicClient2,
        request: {
          address: itemsAddress,
          abi: myShopItemsAbi,
          functionName: "addItem",
          args: [
            {
              ...addItemBase,
              tokenURI: "ipfs://token-risk",
              maxItems: BigInt(risk.maxItems),
              deadline: BigInt(risk.deadline),
              nonce: BigInt(risk.nonce),
              signature: risk.signature
            }
          ]
        }
      });
    }

    {
      await writeAndWait({
        walletClient: buyerWallet,
        publicClient: publicClient2,
        request: {
          address: usdcAddress,
          abi: [
            {
              type: "function",
              name: "approve",
              stateMutability: "nonpayable",
              inputs: [
                { name: "spender", type: "address" },
                { name: "amount", type: "uint256" }
              ],
              outputs: [{ name: "", type: "bool" }]
            }
          ],
          functionName: "approve",
          args: [itemsAddress, 2n ** 256n - 1n]
        }
      });

      const permit = await fetchJson(
        `http://127.0.0.1:${permitPort}/serial-permit?itemId=${itemId.toString()}&buyer=${buyer}&serial=SERIAL-TS-001&deadline=${deadline.toString()}`
      );
      await writeAndWait({
        walletClient: buyerWallet,
        publicClient: publicClient2,
        request: {
          address: itemsAddress,
          abi: myShopItemsAbi,
          functionName: "buy",
          args: [itemId, 1n, buyer, permit.extraData]
        }
      });
    }

    await waitFor(
      async () => {
        try {
          const j = await fetchJson(`http://127.0.0.1:${apiPort}/purchases?limit=10&include=enrich&source=index`);
          if (j?.ok !== true) return false;
          if (!Array.isArray(j.purchases) || j.purchases.length === 0) return false;
          return true;
        } catch {
          return false;
        }
      },
      15_000,
      "api purchases index"
    );

    const purchases = await fetchJson(`http://127.0.0.1:${apiPort}/purchases?limit=10&include=enrich&source=index`);
    assert(purchases.ok === true, "purchases ok");
    assert(purchases.count >= 1, "expected at least 1 purchase");

    const cfg = await fetchJson(`http://127.0.0.1:${apiPort}/config`);
    assert(cfg.itemsAddress === itemsAddress, "api config itemsAddress mismatch");

    const shops = await fetchJson(`http://127.0.0.1:${apiPort}/shops?limit=1`);
    assert(shops.ok === true, "shops ok");

    const itemsList = await fetchJson(`http://127.0.0.1:${apiPort}/items?limit=1`);
    assert(itemsList.ok === true, "items ok");

    process.stdout.write("smoke ok\n");
  } finally {
    for (const stop of started.reverse()) {
      try {
        await stop();
      } catch {
      }
    }
  }
}

main().catch((e) => {
  process.stderr.write((e instanceof Error ? e.stack : String(e)) + "\n");
  process.exit(1);
});
