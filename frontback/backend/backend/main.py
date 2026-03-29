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
from audit_service import create_or_update_audit_for_license

models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="IOTA License API")

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


@app.post("/license/mint", dependencies=[Depends(verify_api_key)])
def mint_license(data: schemas.MintLicenseRequest, db: Session = Depends(get_db)):
    license_row = models.License(
        onchain_license_id=data.onchain_license_id,
        product_id=data.product_id,
        license_key=data.license_key,
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
    db.add(license_row)

    tx = models.ChainTx(
        action="mint_license",
        wallet=data.wallet,
        tx_digest=data.tx_digest,
        object_id=data.onchain_license_id,
        status="submitted",
        payload_json=json.dumps(data.model_dump()),
    )
    db.add(tx)

    db.commit()
    db.refresh(license_row)

    if license_row.onchain_license_id:
        create_or_update_audit_for_license(db, license_row)

    return {
        "success": True,
        "message": "Mint transaction saved",
        "db_id": license_row.id,
        "onchain_license_id": data.onchain_license_id,
        "tx_digest": data.tx_digest,
    }


@app.post("/license/activate", dependencies=[Depends(verify_api_key)])
def activate_license(data: schemas.ActivateLicenseRequest, db: Session = Depends(get_db)):
    license_row = (
        db.query(models.License)
        .filter(models.License.onchain_license_id == data.onchain_license_id)
        .first()
    )
    if not license_row:
        raise HTTPException(status_code=404, detail="License not found in DB")

    license_row.owner_wallet = data.wallet
    license_row.status = "activated"
    license_row.tx_digest = data.tx_digest

    tx = models.ChainTx(
        action="activate_license",
        wallet=data.wallet,
        tx_digest=data.tx_digest,
        object_id=data.onchain_license_id,
        status="submitted",
        payload_json=json.dumps(data.model_dump()),
    )
    db.add(tx)
    db.commit()

    create_or_update_audit_for_license(db, license_row)

    return {
        "success": True,
        "message": "Activation transaction saved",
        "onchain_license_id": data.onchain_license_id,
        "tx_digest": data.tx_digest,
    }


@app.post("/license/revoke", dependencies=[Depends(verify_api_key)])
def revoke_license(data: schemas.RevokeLicenseRequest, db: Session = Depends(get_db)):
    license_row = (
        db.query(models.License)
        .filter(models.License.onchain_license_id == data.onchain_license_id)
        .first()
    )
    if not license_row:
        raise HTTPException(status_code=404, detail="License not found in DB")

    license_row.revoked = True
    license_row.status = "revoked"
    license_row.tx_digest = data.tx_digest

    tx = models.ChainTx(
        action="revoke_license",
        wallet=data.wallet,
        tx_digest=data.tx_digest,
        object_id=data.onchain_license_id,
        status="submitted",
        payload_json=json.dumps(data.model_dump()),
    )
    db.add(tx)
    db.commit()

    create_or_update_audit_for_license(db, license_row)

    return {
        "success": True,
        "message": "Revoke transaction saved",
        "onchain_license_id": data.onchain_license_id,
        "tx_digest": data.tx_digest,
    }


@app.post("/sync/transactions", dependencies=[Depends(verify_api_key)])
def sync_transactions(db: Session = Depends(get_db)):
    sync_submitted_transactions(db)
    return {"success": True, "message": "Transaction sync completed"}


@app.get("/license/check/all")
def check_all_licenses(db: Session = Depends(get_db)):
    sync_submitted_transactions(db)

    licenses = db.query(models.License).order_by(models.License.id.desc()).all()

    return [
        {
            "id": l.id,
            "product_id": l.product_id,
            "license_key": l.license_key,
            "vendor_wallet": l.vendor_wallet,
            "owner_wallet": l.owner_wallet,
            "status": l.status,
            "onchain_license_id": l.onchain_license_id or "—",
            "expiry_date": l.expiry_date,
            "max_devices": l.max_devices,
            "current_devices": l.current_devices,
            "revoked": l.revoked,
            "tx_digest": l.tx_digest,
        }
        for l in licenses
    ]


@app.get("/license/check/{license_id}", response_model=schemas.LicenseCheckResponse)
def check_license(license_id: str, db: Session = Depends(get_db)):
    sync_submitted_transactions(db)

    license_row = (
        db.query(models.License)
        .filter(models.License.onchain_license_id == license_id)
        .first()
    )

    if not license_row:
        return schemas.LicenseCheckResponse(
            found=False,
            valid=False,
            status="not_found",
            reason="License not found in DB",
        )

    try:
        chain_obj = get_object(license_id)
    except Exception as exc:
        return schemas.LicenseCheckResponse(
            found=True,
            valid=(license_row.status == "activated" and not license_row.revoked),
            status=license_row.status,
            onchain_license_id=license_row.onchain_license_id,
            product_id=license_row.product_id,
            vendor_wallet=license_row.vendor_wallet,
            owner_wallet=license_row.owner_wallet,
            activated=(license_row.status == "activated"),
            revoked=license_row.revoked,
            expiry_date=int(license_row.expiry_date or 0),
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

    return schemas.LicenseCheckResponse(
        found=True,
        valid=valid,
        status=status,
        onchain_license_id=license_id,
        product_id=fields.get("product_id"),
        vendor_wallet=fields.get("vendor"),
        owner_wallet=owner_wallet,
        activated=activated,
        revoked=revoked,
        expiry_date=expiry_date,
        reason=None if valid else "License inactive, not activated, revoked, or expired",
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
        license_key=audit_row.license_key,
        vendor_wallet=audit_row.vendor_wallet,
        owner_wallet=audit_row.owner_wallet,
        network=audit_row.network,
        issued_at=audit_row.issued_at,
        audit_payload=json.loads(audit_row.audit_payload),
        signature=audit_row.signature,
    )


@app.get("/audit/{tx_digest}/export")
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
        "license_key": audit_row.license_key,
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