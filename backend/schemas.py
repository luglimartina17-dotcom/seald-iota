from pydantic import BaseModel, Field
from typing import Optional, Any, Dict


class RegisterVendorRequest(BaseModel):
    wallet: str
    company_name: str
    tx_digest: str


class MintRightRequest(BaseModel):
    wallet: str
    tx_digest: str
    onchain_right_id: Optional[str] = None
    product_id: str
    right_key: str
    expiry_date: int = 0
    max_devices: int = Field(ge=0, le=255)


class ActivateRightRequest(BaseModel):
    wallet: str
    tx_digest: str
    onchain_right_id: str


class RevokeRightRequest(BaseModel):
    wallet: str
    tx_digest: str
    onchain_right_id: str


class RenewRightRequest(BaseModel):
    wallet: str
    tx_digest: str
    old_onchain_right_id: str
    new_onchain_right_id: Optional[str] = None
    new_expiry_date: int = 0


class RightCheckResponse(BaseModel):
    found: bool
    valid: bool
    status: str
    onchain_right_id: Optional[str] = None
    product_id: Optional[str] = None
    vendor_wallet: Optional[str] = None
    owner_wallet: Optional[str] = None
    activated: Optional[bool] = None
    revoked: Optional[bool] = None
    expiry_date: Optional[int] = None
    reason: Optional[str] = None


class AuditResponse(BaseModel):
    found: bool
    tx_digest: Optional[str] = None
    onchain_object_id: Optional[str] = None
    product_id: Optional[str] = None
    right_key: Optional[str] = None
    vendor_wallet: Optional[str] = None
    owner_wallet: Optional[str] = None
    network: Optional[str] = None
    issued_at: Optional[str] = None
    audit_payload: Optional[Dict[str, Any]] = None
    signature: Optional[str] = None


class SelectiveDisclosureRequest(BaseModel):
    fields: list[str]


class SelectiveDisclosureResponse(BaseModel):
    found: bool
    tx_digest: Optional[str] = None
    disclosed_fields: Optional[list[str]] = None
    disclosed_payload: Optional[Dict[str, Any]] = None
    signature: Optional[str] = None
