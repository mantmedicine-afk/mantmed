"""Portal communications: parent<->doctor threads, statuses, notifications, RBAC, encryption at rest."""
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
PARENT = ("genitore.demo@example.com", "Portale-Demo-2026")
FOTI = ("medico@mantmed.it", "Auscula-Studio-2026")
DB = MongoClient(_benv["MONGO_URL"])[_benv["DB_NAME"]]


def _login(email, password):
    s = requests.Session()
    data = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}).json()
    if data.get("mfa_required"):
        code = subprocess.check_output(["python", "tests/totp_code.py"], cwd="/app/backend").decode().strip()
        assert s.post(f"{BASE_URL}/api/auth/2fa/verify", json={"mfa_token": data["mfa_token"], "code": code}).status_code == 200
    return s


@pytest.fixture(scope="module")
def sessions():
    parent, doc = _login(*PARENT), _login(*FOTI)
    yield parent, doc
    ids = [str(t["_id"]) for t in DB.threads.find({"subject": {"$exists": True}, "kind": {"$in": ["ricetta", "info"]}, "created_at": {"$gte": START}})]
    DB.messages.delete_many({"thread_id": {"$in": ids}})
    DB.threads.delete_many({"_id": {"$in": [__import__("bson").ObjectId(i) for i in ids]}})
    DB.notifications.delete_many({"created_at": {"$gte": START}, "kind": "reply"})
    DB.audit.delete_many({"action": {"$in": ["messaggio_portale_ricevuto", "messaggio_portale_risposto"]}, "at": {"$gte": START}})


START = __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat()


def _child(parent):
    kids = parent.get(f"{BASE_URL}/api/portal/me").json()["children"]
    assert kids
    return kids[0]


def test_full_thread_flow(sessions):
    parent, doc = sessions
    k = _child(parent)
    r = parent.post(f"{BASE_URL}/api/portal/threads", json={"patient_id": k["patient"]["id"], "owner_id": k["doctor"]["id"], "kind": "ricetta",
                                                          "body": "TEST richiesta ricetta", "fields": [{"label": "Farmaco", "value": "Paracetamolo"}]})
    assert r.status_code == 200, r.text
    t = r.json()
    assert t["status"] == "inviato" and t["subject"] == "Richiesta ricetta ripetibile"
    raw = DB.messages.find_one({"thread_id": t["id"]})
    assert raw["body"].startswith("enc:v1:") and raw["fields"].startswith("enc:v1:")
    assert doc.get(f"{BASE_URL}/api/messages/summary").json()["unread"] >= 1
    d = doc.get(f"{BASE_URL}/api/messages/threads/{t['id']}").json()
    assert d["messages"][0]["fields"][0]["value"] == "Paracetamolo"
    p = parent.get(f"{BASE_URL}/api/portal/threads/{t['id']}").json()
    assert p["thread"]["status"] == "letto" and p["messages"][0]["status"] == "letto"
    doc.post(f"{BASE_URL}/api/messages/threads/{t['id']}/messages", json={"body": "TEST risposta"}).raise_for_status()
    n = parent.get(f"{BASE_URL}/api/portal/notifications").json()
    assert n["messages_unread"] >= 1 and any(x["kind"] == "reply" and x["ref"] == t["id"] and not x["read_at"] for x in n["items"])
    p = parent.get(f"{BASE_URL}/api/portal/threads/{t['id']}").json()
    assert p["thread"]["status"] == "risposto" and p["messages"][0]["status"] == "risposto" and p["messages"][1]["from"] == "doctor"
    n = parent.get(f"{BASE_URL}/api/portal/notifications").json()
    assert all(x["read_at"] for x in n["items"] if x["kind"] == "reply" and x["ref"] == t["id"])


def test_rbac_and_isolation(sessions):
    parent, doc = sessions
    assert parent.get(f"{BASE_URL}/api/messages/threads").status_code == 403
    assert doc.get(f"{BASE_URL}/api/portal/threads").status_code == 403
    k = _child(parent)
    r = parent.post(f"{BASE_URL}/api/portal/threads", json={"patient_id": k["patient"]["id"], "owner_id": "6ad4e2fbeee83d004b1921d2", "kind": "info", "body": "TEST"})
    assert r.status_code == 404
    assert parent.get(f"{BASE_URL}/api/portal/threads/000000000000000000000000").status_code == 404


def test_mark_all_read(sessions):
    parent, _ = sessions
    parent.post(f"{BASE_URL}/api/portal/notifications/read", json={}).raise_for_status()
    assert parent.get(f"{BASE_URL}/api/portal/notifications").json()["unread"] == 0


# ---- Report publish notification ----
def test_report_publish_creates_notification(sessions):
    from bson import ObjectId
    parent, doc = sessions
    k = _child(parent)
    pid, owner = k["patient"]["id"], k["doctor"]["id"]
    # find existing consultation for the demo patient
    cons = DB.consultations.find_one({"patient_id": pid})
    assert cons, "No consultation found for demo patient"
    cid = str(cons["_id"])
    # remove any existing report notification with this key to force fresh insert
    DB.notifications.delete_many({"parent_id": str((DB.users.find_one({"email": PARENT[0]}))["_id"]), "key": f"rep:{cid}"})
    # un-publish then re-publish
    doc.post(f"{BASE_URL}/api/consultations/{cid}/portal", json={"published": False}).raise_for_status()
    r = doc.post(f"{BASE_URL}/api/consultations/{cid}/portal", json={"published": True})
    assert r.status_code == 200
    n = parent.get(f"{BASE_URL}/api/portal/notifications").json()
    report_notifs = [x for x in n["items"] if x["kind"] == "report" and x["ref"] == cid]
    assert report_notifs, f"No report notification; items={n['items']}"
    assert report_notifs[0]["title"] == "Nuovo referto disponibile"
    assert report_notifs[0]["patient_id"] == pid


# ---- Checkpoint notification ----
def test_checkpoint_creates_notification(sessions):
    parent, doc = sessions
    k = _child(parent)
    pid = k["patient"]["id"]
    tpl = doc.get(f"{BASE_URL}/api/patients/{pid}/checkpoint").json()
    answers = {q["id"]: (q.get("options", [{"value": "si"}])[0]["value"] if q.get("type") == "choice" else "ok") for q in tpl.get("questions", [])}
    payload = {"clinic": "TEST clinic", "answers": answers}
    r = doc.post(f"{BASE_URL}/api/patients/{pid}/checkpoints", json=payload)
    assert r.status_code == 200, r.text
    cp_id = r.json()["id"]
    n = parent.get(f"{BASE_URL}/api/portal/notifications").json()
    cp_notifs = [x for x in n["items"] if x["kind"] == "checkpoint" and x["ref"] == cp_id]
    assert cp_notifs, f"No checkpoint notification; items={[x['kind'] for x in n['items']]}"
    assert "Nuovo bilancio di salute" in cp_notifs[0]["title"]
    # verify checkpoint visible on portal me (child view)
    me = parent.get(f"{BASE_URL}/api/portal/me").json()
    all_cps = [c for kid in me.get("children", []) for c in kid.get("checkpoints", [])]
    assert any(c["id"] == cp_id for c in all_cps), f"Checkpoint missing from portal/me child_view; ids={[c['id'] for c in all_cps]}"
    # cleanup
    from bson import ObjectId
    DB.checkpoints.delete_one({"_id": ObjectId(cp_id)})
    DB.notifications.delete_many({"ref": cp_id, "kind": "checkpoint"})


# ---- Appointment reminder ----
def test_appointment_reminder(sessions):
    from bson import ObjectId
    import datetime as dt
    parent, _ = sessions
    k = _child(parent)
    pid, owner = k["patient"]["id"], k["doctor"]["id"]
    from zoneinfo import ZoneInfo
    today = dt.datetime.now(ZoneInfo("Europe/Rome")).date().isoformat()
    ap = DB.appointments.insert_one({
        "patient_id": pid, "owner_id": owner, "patient_name": "TEST reminder",
        "clinic": "TEST clinic", "date": today, "time": "15:30",
        "visit_type": "controllo", "status": "programmato", "duration": 30,
        "notes": "", "created_at": dt.datetime.utcnow().isoformat()
    })
    aid = ap.inserted_id
    try:
        n = parent.get(f"{BASE_URL}/api/portal/notifications").json()
        rems = [x for x in n["items"] if x["kind"] == "reminder" and x["ref"] == str(aid)]
        assert rems, f"No reminder notification created; kinds={[x['kind'] for x in n['items']]}"
        assert "oggi" in rems[0]["title"].lower() and "15:30" in rems[0]["title"]
    finally:
        DB.appointments.delete_one({"_id": aid})
        DB.notifications.delete_many({"ref": str(aid), "kind": "reminder"})
