import os
import re
import hmac
import hashlib
import secrets
import logging
from datetime import datetime, timezone, timedelta
from html import escape as hesc
from typing import Annotated, Literal, Optional, Union
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import Response as RawResponse
from pydantic import BaseModel, Field, field_validator
from auth import hash_password, public, require_role
from crypto import seal_fields, unseal_fields
from mailer import send_email
from tenancy import cf_hash

logger = logging.getLogger(__name__)
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
CF_RE = re.compile(r"^[A-Z]{6}[0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$")
PHONE_RE = re.compile(r"^\+?[0-9 ./-]{6,20}$")
PORTAL_CONSENT = "Informativa privacy e consenso dati sanitari v1.0"
CODE_TTL_MIN = 15
MAX_CODE_ATTEMPTS = 5
MAX_STARTS_PER_HOUR = 10
MAX_LINKS_PER_DAY = 10
_CODE_KEY = hashlib.sha256(("signup:" + os.environ["JWT_SECRET"]).encode()).digest()


def _now():
    return datetime.now(timezone.utc)


def _code_hash(email: str, code: str) -> str:
    return hmac.new(_CODE_KEY, f"{email}:{code}".encode(), hashlib.sha256).hexdigest()


def _strong(pw: str) -> str:
    if len(pw) < 10 or not re.search(r"[A-Za-z]", pw) or not re.search(r"\d", pw):
        raise ValueError("La password deve avere almeno 10 caratteri, con lettere e numeri")
    return pw


class Base(BaseModel):
    first_name: str = Field(min_length=2, max_length=60)
    last_name: str = Field(min_length=2, max_length=60)
    email: str = Field(max_length=200)
    phone: str = Field(max_length=25)
    password: str = Field(max_length=128)

    @field_validator("email")
    @classmethod
    def v_email(cls, v):
        v = v.strip().lower()
        if not EMAIL_RE.match(v):
            raise ValueError("Email non valida")
        return v

    @field_validator("phone")
    @classmethod
    def v_phone(cls, v):
        if not PHONE_RE.match(v.strip()):
            raise ValueError("Numero di telefono non valido")
        return v.strip()

    @field_validator("password")
    @classmethod
    def v_pw(cls, v):
        return _strong(v)


class DoctorSignup(Base):
    role: Literal["doctor"]
    specialty: str = Field(min_length=2, max_length=120)
    order_number: str = Field(min_length=2, max_length=60)
    studio_address: str = Field(min_length=5, max_length=200)
    terms: bool


class ParentSignup(Base):
    role: Literal["parent"]
    child_fiscal_code: str
    privacy_policy: bool
    health_data: bool

    @field_validator("child_fiscal_code")
    @classmethod
    def v_cf(cls, v):
        v = v.strip().upper()
        if not CF_RE.match(v):
            raise ValueError("Codice fiscale del bambino non valido")
        return v


class VerifyIn(BaseModel):
    email: str
    code: str


class ChildIn(BaseModel):
    fiscal_code: str

    @field_validator("fiscal_code")
    @classmethod
    def v_cf(cls, v):
        v = v.strip().upper()
        if not CF_RE.match(v):
            raise ValueError("Codice fiscale non valido")
        return v


class DoctorStatusIn(BaseModel):
    status: Literal["active", "suspended"]


def mail_shell(title: str, body: str) -> str:
    return ('<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F5F7;padding:24px 0"><tr><td align="center">'
            '<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;font-family:Arial,sans-serif;color:#0A192F">'
            '<tr><td style="background:#0A192F;padding:22px 28px;color:#ffffff;font-family:Georgia,serif;font-size:24px">MantMed'
            f'<div style="font-family:Arial,sans-serif;font-size:11px;letter-spacing:2px;color:#C9CCD3;margin-top:4px">{hesc(title)}</div></td></tr>'
            f'<tr><td style="padding:28px;font-size:15px;line-height:1.6">{body}</td></tr></table></td></tr></table>')


def build_registration(db, current_user, start_session, models, pdf_for):
    Patient, Consultation, Consent, Appointment = models["patient"], models["consultation"], models["consent"], models["appointment"]
    reg = APIRouter(prefix="/register")
    admin = APIRouter(prefix="/admin/doctors", dependencies=[Depends(require_role(current_user, "admin"))])
    portal = APIRouter(prefix="/portal")
    parent_user = require_role(current_user, "parent")

    async def link_children(user: dict) -> int:
        email = user["email"].lower()
        children = {c["patient_id"]: c for c in user.get("children", [])}
        for h in user.get("child_cfs", []):
            async for p in db.patients.find({"cf_hash": h}):
                g = (unseal_fields(p, ("guardian_email",)).get("guardian_email") or "").strip().lower()
                if g and g == email and str(p["_id"]) not in children:
                    children[str(p["_id"])] = {"patient_id": str(p["_id"]), "owner_id": p["owner_id"], "linked_at": _now().isoformat()}
        if len(children) != len(user.get("children", [])):
            await db.users.update_one({"_id": user["_id"]}, {"$set": {"children": list(children.values())}})
        return len(children)

    # ---------- Registrazione pubblica con codice email ----------
    @reg.post("/start")
    async def start(request: Request, data: Annotated[Union[DoctorSignup, ParentSignup], Field(discriminator="role")]):
        if data.role == "doctor" and not data.terms:
            raise HTTPException(400, "Accetti l'informativa privacy per proseguire")
        if data.role == "parent" and not (data.privacy_policy and data.health_data):
            raise HTTPException(400, "Informativa privacy e consenso al trattamento dei dati sanitari sono obbligatori")
        if await db.users.find_one({"email": data.email}):
            raise HTTPException(409, "Esiste già un account con questa email: acceda dalla pagina di login")
        ip = (request.headers.get("x-forwarded-for") or (request.client.host if request.client else "")).split(",")[0].strip()
        since = (_now() - timedelta(hours=1)).isoformat()
        if await db.signups.count_documents({"ip": ip, "created_at": {"$gte": since}}) >= MAX_STARTS_PER_HOUR:
            raise HTTPException(429, "Troppe registrazioni da questa connessione. Riprovi tra un'ora.")
        code = f"{secrets.randbelow(1_000_000):06d}"
        fields = data.model_dump(exclude={"password", "email"})
        await db.signups.delete_many({"email": data.email})
        await db.signups.insert_one({"email": data.email, "role": data.role, "data": seal_fields({"d": fields}, ("d",))["d"],
                                     "password_hash": hash_password(data.password), "code": _code_hash(data.email, code), "attempts": 0,
                                     "ip": ip, "created_at": _now().isoformat(), "expires_at": (_now() + timedelta(minutes=CODE_TTL_MIN)).isoformat()})
        body_html = (f'<p>Gentile {hesc(data.first_name)},</p><p>per completare la registrazione a MantMed inserisca questo codice di verifica nella pagina di registrazione:</p>'
                     f'<p style="font-family:Georgia,serif;font-size:34px;letter-spacing:8px;margin:18px 0">{code}</p>'
                     f'<p style="color:#5B6478;font-size:13px">Il codice scade tra {CODE_TTL_MIN} minuti. Se non ha richiesto lei la registrazione, ignori questa email.</p>')
        await send_email(to=data.email, subject=f"MantMed · codice di verifica {code}", html=mail_shell("VERIFICA EMAIL", body_html))
        return {"ok": True, "email": data.email, "expires_min": CODE_TTL_MIN}

    @reg.post("/verify")
    async def verify(body: VerifyIn, response: Response):
        email = body.email.strip().lower()
        s = await db.signups.find_one({"email": email})
        if not s or datetime.fromisoformat(s["expires_at"]) < _now():
            raise HTTPException(410, "Codice scaduto o registrazione non trovata: ricominci la registrazione")
        if not hmac.compare_digest(s["code"], _code_hash(email, body.code.strip())):
            left = MAX_CODE_ATTEMPTS - s["attempts"] - 1
            if left <= 0:
                await db.signups.delete_one({"_id": s["_id"]})
                raise HTTPException(429, "Troppi codici errati: ricominci la registrazione")
            await db.signups.update_one({"_id": s["_id"]}, {"$inc": {"attempts": 1}})
            raise HTTPException(400, f"Codice non corretto. {left} tentativ{'o' if left == 1 else 'i'} rimast{'o' if left == 1 else 'i'}.")
        await db.signups.delete_one({"_id": s["_id"]})
        d = unseal_fields({"d": s["data"]}, ("d",))["d"]
        now = _now().isoformat()
        base = {"email": email, "password_hash": s["password_hash"], "created_at": now, "email_verified_at": now,
                "first_name": d["first_name"], "last_name": d["last_name"], "phone": seal_fields({"p": d["phone"]}, ("p",))["p"]}
        if s["role"] == "doctor":
            name = f"Dott. {d['first_name']} {d['last_name']}"
            await db.users.insert_one({**base, "name": name, "role": "doctor", "status": "pending",
                                       "clinics": [{"name": "Studio principale", "address": d["studio_address"]}],
                                       "profile": {"specialty": d["specialty"], "order_number": d["order_number"], "phone": d["phone"], "studio_address": d["studio_address"]}})
            try:
                rows = "".join(f"<p><strong>{k}:</strong> {hesc(v)}</p>" for k, v in (("Medico", name), ("Email", email), ("Specializzazione", d["specialty"]),
                                                                                     ("Iscrizione Ordine", d["order_number"]), ("Telefono", d["phone"]), ("Sede", d["studio_address"])))
                await send_email(to=os.environ["ADMIN_EMAIL"], subject=f"MantMed · nuovo medico da approvare: {name}",
                                 html=mail_shell("NUOVA REGISTRAZIONE MEDICO", rows + "<p>Approvi o rifiuti la licenza dal Pannello Founder (/admin).</p>"))
            except Exception:
                logger.exception("Notifica admin registrazione medico non inviata")
            return {"ok": True, "role": "doctor", "status": "pending"}
        res = await db.users.insert_one({**base, "name": f"{d['first_name']} {d['last_name']}", "role": "parent", "status": "active",
                                         "consent": {"version": PORTAL_CONSENT, "privacy_policy": True, "health_data": True, "at": now},
                                         "child_cfs": [cf_hash(d["child_fiscal_code"])], "children": []})
        user = await db.users.find_one({"_id": res.inserted_id})
        linked = await link_children(user)
        return {"ok": True, "role": "parent", "status": "active", "linked": linked, "user": await start_session(response, user)}

    # ---------- Pannello Founder: licenze medici ----------
    @admin.get("")
    async def list_doctors():
        out = []
        async for u in db.users.find({"role": "doctor"}).sort("created_at", -1):
            p = u.get("profile") or {}
            out.append({"id": str(u["_id"]), "name": u.get("name", ""), "email": u["email"], "status": u.get("status", "active"),
                        "founder": not u.get("profile"), "specialty": p.get("specialty", ""), "order_number": p.get("order_number", ""),
                        "phone": p.get("phone", ""), "studio_address": p.get("studio_address", ""), "created_at": u.get("created_at"),
                        "approved_at": u.get("approved_at"), "patients": await db.patients.count_documents({"owner_id": str(u["_id"])})})
        return out

    @admin.post("/{uid}/status")
    async def set_doctor_status(uid: str, body: DoctorStatusIn):
        u = await db.users.find_one({"_id": ObjectId(uid)}) if ObjectId.is_valid(uid) else None
        if not u or u.get("role") != "doctor":
            raise HTTPException(404, "Medico non trovato")
        if not u.get("profile"):
            raise HTTPException(400, "Lo studio fondatore non può essere modificato da qui")
        upd = {"status": body.status}
        first = body.status == "active" and not u.get("approved_at")
        if first:
            upd["approved_at"] = _now().isoformat()
        await db.users.update_one({"_id": u["_id"]}, {"$set": upd})
        if body.status == "suspended":
            await db.sessions.delete_many({"uid": uid})
        if first:
            try:
                await send_email(to=u["email"], subject="MantMed · il suo account è attivo",
                                 html=mail_shell("LICENZA ATTIVATA", f"<p>Gentile {hesc(u['name'])},</p><p>la sua licenza MantMed è stata approvata. "
                                                 "Può accedere al suo studio con l'email e la password scelte in fase di registrazione, dal pulsante Accedi del sito MantMed.</p>"
                                                 "<p>Le consigliamo di attivare subito la verifica in due passaggi dal pannello Sicurezza.</p>"))
            except Exception:
                logger.exception("Email di attivazione non inviata")
        return {"id": uid, "status": body.status}

    # ---------- Portale Paziente / Genitore ----------
    async def child_view(link: dict) -> Optional[dict]:
        p = await db.patients.find_one({"_id": ObjectId(link["patient_id"]), "owner_id": link["owner_id"]})
        if not p:
            return None
        pt = Patient.from_mongo(p).out()
        pid, owner = pt["id"], link["owner_id"]
        doc = await db.users.find_one({"_id": ObjectId(owner)})
        appts = [Appointment.from_mongo(a).out() async for a in db.appointments.find({"patient_id": pid, "owner_id": owner, "status": {"$ne": "completato"},
                                                                                   "$or": [{"date": None}, {"date": {"$gte": _now().date().isoformat()}}]}).sort([("date", 1), ("time", 1)])]
        from portal_flow import req_out
        requests = [req_out(r) async for r in db.appt_requests.find({"patient_id": pid, "owner_id": owner}).sort("created_at", -1).limit(20)]
        consents = [Consent.from_mongo(c).out() async for c in db.consents.find({"patient_id": pid, "owner_id": owner}).sort("signed_at", -1)]
        reports = [Consultation.from_mongo(c).out() async for c in db.consultations.find(
            {"patient_id": pid, "owner_id": owner, "$or": [{"report_sent_at": {"$ne": None}}, {"portal_published": True}]}).sort("created_at", -1)]
        return {"patient": {"id": pid, "name": pt["name"], "birth_date": pt["birth_date"], "sex": pt["sex"]},
                "doctor": {"name": (doc or {}).get("name", ""), "clinics": (doc or {}).get("clinics", [])},
                "appointments": [{"id": a["id"], "date": a.get("date"), "time": a["time"], "clinic": a["clinic"], "visit_type": a["visit_type"], "status": a["status"]} for a in appts],
                "requests": [{k: r[k] for k in ("id", "clinic", "service", "date", "time", "status", "reason", "confirmed_date", "confirmed_time", "created_at")} for r in requests],
                "consents": [{"id": c["id"], "version": c["version"], "signer_name": c["signer_name"], "signer_relation": c["signer_relation"],
                              "method": c["method"], "email_reports": c["email_reports"], "signed_at": c["signed_at"], "revoked_at": c["revoked_at"]} for c in consents],
                "reports": [{"id": r["id"], "created_at": r["created_at"], "clinic": r["clinic"], "motivo": (r["note"] or {}).get("motivo_visita", ""),
                             "diagnosi": (r["note"] or {}).get("diagnosi", "")} for r in reports]}

    @portal.get("/me")
    async def portal_me(user: dict = Depends(parent_user)):
        doc = await db.users.find_one({"_id": ObjectId(user["id"])})
        await link_children(doc)
        doc = await db.users.find_one({"_id": doc["_id"]})
        children = [v for v in [await child_view(c) for c in doc.get("children", [])] if v]
        for c, link in zip(children, doc.get("children", [])):
            await db.audit.insert_one({"action": "accesso_portale_genitore", "subject": seal_fields({"s": c["patient"]["name"]}, ("s",))["s"],
                                       "at": _now().isoformat(), "owner_id": link["owner_id"]})
        return {"user": public(doc), "consent": doc.get("consent"), "pending_codes": max(0, len(doc.get("child_cfs", [])) - len(children)), "children": children}

    @portal.post("/children")
    async def add_child(body: ChildIn, user: dict = Depends(parent_user)):
        doc = await db.users.find_one({"_id": ObjectId(user["id"])})
        day = _now().date().isoformat()
        tries = doc.get("link_tries", {})
        if tries.get("day") == day and tries.get("n", 0) >= MAX_LINKS_PER_DAY:
            raise HTTPException(429, "Troppi tentativi di collegamento oggi. Riprovi domani.")
        h = cf_hash(body.fiscal_code)
        await db.users.update_one({"_id": doc["_id"]}, {"$addToSet": {"child_cfs": h},
                                                        "$set": {"link_tries": {"day": day, "n": (tries.get("n", 0) if tries.get("day") == day else 0) + 1}}})
        before = len(doc.get("children", []))
        after = await link_children(await db.users.find_one({"_id": doc["_id"]}))
        return {"linked": after > before}

    @portal.get("/reports/{cid}/pdf")
    async def portal_pdf(cid: str, user: dict = Depends(parent_user)):
        doc = await db.users.find_one({"_id": ObjectId(user["id"])})
        c = await db.consultations.find_one({"_id": ObjectId(cid)}) if ObjectId.is_valid(cid) else None
        allowed = c and any(l["patient_id"] == c.get("patient_id") and l["owner_id"] == c.get("owner_id") for l in doc.get("children", []))
        if not allowed or not (c.get("report_sent_at") or c.get("portal_published")):
            raise HTTPException(404, "Referto non disponibile")
        pdf, name = await pdf_for(c)
        await db.audit.insert_one({"action": "referto_portale_scaricato", "subject": seal_fields({"s": c["patient_name"]}, ("s",))["s"],
                                   "at": _now().isoformat(), "owner_id": c["owner_id"]})
        return RawResponse(pdf, media_type="application/pdf", headers={"Content-Disposition": f"attachment; filename=\"{name}\""})

    return reg, admin, portal
