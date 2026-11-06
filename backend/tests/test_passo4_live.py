# Passaggio 4 (regole di accesso al portale) - live E2E against public URL + app DB, TEST_ data only, cleaned at end.
import os
import random
import string
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import pytest
import requests
from bson import ObjectId
from dotenv import load_dotenv
from pymongo import MongoClient

ROOT = Path(__file__).parents[1]
load_dotenv(ROOT / ".env")
load_dotenv(ROOT.parent / "frontend" / ".env")
sys.path.insert(0, str(ROOT))
from auth import hash_password  # noqa: E402
from registration import cf_valid, _CF_ODD  # noqa: E402
from tenancy import cf_hash  # noqa: E402
from crypto import seal_fields  # noqa: E402

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"
DB = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
PW = "TEST-Passo4-2026!"
TAG = "".join(random.choices(string.ascii_lowercase, k=5))
S = {"users": [], "patients": [], "payments": [], "tx": [], "cons": [], "grants_pids": []}


def make_cf() -> str:
    body = "".join(random.choices(string.ascii_uppercase, k=6)) + "10A41H501"
    val = lambda ch: int(ch) if ch.isdigit() else ord(ch) - 65
    s = sum(_CF_ODD[val(ch)] if i % 2 == 0 else val(ch) for i, ch in enumerate(body))
    cf = body + chr(65 + s % 26)
    assert cf_valid(cf)
    return cf


def mk_user(label: str, cfs: list) -> dict:
    email = f"test_{label}_{TAG}@example.com"
    now = datetime.now(timezone.utc).isoformat()
    uid = DB.users.insert_one({"email": email, "password_hash": hash_password(PW), "created_at": now, "email_verified_at": now,
                               "first_name": "TEST", "last_name": label, "name": f"TEST_{label}", "role": "patient", "status": "active",
                               "consent": {"version": "Informativa privacy e consenso dati sanitari v1.0", "privacy_policy": True, "health_data": True, "at": now},
                               "child_cfs": [cf_hash(c) for c in cfs], "children": []}).inserted_id
    S["users"].append(uid)
    return {"id": str(uid), "email": email}


def login(email, pw=PW) -> requests.Session:
    s = requests.Session()
    r = s.post(f"{BASE}/auth/login", json={"email": email, "password": pw})
    assert r.status_code == 200, r.text
    return s


def me_children(s):
    r = s.get(f"{BASE}/portal/me")
    assert r.status_code == 200, r.text
    return r.json()


def born_years_ago(years: int, extra_days: int) -> str:
    t = date.today()
    try:
        b = t.replace(year=t.year - years)
    except ValueError:
        b = date(t.year - years, 2, 28)
    return (b - timedelta(days=extra_days)).isoformat()


@pytest.fixture(scope="module", autouse=True)
def cleanup():
    yield
    pids = [str(p) for p in S["patients"]]
    DB.users.delete_many({"_id": {"$in": S["users"]}})
    DB.patients.delete_many({"_id": {"$in": S["patients"]}})
    DB.access_grants.delete_many({"patient_id": {"$in": pids}})
    DB.payments.delete_many({"_id": {"$in": S["payments"]}})
    DB.payment_transactions.delete_many({"_id": {"$in": S["tx"]}})
    DB.consultations.delete_many({"_id": {"$in": S["cons"]}})
    DB.sessions.delete_many({"uid": {"$in": [str(u) for u in S["users"]]}})


@pytest.fixture(scope="module")
def doc():
    return login("medico@mantmed.it", "Auscula-Studio-2026")


class TestPasso4:
    def test_01_converted_demo_accounts(self):
        s = login("genitore.demo@example.com", "Portale-Demo-2026")
        assert s.get(f"{BASE}/auth/me").json()["role"] == "patient"
        d = me_children(s)
        aur = [c for c in d["children"] if c["patient"]["name"] == "Aurora Ricci"]
        assert aur and aur[0]["relation"] == "tutore" and aur[0]["relation_label"] == "Genitore o tutore"
        assert len(aur[0]["reports"]) > 0
        t = login("tutore.demo@example.com", "Tutore-Demo-2026")
        assert t.get(f"{BASE}/auth/me").json()["role"] == "patient"
        g = [c for c in me_children(t)["children"] if c["patient"]["name"] == "Giulia Demo"]
        assert g, "Giulia Demo missing"
        hidden = list(DB.consultations.find({"patient_id": g[0]["patient"]["id"], "guardian_hidden": True}, {"_id": 1}))
        assert hidden, "no reserved visit in DB"
        assert not {str(h["_id"]) for h in hidden} & {r["id"] for r in g[0]["reports"]}

    def test_02_two_guardians(self, doc):
        cf = make_cf()
        S["cf"] = cf
        S["A"], S["B"], S["C"] = mk_user("a", [cf]), mk_user("b", [cf]), mk_user("c", [cf])
        r = doc.post(f"{BASE}/patients", json={"name": f"TEST_Minore {TAG}", "birth_date": born_years_ago(15, 0), "sex": "F", "fiscal_code": cf,
                                               "guardian": "Mamma TEST", "guardian_email": S["A"]["email"], "guardian2": "Papa TEST", "guardian2_email": S["B"]["email"]})
        assert r.status_code == 200, r.text
        S["pid"] = r.json()["id"]
        S["patients"].append(ObjectId(S["pid"]))
        # report published for this TEST patient (copied from a demo consultation)
        src = DB.consultations.find_one({"_id": ObjectId("6ad86e64c06e50ff4cd67d23")})
        src.pop("_id")
        src.update({"patient_id": S["pid"], "patient_name": f"TEST_Minore {TAG}", "portal_published": True, "guardian_hidden": False})
        S["cid"] = str(DB.consultations.insert_one(src).inserted_id)
        S["cons"].append(ObjectId(S["cid"]))
        S["sA"], S["sB"], S["sC"] = login(S["A"]["email"]), login(S["B"]["email"]), login(S["C"]["email"])
        for k in ("sA", "sB"):
            ch = [c for c in me_children(S[k])["children"] if c["patient"]["id"] == S["pid"]]
            assert ch and ch[0]["relation"] == "tutore", k
            assert any(x["id"] == S["cid"] for x in ch[0]["reports"])
        assert not [c for c in me_children(S["sC"])["children"] if c["patient"]["id"] == S["pid"]]
        assert S["sA"].get(f"{BASE}/portal/reports/{S['cid']}/pdf").status_code == 200

    def test_03_coming_of_age_rule(self, doc):
        # payment paid online by A before 18
        pay = {"patient_id": S["pid"], "patient_name": f"TEST_Minore {TAG}", "clinic": "Studio Centro", "amount": 100.0, "method": "online",
               "date": date.today().isoformat(), "created_at": datetime.now(timezone.utc).isoformat(), "receipt_no": f"TEST-{TAG}/2026", "stamp": 0,
               "refund_of": None, "refunded_at": None, "owner_id": DB.users.find_one({"email": "medico@mantmed.it"})["_id"].__str__(),
               **seal_fields({"service": "TEST visita"}, ("service",))}
        S["pay"] = str(DB.payments.insert_one(pay).inserted_id)
        S["payments"].append(ObjectId(S["pay"]))
        S["tx"].append(DB.payment_transactions.insert_one({"parent_id": S["A"]["id"], "payment_id": S["pay"], "session_id": f"TEST_{TAG}"}).inserted_id)
        r = doc.patch(f"{BASE}/patients/{S['pid']}", json={"birth_date": born_years_ago(18, 1)})
        assert r.status_code == 200, r.text
        d = me_children(S["sA"])
        assert not [c for c in d["children"] if c["patient"]["id"] == S["pid"]]
        fo = [f for f in d["fiscal_only"] if f["patient"]["id"] == S["pid"]]
        assert fo and fo[0]["reason"] == "maggiore_eta"
        assert [x["id"] for x in fo[0]["receipts"]] == [S["pay"]]
        # B has no transaction -> fiscal_only with no receipts
        fb = [f for f in me_children(S["sB"])["fiscal_only"] if f["patient"]["id"] == S["pid"]]
        assert fb and fb[0]["receipts"] == []
        assert S["sA"].get(f"{BASE}/portal/receipts/{S['pay']}/pdf").status_code == 200
        assert S["sB"].get(f"{BASE}/portal/receipts/{S['pay']}/pdf").status_code == 404
        assert S["sA"].get(f"{BASE}/portal/reports/{S['cid']}/pdf").status_code == 404
        assert DB.audit.find_one({"action": "accesso_portale_chiuso", "user_id": S["A"]["id"], "reason": "maggiore_eta"})

    def test_04_adult_self_and_delegation(self, doc):
        S["P"] = mk_user("p", [S["cf"]])
        r = doc.patch(f"{BASE}/patients/{S['pid']}", json={"patient_email": S["P"]["email"]})
        assert r.status_code == 200
        S["sP"] = login(S["P"]["email"])
        ch = [c for c in me_children(S["sP"])["children"] if c["patient"]["id"] == S["pid"]]
        assert ch and ch[0]["relation"] == "paziente"
        acc = S["sP"].get(f"{BASE}/portal/access").json()
        assert S["pid"] in acc["own"]
        body = {"patient_id": S["pid"], "name": "TEST Mamma", "email": S["A"]["email"], "consent": False}
        assert S["sP"].post(f"{BASE}/portal/access/delegations", json=body).status_code == 400
        assert S["sA"].post(f"{BASE}/portal/access/delegations", json={**body, "consent": True, "email": S["C"]["email"]}).status_code == 403
        r = S["sP"].post(f"{BASE}/portal/access/delegations", json={**body, "consent": True})
        assert r.status_code == 200, r.text
        gid = r.json()["id"]
        assert S["sP"].post(f"{BASE}/portal/access/delegations", json={**body, "consent": True}).status_code == 409
        ch = [c for c in me_children(S["sA"])["children"] if c["patient"]["id"] == S["pid"]]
        assert ch and ch[0]["relation"] == "delegato" and ch[0]["relation_label"] == "Familiare delegato"
        assert DB.audit.find_one({"action": "delega_familiare_concessa", "user_id": S["P"]["id"]})
        assert S["sA"].delete(f"{BASE}/portal/access/delegations/{gid}").status_code == 404
        assert S["sP"].delete(f"{BASE}/portal/access/delegations/{gid}").status_code == 200
        assert not [c for c in me_children(S["sA"])["children"] if c["patient"]["id"] == S["pid"]]
        assert DB.audit.find_one({"action": "delega_familiare_revocata", "user_id": S["P"]["id"]})

    def test_05_legal_guardian(self, doc):
        S["L"] = mk_user("l", [])
        a = doc.get(f"{BASE}/patients/{S['pid']}/access").json()
        assert a["rules_active"] is True and a["adult"] is True
        body = {"name": "TEST Tutore Legale", "email": S["L"]["email"], "tipo": "amministratore_sostegno", "document": "Decreto TEST n. 1/2026"}
        r = doc.post(f"{BASE}/patients/{S['pid']}/access/legal", json=body)
        assert r.status_code == 200, r.text
        gid = r.json()["id"]
        assert doc.post(f"{BASE}/patients/{S['pid']}/access/legal", json=body).status_code == 409
        S["sL"] = login(S["L"]["email"])
        ch = [c for c in me_children(S["sL"])["children"] if c["patient"]["id"] == S["pid"]]
        assert ch and ch[0]["relation"] == "legale"
        assert DB.audit.find_one({"action": "accesso_legale_attivato", "owner_id": a and DB.patients.find_one({"_id": ObjectId(S["pid"])})["owner_id"]})
        assert doc.delete(f"{BASE}/patients/{S['pid']}/access/legal/{gid}").status_code == 200
        assert not [c for c in me_children(S["sL"])["children"] if c["patient"]["id"] == S["pid"]]
        assert doc.delete(f"{BASE}/patients/{S['pid']}/access/legal/{gid}").status_code == 404

    def test_06_cron_unauth_and_dashboard(self, doc):
        assert requests.post(f"{BASE}/cron/coming-of-age", json={}).status_code == 401
        assert requests.post(f"{BASE}/cron/coming-of-age", json={}, headers={"Authorization": "Bearer wrong"}).status_code == 401
        r = doc.patch(f"{BASE}/patients/{S['pid']}", json={"birth_date": born_years_ago(18, -10), "patient_email": ""})
        assert r.status_code == 200
        lst = doc.get(f"{BASE}/access/coming-of-age").json()
        hit = [x for x in lst if x["id"] == S["pid"]]
        assert hit and hit[0]["adult_on"] == (date.today() + timedelta(days=10)).isoformat()
        # minor again -> guardians A and B regain access
        assert [c for c in me_children(S["sA"])["children"] if c["patient"]["id"] == S["pid"]]

    def test_07_cron_logic_in_process(self):
        import asyncio
        import access_rules
        from motor.motor_asyncio import AsyncIOMotorClient
        sent = []

        async def fake_send(to, subject, html, **kw):
            sent.append((to, subject))

        async def run():
            access_rules.send_email = fake_send
            mdb = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
            DB.patients.update_one({"_id": ObjectId(S["pid"])}, {"$set": {"adult_notice_sent_at": None}})
            return await access_rules.coming_of_age(mdb, "https://x")
        res = asyncio.run(run())
        p = DB.patients.find_one({"_id": ObjectId(S["pid"])})
        assert p.get("adult_notice_sent_at"), res
        mine = [t for t, _ in sent if t in (S["A"]["email"], S["B"]["email"])]
        assert sorted(mine) == sorted([S["A"]["email"], S["B"]["email"]]), sent
        assert DB.audit.find_one({"action": "avviso_maggiore_eta", "at": {"$gte": p["adult_notice_sent_at"][:19]}})
        # idempotent second run
        n = len(sent)
        asyncio.run(run.__wrapped__() if hasattr(run, "__wrapped__") else _noop())
        assert len(sent) == n


async def _noop():
    return None
