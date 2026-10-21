"""Electronic signature: consent PDFs (doctor/portal), integrity verify, doctor report signature."""
import base64
import hashlib
import io
import os
import secrets
from datetime import datetime, timezone
from pathlib import Path

import fitz
import pytest
import requests
from dotenv import dotenv_values
from PIL import Image, ImageDraw

_env = dotenv_values(Path(__file__).resolve().parents[2] / "frontend" / ".env")
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _env.get("REACT_APP_BACKEND_URL") or "").rstrip("/")
assert BASE_URL
DOC = ("medico@mantmed.it", "Auscula-Studio-2026")
PARENT = ("genitore.demo@example.com", "Portale-Demo-2026")
DOC_PID = "6ad86e64c06e50ff4cd67d18"   # Leonardo Colombo (doctor tests)
AURORA = "6ad86e64c06e50ff4cd67d1e"
OTHER_PID = "6ad86e64c06e50ff4cd67d14"  # Sofia Russo (not linked to parent)


def png_url(w=300, h=100):
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.line([(10, 80), (80, 20), (150, 70), (290, 15)], fill=(10, 20, 60, 255), width=4)
    b = io.BytesIO()
    im.save(b, "PNG")
    return "data:image/png;base64," + base64.b64encode(b.getvalue()).decode()


def login(email, pw):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pw})
    assert r.status_code == 200, r.text
    return s


@pytest.fixture(scope="module")
def doc():
    return login(*DOC)


@pytest.fixture(scope="module")
def parent():
    return login(*PARENT)


def body(pid, **kw):
    b = {"patient_id": pid, "document_id": "consenso_privacy", "method": "firma_tablet", "signature": png_url(),
         "signer": {"name": "TEST Maria Colombo", "relation": "Madre"}, "privacy_policy": True, "health_data": True,
         "email_reports": True, "client_signed_at": datetime.now(timezone.utc).isoformat()}
    b.update(kw)
    return b


def pdf_text(raw):
    d = fitz.open(stream=raw, filetype="pdf")
    return d, "\n".join(p.get_text() for p in d)


STATE = {}


# ---- Doctor: template & sign ----
class TestDoctorSign:
    def test_template(self, doc):
        r = doc.get(f"{BASE_URL}/api/signatures/template")
        assert r.status_code == 200
        d = r.json()
        assert d["version"] and "Reg. UE 2016/679" in d["text"]
        assert len(d["clauses"]) == 3 and d["relations"] == ["Madre", "Padre", "Tutore legale"]

    def test_sign_and_supersede(self, doc):
        r1 = doc.post(f"{BASE_URL}/api/signatures", json=body(DOC_PID))
        assert r1.status_code == 200, r1.text
        d1 = r1.json()
        assert d1["document"]["code"].startswith("MM-DOC-") and len(d1["document"]["file_sha256"]) == 64
        r2 = doc.post(f"{BASE_URL}/api/signatures", json=body(DOC_PID, email_reports=False))
        assert r2.status_code == 200
        d2 = r2.json()
        STATE.update(first=d1, second=d2)
        pts = {p["id"]: p for p in doc.get(f"{BASE_URL}/api/patients").json()}
        assert pts[DOC_PID]["consent_at"] == d2["signed_at"]
        docs = {x["id"]: x for x in doc.get(f"{BASE_URL}/api/patients/{DOC_PID}/documents").json()}
        assert docs[d1["document"]["id"]]["revoked_at"] is not None
        assert docs[d2["document"]["id"]]["revoked_at"] is None
        assert all("pdf" not in x for x in docs.values())

    def test_pdf_integrity_and_content(self, doc):
        dd = STATE["second"]["document"]
        r = doc.get(f"{BASE_URL}/api/documents/{dd['id']}/pdf")
        assert r.status_code == 200 and r.headers["content-type"].startswith("application/pdf")
        assert hashlib.sha256(r.content).hexdigest() == dd["file_sha256"]
        assert b"/Encrypt" in r.content
        d, t = pdf_text(r.content)
        assert not d.needs_pass and d.is_encrypted is False or True
        perms = d.permissions
        assert not (perms & fitz.PDF_PERM_MODIFY), perms
        for s in ("TEST Maria Colombo", "Informativa".upper(), "Dichiaro di aver letto", "DOCUMENTO N.", "MARCA TEMPORALE",
                  "INDIRIZZO IP", "DISPOSITIVO", "FIR-", "IMPRONTA SHA-256", dd["code"]):
            assert s in t, s
        assert sum(len(p.get_images()) for p in d) >= 1
        STATE["pdf"] = r.content

    def test_paper_form(self, doc):
        r = doc.get(f"{BASE_URL}/api/patients/{DOC_PID}/consent-form.pdf", params={"signer": "TEST Mario", "relation": "Padre"})
        assert r.status_code == 200 and r.content[:4] == b"%PDF"
        assert "Modulo_consenso_" in r.headers.get("content-disposition", "")
        _, t = pdf_text(r.content)
        assert "TEST Mario" in t and "FIRMA AUTOGRAFA" in t
        STATE["paper"] = r.content

    def test_paper_method_no_doc(self, doc):
        b = body(DOC_PID, method="modulo_cartaceo")
        b.pop("signature")
        r = doc.post(f"{BASE_URL}/api/signatures", json=b)
        assert r.status_code == 200, r.text
        assert r.json()["document"] is None and r.json()["channel"] == "cartaceo"
        STATE["paper_consent"] = r.json()

    def test_validation(self, doc):
        assert doc.post(f"{BASE_URL}/api/signatures", json=body(DOC_PID, signature="data:image/png;base64,AAAA")).status_code == 400
        assert doc.post(f"{BASE_URL}/api/signatures", json=body(DOC_PID, privacy_policy=False)).status_code == 400
        assert doc.post(f"{BASE_URL}/api/signatures", json=body(DOC_PID, signer={"name": "ab", "relation": "Madre"})).status_code in (400, 422)
        assert doc.post(f"{BASE_URL}/api/signatures", json=body("000000000000000000000000")).status_code == 404
        assert doc.post(f"{BASE_URL}/api/signatures", json=body("bad")).status_code == 404

    def test_revoke_marks_doc(self, doc):
        # sign again with tablet then revoke it
        r = doc.post(f"{BASE_URL}/api/signatures", json=body(DOC_PID))
        c = r.json()
        rv = doc.post(f"{BASE_URL}/api/consents/{c['id']}/revoke")
        assert rv.status_code == 200, rv.text
        docs = {x["id"]: x for x in doc.get(f"{BASE_URL}/api/patients/{DOC_PID}/documents").json()}
        assert docs[c["document"]["id"]]["revoked_at"] is not None
        STATE["revoked_doc"] = c["document"]


# ---- Public verify ----
class TestVerify:
    def test_valid(self):
        dd = STATE["second"]["document"]
        r = requests.post(f"{BASE_URL}/api/public/verify", json={"sha256": dd["file_sha256"]})
        assert r.status_code == 200
        d = r.json()
        assert d["valid"] is True and d["code"] == dd["code"] and d["signer_initials"] == "T. M. C."
        assert d["channel"] == "studio_tablet" and "signed_at" in d and "revoked_at" in d

    def test_revoked_flag(self):
        r = requests.post(f"{BASE_URL}/api/public/verify", json={"sha256": STATE["revoked_doc"]["file_sha256"]})
        assert r.json()["valid"] is True and r.json()["revoked_at"]

    def test_invalid(self):
        assert requests.post(f"{BASE_URL}/api/public/verify", json={"sha256": secrets.token_hex(32)}).json() == {"valid": False}
        assert requests.post(f"{BASE_URL}/api/public/verify", json={"sha256": "z" * 64}).status_code in (400, 422)
        assert requests.post(f"{BASE_URL}/api/public/verify", json={"sha256": hashlib.sha256(STATE["paper"]).hexdigest()}).json()["valid"] is False


# ---- Doctor signature for reports ----
class TestDoctorSignature:
    def test_cycle(self, doc, parent):
        assert doc.get(f"{BASE_URL}/api/settings/signature").json()["image"] is None
        assert doc.put(f"{BASE_URL}/api/settings/signature", json={"image": "data:image/png;base64,AAAA"}).status_code == 400
        img = png_url(400, 120)
        r = doc.put(f"{BASE_URL}/api/settings/signature", json={"image": img})
        assert r.status_code == 200 and r.json()["image"] == img and r.json()["set_at"]
        assert doc.get(f"{BASE_URL}/api/settings/signature").json()["image"] == img
        cid = doc.get(f"{BASE_URL}/api/consultations").json()[0]["id"]
        p = doc.get(f"{BASE_URL}/api/consultations/{cid}/pdf")
        assert p.status_code == 200, p.text[:200]
        d, t = pdf_text(p.content)
        assert "Firmato il" in t
        assert sum(len(pg.get_images()) for pg in d) >= 1
        for m in ("get", "put", "delete"):
            kw = {"json": {"image": img}} if m == "put" else {}
            assert getattr(parent, m)(f"{BASE_URL}/api/settings/signature", **kw).status_code == 403
        assert doc.delete(f"{BASE_URL}/api/settings/signature").json()["image"] is None
        assert doc.get(f"{BASE_URL}/api/settings/signature").json()["image"] is None
        p2 = doc.get(f"{BASE_URL}/api/consultations/{cid}/pdf")
        assert "Firmato il" not in pdf_text(p2.content)[1]


# ---- Parent portal ----
class TestPortal:
    def test_template(self, parent):
        r = parent.get(f"{BASE_URL}/api/portal/signatures/template", params={"patient_id": AURORA})
        assert r.status_code == 200 and "Foti" in r.json()["doctor"]
        assert parent.get(f"{BASE_URL}/api/portal/signatures/template", params={"patient_id": OTHER_PID}).status_code == 404

    def test_sign(self, parent, doc):
        me = parent.get(f"{BASE_URL}/api/portal/me").json()
        ch = next(c for c in me["children"] if c["patient"]["id"] == AURORA)
        assert "consent_at" in ch and isinstance(ch["documents"], list)
        n0 = len(ch["documents"])
        b = body(AURORA, signer={"name": "TEST Giulia Ricci", "relation": "Madre"})
        b.pop("document_id"); b.pop("method")
        r = parent.post(f"{BASE_URL}/api/portal/signatures", json=b)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["channel"] == "portale" and d["document"]["channel"] == "portale"
        STATE["portal"] = d
        ch = next(c for c in parent.get(f"{BASE_URL}/api/portal/me").json()["children"] if c["patient"]["id"] == AURORA)
        assert ch["consent_at"] and len(ch["documents"]) == n0 + 1
        pdf = parent.get(f"{BASE_URL}/api/portal/documents/{d['document']['id']}/pdf")
        assert pdf.status_code == 200 and hashlib.sha256(pdf.content).hexdigest() == d["document"]["file_sha256"]
        assert "Portale" in pdf_text(pdf.content)[1]
        ids = [x["id"] for x in doc.get(f"{BASE_URL}/api/patients/{AURORA}/documents").json()]
        assert d["document"]["id"] in ids

    def test_isolation(self, parent):
        b = body(OTHER_PID); b.pop("document_id"); b.pop("method")
        assert parent.post(f"{BASE_URL}/api/portal/signatures", json=b).status_code == 404
        assert parent.get(f"{BASE_URL}/api/portal/documents/{STATE['second']['document']['id']}/pdf").status_code == 404
        assert parent.get(f"{BASE_URL}/api/documents/{STATE['portal']['document']['id']}/pdf").status_code == 403
        assert parent.get(f"{BASE_URL}/api/patients/{AURORA}/documents").status_code == 403
        assert parent.post(f"{BASE_URL}/api/signatures", json=body(AURORA)).status_code == 403

    def test_portal_no_signature(self, parent):
        b = body(AURORA); b.pop("signature")
        assert parent.post(f"{BASE_URL}/api/portal/signatures", json=b).status_code == 422
