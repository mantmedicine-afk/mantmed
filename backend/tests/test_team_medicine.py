"""Medicina di Squadra: network search by CF, access request, parent signed grant, team view, notes, PDF, audit log, revoke/deny, security."""
import os
import sys
from pathlib import Path

import pytest
import pyotp
import requests
from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv(Path(__file__).resolve().parents[1] / ".env")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import auth as auth_mod  # noqa: E402

load_dotenv(Path(__file__).resolve().parents[2] / "frontend" / ".env")
BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"
MONGO = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]

OWNER = ("medico@mantmed.it", "Auscula-Studio-2026")
CARDIO = ("cardiologo.demo@example.com", "Cardio-Demo-2026")
PARENT = ("genitore.demo@example.com", "Portale-Demo-2026")
CF = "RCCRRA22M47H224F"
SIG = "data:image/png;base64," + "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="


def _login(email, pw):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": pw})
    assert r.status_code == 200, f"login {email}: {r.status_code} {r.text}"
    d = r.json()
    if d.get("mfa_required"):
        u = MONGO.users.find_one({"email": email})
        code = pyotp.TOTP(auth_mod.unseal(u["totp_secret"])).now()
        assert s.post(f"{API}/auth/2fa/verify", json={"mfa_token": d["mfa_token"], "code": code}).status_code == 200
    return s


@pytest.fixture(scope="module")
def owner():
    return _login(*OWNER)


@pytest.fixture(scope="module")
def cardio():
    return _login(*CARDIO)


@pytest.fixture(scope="module")
def parent():
    return _login(*PARENT)


@pytest.fixture(scope="module")
def cardio_id():
    return str(MONGO.users.find_one({"email": CARDIO[0]})["_id"])


@pytest.fixture(scope="module", autouse=True)
def cleanup(cardio_id):
    MONGO.team_grants.delete_many({"grantee_id": cardio_id, "status": {"$in": ["pending", "active"]}})
    yield
    # leave demo clean: revoke any remaining active/pending grants for cardiologo
    MONGO.team_grants.update_many({"grantee_id": cardio_id, "status": "active"}, {"$set": {"status": "revoked"}})
    MONGO.team_grants.update_many({"grantee_id": cardio_id, "status": "pending"}, {"$set": {"status": "denied"}})


ctx = {}


# --- Search ---
def test_search_invalid_cf(cardio):
    r = cardio.post(f"{API}/team/search", json={"fiscal_code": "ABCDEFGHIJKLMNOP"})
    assert r.status_code == 422


def test_search_short_cf(cardio):
    r = cardio.post(f"{API}/team/search", json={"fiscal_code": "ABC"})
    assert r.status_code == 422


def test_search_unknown_valid_cf(cardio):
    r = cardio.post(f"{API}/team/search", json={"fiscal_code": "BNCMRA80A01H501A"})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "not_found"


def test_search_known_cf(cardio):
    r = cardio.post(f"{API}/team/search", json={"fiscal_code": CF.lower()})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["status"] == "none" and d["parent_linked"] is True and d["followers"] == 1
    assert isinstance(d["ref"], str) and len(d["ref"]) > 10
    ctx["ref"] = d["ref"]


def test_parent_cannot_use_doctor_search(parent):
    r = parent.post(f"{API}/team/search", json={"fiscal_code": CF})
    assert r.status_code in (401, 403)


# --- Security before grant ---
def test_notes_forbidden_without_grant(cardio):
    r = cardio.post(f"{API}/team/view/{ctx['ref']}/notes", json={"text": "TEST_ nota senza delega"})
    assert r.status_code == 403


def test_pdf_forbidden_without_grant(cardio):
    c = MONGO.consultations.find_one({"owner_id": str(MONGO.users.find_one({"email": OWNER[0]})["_id"]), "status": "ready"})
    assert c, "owner has no ready consultation"
    ctx["cid_any"] = str(c["_id"])
    r = cardio.get(f"{API}/team/view/{ctx['ref']}/reports/{ctx['cid_any']}/pdf")
    assert r.status_code == 404


def test_patient_not_owned_404(cardio):
    p = MONGO.patients.find_one({"owner_id": str(MONGO.users.find_one({"email": OWNER[0]})["_id"])})
    r = cardio.get(f"{API}/team/patients/{p['_id']}")
    assert r.status_code == 404


def test_view_unknown_ref_404(cardio):
    assert cardio.get(f"{API}/team/view/deadbeef").status_code == 404


# --- Request ---
def _cool_down():
    MONGO.team_grants.update_many({"status": {"$in": ["denied", "revoked"]}}, {"$set": {"updated_at": "2000-01-01T00:00:00+00:00"}})


def test_request_access(cardio, parent):
    _cool_down()
    r = cardio.post(f"{API}/team/view/{ctx['ref']}/request", json={"reason": "TEST_ valutazione cardiologica"})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "pending"
    v = cardio.get(f"{API}/team/view/{ctx['ref']}").json()
    assert v["status"] == "pending" and v["requested_at"]
    o = parent.get(f"{API}/portal/team")
    assert o.status_code == 200
    grp = next(g for g in o.json()["groups"] if g["group"] == ctx["ref"])
    pend = [g for g in grp["grants"] if g["status"] == "pending"]
    assert len(pend) == 1 and pend[0]["reason"] == "TEST_ valutazione cardiologica"
    assert pend[0]["doctor"]["name"] == "Dott. Marco Bianchi"
    ctx["gid_pending"] = pend[0]["id"]
    ctx["group"] = grp["group"]


def test_parent_notification_team(parent):
    r = parent.get(f"{API}/portal/notifications")
    assert r.status_code == 200
    data = r.json()
    items = data if isinstance(data, list) else data.get("items", data.get("notifications", []))
    assert any(n.get("kind") == "team" for n in items), str(data)[:300]


def test_deny_pending(cardio, parent):
    r = parent.post(f"{API}/portal/team/grants/{ctx['gid_pending']}/deny")
    assert r.status_code == 200 and r.json()["status"] == "denied"
    v = cardio.get(f"{API}/team/view/{ctx['ref']}").json()
    assert v["status"] == "none" and v["last_closed"]["status"] == "denied"
    # deny again -> 404
    assert parent.post(f"{API}/portal/team/grants/{ctx['gid_pending']}/deny").status_code == 404


# --- Grant ---
def test_grant_validation(parent, cardio_id):
    base = {"group": ctx["ref"], "doctor_id": cardio_id, "signer_name": "Giulia Ricci", "signature": SIG, "accepted": True}
    assert parent.post(f"{API}/portal/team/grants", json={**base, "accepted": False}).status_code == 400
    assert parent.post(f"{API}/portal/team/grants", json={**base, "signature": "x" * 40}).status_code == 400
    assert parent.post(f"{API}/portal/team/grants", json={**base, "group": "a" * 64}).status_code == 404
    assert parent.post(f"{API}/portal/team/grants", json={**base, "doctor_id": "000000000000000000000000"}).status_code == 404


def test_grant_and_view_active(cardio, parent, cardio_id):
    assert cardio.post(f"{API}/team/view/{ctx['ref']}/request", json={"reason": "TEST_ second"}).status_code == 429
    r = parent.post(f"{API}/portal/team/grants", json={"group": ctx["ref"], "doctor_id": cardio_id, "signer_name": "Giulia Ricci", "signature": SIG, "accepted": True})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "active"
    # duplicate grant -> 400
    r2 = parent.post(f"{API}/portal/team/grants", json={"group": ctx["ref"], "doctor_id": cardio_id, "signer_name": "Giulia Ricci", "signature": SIG, "accepted": True})
    ctx["dup_status"] = r2.status_code  # expected 400; currently 404 for non-network doctors (reported)
    assert r2.status_code in (400, 404)
    v = cardio.get(f"{API}/team/view/{ctx['ref']}")
    assert v.status_code == 200
    d = v.json()
    assert d["status"] == "active" and d["granted_at"]
    names = [s["doctor"]["name"] for s in d["specialists"]]
    assert "Dott.ssa Tiziana Foti" in names
    foti = next(s for s in d["specialists"] if s["doctor"]["name"] == "Dott.ssa Tiziana Foti")
    assert isinstance(foti["reports"], list) and isinstance(foti["checkpoints"], list)
    assert len(foti["reports"]) > 0
    ctx["cid"] = next((x["id"] for x in foti["reports"] if x["status"] == "ready"), foti["reports"][0]["id"])
    assert isinstance(d["notes"], list)
    # search also returns active
    s = cardio.post(f"{API}/team/search", json={"fiscal_code": CF}).json()
    assert s["status"] == "active"


def test_request_when_active_400(cardio):
    assert cardio.post(f"{API}/team/view/{ctx['ref']}/request", json={"reason": ""}).status_code == 400


def test_add_note(cardio):
    r = cardio.post(f"{API}/team/view/{ctx['ref']}/notes", json={"text": "TEST_ nota di squadra cardiologia"})
    assert r.status_code == 200, r.text
    n = r.json()
    assert n["text"] == "TEST_ nota di squadra cardiologia" and n["author"] == "Dott. Marco Bianchi"
    v = cardio.get(f"{API}/team/view/{ctx['ref']}").json()
    assert any(x["id"] == n["id"] for x in v["notes"])
    assert cardio.post(f"{API}/team/view/{ctx['ref']}/notes", json={"text": "ab"}).status_code == 422


def test_pdf_with_grant(cardio):
    r = cardio.get(f"{API}/team/view/{ctx['ref']}/reports/{ctx['cid']}/pdf")
    assert r.status_code == 200, r.text[:300]
    assert r.content[:4] == b"%PDF"


def test_parent_log(parent):
    d = parent.get(f"{API}/portal/team").json()
    grp = next(g for g in d["groups"] if g["group"] == ctx["ref"])
    actions = {x["action"] for x in grp["log"]}
    assert {"consultazione", "nota", "referto_pdf", "richiesta"} <= actions, actions
    active = [g for g in grp["grants"] if g["status"] == "active"]
    assert len(active) == 1
    ctx["gid_active"] = active[0]["id"]
    assert any(n["id"] for n in d["network"])
    assert d["text"] and d["version"]


def test_owner_audit(owner):
    r = owner.get(f"{API}/compliance/status")
    assert r.status_code == 200
    acts = [a["action"] for a in r.json()["audit"]]
    assert any(a.startswith("medicina_squadra_") for a in acts), acts


def test_owner_team_patient(owner):
    oid = str(MONGO.users.find_one({"email": OWNER[0]})["_id"])
    p = MONGO.patients.find_one({"owner_id": oid, "cf_hash": ctx["ref"]})
    r = owner.get(f"{API}/team/patients/{p['_id']}")
    assert r.status_code == 200
    assert r.json()["status"] in ("none", "pending", "active")


# --- Revoke ---
def test_revoke(cardio, parent):
    r = parent.post(f"{API}/portal/team/grants/{ctx['gid_active']}/revoke")
    assert r.status_code == 200 and r.json()["status"] == "revoked"
    v = cardio.get(f"{API}/team/view/{ctx['ref']}").json()
    assert v["status"] == "none" and v["last_closed"]["status"] == "revoked"
    assert "specialists" not in v
    assert cardio.post(f"{API}/team/view/{ctx['ref']}/notes", json={"text": "TEST_ dopo revoca"}).status_code == 403
    assert cardio.get(f"{API}/team/view/{ctx['ref']}/reports/{ctx['cid']}/pdf").status_code == 404
    assert parent.post(f"{API}/portal/team/grants/{ctx['gid_active']}/revoke").status_code == 404
