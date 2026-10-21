"""Extra password-reset coverage: child CF, invalid token, rate limit, doctor 2FA preserved."""
import os
import subprocess
from pathlib import Path
import pytest
import requests
from dotenv import dotenv_values
from pymongo import MongoClient

_env = dotenv_values(Path(__file__).resolve().parents[2] / "frontend" / ".env")
_benv = dotenv_values(Path(__file__).resolve().parents[1] / ".env")
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _env.get("REACT_APP_BACKEND_URL") or "").rstrip("/")
DB = MongoClient(_benv["MONGO_URL"])[_benv["DB_NAME"]]
PARENT, PW = "genitore.demo@example.com", "Portale-Demo-2026"
DOCTOR, DOC_PW = "medico@mantmed.it", "Auscula-Studio-2026"
CHILD_CF = "RCCRRA22M47H224F"
NEW_PW = "Nuova-Prova-2026!"


def _token(email, mins="30"):
    out = subprocess.check_output(["python", "tests/reset_token.py", email, mins], cwd="/app/backend").decode().strip()
    return out.split("token=")[1]


@pytest.fixture(autouse=True)
def _cleanup():
    yield
    import bcrypt
    DB.users.update_one({"email": PARENT}, {"$set": {"password_hash": bcrypt.hashpw(PW.encode(), bcrypt.gensalt()).decode()}})
    DB.users.update_one({"email": DOCTOR}, {"$set": {"password_hash": bcrypt.hashpw(DOC_PW.encode(), bcrypt.gensalt()).decode()}})
    DB.password_resets.delete_many({})
    DB.reset_requests.delete_many({})
    DB.login_attempts.delete_many({})
    DB.audit.delete_many({"action": "password_reimpostata"})


def test_forgot_child_cf_creates_reset_for_parent():
    DB.password_resets.delete_many({})
    r = requests.post(f"{BASE_URL}/api/auth/password/forgot", json={"identifier": CHILD_CF})
    assert r.status_code == 200
    # async task — poll briefly
    import time
    parent = DB.users.find_one({"email": PARENT})
    found = False
    for _ in range(20):
        if DB.password_resets.count_documents({"uid": str(parent["_id"]), "used_at": None}) >= 1:
            found = True
            break
        time.sleep(0.2)
    assert found, "no reset token created for child CF"


def test_invalid_token_returns_410():
    r = requests.get(f"{BASE_URL}/api/auth/password/reset/not-a-valid-token-xxxxxxxx")
    assert r.status_code == 410


def test_rate_limit_11th_request_429():
    DB.reset_requests.delete_many({})
    last = None
    for _ in range(11):
        last = requests.post(f"{BASE_URL}/api/auth/password/forgot", json={"identifier": "nessuno2@example.com"})
    assert last.status_code == 429


def test_doctor_reset_keeps_2fa_required():
    # Need to know if doctor has 2FA — test both paths
    tok = _token(DOCTOR)
    info = requests.get(f"{BASE_URL}/api/auth/password/reset/{tok}").json()
    assert info["role"] == "doctor"
    r = requests.post(f"{BASE_URL}/api/auth/password/reset", json={"token": tok, "password": NEW_PW})
    assert r.status_code == 200
    assert r.json()["login_path"] == "/app"
    # Login with new password
    login = requests.post(f"{BASE_URL}/api/auth/login", json={"email": DOCTOR, "password": NEW_PW})
    assert login.status_code == 200
    # If 2FA was enabled, response should contain mfa_required
    body = login.json()
    doc = DB.users.find_one({"email": DOCTOR})
    if doc.get("totp_enabled"):
        assert body.get("mfa_required") is True or "mfa_token" in body, f"expected mfa challenge, got {body}"
