"""Backend regression tests for Beta Feedback & Metrics (Task 4.1).

Uses the external REACT_APP_BACKEND_URL and the real 2FA flow of the seeded doctor.
"""
import os
import subprocess
import sys
from pathlib import Path

import pytest
import requests

BASE = (os.environ.get("REACT_APP_BACKEND_URL") or "https://med-tablet-agenda.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"

EMAIL = "medico@mantmed.it"
PASSWORD = "Auscula-Studio-2026"


def _totp():
    out = subprocess.check_output([sys.executable, str(Path(__file__).parent / "totp_code.py")], text=True).strip()
    return out


@pytest.fixture(scope="module")
def auth_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    if "mfa_required" in data and data["mfa_required"]:
        code = _totp()
        if code == "2FA disattivata":
            pytest.skip("2FA not enabled")
        r2 = s.post(f"{API}/auth/2fa/verify", json={"mfa_token": data["mfa_token"], "code": code}, timeout=20)
        assert r2.status_code == 200, r2.text
    # ping to confirm auth
    assert s.get(f"{API}/auth/me", timeout=10).status_code == 200
    return s


def test_metrics_requires_auth():
    r = requests.get(f"{API}/beta/metrics", timeout=10)
    assert r.status_code == 401


def test_feedback_requires_auth():
    r = requests.post(f"{API}/beta/feedback", json={"rating": 4, "area": "pdf"}, timeout=10)
    assert r.status_code == 401


def test_feedback_validation_rating(auth_session):
    for bad in [0, 6, -1, "x"]:
        r = auth_session.post(f"{API}/beta/feedback", json={"rating": bad, "area": "pdf"})
        assert r.status_code == 422, f"rating={bad} -> {r.status_code}"


def test_feedback_validation_area(auth_session):
    r = auth_session.post(f"{API}/beta/feedback", json={"rating": 4, "area": "nope"})
    assert r.status_code == 422


def test_metrics_shape(auth_session):
    r = auth_session.get(f"{API}/beta/metrics")
    assert r.status_code == 200
    data = r.json()
    assert data["baseline_min"] == 12
    for k in ("mine", "all", "daily", "by_area", "recent"):
        assert k in data
    assert len(data["daily"]) == 14
    assert len(data["by_area"]) == 5
    areas = {a["area"] for a in data["by_area"]}
    assert areas == {"trascrizione", "pdf", "agenda", "cassa", "altro"}
    assert len(data["recent"]) <= 8
    for b in ("reports", "feedback", "avg_rating", "avg_saved_min", "pdf_exports"):
        assert b in data["mine"]
        assert b in data["all"]


def test_feedback_submit_and_metrics_update(auth_session):
    before = auth_session.get(f"{API}/beta/metrics").json()
    text = "TEST_feedback_full_e2e"
    r = auth_session.post(f"{API}/beta/feedback", json={"rating": 5, "area": "trascrizione", "text": text})
    assert r.status_code == 200
    body = r.json()
    assert body["rating"] == 5 and body["area"] == "trascrizione"
    after = auth_session.get(f"{API}/beta/metrics").json()
    assert after["mine"]["feedback"] == before["mine"]["feedback"] + 1
    assert after["all"]["feedback"] == before["all"]["feedback"] + 1
    assert after["recent"][0]["text"] == text
    assert after["recent"][0]["area"] == "trascrizione"
    assert after["recent"][0]["mine"] is True
    # area count incremented
    before_cnt = next(a["count"] for a in before["by_area"] if a["area"] == "trascrizione")
    after_cnt = next(a["count"] for a in after["by_area"] if a["area"] == "trascrizione")
    assert after_cnt == before_cnt + 1


def test_all_includes_legacy_reports(auth_session):
    data = auth_session.get(f"{API}/beta/metrics").json()
    # legacy seeded consultations: 11 expected per spec; assert all.reports >= mine.reports
    assert data["all"]["reports"] >= data["mine"]["reports"]
