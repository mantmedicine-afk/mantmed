"""Step 2 multi-specialty: Cardiologia/Dermatologia/Ginecologia modules, module settings, structured PDF, guardian privacy, portal riepilogo draft."""
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
PAR = ("genitore.demo@example.com", "Portale-Demo-2026")
CARD_TX = ("Paziente di 62 anni, iperteso e fumatore, viene per dolore toracico da sforzo. Allergico alla penicillina. Assume ramipril 5 mg al mattino. "
           "Condizioni generali buone. Pressione arteriosa 150 su 90 seduto braccio destro, seconda misurazione 145 su 88. "
           "Frequenza cardiaca 88 battiti, saturazione 97 per cento. Peso 82 chili, altezza 175 centimetri. "
           "All'auscultazione cardiaca soffio sistolico 2 su 6 al focolaio aortico. Polsi periferici presenti e simmetrici. "
           "ECG: ritmo sinusale, nessuna alterazione della ripolarizzazione. Il paziente riferisce di praticare nuoto due volte a settimana. "
           "Diagnosi: sospetta angina da sforzo. Terapia: bisoprololo 2,5 mg una volta al giorno. Richiedo ecocardiogramma e test da sforzo. Controllo tra due settimane.")
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
    for cid in STATE.get("created", []):
        mdb.consult_jobs.delete_many({"consultation_id": cid})
        mdb.consultations.delete_one({"_id": ObjectId(cid)})
    s = login(CARD)
    s.put(f"{BASE_URL}/api/settings/module", json={"choice": ""})
    s.post(f"{BASE_URL}/api/settings/module/reset", json={"choice": "cardiologia"})


def wait(s, cid, timeout=180):
    t0, d = time.time(), {}
    while time.time() - t0 < timeout:
        d = s.get(f"{BASE_URL}/api/consultations/{cid}").json()
        if d.get("status") in ("ready", "failed"):
            return d
        time.sleep(3)
    return d


def pdf_text(s, cid):
    r = s.get(f"{BASE_URL}/api/consultations/{cid}/pdf")
    assert r.status_code == 200, r.text[:300]
    return " ".join(" ".join(p.get_text() for p in fitz.open(stream=r.content, filetype="pdf")).split())


# --- catalog
def test_catalog(card):
    d = card.get(f"{BASE_URL}/api/specialty-modules").json()
    keys = [f["key"] for f in d["base"]]
    assert len(keys) == 9 and {"allergie", "farmaci_in_uso", "esame_obiettivo"} <= set(keys)
    assert {m["id"] for m in d["moduli"]} >= {"pediatria", "cardiologia", "dermatologia", "ginecologia", "generale"}


# --- module settings
def test_module_settings_flow(card):
    d = card.get(f"{BASE_URL}/api/settings/module").json()
    print("initial settings:", {k: d[k] for k in ("module_id", "auto", "choice", "notice")})
    assert d["module_id"] == "cardiologia" and d["auto"] == "cardiologia"
    STATE["notice_initial"] = d["notice"]
    assert card.post(f"{BASE_URL}/api/settings/module/notice-seen").status_code == 200
    assert card.get(f"{BASE_URL}/api/settings/module").json()["notice"] is False
    g = card.put(f"{BASE_URL}/api/settings/module", json={"choice": "generale"}).json()
    assert g["module_id"] == "generale" and g["choice"] == "generale"
    assert card.put(f"{BASE_URL}/api/settings/module", json={"choice": "xxx"}).status_code == 400
    a = card.put(f"{BASE_URL}/api/settings/module", json={"choice": ""}).json()
    assert a["module_id"] == "cardiologia" and a["choice"] == ""


def test_prefs(card):
    order = ["frequenza_cardiaca", "pressione"]
    d = card.put(f"{BASE_URL}/api/settings/module/prefs", json={"module_id": "cardiologia", "hidden": ["classe_funzionale", "bogus"], "order": order}).json()
    assert d["layout"]["nascosti"] == ["classe_funzionale"]
    assert d["layout"]["ordine"] == order


# --- cardiology visit
def test_card_visit(card):
    r = card.post(f"{BASE_URL}/api/consultations", json={"patient_name": "TEST_Cardio Step2", "paper_consent": True, "transcript": CARD_TX})
    assert r.status_code == 200, r.text[:300]
    cid = r.json()["id"]
    STATE.setdefault("created", []).append(cid)
    STATE["cid"] = cid
    d = r.json() if r.json().get("status") in ("ready", "failed") else wait(card, cid)
    assert d["status"] == "ready", d.get("ai_error")
    n = d["note"]
    STATE["note"] = n
    m = n["modulo"]
    print("modulo:", m)
    print("base:", {k: n.get(k) for k in ("allergie", "farmaci_in_uso", "esame_obiettivo")})
    print("sezioni:", n.get("sezioni"))
    assert m["id"] == "cardiologia"
    assert "classe_funzionale" in m.get("nascosti", [])
    assert m.get("ordine") == ["frequenza_cardiaca", "pressione"]
    p = m["campi"]["pressione"]
    assert isinstance(p, list) and len(p) >= 1
    assert {"sis", "dia", "note"} <= set(p[0]) and p[0]["sis"] == 150 and p[0]["dia"] == 90
    assert m["campi"]["frequenza_cardiaca"]["v"] == 88
    assert m["campi"]["saturazione"]["v"] == 97
    assert m["campi"]["peso"]["v"] == 82
    assert "sinusale" in m["campi"]["ecg"].lower()
    assert n["farmaci"] == []
    assert not n.get("crescita", {}).get("bmi")
    assert "penicillin" in (n.get("allergie") or "").lower()


def test_card_pdf_and_altre_voci(card):
    n = STATE.get("note") or pytest.skip("no visit")
    cid = STATE["cid"]
    t = pdf_text(card, cid)
    for s in ("Anamnesi", "Parametri", "Esame obiettivo", "Esami strumentali", "Diagnosi e terapia"):
        assert s.upper() in t.upper(), s
    assert "BMI" not in t and "Percentile" not in t
    assert "150/90" in t
    assert "Classe funzionale" not in t
    # altre voci: force a test one flagged da_verificare
    n2 = dict(n)
    n2["sezioni"] = [x for x in n.get("sezioni") or []] + [{"gruppo": "altre_voci", "titolo": "TEST_Voce extra", "testo": "TEST_testo voce", "fonte": "ai", "da_verificare": True}]
    assert card.patch(f"{BASE_URL}/api/consultations/{cid}", json={"note": n2}).status_code == 200
    got = card.get(f"{BASE_URL}/api/consultations/{cid}").json()["note"]["sezioni"]
    assert any(x["titolo"] == "TEST_Voce extra" and x.get("da_verificare") for x in got)
    assert "TEST_Voce extra" not in pdf_text(card, cid)
    for x in n2["sezioni"]:
        if x["titolo"] == "TEST_Voce extra":
            x["da_verificare"] = False
    assert card.patch(f"{BASE_URL}/api/consultations/{cid}", json={"note": n2}).status_code == 200
    t3 = pdf_text(card, cid)
    assert "TEST_VOCE EXTRA" in t3.upper() and "TEST_testo voce" in t3


def test_reset_prefs(card):
    d = card.post(f"{BASE_URL}/api/settings/module/reset", json={"choice": "cardiologia"}).json()
    assert d["layout"] == {"nascosti": [], "ordine": []}


# --- pediatric old visit unchanged
def test_ped_old_pdf_no_new_rows(ped):
    items = ped.get(f"{BASE_URL}/api/consultations").json()
    items = items if isinstance(items, list) else items.get("items", [])
    old = [c for c in items if c.get("status") == "ready" and not (c["note"].get("allergie") or "").strip() and not (c["note"].get("esame_obiettivo") or "").strip()
           and not (c["note"].get("farmaci_in_uso") or "").strip()]
    assert old
    t = pdf_text(ped, old[-1]["id"])
    assert "Allergie e intolleranze" not in t and "Esame obiettivo generale" not in t and "Farmaci in uso" not in t
    assert "TORL" in t.upper() or "Fisiologica" in t


# --- guardian privacy
def test_guardian_hidden_portal(ped):
    par = login(PAR)
    me = par.get(f"{BASE_URL}/api/portal/me")
    assert me.status_code == 200, me.text[:200]
    j = me.json()
    kids = j.get("children") or []
    print("portal keys:", list(j.keys()), "children:", len(kids))
    aurora = next((k for k in kids if "Aurora" in (k.get("patient") or {}).get("name", "")), None)
    if not aurora or not aurora.get("reports"):
        pytest.skip("no Aurora report in portal")
    rid = aurora["reports"][0]["id"]
    pid = aurora["patient"]["id"]
    r = ped.post(f"{BASE_URL}/api/consultations/{rid}/guardians", json={"share": False})
    try:
        assert r.status_code == 200 and r.json()["guardian_hidden"] is True
        assert ped.post(f"{BASE_URL}/api/consultations/{rid}/send-report").status_code == 409
        kids2 = par.get(f"{BASE_URL}/api/portal/me").json().get("children") or []
        a2 = next(k for k in kids2 if k["patient"]["id"] == pid)
        assert rid not in [x["id"] for x in a2.get("reports") or []]
        assert par.get(f"{BASE_URL}/api/portal/reports/{rid}/pdf").status_code == 404
    finally:
        r2 = ped.post(f"{BASE_URL}/api/consultations/{rid}/guardians", json={"share": True})
        assert r2.status_code == 200 and r2.json()["guardian_hidden"] is False
    kids3 = par.get(f"{BASE_URL}/api/portal/me").json().get("children") or []
    a3 = next(k for k in kids3 if k["patient"]["id"] == pid)
    assert rid in [x["id"] for x in a3.get("reports") or []]
    # riepilogo draft check (read only)
    mdb = MongoClient(_benv["MONGO_URL"])[_benv["DB_NAME"]]
    for rep in a3["reports"]:
        c = mdb.consultations.find_one({"_id": ObjectId(rep["id"])}, {"ai_provenance": 1})
        rf = ((c or {}).get("ai_provenance") or {}).get("parti", {}).get("riassunto_famiglia") or {}
        if rf.get("ai_generated") is True and rf.get("stato_revisione") == "bozza":
            assert rep["riepilogo"] == ""
        print("report", rep["id"], "riassunto stato:", rf.get("stato_revisione"), "riepilogo len:", len(rep.get("riepilogo") or ""))
