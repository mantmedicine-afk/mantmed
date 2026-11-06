"""Iteration 73: visit templates per module, free-visit patient creation, derm visit without cardiology template fields."""
import os
import time
from pathlib import Path

import pytest
import requests
from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv(Path(__file__).parents[2] / "frontend/.env")
load_dotenv(Path(__file__).parents[1] / ".env")
BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"
CARDIO = ("cardiologo.demo@example.com", "Cardio-Demo-2026")
DBM = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
CREATED = {"patients": [], "consults": []}


def login(email, pw):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/auth/login", json={"email": email, "password": pw})
    if r.status_code != 200:
        pytest.skip(f"login failed {email}")
    return s


def wait_ready(s, c):
    for _ in range(60):
        if c.get("status") != "processing":
            break
        time.sleep(3)
        c = s.get(f"{BASE_URL}/consultations/{c['id']}").json()
    return c


@pytest.fixture(scope="module")
def cardio():
    return login(*CARDIO)


@pytest.fixture(scope="module", autouse=True)
def cleanup():
    yield
    from bson import ObjectId
    for cid in CREATED["consults"]:
        DBM.consultations.delete_one({"_id": ObjectId(cid), "patient_name": {"$regex": "^TEST_"}})
    for pid in CREATED["patients"]:
        DBM.patients.delete_one({"_id": ObjectId(pid), "name": {"$regex": "^TEST_"}})
        DBM.consents.delete_many({"patient_id": pid})


# Templates: cardiologo templates belong to cardiologia
class TestTemplatesModule:
    def test_cardio_templates_module(self, cardio):
        r = cardio.get(f"{BASE_URL}/visit-templates")
        assert r.status_code == 200
        tpls = r.json()
        assert tpls
        print([(t["name"], t["module_id"]) for t in tpls])
        assert all(t["module_id"] == "cardiologia" for t in tpls if not t.get("bilancio"))

    def test_put_module_and_restore(self, cardio):
        t = cardio.get(f"{BASE_URL}/visit-templates").json()[0]
        r = cardio.put(f"{BASE_URL}/visit-templates/{t['id']}", json={"name": t["name"], "module_id": "dermatologia"})
        assert r.status_code == 200 and r.json()["module_id"] == "dermatologia"
        got = next(x for x in cardio.get(f"{BASE_URL}/visit-templates").json() if x["id"] == t["id"])
        assert got["module_id"] == "dermatologia"
        assert len(got["fields"]) == len(t["fields"])  # fields untouched
        r = cardio.put(f"{BASE_URL}/visit-templates/{t['id']}", json={"name": t["name"], "module_id": t["module_id"]})
        assert r.json()["module_id"] == t["module_id"]

    def test_new_template_default_module(self, cardio):
        r = cardio.post(f"{BASE_URL}/visit-templates", json={"name": "TEST_Modello73"})
        assert r.status_code == 200, r.text
        d = r.json()
        try:
            assert d["module_id"] == "cardiologia"
        finally:
            assert cardio.delete(f"{BASE_URL}/visit-templates/{d['id']}").status_code == 200


# Free visit: creates patient with birth date/sex + paper consent
class TestFreeVisitPatient:
    def test_invalid_sex_or_date(self, cardio):
        r = cardio.post(f"{BASE_URL}/consultations/start", data={"patient_name": "TEST_Bad", "transcript": "Medico: prova.",
                                                                 "paper_consent": "true", "new_birth_date": "1980-01-01", "new_sex": "X"})
        assert r.status_code == 400
        r = cardio.post(f"{BASE_URL}/consultations/start", data={"patient_name": "TEST_Bad", "transcript": "Medico: prova.",
                                                                 "paper_consent": "true", "new_birth_date": "nope", "new_sex": "F"})
        assert r.status_code == 400
        assert not DBM.patients.find_one({"name": "TEST_Bad"})

    def test_invalid_module_does_not_create_orphan_patient(self, cardio):
        r = cardio.post(f"{BASE_URL}/consultations/start", data={"patient_name": "TEST_Orphan73", "transcript": "Medico: prova.",
                                                                 "paper_consent": "true", "new_birth_date": "1980-01-01", "new_sex": "F",
                                                                 "module_id": "ginecologia"})
        assert r.status_code == 400
        orphan = DBM.patients.find_one({"name": "TEST_Orphan73"})
        if orphan:
            CREATED["patients"].append(str(orphan["_id"]))
        assert not orphan, "Patient created even though visit was rejected (invalid module)"

    def test_derm_free_visit_creates_patient_no_cardio_fields(self, cardio):
        tpl = cardio.get(f"{BASE_URL}/visit-templates").json()[0]  # cardiology template forced
        tr = ("Medico: Buongiorno, cosa la porta qui? Paziente: Ho un neo sulla schiena che è cambiato. "
              "Medico: Fototipo secondo. Guardo con il dermatoscopio: lesione asimmetrica di 6 millimetri. Facciamo l'asportazione.")
        r = cardio.post(f"{BASE_URL}/consultations/start", data={"patient_name": "TEST_Paziente Derm73", "transcript": tr, "paper_consent": "true",
                                                                 "new_birth_date": "1975-04-10", "new_sex": "M", "module_id": "dermatologia",
                                                                 "template_id": tpl["id"]}, timeout=60)
        assert r.status_code == 200, r.text
        c = r.json()
        CREATED["consults"].append(c["id"])
        assert c.get("patient_id")
        CREATED["patients"].append(c["patient_id"])
        c = wait_ready(cardio, c)
        assert c["status"] == "ready", c.get("ai_error")
        n = c["note"]
        assert n["modulo"]["id"] == "dermatologia"
        titles = " ".join((x.get("titolo") or x.get("label") or "") + " " + (x.get("testo") or "") for x in n.get("sezioni") or [])
        print("SEZIONI:", titles[:500])
        for bad in ("Fattori di rischio", "Auscultazione", "ECG"):
            assert bad not in titles
        assert n.get("motivo_visita", "").strip()
        pts = cardio.get(f"{BASE_URL}/patients").json()
        p = next((x for x in pts if x["id"] == c["patient_id"]), None)
        assert p and p["name"] == "TEST_Paziente Derm73" and p["birth_date"] == "1975-04-10" and p["sex"] == "M"
        assert p.get("consent_at")
