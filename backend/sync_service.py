from sqlalchemy.orm import Session
import models
from iota_reader import get_transaction
from typing import Optional

RIGHT_TYPE_SUFFIX = "::digital_rights::DigitalRight"


def extract_created_right_id(tx_data: dict) -> Optional[str]:
    object_changes = tx_data.get("objectChanges", []) or []

    for change in object_changes:
        object_type = change.get("objectType", "")
        if (
            change.get("type") == "created"
            and isinstance(object_type, str)
            and object_type.endswith(RIGHT_TYPE_SUFFIX)
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
            continue

        effects = tx_data.get("effects", {}) or {}
        status_info = effects.get("status", {}) or {}
        status = status_info.get("status")

        if status == "success":
            tx_row.status = "confirmed"

            if tx_row.action == "mint_right":
                created_right_id = extract_created_right_id(tx_data)

                if created_right_id:
                    right_row = (
                        db.query(models.Right)
                        .filter(models.Right.tx_digest == tx_row.tx_digest)
                        .first()
                    )
                    if right_row and not right_row.onchain_right_id:
                        right_row.onchain_right_id = created_right_id
                        tx_row.object_id = created_right_id

            elif tx_row.action == "renew_right":
                created_right_id = extract_created_right_id(tx_data)
                if created_right_id:
                    right_row = (
                        db.query(models.Right)
                        .filter(models.Right.tx_digest == tx_row.tx_digest)
                        .first()
                    )
                    if right_row and not right_row.onchain_right_id:
                        right_row.onchain_right_id = created_right_id
                        tx_row.object_id = created_right_id

            db.commit()

        elif status == "failure":
            tx_row.status = "failed"
            db.commit()
