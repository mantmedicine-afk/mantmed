"""Checklist in tempo reale: modelli di esempio, trascrizione a blocchi da 30 s e rilevamento economico dei campi."""
import json
import logging
import os
import re
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from emergentintegrations.llm.chat import LlmChat, UserMessage

logger = logging.getLogger(__name__)
LIGHT_MODEL = "gpt-5.4-mini"
MAX_CHUNKS = 400



SECTION = {"anamnesi": "Anamnesi", "sintomi": "Motivo e sintomi", "parametri_vitali": "Parametri vitali", "esame_obiettivo": "Esame obiettivo", "altro": "Accertamenti e altro"}


def apply_checklist(sezioni: list, fields: list, manual: Dict[str, str]) -> list:
    """Campi del modello del medico: manuale prima dell'IA; vuoti = 'Non rilevato' (mai inventati). Stesso ordine del modello."""
    if not fields:
        return sezioni
    by_title = {s.get("titolo", "").strip().lower(): s for s in sezioni}
    out = []
    for f in fields:
        s = dict(by_title.get(f["titolo"].strip().lower()) or {"gruppo": f.get("gruppo", "altro"), "titolo": f["titolo"], "testo": ""})
        m = (manual or {}).get(f.get("id", ""), "").strip()
        ai = (s.get("testo") or "").strip()
        if m:
            s.update(testo=m, fonte="manuale", mancante=False)
        elif ai and not re.fullmatch(r"(non riportato|non rilevato|n\.?d\.?)\.?", ai, re.I):
            s.update(testo=ai, fonte="ai", mancante=False)
        else:
            s.update(testo="Non rilevato", fonte="", mancante=True)
        s["sezione"] = SECTION.get(f.get("gruppo"), "")
        out.append(s)
    return out


def demo_sezioni(fields: list, manual: Dict[str, str], ticked: Dict[str, str]) -> list:
    """Modalità dimostrativa: solo i campi spuntati ricevono il dato finto mostrato in visita."""
    fake = [{"gruppo": f.get("gruppo", "altro"), "titolo": f["titolo"], "testo": ticked.get(f.get("id", ""), "")} for f in fields]
    return apply_checklist(fake, fields, manual)


DETECT_SYSTEM = (
    "Sei un assistente per una pediatra. Ricevi un breve blocco di trascrizione di una visita e un elenco di campi ancora vuoti. "
    "Indica SOLO i campi per cui il blocco contiene un'informazione esplicita. Rispondi solo con JSON: "
    '{"rilevati": [{"id": "...", "anteprima": "max 60 caratteri, es. Peso: 7,4 kg"}]}. Non inventare nulla; se nessun campo è citato: {"rilevati": []}.'
)


class LiveSettings(BaseModel):
    realtime: Optional[bool] = None
    demo: Optional[bool] = None


def build_live(db, current_user, whisper, llm_key, seal, unseal):
    r = APIRouter()
    ttl_ready = {"done": False}

    def is_demo_account(u: dict) -> bool:
        email = (u.get("email") or "").strip().lower()
        return email == os.environ.get("DOCTOR_EMAIL", "").strip().lower() or email.endswith("@example.com")

    async def settings_of(user: dict) -> dict:
        u = await db.users.find_one({"_id": ObjectId(user["id"])}, {"email": 1, "mantai_settings": 1}) or {}
        s = u.get("mantai_settings") or {}
        demo_ok = is_demo_account(u)
        return {"realtime": s.get("realtime", True), "demo": bool(s.get("demo")) and demo_ok, "demo_available": demo_ok}

    @r.get("/mantai-settings")
    async def get_settings(user: dict = Depends(current_user)):
        return await settings_of(user)

    @r.put("/mantai-settings")
    async def put_settings(body: LiveSettings, user: dict = Depends(current_user)):
        cur = await settings_of(user)
        upd = {"realtime": cur["realtime"] if body.realtime is None else body.realtime,
               "demo": (cur["demo"] if body.demo is None else body.demo) and cur["demo_available"]}
        await db.users.update_one({"_id": ObjectId(user["id"])}, {"$set": {"mantai_settings": upd}})
        return await settings_of(user)

    async def detect(text: str, empty: list) -> list:
        if not empty or len(text.split()) < 3:
            return []
        listing = "\n".join(f'- {f["id"]}: {f["label"]}' + (f' ({f["hint"]})' if f.get("hint") else "") for f in empty)
        chat = LlmChat(api_key=llm_key, session_id=f"live-{uuid.uuid4()}", system_message=DETECT_SYSTEM).with_model("openai", LIGHT_MODEL)
        raw = await chat.send_message(UserMessage(text=f"Campi vuoti:\n{listing}\n\nBlocco:\n{text[:4000]}"))
        m = re.search(r"\{.*\}", raw or "", re.S)
        data = json.loads(m.group(0)) if m else {}
        ids = {f["id"] for f in empty}
        return [{"id": d["id"], "preview": str(d.get("anteprima") or "")[:80]} for d in data.get("rilevati") or [] if isinstance(d, dict) and d.get("id") in ids]

    @r.post("/consultations/live/chunk")
    async def live_chunk(user: dict = Depends(current_user), audio: UploadFile = File(...), session_id: str = Form(...), seq: int = Form(...),
                         empty_fields: str = Form("[]")):
        if not re.fullmatch(r"[a-f0-9-]{8,40}", session_id) or not 0 <= seq < MAX_CHUNKS:
            raise HTTPException(400, "Blocco non valido")
        data = await audio.read()
        if not data or len(data) > 25 * 1024 * 1024:
            raise HTTPException(400, "Blocco audio vuoto o troppo grande")
        text = await whisper(data, audio.filename or f"blocco-{seq}.webm")
        if not ttl_ready["done"]:  # trascrizioni a blocchi abbandonate: eliminate dopo 12 ore
            await db.live_sessions.create_index("expires_at", expireAfterSeconds=12 * 3600)
            ttl_ready["done"] = True
        await db.live_sessions.update_one({"session_id": session_id, "owner_id": user["id"]},
                                          {"$set": {f"chunks.{seq}": seal(text)}, "$setOnInsert": {"expires_at": datetime.now(timezone.utc)}},
                                          upsert=True)
        try:
            empty = [f for f in json.loads(empty_fields) if isinstance(f, dict) and f.get("id")][:40]
        except ValueError:
            empty = []
        try:
            found = await detect(text, empty)
        except Exception:
            logger.exception("Rilevamento campi fallito")
            found = []
        return {"seq": seq, "words": len(text.split()), "detected": found}

    async def live_transcript(session_id: str, owner: str, count: int) -> Optional[str]:
        """Trascrizione accumulata a blocchi; None se manca anche un solo blocco."""
        doc = await db.live_sessions.find_one({"session_id": session_id, "owner_id": owner})
        chunks = (doc or {}).get("chunks") or {}
        if count <= 0 or any(str(i) not in chunks for i in range(count)):
            return None
        return "\n".join(t for t in (unseal(chunks[str(i)]) or "" for i in range(count)) if t.strip())

    return r, settings_of, live_transcript
