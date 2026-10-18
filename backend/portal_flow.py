"""Portal appointment requests (parent -> doctor) and portal invitations (doctor -> parent)."""
import os
import re
import hashlib
import secrets
import logging
from datetime import datetime, timezone, timedelta, date as Date
from html import escape as hesc
from typing import Literal, Optional
from zoneinfo import ZoneInfo
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, field_validator
from auth import require_role
from crypto import seal_fields, unseal_fields
from mailer import send_email
from registration import mail_shell
from scheduling import free_slots, schedule_of

logger = logging.getLogger(__name__)
SERVICES = ["Prima visita", "Bilancio di salute", "Visita di controllo", "Visita urgente"]
TIME_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
INVITE_DAYS = 7
MAX_PENDING = 5
CANCEL_CUTOFF_H = 12
ROME = ZoneInfo("Europe/Rome")


def _now():
    return datetime.now(timezone.utc)


def _h(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _fmt_day(d: str) -> str:
    return Date.fromisoformat(d).strftime("%d/%m/%Y")


class Slot(BaseModel):
    date: str
    time: str

    @field_validator("date")
    @classmethod
    def v_date(cls, v):
        if Date.fromisoformat(v) < datetime.now(timezone.utc).date():
            raise ValueError("La data non può essere nel passato")
        return v

    @field_validator("time")
    @classmethod
    def v_time(cls, v):
        if not TIME_RE.match(v):
            raise ValueError("Orario non valido")
        return v


class RequestIn(Slot):
    patient_id: str
    clinic: str
    service: Literal["Prima visita", "Bilancio di salute", "Visita di controllo", "Visita urgente"]
    note: str = Field(default="", max_length=1000)


class ConfirmIn(Slot):
    clinic: Optional[str] = None


class DeclineIn(BaseModel):
    reason: str = Field(default="", max_length=500)


class CancelIn(BaseModel):
    reason: str = Field(default="", max_length=500)


def req_out(r: dict) -> dict:
    r = unseal_fields(r, ("note", "reason"))
    return {"id": str(r["_id"]), **{k: r.get(k) for k in ("patient_id", "patient_name", "parent_name", "clinic", "service", "date", "time", "note",
                                                         "status", "reason", "confirmed_date", "confirmed_time", "created_at", "decided_at", "pay_online", "amount")}}


async def check_request(db, body: RequestIn, user_id: str):
    """Validate a parent's booking (child link, clinic, free slot) and return (parent, doctor, patient)."""
    u = await db.users.find_one({"_id": ObjectId(user_id)})
    link = next((c for c in u.get("children", []) if c["patient_id"] == body.patient_id), None)
    if not link:
        raise HTTPException(404, "Figlio non collegato al suo account")
    doc = await db.users.find_one({"_id": ObjectId(link["owner_id"])})
    if body.clinic not in [c["name"] for c in (doc or {}).get("clinics", [])]:
        raise HTTPException(400, "Studio non valido")
    if body.time not in await free_slots(db, doc, body.clinic, body.service, body.date):
        raise HTTPException(409, "L'orario scelto non è più disponibile: ne selezioni un altro")
    p = await db.patients.find_one({"_id": ObjectId(body.patient_id), "owner_id": link["owner_id"]})
    if not p:
        raise HTTPException(404, "Cartella non trovata")
    return u, doc, p


def request_doc(body: RequestIn, u: dict, doc: dict, p: dict, status: str) -> dict:
    return {"owner_id": str(doc["_id"]), "patient_id": body.patient_id, "patient_name": p["name"], "parent_id": str(u["_id"]), "parent_name": u["name"],
            "parent_email": u["email"], "clinic": body.clinic, "service": body.service, "date": body.date, "time": body.time,
            **seal_fields({"note": body.note.strip()}, ("note",)), "status": status, "created_at": _now().isoformat()}


def build_portal_flow(db, tdb, current_user, Appointment, tenant_clinics, refund_online):
    doctor = APIRouter()
    parent = APIRouter(prefix="/portal", dependencies=[Depends(require_role(current_user, "parent"))])
    public = APIRouter(prefix="/register")

    async def notify(r: dict, subject: str, body: str):
        try:
            await send_email(to=r["parent_email"], subject=subject, html=mail_shell("PORTALE PAZIENTE", body))
        except Exception:
            logger.exception("Email al genitore non inviata")

    # ---------- Medico: richieste dal portale ----------
    @doctor.get("/appointment-requests")
    async def list_requests():
        since = (_now() - timedelta(days=14)).isoformat()
        docs = await tdb.appt_requests.find({"$or": [{"status": "pending"}, {"decided_at": {"$gte": since}}]}).sort("created_at", -1).to_list(200)
        return [req_out(d) for d in docs]

    async def pending(rid: str) -> dict:
        r = await tdb.appt_requests.find_one({"_id": ObjectId(rid), "status": "pending"}) if ObjectId.is_valid(rid) else None
        if not r:
            raise HTTPException(404, "Richiesta non trovata o già gestita")
        return r

    @doctor.post("/appointment-requests/{rid}/confirm")
    async def confirm(rid: str, body: ConfirmIn):
        r = await pending(rid)
        clinic = body.clinic or r["clinic"]
        if clinic not in tenant_clinics():
            raise HTTPException(400, "Studio non valido")
        note = unseal_fields(r, ("note",)).get("note") or ""
        owner = await db.users.find_one({"_id": ObjectId(r["owner_id"])})
        appt = Appointment(clinic=clinic, date=body.date, time=body.time, patient_name=r["patient_name"], patient_id=r["patient_id"],
                           visit_type=r["service"], duration=schedule_of(owner)["durations"].get(r["service"], 30), notes=f"Richiesta dal portale. {note}".strip())
        res = await tdb.appointments.insert_one(appt.to_mongo())
        await tdb.appt_requests.update_one({"_id": r["_id"]}, {"$set": {"status": "confirmed", "confirmed_date": body.date, "confirmed_time": body.time,
                                                                       "clinic": clinic, "appointment_id": str(res.inserted_id), "decided_at": _now().isoformat()}})
        await notify(r, f"MantMed · appuntamento confermato per {r['patient_name']}",
                     f"<p>Gentile {hesc(r['parent_name'])},</p><p>l'appuntamento richiesto per <strong>{hesc(r['patient_name'])}</strong> è confermato:</p>"
                     f"<p style=\"font-family:Georgia,serif;font-size:22px\">{_fmt_day(body.date)} alle {body.time}</p>"
                     f"<p>{hesc(r['service'])} · {hesc(clinic)}</p><p style=\"color:#5B6478;font-size:13px\">Lo trova anche nel suo Portale Paziente.</p>")
        return req_out(await tdb.appt_requests.find_one({"_id": r["_id"]}))

    @doctor.post("/appointment-requests/{rid}/decline")
    async def decline(rid: str, body: DeclineIn):
        r = await pending(rid)
        await tdb.appt_requests.update_one({"_id": r["_id"]}, {"$set": {"status": "declined", "decided_at": _now().isoformat(),
                                                                       **seal_fields({"reason": body.reason.strip()}, ("reason",))}})
        why = f"<p>Nota dello studio: {hesc(body.reason.strip())}</p>" if body.reason.strip() else ""
        await notify(r, f"MantMed · richiesta di appuntamento per {r['patient_name']}",
                     f"<p>Gentile {hesc(r['parent_name'])},</p><p>purtroppo non è possibile confermare l'appuntamento richiesto per "
                     f"<strong>{hesc(r['patient_name'])}</strong> il {_fmt_day(r['date'])} alle {r['time']}.</p>{why}"
                     "<p>Può inviare una nuova richiesta con un'altra data dal Portale Paziente o contattare lo studio.</p>")
        return req_out(await tdb.appt_requests.find_one({"_id": r["_id"]}))

    # ---------- Medico: annullamenti dal portale ----------
    @doctor.get("/appointments/cancellations")
    async def cancellations():
        since = (_now() - timedelta(days=7)).isoformat()
        docs = await tdb.appointments.find({"status": "annullato", "cancelled_by": "genitore", "cancelled_at": {"$gte": since}}).sort("cancelled_at", -1).to_list(50)
        return [{"id": str(d["_id"]), "patient_name": d["patient_name"], "date": d.get("date"), "time": d["time"], "clinic": d["clinic"],
                 "visit_type": unseal_fields(d, Appointment.__encrypted__).get("visit_type"), "cancelled_at": d["cancelled_at"],
                 "reason": unseal_fields(d, ("cancel_reason",)).get("cancel_reason") or "", "refunded": d.get("refunded_amount")} for d in docs]

    # ---------- Medico: invito al portale ----------
    @doctor.post("/patients/{pid}/invite")
    async def invite(pid: str, request: Request, user: dict = Depends(current_user)):
        p = await tdb.patients.find_one({"_id": ObjectId(pid)}) if ObjectId.is_valid(pid) else None
        if not p:
            raise HTTPException(404, "Paziente non trovato")
        p = unseal_fields(p, ("guardian_email", "fiscal_code", "guardian"))
        email = (p.get("guardian_email") or "").strip().lower()
        if not EMAIL_RE.match(email):
            raise HTTPException(400, "Inserisca l'email del genitore nel passaporto prima di inviare l'invito")
        if not (p.get("fiscal_code") or "").strip():
            raise HTTPException(400, "Inserisca il codice fiscale del bambino nel passaporto: serve per collegare la cartella")
        origin = request.headers.get("origin") or ""
        if not origin.startswith("https://"):
            raise HTTPException(400, "Origine della richiesta non valida")
        token = secrets.token_urlsafe(24)
        await db.portal_invites.insert_one({"token": _h(token), "patient_id": pid, "owner_id": p["owner_id"], "email": email,
                                            **seal_fields({"cf": p["fiscal_code"].strip().upper()}, ("cf",)), "patient_first": p["name"].split()[0],
                                            "doctor": user["name"], "created_at": _now().isoformat(),
                                            "expires_at": (_now() + timedelta(days=INVITE_DAYS)).isoformat()})
        link = f"{origin}/registrati/paziente?invito={token}"
        await send_email(to=email, subject=f"{user['name']} la invita al Portale Paziente MantMed", html=mail_shell("INVITO AL PORTALE PAZIENTE",
            f"<p>Gentile {hesc(p.get('guardian') or 'genitore')},</p><p>{hesc(user['name'])} la invita ad attivare il <strong>Portale Paziente MantMed</strong> "
            f"per {hesc(p['name'])}: un'area personale protetta dove consultare referti, consensi firmati e appuntamenti, e richiedere nuove visite.</p>"
            "<p><strong>Come attivarlo</strong></p><ol style=\"padding-left:18px\"><li>Apra il link personale qui sotto.</li>"
            "<li>Completi i suoi dati e scelga una password: email e codice fiscale del bambino sono già compilati.</li>"
            "<li>Inserisca il codice di verifica che riceverà via email: la cartella si collega in automatico.</li></ol>"
            f"<p style=\"margin:22px 0\"><a href=\"{hesc(link)}\" style=\"background:#0A192F;color:#ffffff;padding:14px 22px;border-radius:999px;text-decoration:none\">Attiva il Portale Paziente</a></p>"
            f"<p style=\"color:#5B6478;font-size:13px\">Il link è personale e scade tra {INVITE_DAYS} giorni.</p>"))
        sent = _now().isoformat()
        await tdb.patients.update_one({"_id": ObjectId(pid)}, {"$set": {"portal_invited_at": sent}})
        return {"sent": True, "to": email, "sent_at": sent}

    @public.get("/invite/{token}")
    async def invite_info(token: str):
        inv = await db.portal_invites.find_one({"token": _h(token)})
        if not inv or datetime.fromisoformat(inv["expires_at"]) < _now():
            raise HTTPException(410, "Invito scaduto o non valido: chieda allo studio un nuovo invito")
        return {"email": inv["email"], "child_fiscal_code": unseal_fields(inv, ("cf",))["cf"], "patient_first": inv["patient_first"], "doctor": inv["doctor"]}

    async def linked_parent(user: dict, patient_id: str, owner_id: str) -> dict:
        u = await db.users.find_one({"_id": ObjectId(user["id"])})
        if not any(c["patient_id"] == patient_id and c["owner_id"] == owner_id for c in u.get("children", [])):
            raise HTTPException(404, "Visita non trovata")
        return u

    @parent.post("/appointments/{aid}/cancel")
    async def cancel_appointment(aid: str, body: CancelIn, user: dict = Depends(current_user)):
        a = await db.appointments.find_one({"_id": ObjectId(aid)}) if ObjectId.is_valid(aid) else None
        if not a or not a.get("patient_id"):
            raise HTTPException(404, "Visita non trovata")
        u = await linked_parent(user, a["patient_id"], a["owner_id"])
        if a.get("status") in ("completato", "annullato", "in_corso"):
            raise HTTPException(409, "Questa visita non può più essere annullata")
        owner = await db.users.find_one({"_id": ObjectId(a["owner_id"])}) or {}
        phone = (owner.get("profile") or {}).get("phone") or os.environ["STUDIO_PHONE"]
        day = a.get("date") or datetime.now(ROME).date().isoformat()
        start = datetime.fromisoformat(f"{day}T{a['time']}").replace(tzinfo=ROME)
        if start - datetime.now(ROME) < timedelta(hours=CANCEL_CUTOFF_H):
            raise HTTPException(409, f"Mancano meno di {CANCEL_CUTOFF_H} ore alla visita: per annullare telefoni allo studio al {phone}")
        refunded = await refund_online(a)
        now = _now().isoformat()
        await db.appointments.update_one({"_id": a["_id"]}, {"$set": {"status": "annullato", "cancelled_by": "genitore", "cancelled_at": now, "refunded_amount": refunded,
                                                                    **seal_fields({"cancel_reason": body.reason.strip()}, ("cancel_reason",))}})
        await db.appt_requests.update_many({"appointment_id": aid}, {"$set": {"status": "cancelled", "decided_at": now}})
        await db.audit.insert_one({"action": "visita_annullata_genitore", "subject": seal_fields({"s": a["patient_name"]}, ("s",))["s"], "at": now, "owner_id": a["owner_id"]})
        await notify({"parent_email": u["email"]}, f"MantMed · visita di {a['patient_name']} annullata",
                     f"<p>Gentile {hesc(u['name'])},</p><p>confermiamo l'annullamento della visita di <strong>{hesc(a['patient_name'])}</strong> "
                     f"del {_fmt_day(day)} alle {a['time']} ({hesc(a['clinic'])}). Lo studio è stato avvisato.</p>"
                     + (f"<p>Il pagamento online di <strong>{f'{refunded:.2f}'.replace('.', ',')} €</strong> è stato rimborsato per intero: l'accredito sulla carta "
                        "arriva di solito in 5-10 giorni lavorativi.</p>" if refunded else "")
                     + "<p>Può richiedere un nuovo appuntamento in qualsiasi momento dal Portale Paziente.</p>")
        return {"cancelled": True, "refunded": refunded}

    @parent.post("/appointment-requests/{rid}/cancel")
    async def cancel_request(rid: str, user: dict = Depends(current_user)):
        r = await db.appt_requests.find_one({"_id": ObjectId(rid), "parent_id": user["id"], "status": "pending"}) if ObjectId.is_valid(rid) else None
        if not r:
            raise HTTPException(404, "Richiesta non trovata o già gestita")
        await db.appt_requests.update_one({"_id": r["_id"]}, {"$set": {"status": "cancelled", "decided_at": _now().isoformat()}})
        return {"cancelled": True}

    # ---------- Genitore: nuova richiesta ----------
    @parent.post("/appointment-requests")
    async def create_request(body: RequestIn, user: dict = Depends(current_user)):
        if await db.appt_requests.count_documents({"parent_id": user["id"], "status": "pending"}) >= MAX_PENDING:
            raise HTTPException(429, f"Ha già {MAX_PENDING} richieste in attesa di conferma")
        u, doc, p = await check_request(db, body, user["id"])
        r = request_doc(body, u, doc, p, "pending")
        res = await db.appt_requests.insert_one(r)
        return req_out({**r, "_id": res.inserted_id})

    return doctor, parent, public
