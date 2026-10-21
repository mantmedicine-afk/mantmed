"""Founder-only purge of test consultations (demo accounts + TEST-named patients)."""
import os
from bson import ObjectId
from fastapi import APIRouter, Depends
from pydantic import BaseModel

TEST_NAME = {"$regex": r"(^TEST_|\btest\b|\bprova\b)", "$options": "i"}


class PurgeIn(BaseModel):
    owner_ids: list[str] = []


def build_cleanup(db, admin_user):
    r = APIRouter(prefix="/admin/test-data", dependencies=[Depends(admin_user)])

    async def demo_accounts():
        main = os.environ["DOCTOR_EMAIL"].strip().lower()
        q = {"role": "doctor", "$or": [{"email": main}, {"email": {"$regex": r"@example\.com$"}}]}
        return [{"id": str(u["_id"]), "email": u["email"]} async for u in db.users.find(q, {"email": 1})]

    async def plan(owner_ids):
        cq = {"$or": [{"patient_name": TEST_NAME}, *([{"owner_id": {"$in": owner_ids}}] if owner_ids else [])]}
        cons = await db.consultations.find(cq, {"_id": 1}).to_list(None)
        cids = [str(c["_id"]) for c in cons]
        pq = {"name": TEST_NAME}
        pids = [str(p["_id"]) async for p in db.patients.find(pq, {"_id": 1})]
        keep = set(await db.consultations.distinct("patient_id", {"patient_id": {"$in": pids}, "_id": {"$nin": [c["_id"] for c in cons]}}))
        pids = [p for p in pids if p not in keep]
        aq = {"$or": [{"patient_id": {"$in": pids}}, {"patient_name": TEST_NAME}]}
        return cons, cids, pids, aq

    @r.get("")
    async def preview():
        accounts = await demo_accounts()
        ids = [a["id"] for a in accounts]
        for a in accounts:
            a["consultations"] = await db.consultations.count_documents({"owner_id": a["id"]})
        _, cids, pids, aq = await plan([])
        return {"accounts": accounts, "test_named": len(cids), "patients": len(pids),
                "appointments": await db.appointments.count_documents(aq), "all_ids": ids}

    @r.post("/purge")
    async def purge(body: PurgeIn):
        allowed = {a["id"] for a in await demo_accounts()}
        owner_ids = [o for o in body.owner_ids if o in allowed]
        cons, cids, pids, aq = await plan(owner_ids)
        for f in await db["consult_audio.files"].find({"metadata.consultation_id": {"$in": cids}}, {"_id": 1}).to_list(None):
            await db["consult_audio.chunks"].delete_many({"files_id": f["_id"]})
            await db["consult_audio.files"].delete_one({"_id": f["_id"]})
        by_c = {"consultation_id": {"$in": cids}}
        by_p = {"patient_id": {"$in": pids}}
        await db.consult_jobs.delete_many(by_c)
        await db.bodycharts.delete_many({"$or": [by_c, by_p]})
        await db.measurements.delete_many({"$or": [by_c, by_p]})
        await db.notifications.delete_many({"$or": [{"ref": {"$in": cids}}, by_p]})
        appts = (await db.appointments.delete_many(aq)).deleted_count
        await db.waiting.delete_many({"$or": [by_p, {"name": TEST_NAME}]})
        await db.consents.delete_many(by_p)
        visits = (await db.consultations.delete_many({"_id": {"$in": [c["_id"] for c in cons]}})).deleted_count
        pats = (await db.patients.delete_many({"_id": {"$in": [ObjectId(p) for p in pids]}})).deleted_count
        return {"consultations": visits, "patients": pats, "appointments": appts}

    return r
