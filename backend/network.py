"""Multi-specialist network: Founder-managed doctor onboarding, network directory for the portal, parent-signed report sharing."""
import asyncio
import hashlib
import logging
import re
import secrets
from datetime import datetime, timezone, timedelta
from html import escape as hesc
from typing import Optional
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field, field_validator
from auth import hash_password, require_role
from crypto import seal_fields, unseal_fields
from mailer import send_email
from registration import mail_shell, EMAIL_RE, PHONE_RE, _strong
from scheduling import ClinicIn, in_network, schedule_of, online_quote

logger = logging.getLogger(__name__)
INVITE_DAYS = 7
ORIGIN_RE = re.compile(r"^https?://[A-Za-z0-9.\-:]+$")
SHARE_VERSION = "Consenso condivisione referti in rete v1.0"
SHARE_TEXT = ("Autorizzo gli specialisti selezionati della rete MantMed, che seguono mio figlio/a, a consultare reciprocamente in sola lettura "
              "i referti delle visite e un riepilogo clinico (diagnosi, terapia, ultime misure di crescita), per una cura coordinata. "
              "I dati restano cifrati, ogni consultazione viene registrata e posso revocare il consenso in qualsiasi momento dal Portale Paziente. "
              "[Testo da validare con il proprio consulente privacy/DPO]")


def _now():
    return datetime.now(timezone.utc)


def _h(t: str) -> str:
    return hashlib.sha256(t.encode()).hexdigest()


class DoctorIn(BaseModel):
    name: str = Field(min_length=4, max_length=100)
    email: str = Field(max_length=200)
    specialty: str = Field(min_length=2, max_length=120)
    phone: str = Field(default="", max_length=25)
    order_number: str = Field(default="", max_length=60)
    clinics: list[ClinicIn] = Field(min_length=1, max_length=6)
    origin_url: str = Field(max_length=200)

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
        if v.strip() and not PHONE_RE.match(v.strip()):
            raise ValueError("Numero di telefono non valido")
        return v.strip()


class NetworkIn(BaseModel):
    in_network: bool


class ActivateIn(BaseModel):
    token: str
    password: str = Field(max_length=128)

    @field_validator("password")
    @classmethod
    def v_pw(cls, v):
        return _strong(v)


class ShareIn(BaseModel):
    patient_ids: list[str] = Field(min_length=2, max_length=10)
    signer_name: str = Field(min_length=3, max_length=100)
    accepted: bool
    signature: str = Field(max_length=400_000)


def build_network(db, current_user, Consultation, pdf_for):
    admin = APIRouter(prefix="/admin/doctors", dependencies=[Depends(require_role(current_user, "admin"))])
    public = APIRouter(prefix="/register")
    parent = APIRouter(prefix="/portal", dependencies=[Depends(require_role(current_user, "parent"))])
    doctor = APIRouter()

    # ---------- Founder: censimento specialisti ----------
    async def send_invite(u: dict, origin: str):
        if not ORIGIN_RE.match(origin):
            raise HTTPException(400, "Origine non valida")
        token = secrets.token_urlsafe(24)
        await db.users.update_one({"_id": u["_id"]}, {"$set": {"invite": {"token": _h(token), "expires_at": (_now() + timedelta(days=INVITE_DAYS)).isoformat()}}})
        link = f"{origin}/attiva?token={token}"
        asyncio.create_task(mail_invite(u, link))

    async def mail_invite(u: dict, link: str):
        try:
            await send_email(to=u["email"], subject="MantMed · attivi il suo studio nella rete specialistica", html=mail_shell("INVITO NELLA RETE MANTMED",
            f"<p>Gentile {hesc(u['name'])},</p><p>MantMed l'ha inserita nella rete multispecialistica come <strong>{hesc(u['profile']['specialty'])}</strong>.</p>"
            "<p><strong>Come attivare l'account</strong></p><ol style=\"padding-left:18px\"><li>Apra il link personale qui sotto.</li>"
            "<li>Scelga la sua password: da quel momento accede con questa email.</li>"
            "<li>Dalla dashboard, in \"Orari e tariffe\", configuri sedi, orari, prestazioni con tariffe e dati fiscali: il Portale Paziente mostrerà solo i suoi orari liberi.</li></ol>"
            f"<p style=\"margin:22px 0\"><a href=\"{hesc(link)}\" style=\"background:#0A192F;color:#ffffff;padding:14px 22px;border-radius:999px;text-decoration:none\">Attiva il mio account</a></p>"
            f"<p style=\"color:#5B6478;font-size:13px\">Il link è personale e scade tra {INVITE_DAYS} giorni.</p>"))
        except Exception:
            logger.exception("Invito medico non inviato")

    @admin.post("")
    async def create_doctor(body: DoctorIn):
        if not ORIGIN_RE.match(body.origin_url.rstrip("/")):
            raise HTTPException(400, "Origine non valida")
        if await db.users.find_one({"email": body.email}):
            raise HTTPException(409, "Esiste già un account con questa email")
        names = [c.name.strip() for c in body.clinics]
        if len(set(n.lower() for n in names)) != len(names):
            raise HTTPException(400, "Ogni sede deve avere un nome diverso")
        clinics = [{"name": c.name.strip(), "address": c.address.strip()} for c in body.clinics]
        u = {"email": body.email, "name": body.name.strip(), "role": "doctor", "status": "invited", "in_network": True, "created_at": _now().isoformat(),
             "created_by": "founder", "password_hash": hash_password(secrets.token_urlsafe(32)), "clinics": clinics,
             "phone": seal_fields({"p": body.phone}, ("p",))["p"],
             "profile": {"specialty": body.specialty.strip(), "order_number": body.order_number.strip(), "phone": body.phone,
                         "studio_address": clinics[0]["address"]}}
        u["_id"] = (await db.users.insert_one(u)).inserted_id
        await send_invite(u, body.origin_url.rstrip("/"))
        return {"id": str(u["_id"]), "invited": True}

    @admin.post("/{uid}/invite")
    async def resend_invite(uid: str, request: Request):
        u = await db.users.find_one({"_id": ObjectId(uid), "role": "doctor", "status": "invited"}) if ObjectId.is_valid(uid) else None
        if not u:
            raise HTTPException(404, "Medico non trovato o già attivo")
        await send_invite(u, (request.headers.get("origin") or "").rstrip("/"))
        return {"invited": True}

    @admin.post("/{uid}/network")
    async def set_network(uid: str, body: NetworkIn):
        res = await db.users.update_one({"_id": ObjectId(uid), "role": "doctor"} if ObjectId.is_valid(uid) else {"_id": None}, {"$set": {"in_network": body.in_network}})
        if not res.matched_count:
            raise HTTPException(404, "Medico non trovato")
        return {"id": uid, "in_network": body.in_network}

    # ---------- Attivazione account dal link ----------
    async def invited(token: str) -> dict:
        u = await db.users.find_one({"invite.token": _h(token), "status": "invited"})
        if not u or datetime.fromisoformat(u["invite"]["expires_at"]) < _now():
            raise HTTPException(410, "Link scaduto o non valido: chieda a MantMed un nuovo invito")
        return u

    @public.get("/activate/{token}")
    async def activate_info(token: str):
        u = await invited(token)
        return {"name": u["name"], "email": u["email"], "specialty": u["profile"]["specialty"]}

    @public.post("/activate")
    async def activate(body: ActivateIn):
        u = await invited(body.token)
        now = _now().isoformat()
        await db.users.update_one({"_id": u["_id"]}, {"$set": {"password_hash": hash_password(body.password), "status": "active", "approved_at": now,
                                                              "email_verified_at": now}, "$unset": {"invite": ""}})
        return {"activated": True, "email": u["email"]}

    # ---------- Portale: elenco specialisti della rete ----------
    @parent.get("/network")
    async def network():
        out = []
        async for d in db.users.find({"role": "doctor", "status": "active"}).sort("created_at", 1):
            if not in_network(d):
                continue
            sch = schedule_of(d)
            out.append({"id": str(d["_id"]), "name": d["name"], "specialty": (d.get("profile") or {}).get("specialty") or "Pediatria",
                        "clinics": sch["clinics"], "services": [{**s, **online_quote(d, s["name"])} for s in sch["services"]]})
        return out

    # ---------- Consenso di condivisione firmato dal genitore ----------
    async def parent_doc(user: dict) -> dict:
        return await db.users.find_one({"_id": ObjectId(user["id"])})

    @parent.post("/sharing")
    async def create_share(body: ShareIn, user: dict = Depends(current_user)):
        if not body.accepted:
            raise HTTPException(400, "Per condividere i referti serve il consenso esplicito")
        if not body.signature.startswith("data:image/png;base64,"):
            raise HTTPException(400, "Manca la firma")
        u = await parent_doc(user)
        links = {c["patient_id"]: c for c in u.get("children", [])}
        members, cfs = [], set()
        for pid in dict.fromkeys(body.patient_ids):
            if pid not in links:
                raise HTTPException(404, "Cartella non collegata al suo account")
            p = await db.patients.find_one({"_id": ObjectId(pid), "owner_id": links[pid]["owner_id"]})
            if not p or not p.get("cf_hash"):
                raise HTTPException(400, "Cartella senza codice fiscale: non condivisibile")
            cfs.add(p["cf_hash"])
            members.append({"patient_id": pid, "owner_id": links[pid]["owner_id"]})
        if len(cfs) != 1 or len({m["owner_id"] for m in members}) < 2:
            raise HTTPException(400, "Selezioni almeno due specialisti dello stesso bambino")
        cf = cfs.pop()
        now = _now().isoformat()
        await db.share_consents.update_many({"parent_id": user["id"], "cf_hash": cf, "revoked_at": None}, {"$set": {"revoked_at": now, "superseded": True}})
        doc = {"parent_id": user["id"], "cf_hash": cf, "members": members, "version": SHARE_VERSION, "signed_at": now, "revoked_at": None,
               **seal_fields({"signer_name": body.signer_name.strip(), "signature": body.signature, "text": SHARE_TEXT}, ("signer_name", "signature", "text"))}
        doc["_id"] = (await db.share_consents.insert_one(doc)).inserted_id
        for m in members:
            await db.audit.insert_one({"action": "consenso_condivisione_rete_firmato", "subject": seal_fields({"s": body.signer_name.strip()}, ("s",))["s"],
                                       "at": now, "owner_id": m["owner_id"]})
        return {"id": str(doc["_id"]), "signed_at": now, "members": members}

    @parent.get("/sharing")
    async def list_shares(user: dict = Depends(current_user)):
        out = []
        async for s in db.share_consents.find({"parent_id": user["id"], "superseded": {"$ne": True}}).sort("signed_at", -1):
            out.append({"id": str(s["_id"]), "members": s["members"], "signed_at": s["signed_at"], "revoked_at": s["revoked_at"], "version": s["version"]})
        return {"items": out, "text": SHARE_TEXT, "version": SHARE_VERSION}

    @parent.post("/sharing/{sid}/revoke")
    async def revoke_share(sid: str, user: dict = Depends(current_user)):
        s = await db.share_consents.find_one({"_id": ObjectId(sid), "parent_id": user["id"], "revoked_at": None}) if ObjectId.is_valid(sid) else None
        if not s:
            raise HTTPException(404, "Consenso non trovato o già revocato")
        now = _now().isoformat()
        await db.share_consents.update_one({"_id": s["_id"]}, {"$set": {"revoked_at": now}})
        for m in s["members"]:
            await db.audit.insert_one({"action": "consenso_condivisione_rete_revocato", "subject": None, "at": now, "owner_id": m["owner_id"]})
        return {"revoked": True}

    # ---------- Medico: Specialisti Collegati nel passaporto ----------
    async def active_share(owner: str, pid: str) -> Optional[dict]:
        return await db.share_consents.find_one({"revoked_at": None, "members": {"$elemMatch": {"owner_id": owner, "patient_id": pid}}})

    @doctor.get("/patients/{pid}/network")
    async def linked_specialists(pid: str, user: dict = Depends(current_user)):
        s = await active_share(user["id"], pid)
        if not s:
            return {"consent": None, "specialists": []}
        out = []
        for m in s["members"]:
            if m["owner_id"] == user["id"]:
                continue
            d = await db.users.find_one({"_id": ObjectId(m["owner_id"])}) or {}
            reports = []
            async for c in db.consultations.find({"patient_id": m["patient_id"], "owner_id": m["owner_id"]}).sort("created_at", -1).limit(20):
                note = Consultation.from_mongo(c).out().get("note") or {}
                reports.append({"id": str(c["_id"]), "created_at": c["created_at"], "clinic": c.get("clinic", ""), "motivo": note.get("motivo_visita", ""),
                                "diagnosi": note.get("diagnosi", ""), "terapia": note.get("terapia", "")})
            mm = await db.measurements.find_one({"patient_id": m["patient_id"], "owner_id": m["owner_id"]}, sort=[("date", -1)])
            growth = {k: unseal_fields(mm, ("weight", "height", "hc")).get(k) for k in ("date", "weight", "height", "hc")} if mm else None
            out.append({"doctor_id": m["owner_id"], "name": d.get("name", ""), "specialty": (d.get("profile") or {}).get("specialty") or "Pediatria",
                        "reports": reports, "growth": growth})
        await db.audit.insert_one({"action": "rete_specialisti_consultata", "subject": None, "at": _now().isoformat(), "owner_id": user["id"]})
        return {"consent": {"signed_at": s["signed_at"], "version": s["version"]}, "specialists": out}

    @doctor.get("/patients/{pid}/network/reports/{cid}/pdf")
    async def shared_pdf(pid: str, cid: str, user: dict = Depends(current_user)):
        s = await active_share(user["id"], pid)
        c = await db.consultations.find_one({"_id": ObjectId(cid)}) if ObjectId.is_valid(cid) else None
        if not s or not c or not any(m["owner_id"] == c.get("owner_id") and m["patient_id"] == c.get("patient_id") and m["owner_id"] != user["id"] for m in s["members"]):
            raise HTTPException(404, "Referto non disponibile")
        pdf, name = await pdf_for(c)
        await db.audit.insert_one({"action": "referto_condiviso_in_rete_scaricato", "subject": seal_fields({"s": user["name"]}, ("s",))["s"],
                                   "at": _now().isoformat(), "owner_id": c["owner_id"]})
        return Response(pdf, media_type="application/pdf", headers={"Content-Disposition": f"attachment; filename=\"{name}\""})

    return admin, public, parent, doctor
