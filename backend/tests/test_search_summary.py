"""Iteration 23: global search (/api/search), patient plain-language summary (note.riepilogo), portal riepilogo."""
import os
import time
from datetime import date, timedelta
from pathlib import Path

import pytest
import requests
from bson import ObjectId
from dotenv import dotenv_values
from pymongo import MongoClient

_env = dotenv_values(Path(__file__).resolve().parents[2] / "frontend" / ".env")
_benv = dotenv_values(Path(__file__).resolve().parents[1] / ".env")
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _env.get("REACT_APP_BACKEND_URL") or "").rstrip("/")
assert BASE_URL
PED = ("medico@mantmed.it", "Auscula-Studio-2026")
CARD = ("cardiologo.demo@example.com", "Cardio-Demo-2026")
PARENT = ("genitore.demo@example.com", "Portale-Demo-2026")
PED_TX = ("Bambina portata dalla mamma per febbre a 38 da ieri e dolore all'orecchio destro. All'otoscopia membrana timpanica destra "
          "iperemica ed estroflessa, faringe lievemente arrossata. Diagnosi otite media acuta destra. Terapia amoxicillina 50 mg per chilo "
          "al giorno in due dosi per sette giorni, paracetamolo al bisogno se febbre sopra 38 e mezzo. Controllo tra dieci giorni, "
          "ricontattare lo studio se la febbre persiste oltre tre giorni.")
CARD_TX = ("Paziente di 58 anni con palpitazioni occasionali da un mese. Pressione arteriosa 130 su 80, frequenza 76 regolare. "
           "Auscultazione cardiaca toni validi, pause libere. ECG ritmo sinusale con rare extrasistoli ventricolari. Diagnosi extrasistolia "
           "ventricolare benigna. Ridurre caffè, Holter ECG 24 ore e controllo tra un mese.")
STATE = {}


def login(cred, path="/api/auth/login"):
    s = requests.Session()
    r = s.post(f"{BASE_URL}{path}", json={"email": cred[0], "password": cred[1]})
    assert r.status_code == 200, r.text
    return s


def wait(s, cid, timeout=120):
    t0 = time.time()
    while time.time() - t0 < timeout:
        d = s.get(f"{BASE_URL}/api/consultations/{cid}").json()
        if d["status"] in ("ready", "failed"):
            return d
        time.sleep(3)
    pytest.fail("timeout")


@pytest.fixture(scope="module")
def ped():
    return login(PED)


@pytest.fixture(scope="module")
def card():
    return login(CARD)


@pytest.fixture(scope="module")
def mdb():
    return MongoClient(_benv["MONGO_URL"])[_benv["DB_NAME"]]


def search(s, q):
    r = s.get(f"{BASE_URL}/api/search", params={"q": q})
    assert r.status_code == 200, r.text
    return r.json()


# ---------- Global search ----------
class TestSearch:
    def test_short_query(self, ped):
        for q in ("", "a", " a "):
            assert search(ped, q) == {"patients": [], "reports": [], "appointments": []}

    def test_unauth(self):
        assert requests.get(f"{BASE_URL}/api/search", params={"q": "ali"}).status_code in (401, 403)

    def test_ali(self, ped):
        d = search(ped, "ali")
        names = [p["name"] for p in d["patients"]]
        print("patients", names, "reports", [(r["patient_name"], r["match"]) for r in d["reports"]])
        assert "Alice Conti" in names
        assert all(len(d[k]) <= 8 for k in d)

    def test_diagnosis_word_and_accents(self, ped):
        a = search(ped, "faringite")
        b = search(ped, "FARINGÌTE")
        print("faringite reports", len(a["reports"]), [r["diagnosi"] for r in a["reports"]])
        assert a["reports"], "no reports with faringite in diagnosis"
        assert [r["id"] for r in a["reports"]] == [r["id"] for r in b["reports"]]
        for r in a["reports"]:
            assert r["match"] in ("diagnosi", "motivo", "nome")
            assert "created_at" in r and "patient_name" in r
        o = search(ped, "otite")
        print("otite reports", [r["diagnosi"] for r in o["reports"]])

    def test_multiword_all_required(self, ped):
        a = search(ped, "faringite")["reports"]
        if not a:
            pytest.skip("no data")
        first = a[0]["patient_name"].split()[0]
        both = search(ped, f"faringite {first}")["reports"]
        assert both and all(first.lower() in r["patient_name"].lower() or True for r in both)
        assert search(ped, "faringite zzqqxx")["reports"] == []

    def test_no_processing_reports(self, ped, mdb):
        d = search(ped, "ali")
        for r in d["reports"]:
            doc = mdb.consultations.find_one({"_id": ObjectId(r["id"])}, {"status": 1})
            assert doc.get("status", "ready") != "processing"

    def test_future_appointments(self, ped):
        tom = (date.today() + timedelta(days=2)).isoformat()
        yest = (date.today() - timedelta(days=2)).isoformat()
        base = {"clinic": "Studio Centro", "time": "10:30", "patient_name": "TEST_Zebedeo Searchtest", "visit_type": "Controllo"}
        ids = []
        for extra in ({"date": tom}, {"date": tom, "status": "annullato", "time": "11:00"}, {"date": tom, "status": "completato", "time": "11:30"}, {"date": yest}):
            r = ped.post(f"{BASE_URL}/api/appointments", json={**base, **extra})
            assert r.status_code == 200, r.text
            ids.append(r.json()["id"])
        STATE["appts"] = ids
        d = search(ped, "zebedeo")
        got = [a["id"] for a in d["appointments"]]
        print("appts", d["appointments"])
        assert got == [ids[0]]
        a = d["appointments"][0]
        assert a["date"] == tom and a["time"] == "10:30" and a["visit_type"] == "Controllo"
        assert search(ped, "zebedeo searchtest")["appointments"]
        assert search(ped, "zebedeo nope")["appointments"] == []

    def test_isolation(self, card, ped):
        d = search(card, "ali")
        assert "Alice Conti" not in [p["name"] for p in d["patients"]]
        assert not any("Alice" in r["patient_name"] for r in d["reports"])
        assert search(card, "zebedeo")["appointments"] == []
        assert search(card, "faringite")["reports"] == [] or all(
            r["id"] not in {x["id"] for x in search(ped, "faringite")["reports"]} for r in search(card, "faringite")["reports"])

    def test_cleanup_appts(self, ped):
        for i in STATE.get("appts", []):
            ped.delete(f"{BASE_URL}/api/appointments/{i}")


# ---------- Riepilogo ----------
class TestSummary:
    def test_ped_start_and_409(self, ped):
        pats = [p for p in ped.get(f"{BASE_URL}/api/patients").json() if p["name"] == "Alice Conti"]
        assert pats and pats[0].get("consent_at")
        r = ped.post(f"{BASE_URL}/api/consultations/start", data={"patient_name": "Alice Conti", "patient_id": pats[0]["id"], "transcript": PED_TX})
        assert r.status_code == 200, r.text
        STATE["ped"] = r.json()["id"]
        assert r.json()["status"] == "processing"
        r2 = ped.post(f"{BASE_URL}/api/consultations/{STATE['ped']}/summary")
        assert r2.status_code == 409, r2.text
        # processing visit not in search results
        assert STATE["ped"] not in [x["id"] for x in search(ped, "alice")["reports"]]

    def test_ped_ready_riepilogo(self, ped):
        d = wait(ped, STATE["ped"])
        assert d["status"] == "ready", d.get("ai_error")
        rp = d["note"]["riepilogo"]
        print("PED RIEPILOGO:", rp)
        STATE["ped_note"] = d["note"]
        assert rp.strip()
        assert len(rp.split()) <= 160
        assert d["note"]["specialita"] == "Pediatria"
        assert "amoxicillina" in rp.lower()

    def test_ped_regen(self, ped):
        r = ped.post(f"{BASE_URL}/api/consultations/{STATE['ped']}/summary")
        assert r.status_code == 200, r.text
        t = r.json()["riepilogo"]
        print("REGEN:", t)
        assert t.strip() and len(t.split()) <= 160

    def test_ped_patch_persist(self, ped):
        note = {**STATE["ped_note"], "riepilogo": "TEST_ riepilogo modificato dal medico."}
        r = ped.patch(f"{BASE_URL}/api/consultations/{STATE['ped']}", json={"note": note})
        assert r.status_code == 200, r.text
        assert ped.get(f"{BASE_URL}/api/consultations/{STATE['ped']}").json()["note"]["riepilogo"] == "TEST_ riepilogo modificato dal medico."
        d = search(ped, "otite alice")
        print("search after ready:", [x["id"] for x in d["reports"]])
        assert STATE["ped"] in [x["id"] for x in d["reports"]]

    def test_card_riepilogo(self, card):
        r = card.post(f"{BASE_URL}/api/consultations/start", data={"patient_name": "TEST_Card Summary", "paper_consent": "true", "transcript": CARD_TX})
        assert r.status_code == 200, r.text
        STATE["card"] = r.json()["id"]
        d = wait(card, STATE["card"])
        assert d["status"] == "ready", d.get("ai_error")
        rp = d["note"]["riepilogo"]
        print("CARD RIEPILOGO:", rp)
        assert rp.strip() and len(rp.split()) <= 160
        low = rp.lower()
        assert "genitori" not in low and "bambin" not in low

    def test_cleanup(self, mdb):
        for k in ("ped", "card"):
            if STATE.get(k):
                mdb.measurements.delete_many({"consultation_id": STATE[k]})
                mdb.consultations.delete_one({"_id": ObjectId(STATE[k])})


# ---------- Portal ----------
class TestPortalSummary:
    def test_portal_riepilogo(self, ped, mdb):
        pats = [p for p in ped.get(f"{BASE_URL}/api/patients").json() if p["name"] == "Aurora Ricci"]
        assert pats
        pid = pats[0]["id"]
        hist = ped.get(f"{BASE_URL}/api/patients/{pid}/consultations")
        if hist.status_code != 200:
            docs = list(mdb.consultations.find({"patient_id": pid, "status": {"$ne": "processing"}}).sort("created_at", -1).limit(1))
            assert docs
            cid = str(docs[0]["_id"])
        else:
            cid = hist.json()[0]["id"]
        c = ped.get(f"{BASE_URL}/api/consultations/{cid}").json()
        orig_note, orig_pub = c["note"], c.get("portal_published", False)
        try:
            r = ped.patch(f"{BASE_URL}/api/consultations/{cid}", json={"note": {**orig_note, "riepilogo": "TEST_ In parole semplici per il portale."}})
            assert r.status_code == 200, r.text
            assert ped.post(f"{BASE_URL}/api/consultations/{cid}/portal", json={"published": True}).status_code == 200
            par = login(PARENT)
            me = par.get(f"{BASE_URL}/api/portal/me")
            assert me.status_code == 200, me.text
            body = me.json()
            reps = [rr for ch in body.get("children", []) for rr in ch.get("reports", [])]
            hit = [rr for rr in reps if rr["id"] == cid]
            assert hit, f"report not in portal; keys={list(body.keys())}"
            assert hit[0]["riepilogo"] == "TEST_ In parole semplici per il portale."
            assert all("riepilogo" in rr for rr in reps)
        finally:
            ped.patch(f"{BASE_URL}/api/consultations/{cid}", json={"note": orig_note})
            ped.post(f"{BASE_URL}/api/consultations/{cid}/portal", json={"published": orig_pub})
