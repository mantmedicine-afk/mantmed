"""Iteration 74: Ophthalmology module (schema, AI eye placement, PDF OD/OS), seeded visit, PATCH persistence."""
import io
import os
import time
from pathlib import Path

import pytest
import requests
from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv(Path(__file__).parents[2] / "frontend/.env")
load_dotenv(Path(__file__).parents[1] / ".env")
BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"
OCU = ("oculista.demo@example.com", "Oculista-Demo-2026")
DBM = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
CREATED = {"consults": []}
STATE = {}

TRANSCRIPT = ("Medico: Buongiorno. Paziente: vedo sfocato da lontano. "
              "Medico: visus naturale occhio destro 3 decimi, occhio sinistro 6 decimi. "
              "Refrazione: occhio destro sfera meno 2,25 cilindro meno 0,50 asse 90; occhio sinistro sfera meno 1,75. "
              "Tonometria Goldmann: destro 15, sinistro 18. "
              "Cristallino con lieve opacità. Cornea trasparente in entrambi gli occhi. "
              "Prescrivo timololo collirio nell'occhio sinistro due volte al giorno e lacrime artificiali tre volte al giorno. "
              "Controllo tra sei mesi.")


def login(email, pw):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/auth/login", json={"email": email, "password": pw})
    if r.status_code != 200:
        pytest.skip(f"login failed {email}: {r.status_code}")
    return s


@pytest.fixture(scope="module")
def ocu():
    return login(*OCU)


@pytest.fixture(scope="module", autouse=True)
def cleanup():
    yield
    from bson import ObjectId
    for cid in CREATED["consults"]:
        doc = DBM.consultations.find_one({"_id": ObjectId(cid)}, {"patient_id": 1})
        DBM.consultations.delete_one({"_id": ObjectId(cid), "patient_name": {"$regex": "^TEST_"}})
        if doc and doc.get("patient_id"):
            if DBM.patients.delete_one({"_id": ObjectId(doc["patient_id"]), "name": {"$regex": "^TEST_"}}).deleted_count:
                DBM.consents.delete_many({"patient_id": doc["patient_id"]})


# Module schema
class TestSchema:
    def test_oft_module_fields(self):
        r = requests.get(f"{BASE_URL}/specialty-modules")
        assert r.status_code == 200
        data = r.json()
        mods = data if isinstance(data, list) else data.get("moduli") or data.get("modules") or list(data.values())
        if isinstance(mods, dict):
            mods = list(mods.values())
        m = next((x for x in mods if isinstance(x, dict) and x.get("id") == "oftalmologia"), None)
        assert m, str(data)[:300]
        f = {x["key"]: x for x in m["campi"]}
        for k in ("patologie_oculari", "correzione_in_uso", "colliri_in_uso", "familiarita_oculare", "sintomi_visivi", "visus_naturale",
                  "visus_corretto", "refrazione", "refrazione_fonte", "tonometria", "palpebre", "congiuntiva", "cornea", "camera_anteriore",
                  "iride", "cristallino", "papilla", "macula", "vasi", "periferia", "pupille", "motilita", "cover_test", "stereopsi", "oct",
                  "campo_visivo", "pachimetria", "topografia", "fluorangiografia", "terapia_oculare", "prescrizione_tipo", "occhiali_lontano",
                  "occhiali_vicino", "distanza_interpupillare", "lenti_contatto", "prescrizione_note", "accertamenti"):
            assert k in f, k
        sub = lambda k: {x["k"]: x for x in f[k]["sub"]}
        assert f["refrazione"]["tipo"] == "occhi"
        r_ = sub("refrazione")
        assert set(r_) >= {"sfera", "cilindro", "asse", "addizione"}
        assert (r_["asse"]["min"], r_["asse"]["max"]) == (0, 180)
        assert (r_["sfera"]["min"], r_["sfera"]["max"]) == (-30, 30)
        assert (r_["cilindro"]["min"], r_["cilindro"]["max"]) == (-10, 10)
        assert (r_["addizione"]["min"], r_["addizione"]["max"]) == (0, 4)
        t = sub("tonometria")
        assert set(t) >= {"mmhg", "metodo", "ora"} and (t["mmhg"]["min"], t["mmhg"]["max"]) == (0, 80)
        assert "prisma" in sub("occhiali_lontano")
        assert {"addizione", "prisma"} <= set(sub("occhiali_vicino"))
        assert {"curva_base", "diametro", "tipo_marca"} <= set(sub("lenti_contatto"))
        assert f["terapia_oculare"]["tipo"] == "terapia_occhi"
        assert f["motilita"]["tipo"] in ("testo", None) or "sub" not in f["motilita"]


# Seeded visit
class TestSeeded:
    def test_seed_marco_visit(self, ocu):
        cs = ocu.get(f"{BASE_URL}/consultations").json()
        c = next((x for x in cs if x.get("patient_name") == "Marco Demo"), None)
        assert c, "seeded visit missing"
        full = ocu.get(f"{BASE_URL}/consultations/{c['id']}").json()
        campi = full["note"]["modulo"]["campi"]
        assert full["note"]["modulo"]["id"] == "oftalmologia"
        print("cristallino:", campi["cristallino"], "terapia:", campi["terapia_oculare"])
        assert campi["cristallino"]["nota"].strip()
        assert not campi["cristallino"]["od"].get("v") and not campi["cristallino"]["os"].get("v")
        assert any("lacrim" in x["farmaco"].lower() and x["occhio"] == "OO" for x in campi["terapia_oculare"])
        STATE["seed"] = full

    def test_seed_patch_persist_restore(self, ocu):
        full = STATE.get("seed") or pytest.skip("no seed")
        note = full["note"]
        orig = note["modulo"]["campi"]["cristallino"]["nota"]
        note["modulo"]["campi"]["cristallino"]["nota"] = ""
        r = ocu.patch(f"{BASE_URL}/consultations/{full['id']}", json={"note": note})
        assert r.status_code == 200, r.text
        got = ocu.get(f"{BASE_URL}/consultations/{full['id']}").json()
        assert got["note"]["modulo"]["campi"]["cristallino"]["nota"] == ""
        note["modulo"]["campi"]["cristallino"]["nota"] = orig
        r = ocu.patch(f"{BASE_URL}/consultations/{full['id']}", json={"note": note})
        assert r.status_code == 200
        assert ocu.get(f"{BASE_URL}/consultations/{full['id']}").json()["note"]["modulo"]["campi"]["cristallino"]["nota"] == orig


# AI eye placement
class TestAI:
    def test_start_and_ready(self, ocu):
        r = ocu.post(f"{BASE_URL}/consultations/start", data={"patient_name": "TEST_OFT_Paziente", "transcript": TRANSCRIPT, "paper_consent": "true"}, timeout=60)
        assert r.status_code == 200, r.text
        c = r.json()
        CREATED["consults"].append(c["id"])
        for _ in range(60):
            if c.get("status") != "processing":
                break
            time.sleep(3)
            c = ocu.get(f"{BASE_URL}/consultations/{c['id']}").json()
        assert c["status"] == "ready", c.get("ai_error")
        STATE["ai"] = c

    def test_unspecified_eye(self):
        c = STATE.get("ai") or pytest.skip("no AI")
        campi = c["note"]["modulo"]["campi"]
        cr = campi["cristallino"]
        print("cristallino", cr, "cornea", campi["cornea"])
        assert "opacit" in cr["nota"].lower()
        assert not cr["od"].get("v") and not cr["os"].get("v")
        assert campi["cornea"]["od"]["v"] and campi["cornea"]["os"]["v"]

    def test_numbers_as_dictated(self):
        c = STATE.get("ai") or pytest.skip("no AI")
        rf = c["note"]["modulo"]["campi"]["refrazione"]
        print("refrazione", rf, "tono", c["note"]["modulo"]["campi"]["tonometria"])
        assert "2,25" in rf["od"]["sfera"] and "-" in rf["od"]["sfera"]
        assert rf["od"]["asse"].strip().startswith("90")
        assert "1,75" in rf["os"]["sfera"]
        assert not rf["os"]["cilindro"] and not rf["os"]["asse"]

    def test_drops(self):
        c = STATE.get("ai") or pytest.skip("no AI")
        t = c["note"]["modulo"]["campi"]["terapia_oculare"]
        print("terapia_oculare", t, "| base terapia:", c["note"].get("terapia"))
        tim = next(x for x in t if "timolol" in x["farmaco"].lower())
        assert tim["occhio"] == "OS"
        lac = next(x for x in t if "lacrim" in x["farmaco"].lower())
        assert lac["occhio"] == ""
        base = (c["note"].get("terapia") or "").lower()
        assert "timolol" not in base and "lacrim" not in base

    def test_pdf(self, ocu):
        c = STATE.get("ai") or pytest.skip("no AI")
        r = ocu.get(f"{BASE_URL}/consultations/{c['id']}/pdf")
        assert r.status_code == 200 and r.content[:4] == b"%PDF"
        from pypdf import PdfReader
        txt = "\n".join(p.extract_text() for p in PdfReader(io.BytesIO(r.content)).pages)
        STATE["pdf"] = txt
        print(txt[:3000])
        assert "OD:" in txt and "OS:" in txt
        assert "Occhio non specificato:" in txt
        assert "Fluorangiografia" not in txt and "Topografia" not in txt
