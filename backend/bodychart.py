"""Interactive bodychart (mappa corporea) per visit: markers, freehand strokes and PNG snapshot, all sealed with AES-256-GCM."""
import base64
from datetime import datetime, timezone
from typing import Literal
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from auth import require_role
from crypto import seal_fields, unseal_fields

VIEWS = Literal["front", "back", "left", "right"]
CATS = Literal["lesione", "trauma", "dolore", "eruzione", "nevo"]
SEALED = ("markers", "strokes", "snapshot")
PNG_PREFIX = "data:image/png;base64,"
MAX_SNAPSHOT = 4_000_000


def _now():
    return datetime.now(timezone.utc).isoformat()


class Marker(BaseModel):
    id: str = Field(min_length=1, max_length=40)
    view: VIEWS
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)
    cat: CATS
    note: str = Field(default="", max_length=140)


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


def out(doc: dict, full: bool = True) -> dict:
    u = unseal_fields(doc, SEALED if full else ("markers",))
    markers = u.get("markers") or []
    o = {"id": str(doc["_id"]), "consultation_id": doc["consultation_id"], "patient_id": doc.get("patient_id"), "visit_date": doc["visit_date"],
         "silhouette": doc["silhouette"], "include_in_report": doc.get("include_in_report", False), "created_at": doc["created_at"], "updated_at": doc["updated_at"],
         "markers": markers, "counts": {c: sum(1 for m in markers if m["cat"] == c) for c in ("lesione", "trauma", "dolore", "eruzione", "nevo")}}
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


def build_bodychart(db, current_user):
    doctor = APIRouter(dependencies=[Depends(require_role(current_user, "doctor"))])
    parent = APIRouter(prefix="/portal", dependencies=[Depends(require_role(current_user, "parent"))])

    async def consultation(cid: str, owner: str) -> dict:
        c = await db.consultations.find_one({"_id": ObjectId(cid), "owner_id": owner}) if ObjectId.is_valid(cid) else None
        if not c:
            raise HTTPException(404, "Consultazione non trovata")
        return c

    @doctor.get("/consultations/{cid}/bodychart")
    async def get_chart(cid: str, user: dict = Depends(current_user)):
        await consultation(cid, user["id"])
        doc = await db.bodycharts.find_one({"consultation_id": cid, "owner_id": user["id"]})
        return out(doc) if doc else None

    @doctor.put("/consultations/{cid}/bodychart")
    async def put_chart(cid: str, body: BodychartIn, user: dict = Depends(current_user)):
        c = await consultation(cid, user["id"])
        now = _now()
        sealed = seal_fields({"markers": [m.model_dump() for m in body.markers], "strokes": [s.model_dump() for s in body.strokes], "snapshot": body.snapshot}, SEALED)
        await db.bodycharts.update_one({"consultation_id": cid, "owner_id": user["id"]},
                                       {"$set": {**sealed, "silhouette": body.silhouette, "include_in_report": body.include_in_report, "updated_at": now,
                                                 "patient_id": c.get("patient_id"), "visit_date": c["created_at"][:10]},
                                        "$setOnInsert": {"created_at": now}}, upsert=True)
        await db.audit.insert_one({"action": "bodychart_salvato", "subject": seal_fields({"s": c["patient_name"]}, ("s",))["s"], "at": now, "owner_id": user["id"]})
        return out(await db.bodycharts.find_one({"consultation_id": cid, "owner_id": user["id"]}))

    @doctor.delete("/consultations/{cid}/bodychart")
    async def del_chart(cid: str, user: dict = Depends(current_user)):
        await consultation(cid, user["id"])
        res = await db.bodycharts.delete_one({"consultation_id": cid, "owner_id": user["id"]})
        return {"deleted": res.deleted_count}

    @doctor.get("/patients/{pid}/bodycharts")
    async def history(pid: str, user: dict = Depends(current_user)):
        docs = await db.bodycharts.find({"patient_id": pid, "owner_id": user["id"]}, {"strokes": 0, "snapshot": 0}).sort("visit_date", -1).to_list(100)
        return [out(d, full=False) for d in docs]

    @doctor.get("/bodycharts/{bid}")
    async def one(bid: str, user: dict = Depends(current_user)):
        doc = await db.bodycharts.find_one({"_id": ObjectId(bid), "owner_id": user["id"]}) if ObjectId.is_valid(bid) else None
        if not doc:
            raise HTTPException(404, "Bodychart non trovato")
        return out(doc)

    @parent.get("/reports/{cid}/bodychart")
    async def portal_chart(cid: str, user: dict = Depends(current_user)):
        u = await db.users.find_one({"_id": ObjectId(user["id"])})
        c = await db.consultations.find_one({"_id": ObjectId(cid)}) if ObjectId.is_valid(cid) else None
        allowed = c and any(l["patient_id"] == c.get("patient_id") and l["owner_id"] == c.get("owner_id") for l in u.get("children", []))
        doc = await db.bodycharts.find_one({"consultation_id": cid, "owner_id": c["owner_id"]}) if allowed and (c.get("report_sent_at") or c.get("portal_published")) else None
        if not doc:
            raise HTTPException(404, "Bodychart non disponibile")
        o = out(doc)
        return {"snapshot": o["snapshot"], "markers": [{"cat": m["cat"], "view": m["view"], "note": m["note"]} for m in o["markers"]], "visit_date": o["visit_date"], "silhouette": o["silhouette"]}

    return doctor, parent
