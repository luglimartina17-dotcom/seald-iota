# Contracts — IOTA Move Smart Contracts

Move modules on IOTA MoveVM for the SealD digital rights platform.

## Module: `digital_rights::digital_rights`

### Structs

| Struct | Abilities | Description |
|--------|-----------|-------------|
| `DigitalRight` | key, store | On-chain digital right object with ownership, expiry, revocation, device limits |
| `VendorRegistry` | key | Shared registry of registered vendors |
| `VendorInfo` | store | Individual vendor metadata |
| `AdminCap` | key, store | Admin capability object |

### Entry Functions

| Function | Description |
|----------|-------------|
| `register_vendor` | Register a vendor in the shared registry |
| `mint_right` | Mint a new digital right NFT |
| `activate_right` | Activate a right with an activation code |
| `revoke_right` | Revoke a right (vendor only) |
| `add_device` | Add a device to an activated right |
| `remove_device` | Remove a device from a right |
| `renew_right` | Consume-and-recreate: destroy old right, create renewed version |

### Events

| Event | Emitted by |
|-------|-----------|
| `RightMinted` | `mint_right` |
| `RightActivated` | `activate_right` |
| `RightRevoked` | `revoke_right` |
| `DeviceAdded` | `add_device` |
| `DeviceRemoved` | `remove_device` |
| `RightRenewed` | `renew_right` |

### Consume-and-Recreate Pattern

The `renew_right` function implements the consume-and-recreate lifecycle: it destructures the old `DigitalRight` object, deletes it, and creates a new object with the same data but an updated expiry date. This produces an append-only, tamper-evident history that auditors can reconstruct from the chain of `RightRenewed` events linking old and new object IDs.

### Planned Evolution

- IOTA Identity DID/VC integration for trusted issuer credentials
- Richer metadata fields for broader digital right types
- Privacy-preserving verification flows
