"""Vetrina: profili social del medico (GET/PUT /api/showcase/social-links, social_links pubblico, audit GDPR)."""
import os
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values

_env = dotenv_values(Path(__file__).resolve().parents[2] / "frontend" / ".env")
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _env.get("REACT_APP_BACKEND_URL") or "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL missing"

FOTI = ("medico@mantmed.it", "Auscula-Studio-2026")
PARENT = ("genitore.demo@example.com", "Portale-Demo-2026")
CARDIO = ("cardiologo.demo@example.com", "Cardio-Demo-2026")
SLUG = "tiziana-foti"
API = f"{BASE_URL}/api/showcase/social-links"
ALL = ["instagram", "facebook", "linkedin", "youtube", "tiktok", "x", "website"]
DEFAULT = [{"piattaforma": "website", "url": "https://studiofoti.it", "visibile": True},
           {"piattaforma": "instagram", "url": "@dott.rossi", "visibile": True},
           {"piattaforma": "facebook", "url": "https://facebook.com/studiofoti", "visibile": False}]


def _sess(email, pw):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pw})
    if r.status_code != 200:
        pytest.skip(f"login failed {email}: {r.status_code}")
    return s


def _full(rows):
    seen = {r["piattaforma"] for r in rows}
    return rows + [{"piattaforma": p, "url": "", "visibile": True} for p in ALL if p not in seen]


def _public():
    r = requests.get(f"{BASE_URL}/api/public/doctors/{SLUG}")
    assert r.status_code == 200, r.text
    return r.json()["social_links"]


@pytest.fixture(scope="module")
def foti():
    s = _sess(*FOTI)
    yield s
    r = s.put(API, json={"links": _full(DEFAULT)})  # ripristino stato richiesto
    assert r.status_code == 200, r.text


# GET structure
def test_get_structure(foti):
    r = foti.get(API)
    assert r.status_code == 200
    links = r.json()["links"]
    assert len(links) == 7
    assert {l["piattaforma"] for l in links} == set(ALL)
    for l in links:
        assert set(l) >= {"piattaforma", "label", "url", "visibile", "ordine"}


# Criterio 1 + normalizzazioni valide
@pytest.mark.parametrize("p,raw,exp", [
    ("instagram", "@dott.rossi", "https://instagram.com/dott.rossi"),
    ("linkedin", "mario-rossi", "https://linkedin.com/in/mario-rossi"),
    ("youtube", "@canale", "https://youtube.com/@canale"),
    ("facebook", "https://fb.com/x", "https://fb.com/x"),
    ("youtube", "https://youtu.be/abc", "https://youtu.be/abc"),
    ("x", "https://twitter.com/x", "https://twitter.com/x"),
    ("website", "studiorossi.it", "https://studiorossi.it"),
    ("tiktok", "@doc", "https://tiktok.com/@doc"),
    ("instagram", "www.instagram.com/abc/", "https://www.instagram.com/abc"),
])
def test_valid_normalization(foti, p, raw, exp):
    r = foti.put(API, json={"links": _full([{"piattaforma": p, "url": raw, "visibile": True}])})
    assert r.status_code == 200, r.text
    got = {l["piattaforma"]: l["url"] for l in r.json()["links"]}
    assert got[p] == exp
    assert {"piattaforma": p, "url": exp, "label": next(l["label"] for l in r.json()["links"] if l["piattaforma"] == p)} in _public()


# Criterio 2/3: rifiuti
@pytest.mark.parametrize("p,raw", [
    ("instagram", "instagram.fake.com"),
    ("instagram", "javascript:alert(1)"),
    ("website", "javascript:alert(1)"),
    ("website", "data:text/html,x"),
    ("instagram", "http://instagram.com/x"),
    ("website", "http://studio.it"),
    ("instagram", "https://user:pw@instagram.com/x"),
    ("instagram", "https://evil.com@instagram.com/x"),
    ("instagram", "https://instagram.com.evil.io/x"),
    ("instagram", "https://instagram.com/" + "a" * 300),
    ("instagram", "https://instagram.com/"),
    ("website", " JaVaScRiPt:alert(1)"),
    ("website", "https://studio.it/<script>"),
    ("facebook", "https://notfacebook.com/x"),
])
def test_invalid_rejected(foti, p, raw):
    before = foti.get(API).json()
    r = foti.put(API, json={"links": _full([{"piattaforma": p, "url": raw, "visibile": True}])})
    assert r.status_code == 422, r.text
    d = r.json()["detail"]
    assert isinstance(d, dict) and d.get("message") and p in d.get("errors", {})
    assert foti.get(API).json() == before  # nulla salvato


def test_instagram_fake_message(foti):
    r = foti.put(API, json={"links": _full([{"piattaforma": "instagram", "url": "instagram.fake.com"}])})
    assert r.status_code == 422
    assert "Inserisci un indirizzo di instagram.com valido" in r.json()["detail"]["errors"]["instagram"]


def test_duplicate_platform(foti):
    r = foti.put(API, json={"links": [{"piattaforma": "x", "url": "@a"}, {"piattaforma": "x", "url": "@b"}]})
    assert r.status_code == 422


def test_unknown_platform(foti):
    r = foti.put(API, json={"links": [{"piattaforma": "myspace", "url": "@a"}]})
    assert r.status_code == 422


# Criterio 4: visibile=false
def test_hidden_not_public(foti):
    r = foti.put(API, json={"links": _full([{"piattaforma": "instagram", "url": "@dott.rossi", "visibile": True},
                                            {"piattaforma": "facebook", "url": "https://facebook.com/studiofoti", "visibile": False}])})
    assert r.status_code == 200
    pub = _public()
    assert [l["piattaforma"] for l in pub] == ["instagram"]
    fb = next(l for l in r.json()["links"] if l["piattaforma"] == "facebook")
    assert fb["visibile"] is False and fb["url"] == "https://facebook.com/studiofoti"


# Criterio 5: ordine
def test_order_respected(foti):
    rows = [{"piattaforma": "x", "url": "@a", "visibile": True},
            {"piattaforma": "website", "url": "https://studiofoti.it", "visibile": True},
            {"piattaforma": "instagram", "url": "@dott.rossi", "visibile": True}]
    r = foti.put(API, json={"links": _full(rows)})
    assert r.status_code == 200
    assert [l["piattaforma"] for l in _public()] == ["x", "website", "instagram"]
    assert [l["piattaforma"] for l in r.json()["links"]][:3] == ["x", "website", "instagram"]


# Criterio 6: nessun link
def test_all_empty_and_all_hidden(foti):
    assert foti.put(API, json={"links": _full([])}).status_code == 200
    assert _public() == []
    rows = [{"piattaforma": "instagram", "url": "@a", "visibile": False}, {"piattaforma": "website", "url": "x.it", "visibile": False}]
    assert foti.put(API, json={"links": _full(rows)}).status_code == 200
    assert _public() == []


# Criterio 8: auth
def test_unauth_and_parent():
    assert requests.get(API).status_code in (401, 403)
    assert requests.put(API, json={"links": []}).status_code in (401, 403)
    p = _sess(*PARENT)
    assert p.get(API).status_code in (401, 403)
    assert p.put(API, json={"links": _full(DEFAULT)}).status_code in (401, 403)


def test_second_doctor_isolated(foti):
    foti.put(API, json={"links": _full(DEFAULT)})
    before = _public()
    c = _sess(*CARDIO)
    r = c.put(API, json={"links": _full([{"piattaforma": "tiktok", "url": "@cardio", "visibile": True}])})
    assert r.status_code == 200, r.text
    assert _public() == before
    assert any(l["url"] == "https://tiktok.com/@cardio" for l in c.get(API).json()["links"])
    c.put(API, json={"links": _full([])})


# Registro GDPR
def test_audit_entry_and_noop(foti):
    foti.put(API, json={"links": _full(DEFAULT)})
    def top():  # audit restituisce gli ultimi 15
        r = foti.get(f"{BASE_URL}/api/compliance/status")
        assert r.status_code == 200, r.text
        a = r.json().get("audit", [])
        return a[0] if a else {}
    t0 = top()
    foti.put(API, json={"links": _full(DEFAULT)})  # nessun cambiamento
    assert top() == t0
    foti.put(API, json={"links": _full(DEFAULT + [{"piattaforma": "x", "url": "@foti", "visibile": True}])})
    t1 = top()
    assert t1.get("action") == "vetrina_social_aggiornati" and t1 != t0, t1
    print("audit entry:", t1)
    foti.put(API, json={"links": _full(DEFAULT)})
