"""Firma elettronica: ricezione firme, PDF firmato protetto, archiviazione cifrata (MongoDB Atlas UE),
consultazione da medico e genitore, verifica integrità, firma del medico per i referti."""
import base64
import hashlib
import hmac
import io
import json
import logging
import os
import re
import secrets
from datetime import datetime, timezone
from typing import Literal, Optional
from urllib.parse import quote

from bson import ObjectId
from netutil import client_ip
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field, field_validator
from reportlab.lib.utils import ImageReader

from auth import require_role
from crypto import seal, seal_fields, unseal, unseal_fields
from report import studio_info
from signed_pdf import build_consent_pdf, build_share_pdf

logger = logging.getLogger(__name__)

PRIVACY_DOC = "consenso_privacy"
SHARE_DOC = "consenso_condivisione"
RELATIONS = ("Madre", "Padre", "Tutore legale")
CLAUSES = [("privacy_policy", "Dichiaro di aver letto l'informativa privacy", True),
           ("health_data", "Acconsento al trattamento dei dati sanitari del minore (art. 9 GDPR)", True),
           ("email_reports", "Acconsento a ricevere referti e comunicazioni via email", False)]
_SIG_KEY = hashlib.sha256(("signer-id:" + os.environ["DATA_ENCRYPTION_KEY"]).encode()).digest()
_HEX64 = re.compile(r"^[0-9a-f]{64}$")


def privacy_text(doctor: str) -> str:
    return (f"Ai sensi degli artt. 13 e 9 del Reg. UE 2016/679, il titolare del trattamento ({doctor}) tratta i dati personali e sanitari del minore "
            "esclusivamente per finalità di diagnosi, cura e gestione amministrativa della visita. I dati sono conservati con crittografia AES-256 "
            "su server nell'Unione Europea, accessibili solo al medico e non diffusi. Il genitore può esercitare in ogni momento i diritti di accesso, "
            "rettifica, cancellazione e revoca del consenso contattando lo studio o dal Portale Paziente. [Testo da validare con il proprio consulente privacy/DPO]")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def client_meta(request: Request) -> dict:
    ip = client_ip(request)
    return {"ip": ip[:64], "user_agent": (request.headers.get("user-agent") or "")[:300]}


def signer_code(ident: str) -> str:
    return "FIR-" + hmac.new(_SIG_KEY, ident.encode(), hashlib.sha256).hexdigest()[:12].upper()


def new_code(prefix: str = "MM-DOC") -> str:
    return f"{prefix}-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{secrets.token_hex(3).upper()}"


def payload_hash(data: dict) -> str:
    return hashlib.sha256(json.dumps(data, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def check_png(data_url: Optional[str]) -> bytes:
    if not data_url or not data_url.startswith("data:image/png;base64,"):
        raise HTTPException(400, "Firma mancante o in formato non valido (serve PNG)")
    try:
        raw = base64.b64decode(data_url.split(",", 1)[1], validate=True)
        w, h = ImageReader(io.BytesIO(raw)).getSize()
    except Exception:
        raise HTTPException(400, "Immagine della firma non leggibile")
    if not raw.startswith(b"\x89PNG") or w < 20 or h < 10 or w > 5000 or h > 3000:
        raise HTTPException(400, "Immagine della firma non valida")
    return raw


async def letterhead(db, owner_id: str, clinic: Optional[str] = None) -> dict:
    u = await db.users.find_one({"_id": ObjectId(owner_id)}) or {}
    p = u.get("profile")
    clinic = clinic or ((u.get("clinics") or [{}])[0].get("name") or "Studio")
    if p:
        address = p.get("studio_address", "")
        info = {"specialty": p.get("specialty", ""), "order": f"Iscr. N. {p.get('order_number', '')}", "phone": p.get("phone", ""),
                "email": p.get("contact_email") or u.get("email", ""), "address": address, "city": address.split(",")[-1].strip() if address else ""}
    else:
        info = studio_info(clinic)
    return {"doctor": u.get("name", ""), "info": info, "clinic": clinic, "specialty": (p or {}).get("specialty") or "Pediatria"}


async def doctor_signature(db, uid: str) -> Optional[dict]:
    u = await db.users.find_one({"_id": ObjectId(uid)}, {"doctor_signature": 1})
    s = unseal((u or {}).get("doctor_signature"))
    return s if s and s.get("image") else None


def doc_out(d: dict) -> dict:
    return {"id": str(d["_id"]), "kind": d["kind"], "title": d["title"], "code": d["code"], "version": d.get("version", ""), "channel": d["channel"],
            "signed_at": d["signed_at"], "file_sha256": d["file_sha256"], "size": d.get("size", 0), "revoked_at": d.get("revoked_at"),
            "signer_name": unseal(d.get("signer_name")) or "", "ref_id": d.get("ref_id")}


async def docs_for_patient(db, pid: str) -> list:
    return [doc_out(d) async for d in db.signed_docs.find({"patient_ids": pid}, {"pdf": 0}).sort("signed_at", -1)]


async def archive(db, *, kind, title, version, owner_ids, patient_ids, parent_id, ref_id, pdf: bytes, meta: dict, signer_name: str) -> dict:
    doc = {"kind": kind, "title": title, "code": meta["code"], "version": version, "owner_ids": owner_ids, "patient_ids": patient_ids,
           "parent_id": parent_id, "ref_id": ref_id, "channel": meta["channel"], "signed_at": meta["signed_at"], "payload_sha256": meta["payload_sha256"],
           "file_sha256": hashlib.sha256(pdf).hexdigest(), "size": len(pdf), "revoked_at": None, "created_at": _now(),
           **seal_fields({"signer_name": signer_name, "signer_code": meta["signer_code"], "ip": meta["ip"], "user_agent": meta["user_agent"],
                          "pdf": base64.b64encode(pdf).decode()}, ("signer_name", "signer_code", "ip", "user_agent", "pdf"))}
    doc["_id"] = (await db.signed_docs.insert_one(doc)).inserted_id
    return doc_out(doc)


async def refresh_consent_flags(db, owner: str, pid: str):
    active = await db.consents.find({"patient_id": pid, "owner_id": owner, "revoked_at": None}).sort("signed_at", -1).to_list(1)
    c = active[0] if active else None
    await db.patients.update_one({"_id": ObjectId(pid), "owner_id": owner}, {"$set": {
        "consent_at": c["signed_at"] if c and c["privacy_policy"] and c["health_data"] else None,
        "consent_version": c["version"] if c else None, "consent_email": bool(c and c.get("email_reports"))}})


async def audit(db, action: str, subject: str, owner: str):
    await db.audit.insert_one({"action": action, "subject": seal_fields({"s": subject}, ("s",))["s"], "at": _now(), "owner_id": owner})


async def record_privacy_consent(db, *, owner: str, patient: dict, version: str, signer: dict, clauses: dict, method: str,
                                 signature: Optional[str], channel: str, request: Request, client_signed_at: Optional[str],
                                 collected_by: str, signer_ident: str, parent_id: Optional[str] = None) -> dict:
    """patient = documento grezzo dal DB (cifrato). Revoca i consensi attivi, registra il nuovo, genera e archivia il PDF firmato."""
    if not (clauses.get("privacy_policy") and clauses.get("health_data")):
        raise HTTPException(400, "Informativa privacy e trattamento dei dati sanitari sono obbligatori")
    name = (signer.get("name") or "").strip()
    if len(name) < 3:
        raise HTTPException(400, "Nome e cognome del firmatario obbligatori")
    tablet = method == "firma_tablet"
    raw = check_png(signature) if tablet else None
    pid = str(patient["_id"])
    now = _now()
    consent_id = ObjectId()
    relation = signer.get("relation") or "Madre"
    pdf, meta = None, None
    if tablet:  # PDF generato prima di toccare i consensi esistenti: se fallisce non cambia nulla
        p = unseal_fields(patient, ("fiscal_code",))
        lh = await letterhead(db, owner)
        meta = {**client_meta(request), "code": new_code(), "version": version, "signed_at": now, "client_signed_at": client_signed_at,
                "channel": channel, "signer_code": signer_code(signer_ident), "collected_by": collected_by}
        signed = {"document": PRIVACY_DOC, "version": version, "patient_id": pid, "patient_name": p.get("name"), "owner_id": owner,
                  "signer": {"name": name, "relation": relation, "fiscal_code": signer.get("fiscal_code") or ""},
                  "clauses": {k: bool(clauses.get(k)) for k, _, _ in CLAUSES}, "signed_at": now, "ip": meta["ip"],
                  "signature_sha256": hashlib.sha256(raw).hexdigest(), "code": meta["code"]}
        meta["payload_sha256"] = payload_hash(signed)
        pdf = build_consent_pdf(doctor=lh["doctor"], info=lh["info"], clinic=lh["clinic"], specialty=lh["specialty"],
                                patient={"name": p.get("name"), "fiscal_code": p.get("fiscal_code"), "birth_date": p.get("birth_date")},
                                text=privacy_text(lh["doctor"]), version=version, clauses=[(label, bool(clauses.get(k))) for k, label, _ in CLAUSES],
                                signer={"name": name, "relation": relation, "fiscal_code": signer.get("fiscal_code") or ""},
                                signature=signature, meta=meta, code=meta["code"])
    await db.consents.update_many({"patient_id": pid, "owner_id": owner, "revoked_at": None}, {"$set": {"revoked_at": now}})
    await db.signed_docs.update_many({"kind": PRIVACY_DOC, "patient_ids": pid, "owner_ids": owner, "revoked_at": None}, {"$set": {"revoked_at": now, "superseded": True}})
    document = None
    if tablet:
        document = await archive(db, kind=PRIVACY_DOC, title="Consenso informato privacy", version=version, owner_ids=[owner], patient_ids=[pid],
                                 parent_id=parent_id, ref_id=str(consent_id), pdf=pdf, meta=meta, signer_name=name)
    consent = {"_id": consent_id, "patient_id": pid, "owner_id": owner, "version": version, "signer_relation": relation,
               "privacy_policy": True, "health_data": True, "email_reports": bool(clauses.get("email_reports")), "method": method,
               "signed_at": now, "revoked_at": None, "channel": channel, "document_id": document["id"] if document else None,
               **seal_fields({"signer_name": name, "signature": signature if tablet else None}, ("signer_name", "signature"))}
    await db.consents.insert_one(consent)
    await refresh_consent_flags(db, owner, pid)
    await audit(db, "consenso_firmato_portale" if channel == "portale" else "consenso_registrato", patient.get("name", ""), owner)
    return {"id": str(consent["_id"]), "patient_id": pid, "version": version, "signer_name": name, "signer_relation": consent["signer_relation"],
            "email_reports": consent["email_reports"], "method": method, "signed_at": now, "revoked_at": None, "channel": channel,
            "document_id": document["id"] if document else None, "document": document}


async def archive_share(db, *, share: dict, signer_name: str, signature: str, request: Request, parent: dict, text: str, version: str) -> Optional[dict]:
    try:
        raw = check_png(signature)
        members = share["members"]
        first = await db.patients.find_one({"_id": ObjectId(members[0]["patient_id"])})
        specialists = []
        for m in members:
            u = await db.users.find_one({"_id": ObjectId(m["owner_id"])}) or {}
            specialists.append({"name": u.get("name", ""), "specialty": (u.get("profile") or {}).get("specialty") or "Pediatria"})
        cf = unseal(parent.get("fiscal_code")) or ""
        meta = {**client_meta(request), "code": new_code(), "version": version, "signed_at": share["signed_at"], "client_signed_at": None,
                "channel": "portale", "signer_code": signer_code(f"user:{parent['_id']}"),
                "collected_by": f"Account genitore {parent.get('email', '')}"}
        signed = {"document": SHARE_DOC, "version": version, "share_id": str(share["_id"]), "members": members, "signer": signer_name,
                  "signed_at": share["signed_at"], "ip": meta["ip"], "signature_sha256": hashlib.sha256(raw).hexdigest(), "code": meta["code"]}
        meta["payload_sha256"] = payload_hash(signed)
        pdf = build_share_pdf(child=(first or {}).get("name", ""), specialists=specialists, text=text, version=version,
                              signer={"name": signer_name, "relation": "Genitore / tutore", "fiscal_code": cf}, signature=signature, meta=meta,
                              code=meta["code"], city="")
        return await archive(db, kind=SHARE_DOC, title="Consenso condivisione referti tra specialisti", version=version,
                             owner_ids=list(dict.fromkeys(m["owner_id"] for m in members)), patient_ids=[m["patient_id"] for m in members],
                             parent_id=str(parent["_id"]), ref_id=str(share["_id"]), pdf=pdf, meta=meta, signer_name=signer_name)
    except Exception:
        logger.exception("PDF del consenso di condivisione non archiviato")
        return None


def pdf_response(d: dict) -> Response:
    pdf = base64.b64decode(unseal(d["pdf"]))
    if hashlib.sha256(pdf).hexdigest() != d["file_sha256"]:
        raise HTTPException(500, "Integrità del documento non verificata")
    name = f"{d['code']}_{re.sub(r'[^A-Za-z0-9]+', '_', d['title']).strip('_')}.pdf"
    return Response(pdf, media_type="application/pdf", headers={"Content-Disposition": f"attachment; filename=\"{name}\"; filename*=UTF-8''{quote(name)}"})


class SignerIn(BaseModel):
    name: str = Field(min_length=3, max_length=100)
    relation: Literal["Madre", "Padre", "Tutore legale"] = "Madre"
    fiscal_code: str = Field(default="", max_length=16)


class SignatureIn(BaseModel):
    patient_id: str
    document_id: Literal["consenso_privacy"] = PRIVACY_DOC
    method: Literal["firma_tablet", "modulo_cartaceo"] = "firma_tablet"
    signature: Optional[str] = Field(default=None, max_length=400_000)
    signer: SignerIn
    privacy_policy: bool
    health_data: bool
    email_reports: bool = False
    client_signed_at: Optional[str] = Field(default=None, max_length=40)

    @field_validator("client_signed_at")
    @classmethod
    def v_ts(cls, v):
        if not v:
            return None
        try:
            return datetime.fromisoformat(v.replace("Z", "+00:00")).isoformat()
        except ValueError:
            return None


class PortalSignatureIn(SignatureIn):
    method: Literal["firma_tablet"] = "firma_tablet"
    signature: str = Field(max_length=400_000)


class DoctorSignatureIn(BaseModel):
    image: str = Field(max_length=400_000)


class VerifyIn(BaseModel):
    sha256: str = Field(min_length=64, max_length=64)


def build_signed_docs(db, current_user, consent_version: str):
    doctor = APIRouter()
    parent = APIRouter(prefix="/portal", dependencies=[Depends(require_role(current_user, "parent"))])
    public = APIRouter(prefix="/public")

    async def own_patient(owner: str, pid: str) -> dict:
        p = await db.patients.find_one({"_id": ObjectId(pid), "owner_id": owner}) if ObjectId.is_valid(pid) else None
        if not p:
            raise HTTPException(404, "Paziente non trovato")
        return p

    def template(doctor_name: str) -> dict:
        return {"document_id": PRIVACY_DOC, "version": consent_version, "title": "Consenso informato", "text": privacy_text(doctor_name),
                "clauses": [{"key": k, "label": label, "required": req} for k, label, req in CLAUSES], "relations": list(RELATIONS)}

    # ---------- Medico ----------
    @doctor.get("/signatures/template")
    async def doctor_template(user: dict = Depends(current_user)):
        return template(user["name"])

    @doctor.post("/signatures")
    async def doctor_sign(body: SignatureIn, request: Request, user: dict = Depends(current_user)):
        p = await own_patient(user["id"], body.patient_id)
        return await record_privacy_consent(
            db, owner=user["id"], patient=p, version=consent_version, signer=body.signer.model_dump(), clauses=body.model_dump(),
            method=body.method, signature=body.signature, channel="studio_tablet" if body.method == "firma_tablet" else "cartaceo",
            request=request, client_signed_at=body.client_signed_at, collected_by=f"{user['name']} ({user['email']})",
            signer_ident=f"studio:{body.patient_id}:{body.signer.name.strip().lower()}")

    @doctor.get("/patients/{pid}/documents")
    async def doctor_docs(pid: str, user: dict = Depends(current_user)):
        await own_patient(user["id"], pid)
        return [d for d in await docs_for_patient(db, pid)]

    @doctor.get("/documents/{did}/pdf")
    async def doctor_doc_pdf(did: str, user: dict = Depends(current_user)):
        d = await db.signed_docs.find_one({"_id": ObjectId(did), "owner_ids": user["id"]}) if ObjectId.is_valid(did) else None
        if not d:
            raise HTTPException(404, "Documento non trovato")
        await audit(db, "documento_firmato_scaricato", d["code"], user["id"])
        return pdf_response(d)

    @doctor.get("/patients/{pid}/consent-form.pdf")
    async def paper_form(pid: str, signer: str = "", relation: str = "", user: dict = Depends(current_user)):
        p = unseal_fields(await own_patient(user["id"], pid), ("fiscal_code",))
        lh = await letterhead(db, user["id"])
        code = new_code("MM-MOD")
        pdf = build_consent_pdf(doctor=lh["doctor"], info=lh["info"], clinic=lh["clinic"], specialty=lh["specialty"],
                                patient={"name": p.get("name"), "fiscal_code": p.get("fiscal_code"), "birth_date": p.get("birth_date")},
                                text=privacy_text(lh["doctor"]), version=consent_version, clauses=[(label, False) for _, label, _ in CLAUSES],
                                signer={"name": signer[:100], "relation": relation if relation in RELATIONS else ""}, signature=None, meta=None, code=code)
        name = f"Modulo_consenso_{re.sub(r'[^A-Za-z0-9]+', '_', p.get('name', '')).strip('_')}.pdf"
        return Response(pdf, media_type="application/pdf", headers={"Content-Disposition": f"attachment; filename=\"{name}\""})

    @doctor.get("/settings/signature")
    async def get_doctor_sig(user: dict = Depends(current_user)):
        s = await doctor_signature(db, user["id"])
        return {"image": s["image"], "set_at": s["set_at"]} if s else {"image": None, "set_at": None}

    @doctor.put("/settings/signature")
    async def put_doctor_sig(body: DoctorSignatureIn, request: Request, user: dict = Depends(current_user)):
        check_png(body.image)
        now = _now()
        await db.users.update_one({"_id": ObjectId(user["id"])}, {"$set": {"doctor_signature": seal({"image": body.image, "set_at": now, **client_meta(request)})}})
        await audit(db, "firma_medico_impostata", user["name"], user["id"])
        return {"image": body.image, "set_at": now}

    @doctor.delete("/settings/signature")
    async def del_doctor_sig(user: dict = Depends(current_user)):
        await db.users.update_one({"_id": ObjectId(user["id"])}, {"$unset": {"doctor_signature": ""}})
        await audit(db, "firma_medico_rimossa", user["name"], user["id"])
        return {"image": None, "set_at": None}

    # ---------- Genitore ----------
    async def parent_link(user: dict, pid: str) -> tuple[dict, dict]:
        u = await db.users.find_one({"_id": ObjectId(user["id"])})
        link = next((c for c in u.get("children", []) if c["patient_id"] == pid), None)
        if not link:
            raise HTTPException(404, "Cartella non collegata al suo account")
        p = await db.patients.find_one({"_id": ObjectId(pid), "owner_id": link["owner_id"]})
        if not p:
            raise HTTPException(404, "Cartella non trovata")
        return u, p

    @parent.get("/signatures/template")
    async def parent_template(patient_id: str, user: dict = Depends(current_user)):
        _, p = await parent_link(user, patient_id)
        lh = await letterhead(db, p["owner_id"])
        return {**template(lh["doctor"]), "doctor": lh["doctor"], "patient_name": p.get("name"), "consent_at": p.get("consent_at")}

    @parent.post("/signatures")
    async def parent_sign(body: PortalSignatureIn, request: Request, user: dict = Depends(current_user)):
        u, p = await parent_link(user, body.patient_id)
        cf = unseal(u.get("fiscal_code")) or ""
        out = await record_privacy_consent(
            db, owner=p["owner_id"], patient=p, version=consent_version, signer={**body.signer.model_dump(), "fiscal_code": body.signer.fiscal_code or cf},
            clauses=body.model_dump(), method="firma_tablet", signature=body.signature, channel="portale", request=request,
            client_signed_at=body.client_signed_at, collected_by=f"Account genitore {u['email']}", signer_ident=f"user:{u['_id']}", parent_id=str(u["_id"]))
        return out

    @parent.get("/documents/{did}/pdf")
    async def parent_doc_pdf(did: str, user: dict = Depends(current_user)):
        d = await db.signed_docs.find_one({"_id": ObjectId(did)}) if ObjectId.is_valid(did) else None
        u = await db.users.find_one({"_id": ObjectId(user["id"])})
        mine = {c["patient_id"] for c in (u or {}).get("children", [])}
        if not d or not (d.get("parent_id") == user["id"] or mine.intersection(d.get("patient_ids", []))):
            raise HTTPException(404, "Documento non trovato")
        for o in d["owner_ids"]:
            await audit(db, "documento_firmato_scaricato_portale", d["code"], o)
        return pdf_response(d)

    # ---------- Verifica pubblica dell'integrità ----------
    @public.post("/verify")
    async def verify(body: VerifyIn, request: Request):
        ip_h = hashlib.sha256(("verify:" + client_meta(request)["ip"]).encode()).hexdigest()
        if await db.verify_hits.count_documents({"ip": ip_h}) >= 30:
            raise HTTPException(429, "Troppe verifiche: riprovi tra un'ora")
        await db.verify_hits.insert_one({"ip": ip_h, "at": datetime.now(timezone.utc)})
        h = body.sha256.strip().lower()
        if not _HEX64.match(h):
            raise HTTPException(400, "Impronta non valida")
        d = await db.signed_docs.find_one({"file_sha256": h}, {"pdf": 0})
        if not d:
            return {"valid": False}
        name = unseal(d.get("signer_name")) or ""
        initials = " ".join(f"{w[0]}." for w in name.split() if w)
        return {"valid": True, "code": d["code"], "title": d["title"], "signed_at": d["signed_at"], "channel": d["channel"],
                "revoked_at": d.get("revoked_at"), "signer_initials": initials, "version": d.get("version", "")}

    return doctor, parent, public
