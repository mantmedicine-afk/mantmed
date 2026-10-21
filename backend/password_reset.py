"""Password recovery: one-time emailed link (30 min), strong new password, all sessions closed, 2FA untouched."""
import asyncio
import hashlib
import logging
import os
import re
import secrets
from datetime import datetime, timezone, timedelta
from html import escape as hesc
import jwt
from netutil import client_ip
from fastapi import APIRouter, Depends, HTTPException, Request
from bson import ObjectId
from pydantic import BaseModel, Field, field_validator
from auth import hash_password, verify_password, ALG, MAX_ATTEMPTS, LOCK_MIN
from mailer import send_email
from registration import mail_shell, CF_RE
from tenancy import cf_hash

logger = logging.getLogger(__name__)
TTL_MIN = 30
MAX_PER_IP_HOUR = 10
MAX_PER_USER_WINDOW = 3
HOST_RE = re.compile(r"^[A-Za-z0-9.\-]+(:\d+)?$")
AREA = {"doctor": "/app", "parent": "/portale", "admin": "/admin"}
GENERIC = "Se l'indirizzo email è presente nei nostri sistemi, riceverai a breve le istruzioni per impostare una nuova password."


def _now():
    return datetime.now(timezone.utc)


def _h(t: str) -> str:
    return hashlib.sha256(t.encode()).hexdigest()


def strong_password(pw: str) -> str:
    if len(pw) < 10 or not re.search(r"[A-Za-z]", pw) or not re.search(r"\d", pw) or not re.search(r"[^A-Za-z0-9]", pw):
        raise ValueError("La password deve avere almeno 10 caratteri, con lettere, numeri e almeno un carattere speciale")
    return pw


class ForgotIn(BaseModel):
    identifier: str = Field(min_length=3, max_length=200)


class ResetIn(BaseModel):
    token: str = Field(min_length=20, max_length=200)
    password: str = Field(max_length=128)

    @field_validator("password")
    @classmethod
    def v_pw(cls, v):
        return strong_password(v)


class ChangeIn(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(max_length=128)

    @field_validator("new_password")
    @classmethod
    def v_pw(cls, v):
        return strong_password(v)


def _mask(email: str) -> str:
    name, _, dom = email.partition("@")
    return f"{name[:2]}{'•' * max(1, len(name) - 2)}@{dom}"


def build_password_reset(db, current_user):
    router = APIRouter(prefix="/auth/password")

    def base_url(request: Request) -> str:
        host = (request.headers.get("host") or "").strip()
        if not HOST_RE.match(host):
            raise HTTPException(400, "Richiesta non valida")
        scheme = "http" if host.startswith(("localhost", "127.0.0.1")) else "https"
        return f"{scheme}://{host}"

    async def targets(identifier: str) -> list:
        ident = identifier.strip()
        cf = ident.upper()
        if CF_RE.match(cf):
            q = {"role": "parent", "child_cfs": cf_hash(cf)}
        else:
            q = {"email": ident.lower()}
        return [u async for u in db.users.find(q) if u.get("status", "active") == "active"]

    async def issue(u: dict, base: str):
        since = (_now() - timedelta(minutes=TTL_MIN)).isoformat()
        if await db.password_resets.count_documents({"uid": str(u["_id"]), "created_at": {"$gte": since}}) >= MAX_PER_USER_WINDOW:
            return
        token = secrets.token_urlsafe(32)
        now = _now()
        await db.password_resets.update_many({"uid": str(u["_id"]), "used_at": None}, {"$set": {"used_at": now.isoformat(), "superseded": True}})
        await db.password_resets.insert_one({"uid": str(u["_id"]), "token": _h(token), "created_at": now.isoformat(),
                                             "expires_at": now + timedelta(minutes=TTL_MIN), "used_at": None})
        link = f"{base}/reimposta-password?token={token}"
        try:
            await send_email(to=u["email"], subject="MantMed · reimposta la password", html=mail_shell("RECUPERO PASSWORD",
                f"<p>Gentile {hesc(u.get('name') or '')},</p><p>abbiamo ricevuto una richiesta di reimpostazione della password del suo account MantMed.</p>"
                f"<p style=\"margin:22px 0\"><a href=\"{hesc(link)}\" style=\"background:#0A192F;color:#ffffff;padding:14px 22px;border-radius:999px;text-decoration:none\">Imposta una nuova password</a></p>"
                f"<p style=\"color:#5B6478;font-size:13px\">Il link è personale, utilizzabile una sola volta e scade tra {TTL_MIN} minuti. "
                "Se non ha richiesto lei il ripristino, ignori questa email: la password attuale resta valida.</p>"))
        except Exception:
            logger.exception("Email di recupero password non inviata")

    @router.post("/forgot")
    async def forgot(body: ForgotIn, request: Request):
        base = base_url(request)
        ip = client_ip(request)
        since = (_now() - timedelta(hours=1)).isoformat()
        if await db.reset_requests.count_documents({"ip": ip, "at": {"$gte": since}}) >= MAX_PER_IP_HOUR:
            raise HTTPException(429, "Troppe richieste da questa connessione. Riprovi tra un'ora.")
        await db.reset_requests.insert_one({"ip": ip, "at": _now().isoformat()})
        for u in await targets(body.identifier):
            asyncio.create_task(issue(u, base))
        return {"ok": True, "message": GENERIC}

    async def valid(token: str) -> dict:
        r = await db.password_resets.find_one({"token": _h(token), "used_at": None})
        exp = r["expires_at"] if r else None
        if exp is not None and exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if not r or exp < _now():
            raise HTTPException(410, "Link scaduto o già utilizzato: richieda un nuovo link di ripristino")
        return r

    @router.get("/reset/{token}")
    async def reset_info(token: str):
        r = await valid(token)
        u = await db.users.find_one({"_id": ObjectId(r["uid"])}) or {}
        return {"email": _mask(u.get("email", "")), "role": u.get("role", "doctor")}

    @router.post("/reset")
    async def reset(body: ResetIn):
        r = await valid(body.token)
        claimed = await db.password_resets.update_one({"_id": r["_id"], "used_at": None}, {"$set": {"used_at": _now().isoformat()}})
        if not claimed.modified_count:
            raise HTTPException(410, "Link scaduto o già utilizzato: richieda un nuovo link di ripristino")
        u = await db.users.find_one({"_id": ObjectId(r["uid"])})
        if not u:
            raise HTTPException(410, "Account non trovato")
        await db.users.update_one({"_id": u["_id"]}, {"$set": {"password_hash": hash_password(body.password), "password_changed_at": _now().isoformat()}})
        await db.sessions.delete_many({"uid": r["uid"]})
        await db.login_attempts.delete_many({"identifier": {"$regex": f":{re.escape(u['email'])}$"}})
        await db.audit.insert_one({"action": "password_reimpostata", "subject": None, "at": _now().isoformat(), "owner_id": r["uid"] if u.get("role") == "doctor" else None})
        try:
            await send_email(to=u["email"], subject="MantMed · password modificata", html=mail_shell("PASSWORD MODIFICATA",
                f"<p>Gentile {hesc(u.get('name') or '')},</p><p>la password del suo account MantMed è stata appena modificata e tutte le sessioni aperte sono state chiuse.</p>"
                "<p>Se non è stato lei, contatti subito lo studio o MantMed.</p>"))
        except Exception:
            logger.exception("Conferma cambio password non inviata")
        return {"ok": True, "role": u.get("role", "doctor"), "login_path": AREA.get(u.get("role"), "/app"), "totp_enabled": bool(u.get("totp_enabled"))}

    # ---------- Cambio password dal profilo (utente autenticato) ----------
    @router.post("/change")
    async def change(body: ChangeIn, request: Request, user: dict = Depends(current_user)):
        ip = client_ip(request)
        ident = f"{ip}:chpw:{user['id']}"
        att = await db.login_attempts.find_one({"identifier": ident})
        if att and att.get("locked_until") and datetime.fromisoformat(att["locked_until"]) > _now():
            raise HTTPException(429, f"Cambio password bloccato per sicurezza dopo {MAX_ATTEMPTS} tentativi errati. Riprovi tra {LOCK_MIN} minuti.")
        u = await db.users.find_one({"_id": ObjectId(user["id"])})
        if not verify_password(body.current_password, u["password_hash"]):
            count = (att or {}).get("count", 0) + 1
            if count >= MAX_ATTEMPTS:
                await db.login_attempts.update_one({"identifier": ident}, {"$set": {"count": 0, "locked_until": (_now() + timedelta(minutes=LOCK_MIN)).isoformat()}}, upsert=True)
                raise HTTPException(429, f"Cambio password bloccato per sicurezza dopo {MAX_ATTEMPTS} tentativi errati. Riprovi tra {LOCK_MIN} minuti.")
            await db.login_attempts.update_one({"identifier": ident}, {"$set": {"count": count, "locked_until": None}}, upsert=True)
            left = MAX_ATTEMPTS - count
            raise HTTPException(400, f"Password attuale non corretta. {left} tentativ{'o' if left == 1 else 'i'} rimast{'o' if left == 1 else 'i'}.")
        if verify_password(body.new_password, u["password_hash"]):
            raise HTTPException(400, "La nuova password deve essere diversa da quella attuale")
        await db.login_attempts.delete_many({"identifier": ident})
        await db.users.update_one({"_id": u["_id"]}, {"$set": {"password_hash": hash_password(body.new_password), "password_changed_at": _now().isoformat()}})
        token = request.cookies.get("access_token") or request.headers.get("Authorization", "")[7:]
        sid = jwt.decode(token, os.environ["JWT_SECRET"], algorithms=[ALG]).get("sid")
        closed = await db.sessions.delete_many({"uid": user["id"], "sid": {"$ne": sid}})
        await db.audit.insert_one({"action": "password_modificata", "subject": None, "at": _now().isoformat(), "owner_id": user["id"] if u.get("role") == "doctor" else None})
        asyncio.create_task(notify_change(u))
        return {"ok": True, "other_sessions_closed": closed.deleted_count}

    async def notify_change(u: dict):
        try:
            await send_email(to=u["email"], subject="MantMed · password modificata", html=mail_shell("PASSWORD MODIFICATA",
                f"<p>Gentile {hesc(u.get('name') or '')},</p><p>la password del suo account MantMed è stata modificata dal suo profilo e le sessioni aperte sugli altri dispositivi sono state chiuse.</p>"
                "<p>Se non è stato lei, usi subito &quot;Password dimenticata?&quot; nella pagina di accesso e contatti lo studio o MantMed.</p>"))
        except Exception:
            logger.exception("Conferma cambio password non inviata")

    return router
