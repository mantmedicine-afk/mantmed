import os
os.chdir('/app/backend')
p='server.py'; s=open(p).read()
def rep(a,b):
    global s
    assert a in s, a[:80]; s=s.replace(a,b,1)
rep('from live_checklist import','import fse as fse_mod\nfrom live_checklist import')
rep('''    guardian_email: str = ""
    allergies: str = ""
    notes: str = ""
    consent_at: Optional[str] = None
    consent_version: Optional[str] = None
    consent_email: bool = False
    portal_invited_at: Optional[str] = None
    created_at: str = Field(default_factory=now_iso)
    __encrypted__: ClassVar[tuple] = ("fiscal_code", "guardian", "guardian_email", "allergies", "notes")''','''    guardian_email: str = ""
    guardian_fiscal_code: str = ""
    allergies: str = ""
    notes: str = ""
    consent_at: Optional[str] = None
    consent_version: Optional[str] = None
    consent_email: bool = False
    fse_consent_at: Optional[str] = None
    passport_consent_at: Optional[str] = None
    portal_invited_at: Optional[str] = None
    created_at: str = Field(default_factory=now_iso)
    __encrypted__: ClassVar[tuple] = ("fiscal_code", "guardian", "guardian_email", "guardian_fiscal_code", "allergies", "notes")''')
rep('''    guardian_email: str = ""
    allergies: str = ""
    notes: str = ""


class PatientPatch(BaseModel):''','''    guardian_email: str = ""
    guardian_fiscal_code: str = ""
    allergies: str = ""
    notes: str = ""


class PatientPatch(BaseModel):''')
rep('''    guardian: Optional[str] = None
    allergies: Optional[str] = None
    notes: Optional[str] = None


class Measurement(BaseDocument):''','''    guardian: Optional[str] = None
    guardian_fiscal_code: Optional[str] = None
    allergies: Optional[str] = None
    notes: Optional[str] = None


class Measurement(BaseDocument):''')
rep('''    portal_published: bool = False
''','''    portal_published: bool = False
    portal_hidden_by_parent: bool = False
    signed_at: Optional[str] = None
    obscured: bool = False
    fse: Optional[dict] = None
''')
rep('''class Consent(BaseDocument):
    patient_id: str
''','''class Consent(BaseDocument):
    patient_id: str
    kind: Literal["privacy", "fse", "passaporto"] = "privacy"
''')
rep('''    active = await tdb.consents.find({"patient_id": pid, "revoked_at": None}).sort("signed_at", -1).to_list(1)
    c = active[0] if active else None
    await tdb.patients.update_one({"_id": oid(pid)}, {"$set": {''','''    active = await tdb.consents.find({"patient_id": pid, "revoked_at": None, "kind": {"$in": [None, "privacy"]}}).sort("signed_at", -1).to_list(1)
    c = active[0] if active else None
    extra = {}
    for kind, field in (("fse", "fse_consent_at"), ("passaporto", "passport_consent_at")):
        k = await tdb.consents.find({"patient_id": pid, "revoked_at": None, "kind": kind}).sort("signed_at", -1).to_list(1)
        extra[field] = k[0]["signed_at"] if k else None
    await tdb.patients.update_one({"_id": oid(pid)}, {"$set": {**extra,''')
rep('''@api.post("/consents/{cid}/revoke")''','''class ConsentKindIn(BaseModel):
    signer_name: str = Field(min_length=2, max_length=120)
    signer_relation: str = Field(default="Genitore", max_length=60)
    method: Literal["firma_tablet", "modulo_cartaceo"]
    signature: Optional[str] = Field(default=None, max_length=400_000)


@api.post("/patients/{pid}/consents/{kind}")
async def record_kind_consent(pid: str, kind: Literal["fse", "passaporto"], body: ConsentKindIn):
    """Consensi separati: alimentazione FSE e Passaporto / Medicina di squadra (firma, data, storico, revoca)."""
    if not await tdb.patients.find_one({"_id": oid(pid)}, {"_id": 1}):
        raise HTTPException(404, "Paziente non trovato")
    if body.method == "firma_tablet" and not body.signature:
        raise HTTPException(400, "Manca la firma")
    c = Consent(patient_id=pid, kind=kind, version=f"{kind}-1.0", signer_name=body.signer_name.strip(), signer_relation=body.signer_relation,
                privacy_policy=True, health_data=True, method=body.method, signature=body.signature, channel="studio")
    await tdb.consents.insert_one(c.to_mongo())
    await refresh_patient_consent(pid)
    await audit(f"consenso_{kind}", "")
    if kind == "fse":
        await fse_reevaluate(pid)
    return {"ok": True}


def _norm_name(t: str) -> str:
    return " ".join(_fold(t).split())


async def fse_reevaluate(pid: str):
    """Dopo consenso o dati completati: rimette in coda i referti firmati non ancora inviati."""
    pdoc = await tdb.patients.find_one({"_id": oid(pid)})
    if not pdoc:
        return
    pat = patient_out(pdoc)
    async for c in tdb.consultations.find({"patient_id": pid, "signed_at": {"$ne": None}, "obscured": {"$ne": True},
                                            "fse.status": {"$in": [None, "non_inviato"]}}):
        await tdb.consultations.update_one({"_id": c["_id"]}, {"$set": {"fse": fse_mod.on_signed(c, pat)}})


async def fse_tick(cons: list, pat: dict) -> list:
    """Fa avanzare la simulazione del connettore sui referti del paziente."""
    for c in cons:
        new = fse_mod.advance(c.get("fse"), pat)
        if new != c.get("fse"):
            await tdb.consultations.update_one({"_id": oid(c["id"])}, {"$set": {"fse": new}})
            c["fse"] = new
    return cons


@api.post("/consultations/{cid}/fse/retry")
async def fse_retry(cid: str):
    doc = await tdb.consultations.find_one({"_id": oid(cid)})
    if not doc or not doc.get("signed_at"):
        raise HTTPException(409, "Verifica e firma prima il referto")
    pat = patient_out(await tdb.patients.find_one({"_id": oid(doc["patient_id"])})) if doc.get("patient_id") else {}
    new = fse_mod.on_signed({**doc, "fse": {**(doc.get("fse") or {}), "status": "non_inviato"}}, pat)
    await tdb.consultations.update_one({"_id": doc["_id"]}, {"$set": {"fse": new}})
    return {"fse": new}


class ObscureIn(BaseModel):
    on: bool


@api.post("/consultations/{cid}/obscure")
async def fse_obscure(cid: str, body: ObscureIn):
    """Oscura: escluso sia dal FSE sia dal Passaporto (portale del genitore)."""
    doc = await tdb.consultations.find_one({"_id": oid(cid)})
    if not doc:
        raise HTTPException(404, "Consultazione non trovata")
    if body.on:
        upd = {"obscured": True, "portal_published": False, "fse": {**(doc.get("fse") or {}), "status": "oscurato"}}
    else:
        pat = patient_out(await tdb.patients.find_one({"_id": oid(doc["patient_id"])})) if doc.get("patient_id") else {}
        upd = {"obscured": False, "fse": fse_mod.on_signed({**doc, "obscured": False}, pat) if doc.get("signed_at") else None}
    await tdb.consultations.update_one({"_id": doc["_id"]}, {"$set": upd})
    await audit("referto_oscurato" if body.on else "referto_oscuramento_rimosso", doc["patient_name"])
    return Consultation.from_mongo(await tdb.consultations.find_one({"_id": doc["_id"]})).out()


@api.get("/fse/pending")
async def fse_pending_summary():
    items = await tdb.consultations.find({"fse.status": {"$in": ["non_inviato", "in_coda", "errore"]}, "obscured": {"$ne": True}},
                                         {"fse": 1}).to_list(2000)
    dl = sorted(x["fse"]["deadline"] for x in items if x["fse"].get("deadline"))
    return {"count": len(items), "next_deadline": dl[0] if dl else None, "errors": sum(x["fse"]["status"] == "errore" for x in items)}


@api.post("/consents/{cid}/revoke")''')
# firma: data di firma + valutazione FSE
rep('''    upd = await tdb.consultations.find_one_and_update({"_id": oid(cid)}, {"$set": {"ai_provenance": p}}, return_document=True)
    await audit("nota_firmata", doc["patient_name"])''','''    signed_at = doc.get("signed_at") or now_iso()
    fse_state = doc.get("fse")
    if not fse_state or fse_state.get("status") in (None, "non_inviato"):
        pat = patient_out(await tdb.patients.find_one({"_id": oid(doc["patient_id"])})) if doc.get("patient_id") else {}
        fse_state = fse_mod.on_signed({**doc, "signed_at": signed_at}, pat) if pat else {"status": "non_inviato", "reason": "Visita senza cartella paziente", "deadline": fse_mod.deadline_from(signed_at)}
    upd = await tdb.consultations.find_one_and_update({"_id": oid(cid)}, {"$set": {"ai_provenance": p, "signed_at": signed_at, "fse": fse_state}}, return_document=True)
    await audit("nota_firmata", doc["patient_name"])''')
rep('''    if body.published:
        await require_ready(cid)
        cur = await tdb.consultations.find_one({"_id": oid(cid)}, {"ai_provenance": 1})
        if cur and needs_signature(cur):
            raise HTTPException(409, SIGN_FIRST)''','''    if body.published:
        await require_ready(cid)
        cur = await tdb.consultations.find_one({"_id": oid(cid)}, {"ai_provenance": 1, "obscured": 1})
        if cur and needs_signature(cur):
            raise HTTPException(409, SIGN_FIRST)
        if cur and cur.get("obscured"):
            raise HTTPException(409, "Referto oscurato: rimuova l'oscuramento per pubblicarlo")''')
rep('''    consents = [Consent.from_mongo(x).out() for x in await tdb.consents.find({"patient_id": pid}).sort("signed_at", -1).to_list(50)]
    cons = [Consultation.from_mongo(c).out() for c in await tdb.consultations.find({"patient_id": pid}).sort("created_at", -1).to_list(200)]''','''    guardian = _norm_name(patient.get("guardian"))
    consents = [{**(o := Consent.from_mongo(x).out()), "signer_mismatch": bool(guardian) and _norm_name(o.get("signer_name")) != guardian}
                for x in await tdb.consents.find({"patient_id": pid}).sort("signed_at", -1).to_list(100)]
    cons = await fse_tick([Consultation.from_mongo(c).out() for c in await tdb.consultations.find({"patient_id": pid}).sort("created_at", -1).to_list(200)], patient)
    parent = await db.users.find_one({"role": "parent", "email": (patient.get("guardian_email") or "").strip().lower()}, {"_id": 1}) if patient.get("guardian_email") else None
    shares = [{"id": str(x["_id"]), "signed_at": x["signed_at"], "specialists": [m.get("doctor_name") or m.get("owner_name") or "" for m in x.get("members", [])]}
              async for x in db.share_consents.find({"members.patient_id": pid, "revoked_at": None, "superseded": {"$ne": True}})]
    portal = {"status": "attivo" if parent else "invitato" if patient.get("portal_invited_at") else "non_attivo", "shares": shares}
    fse_info = {"missing": fse_mod.missing_data(patient), "consent": bool(patient.get("fse_consent_at")), "days": fse_mod.FSE_DAYS}''')
rep('''    return {"patient": patient, "consultations": cons, "measurements": meas, "checkpoints": cps, "payments": pays, "consents": consents,
            "clinics": list(clinics.values()), "synced_at": now_iso()}''','''    return {"patient": patient, "consultations": cons, "measurements": meas, "checkpoints": cps, "payments": pays, "consents": consents,
            "clinics": list(clinics.values()), "synced_at": now_iso(), "portal": portal, "fse": fse_info}''')
open(p,'w').write(s); print('ok')
