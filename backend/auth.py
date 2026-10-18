import os
import io
import base64
import secrets
import jwt
import bcrypt
import pyotp
import qrcode
from bson import ObjectId
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException, Request, Response, Depends
from pydantic import BaseModel
from crypto import seal, unseal

ALG = "HS256"
MAX_ATTEMPTS = 5
LOCK_MIN = 15
IDLE_MIN = int(os.environ["SESSION_IDLE_MINUTES"])


def hash_password(p: str) -> str:
    return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()


def verify_password(p: str, h: str) -> bool:
    return bcrypt.checkpw(p.encode(), h.encode())


def make_token(uid: str, kind: str, delta: timedelta, sid: str = "") -> str:
    payload = {"sub": uid, "sid": sid, "type": kind, "exp": datetime.now(timezone.utc) + delta}
    return jwt.encode(payload, os.environ["JWT_SECRET"], algorithm=ALG)


def set_cookies(resp: Response, uid: str, sid: str):
    opts = dict(httponly=True, secure=True, samesite="lax", path="/")
    resp.set_cookie("access_token", make_token(uid, "access", timedelta(minutes=15), sid), max_age=900, **opts)
    resp.set_cookie("refresh_token", make_token(uid, "refresh", timedelta(days=7), sid), max_age=604800, **opts)


def decode(token: str, kind: str) -> dict:
    try:
        payload = jwt.decode(token, os.environ["JWT_SECRET"], algorithms=[ALG])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Sessione scaduta")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Token non valido")
    if payload.get("type") != kind:
        raise HTTPException(401, "Token non valido")
    return payload


def public(user: dict) -> dict:
    return {"id": str(user["_id"]), "email": user["email"], "name": user.get("name", ""), "role": user.get("role", "doctor"),
            "totp_enabled": bool(user.get("totp_enabled")), "idle_minutes": IDLE_MIN}


class LoginIn(BaseModel):
    email: str
    password: str


class MfaIn(BaseModel):
    mfa_token: str
    code: str


class CodeIn(BaseModel):
    code: str


class DisableIn(BaseModel):
    password: str
    code: str


def build_auth(db):
    router = APIRouter(prefix="/auth")

    async def check_session(payload: dict) -> dict:
        s = await db.sessions.find_one({"sid": payload.get("sid") or "-"})
        now = datetime.now(timezone.utc)
        if not s:
            raise HTTPException(401, "Sessione terminata: accedi di nuovo")
        if datetime.fromisoformat(s["last_seen"]) < now - timedelta(minutes=IDLE_MIN):
            await db.sessions.delete_one({"_id": s["_id"]})
            raise HTTPException(401, "Sessione chiusa per inattività")
        if datetime.fromisoformat(s["last_seen"]) < now - timedelta(seconds=30):
            await db.sessions.update_one({"_id": s["_id"]}, {"$set": {"last_seen": now.isoformat()}})
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])}) if ObjectId.is_valid(payload["sub"]) else None
        if not user:
            raise HTTPException(401, "Utente non trovato")
        return user

    async def current_user(request: Request) -> dict:
        token = request.cookies.get("access_token")
        if not token:
            auth = request.headers.get("Authorization", "")
            token = auth[7:] if auth.startswith("Bearer ") else None
        if not token:
            raise HTTPException(401, "Non autenticato")
        return public(await check_session(decode(token, "access")))

    async def start_session(response: Response, user: dict) -> dict:
        sid = secrets.token_urlsafe(24)
        now = datetime.now(timezone.utc).isoformat()
        await db.sessions.insert_one({"sid": sid, "uid": str(user["_id"]), "created_at": now, "last_seen": now})
        set_cookies(response, str(user["_id"]), sid)
        return public(user)

    def ident_of(request: Request, key: str) -> str:
        fwd = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
        return f"{fwd or (request.client.host if request.client else 'x')}:{key}"

    async def guard(ident: str):
        att = await db.login_attempts.find_one({"identifier": ident})
        if att and att.get("locked_until") and datetime.fromisoformat(att["locked_until"]) > datetime.now(timezone.utc):
            mins = max(1, int((datetime.fromisoformat(att["locked_until"]) - datetime.now(timezone.utc)).total_seconds() // 60) + 1)
            raise HTTPException(429, f"Accesso bloccato per sicurezza dopo {MAX_ATTEMPTS} tentativi errati. Riprova tra {mins} minuti.")
        return att

    async def fail(ident: str, att, msg: str):
        count = (att or {}).get("count", 0) + 1
        if count >= MAX_ATTEMPTS:
            until = (datetime.now(timezone.utc) + timedelta(minutes=LOCK_MIN)).isoformat()
            await db.login_attempts.update_one({"identifier": ident}, {"$set": {"count": 0, "locked_until": until}}, upsert=True)
            raise HTTPException(429, f"Accesso bloccato per sicurezza dopo {MAX_ATTEMPTS} tentativi errati. Riprova tra {LOCK_MIN} minuti.")
        await db.login_attempts.update_one({"identifier": ident}, {"$set": {"count": count, "locked_until": None}}, upsert=True)
        left = MAX_ATTEMPTS - count
        raise HTTPException(401, f"{msg}. {left} tentativ{'o' if left == 1 else 'i'} rimast{'o' if left == 1 else 'i'} prima del blocco.")

    @router.post("/login")
    async def login(body: LoginIn, request: Request, response: Response):
        email = body.email.strip().lower()
        ident = ident_of(request, email)
        att = await guard(ident)
        user = await db.users.find_one({"email": email})
        if not user or not verify_password(body.password, user["password_hash"]):
            await fail(ident, att, "Email o password non corretti")
        await db.login_attempts.delete_many({"identifier": ident})
        if user.get("totp_enabled"):
            return {"mfa_required": True, "mfa_token": make_token(str(user["_id"]), "mfa", timedelta(minutes=5))}
        return await start_session(response, user)

    @router.post("/2fa/verify")
    async def verify_2fa(body: MfaIn, request: Request, response: Response):
        uid = decode(body.mfa_token, "mfa")["sub"]
        ident = ident_of(request, f"mfa:{uid}")
        att = await guard(ident)
        user = await db.users.find_one({"_id": ObjectId(uid)})
        if not user or not user.get("totp_enabled"):
            raise HTTPException(401, "Verifica non valida")
        if not pyotp.TOTP(unseal(user["totp_secret"])).verify(body.code.strip(), valid_window=1):
            await fail(ident, att, "Codice di verifica non corretto")
        await db.login_attempts.delete_many({"identifier": ident})
        return await start_session(response, user)

    @router.post("/2fa/setup")
    async def setup_2fa(user: dict = Depends(current_user)):
        secret = pyotp.random_base32()
        await db.users.update_one({"_id": ObjectId(user["id"])}, {"$set": {"totp_pending": seal(secret)}})
        uri = pyotp.TOTP(secret).provisioning_uri(name=user["email"], issuer_name="MantMed")
        buf = io.BytesIO()
        qrcode.make(uri, box_size=6, border=2).save(buf, format="PNG")
        return {"secret": secret, "uri": uri, "qr": "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()}

    @router.post("/2fa/enable")
    async def enable_2fa(body: CodeIn, user: dict = Depends(current_user)):
        doc = await db.users.find_one({"_id": ObjectId(user["id"])})
        if not doc.get("totp_pending") or not pyotp.TOTP(unseal(doc["totp_pending"])).verify(body.code.strip(), valid_window=1):
            raise HTTPException(400, "Codice non corretto: controlla l'app di autenticazione")
        await db.users.update_one({"_id": doc["_id"]}, {"$set": {"totp_secret": doc["totp_pending"], "totp_enabled": True}, "$unset": {"totp_pending": ""}})
        return {"totp_enabled": True}

    @router.post("/2fa/disable")
    async def disable_2fa(body: DisableIn, user: dict = Depends(current_user)):
        doc = await db.users.find_one({"_id": ObjectId(user["id"])})
        if not verify_password(body.password, doc["password_hash"]) or not doc.get("totp_enabled") \
                or not pyotp.TOTP(unseal(doc["totp_secret"])).verify(body.code.strip(), valid_window=1):
            raise HTTPException(400, "Password o codice non corretti")
        await db.users.update_one({"_id": doc["_id"]}, {"$set": {"totp_enabled": False}, "$unset": {"totp_secret": ""}})
        return {"totp_enabled": False}

    @router.post("/ping")
    async def ping(user: dict = Depends(current_user)):
        return {"ok": True, "idle_minutes": IDLE_MIN}

    @router.post("/logout")
    async def logout(request: Request, response: Response):
        for name in ("access_token", "refresh_token"):
            tok = request.cookies.get(name)
            if tok:
                try:
                    sid = jwt.decode(tok, os.environ["JWT_SECRET"], algorithms=[ALG], options={"verify_exp": False}).get("sid")
                    await db.sessions.delete_many({"sid": sid})
                except jwt.InvalidTokenError:
                    pass
        response.delete_cookie("access_token", path="/")
        response.delete_cookie("refresh_token", path="/")
        return {"ok": True}

    @router.post("/refresh")
    async def refresh(request: Request, response: Response):
        token = request.cookies.get("refresh_token")
        if not token:
            raise HTTPException(401, "Non autenticato")
        payload = decode(token, "refresh")
        user = await check_session(payload)
        set_cookies(response, str(user["_id"]), payload["sid"])
        return public(user)

    return router, current_user


async def seed_doctor(db):
    await db.users.create_index("email", unique=True)
    await db.login_attempts.create_index("identifier")
    await db.sessions.create_index("sid", unique=True)
    email = os.environ["DOCTOR_EMAIL"].strip().lower()
    pwd = os.environ["DOCTOR_PASSWORD"]
    name = os.environ["DOCTOR_NAME"]
    existing = await db.users.find_one({"email": email})
    if existing is None:
        prev = await db.users.find_one({"role": "doctor"})
        if prev:
            await db.users.update_one({"_id": prev["_id"]}, {"$set": {"email": email}})
            existing = await db.users.find_one({"email": email})
    if existing is None:
        await db.users.insert_one({"email": email, "password_hash": hash_password(pwd), "name": name, "role": "doctor",
                                   "created_at": datetime.now(timezone.utc).isoformat()})
    elif not verify_password(pwd, existing["password_hash"]) or existing.get("name") != name:
        await db.users.update_one({"email": email}, {"$set": {"password_hash": hash_password(pwd), "name": name}})


async def seed_admin(db):
    email = os.environ["ADMIN_EMAIL"].strip().lower()
    pwd = os.environ["ADMIN_PASSWORD"]
    existing = await db.users.find_one({"email": email})
    if existing is None:
        await db.users.insert_one({"email": email, "password_hash": hash_password(pwd), "name": "Founder MantMed", "role": "admin",
                                   "created_at": datetime.now(timezone.utc).isoformat()})
    elif existing.get("role") != "admin" or not verify_password(pwd, existing["password_hash"]):
        await db.users.update_one({"email": email}, {"$set": {"password_hash": hash_password(pwd), "role": "admin"}})


def require_role(current_user, role: str):
    async def dep(user: dict = Depends(current_user)) -> dict:
        if user["role"] != role:
            raise HTTPException(403, "Accesso non consentito per questo account")
        return user
    return dep
