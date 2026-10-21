"""Bodychart: save/load per visit, encryption at rest, history, PDF page only when included, portal visibility, RBAC."""
import base64
import io
import os
import subprocess
from datetime import datetime, timezone
from pathlib import Path
import pytest
import requests
from bson import ObjectId
from dotenv import dotenv_values
from pymongo import MongoClient

_env = dotenv_values(Path(__file__).resolve().parents[2] / "frontend" / ".env")
_benv = dotenv_values(Path(__file__).resolve().parents[1] / ".env")
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _env.get("REACT_APP_BACKEND_URL") or "").rstrip("/")
DB = MongoClient(_benv["MONGO_URL"])[_benv["DB_NAME"]]
PNG = "data:image/png;base64," + base64.b64encode(bytes.fromhex(
    "89504e470d0a1a0a0000000d4948445200000001000000010806000000" "1f15c4890000000d49444154789c6360f8cfc0f01f0005000201a5f5e0d70000000049454e44ae426082")).decode()


def _login(email, password):
    s = requests.Session()
    data = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}).json()
    if data.get("mfa_required"):
        code = subprocess.check_output(["python", "tests/totp_code.py"], cwd="/app/backend").decode().strip()
        assert s.post(f"{BASE_URL}/api/auth/2fa/verify", json={"mfa_token": data["mfa_token"], "code": code}).status_code == 200
    return s


@pytest.fixture(scope="module")
def ctx():
    import sys
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parents[1] / ".env")
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from crypto import seal_fields
    foti = DB.users.find_one({"email": "medico@mantmed.it"})
    parent = DB.users.find_one({"email": "genitore.demo@example.com"})
    pid = parent["children"][0]["patient_id"]
    cid = DB.consultations.insert_one({"patient_name": "TEST Bodychart", "patient_id": pid, "clinic": "Studio Centro", "owner_id": str(foti["_id"]),
                                       "created_at": datetime.now(timezone.utc).isoformat(), "portal_published": False, "report_sent_at": None,
                                       **seal_fields({"transcript": "TEST", "note": {}, "report_sent_to": None}, ("transcript", "note", "report_sent_to"))}).inserted_id
    yield {"doc": _login("medico@mantmed.it", "Auscula-Studio-2026"), "parent": _login("genitore.demo@example.com", "Portale-Demo-2026"), "cid": str(cid), "pid": pid}
    DB.bodycharts.delete_many({"consultation_id": str(cid)})
    DB.consultations.delete_one({"_id": cid})
    DB.audit.delete_many({"action": {"$in": ["bodychart_salvato", "referto_portale", "referto_pdf"]}, "at": {"$gte": datetime.now(timezone.utc).date().isoformat()}})
    DB.notifications.delete_many({"ref": str(cid)})


BODY = {"silhouette": "child", "include_in_report": False, "snapshot": PNG,
        "markers": [{"id": "m1", "view": "front", "x": 0.5, "y": 0.3, "cat": "trauma", "note": "Livido 2 cm"}],
        "strokes": [{"view": "back", "tool": "pen", "color": "#DC2626", "width": 2.5, "points": [[10, 10], [20, 20]]}]}


def test_save_load_history_and_encryption(ctx):
    s, cid = ctx["doc"], ctx["cid"]
    assert s.get(f"{BASE_URL}/api/consultations/{cid}/bodychart").json() is None
    r = s.put(f"{BASE_URL}/api/consultations/{cid}/bodychart", json=BODY)
    assert r.status_code == 200 and r.json()["counts"]["trauma"] == 1
    raw = DB.bodycharts.find_one({"consultation_id": cid})
    assert all(raw[k].startswith("enc:v1:") for k in ("markers", "strokes", "snapshot"))
    got = s.get(f"{BASE_URL}/api/consultations/{cid}/bodychart").json()
    assert got["markers"][0]["note"] == "Livido 2 cm" and got["strokes"][0]["view"] == "back" and got["snapshot"] == PNG
    hist = s.get(f"{BASE_URL}/api/patients/{ctx['pid']}/bodycharts").json()
    assert any(h["consultation_id"] == cid and "snapshot" not in h for h in hist)
    assert s.put(f"{BASE_URL}/api/consultations/{cid}/bodychart", json={**BODY, "snapshot": "data:image/jpeg;base64,xx"}).status_code == 422
    assert s.put(f"{BASE_URL}/api/consultations/{cid}/bodychart", json={**BODY, "markers": [{**BODY["markers"][0], "cat": "boh"}]}).status_code == 422


def test_pdf_page_only_when_included(ctx):
    import pymupdf
    s, cid = ctx["doc"], ctx["cid"]
    n0 = pymupdf.open(stream=s.get(f"{BASE_URL}/api/consultations/{cid}/pdf").content, filetype="pdf").page_count
    s.put(f"{BASE_URL}/api/consultations/{cid}/bodychart", json={**BODY, "include_in_report": True}).raise_for_status()
    doc = pymupdf.open(stream=s.get(f"{BASE_URL}/api/consultations/{cid}/pdf").content, filetype="pdf")
    assert doc.page_count == n0 + 1 and "Bodychart" in doc[-1].get_text() and "Livido 2 cm" in doc[-1].get_text()


def test_portal_visibility_and_rbac(ctx):
    s, p, cid = ctx["doc"], ctx["parent"], ctx["cid"]
    assert p.get(f"{BASE_URL}/api/portal/reports/{cid}/bodychart").status_code == 404
    assert p.get(f"{BASE_URL}/api/consultations/{cid}/bodychart").status_code == 403
    s.post(f"{BASE_URL}/api/consultations/{cid}/portal", json={"published": True}).raise_for_status()
    r = p.get(f"{BASE_URL}/api/portal/reports/{cid}/bodychart")
    assert r.status_code == 200 and r.json()["markers"][0]["note"] == "Livido 2 cm" and r.json()["snapshot"] == PNG
    kids = p.get(f"{BASE_URL}/api/portal/me").json()["children"]
    assert any(rep["id"] == cid and rep["bodychart"] for k in kids for rep in k["reports"])
    s.post(f"{BASE_URL}/api/consultations/{cid}/portal", json={"published": False}).raise_for_status()
    assert p.get(f"{BASE_URL}/api/portal/reports/{cid}/bodychart").status_code == 404
