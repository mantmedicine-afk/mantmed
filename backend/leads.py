import os
import re
import logging
from datetime import datetime, timezone, timedelta
from html import escape as hesc
from typing import Literal
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, field_validator
from crypto import seal_fields, unseal_fields
from mailer import send_email

logger = logging.getLogger(__name__)
SEALED = ("name", "email", "city", "message")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
KINDS = {"beta": "Accesso alla beta sul campo", "commerciale": "Informazioni commerciali"}
MAX_PER_HOUR = 5


class LeadIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: str = Field(max_length=200)
    specialty: str = Field(min_length=2, max_length=120)
    city: str = Field(default="", max_length=120)
    kind: Literal["beta", "commerciale"]
    message: str = Field(default="", max_length=3000)
    consent: bool
    website: str = ""

    @field_validator("email")
    @classmethod
    def valid_email(cls, v):
        v = v.strip().lower()
        if not EMAIL_RE.match(v):
            raise ValueError("Email non valida")
        return v


class LeadPatch(BaseModel):
    status: Literal["nuova", "contattato", "archiviata"]


def lead_out(d: dict) -> dict:
    d = unseal_fields(d, SEALED)
    return {"id": str(d["_id"]), **{k: d.get(k) for k in ("name", "email", "specialty", "city", "kind", "message", "status", "created_at")},
            "kind_label": KINDS.get(d.get("kind"), d.get("kind"))}


def notify_html(lead: dict) -> str:
    rows = "".join(f'<tr><td style="padding:6px 0;color:#5B6478;width:140px">{k}</td><td style="padding:6px 0">{hesc(v or "—")}</td></tr>'
                   for k, v in (("Nome", lead["name"]), ("Email", lead["email"]), ("Specializzazione", lead["specialty"]),
                                ("Città", lead["city"]), ("Richiesta", KINDS[lead["kind"]])))
    return ('<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F5F7;padding:24px 0"><tr><td align="center">'
            '<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;font-family:Arial,sans-serif;color:#0A192F">'
            '<tr><td style="background:#0A192F;padding:22px 28px;color:#ffffff;font-family:Georgia,serif;font-size:24px">MantMed'
            '<div style="font-family:Arial,sans-serif;font-size:11px;letter-spacing:2px;color:#C9CCD3;margin-top:4px">NUOVA RICHIESTA DALLA LANDING PAGE</div></td></tr>'
            f'<tr><td style="padding:24px 28px;font-size:14px"><table width="100%">{rows}</table>'
            f'<p style="margin-top:16px;white-space:pre-wrap;line-height:1.6">{hesc(lead["message"] or "")}</p>'
            '<p style="margin-top:16px;color:#5B6478;font-size:12px">La trova anche nella dashboard, sezione "Richieste dalla landing".</p></td></tr></table></td></tr></table>')


def build_leads(db, current_user):
    public = APIRouter(prefix="/public")
    private = APIRouter(prefix="/leads", dependencies=[Depends(current_user)])

    @public.post("/leads")
    async def create_lead(body: LeadIn, request: Request):
        if body.website:
            return {"ok": True}
        if not body.consent:
            raise HTTPException(400, "Il consenso al trattamento dei dati è obbligatorio")
        ip = (request.headers.get("x-forwarded-for") or (request.client.host if request.client else "")).split(",")[0].strip()
        since = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
        if await db.leads.count_documents({"ip": ip, "created_at": {"$gte": since}}) >= MAX_PER_HOUR:
            raise HTTPException(429, "Troppe richieste inviate. Riprovi tra un'ora.")
        lead = {**body.model_dump(exclude={"website"}), "name": body.name.strip(), "specialty": body.specialty.strip(),
                "city": body.city.strip(), "message": body.message.strip(), "status": "nuova", "ip": ip,
                "created_at": datetime.now(timezone.utc).isoformat()}
        await db.leads.insert_one(seal_fields(dict(lead), SEALED))
        try:
            await send_email(to=os.environ["STUDIO_EMAIL"], subject=f"MantMed · {KINDS[body.kind]} da {lead['name']}", html=notify_html(lead))
        except Exception:
            logger.exception("Notifica email richiesta landing non inviata")
        return {"ok": True}

    @private.get("")
    async def list_leads():
        return [lead_out(d) for d in await db.leads.find().sort("created_at", -1).to_list(500)]

    @private.patch("/{lid}")
    async def update_lead(lid: str, body: LeadPatch):
        if not ObjectId.is_valid(lid):
            raise HTTPException(404, "Richiesta non trovata")
        doc = await db.leads.find_one_and_update({"_id": ObjectId(lid)}, {"$set": {"status": body.status}}, return_document=True)
        if not doc:
            raise HTTPException(404, "Richiesta non trovata")
        return lead_out(doc)

    return public, private
