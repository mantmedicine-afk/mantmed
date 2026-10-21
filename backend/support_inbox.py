"""Inbox Founder: feedback, supporto e segnalazioni con stato, nota interna e risposta via email + avviso in app."""
import logging
from datetime import datetime, timezone
from html import escape as hesc
from typing import Literal, Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from beta import ALL_AREAS, KINDS, ROLES
from crypto import seal_fields, unseal_fields
from mailer import send_email
from registration import mail_shell

SEALED = ("text", "note", "replies")
logger = logging.getLogger(__name__)


class PatchIn(BaseModel):
    status: Optional[Literal["nuovo", "in_lavorazione", "risolto"]] = None
    note: Optional[str] = Field(default=None, max_length=2000)


class ReplyIn(BaseModel):
    text: str = Field(min_length=2, max_length=4000)
    resolve: bool = False


def _now():
    return datetime.now(timezone.utc).isoformat()


def build_support_inbox(db, admin_user, current_user):
    admin = APIRouter(prefix="/admin/feedback", dependencies=[Depends(admin_user)])
    mine = APIRouter(prefix="/support")

    def uid_of(f):
        return f.get("user_id") or f.get("doctor_id") or f.get("parent_id")

    async def get(fid: str) -> dict:
        f = await db.feedback.find_one({"_id": ObjectId(fid)}) if ObjectId.is_valid(fid) else None
        if not f:
            raise HTTPException(404, "Messaggio non trovato")
        return unseal_fields(f, SEALED)

    def out(f: dict, users: dict) -> dict:
        u = users.get(uid_of(f)) or {}
        return {"id": str(f["_id"]), "kind": f.get("kind") or "feedback", "kind_label": KINDS.get(f.get("kind") or "feedback", "Feedback"),
                "role": f.get("role") or u.get("role") or "doctor", "role_label": ROLES.get(f.get("role") or u.get("role") or "doctor"),
                "name": f.get("doctor_name") or u.get("name", ""), "email": f.get("email") or u.get("email", ""),
                "area": f.get("area", "altro"), "area_label": ALL_AREAS.get(f.get("area"), f.get("area") or "Altro"), "rating": f.get("rating"), "text": f.get("text") or "",
                "tech": f.get("tech"), "status": f.get("status") or "nuovo", "note": f.get("note") or "", "replies": f.get("replies") or [],
                "email_sent": f.get("email_sent", True), "created_at": f.get("created_at") or ""}

    async def users_for(items):
        ids = [ObjectId(i) for i in {uid_of(f) for f in items} if i and ObjectId.is_valid(i)]
        return {str(u["_id"]): u async for u in db.users.find({"_id": {"$in": ids}}, {"name": 1, "email": 1, "role": 1})}

    @admin.get("")
    async def list_all():
        items = [unseal_fields(f, SEALED) for f in await db.feedback.find().sort("created_at", -1).to_list(2000)]
        users = await users_for(items)
        return [out(f, users) for f in items]

    @admin.patch("/{fid}")
    async def patch(fid: str, body: PatchIn):
        f = await get(fid)
        upd = {}
        if body.status:
            upd["status"] = body.status
        if body.note is not None:
            upd.update(seal_fields({"note": body.note.strip()}, ("note",)))
        if upd:
            await db.feedback.update_one({"_id": f["_id"]}, {"$set": upd})
        f = await get(fid)
        return out(f, await users_for([f]))

    @admin.post("/{fid}/reply")
    async def reply(fid: str, body: ReplyIn):
        f = await get(fid)
        o = out(f, await users_for([f]))
        if not o["email"]:
            raise HTTPException(400, "Email dell'utente non disponibile")
        txt = body.text.strip()
        html = mail_shell("RISPOSTA DAL TEAM MANTMED",
                          f"<p>Gentile {hesc(o['name'])},</p><p style=\"white-space:pre-wrap\">{hesc(txt)}</p>"
                          f"<p style=\"color:#5B6478;font-size:12px;margin-top:18px\">In risposta alla sua {hesc(o['kind_label'].lower())} del "
                          f"{datetime.fromisoformat(o['created_at']).strftime('%d/%m/%Y')}:<br>«{hesc(o['text'][:400])}»</p>")
        entry = {"text": txt, "at": _now(), "email_sent": False}
        status = "risolto" if body.resolve else ("in_lavorazione" if o["status"] == "nuovo" else o["status"])
        await db.feedback.update_one({"_id": f["_id"]}, {"$set": {**seal_fields({"replies": o["replies"] + [entry]}, ("replies",)), "status": status, "unread_reply": True}})
        try:  # l'avviso in app è già salvato: l'email è un canale in più
            await send_email(to=o["email"], subject=f"MantMed · risposta alla sua {o['kind_label'].lower()}", html=html)
            entry["email_sent"] = True
            await db.feedback.update_one({"_id": f["_id"]}, {"$set": seal_fields({"replies": o["replies"] + [entry]}, ("replies",))})
        except Exception:
            logger.exception("Email di risposta al feedback %s non inviata", fid)
        f = await get(fid)
        return {**out(f, await users_for([f])), "reply_email_sent": entry["email_sent"]}

    @mine.get("/replies")
    async def my_replies(user: dict = Depends(current_user)):
        q = {"unread_reply": True, "$or": [{"user_id": user["id"]}, {"doctor_id": user["id"]}, {"parent_id": user["id"]}]}
        items = []
        for f in await db.feedback.find(q).sort("created_at", -1).to_list(20):
            f = unseal_fields(f, SEALED)
            items.append({"id": str(f["_id"]), "kind_label": KINDS.get(f.get("kind") or "feedback", "Feedback"), "text": (f.get("text") or "")[:200],
                          "reply": (f.get("replies") or [{}])[-1], "status": f.get("status") or "nuovo"})
        return items

    @mine.post("/replies/{fid}/read")
    async def mark_read(fid: str, user: dict = Depends(current_user)):
        if ObjectId.is_valid(fid):
            await db.feedback.update_one({"_id": ObjectId(fid), "$or": [{"user_id": user["id"]}, {"doctor_id": user["id"]}, {"parent_id": user["id"]}]},
                                         {"$set": {"unread_reply": False}})
        return {"ok": True}

    return admin, mine
