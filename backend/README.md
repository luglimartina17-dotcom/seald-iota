# Backend — IOTA Digital Rights API

Python/FastAPI backend for the SealD digital rights platform.

## Endpoints

### Vendor
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/vendor/register` | API key | Register a new vendor on-chain |

### Rights
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/right/mint` | API key | Mint a new digital right |
| POST | `/right/activate` | API key | Activate an existing right |
| POST | `/right/revoke` | API key | Revoke a right |
| POST | `/right/renew` | API key | Renew a right (consume-and-recreate) |
| GET | `/right/check/all` | Public | List all rights |
| GET | `/right/check/{right_id}` | Public | Verify a right against chain + DB |

### Audit & Selective Disclosure
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/audit/{tx_digest}` | Public | Get full signed audit record |
| POST | `/audit/{tx_digest}/export/partial` | Public | Download audit as JSON |
| POST | `/audit/{tx_digest}/disclose` | Public | Selective disclosure — reveal chosen fields only |
| POST | `/audit/{tx_digest}/disclose/export` | Public | Download disclosed payload as JSON |

### System
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/sync/transactions` | API key | Trigger transaction sync from IOTA RPC |

## Models

- **Right** — off-chain mirror of an on-chain `DigitalRight` object
- **ChainTx** — tracks submitted transactions and their confirmation status
- **AuditRecord** — HMAC-signed audit records tied to transaction digests

## Audit Service

Every mint, activate, and revoke operation generates an `AuditRecord` with an HMAC-SHA256 signature over a canonical JSON payload. The selective disclosure MVP allows callers to request a subset of fields from the audit record; the server returns only those fields plus a new signature over the disclosed subset.

## Selective Disclosure (MVP)

The current implementation uses server-side field filtering with HMAC signing. This is an MVP placeholder — the planned evolution is to replace this with IOTA Identity Verifiable Credentials and Verifiable Presentations for cryptographic selective disclosure.

## Setup

```bash
cp .env.example .env    # Edit with your values
pip install -r requirements.txt
uvicorn main:app --reload
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `IOTA_RPC` | IOTA testnet RPC URL | `https://api.testnet.iota.cafe` |
| `API_KEY` | API key for protected endpoints | (empty = no auth) |
| `ALLOWED_ORIGINS` | CORS origins | `http://localhost:5173` |
| `AUDIT_SIGNING_KEY` | HMAC key for audit signatures | `dev-audit-secret` |
| `AUDIT_NETWORK` | Network identifier in audit records | `testnet` |
