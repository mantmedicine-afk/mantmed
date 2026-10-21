"""Area Riservata: profile, prefs, sessions, absences (slot blocking), GDPR export and deactivation."""
import os
import subprocess
from datetime import date, timedelta
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
FOTI, FPW = "medico@mantmed.it", "Auscula-Studio-2026"


def _login(email, password):
    s = requests.Session()
    data = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}).json()
    if data.get("mfa_required"):
        code = subprocess.check_output(["python", "tests/totp_code.py"], cwd="/app/backend").decode().strip()
        assert s.post(f"{BASE_URL}/api/auth/2fa/verify", json={"mfa_token": data["mfa_token"], "code": code}).status_code == 200
    return s


@pytest.fixture(scope="module")
def snapshot():
    keep = {e: DB.users.find_one({"email": e}) for e in (PARENT, FOTI)}
    yield
    for e, u in keep.items():
        DB.users.replace_one({"_id": u["_id"]}, u)
    DB.audit.delete_many({"action": {"$in": ["profilo_professionale_aggiornato", "export_dati_genitore", "richiesta_cancellazione_account_genitore"]}})


def test_parent_profile_prefs_sessions(snapshot):
    s = _login(PARENT, PW)
    a = s.get(f"{BASE_URL}/api/account").json()
    assert a["role"] == "parent" and a["prefs"]["appointments"]["email"] is True and a["prefs"]["reports"]["email"] is False
    r = s.put(f"{BASE_URL}/api/account/profile/parent", json={**a["profile"], "fiscal_code": "RCCLSE90A41H224X", "address": "Via Roma 1, Reggio Calabria"})
    assert r.status_code == 200 and r.json()["profile"]["fiscal_code"] == "RCCLSE90A41H224X"
    assert DB.users.find_one({"email": PARENT})["fiscal_code"].startswith("enc:v1:")
    assert s.put(f"{BASE_URL}/api/account/profile/parent", json={**a["profile"], "fiscal_code": "XX"}).status_code == 422
    p = s.put(f"{BASE_URL}/api/account/notifications", json={"prefs": {"reports": {"email": True, "inapp": False}}}).json()["prefs"]
    assert p["reports"] == {"email": True, "inapp": False}
    other = _login(PARENT, PW)
    ses = s.get(f"{BASE_URL}/api/account/sessions").json()
    assert sum(x["current"] for x in ses) == 1 and len(ses) >= 2
    assert s.post(f"{BASE_URL}/api/account/sessions/close-others").json()["closed"] >= 1
    assert other.get(f"{BASE_URL}/api/auth/me").status_code == 401
    assert s.get(f"{BASE_URL}/api/auth/me").status_code == 200
    ex = s.get(f"{BASE_URL}/api/account/export")
    assert ex.status_code == 200 and "children" in ex.json()


def test_doctor_profile_and_absence_blocks_slots(snapshot):
    s = _login(FOTI, FPW)
    a = s.get(f"{BASE_URL}/api/account").json()
    assert a["role"] == "doctor" and a["profile"]["specialty"]
    assert s.put(f"{BASE_URL}/api/account/profile/parent", json={"first_name": "Xx", "last_name": "Yy"}).status_code == 403
    d = (date.today() + timedelta(days=7))
    while d.isoweekday() > 5:
        d += timedelta(days=1)
    items = s.post(f"{BASE_URL}/api/account/absences", json={"from": d.isoformat(), "to": d.isoformat(), "reason": "TEST ferie"}).json()
    assert any(x["reason"] == "TEST ferie" for x in items)
    parent = _login(PARENT, PW)
    kid = parent.get(f"{BASE_URL}/api/portal/me").json()["children"][0]
    clinic = kid["doctor"]["clinics"][0]["name"]
    svc = parent.get(f"{BASE_URL}/api/portal/network").json()[0]["services"][0]["name"]
    q = {"patient_id": kid["patient"]["id"], "doctor_id": kid["doctor"]["id"], "clinic": clinic, "service": svc, "date": d.isoformat()}
    assert parent.get(f"{BASE_URL}/api/portal/slots", params=q).json()["slots"] == []
    aid = next(x["id"] for x in items if x["reason"] == "TEST ferie")
    s.delete(f"{BASE_URL}/api/account/absences/{aid}").raise_for_status()


def test_parent_deactivation(snapshot):
    DB.users.delete_many({"email": "test_deact@example.com"})
    DB.users.insert_one({"email": "test_deact@example.com", "password_hash": bcrypt.hashpw(b"Prova-12345!", bcrypt.gensalt()).decode(), "name": "TEST Deact",
                         "role": "parent", "status": "active", "children": [], "child_cfs": []})
    s = _login("test_deact@example.com", "Prova-12345!")
    assert s.post(f"{BASE_URL}/api/account/delete", json={"password": "sbagliata"}).status_code == 400
    assert s.post(f"{BASE_URL}/api/account/delete", json={"password": "Prova-12345!", "reason": "test"}).json()["deactivated"]
    assert s.get(f"{BASE_URL}/api/auth/me").status_code == 401
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "test_deact@example.com", "password": "Prova-12345!"})
    assert r.status_code == 403 and "disattivato" in r.json()["detail"]
    DB.users.delete_many({"email": "test_deact@example.com"})
