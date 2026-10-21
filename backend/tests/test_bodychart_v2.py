"""Bodychart v2: mouth view, 'controllo' category, marker photos (upload/serve/RBAC), history w/ photos, PDF legend."""
import base64
import os
from datetime import datetime, timezone, timedelta
from pathlib import Path
import pytest
import requests
from dotenv import dotenv_values
from pymongo import MongoClient

_env = dotenv_values(Path(__file__).resolve().parents[2] / "frontend" / ".env")
_benv = dotenv_values(Path(__file__).resolve().parents[1] / ".env")
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _env.get("REACT_APP_BACKEND_URL")).rstrip("/")
DB = MongoClient(_benv["MONGO_URL"])[_benv["DB_NAME"]]
PNG_BYTES = bytes.fromhex("89504e470d0a1a0a0000000d4948445200000001000000010806000000"
                          "1f15c4890000000d49444154789c6360f8cfc0f01f0005000201a5f5e0d70000000049454e44ae426082")
PNG = "data:image/png;base64," + base64.b64encode(PNG_BYTES).decode()


def _login(email, pw):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pw})
    assert r.status_code == 200, r.text
    return s


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
    ids = []
    for d in (10, 0):
        ids.append(DB.consultations.insert_one({"patient_name": "TEST_Bodychart v2", "patient_id": pid, "clinic": "Studio Centro", "owner_id": str(doc["_id"]),
                                                "created_at": (datetime.now(timezone.utc) - timedelta(days=d)).isoformat(), "portal_published": False, "report_sent_at": None,
                                                **seal_fields({"transcript": "TEST", "note": {}, "report_sent_to": None}, ("transcript", "note", "report_sent_to"))}).inserted_id)
    yield {"doc": _login("medico@mantmed.it", "Auscula-Studio-2026"), "cardio": _login("cardiologo.demo@example.com", "Cardio-Demo-2026"),
           "parent": _login("genitore.demo@example.com", "Portale-Demo-2026"), "old": str(ids[0]), "cid": str(ids[1]), "pid": pid}
    for i in ids:
        DB.bodycharts.delete_many({"consultation_id": str(i)})
        DB.files.delete_many({"consultation_id": str(i), "purpose": "bodychart_photo"})
        DB.consultations.delete_one({"_id": i})


def _upload(s, cid, name="a.png", ctype="image/png", data=PNG_BYTES):
    return s.post(f"{BASE_URL}/api/consultations/{cid}/bodychart/photos", files={"file": (name, data, ctype)})


def test_photo_upload_and_serve(ctx):
    r = _upload(ctx["doc"], ctx["cid"])
    assert r.status_code == 200, r.text
    fid = r.json()["id"]
    assert isinstance(fid, str) and len(fid) == 24
    g = ctx["doc"].get(f"{BASE_URL}/api/bodychart-photos/{fid}")
    assert g.status_code == 200 and g.content == PNG_BYTES and g.headers["content-type"].startswith("image/png")
    ctx["fid"] = fid


def test_photo_upload_jpeg(ctx):
    r = _upload(ctx["doc"], ctx["cid"], "x.jpg", "image/jpeg", b"\xff\xd8\xff\xe0fakejpeg")
    assert r.status_code == 200


def test_photo_upload_non_image_400(ctx):
    r = _upload(ctx["doc"], ctx["cid"], "x.txt", "text/plain", b"hello")
    assert r.status_code == 400 and "Formato" in r.json().get("detail", "")


def test_photo_upload_other_doctor_404(ctx):
    assert _upload(ctx["cardio"], ctx["cid"]).status_code == 404


def test_photo_rbac(ctx):
    fid = ctx["fid"]
    assert ctx["cardio"].get(f"{BASE_URL}/api/bodychart-photos/{fid}").status_code == 404
    assert ctx["parent"].get(f"{BASE_URL}/api/bodychart-photos/{fid}").status_code in (401, 403)
    assert requests.get(f"{BASE_URL}/api/bodychart-photos/{fid}").status_code in (401, 403)
    assert ctx["doc"].get(f"{BASE_URL}/api/bodychart-photos/notanid").status_code == 404


def test_put_mouth_controllo_photos(ctx):
    fid = ctx["fid"]
    body = {"silhouette": "adult", "include_in_report": True, "snapshot": PNG, "strokes": [{"view": "mouth", "tool": "pen", "color": "#DC2626", "width": 2, "points": [[1, 1]]}],
            "markers": [{"id": "m1", "view": "mouth", "x": 0.5, "y": 0.4, "cat": "controllo", "note": "Controllo: carie", "photos": [fid]},
                        {"id": "m2", "view": "front", "x": 0.4, "y": 0.2, "cat": "nevo", "note": "Neo"}]}
    r = ctx["doc"].put(f"{BASE_URL}/api/consultations/{ctx['cid']}/bodychart", json=body)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["counts"]["controllo"] == 1 and d["counts"]["nevo"] == 1
    g = ctx["doc"].get(f"{BASE_URL}/api/consultations/{ctx['cid']}/bodychart").json()
    m1 = next(m for m in g["markers"] if m["id"] == "m1")
    assert m1["view"] == "mouth" and m1["photos"] == [fid]
    assert next(m for m in g["markers"] if m["id"] == "m2")["photos"] == []


def test_put_too_many_photos_422(ctx):
    body = {"silhouette": "child", "snapshot": PNG, "markers": [{"id": "m1", "view": "front", "x": 0.5, "y": 0.5, "cat": "lesione", "photos": ["a", "b", "c", "d", "e"]}]}
    assert ctx["doc"].put(f"{BASE_URL}/api/consultations/{ctx['cid']}/bodychart", json=body).status_code == 422


def test_put_bad_view_422(ctx):
    body = {"silhouette": "child", "snapshot": PNG, "markers": [{"id": "m1", "view": "top", "x": 0.5, "y": 0.5, "cat": "lesione"}]}
    assert ctx["doc"].put(f"{BASE_URL}/api/consultations/{ctx['cid']}/bodychart", json=body).status_code == 422


def test_history_includes_photos_and_order(ctx):
    old = {"silhouette": "child", "snapshot": PNG, "markers": [{"id": "o1", "view": "front", "x": 0.5, "y": 0.5, "cat": "lesione", "note": "Escoriazione"}]}
    assert ctx["doc"].put(f"{BASE_URL}/api/consultations/{ctx['old']}/bodychart", json=old).status_code == 200
    hist = ctx["doc"].get(f"{BASE_URL}/api/patients/{ctx['pid']}/bodycharts").json()
    mine = [h for h in hist if h["consultation_id"] in (ctx["old"], ctx["cid"])]
    assert len(mine) == 2
    assert [h["consultation_id"] for h in mine] == [ctx["cid"], ctx["old"]]  # desc by date
    cur = next(h for h in mine if h["consultation_id"] == ctx["cid"])
    assert any(m.get("photos") for m in cur["markers"]) and "snapshot" not in cur
    one = ctx["doc"].get(f"{BASE_URL}/api/bodycharts/{cur['id']}")
    assert one.status_code == 200 and one.json()["snapshot"] == PNG
    assert ctx["cardio"].get(f"{BASE_URL}/api/bodycharts/{cur['id']}").status_code == 404


def test_pdf_legend_renders(ctx):
    import pymupdf
    r = ctx["doc"].get(f"{BASE_URL}/api/consultations/{ctx['cid']}/pdf")
    assert r.status_code == 200
    pdf = pymupdf.open(stream=r.content, filetype="pdf")
    txt = pdf[-1].get_text()
    assert "Bodychart" in txt and "Controllo: carie" in txt and "Neo" in txt
