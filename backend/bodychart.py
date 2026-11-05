"""Interactive bodychart (mappa corporea) per visit: markers, freehand strokes and PNG snapshot, all sealed with AES-256-GCM."""
import base64
import hashlib
import json
import math
from datetime import datetime, timedelta, timezone
from typing import Literal, Optional
from bson import ObjectId
import asyncio
import uuid
from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile
from showcase import get_object, put_object
from pydantic import BaseModel, Field, field_validator
from auth import require_role
from crypto import seal_fields, unseal_fields
from bodychart_media import REGIONS, is_intimate, open_photo, process_photo

VIEWS = Literal["front", "back", "left", "right", "mouth", "head", "ears", "hand_palm", "hand_back", "foot_back", "foot_sole"]
CAT_IDS = ("lesione", "trauma", "dolore", "eruzione", "nevo", "controllo")
CATS = Literal["lesione", "trauma", "dolore", "eruzione", "nevo", "controllo"]
DESCRITTORI = Literal["macula", "papula", "placca", "nodulo", "vescicola", "bolla", "pustola", "pomfo", "crosta", "squama", "erosione", "ulcera",
                      "petecchia", "ecchimosi", "cicatrice", "lichenificazione"]
STATI = Literal["attivo", "in_miglioramento", "risolto"]
PHOTO_MIME = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heic"}
SEALED = ("markers", "strokes", "snapshot")
PNG_PREFIX = "data:image/png;base64,"
MAX_SNAPSHOT = 4_000_000


def _now():
    return datetime.now(timezone.utc).isoformat()


class Marker(BaseModel):
    id: str = Field(min_length=1, max_length=40)
    lesion_id: str = Field(default="", max_length=40)
    view: VIEWS
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)
    cat: CATS
    note: str = Field(default="", max_length=140)
    size_cm: Optional[float] = Field(default=None, gt=0, le=100)
    descrittore: Optional[DESCRITTORI] = None
    stato: STATI = "attivo"
    origin: Literal["medico", "mantai"] = "medico"
    proposed: bool = False
    photos: list[str] = Field(default_factory=list, max_length=4)


class Stroke(BaseModel):
    view: VIEWS
    tool: Literal["pen", "highlighter"]
    color: str = Field(pattern=r"^#[0-9A-Fa-f]{6}$")
    width: float = Field(ge=0.5, le=40)
    points: list[list[float]] = Field(min_length=1, max_length=3000)


class BodychartIn(BaseModel):
    silhouette: Literal["child", "adult"]
    markers: list[Marker] = Field(default_factory=list, max_length=200)
    strokes: list[Stroke] = Field(default_factory=list, max_length=300)
    snapshot: str = Field(max_length=MAX_SNAPSHOT)
    include_in_report: bool = False

    @field_validator("snapshot")
    @classmethod
    def v_png(cls, v):
        if not v.startswith(PNG_PREFIX):
            raise ValueError("Istantanea non valida")
        base64.b64decode(v[len(PNG_PREFIX):], validate=True)
        return v


class IncludeIn(BaseModel):
    include: bool


def _norm(m: dict) -> dict:
    return {**m, "lesion_id": m.get("lesion_id") or m["id"], "stato": m.get("stato") or "attivo"}


def out(doc: dict, full: bool = True) -> dict:
    u = unseal_fields(doc, SEALED if full else ("markers",))
    markers = [_norm(m) for m in u.get("markers") or []]
    o = {"id": str(doc["_id"]), "consultation_id": doc["consultation_id"], "patient_id": doc.get("patient_id"), "visit_date": doc["visit_date"],
         "silhouette": doc["silhouette"], "include_in_report": doc.get("include_in_report", False), "created_at": doc["created_at"], "updated_at": doc["updated_at"],
         "markers": markers, "counts": {c: sum(1 for m in markers if m["cat"] == c) for c in CAT_IDS}}
    if full:
        o["strokes"] = u.get("strokes") or []
        o["snapshot"] = u.get("snapshot")
    return o


def report_payload(doc: dict | None, force: bool = False) -> dict | None:
    """Bodychart data for the PDF report: only when the doctor ticked 'Includi nel referto' (or force)."""
    if not doc or not (force or doc.get("include_in_report")):
        return None
    u = unseal_fields(doc, ("markers", "snapshot"))
    return {"png": base64.b64decode(u["snapshot"][len(PNG_PREFIX):]), "markers": u.get("markers") or []}


def _diff(old: list, new: list) -> dict:
    a, b = {m["id"]: m for m in old}, {m["id"]: m for m in new}
    pa, pb = {p for m in old for p in m.get("photos") or []}, {p for m in new for p in m.get("photos") or []}
    return {"pin_aggiunti": len(b.keys() - a.keys()), "pin_eliminati": len(a.keys() - b.keys()),
            "pin_modificati": sum(1 for k in a.keys() & b.keys() if {**a[k], "photos": None} != {**b[k], "photos": None}),
            "foto_collegate": len(pb - pa), "foto_eliminate": len(pa - pb)}


def build_bodychart(db, current_user, llm_json=None):
    doctor = APIRouter(dependencies=[Depends(require_role(current_user, "doctor"))])
    parent = APIRouter(prefix="/portal", dependencies=[Depends(require_role(current_user, "parent"))])

    async def consultation(cid: str, owner: str) -> dict:
        c = await db.consultations.find_one({"_id": ObjectId(cid), "owner_id": owner}) if ObjectId.is_valid(cid) else None
        if not c:
            raise HTTPException(404, "Consultazione non trovata")
        return c

    async def log(action: str, subject: str, owner: str, dedupe_min: int = 0):
        if dedupe_min:  # visualizzazioni ripetute ravvicinate: una sola voce
            since = (datetime.now(timezone.utc) - timedelta(minutes=dedupe_min)).isoformat()
            async for a in db.audit.find({"action": action, "owner_id": owner, "at": {"$gte": since}}, {"subject": 1}):
                if unseal_fields(a, ("subject",)).get("subject") == subject:
                    return
        await db.audit.insert_one({"action": action, "subject": seal_fields({"s": subject}, ("s",))["s"], "at": _now(), "owner_id": owner, "actor_id": owner})

    async def photo_meta(owner: str, ids) -> dict:
        oids = [ObjectId(i) for i in ids if ObjectId.is_valid(i)]
        return {str(f["_id"]): {"reserved": bool(f.get("reserved")), "created_at": f["created_at"]}
                async for f in db.files.find({"_id": {"$in": oids}, "owner_id": owner, "is_deleted": False}, {"reserved": 1, "created_at": 1})}

    async def with_meta(o: dict, owner: str) -> dict:
        o["photo_meta"] = await photo_meta(owner, {p for m in o["markers"] for p in m.get("photos") or []})
        return o

    @doctor.get("/consultations/{cid}/bodychart")
    async def get_chart(cid: str, summary: bool = False, user: dict = Depends(current_user)):
        c = await consultation(cid, user["id"])
        doc = await db.bodycharts.find_one({"consultation_id": cid, "owner_id": user["id"]})
        if summary:
            return {"markers": [{"id": m["id"]} for m in out(doc, full=False)["markers"]]} if doc else None
        if doc:
            await log("bodychart_visualizzato", c["patient_name"], user["id"], dedupe_min=10)
        return await with_meta(out(doc), user["id"]) if doc else None

    @doctor.put("/consultations/{cid}/bodychart")
    async def put_chart(cid: str, body: BodychartIn, user: dict = Depends(current_user)):
        c = await consultation(cid, user["id"])
        now = _now()
        body.markers = [m for m in body.markers if not m.proposed]  # i pin proposti da MantAI non si salvano senza conferma
        mine = {str(f["_id"]) async for f in db.files.find({"owner_id": user["id"], "consultation_id": cid, "purpose": "bodychart_photo", "is_deleted": False}, {"_id": 1})}
        for m in body.markers:  # solo foto caricate per questa visita da questo medico
            m.photos = [p for p in m.photos if p in mine]
            m.lesion_id = m.lesion_id or m.id
        used = {p for m in body.markers for p in m.photos}
        orphans = [ObjectId(p) for p in mine - used]
        if orphans:
            await db.files.update_many({"_id": {"$in": orphans}}, {"$set": {"is_deleted": True, "deleted_at": now}})
        prev = await db.bodycharts.find_one({"consultation_id": cid, "owner_id": user["id"]}, {"markers": 1})
        old = unseal_fields(prev, ("markers",)).get("markers") or [] if prev else []
        new = [m.model_dump() for m in body.markers]
        must = [ObjectId(p) for m in body.markers if is_intimate(m.view, m.x, m.y) for p in m.photos]
        if must:  # foto finite in una zona intima (es. pin spostato): sempre riservate
            r = await db.files.update_many({"_id": {"$in": must}, "reserved": {"$ne": True}}, {"$set": {"reserved": True}})
            if r.modified_count:
                await log("bodychart_foto_riservata_marcata", f"{c['patient_name']} · {r.modified_count}", user["id"])
        sealed = seal_fields({"markers": new, "strokes": [s.model_dump() for s in body.strokes], "snapshot": body.snapshot}, SEALED)
        await db.bodycharts.update_one({"consultation_id": cid, "owner_id": user["id"]},
                                       {"$set": {**sealed, "silhouette": body.silhouette, "include_in_report": body.include_in_report, "updated_at": now,
                                                 "patient_id": c.get("patient_id"), "visit_date": c["created_at"][:10]},
                                        "$setOnInsert": {"created_at": now}}, upsert=True)
        await log("bodychart_salvato", c["patient_name"], user["id"])
        for k, n in _diff(old, new).items():
            if n:
                await log(f"bodychart_{k}", f"{c['patient_name']} · {n}", user["id"])
        return await with_meta(out(await db.bodycharts.find_one({"consultation_id": cid, "owner_id": user["id"]})), user["id"])

    @doctor.put("/consultations/{cid}/bodychart/report")
    async def set_include(cid: str, body: IncludeIn, user: dict = Depends(current_user)):
        c = await consultation(cid, user["id"])
        res = await db.bodycharts.update_one({"consultation_id": cid, "owner_id": user["id"]}, {"$set": {"include_in_report": body.include, "updated_at": _now()}})
        if not res.matched_count:
            raise HTTPException(404, "Nessuna bodychart salvata per questa visita")
        await log("bodychart_nel_referto" if body.include else "bodychart_tolta_dal_referto", c["patient_name"], user["id"])
        return {"include_in_report": body.include}

    @doctor.delete("/consultations/{cid}/bodychart")
    async def del_chart(cid: str, user: dict = Depends(current_user)):
        c = await consultation(cid, user["id"])
        res = await db.bodycharts.delete_one({"consultation_id": cid, "owner_id": user["id"]})
        await db.files.update_many({"owner_id": user["id"], "consultation_id": cid, "purpose": "bodychart_photo"}, {"$set": {"is_deleted": True, "deleted_at": _now()}})
        if res.deleted_count:
            await log("bodychart_eliminato", c["patient_name"], user["id"])
        return {"deleted": res.deleted_count}

    @doctor.get("/patients/{pid}/bodycharts")
    async def history(pid: str, user: dict = Depends(current_user)):
        docs = await db.bodycharts.find({"patient_id": pid, "owner_id": user["id"]}, {"strokes": 0, "snapshot": 0}).sort("visit_date", -1).to_list(100)
        return [out(d, full=False) for d in docs]

    @doctor.get("/patients/{pid}/bodychart-lesions")
    async def lesions(pid: str, user: dict = Depends(current_user)):
        """Storia per reperto: ogni pin/lesione con i suoi passaggi visita per visita (stato, nota, misura, foto)."""
        docs = await db.bodycharts.find({"patient_id": pid, "owner_id": user["id"]}, {"strokes": 0, "snapshot": 0}).sort("visit_date", 1).to_list(100)
        acc = {}
        for d in docs:
            o = out(d, full=False)
            for m in o["markers"]:
                acc.setdefault(m["lesion_id"], []).append({**m, "visit_date": o["visit_date"], "consultation_id": o["consultation_id"], "bodychart_id": o["id"]})
        meta = await photo_meta(user["id"], {p for es in acc.values() for e in es for p in e.get("photos") or []})
        if docs:
            p = await db.patients.find_one({"_id": ObjectId(pid)}, {"name": 1}) if ObjectId.is_valid(pid) else None
            await log("bodychart_storia_visualizzata", (p or {}).get("name", "paziente"), user["id"], dedupe_min=10)
        return {"lesions": [{"lesion_id": k, "entries": v} for k, v in acc.items()], "photo_meta": meta}

    @doctor.get("/bodycharts/{bid}")
    async def one(bid: str, light: bool = False, user: dict = Depends(current_user)):
        doc = await db.bodycharts.find_one({"_id": ObjectId(bid), "owner_id": user["id"]}) if ObjectId.is_valid(bid) else None
        if not doc:
            raise HTTPException(404, "Bodychart non trovato")
        await log("bodychart_visualizzato", f"confronto visita del {doc['visit_date']}", user["id"], dedupe_min=10)
        o = await with_meta(out(doc), user["id"])
        if light:
            o.pop("snapshot", None)
        return o

    @doctor.post("/consultations/{cid}/bodychart/suggest")
    async def suggest(cid: str, user: dict = Depends(current_user)):
        """MantAI propone pin dalle sedi corporee citate nella nota: solo proposte, nulla viene salvato."""
        c = await consultation(cid, user["id"])
        note = unseal_fields(c, ("note",)).get("note") or {}
        text = "\n".join([str(v) for k, v in note.items() if isinstance(v, str) and k not in ("riepilogo", "specialita")] +
                         [f"{s.get('titolo', '')}: {s.get('testo', '')}" for s in note.get("sezioni") or []]).strip()
        if len(text) < 10 or not llm_json:
            return {"proposals": []}
        digest = hashlib.sha256(text.encode()).hexdigest()
        cache = await db.bodychart_suggestions.find_one({"consultation_id": cid, "owner_id": user["id"]}) or {}
        if cache.get("hash") == digest:
            sedi = json.loads(unseal_fields(cache, ("sedi",))["sedi"])
        else:
            vocab = "\n".join(f"- {k}: {v[0]}" for k, v in REGIONS.items())
            prompt = (f"Dal testo clinico estrai SOLO le sedi corporee esplicitamente citate con un reperto (lesione, dolore, eruzione, trauma, nevo). "
                      f"Usa unicamente questi identificativi:\n{vocab}\nCategorie ammesse: {', '.join(CAT_IDS)}. Lato destro/sinistro solo se scritto nel testo; "
                      f"se il lato non è indicato scegli il destro. Non inventare sedi.\nRispondi con JSON {{\"sedi\": [{{\"regione\": id, \"categoria\": cat, \"estratto\": breve citazione}}]}}.\n\nTESTO:\n{text[:6000]}")
            try:
                sedi = (await llm_json(prompt) or {}).get("sedi") or []
            except Exception:
                raise HTTPException(502, "MantAI non ha risposto: riprovi tra poco")
            await db.bodychart_suggestions.update_one({"consultation_id": cid, "owner_id": user["id"]},
                                                      {"$set": {"hash": digest, **seal_fields({"sedi": json.dumps(sedi)}, ("sedi",)), "at": _now()}, "$setOnInsert": {"handled": []}}, upsert=True)
            cache = await db.bodychart_suggestions.find_one({"consultation_id": cid, "owner_id": user["id"]})
            await log("bodychart_proposte_mantai", f"{c['patient_name']} · {len(sedi)}", user["id"])
        handled = set(cache.get("handled") or [])
        chart = await db.bodycharts.find_one({"consultation_id": cid, "owner_id": user["id"]}, {"markers": 1})
        existing = unseal_fields(chart, ("markers",)).get("markers") or [] if chart else []
        out_, seen = [], set()
        for s in sedi:
            r = REGIONS.get(s.get("regione"))
            if not r or s["regione"] in seen or s["regione"] in handled:
                continue
            seen.add(s["regione"])
            label, view, x, y = r
            if any(m["view"] == view and math.hypot(m["x"] - x, m["y"] - y) < 0.05 for m in existing):
                continue
            cat = s.get("categoria") if s.get("categoria") in CAT_IDS else "lesione"
            out_.append({"id": f"ai-{s['regione']}", "regione_id": s["regione"], "view": view, "x": x, "y": y, "cat": cat, "note": (s.get("estratto") or label)[:140],
                         "regione": label, "origin": "mantai", "proposed": True, "photos": [], "stato": "attivo"})
        return {"proposals": out_[:12]}

    @doctor.post("/consultations/{cid}/bodychart/suggest/{regione}/handled")
    async def suggestion_handled(cid: str, regione: str, user: dict = Depends(current_user)):
        """Proposta confermata o scartata dal medico: non viene più riproposta per questa nota."""
        c = await consultation(cid, user["id"])
        if regione not in REGIONS:
            raise HTTPException(404, "Proposta non trovata")
        await db.bodychart_suggestions.update_one({"consultation_id": cid, "owner_id": user["id"]}, {"$addToSet": {"handled": regione}}, upsert=True)
        await log("bodychart_proposta_gestita", f"{c['patient_name']} · {REGIONS[regione][0]}", user["id"])
        return {"ok": True}

    @doctor.post("/consultations/{cid}/bodychart/photos")
    async def add_photo(cid: str, file: UploadFile = File(...), view: Literal["front", "back", "left", "right", "mouth", "head", "ears", "hand_palm", "hand_back", "foot_back", "foot_sole"] = Form(...),
                        x: float = Form(..., ge=0, le=1), y: float = Form(..., ge=0, le=1),
                        conferma_necessita: bool = Form(False), conferma_consenso: bool = Form(False), user: dict = Depends(current_user)):
        """Foto reale ancorata a un pin: metadati rimossi, compressa, cifrata; zone intime marcate 'riservate' dopo doppia conferma."""
        c = await consultation(cid, user["id"])
        if (file.content_type or "") not in PHOTO_MIME:
            raise HTTPException(400, "Formato non supportato: usi JPG, PNG, WEBP o HEIC")
        intimate = is_intimate(view, x, y)
        if intimate and not (conferma_necessita and conferma_consenso):
            raise HTTPException(428, "Zona intima: confermi la necessità clinica della foto e il consenso del genitore prima di allegarla")
        data = await file.read()
        if len(data) > 12 * 1024 * 1024:
            raise HTTPException(400, "Foto troppo grande (massimo 12 MB)")
        try:
            full, thumb = await asyncio.to_thread(process_photo, data)
        except Exception:
            raise HTTPException(400, "Immagine non leggibile: riprovi con un'altra foto")
        base = f"mantmed/bodychart/{user['id']}/{cid}/{uuid.uuid4().hex}"
        try:
            res = await asyncio.to_thread(put_object, f"{base}.bin", full, "application/octet-stream")
            tres = await asyncio.to_thread(put_object, f"{base}-thumb.bin", thumb, "application/octet-stream")
        except Exception:
            raise HTTPException(503, "Caricamento non riuscito, riprovi tra qualche istante")
        now = _now()
        fid = (await db.files.insert_one({"storage_path": res["path"], "thumb_path": tres["path"], "content_type": "image/jpeg", "size": len(full), "owner_id": user["id"],
                                          "purpose": "bodychart_photo", "consultation_id": cid, "patient_id": c.get("patient_id"), "public": False,
                                          "encrypted": True, "exif_stripped": True, "reserved": intimate, "is_deleted": False, "created_at": now})).inserted_id
        await log("bodychart_foto_riservata_aggiunta" if intimate else "bodychart_foto_aggiunta", c["patient_name"], user["id"])
        return {"id": str(fid), "created_at": now, "reserved": intimate}

    @doctor.get("/bodychart-photos/{fid}")
    async def photo(fid: str, size: Literal["full", "thumb"] = "full", user: dict = Depends(current_user)):
        rec = await db.files.find_one({"_id": ObjectId(fid), "owner_id": user["id"], "purpose": "bodychart_photo", "is_deleted": False}) if ObjectId.is_valid(fid) else None
        if not rec:
            raise HTTPException(404, "Foto non trovata")
        path = rec.get("thumb_path") if size == "thumb" and rec.get("thumb_path") else rec["storage_path"]
        data, ctype = await asyncio.to_thread(get_object, path)
        if rec.get("encrypted"):
            data, ctype = open_photo(data), "image/jpeg"
        if size == "full":
            c = await db.consultations.find_one({"_id": ObjectId(rec["consultation_id"])}, {"patient_name": 1}) if ObjectId.is_valid(rec.get("consultation_id", "")) else None
            await log("bodychart_foto_visualizzata", (c or {}).get("patient_name", "paziente"), user["id"])
        return Response(content=data, media_type=rec.get("content_type") or ctype, headers={"Cache-Control": "private, no-store"})

    @parent.get("/reports/{cid}/bodychart")
    async def portal_chart(cid: str, user: dict = Depends(current_user)):
        u = await db.users.find_one({"_id": ObjectId(user["id"])})
        c = await db.consultations.find_one({"_id": ObjectId(cid)}) if ObjectId.is_valid(cid) else None
        allowed = c and any(l["patient_id"] == c.get("patient_id") and l["owner_id"] == c.get("owner_id") for l in u.get("children", []))
        doc = await db.bodycharts.find_one({"consultation_id": cid, "owner_id": c["owner_id"]}) if allowed and not c.get("guardian_hidden") and (c.get("report_sent_at") or c.get("portal_published")) else None
        if not doc:
            raise HTTPException(404, "Bodychart non disponibile")
        o = out(doc)
        return {"snapshot": o["snapshot"], "markers": [{"cat": m["cat"], "view": m["view"], "note": m["note"]} for m in o["markers"]], "visit_date": o["visit_date"], "silhouette": o["silhouette"]}

    async def migrate_photos():
        """Foto esistenti: rimuove i metadati, comprime, crea la miniatura e cifra (idempotente)."""
        n = 0
        async for f in db.files.find({"purpose": "bodychart_photo", "encrypted": {"$ne": True}, "is_deleted": False, "migration_error": {"$exists": False}}):
            try:
                raw, _ = await asyncio.to_thread(get_object, f["storage_path"])
                full, thumb = await asyncio.to_thread(process_photo, raw)
                base = f["storage_path"].rsplit(".", 1)[0]
                res = await asyncio.to_thread(put_object, f["storage_path"], full, "application/octet-stream")  # sovrascrive l'originale con EXIF
                tres = await asyncio.to_thread(put_object, f"{base}-thumb.bin", thumb, "application/octet-stream")
                chart = await db.bodycharts.find_one({"consultation_id": f.get("consultation_id"), "owner_id": f["owner_id"]}, {"markers": 1})
                pins = [m for m in (unseal_fields(chart, ("markers",)).get("markers") or [] if chart else []) if str(f["_id"]) in (m.get("photos") or [])]
                reserved = any(is_intimate(m["view"], m["x"], m["y"]) for m in pins)
                await db.files.update_one({"_id": f["_id"]}, {"$set": {"storage_path": res.get("path", f["storage_path"]), "thumb_path": tres["path"], "content_type": "image/jpeg",
                                                                      "size": len(full), "encrypted": True, "exif_stripped": True, "reserved": reserved}})
                n += 1
            except Exception:
                await db.files.update_one({"_id": f["_id"]}, {"$set": {"migration_error": "immagine non leggibile"}})
                continue
        return n

    return doctor, parent, migrate_photos
