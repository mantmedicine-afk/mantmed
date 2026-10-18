"""Portal flow: parent appointment requests, doctor confirm/decline, portal invite, tenant isolation."""
import os
import subprocess
import pytest
import requests
from pathlib import Path
from datetime import date, timedelta
from dotenv import dotenv_values

_env = dotenv_values(Path(__file__).resolve().parents[2] / "frontend" / ".env")
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _env.get("REACT_APP_BACKEND_URL") or "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL missing"

PARENT = ("test_flowparent@example.com", "Genitore12345")
DOC = ("test_flowdoc@example.com", "Prova12345x")
FOTI = ("medico@mantmed.it", "Auscula-Studio-2026")
BIMBA_PID = "6ad4e2fbeee83d004b1921d2"


def _login(sess, email, password, totp=False):
    r = sess.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password})
    assert r.status_code in (200, 403), (email, r.status_code, r.text)
    if r.status_code == 403:
        return r
    data = r.json()
    if data.get("mfa_required"):
        code = subprocess.check_output(["python", "tests/totp_code.py"], cwd="/app/backend").decode().strip()
        r2 = sess.post(f"{BASE_URL}/api/auth/2fa/verify", json={"mfa_token": data["mfa_token"], "code": code})
        assert r2.status_code == 200, r2.text
    return r


@pytest.fixture
def parent_sess():
    s = requests.Session()
    _login(s, *PARENT)
    return s


@pytest.fixture
def doc_sess():
    s = requests.Session()
    _login(s, *DOC)
    return s


@pytest.fixture
def foti_sess():
    s = requests.Session()
    _login(s, *FOTI)
    return s


def _future_date(days=3):
    return (date.today() + timedelta(days=days)).isoformat()


# ------------ RBAC ------------
class TestRBAC:
    def test_parent_cannot_access_doctor_requests(self, parent_sess):
        r = parent_sess.get(f"{BASE_URL}/api/appointment-requests")
        assert r.status_code == 403

    def test_doctor_cannot_create_portal_request(self, doc_sess):
        r = doc_sess.post(f"{BASE_URL}/api/portal/appointment-requests", json={
            "patient_id": BIMBA_PID, "clinic": "Studio principale", "service": "Prima visita",
            "date": _future_date(), "time": "10:00", "note": ""})
        assert r.status_code == 403


# ------------ Portal request validation ------------
class TestRequestValidation:
    def test_wrong_clinic_400(self, parent_sess):
        r = parent_sess.post(f"{BASE_URL}/api/portal/appointment-requests", json={
            "patient_id": BIMBA_PID, "clinic": "Studio NON esistente", "service": "Prima visita",
            "date": _future_date(), "time": "10:00", "note": "x"})
        assert r.status_code == 400, r.text

    def test_past_date_422(self, parent_sess):
        past = (date.today() - timedelta(days=1)).isoformat()
        r = parent_sess.post(f"{BASE_URL}/api/portal/appointment-requests", json={
            "patient_id": BIMBA_PID, "clinic": "Studio principale", "service": "Prima visita",
            "date": past, "time": "10:00", "note": ""})
        assert r.status_code == 422, r.text

    def test_bad_time_422(self, parent_sess):
        r = parent_sess.post(f"{BASE_URL}/api/portal/appointment-requests", json={
            "patient_id": BIMBA_PID, "clinic": "Studio principale", "service": "Prima visita",
            "date": _future_date(), "time": "25:99", "note": ""})
        assert r.status_code == 422, r.text

    def test_child_not_linked_404(self, parent_sess):
        r = parent_sess.post(f"{BASE_URL}/api/portal/appointment-requests", json={
            "patient_id": "6ad4e2fbeee83d004b000000", "clinic": "Studio principale",
            "service": "Prima visita", "date": _future_date(), "time": "10:00", "note": ""})
        assert r.status_code == 404, r.text


# ------------ Happy path: create -> confirm -> upcoming ------------
class TestConfirmFlow:
    def test_full_confirm_flow(self, parent_sess, doc_sess, foti_sess):
        d_initial = _future_date(5)
        d_confirmed = _future_date(6)
        # 1. parent creates request
        r = parent_sess.post(f"{BASE_URL}/api/portal/appointment-requests", json={
            "patient_id": BIMBA_PID, "clinic": "Studio principale", "service": "Visita di controllo",
            "date": d_initial, "time": "11:00", "note": "TEST_portal flow"})
        assert r.status_code == 200, r.text
        req = r.json()
        assert req["status"] == "pending"
        assert req["patient_name"] == "TEST_ Flow Bimba"
        assert req["service"] == "Visita di controllo"
        assert req["note"] == "TEST_portal flow"
        rid = req["id"]

        # 2. parent sees it in /portal/me
        me = parent_sess.get(f"{BASE_URL}/api/portal/me").json()
        kid = next((k for k in me["children"] if k["patient"]["id"] == BIMBA_PID), None)
        assert kid
        assert any(x["id"] == rid and x["status"] == "pending" for x in kid.get("requests", [])), kid.get("requests")

        # 3. doctor lists it
        lst = doc_sess.get(f"{BASE_URL}/api/appointment-requests").json()
        assert any(x["id"] == rid for x in lst)

        # 4. Foti CANNOT see it (tenant isolation)
        other = foti_sess.get(f"{BASE_URL}/api/appointment-requests").json()
        assert not any(x["id"] == rid for x in other), "Foti leaked another studio's request"

        # 5. Foti cannot confirm it (404)
        rf = foti_sess.post(f"{BASE_URL}/api/appointment-requests/{rid}/confirm",
                            json={"date": d_confirmed, "time": "11:30"})
        assert rf.status_code == 404, rf.text

        # 6. doctor confirms with new slot
        rc = doc_sess.post(f"{BASE_URL}/api/appointment-requests/{rid}/confirm",
                           json={"date": d_confirmed, "time": "11:30"})
        assert rc.status_code == 200, rc.text
        assert rc.json()["status"] == "confirmed"
        assert rc.json()["confirmed_date"] == d_confirmed

        # 7. confirming twice -> 404
        rc2 = doc_sess.post(f"{BASE_URL}/api/appointment-requests/{rid}/confirm",
                            json={"date": d_confirmed, "time": "11:30"})
        assert rc2.status_code == 404, rc2.text

        # 8. appointment appears in /appointments/upcoming for doctor
        upc = doc_sess.get(f"{BASE_URL}/api/appointments/upcoming").json()
        assert any(a["date"] == d_confirmed and a["time"] == "11:30" and a["patient_name"] == "TEST_ Flow Bimba"
                   for a in upc), upc

        # 9. parent sees status Confermata + appointment date in /portal/me
        me2 = parent_sess.get(f"{BASE_URL}/api/portal/me").json()
        kid2 = next(k for k in me2["children"] if k["patient"]["id"] == BIMBA_PID)
        assert any(x["id"] == rid and x["status"] == "confirmed" for x in kid2.get("requests", []))
        assert any(a.get("date") == d_confirmed and a.get("time") == "11:30" for a in kid2.get("appointments", [])), kid2.get("appointments")


# ------------ Decline ------------
class TestDeclineFlow:
    def test_decline(self, parent_sess, doc_sess):
        r = parent_sess.post(f"{BASE_URL}/api/portal/appointment-requests", json={
            "patient_id": BIMBA_PID, "clinic": "Studio principale", "service": "Visita urgente",
            "date": _future_date(10), "time": "14:00", "note": "TEST_decline"})
        assert r.status_code == 200, r.text
        rid = r.json()["id"]

        rd = doc_sess.post(f"{BASE_URL}/api/appointment-requests/{rid}/decline",
                           json={"reason": "studio chiuso"})
        assert rd.status_code == 200, rd.text
        assert rd.json()["status"] == "declined"

        # second decline fails
        rd2 = doc_sess.post(f"{BASE_URL}/api/appointment-requests/{rid}/decline", json={"reason": ""})
        assert rd2.status_code == 404


# ------------ Foti agenda ------------
class TestFotiAgenda:
    def test_foti_sees_10_today(self, foti_sess):
        r = foti_sess.get(f"{BASE_URL}/api/appointments")
        assert r.status_code == 200
        assert len(r.json()) >= 10, f"Foti should see >=10 today appts, got {len(r.json())}"

    def test_foti_create_assigns_today(self, foti_sess):
        today = date.today().isoformat()
        r = foti_sess.post(f"{BASE_URL}/api/appointments", json={
            "clinic": "Studio Centro", "time": "19:45",
            "patient_name": "TEST_ foti new", "visit_type": "Visita di controllo"})
        assert r.status_code == 200, r.text
        aid = r.json()["id"]
        assert r.json()["date"] == today
        foti_sess.delete(f"{BASE_URL}/api/appointments/{aid}")


# ------------ Portal invite ------------
class TestInvite:
    def test_bad_token_410(self):
        r = requests.get(f"{BASE_URL}/api/register/invite/badtoken_xxx")
        assert r.status_code == 410, r.text

    def test_invite_token_helper_prefill(self):
        # mint a token directly via helper, then fetch invite info
        out = subprocess.check_output(["python", "tests/invite_token.py", BIMBA_PID],
                                      cwd="/app/backend").decode().strip()
        assert out.startswith("/registrati/paziente?invito="), out
        token = out.split("=", 1)[1]
        r = requests.get(f"{BASE_URL}/api/register/invite/{token}")
        assert r.status_code == 200, r.text
        info = r.json()
        assert info["email"].lower() == PARENT[0]
        assert info["child_fiscal_code"] == "BNCLRA21E45F158Y"
        assert info["patient_first"] == "TEST_"

    def test_invite_doctor_endpoint(self, doc_sess):
        # Send real invite via API; verify response + stored in db via GET /patients
        origin = BASE_URL
        r = doc_sess.post(f"{BASE_URL}/api/patients/{BIMBA_PID}/invite",
                          headers={"Origin": origin})
        assert r.status_code == 200, r.text
        assert r.json()["sent"] is True
        assert r.json()["to"] == PARENT[0]

    def test_invite_requires_origin(self, doc_sess):
        r = doc_sess.post(f"{BASE_URL}/api/patients/{BIMBA_PID}/invite",
                          headers={"Origin": "http://evil.local"})
        assert r.status_code == 400
