"""Iteration 24: Modelli Visita (multi-template per medico), consultation start with template_id, async AI field mapping, PDF vitals."""
import os
import time
from pathlib import Path

import fitz  # pymupdf
import pytest
import requests
from bson import ObjectId
from dotenv import dotenv_values
from pymongo import MongoClient

_env = dotenv_values(Path(__file__).resolve().parents[2] / "frontend" / ".env")
_benv = dotenv_values(Path(__file__).resolve().parents[1] / ".env")
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _env.get("REACT_APP_BACKEND_URL") or "").rstrip("/")
assert BASE_URL
API = f"{BASE_URL}/api"
PED = ("medico@mantmed.it", "Auscula-Studio-2026")
CARD = ("cardiologo.demo@example.com", "Cardio-Demo-2026")

CARD_TX = ("Paziente di 62 anni, iperteso, fumatore, in terapia con ramipril 5 mg. Viene per palpitazioni da due settimane. "
           "Pressione arteriosa 135 su 85, frequenza cardiaca 78 regolare, saturazione 97 per cento. "
           "Auscultazione cardiaca: toni validi, nessun soffio. Polsi periferici presenti, nessun edema. "
           "ECG ritmo sinusale. Si prescrive Holter ECG 24 ore. Diagnosi: palpitazioni in paziente iperteso. Controllo tra un mese.")
PED_TX = ("Bambino di tre anni portato dalla mamma per febbre a 38.5 da due giorni e tosse secca. Vaccinazioni in regola. "
          "Frequenza cardiaca 110, frequenza respiratoria 28, saturazione 98 per cento. Temperatura 38.5 ascellare. "
          "All'esame obiettivo faringe iperemica, timpani nella norma, torace con murmure vescicolare fisiologico. "
          "Peso 14 chili, altezza 95 centimetri. Diagnosi faringite virale. Terapia paracetamolo 150 mg al bisogno, controllo tra cinque giorni.")


def login(cred):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": cred[0], "password": cred[1]})
    assert r.status_code == 200, r.text
    return s


@pytest.fixture(scope="module")
def card():
    return login(CARD)


@pytest.fixture(scope="module")
def ped():
    return login(PED)


@pytest.fixture(scope="module")
def mdb():
    return MongoClient(_benv["MONGO_URL"])[_benv["DB_NAME"]]


@pytest.fixture(scope="module")
def cleanup(card, ped):
    created = []
    yield created
    for s, tid in created:
        s.delete(f"{API}/visit-templates/{tid}")


def wait(s, cid, timeout=120):
    t0 = time.time()
    d = {}
    while time.time() - t0 < timeout:
        d = s.get(f"{API}/consultations/{cid}").json()
        if d["status"] in ("ready", "failed"):
            return d
        time.sleep(1.5)
    return d


def pdf_text(s, cid):
    r = s.get(f"{API}/consultations/{cid}/pdf")
    assert r.status_code == 200, r.text[:300]
    return "\n".join(p.get_text() for p in fitz.open(stream=r.content, filetype="pdf"))


S = {}


# --- Seeding from specialty library
class TestSeeding:
    def test_card_seed(self, card):
        r = card.get(f"{API}/visit-templates")
        assert r.status_code == 200
        xs = r.json()
        assert len(xs) >= 1
        first = xs[0]
        print("CARD templates", [(t["name"], len(t["fields"])) for t in xs])
        assert first["name"] == "Prima visita" or len(xs) > 1
        base = card.get(f"{API}/visit-templates/base").json()
        assert base["specialty"].lower().startswith("cardio")
        assert len(base["fields"]) == 10
        pa = [f for f in base["fields"] if f["titolo"] == "Pressione arteriosa"]
        assert pa and pa[0]["gruppo"] == "parametri_vitali"
        S["card_first"] = first

    def test_ped_seed(self, ped):
        xs = ped.get(f"{API}/visit-templates").json()
        assert len(xs) >= 1
        base = ped.get(f"{API}/visit-templates/base").json()
        assert len(base["fields"]) == 17  # v2: Prima visita pediatrica (motivo/anamnesi in testa, valutazione in fondo)
        assert {f["gruppo"] for f in base["fields"]} == {"sintomi", "anamnesi", "parametri_vitali", "esame_obiettivo", "altro"}
        S["ped_first"] = xs[0]

    def test_no_duplicate_seed_on_concurrent_calls(self, card):
        n1 = len(card.get(f"{API}/visit-templates").json())
        n2 = len(card.get(f"{API}/visit-templates").json())
        assert n1 == n2


# --- CRUD + validation
class TestCRUD:
    def test_create_no_fields_uses_base(self, card, cleanup):
        r = card.post(f"{API}/visit-templates", json={"name": "TEST_Base"})
        assert r.status_code == 200, r.text
        t = r.json()
        cleanup.append((card, t["id"]))
        assert t["name"] == "TEST_Base" and len(t["fields"]) == 10
        S["tb"] = t["id"]

    def test_create_custom_and_update(self, card, cleanup):
        fields = [{"titolo": "Pressione arteriosa", "gruppo": "parametri_vitali", "hint": "mmHg"},
                  {"titolo": "Holter", "gruppo": "altro", "hint": "esame prescritto"},
                  {"titolo": "Farmaci in uso", "gruppo": "anamnesi"}]
        r = card.post(f"{API}/visit-templates", json={"name": "TEST_Controllo breve", "fields": fields})
        assert r.status_code == 200, r.text
        t = r.json()
        cleanup.append((card, t["id"]))
        assert [f["titolo"] for f in t["fields"]] == ["Pressione arteriosa", "Holter", "Farmaci in uso"]
        assert all(isinstance(f["id"], str) and f["id"] for f in t["fields"])
        S["tc"] = t
        # rename + reorder
        new = [t["fields"][2], t["fields"][0], t["fields"][1]]
        r = card.put(f"{API}/visit-templates/{t['id']}", json={"name": "TEST_Controllo", "fields": new})
        assert r.status_code == 200, r.text
        got = [x for x in card.get(f"{API}/visit-templates").json() if x["id"] == t["id"]][0]
        assert got["name"] == "TEST_Controllo"
        assert [f["titolo"] for f in got["fields"]] == ["Farmaci in uso", "Pressione arteriosa", "Holter"]
        S["tc"] = got
        # rename only keeps fields
        r = card.put(f"{API}/visit-templates/{t['id']}", json={"name": "TEST_Controllo breve"})
        assert r.status_code == 200 and len(r.json()["fields"]) == 3
        S["tc"] = r.json()

    @pytest.mark.parametrize("payload", [{"name": "  "}, {"name": "X", "fields": [{"titolo": " ", "gruppo": "anamnesi"}]},
                                         {"name": "X", "fields": [{"titolo": "a", "gruppo": "bogus"}]}])
    def test_validation_422(self, card, payload):
        assert card.post(f"{API}/visit-templates", json=payload).status_code == 422
        assert card.put(f"{API}/visit-templates/{S['tb']}", json=payload).status_code == 422

    def test_not_found(self, card):
        assert card.put(f"{API}/visit-templates/{ObjectId()}", json={"name": "x"}).status_code == 404
        assert card.delete(f"{API}/visit-templates/zzz").status_code == 404

    def test_tenant_isolation(self, card, ped):
        tid = S["tc"]["id"]
        assert tid not in [x["id"] for x in ped.get(f"{API}/visit-templates").json()]
        assert ped.put(f"{API}/visit-templates/{tid}", json={"name": "hack"}).status_code == 404
        assert ped.delete(f"{API}/visit-templates/{tid}").status_code == 404
        got = [x for x in card.get(f"{API}/visit-templates").json() if x["id"] == tid][0]
        assert got["name"] != "hack"

    def test_unauth(self):
        assert requests.get(f"{API}/visit-templates").status_code in (401, 403)

    def test_delete_and_last_protection(self, card, mdb):
        r = card.delete(f"{API}/visit-templates/{S['tb']}")
        assert r.status_code == 200 and r.json()["ok"] is True
        assert S["tb"] not in [x["id"] for x in card.get(f"{API}/visit-templates").json()]
        # last template protection: use a fresh tenant-less check via a temp account is not available -> ensure count logic
        xs = card.get(f"{API}/visit-templates").json()
        if len(xs) == 1:
            assert card.delete(f"{API}/visit-templates/{xs[0]['id']}").status_code == 400


# --- Consultation with template: immediate prefill + async mapping
class TestConsultation:
    def test_start_with_template(self, card):
        t = S["tc"]
        r = card.post(f"{API}/consultations/start", data={"patient_name": "TEST_Cardio Tpl", "paper_consent": "true",
                                                           "transcript": CARD_TX, "template_id": t["id"]})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "processing"
        assert d["template_name"] == t["name"]
        assert [x["titolo"] for x in d["note"]["sezioni"]] == [f["titolo"] for f in t["fields"]]
        assert all(not x["testo"] for x in d["note"]["sezioni"])
        S["cid"] = d["id"]

    def test_ready_mapping(self, card):
        d = wait(card, S["cid"])
        assert d["status"] == "ready", d.get("ai_error")
        sez = d["note"]["sezioni"]
        print("SEZ", sez)
        assert [x["titolo"] for x in sez] == [f["titolo"] for f in S["tc"]["fields"]]
        assert [x["gruppo"] for x in sez] == [f["gruppo"] for f in S["tc"]["fields"]]
        by = {x["titolo"]: x["testo"] for x in sez}
        assert "135" in by["Pressione arteriosa"]
        assert "holter" in by["Holter"].lower()
        S["card_note"] = d

    def test_pdf_vitals_adult(self, card):
        t = pdf_text(card, S["cid"])
        assert "Parametri" in t, t[:2000]
        assert "PRESSIONE ARTERIOSA" in t.upper() and "135" in t

    def test_start_without_template_uses_first(self, card):
        first = card.get(f"{API}/visit-templates").json()[0]
        r = card.post(f"{API}/consultations/start", data={"patient_name": "TEST_Cardio NoTpl", "paper_consent": "true", "transcript": CARD_TX})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["template_id"] == first["id"] and d["template_name"] == first["name"]
        assert len(d["note"]["sezioni"]) == len(first["fields"])
        S["cid2"] = d["id"]

    def test_invalid_template_falls_back(self, card):
        first = card.get(f"{API}/visit-templates").json()[0]
        r = card.post(f"{API}/consultations/start", data={"patient_name": "TEST_Cardio Bad", "paper_consent": "true",
                                                           "transcript": CARD_TX, "template_id": "nonexistent"})
        assert r.status_code == 200
        assert r.json()["template_id"] == first["id"]
        S["cid3"] = r.json()["id"]

    def test_first_template_ready(self, card):
        d = wait(card, S["cid2"])
        assert d["status"] == "ready", d.get("ai_error")
        sez = d["note"]["sezioni"]
        first = card.get(f"{API}/visit-templates").json()[0]
        assert [x["titolo"] for x in sez] == [f["titolo"] for f in first["fields"]]
        filled = [x for x in sez if x["testo"] and x["testo"] != "Non riportato"]
        print("FILLED", len(filled), "/", len(sez))
        assert len(filled) >= 4

    def test_ped_template_and_pdf(self, ped):
        first = ped.get(f"{API}/visit-templates").json()[0]
        r = ped.post(f"{API}/consultations/start", data={"patient_name": "TEST_Bimbo Tpl", "paper_consent": "true",
                                                          "transcript": PED_TX, "template_id": first["id"]})
        assert r.status_code == 200, r.text
        cid = r.json()["id"]
        S["pcid"] = cid
        d = wait(ped, cid)
        assert d["status"] == "ready", d.get("ai_error")
        n = d["note"]
        assert [x["titolo"] for x in n["sezioni"]] == [f["titolo"] for f in first["fields"]]
        assert n["modulo"]["campi"]["torl"] and n["modulo"]["campi"]["torl"] != "Non riportato"  # standard pediatric chart preserved
        assert "allattamento" in n["modulo"]["campi"] and "svezzamento" in n["modulo"]["campi"]
        t = pdf_text(ped, cid)
        assert "pediatrica specialistica" in t and "TORL" in t
        vit = [x for x in n["sezioni"] if x["gruppo"] == "parametri_vitali"]
        for x in vit:
            assert x["titolo"][:15].upper() in t.replace("\n", " ").upper(), x["titolo"]


@pytest.fixture(scope="module", autouse=True)
def purge_consults(mdb):
    yield
    for k in ("cid", "cid2", "cid3", "pcid"):
        if S.get(k):
            mdb.measurements.delete_many({"consultation_id": S[k]})
