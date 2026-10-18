"""Studio opening hours, service durations, free-slot calculation and 24h visit reminders."""
import os
import re
import hmac
import asyncio
import logging
from datetime import datetime, timedelta, timezone, date as Date
from html import escape as hesc
from zoneinfo import ZoneInfo
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, field_validator
from auth import require_role
from crypto import unseal_fields
from mailer import send_email
from registration import mail_shell, in_network

logger = logging.getLogger(__name__)
ROME = ZoneInfo("Europe/Rome")
TIME_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
STEP_MIN = 15
DEFAULT_DURATIONS = {"Prima visita": 45, "Bilancio di salute": 30, "Visita di controllo": 20, "Visita urgente": 20}
FOUNDER_HOURS = {"Studio Centro": ("09:00", "13:00"), "Studio Provincia": ("15:00", "19:00")}
BRING = {
    "Prima visita": "tessera sanitaria, libretto pediatrico e vaccinale, eventuali esami, lettere di dimissione o referti precedenti, elenco dei farmaci in uso",
    "Bilancio di salute": "tessera sanitaria, libretto pediatrico e vaccinale, eventuali esami recenti",
    "Visita di controllo": "tessera sanitaria, esami o referti richiesti alla visita precedente, farmaci in uso",
    "Visita urgente": "tessera sanitaria, farmaci somministrati (nome e orario) e misurazioni della febbre, se presenti",
}
BRING_DEFAULT = "tessera sanitaria, libretto pediatrico e vaccinale, esami recenti e farmaci in uso"


def mins(t: str) -> int:
    h, m = t.split(":")
    return int(h) * 60 + int(m)


def hhmm(m: int) -> str:
    return f"{m // 60:02d}:{m % 60:02d}"


class Hours(BaseModel):
    days: list[int] = Field(default_factory=lambda: [1, 2, 3, 4, 5])
    start: str
    end: str

    @field_validator("days")
    @classmethod
    def v_days(cls, v):
        if any(d not in range(1, 8) for d in v):
            raise ValueError("Giorni non validi")
        return sorted(set(v))

    @field_validator("start", "end")
    @classmethod
    def v_time(cls, v):
        if not TIME_RE.match(v):
            raise ValueError("Orario non valido")
        return v


class Billing(BaseModel):
    holder: str = Field(default="", max_length=120)
    tax_code: str = Field(default="", max_length=16)
    vat_number: str = Field(default="", max_length=13)
    address: str = Field(default="", max_length=200)
    note: str = Field(default="", max_length=300)


class ServiceIn(BaseModel):
    name: str = Field(min_length=2, max_length=60)
    duration: int = Field(ge=5, le=240)
    price: float = Field(default=0, ge=0, le=5000)


class ClinicIn(BaseModel):
    name: str = Field(min_length=2, max_length=60)
    address: str = Field(default="", max_length=200)


class ScheduleIn(BaseModel):
    hours: dict[str, Hours]
    services: list[ServiceIn] = Field(min_length=1, max_length=20)
    clinics: list[ClinicIn] = Field(min_length=1, max_length=6)
    billing: Billing = Field(default_factory=Billing)

    @field_validator("services")
    @classmethod
    def v_services(cls, v):
        names = [s.name.strip() for s in v]
        if len(set(n.lower() for n in names)) != len(names):
            raise ValueError("Ogni prestazione deve avere un nome diverso")
        return [ServiceIn(name=s.name.strip(), duration=s.duration, price=round(s.price, 2)) for s in v]

    @field_validator("clinics")
    @classmethod
    def v_clinics(cls, v):
        names = [c.name.strip() for c in v]
        if len(set(n.lower() for n in names)) != len(names):
            raise ValueError("Ogni sede deve avere un nome diverso")
        return [ClinicIn(name=c.name.strip(), address=c.address.strip()) for c in v]


def services_of(user: dict) -> list[dict]:
    saved = user.get("schedule") or {}
    if saved.get("services"):
        return saved["services"]
    durs, prices = {**DEFAULT_DURATIONS, **(saved.get("durations") or {})}, saved.get("prices") or {}
    return [{"name": k, "duration": int(d), "price": float(prices.get(k) or 0)} for k, d in durs.items()]


def schedule_of(user: dict) -> dict:
    """Opening hours per clinic (days 1=Mon..7=Sun), the doctor's own services (name, duration, price) and fiscal data."""
    names = [c["name"] for c in user.get("clinics") or []] or ["Studio principale"]
    saved = user.get("schedule") or {}
    hours = {n: {**{"days": [1, 2, 3, 4, 5], "start": FOUNDER_HOURS.get(n, ("09:00", "18:00"))[0], "end": FOUNDER_HOURS.get(n, ("09:00", "18:00"))[1]},
                 **(saved.get("hours", {}).get(n) or {})} for n in names}
    services = services_of(user)
    return {"hours": hours, "services": services, "clinics": user.get("clinics") or [{"name": "Studio principale", "address": ""}],
            "durations": {s["name"]: s["duration"] for s in services}, "prices": {s["name"]: s["price"] for s in services},
            "billing": {**Billing().model_dump(), "holder": user.get("name", ""), **(user.get("billing") or {})}}


STAMP_THRESHOLD = 77.47
STAMP_DUTY = 2.0


def online_quote(user: dict, service: str) -> dict:
    """Online price for a service: tariff + 2 euro stamp duty above 77,47 euro. Online only if tariff and fiscal data are set."""
    sch = schedule_of(user)
    price = float(sch["prices"].get(service) or 0)
    b = sch["billing"]
    stamp = STAMP_DUTY if price > STAMP_THRESHOLD else 0.0
    return {"price": price, "stamp": stamp, "total": round(price + stamp, 2),
            "online": price > 0 and bool(b.get("tax_code") or b.get("vat_number"))}


async def free_slots(db, owner: dict, clinic: str, service: str, day: str) -> list[str]:
    sch = schedule_of(owner)
    h = sch["hours"].get(clinic)
    if not h:
        raise HTTPException(400, "Studio non valido")
    d = Date.fromisoformat(day)
    now = datetime.now(ROME)
    if d < now.date() or d.isoweekday() not in h["days"]:
        return []
    dur = sch["durations"].get(service)
    if not dur:
        raise HTTPException(400, "Prestazione non disponibile presso questo medico")
    owner_id = str(owner["_id"])
    busy = []
    async for a in db.appointments.find({"owner_id": owner_id, "date": day, "status": {"$ne": "annullato"}}):
        busy.append((mins(a["time"]), mins(a["time"]) + int(a.get("duration") or 30)))
    held = {"status": "awaiting_payment", "hold_until": {"$gte": datetime.now(timezone.utc).isoformat()}}
    async for r in db.appt_requests.find({"owner_id": owner_id, "date": day, "$or": [{"status": "pending"}, held]}):
        busy.append((mins(r["time"]), mins(r["time"]) + sch["durations"].get(r["service"], 30)))
    earliest = now.hour * 60 + now.minute + 60 if d == now.date() else 0
    out, t = [], mins(h["start"])
    while t + dur <= mins(h["end"]):
        if t >= earliest and all(t + dur <= s or t >= e for s, e in busy):
            out.append(hhmm(t))
        t += STEP_MIN
    return out


async def network_doctor(db, doctor_id: str) -> dict:
    d = await db.users.find_one({"_id": ObjectId(doctor_id), "role": "doctor", "status": "active"}) if ObjectId.is_valid(doctor_id) else None
    if not d or not in_network(d):
        raise HTTPException(404, "Specialista non disponibile")
    return d


def build_scheduling(db, tdb, current_user):
    doctor = APIRouter(prefix="/settings")
    portal = APIRouter(prefix="/portal", dependencies=[Depends(require_role(current_user, "parent"))])
    cron = APIRouter(prefix="/cron")

    @doctor.get("/schedule")
    async def get_schedule(user: dict = Depends(current_user)):
        return schedule_of(await db.users.find_one({"_id": ObjectId(user["id"])}))

    @doctor.put("/schedule")
    async def put_schedule(body: ScheduleIn, user: dict = Depends(current_user)):
        u = await db.users.find_one({"_id": ObjectId(user["id"])})
        names = {c.name for c in body.clinics}
        if set(body.hours) != names:
            raise HTTPException(400, "Indicare gli orari per tutte le sedi")
        for n, h in body.hours.items():
            if mins(h.start) >= mins(h.end):
                raise HTTPException(400, f"{n}: l'orario di chiusura deve seguire l'apertura")
        await db.users.update_one({"_id": u["_id"]}, {"$set": {"schedule": {"hours": {k: v.model_dump() for k, v in body.hours.items()},
                                                                              "services": [s.model_dump() for s in body.services]},
                                                                 "clinics": [c.model_dump() for c in body.clinics],
                                                                 "billing": {**body.billing.model_dump(), "tax_code": body.billing.tax_code.strip().upper()}}})
        return schedule_of(await db.users.find_one({"_id": u["_id"]}))

    @portal.get("/slots")
    async def slots(patient_id: str, clinic: str, service: str, date: str, doctor_id: str = "", user: dict = Depends(current_user)):
        u = await db.users.find_one({"_id": ObjectId(user["id"])})
        link = next((c for c in u.get("children", []) if c["patient_id"] == patient_id), None)
        if not link:
            raise HTTPException(404, "Figlio non collegato al suo account")
        try:
            Date.fromisoformat(date)
        except ValueError:
            raise HTTPException(422, "Data non valida")
        owner = await network_doctor(db, doctor_id) if doctor_id and doctor_id != link["owner_id"] else await db.users.find_one({"_id": ObjectId(link["owner_id"])})
        sch = schedule_of(owner)
        return {"slots": await free_slots(db, owner, clinic, service, date), "duration": sch["durations"].get(service, 30),
                "hours": sch["hours"].get(clinic), "quote": online_quote(owner, service)}

    # ---------- Promemoria 24 ore prima ----------
    async def send_reminders(base: str):
        now = datetime.now(ROME)
        days = [now.date().isoformat(), (now.date() + timedelta(days=1)).isoformat()]
        sent = 0
        async for a in db.appointments.find({"date": {"$in": days}, "reminder_sent_at": None, "patient_id": {"$ne": None},
                                             "status": {"$nin": ["completato", "annullato"]}}):
            a = unseal_fields(a, ("visit_type", "notes"))
            start = datetime.fromisoformat(f"{a['date']}T{a['time']}").replace(tzinfo=ROME)
            if not (now < start <= now + timedelta(hours=24)):
                continue
            p = await db.patients.find_one({"_id": ObjectId(a["patient_id"]), "owner_id": a["owner_id"]})
            email = (unseal_fields(p, ("guardian_email",)).get("guardian_email") or "").strip() if p else ""
            claim = await db.appointments.update_one({"_id": a["_id"], "reminder_sent_at": None}, {"$set": {"reminder_sent_at": datetime.now(timezone.utc).isoformat()}})
            if not email or not claim.modified_count:
                continue
            owner = await db.users.find_one({"_id": ObjectId(a["owner_id"])}) or {}
            addr = next((c.get("address", "") for c in owner.get("clinics", []) if c["name"] == a["clinic"]), "")
            body = (f"<p>Gentile genitore,</p><p>le ricordiamo la visita di <strong>{hesc(p['name'])}</strong>:</p>"
                    f"<p style=\"font-family:Georgia,serif;font-size:22px;margin:14px 0\">{start.strftime('%d/%m/%Y')} alle {a['time']}</p>"
                    f"<p>{hesc(a.get('visit_type') or 'Visita')} · {hesc(owner.get('name', ''))}<br>{hesc(a['clinic'])}{(' · ' + hesc(addr)) if addr else ''}</p>"
                    f"<p><strong>Da portare:</strong> {hesc(BRING.get(a.get('visit_type'), BRING_DEFAULT))}.</p>"
                    f"<p style=\"margin:20px 0\"><a href=\"{hesc(base)}/portale?visita={a['_id']}\" style=\"background:#0A192F;color:#ffffff;padding:12px 20px;border-radius:999px;text-decoration:none\">Gestisci o annulla la visita</a></p>"
                    "<p style=\"color:#5B6478;font-size:13px\">L'annullamento dal Portale Paziente è possibile fino a 12 ore prima della visita; dopo, avvisi lo studio telefonicamente.</p>")
            try:
                await send_email(to=email, subject=f"Promemoria · visita di {p['name']} domani alle {a['time']}" if a["date"] != now.date().isoformat()
                                 else f"Promemoria · visita di {p['name']} oggi alle {a['time']}", html=mail_shell("PROMEMORIA VISITA", body))
                sent += 1
            except Exception:
                logger.exception("Promemoria non inviato")
                await db.appointments.update_one({"_id": a["_id"]}, {"$set": {"reminder_sent_at": None}})
        logger.info("Promemoria visite inviati: %s", sent)
        return sent

    @cron.post("/visit-reminders", status_code=202)
    async def visit_reminders(request: Request):
        # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
        auth = request.headers.get("authorization", "")
        token = auth[7:] if auth.startswith("Bearer ") else ""
        if not token or not hmac.compare_digest(token, os.environ["WEBHOOK_CRON_SECRET"]):
            raise HTTPException(401, "Non autorizzato")
        try:
            env = await request.json()
        except Exception:
            raise HTTPException(400, "Body non valido")
        run_id = request.headers.get("x-webhook-id") or (env or {}).get("run_id") or ""
        if run_id:
            res = await db.cron_runs.update_one({"_id": run_id}, {"$setOnInsert": {"at": datetime.now(timezone.utc).isoformat()}}, upsert=True)
            if not res.upserted_id:
                return {"accepted": True, "duplicate": True}
        host = request.headers.get("x-forwarded-host") or request.headers.get("host") or ""
        asyncio.create_task(send_reminders(f"https://{host.split(',')[0].strip()}"))
        return {"accepted": True}

    return doctor, portal, cron, send_reminders
