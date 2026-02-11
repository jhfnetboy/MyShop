# Worker（监听 / 签名 / 通知）

## 作用

- 监听链上 `MyShopItems.Purchased` 事件，转发到：
  - Webhook（你的业务后端）
  - Telegram（运营/值班通知）
- 对外提供签名 API（EIP-712）：
  - `SerialPermit`：购买前的串号许可签名
  - `RiskAllowance`：上架突破默认限制的风控签名

## 目录

- 入口：[worker/src/index.js](file:///Users/jason/Dev/crypto-projects/MyShop/worker/src/index.js)
- 购买监听：[worker/src/watchPurchased.js](file:///Users/jason/Dev/crypto-projects/MyShop/worker/src/watchPurchased.js)
- Permit 服务：[worker/src/permitServer.js](file:///Users/jason/Dev/crypto-projects/MyShop/worker/src/permitServer.js)

## 启动

```bash
cd worker
cp .env.example .env
npm install
npm run dev
```

## 配置项（.env）

- **链配置**
  - `RPC_URL`
  - `CHAIN_ID`
  - `ITEMS_ADDRESS`（MyShopItems 合约地址）
- **模式**
  - `MODE=watch|permit|both`
- **购买监听**
  - `POLL_INTERVAL_MS`
  - `LOOKBACK_BLOCKS`
  - `WEBHOOK_URL`（可选）
  - `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID`（可选）
- **签名服务（permit）**
  - `PORT`
  - `SERIAL_SIGNER_PRIVATE_KEY`（用于 `/serial-permit`）
  - `RISK_SIGNER_PRIVATE_KEY`（用于 `/risk-allowance`）
  - `SERIAL_ISSUER_URL`（可选：让服务端先向外部系统申请串号/哈希，再回签）

## Permit API

### health

`GET /health`

### SerialPermit（购买前）

`GET /serial-permit?itemId=&buyer=&serial=&deadline=&nonce=`

- `serial`：原始串号字符串（服务端会 `keccak256(serial)` 得到 `serialHash`）
- `deadline`：uint256 时间戳
- `nonce`：
  - 不填：服务端会从合约 `usedNonces(buyer, i)` 自动找一个未用的 nonce（0..999）
  - 填：用你提供的 nonce

返回里会给出：
- `signature`（EIP-712 签名）
- `extraData`（已编码好的 `abi.encode(serialHash,deadline,nonce,sig)`，可直接作为 `buy(..., extraData)` 参数）

#### 外部串号签发（可选）

如果配置了 `SERIAL_ISSUER_URL`，则 `/serial-permit` 可以不传 `serial/serialHash`，服务端会先 `POST SERIAL_ISSUER_URL`：

```json
{ "buyer": "0x...", "itemId": "123", "context": "..." }
```

外部服务返回 `{"serial":"..."}`
或 `{"serialHash":"0x..."}` 均可，然后 Worker 会基于返回值回签 `SerialPermit`。

### RiskAllowance（上架前）

`GET /risk-allowance?shopOwner=&maxItems=&deadline=&nonce=`

返回 `signature`（用于 `addItem` 的 `signature` 字段）。
