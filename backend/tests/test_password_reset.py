"""Password recovery: generic response, single-use 30-min token, strong password, sessions closed, 2FA kept."""
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
NEW_PW = "Nuova-Prova-2026!"


def _token(email, mins="30"):
    out = subprocess.check_output(["python", "tests/reset_token.py", email, mins], cwd="/app/backend").decode().strip()
    return out.split("token=")[1]


@pytest.fixture(autouse=True)
def restore():
    yield
    import bcrypt
    DB.users.update_one({"email": PARENT}, {"$set": {"password_hash": bcrypt.hashpw(PW.encode(), bcrypt.gensalt()).decode()}, "$unset": {"password_changed_at": ""}})
    DB.password_resets.delete_many({})
    DB.reset_requests.delete_many({})
    DB.audit.delete_many({"action": "password_reimpostata"})


def test_forgot_generic_response():
    for ident in ("nessuno@example.com", PARENT, "RCCRRA22M47H224F"):
        r = requests.post(f"{BASE_URL}/api/auth/password/forgot", json={"identifier": ident})
        assert r.status_code == 200 and "Se l'indirizzo email" in r.json()["message"]


def test_reset_flow_closes_sessions():
    s = requests.Session()
    assert s.post(f"{BASE_URL}/api/auth/login", json={"email": PARENT, "password": PW}).status_code == 200
    assert s.get(f"{BASE_URL}/api/auth/me").status_code == 200
    tok = _token(PARENT)
    info = requests.get(f"{BASE_URL}/api/auth/password/reset/{tok}").json()
    assert info["role"] == "parent" and "@example.com" in info["email"] and info["email"] != PARENT
    weak = requests.post(f"{BASE_URL}/api/auth/password/reset", json={"token": tok, "password": "Password1234"})
    assert weak.status_code == 422
    r = requests.post(f"{BASE_URL}/api/auth/password/reset", json={"token": tok, "password": NEW_PW})
    assert r.status_code == 200 and r.json()["login_path"] == "/portale"
    assert s.get(f"{BASE_URL}/api/auth/me").status_code == 401
    assert requests.post(f"{BASE_URL}/api/auth/password/reset", json={"token": tok, "password": NEW_PW}).status_code == 410
    assert requests.post(f"{BASE_URL}/api/auth/login", json={"email": PARENT, "password": NEW_PW}).status_code == 200


def test_change_password_from_profile():
    a, b = requests.Session(), requests.Session()
    for s in (a, b):
        assert s.post(f"{BASE_URL}/api/auth/login", json={"email": PARENT, "password": PW}).status_code == 200
    url = f"{BASE_URL}/api/auth/password/change"
    assert requests.post(url, json={"current_password": PW, "new_password": NEW_PW}).status_code == 401
    r = a.post(url, json={"current_password": "sbagliata", "new_password": NEW_PW})
    assert r.status_code == 400 and "4 tentativi" in r.json()["detail"]
    assert a.post(url, json={"current_password": PW, "new_password": "debole123"}).status_code == 422
    r = a.post(url, json={"current_password": PW, "new_password": NEW_PW})
    assert r.status_code == 200 and r.json()["other_sessions_closed"] >= 1
    assert a.get(f"{BASE_URL}/api/auth/me").status_code == 200
    assert b.get(f"{BASE_URL}/api/auth/me").status_code == 401
    assert a.post(url, json={"current_password": NEW_PW, "new_password": NEW_PW}).status_code == 400
    assert requests.post(f"{BASE_URL}/api/auth/login", json={"email": PARENT, "password": NEW_PW}).status_code == 200
    DB.login_attempts.delete_many({"identifier": {"$regex": ":chpw:"}})
    DB.audit.delete_many({"action": "password_modificata"})


def test_expired_token():
    tok = _token(PARENT, "-1")
    assert requests.get(f"{BASE_URL}/api/auth/password/reset/{tok}").status_code == 410
    assert requests.post(f"{BASE_URL}/api/auth/password/reset", json={"token": tok, "password": NEW_PW}).status_code == 410
