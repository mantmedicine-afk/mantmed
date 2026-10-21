"""Iteration 26: Bilanci di salute (pediatric visit templates per age band): seeding once, delete persistence, re-import, consultation."""
import time
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values

_env = dotenv_values(Path(__file__).resolve().parents[2] / "frontend" / ".env")
BASE_URL = (_env.get("REACT_APP_BACKEND_URL") or "").rstrip("/")
assert BASE_URL
API = f"{BASE_URL}/api"
PED = ("medico@mantmed.it", "Auscula-Studio-2026")
CARD = ("cardiologo.demo@example.com", "Cardio-Demo-2026")
KEYS = ["1m", "3m", "6m", "9m", "12m", "18m", "2-3a", "5-6a", "8-10a", "11-14a"]
BANDS = {"1m": (0, 2), "3m": (2, 4.5), "6m": (4.5, 7.5), "9m": (7.5, 10.5), "12m": (10.5, 15), "18m": (15, 21),
         "2-3a": (21, 42), "5-6a": (42, 84), "8-10a": (84, 132), "11-14a": (132, 216)}
TX = ("Bilancio di salute dei 12 mesi. Bambina in buona salute, latte vaccino e pasti in famiglia, dorme bene tutta la notte. "
      "Vaccinazioni MPRV e meningococco eseguite. Fa i primi passi con appoggio, dice mamma e papà, indica gli oggetti. "
      "Peso 9,5 chili, lunghezza 75 centimetri. Riflesso rosso presente bilateralmente, nessuno strabismo. Udito nella norma. "
      "Quattro denti, nessuna carie. Piedi piatti fisiologici. Consigli su sicurezza domestica e seggiolino. Prossimo bilancio a 18 mesi.")


def login(c):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": c[0], "password": c[1]})
    assert r.status_code == 200, r.text
    return s


@pytest.fixture(scope="module")
def ped():
    s = login(PED)
    yield s
    s.post(f"{API}/visit-templates/bilanci", json={"keys": KEYS})  # always restore all 10


@pytest.fixture(scope="module")
def card():
    return login(CARD)


S = {}


# --- Seeding
class TestSeed:
    def test_ped_has_prima_and_10_bilanci(self, ped):
        r = ped.post(f"{API}/visit-templates/bilanci", json={"keys": KEYS})  # normalise state first
        assert r.status_code == 200
        xs = ped.get(f"{API}/visit-templates").json()
        names = [t["name"] for t in xs]
        assert any(not t["bilancio"] for t in xs), names
        bil = [t for t in xs if t["bilancio"]]
        assert sorted(t["bilancio"] for t in bil) == sorted(KEYS)
        for t in bil:
            assert (t["age_from"], t["age_to"]) == BANDS[t["bilancio"]], t
            assert 10 <= len(t["fields"]) <= 13, (t["name"], len(t["fields"]))
            assert t["name"].startswith("Bilancio di salute")
        S["bil"] = {t["bilancio"]: t for t in bil}

    def test_card_no_bilanci(self, card):
        xs = card.get(f"{API}/visit-templates").json()
        assert xs and not any(t.get("bilancio") for t in xs)
        lib = card.get(f"{API}/visit-templates/bilanci").json()
        assert all(b["imported"] is False for b in lib)

    def test_library(self, ped):
        lib = ped.get(f"{API}/visit-templates/bilanci").json()
        assert [b["key"] for b in lib] == KEYS
        assert all(b["imported"] for b in lib)
        assert all(b["fields"] and b["name"] for b in lib)

    def test_unauth(self):
        assert requests.get(f"{API}/visit-templates/bilanci").status_code in (401, 403)
        assert requests.post(f"{API}/visit-templates/bilanci", json={"keys": KEYS}).status_code in (401, 403)


# --- Delete not recreated, reimport idempotent
class TestDeleteReimport:
    def test_delete_not_recreated(self, ped):
        tid = S["bil"]["9m"]["id"]
        assert ped.delete(f"{API}/visit-templates/{tid}").status_code == 200
        for _ in range(2):
            xs = ped.get(f"{API}/visit-templates").json()
            assert "9m" not in [t["bilancio"] for t in xs]
        lib = {b["key"]: b["imported"] for b in ped.get(f"{API}/visit-templates/bilanci").json()}
        assert lib["9m"] is False and sum(lib.values()) == 9

    def test_reimport_only_missing(self, ped):
        r = ped.post(f"{API}/visit-templates/bilanci", json={"keys": KEYS})
        assert r.status_code == 200
        d = r.json()
        assert d["imported"] == 1
        bil = [t["bilancio"] for t in d["templates"] if t["bilancio"]]
        assert sorted(bil) == sorted(KEYS)
        r2 = ped.post(f"{API}/visit-templates/bilanci", json={"keys": KEYS}).json()
        assert r2["imported"] == 0 and len(r2["templates"]) == len(d["templates"])
        # existing (edited) templates are not overwritten
        assert [t for t in r2["templates"] if t["bilancio"] == "12m"][0]["id"] == S["bil"]["12m"]["id"]

    def test_unknown_and_invalid_keys(self, ped):
        r = ped.post(f"{API}/visit-templates/bilanci", json={"keys": ["bogus"]})
        assert r.status_code == 200 and r.json()["imported"] == 0
        assert ped.post(f"{API}/visit-templates/bilanci", json={}).status_code == 422

    def test_edit_preserved_after_reimport(self, ped):
        t = [x for x in ped.get(f"{API}/visit-templates").json() if x["bilancio"] == "3m"][0]
        r = ped.put(f"{API}/visit-templates/{t['id']}", json={"name": "TEST_3m edit", "fields": t["fields"][:3]})
        assert r.status_code == 200
        assert r.json()["bilancio"] == "3m"
        ped.post(f"{API}/visit-templates/bilanci", json={"keys": KEYS})
        got = [x for x in ped.get(f"{API}/visit-templates").json() if x["bilancio"] == "3m"]
        assert len(got) == 1 and got[0]["name"] == "TEST_3m edit" and len(got[0]["fields"]) == 3
        # restore: delete + reimport
        ped.delete(f"{API}/visit-templates/{t['id']}")
        assert ped.post(f"{API}/visit-templates/bilanci", json={"keys": ["3m"]}).json()["imported"] == 1


# --- Consultation with bilancio template keeps standard pediatric fields
class TestConsult:
    def test_consult_bilancio(self, ped):
        t = [x for x in ped.get(f"{API}/visit-templates").json() if x["bilancio"] == "12m"][0]
        r = ped.post(f"{API}/consultations/start", data={"patient_name": "TEST_Bimba Bilancio", "paper_consent": "true",
                                                          "transcript": TX, "template_id": t["id"]})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["template_id"] == t["id"]
        cid = d["id"]
        t0 = time.time()
        while time.time() - t0 < 120:
            d = ped.get(f"{API}/consultations/{cid}").json()
            if d["status"] in ("ready", "failed"):
                break
            time.sleep(2)
        assert d["status"] == "ready", d.get("ai_error")
        n = d["note"]
        assert [x["titolo"] for x in n["sezioni"]] == [f["titolo"] for f in t["fields"]]
        filled = [x for x in n["sezioni"] if x["testo"] and x["testo"] != "Non riportato"]
        print("FILLED", len(filled), "/", len(n["sezioni"]), n["sezioni"])
        assert len(filled) >= 6
        for k in ("torl", "allattamento", "svezzamento"):
            assert k in n, k
