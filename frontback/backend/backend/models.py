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


class AuditRecord(Base):
    __tablename__ = "audit_records"

    id = Column(Integer, primary_key=True, index=True)
    tx_digest = Column(String, unique=True, index=True)
    onchain_object_id = Column(String, index=True, nullable=True)

    # Manteniamo la semantica esistente del contratto
    product_id = Column(String, nullable=True)      # es. tipo atto
    license_key = Column(String, nullable=True)     # es. codice univoco atto
    vendor_wallet = Column(String, index=True, nullable=True)
    owner_wallet = Column(String, index=True, nullable=True)

    network = Column(String, default="testnet")
    audit_payload = Column(Text, nullable=False)
    signature = Column(Text, nullable=False)
    issued_at = Column(String, nullable=False)