"""Verifica reale (via API) che la visita di Ginecologia di una paziente minorenne non sia visibile al tutore finché il medico non la condivide.
Richiede i dati di prova di scripts/seed_gyn_demo.py."""
import os
from pathlib import Path

import pytest
import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).parents[2] / "frontend/.env")
BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"


def login(email, pw):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/auth/login", json={"email": email, "password": pw})
    assert r.status_code == 200, r.text
    return s


@pytest.fixture(scope="module")
def ctx():
    doc = login("ginecologo.demo@example.com", "Gineco-Demo-2026")
    tut = login("tutore.demo@example.com", "Tutore-Demo-2026")
    pat = next(p for p in doc.get(f"{BASE_URL}/patients").json() if p["name"] == "Giulia Demo")
    visit = next(c for c in doc.get(f"{BASE_URL}/consultations").json() if c.get("patient_id") == pat["id"])
    if not visit["guardian_hidden"]:
        doc.post(f"{BASE_URL}/consultations/{visit['id']}/guardians", json={"share": False})
    yield doc, tut, pat["id"], visit["id"]
    doc.post(f"{BASE_URL}/consultations/{visit['id']}/guardians", json={"share": False})  # stato finale: riservata


def guardian_sees(tut, pid, cid) -> dict:
    me = tut.get(f"{BASE_URL}/portal/me").json()
    child = next(k for k in me["children"] if k["patient"]["id"] == pid)
    passport = tut.get(f"{BASE_URL}/portal/passport/{pid}").json()
    notifs = tut.get(f"{BASE_URL}/portal/notifications").json()
    notifs = notifs.get("items", notifs) if isinstance(notifs, dict) else notifs
    return {"portal": cid in [r["id"] for r in child.get("reports") or []],
            "pdf": tut.get(f"{BASE_URL}/portal/reports/{cid}/pdf").status_code == 200,
            "passport": cid in [v.get("id") for v in passport.get("visits") or []],
            "bodychart": (tut.get(f"{BASE_URL}/portal/reports/{cid}/bodychart").json() or {}) not in ({}, None) if tut.get(f"{BASE_URL}/portal/reports/{cid}/bodychart").status_code == 200 else False,
            "notification": any(n.get("ref") == cid for n in notifs or [])}


def test_minor_gyn_visit_hidden_from_guardian(ctx):
    doc, tut, pid, cid = ctx
    v = next(c for c in doc.get(f"{BASE_URL}/consultations").json() if c["id"] == cid)
    assert v["note"]["modulo"]["id"] == "ginecologia" and v["guardian_hidden"] is True
    assert v["portal_published"] is True and v["signed_at"]  # firmata e pubblicata: è solo la riserva a nasconderla
    seen = guardian_sees(tut, pid, cid)
    assert not any(seen.values()), seen
    r = doc.post(f"{BASE_URL}/consultations/{cid}/send-report")
    assert r.status_code == 409 and "riservata" in r.json()["detail"].lower()


def test_visible_only_after_share(ctx):
    doc, tut, pid, cid = ctx
    r = doc.post(f"{BASE_URL}/consultations/{cid}/guardians", json={"share": True})
    assert r.status_code == 200 and r.json()["guardian_hidden"] is False
    seen = guardian_sees(tut, pid, cid)
    assert seen["portal"] and seen["pdf"] and seen["passport"], seen
    r = doc.post(f"{BASE_URL}/consultations/{cid}/send-report")
    # sblocco reale: si arriva all'invio (example.com è rifiutato dal provider, un indirizzo vero riceve l'email)
    assert r.status_code == 200 or (r.status_code == 422 and "non raggiungibile" in r.text), r.text
    r = doc.post(f"{BASE_URL}/consultations/{cid}/guardians", json={"share": False})
    assert r.json()["guardian_hidden"] is True
    seen = guardian_sees(tut, pid, cid)
    assert not seen["portal"] and not seen["pdf"] and not seen["passport"], seen
