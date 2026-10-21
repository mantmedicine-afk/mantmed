# Feedback / support / report email to MantMed team (beta + portal)
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"


def _login(email, pwd):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": pwd})
    if r.status_code != 200:
        pytest.skip(f"login failed {email}: {r.status_code} {r.text[:200]}")
    tok = r.json().get("token") or r.json().get("access_token")
    if tok:
        s.headers["Authorization"] = f"Bearer {tok}"
    return s


@pytest.fixture(scope="module")
def doc():
    return _login("medico@mantmed.it", "Auscula-Studio-2026")


@pytest.fixture(scope="module")
def parent():
    return _login("genitore.demo@example.com", "Portale-Demo-2026")


# Validation (no emails sent)
class TestValidation:
    def test_feedback_without_rating_422(self, doc):
        r = doc.post(f"{API}/beta/feedback", json={"kind": "feedback", "area": "pdf", "text": "TEST_x"})
        assert r.status_code == 422

    def test_support_short_text_422(self, doc):
        r = doc.post(f"{API}/beta/feedback", json={"kind": "supporto", "area": "pdf", "text": "ab"})
        assert r.status_code == 422

    def test_bad_area_422(self, doc):
        r = doc.post(f"{API}/beta/feedback", json={"kind": "feedback", "rating": 4, "area": "xx"})
        assert r.status_code == 422

    def test_portal_feedback_no_rating_422(self, parent):
        r = parent.post(f"{API}/portal/feedback", json={"kind": "feedback", "area": "altro", "text": "TEST_"})
        assert r.status_code == 422

    def test_unauth_401(self):
        r = requests.post(f"{API}/beta/feedback", json={"kind": "feedback", "rating": 4, "area": "pdf"})
        assert r.status_code in (401, 403)


# Successful send + idempotency (1 email doctor, 1 email parent)
class TestSend:
    def test_doctor_feedback_and_idempotent(self, doc):
        cid = str(uuid.uuid4())
        body = {"kind": "feedback", "rating": 5, "area": "pdf", "text": "TEST_ pytest doctor feedback", "client_id": cid}
        r1 = doc.post(f"{API}/beta/feedback", json=body)
        assert r1.status_code == 200, r1.text
        d1 = r1.json()
        assert d1["email_sent"] is True and isinstance(d1["id"], str)
        r2 = doc.post(f"{API}/beta/feedback", json=body)
        assert r2.status_code == 200
        assert r2.json()["id"] == d1["id"]

    def test_parent_support(self, parent):
        cid = str(uuid.uuid4())
        r = parent.post(f"{API}/portal/feedback", json={"kind": "supporto", "rating": 3, "area": "altro",
                                                       "text": "TEST_ pytest parent support request", "client_id": cid})
        assert r.status_code == 200, r.text
        assert r.json()["email_sent"] is True
