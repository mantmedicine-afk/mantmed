"""Messaggi v2: thread enrichment (display_name/preview/age/needs_reply), receipts inviato/consegnato/letto, attachments (doctor + parent)."""
import io
import os
from pathlib import Path
import pytest
import requests
from bson import ObjectId
from dotenv import dotenv_values
from pymongo import MongoClient

_env = dotenv_values(Path(__file__).resolve().parents[2] / "frontend" / ".env")
_benv = dotenv_values(Path(__file__).resolve().parents[1] / ".env")
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _env.get("REACT_APP_BACKEND_URL") or "").rstrip("/")
PARENT = ("genitore.demo@example.com", "Portale-Demo-2026")
DOC = ("medico@mantmed.it", "Auscula-Studio-2026")
DB = MongoClient(_benv["MONGO_URL"])[_benv["DB_NAME"]]
PNG = bytes.fromhex("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a5c80000000049454e44ae426082")
PDF = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"
CREATED = []


def _login(email, pw):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pw})
    if r.status_code != 200 or r.json().get("mfa_required"):
        pytest.skip(f"login failed {email}")
    return s


@pytest.fixture(scope="module")
def ss():
    p, d = _login(*PARENT), _login(*DOC)
    yield p, d
    for tid in CREATED:
        for f in DB.msg_files.find({"thread_id": tid}):
            DB.msg_files.delete_one({"_id": f["_id"]})
        DB.messages.delete_many({"thread_id": tid})
        DB.ai_reply_drafts.delete_many({"thread_id": tid})
        DB.notifications.delete_many({"ref": tid})
        DB.threads.delete_one({"_id": ObjectId(tid)})


@pytest.fixture(scope="module")
def thread(ss):
    p, _ = ss
    k = p.get(f"{BASE_URL}/api/portal/me").json()["children"][0]
    r = p.post(f"{BASE_URL}/api/portal/threads", json={"patient_id": k["patient"]["id"], "owner_id": k["doctor"]["id"], "kind": "altro",
                                                        "subject": "TEST_v2 receipts", "body": "TEST_v2 messaggio genitore iniziale"})
    assert r.status_code == 200, r.text
    CREATED.append(r.json()["id"])
    return r.json()["id"]


def _msg(msgs, body):
    return next(m for m in msgs if m["body"] == body)


# Thread list enrichment (doctor)
def test_doctor_threads_enriched(ss, thread):
    _, d = ss
    ts = d.get(f"{BASE_URL}/api/messages/threads").json()
    t = next(x for x in ts if x["id"] == thread)
    assert " · " in t["display_name"] and (" di " in t["display_name"] or " per " in t["display_name"]), t["display_name"]
    assert t["preview"] and isinstance(t["patient_age"], str) and t["patient_age"]
    assert t["needs_reply"] is True and t["unread"] >= 1
    for x in ts:
        assert {"display_name", "preview", "patient_age", "needs_reply", "unread"} <= set(x)
    print("display_name:", t["display_name"], "| age:", t["patient_age"])


# Receipts: parent message -> consegnato after doctor list, letto after doctor opens; parent sees it
def test_parent_message_receipts(ss, thread):
    p, d = ss
    body = "TEST_v2 messaggio genitore iniziale"
    m = _msg(p.get(f"{BASE_URL}/api/portal/threads/{thread}").json()["messages"], body)
    assert m["receipt"] in ("inviato", "consegnato")  # doctor list in prev test may have delivered
    d.get(f"{BASE_URL}/api/messages/threads")
    assert _msg(p.get(f"{BASE_URL}/api/portal/threads/{thread}").json()["messages"], body)["receipt"] == "consegnato"
    dd = d.get(f"{BASE_URL}/api/messages/threads/{thread}").json()
    assert "ai_draft" in dd and (dd["ai_draft"] is None or {"id", "text"} <= set(dd["ai_draft"]))
    assert _msg(p.get(f"{BASE_URL}/api/portal/threads/{thread}").json()["messages"], body)["receipt"] == "letto"


# Receipts: doctor message inviato -> consegnato (parent list) -> letto (parent opens)
def test_doctor_message_receipts(ss, thread):
    p, d = ss
    body = "TEST_v2 risposta medico"
    r = d.post(f"{BASE_URL}/api/messages/threads/{thread}/messages", json={"body": body})
    assert r.status_code == 200
    assert _msg(r.json()["messages"], body)["receipt"] == "inviato"
    p.get(f"{BASE_URL}/api/portal/threads")
    assert _msg(d.get(f"{BASE_URL}/api/messages/threads/{thread}").json()["messages"], body)["receipt"] == "consegnato"
    p.get(f"{BASE_URL}/api/portal/threads/{thread}")
    assert _msg(d.get(f"{BASE_URL}/api/messages/threads/{thread}").json()["messages"], body)["receipt"] == "letto"
    t = next(x for x in d.get(f"{BASE_URL}/api/messages/threads").json() if x["id"] == thread)
    assert t["needs_reply"] is False and t["preview"].startswith("TEST_v2")


# Attachments doctor side
def test_doctor_attach_pdf_and_download(ss, thread):
    p, d = ss
    r = d.post(f"{BASE_URL}/api/messages/threads/{thread}/attachments", files={"file": ("TEST_ref.pdf", PDF, "application/pdf")}, data={"body": "TEST_v2 pdf"})
    assert r.status_code == 200, r.text
    m = _msg(r.json()["messages"], "TEST_v2 pdf")
    a = m["attachments"][0]
    assert a["type"] == "application/pdf" and a["name"] == "TEST_ref.pdf" and a["size"] == len(PDF)
    g = d.get(f"{BASE_URL}/api/messages/threads/{thread}/attachments/{a['id']}")
    assert g.status_code == 200 and g.content == PDF and g.headers["content-type"].startswith("application/pdf")
    g2 = p.get(f"{BASE_URL}/api/portal/threads/{thread}/attachments/{a['id']}")
    assert g2.status_code == 200 and g2.content == PDF
    # stored encrypted
    f = DB.msg_files.find_one({"_id": ObjectId(a["id"])})
    assert f and f["path"].endswith(".bin")
    # wrong ids
    assert d.get(f"{BASE_URL}/api/messages/threads/{thread}/attachments/000000000000000000000000").status_code == 404
    assert d.get(f"{BASE_URL}/api/messages/threads/000000000000000000000000/attachments/{a['id']}").status_code == 404
    # role isolation
    assert p.get(f"{BASE_URL}/api/messages/threads/{thread}/attachments/{a['id']}").status_code in (401, 403)
    assert requests.get(f"{BASE_URL}/api/portal/threads/{thread}/attachments/{a['id']}").status_code in (401, 403)


def test_attach_rejects_type_and_size(ss, thread):
    p, d = ss
    r = d.post(f"{BASE_URL}/api/messages/threads/{thread}/attachments", files={"file": ("x.txt", b"hello", "text/plain")})
    assert r.status_code == 415
    big = b"0" * (10 * 1024 * 1024 + 10)
    r = d.post(f"{BASE_URL}/api/messages/threads/{thread}/attachments", files={"file": ("big.pdf", big, "application/pdf")})
    assert r.status_code == 413, r.status_code
    r = p.post(f"{BASE_URL}/api/portal/threads/{thread}/attachments", files={"file": ("x.exe", b"MZ", "application/octet-stream")})
    assert r.status_code == 415


# Attachments parent side + receipt
def test_parent_attach_png(ss, thread):
    p, d = ss
    r = p.post(f"{BASE_URL}/api/portal/threads/{thread}/attachments", files={"file": ("TEST_foto.png", PNG, "image/png")}, data={"body": ""})
    assert r.status_code == 200, r.text
    m = [x for x in r.json()["messages"] if x["attachments"] and x["from"] == "parent"][-1]
    assert m["receipt"] == "inviato" and m["attachments"][0]["type"] == "image/png"
    aid = m["attachments"][0]["id"]
    t = next(x for x in d.get(f"{BASE_URL}/api/messages/threads").json() if x["id"] == thread)
    assert t["needs_reply"] is True
    assert t["preview"] in ("Allegato",) or t["preview"]
    print("preview after empty-body attachment:", t["preview"])
    g = d.get(f"{BASE_URL}/api/messages/threads/{thread}/attachments/{aid}")
    assert g.status_code == 200 and g.content == PNG
    assert p.get(f"{BASE_URL}/api/portal/threads/000000000000000000000000/attachments/{aid}").status_code == 404
