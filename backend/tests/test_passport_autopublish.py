# Passaporto: firma nota con consenso 'Passaporto' (passport_consent_at) -> portal_published=true e visita nel passaporto genitore.
import os
import pytest
import requests
from bson import ObjectId
from dotenv import load_dotenv
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    with open("/app/frontend/.env") as fh:
        for line in fh:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().strip('"').rstrip("/")
API = f"{BASE_URL}/api"
PID = "6ad86e64c06e50ff4cd67d1e"
load_dotenv("/app/backend/.env")
MDB = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]


def login(email, pw):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": pw})
    if r.status_code != 200:
        pytest.skip("login failed")
    return s


def test_sign_autopublishes_with_passport_consent():
    doc, parent = login("medico@mantmed.it", "Auscula-Studio-2026"), login("genitore.demo@example.com", "Portale-Demo-2026")
    pat = MDB.patients.find_one({"_id": ObjectId(PID)})
    had = pat.get("passport_consent_at")
    src = MDB.consultations.find_one({"patient_id": PID, "status": "done"}) or MDB.consultations.find_one({"patient_id": PID})
    new = {k: v for k, v in src.items() if k != "_id"}
    new.update({"portal_published": False, "report_sent_at": None, "signed_at": None, "fse": None, "obscured": False,
                "portal_hidden_by_parent": False, "created_at": "2026-01-02T10:00:00+00:00", "template_name": "TEST_autopublish"})
    new.pop("ai_provenance", None)
    cid = str(MDB.consultations.insert_one(new).inserted_id)
    try:
        ids = [v["id"] for v in parent.get(f"{API}/portal/passport/{PID}").json()["visits"]]
        assert cid not in ids
        MDB.patients.update_one({"_id": ObjectId(PID)}, {"$set": {"passport_consent_at": "2026-01-01T00:00:00+00:00"}})
        r = doc.post(f"{API}/consultations/{cid}/sign")
        assert r.status_code == 200, r.text
        assert r.json().get("portal_published") is True
        ids = [v["id"] for v in parent.get(f"{API}/portal/passport/{PID}").json()["visits"]]
        assert cid in ids
    finally:
        MDB.consultations.delete_one({"_id": ObjectId(cid)})
        MDB.patients.update_one({"_id": ObjectId(PID)}, {"$set": {"passport_consent_at": had}} if had else {"$unset": {"passport_consent_at": ""}})
