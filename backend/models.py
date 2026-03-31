from sqlalchemy import Column, Integer, String, Boolean, Text
from db import Base


class License(Base):
    __tablename__ = "licenses"

    id = Column(Integer, primary_key=True, index=True)
    onchain_license_id = Column(String, unique=True, index=True, nullable=True)
    product_id = Column(String, nullable=True)
    license_key = Column(String, nullable=True)
    vendor_wallet = Column(String, index=True, nullable=True)
    owner_wallet = Column(String, index=True, nullable=True)
    status = Column(String, default="pending")
    expiry_date = Column(String, nullable=True)
    max_devices = Column(Integer, nullable=True)
    current_devices = Column(Integer, default=0)
    revoked = Column(Boolean, default=False)
    tx_digest = Column(String, nullable=True)
    raw_payload = Column(Text, nullable=True)


class ChainTx(Base):
    __tablename__ = "chain_txs"

    id = Column(Integer, primary_key=True, index=True)
    action = Column(String, index=True)
    wallet = Column(String, index=True)
    tx_digest = Column(String, unique=True, index=True)
    object_id = Column(String, nullable=True)
    status = Column(String, default="submitted")
    payload_json = Column(Text, nullable=True)