import logging
import os
import re
from bson import ObjectId
from datetime import datetime, timezone, timedelta
from html import escape as hesc
from typing import Literal, Optional
from zoneinfo import ZoneInfo
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator
from crypto import seal_fields, unseal_fields
from mailer import send_email

logger = logging.getLogger(__name__)
KINDS = {"feedback": "Feedback", "supporto": "Richiesta di supporto tecnico", "segnalazione": "Segnalazione problema"}
ROLES = {"doctor": "Medico", "parent": "Paziente / Genitore", "admin": "Amministratore"}

MANUAL_REPORT_MIN = 12
REVIEW_CAP_SEC = 20 * 60
AREAS = {
    "trascrizione": "Trascrizione Ambientale / Wispr Flow",
    "pdf": "Generazione PDF",
    "agenda": "Agenda Multi-Studio",
    "cassa": "Cassa",
    "altro": "Altro",
}
PORTAL_AREAS = {"appuntamenti": "Appuntamenti e prenotazioni", "referti": "Referti e documenti", "pagamenti": "Pagamenti e ricevute",
                "messaggi": "Messaggi con il medico", "account": "Account e accesso"}
ALL_AREAS = {**AREAS, **PORTAL_AREAS}
Area = Literal["trascrizione", "pdf", "agenda", "cassa", "altro", "appuntamenti", "referti", "pagamenti", "messaggi", "account"]
TITLES = re.compile(r"^((dott\.?(ssa)?|dr\.?(ssa)?|prof\.?(ssa)?|sig\.?(ra)?)\s+)+", re.I)


class TechInfo(BaseModel):
    page: str = Field(default="", max_length=300)
    user_agent: str = Field(default="", max_length=400)
    screen: str = Field(default="", max_length=40)
    language: str = Field(default="", max_length=20)


class FeedbackIn(BaseModel):
    kind: Literal["feedback", "supporto", "segnalazione"] = "feedback"
    rating: Optional[int] = Field(default=None, ge=1, le=5)
    area: Area
    text: str = Field(default="", max_length=4000)
    client_id: str = Field(default="", max_length=64)
    tech: Optional[TechInfo] = None

    @model_validator(mode="after")
    def _check(self):
        if self.kind == "feedback" and not self.rating:
            raise ValueError("Assegni un punteggio di usabilità")
        if self.kind != "feedback":
            self.rating = None
            if len(self.text.strip()) < 5:
                raise ValueError("Descriva la richiesta in almeno qualche parola")
        if self.kind != "segnalazione":
            self.tech = None
        return self


def team_email_html(doc: dict, user: dict, sent_at: datetime) -> str:
    first, last = user.get("first_name"), user.get("last_name")
    if not first:
        parts = TITLES.sub("", (user.get("name") or "").strip()).split()
        first, last = " ".join(parts[:-1]) or (parts[0] if parts else ""), parts[-1] if len(parts) > 1 else ""
    rows = [("Tipo", KINDS[doc["kind"]]), ("Nome", first), ("Cognome", last), ("Ruolo", ROLES.get(user.get("role"), user.get("role"))),
            ("Email di contatto", user.get("email")), ("Area", ALL_AREAS[doc["area"]]),
            ("Data e ora", sent_at.astimezone(ZoneInfo("Europe/Rome")).strftime("%d/%m/%Y %H:%M:%S") + " (ora italiana)")]
    if doc.get("rating"):
        rows.append(("Valutazione", f"{doc['rating']} / 5"))
    tech = doc.get("tech") or {}
    rows += [(k, tech.get(f)) for k, f in (("Pagina", "page"), ("Browser / dispositivo", "user_agent"), ("Schermo", "screen"), ("Lingua", "language")) if tech.get(f)]
    cells = "".join(f'<tr><td style="padding:6px 0;color:#5B6478;width:170px;vertical-align:top">{k}</td><td style="padding:6px 0">{hesc(str(v or "—"))}</td></tr>' for k, v in rows)
    return ('<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F5F7;padding:24px 0"><tr><td align="center">'
            '<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;font-family:Arial,sans-serif;color:#0A192F">'
            '<tr><td style="background:#0A192F;padding:22px 28px;color:#ffffff;font-family:Georgia,serif;font-size:24px">MantMed'
            f'<div style="font-family:Arial,sans-serif;font-size:11px;letter-spacing:2px;color:#C9CCD3;margin-top:4px">{hesc(KINDS[doc["kind"]].upper())} DAL PORTALE</div></td></tr>'
            f'<tr><td style="padding:24px 28px;font-size:14px"><table width="100%">{cells}</table>'
            '<div style="margin-top:18px;font-size:11px;letter-spacing:2px;color:#5B6478">MESSAGGIO</div>'
            f'<p style="margin-top:6px;white-space:pre-wrap;line-height:1.6;border-left:3px solid #0A192F;padding-left:12px">{hesc(doc["text"] or "(nessun testo)")}</p>'
            '<p style="margin-top:16px;color:#5B6478;font-size:12px">Risponda a questa email per scrivere direttamente all\'utente.</p></td></tr></table></td></tr></table>')


async def submit_feedback(db, body: FeedbackIn, user: dict, extra: dict) -> dict:
    """Salva il messaggio (idempotente su client_id) e lo inoltra via email al team MantMed."""
    sent_at = _now()
    doc = {**extra, "kind": body.kind, "rating": body.rating, "area": body.area, "text": body.text.strip(),
           "tech": body.tech.model_dump() if body.tech else None, "email": user.get("email"), "created_at": sent_at.isoformat()}
    key = {"client_id": body.client_id} if body.client_id else None
    prev = await db.feedback.find_one({**key, "user_id": user["id"]}) if key else None
    if prev and prev.get("email_sent"):
        return {"id": str(prev["_id"]), "email_sent": True}
    if prev:
        fid = prev["_id"]
        await db.feedback.update_one({"_id": fid}, {"$set": seal_fields(dict(doc), ("text",))})
    else:
        fid = (await db.feedback.insert_one(seal_fields({**doc, "user_id": user["id"], "client_id": body.client_id or None, "email_sent": False}, ("text",)))).inserted_id
    u = await db.users.find_one({"_id": ObjectId(user["id"])}, {"first_name": 1, "last_name": 1}) if ObjectId.is_valid(user["id"]) else None
    user = {**user, "first_name": (u or {}).get("first_name"), "last_name": (u or {}).get("last_name")}
    who = user.get("name") or user.get("email")
    label = {"feedback": "Nuovo Feedback", "supporto": "Richiesta di Supporto", "segnalazione": "Nuova Segnalazione"}[body.kind]
    try:
        await send_email(to=os.environ["ADMIN_EMAIL"], subject=f"{label} da {who} · {ROLES.get(user.get('role'), '')} - MantMed",
                         html=team_email_html(doc, user, sent_at), reply_to=user.get("email"))
    except Exception:
        logger.exception("Email feedback %s non inviata", fid)
        raise HTTPException(502, "Invio non riuscito: il messaggio è stato salvato, riprovi tra qualche istante")
    await db.feedback.update_one({"_id": fid}, {"$set": {"email_sent": True, "email_sent_at": _now().isoformat()}})
    return {"id": str(fid), "email_sent": True}


def _now():
    return datetime.now(timezone.utc)


def app_seconds(c: dict) -> float:
    review = 0.0
    if c.get("finalized_at"):
        review = (datetime.fromisoformat(c["finalized_at"]) - datetime.fromisoformat(c["created_at"])).total_seconds()
    return float(c.get("ai_sec") or 0) + min(max(review, 0.0), REVIEW_CAP_SEC)


def report_stats(cons: list) -> dict:
    timed = [c for c in cons if c.get("ai_sec")]
    saved = [max(0.0, MANUAL_REPORT_MIN * 60 - app_seconds(c)) for c in timed]
    n = len(timed)
    return {
        "reports": len(cons),
        "timed_reports": n,
        "pdf_exports": sum(int(c.get("pdf_exports") or 0) for c in cons),
        "avg_app_min": round(sum(app_seconds(c) for c in timed) / n / 60, 1) if n else 0,
        "avg_saved_min": round(sum(saved) / n / 60, 1) if n else 0,
        "total_saved_min": round(sum(saved) / 60),
    }


def feedback_stats(items: list) -> dict:
    n = len(items)
    return {"feedback": n, "avg_rating": round(sum(f["rating"] for f in items) / n, 1) if n else 0}


def build_beta(db, current_user):
    router = APIRouter(prefix="/beta")

    @router.post("/feedback")
    async def send_feedback(body: FeedbackIn, user: dict = Depends(current_user)):
        return await submit_feedback(db, body, user, {"doctor_id": user["id"], "role": "doctor", "doctor_name": user["name"]})

    @router.get("/metrics")
    async def metrics(user: dict = Depends(current_user)):
        cons = await db.consultations.find({}, {"doctor_id": 1, "ai_sec": 1, "created_at": 1, "finalized_at": 1, "pdf_exports": 1}).to_list(10000)
        fbs = [unseal_fields(f, ("text",)) for f in await db.feedback.find({"kind": {"$in": [None, "feedback"]}, "rating": {"$ne": None}}).sort("created_at", -1).to_list(5000)]
        mine_c = [c for c in cons if c.get("doctor_id") == user["id"]]
        mine_f = [f for f in fbs if f["doctor_id"] == user["id"]]
        today = _now().date()
        days = [(today - timedelta(days=i)).isoformat() for i in range(13, -1, -1)]
        by_day = {d: 0 for d in days}
        for c in cons:
            if c["created_at"][:10] in by_day:
                by_day[c["created_at"][:10]] += 1
        by_area = [{"area": k, "label": v, "count": sum(1 for f in fbs if f["area"] == k),
                    "avg_rating": round(sum(f["rating"] for f in fbs if f["area"] == k) / max(1, sum(1 for f in fbs if f["area"] == k)), 1)}
                   for k, v in AREAS.items()]
        return {
            "baseline_min": MANUAL_REPORT_MIN,
            "mine": {**report_stats(mine_c), **feedback_stats(mine_f)},
            "all": {**report_stats(cons), **feedback_stats(fbs), "testers": len({f["doctor_id"] for f in fbs} | {c["doctor_id"] for c in cons if c.get("doctor_id")})},
            "daily": [{"date": d, "count": by_day[d]} for d in days],
            "by_area": by_area,
            "recent": [{"id": str(f["_id"]), "doctor_name": f["doctor_name"], "rating": f["rating"], "area": f["area"],
                        "area_label": ALL_AREAS[f["area"]], "text": f.get("text") or "", "created_at": f["created_at"], "mine": f["doctor_id"] == user["id"]}
                       for f in fbs[:8]],
        }

    return router
