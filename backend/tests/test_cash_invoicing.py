"""Cassa: impostazioni fiscali, fatture (calcoli, validazioni, numerazione, PDF/XML), Sistema TS (simulazione), commercialista."""
import io
import os
from datetime import date, timedelta
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values
from pypdf import PdfReader

_env = dotenv_values(Path(__file__).resolve().parents[2] / "frontend" / ".env")
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _env.get("REACT_APP_BACKEND_URL")).rstrip("/")
API = f"{BASE_URL}/api"
DOC = ("medico@mantmed.it", "Auscula-Studio-2026")
PCF = "RSSMRA80A01H224U"  # CF genitore TEST
KCF = "RSSLCU20A01H224Z"  # CF paziente TEST
CREATED = []


@pytest.fixture(scope="module")
def s():
    ss = requests.Session()
    r = ss.post(f"{API}/auth/login", json={"email": DOC[0], "password": DOC[1]})
    assert r.status_code == 200, r.text
    yield ss
    # cleanup: annulla le fatture TEST create (numero mantenuto, incasso eliminato)
    for iid in CREATED:
        ss.post(f"{API}/cash/invoices/{iid}/cancel")


@pytest.fixture(scope="module")
def settings(s):
    return s.get(f"{API}/cash/settings").json()


def settings_body(st, **over):
    b = {k: st["billing"].get(k, "") for k in ("regime", "holder", "tax_code", "vat_number", "address", "order_registration", "iban", "accountant_email", "stamp_charge")}
    b["tariffs"] = st["tariffs"]
    b.update(over)
    return b


def persona(**over):
    b = {"client_type": "persona", "patient_name": "TEST_Luca Rossi", "patient_cf": KCF, "payer_name": "TEST_Mario Rossi", "payer_cf": PCF,
         "date": date.today().isoformat(), "clinic": "Studio Centro", "method": "carta", "paid": True,
         "lines": [{"description": "Prima visita", "amount": 120, "vat": "esente"}]}
    b.update(over)
    return b


def azienda(**over):
    b = persona(client_type="azienda", payer_name="", payer_cf="", method="bonifico",
                company={"name": "TEST_ASD Calcio", "vat": "09876543210", "cf": "", "address": "Via X 1", "sdi_code": "ABC1234", "pec": ""})
    b.update(over)
    return b


def mk(s, body):
    r = s.post(f"{API}/cash/invoices", json=body)
    if r.status_code == 200:
        CREATED.append(r.json()["id"])
    return r


# ---------- Impostazioni ----------
class TestSettings:
    def test_get(self, settings):
        assert settings["billing"]["regime"] in ("ordinario", "forfettario")
        assert settings["configured"] is True
        assert any(t["vat"] == "iva22" for t in settings["tariffs"])
        assert "/" in settings["next_number"]

    @pytest.mark.parametrize("over,msg", [({"tax_code": "ABC"}, "Codice fiscale"), ({"vat_number": "1234567890"}, "11 cifre"),
                                          ({"accountant_email": "nope"}, "Email")])
    def test_put_validation(self, s, settings, over, msg):
        r = s.put(f"{API}/cash/settings", json=settings_body(settings, **over))
        assert r.status_code == 400 and msg in r.json()["detail"], r.text

    def test_put_roundtrip_and_schedule_does_not_wipe(self, s, settings):
        r = s.put(f"{API}/cash/settings", json=settings_body(settings))
        assert r.status_code == 200, r.text
        sch = s.get(f"{API}/settings/schedule").json()
        body = {"hours": sch["hours"], "services": sch["services"], "clinics": sch["clinics"],
                "billing": {k: sch["billing"].get(k, "") for k in ("holder", "tax_code", "vat_number", "address", "note")}}
        r = s.put(f"{API}/settings/schedule", json=body)
        assert r.status_code == 200, r.text
        after = s.get(f"{API}/cash/settings").json()
        for k in ("regime", "iban", "accountant_email", "order_registration"):
            assert after["billing"][k] == settings["billing"][k], k
        assert {t["name"]: t["vat"] for t in after["tariffs"]} == {t["name"]: t["vat"] for t in settings["tariffs"]}


# ---------- Calcoli ----------
class TestPreview:
    def p(self, s, **b):
        r = s.post(f"{API}/cash/invoices/preview", json=b)
        assert r.status_code == 200, r.text
        return r.json()

    def test_ordinario_persona(self, s):
        t = self.p(s, lines=[{"description": "a", "amount": 120, "vat": "esente"}, {"description": "b", "amount": 40, "vat": "iva22"}])
        assert (t["esente"], t["imponibile"], t["iva"], t["stamp"], t["total"], t["ritenuta"]) == (120, 40, 8.8, 2, 170.8, 0)

    def test_stamp_medico(self, s):
        t = self.p(s, stamp_charge="medico", lines=[{"description": "a", "amount": 120, "vat": "esente"}, {"description": "b", "amount": 40, "vat": "iva22"}])
        assert t["stamp"] == 2 and t["total"] == 168.8

    def test_azienda_ritenuta(self, s):
        t = self.p(s, client_type="azienda", lines=[{"description": "a", "amount": 100, "vat": "esente"}, {"description": "b", "amount": 50, "vat": "iva22"}])
        assert t["ritenuta"] == 30 and t["total"] == 163 and t["due"] == 133

    def test_no_bollo_under_threshold(self, s):
        t = self.p(s, lines=[{"description": "a", "amount": 77.47, "vat": "esente"}])
        assert t["stamp"] == 0 and t["total"] == 77.47

    def test_forfettario(self, s, settings):
        try:
            assert s.put(f"{API}/cash/settings", json=settings_body(settings, regime="forfettario")).status_code == 200
            t = self.p(s, client_type="azienda", lines=[{"description": "a", "amount": 100, "vat": "esente"}, {"description": "b", "amount": 40, "vat": "iva22"}])
            assert (t["esente"], t["imponibile"], t["iva"], t["ritenuta"], t["stamp"], t["total"], t["regime"]) == (140, 0, 0, 0, 2, 142, "forfettario")
        finally:
            assert s.put(f"{API}/cash/settings", json=settings_body(settings)).status_code == 200
        assert s.get(f"{API}/cash/settings").json()["billing"]["regime"] == settings["billing"]["regime"]


# ---------- Validazioni creazione ----------
class TestCreateValidation:
    @pytest.mark.parametrize("body,code", [
        (persona(payer_name=""), 400), (persona(payer_cf="XYZ"), 400), (persona(patient_cf="BAD"), 400),
        (azienda(company={"name": "TEST_X", "vat": "", "cf": "", "sdi_code": "ABC1234"}), 400),
        (azienda(company={"name": "TEST_X", "vat": "09876543210", "sdi_code": "", "pec": ""}), 400),
        (persona(date=(date.today() + timedelta(days=3)).isoformat()), 400),
        (persona(lines=[{"description": "x", "amount": 0, "vat": "esente"}]), 400),
        (persona(method=None), 422), (persona(method="assegno"), 422)])
    def test_rejects(self, s, body, code):
        if body.get("method") is None:
            body.pop("method")
        r = mk(s, body)
        assert r.status_code == code, r.text


# ---------- Flusso fattura ----------
class TestInvoiceFlow:
    def test_persona_paid_number_payment_pdf_cancel(self, s):
        exp = s.get(f"{API}/cash/settings").json()["next_number"]
        r = mk(s, persona(method="contanti", lines=[{"description": "Prima visita", "amount": 120, "vat": "esente"}, {"description": "Cert", "amount": 40, "vat": "iva22"}]))
        assert r.status_code == 200, r.text
        i = r.json()
        assert i["number"] == exp and i["status"] == "pagata" and i["sts_status"] == "da_inviare" and i["totals"]["total"] == 170.8
        assert i["payer"] == "TEST_Mario Rossi" and i["sdi_status"] is None
        pays = s.get(f"{API}/payments", params={"start": "2000-01-01", "end": "2999-12-31"}).json()
        pays = pays.get("items", pays) if isinstance(pays, dict) else pays
        p = [x for x in pays if x.get("invoice_id") == i["id"]]
        assert len(p) == 1 and p[0]["amount"] == 170.8 and p[0]["receipt_no"] == exp
        assert s.delete(f"{API}/payments/{p[0]['id']}").status_code == 409
        pdf = s.get(f"{API}/cash/invoices/{i['id']}/pdf")
        assert pdf.status_code == 200 and pdf.content[:4] == b"%PDF"
        rd = PdfReader(io.BytesIO(pdf.content))
        assert len(rd.pages) == 1
        txt = rd.pages[0].extract_text()
        for frag in (exp, "bollo", "ontanti"):
            assert frag.lower() in txt.lower(), frag
        assert s.get(f"{API}/cash/invoices/{i['id']}/xml").status_code == 409
        c = s.post(f"{API}/cash/invoices/{i['id']}/cancel")
        assert c.status_code == 200 and c.json()["status"] == "annullata" and c.json()["number"] == exp
        pays = s.get(f"{API}/payments", params={"start": "2000-01-01", "end": "2999-12-31"}).json()
        pays = pays.get("items", pays) if isinstance(pays, dict) else pays
        assert not [x for x in pays if x.get("invoice_id") == i["id"]]
        assert s.post(f"{API}/cash/invoices/{i['id']}/cancel").status_code == 409
        # numero successivo continua
        r2 = mk(s, persona(paid=False))
        n1, y = exp.split("/")
        assert r2.json()["number"] == f"{int(n1) + 1}/{y}"

    def test_unpaid_then_pay(self, s):
        i = mk(s, persona(paid=False, method="pos")).json()
        assert i["status"] == "da_incassare" and i["paid_at"] is None and i["payment_id"] is None
        r = s.post(f"{API}/cash/invoices/{i['id']}/pay", json={"method": "bonifico"})
        assert r.status_code == 200 and r.json()["status"] == "pagata" and r.json()["method"] == "bonifico" and r.json()["payment_id"]
        assert s.post(f"{API}/cash/invoices/{i['id']}/pay", json={}).status_code == 409

    def test_azienda_xml(self, s):
        i = mk(s, azienda()).json()
        assert i["sdi_status"] == "inviata_simulazione" and i["sdi_id"].startswith("SIM-") and i["sts_status"] is None
        assert i["totals"]["ritenuta"] == 24 and i["totals"]["due"] == 98
        x = s.get(f"{API}/cash/invoices/{i['id']}/xml")
        assert x.status_code == 200 and b"FatturaElettronica" in x.content and b"09876543210" in x.content

    def test_opposition(self, s):
        i = mk(s, persona(sts_opposition=True)).json()
        assert i["sts_opposition"] is True and i["sts_status"] is None
        sts = s.get(f"{API}/cash/sts", params={"year": date.today().year}).json()
        assert i["id"] not in [x["id"] for x in sts["items"]] and sts["opposed"] >= 1

    def test_list_and_overview(self, s):
        ov = s.get(f"{API}/cash/overview")
        assert ov.status_code == 200
        d = ov.json()
        assert {"today", "month", "year"} <= set(d["stats"]) and d["recent"]
        f = s.get(f"{API}/cash/overview", params={"clinic": "Studio Provincia"}).json()
        assert all(x["clinic"] == "Studio Provincia" for x in f["recent"])
        legacy = [x for x in d["recent"] if x["legacy"]]
        assert legacy, "legacy invoice missing"
        for x in legacy:
            if x["method"] == "online" and not x["cancelled_at"]:
                assert s.post(f"{API}/cash/invoices/{x['id']}/cancel").status_code == 409


# ---------- Sistema TS (simulazione, anno passato con soli dati TEST) ----------
class TestSts:
    def test_deadline_send_file(self, s):
        y = date.today().year - 1
        pre = s.get(f"{API}/cash/sts", params={"year": y}).json()
        if pre["items"]:
            pytest.skip("anno precedente con dati reali: non invio")
        assert pre["deadline"] == f"{y + 1}-02-01" and pre["simulation"] is True
        assert s.get(f"{API}/cash/sts", params={"year": 2026}).json()["deadline"] == "2027-02-01"
        d = f"{y}-06-15"
        ok = mk(s, persona(date=d)).json()
        ko = mk(s, persona(date=d, patient_cf="")).json()
        assert ok["number"].endswith(f"/{y}")
        lst = s.get(f"{API}/cash/sts", params={"year": y}).json()
        assert {ok["id"], ko["id"]} <= {x["id"] for x in lst["items"]} and lst["count"]["da_inviare"] >= 2
        f = s.get(f"{API}/cash/sts/file", params={"year": y})
        assert f.status_code == 200 and KCF.encode() in f.content
        r = s.post(f"{API}/cash/sts/send", params={"year": y}).json()
        assert r["sent"] >= 1 and r["errors"] >= 1
        st = {x["id"]: x for x in s.get(f"{API}/cash/sts", params={"year": y}).json()["items"]}
        assert st[ok["id"]]["sts_status"] == "inviata" and st[ko["id"]]["sts_status"] == "errore" and st[ko["id"]]["sts_error"]


# ---------- Commercialista ----------
class TestAccountant:
    def rng(self):
        t = date.today()
        return {"start": f"{t.year}-01-01", "end": t.isoformat()}

    def test_summary_and_pdfs(self, s):
        r = s.get(f"{API}/cash/accountant", params=self.rng())
        assert r.status_code == 200, r.text
        sm = r.json()["summary"]
        for k in ("count", "imponibile", "esente", "iva", "stamp", "ritenuta", "by_method", "companies", "sdi_sent", "sts"):
            assert k in sm
        assert sm["companies"] >= 1 and sm["sdi_sent"] >= 1
        c = s.get(f"{API}/cash/accountant", params={**self.rng(), "clinic": "Studio Provincia"}).json()
        assert all(i["clinic"] == "Studio Provincia" for i in c["items"])
        assert s.get(f"{API}/cash/accountant", params={"start": "2026-05-01", "end": "2026-01-01"}).status_code == 400
        reg = s.get(f"{API}/cash/accountant/register.pdf", params=self.rng())
        assert reg.status_code == 200 and reg.content[:4] == b"%PDF"
        allp = s.get(f"{API}/cash/accountant/invoices.pdf", params=self.rng())
        assert allp.status_code == 200 and len(PdfReader(io.BytesIO(allp.content)).pages) >= 2

    def test_send(self, s):
        r = s.post(f"{API}/cash/accountant/send", json=self.rng())
        print("SEND", r.status_code, r.text[:300])
        assert r.status_code in (200, 502, 503), r.text

    def test_send_real_to_resend_sink(self, s, settings):
        try:
            assert s.put(f"{API}/cash/settings", json=settings_body(settings, accountant_email="delivered@resend.dev")).status_code == 200
            r = s.post(f"{API}/cash/accountant/send", json=self.rng())
            assert r.status_code == 200, r.text[:300]
            assert r.json()["sent_to"] == "delivered@resend.dev" and r.json()["attachments"] == 2
        finally:
            assert s.put(f"{API}/cash/settings", json=settings_body(settings)).status_code == 200

    def test_send_without_email(self, s, settings):
        try:
            assert s.put(f"{API}/cash/settings", json=settings_body(settings, accountant_email="")).status_code == 200
            r = s.post(f"{API}/cash/accountant/send", json=self.rng())
            assert r.status_code == 400, r.text
        finally:
            assert s.put(f"{API}/cash/settings", json=settings_body(settings)).status_code == 200
        assert s.get(f"{API}/cash/settings").json()["billing"]["accountant_email"] == settings["billing"]["accountant_email"]
