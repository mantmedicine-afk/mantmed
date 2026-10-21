"""Questionario pre-visita: i genitori compilano dal Portale il check-point per età; la pediatra lo ritrova nel bilancio."""
from datetime import datetime, timedelta, timezone
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from checkpoints import BANDS, band_for, evaluate
from crypto import seal_fields, unseal_fields
from growth import age_months

VALID_DAYS = 30


class PortalCheckpointIn(BaseModel):
    patient_id: str
    answers: dict


def answers_text(band_id: str, answers: dict) -> list:
    band = next((b for b in BANDS if b["id"] == band_id), None)
    rows = []
    for q in (band or {}).get("questions", []):
        opt = next((o for o in q["options"] if o["value"] == answers.get(q["id"])), None)
        if opt:
            rows.append({"area": q["area"], "question": q["text"], "answer": opt["label"], "ok": opt["ok"]})
    return rows


async def latest_previsit(db, pid: Optional[str], owner: str) -> Optional[dict]:
    """Ultimo questionario (genitori o studio) degli ultimi 30 giorni, pronto per IA e cartella."""
    if not pid:
        return None
    since = (datetime.now(timezone.utc) - timedelta(days=VALID_DAYS)).isoformat()
    k = await db.checkpoints.find_one({"patient_id": pid, "owner_id": owner, "created_at": {"$gte": since}}, sort=[("created_at", -1)])
    if not k:
        return None
    k = unseal_fields(k, ("answers", "result"))
    res = k.get("result") or {}
    return {"checkpoint_id": str(k["_id"]), "band_label": k["band_label"], "created_at": k["created_at"], "source": k.get("source") or "studio",
            "status": res.get("status", ""), "score": res.get("score"), "flags": res.get("flags") or [],
            "answers": answers_text(k["band_id"], k.get("answers") or {})}


def previsit_prompt(pv: dict) -> str:
    who = "dai genitori dal Portale" if pv["source"] == "portale" else "in studio"
    lines = "\n".join(f"- [{a['area']}] {a['question']} → {a['answer']}" for a in pv["answers"])
    return (f"\n\nQuestionario pre-visita compilato {who} il {pv['created_at'][:10]} (fascia {pv['band_label']}):\n{lines}\n"
            "Usa queste risposte per compilare i campi pertinenti del modello (es. sonno, alimentazione, sviluppo, schermi, scuola) "
            "aggiungendo '(riferito dai genitori)'; se la visita le contraddice, prevale quanto emerso in visita.")


def build_previsit(db, parent_user, notify_doctor):
    r = APIRouter(prefix="/portal")

    async def linked(user: dict, pid: str) -> dict:
        u = await db.users.find_one({"_id": ObjectId(user["id"])}, {"children": 1})
        link = next((c for c in (u or {}).get("children") or [] if c["patient_id"] == pid), None)
        p = await db.patients.find_one({"_id": ObjectId(pid), "owner_id": link["owner_id"]}) if link and ObjectId.is_valid(pid) else None
        if not p:
            raise HTTPException(404, "Paziente non trovato")
        return p

    @r.get("/checkpoint")
    async def template(patient_id: str, user: dict = Depends(parent_user)):
        p = await linked(user, patient_id)
        last = await latest_previsit(db, patient_id, p["owner_id"])
        return {**band_for(age_months(p["birth_date"])), "last": last and {k: last[k] for k in ("created_at", "source", "band_label", "status")}}

    @r.post("/checkpoints")
    async def submit(body: PortalCheckpointIn, user: dict = Depends(parent_user)):
        p = await linked(user, body.patient_id)
        months = age_months(p["birth_date"])
        band = band_for(months)
        answers = {q["id"]: body.answers[q["id"]] for q in band["questions"] if q["id"] in body.answers}
        if len(answers) < len(band["questions"]):
            raise HTTPException(400, "Risponda a tutte le domande del questionario")
        result = {**evaluate(band, answers), "next": band["next"]}
        doc = {"patient_id": body.patient_id, "owner_id": p["owner_id"], "band_id": band["id"], "band_label": band["label"], "age_months": round(months, 1),
               "clinic": "", "answers": answers, "result": result, "source": "portale", "parent_id": user["id"],
               "created_at": datetime.now(timezone.utc).isoformat()}
        res = await db.checkpoints.insert_one(seal_fields(dict(doc), ("answers", "result")))
        await notify_doctor(db, p["owner_id"], "messages", f"MantMed · questionario pre-visita di {p['name']}",
                            f"<p>I genitori di <strong>{p['name']}</strong> hanno compilato il questionario pre-visita ({band['label']}). "
                            "Verrà usato per precompilare il prossimo bilancio di salute.</p>")
        return {"id": str(res.inserted_id), "band_label": band["label"], "created_at": doc["created_at"], "result": result}

    return r
