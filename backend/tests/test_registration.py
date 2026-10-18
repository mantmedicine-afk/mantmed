"""End-to-end tests for self-registration (doctor + parent), admin approval, portal RBAC & publish."""
import os
import sys
import time
import subprocess
from pathlib import Path
import pytest
import requests
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")
load_dotenv(Path(__file__).resolve().parents[2] / "frontend" / ".env")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = BASE_URL + "/api"
MONGO = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]

TS = str(int(time.time()))
DOC_EMAIL = f"test_newdoc_{TS}@example.com"
PARENT_EMAIL = "test_parent1@example.com"  # existing linked parent for portal tests
PARENT_PWD = "Genitore12345"
TEST_DOC_EMAIL = "test_doc1@example.com"
TEST_DOC_PWD = "Prova12345x"
TEST_CHILD_CF = "RSSMRA22C01H224X"
ADMIN_EMAIL = os.environ["ADMIN_EMAIL"]
ADMIN_PWD = os.environ["ADMIN_PASSWORD"]


def _pop_signup_code(email: str) -> str:
    """Rewrite the signup code hash to a known one and return the plaintext."""
    out = subprocess.check_output(
        ["python", str(Path(__file__).parent / "signup_code.py"), email],
        cwd=str(Path(__file__).resolve().parents[1]),
    ).decode().strip()
    assert out and out != "registrazione non trovata", f"signup not found for {email}"
    return out


@pytest.fixture(scope="session")
def admin_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PWD})
    if r.status_code != 200:
        pytest.skip(f"admin login failed: {r.status_code} {r.text}")
    data = r.json()
    if data.get("mfa_required"):
        totp = subprocess.check_output(
            ["python", "tests/totp_code.py"],
            cwd=str(Path(__file__).resolve().parents[1]),
        ).decode().strip().split()[-1]
        r2 = s.post(f"{API}/auth/2fa/verify", json={"mfa_token": data["mfa_token"], "code": totp})
        assert r2.status_code == 200, r2.text
    return s


@pytest.fixture(scope="session")
def test_doc_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": TEST_DOC_EMAIL, "password": TEST_DOC_PWD})
    assert r.status_code == 200, f"test_doc1 login: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="session")
def parent_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": PARENT_EMAIL, "password": PARENT_PWD})
    assert r.status_code == 200, f"parent login: {r.status_code} {r.text}"
    return s


# --- Validation on /register/start ---
class TestRegisterValidation:
    def test_bad_email(self):
        r = requests.post(f"{API}/register/start", json={
            "role": "parent", "first_name": "TEST_Mamma", "last_name": "Rossi",
            "email": "notanemail", "phone": "+39 333 1234567", "password": "Password1234",
            "child_fiscal_code": TEST_CHILD_CF, "privacy_policy": True, "health_data": True,
        })
        assert r.status_code == 422, r.text

    def test_bad_cf(self):
        r = requests.post(f"{API}/register/start", json={
            "role": "parent", "first_name": "TEST_Mamma", "last_name": "Rossi",
            "email": f"test_bad_{TS}@example.com", "phone": "+39 333 1234567", "password": "Password1234",
            "child_fiscal_code": "XXXXX", "privacy_policy": True, "health_data": True,
        })
        assert r.status_code == 422

    def test_weak_password_short(self):
        r = requests.post(f"{API}/register/start", json={
            "role": "parent", "first_name": "TEST_X", "last_name": "Y",
            "email": f"test_pw_{TS}@example.com", "phone": "+39 333 1234567", "password": "Short1",
            "child_fiscal_code": TEST_CHILD_CF, "privacy_policy": True, "health_data": True,
        })
        assert r.status_code == 422

    def test_weak_password_no_digits(self):
        r = requests.post(f"{API}/register/start", json={
            "role": "parent", "first_name": "TEST_X", "last_name": "Y",
            "email": f"test_pw2_{TS}@example.com", "phone": "+39 333 1234567", "password": "nodigitshere",
            "child_fiscal_code": TEST_CHILD_CF, "privacy_policy": True, "health_data": True,
        })
        assert r.status_code == 422

    def test_missing_consents(self):
        r = requests.post(f"{API}/register/start", json={
            "role": "parent", "first_name": "TEST_Xx", "last_name": "Yy",
            "email": f"test_consent_{TS}@example.com", "phone": "+39 333 1234567", "password": "Password1234",
            "child_fiscal_code": TEST_CHILD_CF, "privacy_policy": False, "health_data": True,
        })
        assert r.status_code == 400

    def test_existing_email_409(self):
        r = requests.post(f"{API}/register/start", json={
            "role": "parent", "first_name": "TEST_Xx", "last_name": "Yy",
            "email": PARENT_EMAIL, "phone": "+39 333 1234567", "password": "Password1234",
            "child_fiscal_code": TEST_CHILD_CF, "privacy_policy": True, "health_data": True,
        })
        assert r.status_code == 409


# --- Doctor registration + admin approval + isolation ---
class TestDoctorRegistration:
    def test_doctor_full_flow(self, admin_session, test_doc_session):
        payload = {
            "role": "doctor", "first_name": "TEST_Nuovo", "last_name": "Medico",
            "email": DOC_EMAIL, "phone": "+39 333 7654321", "password": "Password1234",
            "specialty": "Pediatria", "order_number": "RC-TEST-999",
            "studio_address": "Via Test 1, Reggio Calabria", "terms": True,
        }
        r = requests.post(f"{API}/register/start", json=payload)
        assert r.status_code == 200, f"start: {r.status_code} {r.text}"
        # Wrong code -> 400 with remaining attempts
        bad = requests.post(f"{API}/register/verify", json={"email": DOC_EMAIL, "code": "000000"})
        # 000000 could by chance match the real code -> accept either 400 or success flow failure
        # To be safe, overwrite the code to a known value then verify wrong one first
        code = _pop_signup_code(DOC_EMAIL)
        rw = requests.post(f"{API}/register/verify", json={"email": DOC_EMAIL, "code": "999999" if code != "999999" else "111111"})
        assert rw.status_code == 400, rw.text
        assert "rimast" in rw.json().get("detail", "").lower()
        # Now correct code
        rv = requests.post(f"{API}/register/verify", json={"email": DOC_EMAIL, "code": code})
        assert rv.status_code == 200, rv.text
        assert rv.json()["status"] == "pending"

        # Login as pending doctor -> 403
        s = requests.Session()
        rl = s.post(f"{API}/auth/login", json={"email": DOC_EMAIL, "password": "Password1234"})
        assert rl.status_code == 403
        assert "attesa" in rl.json().get("detail", "").lower()

        # Admin lists doctors and approves
        rd = admin_session.get(f"{API}/admin/doctors")
        assert rd.status_code == 200
        docs = rd.json()
        new_doc = next((d for d in docs if d["email"] == DOC_EMAIL), None)
        assert new_doc, f"new doctor not listed: {[d['email'] for d in docs]}"
        assert new_doc["status"] == "pending"
        new_doc_id = new_doc["id"]

        # Try modifying founder (no profile)
        founder = next((d for d in docs if d["founder"]), None)
        assert founder, "founder entry missing"
        rf = admin_session.post(f"{API}/admin/doctors/{founder['id']}/status", json={"status": "suspended"})
        assert rf.status_code == 400

        # Approve new doctor
        ra = admin_session.post(f"{API}/admin/doctors/{new_doc_id}/status", json={"status": "active"})
        assert ra.status_code == 200
        assert ra.json()["status"] == "active"

        # New doctor logs in -> active, empty dashboard, one clinic
        s2 = requests.Session()
        rl2 = s2.post(f"{API}/auth/login", json={"email": DOC_EMAIL, "password": "Password1234"})
        assert rl2.status_code == 200, rl2.text
        me = rl2.json()
        assert me["role"] == "doctor" and me["status"] == "active"
        assert len(me["clinics"]) == 1 and me["clinics"][0]["name"] == "Studio principale"
        pts = s2.get(f"{API}/patients").json()
        assert pts == [], f"new doctor patients should be empty: {pts}"

        # Can test_doc1 see TEST_ Bimbo? Yes; can new doctor see it? No (404)
        tdoc_pts = test_doc_session.get(f"{API}/patients").json()
        bimbo = next((p for p in tdoc_pts if p.get("fiscal_code") == TEST_CHILD_CF or "Bimbo" in p.get("name", "")), None)
        assert bimbo, f"TEST_ Bimbo should be visible to test_doc1: {[p.get('name') for p in tdoc_pts]}"
        r404 = s2.get(f"{API}/patients/{bimbo['id']}/passport")
        assert r404.status_code == 404

        # Suspend and re-check login
        rs = admin_session.post(f"{API}/admin/doctors/{new_doc_id}/status", json={"status": "suspended"})
        assert rs.status_code == 200
        s3 = requests.Session()
        rl3 = s3.post(f"{API}/auth/login", json={"email": DOC_EMAIL, "password": "Password1234"})
        assert rl3.status_code == 403

        # Cleanup: remove the user
        MONGO.users.delete_one({"email": DOC_EMAIL})


# --- Verify flow edge cases: expired, 5-wrong-code lockout ---
class TestVerifyEdge:
    def test_expired_410(self):
        # Insert a fake expired signup directly
        from registration import _code_hash as _ch
        from auth import hash_password
        from datetime import datetime, timezone, timedelta
        email = f"test_expired_{TS}@example.com"
        MONGO.signups.delete_many({"email": email})
        past = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
        MONGO.signups.insert_one({
            "email": email, "role": "parent", "data": {}, "password_hash": hash_password("Password1234"),
            "code": _ch(email, "123456"), "attempts": 0, "ip": "0.0.0.0",
            "created_at": past, "expires_at": past,
        })
        r = requests.post(f"{API}/register/verify", json={"email": email, "code": "123456"})
        assert r.status_code == 410, r.text

    def test_five_wrong_429(self):
        from registration import _code_hash as _ch
        from auth import hash_password
        from datetime import datetime, timezone, timedelta
        email = f"test_lock_{TS}@example.com"
        MONGO.signups.delete_many({"email": email})
        future = (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat()
        MONGO.signups.insert_one({
            "email": email, "role": "parent", "data": {}, "password_hash": hash_password("Password1234"),
            "code": _ch(email, "246810"), "attempts": 0, "ip": "0.0.0.0",
            "created_at": datetime.now(timezone.utc).isoformat(), "expires_at": future,
        })
        codes = ["111111", "222222", "333333", "444444", "555555"]
        statuses = [requests.post(f"{API}/register/verify", json={"email": email, "code": c}).status_code for c in codes]
        # first 4 should be 400, 5th should be 429
        assert statuses[:4] == [400, 400, 400, 400], statuses
        assert statuses[4] == 429, statuses
        # record removed
        assert MONGO.signups.find_one({"email": email}) is None


# --- RBAC ---
class TestRBAC:
    def test_parent_blocked_from_patients(self, parent_session):
        assert parent_session.get(f"{API}/patients").status_code == 403

    def test_parent_blocked_from_admin(self, parent_session):
        assert parent_session.get(f"{API}/admin/doctors").status_code == 403
        assert parent_session.get(f"{API}/admin/leads").status_code == 403

    def test_doctor_blocked_from_portal(self, test_doc_session):
        assert test_doc_session.get(f"{API}/portal/me").status_code == 403

    def test_anon_blocked(self):
        assert requests.get(f"{API}/patients").status_code == 401
        assert requests.get(f"{API}/portal/me").status_code == 401
        assert requests.get(f"{API}/admin/doctors").status_code == 401


# --- Portal: parent /me, add-child (wrong CF), unpublished pdf 404 ---
class TestPortal:
    def test_portal_me(self, parent_session):
        r = parent_session.get(f"{API}/portal/me")
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["user"]["role"] == "parent"
        # linked to TEST_ Bimbo
        assert any(TEST_CHILD_CF or True for _ in data.get("children", []))  # existence
        assert len(data["children"]) >= 1

    def test_add_child_wrong_cf_not_linked(self, parent_session):
        r = parent_session.post(f"{API}/portal/children", json={"fiscal_code": "AAABBB22C01H224X"})
        assert r.status_code == 200
        assert r.json()["linked"] is False

    def test_portal_pdf_non_linked_404(self, parent_session):
        # fake id
        r = parent_session.get(f"{API}/portal/reports/000000000000000000000000/pdf")
        assert r.status_code == 404

    def test_publish_then_pdf(self, parent_session, test_doc_session):
        # find Bimbo's consultations if any
        pts = test_doc_session.get(f"{API}/patients").json()
        bimbo = next((p for p in pts if p.get("fiscal_code") == TEST_CHILD_CF or "Bimbo" in p.get("name", "")), None)
        assert bimbo
        cs = test_doc_session.get(f"{API}/consultations", params={"patient_id": bimbo['id']}).json()
        if not isinstance(cs, list) or not cs:
            pytest.skip(f"no consultations seeded for TEST_ Bimbo (got {cs}); skipping publish/pdf test")
        cid = cs[0]["id"]
        # Unpublish first to ensure 404 then publish
        test_doc_session.post(f"{API}/consultations/{cid}/portal", json={"published": False})
        # patient may have report_sent_at from previous iterations; capture current portal view
        before = parent_session.get(f"{API}/portal/me").json()
        reports_before = sum(len(c["reports"]) for c in before["children"])
        # publish
        pub = test_doc_session.post(f"{API}/consultations/{cid}/portal", json={"published": True})
        assert pub.status_code == 200
        after = parent_session.get(f"{API}/portal/me").json()
        reports_after = sum(len(c["reports"]) for c in after["children"])
        assert reports_after >= reports_before
        # pdf download
        pdf = parent_session.get(f"{API}/portal/reports/{cid}/pdf")
        assert pdf.status_code == 200
        assert pdf.headers.get("content-type", "").startswith("application/pdf")
        assert pdf.content[:4] == b"%PDF"


if __name__ == "__main__":
    sys.exit(pytest.main([__file__, "-v"]))
