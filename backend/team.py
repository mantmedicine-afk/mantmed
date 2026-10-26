"""Medicina di squadra: deleghe individuali del genitore a specialisti della rete, vista condivisa, note di squadra e registro accessi."""
import asyncio
import logging
from datetime import datetime, timezone, timedelta
from html import escape as hesc
from typing import Optional
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field
from auth import require_role
from crypto import seal_fields, unseal_fields
import provenance as prov
from account import notify_doctor
from messaging import notify_parents
from registration import cf_valid, in_network
from tenancy import cf_hash

logger = logging.getLogger(__name__)
TEAM_VERSION = "Delega Medicina di Squadra v1.0"
REQUEST_COOLDOWN_H = 24
TEAM_TEXT = ("Autorizzo lo specialista indicato della rete MantMed a consultare la cartella condivisa di mio figlio/a: referti, visite, bilanci di salute, "
             "ultime misure di crescita e note di squadra degli altri specialisti che lo/la seguono, e ad aggiungere note di squadra. "
             "Ogni accesso viene registrato e posso revocare la delega in qualsiasi momento dal Portale Paziente. "
             "[Testo da validare con il proprio consulente privacy/DPO]")


def _now():
    return datetime.now(timezone.utc).isoformat()


class SearchIn(BaseModel):
    fiscal_code: str = Field(min_length=16, max_length=16)


class RequestIn(BaseModel):
    reason: str = Field(default="", max_length=500)


class NoteIn(BaseModel):
    text: str = Field(min_length=3, max_length=2000)


class GrantIn(BaseModel):
    group: str
    doctor_id: str
    signer_name: str = Field(min_length=3, max_length=100)
    signature: str = Field(min_length=30, max_length=400_000)
    accepted: bool


def build_team(db, current_user, Consultation, pdf_for):
    doctor = APIRouter(prefix="/team")
    parent = APIRouter(prefix="/portal/team", dependencies=[Depends(require_role(current_user, "parent"))])

    async def migrate():
        async for s in db.share_consents.find({"revoked_at": None, "team_migrated": {"$ne": True}}):
            for m in s["members"]:
                q = {"cf_hash": s["cf_hash"], "parent_id": s["parent_id"], "grantee_id": m["owner_id"], "status": "active"}
                await db.team_grants.update_one(q, {"$setOnInsert": {**q, "requested_at": None, "granted_at": s["signed_at"], "revoked_at": None,
                                                                    "version": s["version"], "migrated_from": str(s["_id"])}}, upsert=True)
            await db.share_consents.update_one({"_id": s["_id"]}, {"$set": {"revoked_at": _now(), "team_migrated": True, "superseded": True}})
        await db.team_grants.create_index([("cf_hash", 1), ("grantee_id", 1), ("status", 1)])

    async def cf_pairs(cf: str) -> set:
        return {(str(p["_id"]), p["owner_id"]) async for p in db.patients.find({"cf_hash": cf}, {"owner_id": 1})}

    async def parents_with(cf: str) -> list:
        pairs = await cf_pairs(cf)
        if not pairs:
            return []
        out = []
        async for u in db.users.find({"role": "parent", "children.patient_id": {"$in": [p for p, _ in pairs]}}):
            members = [(c["patient_id"], c["owner_id"]) for c in u.get("children", []) if (c["patient_id"], c["owner_id"]) in pairs]
            if members:
                out.append((u, members))
        return out

    async def doc_info(uid: str) -> dict:
        d = await db.users.find_one({"_id": ObjectId(uid)}) if ObjectId.is_valid(uid) else None
        return {"id": uid, "name": (d or {}).get("name", ""), "specialty": ((d or {}).get("profile") or {}).get("specialty") or "Pediatria"}

    async def log_access(cf: str, user: dict, action: str, owners):
        now = _now()
        info = await doc_info(user["id"])
        await db.team_access_log.insert_one({"cf_hash": cf, "doctor_id": user["id"], "doctor_name": info["name"], "specialty": info["specialty"], "action": action, "at": now})
        for o in set(owners) - {user["id"]}:
            await db.audit.insert_one({"action": f"medicina_squadra_{action}", "subject": seal_fields({"s": info["name"]}, ("s",))["s"], "at": now, "owner_id": o})

    async def active_grants(cf: str, me: str) -> list:
        return await db.team_grants.find({"cf_hash": cf, "grantee_id": me, "status": "active"}).to_list(20)

    async def team_members(cf: str, grants: list) -> list:
        parents = {g["parent_id"] for g in grants}
        return list({m for u, ms in await parents_with(cf) if str(u["_id"]) in parents for m in ms})

    async def member_view(pid: str, owner: str) -> dict:
        reports, name = [], ""
        async for c in db.consultations.find({"patient_id": pid, "owner_id": owner}).sort("created_at", -1).limit(30):
            out = Consultation.from_mongo(c).out()
            note = out.get("note") or {}
            name = name or out.get("patient_name", "")
            reports.append({"id": str(c["_id"]), "created_at": c["created_at"], "clinic": c.get("clinic", ""), "motivo": note.get("motivo_visita", ""),
                            "diagnosi": note.get("diagnosi", ""), "terapia": note.get("terapia", ""), "status": c.get("status", ""),
                            "ai_provenance": await prov.present(db, {k: v for k, v in (c.get("ai_provenance") or {}).items() if k != "parti"})})
        checkpoints = []
        async for k in db.checkpoints.find({"patient_id": pid, "owner_id": owner}).sort("created_at", -1).limit(20):
            res = unseal_fields(k, ("result",)).get("result") or {}
            checkpoints.append({"id": str(k["_id"]), "band_label": k["band_label"], "created_at": k["created_at"], "status": res.get("status", "")})
        mm = await db.measurements.find_one({"patient_id": pid, "owner_id": owner}, sort=[("date", -1)])
        growth = {k: unseal_fields(mm, ("weight", "height", "hc")).get(k) for k in ("date", "weight", "height", "hc")} if mm else None
        return {"doctor": await doc_info(owner), "reports": reports, "checkpoints": checkpoints, "growth": growth, "patient_name": name}

    async def notes_of(cf: str) -> list:
        out = []
        async for n in db.team_notes.find({"cf_hash": cf}).sort("created_at", -1).limit(100):
            out.append({"id": str(n["_id"]), "author": n["author_name"], "specialty": n["specialty"], "author_id": n["author_id"], "created_at": n["created_at"],
                        "text": unseal_fields(n, ("text",))["text"]})
        return out

    async def state(cf: str, user: dict) -> dict:
        me = user["id"]
        grants = await active_grants(cf, me)
        parents = await parents_with(cf)
        owners = {o for _, ms in parents for _, o in ms} | {o for _, o in await cf_pairs(cf)} | set(await db.team_grants.distinct("grantee_id", {"cf_hash": cf, "status": "active"}))
        base = {"ref": cf, "followers": len(owners - {me}), "parent_linked": bool(parents)}
        if not grants:
            pending = await db.team_grants.find_one({"cf_hash": cf, "grantee_id": me, "status": "pending"})
            denied = await db.team_grants.find_one({"cf_hash": cf, "grantee_id": me, "status": {"$in": ["denied", "revoked"]}}, sort=[("updated_at", -1)])
            return {**base, "status": "pending" if pending else "none", "requested_at": (pending or {}).get("requested_at"),
                    "last_closed": {"status": denied["status"], "at": denied.get("updated_at")} if denied and not pending else None}
        members = [m for m in await team_members(cf, grants) if m[1] != me]
        specialists = [await member_view(p, o) for p, o in members]
        name = next((s["patient_name"] for s in specialists if s["patient_name"]), "")
        await log_access(cf, user, "consultazione", [o for _, o in members])
        return {**base, "status": "active", "granted_at": max(g["granted_at"] for g in grants), "version": grants[0].get("version", TEAM_VERSION),
                "patient_name": name, "specialists": specialists, "notes": await notes_of(cf)}

    # ---------- Medico ----------
    @doctor.get("/patients/{pid}")
    async def for_patient(pid: str, user: dict = Depends(current_user)):
        p = await db.patients.find_one({"_id": ObjectId(pid), "owner_id": user["id"]}) if ObjectId.is_valid(pid) else None
        if not p:
            raise HTTPException(404, "Paziente non trovato")
        if not p.get("cf_hash"):
            return {"status": "no_cf"}
        return await state(p["cf_hash"], user)

    @doctor.post("/search")
    async def search(body: SearchIn, user: dict = Depends(current_user)):
        cf = body.fiscal_code.strip().upper()
        if not cf_valid(cf):
            raise HTTPException(422, "Codice fiscale non valido")
        h = cf_hash(cf)
        others = [o for _, o in await cf_pairs(h) if o != user["id"]]
        if not others:
            return {"status": "not_found"}
        return await state(h, user)

    @doctor.get("/view/{ref}")
    async def view(ref: str, user: dict = Depends(current_user)):
        if not await cf_pairs(ref):
            raise HTTPException(404, "Cartella non trovata")
        return await state(ref, user)

    @doctor.post("/view/{ref}/request")
    async def request_access(ref: str, body: RequestIn, user: dict = Depends(current_user)):
        if await active_grants(ref, user["id"]):
            raise HTTPException(400, "La delega è già attiva")
        parents = await parents_with(ref)
        if not parents:
            raise HTTPException(400, "Nessun genitore ha ancora collegato questa cartella al Portale Paziente: non è possibile inviare la richiesta")
        pending = await db.team_grants.find_one({"cf_hash": ref, "grantee_id": user["id"], "status": "pending"})
        if pending:
            return {"status": "pending", "requested_at": pending.get("requested_at")}
        since = (datetime.now(timezone.utc) - timedelta(hours=REQUEST_COOLDOWN_H)).isoformat()
        if await db.team_grants.find_one({"cf_hash": ref, "grantee_id": user["id"], "status": {"$in": ["denied", "revoked"]}, "updated_at": {"$gte": since}}):
            raise HTTPException(429, f"Il genitore ha chiuso la delega di recente: potrà inviare una nuova richiesta dopo {REQUEST_COOLDOWN_H} ore")
        info = await doc_info(user["id"])
        now = _now()
        for u, ms in parents:
            q = {"cf_hash": ref, "parent_id": str(u["_id"]), "grantee_id": user["id"], "status": "pending"}
            await db.team_grants.update_one(q, {"$set": {"requested_at": now, "updated_at": now, **seal_fields({"reason": body.reason.strip()}, ("reason",))},
                                                "$setOnInsert": {"granted_at": None, "revoked_at": None, "version": TEAM_VERSION}}, upsert=True)
            await notify_parents(db, ms[0][0], ms[0][1], "team", f"Richiesta di accesso da {info['name']}",
                                 f"{info['name']} ({info['specialty']}) chiede di consultare la cartella condivisa. Può autorizzare o rifiutare in Area Riservata › Condivisione.",
                                 ref=ref, only=str(u["_id"]))
        await log_access(ref, user, "richiesta", [o for _, ms in parents for _, o in ms])
        return {"status": "pending", "requested_at": now}

    @doctor.post("/view/{ref}/notes")
    async def add_note(ref: str, body: NoteIn, user: dict = Depends(current_user)):
        if not await active_grants(ref, user["id"]):
            raise HTTPException(403, "Serve una delega attiva del genitore")
        info = await doc_info(user["id"])
        doc = {"cf_hash": ref, "author_id": user["id"], "author_name": info["name"], "specialty": info["specialty"], "created_at": _now(),
               **seal_fields({"text": body.text.strip()}, ("text",))}
        doc["_id"] = (await db.team_notes.insert_one(doc)).inserted_id
        await log_access(ref, user, "nota", [o for _, o in await cf_pairs(ref)])
        return {"id": str(doc["_id"]), "author": info["name"], "specialty": info["specialty"], "author_id": user["id"], "created_at": doc["created_at"], "text": body.text.strip()}

    @doctor.get("/view/{ref}/reports/{cid}/pdf")
    async def report_pdf(ref: str, cid: str, user: dict = Depends(current_user)):
        grants = await active_grants(ref, user["id"])
        c = await db.consultations.find_one({"_id": ObjectId(cid)}) if ObjectId.is_valid(cid) else None
        if not grants or not c or (c.get("patient_id"), c.get("owner_id")) not in set(await team_members(ref, grants)) or c["owner_id"] == user["id"]:
            raise HTTPException(404, "Referto non disponibile")
        pdf, name = await pdf_for(c)
        await log_access(ref, user, "referto_pdf", [c["owner_id"]])
        return Response(pdf, media_type="application/pdf", headers={"Content-Disposition": f"attachment; filename=\"{name}\""})

    # ---------- Genitore ----------
    async def my_groups(user: dict) -> dict:
        u = await db.users.find_one({"_id": ObjectId(user["id"])})
        groups = {}
        for c in u.get("children", []):
            p = await db.patients.find_one({"_id": ObjectId(c["patient_id"]), "owner_id": c["owner_id"]}, {"cf_hash": 1})
            if p and p.get("cf_hash"):
                groups.setdefault(p["cf_hash"], []).append(c["owner_id"])
        return groups

    async def grant_out(g: dict) -> dict:
        return {"id": str(g["_id"]), "status": g["status"], "doctor": await doc_info(g["grantee_id"]), "requested_at": g.get("requested_at"),
                "granted_at": g.get("granted_at"), "revoked_at": g.get("revoked_at"), "updated_at": g.get("updated_at"),
                "reason": unseal_fields(g, ("reason",)).get("reason") or "" if g.get("reason") else "", "migrated": bool(g.get("migrated_from"))}

    @parent.get("")
    async def overview(user: dict = Depends(current_user)):
        out = []
        for cf, owners in (await my_groups(user)).items():
            grants = [await grant_out(g) async for g in db.team_grants.find({"cf_hash": cf, "parent_id": user["id"]}).sort([("updated_at", -1), ("granted_at", -1)])]
            log = [{k: x.get(k) for k in ("doctor_name", "specialty", "action", "at")} async for x in db.team_access_log.find({"cf_hash": cf}).sort("at", -1).limit(40)]
            out.append({"group": cf, "followers": [await doc_info(o) for o in dict.fromkeys(owners)], "grants": grants, "log": log})
        network = [{"id": str(d["_id"]), "name": d["name"], "specialty": (d.get("profile") or {}).get("specialty") or "Pediatria"}
                   async for d in db.users.find({"role": "doctor", "status": "active"}) if in_network(d)]
        return {"groups": out, "network": network, "text": TEAM_TEXT, "version": TEAM_VERSION}

    @parent.post("/grants")
    async def grant(body: GrantIn, user: dict = Depends(current_user)):
        if not body.accepted:
            raise HTTPException(400, "Serve il consenso esplicito")
        if not body.signature.startswith("data:image/png;base64,"):
            raise HTTPException(400, "Manca la firma")
        groups = await my_groups(user)
        if body.group not in groups:
            raise HTTPException(404, "Cartella non collegata al suo account")
        d = await db.users.find_one({"_id": ObjectId(body.doctor_id), "role": "doctor", "status": "active"}) if ObjectId.is_valid(body.doctor_id) else None
        q = {"cf_hash": body.group, "parent_id": user["id"], "grantee_id": body.doctor_id}
        if await db.team_grants.find_one({**q, "status": "active"}):
            raise HTTPException(400, "Lo specialista ha già una delega attiva")
        if not d or not (in_network(d) or body.doctor_id in groups[body.group] or await db.team_grants.find_one(q)):
            raise HTTPException(404, "Specialista non disponibile nella rete MantMed")
        now = _now()
        signed = {"status": "active", "granted_at": now, "updated_at": now, "revoked_at": None, "version": TEAM_VERSION,
                  **seal_fields({"signer_name": body.signer_name.strip(), "signature": body.signature, "text": TEAM_TEXT}, ("signer_name", "signature", "text"))}
        res = await db.team_grants.find_one_and_update({**q, "status": "pending"}, {"$set": signed})
        if not res:
            await db.team_grants.insert_one({**q, **signed, "requested_at": None})
        for o in set(groups[body.group]) | {body.doctor_id}:
            await db.audit.insert_one({"action": "medicina_squadra_delega_firmata", "subject": seal_fields({"s": d["name"]}, ("s",))["s"], "at": now, "owner_id": o})
        asyncio.create_task(notify_doctor(db, body.doctor_id, "messages", "MantMed · Delega Medicina di Squadra attiva",
                                          f"<p>Un genitore ha autorizzato {hesc(d['name'])} a consultare la cartella condivisa di un paziente della rete.</p>"))
        return {"status": "active", "granted_at": now}

    async def close(gid: str, user: dict, frm: str, to: str):
        g = await db.team_grants.find_one({"_id": ObjectId(gid), "parent_id": user["id"], "status": frm}) if ObjectId.is_valid(gid) else None
        if not g:
            raise HTTPException(404, "Delega non trovata o già chiusa")
        now = _now()
        await db.team_grants.update_one({"_id": g["_id"]}, {"$set": {"status": to, "updated_at": now, **({"revoked_at": now} if to == "revoked" else {})}})
        owners = (await my_groups(user)).get(g["cf_hash"], [])
        for o in set(owners) | {g["grantee_id"]}:
            await db.audit.insert_one({"action": f"medicina_squadra_delega_{'revocata' if to == 'revoked' else 'rifiutata'}", "subject": None, "at": now, "owner_id": o})
        return {"status": to}

    @parent.post("/grants/{gid}/revoke")
    async def revoke(gid: str, user: dict = Depends(current_user)):
        return await close(gid, user, "active", "revoked")

    @parent.post("/grants/{gid}/deny")
    async def deny(gid: str, user: dict = Depends(current_user)):
        return await close(gid, user, "pending", "denied")

    return doctor, parent, migrate
