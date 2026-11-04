# Live checklist (Visita in corso): checklists, MantAI settings, live chunk, start with checklist (real + demo)
import json
import os
import time
import uuid

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
DOCTOR = ("medico@mantmed.it", "Auscula-Studio-2026")
CARDIO = ("cardiologo.demo@example.com", "Cardio-Demo-2026")
CHUNK = "/tmp/chunk.mp3"


def login(creds):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": creds[0], "password": creds[1]})
    if r.status_code != 200:
        pytest.skip(f"login failed {r.status_code} {r.text[:200]}")
    return s


@pytest.fixture(scope="module")
def doc():
    s = login(DOCTOR)
    orig = s.get(f"{BASE_URL}/api/mantai-settings").json()
    yield s
    # restore settings: demo always OFF, realtime as before
    s.put(f"{BASE_URL}/api/mantai-settings", json={"demo": False, "realtime": orig.get("realtime", True)})


class TestChecklists:
    def test_four_models(self, doc):
        r = doc.get(f"{BASE_URL}/api/checklists")
        assert r.status_code == 200
        xs = {c["id"]: c for c in r.json()}
        assert {k: len(v["fields"]) for k, v in xs.items()} == {"bilancio": 12, "acuta": 12, "controllo": 8, "certificato": 8}
        for c in xs.values():
            for f in c["fields"]:
                assert {"id", "section", "label", "required"} <= set(f)
        assert xs["bilancio"]["name"] == "Bilancio di salute"
        assert sum(f["required"] for f in xs["bilancio"]["fields"]) == 8

    def test_requires_auth(self):
        assert requests.get(f"{BASE_URL}/api/checklists").status_code in (401, 403)


class TestSettings:
    def test_get_shape(self, doc):
        d = doc.get(f"{BASE_URL}/api/mantai-settings").json()
        assert set(d) == {"realtime", "demo", "demo_available"}
        assert d["demo_available"] is True

    def test_toggle_realtime_persists(self, doc):
        r = doc.put(f"{BASE_URL}/api/mantai-settings", json={"realtime": False})
        assert r.status_code == 200 and r.json()["realtime"] is False
        assert doc.get(f"{BASE_URL}/api/mantai-settings").json()["realtime"] is False
        assert doc.put(f"{BASE_URL}/api/mantai-settings", json={"realtime": True}).json()["realtime"] is True

    def test_cardio_demo_available(self):
        s = login(CARDIO)
        d = s.get(f"{BASE_URL}/api/mantai-settings").json()
        assert d["demo_available"] is True
        assert d["demo"] is False

    def test_invalid_body(self, doc):
        r = doc.put(f"{BASE_URL}/api/mantai-settings", json={"realtime": "notabool"})
        assert r.status_code == 422


class TestLiveChunk:
    def test_invalid_session(self, doc):
        r = doc.post(f"{BASE_URL}/api/consultations/live/chunk", files={"audio": ("a.webm", b"xx", "audio/webm")},
                     data={"session_id": "BAD SESSION!", "seq": 0, "empty_fields": "[]"})
        assert r.status_code == 400

    def test_bad_seq(self, doc):
        r = doc.post(f"{BASE_URL}/api/consultations/live/chunk", files={"audio": ("a.webm", b"xx", "audio/webm")},
                     data={"session_id": str(uuid.uuid4()), "seq": 9999, "empty_fields": "[]"})
        assert r.status_code == 400

    def test_empty_audio(self, doc):
        r = doc.post(f"{BASE_URL}/api/consultations/live/chunk", files={"audio": ("a.webm", b"", "audio/webm")},
                     data={"session_id": str(uuid.uuid4()), "seq": 0, "empty_fields": "[]"})
        assert r.status_code == 400

    @pytest.mark.skipif(not os.path.exists(CHUNK), reason="no TTS chunk")
    def test_real_chunk_then_start(self, doc):
        doc.put(f"{BASE_URL}/api/mantai-settings", json={"demo": False})
        fields = [f for f in doc.get(f"{BASE_URL}/api/checklists").json() if f["id"] == "bilancio"][0]["fields"]
        empty = [{"id": f["id"], "label": f["label"], "hint": f["hint"]} for f in fields if f["id"] != "sonno"]
        sid = str(uuid.uuid4())
        with open(CHUNK, "rb") as fh:
            r = doc.post(f"{BASE_URL}/api/consultations/live/chunk", files={"audio": ("blocco-0.mp3", fh, "audio/mpeg")},
                         data={"session_id": sid, "seq": 0, "empty_fields": json.dumps(empty)}, timeout=90)
        assert r.status_code == 200, r.text
        d = r.json()
        print("chunk:", d)
        assert d["seq"] == 0 and d["words"] > 3
        assert all(x["id"] != "sonno" for x in d["detected"])  # only empty fields
        # incomplete chunk transcript -> 409
        r409 = doc.post(f"{BASE_URL}/api/consultations/start", data={"patient_name": "TEST_Live Checklist", "paper_consent": "true",
                        "checklist_id": "bilancio", "live_session_id": sid, "live_chunks": 2})
        assert r409.status_code == 409
        r = doc.post(f"{BASE_URL}/api/consultations/start", data={
            "patient_name": "TEST_Live Checklist", "paper_consent": "true", "checklist_id": "bilancio",
            "checklist_manual": json.dumps({"sonno": "TEST_Dorme 10 ore"}), "live_session_id": sid, "live_chunks": 1}, timeout=60)
        assert r.status_code == 200, r.text
        c = r.json()
        assert c["status"] == "processing"
        for _ in range(40):
            time.sleep(4)
            c = doc.get(f"{BASE_URL}/api/consultations/{c['id']}").json()
            if c["status"] != "processing":
                break
        assert c["status"] == "ready", c["status"]
        sez = c["note"]["sezioni"]
        titles = [s["titolo"] for s in sez]
        assert titles == [f["label"] for f in fields]
        sonno = sez[1]
        assert sonno["fonte"] == "manuale" and sonno["testo"] == "TEST_Dorme 10 ore"
        assert any(s["fonte"] == "ai" for s in sez)
        for s in sez:
            if s.get("mancante"):
                assert s["testo"] == "Non rilevato"
        print("CREATED_REAL", c["id"], [(s["titolo"], s.get("fonte"), s.get("mancante")) for s in sez])


class TestDemo:
    def test_demo_start_ready(self, doc):
        assert doc.put(f"{BASE_URL}/api/mantai-settings", json={"demo": True}).json()["demo"] is True
        try:
            r = doc.post(f"{BASE_URL}/api/consultations/start", data={
                "patient_name": "TEST_Demo Checklist", "paper_consent": "true", "checklist_id": "acuta",
                "checklist_manual": json.dumps({"terapia": "TEST_Ibuprofene"}),
                "checklist_demo": json.dumps({"motivo": "x", "febbre": "x"})})
            assert r.status_code == 200, r.text
            c = r.json()
            assert c["status"] == "ready"
            sez = c["note"]["sezioni"]
            assert len(sez) == 12
            t = [s for s in sez if s["titolo"] == "Terapia"][0]
            assert t["fonte"] == "manuale" and t["testo"] == "TEST_Ibuprofene"
            assert sum(s["fonte"] == "ai" for s in sez) == 2
            assert sum(s["mancante"] for s in sez) == 9
            print("CREATED_DEMO", c["id"])
        finally:
            assert doc.put(f"{BASE_URL}/api/mantai-settings", json={"demo": False}).json()["demo"] is False
        assert doc.get(f"{BASE_URL}/api/mantai-settings").json()["demo"] is False
