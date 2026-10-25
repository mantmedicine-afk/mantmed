"""MantAI Risposte: classification, drafts queue, auto admin replies, urgency, RBAC, audit, disabled state."""
import os
import re
import time
from datetime import datetime, timezone
from pathlib import Path
import pytest
import requests
from bson import ObjectId
from dotenv import dotenv_values
from pymongo import MongoClient

_env = dotenv_values(Path(__file__).resolve().parents[2] / "frontend" / ".env")
_benv = dotenv_values(Path(__file__).resolve().parents[1] / ".env")
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _env.get("REACT_APP_BACKEND_URL")).rstrip("/")
API = f"{BASE_URL}/api"
DB = MongoClient(_benv["MONGO_URL"])[_benv["DB_NAME"]]
PID, OWNER = "6ad86e64c06e50ff4cd67d1e", "6ad86e63c06e50ff4cd67d12"
CLINICS = ("Studio Centro", "Studio Provincia")
URGENT_TXT = "TEST_URG Chiami subito il 112 se il bambino non respira o ha convulsioni. Messaggio segnalato al medico."
DRUG_RE = re.compile(r"\b(\d+\s?mg|\d+\s?ml|mg/kg|paracetamolo|tachipirina|ibuprofene|nurofen)\b", re.I)
START = datetime.now(timezone.utc).isoformat()
STATE = {}


def login(email, pw):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": pw})
    assert r.status_code == 200, r.text
    return s


def poll(fn, timeout=150, every=4):
    end = time.time() + timeout
    while time.time() < end:
        v = fn()
        if v:
            return v
        time.sleep(every)
    return None


@pytest.fixture(scope="module")
def S():
    doc, par, card = login("medico@mantmed.it", "Auscula-Studio-2026"), login("genitore.demo@example.com", "Portale-Demo-2026"), login("cardiologo.demo@example.com", "Cardio-Demo-2026")
    kb_backup = doc.get(f"{API}/ai-replies/knowledge-base").json()["clinics"]
    st_backup = doc.get(f"{API}/ai-replies/settings").json()["clinics"]
    yield {"doc": doc, "par": par, "card": card}
    for k in kb_backup:
        doc.put(f"{API}/ai-replies/knowledge-base", json=k)
    for s in st_backup:  # default state must stay OFF after the suite
        doc.put(f"{API}/ai-replies/settings", json={**s, "enabled": False, "auto_admin": False})


def set_all(doc, enabled=True, auto=True, urgent=URGENT_TXT):
    for c in CLINICS:
        r = doc.put(f"{API}/ai-replies/settings", json={"clinic": c, "enabled": enabled, "auto_admin": auto, "urgent_text": urgent})
        assert r.status_code == 200 and r.json()["enabled"] is enabled, r.text


def set_kb(doc, clinic, **kw):
    body = {"clinic": clinic, "hours": "", "address": "", "booking": "", "fees": "", "cancellation": "", "faqs": [], "signature": "", "tone": "formale", "address_form": "lei", **kw}
    r = doc.put(f"{API}/ai-replies/knowledge-base", json=body)
    assert r.status_code == 200, r.text
    return r.json()


def new_thread(par, body, kind="info"):
    r = par.post(f"{API}/portal/threads", json={"patient_id": PID, "owner_id": OWNER, "kind": kind, "body": body})
    assert r.status_code == 200, r.text
    return r.json()["id"]


def msgs(par, tid):
    return par.get(f"{API}/portal/threads/{tid}").json()


def draft_for(doc, tid):
    return next((d for d in doc.get(f"{API}/ai-replies/queue").json()["items"] if d["thread_id"] == tid), None)


# Settings / KB CRUD
def test_settings_kb_crud(S):
    doc = S["doc"]
    set_all(doc)
    got = {c["clinic"]: c for c in doc.get(f"{API}/ai-replies/settings").json()["clinics"]}
    assert got["Studio Centro"]["urgent_text"] == URGENT_TXT and got["Studio Provincia"]["auto_admin"] is True
    kb = set_kb(doc, "Studio Centro", hours="Lunedì-Venerdì 9:00-13:00 e 16:00-19:00", address="Via Roma 12, Reggio Calabria", faqs=[{"q": "TEST_FAQ?", "a": "Si"}], tone="cordiale", address_form="tu")
    assert kb["faqs"][0]["q"] == "TEST_FAQ?" and kb["tone"] == "cordiale" and kb["address_form"] == "tu"
    set_kb(doc, "Studio Provincia", hours="Martedì e Giovedì 15:00-18:30", address="Via Pozzicello 59, Gallico (RC)")
    raw = DB.ai_knowledge_base.find_one({"owner_id": OWNER, "clinic": "Studio Centro"})
    assert "9:00" not in str(raw.get("hours")), "KB hours not encrypted at rest"
    assert doc.put(f"{API}/ai-replies/settings", json={"clinic": "Inesistente", "enabled": True}).status_code == 404
    assert doc.put(f"{API}/ai-replies/knowledge-base", json={"clinic": "Studio Centro", "tone": "x"}).status_code == 422


# Acceptance 1: clinical -> ack + draft, no drugs
def test_a1_clinical(S):
    doc, par = S["doc"], S["par"]
    cats = []
    for _ in range(2):  # LLM classification is non-deterministic: one retry, both results reported
        tid = new_thread(par, "mio figlio ha 38,5 di febbre da ieri, cosa gli do?", "clinico")
        d = poll(lambda: draft_for(doc, tid))
        assert d, "no clinical draft in queue"
        cats.append(d["category"])
        if d["category"] == "clinico":
            break
    print("A1 categories:", cats)
    STATE["clin"], STATE["clin_draft"] = tid, d["id"]
    assert d["category"] == "clinico", d["category"]
    m = msgs(par, tid)
    froms = [(x["from"], x.get("ai_label")) for x in m["messages"]]
    print("A1 messages:", froms)
    assert ("system", "Messaggio automatico di MantAI") in froms
    assert not any(f == "doctor" for f, _ in froms)
    assert any("Il medico ti risponderà appena possibile" in x["body"] for x in m["messages"] if x["from"] == "system")
    assert m["thread"]["status"] == "in_attesa"
    full = doc.get(f"{API}/ai-replies/{d['id']}").json()
    print("A1 draft:", full["text"])
    assert not DRUG_RE.search(full["text"]), full["text"]
    assert "history" in full and full["original"].startswith("mio figlio")
    raw = DB.ai_reply_drafts.find_one({"_id": ObjectId(d["id"])})
    assert full["text"][:20] not in str(raw.get("text")), "draft not encrypted"
    STATE["clin_draft"] = d["id"]


# Acceptance 2: admin auto reply with KB hours
def test_a2_admin_auto(S):
    par = S["par"]
    tid = new_thread(par, "a che ora apre lo studio?")
    STATE["admin_auto"] = tid
    auto = poll(lambda: next((x for x in msgs(par, tid)["messages"] if x["from"] == "doctor"), None) or (draft_for(S["doc"], tid) and {"draft": True}))
    assert auto, "nothing produced"
    m = msgs(par, tid)
    doc_msgs = [x for x in m["messages"] if x["from"] == "doctor"]
    if not doc_msgs:
        d = draft_for(S["doc"], tid)
        print("A2 draft instead:", S["doc"].get(f"{API}/ai-replies/{d['id']}").json()["text"])
    assert doc_msgs, "no automatic reply"
    print("A2 auto reply:", doc_msgs[0]["body"])
    assert doc_msgs[0]["ai_label"] == "Risposta automatica di MantAI"
    assert m["thread"]["status"] == "risposto"
    STATE["a2_text"] = doc_msgs[0]["body"]


# Acceptance 3: KB hours missing -> admin draft, no invented hours
def test_a3_admin_missing_kb(S):
    doc, par = S["doc"], S["par"]
    set_kb(doc, "Studio Centro", booking="Prenotazioni dal portale o al telefono dello studio.")
    set_kb(doc, "Studio Provincia", booking="Prenotazioni dal portale.")
    tid = new_thread(par, "a che ora apre lo studio di via Pozzicello?")
    STATE["admin_draft"] = tid
    d = poll(lambda: draft_for(doc, tid))
    m = msgs(par, tid)
    assert not any(x["from"] == "doctor" for x in m["messages"]), [x["body"] for x in m["messages"]]
    assert d and d["category"] == "amministrativo", d
    txt = doc.get(f"{API}/ai-replies/{d['id']}").json()["text"]
    print("A3 draft:", txt)
    assert not re.search(r"\b\d{1,2}[:.]\d{2}\b", txt), "invented hours"
    STATE["admin_draft_id"] = d["id"]


# Acceptance 4: urgency
def test_a4_urgent(S):
    doc, par = S["doc"], S["par"]
    tid = new_thread(par, "ha avuto una convulsione", "altro")
    STATE["urg"] = tid
    sysm = poll(lambda: next((x for x in msgs(par, tid)["messages"] if x["from"] == "system"), None), timeout=90, every=2)
    assert sysm and sysm["body"] == URGENT_TXT, sysm
    th = next(t for t in doc.get(f"{API}/messages/threads").json() if t["id"] == tid)
    assert th["ai_urgent"] is True and th["ai_category"] == "urgenza"
    d = poll(lambda: draft_for(doc, tid))
    q = doc.get(f"{API}/ai-replies/queue").json()
    assert q["urgent"] >= 1 and q["items"][0]["category"] == "urgenza"
    STATE["urg_draft"] = d["id"]


# Draft actions: category/clinic patch, approve edited, discard, handled
def test_draft_actions(S):
    doc, par = S["doc"], S["par"]
    did = STATE["clin_draft"]
    assert doc.patch(f"{API}/ai-replies/{did}/category", json={"category": "amministrativo"}).status_code == 200
    assert doc.get(f"{API}/ai-replies/{did}").json()["category"] == "amministrativo"
    assert doc.patch(f"{API}/ai-replies/{did}/category", json={"category": "clinico"}).status_code == 200
    assert doc.patch(f"{API}/ai-replies/{did}/category", json={"category": "bad"}).status_code == 422
    assert doc.patch(f"{API}/ai-replies/{did}/clinic", json={"clinic": "Studio Provincia"}).status_code == 200
    assert doc.get(f"{API}/ai-replies/{did}").json()["clinic"] == "Studio Provincia"
    assert doc.patch(f"{API}/ai-replies/{did}/clinic", json={"clinic": "Nope"}).status_code == 404
    r = doc.post(f"{API}/ai-replies/{did}/approve", json={"text": "TEST_ Grazie, la contatteremo per fissare una visita."})
    assert r.status_code == 200 and r.json()["edited"] is True
    assert doc.post(f"{API}/ai-replies/{did}/approve", json={"text": "again"}).status_code == 400
    m = msgs(par, STATE["clin"])
    last = [x for x in m["messages"] if x["from"] == "doctor"][-1]
    assert last["ai_label"].startswith("Risposta preparata con l'assistenza di MantAI e verificata da Dott.ssa")
    assert m["thread"]["status"] == "risposto"
    r = doc.post(f"{API}/ai-replies/{STATE['admin_draft_id']}/discard")
    assert r.status_code == 200 and r.json()["thread_id"] == STATE["admin_draft"]
    assert DB.ai_reply_drafts.find_one({"_id": ObjectId(STATE["admin_draft_id"])}).get("discarded_at")
    assert doc.post(f"{API}/ai-replies/{STATE['urg_draft']}/handled").json()["status"] == "gestita"
    th = next(t for t in doc.get(f"{API}/messages/threads").json() if t["id"] == STATE["urg"])
    assert th["ai_urgent"] is False
    ids = {d["id"] for d in doc.get(f"{API}/ai-replies/queue").json()["items"]}
    assert not ids & {did, STATE["admin_draft_id"], STATE["urg_draft"]}


# Manual doctor reply supersedes pending draft
def test_manual_reply_supersedes(S):
    doc, par = S["doc"], S["par"]
    tid = STATE["clin"]
    assert par.post(f"{API}/portal/threads/{tid}/messages", json={"body": "ha anche un po' di tosse da stamattina"}).status_code == 200
    d = poll(lambda: draft_for(doc, tid))
    assert d, "no draft on follow-up"
    before = doc.get(f"{API}/ai-replies/queue").json()["count"]
    assert doc.post(f"{API}/messages/threads/{tid}/messages", json={"body": "TEST_ manual reply"}).status_code == 200
    after = doc.get(f"{API}/ai-replies/queue").json()["count"]
    assert after == before - 1
    assert DB.ai_reply_drafts.find_one({"_id": ObjectId(d["id"])})["status"] == "gestita"


# Acceptance 6: other doctor isolation
def test_a6_rbac(S):
    card, par = S["card"], S["par"]
    q = card.get(f"{API}/ai-replies/queue").json()
    assert q["count"] == 0 and q["items"] == []
    some = DB.ai_reply_drafts.find_one({"doctor_id": OWNER})
    assert card.get(f"{API}/ai-replies/{some['_id']}").status_code == 404
    assert card.post(f"{API}/ai-replies/{some['_id']}/approve", json={"text": "hack attempt"}).status_code == 404
    assert card.post(f"{API}/ai-replies/{some['_id']}/discard").status_code == 404
    assert par.get(f"{API}/ai-replies/queue").status_code in (401, 403)
    assert requests.get(f"{API}/ai-replies/queue").status_code == 401


# Acceptance 7: audit
def test_a7_audit(S):
    acts = {a["action"] for a in DB.audit.find({"owner_id": OWNER, "at": {"$gte": START}, "action": {"$regex": "^mantai_"}})}
    print("audit actions:", acts)
    need = {"mantai_classificazione", "mantai_bozza_generata", "mantai_invio_automatico", "mantai_messaggio_urgenza_inviato", "mantai_bozza_approvata_inviata",
            "mantai_bozza_modificata", "mantai_bozza_scartata", "mantai_bozza_gestita_senza_risposta", "mantai_categoria_corretta"}
    assert not need - acts, need - acts
    for a in DB.audit.find({"owner_id": OWNER, "at": {"$gte": START}, "action": {"$in": list(need)}}):
        assert a.get("message_id") and a.get("actor_id"), a


# Acceptance 5: disabled
def test_a5_disabled(S):
    doc, par = S["doc"], S["par"]
    set_all(doc, enabled=False, auto=False)
    tid = new_thread(par, "a che ora apre lo studio? mio figlio ha la febbre")
    time.sleep(25)
    m = msgs(par, tid)
    assert [x["from"] for x in m["messages"]] == ["parent"], m["messages"]
    assert m["thread"]["status"] == "inviato"
    assert not DB.ai_reply_drafts.find_one({"thread_id": tid})
    doc.get(f"{API}/messages/threads/{tid}")
    assert msgs(par, tid)["thread"]["status"] == "letto"
    doc.post(f"{API}/messages/threads/{tid}/messages", json={"body": "TEST_ risposta"})
    assert msgs(par, tid)["thread"]["status"] == "risposto"
