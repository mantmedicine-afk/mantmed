"""Async consultation processing: POST /api/consultations/start, background job, 409 guards, PATCH during processing, audio fail + retry."""
import io
import math
import os
import struct
import time
import wave
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values

_env = dotenv_values(Path(__file__).resolve().parents[2] / "frontend" / ".env")
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _env.get("REACT_APP_BACKEND_URL") or "").rstrip("/")
assert BASE_URL
DOC = ("medico@mantmed.it", "Auscula-Studio-2026")
TRANSCRIPT = ("Bambino di tre anni portato dalla mamma per febbre a 38.5 da due giorni e tosse secca. "
              "All'esame obiettivo faringe iperemica, timpani nella norma, torace con murmure vescicolare fisiologico. "
              "Peso 14 chili, altezza 95 centimetri. Diagnosi faringite virale. Terapia paracetamolo 150 mg al bisogno, "
              "lavaggi nasali, controllo tra cinque giorni.")


@pytest.fixture(scope="module")
def s():
    x = requests.Session()
    r = x.post(f"{BASE_URL}/api/auth/login", json={"email": DOC[0], "password": DOC[1]})
    assert r.status_code == 200, r.text
    return x


@pytest.fixture(scope="module")
def patients(s):
    r = s.get(f"{BASE_URL}/api/patients")
    assert r.status_code == 200
    ps = r.json()
    return {"consent": [p for p in ps if p.get("consent_at")], "noconsent": [p for p in ps if not p.get("consent_at")]}


def wait_status(s, cid, statuses=("ready", "failed"), timeout=60):
    t0 = time.time()
    while time.time() - t0 < timeout:
        d = s.get(f"{BASE_URL}/api/consultations/{cid}").json()
        if d["status"] in statuses:
            return d
        time.sleep(1.5)
    return d


def tone_wav(sec=2, silent=True):
    b = io.BytesIO()
    w = wave.open(b, "wb")
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(16000)
    frames = b"".join(struct.pack("<h", 0 if silent else int(3000 * math.sin(2 * math.pi * 440 * i / 16000))) for i in range(16000 * sec))
    w.writeframes(frames); w.close()
    return b.getvalue()


# --- validation
class TestValidation:
    def test_short_transcript_400(self, s):
        r = s.post(f"{BASE_URL}/api/consultations/start", data={"patient_name": "TEST_Free", "paper_consent": "true", "transcript": "troppo corto"})
        assert r.status_code == 400, r.text

    def test_free_visit_no_consent_412(self, s):
        r = s.post(f"{BASE_URL}/api/consultations/start", data={"patient_name": "TEST_Free", "transcript": TRANSCRIPT})
        assert r.status_code == 412, r.text

    def test_patient_without_consent_412(self, s, patients):
        if not patients["noconsent"]:
            pytest.skip("no patient without consent")
        p = patients["noconsent"][0]
        r = s.post(f"{BASE_URL}/api/consultations/start", data={"patient_name": p["name"], "patient_id": p["id"], "transcript": TRANSCRIPT})
        assert r.status_code == 412, r.text

    def test_unauth_401(self):
        r = requests.post(f"{BASE_URL}/api/consultations/start", data={"patient_name": "x", "paper_consent": "true", "transcript": TRANSCRIPT})
        assert r.status_code in (401, 403)


# --- text flow on linked patient
class TestTextFlow:
    state = {}

    def test_start_fast_processing(self, s, patients):
        p = patients["consent"][0]
        t0 = time.time()
        r = s.post(f"{BASE_URL}/api/consultations/start", data={"patient_name": p["name"], "patient_id": p["id"], "clinic": "Studio", "duration_sec": "120", "transcript": TRANSCRIPT})
        el = time.time() - t0
        assert r.status_code == 200, r.text
        d = r.json()
        print("start elapsed", el)
        assert el < 2.5
        assert d["status"] == "processing"
        assert d["transcript"] == TRANSCRIPT
        assert d["note"]["diagnosi"] == ""
        self.state.update(cid=d["id"], pid=p["id"])

    def test_guards_409(self, s):
        cid = self.state["cid"]
        assert s.get(f"{BASE_URL}/api/consultations/{cid}/pdf").status_code == 409
        assert s.post(f"{BASE_URL}/api/consultations/{cid}/send-report").status_code == 409
        assert s.post(f"{BASE_URL}/api/consultations/{cid}/portal", json={"published": True}).status_code == 409

    def test_patch_during_processing(self, s):
        cid = self.state["cid"]
        r = s.patch(f"{BASE_URL}/api/consultations/{cid}", json={"note": {"diagnosi": "HACK", "anamnesi_fisiologica": "HACK", "crescita": {"peso_kg": 14.6}}})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "processing"
        assert d["note"]["diagnosi"] == ""
        assert d["note"]["crescita"]["peso_kg"] == 14.6

    def test_listed_with_status(self, s):
        lst = s.get(f"{BASE_URL}/api/consultations").json()
        assert all("status" in c for c in lst)
        assert any(c["id"] == self.state["cid"] and c["status"] == "processing" for c in lst)

    def test_becomes_ready(self, s):
        d = wait_status(s, self.state["cid"])
        assert d["status"] == "ready", d.get("ai_error")
        assert d["note"]["diagnosi"] and d["note"]["diagnosi"] != "HACK"
        assert d["ai_sec"] and d["ai_sec"] > 0
        assert d["note"]["crescita"]["peso_kg"] == 14.6, d["note"]["crescita"]
        print("ai_sec", d["ai_sec"], "diagnosi", d["note"]["diagnosi"][:80])

    def test_pdf_after_ready(self, s):
        r = s.get(f"{BASE_URL}/api/consultations/{self.state['cid']}/pdf")
        assert r.status_code == 200
        assert r.content[:4] == b"%PDF"

    def test_retry_on_ready_unchanged(self, s):
        r = s.post(f"{BASE_URL}/api/consultations/{self.state['cid']}/retry")
        assert r.status_code == 200
        assert r.json()["status"] == "ready"


# --- free visit text
def test_free_visit_ready(s):
    r = s.post(f"{BASE_URL}/api/consultations/start", data={"patient_name": "TEST_Async Libero", "paper_consent": "true", "transcript": TRANSCRIPT})
    assert r.status_code == 200, r.text
    d = wait_status(s, r.json()["id"])
    assert d["status"] == "ready", d.get("ai_error")
    assert d["patient_id"] is None


# --- audio path
def test_audio_silent_fail_and_retry(s):
    files = {"audio": ("silence.wav", tone_wav(), "audio/wav")}
    r = s.post(f"{BASE_URL}/api/consultations/start", data={"patient_name": "TEST_Async Audio", "paper_consent": "true"}, files=files)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["status"] == "processing" and d["transcript"] == ""
    cid = d["id"]
    d = wait_status(s, cid, timeout=90)
    print("audio result", d["status"], d.get("ai_error"), d.get("transcript", "")[:80])
    assert d["status"] in ("ready", "failed")
    if d["status"] == "failed":
        assert d.get("ai_error")
        r = s.post(f"{BASE_URL}/api/consultations/{cid}/retry")
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "processing"
        d2 = wait_status(s, cid, timeout=90)
        assert d2["status"] in ("ready", "failed")


# --- legacy endpoint
def test_legacy_create_ready(s):
    r = s.post(f"{BASE_URL}/api/consultations", json={"patient_name": "TEST_Async Legacy", "paper_consent": True, "transcript": TRANSCRIPT})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["status"] == "ready"
    assert d["note"]["diagnosi"]


def test_get_404(s):
    assert s.get(f"{BASE_URL}/api/consultations/000000000000000000000000").status_code == 404
