import os
import json
import hmac
import hashlib
from datetime import datetime, timezone

import models


AUDIT_SIGNING_KEY = os.getenv("AUDIT_SIGNING_KEY", "dev-audit-secret")
AUDIT_NETWORK = os.getenv("AUDIT_NETWORK", "testnet")


def _canonical_json(data: dict) -> str:
    return json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def sign_audit_payload(payload: dict) -> str:
    canonical = _canonical_json(payload).encode("utf-8")
    signature = hmac.new(
        AUDIT_SIGNING_KEY.encode("utf-8"),
        canonical,
        hashlib.sha256,
    ).hexdigest()
    return signature


def build_audit_payload(license_row: models.License) -> dict:
    issued_at = datetime.now(timezone.utc).isoformat()

    payload = {
        "version": "1.0",
        "record_type": "notarial_record",
        "product_id": license_row.product_id,
        "license_key": license_row.license_key,
        "tx_digest": license_row.tx_digest,
        "onchain_object_id": license_row.onchain_license_id,
        "vendor_wallet": license_row.vendor_wallet,
        "owner_wallet": license_row.owner_wallet,
        "network": AUDIT_NETWORK,
        "status": license_row.status,
        "revoked": license_row.revoked,
        "expiry_date": license_row.expiry_date,
        "issued_at": issued_at,
    }
    return payload


def create_or_update_audit_for_license(db, license_row: models.License):
    if not license_row.tx_digest:
        return None

    payload = build_audit_payload(license_row)
    signature = sign_audit_payload(payload)
    payload_json = _canonical_json(payload)

    audit_row = (
        db.query(models.AuditRecord)
        .filter(models.AuditRecord.tx_digest == license_row.tx_digest)
        .first()
    )

    if audit_row:
        audit_row.onchain_object_id = license_row.onchain_license_id
        audit_row.product_id = license_row.product_id
        audit_row.license_key = license_row.license_key
        audit_row.vendor_wallet = license_row.vendor_wallet
        audit_row.owner_wallet = license_row.owner_wallet
        audit_row.network = AUDIT_NETWORK
        audit_row.audit_payload = payload_json
        audit_row.signature = signature
        audit_row.issued_at = payload["issued_at"]
    else:
        audit_row = models.AuditRecord(
            tx_digest=license_row.tx_digest,
            onchain_object_id=license_row.onchain_license_id,
            product_id=license_row.product_id,
            license_key=license_row.license_key,
            vendor_wallet=license_row.vendor_wallet,
            owner_wallet=license_row.owner_wallet,
            network=AUDIT_NETWORK,
            audit_payload=payload_json,
            signature=signature,
            issued_at=payload["issued_at"],
        )
        db.add(audit_row)

    db.commit()
    db.refresh(audit_row)
    return audit_row