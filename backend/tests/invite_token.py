"""Test helper: mint a Portale Paziente invite for a patient and print the activation path.
Usage: python tests/invite_token.py <patient_id>
Output: /registrati/paziente?invito=<token>
"""
import os
import sys
import secrets
import hashlib
from datetime import datetime, timezone, timedelta
from pathlib import Path
from bson import ObjectId
from dotenv import load_dotenv
from pymongo import MongoClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
load_dotenv(Path(__file__).resolve().parents[1] / ".env")
from crypto import seal_fields, unseal_fields  # noqa: E402

pid = sys.argv[1].strip()
db = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
p = db.patients.find_one({"_id": ObjectId(pid)})
if not p:
    print("paziente non trovato"); sys.exit(1)
p = unseal_fields(p, ("guardian_email", "fiscal_code", "guardian"))
email = (p.get("guardian_email") or "").strip().lower()
cf = (p.get("fiscal_code") or "").strip().upper()
if not email or not cf:
    print("paziente privo di email genitore o CF"); sys.exit(1)
owner = db.users.find_one({"_id": ObjectId(p["owner_id"])})
token = secrets.token_urlsafe(24)
now = datetime.now(timezone.utc)
db.portal_invites.insert_one({
    "token": hashlib.sha256(token.encode()).hexdigest(),
    "patient_id": pid, "owner_id": p["owner_id"], "email": email,
    **seal_fields({"cf": cf}, ("cf",)),
    "patient_first": p["name"].split()[0],
    "doctor": (owner or {}).get("name", ""),
    "created_at": now.isoformat(),
    "expires_at": (now + timedelta(days=7)).isoformat(),
})
print(f"/registrati/paziente?invito={token}")
