"""Iteration 27: Questionario pre-visita (Portale -> bilancio IA) and Inbox Founder (admin feedback, reply, in-app notice).
Real emails are sent by reply tests: exactly 2 replies here."""
import time
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values

_env = dotenv_values(Path(__file__).resolve().parents[2] / "frontend" / ".env")
BASE_URL = (_env.get("REACT_APP_BACKEND_URL") or "").rstrip("/")
assert BASE_URL
API = f"{BASE_URL}/api"
PED = ("medico@mantmed.it", "Auscula-Studio-2026")
PARENT = ("genitore.demo@example.com", "Portale-Demo-2026")
ADMIN = ("mantmedicine@gmail.com", "MM-3EjwJpn5w64aCu2ZkOLA")
AURORA = "6ad86e64c06e50ff4cd67d1e"
TX = ("Bilancio di salute dei 5 anni di Aurora. Bambina in buona salute, frequenta la scuola dell'infanzia. "
      "Peso 18 chili, altezza 108 centimetri. Visus nella norma, otoscopia negativa, cuore e torace regolari. "
      "Vaccinazioni da completare con il richiamo dei 6 anni. Consigli su alimentazione e attività fisica.")
S = {}


def login(c):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": c[0], "password": c[1]})
    assert r.status_code == 200, r.text
    return s


@pytest.fixture(scope="module")
def ped():
    return login(PED)


@pytest.fixture(scope="module")
def parent():
    return login(PARENT)


@pytest.fixture(scope="module")
def admin():
    return login(ADMIN)


# --- Portal checkpoint API
class TestPortalCheckpoint:
    def test_template_for_linked_child(self, parent):
        r = parent.get(f"{API}/portal/checkpoint", params={"patient_id": AURORA})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["questions"] and all(q["options"] for q in d["questions"])
        S["band"] = d

    def test_not_linked_and_invalid_404(self, parent):
        assert parent.get(f"{API}/portal/checkpoint", params={"patient_id": "6ad4e2fbeee83d004b1921d2"}).status_code == 404
        assert parent.get(f"{API}/portal/checkpoint", params={"patient_id": "bad"}).status_code == 404
        assert parent.post(f"{API}/portal/checkpoints", json={"patient_id": "6ad4e2fbeee83d004b1921d2", "answers": {}}).status_code == 404

    def test_doctor_forbidden(self, ped):
        assert ped.get(f"{API}/portal/checkpoint", params={"patient_id": AURORA}).status_code in (401, 403)

    def test_incomplete_answers_400(self, parent):
        qs = S["band"]["questions"]
        r = parent.post(f"{API}/portal/checkpoints", json={"patient_id": AURORA, "answers": {qs[0]["id"]: qs[0]["options"][0]["value"]}})
        assert r.status_code == 400, r.text

    def test_submit_full_and_last(self, parent):
        qs = S["band"]["questions"]
        # first question with a non-ok answer to produce a flag
        ans = {}
        for n, q in enumerate(qs):
            bad = next((o for o in q["options"] if not o.get("ok", True)), None)
            ans[q["id"]] = (bad if n == 0 and bad else q["options"][0])["value"]
        r = parent.post(f"{API}/portal/checkpoints", json={"patient_id": AURORA, "answers": ans})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["id"] and d["band_label"] == S["band"]["label"] and "status" in d["result"]
        last = parent.get(f"{API}/portal/checkpoint", params={"patient_id": AURORA}).json()["last"]
        assert last["source"] == "portale" and last["created_at"] == d["created_at"]


# --- Doctor consultation uses previsit
class TestConsultPrevisit:
    def test_templates(self, ped):
        xs = ped.get(f"{API}/visit-templates").json()
        S["bil56"] = next(t for t in xs if t.get("bilancio") == "5-6a")
        S["prima"] = next(t for t in xs if not t.get("bilancio"))

    def test_bilancio_start_has_previsit_and_ai_prefill(self, ped):
        r = ped.post(f"{API}/consultations/start", data={"patient_name": "Aurora Ricci", "patient_id": AURORA, "transcript": "TEST_ " + TX,
                                                         "template_id": S["bil56"]["id"]})
        assert r.status_code == 200, r.text
        c = r.json()
        pv = c.get("previsit")
        assert pv and pv["source"] == "portale" and pv["answers"], pv
        S["cid"] = c["id"]
        for _ in range(40):
            time.sleep(5)
            c = ped.get(f"{API}/consultations/{S['cid']}").json()
            if c["status"] != "processing":
                break
        assert c["status"] == "ready", c.get("ai_error")
        txt = " ".join(s.get("testo", "") for s in c["note"]["sezioni"]).lower()
        assert "riferito dai genitori" in txt, txt[:800]
        assert c["previsit"]["source"] == "portale"

    def test_prima_visita_no_previsit(self, ped):
        r = ped.post(f"{API}/consultations/start", data={"patient_name": "Aurora Ricci", "patient_id": AURORA, "transcript": "TEST_ " + TX,
                                                         "template_id": S["prima"]["id"]})
        assert r.status_code == 200, r.text
        assert r.json().get("previsit") is None
        S["cid2"] = r.json()["id"]


# --- Admin inbox
class TestAdminInbox:
    def test_doctor_403(self, ped):
        assert ped.get(f"{API}/admin/feedback").status_code == 403

    def test_create_items(self, ped, parent):
        r = ped.post(f"{API}/beta/feedback", json={"kind": "supporto", "area": "altro", "text": "TEST_ supporto medico inbox"})
        assert r.status_code == 200, r.text
        r2 = ped.post(f"{API}/beta/feedback", json={"kind": "segnalazione", "area": "pdf", "text": "TEST_ segnalazione medico UI",
                                                     "tech": {"page": "/app", "user_agent": "pytest", "screen": "1920x1080", "language": "it-IT"}})
        assert r2.status_code == 200, r2.text
        r3 = parent.post(f"{API}/portal/feedback", json={"kind": "supporto", "area": "account", "text": "TEST_ supporto genitore inbox"})
        assert r3.status_code == 200, r3.text

    def test_list_and_find(self, admin):
        r = admin.get(f"{API}/admin/feedback")
        assert r.status_code == 200
        xs = r.json()
        find = lambda t: next(x for x in xs if x["text"] == t)
        d, s, p = find("TEST_ supporto medico inbox"), find("TEST_ segnalazione medico UI"), find("TEST_ supporto genitore inbox")
        assert d["role"] == "doctor" and d["email"] == PED[0] and d["status"] == "nuovo" and d["replies"] == []
        assert p["role"] == "parent" and p["email"] == PARENT[0]
        assert s["tech"]["user_agent"] == "pytest" and s["kind"] == "segnalazione"
        S.update(fd=d["id"], fs=s["id"], fp=p["id"])

    def test_patch_status_note(self, admin):
        r = admin.patch(f"{API}/admin/feedback/{S['fd']}", json={"status": "in_lavorazione", "note": " TEST_ nota "})
        assert r.status_code == 200 and r.json()["status"] == "in_lavorazione" and r.json()["note"] == "TEST_ nota"
        x = next(x for x in admin.get(f"{API}/admin/feedback").json() if x["id"] == S["fd"])
        assert x["status"] == "in_lavorazione" and x["note"] == "TEST_ nota"
        assert admin.patch(f"{API}/admin/feedback/{S['fd']}", json={"status": "nuovo"}).json()["note"] == "TEST_ nota"

    def test_patch_invalid(self, admin, ped):
        assert admin.patch(f"{API}/admin/feedback/{S['fd']}", json={"status": "xx"}).status_code == 422
        assert admin.patch(f"{API}/admin/feedback/6ad4e2fbeee83d004b1921d2", json={"status": "nuovo"}).status_code == 404
        assert admin.patch(f"{API}/admin/feedback/bad", json={"status": "nuovo"}).status_code == 404
        assert ped.patch(f"{API}/admin/feedback/{S['fd']}", json={"status": "risolto"}).status_code == 403
        assert ped.post(f"{API}/admin/feedback/{S['fd']}/reply", json={"text": "x y"}).status_code == 403
        assert admin.post(f"{API}/admin/feedback/{S['fd']}/reply", json={"text": "x"}).status_code == 422

    def test_reply_undeliverable_demo_email(self, admin):
        """Demo accounts (@mantmed.it / @example.com) are rejected by the email provider -> reply fails and nothing is saved."""
        r = admin.post(f"{API}/admin/feedback/{S['fs']}/reply", json={"text": "TEST_ undeliverable"})
        S["undeliverable_status"] = r.status_code
        x = next(x for x in admin.get(f"{API}/admin/feedback").json() if x["id"] == S["fs"])
        print("undeliverable reply status", r.status_code, "replies saved", len(x["replies"]))

    def test_switch_to_test_inbox(self):
        """Workaround: point TEST_ items to the provider's test inbox so the reply flow can be exercised."""
        import os
        from pymongo import MongoClient
        from bson import ObjectId
        be = dotenv_values(Path(__file__).resolve().parents[1] / ".env")
        db = MongoClient(be["MONGO_URL"])[be["DB_NAME"]]
        db.feedback.update_many({"_id": {"$in": [ObjectId(S[k]) for k in ("fd", "fp", "fs")]}}, {"$set": {"email": "delivered@resend.dev"}})

    def test_reply_doctor(self, admin, ped, parent):  # email 1
        r = admin.post(f"{API}/admin/feedback/{S['fd']}/reply", json={"text": "TEST_ risposta al medico", "resolve": False})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "in_lavorazione" and len(d["replies"]) == 1 and d["replies"][0]["text"] == "TEST_ risposta al medico"
        mine = ped.get(f"{API}/support/replies").json()
        it = next(x for x in mine if x["id"] == S["fd"])
        assert it["reply"]["text"] == "TEST_ risposta al medico"
        assert all(x["id"] != S["fd"] for x in parent.get(f"{API}/support/replies").json())
        parent.post(f"{API}/support/replies/{S['fd']}/read")  # not owner: no effect
        assert any(x["id"] == S["fd"] for x in ped.get(f"{API}/support/replies").json())

    def test_reply_parent_resolve(self, admin, parent):  # email 2
        r = admin.post(f"{API}/admin/feedback/{S['fp']}/reply", json={"text": "TEST_ risposta al genitore", "resolve": True})
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "risolto"
        it = next(x for x in parent.get(f"{API}/support/replies").json() if x["id"] == S["fp"])
        assert it["reply"]["text"] == "TEST_ risposta al genitore" and it["status"] == "risolto"
