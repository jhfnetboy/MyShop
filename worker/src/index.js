import { getAddress } from "viem";

import { optionalEnv, requireEnv } from "./env.js";
import { startPermitServer } from "./permitServer.js";
import { watchPurchased } from "./watchPurchased.js";

const mode = optionalEnv("MODE", "both");

const rpcUrl = requireEnv("RPC_URL");
const chainId = Number(requireEnv("CHAIN_ID"));
const itemsAddress = getAddress(requireEnv("ITEMS_ADDRESS"));

const chain = {
  id: chainId,
  name: optionalEnv("CHAIN_NAME", "custom"),
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } }
};

const webhookUrl = optionalEnv("WEBHOOK_URL", "");
const telegramBotToken = optionalEnv("TELEGRAM_BOT_TOKEN", "");
const telegramChatId = optionalEnv("TELEGRAM_CHAT_ID", "");
const pollIntervalMs = Number(optionalEnv("POLL_INTERVAL_MS", "4000"));
const lookbackBlocks = Number(optionalEnv("LOOKBACK_BLOCKS", "50"));

const serialSignerPrivateKey = optionalEnv("SERIAL_SIGNER_PRIVATE_KEY", "");
const riskSignerPrivateKey = optionalEnv("RISK_SIGNER_PRIVATE_KEY", "");
const serialIssuerUrl = optionalEnv("SERIAL_ISSUER_URL", "");
const port = Number(optionalEnv("PORT", "8787"));

if (mode === "watch" || mode === "both") {
  watchPurchased({
    rpcUrl,
    chain,
    itemsAddress,
    pollIntervalMs,
    lookbackBlocks,
    webhookUrl: webhookUrl || null,
    telegram:
      telegramBotToken && telegramChatId
        ? {
            botToken: telegramBotToken,
            chatId: telegramChatId
          }
        : null
  }).catch((e) => {
    process.stderr.write(String(e) + "\n");
    process.exit(1);
  });
}

if (mode === "permit" || mode === "both") {
  startPermitServer({
    rpcUrl,
    chain,
    itemsAddress,
    serialSignerPrivateKey: serialSignerPrivateKey ? normalizePrivateKey(serialSignerPrivateKey) : null,
    riskSignerPrivateKey: riskSignerPrivateKey ? normalizePrivateKey(riskSignerPrivateKey) : null,
    serialIssuerUrl: serialIssuerUrl || null,
    port
  })
    .then(({ port: actualPort }) => {
      process.stdout.write(`permit server listening on ${actualPort}\n`);
    })
    .catch((e) => {
      process.stderr.write(String(e) + "\n");
      process.exit(1);
    });
}

if (!["watch", "permit", "both"].includes(mode)) {
  throw new Error("MODE must be watch|permit|both");
}

function normalizePrivateKey(value) {
  const hex = value.startsWith("0x") ? value : `0x${value}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(hex)) throw new Error("Invalid private key format");
  return hex;
}
