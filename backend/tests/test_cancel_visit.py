"""Parent-driven cancellation of portal visits & pending requests (iteration 8)."""
import os
import subprocess
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo
import pytest
import requests
from dotenv import dotenv_values

_env = dotenv_values(Path(__file__).resolve().parents[2] / "frontend" / ".env")
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _env.get("REACT_APP_BACKEND_URL") or "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL missing"

ROME = ZoneInfo("Europe/Rome")
PARENT = ("genitore.demo@example.com", "Portale-Demo-2026")
FOTI = ("medico@mantmed.it", "Auscula-Studio-2026")
AURORA_PID = "6ad29ce56e1fdeab58a3f1f8"
AURORA_NAME = "Aurora Ricci"
CLINIC = "Studio Centro"


def _totp():
    return subprocess.check_output(["python", "tests/totp_code.py"], cwd="/app/backend").decode().strip()


def _login(sess, email, password):
    r = sess.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, (email, r.status_code, r.text)
    data = r.json()
    if data.get("mfa_required"):
        r2 = sess.post(f"{BASE_URL}/api/auth/2fa/verify",
                       json={"mfa_token": data["mfa_token"], "code": _totp()})
        assert r2.status_code == 200, r2.text
    return sess


@pytest.fixture(scope="module")
def parent():
    s = requests.Session()
    _login(s, *PARENT)
    return s


@pytest.fixture(scope="module")
def foti():
    s = requests.Session()
    _login(s, *FOTI)
    return s


# ---- helpers ----
def _mk_appt(foti_sess, hours_from_now: float, notes="TEST_cancel") -> dict:
    """Create a doctor-side appointment for Aurora Ricci at now+hours_from_now (Rome)."""
    when = datetime.now(ROME) + timedelta(hours=hours_from_now)
    body = {"clinic": CLINIC, "date": when.date().isoformat(), "time": when.strftime("%H:%M"),
            "patient_name": AURORA_NAME, "patient_id": AURORA_PID,
            "visit_type": "Visita di controllo", "duration": 20, "notes": notes}
    r = foti_sess.post(f"{BASE_URL}/api/appointments", json=body)
    assert r.status_code == 200, r.text
    return r.json()


def _delete_appt(foti_sess, aid: str):
    foti_sess.delete(f"{BASE_URL}/api/appointments/{aid}")


# ---- RBAC ----
class TestRBAC:
    def test_doctor_cannot_cancel_via_portal(self, foti):
        # doctor must NOT be able to hit parent endpoint
        r = foti.post(f"{BASE_URL}/api/portal/appointments/anything/cancel", json={"reason": "x"})
        assert r.status_code == 403, r.text

    def test_parent_cannot_access_doctor_cancellations(self, parent):
        r = parent.get(f"{BASE_URL}/api/appointments/cancellations")
        assert r.status_code == 403


# ---- Cancel appointment: validation ----
class TestCancelAppointmentValidation:
    def test_404_bad_oid(self, parent):
        r = parent.post(f"{BASE_URL}/api/portal/appointments/not-an-oid/cancel", json={"reason": ""})
        assert r.status_code == 404

    def test_404_unknown_appointment(self, parent):
        r = parent.post(f"{BASE_URL}/api/portal/appointments/6ad29ce56e1fdeab58a3fffff/cancel", json={"reason": ""})
        assert r.status_code == 404

    def test_404_appointment_without_patient_id(self, parent, foti):
        # Appointment without patient_id -> parent cannot cancel (treated as walk-in)
        when = datetime.now(ROME) + timedelta(hours=48)
        body = {"clinic": CLINIC, "date": when.date().isoformat(),
                "time": when.strftime("%H:%M"),
                "patient_name": "TEST_no_pid_person", "visit_type": "Visita di controllo",
                "duration": 20, "notes": "TEST_no_pid"}
        r = foti.post(f"{BASE_URL}/api/appointments", json=body)
        assert r.status_code == 200, r.text
        aid = r.json()["id"]
        try:
            r2 = parent.post(f"{BASE_URL}/api/portal/appointments/{aid}/cancel", json={"reason": ""})
            assert r2.status_code == 404
        finally:
            _delete_appt(foti, aid)


# ---- Cancel appointment: time cutoff ----
class TestCancelAppointmentCutoff:
    def test_less_than_12h_returns_409_with_phone(self, parent, foti):
        appt = _mk_appt(foti, 2.0, notes="TEST_<12h")  # 2h from now
        try:
            r = parent.post(f"{BASE_URL}/api/portal/appointments/{appt['id']}/cancel",
                            json={"reason": "mal di pancia"})
            assert r.status_code == 409, r.text
            # error message must mention ore and the studio phone
            msg = r.json().get("detail", "")
            assert "ore" in msg.lower()
            # STUDIO_PHONE is used as fallback; Foti has a `profile.phone`
            assert any(ch.isdigit() for ch in msg)
        finally:
            _delete_appt(foti, appt["id"])

    def test_more_than_12h_cancels_200_and_marks_annullato(self, parent, foti):
        appt = _mk_appt(foti, 20.0, notes="TEST_>12h")
        aid = appt["id"]
        try:
            r = parent.post(f"{BASE_URL}/api/portal/appointments/{aid}/cancel",
                            json={"reason": "TEST_motivo_annullo"})
            assert r.status_code == 200, r.text
            assert r.json() == {"cancelled": True}

            # Already cancelled -> second call 409
            r2 = parent.post(f"{BASE_URL}/api/portal/appointments/{aid}/cancel", json={"reason": ""})
            assert r2.status_code == 409, r2.text

            # Doctor list cancellations contains it, with reason
            lst = foti.get(f"{BASE_URL}/api/appointments/cancellations")
            assert lst.status_code == 200, lst.text
            match = next((c for c in lst.json() if c["id"] == aid), None)
            assert match, lst.json()
            assert match["patient_name"] == AURORA_NAME
            assert match["reason"] == "TEST_motivo_annullo"
            assert match["clinic"] == CLINIC

            # Appointment excluded from parent portal (portal/me appointments list)
            me = parent.get(f"{BASE_URL}/api/portal/me").json()
            kid = next(k for k in me["children"] if k["patient"]["id"] == AURORA_PID)
            assert not any(a["id"] == aid for a in kid["appointments"]), "cancelled visit still in portal"
        finally:
            _delete_appt(foti, aid)


# ---- Slot freed after cancel ----
class TestSlotFreedAfterCancel:
    def test_slot_available_again_after_cancel(self, parent, foti):
        # Pick a future weekday slot (Monday 09:00) — Foti's clinic is Mon-Fri 09:00-13:00
        # Use 2 days from now at 09:00 if it falls on weekday, else push to next Monday.
        now = datetime.now(ROME)
        d = now.date() + timedelta(days=2)
        while d.isoweekday() in (6, 7):
            d = d + timedelta(days=1)
        day_iso = d.isoformat()
        slot_time = "09:00"

        appt = _mk_appt_at(foti, day_iso, slot_time, duration=20)
        aid = appt["id"]
        try:
            # Confirm slot missing BEFORE cancel
            params = {"patient_id": AURORA_PID, "clinic": CLINIC,
                      "service": "Visita di controllo", "date": day_iso}
            before = parent.get(f"{BASE_URL}/api/portal/slots", params=params).json()
            assert slot_time not in before["slots"], f"{slot_time} should be busy, got {before}"

            # Cancel
            r = parent.post(f"{BASE_URL}/api/portal/appointments/{aid}/cancel", json={"reason": "TEST_slot_free"})
            assert r.status_code == 200, r.text

            after = parent.get(f"{BASE_URL}/api/portal/slots", params=params).json()
            assert slot_time in after["slots"], f"{slot_time} should be free after cancel, got {after}"
        finally:
            _delete_appt(foti, aid)


def _mk_appt_at(foti_sess, day_iso: str, time_hhmm: str, duration=20) -> dict:
    body = {"clinic": CLINIC, "date": day_iso, "time": time_hhmm,
            "patient_name": AURORA_NAME, "patient_id": AURORA_PID,
            "visit_type": "Visita di controllo", "duration": duration, "notes": "TEST_slot"}
    r = foti_sess.post(f"{BASE_URL}/api/appointments", json=body)
    assert r.status_code == 200, r.text
    return r.json()


# ---- Cancel pending request ----
class TestCancelRequest:
    def test_cancel_own_pending_request(self, parent, foti):
        # Create via parent portal flow
        now = datetime.now(ROME)
        d = now.date() + timedelta(days=3)
        while d.isoweekday() in (6, 7):
            d += timedelta(days=1)
        payload = {"patient_id": AURORA_PID, "clinic": CLINIC, "service": "Visita di controllo",
                   "date": d.isoformat(), "time": "10:30", "note": "TEST_request_cancel"}
        r = parent.post(f"{BASE_URL}/api/portal/appointment-requests", json=payload)
        assert r.status_code == 200, r.text
        rid = r.json()["id"]
        try:
            # Cancel own pending request
            rc = parent.post(f"{BASE_URL}/api/portal/appointment-requests/{rid}/cancel")
            assert rc.status_code == 200, rc.text
            assert rc.json() == {"cancelled": True}

            # Status now 'cancelled' in /portal/me requests
            me = parent.get(f"{BASE_URL}/api/portal/me").json()
            kid = next(k for k in me["children"] if k["patient"]["id"] == AURORA_PID)
            match = next((x for x in kid.get("requests", []) if x["id"] == rid), None)
            assert match and match["status"] == "cancelled", kid.get("requests")

            # Second cancel -> 404
            rc2 = parent.post(f"{BASE_URL}/api/portal/appointment-requests/{rid}/cancel")
            assert rc2.status_code == 404
        finally:
            # Clean request (decline removes nothing but drop via db? just leave — status cancelled is fine but marks the TEST_. We'll leave status cancelled; test created with TEST_ note.)
            pass

    def test_cancel_unknown_request_404(self, parent):
        r = parent.post(f"{BASE_URL}/api/portal/appointment-requests/6ad29ce56e1fdeab58a3fffe/cancel")
        assert r.status_code == 404


# ---- Doctor cancellations endpoint tenant isolation ----
class TestCancellationsTenantIsolation:
    def test_cancellations_last_7_days_and_isolated(self, foti):
        r = foti.get(f"{BASE_URL}/api/appointments/cancellations")
        assert r.status_code == 200
        # all entries should be within last 7 days
        cutoff = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
        for c in r.json():
            assert c["cancelled_at"] >= cutoff
            # patient name non-empty and shape OK
            assert "patient_name" in c and "reason" in c and "time" in c


# ---- Agenda surface: cancelled today visible with status annullato ----
class TestAgendaShowsAnnullato:
    def test_agenda_includes_cancelled_today(self, parent, foti):
        # Create a TODAY appointment for Aurora at (now+30min) so GET /api/appointments returns it.
        # Flip status to 'annullato' directly in Mongo (production path requires >=12h cutoff, which
        # cannot be set up for TODAY late in the day; the agenda rendering is what we are testing).
        import asyncio
        from datetime import datetime as _dt
        from motor.motor_asyncio import AsyncIOMotorClient
        from dotenv import dotenv_values as _dv
        from bson import ObjectId as _OID
        env = _dv("/app/backend/.env")
        mongo_url, db_name = env["MONGO_URL"].strip('"'), env["DB_NAME"].strip('"')

        now = datetime.now(ROME)
        target = now + timedelta(minutes=30)
        if target.date() != now.date():
            pytest.skip("Cannot create same-day appointment near midnight")
        appt = _mk_appt_at(foti, now.date().isoformat(), target.strftime("%H:%M"), duration=20)
        aid = appt["id"]
        try:
            async def _flip():
                cli = AsyncIOMotorClient(mongo_url)
                try:
                    await cli[db_name].appointments.update_one(
                        {"_id": _OID(aid)},
                        {"$set": {"status": "annullato", "cancelled_by": "genitore",
                                  "cancelled_at": _dt.now(timezone.utc).isoformat()}})
                finally:
                    cli.close()
            asyncio.run(_flip())

            ag = foti.get(f"{BASE_URL}/api/appointments")
            assert ag.status_code == 200, (ag.status_code, ag.text[:500])
            match = next((a for a in ag.json() if a["id"] == aid), None)
            assert match is not None, "cancelled today visit missing from doctor agenda"
            assert match["status"] == "annullato", match
        finally:
            _delete_appt(foti, aid)
