# Frontend（B）

## Install

```bash
cd frontend
pnpm install
```

## Setup

```bash
cp .env.example .env
```

Fill:

- `VITE_SHOPS_ADDRESS`
- `VITE_ITEMS_ADDRESS`

Optional:

- `VITE_WORKER_URL` for permit fetching (serial / risk).
- `VITE_APNTS_SALE_URL` for external aPNTs sale entry.
- `VITE_GTOKEN_SALE_URL` for external GToken sale entry.

## Run

```bash
pnpm run dev
```

## Pages

- Plaza: `#/plaza`
- aPNTs Sale: `#/sale-apnts`
- GToken Sale: `#/sale-gtoken`
- Risk Assessment: `#/risk`
- Buyer: `#/buyer`
- Shop Console: `#/shop-console`
- Protocol Console: `#/protocol-console`
- Config: `#/config`

## Checks

```bash
pnpm check
pnpm lint
pnpm test:e2e
```
