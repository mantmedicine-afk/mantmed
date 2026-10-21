"""Portal 'I miei Documenti e Visite': therapy rows + therapy PDF, portal/me data used by DocumentsArea, directory card fields."""
import os
from pathlib import Path
import pytest
import requests
from dotenv import dotenv_values

_env = dotenv_values(Path(__file__).resolve().parents[2] / "frontend" / ".env")
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _env.get("REACT_APP_BACKEND_URL") or "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL missing"

PARENT = ("genitore.demo@example.com", "Portale-Demo-2026")
DOC = ("medico@mantmed.it", "Auscula-Studio-2026")
AURORA = "6ad86e64c06e50ff4cd67d1e"


def _sess(email, pw):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pw})
    assert r.status_code == 200, r.text
    tok = r.json().get("token") or r.json().get("access_token")
    if tok:
        s.headers["Authorization"] = f"Bearer {tok}"
    return s


@pytest.fixture(scope="module")
def parent():
    return _sess(*PARENT)


@pytest.fixture(scope="module")
def doctor():
    return _sess(*DOC)


# Therapy list
class TestTherapy:
    def test_therapy_rows(self, parent):
        r = parent.get(f"{BASE_URL}/api/portal/children/{AURORA}/therapy")
        assert r.status_code == 200, r.text
        rows = r.json()
        assert isinstance(rows, list) and rows
        names = " ".join(x["farmaco"] for x in rows).lower()
        assert "amoxicillina" in names and "paracetamolo" in names
        for x in rows:
            for k in ("date", "doctor", "consultation_id", "farmaco", "posologia", "note", "terapia"):
                assert k in x
            assert x["doctor"]

    def test_therapy_pdf(self, parent):
        r = parent.get(f"{BASE_URL}/api/portal/children/{AURORA}/therapy/pdf")
        assert r.status_code == 200
        assert r.headers["content-type"].startswith("application/pdf")
        assert r.content[:4] == b"%PDF"
        assert "Promemoria_terapia_" in r.headers.get("content-disposition", "")

    def test_not_linked_404(self, parent):
        for pid in ("000000000000000000000000", "notanid"):
            assert parent.get(f"{BASE_URL}/api/portal/children/{pid}/therapy").status_code == 404
            assert parent.get(f"{BASE_URL}/api/portal/children/{pid}/therapy/pdf").status_code == 404

    def test_doctor_forbidden(self, doctor):
        r = doctor.get(f"{BASE_URL}/api/portal/children/{AURORA}/therapy")
        assert r.status_code in (401, 403)

    def test_unauth(self):
        r = requests.get(f"{BASE_URL}/api/portal/children/{AURORA}/therapy")
        assert r.status_code in (401, 403)


# Data that feeds DocumentsArea
class TestPortalMe:
    def test_me_has_reports_receipts(self, parent):
        r = parent.get(f"{BASE_URL}/api/portal/me")
        assert r.status_code == 200
        kids = r.json()["children"]
        a = [k for k in kids if k["patient"]["id"] == AURORA]
        assert a
        k = a[0]
        assert "group" in k and isinstance(k["reports"], list) and k["reports"]
        assert isinstance(k.get("receipts", []), list)
        assert any("otit" in ((x.get("diagnosi") or "") + (x.get("motivo") or "")).lower() for x in k["reports"])
        for x in k["reports"]:
            assert "_id" not in x

    def test_report_pdf(self, parent):
        k = [k for k in parent.get(f"{BASE_URL}/api/portal/me").json()["children"] if k["patient"]["id"] == AURORA][0]
        r = parent.get(f"{BASE_URL}/api/portal/reports/{k['reports'][0]['id']}/pdf")
        assert r.status_code == 200 and r.content[:4] == b"%PDF"


# Directory cards
class TestDirectory:
    def test_directory_fields(self):
        r = requests.get(f"{BASE_URL}/api/public/doctors")
        assert r.status_code == 200
        d = [x for x in r.json() if x.get("slug") == "tiziana-foti"]
        assert d
        d = d[0]
        assert "bio_short" in d and isinstance(d["services"], list) and len(d["services"]) <= 3
        assert d["services_count"] >= len(d["services"])
        assert len(d["bio_short"]) <= 181
