# TODO — SealD Digital Rights

## Post-Rename Residuals

- [ ] **Smart contract redeployment**: the Move contract has been renamed from `software_license` to `digital_rights` — a fresh deploy is required on testnet
- [ ] **Update PACKAGE_ID and REGISTRY_ID** in `frontend/src/iotaConfig.ts` after redeploying the renamed contract
- [ ] **Database migration**: table name changed from `licenses` to `rights`, column `onchain_license_id` to `onchain_right_id`, `license_key` to `right_key` — existing SQLite databases need migration or recreation
- [ ] **Frontend file rename**: `LicenseActions.tsx` still has the old filename (exports `RightActions`) — rename file to `RightActions.tsx` and update import in `App.tsx`
- [ ] **Frontend: remaining Italian strings** — some placeholder text and date formatting still use Italian locale (e.g. `it-IT` in date formatting); translate to English or make locale configurable

## Roadmap — Next Steps

- [ ] **IOTA Identity integration** — create and resolve DIDs for issuers/holders, issue Verifiable Credentials binding on-chain rights to subjects, generate Verifiable Presentations for selective disclosure
- [ ] **VC-based selective disclosure** — replace current HMAC-signed field filtering with proper VC/VP-based proofs so verifiers get cryptographic guarantees with minimum disclosure
- [ ] **Signed evidence objects** — structured evidence combining document hash, transaction digest, issuer identity, timestamps, and right status; exportable as signed JSON and PDF/HTML with QR code linking to public verification page
- [ ] **Compliance dashboard** — period-based reporting, exportable evidence, compliance-oriented views for regulated industries
- [ ] **Multi-tenant backend** — role-based access control with strict data isolation, hardened production deployment (PostgreSQL, security, logging, backups)
- [ ] **Async workers for blockchain sync** — move blockchain interactions into background workers with retries, monitoring, and alerting
- [ ] **Gas Station integration** — sponsor selected transactions (e.g. activation by end-users) so non-technical users don't need to manage gas
- [ ] **Frontend wallet signing integration** — complete the in-browser transaction signing flow with IOTA wallet adapters
