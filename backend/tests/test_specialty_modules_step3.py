"""Step 3 multi-specialty: main + secondary specialties, visit module picker options, module_id on consultations, per-module layouts."""
import os
import time
import uuid
from pathlib import Path

import pytest
import requests
from bson import ObjectId
from dotenv import dotenv_values
from pymongo import MongoClient

_env = dotenv_values(Path(__file__).resolve().parents[2] / "frontend" / ".env")
_benv = dotenv_values(Path(__file__).resolve().parents[1] / ".env")
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _env.get("REACT_APP_BACKEND_URL") or "").rstrip("/")
PED = ("medico@mantmed.it", "Auscula-Studio-2026")
CARD = ("cardiologo.demo@example.com", "Cardio-Demo-2026")
DERM_TX = ("Paziente di 40 anni con prurito al dorso da tre settimane. Fototipo II. Si espone al sole senza protezione. "
           "All'esame obiettivo lesione maculare bruna di 6 millimetri al dorso, margini irregolari. Dermatoscopia: reticolo atipico. "
           "Diagnosi: nevo atipico. Terapia: asportazione chirurgica programmata. Controllo tra un mese.")
STATE = {"created": []}


def login(cred):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": cred[0], "password": cred[1]})
    if r.status_code != 200:
        pytest.skip(f"login failed {cred[0]}: {r.text[:200]}")
    return s


@pytest.fixture(scope="module")
def card():
    return login(CARD)


@pytest.fixture(scope="module")
def ped():
    return login(PED)


@pytest.fixture(scope="module", autouse=True)
def cleanup():
    yield
    mdb = MongoClient(_benv["MONGO_URL"])[_benv["DB_NAME"]]
    for cid in STATE["created"]:
        mdb.consult_jobs.delete_many({"consultation_id": cid})
        mdb.consultations.delete_one({"_id": ObjectId(cid)})
    s = login(CARD)
    for m in ("cardiologia", "dermatologia"):
        s.post(f"{BASE_URL}/api/settings/module/reset", json={"choice": m})


def wait(s, cid, timeout=180):
    t0, d = time.time(), {}
    while time.time() - t0 < timeout:
        d = s.get(f"{BASE_URL}/api/consultations/{cid}").json()
        if d.get("status") in ("ready", "failed"):
            return d
        time.sleep(3)
    return d


# --- public catalog
def test_public_catalog_no_auth():
    r = requests.get(f"{BASE_URL}/api/specialty-modules")
    assert r.status_code == 200
    d = r.json()
    assert len(d["specialita"]) == 23
    assert "Cardiologia" in d["specialita"] and "Dermatologia e venereologia" in d["specialita"]
    assert {m["id"] for m in d["moduli"]} >= {"pediatria", "cardiologia", "dermatologia", "ginecologia", "generale"}


# --- registration accepts secondary_specialties (no completion)
def test_register_start_secondary():
    email = f"test_reg_{uuid.uuid4().hex[:8]}@example.com"
    body = {"role": "doctor", "first_name": "TEST_Reg", "last_name": "Medico", "email": email, "phone": "+39 333 1234567",
            "password": "Prova-Test-2026!", "specialty": "Cardiologia", "secondary_specialties": ["Dermatologia e venereologia"],
            "order_number": "RM 12345", "studio_address": "Via Roma 1, Roma", "terms": True}
    r = requests.post(f"{BASE_URL}/api/register/start", json=body)
    print("register start:", r.status_code, r.text[:300])
    assert r.status_code != 422 or "secondary" not in r.text
    STATE["reg_email"] = email
    mdb = MongoClient(_benv["MONGO_URL"])[_benv["DB_NAME"]]
    mdb.signups.delete_many({"email": email})
    too_many = {**body, "email": f"test_reg_{uuid.uuid4().hex[:8]}@example.com", "secondary_specialties": ["A1", "B1", "C1", "D1"]}
    r2 = requests.post(f"{BASE_URL}/api/register/start", json=too_many)
    assert r2.status_code == 422


# --- profile
def test_profile_secondary(card):
    p = card.get(f"{BASE_URL}/api/account").json()["profile"]
    assert p["specialty"] == "Cardiologia"
    assert p["secondary_specialties"] == ["Dermatologia e venereologia"]
    STATE["profile"] = p


def test_profile_update_and_restore(card):
    p = STATE.get("profile") or pytest.skip("no profile")
    try:
        r = card.put(f"{BASE_URL}/api/account/profile/doctor", json={**p, "secondary_specialties": ["Dermatologia e venereologia", "Neurologia", "Cardiologia"]})
        assert r.status_code == 200, r.text[:300]
        assert r.json()["profile"]["secondary_specialties"] == ["Dermatologia e venereologia", "Neurologia"]  # main excluded
        opts = card.get(f"{BASE_URL}/api/settings/module").json()["visit_options"]
        assert [o["key"] for o in opts] == ["cardiologia", "dermatologia", "generale|Neurologia", "generale"]  # secondaria senza modulo: Generale con la sua specialità
        assert card.put(f"{BASE_URL}/api/account/profile/doctor", json={**p, "secondary_specialties": ["A1", "B1", "C1", "D1"]}).status_code == 422
    finally:
        r = card.put(f"{BASE_URL}/api/account/profile/doctor", json={**p, "secondary_specialties": ["Dermatologia e venereologia"]})
        assert r.json()["profile"]["secondary_specialties"] == ["Dermatologia e venereologia"]


# --- visit options
def test_visit_options_card(card):
    d = card.get(f"{BASE_URL}/api/settings/module").json()
    assert d["module_id"] == "cardiologia"
    ids = [o["id"] for o in d["visit_options"]]
    assert ids == ["cardiologia", "dermatologia", "generale"]
    derm = next(o for o in d["visit_options"] if o["id"] == "dermatologia")
    assert derm["specialita"] == "Dermatologia e venereologia"


def test_visit_options_ped(ped):
    d = ped.get(f"{BASE_URL}/api/settings/module").json()
    assert [o["id"] for o in d["visit_options"]] == ["pediatria", "generale"]
    assert d["module_id"] == "pediatria"


# --- module_id validation
def test_consultation_module_not_allowed(card):
    r = card.post(f"{BASE_URL}/api/consultations", json={"patient_name": "TEST_NoGyn", "paper_consent": True, "transcript": DERM_TX, "module_id": "ginecologia"})
    assert r.status_code == 400
    r2 = card.post(f"{BASE_URL}/api/consultations/start", data={"patient_name": "TEST_NoGyn", "paper_consent": "true", "transcript": DERM_TX, "module_id": "ginecologia"})
    print("form start with gyn:", r2.status_code, r2.text[:200])
    assert r2.status_code in (400, 404, 405)


def test_consultation_bogus_module(card):
    r = card.post(f"{BASE_URL}/api/consultations", json={"patient_name": "TEST_Bogus", "paper_consent": True, "transcript": DERM_TX, "module_id": "xxx"})
    assert r.status_code == 400


# --- derm visit via JSON
def test_derm_visit(card):
    r = card.post(f"{BASE_URL}/api/consultations", json={"patient_name": "TEST_Derm Step3", "paper_consent": True, "transcript": DERM_TX, "module_id": "dermatologia"})
    assert r.status_code == 200, r.text[:300]
    cid = r.json()["id"]
    STATE["created"].append(cid)
    d = r.json() if r.json().get("status") in ("ready", "failed") else wait(card, cid)
    assert d["status"] == "ready", d.get("ai_error")
    n = d["note"]
    print("modulo:", n["modulo"])
    assert n["modulo"]["id"] == "dermatologia"
    assert n["specialita"] == "Dermatologia e venereologia"
    assert n["modulo"]["campi"].get("fototipo") == "II"
    assert "reticolo" in (n["modulo"]["campi"].get("dermatoscopia") or "").lower()
    got = card.get(f"{BASE_URL}/api/consultations/{cid}").json()
    assert got["note"]["modulo"]["id"] == "dermatologia"


# --- per-module layouts
def test_per_module_layout(card):
    a = card.put(f"{BASE_URL}/api/settings/module/prefs", json={"module_id": "dermatologia", "hidden": ["foto_cliniche"], "order": []}).json()
    assert a["module_id"] == "cardiologia"
    assert card.get(f"{BASE_URL}/api/settings/module/layout/dermatologia").json()["nascosti"] == ["foto_cliniche"]
    assert card.get(f"{BASE_URL}/api/settings/module/layout/cardiologia").json()["nascosti"] == []
    assert card.get(f"{BASE_URL}/api/settings/module/layout/xxx").status_code == 404
    card.post(f"{BASE_URL}/api/settings/module/reset", json={"choice": "dermatologia"})
    assert card.get(f"{BASE_URL}/api/settings/module/layout/dermatologia").json()["nascosti"] == []
