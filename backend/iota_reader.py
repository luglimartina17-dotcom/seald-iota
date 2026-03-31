import os
import requests
from dotenv import load_dotenv

load_dotenv()

# Usa IOTA_RPC da .env, default a testnet
IOTA_RPC = os.getenv("IOTA_RPC", "https://api.testnet.iota.cafe")


def rpc_call(method: str, params: list):
    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": method,
        "params": params,
    }
    response = requests.post(IOTA_RPC, json=payload, timeout=30)
    response.raise_for_status()
    data = response.json()
    if "error" in data:
        raise RuntimeError(str(data["error"]))
    return data["result"]


def get_object(object_id: str):
    return rpc_call(
        "iota_getObject",
        [
            object_id,
            {
                "showContent": True,
                "showOwner": True,
                "showType": True,
            },
        ],
    )


def get_transaction(digest: str):
    return rpc_call(
        "iota_getTransactionBlock",
        [
            digest,
            {
                "showEffects": True,
                "showObjectChanges": True,
                "showEvents": True,
                "showInput": True,
            },
        ],
    )
