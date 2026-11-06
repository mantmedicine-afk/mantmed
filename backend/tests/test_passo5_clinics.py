"""Passo 5: configurable studios (unlimited, contacts, colour, header/logo, per-studio price list & methods) + letterhead versioning."""
import copy
import io
import os
import time
from pathlib import Path

import pytest
import requests
from bson import ObjectId
from dotenv import load_dotenv
from pymongo import MongoClient
from pypdf import PdfReader

load_dotenv(Path(__file__).parents[2] / "frontend/.env")
load_dotenv(Path(__file__).parents[1] / ".env")
BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"
OCU = ("oculista.demo@example.com", "Oculista-Demo-2026")
DBM = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
OLD_VISIT = "6aed2716a998ff4c0f9a3db3"
ST = {}


def login(email, pw):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/auth/login", json={"email": email, "password": pw})
    if r.status_code != 200:
        pytest.skip(f"login failed {email}: {r.status_code}")
    return s


def pdf_info(content: bytes):
    rd = PdfReader(io.BytesIO(content))
    text = "\n".join(p.extract_text() or "" for p in rd.pages)
    imgs = sum(len(p.images) for p in rd.pages)
    return text, imgs


def body_from(s, clinics=None):
    cl = clinics if clinics is not None else s["clinics"]
    return {"clinics": [{k: c.get(k, "") for k in ("id", "name", "address", "phone", "email", "color", "header")} | {"methods": c["methods"], "prices": c.get("prices") or {}} for c in cl],
            "hours": {c["name"]: s["hours"].get(c["name"], {"days": [1, 2, 3, 4, 5], "start": "09:00", "end": "18:00"}) for c in cl},
            "services": s["services"], "billing": s["billing"]}


@pytest.fixture(scope="module")
def ocu():
    s = login(*OCU)
    u = DBM.users.find_one({"email": OCU[0]})
    snap = {k: copy.deepcopy(u.get(k)) for k in ("clinics", "schedule", "billing")}
    yield s
    # restore the original 2-studio config (clinics/schedule/billing); log entries are additive
    DBM.users.update_one({"_id": u["_id"]}, {"$set": snap})
    for cid in ST.get("consults", []):
        DBM.consultations.delete_one({"_id": ObjectId(cid), "patient_name": {"$regex": "^TEST_"}})
    for pid in ST.get("payments", []):
        DBM.payments.delete_one({"_id": ObjectId(pid)})


class TestSchedule:
    def test_get_schedule(self, ocu):
        r = ocu.get(f"{BASE_URL}/settings/schedule")
        assert r.status_code == 200
        s = r.json()
        ST["sched"] = s
        names = [c["name"] for c in s["clinics"]]
        assert names == ["Studio principale", "Studio Nord"]
        p = s["clinics"][0]
        assert p["header"].startswith("Poliambulatorio Visus") and p["phone"] == "06 1234567"
        assert set(p["methods"]) == {"contanti", "carta"} and p["logo"]
        assert p["prices"]["Prima visita"]["price"] == 123 and p["prices"]["Prima visita"]["duration"] == 45
        assert s["clinics"][1]["methods"] == ["bonifico"]

    def test_logo_served(self, ocu):
        cid = ST["sched"]["clinics"][0]["id"]
        r = ocu.get(f"{BASE_URL}/settings/clinics/{cid}/logo")
        assert r.status_code == 200 and r.headers["content-type"].startswith("image/")

    def test_add_four_studios_persist(self, ocu):
        s = ST["sched"]
        extra = [{"id": "", "name": f"TEST_Studio {n}", "address": "Via Test", "phone": "", "email": "", "color": "", "header": "", "methods": ["contanti"], "prices": {}} for n in range(3, 8)]
        r = ocu.put(f"{BASE_URL}/settings/schedule", json=body_from(s, s["clinics"] + extra))
        assert r.status_code == 200, r.text
        g = ocu.get(f"{BASE_URL}/settings/schedule").json()
        assert len(g["clinics"]) == 7
        assert g["clinics"][0]["logo"] == s["clinics"][0]["logo"], "logo lost on save"
        assert all(c["color"] for c in g["clinics"])
        # restore 2
        r = ocu.put(f"{BASE_URL}/settings/schedule", json=body_from(s))
        assert r.status_code == 200
        assert [c["name"] for c in ocu.get(f"{BASE_URL}/settings/schedule").json()["clinics"]] == ["Studio principale", "Studio Nord"]

    def test_invalid_method_rejected(self, ocu):
        s = copy.deepcopy(ST["sched"])
        s["clinics"][1]["methods"] = ["bitcoin"]
        assert ocu.put(f"{BASE_URL}/settings/schedule", json=body_from(s)).status_code == 422
        s["clinics"][1]["methods"] = []
        assert ocu.put(f"{BASE_URL}/settings/schedule", json=body_from(s)).status_code == 422


class TestPayments:
    def test_pos_rejected_nord(self, ocu):
        r = ocu.post(f"{BASE_URL}/payments", json={"patient_name": "TEST_Pay", "clinic": "Studio Nord", "amount": 10, "method": "pos"})
        assert r.status_code == 400
        assert "Studio Nord non accetta il metodo POS" in r.json()["detail"]

    def test_bonifico_ok_nord(self, ocu):
        r = ocu.post(f"{BASE_URL}/payments", json={"patient_name": "TEST_Pay", "clinic": "Studio Nord", "amount": 10, "method": "bonifico"})
        assert r.status_code == 200, r.text
        p = r.json()
        ST.setdefault("payments", []).append(p["id"])
        assert p["method"] == "bonifico" and p["clinic"] == "Studio Nord"
        d = ocu.delete(f"{BASE_URL}/payments/{p['id']}")
        assert d.status_code in (200, 204)

    def test_contanti_rejected_nord(self, ocu):
        r = ocu.post(f"{BASE_URL}/payments", json={"patient_name": "TEST_Pay", "clinic": "Studio Nord", "amount": 10, "method": "contanti"})
        assert r.status_code == 400


class TestDocuments:
    def test_old_visit_pdf_unchanged(self, ocu):
        r = ocu.get(f"{BASE_URL}/consultations/{OLD_VISIT}/pdf")
        assert r.status_code == 200
        text, _ = pdf_info(r.content)
        assert "Visus" not in text

    def test_new_visit_pdf_has_header_logo(self, ocu):
        r = ocu.post(f"{BASE_URL}/consultations/start", data={"patient_name": "TEST_P5_Paziente", "clinic": "Studio principale", "paper_consent": "true",
                                                              "transcript": "Medico: buongiorno. Paziente: vedo sfocato. Visus OD 8/10, OS 9/10. Controllo tra un anno."}, timeout=60)
        assert r.status_code == 200, r.text
        c = r.json()
        ST.setdefault("consults", []).append(c["id"])
        for _ in range(60):
            if c.get("status") != "processing":
                break
            time.sleep(3)
            c = ocu.get(f"{BASE_URL}/consultations/{c['id']}").json()
        assert c["clinic"] == "Studio principale"
        p = ocu.get(f"{BASE_URL}/consultations/{c['id']}/pdf")
        assert p.status_code == 200, p.text[:200]
        text, imgs = pdf_info(p.content)
        ST["new_text"] = text
        assert "Poliambulatorio Visus" in text
        assert "06 1234567" in text
        assert imgs >= 1

    def test_header_change_keeps_old_pdf(self, ocu):
        if not ST.get("consults"):
            pytest.skip("no visit")
        s = copy.deepcopy(ST["sched"])
        s["clinics"][0]["header"] = "TEST_Header Nuovo"
        s["clinics"][0]["phone"] = "06 9999999"
        assert ocu.put(f"{BASE_URL}/settings/schedule", json=body_from(s)).status_code == 200
        p = ocu.get(f"{BASE_URL}/consultations/{ST['consults'][0]}/pdf")
        text, _ = pdf_info(p.content)
        assert "Poliambulatorio Visus" in text and "TEST_Header" not in text and "06 9999999" not in text
        # restore
        assert ocu.put(f"{BASE_URL}/settings/schedule", json=body_from(ST["sched"])).status_code == 200
        assert ocu.get(f"{BASE_URL}/settings/schedule").json()["clinics"][0]["header"].startswith("Poliambulatorio Visus")
