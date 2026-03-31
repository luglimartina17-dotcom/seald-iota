import json
import os
import time
from fastapi import FastAPI, Depends, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

import models
import schemas
from db import SessionLocal, engine
from iota_reader import get_object
from sync_service import sync_submitted_transactions
from audit_service import (
    create_or_update_audit_for_right,
    build_and_sign_selective_disclosure,
)

models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="IOTA Digital Rights API")

# CORS
_raw_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173")
ALLOWED_ORIGINS = [o.strip() for o in _raw_origins.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API Key
API_KEY = os.getenv("API_KEY", "")


def verify_api_key(x_api_key: str = Header(default=None)):
    if not API_KEY:
        return
    if x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail="API key non valida o mancante")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@app.post("/vendor/register", dependencies=[Depends(verify_api_key)])
def register_vendor(data: schemas.RegisterVendorRequest, db: Session = Depends(get_db)):
    tx = models.ChainTx(
        action="register_vendor",
        wallet=data.wallet,
        tx_digest=data.tx_digest,
        status="submitted",
        payload_json=json.dumps(data.model_dump()),
    )
    db.add(tx)
    db.commit()
    return {
        "success": True,
        "message": "Vendor registration transaction saved",
        "tx_digest": data.tx_digest,
    }


@app.post("/right/mint", dependencies=[Depends(verify_api_key)])
def mint_right(data: schemas.MintRightRequest, db: Session = Depends(get_db)):
    right_row = models.Right(
        onchain_right_id=data.onchain_right_id,
        product_id=data.product_id,
        right_key=data.right_key,
        vendor_wallet=data.wallet,
        owner_wallet=data.wallet,
        status="minted",
        expiry_date=str(data.expiry_date),
        max_devices=data.max_devices,
        current_devices=0,
        revoked=False,
        tx_digest=data.tx_digest,
        raw_payload=json.dumps(data.model_dump()),
    )
    db.add(right_row)

    tx = models.ChainTx(
        action="mint_right",
        wallet=data.wallet,
        tx_digest=data.tx_digest,
        object_id=data.onchain_right_id,
        status="submitted",
        payload_json=json.dumps(data.model_dump()),
    )
    db.add(tx)

    db.commit()
    db.refresh(right_row)

    if right_row.onchain_right_id:
        create_or_update_audit_for_right(db, right_row)

    return {
        "success": True,
        "message": "Mint transaction saved",
        "db_id": right_row.id,
        "onchain_right_id": data.onchain_right_id,
        "tx_digest": data.tx_digest,
    }


@app.post("/right/activate", dependencies=[Depends(verify_api_key)])
def activate_right(data: schemas.ActivateRightRequest, db: Session = Depends(get_db)):
    right_row = (
        db.query(models.Right)
        .filter(models.Right.onchain_right_id == data.onchain_right_id)
        .first()
    )
    if not right_row:
        raise HTTPException(status_code=404, detail="Right not found in DB")

    right_row.owner_wallet = data.wallet
    right_row.status = "activated"
    right_row.tx_digest = data.tx_digest

    tx = models.ChainTx(
        action="activate_right",
        wallet=data.wallet,
        tx_digest=data.tx_digest,
        object_id=data.onchain_right_id,
        status="submitted",
        payload_json=json.dumps(data.model_dump()),
    )
    db.add(tx)
    db.commit()

    create_or_update_audit_for_right(db, right_row)

    return {
        "success": True,
        "message": "Activation transaction saved",
        "onchain_right_id": data.onchain_right_id,
        "tx_digest": data.tx_digest,
    }


@app.post("/right/revoke", dependencies=[Depends(verify_api_key)])
def revoke_right(data: schemas.RevokeRightRequest, db: Session = Depends(get_db)):
    right_row = (
        db.query(models.Right)
        .filter(models.Right.onchain_right_id == data.onchain_right_id)
        .first()
    )
    if not right_row:
        raise HTTPException(status_code=404, detail="Right not found in DB")

    right_row.revoked = True
    right_row.status = "revoked"
    right_row.tx_digest = data.tx_digest

    tx = models.ChainTx(
        action="revoke_right",
        wallet=data.wallet,
        tx_digest=data.tx_digest,
        object_id=data.onchain_right_id,
        status="submitted",
        payload_json=json.dumps(data.model_dump()),
    )
    db.add(tx)
    db.commit()

    create_or_update_audit_for_right(db, right_row)

    return {
        "success": True,
        "message": "Revoke transaction saved",
        "onchain_right_id": data.onchain_right_id,
        "tx_digest": data.tx_digest,
    }


@app.post("/right/renew", dependencies=[Depends(verify_api_key)])
def renew_right(data: schemas.RenewRightRequest, db: Session = Depends(get_db)):
    old_right = (
        db.query(models.Right)
        .filter(models.Right.onchain_right_id == data.old_onchain_right_id)
        .first()
    )
    if not old_right:
        raise HTTPException(status_code=404, detail="Old right not found in DB")

    old_right.status = "renewed"

    new_right = models.Right(
        onchain_right_id=data.new_onchain_right_id,
        product_id=old_right.product_id,
        right_key=old_right.right_key,
        vendor_wallet=old_right.vendor_wallet,
        owner_wallet=data.wallet,
        status="minted",
        expiry_date=str(data.new_expiry_date),
        max_devices=old_right.max_devices,
        current_devices=old_right.current_devices,
        revoked=False,
        tx_digest=data.tx_digest,
        raw_payload=json.dumps(data.model_dump()),
    )
    db.add(new_right)

    tx = models.ChainTx(
        action="renew_right",
        wallet=data.wallet,
        tx_digest=data.tx_digest,
        object_id=data.new_onchain_right_id,
        status="submitted",
        payload_json=json.dumps(data.model_dump()),
    )
    db.add(tx)

    db.commit()
    db.refresh(new_right)

    if new_right.onchain_right_id:
        create_or_update_audit_for_right(db, new_right)

    return {
        "success": True,
        "message": "Renew transaction saved",
        "old_onchain_right_id": data.old_onchain_right_id,
        "new_onchain_right_id": data.new_onchain_right_id,
        "tx_digest": data.tx_digest,
    }


@app.post("/sync/transactions", dependencies=[Depends(verify_api_key)])
def sync_transactions(db: Session = Depends(get_db)):
    sync_submitted_transactions(db)
    return {"success": True, "message": "Transaction sync completed"}


@app.get("/right/check/all")
def check_all_rights(db: Session = Depends(get_db)):
    sync_submitted_transactions(db)

    rights = db.query(models.Right).order_by(models.Right.id.desc()).all()

    return [
        {
            "id": r.id,
            "product_id": r.product_id,
            "right_key": r.right_key,
            "vendor_wallet": r.vendor_wallet,
            "owner_wallet": r.owner_wallet,
            "status": r.status,
            "onchain_right_id": r.onchain_right_id or "\u2014",
            "expiry_date": r.expiry_date,
            "max_devices": r.max_devices,
            "current_devices": r.current_devices,
            "revoked": r.revoked,
            "tx_digest": r.tx_digest,
        }
        for r in rights
    ]


@app.get("/right/check/{right_id}", response_model=schemas.RightCheckResponse)
def check_right(right_id: str, db: Session = Depends(get_db)):
    sync_submitted_transactions(db)

    right_row = (
        db.query(models.Right)
        .filter(models.Right.onchain_right_id == right_id)
        .first()
    )

    if not right_row:
        return schemas.RightCheckResponse(
            found=False,
            valid=False,
            status="not_found",
            reason="Right not found in DB",
        )

    try:
        chain_obj = get_object(right_id)
    except Exception as exc:
        return schemas.RightCheckResponse(
            found=True,
            valid=(right_row.status == "activated" and not right_row.revoked),
            status=right_row.status,
            onchain_right_id=right_row.onchain_right_id,
            product_id=right_row.product_id,
            vendor_wallet=right_row.vendor_wallet,
            owner_wallet=right_row.owner_wallet,
            activated=(right_row.status == "activated"),
            revoked=right_row.revoked,
            expiry_date=int(right_row.expiry_date or 0),
            reason=f"RPC unavailable, fallback DB only: {exc}",
        )

    data = chain_obj.get("data", {})
    content = data.get("content", {})
    fields = content.get("fields", {}) if isinstance(content, dict) else {}

    is_active = fields.get("is_active", False)
    activated = fields.get("activated", False)
    revoked = fields.get("revoked", False)
    expiry_date = int(fields.get("expiry_date", 0) or 0)

    now_ms = int(time.time() * 1000)
    valid = bool(
        is_active
        and activated
        and not revoked
        and (expiry_date == 0 or now_ms < expiry_date)
    )

    status = "valid" if valid else "invalid"

    owner_data = data.get("owner") or {}
    owner_wallet = owner_data.get("AddressOwner") if isinstance(owner_data, dict) else None

    return schemas.RightCheckResponse(
        found=True,
        valid=valid,
        status=status,
        onchain_right_id=right_id,
        product_id=fields.get("product_id"),
        vendor_wallet=fields.get("vendor"),
        owner_wallet=owner_wallet,
        activated=activated,
        revoked=revoked,
        expiry_date=expiry_date,
        reason=None if valid else "Right inactive, not activated, revoked, or expired",
    )


@app.get("/audit/{tx_digest}", response_model=schemas.AuditResponse)
def get_audit(tx_digest: str, db: Session = Depends(get_db)):
    sync_submitted_transactions(db)

    audit_row = (
        db.query(models.AuditRecord)
        .filter(models.AuditRecord.tx_digest == tx_digest)
        .first()
    )

    if not audit_row:
        return schemas.AuditResponse(found=False)

    return schemas.AuditResponse(
        found=True,
        tx_digest=audit_row.tx_digest,
        onchain_object_id=audit_row.onchain_object_id,
        product_id=audit_row.product_id,
        right_key=audit_row.right_key,
        vendor_wallet=audit_row.vendor_wallet,
        owner_wallet=audit_row.owner_wallet,
        network=audit_row.network,
        issued_at=audit_row.issued_at,
        audit_payload=json.loads(audit_row.audit_payload),
        signature=audit_row.signature,
    )


@app.post("/audit/{tx_digest}/export/partial")
def export_audit(tx_digest: str, db: Session = Depends(get_db)):
    sync_submitted_transactions(db)

    audit_row = (
        db.query(models.AuditRecord)
        .filter(models.AuditRecord.tx_digest == tx_digest)
        .first()
    )

    if not audit_row:
        raise HTTPException(status_code=404, detail="Audit not found")

    export_payload = {
        "tx_digest": audit_row.tx_digest,
        "onchain_object_id": audit_row.onchain_object_id,
        "product_id": audit_row.product_id,
        "right_key": audit_row.right_key,
        "vendor_wallet": audit_row.vendor_wallet,
        "owner_wallet": audit_row.owner_wallet,
        "network": audit_row.network,
        "issued_at": audit_row.issued_at,
        "audit_payload": json.loads(audit_row.audit_payload),
        "signature": audit_row.signature,
    }

    return JSONResponse(
        content=export_payload,
        headers={
            "Content-Disposition": f'attachment; filename="audit-{tx_digest}.json"'
        },
    )


@app.post("/audit/{tx_digest}/disclose", response_model=schemas.SelectiveDisclosureResponse)
def disclose_audit(
    tx_digest: str,
    request: schemas.SelectiveDisclosureRequest,
    db: Session = Depends(get_db),
):
    sync_submitted_transactions(db)

    audit_row = (
        db.query(models.AuditRecord)
        .filter(models.AuditRecord.tx_digest == tx_digest)
        .first()
    )

    if not audit_row:
        return schemas.SelectiveDisclosureResponse(found=False)

    disclosure = build_and_sign_selective_disclosure(audit_row, request.fields)

    return schemas.SelectiveDisclosureResponse(
        found=True,
        tx_digest=disclosure["tx_digest"],
        disclosed_fields=disclosure["disclosed_fields"],
        disclosed_payload=disclosure["disclosed_payload"],
        signature=disclosure["signature"],
    )


@app.post("/audit/{tx_digest}/disclose/export")
def export_disclosed_audit(
    tx_digest: str,
    request: schemas.SelectiveDisclosureRequest,
    db: Session = Depends(get_db),
):
    sync_submitted_transactions(db)

    audit_row = (
        db.query(models.AuditRecord)
        .filter(models.AuditRecord.tx_digest == tx_digest)
        .first()
    )

    if not audit_row:
        raise HTTPException(status_code=404, detail="Audit not found")

    disclosure = build_and_sign_selective_disclosure(audit_row, request.fields)

    export_payload = {
        "tx_digest": disclosure["tx_digest"],
        "disclosed_fields": disclosure["disclosed_fields"],
        "disclosed_payload": disclosure["disclosed_payload"],
        "signature": disclosure["signature"],
    }

    return JSONResponse(
        content=export_payload,
        headers={
            "Content-Disposition": f'attachment; filename="audit-disclosure-{tx_digest}.json"'
        },
    )
