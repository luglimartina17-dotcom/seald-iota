# IOTA Digital Rights MVP

An end-to-end MVP for issuing, anchoring, managing, and verifying digital rights on the IOTA blockchain.

## Project overview

This project began as a software licensing and anti-piracy system, but it is now being reframed around a broader and more flexible concept: **digital rights management on IOTA**.

The current repository contains the general MVP architecture already implemented across smart contracts, backend services, and frontend work in progress.  
The long-term vision is to evolve this foundation into a privacy-aware, compliance-oriented digital rights infrastructure.

## Current MVP

The project provides an end-to-end MVP for issuing, anchoring, managing, and verifying software-related digital rights on the IOTA blockchain.

In the current implementation, each right is represented by a Move object on-chain with ownership, status flags, timestamps, expiry, and usage constraints.  
A FastAPI backend consumes structured on-chain events, mirrors the state in a local database, and exposes machine-readable APIs and public verification endpoints for third-party verifiers.

In the MVP, state transitions such as minting, activation, revocation, and device-related updates are enforced by the Move smart contract and recorded via structured events.  
This already gives issuers a tamper-evident and audit-ready history tied to transaction digests, without relying only on a centralized database.

## Core value proposition

The value proposition is threefold:

1. **Self-enforcing rights**  
   Expiry, revocation, and usage constraints are enforced by Move smart contracts rather than only by a central server.

2. **Audit-oriented lifecycle tracking**  
   Every state change is anchored on-chain and surfaced through an audit-oriented backend and verification layer, reducing ambiguity in compliance and dispute resolution.

3. **Privacy-preserving roadmap**  
   The architecture is explicitly designed to support future DID/VC integration and selective disclosure, aligned with real-world legal and regulatory constraints.

## System architecture

The system has three main layers:

### Smart contracts on IOTA MoveVM
Move modules store digital rights as objects and enforce ownership, activation, expiry, revocation, and usage rules.  
Each important lifecycle step emits structured events for indexing and auditability.

### FastAPI backend
The backend talks to an IOTA testnet RPC node, mirrors right state and transactions in a local database, and exposes REST APIs plus public verification endpoints.  
These services cross-check live on-chain data with the local mirror to support verifiers and operational workflows.

### React / TypeScript frontend
The frontend is being developed to provide dashboards for issuers and verifiers to manage rights and run validity checks through backend APIs.  
The next step is browser-side transaction signing through IOTA wallet tooling.

## Planned / to be implemented

The current repository represents the MVP foundation.  
The broader roadmap includes:

- Full consume-and-recreate lifecycle transitions for rights
- Signed evidence objects in JSON / PDF with QR support
- Audit and compliance export layer
- Compliance-oriented dashboard
- DID and Verifiable Credential integration via IOTA Identity
- Selective disclosure flows, so holders reveal only the minimum necessary fields to verifiers
- Improved browser wallet integration for user-controlled signing

## Repository structure

```text
.
├── contracts/   # IOTA Move smart contracts for digital rights
├── backend/     # FastAPI services, indexing, verification APIs
├── frontend/    # React/TypeScript frontend
├── Move.toml
└── Move.lock
```

## Terminology note

Some parts of the current codebase still use the legacy term `license` because the MVP was originally designed around software licensing.  
The repository is being progressively updated so that both naming and product framing move toward **digital rights**.

## Status

General MVP implemented.  
Repository structure, terminology, and product positioning are being updated to match the new digital rights vision.