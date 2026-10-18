"""Backend tests for Onboarding Tour + Monthly cash export."""
import os
import time
import subprocess
import pytest
import requests


def _read_env(path, key):
    for line in open(path):
        if line.startswith(key + "="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    return ""


BASE = os.environ.get("REACT_APP_BACKEND_URL") or _read_env("/app/frontend/.env", "REACT_APP_BACKEND_URL")
API = BASE.rstrip("/") + "/api"
DOC = {"email": "medico@mantmed.it", "password": "Auscula-Studio-2026"}


def _totp():
    return subprocess.check_output(["python", "/app/backend/tests/totp_code.py"]).decode().strip()


@pytest.fixture(scope="module")
def doctor():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json=DOC)
    assert r.status_code == 200, r.text
    j = r.json()
    if j.get("mfa_required"):
        last = None
        for _ in range(3):
            r2 = s.post(f"{API}/auth/2fa/verify", json={"mfa_token": j["mfa_token"], "code": _totp()})
            if r2.status_code == 200:
                last = r2
                break
            time.sleep(1)
            last = r2
        assert last and last.status_code == 200, last.text
    return s


# ----- Onboarding tour -----

def test_me_has_tour_done_field(doctor):
    r = doctor.get(f"{API}/auth/me")
    assert r.status_code == 200
    body = r.json()
    assert "tour_done" in body
    assert isinstance(body["tour_done"], bool)


def test_mark_tour_complete_persists(doctor):
    r = doctor.post(f"{API}/onboarding/tour", json={"completed": True})
    assert r.status_code == 200, r.text
    assert r.json() == {"tour_done": True}
    me = doctor.get(f"{API}/auth/me").json()
    assert me["tour_done"] is True


def test_mark_tour_incomplete_resets(doctor):
    r = doctor.post(f"{API}/onboarding/tour", json={"completed": False})
    assert r.status_code == 200
    assert r.json() == {"tour_done": False}
    me = doctor.get(f"{API}/auth/me").json()
    assert me["tour_done"] is False


def test_tour_requires_auth():
    r = requests.post(f"{API}/onboarding/tour", json={"completed": True})
    assert r.status_code in (401, 403)


def test_tour_invalid_payload(doctor):
    r = doctor.post(f"{API}/onboarding/tour", json={})
    assert r.status_code == 422


# ----- Monthly cash export -----

def test_payments_export_monthly(doctor):
    # pick current month
    from datetime import date
    today = date.today()
    y, m = today.year, today.month
    import calendar
    last = calendar.monthrange(y, m)[1]
    start = f"{y:04d}-{m:02d}-01"
    end = f"{y:04d}-{m:02d}-{last:02d}"
    r = doctor.get(f"{API}/payments/export", params={"start": start, "end": end})
    assert r.status_code == 200, r.text
    ct = r.headers.get("content-type", "")
    assert "text/csv" in ct
    cd = r.headers.get("content-disposition", "")
    assert "Registro_cassa_" in cd
    assert start in cd and end in cd
    body = r.content.decode("utf-8-sig")
    # First row header
    assert body.splitlines()[0].startswith("Data;Ora;Paziente")
    # Summary block
    assert "Riepilogo" in body
    assert "Totale" in body


def test_payments_export_single_day_still_works(doctor):
    from datetime import date
    today = date.today().isoformat()
    r = doctor.get(f"{API}/payments/export", params={"start": today, "end": today})
    assert r.status_code == 200
    cd = r.headers.get("content-disposition", "")
    # Single day keeps only one date in filename
    assert today in cd
