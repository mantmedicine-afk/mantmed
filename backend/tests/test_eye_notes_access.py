"""Iter 75: eye-note sign blocking (409), patient access endpoints (legal grants, coming-of-age), reserved visits & portal legacy regression."""
import os
import time

import pytest
import requests
from bson import ObjectId
from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") + "/api" if os.environ.get("REACT_APP_BACKEND_URL") else None
if not BASE_URL:
    from pathlib import Path
    for line in (Path(__file__).parents[2] / "frontend" / ".env").read_text().splitlines():
        if line.startswith("REACT_APP_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip().rstrip("/") + "/api"
DBM = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
OCU = ("oculista.demo@example.com", "Oculista-Demo-2026")
MED = ("medico@mantmed.it", "Auscula-Studio-2026")
GEN = ("genitore.demo@example.com", "Portale-Demo-2026")
TUT = ("tutore.demo@example.com", "Tutore-Demo-2026")
GYN = ("ginecologo.demo@example.com", "Gineco-Demo-2026")
MARCO = "6aed2716a998ff4c0f9a3db3"
CREATED = {"consults": []}
TRANSCRIPT = ("Medico: Buongiorno. Visus naturale occhio destro 8 decimi, occhio sinistro 9 decimi. "
              "Cristallino con lieve opacità. Tonometria destro 15 sinistro 16. Controllo tra un anno.")


def login(email, pw):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/auth/login", json={"email": email, "password": pw})
    if r.status_code != 200:
        pytest.skip(f"login failed {email}: {r.status_code}")
    return s


@pytest.fixture(scope="module")
def ocu():
    return login(*OCU)


@pytest.fixture(scope="module")
def med():
    return login(*MED)


@pytest.fixture(scope="module", autouse=True)
def cleanup():
    yield
    for cid in CREATED["consults"]:
        DBM.consultations.delete_one({"_id": ObjectId(cid), "patient_name": {"$regex": "^TEST_"}})


# Eye notes: sign blocked by 409 on Marco Demo (no actual sign)
class TestEyeSign:
    def test_marco_sign_409(self, ocu):
        c = ocu.get(f"{BASE_URL}/consultations/{MARCO}").json()
        nota = c["note"]["modulo"]["campi"]["cristallino"].get("nota")
        assert nota, "Marco cristallino nota missing"
        r = ocu.post(f"{BASE_URL}/consultations/{MARCO}/sign")
        assert r.status_code == 409, r.text
        assert "Cristallino" in r.json()["detail"]

    def test_test_visit_409_then_ok(self, ocu):
        r = ocu.post(f"{BASE_URL}/consultations/start", data={"patient_name": "TEST_EYE_Sign", "transcript": TRANSCRIPT, "paper_consent": "true"}, timeout=60)
        assert r.status_code == 200, r.text
        c = r.json()
        CREATED["consults"].append(c["id"])
        for _ in range(60):
            if c.get("status") != "processing":
                break
            time.sleep(3)
            c = ocu.get(f"{BASE_URL}/consultations/{c['id']}").json()
        assert c["status"] == "ready", c.get("ai_error")
        note = c["note"]
        campi = note["modulo"]["campi"]
        campi.setdefault("refrazione", {"od": {}, "os": {}, "nota": "", "incerti": []})["nota"] = "Addizione +2,00"
        assert ocu.patch(f"{BASE_URL}/consultations/{c['id']}", json={"note": note}).status_code == 200
        r = ocu.post(f"{BASE_URL}/consultations/{c['id']}/sign")
        assert r.status_code == 409, r.text
        assert "Refrazione" in r.json()["detail"] or "refrazione" in r.json()["detail"].lower()
        for k, v in campi.items():
            if isinstance(v, dict) and "nota" in v:
                v["nota"] = ""
        assert ocu.patch(f"{BASE_URL}/consultations/{c['id']}", json={"note": note}).status_code == 200
        r = ocu.post(f"{BASE_URL}/consultations/{c['id']}/sign")
        assert r.status_code == 200, r.text
        assert r.json().get("signed_at")


# Patient access endpoints (legal grants) + coming-of-age
class TestAccess:
    def aurora(self, med):
        ps = med.get(f"{BASE_URL}/patients").json()
        p = next((x for x in ps if x["name"] == "Aurora Ricci"), None)
        return p or pytest.skip("Aurora missing")

    def test_access_get(self, med):
        p = self.aurora(med)
        d = med.get(f"{BASE_URL}/patients/{p['id']}/access").json()
        assert d["adult"] is False and d["adult_on"]
        assert any(a["email"] == "genitore.demo@example.com" for a in d["accounts"]), d

    def test_legal_grant_create_revoke(self, med):
        p = self.aurora(med)
        r = med.post(f"{BASE_URL}/patients/{p['id']}/access/legal", json={"name": "TEST_Legale", "email": "test_legale@example.com", "tipo": "tutore_legale", "document": "Trib. Roma n.1/2026"})
        assert r.status_code == 200, r.text
        g = r.json()
        assert g["name"] == "TEST_Legale" and g["kind"] == "legale"
        d = med.get(f"{BASE_URL}/patients/{p['id']}/access").json()
        assert any(x["id"] == g["id"] and not x["revoked_at"] for x in d["grants"])
        assert med.delete(f"{BASE_URL}/patients/{p['id']}/access/legal/{g['id']}").status_code == 200
        assert med.delete(f"{BASE_URL}/patients/{p['id']}/access/legal/{g['id']}").status_code == 404
        d = med.get(f"{BASE_URL}/patients/{p['id']}/access").json()
        assert all(x["revoked_at"] for x in d["grants"] if x["id"] == g["id"])
        DBM.access_grants.delete_one({"_id": ObjectId(g["id"])})

    def test_legal_invalid(self, med):
        p = self.aurora(med)
        r = med.post(f"{BASE_URL}/patients/{p['id']}/access/legal", json={"name": "TEST_X", "email": "bad", "tipo": "tutore_legale", "document": "abc"})
        assert r.status_code == 422
        assert med.get(f"{BASE_URL}/patients/000000000000000000000000/access").status_code == 404

    def test_other_doctor_404(self, med, ocu):
        p = self.aurora(med)
        assert ocu.get(f"{BASE_URL}/patients/{p['id']}/access").status_code == 404

    def test_coming_of_age(self, med):
        r = med.get(f"{BASE_URL}/access/coming-of-age")
        assert r.status_code == 200 and isinstance(r.json(), list)

    def test_patient_email_validation(self, med):
        p = self.aurora(med)
        r = med.patch(f"{BASE_URL}/patients/{p['id']}", json={"patient_email": "notanemail"})
        assert r.status_code == 400


# Reserved visit + portal regression (legacy mode)
class TestReserved:
    def test_rules_active_after_conversion(self):
        assert DBM.meta.find_one({"_id": "access_rules_v2"}) is not None

    def test_reserve_hides_from_portal(self, med):
        gen = login(*GEN)
        me = gen.get(f"{BASE_URL}/portal/me").json()
        child = next(c for c in me["children"] if "Aurora" in c["patient"]["name"])
        assert child["reports"], "Aurora has no reports"
        cid = child["reports"][0]["id"]
        r = med.post(f"{BASE_URL}/consultations/{cid}/guardians", json={"share": False})
        try:
            assert r.status_code == 200 and r.json()["guardian_hidden"] is True
            me2 = gen.get(f"{BASE_URL}/portal/me").json()
            ids = [x["id"] for c in me2["children"] for x in c["reports"]]
            assert cid not in ids
            s = med.post(f"{BASE_URL}/consultations/{cid}/send-report")
            assert s.status_code == 409, s.text
        finally:
            r = med.post(f"{BASE_URL}/consultations/{cid}/guardians", json={"share": True})
            assert r.json()["guardian_hidden"] is False
        me3 = gen.get(f"{BASE_URL}/portal/me").json()
        assert cid in [x["id"] for c in me3["children"] for x in c["reports"]]

    def test_portal_access_endpoint(self):
        gen = login(*GEN)
        r = gen.get(f"{BASE_URL}/portal/access")
        assert r.status_code == 200
        assert "relations" in r.json() and "fiscal_only" in r.json()

    def test_tutore_gyn_hidden(self):
        t = login(*TUT)
        me = t.get(f"{BASE_URL}/portal/me").json()
        names = [c["patient"]["name"] for c in me["children"]]
        assert any("Giulia" in n for n in names), names
        gyn = login(*GYN)
        hidden = [c["id"] for c in gyn.get(f"{BASE_URL}/consultations").json() if c.get("guardian_hidden")]
        ids = [x["id"] for c in me["children"] for x in c["reports"]]
        assert not set(hidden) & set(ids)
