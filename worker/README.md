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

## Permit Endpoints

- `GET /health`
- `GET /serial-permit?itemId=&buyer=&serial=&deadline=&nonce=`
- `GET /risk-allowance?shopOwner=&maxItems=&deadline=&nonce=`

