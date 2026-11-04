# Passaporto sanitario (portale genitore): payload, consenso, condivisioni, pagina pubblica, nascondi referto,
# registro accessi, importazione medico MantMed, vaccinazioni lato medico, field_meta, robots.
import os
import re
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
PID = "6ad86e64c06e50ff4cd67d1e"  # Aurora Ricci
CF = "RCCRRA22M47H224F"
load_dotenv("/app/backend/.env")
MDB = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
ST = {}  # shared state across ordered tests


def login(email, pw):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": pw})
    if r.status_code != 200:
        pytest.skip(f"login failed {email}: {r.status_code}")
    return s


@pytest.fixture(scope="module")
def parent():
    return login("genitore.demo@example.com", "Portale-Demo-2026")


@pytest.fixture(scope="module")
def doc():
    return login("medico@mantmed.it", "Auscula-Studio-2026")


@pytest.fixture(scope="module")
def cardio():
    return login("cardiologo.demo@example.com", "Cardio-Demo-2026")


@pytest.fixture(scope="module", autouse=True)
def cleanup():
    yield
    for sid in ST.get("shares", []):
        MDB.passport_shares.update_one({"_id": ObjectId(sid), "revoked_at": None}, {"$set": {"revoked_at": "2000-01-01T00:00:00+00:00"}})
    for pid in set(ST.get("imported", [])):
        MDB.patients.delete_one({"_id": ObjectId(pid), "owner_id": ST["cardio_id"]})
        MDB.measurements.delete_many({"patient_id": pid, "owner_id": ST["cardio_id"]})
        MDB.vaccinations.delete_many({"patient_id": pid, "owner_id": ST["cardio_id"]})
    for vid in ST.get("vacc", []):
        MDB.vaccinations.delete_one({"_id": ObjectId(vid)})
    MDB.consultations.update_many({"patient_id": PID, "portal_hidden_by_parent": True}, {"$set": {"portal_hidden_by_parent": False}})


class TestPassport:
    # payload genitore
    def test_passport_payload(self, parent):
        r = parent.get(f"{API}/portal/passport/{PID}")
        assert r.status_code == 200
        d = r.json()
        assert d["child"]["name"] == "Aurora Ricci"
        assert "fiscal_code" not in d["child"]
        assert any("Amoxicillina" in a["value"] and a["by"] for a in d["summary"]["allergies"])
        assert any(c["value"] == "Asma lieve intermittente" for c in d["summary"]["chronic"])
        assert len(d["vaccines"]["done"]) >= 13 and isinstance(d["vaccines"]["upcoming"], list)
        assert set(d["growth"]["curves"]) == {"wfa", "lhfa", "hcfa"}
        assert d["growth"]["measurements"][-1]["pct"]["peso"]["ref"] == "OMS"
        assert d["visits"] and all("by" in v and "at" in v for v in d["visits"])
        assert d["contact"]["name"]
        ST["visit"] = d["visits"][0]["id"]

    def test_passport_other_child_404(self, parent):
        assert parent.get(f"{API}/portal/passport/6ad86e64c06e50ff4cd67d4d").status_code == 404

    def test_passport_requires_parent(self, doc):
        assert doc.get(f"{API}/portal/passport/{PID}").status_code in (401, 403)

    # consenso
    def test_consent_required_then_given(self, parent):
        pid = MDB.users.find_one({"email": "genitore.demo@example.com"})["_id"]
        old = MDB.users.find_one({"_id": pid})["passport_share_consent"]
        MDB.users.update_one({"_id": pid}, {"$unset": {"passport_share_consent": ""}})
        try:
            r = parent.post(f"{API}/portal/passport/{PID}/shares", json={"scope": "summary", "duration": "24h"})
            assert r.status_code == 412
            assert parent.post(f"{API}/portal/passport/consent", json={"accept": False}).status_code == 400
            r = parent.post(f"{API}/portal/passport/consent", json={"accept": True})
            assert r.status_code == 200 and r.json()["consent"]["version"]
        finally:
            if not MDB.users.find_one({"_id": pid}).get("passport_share_consent"):
                MDB.users.update_one({"_id": pid}, {"$set": {"passport_share_consent": old}})

    # creazione condivisioni
    def test_create_shares(self, parent):
        for name, body in (("sum", {"scope": "summary", "duration": "24h", "allow_import": False}),
                           ("full", {"scope": "full", "duration": "7d", "allow_import": True}),
                           ("full_noimp", {"scope": "full", "duration": "30d", "allow_import": False})):
            r = parent.post(f"{API}/portal/passport/{PID}/shares", json=body)
            assert r.status_code == 200, r.text
            s = r.json()
            assert s["status"] == "active" and re.fullmatch(r"\d{6}", s["code"]) and len(s["token"]) > 20
            assert s["scope"] == body["scope"] and s["allow_import"] == body["allow_import"]
            ST[name] = s
            ST.setdefault("shares", []).append(s["id"])
        ids = [x["id"] for x in parent.get(f"{API}/portal/passport/{PID}/shares").json()]
        assert all(x in ids for x in ST["shares"])

    def test_invalid_share_body(self, parent):
        assert parent.post(f"{API}/portal/passport/{PID}/shares", json={"scope": "x", "duration": "24h"}).status_code == 422
        assert parent.post(f"{API}/portal/passport/{PID}/shares", json={"scope": "full", "duration": "1y"}).status_code == 422

    # pagina pubblica
    def test_public_info_and_noindex(self):
        r = requests.get(f"{API}/public/passport/{ST['sum']['token']}")
        assert r.status_code == 200 and r.json()["available"] is True and r.json()["scope"] == "summary"
        assert "noindex" in r.headers.get("X-Robots-Tag", "")
        r = requests.get(f"{API}/public/passport/nonexistenttoken123")
        assert r.json()["available"] is False and r.json()["message"] == "Accesso non più disponibile"

    def test_open_wrong_code(self):
        r = requests.post(f"{API}/public/passport/{ST['sum']['token']}/open", json={"viewer_name": "TEST_Dott Rossi", "code": "000001" if ST['sum']['code'] != "000001" else "000002"})
        assert r.status_code == 403 and "Tentativi rimasti: 4" in r.json()["detail"]
        r = requests.post(f"{API}/public/passport/{ST['sum']['token']}/open", json={"viewer_name": "ab", "code": ST['sum']['code']})
        assert r.status_code == 422

    def test_open_summary_scope(self):
        r = requests.post(f"{API}/public/passport/{ST['sum']['token']}/open", json={"viewer_name": "TEST_Dott Rossi", "code": ST['sum']['code']})
        assert r.status_code == 200
        d = r.json()
        assert set(d["data"]) <= {"child", "summary", "vaccines", "doctors", "updated_at", "contact"}
        assert "growth" not in d["data"] and "visits" not in d["data"] and "bilanci" not in d["data"]
        assert CF not in r.text and "fiscal_code" not in r.text
        assert "noindex" in r.headers.get("X-Robots-Tag", "")
        # pdf denied on summary
        assert requests.get(f"{API}/public/passport/view/{d['key']}/reports/{ST['visit']}/pdf").status_code == 403

    def test_open_full_and_pdf(self):
        r = requests.post(f"{API}/public/passport/{ST['full']['token']}/open", json={"viewer_name": "TEST_Dott Verdi", "code": ST['full']['code']})
        assert r.status_code == 200
        d = r.json()
        assert {"growth", "visits", "bilanci"} <= set(d["data"]) and CF not in r.text
        assert d["import"]["allowed"] is True and d["import"]["mantmed_doctor"] is False
        ST["full_key"] = d["key"]
        p = requests.get(f"{API}/public/passport/view/{d['key']}/reports/{ST['visit']}/pdf")
        assert p.status_code == 200 and p.headers["content-type"].startswith("application/pdf") and p.content[:4] == b"%PDF"

    # nascondi referto
    def test_hide_visit_excluded_from_share(self, parent):
        r = parent.post(f"{API}/portal/passport/{PID}/visits/{ST['visit']}/hide", json={"hidden": True})
        assert r.status_code == 200
        own = parent.get(f"{API}/portal/passport/{PID}").json()
        assert next(v for v in own["visits"] if v["id"] == ST["visit"])["hidden"] is True
        d = requests.post(f"{API}/public/passport/{ST['full']['token']}/open", json={"viewer_name": "TEST_Dott Verdi", "code": ST['full']['code']}).json()
        assert ST["visit"] not in [v["id"] for v in d["data"]["visits"]]
        assert requests.get(f"{API}/public/passport/view/{d['key']}/reports/{ST['visit']}/pdf").status_code == 404
        r = parent.post(f"{API}/portal/passport/{PID}/visits/{ST['visit']}/hide", json={"hidden": False})
        assert r.status_code == 200
        d = requests.post(f"{API}/public/passport/{ST['full']['token']}/open", json={"viewer_name": "TEST_Dott Verdi", "code": ST['full']['code']}).json()
        assert ST["visit"] in [v["id"] for v in d["data"]["visits"]]

    # importazione
    def test_import_rules(self, cardio):
        ST["cardio_id"] = str(MDB.users.find_one({"email": "cardiologo.demo@example.com"})["_id"])
        assert requests.post(f"{API}/passport-import/{ST['full_key']}").status_code == 401
        d = cardio.post(f"{API}/public/passport/{ST['full_noimp']['token']}/open", json={"viewer_name": "TEST_Dott Cardio", "code": ST['full_noimp']['code']}).json()
        assert d["import"] == {"allowed": False, "mantmed_doctor": True}
        assert cardio.post(f"{API}/passport-import/{d['key']}").status_code == 403
        info = cardio.get(f"{API}/public/passport/{ST['full']['token']}").json()
        assert info["mantmed_doctor"] is True and info["allow_import"] is True
        d = cardio.post(f"{API}/public/passport/{ST['full']['token']}/open", json={"viewer_name": "TEST_Dott Cardio", "code": ST['full']['code']}).json()
        assert d["import"] == {"allowed": True, "mantmed_doctor": True}
        r1 = cardio.post(f"{API}/passport-import/{d['key']}")
        assert r1.status_code == 200, r1.text
        j1 = r1.json()
        ST.setdefault("imported", []).append(j1["patient_id"])
        assert j1["created"] is True and j1["vaccinations"] >= 13
        r2 = cardio.post(f"{API}/passport-import/{d['key']}")
        assert r2.status_code == 200 and r2.json()["created"] is False and r2.json()["patient_id"] == j1["patient_id"]
        assert r2.json()["vaccinations"] == 0 and r2.json()["measurements"] == 0
        assert MDB.patients.count_documents({"owner_id": ST["cardio_id"], "cf_hash": MDB.patients.find_one({"_id": ObjectId(PID)})["cf_hash"]}) == 1
        p = cardio.get(f"{API}/patients")
        assert p.status_code == 200
        rows = p.json() if isinstance(p.json(), list) else p.json().get("items", [])
        assert any(x["id"] == j1["patient_id"] and x["name"] == "Aurora Ricci" for x in rows)

    # registro accessi
    def test_access_log(self, parent):
        log = parent.get(f"{API}/portal/passport/{PID}/access").json()
        mine = [a for a in log if a["share_id"] in ST["shares"]]
        acts = {a["action"] for a in mine}
        assert {"apertura", "referto_pdf", "importazione"} <= acts
        assert any(a["viewer_name"] == "TEST_Dott Cardio" and a["mantmed_doctor"] for a in mine)
        assert any(a["viewer_name"] == "TEST_Dott Rossi" and a["share_scope"] == "summary" for a in mine)

    # revoca
    def test_revoke(self, parent):
        sid = ST["full"]["id"]
        assert parent.post(f"{API}/portal/passport/{PID}/shares/{sid}/revoke").status_code == 200
        assert parent.post(f"{API}/portal/passport/{PID}/shares/{sid}/revoke").status_code == 404
        info = requests.get(f"{API}/public/passport/{ST['full']['token']}").json()
        assert info["available"] is False and info["message"] == "Accesso non più disponibile"
        assert requests.post(f"{API}/public/passport/{ST['full']['token']}/open", json={"viewer_name": "TEST_x y", "code": ST['full']['code']}).status_code == 410
        assert requests.get(f"{API}/public/passport/view/{ST['full_key']}/reports/{ST['visit']}/pdf").status_code == 410
        s = next(x for x in parent.get(f"{API}/portal/passport/{PID}/shares").json() if x["id"] == sid)
        assert s["status"] == "revoked" and "token" not in s and "code" not in s

    # vaccinazioni lato medico
    def test_vaccinations_doctor(self, doc):
        cal = doc.get(f"{API}/vaccine-calendar").json()
        assert any(c["code"] == "esa" for c in cal)
        lst = doc.get(f"{API}/patients/{PID}/vaccinations").json()
        assert len(lst["done"]) >= 13
        d0 = lst["done"][0]
        assert doc.post(f"{API}/patients/{PID}/vaccinations", json={"code": d0["code"], "dose": d0["dose"], "date": "2024-01-01"}).status_code == 409
        assert doc.post(f"{API}/patients/{PID}/vaccinations", json={"code": "hpv", "dose": 1, "date": "2099-01-01"}).status_code == 400
        assert doc.post(f"{API}/patients/{PID}/vaccinations", json={"code": "hpv", "dose": 1, "date": "bad"}).status_code == 400
        r = doc.post(f"{API}/patients/{PID}/vaccinations", json={"code": "TEST_flu", "name": "TEST_Antinfluenzale", "dose": 1, "date": "2025-10-01"})
        assert r.status_code == 200, r.text
        vid = r.json()["id"]
        ST.setdefault("vacc", []).append(vid)
        assert r.json()["by"] == "Dott.ssa Tiziana Foti"
        assert doc.delete(f"{API}/vaccinations/{vid}").status_code == 200
        assert doc.delete(f"{API}/vaccinations/{vid}").status_code == 404

    def test_vaccination_cross_tenant(self, cardio):
        assert cardio.get(f"{API}/patients/{PID}/vaccinations").status_code == 404
        assert cardio.post(f"{API}/patients/{PID}/vaccinations", json={"code": "hpv", "dose": 1, "date": "2025-01-01"}).status_code == 404

    # field_meta su modifica paziente
    def test_patient_field_meta(self, doc, parent):
        r = doc.patch(f"{API}/patients/{PID}", json={"blood_group": "A+"})
        assert r.status_code == 200, r.text
        try:
            s = parent.get(f"{API}/portal/passport/{PID}").json()["summary"]
            assert s["blood_group"]["value"] == "A+" and s["blood_group"]["by"] == "Dott.ssa Tiziana Foti"
        finally:
            doc.patch(f"{API}/patients/{PID}", json={"blood_group": ""})
            MDB.patients.update_one({"_id": ObjectId(PID)}, {"$unset": {"field_meta.blood_group": ""}})

    def test_robots_txt(self):
        r = requests.get(f"{BASE_URL}/robots.txt")
        assert r.status_code == 200 and "Disallow: /p/" in r.text
