"""Test helper: set a known verification code for a pending signup and print it. Usage: python tests/signup_code.py <email>"""
import os
import sys
import secrets
from pathlib import Path
from dotenv import load_dotenv
from pymongo import MongoClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
load_dotenv(Path(__file__).resolve().parents[1] / ".env")
from registration import _code_hash  # noqa: E402

email = sys.argv[1].strip().lower()
code = f"{secrets.randbelow(1_000_000):06d}"
res = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]].signups.update_one({"email": email}, {"$set": {"code": _code_hash(email, code)}})
print(code if res.matched_count else "registrazione non trovata")
