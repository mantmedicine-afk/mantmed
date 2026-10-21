"""Vetrina pubblica del medico: foto, copertina, biografia, prestazioni. Pagina pubblica /medico/{slug} e directory "Trova Specialista"."""
import asyncio
import logging
import os
import re
import unicodedata
import uuid
from datetime import datetime, timedelta, timezone
from typing import List, Optional

import requests
from bson import ObjectId
from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile
from pydantic import BaseModel, Field

from beta import TITLES
from registration import in_network
from scheduling import ROME, free_slots, schedule_of

logger = logging.getLogger(__name__)
STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
APP = "mantmed"
MIME = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}
MAX_BYTES = 8 * 1024 * 1024
_key = {"v": None}


def _init(force=False):
    if _key["v"] and not force:
        return _key["v"]
    r = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": os.environ["EMERGENT_LLM_KEY"]}, timeout=30)
    r.raise_for_status()
    _key["v"] = r.json()["storage_key"]
    return _key["v"]


def _req(method, path, **kw):
    for attempt in (0, 1):
        r = requests.request(method, f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": _init(force=attempt == 1), **kw.pop("headers", {})}, timeout=60, **kw)
        if r.status_code != 404 or attempt:
            r.raise_for_status()
            return r


def put_object(path, data, ctype):
    return _req("PUT", path, headers={"Content-Type": ctype}, data=data).json()


def get_object(path):
    r = _req("GET", path)
    return r.content, r.headers.get("Content-Type", "application/octet-stream")


class Service(BaseModel):
    id: str = Field(default_factory=lambda: uuid.uuid4().hex[:10])
    name: str = Field(min_length=2, max_length=80)
    duration_min: Optional[int] = Field(default=None, ge=5, le=480)
    price: Optional[float] = Field(default=None, ge=0, le=10000)
    description: str = Field(default="", max_length=300)


class ShowcaseIn(BaseModel):
    bio: str = Field(default="", max_length=2500)
    tagline: str = Field(default="", max_length=120)
    services: List[Service] = Field(default_factory=list, max_length=40)
    published: bool = True


def slugify(text: str) -> str:
    t = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", t).strip("-")[:60] or "medico"


def city_of(address: str) -> str:
    """Città dall'indirizzo ('Via Roma 1, 00100 Roma (RM)' -> 'Roma')."""
    part = (address or "").split(",")[-1]
    part = re.sub(r"\(.*?\)|\d{5}", "", part).strip()
    return part if 2 <= len(part) <= 40 and not re.search(r"\d", part) else ""


def build_showcase(db, current_user, doctor_user):
    doctor = APIRouter(prefix="/showcase")
    public = APIRouter(prefix="/public")

    def img_url(fid):
        return f"/api/public/files/{fid}" if fid else None

    async def ensure_slug(u: dict) -> str:
        sc = u.get("showcase") or {}
        if sc.get("slug"):
            return sc["slug"]
        base, n = slugify(TITLES.sub("", u.get("name") or "medico")), 1
        slug = base
        while await db.users.find_one({"showcase.slug": slug, "_id": {"$ne": u["_id"]}}):
            n += 1
            slug = f"{base}-{n}"
        await db.users.update_one({"_id": u["_id"]}, {"$set": {"showcase.slug": slug}})
        return slug

    def card(u: dict) -> dict:
        sc, prof, sch = u.get("showcase") or {}, u.get("profile") or {}, schedule_of(u)
        clinics = [{"name": c.get("name", ""), "address": c.get("address", ""), "city": city_of(c.get("address", ""))} for c in sch["clinics"]]
        city = next((c["city"] for c in clinics if c["city"]), "") or city_of(prof.get("studio_address", ""))
        return {"id": str(u["_id"]), "slug": sc.get("slug"), "name": u.get("name", ""), "specialty": prof.get("specialty") or "Pediatria",
                "city": city, "tagline": sc.get("tagline", ""), "photo_url": img_url(sc.get("photo")), "cover_url": img_url(sc.get("cover")),
                "clinics": clinics, "in_network": in_network(u), "published": sc.get("published", True)}

    def full(u: dict) -> dict:
        sc = u.get("showcase") or {}
        services = sc.get("services")
        if services is None:  # prima apertura: prestazioni dell'agenda
            services = [{"id": uuid.uuid4().hex[:10], "name": s["name"], "duration_min": s.get("duration"), "price": s.get("price") or None, "description": ""}
                        for s in schedule_of(u)["services"]]
        return {**card(u), "bio": sc.get("bio", ""), "services": services,
                "contact_email": (u.get("profile") or {}).get("contact_email", ""), "phone": (u.get("profile") or {}).get("phone", "")}

    async def me(user):
        u = await db.users.find_one({"_id": ObjectId(user["id"])})
        await ensure_slug(u)
        return await db.users.find_one({"_id": u["_id"]})

    @doctor.get("")
    async def get_mine(user: dict = Depends(doctor_user)):
        return full(await me(user))

    @doctor.put("")
    async def save(body: ShowcaseIn, user: dict = Depends(doctor_user)):
        u = await me(user)
        await db.users.update_one({"_id": u["_id"]}, {"$set": {"showcase.bio": body.bio.strip(), "showcase.tagline": body.tagline.strip(),
                                                               "showcase.services": [s.model_dump() for s in body.services], "showcase.published": body.published,
                                                               "showcase.updated_at": datetime.now(timezone.utc).isoformat()}})
        return full(await db.users.find_one({"_id": u["_id"]}))

    @doctor.post("/image/{kind}")
    async def upload(kind: str, file: UploadFile = File(...), user: dict = Depends(doctor_user)):
        if kind not in ("photo", "cover"):
            raise HTTPException(404, "Tipo di immagine non valido")
        ext = MIME.get(file.content_type or "")
        if not ext:
            raise HTTPException(400, "Formato non supportato: usi JPG, PNG o WEBP")
        data = await file.read()
        if len(data) > MAX_BYTES:
            raise HTTPException(400, "Immagine troppo grande (massimo 8 MB)")
        path = f"{APP}/showcase/{user['id']}/{kind}-{uuid.uuid4().hex}.{ext}"
        try:
            res = await asyncio.to_thread(put_object, path, data, file.content_type)
        except Exception:
            logger.exception("Upload vetrina fallito")
            raise HTTPException(503, "Caricamento non riuscito, riprovi tra qualche istante")
        u = await me(user)
        old = (u.get("showcase") or {}).get(kind)
        fid = (await db.files.insert_one({"storage_path": res["path"], "content_type": file.content_type, "size": res.get("size", len(data)),
                                          "owner_id": user["id"], "purpose": f"showcase_{kind}", "public": True, "is_deleted": False,
                                          "created_at": datetime.now(timezone.utc).isoformat()})).inserted_id
        if old and ObjectId.is_valid(old):
            await db.files.update_one({"_id": ObjectId(old)}, {"$set": {"is_deleted": True}})
        await db.users.update_one({"_id": u["_id"]}, {"$set": {f"showcase.{kind}": str(fid)}})
        return full(await db.users.find_one({"_id": u["_id"]}))

    @doctor.delete("/image/{kind}")
    async def remove(kind: str, user: dict = Depends(doctor_user)):
        u = await me(user)
        old = (u.get("showcase") or {}).get(kind)
        if old and ObjectId.is_valid(old):
            await db.files.update_one({"_id": ObjectId(old)}, {"$set": {"is_deleted": True}})
        await db.users.update_one({"_id": u["_id"]}, {"$unset": {f"showcase.{kind}": ""}})
        return full(await db.users.find_one({"_id": u["_id"]}))

    @public.get("/files/{fid}")
    async def file(fid: str):
        rec = await db.files.find_one({"_id": ObjectId(fid), "public": True, "is_deleted": False}) if ObjectId.is_valid(fid) else None
        if not rec:
            raise HTTPException(404, "Immagine non trovata")
        try:
            data, ctype = await asyncio.to_thread(get_object, rec["storage_path"])
        except Exception:
            logger.exception("Lettura immagine vetrina fallita")
            raise HTTPException(503, "Immagine temporaneamente non disponibile")
        return Response(content=data, media_type=rec.get("content_type") or ctype, headers={"Cache-Control": "public, max-age=86400"})

    def visible(u):
        return u.get("role") == "doctor" and u.get("status", "active") == "active" and (u.get("showcase") or {}).get("published", True)

    @public.get("/doctors")
    async def directory():
        out = []
        async for u in db.users.find({"role": "doctor", "status": "active", "showcase.slug": {"$exists": True}}).sort("created_at", 1):
            if visible(u) and in_network(u):
                f = full(u)
                bio = f["bio"].strip()
                out.append({**card(u), "bio_short": bio[:180].rsplit(" ", 1)[0] + "…" if len(bio) > 180 else bio,
                            "services": [s["name"] for s in f["services"]][:3], "services_count": len(f["services"])})
        return out

    async def ensure_all_slugs():
        async for u in db.users.find({"role": "doctor", "showcase.slug": {"$exists": False}}):
            await ensure_slug(u)

    @public.get("/doctors/{slug}")
    async def page(slug: str):
        u = await db.users.find_one({"showcase.slug": slug})
        if not u or not visible(u):
            raise HTTPException(404, "Vetrina non trovata")
        return full(u)

    @public.get("/doctors/{slug}/availability")
    async def availability(slug: str, service: str = "", clinic: str = "", limit: int = 6):
        """Prossimi orari liberi (14 giorni) per prestazione e studio: solo orari, nessun dato personale."""
        u = await db.users.find_one({"showcase.slug": slug})
        if not u or not visible(u) or not in_network(u):
            raise HTTPException(404, "Vetrina non trovata")
        sch = schedule_of(u)
        services = [s["name"] for s in sch["services"]]
        svc = service if service in services else (services[0] if services else "")
        clinics = [c["name"] for c in sch["clinics"] if not clinic or c["name"] == clinic]
        today, out = datetime.now(ROME).date(), []
        for i in range(15):
            day = (today + timedelta(days=i)).isoformat()
            for c in clinics:
                try:
                    times = await free_slots(db, u, c, svc, day)
                except HTTPException:
                    continue
                out += [{"date": day, "time": t, "clinic": c, "service": svc} for t in times[:3]]
            if len(out) >= limit:
                break
        out.sort(key=lambda x: (x["date"], x["time"]))
        return {"service": svc, "services": services, "clinics": [c["name"] for c in sch["clinics"]], "slots": out[:max(1, min(limit, 12))]}

    @public.get("/doctors/{slug}/week")
    async def week(slug: str, start: str = "", service: str = "", clinic: str = ""):
        """Calendario settimanale (lun-dom) degli orari liberi, sfogliabile fino a 8 settimane."""
        u = await db.users.find_one({"showcase.slug": slug})
        if not u or not visible(u) or not in_network(u):
            raise HTTPException(404, "Vetrina non trovata")
        sch = schedule_of(u)
        services = [s["name"] for s in sch["services"]]
        svc = service if service in services else (services[0] if services else "")
        today = datetime.now(ROME).date()
        first = today - timedelta(days=today.weekday())
        try:
            monday = datetime.strptime(start, "%Y-%m-%d").date() if start else first
        except ValueError:
            raise HTTPException(400, "Data non valida")
        monday -= timedelta(days=monday.weekday())
        monday = min(max(monday, first), first + timedelta(weeks=7))
        clinics = [c["name"] for c in sch["clinics"] if not clinic or c["name"] == clinic]
        days = []
        for i in range(7):
            d = monday + timedelta(days=i)
            slots = []
            if d >= today:
                for c in clinics:
                    try:
                        slots += [{"time": t, "clinic": c} for t in await free_slots(db, u, c, svc, d.isoformat())]
                    except HTTPException:
                        pass
            days.append({"date": d.isoformat(), "past": d < today, "slots": sorted(slots, key=lambda x: x["time"])})
        return {"week_start": monday.isoformat(), "service": svc, "prev": monday > first, "next": monday < first + timedelta(weeks=7), "days": days}

    return doctor, public, ensure_all_slugs
