import base64
import hashlib
import json
import os
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

PREFIX = "enc:v1:"
_KEY = base64.b64decode(os.environ["DATA_ENCRYPTION_KEY"])
if len(_KEY) != 32:
    raise RuntimeError("DATA_ENCRYPTION_KEY deve essere di 32 byte (AES-256)")
_AES = AESGCM(_KEY)
KEY_FINGERPRINT = hashlib.sha256(_KEY).hexdigest()[:12]


def is_sealed(v) -> bool:
    return isinstance(v, str) and v.startswith(PREFIX)


def seal(value):
    if value is None or is_sealed(value):
        return value
    nonce = os.urandom(12)
    ct = _AES.encrypt(nonce, json.dumps(value, ensure_ascii=False).encode(), None)
    return PREFIX + base64.b64encode(nonce + ct).decode()


def unseal(value):
    if not is_sealed(value):
        return value
    raw = base64.b64decode(value[len(PREFIX):])
    return json.loads(_AES.decrypt(raw[:12], raw[12:], None))


def seal_fields(data: dict, fields) -> dict:
    return {k: (seal(v) if k in fields else v) for k, v in data.items()}


def unseal_fields(data: dict, fields) -> dict:
    return {k: (unseal(v) if k in fields else v) for k, v in data.items()}
