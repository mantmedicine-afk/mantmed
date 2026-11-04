"""Passaporto sanitario del bambino (Portale): riepilogo, vaccini, crescita, visite, bilanci; condivisione a tempo con link/QR + codice."""
import hashlib
import hmac
import json
import math
import secrets
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Literal, Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field

from crypto import seal_fields, unseal_fields
from growth import age_months, percentile as who_pct, curves as who_curves, value_at, pct_label, CURVE_Z
from netutil import client_ip
from tenancy import cf_hash
from visit_templates import BILANCI
from portal_docs import drug_text

IT = json.loads((Path(__file__).parent / "it_lms.json").read_text())
SWITCH, IT_TOP = 60, 216
CONSENT_VERSION = "passaporto-condivisione-1.0"
DURATIONS = {"24h": timedelta(hours=24), "7d": timedelta(days=7), "30d": timedelta(days=30)}
GONE = "Accesso non più disponibile"
NOINDEX = {"X-Robots-Tag": "noindex, nofollow, noarchive", "Cache-Control": "no-store"}
VACCINES = [
    ("esa", "Esavalente (difterite, tetano, pertosse, polio, Hib, epatite B)", [2, 4, 11]),
    ("pcv", "Pneumococco", [2, 4, 11]),
    ("rota", "Rotavirus", [2, 4]),
    ("menb", "Meningococco B", [2, 4, 13]),
    ("mprv", "Morbillo, parotite, rosolia, varicella", [13, 72]),
    ("menacwy", "Meningococco ACWY", [13, 144]),
    ("dtpa", "Richiamo difterite, tetano, pertosse, polio", [72, 144]),
    ("hpv", "Papillomavirus (HPV)", [132, 138]),
]
VNAME = {c: n for c, n, _ in VACCINES}
FIELDS = (("allergies", "allergie"), ("chronic_conditions", "patologie"), ("therapies", "terapie"), ("blood_group", "gruppo"))


def _now():
    return datetime.now(timezone.utc)


def _iso(d: datetime) -> str:
    return d.isoformat()


def _sha(x: str) -> str:
    return hashlib.sha256(x.encode()).hexdigest()


def add_months(birth: str, months: float) -> str:
    return (date.fromisoformat(birth[:10]) + timedelta(days=round(months * 30.4375))).isoformat()


# ---------- crescita: OMS 0-5 anni, Cacciari/SIEDP 2006 dopo i 5 anni ----------
def it_lms(ind, sex, m):
    rows = (IT.get(ind) or {}).get(sex)
    if not rows or m < rows[0][0] or m > rows[-1][0]:
        return None
    for a, b in zip(rows, rows[1:]):
        if a[0] <= m <= b[0]:
            f = (m - a[0]) / (b[0] - a[0])
            return tuple(a[k] + (b[k] - a[k]) * f for k in (1, 2, 3))
    return None


def mixed_pct(ind, sex, m, x):
    if x is None or sex not in ("M", "F"):
        return None
    if m <= SWITCH or ind == "hcfa":
        r = who_pct(ind, sex, m, x)
        return r and {**r, "ref": "OMS"}
    p = it_lms(ind, sex, m) if m <= IT_TOP else None
    if not p:
        return {"z": None, "percentile": None, "label": "fuori range", "in_range": False, "ref": "SIEDP"}
    L, M, S = p
    z = math.log(x / M) / S if abs(L) < 1e-9 else ((x / M) ** L - 1) / (L * S)
    pc = 50 * (1 + math.erf(z / math.sqrt(2)))
    return {"z": round(z, 2), "percentile": round(pc, 1), "label": pct_label(pc), "in_range": True, "ref": "SIEDP"}


def mixed_curves(ind, sex, max_month):
    top = min(SWITCH if ind == "hcfa" else IT_TOP, max(12, math.ceil(max_month / 6) * 6))
    out = who_curves(ind, sex, min(top, SWITCH))
    for m in range(SWITCH + 6, top + 1, 6):
        L, M, S = it_lms(ind, sex, m)
        out.append({"month": m, **{f"p{k}": round(value_at(L, M, S, z), 2) for k, z in CURVE_Z.items()}})
    return out


# ---------- vaccini ----------
def vaccine_plan(birth: str, done: list) -> dict:
    have = {(v["code"], v.get("dose")) for v in done}
    today = date.today().isoformat()
    upcoming, check = [], []
    for code, name, ages in VACCINES:
        for i, m in enumerate(ages, 1):
            if (code, i) in have:
                continue
            row = {"code": code, "name": name, "dose": i, "due": add_months(birth, m)}
            (upcoming if row["due"] >= today else check).append(row)
    return {"upcoming": sorted(upcoming, key=lambda r: r["due"])[:4], "to_check": sorted(check, key=lambda r: r["due"])}


class ShareIn(BaseModel):
    scope: Literal["summary", "full"]
    duration: Literal["24h", "7d", "30d"]
    allow_import: bool = False


class OpenIn(BaseModel):
    viewer_name: str = Field(min_length=3, max_length=80)
    code: str = Field(min_length=6, max_length=6)


class HideIn(BaseModel):
    hidden: bool


class ConsentIn(BaseModel):
    accept: bool


class VaccinationIn(BaseModel):
    code: str = Field(min_length=2, max_length=20)
    name: str = Field(default="", max_length=120)
    dose: int = Field(default=1, ge=1, le=10)
    date: str


def build_health_passport(db, tdb, current_user, parent_user, models, pdf_for, age_label):
    Patient, Consultation, Measurement = models["patient"], models["consultation"], models["measurement"]
    SEALED = Patient.__encrypted__
    portal = APIRouter(prefix="/portal/passport")
    public = APIRouter(prefix="/public/passport")
    doctor = APIRouter()

    async def optional_user(request: Request) -> Optional[dict]:
        try:
            return await current_user(request)
        except HTTPException:
            return None

    # ---------- raccolta dati ----------
    async def group_of(parent_id: str, pid: str) -> list:
        """Cartelle dello stesso bambino presso i medici collegati al genitore (stesso codice fiscale)."""
        u = await db.users.find_one({"_id": ObjectId(parent_id)}, {"children": 1})
        links = (u or {}).get("children") or []
        link = next((c for c in links if c["patient_id"] == pid), None)
        p = await db.patients.find_one({"_id": ObjectId(pid), "owner_id": link["owner_id"]}) if link and ObjectId.is_valid(pid) else None
        if not p:
            raise HTTPException(404, "Cartella non collegata al suo account")
        out = [(link, p)]
        for c in links:
            if c is not link and p.get("cf_hash") and ObjectId.is_valid(c["patient_id"]):
                q = await db.patients.find_one({"_id": ObjectId(c["patient_id"]), "owner_id": c["owner_id"], "cf_hash": p["cf_hash"]})
                if q:
                    out.append((c, q))
        return out

    async def assemble(parent_id: str, pid: str, shared: bool = False) -> dict:
        group = await group_of(parent_id, pid)
        names = {}
        for link, _ in group:
            d = await db.users.find_one({"_id": ObjectId(link["owner_id"])}, {"name": 1})
            names[link["owner_id"]] = (d or {}).get("name", "Studio medico")
        main = unseal_fields(group[0][1], SEALED)
        birth, sex = main["birth_date"], main["sex"]
        months = age_months(birth)
        summary = {k: [] for _, k in FIELDS}
        visits, done_b, meas, vacc, drugs = [], [], [], [], []
        for link, raw in group:
            p = unseal_fields(raw, SEALED)
            doc_name = names[link["owner_id"]]
            meta = p.get("field_meta") or {}
            for f, k in FIELDS:
                v = (p.get(f) or "").strip()
                if v:
                    m = meta.get(f) or {}
                    summary[k].append({"value": v, "by": m.get("by") or doc_name, "at": m.get("at") or p.get("created_at")})
            q = {"patient_id": link["patient_id"], "owner_id": link["owner_id"]}
            async for c in db.consultations.find({**q, "status": {"$ne": "processing"}, "obscured": {"$ne": True},
                                                  "$or": [{"report_sent_at": {"$ne": None}}, {"portal_published": True}]}):
                x = Consultation.from_mongo(c).out()
                if shared and x.get("portal_hidden_by_parent"):
                    continue
                n = x.get("note") or {}
                at = x.get("signed_at") or x["created_at"]
                kind = x.get("template_name") or n.get("motivo_visita") or "Visita"
                visits.append({"id": x["id"], "date": x["created_at"], "doctor": doc_name, "clinic": x.get("clinic", ""), "type": kind,
                               "reason": n.get("motivo_visita", ""), "diagnosis": n.get("diagnosi", ""), "hidden": bool(x.get("portal_hidden_by_parent")),
                               "by": doc_name, "at": at})
                if "bilancio" in f"{x.get('template_name', '')} {n.get('motivo_visita', '')}".lower():
                    done_b.append({"name": x.get("template_name") or n.get("motivo_visita"), "date": x["created_at"], "by": doc_name, "id": x["id"]})
                if not x.get("portal_hidden_by_parent"):
                    for d in n.get("farmaci") or []:
                        days = d.get("giorni")
                        if (d.get("nome") or "").strip() and isinstance(days, (int, float)) and \
                                datetime.fromisoformat(x["created_at"]) + timedelta(days=days) >= _now():
                            drugs.append({"value": f"{d['nome'].strip()}" + (f" · {drug_text(d)}" if drug_text(d) else ""), "by": doc_name, "at": at, "source": "referto"})
            async for m in db.measurements.find(q):
                mm = Measurement.from_mongo(m).out()
                am = age_months(birth, date.fromisoformat(mm["date"]))
                meas.append({"id": mm["id"], "date": mm["date"], "age_months": round(am, 1), "age_label": age_label(am), "weight": mm["weight"],
                             "height": mm["height"], "hc": mm["hc"], "clinic": mm.get("clinic", ""), "by": doc_name,
                             "source": "visita" if mm.get("consultation_id") else "inserita in studio",
                             "pct": {"peso": mixed_pct("wfa", sex, am, mm["weight"]), "altezza": mixed_pct("lhfa", sex, am, mm["height"]),
                                     "cc": mixed_pct("hcfa", sex, am, mm["hc"]) if am <= SWITCH else None}})
            async for v in db.vaccinations.find(q):
                s = unseal_fields(v, ("name",))
                vacc.append({"id": str(v["_id"]), "code": v["code"], "name": s.get("name") or VNAME.get(v["code"], v["code"]), "dose": v.get("dose"),
                             "date": v["date"], "by": v.get("by_name") or doc_name, "at": v.get("created_at")})
        summary["terapie"] += drugs
        nb = next(((k, n, a) for k, n, a, b, _ in BILANCI if b > months and n not in {x["name"] for x in done_b}), None)
        maxm = max([months] + [m["age_months"] for m in meas])
        g = {"sex": sex, "measurements": sorted(meas, key=lambda m: m["date"]),
             "curves": {i: mixed_curves(i, sex, maxm + 6) for i in ("wfa", "lhfa", "hcfa")}}
        return {"child": {"id": pid, "name": main["name"], "birth_date": birth, "sex": sex, "age_label": age_label(months)},
                "summary": {"allergies": summary["allergie"], "chronic": summary["patologie"], "therapies": summary["terapie"],
                            "blood_group": summary["gruppo"][0] if summary["gruppo"] else None},
                "vaccines": {"done": sorted(vacc, key=lambda v: v["date"], reverse=True), **vaccine_plan(birth, vacc)},
                "growth": g, "visits": sorted(visits, key=lambda v: v["date"], reverse=True),
                "bilanci": {"done": sorted(done_b, key=lambda b: b["date"], reverse=True),
                            "next": {"name": nb[1], "from": add_months(birth, nb[2])} if nb else None},
                "doctors": sorted(set(names.values())), "updated_at": _iso(_now())}

    async def parent_contact(parent_id: str) -> dict:
        u = await db.users.find_one({"_id": ObjectId(parent_id)}) or {}
        phone = unseal_fields({"phone": u.get("phone", "")}, ("phone",)).get("phone") or ""
        return {"name": u.get("name", ""), "phone": phone, "email": u.get("email", "")}

    def scoped(data: dict, scope: str) -> dict:
        keep = ("child", "summary", "vaccines", "doctors", "updated_at", "contact")
        return {k: v for k, v in data.items() if scope == "full" or k in keep}

    # ---------- genitore ----------
    @portal.get("/consent")
    async def get_consent(user: dict = Depends(parent_user)):
        u = await db.users.find_one({"_id": ObjectId(user["id"])}, {"passport_share_consent": 1})
        return {"consent": (u or {}).get("passport_share_consent"), "version": CONSENT_VERSION}

    @portal.post("/consent")
    async def give_consent(body: ConsentIn, request: Request, user: dict = Depends(parent_user)):
        if not body.accept:
            raise HTTPException(400, "Serve il consenso esplicito per condividere il passaporto")
        c = {"version": CONSENT_VERSION, "at": _iso(_now()), "ip_hash": _sha(client_ip(request))}
        await db.users.update_one({"_id": ObjectId(user["id"])}, {"$set": {"passport_share_consent": c}})
        return {"consent": c}

    @portal.get("/{pid}")
    async def my_passport(pid: str, user: dict = Depends(parent_user)):
        data = await assemble(user["id"], pid)
        return {**data, "contact": await parent_contact(user["id"])}

    @portal.post("/{pid}/visits/{cid}/hide")
    async def hide_visit(pid: str, cid: str, body: HideIn, user: dict = Depends(parent_user)):
        group = await group_of(user["id"], pid)
        c = await db.consultations.find_one({"_id": ObjectId(cid)}) if ObjectId.is_valid(cid) else None
        if not c or not any(l["patient_id"] == c.get("patient_id") and l["owner_id"] == c.get("owner_id") for l, _ in group):
            raise HTTPException(404, "Referto non trovato")
        await db.consultations.update_one({"_id": c["_id"]}, {"$set": {"portal_hidden_by_parent": body.hidden}})
        return {"id": cid, "hidden": body.hidden}

    def share_out(s: dict) -> dict:
        now = _iso(_now())
        st = "revoked" if s.get("revoked_at") else "expired" if s["expires_at"] <= now else "active"
        sec = unseal_fields({k: s[k] for k in ("token", "code")}, ("token", "code"))
        return {"id": str(s["_id"]), "scope": s["scope"], "allow_import": s.get("allow_import", False), "created_at": s["created_at"],
                "expires_at": s["expires_at"], "revoked_at": s.get("revoked_at"), "status": st,
                **({"token": sec["token"], "code": sec["code"]} if st == "active" else {})}

    @portal.get("/{pid}/shares")
    async def list_shares(pid: str, user: dict = Depends(parent_user)):
        await group_of(user["id"], pid)
        return [share_out(s) async for s in db.passport_shares.find({"parent_id": user["id"], "patient_id": pid}).sort("created_at", -1).limit(30)]

    @portal.post("/{pid}/shares")
    async def create_share(pid: str, body: ShareIn, user: dict = Depends(parent_user)):
        group = await group_of(user["id"], pid)
        u = await db.users.find_one({"_id": ObjectId(user["id"])}, {"passport_share_consent": 1})
        if not (u or {}).get("passport_share_consent"):
            raise HTTPException(412, "Prima della condivisione legga l'informativa e dia il consenso")
        if await db.passport_shares.count_documents({"parent_id": user["id"], "revoked_at": None, "expires_at": {"$gt": _iso(_now())}}) >= 20:
            raise HTTPException(429, "Troppe condivisioni attive: revochi quelle che non servono più")
        token, code = secrets.token_urlsafe(24), f"{secrets.randbelow(10 ** 6):06d}"
        now = _now()
        doc = {"parent_id": user["id"], "patient_id": pid, "owner_id": group[0][0]["owner_id"], "scope": body.scope, "allow_import": body.allow_import,
               "token_hash": _sha(token), **seal_fields({"token": token, "code": code}, ("token", "code")), "fails": 0,
               "created_at": _iso(now), "expires_at": _iso(now + DURATIONS[body.duration]), "revoked_at": None}
        res = await db.passport_shares.insert_one(doc)
        return share_out({**doc, "_id": res.inserted_id})

    @portal.post("/{pid}/shares/{sid}/revoke")
    async def revoke_share(pid: str, sid: str, user: dict = Depends(parent_user)):
        r = await db.passport_shares.update_one({"_id": ObjectId(sid) if ObjectId.is_valid(sid) else None, "parent_id": user["id"], "patient_id": pid,
                                                 "revoked_at": None}, {"$set": {"revoked_at": _iso(_now())}})
        if not r.matched_count:
            raise HTTPException(404, "Condivisione non trovata o già revocata")
        await db.passport_views.delete_many({"share_id": sid})
        return {"ok": True}

    @portal.get("/{pid}/access")
    async def access_log(pid: str, user: dict = Depends(parent_user)):
        await group_of(user["id"], pid)
        shares = {str(s["_id"]): s async for s in db.passport_shares.find({"parent_id": user["id"], "patient_id": pid})}
        out = []
        async for a in db.passport_access.find({"share_id": {"$in": list(shares)}}).sort("at", -1).limit(100):
            s = shares[a["share_id"]]
            out.append({"id": str(a["_id"]), "at": a["at"], "action": a["action"], "viewer_name": unseal_fields(a, ("viewer_name",)).get("viewer_name", ""),
                        "mantmed_doctor": bool(a.get("doctor_id")), "share_id": a["share_id"], "share_scope": s["scope"], "share_created_at": s["created_at"]})
        return out

    # ---------- accesso pubblico (sola lettura, nessun account) ----------
    async def live_share(token: str) -> Optional[dict]:
        s = await db.passport_shares.find_one({"token_hash": _sha(token)})
        if not s or s.get("revoked_at") or s["expires_at"] <= _iso(_now()):
            return None
        return s

    async def view_of(key: str) -> tuple:
        v = await db.passport_views.find_one({"key_hash": _sha(key)})
        s = await db.passport_shares.find_one({"_id": ObjectId(v["share_id"])}) if v and v["expires_at"] > _iso(_now()) else None
        if not s or s.get("revoked_at") or s["expires_at"] <= _iso(_now()):
            raise HTTPException(410, GONE)
        return v, s

    async def log(s: dict, viewer: str, action: str, request: Request, doctor_id: Optional[str] = None):
        await db.passport_access.insert_one({"share_id": str(s["_id"]), "parent_id": s["parent_id"], "action": action, "at": _iso(_now()),
                                             **seal_fields({"viewer_name": viewer}, ("viewer_name",)), "doctor_id": doctor_id,
                                             "ip_hash": _sha(client_ip(request))})

    @public.get("/{token}")
    async def share_info(token: str, response: Response, request: Request):
        response.headers.update(NOINDEX)
        s = await live_share(token)
        if not s:
            return {"available": False, "message": GONE}
        u = await optional_user(request)
        return {"available": True, "scope": s["scope"], "expires_at": s["expires_at"], "allow_import": s.get("allow_import", False),
                "mantmed_doctor": bool(u and u.get("role") == "doctor")}

    @public.post("/{token}/open")
    async def open_share(token: str, body: OpenIn, request: Request, response: Response):
        response.headers.update(NOINDEX)
        ip = _sha(client_ip(request))
        since = _iso(_now() - timedelta(minutes=10))
        if await db.passport_attempts.count_documents({"ip": ip, "at": {"$gt": since}}) >= 20:
            raise HTTPException(429, "Troppi tentativi. Riprovi tra qualche minuto.")
        await db.passport_attempts.insert_one({"ip": ip, "at": _iso(_now()), "created": _now()})
        s = await live_share(token)
        if not s:
            raise HTTPException(410, GONE)
        if s.get("locked_until") and s["locked_until"] > _iso(_now()):
            raise HTTPException(429, "Troppi codici errati: accesso bloccato per 15 minuti")
        code = unseal_fields({"code": s["code"]}, ("code",))["code"]
        if not hmac.compare_digest(code, body.code.strip()):
            fails = s.get("fails", 0) + 1
            upd = {"fails": 0, "locked_until": _iso(_now() + timedelta(minutes=15))} if fails >= 5 else {"fails": fails}
            await db.passport_shares.update_one({"_id": s["_id"]}, {"$set": upd})
            raise HTTPException(403, f"Codice non corretto. Tentativi rimasti: {max(0, 5 - fails)}" if fails < 5 else "Troppi codici errati: accesso bloccato per 15 minuti")
        await db.passport_shares.update_one({"_id": s["_id"]}, {"$set": {"fails": 0}})
        u = await optional_user(request)
        doc_id = u["id"] if u and u.get("role") == "doctor" else None
        key = secrets.token_urlsafe(24)
        await db.passport_views.insert_one({"key_hash": _sha(key), "share_id": str(s["_id"]), "viewer": seal_fields({"v": body.viewer_name.strip()}, ("v",))["v"],
                                            "expires_at": min(s["expires_at"], _iso(_now() + timedelta(hours=2))), "created": _now()})
        await log(s, body.viewer_name.strip(), "apertura", request, doc_id)
        data = scoped({**await assemble(s["parent_id"], s["patient_id"], shared=True), "contact": await parent_contact(s["parent_id"])}, s["scope"])
        return {"key": key, "scope": s["scope"], "expires_at": s["expires_at"], "data": data,
                "import": {"allowed": s.get("allow_import", False), "mantmed_doctor": bool(doc_id)}}

    @public.get("/view/{key}/reports/{cid}/pdf")
    async def shared_pdf(key: str, cid: str, request: Request):
        v, s = await view_of(key)
        if s["scope"] != "full":
            raise HTTPException(403, "La condivisione include solo il riepilogo")
        data = await assemble(s["parent_id"], s["patient_id"], shared=True)
        if cid not in {x["id"] for x in data["visits"]}:
            raise HTTPException(404, "Referto non disponibile")
        pdf, name = await pdf_for(await db.consultations.find_one({"_id": ObjectId(cid)}))
        await log(s, unseal_fields({"v": v["viewer"]}, ("v",))["v"], "referto_pdf", request)
        return Response(pdf, media_type="application/pdf", headers={**NOINDEX, "Content-Disposition": f"attachment; filename=\"{name}\""})

    # ---------- medici MantMed: importazione nella cartella ----------
    @doctor.post("/passport-import/{key}")
    async def import_passport(key: str, request: Request, user: dict = Depends(current_user)):
        v, s = await view_of(key)
        if not s.get("allow_import"):
            raise HTTPException(403, "Il genitore non ha autorizzato l'importazione")
        group = await group_of(s["parent_id"], s["patient_id"])
        src = unseal_fields(group[0][1], SEALED)
        h = group[0][1].get("cf_hash")
        mine = await tdb.patients.find_one({"cf_hash": h}) if h else None
        fields = ("name", "birth_date", "sex", "fiscal_code", "guardian", "guardian_email", "guardian_fiscal_code", "allergies", "chronic_conditions", "therapies", "blood_group")
        by = {"by": f"Passaporto condiviso dal genitore (importato da {user['name']})", "at": _iso(_now())}
        if mine:
            cur = unseal_fields(mine, SEALED)
            fill = {f: src[f] for f in fields if (src.get(f) or "") and not (cur.get(f) or "")}
            upd = Patient.sealed_set(fill) if fill else {}
            upd.update({f"field_meta.{f}": by for f in fill if f in dict(FIELDS)})
            if upd:
                await tdb.patients.update_one({"_id": mine["_id"]}, {"$set": upd})
            pid, created = str(mine["_id"]), False
        else:
            body = {f: src.get(f) or "" for f in fields}
            body["field_meta"] = {f: by for f, _ in FIELDS if body.get(f)}
            res = await tdb.patients.insert_one({**Patient(**body).to_mongo(), "cf_hash": h})
            pid, created, fill = str(res.inserted_id), True, body
        data = await assemble(s["parent_id"], s["patient_id"], shared=True)
        have = {m["date"] async for m in tdb.measurements.find({"patient_id": pid})}
        new_m = [Measurement(patient_id=pid, date=m["date"], clinic="", weight=m["weight"], height=m["height"], hc=m["hc"], source="passaporto").to_mongo()
                 for m in data["growth"]["measurements"] if m["date"] not in have]
        if new_m:
            await tdb.measurements.insert_many(new_m)
        vhave = {(x["code"], x.get("dose")) async for x in tdb.vaccinations.find({"patient_id": pid})}
        new_v = [{"patient_id": pid, "code": x["code"], **seal_fields({"name": x["name"]}, ("name",)), "dose": x["dose"], "date": x["date"],
                  "by_name": x["by"], "created_at": _iso(_now()), "source": "passaporto"}
                 for x in data["vaccines"]["done"] if (x["code"], x["dose"]) not in vhave]
        if new_v:
            await tdb.vaccinations.insert_many(new_v)
        await log(s, unseal_fields({"v": v["viewer"]}, ("v",))["v"], "importazione", request, user["id"])
        return {"patient_id": pid, "created": created, "fields": sorted(k for k in fields if fill.get(k) and k not in ("name", "birth_date", "sex", "fiscal_code")),
                "measurements": len(new_m), "vaccinations": len(new_v)}

    # ---------- medico: vaccinazioni in cartella ----------
    @doctor.get("/vaccine-calendar")
    async def calendar():
        return [{"code": c, "name": n, "doses": len(a)} for c, n, a in VACCINES]

    @doctor.get("/patients/{pid}/vaccinations")
    async def list_vacc(pid: str):
        p = await tdb.patients.find_one({"_id": ObjectId(pid)}) if ObjectId.is_valid(pid) else None
        if not p:
            raise HTTPException(404, "Paziente non trovato")
        done = [{"id": str(v["_id"]), "code": v["code"], "name": unseal_fields(v, ("name",)).get("name") or VNAME.get(v["code"], v["code"]),
                 "dose": v.get("dose"), "date": v["date"], "by": v.get("by_name", ""), "at": v.get("created_at")}
                async for v in tdb.vaccinations.find({"patient_id": pid}).sort("date", -1)]
        return {"done": done, **vaccine_plan(p["birth_date"], done)}

    @doctor.post("/patients/{pid}/vaccinations")
    async def add_vacc(pid: str, body: VaccinationIn, user: dict = Depends(current_user)):
        if not (ObjectId.is_valid(pid) and await tdb.patients.find_one({"_id": ObjectId(pid)}, {"_id": 1})):
            raise HTTPException(404, "Paziente non trovato")
        try:
            if date.fromisoformat(body.date) > date.today():
                raise HTTPException(400, "La data della vaccinazione non può essere futura")
        except ValueError:
            raise HTTPException(400, "Data non valida")
        name = body.name.strip() or VNAME.get(body.code, "")
        if not name:
            raise HTTPException(400, "Indichi il nome del vaccino")
        if await tdb.vaccinations.find_one({"patient_id": pid, "code": body.code, "dose": body.dose}) and body.code in VNAME:
            raise HTTPException(409, "Questa dose è già registrata")
        doc = {"patient_id": pid, "code": body.code, **seal_fields({"name": name}, ("name",)), "dose": body.dose, "date": body.date,
               "by_name": user["name"], "created_at": _iso(_now()), "source": "studio"}
        res = await tdb.vaccinations.insert_one(doc)
        return {"id": str(res.inserted_id), "code": body.code, "name": name, "dose": body.dose, "date": body.date, "by": user["name"], "at": doc["created_at"]}

    @doctor.delete("/vaccinations/{vid}")
    async def del_vacc(vid: str):
        r = await tdb.vaccinations.delete_one({"_id": ObjectId(vid) if ObjectId.is_valid(vid) else None})
        if not r.deleted_count:
            raise HTTPException(404, "Vaccinazione non trovata")
        return {"ok": True}

    async def ensure_indexes():
        await db.passport_shares.create_index("token_hash", unique=True)
        await db.passport_views.create_index("key_hash", unique=True)
        await db.passport_views.create_index("created", expireAfterSeconds=60 * 60 * 24 * 31)
        await db.passport_attempts.create_index("created", expireAfterSeconds=60 * 30)
        await db.passport_access.create_index([("share_id", 1), ("at", -1)])

    return portal, public, doctor, ensure_indexes
