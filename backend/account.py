"""Area Riservata: profile, notification preferences, sessions, absences, GDPR export and account deactivation."""
import json
import logging
import os
import re
from datetime import datetime, timezone, date as Date
from html import escape as hesc
from typing import Optional
import jwt
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field, field_validator
from auth import verify_password, require_role, ALG
from crypto import seal_fields, unseal_fields
from mailer import send_email
from registration import mail_shell, EMAIL_RE, PHONE_RE, CF_RE

logger = logging.getLogger(__name__)
PARENT_PREFS = {"appointments": {"email": True, "inapp": True}, "reports": {"email": False, "inapp": True}, "messages": {"email": False, "inapp": True}}
DOCTOR_PREFS = {"bookings": {"email": False, "inapp": True}, "cancellations": {"email": False, "inapp": True}, "messages": {"email": False, "inapp": True}}
P_SEALED = ("fiscal_code", "address", "phone")
NOTIF_CAT = {"report": "reports", "checkpoint": "reports", "reply": "messages", "reminder": "appointments", "team": "messages"}


def _now():
    return datetime.now(timezone.utc)


def prefs_of(u: dict) -> dict:
    base = PARENT_PREFS if u.get("role") == "parent" else DOCTOR_PREFS
    saved = u.get("notify_prefs") or {}
    return {k: {**v, **{c: bool(x) for c, x in (saved.get(k) or {}).items() if c in v}} for k, v in base.items()}


async def parent_wants(db, cat: str, channel: str, uid: Optional[str] = None, email: Optional[str] = None) -> bool:
    u = await db.users.find_one({"_id": ObjectId(uid)} if uid else {"email": (email or "").strip().lower(), "role": "parent"})
    if not u:
        return channel == "email" and PARENT_PREFS[cat]["email"]
    return u.get("status", "active") == "active" and prefs_of(u)[cat][channel]


async def notify_doctor(db, owner_id: str, cat: str, subject: str, body: str):
    try:
        d = await db.users.find_one({"_id": ObjectId(owner_id)})
        if d and prefs_of(d)[cat]["email"]:
            await send_email(to=d["email"], subject=subject, html=mail_shell("AVVISO DAL PORTALE", body + "<p>Apra la dashboard MantMed per i dettagli.</p>"))
    except Exception:
        logger.exception("Avviso al medico non inviato")


def is_absent(owner: dict, day: str) -> bool:
    return any(a["from"] <= day <= a["to"] for a in owner.get("absences") or [])


class Toggle(BaseModel):
    email: bool
    inapp: bool


class PrefsIn(BaseModel):
    prefs: dict[str, Toggle]


class ParentProfileIn(BaseModel):
    first_name: str = Field(min_length=2, max_length=60)
    last_name: str = Field(min_length=2, max_length=60)
    fiscal_code: str = Field(default="", max_length=16)
    address: str = Field(default="", max_length=200)
    phone: str = Field(default="", max_length=25)

    @field_validator("fiscal_code")
    @classmethod
    def v_cf(cls, v):
        v = v.strip().upper()
        if v and not CF_RE.match(v):
            raise ValueError("Codice fiscale non valido")
        return v

    @field_validator("phone")
    @classmethod
    def v_phone(cls, v):
        if v.strip() and not PHONE_RE.match(v.strip()):
            raise ValueError("Numero di telefono non valido")
        return v.strip()


class DoctorProfileIn(BaseModel):
    title: str = Field(default="Dott.", max_length=12)
    first_name: str = Field(min_length=2, max_length=60)
    last_name: str = Field(min_length=2, max_length=60)
    specialty: str = Field(min_length=2, max_length=120)
    order_number: str = Field(min_length=2, max_length=60)
    studio_address: str = Field(min_length=5, max_length=200)
    phone: str = Field(max_length=25)
    contact_email: str = Field(default="", max_length=200)

    @field_validator("phone")
    @classmethod
    def v_phone(cls, v):
        if not PHONE_RE.match(v.strip()):
            raise ValueError("Numero di telefono non valido")
        return v.strip()

    @field_validator("contact_email")
    @classmethod
    def v_mail(cls, v):
        v = v.strip().lower()
        if v and not EMAIL_RE.match(v):
            raise ValueError("Email di contatto non valida")
        return v


class EmailIn(BaseModel):
    email: str = Field(max_length=200)
    password: str = Field(max_length=128)


class AbsenceIn(BaseModel):
    start: str = Field(alias="from")
    end: str = Field(alias="to")
    reason: str = Field(default="", max_length=120)

    @field_validator("start", "end")
    @classmethod
    def v_day(cls, v):
        Date.fromisoformat(v)
        return v


class DeleteIn(BaseModel):
    password: str = Field(max_length=128)
    reason: str = Field(default="", max_length=500)


def build_account(db, current_user):
    acc = APIRouter(prefix="/account")
    parent_only = require_role(current_user, "parent")
    doctor_only = require_role(current_user, "doctor")

    async def me(user: dict) -> dict:
        return await db.users.find_one({"_id": ObjectId(user["id"])})

    def split_name(u: dict) -> tuple:
        if u.get("first_name"):
            return u["first_name"], u.get("last_name", "")
        parts = re.sub(r"^(Dott\.ssa|Dott\.|Dr\.)\s*", "", u.get("name", "")).split(" ", 1)
        return parts[0], parts[1] if len(parts) > 1 else ""

    def doctor_view(u: dict) -> dict:
        p = u.get("profile") or {}
        founder = not p
        first, last = split_name(u)
        title = (re.match(r"^(Dott\.ssa|Dott\.|Dr\.)", u.get("name", "")) or [None])[0] or "Dott."
        return {"title": title, "first_name": first, "last_name": last, "specialty": p.get("specialty") or (os.environ["DOCTOR_SPECIALTY"] if founder else ""),
                "order_number": p.get("order_number") or (os.environ["DOCTOR_ORDER_NUMBER"] if founder else ""),
                "studio_address": p.get("studio_address") or ((u.get("clinics") or [{}])[0].get("address", "")),
                "phone": p.get("phone") or (os.environ["STUDIO_PHONE"] if founder else ""),
                "contact_email": p.get("contact_email") or (os.environ["STUDIO_EMAIL"] if founder else u["email"])}

    @acc.get("")
    async def get_account(user: dict = Depends(current_user)):
        u = await me(user)
        out = {"role": u["role"], "email": u["email"], "name": u.get("name", ""), "prefs": prefs_of(u), "totp_enabled": bool(u.get("totp_enabled")),
               "password_changed_at": u.get("password_changed_at"), "created_at": u.get("created_at")}
        if u["role"] == "parent":
            first, last = split_name(u)
            s = unseal_fields({k: u.get(k, "") for k in P_SEALED}, P_SEALED)
            out["profile"] = {"first_name": first, "last_name": last, "fiscal_code": s["fiscal_code"] or "", "address": s["address"] or "", "phone": s["phone"] or ""}
            out["consent"] = u.get("consent")
        elif u["role"] == "doctor":
            out["profile"] = doctor_view(u)
            out["absences"] = u.get("absences") or []
        return out

    @acc.put("/profile/parent")
    async def put_parent(body: ParentProfileIn, user: dict = Depends(parent_only)):
        data = body.model_dump()
        await db.users.update_one({"_id": ObjectId(user["id"])}, {"$set": {"first_name": data["first_name"].strip(), "last_name": data["last_name"].strip(),
                                                                         "name": f"{data['first_name'].strip()} {data['last_name'].strip()}",
                                                                         **seal_fields({k: data[k].strip() for k in P_SEALED}, P_SEALED)}})
        return await get_account(user)

    @acc.put("/profile/doctor")
    async def put_doctor(body: DoctorProfileIn, user: dict = Depends(doctor_only)):
        u = await me(user)
        d = body.model_dump()
        title = d["title"] if d["title"] in ("Dott.", "Dott.ssa", "Dr.") else "Dott."
        profile = {**(u.get("profile") or {}), **{k: d[k].strip() for k in ("specialty", "order_number", "studio_address", "phone", "contact_email")}}
        await db.users.update_one({"_id": u["_id"]}, {"$set": {"first_name": d["first_name"].strip(), "last_name": d["last_name"].strip(), "profile": profile,
                                                             "name": f"{title} {d['first_name'].strip()} {d['last_name'].strip()}", "founder": not u.get("profile") or bool(u.get("founder")),
                                                             "profile_edited_at": _now().isoformat(), "phone": seal_fields({"p": d["phone"]}, ("p",))["p"]}})
        await db.audit.insert_one({"action": "profilo_professionale_aggiornato", "subject": None, "at": _now().isoformat(), "owner_id": user["id"]})
        return await get_account(user)

    @acc.put("/email")
    async def put_email(body: EmailIn, user: dict = Depends(current_user)):
        u = await me(user)
        new = body.email.strip().lower()
        if not EMAIL_RE.match(new):
            raise HTTPException(400, "Email non valida")
        if not verify_password(body.password, u["password_hash"]):
            raise HTTPException(400, "Password non corretta")
        if new == u["email"]:
            return {"email": new}
        if await db.users.find_one({"email": new}):
            raise HTTPException(409, "Questa email è già usata da un altro account")
        await db.users.update_one({"_id": u["_id"]}, {"$set": {"email": new, "email_changed_at": _now().isoformat()}})
        try:
            await send_email(to=u["email"], subject="MantMed · email di accesso modificata", html=mail_shell("EMAIL MODIFICATA",
                f"<p>Gentile {hesc(u.get('name', ''))},</p><p>l'email di accesso del suo account MantMed è stata cambiata in <strong>{hesc(new)}</strong>.</p>"
                "<p>Se non è stato lei, contatti subito lo studio o MantMed.</p>"))
        except Exception:
            logger.exception("Avviso cambio email non inviato")
        return {"email": new}

    @acc.put("/notifications")
    async def put_prefs(body: PrefsIn, user: dict = Depends(current_user)):
        u = await me(user)
        base = prefs_of(u)
        clean = {k: {"email": v.email, "inapp": v.inapp if u["role"] == "parent" else True} for k, v in body.prefs.items() if k in base}
        await db.users.update_one({"_id": u["_id"]}, {"$set": {"notify_prefs": {**(u.get("notify_prefs") or {}), **clean}}})
        return {"prefs": prefs_of(await me(user))}

    # ---------- Sessioni attive ----------
    def current_sid(request: Request) -> str:
        tok = request.cookies.get("access_token") or request.headers.get("Authorization", "")[7:]
        return jwt.decode(tok, os.environ["JWT_SECRET"], algorithms=[ALG]).get("sid", "")

    @acc.get("/sessions")
    async def sessions(request: Request, user: dict = Depends(current_user)):
        sid = current_sid(request)
        out = []
        async for s in db.sessions.find({"uid": user["id"]}).sort("last_seen", -1):
            out.append({"id": str(s["_id"]), "created_at": s["created_at"], "last_seen": s["last_seen"], "current": s["sid"] == sid,
                        "device": s.get("ua", ""), "ip": s.get("ip", "")})
        return out

    @acc.delete("/sessions/{sid}")
    async def end_session(sid: str, request: Request, user: dict = Depends(current_user)):
        s = await db.sessions.find_one({"_id": ObjectId(sid), "uid": user["id"]}) if ObjectId.is_valid(sid) else None
        if not s:
            raise HTTPException(404, "Sessione non trovata")
        if s["sid"] == current_sid(request):
            raise HTTPException(400, "Per chiudere questa sessione usi Esci")
        await db.sessions.delete_one({"_id": s["_id"]})
        return {"closed": 1}

    @acc.post("/sessions/close-others")
    async def close_others(request: Request, user: dict = Depends(current_user)):
        res = await db.sessions.delete_many({"uid": user["id"], "sid": {"$ne": current_sid(request)}})
        return {"closed": res.deleted_count}

    # ---------- Medico: ferie e assenze ----------
    @acc.post("/absences")
    async def add_absence(body: AbsenceIn, user: dict = Depends(doctor_only)):
        if body.end < body.start:
            raise HTTPException(400, "La data di fine deve essere successiva all'inizio")
        u = await me(user)
        items = [a for a in (u.get("absences") or []) if a["to"] >= Date.today().isoformat()]
        if len(items) >= 30:
            raise HTTPException(400, "Troppi periodi di assenza registrati")
        items.append({"id": str(ObjectId()), "from": body.start, "to": body.end, "reason": body.reason.strip()})
        items.sort(key=lambda a: a["from"])
        await db.users.update_one({"_id": u["_id"]}, {"$set": {"absences": items}})
        return items

    @acc.delete("/absences/{aid}")
    async def del_absence(aid: str, user: dict = Depends(doctor_only)):
        u = await me(user)
        items = [a for a in (u.get("absences") or []) if a["id"] != aid]
        await db.users.update_one({"_id": u["_id"]}, {"$set": {"absences": items}})
        return items

    # ---------- Genitore: GDPR ----------
    @acc.get("/export")
    async def export(user: dict = Depends(parent_only)):
        u = await me(user)
        acc_data = await get_account(user)
        children = []
        for c in u.get("children", []):
            p = await db.patients.find_one({"_id": ObjectId(c["patient_id"])}) or {}
            d = await db.users.find_one({"_id": ObjectId(c["owner_id"])}) or {}
            appts = [{"date": a.get("date"), "time": a.get("time"), "clinic": a.get("clinic"), "status": a.get("status")}
                     async for a in db.appointments.find({"patient_id": c["patient_id"], "owner_id": c["owner_id"]})]
            children.append({"name": p.get("name"), "birth_date": p.get("birth_date"), "doctor": d.get("name"), "linked_at": c.get("linked_at"), "appointments": appts})
        threads = []
        async for t in db.threads.find({"parent_id": user["id"]}):
            msgs = [{"from": m["from"], "at": m["created_at"], **unseal_fields({"body": m["body"]}, ("body",))} async for m in db.messages.find({"thread_id": str(t["_id"])}).sort("created_at", 1)]
            threads.append({"subject": unseal_fields(t, ("subject",))["subject"], "kind": t["kind"], "messages": msgs})
        sharing = [{"signed_at": s["signed_at"], "revoked_at": s["revoked_at"], "version": s["version"]} async for s in db.share_consents.find({"parent_id": user["id"]})]
        payload = {"exported_at": _now().isoformat(), "account": acc_data, "children": children, "messages": threads, "network_consents": sharing,
                   "note": "Copia dei dati personali (art. 15 e 20 GDPR). Le cartelle cliniche complete sono custodite dagli studi: per una copia si rivolga al medico."}
        await db.audit.insert_one({"action": "export_dati_genitore", "subject": None, "at": _now().isoformat(), "owner_id": None})
        return Response(json.dumps(payload, ensure_ascii=False, indent=2, default=str), media_type="application/json",
                        headers={"Content-Disposition": 'attachment; filename="MantMed_miei_dati.json"'})

    @acc.post("/delete")
    async def delete_account(body: DeleteIn, user: dict = Depends(parent_only)):
        u = await me(user)
        if not verify_password(body.password, u["password_hash"]):
            raise HTTPException(400, "Password non corretta")
        now = _now().isoformat()
        await db.users.update_one({"_id": u["_id"]}, {"$set": {"status": "deactivated", "deactivated_at": now,
                                                             "deletion_request": seal_fields({"reason": body.reason.strip(), "at": now}, ("reason",))}})
        await db.sessions.delete_many({"uid": user["id"]})
        owners = {c["owner_id"] for c in u.get("children", [])}
        body_html = (f"<p>Il genitore <strong>{hesc(u.get('name', ''))}</strong> ({hesc(u['email'])}) ha chiesto la cancellazione del proprio account del Portale Paziente il "
                     f"{datetime.now(timezone.utc).strftime('%d/%m/%Y')}. L'account è stato disattivato subito.</p>"
                     "<p>Le cartelle cliniche dei figli restano conservate dallo studio secondo gli obblighi di legge; gestisca la richiesta di cancellazione dei dati personali entro 30 giorni (art. 17 GDPR).</p>")
        for o in owners:
            await db.audit.insert_one({"action": "richiesta_cancellazione_account_genitore", "subject": seal_fields({"s": u.get("name", "")}, ("s",))["s"], "at": now, "owner_id": o})
            d = await db.users.find_one({"_id": ObjectId(o)})
            if d:
                try:
                    await send_email(to=d["email"], subject="MantMed · richiesta di cancellazione account genitore", html=mail_shell("RICHIESTA GDPR", body_html))
                except Exception:
                    logger.exception("Avviso cancellazione al medico non inviato")
        try:
            await send_email(to=os.environ["ADMIN_EMAIL"], subject="MantMed · richiesta di cancellazione account genitore", html=mail_shell("RICHIESTA GDPR", body_html))
        except Exception:
            logger.exception("Avviso cancellazione a MantMed non inviato")
        return {"deactivated": True}

    return acc
