"""Extra tests for profile password change: lockout, seed respect, 2FA still required."""
import os
import subprocess
import importlib
import asyncio
from pathlib import Path
import bcrypt
import pytest
import requests
from dotenv import dotenv_values
from pymongo import MongoClient

_env = dotenv_values(Path(__file__).resolve().parents[2] / "frontend" / ".env")
_benv = dotenv_values(Path(__file__).resolve().parents[1] / ".env")
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _env.get("REACT_APP_BACKEND_URL") or "").rstrip("/")
DB = MongoClient(_benv["MONGO_URL"])[_benv["DB_NAME"]]

PARENT, PW = "genitore.demo@example.com", "Portale-Demo-2026"
DOCTOR = _benv["DOCTOR_EMAIL"].strip().lower()
DOCTOR_PW = _benv["DOCTOR_PASSWORD"]
NEW_PW = "Nuova-Prova-2026!"


def _restore(email, original_pw):
    DB.users.update_one({"email": email},
                        {"$set": {"password_hash": bcrypt.hashpw(original_pw.encode(), bcrypt.gensalt()).decode()},
                         "$unset": {"password_changed_at": ""}})
    DB.login_attempts.delete_many({"identifier": {"$regex": ":chpw:"}})
    DB.audit.delete_many({"action": "password_modificata"})


@pytest.fixture(autouse=True)
def cleanup():
    yield
    _restore(PARENT, PW)
    _restore(DOCTOR, DOCTOR_PW)


def _login(email, password):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password})
    return s, r


def test_lockout_after_5_wrong_current_password():
    s, r = _login(PARENT, PW)
    assert r.status_code == 200
    url = f"{BASE_URL}/api/auth/password/change"
    for i in range(4):
        resp = s.post(url, json={"current_password": "sbagliata", "new_password": NEW_PW})
        assert resp.status_code == 400
    # 5th attempt locks (returns 429)
    resp = s.post(url, json={"current_password": "sbagliata", "new_password": NEW_PW})
    assert resp.status_code == 429
    detail = resp.json()["detail"]
    assert "15" in detail or "bloccato" in detail.lower()
    # subsequent request with correct password still locked
    resp = s.post(url, json={"current_password": PW, "new_password": NEW_PW})
    assert resp.status_code == 429


def test_unauthenticated_returns_401():
    r = requests.post(f"{BASE_URL}/api/auth/password/change",
                      json={"current_password": PW, "new_password": NEW_PW})
    assert r.status_code == 401


def test_weak_password_returns_422():
    s, _ = _login(PARENT, PW)
    r = s.post(f"{BASE_URL}/api/auth/password/change",
               json={"current_password": PW, "new_password": "short1!"})
    assert r.status_code == 422


def test_same_as_current_returns_400():
    s, _ = _login(PARENT, PW)
    r = s.post(f"{BASE_URL}/api/auth/password/change",
               json={"current_password": PW, "new_password": PW})
    assert r.status_code == 400
    assert "diversa" in r.json()["detail"].lower()


def test_seed_does_not_revert_doctor_after_change():
    """After the doctor changes password, re-running seed_doctor must NOT reset the hash to the .env password."""
    s, r = _login(DOCTOR, DOCTOR_PW)
    if r.status_code == 200 and r.json().get("mfa_required"):
        # Doctor has 2FA: use TOTP
        tok = r.json()["mfa_token"]
        code = subprocess.check_output(["python", "tests/totp_code.py"], cwd="/app/backend").decode().strip().split()[-1]
        r2 = s.post(f"{BASE_URL}/api/auth/2fa/verify", json={"mfa_token": tok, "code": code})
        assert r2.status_code == 200, r2.text
    else:
        assert r.status_code == 200, r.text

    r = s.post(f"{BASE_URL}/api/auth/password/change",
               json={"current_password": DOCTOR_PW, "new_password": NEW_PW})
    assert r.status_code == 200, r.text

    # Simulate backend restart effect by calling seed_doctor directly
    import sys
    for k, v in _benv.items():
        os.environ.setdefault(k, v)
    sys.path.insert(0, "/app/backend")
    auth_mod = importlib.import_module("auth")
    from motor.motor_asyncio import AsyncIOMotorClient
    client = AsyncIOMotorClient(_benv["MONGO_URL"])
    async_db = client[_benv["DB_NAME"]]
    asyncio.new_event_loop().run_until_complete(auth_mod.seed_doctor(async_db))

    # The password should still be the new one (not reseeded)
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": DOCTOR, "password": NEW_PW})
    # Doctor has 2FA → 200 with mfa_required
    assert r.status_code == 200
    assert r.json().get("mfa_required") is True, "After change + reseed, new password must still work"

    # And original .env password must NOT work
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": DOCTOR, "password": DOCTOR_PW})
    assert r.status_code == 401, "Original .env password should NOT work after user-driven change"


def test_doctor_2fa_still_required_after_change():
    """After password change, doctor login must still prompt for 2FA code."""
    s, r = _login(DOCTOR, DOCTOR_PW)
    if r.status_code == 200 and r.json().get("mfa_required"):
        tok = r.json()["mfa_token"]
        code = subprocess.check_output(["python", "tests/totp_code.py"], cwd="/app/backend").decode().strip().split()[-1]
        s.post(f"{BASE_URL}/api/auth/2fa/verify", json={"mfa_token": tok, "code": code})

    r = s.post(f"{BASE_URL}/api/auth/password/change",
               json={"current_password": DOCTOR_PW, "new_password": NEW_PW})
    assert r.status_code == 200

    # New login with the new password: must still require MFA
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": DOCTOR, "password": NEW_PW})
    assert r.status_code == 200
    body = r.json()
    assert body.get("mfa_required") is True
    assert "mfa_token" in body
