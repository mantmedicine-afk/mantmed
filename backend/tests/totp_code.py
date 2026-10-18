"""Print the current TOTP code of the seeded doctor (test helper): python tests/totp_code.py"""
import os
import sys
from pathlib import Path
from dotenv import load_dotenv
from pymongo import MongoClient
import pyotp

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
load_dotenv(Path(__file__).resolve().parents[1] / ".env")
import auth  # noqa: E402

user = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]].users.find_one({"email": "medico@mantmed.it"})
print(pyotp.TOTP(auth.unseal(user["totp_secret"])).now() if user and user.get("totp_enabled") else "2FA disattivata")
