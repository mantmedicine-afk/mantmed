"""Iteration 22: dynamic AI prompt by specialty (Cardiologia vs Pediatria), PDF per specialty, long-visit audio parts, signature endpoint."""
import io
import os
import time
from pathlib import Path

import fitz  # pymupdf
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
CARD_TX = ("Paziente di 62 anni, iperteso, viene per dolore toracico da sforzo e palpitazioni da due settimane. "
           "Familiarità per cardiopatia ischemica. Pressione arteriosa 150 su 90, frequenza cardiaca 88 regolare. "
           "All'auscultazione cardiaca soffio sistolico 2 su 6 al focolaio aortico. ECG: ritmo sinusale, "
           "sottoslivellamento ST in V5 V6. Diagnosi: sospetta angina da sforzo. Terapia: bisoprololo 2,5 mg una volta al giorno, "
           "aspirina 100 mg al giorno. Controllo con ecocardiogramma e test da sforzo tra due settimane.")
PED_TX = ("Bambino di tre anni portato dalla mamma per febbre a 38.5 da due giorni e tosse secca. "
          "All'esame obiettivo faringe iperemica, timpani nella norma, torace con murmure vescicolare fisiologico. "
          "Peso 14 chili, altezza 95 centimetri. Diagnosi faringite virale. Terapia paracetamolo 150 mg al bisogno, "
          "lavaggi nasali, controllo tra cinque giorni.")


def login(cred):
    x = requests.Session()
    r = x.post(f"{BASE_URL}/api/auth/login", json={"email": cred[0], "password": cred[1]})
    assert r.status_code == 200, r.text
    return x


@pytest.fixture(scope="module")
def card():
    return login(CARD)


@pytest.fixture(scope="module")
def ped():
    return login(PED)


@pytest.fixture(scope="module")
def mdb():
    return MongoClient(_benv["MONGO_URL"])[_benv["DB_NAME"]]


def wait(s, cid, timeout=90, steps=None):
    t0 = time.time()
    while time.time() - t0 < timeout:
        d = s.get(f"{BASE_URL}/api/consultations/{cid}").json()
        if steps is not None and d.get("ai_step") and (not steps or steps[-1] != d["ai_step"]):
            steps.append(d["ai_step"])
        if d["status"] in ("ready", "failed"):
            return d
        time.sleep(0.7)
    return d


def pdf_text(s, cid):
    r = s.get(f"{BASE_URL}/api/consultations/{cid}/pdf")
    assert r.status_code == 200, r.text[:300]
    doc = fitz.open(stream=r.content, filetype="pdf")
    return "\n".join(p.get_text() for p in doc)


STATE = {}


# --- Specialty: Cardiologia
class TestCardiology:
    def test_start_immediate_specialty(self, card):
        r = card.post(f"{BASE_URL}/api/consultations/start", data={"patient_name": "TEST_Mario Test", "paper_consent": "true", "transcript": CARD_TX})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "processing"
        assert d["note"]["specialita"] == "Cardiologia"
        STATE["card"] = d["id"]

    def test_ready_sections(self, card):
        d = wait(card, STATE["card"])
        assert d["status"] == "ready", d.get("ai_error")
        n = d["note"]
        STATE["card_note"] = n
        print("SEZIONI:", [(x["gruppo"], x["titolo"]) for x in n["sezioni"]])
        titles = " | ".join(x["titolo"].lower() for x in n["sezioni"] if x["gruppo"] in ("esame_obiettivo", "parametri_vitali"))
        assert "pressione" in titles
        assert "auscult" in titles
        assert "ecg" in titles
        assert not n["torl"] and not n["allattamento"] and not n["svezzamento"]
        g = n["crescita"]
        assert not g.get("percentile_peso") and not g.get("percentile_altezza") and not g.get("percentile_cc")

    def test_pdf(self, card):
        t = pdf_text(card, STATE["card"])
        assert "specialistica · Cardiologia" in t
        assert "pediatrica specialistica" not in t
        for bad in ("TORL", "Allattamento", "Percentile OMS"):
            assert bad not in t, bad
        for x in STATE["card_note"]["sezioni"][:3]:
            assert x["titolo"].split()[0].upper() in t.upper()

    def test_patch_sections_persist(self, card):
        n = dict(STATE["card_note"])
        n["sezioni"] = n["sezioni"][1:] + [{"gruppo": "esame_obiettivo", "titolo": "TEST_Voce aggiunta", "testo": "Testo prova"}]
        r = card.patch(f"{BASE_URL}/api/consultations/{STATE['card']}", json={"note": n})
        assert r.status_code == 200, r.text
        d = card.get(f"{BASE_URL}/api/consultations/{STATE['card']}").json()
        assert d["note"]["sezioni"][-1]["titolo"] == "TEST_Voce aggiunta"
        assert d["note"]["specialita"] == "Cardiologia"


# --- Pediatrics regression
class TestPediatrics:
    def test_ped_flow(self, ped):
        r = ped.post(f"{BASE_URL}/api/consultations/start", data={"patient_name": "TEST_Bimbo Test", "paper_consent": "true", "transcript": PED_TX})
        assert r.status_code == 200, r.text
        assert r.json()["note"]["specialita"] == "Pediatria"
        STATE["ped"] = r.json()["id"]
        d = wait(ped, STATE["ped"])
        assert d["status"] == "ready", d.get("ai_error")
        n = d["note"]
        assert n["torl"] and n["torl"] != "Non riportato"
        t = pdf_text(ped, STATE["ped"])
        assert "pediatrica specialistica" in t
        assert "TORL" in t

    @pytest.fixture(autouse=False)
    def cleanup_ped2(self, mdb):
        yield
        if STATE.get("ped2"):  # don't pollute the seeded patient's growth chart
            mdb.measurements.delete_many({"consultation_id": STATE["ped2"]})
            mdb.consultations.delete_one({"_id": ObjectId(STATE["ped2"])})

    def test_ped_percentiles_with_patient(self, ped, cleanup_ped2):
        ps = [p for p in ped.get(f"{BASE_URL}/api/patients").json() if p.get("consent_at")]
        if not ps:
            pytest.skip("no consented patient")
        r = ped.post(f"{BASE_URL}/api/consultations/start", data={"patient_name": ps[0]["name"], "patient_id": ps[0]["id"], "transcript": PED_TX})
        assert r.status_code == 200, r.text
        STATE["ped2"] = r.json()["id"]
        d = wait(ped, STATE["ped2"])
        assert d["status"] == "ready", d.get("ai_error")
        g = d["note"]["crescita"]
        print("CRESCITA", g)
        assert g.get("percentile_peso"), g
        assert "Percentile OMS" in pdf_text(ped, STATE["ped2"])

    def test_old_note_without_specialita_is_pediatric(self, ped, mdb):
        # pick an existing seeded ready visit and check PDF renders pediatric
        lst = ped.get(f"{BASE_URL}/api/consultations").json()
        old = [c for c in lst if c["status"] == "ready" and not c["note"].get("specialita")]
        if not old:
            pytest.skip("no legacy note")
        assert "pediatrica specialistica" in pdf_text(ped, old[0]["id"])


# --- Long visits: audio parts
class TestAudioParts:
    def test_empty_part(self, ped):
        r = ped.post(f"{BASE_URL}/api/consultations/audio-parts", files={"audio": ("p.webm", b"", "audio/webm")})
        assert r.status_code == 400

    def test_too_big_part(self, ped):
        r = ped.post(f"{BASE_URL}/api/consultations/audio-parts", files={"audio": ("p.webm", os.urandom(26 * 1024 * 1024), "audio/webm")})
        assert r.status_code == 413, r.status_code

    def test_invalid_part_ids(self, ped):
        for pid in ("zzz", str(ObjectId())):
            r = ped.post(f"{BASE_URL}/api/consultations/start", data={"patient_name": "TEST_X", "paper_consent": "true", "part_ids": pid})
            assert r.status_code == 400, (pid, r.status_code)

    def test_foreign_part(self, ped, card):
        r = card.post(f"{BASE_URL}/api/consultations/audio-parts", files={"audio": ("p1.mp3", open("/tmp/p1.mp3", "rb").read(), "audio/mpeg")})
        assert r.status_code == 200
        pid = r.json()["part_id"]
        r = ped.post(f"{BASE_URL}/api/consultations/start", data={"patient_name": "TEST_X", "paper_consent": "true", "part_ids": pid})
        assert r.status_code == 400
        STATE["foreign_orphan"] = pid

    def test_two_parts_flow(self, ped, mdb):
        ids = []
        for f in ("/tmp/p1.mp3", "/tmp/p2.mp3"):
            r = ped.post(f"{BASE_URL}/api/consultations/audio-parts", files={"audio": (Path(f).name, open(f, "rb").read(), "audio/mpeg")})
            assert r.status_code == 200, r.text
            assert isinstance(r.json()["part_id"], str)
            ids.append(r.json()["part_id"])
        r = ped.post(f"{BASE_URL}/api/consultations/start", data={"patient_name": "TEST_Lunga", "paper_consent": "true", "part_ids": ",".join(ids), "duration_sec": "1600"})
        assert r.status_code == 200, r.text
        cid = r.json()["id"]
        assert r.json()["status"] == "processing"
        steps = []
        d = wait(ped, cid, timeout=150, steps=steps)
        print("STEPS", steps)
        print("TRANSCRIPT", d["transcript"])
        assert d["status"] == "ready", d.get("ai_error")
        assert "Trascrizione parte 1 di 2" in steps or "Trascrizione parte 2 di 2" in steps
        assert "\n" in d["transcript"]
        assert mdb.consult_jobs.find_one({"consultation_id": cid}) is None
        for i in ids:
            assert mdb["consult_audio.files"].find_one({"_id": ObjectId(i)}) is None
        STATE["long"] = (cid, ids, d)
