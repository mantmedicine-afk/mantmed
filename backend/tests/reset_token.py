"""Test helper: mint a fresh password-reset link (30 min) for an active account and print the path.
Usage: python tests/reset_token.py <email> [minutes_valid]
Output: /reimposta-password?token=<token>
"""
import os
import sys
import secrets
import hashlib
from datetime import datetime, timezone, timedelta
from pathlib import Path
from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv(Path(__file__).resolve().parents[1] / ".env")
db = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
u = db.users.find_one({"email": sys.argv[1].strip().lower()})
if not u:
    print("account non trovato")
    sys.exit(1)
token = secrets.token_urlsafe(32)
now = datetime.now(timezone.utc)
mins = int(sys.argv[2]) if len(sys.argv) > 2 else 30
db.password_resets.update_many({"uid": str(u["_id"]), "used_at": None}, {"$set": {"used_at": now.isoformat(), "superseded": True}})
db.password_resets.insert_one({"uid": str(u["_id"]), "token": hashlib.sha256(token.encode()).hexdigest(), "created_at": now.isoformat(),
                               "expires_at": now + timedelta(minutes=mins), "used_at": None})
print(f"/reimposta-password?token={token}")
