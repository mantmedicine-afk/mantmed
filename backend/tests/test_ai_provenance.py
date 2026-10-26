"""AI provenance (ai_provenance): note AI draft -> sign -> PDF marks, guard 403, 409 before signing, audit, portal, AI replies, migration."""
import os
import re
from pathlib import Path

import fitz
import pytest
import requests
from bson import ObjectId
from dotenv import dotenv_values
from pymongo import MongoClient

_env = dotenv_values(Path(__file__).resolve().parents[2] / "frontend" / ".env")
_benv = dotenv_values(Path(__file__).resolve().parents[1] / ".env")
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _env.get("REACT_APP_BACKEND_URL") or "").rstrip("/")
API = f"{BASE_URL}/api"
DB = MongoClient(_benv["MONGO_URL"])[_benv["DB_NAME"]]
AURORA = "6ad86e64c06e50ff4cd67d1e"
SEED_NOTE = "6ad86e64c06e50ff4cd67d23"
PHRASE = "Documento redatto con il supporto di strumenti di intelligenza artificiale (MantAI), verificato e firmato dal medico."
ST = {}


def login(email, pw):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": pw})
    assert r.status_code == 200, r.text
    return s


@pytest.fixture(scope="module")
def doc():
    return login("medico@mantmed.it", "Auscula-Studio-2026")


@pytest.fixture(scope="module")
def par():
    return login("genitore.demo@example.com", "Portale-Demo-2026")


@pytest.fixture(scope="module")
def note(doc):
    tr = ("Visita di controllo per Aurora, febbre da due giorni a 38.5, faringe iperemica, tampone streptococco negativo. "
          "Diagnosi faringite virale. Terapia paracetamolo 15 mg/kg al bisogno, idratazione. Controllo tra 5 giorni se persiste la febbre.")
    r = doc.post(f"{API}/consultations", json={"patient_name": "Aurora Ricci", "patient_id": AURORA, "clinic": "Studio Centro", "transcript": tr}, timeout=120)
    assert r.status_code == 200, r.text
    return r.json()


# --- creation ---
def test_create_ai_note(note):
    p = note["ai_provenance"]
    assert p["ai_generated"] is True and p["tipo"] in ("nota_clinica", "bilancio")
    assert p["modello"] == "OpenAI / gpt-5.6-terra" and p["stato_revisione"] == "bozza_non_verificata"
    assert p["reviewed_by"] is None and p["modificato_dal_medico"] is False
    assert note["ai_fields_pending"], note
    assert "ai_snapshot" not in note
    print("pending:", note["ai_fields_pending"])


# --- guard 403 ---
def test_guard_patch_and_approve(doc, note):
    r = doc.patch(f"{API}/consultations/{note['id']}", json={"ai_provenance": {"stato_revisione": "verificato_dal_medico"}})
    assert r.status_code == 403 and "ai_provenance" in r.json()["detail"]
    r = doc.patch(f"{API}/consultations/{note['id']}", json={"note": note["note"], "ai_snapshot": {}})
    assert r.status_code == 403
    r = doc.post(f"{API}/ai-replies/000000000000000000000000/approve", json={"text": "x", "ai_provenance": {}})
    assert r.status_code == 403 and "ai_provenance" in r.json()["detail"]
    # nested key too
    r = doc.patch(f"{API}/consultations/{note['id']}", json={"note": {**note["note"], "x": {"ai_provenance": 1}}})
    assert r.status_code == 403
    assert DB.consultations.find_one({"_id": ObjectId(note["id"])})["ai_provenance"]["stato_revisione"] == "bozza_non_verificata"


# --- 409 before signing ---
def test_publish_and_send_blocked(doc, note):
    r = doc.post(f"{API}/consultations/{note['id']}/portal", json={"published": True})
    assert r.status_code == 409 and "non ancora firmata" in r.json()["detail"], r.text
    r = doc.post(f"{API}/consultations/{note['id']}/send-report")
    assert r.status_code == 409 and "non ancora firmata" in r.json()["detail"], r.text


# --- PDF of draft ---
def test_pdf_draft(doc, note):
    r = doc.get(f"{API}/consultations/{note['id']}/pdf")
    assert r.status_code == 200
    d = fitz.open(stream=r.content, filetype="pdf")
    txt = "".join(p.get_text() for p in d)
    ST["draft_has_phrase"] = PHRASE in txt.replace("\n", " ")
    print("draft keywords:", d.metadata.get("keywords"), "| BOZZA footer:", "BOZZA" in txt)
    assert "stato_revisione=bozza_non_verificata" in d.metadata.get("keywords", "")


# --- PATCH removes field indicator ---
def test_patch_removes_pending(doc, note):
    pend = note["ai_fields_pending"]
    assert "diagnosi" in pend
    n = {**note["note"], "diagnosi": note["note"]["diagnosi"] + " (rivista dal medico)"}
    r = doc.patch(f"{API}/consultations/{note['id']}", json={"note": n})
    assert r.status_code == 200, r.text
    after = r.json()["ai_fields_pending"]
    assert "diagnosi" not in after
    assert set(pend) - {"diagnosi"} == set(after), (pend, after)
    g = doc.get(f"{API}/consultations/{note['id']}").json()
    assert "diagnosi" not in g["ai_fields_pending"] and g["ai_provenance"]["stato_revisione"] == "bozza_non_verificata"


# --- parent cannot sign ---
def test_parent_cannot_sign(par, note):
    r = par.post(f"{API}/consultations/{note['id']}/sign")
    assert r.status_code in (401, 403, 404), r.status_code


# --- sign ---
def test_sign(doc, note):
    me = doc.get(f"{API}/auth/me").json()
    ST["uid"] = me.get("id") or me.get("user", {}).get("id")
    r = doc.post(f"{API}/consultations/{note['id']}/sign")
    assert r.status_code == 200, r.text
    d = r.json()
    p = d["ai_provenance"]
    assert p["stato_revisione"] == "verificato_dal_medico" and p["reviewed_by"] == ST["uid"] and p["reviewed_at"]
    assert p["modificato_dal_medico"] is True
    assert p.get("reviewer_name") == "Dott.ssa Tiziana Foti", p
    assert d["ai_fields_pending"] == []
    raw = DB.consultations.find_one({"_id": ObjectId(note["id"])})
    assert raw["ai_provenance"]["ai_generated"] is True and raw["ai_provenance"]["stato_revisione"] == "verificato_dal_medico"
    assert raw.get("ai_snapshot")
    # idempotent second sign keeps reviewed_at
    r2 = doc.post(f"{API}/consultations/{note['id']}/sign")
    assert r2.status_code == 200 and r2.json()["ai_provenance"]["reviewed_at"] == p["reviewed_at"]


def test_publish_after_sign(doc, note):
    r = doc.post(f"{API}/consultations/{note['id']}/portal", json={"published": True})
    assert r.status_code == 200 and r.json()["portal_published"] is True, r.text


# --- PDF signed ---
def test_pdf_signed(doc, note):
    r = doc.get(f"{API}/consultations/{note['id']}/pdf")
    assert r.status_code == 200
    d = fitz.open(stream=r.content, filetype="pdf")
    txt = re.sub(r"\s+", " ", "".join(p.get_text() for p in d))
    assert PHRASE in txt
    kw = d.metadata.get("keywords", "")
    assert "ai_assisted=true" in kw and "tipo=" in kw and f"reviewed_by={ST['uid']}" in kw, kw
    xmp = d.get_xml_metadata()
    assert "mantai" in xmp and 'mantai:ai_assisted="true"' in xmp, xmp


def test_pdf_undetermined(doc):
    c = DB.consultations.find_one({"ai_provenance.stato_revisione": "provenienza_non_determinabile", "owner_id": {"$exists": True}, "status": {"$ne": "processing"}})
    r = doc.get(f"{API}/consultations/{c['_id']}/pdf")
    assert r.status_code == 200, r.text
    d = fitz.open(stream=r.content, filetype="pdf")
    txt = re.sub(r"\s+", " ", "".join(p.get_text() for p in d))
    assert "MantAI" not in txt
    assert "ai_assisted=undetermined" in d.metadata.get("keywords", "")


# --- audit ---
def test_audit(doc, note):
    r = doc.get(f"{API}/compliance/status")
    assert r.status_code == 200
    acts = [a.get("action") for a in r.json().get("audit", [])]
    for a in ("ai_provenance_bozza_non_verificata", "ai_provenance_verificato_dal_medico", "nota_firmata"):
        assert a in acts, (a, acts[:30])


# --- parent portal ---
def test_portal_me(par, note):
    r = par.get(f"{API}/portal/me")
    assert r.status_code == 200
    ch = next(c for c in r.json()["children"] if (c.get("patient") or {}).get("id") == AURORA)
    reps = {x["id"]: x for x in ch.get("reports", [])}
    assert note["id"] in reps, list(reps)
    p = reps[note["id"]]["ai_provenance"]
    assert p["stato_revisione"] == "verificato_dal_medico" and p["reviewer_name"] == "Dott.ssa Tiziana Foti"
    if SEED_NOTE in reps:
        sp = reps[SEED_NOTE].get("ai_provenance") or {}
        assert sp.get("ai_generated") is not True
        assert "parti" not in sp or "riassunto_famiglia" not in (sp.get("parti") or {})


def test_portal_simple(par, note):
    r = par.get(f"{API}/portal/children/{AURORA}/simple", timeout=90)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["available"] and d["consultation_id"] == note["id"]
    assert d["ai_provenance"]["tipo"] == "riassunto_famiglia" and d["ai_provenance"]["stato_revisione"] == "invio_automatico"
    assert d["report_provenance"]["stato_revisione"] == "verificato_dal_medico"
    assert "ai_snapshot" not in d


# --- AI replies ---
def test_ai_replies_queue_and_approve(doc, par):
    q = doc.get(f"{API}/ai-replies/queue").json()["items"]
    assert q, "no drafts in queue"
    for i in q:
        assert i["ai_provenance"]["stato_revisione"] == "bozza_non_verificata"
    d = q[0]
    full = doc.get(f"{API}/ai-replies/{d['id']}").json()
    r = doc.post(f"{API}/ai-replies/{d['id']}/approve", json={"text": full.get("text") or "TEST_ risposta verificata"})
    assert r.status_code == 200, r.text
    t = par.get(f"{API}/portal/threads/{d['thread_id']}").json()
    last = [m for m in t["messages"] if m["from"] == "doctor"][-1]
    p = last["ai_provenance"]
    assert p["stato_revisione"] == "verificato_dal_medico" and p["reviewer_name"] == "Dott.ssa Tiziana Foti", p
    acts = [a.get("action") for a in doc.get(f"{API}/compliance/status").json().get("audit", [])]
    assert "ai_provenance_verificato_dal_medico" in acts
    ST["approved_msg"] = last["id"]
    print("approved message", last["id"], "thread", d["thread_id"])


# --- migration ---
def test_migration():
    m = DB.meta.find_one({"_id": "ai_provenance_migration"})
    assert m and m["consultazioni_ai"] == 22 and m["consultazioni_non_determinabili"] == 15 and m["messaggi_ai"] == 9
    assert m["bozze_ai"] == 19 and m["spiegazioni_semplici"] == 2
    assert DB.consultations.count_documents({"ai_provenance": {"$exists": False}}) == 0
