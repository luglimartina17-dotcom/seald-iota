from sqlalchemy.orm import Session
import models
from iota_reader import get_transaction
from typing import Optional

LICENSE_TYPE_SUFFIX = "::software_license::SoftwareLicense"


def extract_created_license_id(tx_data: dict) -> Optional[str]:
    object_changes = tx_data.get("objectChanges", []) or []

    for change in object_changes:
        object_type = change.get("objectType", "")
        if (
            change.get("type") == "created"
            and isinstance(object_type, str)
            and object_type.endswith(LICENSE_TYPE_SUFFIX)
        ):
            return change.get("objectId")

    return None


def sync_submitted_transactions(db: Session):
    submitted_txs = (
        db.query(models.ChainTx)
        .filter(models.ChainTx.status == "submitted")
        .all()
    )

    for tx_row in submitted_txs:
        try:
            tx_data = get_transaction(tx_row.tx_digest)
        except Exception:
            # RPC non disponibile o tx non ancora trovata
            continue

        effects = tx_data.get("effects", {}) or {}
        status_info = effects.get("status", {}) or {}
        status = status_info.get("status")

        if status == "success":
            tx_row.status = "confirmed"

            # Se è un mint, proviamo a ricavare il vero object id della licenza
            if tx_row.action == "mint_license":
                created_license_id = extract_created_license_id(tx_data)

                if created_license_id:
                    license_row = (
                        db.query(models.License)
                        .filter(models.License.tx_digest == tx_row.tx_digest)
                        .first()
                    )
                    if license_row and not license_row.onchain_license_id:
                        license_row.onchain_license_id = created_license_id
                        tx_row.object_id = created_license_id

            db.commit()

        elif status == "failure":
            tx_row.status = "failed"
            db.commit()