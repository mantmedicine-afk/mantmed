"""Backend tests for MantMed admin leads flow + RBAC separation (iteration 4).

- /api/public/leads: public, validates
- /api/admin/leads: admin-only (403 for doctor, 401 anon)
- /api/patients, /api/consultations, /api/beta/metrics, /api/compliance/status: doctor-only (403 for admin)
- At most ONE new real valid lead submission (TEST_ prefix) to avoid email noise.
"""
import os
import sys
import subprocess
from pathlib import Path
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

DOCTOR_EMAIL = "medico@mantmed.it"
DOCTOR_PASSWORD = "Auscula-Studio-2026"
ADMIN_EMAIL = "mantmedicine@gmail.com"
ADMIN_PASSWORD = "MM-3EjwJpn5w64aCu2ZkOLA"


def _totp():
    out = subprocess.check_output(
        [sys.executable, str(Path(__file__).parent / "totp_code.py")],
        cwd=str(Path(__file__).parent.parent),
    )
    return out.decode().strip()


@pytest.fixture(scope="module")
def anon():
    return requests.Session()


@pytest.fixture(scope="module")
def admin():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    data = r.json()
    assert "mfa_required" not in data, "Admin should NOT have 2FA enabled by default"
    assert data.get("role") == "admin"
    me = s.get(f"{API}/auth/me")
    assert me.status_code == 200 and me.json()["role"] == "admin"
    return s


@pytest.fixture(scope="module")
def doctor():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": DOCTOR_EMAIL, "password": DOCTOR_PASSWORD})
    assert r.status_code == 200, r.text
    data = r.json()
    if data.get("mfa_required"):
        code = _totp()
        r2 = s.post(f"{API}/auth/2fa/verify", json={"mfa_token": data["mfa_token"], "code": code})
        assert r2.status_code == 200, r2.text
    me = s.get(f"{API}/auth/me")
    assert me.status_code == 200 and me.json()["role"] == "doctor"
    return s


# ---------- RBAC separation ----------

class TestRBAC:
    def test_admin_forbidden_on_clinical_endpoints(self, admin):
        for path in ("/patients", "/consultations", "/beta/metrics", "/compliance/status"):
            r = admin.get(f"{API}{path}")
            assert r.status_code == 403, f"expected 403 on {path}, got {r.status_code} {r.text[:200]}"

    def test_doctor_forbidden_on_admin_leads(self, doctor):
        r = doctor.get(f"{API}/admin/leads")
        assert r.status_code == 403

    def test_anon_unauthorized_on_admin_leads(self, anon):
        r = anon.get(f"{API}/admin/leads")
        assert r.status_code == 401


# ---------- Public lead validation ----------

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

    def test_honeypot_silently_dropped(self, anon, admin):
        before = len(admin.get(f"{API}/admin/leads").json())
        r = anon.post(f"{API}/public/leads", json={
            "name": "TEST_honey", "email": "honey@test.it", "specialty": "Spam",
            "city": "", "kind": "commerciale", "message": "spam", "consent": True,
            "website": "http://spam.example",
        })
        assert r.status_code == 200 and r.json() == {"ok": True}
        after = len(admin.get(f"{API}/admin/leads").json())
        assert after == before


# ---------- Private admin endpoint validation ----------

class TestPrivateLeads:
    def test_patch_invalid_id_404(self, admin):
        r = admin.patch(f"{API}/admin/leads/not-an-id", json={"status": "nuova"})
        assert r.status_code == 404

    def test_patch_invalid_status_422(self, admin):
        r = admin.patch(f"{API}/admin/leads/507f1f77bcf86cd799439011", json={"status": "wrong"})
        assert r.status_code == 422

    def test_patch_empty_body_400(self, admin):
        r = admin.patch(f"{API}/admin/leads/507f1f77bcf86cd799439011", json={})
        assert r.status_code == 400

    def test_list_returns_decrypted(self, admin):
        leads = admin.get(f"{API}/admin/leads").json()
        assert isinstance(leads, list)
        for l in leads:
            assert "@" in (l.get("email") or ""), f"email should be decrypted: {l}"
            assert "id" in l and "status" in l


# ---------- End-to-end: 1 real submission + lifecycle ----------

class TestLeadLifecycle:
    def test_valid_create_patch_note_and_status(self, anon, admin):
        payload = {
            "name": "TEST_Dr Verifica",
            "email": "verifica+mantmed@test.it",
            "specialty": "Pediatria",
            "city": "Reggio Calabria",
            "kind": "beta",
            "message": "Test automatizzato iteration 4 - prego ignorare.",
            "consent": True,
        }
        r = anon.post(f"{API}/public/leads", json=payload)
        assert r.status_code == 200, r.text

        leads = admin.get(f"{API}/admin/leads").json()
        mine = [x for x in leads if x["name"] == payload["name"]]
        assert mine, "created lead not found"
        lead = mine[0]
        assert lead["email"] == payload["email"]
        assert lead["city"] == payload["city"]
        assert lead["status"] == "nuova"

        # contattato → sets contacted_at
        r2 = admin.patch(f"{API}/admin/leads/{lead['id']}", json={"status": "contattato"})
        assert r2.status_code == 200
        assert r2.json()["status"] == "contattato"
        assert r2.json().get("contacted_at")

        # attivato → sets activated_at
        r3 = admin.patch(f"{API}/admin/leads/{lead['id']}", json={"status": "attivato"})
        assert r3.status_code == 200
        assert r3.json().get("activated_at")

        # note persists encrypted-at-rest but decrypted on read
        note_val = "TEST_nota interna · ok"
        r4 = admin.patch(f"{API}/admin/leads/{lead['id']}", json={"note": note_val})
        assert r4.status_code == 200
        assert r4.json()["note"] == note_val

        # Reload → note still there
        again = [x for x in admin.get(f"{API}/admin/leads").json() if x["id"] == lead["id"]][0]
        assert again["note"] == note_val
        assert again["status"] == "attivato"

        # Tidy up: archive
        admin.patch(f"{API}/admin/leads/{lead['id']}", json={"status": "archiviata"})
