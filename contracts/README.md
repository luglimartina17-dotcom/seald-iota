# Contracts

This folder contains the IOTA Move smart contracts that define the lifecycle of digital rights on-chain.

## Current role in the MVP

In the current MVP, each right is modeled as an on-chain object with:

- ownership
- activation state
- expiry information
- revocation status
- usage / device constraints
- lifecycle timestamps

The smart contract enforces critical transitions such as issuance, activation, revocation, and device updates, while emitting structured events consumed by the backend.

## Terminology

The current source code still contains legacy names such as `SoftwareLicense` and `license` because the MVP started as a software licensing project.  
Conceptually, these objects are now treated as **digital rights**.

## Planned evolution

Future iterations will move toward:

- right-centric naming across modules and structs
- consume-and-recreate lifecycle modeling
- richer metadata for digital rights
- privacy-preserving verification flows
- DID / VC integration and selective disclosure