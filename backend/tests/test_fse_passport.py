# FSE 2.0 (simulated connector) + separate consents (FSE / Passaporto) + passport payload tests.
# Uses demo patient Pietro Fontana; data is backed up / restored by the tester outside this file (mongoexport).
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    with open("/app/frontend/.env") as fh:
        for line in fh:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().strip('"').rstrip("/")
API = f"{BASE_URL}/api"
PID = "6ad86e64c06e50ff4cd67d4d"      # Pietro Fontana (demo)
DRAFT = "6ad894264b41e81ff20f7eac"    # draft MantAI note
LEGACY = "6ad86e64c06e50ff4cd67d52"   # legacy note (not a draft, never signed)
VALID_CF = "FNTPTR20A01H501X"


@pytest.fixture(scope="module")
def s():
    ses = requests.Session()
    r = ses.post(f"{API}/auth/login", json={"email": "medico@mantmed.it", "password": "Auscula-Studio-2026"})
    if r.status_code != 200:
        pytest.skip("login failed")
    return ses


def passport(s):
    r = s.get(f"{API}/patients/{PID}/passport")
    assert r.status_code == 200
    return r.json()


def cons(s, cid):
    return next(c for c in passport(s)["consultations"] if c["id"] == cid)


CREATED = []


class TestFseFlow:
    # passport payload shape
    def test_passport_shape(self, s):
        d = passport(s)
        assert d["portal"]["status"] in ("attivo", "invitato", "non_attivo")
        assert isinstance(d["portal"]["shares"], list)
        assert d["fse"]["days"] == 5 and isinstance(d["fse"]["missing"], list) and d["fse"]["consent"] is False
        assert "Codice fiscale" in d["fse"]["missing"]
        for c in d["consultations"]:
            assert "obscured" in c and "fse" in c and "signed_at" in c

    # drafts can't be published / sent
    def test_draft_blocks(self, s):
        assert s.post(f"{API}/consultations/{DRAFT}/portal", json={"published": True}).status_code == 409
        r = s.post(f"{API}/consultations/{DRAFT}/fse/retry")
        assert r.status_code == 409 and "firma" in r.json()["detail"]

    # sign without consent/data -> non_inviato with reason
    def test_sign_without_consent(self, s):
        r = s.post(f"{API}/consultations/{DRAFT}/sign")
        assert r.status_code == 200, r.text
        f = r.json()["fse"]
        assert f["status"] == "non_inviato"
        assert "consenso" in f["reason"].lower() and "Codice fiscale" in f["reason"]
        assert f["deadline"]
        assert cons(s, DRAFT)["signed_at"]

    # kind consent validation
    def test_kind_consent_validation(self, s):
        assert s.post(f"{API}/patients/{PID}/consents/fse", json={"signer_name": "X Y", "method": "firma_tablet"}).status_code == 400
        assert s.post(f"{API}/patients/{PID}/consents/altro", json={"signer_name": "X Y", "method": "modulo_cartaceo"}).status_code == 422
        assert s.post(f"{API}/patients/{PID}/consents/fse", json={"signer_name": "X", "method": "modulo_cartaceo"}).status_code == 422

    # FSE consent recorded -> still non_inviato (data missing)
    def test_fse_consent(self, s):
        r = s.post(f"{API}/patients/{PID}/consents/fse", json={"signer_name": "Ilaria Fontana", "signer_relation": "Genitore", "method": "modulo_cartaceo"})
        assert r.status_code == 200 and r.json()["ok"]
        d = passport(s)
        assert d["patient"]["fse_consent_at"] and d["fse"]["consent"] is True
        k = [c for c in d["consents"] if c["kind"] == "fse" and not c["revoked_at"]]
        assert k
        CREATED.append(k[0]["id"])
        print("signer_mismatch for 'Ilaria Fontana' vs guardian", repr(d["patient"]["guardian"]), "->", k[0]["signer_mismatch"])
        f = cons(s, DRAFT)["fse"]
        assert f["status"] == "non_inviato" and "consenso" not in f["reason"].lower()

    def test_mismatch_flag(self, s):
        r = s.post(f"{API}/patients/{PID}/consents/passaporto", json={"signer_name": "Mario Rossi", "signer_relation": "Altro", "method": "modulo_cartaceo"})
        assert r.status_code == 200
        d = passport(s)
        assert d["patient"]["passport_consent_at"]
        k = [c for c in d["consents"] if c["kind"] == "passaporto" and not c["revoked_at"]][0]
        CREATED.append(k["id"])
        assert k["signer_mismatch"] is True

    # completing data re-evaluates -> in_coda -> inviato -> accettato
    def test_patch_requeues_and_simulation(self, s):
        r = s.patch(f"{API}/patients/{PID}", json={"fiscal_code": VALID_CF, "guardian_fiscal_code": "FNTLRI90A41H501Y"})
        assert r.status_code == 200, r.text
        d = passport(s)
        assert d["fse"]["missing"] == []
        f = cons(s, DRAFT)["fse"]
        assert f["status"] == "in_coda", f
        pend = s.get(f"{API}/fse/pending").json()
        assert pend["count"] >= 1 and pend["next_deadline"]
        time.sleep(4.5)
        assert cons(s, DRAFT)["fse"]["status"] == "inviato"
        time.sleep(8.5)
        f = cons(s, DRAFT)["fse"]
        assert f["status"] == "accettato", f
        assert [h["status"] for h in f["history"]][-3:] == ["in_coda", "inviato", "accettato"]

    # signed report can be published, obscure excludes from portal and FSE
    def test_publish_obscure(self, s):
        assert s.post(f"{API}/consultations/{DRAFT}/portal", json={"published": True}).status_code == 200
        r = s.post(f"{API}/consultations/{DRAFT}/obscure", json={"on": True})
        assert r.status_code == 200
        c = r.json()
        assert c["obscured"] is True and c["portal_published"] is False and c["fse"]["status"] == "oscurato"
        assert s.post(f"{API}/consultations/{DRAFT}/portal", json={"published": True}).status_code == 409
        r = s.post(f"{API}/consultations/{DRAFT}/obscure", json={"on": False})
        assert r.status_code == 200
        c = r.json()
        print("after un-obscure fse status:", c["fse"]["status"])
        assert c["obscured"] is False and c["fse"]["status"] in ("in_coda", "accettato")

    # invalid CF -> errore -> retry requeues
    def test_error_and_retry(self, s):
        assert s.patch(f"{API}/patients/{PID}", json={"fiscal_code": "ABC123"}).status_code == 200
        r = s.post(f"{API}/consultations/{LEGACY}/fse/retry")
        assert r.status_code == 200 and r.json()["fse"]["status"] == "in_coda"
        time.sleep(4.5)
        passport(s)
        time.sleep(8.5)
        f = cons(s, LEGACY)["fse"]
        assert f["status"] == "errore" and "codice fiscale" in f["reason"].lower()
        assert s.get(f"{API}/fse/pending").json()["errors"] >= 1
        r = s.post(f"{API}/consultations/{LEGACY}/fse/retry")
        assert r.status_code == 200 and r.json()["fse"]["status"] == "in_coda"

    # revoke clears consent fields
    def test_revoke(self, s):
        for cid in CREATED:
            assert s.post(f"{API}/consents/{cid}/revoke").status_code == 200
        p = passport(s)["patient"]
        assert p["fse_consent_at"] is None and p["passport_consent_at"] is None
        assert s.post(f"{API}/consents/{CREATED[0]}/revoke").status_code == 404
