import os
import json
import hmac
import hashlib
from datetime import datetime, timezone

import models


AUDIT_SIGNING_KEY = os.getenv("AUDIT_SIGNING_KEY", "dev-audit-secret")
AUDIT_NETWORK = os.getenv("AUDIT_NETWORK", "testnet")

# Fields allowed for selective disclosure
ALLOWED_DISCLOSURE_FIELDS = {
    "version",
    "record_type",
    "product_id",
    "right_key",
    "tx_digest",
    "onchain_object_id",
    "vendor_wallet",
    "owner_wallet",
    "network",
    "status",
    "revoked",
    "expiry_date",
    "issued_at",
}


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


def build_audit_payload(right_row: models.Right) -> dict:
    issued_at = datetime.now(timezone.utc).isoformat()

    payload = {
        "version": "1.0",
        "record_type": "digital_right_record",
        "product_id": right_row.product_id,
        "right_key": right_row.right_key,
        "tx_digest": right_row.tx_digest,
        "onchain_object_id": right_row.onchain_right_id,
        "vendor_wallet": right_row.vendor_wallet,
        "owner_wallet": right_row.owner_wallet,
        "network": AUDIT_NETWORK,
        "status": right_row.status,
        "revoked": right_row.revoked,
        "expiry_date": right_row.expiry_date,
        "issued_at": issued_at,
    }
    return payload


def create_or_update_audit_for_right(db, right_row: models.Right):
    if not right_row.tx_digest:
        return None

    payload = build_audit_payload(right_row)
    signature = sign_audit_payload(payload)
    payload_json = _canonical_json(payload)

    audit_row = (
        db.query(models.AuditRecord)
        .filter(models.AuditRecord.tx_digest == right_row.tx_digest)
        .first()
    )

    if audit_row:
        audit_row.onchain_object_id = right_row.onchain_right_id
        audit_row.product_id = right_row.product_id
        audit_row.right_key = right_row.right_key
        audit_row.vendor_wallet = right_row.vendor_wallet
        audit_row.owner_wallet = right_row.owner_wallet
        audit_row.network = AUDIT_NETWORK
        audit_row.audit_payload = payload_json
        audit_row.signature = signature
        audit_row.issued_at = payload["issued_at"]
    else:
        audit_row = models.AuditRecord(
            tx_digest=right_row.tx_digest,
            onchain_object_id=right_row.onchain_right_id,
            product_id=right_row.product_id,
            right_key=right_row.right_key,
            vendor_wallet=right_row.vendor_wallet,
            owner_wallet=right_row.owner_wallet,
            network=AUDIT_NETWORK,
            audit_payload=payload_json,
            signature=signature,
            issued_at=payload["issued_at"],
        )
        db.add(audit_row)

    db.commit()
    db.refresh(audit_row)
    return audit_row


def build_selective_disclosure_payload(audit_payload: dict, requested_fields: list[str]) -> dict:
    valid_fields = [field for field in requested_fields if field in ALLOWED_DISCLOSURE_FIELDS]

    disclosed = {field: audit_payload[field] for field in valid_fields if field in audit_payload}

    return {
        "disclosure_type": "selective_disclosure",
        "base_record_type": audit_payload.get("record_type"),
        "tx_digest": audit_payload.get("tx_digest"),
        "disclosed_fields": valid_fields,
        "disclosed_payload": disclosed,
    }


def build_and_sign_selective_disclosure(audit_row: models.AuditRecord, requested_fields: list[str]) -> dict:
    full_payload = json.loads(audit_row.audit_payload)

    disclosure_payload = build_selective_disclosure_payload(full_payload, requested_fields)
    disclosure_signature = sign_audit_payload(disclosure_payload)

    return {
        "tx_digest": audit_row.tx_digest,
        "disclosed_fields": disclosure_payload["disclosed_fields"],
        "disclosed_payload": disclosure_payload["disclosed_payload"],
        "signature": disclosure_signature,
    }
