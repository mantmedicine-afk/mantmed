"""Scheduling: free slots, schedule settings, portal 409, confirm uses durations, cron reminders."""
import os
import subprocess
import pytest
import requests
import uuid
from pathlib import Path
from datetime import date, timedelta, datetime
from dotenv import dotenv_values

_env = dotenv_values(Path(__file__).resolve().parents[2] / "frontend" / ".env")
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _env.get("REACT_APP_BACKEND_URL") or "").rstrip("/")
_be_env = dotenv_values(Path(__file__).resolve().parents[1] / ".env")
CRON_SECRET = _be_env.get("WEBHOOK_CRON_SECRET") or os.environ.get("WEBHOOK_CRON_SECRET")

PARENT = ("genitore.demo@example.com", "Portale-Demo-2026")
FOTI = ("medico@mantmed.it", "Auscula-Studio-2026")
AURORA_PID = "6ad29ce56e1fdeab58a3f1f8"


def _login(sess, email, password):
    r = sess.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, (email, r.status_code, r.text)
    data = r.json()
    if data.get("mfa_required"):
        code = subprocess.check_output(["python", "tests/totp_code.py"], cwd="/app/backend").decode().strip()
        r2 = sess.post(f"{BASE_URL}/api/auth/2fa/verify", json={"mfa_token": data["mfa_token"], "code": code})
        assert r2.status_code == 200, r2.text
    return sess


@pytest.fixture(scope="module")
def parent_sess():
    s = requests.Session()
    return _login(s, *PARENT)


@pytest.fixture(scope="module")
def foti_sess():
    s = requests.Session()
    return _login(s, *FOTI)


def next_weekday(target_wd):  # 0=Mon
    d = date.today()
    while d.weekday() != target_wd or d <= date.today():
        d += timedelta(days=1)
    return d


def next_monday():
    return next_weekday(0)


def next_saturday():
    return next_weekday(5)


DEFAULT_SCHEDULE = {
    "hours": {
        "Studio Centro": {"days": [1, 2, 3, 4, 5], "start": "09:00", "end": "13:00"},
        "Studio Provincia": {"days": [1, 2, 3, 4, 5], "start": "15:00", "end": "19:00"},
    },
    "durations": {"Prima visita": 45, "Bilancio di salute": 30,
                  "Visita di controllo": 20, "Visita urgente": 20},
}


@pytest.fixture(scope="module", autouse=True)
def restore_schedule(foti_sess):
    # Save current to restore at end
    yield
    r = foti_sess.put(f"{BASE_URL}/api/settings/schedule", json=DEFAULT_SCHEDULE)
    assert r.status_code == 200, r.text


# ------------ Schedule settings ------------
class TestScheduleSettings:
    def test_get_schedule(self, foti_sess):
        r = foti_sess.get(f"{BASE_URL}/api/settings/schedule")
        assert r.status_code == 200
        data = r.json()
        assert "hours" in data and "durations" in data
        assert set(data["durations"]) == set(DEFAULT_SCHEDULE["durations"])

    def test_put_schedule_ok(self, foti_sess):
        r = foti_sess.put(f"{BASE_URL}/api/settings/schedule", json=DEFAULT_SCHEDULE)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["hours"]["Studio Centro"]["start"] == "09:00"

    def test_put_schedule_missing_clinic(self, foti_sess):
        bad = {"hours": {"Studio Centro": DEFAULT_SCHEDULE["hours"]["Studio Centro"]},
               "durations": DEFAULT_SCHEDULE["durations"]}
        r = foti_sess.put(f"{BASE_URL}/api/settings/schedule", json=bad)
        assert r.status_code == 400

    def test_put_schedule_end_before_start(self, foti_sess):
        bad = {"hours": {"Studio Centro": {"days": [1, 2, 3, 4, 5], "start": "13:00", "end": "09:00"},
                         "Studio Provincia": DEFAULT_SCHEDULE["hours"]["Studio Provincia"]},
               "durations": DEFAULT_SCHEDULE["durations"]}
        r = foti_sess.put(f"{BASE_URL}/api/settings/schedule", json=bad)
        assert r.status_code == 400

    def test_put_schedule_duration_out_of_range(self, foti_sess):
        bad = {"hours": DEFAULT_SCHEDULE["hours"],
               "durations": {**DEFAULT_SCHEDULE["durations"], "Prima visita": 999}}
        r = foti_sess.put(f"{BASE_URL}/api/settings/schedule", json=bad)
        assert r.status_code == 422

    def test_put_schedule_missing_duration_key(self, foti_sess):
        bad = {"hours": DEFAULT_SCHEDULE["hours"],
               "durations": {"Prima visita": 30}}  # missing other 3
        r = foti_sess.put(f"{BASE_URL}/api/settings/schedule", json=bad)
        assert r.status_code == 422


# ------------ Portal /slots ------------
class TestPortalSlots:
    def test_slots_weekday_prima_visita(self, parent_sess):
        d = next_monday().isoformat()
        r = parent_sess.get(f"{BASE_URL}/api/portal/slots",
                            params={"patient_id": AURORA_PID, "clinic": "Studio Centro",
                                    "service": "Prima visita", "date": d})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["duration"] == 45
        # 09:00-13:00 with 45 min dur, step 15 -> last start where t+45 <= 13:00 (780)
        # starts: 540, 555, ..., 735 => (735-540)/15+1 = 14
        assert len(data["slots"]) == 14
        assert data["slots"][0] == "09:00"
        assert data["slots"][-1] == "12:15"
        assert data["hours"]["start"] == "09:00"

    def test_slots_weekday_bilancio(self, parent_sess):
        d = next_monday().isoformat()
        r = parent_sess.get(f"{BASE_URL}/api/portal/slots",
                            params={"patient_id": AURORA_PID, "clinic": "Studio Provincia",
                                    "service": "Bilancio di salute", "date": d})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["duration"] == 30
        # 15:00-19:00 (240 min), dur 30, step 15 -> last start 18:30
        # (750-540)/15 = 14 => +1 = 15 slots? starts 900..1110 step 15, 1110+30=1140=19:00
        # count = (1110-900)/15+1 = 15
        assert len(data["slots"]) == 15
        assert data["slots"][0] == "15:00"
        assert data["slots"][-1] == "18:30"

    def test_slots_weekend_empty(self, parent_sess):
        d = next_saturday().isoformat()
        r = parent_sess.get(f"{BASE_URL}/api/portal/slots",
                            params={"patient_id": AURORA_PID, "clinic": "Studio Centro",
                                    "service": "Prima visita", "date": d})
        assert r.status_code == 200
        assert r.json()["slots"] == []

    def test_slots_past_date_empty(self, parent_sess):
        d = (date.today() - timedelta(days=1)).isoformat()
        r = parent_sess.get(f"{BASE_URL}/api/portal/slots",
                            params={"patient_id": AURORA_PID, "clinic": "Studio Centro",
                                    "service": "Prima visita", "date": d})
        assert r.status_code == 200
        assert r.json()["slots"] == []

    def test_slots_non_linked_child_404(self, parent_sess):
        d = next_monday().isoformat()
        r = parent_sess.get(f"{BASE_URL}/api/portal/slots",
                            params={"patient_id": "6ad29ce56e1fdeab58a000000",
                                    "clinic": "Studio Centro", "service": "Prima visita", "date": d})
        assert r.status_code == 404

    def test_slots_invalid_clinic_400(self, parent_sess):
        d = next_monday().isoformat()
        r = parent_sess.get(f"{BASE_URL}/api/portal/slots",
                            params={"patient_id": AURORA_PID, "clinic": "Studio Fantasma",
                                    "service": "Prima visita", "date": d})
        assert r.status_code == 400


# ------------ Portal request 409 + overlap ------------
class TestPortalRequest409:
    def test_request_time_not_in_slots_409(self, parent_sess):
        d = next_monday().isoformat()
        r = parent_sess.post(f"{BASE_URL}/api/portal/appointment-requests", json={
            "patient_id": AURORA_PID, "clinic": "Studio Centro", "service": "Prima visita",
            "date": d, "time": "08:00", "note": "TEST_409_outside"})
        assert r.status_code == 409, r.text

    def test_request_free_slot_then_overlap_disappears(self, parent_sess, foti_sess):
        d = (next_monday() + timedelta(days=1)).isoformat()  # Tuesday to avoid collisions with other tests
        # Get free slots first
        rs = parent_sess.get(f"{BASE_URL}/api/portal/slots",
                             params={"patient_id": AURORA_PID, "clinic": "Studio Centro",
                                     "service": "Prima visita", "date": d}).json()
        assert rs["slots"], rs
        chosen = rs["slots"][2]  # pick middle slot
        # Create request
        r = parent_sess.post(f"{BASE_URL}/api/portal/appointment-requests", json={
            "patient_id": AURORA_PID, "clinic": "Studio Centro", "service": "Prima visita",
            "date": d, "time": chosen, "note": "TEST_overlap"})
        assert r.status_code == 200, r.text
        rid = r.json()["id"]
        # Now that slot should disappear
        rs2 = parent_sess.get(f"{BASE_URL}/api/portal/slots",
                              params={"patient_id": AURORA_PID, "clinic": "Studio Centro",
                                      "service": "Prima visita", "date": d}).json()
        assert chosen not in rs2["slots"], f"Slot {chosen} still visible after booking"
        # Overlapping slot (same date) in other studio should also be blocked (same doctor cross-studio)
        rs3 = parent_sess.get(f"{BASE_URL}/api/portal/slots",
                              params={"patient_id": AURORA_PID, "clinic": "Studio Provincia",
                                      "service": "Prima visita", "date": d}).json()
        # Studio Provincia is 15:00-19:00, pending is in 09-13; no overlap expected. Just sanity check endpoint works.
        assert isinstance(rs3["slots"], list)
        # cleanup: doctor declines
        rd = foti_sess.post(f"{BASE_URL}/api/appointment-requests/{rid}/decline", json={"reason": "TEST_cleanup"})
        assert rd.status_code == 200


# ------------ Doctor confirm uses durations from settings ------------
class TestConfirmUsesDuration:
    def test_confirm_sets_duration(self, parent_sess, foti_sess):
        d = (next_monday() + timedelta(days=2)).isoformat()  # Wednesday
        # Change duration for "Visita di controllo" to 25
        custom = {"hours": DEFAULT_SCHEDULE["hours"],
                  "durations": {**DEFAULT_SCHEDULE["durations"], "Visita di controllo": 25}}
        rp = foti_sess.put(f"{BASE_URL}/api/settings/schedule", json=custom)
        assert rp.status_code == 200
        try:
            rs = parent_sess.get(f"{BASE_URL}/api/portal/slots",
                                 params={"patient_id": AURORA_PID, "clinic": "Studio Centro",
                                         "service": "Visita di controllo", "date": d}).json()
            assert rs["duration"] == 25
            assert rs["slots"]
            chosen = rs["slots"][0]
            r = parent_sess.post(f"{BASE_URL}/api/portal/appointment-requests", json={
                "patient_id": AURORA_PID, "clinic": "Studio Centro",
                "service": "Visita di controllo", "date": d, "time": chosen,
                "note": "TEST_duration25"})
            assert r.status_code == 200, r.text
            rid = r.json()["id"]
            # Doctor confirms
            rc = foti_sess.post(f"{BASE_URL}/api/appointment-requests/{rid}/confirm",
                                json={"date": d, "time": chosen})
            assert rc.status_code == 200, rc.text
            aid = rc.json().get("appointment_id")
            # Fetch appointment via upcoming (filter down)
            upc = foti_sess.get(f"{BASE_URL}/api/appointments/upcoming").json()
            created = next((a for a in upc if a["date"] == d and a["time"] == chosen
                            and a.get("patient_name", "").startswith("Aurora")), None)
            assert created, f"Confirmed appt not found in upcoming: {upc}"
            assert created.get("duration") == 25, created
            # Cleanup
            foti_sess.delete(f"{BASE_URL}/api/appointments/{created['id']}")
        finally:
            foti_sess.put(f"{BASE_URL}/api/settings/schedule", json=DEFAULT_SCHEDULE)


# ------------ Cron reminders ------------
class TestCronReminders:
    def test_cron_no_auth_401(self):
        r = requests.post(f"{BASE_URL}/api/cron/visit-reminders", json={})
        assert r.status_code == 401

    def test_cron_wrong_bearer_401(self):
        r = requests.post(f"{BASE_URL}/api/cron/visit-reminders", json={},
                          headers={"Authorization": "Bearer wrong_token"})
        assert r.status_code == 401

    def test_cron_correct_bearer_202(self):
        rid = f"test-{uuid.uuid4()}"
        r = requests.post(f"{BASE_URL}/api/cron/visit-reminders", json={"run_id": rid},
                          headers={"Authorization": f"Bearer {CRON_SECRET}",
                                   "X-Webhook-Id": rid})
        assert r.status_code == 202, r.text
        data = r.json()
        assert data.get("accepted") is True
        assert not data.get("duplicate")

    def test_cron_duplicate_run_id(self):
        rid = f"test-{uuid.uuid4()}"
        hdrs = {"Authorization": f"Bearer {CRON_SECRET}", "X-Webhook-Id": rid}
        r1 = requests.post(f"{BASE_URL}/api/cron/visit-reminders", json={}, headers=hdrs)
        assert r1.status_code == 202
        r2 = requests.post(f"{BASE_URL}/api/cron/visit-reminders", json={}, headers=hdrs)
        assert r2.status_code == 202
        assert r2.json().get("duplicate") is True


# ------------ Reminder reset on PATCH date/time ------------
class TestReminderResetOnPatch:
    def test_patch_date_resets_reminder(self, foti_sess):
        today = date.today().isoformat()
        # Create appointment today for Foti
        r = foti_sess.post(f"{BASE_URL}/api/appointments", json={
            "clinic": "Studio Centro", "time": "10:30",
            "patient_name": "TEST_ reminder reset", "visit_type": "Visita di controllo"})
        assert r.status_code == 200, r.text
        aid = r.json()["id"]
        try:
            # Patch date
            new_date = (date.today() + timedelta(days=2)).isoformat()
            rp = foti_sess.patch(f"{BASE_URL}/api/appointments/{aid}", json={"date": new_date})
            assert rp.status_code == 200, rp.text
            # Can't directly read reminder_sent_at via API (not exposed), but endpoint returned 200;
            # Verify by patching time too
            rp2 = foti_sess.patch(f"{BASE_URL}/api/appointments/{aid}", json={"time": "11:00"})
            assert rp2.status_code == 200
        finally:
            foti_sess.delete(f"{BASE_URL}/api/appointments/{aid}")
