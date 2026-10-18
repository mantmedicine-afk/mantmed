"""Backend tests for landing page leads (public submission + private management).

Note: valid submissions trigger a real email, so we submit at most 1 valid lead
with TEST_ prefix to avoid noise. Rate limit is 5/hour per IP.
"""
import os
import sys
import subprocess
from pathlib import Path
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://med-tablet-agenda.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
EMAIL = "medico@mantmed.it"
PASSWORD = "Auscula-Studio-2026"


def _totp():
    out = subprocess.check_output([sys.executable, str(Path(__file__).parent / "totp_code.py")], cwd=str(Path(__file__).parent.parent))
    return out.decode().strip()


@pytest.fixture(scope="module")
def anon():
    return requests.Session()


@pytest.fixture(scope="module")
def auth():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": EMAIL, "password": PASSWORD})
    assert r.status_code == 200, r.text
    data = r.json()
    if data.get("mfa_required"):
        code = _totp()
        r2 = s.post(f"{API}/auth/2fa/verify", json={"mfa_token": data["mfa_token"], "code": code})
        assert r2.status_code == 200, r2.text
    me = s.get(f"{API}/auth/me")
    assert me.status_code == 200
    return s


# ---------- Public endpoint validation ----------

class TestPublicLeads:
    def test_bad_email_422(self, anon):
        r = anon.post(f"{API}/public/leads", json={
            "name": "TEST_bad", "email": "not-an-email", "specialty": "Cardiologia",
            "city": "Milano", "kind": "beta", "message": "x", "consent": True,
        })
        assert r.status_code == 422, r.text

    def test_missing_consent_400(self, anon):
        r = anon.post(f"{API}/public/leads", json={
            "name": "TEST_noconsent", "email": "x@y.it", "specialty": "Cardiologia",
            "city": "Milano", "kind": "beta", "message": "x", "consent": False,
        })
        assert r.status_code == 400, r.text

    def test_bad_kind_422(self, anon):
        r = anon.post(f"{API}/public/leads", json={
            "name": "TEST_kind", "email": "x@y.it", "specialty": "Cardiologia",
            "city": "Milano", "kind": "spam", "message": "x", "consent": True,
        })
        assert r.status_code == 422

    def test_honeypot_silently_dropped(self, anon, auth):
        before = len(auth.get(f"{API}/leads").json())
        r = anon.post(f"{API}/public/leads", json={
            "name": "TEST_honey", "email": "honey@test.it", "specialty": "Spam",
            "city": "", "kind": "commerciale", "message": "spam", "consent": True,
            "website": "http://spam.example",
        })
        assert r.status_code == 200 and r.json() == {"ok": True}
        after = len(auth.get(f"{API}/leads").json())
        assert after == before, "honeypot submission must not be stored"


# ---------- Private endpoint ----------

class TestPrivateLeads:
    def test_requires_auth(self, anon):
        r = anon.get(f"{API}/leads")
        assert r.status_code == 401

    def test_patch_invalid_id_404(self, auth):
        r = auth.patch(f"{API}/leads/not-an-id", json={"status": "nuova"})
        assert r.status_code == 404

    def test_patch_invalid_status_422(self, auth):
        r = auth.patch(f"{API}/leads/507f1f77bcf86cd799439011", json={"status": "wrong"})
        assert r.status_code == 422


# ---------- End-to-end (one real submission) ----------

class TestLeadLifecycle:
    def test_valid_lead_create_list_update(self, anon, auth):
        payload = {
            "name": "TEST_Dr Collaudo",
            "email": "collaudo+mantmed@test.it",
            "specialty": "Pediatria",
            "city": "Reggio Calabria",
            "kind": "beta",
            "message": "Test automatizzato - prego ignorare.",
            "consent": True,
        }
        r = anon.post(f"{API}/public/leads", json=payload)
        assert r.status_code == 200, r.text
        assert r.json() == {"ok": True}

        # GET: lead must be present (decrypted) with status 'nuova'
        leads = auth.get(f"{API}/leads").json()
        mine = [x for x in leads if x["name"] == payload["name"]]
        assert mine, f"created lead not found. names={[x['name'] for x in leads[:5]]}"
        lead = mine[0]
        assert lead["email"] == payload["email"]
        assert lead["specialty"] == payload["specialty"]
        assert lead["city"] == payload["city"]
        assert lead["kind"] == "beta"
        assert lead["status"] == "nuova"
        assert lead["kind_label"]

        # PATCH to 'contattato'
        r2 = auth.patch(f"{API}/leads/{lead['id']}", json={"status": "contattato"})
        assert r2.status_code == 200, r2.text
        assert r2.json()["status"] == "contattato"
        assert r2.json()["email"] == payload["email"]  # still decrypted

        # Verify persistence via GET
        again = [x for x in auth.get(f"{API}/leads").json() if x["id"] == lead["id"]][0]
        assert again["status"] == "contattato"

        # PATCH to 'archiviata' to leave it tidy
        r3 = auth.patch(f"{API}/leads/{lead['id']}", json={"status": "archiviata"})
        assert r3.status_code == 200
