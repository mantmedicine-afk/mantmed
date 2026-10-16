import os
import jwt
import bcrypt
from bson import ObjectId
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel

ALG = "HS256"
MAX_ATTEMPTS = 5
LOCK_MIN = 15


def hash_password(p: str) -> str:
    return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()


def verify_password(p: str, h: str) -> bool:
    return bcrypt.checkpw(p.encode(), h.encode())


def make_token(uid: str, kind: str, delta: timedelta) -> str:
    payload = {"sub": uid, "type": kind, "exp": datetime.now(timezone.utc) + delta}
    return jwt.encode(payload, os.environ["JWT_SECRET"], algorithm=ALG)


def set_cookies(resp: Response, uid: str):
    opts = dict(httponly=True, secure=True, samesite="lax", path="/")
    resp.set_cookie("access_token", make_token(uid, "access", timedelta(minutes=15)), max_age=900, **opts)
    resp.set_cookie("refresh_token", make_token(uid, "refresh", timedelta(days=7)), max_age=604800, **opts)


def decode(token: str, kind: str) -> str:
    try:
        payload = jwt.decode(token, os.environ["JWT_SECRET"], algorithms=[ALG])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Sessione scaduta")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Token non valido")
    if payload.get("type") != kind:
        raise HTTPException(401, "Token non valido")
    return payload["sub"]


def public(user: dict) -> dict:
    return {"id": str(user["_id"]), "email": user["email"], "name": user.get("name", ""), "role": user.get("role", "doctor")}


class LoginIn(BaseModel):
    email: str
    password: str


def build_auth(db):
    router = APIRouter(prefix="/auth")

    async def current_user(request: Request) -> dict:
        token = request.cookies.get("access_token")
        if not token:
            auth = request.headers.get("Authorization", "")
            token = auth[7:] if auth.startswith("Bearer ") else None
        if not token:
            raise HTTPException(401, "Non autenticato")
        uid = decode(token, "access")
        user = await db.users.find_one({"_id": ObjectId(uid)}) if ObjectId.is_valid(uid) else None
        if not user:
            raise HTTPException(401, "Utente non trovato")
        return public(user)

    @router.post("/login")
    async def login(body: LoginIn, request: Request, response: Response):
        email = body.email.strip().lower()
        fwd = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
        ident = f"{fwd or (request.client.host if request.client else 'x')}:{email}"
        now = datetime.now(timezone.utc)
        att = await db.login_attempts.find_one({"identifier": ident})
        if att and att.get("locked_until") and datetime.fromisoformat(att["locked_until"]) > now:
            raise HTTPException(429, f"Troppi tentativi. Riprova tra {LOCK_MIN} minuti.")
        user = await db.users.find_one({"email": email})
        if not user or not verify_password(body.password, user["password_hash"]):
            count = (att or {}).get("count", 0) + 1
            upd = {"count": count}
            if count >= MAX_ATTEMPTS:
                upd = {"count": 0, "locked_until": (now + timedelta(minutes=LOCK_MIN)).isoformat()}
            await db.login_attempts.update_one({"identifier": ident}, {"$set": upd}, upsert=True)
            raise HTTPException(401, "Email o password non corretti")
        await db.login_attempts.delete_many({"identifier": ident})
        set_cookies(response, str(user["_id"]))
        return public(user)

    @router.post("/logout")
    async def logout(response: Response):
        response.delete_cookie("access_token", path="/")
        response.delete_cookie("refresh_token", path="/")
        return {"ok": True}

    @router.post("/refresh")
    async def refresh(request: Request, response: Response):
        token = request.cookies.get("refresh_token")
        if not token:
            raise HTTPException(401, "Non autenticato")
        uid = decode(token, "refresh")
        user = await db.users.find_one({"_id": ObjectId(uid)}) if ObjectId.is_valid(uid) else None
        if not user:
            raise HTTPException(401, "Utente non trovato")
        set_cookies(response, uid)
        return public(user)

    return router, current_user


async def seed_doctor(db):
    await db.users.create_index("email", unique=True)
    await db.login_attempts.create_index("identifier")
    email = os.environ["DOCTOR_EMAIL"].strip().lower()
    pwd = os.environ["DOCTOR_PASSWORD"]
    name = os.environ["DOCTOR_NAME"]
    existing = await db.users.find_one({"email": email})
    if existing is None:
        await db.users.insert_one({"email": email, "password_hash": hash_password(pwd), "name": name, "role": "doctor",
                                   "created_at": datetime.now(timezone.utc).isoformat()})
    elif not verify_password(pwd, existing["password_hash"]) or existing.get("name") != name:
        await db.users.update_one({"email": email}, {"$set": {"password_hash": hash_password(pwd), "name": name}})
