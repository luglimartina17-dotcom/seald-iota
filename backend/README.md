# Backend

This folder contains the FastAPI backend for the digital rights MVP.

## Responsibilities

The backend is responsible for:

- connecting to an IOTA testnet RPC node
- consuming and indexing on-chain events
- mirroring right state and transaction history in a local database
- exposing REST APIs for issuers, internal services, and verifiers
- providing public verification endpoints for machine-readable validity checks

## MVP role

In the current MVP, the backend acts as the bridge between blockchain state and application-level verification workflows.  
Its goal is not to replace on-chain truth, but to make rights easier to inspect, query, audit, and verify in operational contexts.

## Planned evolution

The roadmap includes:

- audit export features
- signed JSON / PDF evidence packages
- compliance-oriented reporting
- deeper support for privacy-preserving verification flows