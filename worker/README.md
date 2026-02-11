# MyShop Worker

## Install

```bash
cd worker
npm install
```

## Run

Copy env file and fill values:

```bash
cp .env.example .env
```

Start:

```bash
npm run dev
```

## Modes

- `MODE=watch` polls `MyShopItems.Purchased` events and POSTs JSON to `WEBHOOK_URL` if set.
- `MODE=permit` starts an HTTP server that signs EIP-712 permits for `MyShopItems`.
- `MODE=both` runs both.

## Notifications

- `WEBHOOK_URL` if you want to forward purchase payload to your backend.
- `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` if you want Telegram messages.

## Permit Endpoints

- `GET /health`
- `GET /serial-permit?itemId=&buyer=&serial=&deadline=&nonce=`
- `GET /risk-allowance?shopOwner=&maxItems=&deadline=&nonce=`

## Serial Issuer (optional)

If `SERIAL_ISSUER_URL` is set, `/serial-permit` can omit `serial` and `serialHash`, and the server will POST:

```json
{ "buyer": "0x...", "itemId": "123", "context": "..." }
```

Expected response JSON should include either:

```json
{ "serial": "SERIAL-001" }
```

or:

```json
{ "serialHash": "0x..." }
```
