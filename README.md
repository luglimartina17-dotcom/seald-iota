# SealD — Digital Rights on IOTA

An end-to-end system for issuing, anchoring, managing, and verifying digital rights on the IOTA blockchain. Each right is a Move object on-chain with ownership, status flags, timestamps, and programmable expiry, backed by a FastAPI backend with an off-chain state mirror, audit trail, selective disclosure, and a public verification endpoint for machine-readable validity checks. The project targets organizations that issue or hold rights requiring third-party verification: notary offices, IP rights managers, enterprise software vendors, law firms, and regulated operators in critical infrastructure.

## MVP (Current)

- **On-chain digital rights as Move objects** with ownership, expiry, revocation flags, device limits, and validity checks enforced on-chain
- **Entry functions**: `register_vendor`, `mint_right`, `activate_right`, `revoke_right`, `add_device`, `remove_device`, `renew_right` (consume-and-recreate lifecycle)
- **FastAPI backend** with state mirror, transaction sync, HMAC-signed audit records, and selective disclosure
- **Public verification endpoint** `GET /right/check/{id}` — cross-checks live chain data with the indexed DB
- **Audit endpoints** — full audit record retrieval, partial export, and selective disclosure with signed payloads
- **React/TypeScript dashboard** for vendors to mint, activate, revoke, and verify rights, with an audit page for record viewing, export, and selective disclosure

## Planned Roadmap

- **IOTA Identity (DID/VC) integration** — bind issuers and holders to DIDs, issue Verifiable Credentials for rights
- **Full VC-based selective disclosure** — replace current HMAC approach with Verifiable Presentations
- **Signed evidence objects** — exportable JSON/PDF with QR code pointing to public verification page
- **Compliance dashboard** — period-based reporting, exportable evidence, compliance-oriented views
- **Multi-tenant backend** — role-based access with strict data isolation
- **Async job processing** — background workers for blockchain interactions with retries and monitoring
- **Gas Station integration** — sponsored transactions for non-technical end-users

## Architecture

The system has three tiers:

1. **Smart Contracts** (Move on IOTA MoveVM) — hold the authoritative state of each `DigitalRight` object and `VendorRegistry`, enforcing ownership, activation, expiry, revocation, and device limits through guarded entry functions. Events are emitted for every lifecycle step.

2. **Backend** (Python/FastAPI + SQLite) — orchestration and persistence layer. Exposes REST APIs, stores an indexed mirror of on-chain rights and transaction records, updates them by polling an IOTA testnet RPC node, and generates HMAC-signed audit records with selective disclosure.

3. **Frontend** (React/TypeScript) — vendor dashboard for minting, activating, revoking, and verifying rights, plus an audit page for viewing, exporting, and selectively disclosing audit records. Connects to IOTA wallets via `@iota/dapp-kit` for transaction signing.

## Repository Structure

```
contracts/
  digital_rights.move     # Move smart contract (DigitalRight, VendorRegistry)
backend/
  main.py                 # FastAPI application with all endpoints
  models.py               # SQLAlchemy ORM models (Right, ChainTx, AuditRecord)
  schemas.py              # Pydantic request/response schemas
  audit_service.py        # HMAC audit signing and selective disclosure
  sync_service.py         # Transaction sync with IOTA RPC
  iota_reader.py          # IOTA RPC client helpers
  db.py                   # Database configuration
  .env.example            # Environment variable template
  requirements.txt        # Python dependencies
frontend/
  src/
    App.tsx               # Main React component with navigation
    RightActions.tsx        # Dashboard, verification, and audit UI (RightActions component)
    iotaConfig.ts          # IOTA package/registry IDs and backend URL
    main.tsx               # React entry point with IOTA providers
Move.toml                  # Move package configuration
```

## Setup

### Smart Contracts

```bash
# Install IOTA CLI: https://docs.iota.org/developer/getting-started/install-iota
iota move build
iota client publish --gas-budget 100000000
```

After deploying, update `PACKAGE_ID` and `REGISTRY_ID` in `frontend/src/iotaConfig.ts`.

### Backend

```bash
cd backend
cp .env.example .env    # Edit with your values
pip install -r requirements.txt
uvicorn main:app --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Terminology

This project recently migrated from "license/software license" terminology to "right/digital rights" to better reflect its broader scope beyond software licensing. The Move module is now `digital_rights::digital_rights`, the main struct is `DigitalRight`, and all API endpoints use `/right/*` paths. Some internal variable names or comments may still reference the old terminology — see `TODO.md` for tracked residuals.
