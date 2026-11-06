"""Passaggio 4: chi accede alla cartella dal portale (paziente, tutori, tutore legale/AdS, delegati) e regola dei 18 anni."""
import asyncio
import hmac
import logging
import os
import re
from datetime import date, datetime, timedelta, timezone
from html import escape as hesc
from typing import Literal, Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, field_validator

from auth import require_role
from crypto import seal_fields, unseal_fields
from mailer import send_email
from registration import mail_shell
from tenancy import cf_hash

logger = logging.getLogger("access")
PORTAL_ROLES = ("patient", "parent")
P_SEALED = ("guardian_email", "guardian2_email", "patient_email", "guardian", "guardian2")
G_SEALED = ("email", "name", "document")
REL_LABEL = {"paziente": "Paziente", "tutore": "Genitore o tutore", "legale": "Tutore legale / amministratore di sostegno", "delegato": "Familiare delegato"}
NOTICE_DAYS = 30
DELEGATION_CONSENT = "delega-v1"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def email_hash(email: str) -> str:
    return cf_hash((email or "").strip().lower())


def adult_from(birth: str) -> Optional[date]:
    try:
        b = date.fromisoformat(birth[:10])
    except (TypeError, ValueError):
        return None
    try:
        return b.replace(year=b.year + 18)
    except ValueError:
        return date(b.year + 18, 3, 1)  # nati il 29 febbraio


def is_adult(p: dict, today: Optional[date] = None) -> bool:
    d = adult_from(p.get("birth_date") or "")
    return bool(d and d <= (today or _now().date()))


def emails_of(p: dict) -> dict:
    s = unseal_fields(p, P_SEALED)
    low = lambda k: (s.get(k) or "").strip().lower()
    return {"paziente": low("patient_email"), "tutori": [e for e in (low("guardian_email"), low("guardian2_email")) if e]}


def contact_emails(p: dict) -> list:
    """Destinatari di referti e promemoria: il paziente se maggiorenne, altrimenti i tutori (al massimo due)."""
    e = emails_of(p)
    if is_adult(p):
        s = unseal_fields(p, ("guardian",))
        own = e["tutori"][:1] if not e["paziente"] and _norm(s.get("guardian")) in ("", _norm(p.get("name"))) else []  # email del paziente salvata nel campo tutore (dati precedenti)
        return [e["paziente"]] if e["paziente"] else own
    return e["tutori"]


def _norm(s) -> str:
    return " ".join(re.sub(r"^[^:]{1,20}:\s*", "", s or "").lower().split())


async def active_grants(db, email: str = "", patient_id: str = "", kind: str = "") -> list:
    q = {"revoked_at": None, **({"email_hash": email_hash(email)} if email else {}), **({"patient_id": patient_id} if patient_id else {}), **({"kind": kind} if kind else {})}
    return await db.access_grants.find(q).to_list(200)


def relation_for(email: str, p: dict, grants: list, today: Optional[date] = None) -> Optional[str]:
    """Rapporto dell'account con la cartella secondo le regole decise; None = nessun accesso."""
    email = (email or "").strip().lower()
    pid = str(p["_id"])
    mine = [g for g in grants if g["patient_id"] == pid and g["owner_id"] == p["owner_id"]]
    if any(g["kind"] == "legale" for g in mine):
        return "legale"  # nomina con documento attivata dal medico: non si chiude a 18 anni
    e = emails_of(p)
    if is_adult(p, today):
        if e["paziente"] and e["paziente"] == email:
            return "paziente"
        if any(g["kind"] == "delega" for g in mine):
            return "delegato"
        return None
    return "tutore" if email in e["tutori"] else None


async def audit(db, action: str, subject: str, owner_id: str, extra: Optional[dict] = None):
    await db.audit.insert_one({"action": action, "subject": seal_fields({"s": subject}, ("s",))["s"], "at": _now().isoformat(), "owner_id": owner_id, **(extra or {})})


async def rules_active(db) -> bool:
    """Le nuove regole valgono dopo la conversione confermata (scripts/convert_portal_accounts.py --apply)."""
    return bool(await db.meta.find_one({"_id": "access_rules_v2"}))


async def _legacy_links(db, user: dict) -> list:
    email = user["email"].lower()
    children = {c["patient_id"]: c for c in user.get("children", [])}
    for h in user.get("child_cfs", []):
        async for p in db.patients.find({"cf_hash": h}):
            if email in emails_of(p)["tutori"] and str(p["_id"]) not in children:
                children[str(p["_id"])] = {"patient_id": str(p["_id"]), "owner_id": p["owner_id"], "linked_at": _now().isoformat()}
    if len(children) != len(user.get("children", [])):
        await db.users.update_one({"_id": user["_id"]}, {"$set": {"children": list(children.values())}})
    return list(children.values())


async def sync_links(db, user: dict) -> list:
    """Ricalcola i collegamenti del portale: aggiunge quelli consentiti, chiude (con registro) quelli non più consentiti."""
    if not await rules_active(db):
        return await _legacy_links(db, user)
    email = user["email"].lower()
    grants = await active_grants(db, email=email)
    cands = {}
    for h in user.get("child_cfs", []):
        async for p in db.patients.find({"cf_hash": h}):
            cands[str(p["_id"])] = p
    for g in grants:
        if g["patient_id"] not in cands and ObjectId.is_valid(g["patient_id"]):
            p = await db.patients.find_one({"_id": ObjectId(g["patient_id"]), "owner_id": g["owner_id"]})
            if p:
                cands[g["patient_id"]] = p
    old = {c["patient_id"]: c for c in user.get("children", [])}
    for pid in old:
        if pid not in cands and ObjectId.is_valid(pid):
            p = await db.patients.find_one({"_id": ObjectId(pid)})
            if p:
                cands[pid] = p
    now = _now().isoformat()
    links, closed = [], list(user.get("children_closed") or [])
    for pid, p in cands.items():
        rel = relation_for(email, p, grants)
        prev = old.get(pid)
        if rel:
            links.append({"patient_id": pid, "owner_id": p["owner_id"], "linked_at": (prev or {}).get("linked_at") or now, "relation": rel})
            closed = [c for c in closed if c["patient_id"] != pid]
            if not prev or prev.get("relation") != rel:
                await audit(db, "accesso_portale_aperto", p["name"], p["owner_id"], {"relation": rel, "user_id": str(user["_id"])})
        elif prev:
            reason = "maggiore_eta" if prev.get("relation") in (None, "tutore") and is_adult(p) else "revoca"
            closed = [c for c in closed if c["patient_id"] != pid] + [{"patient_id": pid, "owner_id": p["owner_id"], "closed_at": now, "reason": reason,
                                                                        "relation": prev.get("relation") or "tutore"}]
            await audit(db, "accesso_portale_chiuso", p["name"], p["owner_id"], {"reason": reason, "user_id": str(user["_id"])})
    if links != user.get("children", []) or closed != (user.get("children_closed") or []):
        await db.users.update_one({"_id": user["_id"]}, {"$set": {"children": links, "children_closed": closed}})
    return links


async def fiscal_only(db, user: dict) -> list:
    """Cartelle chiuse a 18 anni: restano visibili al genitore solo le ricevute pagate da lui, senza contenuti clinici."""
    out = []
    for c in user.get("children_closed") or []:
        p = await db.patients.find_one({"_id": ObjectId(c["patient_id"])}) if ObjectId.is_valid(c["patient_id"]) else None
        if not p:
            continue
        paid = [t["payment_id"] async for t in db.payment_transactions.find({"parent_id": str(user["_id"]), "payment_id": {"$ne": None}}, {"payment_id": 1})]
        recs = [r async for r in db.payments.find({"_id": {"$in": [ObjectId(x) for x in paid if ObjectId.is_valid(x)]}, "patient_id": c["patient_id"], "receipt_no": {"$ne": None}})]
        doc = await db.users.find_one({"_id": ObjectId(c["owner_id"])}, {"name": 1}) or {}
        out.append({"patient": {"id": c["patient_id"], "name": p["name"]}, "doctor": {"id": c["owner_id"], "name": doc.get("name", "")},
                    "closed_at": c["closed_at"], "reason": c["reason"],
                    "receipts": [{"id": str(r["_id"]), "receipt_no": r.get("receipt_no"), "date": r.get("date"), "service": r.get("service"), "amount": r.get("amount")} for r in recs]})
    return out


async def may_see_receipt(db, user_id: str, payment_id: str) -> bool:
    return bool(await db.payment_transactions.find_one({"parent_id": user_id, "payment_id": payment_id}))


async def portal_users_of(db, pid: str, owner: str) -> list:
    return await db.users.find({"role": {"$in": list(PORTAL_ROLES)}, "children": {"$elemMatch": {"patient_id": pid, "owner_id": owner}}}).to_list(20)


# ---------- Avvisi dei 18 anni (cron giornaliero) ----------
def _mail(title: str, body: str) -> str:
    return mail_shell(title, body)


async def coming_of_age(db, base: str) -> dict:
    today = _now().date()
    sent = {"avvisi": 0, "inviti": 0, "chiusure": 0}
    if not await rules_active(db):
        return sent
    async for p in db.patients.find({"birth_date": {"$gte": (today - timedelta(days=19 * 366)).isoformat(), "$lte": (today - timedelta(days=17 * 365)).isoformat()}}):
        d = adult_from(p.get("birth_date") or "")
        if not d:
            continue
        e = emails_of(p)
        owner = await db.users.find_one({"_id": ObjectId(p["owner_id"])}, {"name": 1}) or {}
        legal = await active_grants(db, patient_id=str(p["_id"]), kind="legale")
        if today >= d - timedelta(days=NOTICE_DAYS) and today < d and not p.get("adult_notice_sent_at"):
            claim = await db.patients.update_one({"_id": p["_id"], "adult_notice_sent_at": None}, {"$set": {"adult_notice_sent_at": _now().isoformat()}})
            if claim.modified_count:
                body = (f"<p>Gentile,</p><p>il {d.strftime('%d/%m/%Y')} <strong>{hesc(p['name'])}</strong> compirà 18 anni.</p>"
                        "<p>Da quel giorno l'accesso dei genitori o tutori alla cartella nel Portale Paziente si chiuderà e il paziente riceverà l'invito "
                        "a creare il proprio account con tutta la storia clinica. Il paziente potrà poi delegare di nuovo uno o entrambi i genitori, con un consenso esplicito e revocabile.</p>"
                        "<p>Le ricevute pagate dal genitore restano visibili al genitore, senza contenuti clinici.</p>"
                        f"<p style=\"color:#5B6478;font-size:13px\">Studio: {hesc(owner.get('name', ''))}</p>")
                for to in ([] if legal else e["tutori"]) + ([e["paziente"]] if e["paziente"] else []):
                    try:
                        await send_email(to=to, subject=f"MantMed · {p['name']} compie 18 anni il {d.strftime('%d/%m/%Y')}", html=_mail("ACCESSO AL PORTALE", body))
                        sent["avvisi"] += 1
                    except Exception:
                        logger.exception("Avviso 18 anni non inviato")
                await audit(db, "avviso_maggiore_eta", p["name"], p["owner_id"])
        if today >= d and not p.get("adult_invite_sent_at"):
            claim = await db.patients.update_one({"_id": p["_id"], "adult_invite_sent_at": None}, {"$set": {"adult_invite_sent_at": _now().isoformat()}})
            if claim.modified_count and e["paziente"]:
                body = (f"<p>Gentile {hesc(p['name'])},</p><p>da oggi può accedere personalmente alla sua cartella clinica nel Portale Paziente MantMed, con tutta la sua storia di visite.</p>"
                        f"<p style=\"margin:20px 0\"><a href=\"{hesc(base)}/registrati/paziente?tipo=paziente\" style=\"background:#0A192F;color:#ffffff;padding:12px 20px;border-radius:999px;text-decoration:none\">Crei il suo account</a></p>"
                        "<p>Usi questa email e il suo codice fiscale. Dal portale potrà delegare un familiare con un consenso che può revocare in ogni momento.</p>")
                try:
                    await send_email(to=e["paziente"], subject="MantMed · il suo accesso personale al Portale Paziente", html=_mail("INVITO AL PORTALE", body))
                    sent["inviti"] += 1
                except Exception:
                    logger.exception("Invito 18 anni non inviato")
                await audit(db, "invito_maggiore_eta", p["name"], p["owner_id"])
            for u in await portal_users_of(db, str(p["_id"]), p["owner_id"]):
                before = len(u.get("children", []))
                if len(await sync_links(db, u)) < before:
                    sent["chiusure"] += 1
    logger.info("Regola 18 anni: %s", sent)
    return sent


# ---------- API ----------
class GrantIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: str = Field(min_length=5, max_length=200)
    tipo: Literal["tutore_legale", "amministratore_sostegno"]
    document: str = Field(min_length=3, max_length=300)

    @field_validator("email")
    @classmethod
    def v_email(cls, v):
        v = v.strip().lower()
        if "@" not in v or "." not in v.split("@")[-1]:
            raise ValueError("Email non valida")
        return v


class DelegationIn(BaseModel):
    patient_id: str
    name: str = Field(min_length=2, max_length=120)
    email: str = Field(min_length=5, max_length=200)
    consent: bool

    @field_validator("email")
    @classmethod
    def v_email(cls, v):
        return GrantIn.v_email(v)


def grant_out(g: dict) -> dict:
    s = unseal_fields(g, G_SEALED)
    return {"id": str(g["_id"]), "patient_id": g["patient_id"], "kind": g["kind"], "tipo": g.get("tipo", ""), "name": s.get("name", ""), "email": s.get("email", ""), "document": s.get("document", ""),
            "created_at": g["created_at"], "revoked_at": g.get("revoked_at"), "label": REL_LABEL["legale" if g["kind"] == "legale" else "delegato"]}


def build_access(db, current_user):
    doctor = APIRouter(prefix="/patients")
    portal = APIRouter(prefix="/portal/access", dependencies=[Depends(require_role(current_user, "patient"))])
    cron = APIRouter(prefix="/cron")
    upcoming = APIRouter(prefix="/access")

    async def own_patient(pid: str, user: dict) -> dict:
        p = await db.patients.find_one({"_id": ObjectId(pid), "owner_id": user["id"]}) if ObjectId.is_valid(pid) else None
        if not p:
            raise HTTPException(404, "Paziente non trovato")
        return p

    async def resync(pid: str, owner: str, email: str = ""):
        users = await portal_users_of(db, pid, owner)
        if email:
            users += await db.users.find({"email": email.lower(), "role": {"$in": list(PORTAL_ROLES)}}).to_list(1)
        for uid in {u["_id"] for u in users}:
            await sync_links(db, await db.users.find_one({"_id": uid}))

    @doctor.get("/{pid}/access")
    async def patient_access(pid: str, user: dict = Depends(current_user)):
        p = await own_patient(pid, user)
        links = []
        for u in await portal_users_of(db, pid, user["id"]):
            rel = next((c.get("relation") for c in u["children"] if c["patient_id"] == pid), "")
            links.append({"name": u.get("name", ""), "email": u["email"], "relation": rel, "label": REL_LABEL.get(rel or "tutore", "")})
        grants = [grant_out(g) async for g in db.access_grants.find({"patient_id": pid, "owner_id": user["id"]}).sort("created_at", -1)]
        d = adult_from(p.get("birth_date") or "")
        return {"adult": is_adult(p), "adult_on": d.isoformat() if d else None, "accounts": links, "grants": grants, "rules_active": await rules_active(db),
                "notice_sent_at": p.get("adult_notice_sent_at"), "invite_sent_at": p.get("adult_invite_sent_at")}

    @doctor.post("/{pid}/access/legal")
    async def add_legal(pid: str, body: GrantIn, user: dict = Depends(current_user)):
        p = await own_patient(pid, user)
        if await db.access_grants.find_one({"patient_id": pid, "owner_id": user["id"], "kind": "legale", "email_hash": email_hash(body.email), "revoked_at": None}):
            raise HTTPException(409, "Questa persona ha già un accesso con documento di nomina")
        doc = {"patient_id": pid, "owner_id": user["id"], "kind": "legale", "tipo": body.tipo, "email_hash": email_hash(body.email), "created_by": user["id"],
               "created_at": _now().isoformat(), "revoked_at": None, **seal_fields({"email": body.email, "name": body.name, "document": body.document}, G_SEALED)}
        doc["_id"] = (await db.access_grants.insert_one(doc)).inserted_id
        await audit(db, "accesso_legale_attivato", p["name"], user["id"], {"tipo": body.tipo})
        await resync(pid, user["id"], body.email)
        return grant_out(doc)

    @doctor.delete("/{pid}/access/legal/{gid}")
    async def revoke_legal(pid: str, gid: str, user: dict = Depends(current_user)):
        p = await own_patient(pid, user)
        g = await db.access_grants.find_one_and_update({"_id": ObjectId(gid), "patient_id": pid, "owner_id": user["id"], "kind": "legale", "revoked_at": None},
                                                       {"$set": {"revoked_at": _now().isoformat(), "revoked_by": user["id"]}}) if ObjectId.is_valid(gid) else None
        if not g:
            raise HTTPException(404, "Accesso non trovato")
        await audit(db, "accesso_legale_revocato", p["name"], user["id"])
        await resync(pid, user["id"], unseal_fields(g, G_SEALED)["email"])
        return {"ok": True}

    @upcoming.get("/coming-of-age")
    async def coming(user: dict = Depends(current_user)):
        """Pazienti che compiono 18 anni nei prossimi 30 giorni (per il medico)."""
        today = _now().date()
        out = []
        async for p in db.patients.find({"owner_id": user["id"]}, {"name": 1, "birth_date": 1, "owner_id": 1, "patient_email": 1}):
            d = adult_from(p.get("birth_date") or "")
            if d and today <= d <= today + timedelta(days=NOTICE_DAYS):
                out.append({"id": str(p["_id"]), "name": p["name"], "adult_on": d.isoformat(), "has_email": bool(emails_of(p)["paziente"])})
        return sorted(out, key=lambda x: x["adult_on"])

    @portal.get("")
    async def my_access(user: dict = Depends(current_user)):
        u = await db.users.find_one({"_id": ObjectId(user["id"])})
        mine = [c for c in u.get("children", []) if c.get("relation") == "paziente"]
        dels = [grant_out(g) async for g in db.access_grants.find({"kind": "delega", "patient_id": {"$in": [c["patient_id"] for c in mine]}}).sort("created_at", -1)]
        return {"own": [c["patient_id"] for c in mine], "delegations": dels, "fiscal_only": await fiscal_only(db, u),
                "relations": {c["patient_id"]: c.get("relation") for c in u.get("children", [])}}

    @portal.post("/delegations")
    async def delegate(body: DelegationIn, user: dict = Depends(current_user)):
        if not body.consent:
            raise HTTPException(400, "Serve il suo consenso esplicito per delegare l'accesso")
        u = await db.users.find_one({"_id": ObjectId(user["id"])})
        link = next((c for c in u.get("children", []) if c["patient_id"] == body.patient_id and c.get("relation") == "paziente"), None)
        if not link:
            raise HTTPException(403, "Solo il paziente maggiorenne può delegare l'accesso alla propria cartella")
        if body.email == u["email"].lower():
            raise HTTPException(400, "Indichi l'email del familiare, non la sua")
        if await db.access_grants.find_one({"kind": "delega", "patient_id": body.patient_id, "email_hash": email_hash(body.email), "revoked_at": None}):
            raise HTTPException(409, "Questa persona è già delegata")
        p = await db.patients.find_one({"_id": ObjectId(body.patient_id)})
        doc = {"patient_id": body.patient_id, "owner_id": link["owner_id"], "kind": "delega", "email_hash": email_hash(body.email), "created_by": user["id"],
               "consent_version": DELEGATION_CONSENT, "created_at": _now().isoformat(), "revoked_at": None,
               **seal_fields({"email": body.email, "name": body.name, "document": ""}, G_SEALED)}
        doc["_id"] = (await db.access_grants.insert_one(doc)).inserted_id
        await audit(db, "delega_familiare_concessa", p["name"], link["owner_id"], {"user_id": user["id"]})
        await resync(body.patient_id, link["owner_id"], body.email)
        return grant_out(doc)

    @portal.delete("/delegations/{gid}")
    async def revoke_delegation(gid: str, user: dict = Depends(current_user)):
        u = await db.users.find_one({"_id": ObjectId(user["id"])})
        own = {c["patient_id"] for c in u.get("children", []) if c.get("relation") == "paziente"}
        g = await db.access_grants.find_one({"_id": ObjectId(gid), "kind": "delega", "revoked_at": None}) if ObjectId.is_valid(gid) else None
        if not g or g["patient_id"] not in own:
            raise HTTPException(404, "Delega non trovata")
        await db.access_grants.update_one({"_id": g["_id"]}, {"$set": {"revoked_at": _now().isoformat(), "revoked_by": user["id"]}})
        p = await db.patients.find_one({"_id": ObjectId(g["patient_id"])})
        await audit(db, "delega_familiare_revocata", p["name"], g["owner_id"], {"user_id": user["id"]})
        await resync(g["patient_id"], g["owner_id"], unseal_fields(g, G_SEALED)["email"])
        return {"ok": True}

    @cron.post("/coming-of-age", status_code=202)
    async def cron_coming_of_age(request: Request):
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
            res = await db.cron_runs.update_one({"_id": f"coa:{run_id}"}, {"$setOnInsert": {"at": _now().isoformat()}}, upsert=True)
            if not res.upserted_id:
                return {"accepted": True, "duplicate": True}
        host = request.headers.get("x-forwarded-host") or request.headers.get("host") or ""
        asyncio.create_task(coming_of_age(db, f"https://{host.split(',')[0].strip()}"))
        return {"accepted": True}

    return doctor, portal, cron, upcoming
