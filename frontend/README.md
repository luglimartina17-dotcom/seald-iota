# Frontend — SealD Digital Rights Dashboard

React/TypeScript frontend for the SealD digital rights platform.

## Pages

- **Dashboard** — vendor registration, right minting, activation, revocation, rights table
- **Check** — public right verification by on-chain ID
- **Audit** — view audit records, export audit JSON, selective disclosure form

## API Integration

All API calls target the backend at `BACKEND_URL` (configured in `iotaConfig.ts`):

| Endpoint | Used by |
|----------|---------|
| `POST /vendor/register` | Dashboard — vendor registration |
| `POST /right/mint` | Dashboard — mint new right |
| `POST /right/activate` | Dashboard — activate right |
| `POST /right/revoke` | Dashboard — revoke right |
| `GET /right/check/all` | Dashboard — load rights table |
| `GET /right/check/{id}` | Check — verify right |
| `GET /audit/{tx_digest}` | Audit — view audit record |
| `POST /audit/{tx_digest}/export/partial` | Audit — export full audit JSON |
| `POST /audit/{tx_digest}/disclose` | Audit — selective disclosure |
| `POST /audit/{tx_digest}/disclose/export` | Audit — export disclosed JSON |

## IOTA Integration

- Wallet connection via `@iota/dapp-kit` (`ConnectButton`, `useCurrentAccount`, `useSignAndExecuteTransaction`)
- Transaction construction via `@iota/iota-sdk/transactions`
- Move call targets: `digital_rights::digital_rights::*`
- On-chain IDs configured in `iotaConfig.ts`: `PACKAGE_ID`, `REGISTRY_ID`, `CLOCK_ID`

## Setup

```bash
npm install
npm run dev       # Development server on http://localhost:5173
npm run build     # Production build
```

## Configuration

Edit `frontend/src/iotaConfig.ts` to set:
- `PACKAGE_ID` — deployed Move package object ID
- `REGISTRY_ID` — shared VendorRegistry object ID
- `CLOCK_ID` — IOTA system clock object
- `BACKEND_URL` — FastAPI backend URL
