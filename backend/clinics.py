"""Passaggio 5: studi configurabili (contatti, colore, intestazione, logo, listino, metodi di pagamento).
L'intestazione è versionata: ogni documento usa la versione valida alla sua data, così i documenti già emessi restano invariati."""
import io
import os
import uuid
from datetime import datetime, timezone
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response

METHODS = {"contanti": "Contanti", "carta": "Carta / Bancomat", "bonifico": "Bonifico", "pos": "POS", "online": "Pagamento Digitale / Online"}
PALETTE = ["#2F6F8F", "#B5651D", "#5A7D3A", "#8E4B7E", "#C0392B", "#3E5C9A", "#A07D1C", "#2E8B7A"]
MAX_CLINICS = 50  # predisposto per un limite per piano
LOGO_TYPES = {"image/png": "png", "image/jpeg": "jpg"}
LOGO_MAX = 2 * 1024 * 1024
LH_KEYS = ("doctor", "specialty", "titles", "order", "clinic", "address", "phone", "email", "header", "logo")
_logo_cache: dict = {}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def clinic_defaults(c: dict, i: int) -> dict:
    return {"id": c.get("id") or uuid.uuid4().hex[:10], "name": c.get("name") or "Studio principale", "address": c.get("address", ""),
            "phone": c.get("phone", ""), "email": c.get("email", ""), "color": c.get("color") or PALETTE[i % len(PALETTE)],
            "header": c.get("header", ""), "logo": c.get("logo", ""), "methods": c.get("methods") or list(METHODS),
            "prices": c.get("prices") or {}}


def clinics_of(user: dict) -> list:
    return [clinic_defaults(c, i) for i, c in enumerate(user.get("clinics") or [{"name": "Studio principale"}])]


def clinic_named(user: dict, name: str) -> Optional[dict]:
    return next((c for c in clinics_of(user) if c["name"] == name), None)


def clinic_services(services: list, clinic: Optional[dict]) -> list:
    """Listino dello studio: eredita il listino generale; lo studio può cambiare tariffa e durata o non offrire la prestazione."""
    over = (clinic or {}).get("prices") or {}
    out = []
    for s in services:
        o = over.get(s.get("id", "")) or over.get(s["name"]) or {}  # per identificativo (il nome vale solo per dati precedenti)
        if o.get("off"):
            continue
        out.append({**s, "price": float(o["price"]) if o.get("price") is not None else s["price"],
                    "duration": int(o["duration"]) if o.get("duration") else s["duration"]})
    return out


def current_letterhead(user: dict, clinic_name: str) -> dict:
    """Intestazione attuale dello studio (per i nuovi documenti)."""
    from report import studio_info
    p = user.get("profile") or {}
    c = clinic_named(user, clinic_name) or {}
    base = studio_info(clinic_name) if not p else {"specialty": p.get("specialty", ""), "titles": os.environ.get("DOCTOR_TITLES", "") if user.get("founder") else "",
                                                   "order": f"Iscr. N. {p.get('order_number', '')}", "phone": p.get("phone", ""),
                                                   "email": p.get("contact_email") or user["email"], "address": p.get("studio_address", "")}
    return {"doctor": user.get("name", ""), "specialty": base["specialty"], "titles": base.get("titles", ""), "order": base["order"],
            "clinic": clinic_name or (c.get("name") or ""), "address": c.get("address") or base["address"], "phone": c.get("phone") or base["phone"],
            "email": c.get("email") or base["email"], "header": c.get("header", ""), "logo": c.get("logo", "")}


def letterhead_at(user: dict, clinic_name: str, at: str) -> dict:
    """Versione dell'intestazione valida alla data del documento (documenti già emessi invariati)."""
    log = [v for v in user.get("letterhead_log") or [] if v["clinic"] == clinic_name]
    valid = [v for v in log if v["from"] <= (at or "")]
    if valid:
        return max(valid, key=lambda v: v["from"])["data"]
    if log:
        return min(log, key=lambda v: v["from"])["data"]  # documento precedente alla prima versione registrata
    return current_letterhead(user, clinic_name)


async def ensure_letterhead_base(db, u: dict):
    """Prima versione dell'intestazione (valida da sempre) = quella attuale: i documenti già emessi restano invariati."""
    if u.get("letterhead_log") or u.get("role") != "doctor":
        return
    clinics = clinics_of(u)
    u2 = {**u, "clinics": clinics}
    log = [{"clinic": n, "from": "", "data": current_letterhead(u2, n)} for n in [c["name"] for c in clinics] + [""]]
    await db.users.update_one({"_id": u["_id"], "letterhead_log": {"$in": [None, []]}}, {"$set": {"clinics": clinics, "letterhead_log": log}})


async def record_letterheads(db, user_id: str):
    """Registra una nuova versione dell'intestazione per ogni studio la cui intestazione è cambiata."""
    u = await db.users.find_one({"_id": ObjectId(user_id)})
    log = list(u.get("letterhead_log") or [])
    now = _now()
    for name in [c["name"] for c in clinics_of(u)] + [""]:
        cur = current_letterhead(u, name)
        last = max((v for v in log if v["clinic"] == name), key=lambda v: v["from"], default=None)
        if not last or {k: last["data"].get(k) for k in LH_KEYS} != {k: cur.get(k) for k in LH_KEYS}:
            log.append({"clinic": name, "from": now, "data": cur})
    if log != (u.get("letterhead_log") or []):
        await db.users.update_one({"_id": u["_id"]}, {"$set": {"letterhead_log": log}})


def logo_bytes(path: str) -> Optional[bytes]:
    if not path:
        return None
    if path not in _logo_cache:
        from showcase import get_object
        try:
            _logo_cache[path] = get_object(path)[0]
        except Exception:
            return None
    return _logo_cache[path]


def draw_logo(cv, path: str, x: float, y: float, size: float) -> bool:
    """Logo dello studio nell'intestazione PDF (su fondo chiaro arrotondato); False = usare il monogramma."""
    data = logo_bytes(path)
    if not data:
        return False
    from reportlab.lib.utils import ImageReader
    from reportlab.lib.colors import white
    cv.saveState()
    cv.setFillColor(white)
    cv.roundRect(x, y, size, size, size * 0.18, stroke=0, fill=1)
    cv.drawImage(ImageReader(io.BytesIO(data)), x + size * 0.08, y + size * 0.08, size * 0.84, size * 0.84, preserveAspectRatio=True, anchor="c", mask="auto")
    cv.restoreState()
    return True


def build_clinics(db, current_user):
    r = APIRouter(prefix="/settings/clinics")

    def find(u: dict, cid: str) -> dict:
        c = next((c for c in clinics_of(u) if c["id"] == cid), None)
        if not c:
            raise HTTPException(404, "Studio non trovato")
        return c

    @r.post("/{cid}/logo")
    async def upload_logo(cid: str, file: UploadFile = File(...), user: dict = Depends(current_user)):
        u = await db.users.find_one({"_id": ObjectId(user["id"])})
        find(u, cid)
        await ensure_letterhead_base(db, u)
        ext = LOGO_TYPES.get(file.content_type or "")
        if not ext:
            raise HTTPException(400, "Carichi un'immagine PNG o JPG")
        data = await file.read()
        if len(data) > LOGO_MAX:
            raise HTTPException(400, "Il logo supera 2 MB")
        from showcase import put_object, APP
        path = f"{APP}/logos/{user['id']}/{cid}-{uuid.uuid4().hex[:8]}.{ext}"
        put_object(path, data, file.content_type)
        _logo_cache[path] = data
        await db.users.update_one({"_id": u["_id"]}, {"$set": {"clinics": [{**c, "logo": path} if c["id"] == cid else c for c in clinics_of(u)]}})
        await record_letterheads(db, user["id"])
        return {"logo": path}

    @r.delete("/{cid}/logo")
    async def remove_logo(cid: str, user: dict = Depends(current_user)):
        u = await db.users.find_one({"_id": ObjectId(user["id"])})
        find(u, cid)
        await ensure_letterhead_base(db, u)
        await db.users.update_one({"_id": u["_id"]}, {"$set": {"clinics": [{**c, "logo": ""} if c["id"] == cid else c for c in clinics_of(u)]}})
        await record_letterheads(db, user["id"])
        return {"logo": ""}

    @r.get("/{cid}/logo")
    async def get_logo(cid: str, user: dict = Depends(current_user)):
        u = await db.users.find_one({"_id": ObjectId(user["id"])})
        data = logo_bytes(find(u, cid)["logo"])
        if not data:
            raise HTTPException(404, "Nessun logo")
        return Response(content=data, media_type="image/png" if data[:4] == b"\x89PNG" else "image/jpeg", headers={"Cache-Control": "private, max-age=300"})

    return r
