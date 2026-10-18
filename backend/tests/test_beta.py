import os
import requests

API = os.environ.get("TEST_API_URL", "http://localhost:8001") + "/api"


def session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": "medico@mantmed.it", "password": "Auscula-Studio-2026"})
    assert r.status_code == 200
    return s


def test_feedback_validation_and_metrics():
    s = session()
    assert s.post(f"{API}/beta/feedback", json={"rating": 0, "area": "pdf"}).status_code == 422
    assert s.post(f"{API}/beta/feedback", json={"rating": 4, "area": "nope"}).status_code == 422
    before = s.get(f"{API}/beta/metrics").json()
    r = s.post(f"{API}/beta/feedback", json={"rating": 4, "area": "pdf", "text": "TEST_feedback"})
    assert r.status_code == 200
    after = s.get(f"{API}/beta/metrics").json()
    assert after["mine"]["feedback"] == before["mine"]["feedback"] + 1
    assert after["recent"][0]["text"] == "TEST_feedback"
    assert after["baseline_min"] == 12


def test_metrics_requires_auth():
    assert requests.get(f"{API}/beta/metrics").status_code == 401
