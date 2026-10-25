"""MantAI Risposte (2-category spec): clinico/amministrativo classification, fixed ack, urgency notice, drafts queue, auto admin, RBAC, audit, disabled state.
Reuses existing parent threads (daily thread limit). Run: cd /app/backend && python -m pytest tests/test_ai_replies.py -v -s -n 0
"""
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
PHONE = "0965 123456"
DRUG_RE = re.compile(r"\b(\d+\s?mg|\d+\s?ml|mg/kg|paracetamolo|tachipirina|ibuprofene|nurofen|gocce|supposte|sciroppo)\b", re.I)
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


def parent_threads(kind=None):
    q = {"owner_id": OWNER, "patient_id": PID}
    if kind:
        q["kind"] = kind
    return [str(t["_id"]) for t in DB.threads.find(q).sort("created_at", -1)]


@pytest.fixture(scope="module")
def S():
    doc, par, card = login("medico@mantmed.it", "Auscula-Studio-2026"), login("genitore.demo@example.com", "Portale-Demo-2026"), login("cardiologo.demo@example.com", "Cardio-Demo-2026")
    kb_backup = doc.get(f"{API}/ai-replies/knowledge-base").json()["clinics"]
    st_backup = doc.get(f"{API}/ai-replies/settings").json()["clinics"]
    STATE["kb_backup"] = kb_backup
    yield {"doc": doc, "par": par, "card": card}
    for k in kb_backup:  # restore KB but phone must end empty (fake number)
        doc.put(f"{API}/ai-replies/knowledge-base", json={**k, "phone": ""})
    for s in st_backup:  # final state must be OFF
        doc.put(f"{API}/ai-replies/settings", json={**s, "enabled": False, "auto_admin": False})


def set_all(doc, enabled=True, auto=True, notice=None):
    for c in CLINICS:
        body = {"clinic": c, "enabled": enabled, "auto_admin": auto}
        if notice:
            body["notice_text"] = notice
        r = doc.put(f"{API}/ai-replies/settings", json=body)
        assert r.status_code == 200 and r.json()["enabled"] is enabled, r.text


def set_kb(doc, clinic, **kw):
    body = {"clinic": clinic, "hours": "", "address": "", "phone": "", "booking": "", "fees": "", "cancellation": "", "faqs": [], "signature": "", "tone": "formale", "address_form": "lei", **kw}
    r = doc.put(f"{API}/ai-replies/knowledge-base", json=body)
    assert r.status_code == 200, r.text
    return r.json()


def send(par, tid, body):
    r = par.post(f"{API}/portal/threads/{tid}/messages", json={"body": body})
    assert r.status_code == 200, r.text
    mid = [m for m in r.json()["messages"] if m["from"] == "parent"][-1]["id"]
    return mid


def msgs(par, tid):
    return par.get(f"{API}/portal/threads/{tid}").json()


def after(par, tid, mid):
    m = msgs(par, tid)["messages"]
    i = next(i for i, x in enumerate(m) if x["id"] == mid)
    return m[i + 1:]


def draft_by_msg(doc, mid):
    return next((d for d in doc.get(f"{API}/ai-replies/queue").json()["items"] if d["message_id"] == mid), None)


def raw_draft(mid):
    return DB.ai_reply_drafts.find_one({"message_id": mid})


# Settings / KB / notice
def test_settings_kb_notice(S):
    doc, par = S["doc"], S["par"]
    set_all(doc, notice="TEST_ Avviso personalizzato: telefona al [telefono studio] per urgenze.")
    r = par.get(f"{API}/portal/ai-notice", params={"owner_id": OWNER})
    assert r.status_code == 200, r.text
    set_kb(doc, "Studio Centro", hours="Lunedì-Venerdì 9:00-13:00 e 16:00-19:00", address="Via Roma 12, Reggio Calabria", phone=PHONE)
    set_kb(doc, "Studio Provincia", hours="Martedì e Giovedì 15:00-18:30", address="Via Pozzicello 59, Gallico (RC)", phone=PHONE)
    r = par.get(f"{API}/portal/ai-notice", params={"owner_id": OWNER}).json()
    print("custom notice:", r)
    assert PHONE in r["text"] and "TEST_ Avviso" in r["text"] and "[telefono studio]" not in r["text"]
    st = doc.get(f"{API}/ai-replies/settings").json()
    default = st["default_notice"]
    assert "[telefono studio]" in default
    set_all(doc, notice=default)
    r = par.get(f"{API}/portal/ai-notice", params={"owner_id": OWNER}).json()
    print("default notice:", r)
    assert PHONE in r["text"] and "112/118" in r["text"]
    # unrelated owner -> 404
    card_id = str(DB.users.find_one({"email": "cardiologo.demo@example.com"})["_id"])
    assert par.get(f"{API}/portal/ai-notice", params={"owner_id": card_id}).status_code == 404
    assert doc.get(f"{API}/portal/ai-notice", params={"owner_id": OWNER}).status_code in (401, 403)
    assert doc.put(f"{API}/ai-replies/settings", json={"clinic": "Studio Centro", "enabled": True, "notice_text": "x"}).status_code == 422
    # notice works with MantAI disabled
    set_all(doc, enabled=False, auto=False, notice=default)
    r = par.get(f"{API}/portal/ai-notice", params={"owner_id": OWNER})
    assert r.status_code == 200 and PHONE in r.json()["text"]
    # phone fallback: KB phone empty -> profile phone or no number
    set_kb(doc, "Studio Centro", hours="Lunedì-Venerdì 9:00-13:00 e 16:00-19:00", address="Via Roma 12, Reggio Calabria", phone="")
    t = par.get(f"{API}/portal/ai-notice", params={"owner_id": OWNER}).json()["text"]
    print("notice w/o kb phone:", t)
    assert "[telefono studio]" not in t and "  " not in t
    set_kb(doc, "Studio Centro", hours="Lunedì-Venerdì 9:00-13:00 e 16:00-19:00", address="Via Roma 12, Reggio Calabria", phone=PHONE)
    set_all(doc)
    raw = DB.ai_knowledge_base.find_one({"owner_id": OWNER, "clinic": "Studio Centro"})
    assert PHONE not in str(raw.get("phone")), "KB phone not encrypted"


# Acceptance 1: clinical -> ack (phone + 112/118) + draft, no drugs, no doctor message
def test_a1_clinical(S):
    doc, par = S["doc"], S["par"]
    tid = parent_threads("clinico")[0]
    cats = []
    for _ in range(2):
        mid = send(par, tid, "mio figlio ha 38,5 di febbre da ieri, cosa gli do?")
        rd = poll(lambda: raw_draft(mid) or (any(x["from"] == "system" for x in after(par, tid, mid)) and {"none": 1}))
        d = raw_draft(mid)
        cats.append(d and d["category"])
        if d and d["category"] == "clinico":
            break
    print("A1 categories:", cats)
    assert d and d["category"] == "clinico"
    STATE["clin"], STATE["clin_mid"], STATE["clin_draft"] = tid, mid, str(d["_id"])
    new = poll(lambda: [x for x in after(par, tid, mid) if x["from"] == "system"] and after(par, tid, mid), timeout=30, every=2)
    print("A1 after:", [(x["from"], x.get("ai_label"), x["body"][:160]) for x in new])
    assert not any(x["from"] == "doctor" for x in new)
    sysm = [x for x in new if x["from"] == "system"]
    assert len(sysm) == 1 and sysm[0]["ai_label"] == "Messaggio automatico di MantAI"
    assert "Il medico ti risponderà appena possibile" in sysm[0]["body"] and PHONE in sysm[0]["body"] and "112/118" in sysm[0]["body"]
    full = doc.get(f"{API}/ai-replies/{STATE['clin_draft']}").json()
    print("A1 draft:", full["text"])
    assert not DRUG_RE.search(full["text"]), full["text"]
    assert "urgent" not in doc.get(f"{API}/ai-replies/queue").json()
    th = next(t for t in doc.get(f"{API}/messages/threads").json() if t["id"] == tid)
    assert th["ai_urgent"] is False and th["ai_category"] == "clinico"


# Acceptance 2: admin auto reply with KB hours
def test_a2_admin_auto(S):
    par = S["par"]
    tid = parent_threads("info")[1]
    STATE["admin"] = tid
    mid = send(par, tid, "a che ora apre lo studio di via Pozzicello?")
    out = poll(lambda: [x for x in after(par, tid, mid) if x["from"] == "doctor"] or (raw_draft(mid) and raw_draft(mid)["status"] == "in_attesa" and [{"draft": 1}]))
    print("A2 out:", out, "draft:", raw_draft(mid) and raw_draft(mid)["status"])
    docm = [x for x in after(par, tid, mid) if x["from"] == "doctor"]
    assert docm, "no automatic reply"
    print("A2 auto:", docm[0]["body"])
    assert docm[0]["ai_label"] == "Risposta automatica di MantAI"
    assert re.search(r"15[:.]00", docm[0]["body"]) and re.search(r"18[:.]30", docm[0]["body"])
    assert msgs(par, tid)["thread"]["status"] == "risposto"


# Acceptance 3: hours/address empty in both clinics -> admin draft, no invented hours
def test_a3_admin_missing_kb(S):
    doc, par = S["doc"], S["par"]
    set_kb(doc, "Studio Centro", phone=PHONE, booking="Prenotazioni dal portale.")
    set_kb(doc, "Studio Provincia", phone=PHONE, booking="Prenotazioni dal portale.")
    tid = STATE["admin"]
    mid = send(par, tid, "a che ora apre lo studio di via Pozzicello?")
    d = poll(lambda: raw_draft(mid))
    new = after(par, tid, mid)
    print("A3 after:", [(x["from"], x["body"][:120]) for x in new])
    assert not any(x["from"] == "doctor" for x in new)
    assert d and d["category"] == "amministrativo" and d["status"] == "in_attesa", d
    txt = doc.get(f"{API}/ai-replies/{d['_id']}").json()["text"]
    print("A3 draft:", txt)
    assert not re.search(r"\b\d{1,2}[:.]\d{2}\b", txt), "invented hours"
    STATE["admin_draft_id"] = str(d["_id"])
    k = STATE["kb_backup"]
    for c in CLINICS:  # restore hours for later UI/test use
        b = next((x for x in k if x["clinic"] == c), {"clinic": c})
        set_kb(doc, c, **{f: b.get(f, "") for f in ("hours", "address", "booking", "fees", "cancellation", "signature")}, phone=PHONE)


# Acceptance 4: convulsion -> clinico, urgent_hint, ack, no doctor msg
def test_a4_convulsion(S):
    doc, par = S["doc"], S["par"]
    tid = parent_threads("altro")[0]
    STATE["urg"] = tid
    mid = send(par, tid, "ha avuto una convulsione")
    d = poll(lambda: raw_draft(mid))
    assert d, "no draft"
    assert d["category"] == "clinico" and d["urgent_hint"] is True
    new = poll(lambda: [x for x in after(par, tid, mid) if x["from"] == "system"] and after(par, tid, mid), timeout=30, every=2)
    print("A4 after:", [(x["from"], x["body"]) for x in new])
    assert not any(x["from"] == "doctor" for x in new)
    sysm = [x for x in new if x["from"] == "system"]
    assert len(sysm) == 1 and PHONE in sysm[0]["body"] and "112/118" in sysm[0]["body"]
    full = doc.get(f"{API}/ai-replies/{d['_id']}").json()
    print("A4 draft:", full["text"])
    assert full["urgent_hint"] is True and full["category"] == "clinico"
    assert re.search(r"112|118|telefon|chiam", full["text"], re.I)
    q = doc.get(f"{API}/ai-replies/queue").json()
    assert "urgent" not in q and all(i["category"] in ("clinico", "amministrativo") for i in q["items"])
    cats = [i["category"] for i in q["items"]]
    assert cats == sorted(cats, key=lambda c: 0 if c == "clinico" else 1), cats
    for c in ("clinico", "amministrativo"):
        ts = [i["created_at"] for i in q["items"] if i["category"] == c]
        assert ts == sorted(ts)
    th = next(t for t in doc.get(f"{API}/messages/threads").json() if t["id"] == tid)
    assert th["ai_urgent"] is False and th["ai_category"] == "clinico"
    STATE["urg_draft"] = str(d["_id"])
    assert DB.ai_reply_drafts.count_documents({"category": "urgenza"}) == 0
    assert DB.threads.count_documents({"$or": [{"ai_urgent": True}, {"ai_category": "urgenza"}]}) == 0


# Draft actions; PATCH category rejects urgenza
def test_draft_actions(S):
    doc, par = S["doc"], S["par"]
    did = STATE["clin_draft"]
    assert doc.patch(f"{API}/ai-replies/{did}/category", json={"category": "urgenza"}).status_code == 422
    assert doc.patch(f"{API}/ai-replies/{did}/category", json={"category": "amministrativo"}).status_code == 200
    assert doc.get(f"{API}/ai-replies/{did}").json()["category"] == "amministrativo"
    assert doc.patch(f"{API}/ai-replies/{did}/category", json={"category": "clinico"}).status_code == 200
    r = doc.post(f"{API}/ai-replies/{did}/approve", json={"text": "TEST_ Grazie, la contatteremo per fissare una visita."})
    assert r.status_code == 200 and r.json()["edited"] is True
    assert doc.post(f"{API}/ai-replies/{did}/approve", json={"text": "again"}).status_code == 400
    m = msgs(par, STATE["clin"])
    last = [x for x in m["messages"] if x["from"] == "doctor"][-1]
    assert last["ai_label"].startswith("Risposta preparata con l'assistenza di MantAI e verificata da")
    assert m["thread"]["status"] == "risposto"
    r = doc.post(f"{API}/ai-replies/{STATE['admin_draft_id']}/discard")
    assert r.status_code == 200 and DB.ai_reply_drafts.find_one({"_id": ObjectId(STATE["admin_draft_id"])}).get("discarded_at")
    assert doc.post(f"{API}/ai-replies/{STATE['urg_draft']}/handled").json()["status"] == "gestita"
    ids = {d["id"] for d in doc.get(f"{API}/ai-replies/queue").json()["items"]}
    assert not ids & {did, STATE["admin_draft_id"], STATE["urg_draft"]}


# Acceptance 7: other doctor isolation
def test_a7_rbac(S):
    card, par = S["card"], S["par"]
    q = card.get(f"{API}/ai-replies/queue").json()
    assert q["count"] == 0 and q["items"] == []
    some = DB.ai_reply_drafts.find_one({"doctor_id": OWNER})
    assert card.get(f"{API}/ai-replies/{some['_id']}").status_code == 404
    assert card.post(f"{API}/ai-replies/{some['_id']}/approve", json={"text": "hack attempt"}).status_code == 404
    assert par.get(f"{API}/ai-replies/queue").status_code in (401, 403)
    assert requests.get(f"{API}/ai-replies/queue").status_code == 401


# Acceptance 8: audit
def test_a8_audit(S):
    acts = {a["action"] for a in DB.audit.find({"owner_id": OWNER, "at": {"$gte": START}, "action": {"$regex": "^mantai_"}})}
    print("audit actions:", acts)
    need = {"mantai_classificazione", "mantai_bozza_generata", "mantai_conferma_ricezione_inviata", "mantai_invio_automatico", "mantai_bozza_approvata_inviata",
            "mantai_bozza_modificata", "mantai_bozza_scartata", "mantai_bozza_gestita_senza_risposta", "mantai_categoria_corretta"}
    assert not need - acts, need - acts
    assert "mantai_messaggio_urgenza_inviato" not in acts
    for a in DB.audit.find({"owner_id": OWNER, "at": {"$gte": START}, "action": {"$in": list(need)}}):
        assert a.get("message_id") and a.get("actor_id"), a


# Acceptance 6: disabled -> no ack, no drafts, status inviato->letto->risposto
def test_a6_disabled(S):
    doc, par = S["doc"], S["par"]
    set_all(doc, enabled=False, auto=False)
    tid = parent_threads("info")[0]
    doc.post(f"{API}/messages/threads/{tid}/messages", json={"body": "TEST_ reset"})
    mid = send(par, tid, "a che ora apre lo studio? mio figlio ha la febbre")
    time.sleep(25)
    new = after(par, tid, mid)
    assert new == [], new
    assert msgs(par, tid)["thread"]["status"] == "inviato"
    assert not raw_draft(mid)
    doc.get(f"{API}/messages/threads/{tid}")
    assert msgs(par, tid)["thread"]["status"] == "letto"
    doc.post(f"{API}/messages/threads/{tid}/messages", json={"body": "TEST_ risposta"})
    assert msgs(par, tid)["thread"]["status"] == "risposto"
