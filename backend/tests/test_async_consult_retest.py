"""Retest iteration_21: large audio in GridFS, hallucination filter, retry with pasted transcript, manual compile of failed visits,
optimistic concurrency of PATCH during processing, job/GridFS cleanup + TTL."""
import os
import sys
import threading
import time

import pytest
import requests
from bson import ObjectId
from dotenv import dotenv_values
from pymongo import MongoClient

sys.path.insert(0, os.path.dirname(__file__))
from test_async_consult import BASE_URL, DOC, TRANSCRIPT, tone_wav, wait_status  # noqa: E402

_be = dotenv_values(os.path.join(os.path.dirname(__file__), "..", ".env"))
mdb = MongoClient(_be["MONGO_URL"])[_be["DB_NAME"]]


@pytest.fixture(scope="module")
def s():
    x = requests.Session()
    r = x.post(f"{BASE_URL}/api/auth/login", json={"email": DOC[0], "password": DOC[1]})
    assert r.status_code == 200, r.text
    return x


def start(s, name, **kw):
    data = {"patient_name": name, "paper_consent": "true", **kw.pop("data", {})}
    return s.post(f"{BASE_URL}/api/consultations/start", data=data, timeout=180, **kw)


# --- large audio -> GridFS, quick 200, friendly failure; 26MB -> 413
def test_large_audio_13mb(s):
    n_before = mdb.consultations.count_documents({})
    t0 = time.time()
    r = start(s, "TEST_Retest Big", files={"audio": ("big.webm", os.urandom(13 * 1024 * 1024), "audio/webm")})
    el = time.time() - t0
    assert r.status_code == 200, r.text[:300]
    print("13MB upload elapsed", round(el, 1))
    cid = r.json()["id"]
    assert r.json()["status"] == "processing"
    job = mdb.consult_jobs.find_one({"consultation_id": cid})
    if job:  # may already be failed + kept
        assert job.get("audio_file") is not None
        assert "audio" not in job or not isinstance(job.get("audio"), (bytes, bytearray))
        assert job.get("expires_at") is not None
        assert mdb["consult_audio.files"].find_one({"_id": job["audio_file"]})
    d = wait_status(s, cid, timeout=150)
    print("13MB result", d["status"], d.get("ai_error"))
    assert d["status"] == "failed"
    err = d.get("ai_error") or ""
    assert err and "litellm" not in err.lower() and "error code" not in err.lower() and "openai" not in err.lower()
    assert mdb.consultations.count_documents({}) == n_before + 1


def test_audio_26mb_413(s):
    n_before = mdb.consultations.count_documents({"patient_name": {"$exists": True}})
    jobs_before = mdb.consult_jobs.count_documents({})
    r = start(s, "TEST_Retest Huge", files={"audio": ("huge.webm", os.urandom(26 * 1024 * 1024), "audio/webm")})
    print("26MB", r.status_code, r.text[:200])
    assert r.status_code == 413
    assert mdb.consultations.count_documents({"patient_name": {"$exists": True}}) == n_before
    assert mdb.consult_jobs.count_documents({}) == jobs_before


# --- hallucination filter
def test_silent_wav_failed_no_speech(s):
    r = start(s, "TEST_Retest Silent", files={"audio": ("silence.wav", tone_wav(), "audio/wav")})
    assert r.status_code == 200, r.text
    d = wait_status(s, r.json()["id"], timeout=90)
    print("silent", d["status"], d.get("ai_error"), repr(d.get("transcript", "")[:80]))
    assert d["status"] == "failed"
    assert "Nessun parlato rilevato" in d["ai_error"]
    pytest.silent_cid = d["id"]


# --- retry with pasted transcript on failed visit -> ready
def test_retry_with_pasted_transcript(s):
    cid = pytest.silent_cid
    r = s.post(f"{BASE_URL}/api/consultations/{cid}/retry", json={"transcript": "corto"})
    assert r.status_code == 400
    r = s.post(f"{BASE_URL}/api/consultations/{cid}/retry", json={"transcript": TRANSCRIPT})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "processing"
    assert r.json()["transcript"] == TRANSCRIPT
    job = mdb.consult_jobs.find_one({"consultation_id": cid})
    assert job is None or job.get("audio_file") is None  # audio replaced
    d = wait_status(s, cid, timeout=90)
    assert d["status"] == "ready", d.get("ai_error")
    assert d["note"]["diagnosi"]
    assert d["ai_error"] == ""
    # job + gridfs cleaned after success
    assert mdb.consult_jobs.find_one({"consultation_id": cid}) is None
    assert mdb["consult_audio.files"].find_one({"metadata.consultation_id": cid}) is None


# --- failed without job -> 410; manual compile via PATCH -> ready
def test_failed_without_job_410_and_manual_compile(s):
    r = s.post(f"{BASE_URL}/api/consultations", json={"patient_name": "TEST_Retest Manual", "paper_consent": True, "transcript": "x" * 0 or TRANSCRIPT})
    # legacy create runs the AI; to save AI calls we instead insert via start + flip
    assert r.status_code == 200, r.text
    cid = r.json()["id"]
    mdb.consultations.update_one({"_id": ObjectId(cid)}, {"$set": {"status": "failed", "ai_error": "Nessun parlato rilevato"}})
    mdb.consult_jobs.delete_many({"consultation_id": cid})
    r = s.post(f"{BASE_URL}/api/consultations/{cid}/retry")
    assert r.status_code == 410, r.text
    r = s.post(f"{BASE_URL}/api/consultations/{cid}/retry", json={"transcript": "troppo corto"})
    assert r.status_code == 400
    note = r.json() if False else s.get(f"{BASE_URL}/api/consultations/{cid}").json()["note"]
    note["diagnosi"] = "TEST_Diagnosi manuale"
    r = s.patch(f"{BASE_URL}/api/consultations/{cid}", json={"note": note})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["status"] == "ready" and d["ai_error"] == ""
    g = s.get(f"{BASE_URL}/api/consultations/{cid}").json()
    assert g["status"] == "ready" and g["note"]["diagnosi"] == "TEST_Diagnosi manuale"
    assert s.get(f"{BASE_URL}/api/consultations/{cid}/pdf").status_code == 200


# --- PATCH during processing: rev concurrency, no finalized_at, AI text intact, growth survives
def test_patch_race_with_job(s):
    r = start(s, "TEST_Retest Race", data={"transcript": TRANSCRIPT})
    assert r.status_code == 200
    cid = r.json()["id"]
    r = s.patch(f"{BASE_URL}/api/consultations/{cid}", json={"note": {"diagnosi": "HACK", "crescita": {"peso_kg": 15.2}}})
    assert r.status_code == 200 and r.json()["status"] in ("processing", "ready")
    raw = mdb.consultations.find_one({"_id": ObjectId(cid)})
    if raw["status"] == "processing":
        assert not raw.get("finalized_at")
        assert raw.get("rev", 0) >= 1
    # hammer PATCHes concurrently while the job finishes
    codes, stop = [], threading.Event()

    def hammer():
        x = requests.Session(); x.cookies.update(s.cookies)
        while not stop.is_set():
            if x.get(f"{BASE_URL}/api/consultations/{cid}").json()["status"] != "processing":
                break
            rr = x.patch(f"{BASE_URL}/api/consultations/{cid}", json={"note": {"diagnosi": "HACK2", "terapia": "HACK2", "crescita": {"peso_kg": 15.2}}})
            codes.append((rr.status_code, rr.json().get("status") if rr.status_code == 200 else rr.text[:80]))
            time.sleep(0.1)
    ts = [threading.Thread(target=hammer) for _ in range(3)]
    [t.start() for t in ts]
    d = wait_status(s, cid, timeout=90)
    time.sleep(1); stop.set(); [t.join(10) for t in ts]
    print("codes", codes[-6:], "n", len(codes))
    assert all(c[0] == 200 for c in codes), codes
    d = s.get(f"{BASE_URL}/api/consultations/{cid}").json()
    assert d["status"] == "ready"
    assert d["note"]["diagnosi"] not in ("", "HACK", "HACK2"), d["note"]["diagnosi"]
    assert d["note"]["crescita"]["peso_kg"] == 15.2
    assert mdb.consult_jobs.find_one({"consultation_id": cid}) is None


def test_ttl_index_present():
    idx = mdb.consult_jobs.index_information()
    assert any(v.get("expireAfterSeconds") == 0 and v["key"][0][0] == "expires_at" for v in idx.values()), idx


def test_late_autosave_after_ready_keeps_ai_text(s):
    """Simulates the NoteEditor 0.9s autosave arriving after the job finished but before the 2s poll noticed."""
    r = s.post(f"{BASE_URL}/api/consultations", json={"patient_name": "TEST_Retest Late", "paper_consent": True, "transcript": TRANSCRIPT})
    cid = r.json()["id"]
    mdb.consultations.update_one({"_id": ObjectId(cid)}, {"$set": {"status": "processing"}})
    stale = {"crescita": {"peso_kg": 16.1}}  # client-side note during processing: AI text fields empty
    mdb.consultations.update_one({"_id": ObjectId(cid)}, {"$set": {"status": "ready"}})  # job finishes
    r = s.patch(f"{BASE_URL}/api/consultations/{cid}", json={"note": stale, "growth_only": True})
    d = r.json()
    assert d["note"]["crescita"]["peso_kg"] == 16.1
    print("after late autosave diagnosi=", repr(d["note"]["diagnosi"][:60]))
    assert d["note"]["diagnosi"], "AI diagnosis wiped by late autosave"
