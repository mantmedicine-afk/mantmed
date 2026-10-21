"""Async consultation: corrupt audio -> failed -> retry keeps job; restart resume helper."""
import os
import time

from test_async_consult import BASE_URL, s, wait_status  # noqa: F401


def test_corrupt_audio_failed_then_retry(s):  # noqa: F811
    files = {"audio": ("bad.wav", os.urandom(4000), "audio/wav")}
    r = s.post(f"{BASE_URL}/api/consultations/start", data={"patient_name": "TEST_Async Corrupt", "paper_consent": "true"}, files=files)
    assert r.status_code == 200, r.text
    cid = r.json()["id"]
    d = wait_status(s, cid, timeout=60)
    print("first", d["status"], d.get("ai_error"))
    assert d["status"] == "failed"
    assert d["ai_error"]
    # guards still 409 on failed
    assert s.get(f"{BASE_URL}/api/consultations/{cid}/pdf").status_code == 409
    r = s.post(f"{BASE_URL}/api/consultations/{cid}/retry")
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "processing"
    assert r.json()["ai_error"] == ""
    d = wait_status(s, cid, timeout=60)
    print("after retry", d["status"], d.get("ai_error"))
    assert d["status"] == "failed"  # job kept, fails again identically
    r = s.post(f"{BASE_URL}/api/consultations/{cid}/retry")
    assert r.status_code == 200  # job still present (not 410)
