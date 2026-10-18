"""Test helper: mint a fresh activation link for a Founder-invited doctor and print the path.
Usage: python tests/doctor_activation_token.py <email>
Output: /attiva?token=<token>
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
token = secrets.token_urlsafe(24)
res = db.users.update_one({"email": sys.argv[1].strip().lower(), "status": "invited"},
                          {"$set": {"invite": {"token": hashlib.sha256(token.encode()).hexdigest(),
                                               "expires_at": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()}}})
print(f"/attiva?token={token}" if res.matched_count else "medico invitato non trovato")
