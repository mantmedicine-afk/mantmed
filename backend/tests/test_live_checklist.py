# Live checklist (Visita in corso): checklist da modelli di visita (checklist_id='template' + template_id), MantAI settings, live chunk, start with checklist (real + demo)
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
CREATED = []  # consultazioni create dai test: eliminate a fine modulo


@pytest.fixture(scope="module", autouse=True)
def _cleanup_consults():
    yield
    if CREATED:
        from bson import ObjectId
        from dotenv import dotenv_values
        from pymongo import MongoClient
        e = dotenv_values("/app/backend/.env")
        db = MongoClient(e["MONGO_URL"])[e["DB_NAME"]]
        db.consultations.delete_many({"_id": {"$in": [ObjectId(i) for i in CREATED]}})
        db.consult_jobs.delete_many({"consultation_id": {"$in": CREATED}})


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


def tpl(s, pred):
    return next(t for t in s.get(f"{BASE_URL}/api/visit-templates").json() if pred(t))


class TestChecklists:
    # La checklist ora usa i modelli di visita del medico (campi con id/titolo/gruppo/required)
    def test_templates_have_checklist_fields(self, doc):
        r = doc.get(f"{BASE_URL}/api/visit-templates")
        assert r.status_code == 200
        kinds = {t["kind"]: t for t in r.json() if t.get("kind")}
        assert {"prima", "acuta", "controllo", "certificato"} <= set(kinds)
        for t in r.json():
            for f in t["fields"]:
                assert {"id", "titolo", "gruppo"} <= set(f) and isinstance(f.get("required", False), bool)  # vecchi campi salvati senza required
        assert sum(f["required"] for f in kinds["acuta"]["fields"]) == 5

    def test_requires_auth(self):
        assert requests.get(f"{BASE_URL}/api/visit-templates").status_code in (401, 403)


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
        t = tpl(doc, lambda t: t.get("bilancio") == "6m")
        fields = t["fields"]
        sonno_id = next(f["id"] for f in fields if f["titolo"] == "Sonno")
        empty = [{"id": f["id"], "label": f["titolo"], "hint": f["hint"]} for f in fields if f["id"] != sonno_id]
        sid = str(uuid.uuid4())
        with open(CHUNK, "rb") as fh:
            r = doc.post(f"{BASE_URL}/api/consultations/live/chunk", files={"audio": ("blocco-0.mp3", fh, "audio/mpeg")},
                         data={"session_id": sid, "seq": 0, "empty_fields": json.dumps(empty)}, timeout=90)
        assert r.status_code == 200, r.text
        d = r.json()
        print("chunk:", d)
        assert d["seq"] == 0 and d["words"] > 3
        assert all(x["id"] != sonno_id for x in d["detected"])  # only empty fields
        # incomplete chunk transcript -> 409
        r409 = doc.post(f"{BASE_URL}/api/consultations/start", data={"patient_name": "TEST_Live Checklist", "paper_consent": "true",
                        "checklist_id": "template", "template_id": t["id"], "live_session_id": sid, "live_chunks": 2})
        assert r409.status_code == 409
        r = doc.post(f"{BASE_URL}/api/consultations/start", data={
            "patient_name": "TEST_Live Checklist", "paper_consent": "true", "checklist_id": "template", "template_id": t["id"],
            "checklist_manual": json.dumps({sonno_id: "TEST_Dorme 10 ore"}), "live_session_id": sid, "live_chunks": 1}, timeout=60)
        assert r.status_code == 200, r.text
        c = r.json()
        CREATED.append(c["id"])
        assert c["status"] == "processing"
        for _ in range(40):
            time.sleep(4)
            c = doc.get(f"{BASE_URL}/api/consultations/{c['id']}").json()
            if c["status"] != "processing":
                break
        assert c["status"] == "ready", c["status"]
        sez = c["note"]["sezioni"]
        titles = [s["titolo"] for s in sez]
        assert titles == [f["titolo"] for f in fields]
        sonno = sez[titles.index("Sonno")]
        assert sonno["fonte"] == "manuale" and sonno["testo"] == "TEST_Dorme 10 ore"
        assert any(s["fonte"] == "ai" for s in sez)
        for s in sez:
            if s.get("mancante"):
                assert s["testo"] == "Non rilevato"
        print("CREATED_REAL", c["id"], [(s["titolo"], s.get("fonte"), s.get("mancante")) for s in sez])


class TestDemo:
    def test_demo_start_ready(self, doc):
        assert doc.put(f"{BASE_URL}/api/mantai-settings", json={"demo": True}).json()["demo"] is True
        t = tpl(doc, lambda t: t.get("kind") == "acuta")
        ids = {f["titolo"]: f["id"] for f in t["fields"]}
        try:
            r = doc.post(f"{BASE_URL}/api/consultations/start", data={
                "patient_name": "TEST_Demo Checklist", "paper_consent": "true", "checklist_id": "template", "template_id": t["id"],
                "checklist_manual": json.dumps({ids["Terapia"]: "TEST_Ibuprofene"}),
                "checklist_demo": json.dumps({ids["Febbre"]: "x", ids["Diagnosi"]: "x"})})
            assert r.status_code == 200, r.text
            c = r.json()
            CREATED.append(c["id"])
            assert c["status"] == "ready"
            sez = c["note"]["sezioni"]
            assert c["template_id"] == t["id"]
            assert [s["titolo"] for s in sez] == [f["titolo"] for f in t["fields"]]
            assert len(sez) == 17
            ter = [s for s in sez if s["titolo"] == "Terapia"][0]
            assert ter["fonte"] == "manuale" and ter["testo"] == "TEST_Ibuprofene"
            assert sum(s["fonte"] == "ai" for s in sez) == 2
            assert sum(s["mancante"] for s in sez) == 14
            assert all(s["testo"] == "Non rilevato" for s in sez if s["mancante"])
            print("CREATED_DEMO", c["id"])
        finally:
            assert doc.put(f"{BASE_URL}/api/mantai-settings", json={"demo": False}).json()["demo"] is False
        assert doc.get(f"{BASE_URL}/api/mantai-settings").json()["demo"] is False
