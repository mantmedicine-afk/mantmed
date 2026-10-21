"""Portal communications: parent <-> specialist secure threads, quick requests and in-portal notifications (all text sealed with AES-256-GCM)."""
import asyncio
import logging
from html import escape as hesc
from datetime import datetime, timezone, timedelta
from typing import Literal, Optional
from zoneinfo import ZoneInfo
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from auth import require_role
from crypto import seal_fields, unseal_fields
from mailer import send_email
from registration import mail_shell
from account import prefs_of, notify_doctor, NOTIF_CAT
from beta import FeedbackIn

ROME = ZoneInfo("Europe/Rome")
KINDS = Literal["info", "clinico", "ricetta", "certificato_sportivo", "altro"]
KIND_LABEL = {"info": "Richiesta di informazioni", "clinico": "Dubbio clinico", "ricetta": "Richiesta ricetta ripetibile",
              "certificato_sportivo": "Richiesta certificato di idoneità sportiva", "altro": "Messaggio"}
MAX_THREADS_PER_DAY = 15
T_SEALED = ("subject", "patient_name", "parent_name")
M_SEALED = ("body", "fields")
N_SEALED = ("title", "body")


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


def _oid(v: str):
    if not ObjectId.is_valid(v):
        raise HTTPException(404, "Conversazione non trovata")
    return ObjectId(v)


def thread_status(t: dict) -> str:
    if t["last_from"] == "doctor":
        return "risposto"
    return "letto" if t.get("doctor_unread", 0) == 0 else "inviato"


def thread_out(t: dict, side: str) -> dict:
    u = unseal_fields(t, T_SEALED)
    return {"id": str(t["_id"]), "patient_id": t["patient_id"], "owner_id": t["owner_id"], "kind": t["kind"], "kind_label": KIND_LABEL[t["kind"]],
            "subject": u["subject"], "patient_name": u["patient_name"], "parent_name": u["parent_name"], "doctor_name": t.get("doctor_name", ""),
            "created_at": t["created_at"], "last_at": t["last_at"], "last_from": t["last_from"], "status": thread_status(t),
            "unread": t.get("parent_unread" if side == "parent" else "doctor_unread", 0)}


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
                    "created_at": m["created_at"], "read_at": m.get("read_at"), "status": st})
    return list(reversed(out))


async def _mail_parent(p: dict, title: str):
    try:
        await send_email(to=p["email"], subject=f"MantMed · {title}", html=mail_shell("PORTALE PAZIENTE",
            f"<p>Gentile {hesc(p.get('name', ''))},</p><p>{hesc(title)}: acceda al Portale Paziente MantMed per leggerlo.</p>"
            "<p style=\"color:#5B6478;font-size:13px\">Per riservatezza questa email non contiene dati clinici. Può gestire gli avvisi email dall'Area Riservata.</p>"))
    except Exception:
        logging.getLogger(__name__).exception("Avviso email al genitore non inviato")


async def notify_parents(db, pid: str, owner: str, kind: str, title: str, body: str, ref: str = "", key: Optional[str] = None, only: Optional[str] = None):
    q = {"_id": ObjectId(only)} if only else {"role": "parent", "children": {"$elemMatch": {"patient_id": pid, "owner_id": owner}}}
    cat = NOTIF_CAT[kind]
    async for p in db.users.find(q):
        prefs = prefs_of(p)[cat]
        if prefs["email"] and kind != "reminder" and p.get("status", "active") == "active" and not (key and await db.notifications.find_one({"parent_id": str(p["_id"]), "key": key})):
            asyncio.create_task(_mail_parent(p, title))
        if not prefs["inapp"]:
            continue
        doc = {"parent_id": str(p["_id"]), "kind": kind, "patient_id": pid, "owner_id": owner, "ref": ref, "created_at": _now().isoformat(), "read_at": None,
               **seal_fields({"title": title, "body": body}, N_SEALED)}
        if key:
            await db.notifications.update_one({"parent_id": doc["parent_id"], "key": key}, {"$setOnInsert": {**doc, "key": key}}, upsert=True)
        else:
            await db.notifications.insert_one(doc)


def build_messaging(db, current_user):
    parent = APIRouter(prefix="/portal", dependencies=[Depends(require_role(current_user, "parent"))])
    doctor = APIRouter(prefix="/messages")

    async def link_of(user: dict, pid: str, owner: str) -> dict:
        u = await db.users.find_one({"_id": ObjectId(user["id"])})
        if not any(c["patient_id"] == pid and c["owner_id"] == owner for c in u.get("children", [])):
            raise HTTPException(404, "Cartella non collegata al suo account")
        return u

    async def add_message(t: dict, side: str, author: str, body: str, fields=None):
        now = _now().isoformat()
        await db.messages.insert_one({"thread_id": str(t["_id"]), "from": side, "author": author, "created_at": now, "read_at": None,
                                      **seal_fields({"body": body.strip(), "fields": fields or []}, M_SEALED)})
        inc = "doctor_unread" if side == "parent" else "parent_unread"
        await db.threads.update_one({"_id": t["_id"]}, {"$set": {"last_at": now, "last_from": side}, "$inc": {inc: 1}})
        if side == "parent":
            asyncio.create_task(notify_doctor(db, t["owner_id"], "messages", f"MantMed · nuovo messaggio dal portale ({KIND_LABEL[t['kind']]})",
                                              "<p>Ha ricevuto un nuovo messaggio da una famiglia nel Portale Paziente.</p>"))
        return now

    async def thread_messages(t: dict, reader: str) -> list:
        other = "doctor" if reader == "parent" else "parent"
        await db.messages.update_many({"thread_id": str(t["_id"]), "from": other, "read_at": None}, {"$set": {"read_at": _now().isoformat()}})
        await db.threads.update_one({"_id": t["_id"]}, {"$set": {f"{reader}_unread": 0}})
        msgs = await db.messages.find({"thread_id": str(t["_id"])}).sort("created_at", 1).to_list(500)
        return messages_out(msgs)

    # ---------- Genitore ----------
    @parent.get("/threads")
    async def p_threads(user: dict = Depends(current_user)):
        return [thread_out(t, "parent") async for t in db.threads.find({"parent_id": user["id"]}).sort("last_at", -1).limit(100)]

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
        await add_message(t, "parent", u.get("name", ""), body.body, [f.model_dump() for f in body.fields if f.value.strip()])
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
        return {"thread": thread_out(await db.threads.find_one({"_id": t["_id"]}), "parent"), "messages": msgs}

    @parent.post("/threads/{tid}/messages")
    async def p_reply(tid: str, body: MessageIn, user: dict = Depends(current_user)):
        t = await p_thread_doc(user, tid)
        await link_of(user, t["patient_id"], t["owner_id"])
        await add_message(t, "parent", user.get("name", ""), body.body)
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
        doc = {"doctor_id": None, "parent_id": user["id"], "role": "parent", "doctor_name": user["name"], "rating": body.rating, "area": body.area,
               "text": body.text.strip(), "created_at": _now().isoformat()}
        res = await db.feedback.insert_one(seal_fields(dict(doc), ("text",)))
        return {"id": str(res.inserted_id)}

    # ---------- Medico ----------
    @doctor.get("/summary")
    async def d_summary(user: dict = Depends(current_user)):
        n = sum([t.get("doctor_unread", 0) async for t in db.threads.find({"owner_id": user["id"], "doctor_unread": {"$gt": 0}}, {"doctor_unread": 1})])
        return {"unread": n}

    @doctor.get("/threads")
    async def d_threads(user: dict = Depends(current_user)):
        return [thread_out(t, "doctor") async for t in db.threads.find({"owner_id": user["id"]}).sort("last_at", -1).limit(200)]

    async def d_thread_doc(user: dict, tid: str) -> dict:
        t = await db.threads.find_one({"_id": _oid(tid), "owner_id": user["id"]})
        if not t:
            raise HTTPException(404, "Conversazione non trovata")
        return t

    @doctor.get("/threads/{tid}")
    async def d_thread(tid: str, user: dict = Depends(current_user)):
        t = await d_thread_doc(user, tid)
        msgs = await thread_messages(t, "doctor")
        return {"thread": thread_out(await db.threads.find_one({"_id": t["_id"]}), "doctor"), "messages": msgs}

    @doctor.post("/threads/{tid}/messages")
    async def d_reply(tid: str, body: MessageIn, user: dict = Depends(current_user)):
        t = await d_thread_doc(user, tid)
        await add_message(t, "doctor", user["name"], body.body)
        pname = unseal_fields(t, T_SEALED)["patient_name"]
        await notify_parents(db, t["patient_id"], t["owner_id"], "reply", f"{user['name']} ha risposto", f"{KIND_LABEL[t['kind']]} · {pname}", ref=tid, only=t["parent_id"])
        await db.audit.insert_one({"action": "messaggio_portale_risposto", "subject": seal_fields({"s": pname}, ("s",))["s"], "at": _now().isoformat(), "owner_id": user["id"]})
        return await d_thread(tid, user)

    return parent, doctor
