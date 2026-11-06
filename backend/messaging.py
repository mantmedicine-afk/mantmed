"""Portal communications: parent <-> specialist secure threads, quick requests and in-portal notifications (all text sealed with AES-256-GCM)."""
import asyncio
import logging
import re
import uuid
from html import escape as hesc
from datetime import datetime, timezone, timedelta
from typing import Literal, Optional
from zoneinfo import ZoneInfo
from bson import ObjectId
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from crypto import seal_bytes, unseal_bytes
from showcase import get_object, put_object
from pydantic import BaseModel, Field
from auth import require_role
from crypto import seal_fields, unseal_fields
from mailer import send_email
from registration import mail_shell
from account import prefs_of, notify_doctor, NOTIF_CAT
from beta import FeedbackIn, submit_feedback

ROME = ZoneInfo("Europe/Rome")
KINDS = Literal["info", "clinico", "ricetta", "certificato_sportivo", "altro"]
KIND_LABEL = {"info": "Richiesta di informazioni", "clinico": "Dubbio clinico", "ricetta": "Richiesta ricetta ripetibile",
              "certificato_sportivo": "Richiesta certificato di idoneità sportiva", "altro": "Messaggio"}
MAX_THREADS_PER_DAY = 15
T_SEALED = ("subject", "patient_name", "parent_name")
M_SEALED = ("body", "fields")
N_SEALED = ("title", "body")
HOOKS: dict = {}
ATTACH_TYPES = {"image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"}
MAX_ATTACH = 10 * 1024 * 1024


def _now():
    return datetime.now(timezone.utc)


class FieldIn(BaseModel):
    label: str = Field(min_length=1, max_length=60)
    value: str = Field(max_length=300)


class ThreadIn(BaseModel):
    patient_id: str
    owner_id: str
    kind: KINDS
    subject: str = Field(default="", max_length=120)
    body: str = Field(min_length=2, max_length=4000)
    fields: list[FieldIn] = Field(default_factory=list, max_length=8)


class MessageIn(BaseModel):
    body: str = Field(min_length=1, max_length=4000)


class ReadIn(BaseModel):
    ids: Optional[list[str]] = None


def _magic_ok(b: bytes, ctype: str) -> bool:
    if ctype == "application/pdf":
        return b[:5] == b"%PDF-"
    if ctype == "image/jpeg":
        return b[:3] == b"\xff\xd8\xff"
    if ctype == "image/png":
        return b[:8] == b"\x89PNG\r\n\x1a\n"
    if ctype == "image/webp":
        return b[:4] == b"RIFF" and b[8:12] == b"WEBP"
    return b[4:8] == b"ftyp"


def _age(bd: Optional[str]) -> str:
    try:
        b = datetime.fromisoformat(bd[:10]).date()
    except (TypeError, ValueError):
        return ""
    t = datetime.now(ROME).date()
    m = (t.year - b.year) * 12 + t.month - b.month - (t.day < b.day)
    return f"{m} mesi" if m < 24 else f"{m // 12} anni"


def _oid(v: str):
    if not ObjectId.is_valid(v):
        raise HTTPException(404, "Conversazione non trovata")
    return ObjectId(v)


def thread_status(t: dict) -> str:
    if t["last_from"] == "doctor":
        return "risposto"
    if t.get("ai_pending"):
        return "in_attesa"
    return "letto" if t.get("doctor_unread", 0) == 0 else "inviato"


def thread_out(t: dict, side: str) -> dict:
    u = unseal_fields(t, T_SEALED)
    return {"id": str(t["_id"]), "patient_id": t["patient_id"], "owner_id": t["owner_id"], "kind": t["kind"], "kind_label": KIND_LABEL[t["kind"]],
            "subject": u["subject"], "patient_name": u["patient_name"], "parent_name": u["parent_name"], "doctor_name": t.get("doctor_name", ""),
            "created_at": t["created_at"], "last_at": t["last_at"], "last_from": t["last_from"], "status": thread_status(t),
            "unread": t.get("parent_unread" if side == "parent" else "doctor_unread", 0),
            **({"ai_urgent": bool(t.get("ai_urgent")), "ai_category": t.get("ai_category"), "ai_clinic": t.get("ai_clinic")} if side == "doctor" else {})}


def messages_out(msgs: list) -> list:
    out, replied = [], False
    for m in reversed(msgs):
        u = unseal_fields(m, M_SEALED)
        st = None
        if m["from"] == "parent":
            st = "risposto" if replied else ("letto" if m.get("read_at") else "inviato")
        else:
            replied = True
        out.append({"id": str(m["_id"]), "from": m["from"], "author": m.get("author", ""), "body": u["body"], "fields": u.get("fields") or [],
                    "receipt": "letto" if m.get("read_at") else "consegnato" if m.get("delivered_at") else "inviato", "attachments": m.get("attachments") or [],
                    "created_at": m["created_at"], "read_at": m.get("read_at"), "status": st, "ai_label": m.get("ai_label"), "ai_provenance": m.get("ai_provenance")})
    return list(reversed(out))


async def _mail_parent(p: dict, title: str, ai_line: str = ""):
    try:
        await send_email(to=p["email"], subject=f"MantMed · {title}", html=mail_shell("PORTALE PAZIENTE",
            f"<p>Gentile {hesc(p.get('name', ''))},</p><p>{hesc(title)}: acceda al Portale Paziente MantMed per leggerlo.</p>"
            + (f"<p style=\"color:#8A5A00;font-size:13px\">{hesc(ai_line)}</p>" if ai_line else "")
            + "<p style=\"color:#5B6478;font-size:13px\">Per riservatezza questa email non contiene dati clinici. Può gestire gli avvisi email dall'Area Riservata.</p>"))
    except Exception:
        logging.getLogger(__name__).exception("Avviso email al genitore non inviato")


async def notify_parents(db, pid: str, owner: str, kind: str, title: str, body: str, ref: str = "", key: Optional[str] = None, only: Optional[str] = None,
                         ai_line: str = ""):
    q = {"_id": ObjectId(only)} if only else {"role": {"$in": ["patient", "parent"]}, "children": {"$elemMatch": {"patient_id": pid, "owner_id": owner}}}
    cat = NOTIF_CAT[kind]
    async for p in db.users.find(q):
        prefs = prefs_of(p)[cat]
        if prefs["email"] and kind != "reminder" and p.get("status", "active") == "active" and not (key and await db.notifications.find_one({"parent_id": str(p["_id"]), "key": key})):
            asyncio.create_task(_mail_parent(p, title, ai_line))
        if not prefs["inapp"]:
            continue
        doc = {"parent_id": str(p["_id"]), "kind": kind, "patient_id": pid, "owner_id": owner, "ref": ref, "created_at": _now().isoformat(), "read_at": None,
               **seal_fields({"title": title, "body": body}, N_SEALED)}
        if key:
            await db.notifications.update_one({"parent_id": doc["parent_id"], "key": key}, {"$setOnInsert": {**doc, "key": key}}, upsert=True)
        else:
            await db.notifications.insert_one(doc)


async def add_message(db, t: dict, side: str, author: str, body: str, fields=None, ai_label: Optional[str] = None, ai_provenance: Optional[dict] = None,
                      attachments: Optional[list] = None) -> str:
    now = _now().isoformat()
    doc = {"thread_id": str(t["_id"]), "from": side, "author": author, "created_at": now, "read_at": None, "delivered_at": None, "attachments": attachments or [],
           **seal_fields({"body": body.strip(), "fields": fields or []}, M_SEALED), **({"ai_label": ai_label} if ai_label else {}),
           **({"ai_provenance": ai_provenance} if ai_provenance else {})}
    mid = str((await db.messages.insert_one(doc)).inserted_id)
    if side == "system":
        await db.threads.update_one({"_id": t["_id"]}, {"$inc": {"parent_unread": 1}})
        return mid
    inc = "doctor_unread" if side == "parent" else "parent_unread"
    await db.threads.update_one({"_id": t["_id"]}, {"$set": {"last_at": now, "last_from": side}, "$inc": {inc: 1}})
    if side == "parent":
        asyncio.create_task(notify_doctor(db, t["owner_id"], "messages", f"MantMed · nuovo messaggio dal portale ({KIND_LABEL[t['kind']]})",
                                          "<p>Ha ricevuto un nuovo messaggio da una famiglia nel Portale Paziente.</p>"))
        if HOOKS.get("parent_message"):
            asyncio.create_task(HOOKS["parent_message"](str(t["_id"]), mid))
    return mid


def build_messaging(db, current_user):
    parent = APIRouter(prefix="/portal", dependencies=[Depends(require_role(current_user, "parent"))])
    doctor = APIRouter(prefix="/messages")

    async def link_of(user: dict, pid: str, owner: str) -> dict:
        u = await db.users.find_one({"_id": ObjectId(user["id"])})
        if not any(c["patient_id"] == pid and c["owner_id"] == owner for c in u.get("children", [])):
            raise HTTPException(404, "Cartella non collegata al suo account")
        return u

    async def post(t: dict, side: str, author: str, body: str, fields=None):
        return await add_message(db, t, side, author, body, fields)

    async def thread_messages(t: dict, reader: str) -> list:
        other = "doctor" if reader == "parent" else "parent"
        await db.messages.update_many({"thread_id": str(t["_id"]), "from": other, "read_at": None}, {"$set": {"read_at": _now().isoformat()}})
        await db.threads.update_one({"_id": t["_id"]}, {"$set": {f"{reader}_unread": 0}})
        msgs = await db.messages.find({"thread_id": str(t["_id"])}).sort("created_at", 1).to_list(500)
        return messages_out(msgs)

    # ---------- Genitore ----------
    async def deliver(ids: list, sides: list):
        if ids:
            await db.messages.update_many({"thread_id": {"$in": ids}, "from": {"$in": sides}, "delivered_at": None, "read_at": None},
                                          {"$set": {"delivered_at": _now().isoformat()}})

    async def enrich(t: dict, side: str) -> dict:
        out = thread_out(t, side)
        last = await db.messages.find_one({"thread_id": out["id"], "from": {"$ne": "system"}}, sort=[("created_at", -1)])
        lu = unseal_fields(last, M_SEALED) if last else {}
        out["preview"] = ((lu.get("body") or "").strip() or ("Allegato" if last and last.get("attachments") else ""))[:140]
        out["needs_reply"] = t["last_from"] == "parent"
        p = await db.patients.find_one({"_id": ObjectId(t["patient_id"]), "owner_id": t["owner_id"]}) if ObjectId.is_valid(t["patient_id"]) else None
        pu = unseal_fields(p, ("guardian", "name")) if p else {}
        g = pu.get("guardian") or ""
        gname = g.split(":", 1)[1].strip().lower() if ":" in g else ""
        rel = g.split(":")[0].strip().lower() if gname and gname == (out["parent_name"] or "").strip().lower() else ""
        child = (out["patient_name"] or "").split(" ")[0]
        out["display_name"] = f"{out['parent_name']} · {rel} di {child}" if rel and len(rel) <= 12 else f"{out['parent_name']} · per {child}"
        out["patient_age"] = _age((p or {}).get("birth_date"))
        return out

    @parent.get("/threads")
    async def p_threads(user: dict = Depends(current_user)):
        ts = await db.threads.find({"parent_id": user["id"]}).sort("last_at", -1).limit(100).to_list(100)
        await deliver([str(t["_id"]) for t in ts], ["doctor", "system"])
        return [await enrich(t, "parent") for t in ts]

    @parent.post("/threads")
    async def p_create(body: ThreadIn, user: dict = Depends(current_user)):
        u = await link_of(user, body.patient_id, body.owner_id)
        since = (_now() - timedelta(days=1)).isoformat()
        if await db.threads.count_documents({"parent_id": user["id"], "created_at": {"$gte": since}}) >= MAX_THREADS_PER_DAY:
            raise HTTPException(429, "Troppe nuove richieste oggi: continui nelle conversazioni già aperte o contatti lo studio")
        p = await db.patients.find_one({"_id": ObjectId(body.patient_id), "owner_id": body.owner_id})
        d = await db.users.find_one({"_id": ObjectId(body.owner_id)}) or {}
        if not p:
            raise HTTPException(404, "Cartella non trovata")
        pname = unseal_fields(p, ("name",))["name"]
        now = _now().isoformat()
        t = {"parent_id": user["id"], "patient_id": body.patient_id, "owner_id": body.owner_id, "kind": body.kind, "doctor_name": d.get("name", ""),
             "created_at": now, "last_at": now, "last_from": "parent", "doctor_unread": 0, "parent_unread": 0,
             **seal_fields({"subject": body.subject.strip() or KIND_LABEL[body.kind], "patient_name": pname, "parent_name": u.get("name", "")}, T_SEALED)}
        t["_id"] = (await db.threads.insert_one(t)).inserted_id
        await post(t, "parent", u.get("name", ""), body.body, [f.model_dump() for f in body.fields if f.value.strip()])
        await db.audit.insert_one({"action": "messaggio_portale_ricevuto", "subject": seal_fields({"s": pname}, ("s",))["s"], "at": now, "owner_id": body.owner_id})
        return thread_out(await db.threads.find_one({"_id": t["_id"]}), "parent")

    async def p_thread_doc(user: dict, tid: str) -> dict:
        t = await db.threads.find_one({"_id": _oid(tid), "parent_id": user["id"]})
        if not t:
            raise HTTPException(404, "Conversazione non trovata")
        return t

    @parent.get("/threads/{tid}")
    async def p_thread(tid: str, user: dict = Depends(current_user)):
        t = await p_thread_doc(user, tid)
        msgs = await thread_messages(t, "parent")
        await db.notifications.update_many({"parent_id": user["id"], "kind": "reply", "ref": tid, "read_at": None}, {"$set": {"read_at": _now().isoformat()}})
        return {"thread": await enrich(await db.threads.find_one({"_id": t["_id"]}), "parent"), "messages": msgs}

    @parent.post("/threads/{tid}/messages")
    async def p_reply(tid: str, body: MessageIn, user: dict = Depends(current_user)):
        t = await p_thread_doc(user, tid)
        await link_of(user, t["patient_id"], t["owner_id"])
        await post(t, "parent", user.get("name", ""), body.body)
        return await p_thread(tid, user)

    async def ensure_reminders(user: dict):
        u = await db.users.find_one({"_id": ObjectId(user["id"])}) or {}
        today = datetime.now(ROME).date()
        days = [today.isoformat(), (today + timedelta(days=1)).isoformat()]
        for c in u.get("children", []):
            async for a in db.appointments.find({"patient_id": c["patient_id"], "owner_id": c["owner_id"], "status": "programmato", "date": {"$in": days}}):
                when = "oggi" if a["date"] == days[0] else "domani"
                p = await db.patients.find_one({"_id": ObjectId(c["patient_id"])}, {"name": 1}) or {}
                name = unseal_fields(p, ("name",)).get("name", "")
                await notify_parents(db, c["patient_id"], c["owner_id"], "reminder", f"Appuntamento {when} alle {a['time']}",
                                     f"{name} · {a.get('clinic', '')}", ref=str(a["_id"]), key=f"rem:{a['_id']}:{a['date']}:{a['time']}", only=user["id"])

    @parent.get("/notifications")
    async def p_notifications(user: dict = Depends(current_user)):
        await ensure_reminders(user)
        items = []
        async for n in db.notifications.find({"parent_id": user["id"]}).sort("created_at", -1).limit(30):
            u = unseal_fields(n, N_SEALED)
            items.append({"id": str(n["_id"]), "kind": n["kind"], "title": u["title"], "body": u["body"], "patient_id": n["patient_id"], "ref": n.get("ref", ""),
                          "created_at": n["created_at"], "read_at": n.get("read_at")})
        unread = await db.notifications.count_documents({"parent_id": user["id"], "read_at": None})
        msgs = sum([t.get("parent_unread", 0) async for t in db.threads.find({"parent_id": user["id"], "parent_unread": {"$gt": 0}}, {"parent_unread": 1})])
        return {"items": items, "unread": unread, "messages_unread": msgs}

    @parent.post("/notifications/read")
    async def p_read(body: ReadIn, user: dict = Depends(current_user)):
        q = {"parent_id": user["id"], "read_at": None}
        if body.ids is not None:
            q["_id"] = {"$in": [ObjectId(i) for i in body.ids if ObjectId.is_valid(i)]}
        res = await db.notifications.update_many(q, {"$set": {"read_at": _now().isoformat()}})
        return {"read": res.modified_count}

    @parent.post("/feedback")
    async def p_feedback(body: FeedbackIn, user: dict = Depends(current_user)):
        return await submit_feedback(db, body, user, {"doctor_id": None, "parent_id": user["id"], "role": "parent", "doctor_name": user["name"]})

    # ---------- Medico ----------
    @doctor.get("/summary")
    async def d_summary(user: dict = Depends(current_user)):
        n = sum([t.get("doctor_unread", 0) async for t in db.threads.find({"owner_id": user["id"], "doctor_unread": {"$gt": 0}}, {"doctor_unread": 1})])
        return {"unread": n}

    @doctor.get("/threads")
    async def d_threads(user: dict = Depends(current_user)):
        ts = await db.threads.find({"owner_id": user["id"]}).sort("last_at", -1).limit(200).to_list(200)
        await deliver([str(t["_id"]) for t in ts], ["parent"])
        return [await enrich(t, "doctor") for t in ts]

    async def d_thread_doc(user: dict, tid: str) -> dict:
        t = await db.threads.find_one({"_id": _oid(tid), "owner_id": user["id"]})
        if not t:
            raise HTTPException(404, "Conversazione non trovata")
        return t

    @doctor.get("/threads/{tid}")
    async def d_thread(tid: str, user: dict = Depends(current_user)):
        t = await d_thread_doc(user, tid)
        msgs = await thread_messages(t, "doctor")
        d = await db.ai_reply_drafts.find_one({"thread_id": tid, "doctor_id": user["id"], "status": "in_attesa"}, sort=[("created_at", -1)])
        draft = {"id": str(d["_id"]), "text": unseal_fields(d, ("text",))["text"]} if d and not d.get("ai_failed") else None
        return {"thread": await enrich(await db.threads.find_one({"_id": t["_id"]}), "doctor"), "messages": msgs, "ai_draft": draft}

    @doctor.post("/threads/{tid}/messages")
    async def d_reply(tid: str, body: MessageIn, user: dict = Depends(current_user)):
        t = await d_thread_doc(user, tid)
        await post(t, "doctor", user["name"], body.body)
        if HOOKS.get("doctor_reply"):
            await HOOKS["doctor_reply"](tid, user)
        pname = unseal_fields(t, T_SEALED)["patient_name"]
        await notify_parents(db, t["patient_id"], t["owner_id"], "reply", f"{user['name']} ha risposto", f"{KIND_LABEL[t['kind']]} · {pname}", ref=tid, only=t["parent_id"])
        await db.audit.insert_one({"action": "messaggio_portale_risposto", "subject": seal_fields({"s": pname}, ("s",))["s"], "at": _now().isoformat(), "owner_id": user["id"]})
        return await d_thread(tid, user)

    # ---------- Allegati (foto e PDF, cifrati nello storage) ----------
    async def store(t: dict, file: UploadFile) -> dict:
        data = await file.read(MAX_ATTACH + 1)
        ctype = (file.content_type or "").lower()
        if ctype not in ATTACH_TYPES:
            raise HTTPException(415, "Si possono allegare solo foto (JPG, PNG, HEIC, WEBP) o PDF")
        if len(data) > MAX_ATTACH:
            raise HTTPException(413, "File troppo grande: massimo 10 MB")
        if not _magic_ok(data, ctype):
            raise HTTPException(415, "Il file non è una foto o un PDF valido")
        path = f"mantmed/messages/{t['_id']}/{uuid.uuid4().hex}.bin"
        await asyncio.to_thread(put_object, path, seal_bytes(data), "application/octet-stream")
        name = re.sub(r"[^\w.\- ]+", "_", file.filename or "allegato")[:80]
        aid = str((await db.msg_files.insert_one({"thread_id": str(t["_id"]), "path": path, "name": name, "ctype": ctype, "size": len(data), "created_at": _now().isoformat()})).inserted_id)
        return {"id": aid, "name": name, "type": ctype, "size": len(data)}

    async def file_response(t: dict, aid: str):
        f = await db.msg_files.find_one({"_id": _oid(aid), "thread_id": str(t["_id"])})
        if not f:
            raise HTTPException(404, "Allegato non trovato")
        raw, _ = await asyncio.to_thread(get_object, f["path"])
        return Response(unseal_bytes(raw), media_type=f["ctype"], headers={"Content-Disposition": f"inline; filename=\"{f['name']}\"", "Cache-Control": "private, no-store"})

    @parent.post("/threads/{tid}/attachments")
    async def p_attach(tid: str, file: UploadFile = File(...), body: str = Form(""), user: dict = Depends(current_user)):
        t = await p_thread_doc(user, tid)
        await link_of(user, t["patient_id"], t["owner_id"])
        await add_message(db, t, "parent", user.get("name", ""), body[:4000], attachments=[await store(t, file)])
        return await p_thread(tid, user)

    @parent.get("/threads/{tid}/attachments/{aid}")
    async def p_file(tid: str, aid: str, user: dict = Depends(current_user)):
        return await file_response(await p_thread_doc(user, tid), aid)

    @doctor.post("/threads/{tid}/attachments")
    async def d_attach(tid: str, file: UploadFile = File(...), body: str = Form(""), user: dict = Depends(current_user)):
        t = await d_thread_doc(user, tid)
        await add_message(db, t, "doctor", user["name"], body[:4000], attachments=[await store(t, file)])
        if HOOKS.get("doctor_reply"):
            await HOOKS["doctor_reply"](tid, user)
        pname = unseal_fields(t, T_SEALED)["patient_name"]
        await db.audit.insert_one({"action": "messaggio_portale_risposto", "subject": seal_fields({"s": pname}, ("s",))["s"], "at": _now().isoformat(), "owner_id": user["id"]})
        await notify_parents(db, t["patient_id"], t["owner_id"], "reply", f"{user['name']} ha risposto", f"{KIND_LABEL[t['kind']]} · {pname}", ref=tid, only=t["parent_id"])
        return await d_thread(tid, user)

    @doctor.get("/threads/{tid}/attachments/{aid}")
    async def d_file(tid: str, aid: str, user: dict = Depends(current_user)):
        return await file_response(await d_thread_doc(user, tid), aid)

    return parent, doctor
