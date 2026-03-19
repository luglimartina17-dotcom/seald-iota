import json
import time
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

import models
import schemas
from db import SessionLocal, engine
from iota_reader import get_object
from sync_service import sync_submitted_transactions

models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="IOTA License API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@app.post("/vendor/register")
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


@app.post("/license/mint")
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

    return {
        "success": True,
        "message": "Mint transaction saved",
        "db_id": license_row.id,
        "onchain_license_id": data.onchain_license_id,
        "tx_digest": data.tx_digest,
    }


@app.post("/license/activate")
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

    return {
        "success": True,
        "message": "Activation transaction saved",
        "onchain_license_id": data.onchain_license_id,
        "tx_digest": data.tx_digest,
    }


@app.post("/license/revoke")
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

    return {
        "success": True,
        "message": "Revoke transaction saved",
        "onchain_license_id": data.onchain_license_id,
        "tx_digest": data.tx_digest,
    }


@app.post("/sync/transactions")
def sync_transactions(db: Session = Depends(get_db)):
    sync_submitted_transactions(db)
    return {"success": True, "message": "Transaction sync completed"}


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
