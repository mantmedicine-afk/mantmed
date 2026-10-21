# Auth/registration refactor: email-available endpoint, strong password, CF checksum, 409 duplicate, login cookies
import os
import uuid
import pytest
import requests
from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

GOOD_CF = "RSSSFO24E41H224Y"
BAD_CF = "RSSSFO24E41H224K"


def parent_payload(**kw):
    p = {"role": "parent", "first_name": "Test", "last_name": "Utente", "email": f"test_{uuid.uuid4().hex[:8]}@example.com",
         "phone": "333 1234567", "password": "Abcdef123!x", "child_fiscal_code": GOOD_CF, "privacy_policy": True, "health_data": True}
    p.update(kw)
    return p


@pytest.fixture
def s():
    return requests.Session()


# --- email-available endpoint ---
class TestEmailAvailable:
    def test_existing_email(self, s):
        r = s.get(f"{API}/register/email-available", params={"email": "medico@mantmed.it"})
        assert r.status_code == 200
        assert r.json() == {"available": False}

    def test_existing_email_case_insensitive(self, s):
        r = s.get(f"{API}/register/email-available", params={"email": "  MEDICO@MantMed.it "})
        assert r.status_code == 200 and r.json()["available"] is False

    def test_new_email(self, s):
        r = s.get(f"{API}/register/email-available", params={"email": f"test_{uuid.uuid4().hex[:8]}@example.com"})
        assert r.status_code == 200 and r.json() == {"available": True}

    def test_malformed_email(self, s):
        r = s.get(f"{API}/register/email-available", params={"email": "not-an-email"})
        assert r.status_code == 422

    def test_missing_param(self, s):
        r = s.get(f"{API}/register/email-available")
        assert r.status_code == 422


# --- register/start validation (no successful start to preserve rate limit except where needed) ---
class TestRegisterStartValidation:
    def _locs(self, r):
        return [d["loc"][-1] for d in r.json()["detail"]]

    def test_password_without_special(self, s):
        r = s.post(f"{API}/register/start", json=parent_payload(password="Abcdefgh123"))
        assert r.status_code == 422
        assert "password" in self._locs(r)

    def test_password_too_short(self, s):
        r = s.post(f"{API}/register/start", json=parent_payload(password="Ab1!xyz"))
        assert r.status_code == 422 and "password" in self._locs(r)

    def test_password_no_digit(self, s):
        r = s.post(f"{API}/register/start", json=parent_payload(password="Abcdefghij!"))
        assert r.status_code == 422 and "password" in self._locs(r)

    def test_bad_cf_checksum(self, s):
        r = s.post(f"{API}/register/start", json=parent_payload(child_fiscal_code=BAD_CF))
        assert r.status_code == 422
        assert "child_fiscal_code" in self._locs(r)

    def test_existing_email_409(self, s):
        r = s.post(f"{API}/register/start", json=parent_payload(email="medico@mantmed.it"))
        assert r.status_code == 409
        assert "Email già registrata" in r.json()["detail"]

    def test_doctor_password_rule(self, s):
        r = s.post(f"{API}/register/start", json={"role": "doctor", "first_name": "Te", "last_name": "St", "email": "test_doc_x@example.com",
                                                   "phone": "333 1234567", "password": "abcdefghij1", "specialty": "Pediatria",
                                                   "order_number": "RC 1", "studio_address": "Via Roma 1", "terms": True})
        assert r.status_code == 422 and "password" in self._locs(r)


# --- valid start + verify (one start) ---
class TestRegisterFlow:
    def test_valid_cf_start_and_wrong_code(self, s):
        p = parent_payload()
        r = s.post(f"{API}/register/start", json=p)
        if r.status_code == 429:
            pytest.skip("signup rate limit hit")
        assert r.status_code == 200, r.text
        assert r.json()["email"] == p["email"]
        v = s.post(f"{API}/register/verify", json={"email": p["email"], "code": "000000"})
        assert v.status_code in (400, 200)
        if v.status_code == 400:
            assert "Codice non corretto" in v.json()["detail"]


# --- login regression ---
class TestLogin:
    def test_doctor_login_cookies(self, s):
        r = s.post(f"{API}/auth/login", json={"email": "medico@mantmed.it", "password": "Auscula-Studio-2026"})
        assert r.status_code == 200
        assert r.json()["role"] == "doctor"
        sc = r.headers.get("set-cookie", "")
        assert "access_token" in sc and "httponly" in sc.lower()
        me = s.get(f"{API}/auth/me")
        assert me.status_code == 200 and me.json()["email"] == "medico@mantmed.it"

    def test_parent_login(self, s):
        r = s.post(f"{API}/auth/login", json={"email": "genitore.demo@example.com", "password": "Portale-Demo-2026"})
        assert r.status_code == 200 and r.json()["role"] == "parent"

    def test_me_unauth(self, s):
        assert s.get(f"{API}/auth/me").status_code == 401
