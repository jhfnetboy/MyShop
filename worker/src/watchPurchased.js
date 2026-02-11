import { decodeEventLog, getAddress, parseAbiItem } from "viem";
import { http, createPublicClient } from "viem";

import { myShopItemsAbi } from "./abi.js";

const purchasedEvent = parseAbiItem(
  "event Purchased(uint256 indexed itemId,uint256 shopId,address indexed buyer,address recipient,uint256 quantity,address payToken,uint256 payAmount,uint256 platformFeeAmount,bytes32 serialHash,uint256 firstTokenId)"
);

export async function watchPurchased({
  rpcUrl,
  chain,
  itemsAddress,
  pollIntervalMs,
  lookbackBlocks,
  webhookUrl,
  telegram
}) {
  const client = createPublicClient({
    chain,
    transport: http(rpcUrl)
  });

  const address = getAddress(itemsAddress);

  let lastBlock = await client.getBlockNumber();
  if (lastBlock > BigInt(lookbackBlocks)) lastBlock -= BigInt(lookbackBlocks);

  for (;;) {
    const latest = await client.getBlockNumber();
    if (latest >= lastBlock) {
      const fromBlock = lastBlock;
      const toBlock = latest;
      const logs = await client.getLogs({
        address,
        event: purchasedEvent,
        fromBlock,
        toBlock
      });

      for (const log of logs) {
        const decoded = decodeEventLog({
          abi: myShopItemsAbi,
          data: log.data,
          topics: log.topics
        });

        const payload = {
          chainId: chain.id,
          txHash: log.transactionHash,
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

        if (webhookUrl) {
          await fetch(webhookUrl, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload)
          });
        }

        if (telegram) {
          await _sendTelegram(telegram, payload);
        }

        if (!webhookUrl && !telegram) {
          process.stdout.write(
            JSON.stringify(payload, null, 2) + "\n"
          );
        }
      }
    }

    lastBlock = latest + 1n;
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }
}

async function _sendTelegram(telegram, payload) {
  const text =
    `MyShop Purchased\n` +
    `chainId: ${payload.chainId}\n` +
    `tx: ${payload.txHash}\n` +
    `itemId: ${payload.itemId}\n` +
    `shopId: ${payload.shopId}\n` +
    `buyer: ${payload.buyer}\n` +
    `recipient: ${payload.recipient}\n` +
    `quantity: ${payload.quantity}\n` +
    `payToken: ${payload.payToken}\n` +
    `payAmount: ${payload.payAmount}\n` +
    `platformFeeAmount: ${payload.platformFeeAmount}\n` +
    `serialHash: ${payload.serialHash}\n` +
    `firstTokenId: ${payload.firstTokenId}\n`;

  const url = `https://api.telegram.org/bot${telegram.botToken}/sendMessage`;
  await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: telegram.chatId,
      text
    })
  });
}
