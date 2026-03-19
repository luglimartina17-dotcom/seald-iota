from pydantic import BaseModel, Field
from typing import Optional


class RegisterVendorRequest(BaseModel):
    wallet: str
    company_name: str
    tx_digest: str


class MintLicenseRequest(BaseModel):
    wallet: str
    tx_digest: str
    onchain_license_id: Optional[str] = None
    product_id: str
    license_key: str
    expiry_date: int = 0
    max_devices: int = Field(ge=0, le=255)


class ActivateLicenseRequest(BaseModel):
    wallet: str
    tx_digest: str
    onchain_license_id: str


class RevokeLicenseRequest(BaseModel):
    wallet: str
    tx_digest: str
    onchain_license_id: str


class LicenseCheckResponse(BaseModel):
    found: bool
    valid: bool
    status: str
    onchain_license_id: Optional[str] = None
    product_id: Optional[str] = None
    vendor_wallet: Optional[str] = None
    owner_wallet: Optional[str] = None
    activated: Optional[bool] = None
    revoked: Optional[bool] = None
    expiry_date: Optional[int] = None
    reason: Optional[str] = None