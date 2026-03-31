# Frontend — SealD Digital Rights Dashboard

React/TypeScript frontend for the SealD digital rights platform.

## Pages

- **DashboardPage** (`DashboardPage.tsx`) — vendor dashboard: register vendor, mint rights, activate, revoke, renew, view rights table with stats
- **VerifyPage** (`VerifyPage.tsx`) — public verification page (wallet-free):
  - Hero section with search bar (enter any on-chain right ID)
  - Status card showing VALID/INVALID/REVOKED/EXPIRED with field grid (product ID, wallets, expiry, etc.)
  - Audit trail section with transaction digest, HMAC signature, network badge, timestamp
  - Selective disclosure section with 13 toggleable field chips, live JSON preview, Disclose + Export buttons

The app uses a pixel-art design system with `Press Start 2P` font and `#2752F5` blue accent.

## API Integration

All API calls target the backend at `BACKEND_URL` (configured in `iotaConfig.ts`):

| Endpoint | Used by |
|----------|---------|
| `POST /vendor/register` | Dashboard — vendor registration |
| `POST /right/mint` | Dashboard — mint new right |
| `POST /right/activate` | Dashboard — activate right |
| `POST /right/revoke` | Dashboard — revoke right |
| `POST /right/renew` | Dashboard — renew right |
| `GET /right/check/all` | Dashboard — load rights table |
| `GET /right/verify/{right_id}` | Verify — unified verification (status + audit) |
| `GET /audit/{tx_digest}` | Verify — view audit record |
| `POST /audit/{tx_digest}/export/partial` | Verify — export full audit JSON |
| `POST /audit/{tx_digest}/disclose` | Verify — selective disclosure |
| `POST /audit/{tx_digest}/disclose/export` | Verify — export disclosed JSON |

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
