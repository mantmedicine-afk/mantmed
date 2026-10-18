from datetime import datetime, timezone, timedelta
from typing import Literal, Optional
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from crypto import seal_fields, unseal_fields

MANUAL_REPORT_MIN = 12
REVIEW_CAP_SEC = 20 * 60
AREAS = {
    "trascrizione": "Trascrizione Ambientale / Wispr Flow",
    "pdf": "Generazione PDF",
    "agenda": "Agenda Multi-Studio",
    "cassa": "Cassa",
    "altro": "Altro",
}
Area = Literal["trascrizione", "pdf", "agenda", "cassa", "altro"]


class FeedbackIn(BaseModel):
    rating: int = Field(ge=1, le=5)
    area: Area
    text: str = Field(default="", max_length=4000)


def _now():
    return datetime.now(timezone.utc)


def app_seconds(c: dict) -> float:
    review = 0.0
    if c.get("finalized_at"):
        review = (datetime.fromisoformat(c["finalized_at"]) - datetime.fromisoformat(c["created_at"])).total_seconds()
    return float(c.get("ai_sec") or 0) + min(max(review, 0.0), REVIEW_CAP_SEC)


def report_stats(cons: list) -> dict:
    timed = [c for c in cons if c.get("ai_sec")]
    saved = [max(0.0, MANUAL_REPORT_MIN * 60 - app_seconds(c)) for c in timed]
    n = len(timed)
    return {
        "reports": len(cons),
        "timed_reports": n,
        "pdf_exports": sum(int(c.get("pdf_exports") or 0) for c in cons),
        "avg_app_min": round(sum(app_seconds(c) for c in timed) / n / 60, 1) if n else 0,
        "avg_saved_min": round(sum(saved) / n / 60, 1) if n else 0,
        "total_saved_min": round(sum(saved) / 60),
    }


def feedback_stats(items: list) -> dict:
    n = len(items)
    return {"feedback": n, "avg_rating": round(sum(f["rating"] for f in items) / n, 1) if n else 0}


def build_beta(db, current_user):
    router = APIRouter(prefix="/beta")

    @router.post("/feedback")
    async def send_feedback(body: FeedbackIn, user: dict = Depends(current_user)):
        doc = {"doctor_id": user["id"], "doctor_name": user["name"], "rating": body.rating, "area": body.area,
               "text": body.text.strip(), "created_at": _now().isoformat()}
        res = await db.feedback.insert_one(seal_fields(dict(doc), ("text",)))
        return {"id": str(res.inserted_id), **doc}

    @router.get("/metrics")
    async def metrics(user: dict = Depends(current_user)):
        cons = await db.consultations.find({}, {"doctor_id": 1, "ai_sec": 1, "created_at": 1, "finalized_at": 1, "pdf_exports": 1}).to_list(10000)
        fbs = [unseal_fields(f, ("text",)) for f in await db.feedback.find().sort("created_at", -1).to_list(5000)]
        mine_c = [c for c in cons if c.get("doctor_id") == user["id"]]
        mine_f = [f for f in fbs if f["doctor_id"] == user["id"]]
        today = _now().date()
        days = [(today - timedelta(days=i)).isoformat() for i in range(13, -1, -1)]
        by_day = {d: 0 for d in days}
        for c in cons:
            if c["created_at"][:10] in by_day:
                by_day[c["created_at"][:10]] += 1
        by_area = [{"area": k, "label": v, "count": sum(1 for f in fbs if f["area"] == k),
                    "avg_rating": round(sum(f["rating"] for f in fbs if f["area"] == k) / max(1, sum(1 for f in fbs if f["area"] == k)), 1)}
                   for k, v in AREAS.items()]
        return {
            "baseline_min": MANUAL_REPORT_MIN,
            "mine": {**report_stats(mine_c), **feedback_stats(mine_f)},
            "all": {**report_stats(cons), **feedback_stats(fbs), "testers": len({f["doctor_id"] for f in fbs} | {c["doctor_id"] for c in cons if c.get("doctor_id")})},
            "daily": [{"date": d, "count": by_day[d]} for d in days],
            "by_area": by_area,
            "recent": [{"id": str(f["_id"]), "doctor_name": f["doctor_name"], "rating": f["rating"], "area": f["area"],
                        "area_label": AREAS[f["area"]], "text": f.get("text") or "", "created_at": f["created_at"], "mine": f["doctor_id"] == user["id"]}
                       for f in fbs[:8]],
        }

    return router
