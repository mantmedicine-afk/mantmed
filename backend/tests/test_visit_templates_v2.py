# Modelli di visita v2: nuovi modelli (acuta/controllo/certificato), Prima visita pediatrica, bilanci con crescita/fine,
# campo "required", pending_fields (add/ignore), upgrade_once (Nuovo modello identico eliminato), /base?kind
import os
from datetime import datetime, timezone

import pytest
import requests
from bson import ObjectId
from dotenv import dotenv_values
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
PED = ("medico@mantmed.it", "Auscula-Studio-2026")
CARD = ("cardiologo.demo@example.com", "Cardio-Demo-2026")
EARLY = {"1m", "3m", "6m", "9m", "12m", "18m"}
_benv = dotenv_values("/app/backend/.env")


def login(creds):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": creds[0], "password": creds[1]})
    if r.status_code != 200:
        pytest.skip(f"login failed {r.status_code}")
    return s


@pytest.fixture(scope="module")
def ped():
    return login(PED)


@pytest.fixture(scope="module")
def card():
    return login(CARD)


@pytest.fixture(scope="module")
def mdb():
    return MongoClient(_benv["MONGO_URL"])[_benv["DB_NAME"]]


def by_kind(ts):
    return {t["kind"]: t for t in ts if t.get("kind")}


class TestPedTemplates:
    def test_no_nuovo_modello(self, ped):
        ts = ped.get(f"{API}/visit-templates").json()
        assert not [t for t in ts if t["name"] == "Nuovo modello"]

    def test_prima_visita(self, ped):
        p = by_kind(ped.get(f"{API}/visit-templates").json())["prima"]
        f = p["fields"]
        assert len(f) == 17
        assert f[0]["titolo"] == "Motivo della visita" and f[0]["required"] is True
        assert [x["titolo"] for x in f[1:4]] == ["Anamnesi familiare", "Anamnesi fisiologica", "Anamnesi patologica remota"]
        assert [(x["titolo"], x["required"]) for x in f[-3:]] == [("Diagnosi/Valutazione", True), ("Terapia", False), ("Indicazioni ai genitori", True)]
        assert any(x["titolo"] == "Peso e altezza con percentili" and x["gruppo"] == "parametri_vitali" for x in f)

    @pytest.mark.parametrize("kind,name,n,req", [("acuta", "Malattia acuta", 17, 5), ("controllo", "Controllo", 9, 4),
                                                 ("certificato", "Certificato sportivo non agonistico", 8, 5)])
    def test_extra_models(self, ped, kind, name, n, req):
        t = by_kind(ped.get(f"{API}/visit-templates").json())[kind]
        assert t["name"] == name and len(t["fields"]) == n
        assert sum(bool(x["required"]) for x in t["fields"]) == req

    def test_bilanci_pending(self, ped):
        ts = [t for t in ped.get(f"{API}/visit-templates").json() if t["bilancio"]]
        for t in ts:
            p = [x["titolo"] for x in t["pending_fields"]]
            if not p:
                continue
            if t["bilancio"] in EARLY:
                assert p == ["Peso", "Lunghezza", "Circonferenza cranica", "Valutazione complessiva", "Indicazioni ai genitori", "Prossimo bilancio"], t["name"]
            else:
                assert p == ["Valutazione complessiva", "Indicazioni ai genitori", "Prossimo bilancio"], t["name"]

    def test_bilanci_library(self, ped):
        lib = ped.get(f"{API}/visit-templates/bilanci").json()
        assert len(lib) == 10
        for b in lib:
            f = b["fields"]
            assert [(x["titolo"], x["required"]) for x in f[-3:]] == [("Valutazione complessiva", True), ("Indicazioni ai genitori", True), ("Prossimo bilancio", False)]
            titles = [x["titolo"] for x in f]
            if b["key"] in EARLY:
                i = titles.index("Peso")
                assert titles[i:i + 3] == ["Peso", "Lunghezza", "Circonferenza cranica"]
                assert all(x["required"] and x["gruppo"] == "parametri_vitali" for x in f[i:i + 3])
                assert f[i - 1]["gruppo"] == "anamnesi" and f[i + 3]["gruppo"] != "anamnesi"
            else:
                assert "Circonferenza cranica" not in titles

    def test_base_kind(self, ped):
        for kind, n in (("acuta", 17), ("controllo", 9), ("certificato", 8)):
            b = ped.get(f"{API}/visit-templates/base", params={"kind": kind}).json()
            assert len(b["fields"]) == n
        b = ped.get(f"{API}/visit-templates/base").json()
        assert len(b["fields"]) == 17 and b["fields"][0]["titolo"] == "Motivo della visita"


class TestCardio:
    def test_extra_models_added(self, card):
        k = by_kind(card.get(f"{API}/visit-templates").json())
        assert {"prima", "acuta", "controllo", "certificato"} <= set(k)
        assert not [t for t in card.get(f"{API}/visit-templates").json() if t["bilancio"]]


class TestRequiredAndPending:
    def test_required_persists(self, ped):
        r = ped.post(f"{API}/visit-templates", json={"name": "TEST_Req", "fields": [{"titolo": "A", "gruppo": "altro", "required": True}, {"titolo": "B"}]})
        assert r.status_code == 200
        tid = r.json()["id"]
        try:
            t = [x for x in ped.get(f"{API}/visit-templates").json() if x["id"] == tid][0]
            assert [f["required"] for f in t["fields"]] == [True, False]
            f = t["fields"]
            f[1]["required"] = True
            u = ped.put(f"{API}/visit-templates/{tid}", json={"name": "TEST_Req", "fields": f})
            assert u.status_code == 200
            t = [x for x in ped.get(f"{API}/visit-templates").json() if x["id"] == tid][0]
            assert [f["required"] for f in t["fields"]] == [True, True]
        finally:
            ped.delete(f"{API}/visit-templates/{tid}")

    def test_pending_add_ignore(self, ped, mdb):
        tid = ped.post(f"{API}/visit-templates", json={"name": "TEST_Pending", "fields": [{"titolo": "A"}]}).json()["id"]
        pend = [{"id": "p1", "titolo": "P1", "gruppo": "altro", "hint": "", "required": True}]
        try:
            mdb.visit_templates.update_one({"_id": ObjectId(tid)}, {"$set": {"pending_fields": pend}})
            r = ped.post(f"{API}/visit-templates/{tid}/pending", json={"action": "add"})
            assert r.status_code == 200
            d = r.json()
            assert [f["titolo"] for f in d["fields"]] == ["A", "P1"] and d["pending_fields"] == []
            mdb.visit_templates.update_one({"_id": ObjectId(tid)}, {"$set": {"pending_fields": pend}})
            d = ped.post(f"{API}/visit-templates/{tid}/pending", json={"action": "ignore"}).json()
            assert [f["titolo"] for f in d["fields"]] == ["A", "P1"] and d["pending_fields"] == []
            assert ped.post(f"{API}/visit-templates/{tid}/pending", json={"action": "bad"}).status_code == 422
            assert ped.post(f"{API}/visit-templates/{'0' * 24}/pending", json={"action": "add"}).status_code == 404
        finally:
            ped.delete(f"{API}/visit-templates/{tid}")


class TestUpgrade:
    def test_nuovo_modello_identical_deleted(self, card, mdb):
        u = mdb.users.find_one({"email": CARD[0]})
        owner = str(u["_id"])
        prima = mdb.visit_templates.find_one({"owner_id": owner, "seed": True})
        ts = datetime.now(timezone.utc).isoformat()
        same = mdb.visit_templates.insert_one({"owner_id": owner, "name": "Nuovo modello", "fields": prima["fields"], "created_at": ts, "updated_at": ts}).inserted_id
        mod = mdb.visit_templates.insert_one({"owner_id": owner, "name": "Nuovo modello", "fields": prima["fields"], "created_at": ts,
                                              "updated_at": ts, "modified": True}).inserted_id
        try:
            mdb.users.update_one({"_id": u["_id"]}, {"$set": {"templates_v": 1}})
            ids = {t["id"] for t in card.get(f"{API}/visit-templates").json()}
            assert str(same) not in ids
            assert str(mod) in ids
            assert mdb.users.find_one({"_id": u["_id"]})["templates_v"] == 2
            after = mdb.visit_templates.find_one({"_id": prima["_id"]})
            assert [f["titolo"] for f in after["fields"]] == [f["titolo"] for f in prima["fields"]]
            assert sum(1 for t in card.get(f"{API}/visit-templates").json() if t.get("kind") == "acuta") == 1
        finally:
            mdb.visit_templates.delete_many({"_id": {"$in": [same, mod]}})
            mdb.users.update_one({"_id": u["_id"]}, {"$set": {"templates_v": 2}})
