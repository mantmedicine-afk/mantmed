"""Passaggio 6: migrazioni dei passaggi 4-5 da eseguire in produzione dall'area amministratore, DOPO il backup.
Tutte idempotenti; prima della conversione l'app funziona come prima (regole legacy)."""
import re
from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from access_rules import active_grants, is_adult, relation_for, sync_links
from clinics import clinics_of, ensure_letterhead_base
from crypto import seal_fields, unseal_fields
from scheduling import services_of

_norm = lambda s: " ".join(re.sub(r"^[^:]{1,20}:\s*", "", s or "").lower().split())


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _own_email_patients(db) -> list:
    out = []
    async for p in db.patients.find({}):
        s = unseal_fields(p, ("guardian", "guardian_email", "patient_email"))
        if is_adult(p) and not (s.get("patient_email") or "").strip() and (s.get("guardian_email") or "").strip() and _norm(s.get("guardian")) in ("", _norm(p["name"])):
            out.append((p, s["guardian_email"].strip().lower()))
    return out


async def preview(db) -> dict:
    users = await db.users.find({"role": {"$in": ["parent", "patient"]}}).to_list(10000)
    own = await _own_email_patients(db)
    own_ids = {str(p["_id"]): e for p, e in own}
    rows = []
    for u in users:
        grants = await active_grants(db, email=u["email"])
        for c in u.get("children", []):
            p = await db.patients.find_one({"_id": ObjectId(c["patient_id"])}) if ObjectId.is_valid(c["patient_id"]) else None
            if not p:
                continue
            if c["patient_id"] in own_ids:
                p = {**p, **seal_fields({"patient_email": own_ids[c["patient_id"]]}, ("patient_email",))}
            rel = relation_for(u["email"], p, grants)
            rows.append({"account": u["email"].split("@")[0][:3] + "…@" + u["email"].split("@")[-1], "patient": p["name"][:1] + ".", "adult": is_adult(p),
                         "relation": rel or "accesso chiuso"})
    doctors = await db.users.count_documents({"role": "doctor"})
    return {"flags": {k: bool(await db.meta.find_one({"_id": k})) for k in ("access_rules_v2", "clinics_v1", "service_ids_v1")},
            "portal_accounts": len(users), "still_parent": sum(u["role"] == "parent" for u in users), "own_email_moves": len(own),
            "links": rows, "closing": sum(r["relation"] == "accesso chiuso" for r in rows), "doctors": doctors}


async def apply(db, who: str) -> dict:
    done = {}
    if not await db.meta.find_one({"_id": "clinics_v1"}):
        async for u in db.users.find({"role": "doctor"}):
            await ensure_letterhead_base(db, u)
        await db.meta.insert_one({"_id": "clinics_v1", "at": _now(), "by": who})
        done["studi"] = True
    if not await db.meta.find_one({"_id": "service_ids_v1"}):
        async for u in db.users.find({"role": "doctor"}):
            services = services_of(u)
            by_name = {s["name"]: s["id"] for s in services}
            upd = {"clinics": [{**c, "prices": {by_name.get(k, k): v for k, v in (c.get("prices") or {}).items()}} for c in clinics_of(u)]}
            if (u.get("schedule") or {}).get("services"):
                upd["schedule.services"] = services
            await db.users.update_one({"_id": u["_id"]}, {"$set": upd})
        await db.meta.insert_one({"_id": "service_ids_v1", "at": _now(), "by": who})
        done["listini"] = True
    if not await db.meta.find_one({"_id": "access_rules_v2"}):
        for p, e in await _own_email_patients(db):
            await db.patients.update_one({"_id": p["_id"]}, {"$set": seal_fields({"patient_email": e, "guardian_email": "", "guardian": ""}, ("patient_email", "guardian_email", "guardian"))})
        res = await db.users.update_many({"role": "parent"}, {"$set": {"role": "patient", "converted_from_parent_at": _now()}})
        await db.meta.insert_one({"_id": "access_rules_v2", "at": _now(), "by": who})
        for u in await db.users.find({"role": "patient"}).to_list(10000):
            await sync_links(db, u)
        await db.audit.insert_one({"action": "conversione_account_portale", "subject": "", "at": _now(), "converted": res.modified_count, "by": who})
        done["account"] = res.modified_count
    return done


class ApplyIn(BaseModel):
    backup_done: bool


def build_migrations(db, admin_dep):
    r = APIRouter(prefix="/admin/migrations", dependencies=[Depends(admin_dep)])

    @r.get("")
    async def get_preview():
        return await preview(db)

    @r.post("/apply")
    async def do_apply(body: ApplyIn, user: dict = Depends(admin_dep)):
        if not body.backup_done:
            raise HTTPException(400, "Confermi di aver scaricato il backup del database di produzione")
        return {"done": await apply(db, user["email"]), "after": await preview(db)}

    return r
