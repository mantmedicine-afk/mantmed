"""Step 1 multi-specialty: common base + versioned specialty module (note.modulo). Regression for pediatrician + cardiologist."""
import os
import time
from pathlib import Path

import fitz
import pytest
import requests
from bson import ObjectId
from dotenv import dotenv_values
from pymongo import MongoClient

_env = dotenv_values(Path(__file__).resolve().parents[2] / "frontend" / ".env")
_benv = dotenv_values(Path(__file__).resolve().parents[1] / ".env")
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _env.get("REACT_APP_BACKEND_URL") or "").rstrip("/")
PED = ("medico@mantmed.it", "Auscula-Studio-2026")
CARD = ("cardiologo.demo@example.com", "Cardio-Demo-2026")
MOD_KEYS = ("allattamento", "svezzamento", "torl", "torace_auscultazione", "addome")
PED_TX = ("Bambino di otto mesi portato dalla mamma per febbre a 38.5 da due giorni e tosse. Allattamento materno esclusivo fino a sei mesi, "
          "svezzamento iniziato a sei mesi con buona tolleranza. All'esame obiettivo: otoscopia timpano destro iperemico ed estroflesso, faringe iperemica. "
          "Torace: murmure vescicolare fisiologico, nessun rumore aggiunto. Addome trattabile, non dolente, non organomegalie. "
          "Peso 8.4 chili, lunghezza 70 centimetri. Diagnosi otite media acuta destra. Terapia amoxicillina 50 mg per chilo al giorno in due dosi per 7 giorni, "
          "paracetamolo 15 mg per chilo al bisogno. Controllo tra dieci giorni.")
CARD_TX = ("Paziente di 62 anni, iperteso, viene per dolore toracico da sforzo. Pressione arteriosa 150 su 90, frequenza cardiaca 88 regolare. "
           "All'auscultazione cardiaca soffio sistolico 2 su 6 al focolaio aortico. ECG: ritmo sinusale. Diagnosi: sospetta angina da sforzo. "
           "Terapia: bisoprololo 2,5 mg una volta al giorno. Controllo con ecocardiogramma tra due settimane.")
STATE = {}


def login(cred):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": cred[0], "password": cred[1]})
    if r.status_code != 200:
        pytest.skip(f"login failed {cred[0]}: {r.text[:200]}")
    return s


@pytest.fixture(scope="module")
def ped():
    return login(PED)


@pytest.fixture(scope="module")
def card():
    return login(CARD)


@pytest.fixture(scope="module", autouse=True)
def cleanup():
    yield
    mdb = MongoClient(_benv["MONGO_URL"])[_benv["DB_NAME"]]
    for k in ("ped_new", "card_new"):
        if STATE.get(k):
            mdb.measurements.delete_many({"consultation_id": STATE[k]})
            mdb.consult_jobs.delete_many({"consultation_id": STATE[k]})
            mdb.consultations.delete_one({"_id": ObjectId(STATE[k])})


def wait(s, cid, timeout=150):
    t0 = time.time()
    d = {}
    while time.time() - t0 < timeout:
        d = s.get(f"{BASE_URL}/api/consultations/{cid}").json()
        if d.get("status") in ("ready", "failed"):
            return d
        time.sleep(2)
    return d


def pdf_text(s, cid):
    r = s.get(f"{BASE_URL}/api/consultations/{cid}/pdf")
    assert r.status_code == 200, r.text[:300]
    return "\n".join(p.get_text() for p in fitz.open(stream=r.content, filetype="pdf"))


# --- catalog
def test_specialty_modules_catalog(ped):
    r = ped.get(f"{BASE_URL}/api/specialty-modules")
    assert r.status_code == 200
    d = r.json()
    assert len(d["base"]) == 6
    ids = {m["id"]: m for m in d["moduli"]}
    assert set(ids) >= {"pediatria", "generale"}
    assert [f["key"] for f in ids["pediatria"]["campi"]] == list(MOD_KEYS)
    assert ids["generale"]["campi"] == []
    assert "match" not in ids["pediatria"]


# --- list shape after migration
def test_list_notes_have_module_no_flat_keys(ped):
    r = ped.get(f"{BASE_URL}/api/consultations")
    assert r.status_code == 200
    items = r.json()
    items = items if isinstance(items, list) else items.get("items", [])
    assert items
    for c in items:
        n = c.get("note") or {}
        assert n.get("modulo", {}).get("id") in ("pediatria", "generale"), c["id"]
        assert n["modulo"]["versione"] == 1
        assert isinstance(n["modulo"]["campi"], dict)
        for k in MOD_KEYS:
            assert k not in n, (c["id"], k)
    old = [c for c in items if (c["note"]["modulo"]["campi"].get("torl") or "").strip() not in ("", "Non riportato")]
    assert old, "no old visit with torl"
    STATE["old"] = old[-1]
    print("ped list:", len(items), "with torl:", len(old))


def test_old_visit_pdf_has_module_values(ped):
    c = STATE["old"]
    t = pdf_text(ped, c["id"])
    norm = " ".join(t.split()).upper()
    assert "TORL" in norm and "ADDOME" in norm and "ALLATTAMENTO" in norm
    torl = " ".join(c["note"]["modulo"]["campi"]["torl"].split())
    assert torl[:25].upper() in norm, torl[:25]


# --- new pediatric visit
def test_ped_create_fills_module(ped):
    r = ped.post(f"{BASE_URL}/api/consultations", json={"patient_name": "TEST_Modulo Ped", "paper_consent": True, "transcript": PED_TX})
    assert r.status_code == 200, r.text[:300]
    STATE["ped_new"] = r.json()["id"]
    d = r.json() if r.json().get("status") in ("ready", "failed") else wait(ped, STATE["ped_new"])
    assert d["status"] == "ready", d.get("ai_error")
    n = d["note"]
    assert n["modulo"]["id"] == "pediatria"
    assert n["modulo"]["campi"]["torl"] not in ("", "Non riportato")
    assert n["modulo"]["campi"]["addome"] not in ("", "Non riportato")
    assert n["crescita"]["peso_kg"] == pytest.approx(8.4)
    assert n["farmaci"]
    for k in MOD_KEYS:
        assert k not in n
    assert "torl" in d.get("ai_fields_pending", []), d.get("ai_fields_pending")
    STATE["ped_note"] = n
    print("percentile:", n["crescita"].get("percentile_peso"), "pending:", d.get("ai_fields_pending"))


def test_patch_module_torl_persists(ped):
    n = dict(STATE["ped_note"])
    n["modulo"] = {**n["modulo"], "campi": {**n["modulo"]["campi"], "torl": "TEST_TORL modificato"}}
    r = ped.patch(f"{BASE_URL}/api/consultations/{STATE['ped_new']}", json={"note": n})
    assert r.status_code == 200, r.text[:300]
    d = ped.get(f"{BASE_URL}/api/consultations/{STATE['ped_new']}").json()
    assert d["note"]["modulo"]["campi"]["torl"] == "TEST_TORL modificato"
    assert "torl" not in d.get("ai_fields_pending", [])


def test_patch_legacy_flat_key(ped):
    n = {k: v for k, v in STATE["ped_note"].items() if k != "modulo"}
    n["addome"] = "TEST_Addome legacy"
    n["torl"] = "TEST_TORL legacy"
    r = ped.patch(f"{BASE_URL}/api/consultations/{STATE['ped_new']}", json={"note": n})
    assert r.status_code == 200, r.text[:300]
    d = ped.get(f"{BASE_URL}/api/consultations/{STATE['ped_new']}").json()
    assert d["note"]["modulo"]["id"] == "pediatria"
    assert d["note"]["modulo"]["campi"]["addome"] == "TEST_Addome legacy"
    assert "addome" not in d["note"]
    t = " ".join(pdf_text(ped, STATE["ped_new"]).split())
    assert "TEST_Addome legacy" in t


def test_visit_templates_module_id(ped):
    r = ped.get(f"{BASE_URL}/api/visit-templates")
    assert r.status_code == 200
    d = r.json()
    items = d if isinstance(d, list) else d.get("items") or d.get("templates") or []
    assert items
    assert all(t.get("module_id") == "pediatria" for t in items), [(t.get("name"), t.get("module_id")) for t in items]


# --- cardiologist
def test_card_create_generale(card):
    r = card.post(f"{BASE_URL}/api/consultations", json={"patient_name": "TEST_Modulo Card", "paper_consent": True, "transcript": CARD_TX})
    assert r.status_code == 200, r.text[:300]
    STATE["card_new"] = r.json()["id"]
    d = r.json() if r.json().get("status") in ("ready", "failed") else wait(card, STATE["card_new"])
    assert d["status"] == "ready", d.get("ai_error")
    n = d["note"]
    assert n["modulo"]["id"] == "generale"
    assert n["modulo"]["campi"] == {}
    titles = " ".join(x["titolo"].lower() for x in n["sezioni"])
    assert "pressione" in titles
    t = pdf_text(card, STATE["card_new"])
    assert "TORL" not in t and "Allattamento" not in t


def test_card_templates_module(card):
    r = card.get(f"{BASE_URL}/api/visit-templates")
    assert r.status_code == 200
    d = r.json()
    items = d if isinstance(d, list) else d.get("items") or d.get("templates") or []
    print("card templates:", [(t.get("name"), t.get("module_id")) for t in items])
    assert all(t.get("module_id") == "generale" for t in items)
