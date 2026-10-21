"""Public doctor availability (Vetrina 'Prossime disponibilità') + consistency with portal slots."""
import os
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values

_env = dotenv_values(Path(__file__).resolve().parents[2] / "frontend" / ".env")
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _env.get("REACT_APP_BACKEND_URL") or "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL missing"
SLUG = "tiziana-foti"
AURORA = "6ad86e64c06e50ff4cd67d1e"
URL = f"{BASE_URL}/api/public/doctors/{SLUG}/availability"


@pytest.fixture(scope="module")
def default():
    r = requests.get(URL)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def parent():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": "genitore.demo@example.com", "password": "Portale-Demo-2026"})
    assert r.status_code == 200, r.text
    return s


# Shape and defaults
def test_shape(default):
    assert set(default) >= {"service", "services", "clinics", "slots"}
    assert isinstance(default["services"], list) and default["services"]
    assert default["service"] == default["services"][0]
    assert isinstance(default["clinics"], list) and default["clinics"]


def test_default_max6_sorted(default):
    s = default["slots"]
    assert 0 < len(s) <= 6
    keys = [(x["date"], x["time"]) for x in s]
    assert keys == sorted(keys)
    for x in s:
        assert set(x) == {"date", "time", "clinic", "service"}
        assert x["service"] == default["service"]
        assert x["clinic"] in default["clinics"]
    assert "_id" not in str(default)


def test_limit_param():
    r = requests.get(URL, params={"limit": 3}).json()
    assert len(r["slots"]) <= 3
    r = requests.get(URL, params={"limit": 50}).json()
    assert len(r["slots"]) <= 12
    r = requests.get(URL, params={"limit": 0})
    assert r.status_code == 200


def test_invalid_service_fallback(default):
    r = requests.get(URL, params={"service": "TEST_nonexistent"}).json()
    assert r["service"] == default["services"][0]
    assert all(x["service"] == default["services"][0] for x in r["slots"])


def test_each_service(default):
    for svc in default["services"]:
        r = requests.get(URL, params={"service": svc}).json()
        assert r["service"] == svc
        assert all(x["service"] == svc for x in r["slots"])


def test_clinic_filter(default):
    c = default["clinics"][0]
    r = requests.get(URL, params={"clinic": c}).json()
    assert all(x["clinic"] == c for x in r["slots"])
    r = requests.get(URL, params={"clinic": "TEST_nowhere"})
    assert r.status_code == 200 and r.json()["slots"] == []


def test_unknown_slug_404():
    r = requests.get(f"{BASE_URL}/api/public/doctors/TEST-no-such-doctor/availability")
    assert r.status_code == 404


def test_within_14_days(default):
    from datetime import date, timedelta
    for x in default["slots"]:
        d = date.fromisoformat(x["date"])
        assert date.today() - timedelta(days=1) <= d <= date.today() + timedelta(days=15)


# Public slots should be bookable via portal slots for the same doctor
def test_slots_consistent_with_portal(default, parent):
    doctors = parent.get(f"{BASE_URL}/api/public/doctors").json()
    foti = next(d for d in doctors if d["slug"] == SLUG)
    for x in default["slots"][:3]:
        r = parent.get(f"{BASE_URL}/api/portal/slots", params={"patient_id": AURORA, "doctor_id": foti["id"], "clinic": x["clinic"], "service": x["service"], "date": x["date"]})
        assert r.status_code == 200, r.text
        assert x["time"] in r.json()["slots"]
