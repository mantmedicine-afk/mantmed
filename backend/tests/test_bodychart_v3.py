"""Bodychart v3: photo pipeline (EXIF strip/thumb/encrypt), intimate zones, proposed-pin drop, lesion history, MantAI suggest, report flag/PDF, audit, legacy."""
import io
import os
import re
import zlib
from datetime import datetime, timezone, timedelta
from pathlib import Path

import pytest
import requests
from bson import ObjectId
from dotenv import dotenv_values
from PIL import Image
from pymongo import MongoClient

_env = dotenv_values(Path(__file__).resolve().parents[2] / "frontend" / ".env")
_benv = dotenv_values(Path(__file__).resolve().parents[1] / ".env")
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _env.get("REACT_APP_BACKEND_URL")).rstrip("/")
DB = MongoClient(_benv["MONGO_URL"])[_benv["DB_NAME"]]
import uuid as _uuid
NAME = f"TEST_Bodychart v3 {_uuid.uuid4().hex[:6]}"
PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNg+M/wHwAEAQH/7yMK/wAAAABJRU5ErkJggg=="


def _login(email, pw):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pw})
    if r.status_code != 200:
        pytest.skip(f"login failed {email}")
    return s


def gps_jpeg(w=1200, h=900):
    img = Image.new("RGB", (w, h), (200, 120, 90))
    exif = Image.Exif()
    exif[0x010F] = "TestCam"
    exif[0x0110] = "ModelX"
    gps = {1: "N", 2: (45.0, 28.0, 0.0), 3: "E", 4: (9.0, 11.0, 0.0)}
    exif[0x8825] = gps
    b = io.BytesIO()
    img.save(b, "JPEG", exif=exif.tobytes())
    raw = b.getvalue()
    assert Image.open(io.BytesIO(raw)).getexif().get(0x8825) is not None
    return raw


def pdf_text(raw: bytes) -> str:
    out = []
    for m in re.finditer(rb"stream\r?\n(.*?)\r?\nendstream", raw, re.S):
        try:
            out.append(zlib.decompress(m.group(1)).decode("latin-1"))
        except Exception:
            try:
                import base64
                out.append(zlib.decompress(base64.a85decode(m.group(1).strip(), adobe=True)).decode("latin-1"))
            except Exception:
                pass
    return "\n".join(out)


@pytest.fixture(scope="module")
def ctx():
    import sys
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parents[1] / ".env")
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from crypto import seal_fields
    doc = DB.users.find_one({"email": "medico@mantmed.it"})
    parent = DB.users.find_one({"email": "genitore.demo@example.com"})
    pid = parent["children"][0]["patient_id"]
    note = {"esame_obiettivo": "Eruzione maculo-papulare al gomito destro; nevo di 3 mm sulla guancia sinistra. Faringe iperemica.",
            "diagnosi": "Dermatite atopica"}
    ids = []
    for d in (14, 0):
        ids.append(DB.consultations.insert_one({"patient_name": NAME, "patient_id": pid, "clinic": "Studio Centro", "owner_id": str(doc["_id"]),
                                                "doctor_id": str(doc["_id"]),
                                                "created_at": (datetime.now(timezone.utc) - timedelta(days=d)).isoformat(), "portal_published": False, "report_sent_at": None,
                                                **seal_fields({"transcript": "TEST", "note": note, "report_sent_to": None}, ("transcript", "note", "report_sent_to"))}).inserted_id)
    yield {"doc": _login("medico@mantmed.it", "Auscula-Studio-2026"), "parent": _login("genitore.demo@example.com", "Portale-Demo-2026"),
           "old": str(ids[0]), "cid": str(ids[1]), "pid": pid, "owner": str(doc["_id"])}
    for i in ids:
        DB.bodycharts.delete_many({"consultation_id": str(i)})
        DB.files.delete_many({"consultation_id": str(i), "purpose": "bodychart_photo"})
        DB.consultations.delete_one({"_id": i})


def _upload(s, cid, view="front", x=0.3, y=0.3, extra=None):
    data = {"view": view, "x": str(x), "y": str(y), **(extra or {})}
    return s.post(f"{BASE_URL}/api/consultations/{cid}/bodychart/photos", files={"file": ("gps.jpg", gps_jpeg(), "image/jpeg")}, data=data)


def _actions(owner, since):
    return [a["action"] for a in DB.audit.find({"owner_id": owner, "at": {"$gte": since}})]


def _base_chart(ctx):
    """Puts the canonical cid chart (p1 nevo/L1 with photo, size 0.4 macula) so tests don't depend on order."""
    if "photo" not in ctx:
        ctx["photo"] = _upload(ctx["doc"], ctx["cid"]).json()["id"]
    m = [{"id": "p1", "view": "front", "x": 0.3, "y": 0.3, "cat": "nevo", "note": "TEST nevo", "size_cm": 0.4, "descrittore": "macula",
          "stato": "attivo", "lesion_id": "L1", "origin": "medico", "photos": [ctx["photo"]]}]
    r = ctx["doc"].put(f"{BASE_URL}/api/consultations/{ctx['cid']}/bodychart", json={"silhouette": "child", "markers": m, "strokes": [], "snapshot": PNG})
    assert r.status_code == 200, r.text
    return r.json()


# --- Photo pipeline
def test_photo_exif_stripped_thumb_encrypted(ctx):
    r = _upload(ctx["doc"], ctx["cid"])
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["reserved"] is False and isinstance(j["id"], str)
    ctx["photo"] = j["id"]
    full = ctx["doc"].get(f"{BASE_URL}/api/bodychart-photos/{j['id']}")
    assert full.status_code == 200 and full.headers["content-type"].startswith("image/jpeg")
    im = Image.open(io.BytesIO(full.content))
    ex = im.getexif()
    assert len(ex) == 0 and ex.get(0x8825) is None, dict(ex)
    assert b"Exif" not in full.content[:200]
    th = ctx["doc"].get(f"{BASE_URL}/api/bodychart-photos/{j['id']}?size=thumb")
    assert th.status_code == 200
    ti = Image.open(io.BytesIO(th.content))
    assert max(ti.size) <= 360 and len(th.content) < len(full.content)
    rec = DB.files.find_one({"_id": ObjectId(j["id"])})
    assert rec["encrypted"] is True and rec["exif_stripped"] is True and rec["thumb_path"]


# --- Intimate zones
def test_intimate_requires_double_confirmation(ctx):
    since = datetime.now(timezone.utc).isoformat()
    r = _upload(ctx["doc"], ctx["cid"], x=0.5, y=0.48)
    assert r.status_code == 428, r.text
    r = _upload(ctx["doc"], ctx["cid"], x=0.5, y=0.48, extra={"conferma_necessita": "true"})
    assert r.status_code == 428
    r = _upload(ctx["doc"], ctx["cid"], x=0.5, y=0.48, extra={"conferma_necessita": "true", "conferma_consenso": "true"})
    assert r.status_code == 200, r.text
    assert r.json()["reserved"] is True
    ctx["reserved"] = r.json()["id"]
    assert "bodychart_foto_riservata_aggiunta" in _actions(ctx["owner"], since)


def test_parent_cannot_access_photo(ctx):
    ctx.setdefault("photo", _upload(ctx["doc"], ctx["cid"]).json()["id"])
    ctx.setdefault("reserved", _upload(ctx["doc"], ctx["cid"], x=0.5, y=0.48, extra={"conferma_necessita": "true", "conferma_consenso": "true"}).json()["id"])
    for fid in (ctx["photo"], ctx["reserved"]):
        r = ctx["parent"].get(f"{BASE_URL}/api/bodychart-photos/{fid}")
        assert r.status_code in (401, 403, 404), r.status_code


def test_unauth_cannot_access_photo(ctx):
    r = requests.get(f"{BASE_URL}/api/bodychart-photos/{ctx['photo']}")
    assert r.status_code in (401, 403)


# --- Save with new fields, proposed dropped, photo_meta
def test_put_new_fields_drops_proposed(ctx):
    markers = [
        {"id": "p1", "view": "front", "x": 0.3, "y": 0.3, "cat": "nevo", "note": "TEST nevo", "size_cm": 0.4, "descrittore": "macula",
         "stato": "attivo", "lesion_id": "L1", "origin": "medico", "photos": [ctx["photo"]]},
        {"id": "p2", "view": "front", "x": 0.5, "y": 0.48, "cat": "lesione", "note": "TEST intima", "photos": [ctx["reserved"]]},
        {"id": "ai1", "view": "head", "x": 0.69, "y": 0.49, "cat": "nevo", "note": "proposta", "origin": "mantai", "proposed": True},
        {"id": "p3", "view": "hand_palm", "x": 0.5, "y": 0.35, "cat": "eruzione", "origin": "mantai", "stato": "in_miglioramento"},
    ]
    r = ctx["doc"].put(f"{BASE_URL}/api/consultations/{ctx['cid']}/bodychart", json={"silhouette": "child", "markers": markers, "strokes": [], "snapshot": PNG})
    assert r.status_code == 200, r.text
    j = r.json()
    ids = {m["id"]: m for m in j["markers"]}
    assert set(ids) == {"p1", "p2", "p3"}
    assert ids["p1"]["size_cm"] == 0.4 and ids["p1"]["descrittore"] == "macula" and ids["p1"]["lesion_id"] == "L1"
    assert ids["p2"]["lesion_id"] == "p2" and ids["p2"]["stato"] == "attivo"
    assert ids["p3"]["origin"] == "mantai" and ids["p3"]["stato"] == "in_miglioramento"
    assert j["photo_meta"][ctx["photo"]]["reserved"] is False
    assert j["photo_meta"][ctx["reserved"]]["reserved"] is True
    g = ctx["doc"].get(f"{BASE_URL}/api/consultations/{ctx['cid']}/bodychart").json()
    assert {m["id"] for m in g["markers"]} == {"p1", "p2", "p3"}


def test_put_invalid_stato_422(ctx):
    m = [{"id": "x", "view": "front", "x": 0.1, "y": 0.1, "cat": "nevo", "stato": "boh"}]
    r = ctx["doc"].put(f"{BASE_URL}/api/consultations/{ctx['cid']}/bodychart", json={"silhouette": "child", "markers": m, "strokes": [], "snapshot": PNG})
    assert r.status_code == 422


# --- Lesion history across visits
def test_lesion_history(ctx):
    _base_chart(ctx)
    m = [{"id": "o1", "lesion_id": "L1", "view": "front", "x": 0.3, "y": 0.3, "cat": "nevo", "note": "TEST old", "stato": "attivo"}]
    r = ctx["doc"].put(f"{BASE_URL}/api/consultations/{ctx['old']}/bodychart", json={"silhouette": "child", "markers": m, "strokes": [], "snapshot": PNG})
    assert r.status_code == 200
    since = datetime.now(timezone.utc).isoformat()
    r = ctx["doc"].get(f"{BASE_URL}/api/patients/{ctx['pid']}/bodychart-lesions")
    assert r.status_code == 200
    j = r.json()
    l1 = next(l for l in j["lesions"] if l["lesion_id"] == "L1")
    mine = [e for e in l1["entries"] if e["consultation_id"] in (ctx["old"], ctx["cid"])]
    assert [e["consultation_id"] for e in mine] == [ctx["old"], ctx["cid"]]
    assert mine[1]["photos"] == [ctx["photo"]] and "stato" in mine[0]
    assert ctx["photo"] in j["photo_meta"]
    recent = (datetime.now(timezone.utc) - timedelta(minutes=10, seconds=-5)).isoformat()
    assert "bodychart_storia_visualizzata" in _actions(ctx["owner"], recent)  # deduped: present within 10 min window


# --- MantAI suggest
def test_suggest_returns_proposals_not_saved(ctx):
    before = ctx["doc"].get(f"{BASE_URL}/api/consultations/{ctx['cid']}/bodychart").json()
    since = datetime.now(timezone.utc).isoformat()
    r = ctx["doc"].post(f"{BASE_URL}/api/consultations/{ctx['cid']}/bodychart/suggest", timeout=90)
    assert r.status_code == 200, r.text
    props = r.json()["proposals"]
    print("PROPOSALS", props)
    assert len(props) >= 1
    for p in props:
        assert p["proposed"] is True and p["origin"] == "mantai" and {"view", "x", "y", "cat", "note", "regione"} <= p.keys()
    assert "bodychart_proposte_mantai" in _actions(ctx["owner"], since)  # first (uncached) call
    after = ctx["doc"].get(f"{BASE_URL}/api/consultations/{ctx['cid']}/bodychart").json()
    assert [m["id"] for m in after["markers"]] == [m["id"] for m in before["markers"]]


# --- Report flag + PDF
def test_report_flag_and_pdf(ctx):
    _base_chart(ctx)
    r = ctx["doc"].put(f"{BASE_URL}/api/consultations/{ctx['cid']}/bodychart/report", json={"include": True})
    assert r.status_code == 200 and r.json()["include_in_report"] is True
    assert DB.bodycharts.find_one({"consultation_id": ctx["cid"]})["include_in_report"] is True
    p = ctx["doc"].get(f"{BASE_URL}/api/consultations/{ctx['cid']}/pdf", timeout=60)
    assert p.status_code == 200, p.text[:300]
    txt = pdf_text(p.content)
    assert "Bodychart" in txt
    assert "0,4 cm" in txt or "0.4 cm" in txt
    assert "macula" in txt
    assert "Nevo / Macchia" in txt, "PDF category label must match UI"


def test_report_flag_no_chart_404(ctx):
    DB.bodycharts.delete_many({"consultation_id": "nonexistent"})
    cid = str(DB.consultations.find_one({"patient_name": {"$not": {"$regex": "^TEST_Bodychart"}}, "owner_id": ctx["owner"]}, {"_id": 1})["_id"])
    if DB.bodycharts.find_one({"consultation_id": cid}):
        pytest.skip("consultation has chart")
    r = ctx["doc"].put(f"{BASE_URL}/api/consultations/{cid}/bodychart/report", json={"include": True})
    assert r.status_code == 404


# --- Audit
def test_audit_actions(ctx):
    since = datetime.now(timezone.utc).isoformat()
    s = ctx["doc"]
    _base_chart(ctx)
    s.get(f"{BASE_URL}/api/consultations/{ctx['cid']}/bodychart")
    s.get(f"{BASE_URL}/api/consultations/{ctx['cid']}/bodychart?summary=true")
    s.get(f"{BASE_URL}/api/bodychart-photos/{ctx['photo']}?size=thumb")
    acts = _actions(ctx["owner"], since)
    assert acts.count("bodychart_visualizzato") <= 1, acts  # dedupe 10 min per subject
    assert "bodychart_foto_visualizzata" not in acts
    s.get(f"{BASE_URL}/api/bodychart-photos/{ctx['photo']}")
    s.get(f"{BASE_URL}/api/bodychart-photos/{ctx['photo']}")
    assert _actions(ctx["owner"], since).count("bodychart_foto_visualizzata") == 2  # full views logged every time
    base = {"silhouette": "child", "strokes": [], "snapshot": PNG}
    s.put(f"{BASE_URL}/api/consultations/{ctx['old']}/bodychart", json={**base, "markers": [
        {"id": "o1", "lesion_id": "L1", "view": "front", "x": 0.31, "y": 0.3, "cat": "nevo", "stato": "risolto"},
        {"id": "o2", "view": "back", "x": 0.5, "y": 0.3, "cat": "dolore"}]})
    s.put(f"{BASE_URL}/api/consultations/{ctx['old']}/bodychart", json={**base, "markers": [
        {"id": "o1", "lesion_id": "L1", "view": "front", "x": 0.31, "y": 0.3, "cat": "nevo", "stato": "risolto"}]})
    s.put(f"{BASE_URL}/api/consultations/{ctx['old']}/bodychart/report", json={"include": True})
    s.post(f"{BASE_URL}/api/consultations/{ctx['cid']}/bodychart/suggest", timeout=90)
    s.delete(f"{BASE_URL}/api/consultations/{ctx['old']}/bodychart")
    acts = _actions(ctx["owner"], since)
    for a in ("bodychart_foto_visualizzata", "bodychart_pin_aggiunti", "bodychart_pin_modificati", "bodychart_pin_eliminati",
              "bodychart_nel_referto", "bodychart_eliminato"):  # proposte_mantai: cached suggest -> logged only on first LLM call
        assert a in acts, (a, acts)
    st = s.get(f"{BASE_URL}/api/compliance/status").json()
    assert any(a["action"].startswith("bodychart_") for a in st["audit"])


# --- Legacy
def test_legacy_charts(ctx):
    legacy = list(DB.bodycharts.find({"patient_name": {"$exists": False}, "consultation_id": {"$nin": [ctx["cid"], ctx["old"]]}}, {"consultation_id": 1}))
    assert legacy, "no legacy charts"
    for d in legacy:
        r = ctx["doc"].get(f"{BASE_URL}/api/consultations/{d['consultation_id']}/bodychart")
        if r.status_code == 404:
            continue
        assert r.status_code == 200, r.text
        j = r.json()
        if not j:
            continue
        for m in j["markers"]:
            assert m["lesion_id"] and m["stato"] in ("attivo", "in_miglioramento", "risolto")
            assert 0 <= m["x"] <= 1 and 0 <= m["y"] <= 1


# --- Fix: pin moved into intimate zone -> photo forced reserved + audit
def test_photo_reserved_after_pin_moved_into_intimate_zone(ctx):
    since = datetime.now(timezone.utc).isoformat()
    r = _upload(ctx["doc"], ctx["cid"], x=0.2, y=0.2)
    fid = r.json()["id"]
    assert r.json()["reserved"] is False
    m = [{"id": "mv1", "view": "front", "x": 0.5, "y": 0.48, "cat": "lesione", "photos": [fid]}]
    j = ctx["doc"].put(f"{BASE_URL}/api/consultations/{ctx['cid']}/bodychart", json={"silhouette": "child", "markers": m, "strokes": [], "snapshot": PNG}).json()
    assert j["photo_meta"][fid]["reserved"] is True, "photo attached to a pin in the genital zone is not marked riservata"
    assert DB.files.find_one({"_id": ObjectId(fid)})["reserved"] is True
    assert "bodychart_foto_riservata_marcata" in _actions(ctx["owner"], since)
    # idempotent: re-save does not log again
    since2 = datetime.now(timezone.utc).isoformat()
    ctx["doc"].put(f"{BASE_URL}/api/consultations/{ctx['cid']}/bodychart", json={"silhouette": "child", "markers": m, "strokes": [], "snapshot": PNG})
    assert "bodychart_foto_riservata_marcata" not in _actions(ctx["owner"], since2)


# --- Fix: view/x/y required on upload
@pytest.mark.parametrize("missing", ["view", "x", "y"])
def test_upload_requires_view_xy(ctx, missing):
    data = {k: v for k, v in {"view": "front", "x": "0.3", "y": "0.3"}.items() if k != missing}
    r = ctx["doc"].post(f"{BASE_URL}/api/consultations/{ctx['cid']}/bodychart/photos", files={"file": ("g.jpg", gps_jpeg(200, 200), "image/jpeg")}, data=data)
    assert r.status_code == 422, r.text


# --- Fix: suggest cache + handled
def test_suggest_cached_and_handled(ctx):
    s = ctx["doc"]
    _base_chart(ctx)
    url = f"{BASE_URL}/api/consultations/{ctx['cid']}/bodychart/suggest"
    a = s.post(url, timeout=90).json()["proposals"]
    since = datetime.now(timezone.utc).isoformat()
    b = s.post(url, timeout=90).json()["proposals"]
    assert a == b and a, (a, b)
    assert "bodychart_proposte_mantai" not in _actions(ctx["owner"], since), "second call should hit cache"
    assert DB.bodychart_suggestions.find_one({"consultation_id": ctx["cid"]})["hash"]
    for p in a:
        assert p["id"] == f"ai-{p['regione_id']}"
    rid = a[0]["regione_id"]
    h = s.post(f"{url}/{rid}/handled")
    assert h.status_code == 200 and h.json()["ok"] is True
    c = s.post(url, timeout=90).json()["proposals"]
    assert rid not in [p["regione_id"] for p in c] and len(c) == len(a) - 1
    assert s.post(f"{url}/not_a_region/handled").status_code == 404
    assert ctx["parent"].post(f"{url}/{rid}/handled").status_code in (401, 403)


# --- Fix: view dedupe
def test_view_dedupe(ctx):
    _base_chart(ctx)
    s = ctx["doc"]
    s.get(f"{BASE_URL}/api/consultations/{ctx['cid']}/bodychart")
    since = datetime.now(timezone.utc).isoformat()
    for _ in range(3):
        s.get(f"{BASE_URL}/api/consultations/{ctx['cid']}/bodychart")
        s.get(f"{BASE_URL}/api/patients/{ctx['pid']}/bodychart-lesions")
    acts = _actions(ctx["owner"], since)
    assert "bodychart_visualizzato" not in acts and "bodychart_storia_visualizzata" not in acts, acts
