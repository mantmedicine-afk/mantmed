from dotenv import load_dotenv
from pathlib import Path
load_dotenv(Path(__file__).parent / '.env')

from fastapi import FastAPI, APIRouter, HTTPException, UploadFile, File, Form, Depends, Request
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorGridFSBucket
from bson import ObjectId
import os
import io
import json
import re
import uuid
import time
import logging
from beta import build_beta
from leads import build_leads
from tenancy import TenantDB, set_tenant, tenant_clinics, cf_hash
from registration import build_registration
from portal_flow import build_portal_flow
from scheduling import build_scheduling
from billing import build_billing
from invoicing import build_invoicing
from network import build_network
from team import build_team
from ai_replies import build_ai_replies
from messaging import build_messaging, notify_parents
from password_reset import build_password_reset
from account import build_account, notify_doctor
from previsit import build_previsit, latest_previsit, previsit_prompt
from support_inbox import build_support_inbox
from showcase import build_showcase
from portal_docs import build_portal_docs
from health_passport import build_health_passport
from bodychart import build_bodychart, report_payload
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, BeforeValidator, model_validator
from typing import List, Optional, Annotated, Literal, ClassVar, Dict, Any
from specialty_modules import (upgrade_note, module_for, module_keys, catalog as modules_catalog, STRUCTURED, module_prompt, parse_module,
                               drop_duplicates, build_module_settings)
from datetime import datetime, timezone
from crypto import seal_fields, unseal_fields, is_sealed, KEY_FINGERPRINT, seal, unseal, seal_bytes, unseal_bytes
import asyncio
import unicodedata
from tenancy import OWNER
from emergentintegrations.llm.openai import OpenAISpeechToText
from emergentintegrations.llm.chat import LlmChat, UserMessage
import fse as fse_mod
from live_checklist import build_live, apply_checklist, demo_sezioni
from auth import build_auth, seed_doctor, seed_admin, require_role, TOUR_VERSION
from cleanup import build_cleanup
from visit_templates import build_visit_templates, fields_prompt, map_fields, parse_json
from report import build_report
from cash_pdf import build_cash_pdf
import provenance as prov
from signed_docs import build_signed_docs, record_privacy_consent, doctor_signature
from mailer import send_email
import base64
from html import escape as hesc
from growth import age_months, all_percentiles, curves, lms, value_at
from checkpoints import BANDS, band_for, evaluate
from datetime import date, timedelta
from zoneinfo import ZoneInfo
from fastapi.responses import Response
from urllib.parse import quote

client = AsyncIOMotorClient(os.environ['MONGO_URL'])
db = client[os.environ['DB_NAME']]
tdb = TenantDB(db)
LLM_KEY = os.environ['EMERGENT_LLM_KEY']

app = FastAPI()
auth_router, current_user, start_session = build_auth(db)
public_api = APIRouter(prefix="/api")


async def doctor_ctx(user: dict = Depends(require_role(current_user, "doctor"))) -> dict:
    set_tenant(user["id"], [c["name"] for c in user["clinics"]] or ["Studio principale"])
    return user


api = APIRouter(prefix="/api", dependencies=[Depends(doctor_ctx)])
logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

PyObjectId = Annotated[str, BeforeValidator(lambda v: str(v) if isinstance(v, ObjectId) else v)]


class BaseDocument(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    id: Optional[PyObjectId] = Field(default=None, alias="_id")
    __encrypted__: ClassVar[tuple] = ()

    @classmethod
    def from_mongo(cls, doc):
        return cls.model_validate(unseal_fields(doc, cls.__encrypted__))

    def to_mongo(self):
        data = self.model_dump(by_alias=True, exclude={"id"})
        data.pop("_id", None)
        return seal_fields(data, self.__encrypted__)

    @classmethod
    def sealed_set(cls, data: dict) -> dict:
        return seal_fields(data, cls.__encrypted__)

    def out(self):
        return self.model_dump(by_alias=False)


def oid(value: str) -> ObjectId:
    if not ObjectId.is_valid(value):
        raise HTTPException(404, "Non trovato")
    return ObjectId(value)


def now_iso():
    return datetime.now(timezone.utc).isoformat()


async def doctor_profile(uid: str) -> Optional[dict]:
    """Report/email letterhead for self-registered doctors; None = founder studio configured via env."""
    u = await db.users.find_one({"_id": ObjectId(uid)})
    p = (u or {}).get("profile")
    if not p:
        return None
    address = p.get("studio_address", "")
    return {"specialty": p.get("specialty", ""), "titles": os.environ.get("DOCTOR_TITLES", "") if u.get("founder") else "", "order": f"Iscr. N. {p.get('order_number', '')}", "phone": p.get("phone", ""),
            "email": p.get("contact_email") or u["email"], "address": address, "city": address.split(",")[-1].strip() if address else ""}


def header_line(profile: Optional[dict]) -> str:
    return "STUDIO MEDICO SPECIALISTICO · " + ((profile or {}).get("specialty") or "PEDIATRIA").upper()


CLINICS = ["Studio Centro", "Studio Provincia"]


class Appointment(BaseDocument):
    clinic: str
    date: Optional[str] = None
    time: str
    patient_name: str
    patient_id: Optional[str] = None
    visit_type: str
    duration: int = 30
    status: Literal["programmato", "in_attesa", "in_corso", "completato", "annullato"] = "programmato"
    notes: str = ""
    paid_online: bool = False
    payment_id: Optional[str] = None
    __encrypted__: ClassVar[tuple] = ("visit_type", "notes")


class AppointmentIn(BaseModel):
    clinic: str
    date: Optional[str] = None
    time: str
    patient_name: str
    patient_id: Optional[str] = None
    visit_type: str
    duration: int = 30
    status: Literal["programmato", "in_attesa", "in_corso", "completato", "annullato"] = "programmato"
    notes: str = ""


class AppointmentPatch(BaseModel):
    clinic: Optional[str] = None
    date: Optional[str] = None
    time: Optional[str] = None
    patient_name: Optional[str] = None
    patient_id: Optional[str] = None
    visit_type: Optional[str] = None
    duration: Optional[int] = None
    status: Optional[Literal["programmato", "in_attesa", "in_corso", "completato", "annullato"]] = None
    notes: Optional[str] = None


class WaitingPatient(BaseDocument):
    name: str
    patient_id: Optional[str] = None
    clinic: str
    reason: str
    age: Optional[int] = None
    priority: Literal["normale", "urgente"] = "normale"
    arrived_at: str = Field(default_factory=now_iso)
    status: Literal["in_attesa", "in_studio"] = "in_attesa"
    __encrypted__: ClassVar[tuple] = ("reason",)


class WaitingIn(BaseModel):
    name: str
    patient_id: Optional[str] = None
    clinic: str
    reason: str
    age: Optional[int] = None
    priority: Literal["normale", "urgente"] = "normale"


class WaitingPatch(BaseModel):
    name: Optional[str] = None
    patient_id: Optional[str] = None
    clinic: Optional[str] = None
    reason: Optional[str] = None
    age: Optional[int] = None
    priority: Optional[Literal["normale", "urgente"]] = None
    status: Optional[Literal["in_attesa", "in_studio"]] = None


def _num(v):
    try:
        return None if v in (None, "") else float(str(v).replace(",", "."))
    except ValueError:
        return None


Num = Annotated[Optional[float], BeforeValidator(_num)]


class Growth(BaseModel):
    model_config = ConfigDict(extra="ignore")
    eta_mesi: Num = None
    sesso: str = ""
    peso_kg: Num = None
    altezza_cm: Num = None
    circonferenza_cranica_cm: Num = None
    percentile_peso: str = ""
    percentile_altezza: str = ""
    percentile_cc: str = ""


class Drug(BaseModel):
    model_config = ConfigDict(extra="ignore")
    nome: str = ""
    mg_kg_dose: Num = None
    dosi_giorno: Num = None
    concentrazione_mg_ml: Num = None
    max_mg_dose: Num = None
    giorni: Num = None
    note: str = ""


class NoteSection(BaseModel):
    """Voce specialistica dinamica (es. Cardiologia → 'Pressione arteriosa', Ortopedia → 'Range of motion')."""
    model_config = ConfigDict(extra="ignore")
    gruppo: Literal["anamnesi", "sintomi", "parametri_vitali", "esame_obiettivo", "altro", "altre_voci"] = "esame_obiettivo"
    titolo: str = ""
    testo: str = ""
    sezione: str = ""  # sezione del modello checklist (es. "Parametri")
    fonte: Literal["", "ai", "manuale"] = ""
    mancante: bool = False
    da_verificare: bool = False  # "Altre voci" aggiunte da MantAI: nel PDF solo dopo conferma del medico


class NoteModule(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = "generale"
    versione: int = 1
    campi: Dict[str, Any] = Field(default_factory=dict)
    nascosti: List[str] = Field(default_factory=list)  # personalizzazione del medico al momento della visita
    ordine: List[str] = Field(default_factory=list)


class ClinicalNote(BaseModel):
    model_config = ConfigDict(extra="ignore")
    specialita: str = ""
    modulo: NoteModule = Field(default_factory=NoteModule)
    sezioni: List[NoteSection] = Field(default_factory=list)
    anamnesi_fisiologica: str = ""
    allergie: str = ""
    farmaci_in_uso: str = ""
    motivo_visita: str = ""
    sintomi: str = ""
    esame_obiettivo: str = ""
    crescita: Growth = Field(default_factory=Growth)
    diagnosi: str = ""
    terapia: str = ""
    farmaci: List[Drug] = Field(default_factory=list)
    follow_up: str = ""
    riepilogo: str = ""  # riassunto in parole semplici per paziente / genitori

    @model_validator(mode="before")
    @classmethod
    def _to_modules(cls, v):
        return upgrade_note(v) if isinstance(v, dict) else v


class Consultation(BaseDocument):
    patient_name: str
    patient_id: Optional[str] = None
    clinic: str = ""
    waiting_id: Optional[str] = None
    transcript: str = ""
    note: ClinicalNote
    status: Literal["processing", "ready", "failed"] = "ready"
    ai_error: str = ""
    ai_step: str = ""
    duration_sec: int = 0
    report_sent_at: Optional[str] = None
    report_sent_to: Optional[str] = None
    paper_consent: bool = False
    doctor_id: Optional[str] = None
    ai_sec: float = 0
    finalized_at: Optional[str] = None
    pdf_exports: int = 0
    portal_published: bool = False
    portal_hidden_by_parent: bool = False
    guardian_hidden: bool = False  # visita riservata ai tutori (es. Ginecologia di paziente minorenne)
    guardian_shared_at: Optional[str] = None
    signed_at: Optional[str] = None
    obscured: bool = False
    fse: Optional[dict] = None
    template_id: Optional[str] = None
    template_name: str = ""
    template_fields: List[dict] = Field(default_factory=list)
    previsit: Optional[dict] = None
    checklist_id: str = ""
    checklist_manual: Optional[dict] = None
    ai_provenance: Optional[dict] = Field(default_factory=lambda: {"ai_generated": False})
    ai_snapshot: Optional[dict] = None
    note_schema: int = 2
    created_at: str = Field(default_factory=now_iso)
    __encrypted__: ClassVar[tuple] = ("transcript", "note", "report_sent_to", "previsit", "ai_snapshot", "checklist_manual")

    def out(self):
        d = self.model_dump(by_alias=False, exclude={"ai_snapshot"})
        d["ai_fields_pending"] = prov.pending_fields(self.ai_provenance, self.ai_snapshot, d["note"])
        return d


class ConsultationIn(BaseModel):
    patient_name: str
    patient_id: Optional[str] = None
    clinic: str = ""
    waiting_id: Optional[str] = None
    transcript: str
    duration_sec: int = 0
    paper_consent: bool = False
    template_id: Optional[str] = None
    module_id: str = ""
    new_birth_date: str = ""
    new_sex: str = ""


class ConsultationPatch(BaseModel):
    note: ClinicalNote
    growth_only: bool = False  # salvataggi fatti mentre l'IA lavora: solo crescita e farmaci


# ---------- Pediatric models ----------
class Patient(BaseDocument):
    name: str
    birth_date: str
    sex: Literal["F", "M"]
    fiscal_code: str = ""
    guardian: str = ""
    guardian_email: str = ""
    guardian_fiscal_code: str = ""
    allergies: str = ""
    chronic_conditions: str = ""
    therapies: str = ""
    blood_group: str = ""
    field_meta: dict = Field(default_factory=dict)
    notes: str = ""
    consent_at: Optional[str] = None
    consent_version: Optional[str] = None
    consent_email: bool = False
    fse_consent_at: Optional[str] = None
    passport_consent_at: Optional[str] = None
    portal_invited_at: Optional[str] = None
    created_at: str = Field(default_factory=now_iso)
    __encrypted__: ClassVar[tuple] = ("fiscal_code", "guardian", "guardian_email", "guardian_fiscal_code", "allergies", "notes",
                                      "chronic_conditions", "therapies", "blood_group")


class PatientIn(BaseModel):
    name: str
    birth_date: str
    sex: Literal["F", "M"]
    fiscal_code: str = ""
    guardian: str = ""
    guardian_email: str = ""
    guardian_fiscal_code: str = ""
    allergies: str = ""
    chronic_conditions: str = ""
    therapies: str = ""
    blood_group: str = ""
    notes: str = ""


class PatientPatch(BaseModel):
    name: Optional[str] = None
    birth_date: Optional[str] = None
    sex: Optional[Literal["F", "M"]] = None
    fiscal_code: Optional[str] = None
    guardian_email: Optional[str] = None
    guardian: Optional[str] = None
    guardian_fiscal_code: Optional[str] = None
    allergies: Optional[str] = None
    chronic_conditions: Optional[str] = None
    therapies: Optional[str] = None
    blood_group: Optional[str] = None
    notes: Optional[str] = None


class Measurement(BaseDocument):
    patient_id: str
    date: str
    clinic: str = ""
    weight: Num = None
    height: Num = None
    hc: Num = None
    source: str = "manuale"
    consultation_id: Optional[str] = None
    __encrypted__: ClassVar[tuple] = ("weight", "height", "hc")


class MeasurementIn(BaseModel):
    date: str
    clinic: str = ""
    weight: Num = None
    height: Num = None
    hc: Num = None


class CheckpointDoc(BaseDocument):
    patient_id: str
    band_id: str
    band_label: str
    age_months: float
    clinic: str = ""
    answers: dict
    result: dict
    created_at: str = Field(default_factory=now_iso)
    __encrypted__: ClassVar[tuple] = ("answers", "result")


class CheckpointIn(BaseModel):
    answers: dict
    clinic: str = ""


def age_label(m: float) -> str:
    m = round(m, 1)
    if m < 1:
        return "neonato"
    if m < 24:
        return f"{int(m)} {'mese' if int(m) == 1 else 'mesi'}"
    y, r = int(m // 12), int(m % 12)
    return f"{y} anni" + (f" e {r} {'mese' if r == 1 else 'mesi'}" if r and y < 6 else "")


def patient_out(doc) -> dict:
    p = Patient.from_mongo(doc).out()
    m = age_months(p["birth_date"])
    return {**p, "age_months": round(m, 1), "age_label": age_label(m)}


async def get_patient(pid: Optional[str]):
    if not pid or not ObjectId.is_valid(pid):
        return None
    doc = await tdb.patients.find_one({"_id": ObjectId(pid)})
    return unseal_fields(doc, Patient.__encrypted__) if doc else None


def enrich_growth(note: ClinicalNote, patient: Optional[dict], visit_day: date):
    if note.modulo.id != "pediatria":
        return  # percentili OMS solo nel modulo Pediatria
    g = note.crescita
    if patient:
        g.sesso = patient["sex"]
        g.eta_mesi = round(age_months(patient["birth_date"], visit_day), 1)
    if g.eta_mesi is None or g.sesso not in ("M", "F"):
        return
    pc = all_percentiles(g.sesso, g.eta_mesi, g.peso_kg, g.altezza_cm, g.circonferenza_cranica_cm)
    for key, field in (("peso", "percentile_peso"), ("altezza", "percentile_altezza"), ("cc", "percentile_cc")):
        if pc[key]:
            setattr(g, field, pc[key]["label"] + (f" (z {pc[key]['z']:+.2f})".replace(".", ",") if pc[key]["in_range"] else ""))


async def sync_measurement(c: dict):
    g = (c.get("note") or {}).get("crescita") or {}
    if not c.get("patient_id") or not any(g.get(k) for k in ("peso_kg", "altezza_cm", "circonferenza_cranica_cm")):
        return
    m = Measurement(patient_id=c["patient_id"], date=c["created_at"][:10], clinic=c.get("clinic", ""), weight=g.get("peso_kg"),
                    height=g.get("altezza_cm"), hc=g.get("circonferenza_cranica_cm"), source="visita", consultation_id=c["id"])
    await tdb.measurements.update_one({"consultation_id": c["id"]}, {"$set": m.to_mongo()}, upsert=True)


# ---------- Seed (pediatric v2) ----------
SEED_PATIENTS = [
    # name, sex, age_months, z_weight, z_height, guardian, allergies, notes
    ("Sofia Russo", "F", 2.2, 0.2, 0.1, "Mamma: Giulia Russo", "", ""),
    ("Leonardo Colombo", "M", 18.4, 0.4, 0.6, "Papà: Marco Colombo", "", ""),
    ("Aurora Ricci", "F", 50.3, -0.3, 0.2, "Mamma: Elisa Ricci", "Amoxicillina (rash cutaneo)", ""),
    ("Francesco Bruno", "M", 6.1, 0.8, 0.5, "Mamma: Chiara Bruno", "", ""),
    ("Ginevra Marino", "F", 110.0, 0.5, 0.9, "Mamma: Laura Marino", "Acari della polvere", "Dermatite atopica"),
    ("Tommaso Greco", "M", 38.5, -1.2, -0.9, "Papà: Andrea Greco", "", "Monitoraggio accrescimento"),
    ("Alice Conti", "F", 12.1, 0.0, 0.3, "Mamma: Sara Conti", "", ""),
    ("Edoardo Gallo", "M", 88.2, 1.4, 0.6, "Mamma: Valentina Gallo", "", ""),
    ("Beatrice Lombardi", "F", 64.4, 0.1, 0.0, "Papà: Luca Lombardi", "", "Asma lieve, salbutamolo al bisogno"),
    ("Mattia Moretti", "M", 170.0, 0.3, 0.4, "Mamma: Francesca Moretti", "Nichel", ""),
    ("Pietro Fontana", "M", 27.3, 0.2, -0.1, "Mamma: Ilaria Fontana", "", ""),
]
SEED_APPTS = [
    ("Studio Centro", "08:30", "Sofia Russo", "Bilancio di salute del 2° mese", "completato"),
    ("Studio Centro", "09:00", "Leonardo Colombo", "Febbre e otalgia", "in_attesa"),
    ("Studio Centro", "09:30", "Aurora Ricci", "Tosse persistente da 10 giorni", "in_attesa"),
    ("Studio Centro", "10:15", "Francesco Bruno", "Bilancio 6° mese · avvio svezzamento", "programmato"),
    ("Studio Centro", "11:00", "Ginevra Marino", "Controllo dermatite atopica", "programmato"),
    ("Studio Centro", "12:00", "Tommaso Greco", "Controllo accrescimento staturo-ponderale", "programmato"),
    ("Studio Provincia", "15:00", "Alice Conti", "Bilancio di salute del 12° mese", "programmato"),
    ("Studio Provincia", "15:45", "Edoardo Gallo", "Dolori addominali ricorrenti", "programmato"),
    ("Studio Provincia", "16:30", "Beatrice Lombardi", "Controllo asma", "programmato"),
    ("Studio Provincia", "17:15", "Mattia Moretti", "Cefalea ricorrente", "programmato"),
]
SEED_WAITING = [
    ("Leonardo Colombo", "Studio Centro", "Febbre a 39,5 °C da ieri sera, si tocca l'orecchio", "urgente", 18),
    ("Aurora Ricci", "Studio Centro", "Tosse persistente da 10 giorni, soprattutto notturna", "normale", 9),
    ("Pietro Fontana", "Studio Centro", "Esantema comparso stamattina — senza appuntamento", "normale", 3),
]
HISTORY_MONTHS = [0, 1, 3, 6, 9, 12, 18, 24, 36, 48, 60, 72, 96, 120, 144]


def _val(ind, sex, m, z):
    p = lms(ind, sex, m)
    return round(value_at(*p, z), 1) if p else None


async def seed_pediatric():
    meta = await db.meta.find_one({"_id": "seed"})
    if meta and meta.get("v", 0) >= 2:
        return
    await tdb.appointments.delete_many({})
    await tdb.waiting.delete_many({})
    await tdb.patients.delete_many({})
    await tdb.measurements.delete_many({})
    today = date.today()
    ids = {}
    for i, (name, sex, months, zw, zh, guardian, allergies, notes) in enumerate(SEED_PATIENTS):
        birth = today - timedelta(days=round(months * 30.4375))
        res = await tdb.patients.insert_one(Patient(name=name, birth_date=birth.isoformat(), sex=sex, guardian=guardian,
                                                   allergies=allergies, notes=notes).to_mongo())
        pid = str(res.inserted_id)
        ids[name] = pid
        past = [m for m in HISTORY_MONTHS if m < months - 0.7][-4:]
        for j, m in enumerate(past):
            jitter = ((i + j) % 3 - 1) * 0.08
            clinic = CLINICS[(i + j) % 2]
            day = birth + timedelta(days=round(m * 30.4375))
            await tdb.measurements.insert_one(Measurement(
                patient_id=pid, date=day.isoformat(), clinic=clinic, source="storico",
                weight=_val("wfa", sex, m, zw + jitter), height=_val("lhfa", sex, m, zh + jitter),
                hc=_val("hcfa", sex, m, 0.2 + jitter)).to_mongo())
        if past:
            m = past[-1]
            day = birth + timedelta(days=round(m * 30.4375))
            note = ClinicalNote(motivo_visita="Bilancio di salute", anamnesi_fisiologica="Storico importato dal passaporto sanitario.",
                                diagnosi="Crescita regolare, sviluppo adeguato all'età.", follow_up="Prossimo bilancio di salute come da calendario.")
            note.crescita = Growth(peso_kg=_val("wfa", sex, m, zw), altezza_cm=_val("lhfa", sex, m, zh), circonferenza_cranica_cm=_val("hcfa", sex, m, 0.2))
            enrich_growth(note, {"sex": sex, "birth_date": birth.isoformat()}, day)
            await tdb.consultations.insert_one(Consultation(
                patient_name=name, patient_id=pid, clinic=CLINICS[(i + len(past) - 1) % 2], transcript="Visita registrata nello storico.",
                note=note, created_at=datetime.combine(day, datetime.min.time(), timezone.utc).replace(hour=10).isoformat()).to_mongo())
    await tdb.appointments.insert_many([
        Appointment(clinic=c, time=t, patient_name=p, patient_id=ids[p], visit_type=v, status=s).to_mongo()
        for c, t, p, v, s in SEED_APPTS])
    base = datetime.now(timezone.utc).timestamp()
    await tdb.waiting.insert_many([
        WaitingPatient(name=n, patient_id=ids[n], clinic=c, reason=r, priority=p,
                       arrived_at=datetime.fromtimestamp(base - mins * 60, timezone.utc).isoformat()).to_mongo()
        for n, c, r, p, mins in SEED_WAITING])
    await db.meta.update_one({"_id": "seed"}, {"$set": {"v": 2}}, upsert=True)


async def resume_consult_jobs():
    """Dopo un riavvio del server riprende le elaborazioni rimaste a metà."""
    async for d in db.consultations.find({"status": "processing"}, {"owner_id": 1}):
        if await db.consult_jobs.find_one({"consultation_id": str(d["_id"])}):
            spawn_consult_job(str(d["_id"]), d["owner_id"])
        else:
            await db.consultations.update_one({"_id": d["_id"]}, {"$set": {"status": "failed", "ai_error": "Elaborazione interrotta: incolli la trascrizione o compili la cartella a mano"}})
    asyncio.ensure_future(sweep_audio_loop())
    asyncio.ensure_future(team_migrate())
    asyncio.ensure_future(ai_migrate())
    asyncio.ensure_future(run_provenance_migration())
    asyncio.ensure_future(run_bodychart_photo_migration())
    asyncio.ensure_future(run_module_migration())


async def run_module_migration():
    """Cartelle esistenti → base comune + modulo di specialità (schema 2). Idempotente, senza perdita di dati."""
    try:
        n = 0
        async for d in db.consultations.find({"note_schema": {"$ne": 2}}, {"note": 1, "ai_snapshot": 1, "owner_id": 1, "rev": 1}):
            raw = unseal_fields(d, ("note", "ai_snapshot"))
            note = dict(raw.get("note") or {})
            if not (note.get("modulo") or {}).get("id") and not note.get("specialita"):
                note["modulo"] = {**(note.get("modulo") or {}), "id": module_for(await doctor_specialty(d.get("owner_id")))}
            sets = {"note": ClinicalNote.model_validate(note).model_dump()}
            if raw.get("ai_snapshot"):
                sets["ai_snapshot"] = upgrade_note({**raw["ai_snapshot"], "modulo": sets["note"]["modulo"] | {"campi": {}}})
            r = await db.consultations.update_one({"_id": d["_id"], "rev": d.get("rev")}, {"$set": {**Consultation.sealed_set(sets), "note_schema": 2}})
            n += r.modified_count
        for owner in await db.visit_templates.distinct("owner_id", {"module_id": {"$exists": False}}):
            await db.visit_templates.update_many({"owner_id": owner, "module_id": {"$exists": False}},
                                                 {"$set": {"module_id": module_for(await doctor_specialty(owner))}})
        await db.meta.update_one({"_id": "note_schema"}, {"$set": {"version": 2, "at": now_iso()}}, upsert=True)
        logger.info("Migrazione cartelle → moduli di specialità: %s visite convertite", n)
    except Exception:
        logger.exception("Migrazione moduli di specialità non riuscita")


async def run_bodychart_photo_migration():
    try:
        logger.info("Foto bodychart ripulite e cifrate: %s", await bc_migrate_photos())
    except Exception:
        logger.exception("Migrazione foto bodychart non riuscita")


async def run_provenance_migration():
    try:
        logger.info("Migrazione ai_provenance: %s", await prov.migrate(db))
    except Exception:
        logger.exception("Migrazione ai_provenance non riuscita")


async def sweep_audio():
    """Elimina gli audio cifrati rimasti senza job (job scaduti dopo JOB_TTL_DAYS)."""
    old = datetime.now(timezone.utc) - timedelta(days=1)  # job attivi referenziano i loro file; parti orfane dopo 1 giorno
    async for f in db["consult_audio.files"].find({"uploadDate": {"$lt": old}}, {"_id": 1}):
        if not await db.consult_jobs.find_one({"$or": [{"audio_file": f["_id"]}, {"audio_files": f["_id"]}]}):
            await audio_fs.delete(f["_id"])


async def sweep_audio_loop():
    while True:
        try:
            await sweep_audio()
        except Exception:
            logger.exception("Pulizia audio non riuscita")
        await asyncio.sleep(6 * 3600)


@app.on_event("startup")
async def seed():
    asyncio.get_event_loop().call_later(3, lambda: asyncio.ensure_future(resume_consult_jobs()))
    foti = await seed_doctor(db)
    await seed_admin(db)
    await ensure_doctor_slugs()
    await db.password_resets.create_index("expires_at", expireAfterSeconds=0)
    await db.password_resets.create_index("token")
    set_tenant(foti, CLINICS)
    for name in (*ENCRYPTED_COLLECTIONS, "audit"):
        await db[name].update_many({"owner_id": {"$exists": False}}, {"$set": {"owner_id": foti}})
        await db[name].create_index("owner_id")
    await seed_pediatric()
    await encrypt_existing()
    async for p in db.patients.find({"cf_hash": {"$exists": False}}):
        cf = unseal_fields(p, ("fiscal_code",)).get("fiscal_code") or ""
        await db.patients.update_one({"_id": p["_id"]}, {"$set": {"cf_hash": cf_hash(cf) if cf.strip() else None}})
    await db.patients.create_index("cf_hash")
    await db.signed_docs.create_index("file_sha256")
    await db.signed_docs.create_index("patient_ids")
    await db.verify_hits.create_index("at", expireAfterSeconds=3600)
    await db.verify_hits.create_index("ip")
    await db.consult_jobs.create_index("expires_at", expireAfterSeconds=0)
    await db.consult_jobs.create_index("consultation_id")
    await hp_indexes()


# ---------- Routes ----------
@public_api.get("/")
async def root():
    return {"app": "MantMed", "ok": True}


@public_api.get("/auth/me")
async def me(user: dict = Depends(current_user)):
    return user


@public_api.get("/specialty-modules")
async def specialty_modules():
    return modules_catalog()


@api.get("/clinics")
async def clinics():
    return tenant_clinics()


@api.get("/appointments")
async def list_appointments():
    docs = await tdb.appointments.find({"date": {"$in": [None, today_rome()]}}).sort("time", 1).to_list(500)
    return [Appointment.from_mongo(d).out() for d in docs]


@api.get("/appointments/upcoming")
async def upcoming_appointments():
    docs = await tdb.appointments.find({"date": {"$gt": today_rome()}, "status": {"$ne": "annullato"}}).sort([("date", 1), ("time", 1)]).to_list(200)
    return [Appointment.from_mongo(d).out() for d in docs]


@api.post("/appointments")
async def create_appointment(body: AppointmentIn):
    appt = Appointment(**{**body.model_dump(), "date": body.date or today_rome()})
    res = await tdb.appointments.insert_one(appt.to_mongo())
    appt.id = str(res.inserted_id)
    return appt.out()


@api.patch("/appointments/{aid}")
async def update_appointment(aid: str, body: AppointmentPatch):
    upd = body.model_dump(exclude_none=True)
    sets = Appointment.sealed_set(upd)
    if "date" in upd or "time" in upd:
        sets["reminder_sent_at"] = None
    doc = await tdb.appointments.find_one_and_update({"_id": oid(aid)}, {"$set": sets}, return_document=True)
    if not doc:
        raise HTTPException(404, "Appuntamento non trovato")
    return Appointment.from_mongo(doc).out()


@api.delete("/appointments/{aid}")
async def delete_appointment(aid: str):
    res = await tdb.appointments.delete_one({"_id": oid(aid)})
    if not res.deleted_count:
        raise HTTPException(404, "Appuntamento non trovato")
    return {"deleted": aid}


@api.get("/waiting")
async def list_waiting():
    docs = await tdb.waiting.find().sort("arrived_at", 1).to_list(500)
    items = [WaitingPatient.from_mongo(d).out() for d in docs]
    return sorted(items, key=lambda w: (w["priority"] != "urgente", w["arrived_at"]))


@api.post("/waiting")
async def create_waiting(body: WaitingIn):
    w = WaitingPatient(**body.model_dump())
    res = await tdb.waiting.insert_one(w.to_mongo())
    w.id = str(res.inserted_id)
    return w.out()


@api.patch("/waiting/{wid}")
async def update_waiting(wid: str, body: WaitingPatch):
    doc = await tdb.waiting.find_one_and_update({"_id": oid(wid)}, {"$set": WaitingPatient.sealed_set(body.model_dump(exclude_none=True))}, return_document=True)
    if not doc:
        raise HTTPException(404, "Paziente non trovato")
    return WaitingPatient.from_mongo(doc).out()


@api.delete("/waiting/{wid}")
async def delete_waiting(wid: str):
    res = await tdb.waiting.delete_one({"_id": oid(wid)})
    if not res.deleted_count:
        raise HTTPException(404, "Paziente non trovato")
    return {"deleted": wid}


@api.post("/consultations/transcribe")
async def transcribe(audio: UploadFile = File(...)):
    data = await audio.read()
    if not data:
        raise HTTPException(400, "Audio vuoto")
    if len(data) > 25 * 1024 * 1024:
        raise HTTPException(413, "Audio oltre 25 MB")
    buf = io.BytesIO(data)
    buf.name = audio.filename or "consultazione.webm"
    try:
        stt = OpenAISpeechToText(api_key=LLM_KEY)
        res = await stt.transcribe(file=buf, model="whisper-1", response_format="json", language="it",
                                   prompt="Visita pediatrica specialistica: pediatra, genitori e bambino. Termini: allattamento, svezzamento, otoscopia, percentile, mg/kg.")
    except Exception as e:
        logger.exception("Trascrizione fallita")
        raise HTTPException(502, f"Trascrizione fallita: {e}")
    return {"transcript": (res.text or "").strip()}


NOTE_SYSTEM = (
    "Sei un assistente clinico per una pediatra specialista italiana. Ricevi la trascrizione di una visita pediatrica "
    "e compili la CARTELLA PEDIATRICA STANDARD. Rispondi SOLO con un JSON valido con queste chiavi:\n"
    "anamnesi_fisiologica, allattamento, svezzamento, motivo_visita, sintomi, torl, torace_auscultazione, addome, "
    "diagnosi, terapia, follow_up (stringhe in italiano, concise e cliniche);\n"
    + "{NEW_BASE}" +
    "crescita: {eta_mesi (numero|null), sesso ('M'|'F'|''), peso_kg (numero|null), altezza_cm (numero|null), "
    "circonferenza_cranica_cm (numero|null), percentile_peso, percentile_altezza, percentile_cc (stringhe)};\n"
    "farmaci: lista di {nome, mg_kg_dose (numero|null), dosi_giorno (intero|null), concentrazione_mg_ml (numero|null), "
    "max_mg_dose (numero|null), giorni (intero|null), note}.\n"
    "Regole: usa solo informazioni presenti nella trascrizione. Se un campo testuale manca scrivi 'Non riportato'; "
    "se un numero manca usa null. Per i farmaci riporta SOLO quelli prescritti dal medico e SOLO i dosaggi da lui indicati: "
    "non proporre mai dosaggi o farmaci non menzionati. torl = testa, orecchie, rino, laringe/faringe (otoscopia, faringe, linfonodi)."
)
NEW_BASE = ("esame_obiettivo (condizioni generali del paziente ed esame obiettivo generale, solo se descritti), allergie (allergie e intolleranze riferite), "
            "farmaci_in_uso (farmaci già in uso riferiti): stringhe; se non dette usa \"\" (stringa vuota, non 'Non riportato');\n"
            "motivo_visita: il motivo per cui il paziente è venuto, come emerge dalla conversazione (anche se lo dice il paziente), in poche parole;\n")
# Fedeltà: vale per ogni campo della cartella e per il riepilogo al paziente
FAITHFUL = (" FEDELTÀ ASSOLUTA: riporta solo ciò che è stato detto. Non aggiungere giudizi sui valori (alto, basso, normale, nella norma, elevato, "
            "aumentato, ridotto, buono, preoccupante…) se il medico non ha usato esattamente quel giudizio per quel dato; scrivi il valore com'è stato detto. "
            "Non interpretare, non dedurre diagnosi, non aggiungere indicazioni su farmaci (inclusi 'prosegua'/'continui'/'sospenda'), "
            "comportamenti, dieta o controlli che il medico non ha detto esplicitamente. Ciò che dice il paziente va attribuito al paziente ('riferisce').")
NOTE_SYSTEM = NOTE_SYSTEM.replace("{NEW_BASE}", NEW_BASE) + FAITHFUL


def clean_specialty(raw: str) -> str:
    s = re.sub(r"^(medico\s+)?(specialista|specializzat[oa])\s+in\s+", "", (raw or "").strip(), flags=re.I).strip(" .")
    return s or "Pediatria"


def is_pediatric(spec: str) -> bool:
    return bool(re.search(r"pediatr|neonatolog", spec or "", re.I))


async def doctor_specialty(uid: Optional[str]) -> str:
    """Specializzazione dal profilo del medico (Area Riservata); per lo studio fondatore senza profilo, DOCTOR_SPECIALTY."""
    u = await db.users.find_one({"_id": ObjectId(uid)}, {"profile": 1}) if uid and ObjectId.is_valid(uid) else None
    return clean_specialty(((u or {}).get("profile") or {}).get("specialty") or os.environ.get("DOCTOR_SPECIALTY", "Pediatria"))


def note_system(spec: str, fields: Optional[list] = None, mid: str = "", hidden: Optional[list] = None) -> str:
    head = (f"Sei un assistente medico specializzato in {spec}. Estrai le informazioni dalla seguente trascrizione e compilale "
            "nei campi standard pertinenti per questa specifica branca medica. Rispondi SOLO con un JSON valido.\n")
    rules = ("Regole: usa solo informazioni presenti nella trascrizione. Se un campo testuale manca scrivi 'Non riportato'; se un numero manca usa null. "
             "Per i farmaci riporta SOLO quelli prescritti dal medico e SOLO i dosaggi da lui indicati: non proporre mai dosaggi o farmaci non menzionati." + FAITHFUL)
    drugs = ("farmaci: lista di {nome, mg_kg_dose (numero|null), dosi_giorno (intero|null), concentrazione_mg_ml (numero|null), "
             "max_mg_dose (numero|null), giorni (intero|null), note}.\n")
    if (mid or module_for(spec)) == "pediatria":
        return head + "Chiavi:\n" + NOTE_SYSTEM.split("\n", 1)[1].replace("\nRegole:", "\n" + fields_prompt(fields) + "Regole:", 1) if fields else head + "Chiavi:\n" + NOTE_SYSTEM.split("\n", 1)[1]
    if (mid or module_for(spec)) in STRUCTURED:
        return head + (
            "Chiavi:\n"
            "motivo_visita, anamnesi_fisiologica (anamnesi generale: patologica remota e prossima, familiarità), sintomi, "
            "diagnosi (solo la diagnosi detta dal medico), terapia, follow_up: stringhe in italiano, concise; \"\" se non dette;\n" + NEW_BASE +
            module_prompt(mid or module_for(spec), hidden or []) + (fields_prompt(fields) if fields else "") +
            "Regole: usa solo informazioni presenti nella trascrizione. Non proporre mai farmaci, dosaggi, diagnosi o accertamenti non menzionati." + FAITHFUL)
    if fields:
        return head + (
            "Chiavi:\n"
            "anamnesi_fisiologica (anamnesi generale: patologica remota e prossima, familiarità), motivo_visita, sintomi, "
            "diagnosi, terapia, follow_up (stringhe in italiano, concise e cliniche);\n" + NEW_BASE + fields_prompt(fields) +
            "crescita: {peso_kg (numero|null), altezza_cm (numero|null)} solo se riportati;\n" + drugs + rules)
    return head + (
        "Chiavi:\n"
        "anamnesi_fisiologica (anamnesi generale: patologica remota e prossima, familiarità), motivo_visita, sintomi, "
        "diagnosi, terapia, follow_up (stringhe in italiano, concise e cliniche);\n" + NEW_BASE +
        f"sezioni: lista di {{gruppo, titolo, testo}} con le voci SPECIFICHE di {spec}. gruppo è uno tra 'anamnesi', 'sintomi', 'esame_obiettivo', 'altro'. "
        f"Per l'esame obiettivo usa i distretti e le manovre tipici di {spec} (es. Cardiologia: Pressione arteriosa, Frequenza cardiaca, Auscultazione cardiaca, ECG; "
        "Ortopedia: Ispezione, Palpazione, Range of motion, Test specifici, Imaging; Dermatologia: Sede e morfologia delle lesioni, Dermatoscopia). "
        "Includi da 3 a 8 voci di esame obiettivo pertinenti e, se utili, voci specifiche di anamnesi o sintomi (es. scala del dolore, classe NYHA). "
        "Non ripetere nelle sezioni contenuti già scritti in anamnesi_fisiologica, motivo_visita, sintomi, diagnosi o terapia; usa 'altro' per accertamenti e indagini programmate;\n"
        "crescita: {peso_kg (numero|null), altezza_cm (numero|null)} solo se riportati;\n" + drugs + rules)


async def patient_summary(spec: str, transcript: str = "", note: Optional[dict] = None, session: str = "") -> str:
    """Riepilogo della visita in parole semplici per i genitori (pediatria) o per il paziente."""
    ped = is_pediatric(spec)
    who = "i genitori del bambino (dia del Lei ai genitori e parli del bambino in terza persona)" if ped else "il paziente (gli dia del Lei)"
    system = (f"Sei l'assistente di un medico specializzato in {spec}: scrivi a {who} un riepilogo della visita in italiano semplice. "
              "Il tuo unico compito è RIFORMULARE in parole semplici ciò che il medico ha detto: non sei tu a valutare. Massimo 130 parole, 3-5 frasi brevi o un breve elenco. "
              "Riporta: cosa il medico ha riscontrato o detto, con le sue parole semplificate; i valori misurati così come detti, SENZA aggettivi di giudizio "
              "(mai alto, basso, normale, nella norma, elevato, aumentato, buono, preoccupante, a meno che il medico abbia detto proprio quel giudizio per quel dato); "
              "le indicazioni (farmaci, dosi, comportamenti, controlli) SOLO se il medico le ha date esplicitamente, nella stessa forma detta "
              "(non calcolare, convertire o arrotondare dosi; un farmaco che il paziente dice di prendere NON diventa un'indicazione a proseguirlo); "
              "quando tornare a controllo e i segnali per ricontattare lo studio solo se il medico li ha indicati. "
              "Se il medico non ha dato indicazioni, non scriverne. Nessuna interpretazione, nessuna rassicurazione o preoccupazione aggiunta, nessun termine tecnico senza spiegazione. "
              "Non inserire saluti, firme o intestazioni. Rispondi solo con il testo del riepilogo.")
    src = (f"Cartella clinica validata dal medico (JSON):\n{json.dumps({k: v for k, v in (note or {}).items() if k not in ('sezioni',) and v}, ensure_ascii=False)[:6000]}\n\n" if note else "") \
        + (f"Trascrizione della visita:\n{transcript[:12000]}" if transcript else "")
    chat = LlmChat(api_key=LLM_KEY, session_id=session or f"sum-{uuid.uuid4()}", system_message=system).with_model("openai", "gpt-5.6-terra")
    out = (await chat.send_message(UserMessage(text=src))).strip()
    return re.sub(r"^\s*(riepilogo|gentil[ei][^\n]*)[:,]?\s*\n", "", out, flags=re.I).strip()[:1500]


async def _safe_summary(spec: str, transcript: str, session: str) -> str:
    try:
        return await patient_summary(spec, transcript=transcript, session=session)
    except Exception:
        logger.exception("Riepilogo per il paziente non generato")
        return ""


async def structure_note(transcript: str, session: str, specialty: str = "Pediatria", fields: Optional[list] = None, context: str = "",
                         mid: str = "", layout: Optional[dict] = None) -> ClinicalNote:
    spec = clean_specialty(specialty)
    mid = mid or module_for(spec)
    layout = layout or {"nascosti": [], "ordine": []}
    chat = LlmChat(api_key=LLM_KEY, session_id=session, system_message=note_system(spec, fields, mid, layout["nascosti"])).with_model("openai", "gpt-5.6-terra")
    raw = await chat.send_message(UserMessage(text=f"Trascrizione:\n{transcript}{context}"))
    match = re.search(r"\{.*\}", raw, re.S)
    data = json.loads(match.group(0)) if match else {}
    text_keys = [k for k, f in ClinicalNote.model_fields.items() if f.annotation is str]
    clean = {k: str(data.get(k) or "") for k in text_keys}
    clean["specialita"] = spec
    clean["crescita"] = data.get("crescita") if isinstance(data.get("crescita"), dict) else {}
    clean["farmaci"] = [d for d in data.get("farmaci") or [] if isinstance(d, dict)]
    if mid in STRUCTURED:
        clean["farmaci"] = []  # moduli strutturati: la prescrizione resta nel testo di "Terapia", come detta
        campi, altre = parse_module(mid, data)
        clean["sezioni"] = (map_fields(fields, data.get("campi_modello")) if fields else []) + altre
    else:
        campi = {k: str(data.get(k) or "") for k in module_keys(mid)}
        sez = []
        for d in data.get("sezioni") or []:
            if isinstance(d, dict) and str(d.get("titolo") or "").strip():
                g = d.get("gruppo") if d.get("gruppo") in ("anamnesi", "sintomi", "esame_obiettivo", "altro") else "esame_obiettivo"
                sez.append({"gruppo": g, "titolo": str(d["titolo"])[:80], "testo": str(d.get("testo") or "Non riportato")})
        clean["sezioni"] = map_fields(fields, data.get("campi_modello")) if fields else sez[:20]
    for k in layout["nascosti"]:
        campi[k] = {"v": None, "note": "", "verifica": False} if isinstance(campi.get(k), dict) else [] if isinstance(campi.get(k), list) else ""
    clean["modulo"] = {"id": mid, "campi": campi, **layout}
    return ClinicalNote.model_validate(clean)


async def llm_json(prompt: str) -> dict:
    chat = LlmChat(api_key=LLM_KEY, session_id=f"tpl-{uuid.uuid4()}", system_message="Rispondi solo con JSON valido.").with_model("openai", "gpt-5.6-terra")
    return parse_json(await chat.send_message(UserMessage(text=prompt)))


tpl_router, resolve_template = build_visit_templates(db, tdb, doctor_specialty, llm_json)
module_router, doctor_module, module_layout, visit_module_options = build_module_settings(db, tdb, doctor_specialty, OWNER.get)


async def free_visit_patient(name: str, birth_date: str, sex: str) -> str:
    """Visita libera: crea la scheda paziente (nome, nascita, sesso) con il consenso privacy cartaceo confermato dal medico."""
    try:
        date.fromisoformat(birth_date)
    except ValueError:
        raise HTTPException(400, "Data di nascita non valida")
    if sex not in ("F", "M"):
        raise HTTPException(400, "Indichi il sesso del paziente")
    res = await tdb.patients.insert_one({**Patient(name=name.strip(), birth_date=birth_date, sex=sex).to_mongo(), "cf_hash": None})
    pid = str(res.inserted_id)
    c = Consent(patient_id=pid, signer_name=name.strip(), signer_relation="Paziente o tutore", privacy_policy=True, health_data=True,
                method="modulo_cartaceo", channel="studio")
    await tdb.consents.insert_one(c.to_mongo())
    await refresh_patient_consent(pid)
    await audit("paziente_creato_da_visita_libera", name.strip())
    return pid


async def visit_setup(uid: str, tpl: dict, patient: Optional[dict], module_id: str = "") -> dict:
    """Modulo della visita (menu della visita, altrimenti quello predefinito del medico), personalizzazione e campi del modello senza doppioni."""
    opts = await visit_module_options(uid)
    key = module_id or await doctor_module(uid)
    opt = next((o for o in opts if key in (o["key"], o["id"])), None)
    if not opt:
        raise HTTPException(400, "Modulo non disponibile per le sue specialità")
    mid = opt["id"]
    fields = tpl["fields"] if tpl.get("module_id") in (None, "", mid) else []  # i modelli visita valgono solo per la loro specialità
    minor = bool(patient and patient.get("birth_date") and age_months(patient["birth_date"]) < 216)
    return {"mid": mid, "layout": await module_layout(uid, mid), "fields": drop_duplicates(fields, mid),
            "guardian_hidden": mid == "ginecologia" and minor, "specialita": opt["specialita"]}


@api.post("/consultations")
async def create_consultation(body: ConsultationIn, user: dict = Depends(current_user)):
    if not body.transcript.strip():
        raise HTTPException(400, "Trascrizione vuota")
    if not body.patient_id and body.paper_consent and body.new_birth_date:
        body.patient_id = await free_visit_patient(body.patient_name, body.new_birth_date, body.new_sex)
    patient = await get_patient(body.patient_id)
    if patient and not patient.get("consent_at"):
        raise HTTPException(412, "Consenso privacy non registrato: registralo nel passaporto prima di avviare la visita")
    if not patient and not body.paper_consent:
        raise HTTPException(412, "Conferma l'acquisizione del consenso privacy per la visita libera")
    t0 = time.monotonic()
    tpl = await resolve_template(body.template_id)
    vs = await visit_setup(user["id"], tpl, patient, body.module_id)
    pv = await latest_previsit(db, body.patient_id, user["id"]) if tpl.get("bilancio") else None
    try:
        note = await structure_note(body.transcript, f"consult-{uuid.uuid4()}", vs["specialita"], vs["fields"] or None,
                                    previsit_prompt(pv) if pv else "", vs["mid"], vs["layout"])
    except Exception as e:
        logger.exception("Strutturazione fallita")
        raise HTTPException(502, f"Generazione nota fallita: {e}")
    enrich_growth(note, patient, date.today())
    c = Consultation(**body.model_dump(exclude={"template_id"}), note=note, doctor_id=user["id"], ai_sec=round(time.monotonic() - t0, 1),
                     template_id=tpl["id"], template_name=tpl["name"], template_fields=vs["fields"], previsit=pv, guardian_hidden=vs["guardian_hidden"],
                     ai_provenance=prov.make(prov.note_tipo(tpl["name"], tpl["fields"], tpl.get("bilancio")), prov.GPT), ai_snapshot=note.model_dump())
    res = await tdb.consultations.insert_one(c.to_mongo())
    c.id = str(res.inserted_id)
    await prov.log(db, user["id"], f"visita di {c.patient_name}", None, prov.DRAFT, tipo=c.ai_provenance["tipo"])
    await sync_measurement(c.out())
    if body.waiting_id and ObjectId.is_valid(body.waiting_id):
        await tdb.waiting.delete_one({"_id": ObjectId(body.waiting_id)})
        await tdb.appointments.update_many({"patient_name": body.patient_name}, {"$set": {"status": "completato"}})
    return c.out()


# ---------- Elaborazione asincrona (Whisper + LLM in background) ----------
WHISPER_PROMPT = "Visita pediatrica specialistica: pediatra, genitori e bambino. Termini: allattamento, svezzamento, otoscopia, percentile, mg/kg."
_RUNNING: set = set()
_TASKS: set = set()
audio_fs = AsyncIOMotorGridFSBucket(db, bucket_name="consult_audio")
JOB_TTL_DAYS = 7
# Frasi tipiche che Whisper "inventa" su audio muto o rumore
HALLUCINATIONS = re.compile(r"amara\.org|sottotitoli[^\n]*|a cura di qtss|grazie per la visione|iscriviti al canale|grazie a tutti per l.ascolto|^\W*(grazie|ciao|buongiorno)\W*$", re.I)


class AIJobError(RuntimeError):
    """Errore mostrato al medico così com'è."""


def friendly_ai_error(e: Exception) -> str:
    if isinstance(e, AIJobError):
        return str(e)
    t = str(e).lower()
    if "transcribe" in t or "audio" in t or "whisper" in t:
        return "Non è stato possibile trascrivere l'audio (formato non valido o registrazione danneggiata). Riprovi o incolli la trascrizione."
    if "rate" in t or "429" in t or "quota" in t or "budget" in t:
        return "Il servizio IA è momentaneamente sovraccarico. Riprovi tra qualche minuto."
    if "timeout" in t or "timed out" in t:
        return "Il servizio IA non ha risposto in tempo. Riprovi."
    return "Elaborazione IA non riuscita. Riprovi tra qualche istante."


async def _whisper(data: bytes, filename: str, context: str = "", strict: bool = True) -> str:
    buf = io.BytesIO(data)
    buf.name = filename or "consultazione.webm"
    stt = OpenAISpeechToText(api_key=LLM_KEY)
    # per le parti successive il prompt include la coda della parte precedente: continuità di nomi e termini
    prompt = (WHISPER_PROMPT + (" Continua da: " + context if context else ""))[-900:]
    res = await stt.transcribe(file=buf, model="whisper-1", response_format="json", language="it", prompt=prompt)
    text = (res.text or "").strip()
    cleaned = HALLUCINATIONS.sub("", text).strip(" .,-")
    if not strict and not cleaned:
        return ""
    if len(cleaned.split()) < 4:
        raise AIJobError("Nessun parlato rilevato nella registrazione: verifichi il microfono e riprovi, oppure incolli la trascrizione.")
    return text


def _apply_doctor(ai: ClinicalNote, mine: dict):
    """Crescita e farmaci inseriti dal medico durante l'elaborazione hanno la precedenza sull'IA."""
    g = (mine or {}).get("crescita") or {}
    for k in ("peso_kg", "altezza_cm", "circonferenza_cranica_cm", "eta_mesi"):
        if g.get(k) not in (None, "", 0):
            setattr(ai.crescita, k, g[k])
    typed = {(x.get("titolo") or "").strip().lower(): x["testo"] for x in (mine or {}).get("sezioni") or []
             if (x.get("testo") or "").strip() and x.get("testo") != "Non riportato"}
    for x in ai.sezioni:
        if x.titolo.strip().lower() in typed:
            x.testo = typed[x.titolo.strip().lower()]
    keep = [d for d in (mine or {}).get("farmaci") or [] if d.get("nome")]
    if keep:
        ai.farmaci = [Drug.model_validate(d) for d in keep]
    if ((mine or {}).get("riepilogo") or "").strip():
        ai.riepilogo = mine["riepilogo"]


async def _drop_job(cid: str):
    job = await db.consult_jobs.find_one_and_delete({"consultation_id": cid})
    for fid in ([job["audio_file"]] if job and job.get("audio_file") else []) + ((job or {}).get("audio_files") or []):
        try:
            await audio_fs.delete(fid)
        except Exception:
            logger.warning("Audio %s già rimosso", fid)


async def run_consult_job(cid: str, owner: str):
    """Trascrizione + compilazione della cartella per una visita in stato 'processing'."""
    if cid in _RUNNING:
        return
    _RUNNING.add(cid)
    OWNER.set(owner)
    t0 = time.monotonic()
    try:
        job = await db.consult_jobs.find_one({"consultation_id": cid, "owner_id": owner})
        if not job:
            raise AIJobError("Registrazione non più disponibile: incolli la trascrizione o compili la cartella a mano.")
        transcript = unseal(job.get("transcript")) or ""
        files = job.get("audio_files") or ([job["audio_file"]] if job.get("audio_file") else [])
        if not transcript and files:
            parts = list(job.get("part_texts") or [])  # parti già trascritte in un tentativo precedente
            for i, fid in enumerate(files):
                if i < len(parts):
                    continue
                if len(files) > 1:
                    await db.consultations.update_one({"_id": ObjectId(cid)}, {"$set": {"ai_step": f"Trascrizione parte {i + 1} di {len(files)}"}})
                stream = await audio_fs.open_download_stream(fid)
                meta = (stream.metadata or {})
                try:
                    parts.append(await _whisper(unseal_bytes(await stream.read()), meta.get("filename") or job.get("filename", ""),
                                                context=" ".join(parts)[-600:], strict=len(files) == 1))
                except AIJobError:
                    if len(files) == 1:
                        raise
                    parts.append("")
                await db.consult_jobs.update_one({"_id": job["_id"]}, {"$set": {"part_texts": parts}})
            transcript = "\n".join(p for p in parts if p)
            if len(transcript.split()) < 4:
                raise AIJobError("Nessun parlato rilevato nella registrazione: verifichi il microfono e riprovi, oppure incolli la trascrizione.")
            await db.consultations.update_one({"_id": ObjectId(cid)}, {"$set": {"ai_step": "Compilazione della cartella"}})
            await db.consult_jobs.update_one({"_id": job["_id"]}, {"$set": {"transcript": seal(transcript)}})
            await db.consultations.update_one({"_id": ObjectId(cid), "owner_id": owner, "status": "processing"},
                                              {"$set": Consultation.sealed_set({"transcript": transcript})})
        spec = await doctor_specialty(owner)
        cur = unseal_fields(await db.consultations.find_one({"_id": ObjectId(cid)}, {"template_fields": 1, "previsit": 1, "template_name": 1, "note": 1}) or {}, ("previsit", "note"))
        pv = cur.get("previsit")
        spec = (cur.get("note") or {}).get("specialita") or spec  # specialità della visita (anche secondaria)
        cmod = (cur.get("note") or {}).get("modulo") or {}
        mid = cmod.get("id") or ""
        ck = unseal_fields(await db.consultations.find_one({"_id": ObjectId(cid)}, {"checklist_id": 1, "checklist_manual": 1}) or {}, ("checklist_manual",))
        ctx = (previsit_prompt(pv) if pv else "") + (CHECKLIST_RULE if ck.get("checklist_id") else "")
        ai, summary = await asyncio.gather(structure_note(transcript, f"consult-{cid}", spec, cur.get("template_fields") or None, ctx, mid,
                                                          {"nascosti": cmod.get("nascosti") or [], "ordine": cmod.get("ordine") or []}),
                                           _safe_summary(spec, transcript, f"sum-{cid}"))
        ai.riepilogo = summary
        if ck.get("checklist_id"):
            ai.sezioni = [NoteSection(**x) for x in apply_checklist([x.model_dump() for x in ai.sezioni], cur.get("template_fields") or [], ck.get("checklist_manual") or {})]
        p = prov.make(prov.note_tipo(cur.get("template_name", ""), cur.get("template_fields"), bool(pv)), prov.GPT)
        p["parti"] = {**({"trascrizione": prov.make("trascrizione", prov.WHISPER)} if files else {}),
                      **({"riassunto_famiglia": prov.make("riassunto_famiglia", prov.GPT)} if summary else {})}
        snap = ai.model_dump()
        for _ in range(5):  # concorrenza ottimistica con i salvataggi del medico (campo rev)
            doc = await db.consultations.find_one({"_id": ObjectId(cid), "owner_id": owner})
            if not doc or doc.get("status") != "processing":
                return
            note = ai.model_copy(deep=True)
            _apply_doctor(note, unseal_fields(doc, ("note",)).get("note") or {})
            enrich_growth(note, await get_patient(doc.get("patient_id")), date.fromisoformat(doc["created_at"][:10]))
            upd = await db.consultations.find_one_and_update(
                {"_id": ObjectId(cid), "owner_id": owner, "status": "processing", "rev": doc.get("rev", 0)},
                {"$set": {**Consultation.sealed_set({"note": note.model_dump(), "transcript": transcript, "ai_snapshot": snap}), "status": "ready", "ai_error": "",
                          "ai_sec": round(time.monotonic() - t0, 1), "ai_provenance": p}, "$inc": {"rev": 1}}, return_document=True)
            if upd:
                await prov.log(db, owner, f"visita di {upd['patient_name']}", None, prov.DRAFT, tipo=p["tipo"])
                await sync_measurement(Consultation.from_mongo(upd).out())
                await _drop_job(cid)
                logger.info("Referto %s pronto in %.1fs", cid, time.monotonic() - t0)
                return
        raise AIJobError("Salvataggi concorrenti: riprovi.")
    except Exception as e:
        logger.exception("Elaborazione referto %s fallita", cid)
        await db.consultations.update_one({"_id": ObjectId(cid), "owner_id": owner, "status": "processing"},
                                          {"$set": {"status": "failed", "ai_error": friendly_ai_error(e)}})
    finally:
        _RUNNING.discard(cid)


def spawn_consult_job(cid: str, owner: str):
    task = asyncio.create_task(run_consult_job(cid, owner))
    _TASKS.add(task)  # riferimento forte: evita la garbage collection del task in esecuzione
    task.add_done_callback(_TASKS.discard)


async def create_job(cid: str, owner: str, transcript: str = "", audio: bytes = b"", filename: str = "", part_ids: Optional[list] = None) -> None:
    files = list(part_ids or [])
    if audio:
        files.append(await audio_fs.upload_from_stream(f"{cid}.bin", seal_bytes(audio), metadata={"consultation_id": cid, "owner_id": owner, "filename": filename}))
    await db.consult_jobs.update_one({"consultation_id": cid}, {"$set": {
        "consultation_id": cid, "owner_id": owner, "created_at": now_iso(), "filename": filename or "consultazione.webm",
        "audio_files": files, "audio_file": None, "transcript": seal(transcript) if transcript else None,
        "expires_at": datetime.now(timezone.utc) + timedelta(days=JOB_TTL_DAYS)}}, upsert=True)


MAX_PARTS = 12  # 12 parti da ~10 minuti: visite fino a 2 ore


@api.post("/consultations/audio-parts")
async def upload_audio_part(audio: UploadFile = File(...), user: dict = Depends(current_user)):
    """Una parte (≤25 MB) di una registrazione lunga, cifrata in GridFS in attesa di /consultations/start."""
    data = await audio.read()
    if not data:
        raise HTTPException(400, "Parte audio vuota")
    if len(data) > 25 * 1024 * 1024:
        raise HTTPException(413, "Parte audio oltre 25 MB")
    fid = await audio_fs.upload_from_stream("part.bin", seal_bytes(data), metadata={"owner_id": user["id"], "kind": "part", "filename": audio.filename or "parte.webm"})
    return {"part_id": str(fid), "size": len(data)}


@api.post("/consultations/start")
async def start_consultation(
    user: dict = Depends(current_user),
    patient_name: str = Form(...), patient_id: Optional[str] = Form(None), clinic: str = Form(""), waiting_id: Optional[str] = Form(None),
    duration_sec: int = Form(0), paper_consent: bool = Form(False), transcript: str = Form(""), audio: Optional[UploadFile] = File(None),
    part_ids: str = Form(""), template_id: Optional[str] = Form(None),
    checklist_id: str = Form(""), checklist_manual: str = Form(""), live_session_id: str = Form(""), live_chunks: int = Form(0),
    checklist_demo: str = Form(""), module_id: str = Form(""), new_birth_date: str = Form(""), new_sex: str = Form(""),
):
    """Crea subito la visita 'in elaborazione' e avvia Whisper + IA in background.
    Visite lunghe: l'audio arriva prima in parti (POST /consultations/audio-parts) e qui si passano i loro id in ordine."""
    patient_id = patient_id or None
    waiting_id = waiting_id or None
    if not patient_name.strip():
        raise HTTPException(400, "Paziente mancante")
    if not patient_id and paper_consent and new_birth_date:
        patient_id = await free_visit_patient(patient_name, new_birth_date, new_sex)
    patient = await get_patient(patient_id)
    if patient and not patient.get("consent_at"):
        raise HTTPException(412, "Consenso privacy non registrato: registralo nel passaporto prima di avviare la visita")
    if not patient and not paper_consent:
        raise HTTPException(412, "Conferma l'acquisizione del consenso privacy per la visita libera")
    data = await audio.read() if audio else b""
    try:
        manual = {str(k): str(v)[:2000] for k, v in (json.loads(checklist_manual) if checklist_manual else {}).items() if str(v).strip()}
    except (ValueError, AttributeError):
        manual = {}
    checklist_id = "template" if checklist_id else ""
    live_cfg = await live_settings(user)
    if checklist_id and live_cfg["demo"]:
        try:
            ticked = {str(k): str(v)[:200] for k, v in (json.loads(checklist_demo) if checklist_demo else {}).items()}
        except (ValueError, AttributeError):
            ticked = {}
        return await _demo_consultation(user, patient_name.strip(), patient_id, clinic, waiting_id, duration_sec, paper_consent, await resolve_template(template_id or None), manual, ticked,
                                        module_id)
    tpl = await resolve_template(template_id or None)
    vs = await visit_setup(user["id"], tpl, patient, module_id)  # prima di consumare la trascrizione a blocchi: un modulo non valido non la perde
    if live_session_id and live_chunks and not data and not part_ids.strip():
        acc = await live_transcript(live_session_id, user["id"], live_chunks)
        if acc is None:
            raise HTTPException(409, "Trascrizione a blocchi incompleta: invii la registrazione completa")
        transcript = acc
        await db.live_sessions.delete_one({"session_id": live_session_id, "owner_id": user["id"]})
    parts = []
    for pid_ in [p for p in part_ids.split(",") if p.strip()][:MAX_PARTS]:
        f_ = await db["consult_audio.files"].find_one({"_id": ObjectId(pid_.strip()), "metadata.owner_id": user["id"], "metadata.kind": "part"}) if ObjectId.is_valid(pid_.strip()) else None
        if not f_:
            raise HTTPException(400, "Parte audio non trovata: ripeta l'invio")
        parts.append(f_["_id"])
    if parts:
        data = b""
    if not data and not parts and len(transcript.strip()) < 20:
        raise HTTPException(400, "Registrazione vuota o trascrizione troppo breve")
    if len(data) > 25 * 1024 * 1024:
        raise HTTPException(413, "Audio oltre 25 MB: per visite molto lunghe divida la registrazione")
    note = ClinicalNote(specialita=vs["specialita"], modulo={"id": vs["mid"], **vs["layout"]},
                        sezioni=[NoteSection(gruppo=f["gruppo"], titolo=f["titolo"]) for f in vs["fields"]])
    enrich_growth(note, patient, date.today())
    oid_new = ObjectId()
    cid = str(oid_new)
    claimed = []
    for fid in parts:  # ogni parte può appartenere a una sola visita
        r = await db["consult_audio.files"].update_one({"_id": fid, "metadata.consultation_id": {"$exists": False}}, {"$set": {"metadata.consultation_id": cid}})
        if not r.modified_count:
            await db["consult_audio.files"].update_many({"_id": {"$in": claimed}}, {"$unset": {"metadata.consultation_id": ""}})
            raise HTTPException(409, "Parte audio già usata per un'altra visita: ripeta l'invio")
        claimed.append(fid)
    try:  # prima il job (audio cifrato in GridFS), poi la visita: niente visite orfane
        await create_job(cid, user["id"], transcript=transcript.strip() if not (data or parts) else "", audio=data,
                         filename=(audio.filename if audio else "") or "consultazione.webm", part_ids=parts)
    except Exception:
        logger.exception("Salvataggio audio fallito")
        await _drop_job(cid)
        raise HTTPException(500, "Impossibile salvare la registrazione: riprovi")
    c = Consultation(patient_name=patient_name.strip(), patient_id=patient_id, clinic=clinic, waiting_id=waiting_id,
                     transcript="" if (data or parts) else transcript.strip(),
                     note=note, status="processing", duration_sec=duration_sec, paper_consent=paper_consent, doctor_id=user["id"],
                     template_id=tpl["id"], template_name=tpl["name"], template_fields=vs["fields"], guardian_hidden=vs["guardian_hidden"],
                     previsit=await latest_previsit(db, patient_id, user["id"]) if tpl.get("bilancio") else None,
                     checklist_id=checklist_id, checklist_manual=manual or None)
    await tdb.consultations.insert_one({**c.to_mongo(), "_id": oid_new, "rev": 0})
    c.id = cid
    if waiting_id and ObjectId.is_valid(waiting_id):
        await tdb.waiting.delete_one({"_id": ObjectId(waiting_id)})
        await tdb.appointments.update_many({"patient_name": patient_name.strip()}, {"$set": {"status": "completato"}})
    spawn_consult_job(cid, user["id"])
    return c.out()


CHECKLIST_RULE = ("\n\nNota per campi_modello (checklist della visita): scrivi in OGNI campo il valore completo detto in visita "
                  "(es. 'Peso: 7,4 kg'), anche se compare già negli altri campi; mai rimandi del tipo 'documentato nel campo...'. "
                  "Se l'informazione non è stata detta scrivi 'Non riportato'.")


async def _demo_consultation(user, name, patient_id, clinic, waiting_id, duration_sec, paper_consent, tpl, manual, ticked, module_id=""):
    """Modalità dimostrativa (solo account demo): nota finta già pronta, nessuna chiamata IA."""
    vs = await visit_setup(user["id"], tpl, await get_patient(patient_id), module_id)
    note = ClinicalNote(specialita=vs["specialita"], modulo={"id": vs["mid"], **vs["layout"]},
                        sezioni=[NoteSection(**x) for x in demo_sezioni(vs["fields"], manual, ticked)],
                        motivo_visita=tpl["name"], riepilogo="Visita dimostrativa: dati di esempio, nessun dato reale.")
    enrich_growth(note, await get_patient(patient_id), date.today())
    c = Consultation(patient_name=name, patient_id=patient_id, clinic=clinic, waiting_id=waiting_id, transcript="Trascrizione dimostrativa.",
                     note=note, status="ready", duration_sec=duration_sec, paper_consent=paper_consent, doctor_id=user["id"],
                     template_id=tpl["id"], template_name=f'{tpl["name"]} (demo)', template_fields=tpl["fields"], checklist_id="template", checklist_manual=manual or None)
    res = await tdb.consultations.insert_one({**c.to_mongo(), "rev": 0})
    c.id = str(res.inserted_id)
    return c.out()


async def _whisper_chunk(data: bytes, filename: str) -> str:
    buf = io.BytesIO(data)
    buf.name = filename or "blocco.webm"
    res = await OpenAISpeechToText(api_key=LLM_KEY).transcribe(file=buf, model="whisper-1", response_format="json", language="it", prompt=WHISPER_PROMPT)
    return HALLUCINATIONS.sub("", (res.text or "").strip()).strip(" .,-")


live_router, live_settings, live_transcript = build_live(db, current_user, _whisper_chunk, LLM_KEY, seal, unseal)


@api.get("/consultations/{cid}")
async def get_consultation(cid: str):
    doc = await tdb.consultations.find_one({"_id": oid(cid)})
    if not doc:
        raise HTTPException(404, "Consultazione non trovata")
    return Consultation.from_mongo(doc).out()


class RetryIn(BaseModel):
    transcript: str = Field(default="", max_length=60000)


@api.post("/consultations/{cid}/retry")
async def retry_consultation(cid: str, body: Optional[RetryIn] = None, user: dict = Depends(current_user)):
    """Rilancia l'elaborazione. Con 'transcript' si sostituisce l'audio con una trascrizione incollata."""
    doc = await tdb.consultations.find_one({"_id": oid(cid)})
    if not doc:
        raise HTTPException(404, "Consultazione non trovata")
    if doc.get("status", "ready") == "ready":
        return Consultation.from_mongo(doc).out()
    if doc.get("status") == "processing" or cid in _RUNNING:
        raise HTTPException(409, "Elaborazione già in corso: attenda il risultato")
    pasted = (body.transcript if body else "").strip()
    if pasted:
        if len(pasted) < 20:
            raise HTTPException(400, "Trascrizione troppo breve")
        await _drop_job(cid)
        await create_job(cid, user["id"], transcript=pasted)
    elif not await db.consult_jobs.find_one({"consultation_id": cid, "owner_id": user["id"]}):
        raise HTTPException(410, "Registrazione non più disponibile: incolli la trascrizione o compili la cartella a mano")
    sets = {"status": "processing", "ai_error": ""}
    if pasted:
        sets.update(Consultation.sealed_set({"transcript": pasted}))
    doc = await tdb.consultations.find_one_and_update({"_id": oid(cid), "status": {"$ne": "ready"}}, {"$set": sets, "$inc": {"rev": 1}}, return_document=True)
    if doc:
        spawn_consult_job(cid, user["id"])
        return Consultation.from_mongo(doc).out()
    return Consultation.from_mongo(await tdb.consultations.find_one({"_id": oid(cid)})).out()


@api.post("/consultations/{cid}/summary")
async def regenerate_summary(cid: str, user: dict = Depends(current_user)):
    """Rigenera il riepilogo per paziente/genitori dalla cartella validata (e dalla trascrizione)."""
    await require_ready(cid)
    doc = await tdb.consultations.find_one({"_id": oid(cid)})
    if not doc:
        raise HTTPException(404, "Consultazione non trovata")
    c = Consultation.from_mongo(doc).out()
    spec = c["note"].get("specialita") or await doctor_specialty(user["id"])
    try:
        text = await patient_summary(spec, transcript=c.get("transcript", ""), note=c["note"], session=f"sum-{cid}-{uuid.uuid4().hex[:6]}")
    except Exception:
        logger.exception("Riepilogo non generato")
        raise HTTPException(502, "Il servizio IA non ha risposto: riprovi tra qualche istante")
    if not text:
        raise HTTPException(502, "Riepilogo vuoto: riprovi")
    raw = unseal_fields(doc, ("ai_snapshot",))
    snap = {**(raw.get("ai_snapshot") or {}), "riepilogo": text}
    p = {**(doc.get("ai_provenance") or {"ai_generated": False})}
    old = ((p.get("parti") or {}).get("riassunto_famiglia") or {}).get("stato_revisione")
    p["parti"] = {**(p.get("parti") or {}), "riassunto_famiglia": prov.make("riassunto_famiglia", prov.GPT)}
    await tdb.consultations.update_one({"_id": oid(cid)}, {"$set": {"ai_provenance": p, **Consultation.sealed_set({"ai_snapshot": snap})}})
    await prov.log(db, user["id"], f"visita di {c['patient_name']}", old, prov.DRAFT, tipo="riassunto_famiglia")
    return {"riepilogo": text}


def needs_signature(doc: dict) -> bool:
    p = doc.get("ai_provenance") or {}
    return prov.is_draft(p) or prov.is_draft((p.get("parti") or {}).get("riassunto_famiglia"))


SIGN_FIRST = "Nota redatta con MantAI non ancora firmata: la verifichi e la firmi prima di inviarla o pubblicarla"


@api.post("/consultations/{cid}/sign")
async def sign_consultation(cid: str, user: dict = Depends(current_user)):
    """Firma del medico: i contenuti MantAI in bozza diventano 'verificato_dal_medico' (unico punto di revisione)."""
    await require_ready(cid)
    doc = await tdb.consultations.find_one({"_id": oid(cid)})
    if not doc:
        raise HTTPException(404, "Consultazione non trovata")
    raw = unseal_fields(doc, ("note", "ai_snapshot"))
    p = {**(doc.get("ai_provenance") or {"ai_generated": False})}
    name = await prov.reviewer_label(db, user["id"])
    if prov.is_draft(p):
        p = prov.reviewed(p, user["id"], prov.changed(raw.get("ai_snapshot"), raw.get("note")) if raw.get("ai_snapshot") else None, name)
        await prov.log(db, user["id"], f"visita di {doc['patient_name']}", prov.DRAFT, prov.VERIFIED, user["id"], p.get("tipo"))
    parts = {**(p.get("parti") or {})}
    rs = parts.get("riassunto_famiglia")
    if prov.is_draft(rs):
        snap = raw.get("ai_snapshot") or {}
        parts["riassunto_famiglia"] = prov.reviewed(rs, user["id"], (snap.get("riepilogo") or "") != ((raw.get("note") or {}).get("riepilogo") or ""), name)
        await prov.log(db, user["id"], f"visita di {doc['patient_name']}", prov.DRAFT, prov.VERIFIED, user["id"], "riassunto_famiglia")
    if parts:
        p["parti"] = parts
    signed_at = doc.get("signed_at") or now_iso()
    fse_state = doc.get("fse")
    if not fse_state or fse_state.get("status") in (None, "non_inviato"):
        pat = patient_out(await tdb.patients.find_one({"_id": oid(doc["patient_id"])})) if doc.get("patient_id") else {}
        fse_state = fse_mod.on_signed({**doc, "signed_at": signed_at}, pat) if pat else {"status": "non_inviato", "reason": "Visita senza cartella paziente", "deadline": fse_mod.deadline_from(signed_at)}
    auto = {}
    if doc.get("patient_id") and not doc.get("obscured") and await tdb.patients.find_one({"_id": oid(doc["patient_id"]), "passport_consent_at": {"$ne": None}}, {"_id": 1}):
        auto = {"portal_published": True}  # consenso Passaporto: il referto firmato entra da solo nel passaporto
    upd = await tdb.consultations.find_one_and_update({"_id": oid(cid)}, {"$set": {"ai_provenance": p, "signed_at": signed_at, "fse": fse_state, **auto}}, return_document=True)
    await audit("nota_firmata", doc["patient_name"])
    return Consultation.from_mongo(upd).out()


def _fold(t: str) -> str:
    return unicodedata.normalize("NFKD", t or "").encode("ascii", "ignore").decode().lower()


def _snippet(text: str, q: str, width: int = 90) -> str:
    f = _fold(text)
    i = f.find(q) if len(f) == len(text) else -1  # offset valido solo se la normalizzazione non ha tolto caratteri
    if i < 0:
        return text[:width]
    a = max(0, i - 30)
    return ("…" if a else "") + text[a:a + width].strip() + ("…" if a + width < len(text) else "")


@api.get("/search")
async def global_search(q: str = "", user: dict = Depends(current_user)):
    """Ricerca rapida (Cmd+K): pazienti, referti passati (testo delle diagnosi), appuntamenti futuri.
    I testi clinici sono cifrati: il filtro sui referti avviene dopo la decifratura, sugli ultimi 600 referti del medico."""
    qf = _fold(q.strip())
    if len(qf) < 2:
        return {"patients": [], "reports": [], "appointments": []}
    words = qf.split()
    pats = []
    cfh = cf_hash(q.strip().upper()) if len(q.strip()) == 16 else None
    async for p in tdb.patients.find({}, {"name": 1, "birth_date": 1, "sex": 1, "consent_at": 1, "cf_hash": 1}).sort("name", 1).limit(2000):
        if (cfh and p.get("cf_hash") == cfh) or all(w in _fold(p["name"]) for w in words):
            pats.append({"id": str(p["_id"]), "name": p["name"], "birth_date": p.get("birth_date"), "sex": p.get("sex"), "consent": bool(p.get("consent_at"))})
            if len(pats) >= 8:
                break
    reports = []
    async for d in tdb.consultations.find({"status": {"$ne": "processing"}}).sort("created_at", -1).limit(600):
        c = Consultation.from_mongo(d).out()
        n = c["note"]
        hay = {"diagnosi": n.get("diagnosi") or "", "motivo": n.get("motivo_visita") or "", "nome": c["patient_name"]}
        full = _fold(" ".join(hay.values()))
        if all(w in full for w in words):
            field = next((k for k in ("diagnosi", "motivo", "nome") if words[0] in _fold(hay[k])), "diagnosi")
            reports.append({"id": c["id"], "patient_name": c["patient_name"], "patient_id": c.get("patient_id"), "created_at": c["created_at"],
                            "diagnosi": _snippet(hay["diagnosi"], words[0]) if field == "diagnosi" else (hay["diagnosi"] or "")[:90],
                            "motivo": (hay["motivo"] or "")[:70], "match": field})
            if len(reports) >= 8:
                break
    today = today_rome()
    now_t = datetime.now(ZoneInfo("Europe/Rome")).strftime("%H:%M")
    appts = []
    async for a in tdb.appointments.find({"date": {"$gte": today}, "status": {"$nin": ["annullato", "completato"]}}).sort([("date", 1), ("time", 1)]).limit(400):
        o = Appointment.from_mongo(a).out()
        if o["date"] == today and o["time"] < now_t:
            continue
        if all(w in _fold(f"{o['patient_name']} {o.get('visit_type') or ''} {o.get('clinic') or ''}") for w in words):
            pid = o.get("patient_id") or next((p["id"] for p in pats if p["name"].lower() == o["patient_name"].lower()), None)
            appts.append({"id": o["id"], "patient_name": o["patient_name"], "date": o["date"], "time": o["time"], "visit_type": o.get("visit_type") or "",
                          "clinic": o.get("clinic") or "", "patient_id": pid})
            if len(appts) >= 8:
                break
    return {"patients": pats, "reports": reports, "appointments": appts}


async def require_ready(cid: str):
    doc = await tdb.consultations.find_one({"_id": oid(cid)}, {"status": 1})
    if doc and doc.get("status", "ready") != "ready":
        raise HTTPException(409, "Referto ancora in elaborazione: attenda il completamento dell'IA")


@api.get("/consultations")
async def list_consultations(patient_id: Optional[str] = None):
    q = {"patient_id": patient_id} if patient_id else {}
    docs = await tdb.consultations.find(q).sort("created_at", -1).to_list(200 if patient_id else 20)
    return [Consultation.from_mongo(d).out() for d in docs]


@api.get("/consultations/{cid}/pdf")
async def consultation_pdf(cid: str, user: dict = Depends(current_user)):
    await require_ready(cid)
    doc = await tdb.consultations.find_one({"_id": oid(cid)})
    if not doc:
        raise HTTPException(404, "Consultazione non trovata")
    c = Consultation.from_mongo(doc).out()
    pdf = build_report(c, user["name"], await get_patient(c.get("patient_id")), await doctor_profile(user["id"]), await chart_for(cid),
                       signature=await doctor_signature(db, user["id"]))
    await tdb.consultations.update_one({"_id": oid(cid)}, {"$set": {"finalized_at": now_iso()}, "$inc": {"pdf_exports": 1}})
    await audit("referto_pdf", c["patient_name"])
    name = f"Referto_{re.sub(r'[^A-Za-z0-9]+', '_', c['patient_name']).strip('_')}_{c['created_at'][:10]}.pdf"
    return Response(pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f"attachment; filename=\"{name}\"; filename*=UTF-8''{quote(name)}"})


@api.post("/consultations/{cid}/send-report")
async def send_report(cid: str, user: dict = Depends(current_user)):
    await require_ready(cid)
    doc = await tdb.consultations.find_one({"_id": oid(cid)})
    if not doc:
        raise HTTPException(404, "Consultazione non trovata")
    if needs_signature(doc):
        raise HTTPException(409, SIGN_FIRST)
    if doc.get("guardian_hidden"):
        raise HTTPException(409, GUARDIAN_HIDDEN)
    c = Consultation.from_mongo(doc).out()
    patient = await get_patient(c.get("patient_id"))
    to = (patient or {}).get("guardian_email", "").strip()
    if not EMAIL_RE.match(to):
        raise HTTPException(400, "Email del genitore mancante o non valida nel passaporto del paziente")
    if not patient.get("consent_email"):
        raise HTTPException(412, "Il genitore non ha acconsentito all'invio dei referti via email")
    profile = await doctor_profile(user["id"])
    pdf = build_report(c, user["name"], patient, profile, await chart_for(cid), signature=await doctor_signature(db, user["id"]))
    day = datetime.fromisoformat(c["created_at"]).strftime("%d/%m/%Y")
    fname = f"Referto_{re.sub(r'[^A-Za-z0-9]+', '_', c['patient_name']).strip('_')}_{c['created_at'][:10]}.pdf"
    ped_mail = is_pediatric(c["note"].get("specialita") or "")
    subject = f"Referto della visita {'pediatrica ' if ped_mail else ''}di {c['patient_name']} – {day}"
    summary_html = (f'<div style="margin:18px 0;padding:16px 18px;background:#F3F6FF;border-left:3px solid #0A192F;font-size:14px;line-height:1.6">'
                    f'<div style="font-size:11px;letter-spacing:2px;color:#5B6478;margin-bottom:6px">IN PAROLE SEMPLICI</div>{hesc(c["note"]["riepilogo"]).replace(chr(10), "<br>")}'
                    + ('<div style="margin-top:8px;font-size:12px;color:#8A5A00">Contiene una spiegazione generata da MantAI, verificata dal medico. Non sostituisce il referto né il parere del medico.</div>'
                       if ((c["ai_provenance"].get("parti") or {}).get("riassunto_famiglia") or {}).get("ai_generated") else "") + '</div>'
                    if (c["note"].get("riepilogo") or "").strip() else "")
    html = (
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F5F7;padding:24px 0"><tr><td align="center">'
        '<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;font-family:Arial,sans-serif;color:#0A192F">'
        '<tr><td style="background:#0A192F;padding:22px 28px;color:#ffffff;font-family:Georgia,serif;font-size:24px">MantMed'
        f'<div style="font-family:Arial,sans-serif;font-size:11px;letter-spacing:2px;color:#C9CCD3;margin-top:4px">{hesc(header_line(profile))}</div></td></tr>'
        f'<tr><td style="padding:28px;font-size:15px;line-height:1.6"><p>Gentile {hesc(patient.get("guardian") or ("famiglia" if ped_mail else c["patient_name"]))},</p>'
        f'<p>in allegato trova il referto della visita di <strong>{hesc(c["patient_name"])}</strong> del {day}'
        f'{" presso lo " + hesc(c["clinic"]) if c.get("clinic") else ""}.</p>' + summary_html
        + ('<p style="font-size:13px;color:#5B6478">Il referto allegato è stato redatto con il supporto di MantAI e verificato e firmato dal medico.</p>'
           if c["ai_provenance"].get("ai_generated") is True else '') +
        '<p>Per qualsiasi chiarimento può rispondere a questa email o contattare lo studio.</p>'
        f'<p style="margin-top:24px">Cordiali saluti,<br><strong>{hesc(user["name"])}</strong><br>'
        f'<span style="color:#5B6478;font-size:13px">{hesc(profile["specialty"] if profile else os.environ["DOCTOR_SPECIALTY"])}<br>Tel. {hesc(profile["phone"] if profile else os.environ["STUDIO_PHONE"])}</span></p></td></tr>'
        '<tr><td style="padding:16px 28px;border-top:1px solid #DADDE3;font-size:11px;color:#5B6478;line-height:1.5">'
        'Comunicazione riservata contenente dati sanitari (art. 9 Reg. UE 2016/679 – GDPR), destinata esclusivamente '
        + ('al genitore o tutore del paziente. ' if ped_mail else 'al paziente o al suo delegato. ') +
        'Se l\'ha ricevuta per errore, la elimini e avvisi lo studio. Inviata da MantMed.</td></tr></table></td></tr></table>')
    email_id = await send_email(to=to, subject=subject, html=html,
                                attachments=[{"filename": fname, "content": base64.b64encode(pdf).decode()}])
    sent_at = now_iso()
    await tdb.consultations.update_one({"_id": oid(cid)}, {"$set": {**Consultation.sealed_set({"report_sent_at": sent_at, "report_sent_to": to}), "finalized_at": sent_at}, "$inc": {"pdf_exports": 1}})
    await audit("referto_email", c["patient_name"])
    if c.get("patient_id"):
        await notify_parents(db, c["patient_id"], user["id"], "report", "Nuovo referto disponibile", f"{c['patient_name']} · visita del {day}", ref=cid, key=f"rep:{cid}",
                             ai_line=report_ai_line(doc))
    return {"sent": True, "to": to, "sent_at": sent_at, "email_id": email_id}


EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def report_ai_line(doc: dict) -> str:
    p = doc.get("ai_provenance") or {}
    if (p.get("parti") or {}).get("riassunto_famiglia", {}).get("ai_generated"):
        return "Contiene una spiegazione generata da MantAI."
    return "Contiene un referto redatto con il supporto di MantAI e verificato dal medico." if p.get("ai_generated") is True else ""


class PortalPublishIn(BaseModel):
    published: bool


GUARDIAN_HIDDEN = "Visita riservata: non è visibile ai tutori. La condivida con i tutori dalla cartella se lo ritiene opportuno"


class GuardianShareIn(BaseModel):
    share: bool


@api.post("/consultations/{cid}/guardians")
async def share_with_guardians(cid: str, body: GuardianShareIn, user: dict = Depends(current_user)):
    """Scelta esplicita del medico, per la singola visita, di renderla visibile (o di nuovo riservata) ai tutori."""
    cur = await tdb.consultations.find_one({"_id": oid(cid)}, {"guardian_hidden": 1, "guardian_shared_at": 1})
    if not cur:
        raise HTTPException(404, "Consultazione non trovata")
    if body.share and not cur.get("guardian_hidden"):
        return Consultation.from_mongo(await tdb.consultations.find_one({"_id": oid(cid)})).out()  # già visibile ai tutori: nessuna modifica
    doc = await tdb.consultations.find_one_and_update({"_id": oid(cid)}, {"$set": {"guardian_hidden": not body.share, "guardian_shared_at": now_iso() if body.share else None}},
                                                      return_document=True)
    if not doc:
        raise HTTPException(404, "Consultazione non trovata")
    await audit("visita_condivisa_tutori" if body.share else "visita_riservata_tutori", doc["patient_name"])
    return Consultation.from_mongo(doc).out()


@api.post("/consultations/{cid}/portal")
async def publish_to_portal(cid: str, body: PortalPublishIn):
    if body.published:
        await require_ready(cid)
        cur = await tdb.consultations.find_one({"_id": oid(cid)}, {"ai_provenance": 1, "obscured": 1})
        if cur and needs_signature(cur):
            raise HTTPException(409, SIGN_FIRST)
        if cur and cur.get("obscured"):
            raise HTTPException(409, "Referto oscurato: rimuova l'oscuramento per pubblicarlo")
    doc = await tdb.consultations.find_one_and_update({"_id": oid(cid)}, {"$set": {"portal_published": body.published}}, return_document=True)
    if not doc:
        raise HTTPException(404, "Consultazione non trovata")
    await audit("referto_portale" if body.published else "referto_portale_ritirato", doc["patient_name"])
    if body.published and doc.get("patient_id") and not doc.get("guardian_hidden"):
        visit = datetime.fromisoformat(doc["created_at"]).strftime("%d/%m/%Y")
        await notify_parents(db, doc["patient_id"], doc["owner_id"], "report", "Nuovo referto disponibile", f"{doc['patient_name']} · visita del {visit}", ref=cid, key=f"rep:{cid}",
                             ai_line=report_ai_line(doc))
    return Consultation.from_mongo(doc).out()


@api.patch("/consultations/{cid}")
async def update_consultation(cid: str, body: ConsultationPatch):
    existing = await tdb.consultations.find_one({"_id": oid(cid)})
    if not existing:
        raise HTTPException(404, "Consultazione non trovata")
    if body.growth_only and existing.get("status") != "processing":
        # salvataggio partito durante l'elaborazione ma arrivato dopo: non si toccano i testi dell'IA
        ai = ClinicalNote.model_validate(unseal_fields(existing, ("note",)).get("note") or {})
        _apply_doctor(ai, body.note.model_dump())
        body.note = ai
    elif existing.get("status") == "processing":
        # durante l'elaborazione si salvano solo crescita e farmaci del medico; il job li unirà alla nota IA
        for _ in range(5):
            cur = ClinicalNote.model_validate(unseal_fields(existing, ("note",)).get("note") or {})
            cur.crescita, cur.farmaci, cur.riepilogo = body.note.crescita, body.note.farmaci, body.note.riepilogo or cur.riepilogo
            doc = await tdb.consultations.find_one_and_update(
                {"_id": oid(cid), "status": "processing", "rev": existing.get("rev", 0)},
                {"$set": Consultation.sealed_set({"note": cur.model_dump()}), "$inc": {"rev": 1}}, return_document=True)
            if doc:
                return Consultation.from_mongo(doc).out()
            existing = await tdb.consultations.find_one({"_id": oid(cid)})
            if existing.get("status") != "processing":
                break
        else:
            raise HTTPException(409, "Salvataggio concorrente: riprovi")
        # il job ha appena finito: si applicano solo crescita/farmaci del medico alla nota IA
        ai = ClinicalNote.model_validate(unseal_fields(existing, ("note",)).get("note") or {})
        _apply_doctor(ai, body.note.model_dump())
        body.note = ai
    sets = {**Consultation.sealed_set({"note": body.note.model_dump()}), "finalized_at": now_iso()}
    text_keys = [k for k, fl in ClinicalNote.model_fields.items() if fl.annotation is str]
    if existing.get("status") == "failed" and not body.growth_only and any(
            (v or "").strip() not in ("", "Non riportato") for v in [getattr(body.note, k) for k in text_keys] + list(body.note.modulo.campi.values())):
        sets.update({"status": "ready", "ai_error": ""})  # cartella compilata a mano dal medico
        await _drop_job(cid)
    enrich_growth(body.note, await get_patient(existing.get("patient_id")), date.fromisoformat(existing["created_at"][:10]))
    sets.update(Consultation.sealed_set({"note": body.note.model_dump()}))
    doc = await tdb.consultations.find_one_and_update({"_id": oid(cid)}, {"$set": sets, "$inc": {"rev": 1}, "$unset": {"simple": ""}}, return_document=True)
    out = Consultation.from_mongo(doc).out()
    await sync_measurement(out)
    return out


# ---------- Passaporto sanitario ----------
PASSPORT_FIELDS = ("allergies", "chronic_conditions", "therapies", "blood_group")


@api.get("/patients")
async def list_patients():
    docs = await tdb.patients.find().sort("name", 1).to_list(1000)
    last = {d["_id"]: d for d in await tdb.consultations.aggregate([
        {"$match": {"patient_id": {"$ne": None}}}, {"$sort": {"created_at": -1}},
        {"$group": {"_id": "$patient_id", "last": {"$first": "$created_at"}, "clinics": {"$addToSet": "$clinic"}, "n": {"$sum": 1}}}]).to_list(1000)}
    out = []
    for d in docs:
        p = patient_out(d)
        info = last.get(p["id"], {})
        out.append({**p, "last_visit": info.get("last"), "visits": info.get("n", 0), "clinics": sorted(c for c in info.get("clinics", []) if c)})
    return out


@api.post("/patients")
async def create_patient(body: PatientIn, user: dict = Depends(current_user)):
    date.fromisoformat(body.birth_date)
    if body.guardian_email and not EMAIL_RE.match(body.guardian_email.strip()):
        raise HTTPException(400, "Email del genitore non valida")
    meta = {f: {"by": user["name"], "at": now_iso()} for f in PASSPORT_FIELDS if (getattr(body, f) or "").strip()}
    res = await tdb.patients.insert_one({**Patient(**body.model_dump(), field_meta=meta).to_mongo(), "cf_hash": cf_hash(body.fiscal_code) if body.fiscal_code.strip() else None})
    return patient_out(await tdb.patients.find_one({"_id": res.inserted_id}))


@api.patch("/patients/{pid}")
async def update_patient(pid: str, body: PatientPatch, user: dict = Depends(current_user)):
    if body.guardian_email and not EMAIL_RE.match(body.guardian_email.strip()):
        raise HTTPException(400, "Email del genitore non valida")
    upd = Patient.sealed_set(body.model_dump(exclude_none=True))
    cur = await get_patient(pid)
    for f in PASSPORT_FIELDS:
        v = getattr(body, f)
        if cur and v is not None and v.strip() != (cur.get(f) or "").strip():
            upd[f"field_meta.{f}"] = {"by": user["name"], "at": now_iso()}
    if body.fiscal_code is not None:
        upd["cf_hash"] = cf_hash(body.fiscal_code) if body.fiscal_code.strip() else None
    doc = await tdb.patients.find_one_and_update({"_id": oid(pid)}, {"$set": upd}, return_document=True)
    if not doc:
        raise HTTPException(404, "Paziente non trovato")
    await fse_reevaluate(pid)
    return patient_out(await tdb.patients.find_one({'_id': oid(pid)}))


def measurement_out(m: dict, patient: dict) -> dict:
    x = Measurement.from_mongo(m).out()
    months = age_months(patient["birth_date"], date.fromisoformat(x["date"]))
    return {**x, "age_months": round(months, 1), "age_label": age_label(months),
            "percentiles": all_percentiles(patient["sex"], months, x["weight"], x["height"], x["hc"])}


@api.get("/patients/{pid}/passport")
async def passport(pid: str):
    doc = await tdb.patients.find_one({"_id": oid(pid)})
    if not doc:
        raise HTTPException(404, "Paziente non trovato")
    patient = patient_out(doc)
    await audit("accesso_passaporto", patient["name"])
    guardian = _norm_name(patient.get("guardian"))
    consents = [{**(o := Consent.from_mongo(x).out()), "signer_mismatch": bool(guardian) and _norm_name(o.get("signer_name")) != guardian}
                for x in await tdb.consents.find({"patient_id": pid}).sort("signed_at", -1).to_list(100)]
    cons = await fse_tick([Consultation.from_mongo(c).out() for c in await tdb.consultations.find({"patient_id": pid}).sort("created_at", -1).to_list(200)], patient)
    parent = await db.users.find_one({"role": "parent", "email": (patient.get("guardian_email") or "").strip().lower()}, {"_id": 1}) if patient.get("guardian_email") else None
    shares = [{"id": str(x["_id"]), "signed_at": x["signed_at"], "specialists": [m.get("doctor_name") or m.get("owner_name") or "" for m in x.get("members", [])]}
              async for x in db.share_consents.find({"members.patient_id": pid, "revoked_at": None, "superseded": {"$ne": True}})]
    portal = {"status": "attivo" if parent else "invitato" if patient.get("portal_invited_at") else "non_attivo", "shares": shares}
    fse_info = {"missing": fse_mod.missing_data(patient), "consent": bool(patient.get("fse_consent_at")), "days": fse_mod.FSE_DAYS}
    meas = [measurement_out(m, patient) for m in await tdb.measurements.find({"patient_id": pid}).sort("date", 1).to_list(500)]
    cps = [CheckpointDoc.from_mongo(c).out() for c in await tdb.checkpoints.find({"patient_id": pid}).sort("created_at", -1).to_list(100)]
    pays = [Payment.from_mongo(x).out() for x in await tdb.payments.find({"patient_id": pid}).sort("created_at", -1).to_list(500)]
    clinics = {c: {"clinic": c, "visits": 0, "measurements": 0, "checkpoints": 0} for c in tenant_clinics()}
    for c in cons:
        clinics.setdefault(c["clinic"] or "Altro", {"clinic": c["clinic"] or "Altro", "visits": 0, "measurements": 0, "checkpoints": 0})["visits"] += 1
    for m in meas:
        if m["clinic"] in clinics:
            clinics[m["clinic"]]["measurements"] += 1
    for c in cps:
        if c["clinic"] in clinics:
            clinics[c["clinic"]]["checkpoints"] += 1
    return {"patient": patient, "consultations": cons, "measurements": meas, "checkpoints": cps, "payments": pays, "consents": consents,
            "clinics": list(clinics.values()), "synced_at": now_iso(), "portal": portal, "fse": fse_info}


@api.post("/patients/{pid}/measurements")
async def add_measurement(pid: str, body: MeasurementIn):
    doc = await tdb.patients.find_one({"_id": oid(pid)})
    if not doc:
        raise HTTPException(404, "Paziente non trovato")
    date.fromisoformat(body.date)
    m = Measurement(patient_id=pid, **body.model_dump())
    res = await tdb.measurements.insert_one(m.to_mongo())
    return measurement_out(await tdb.measurements.find_one({"_id": res.inserted_id}), patient_out(doc))


@api.get("/growth/percentiles")
async def growth_percentiles(sex: Literal["F", "M"], age_months: float, weight: Optional[float] = None,
                             height: Optional[float] = None, hc: Optional[float] = None):
    return all_percentiles(sex, age_months, weight, height, hc)


@api.get("/growth/curves")
async def growth_curves(sex: Literal["F", "M"], indicator: Literal["wfa", "lhfa", "hcfa"], max_month: float = 24):
    return curves(indicator, sex, max_month)


# ---------- Registro cassa ----------
ROME = ZoneInfo("Europe/Rome")
METHODS = {"contanti": "Contanti", "carta": "Carta / Bancomat", "bonifico": "Bonifico", "pos": "POS", "online": "Pagamento Digitale / Online"}


def today_rome() -> str:
    return datetime.now(ROME).date().isoformat()


class Payment(BaseDocument):
    consultation_id: Optional[str] = None
    patient_id: Optional[str] = None
    patient_name: str
    clinic: str = ""
    service: str = "Visita pediatrica specialistica"
    amount: float
    method: Literal["contanti", "carta", "pos", "bonifico", "online"]
    date: str = Field(default_factory=today_rome)
    created_at: str = Field(default_factory=now_iso)
    appointment_id: Optional[str] = None
    receipt_no: Optional[str] = None
    stamp: float = 0
    payer_name: Optional[str] = None
    visit_date: Optional[str] = None
    visit_time: Optional[str] = None
    refunded_at: Optional[str] = None
    refund_of: Optional[str] = None
    invoice_id: Optional[str] = None
    __encrypted__: ClassVar[tuple] = ("service",)


class PaymentIn(BaseModel):
    consultation_id: Optional[str] = None
    patient_id: Optional[str] = None
    patient_name: str
    clinic: str = ""
    service: str = "Visita pediatrica specialistica"
    amount: float = Field(gt=0, le=100000)
    method: Literal["contanti", "pos", "bonifico"]


def summarize(items: list) -> dict:
    by_method = {m: {"method": m, "label": l, "total": 0.0, "count": 0} for m, l in METHODS.items()}
    by_clinic = {c: {"clinic": c, "total": 0.0, "count": 0} for c in tenant_clinics()}
    for p in items:
        by_method[p["method"]]["total"] += p["amount"]
        by_method[p["method"]]["count"] += 1
        bc = by_clinic.setdefault(p["clinic"] or "Altro", {"clinic": p["clinic"] or "Altro", "total": 0.0, "count": 0})
        bc["total"] += p["amount"]
        bc["count"] += 1
    r2 = lambda d: {**d, "total": round(d["total"], 2)}
    return {"total": round(sum(p["amount"] for p in items), 2), "count": len(items),
            "by_method": [r2(v) for v in by_method.values()], "by_clinic": [r2(v) for v in by_clinic.values()]}


async def payments_between(start: str, end: str) -> list:
    date.fromisoformat(start)
    date.fromisoformat(end)
    docs = await tdb.payments.find({"date": {"$gte": start, "$lte": end}}).sort("created_at", 1).to_list(5000)
    return [Payment.from_mongo(d).out() for d in docs]


@api.post("/payments")
async def create_payment(body: PaymentIn):
    if not body.patient_name.strip():
        raise HTTPException(400, "Paziente obbligatorio")
    p = Payment(**{**body.model_dump(), "amount": round(body.amount, 2)})
    res = await tdb.payments.insert_one(p.to_mongo())
    p.id = str(res.inserted_id)
    return p.out()


@api.get("/payments")
async def list_payments(start: Optional[str] = None, end: Optional[str] = None, consultation_id: Optional[str] = None):
    if consultation_id:
        docs = await tdb.payments.find({"consultation_id": consultation_id}).sort("created_at", 1).to_list(50)
        items = [Payment.from_mongo(d).out() for d in docs]
    else:
        s = start or today_rome()
        items = await payments_between(s, end or s)
    return {"items": items, "summary": summarize(items), "today": today_rome()}


@api.delete("/payments/{pid}")
async def delete_payment(pid: str):
    if await tdb.payments.count_documents({"_id": oid(pid), "invoice_id": {"$ne": None}, "method": {"$ne": "online"}}):
        raise HTTPException(409, "Incasso collegato a una fattura: lo annulli dalla fattura in Cassa")
    if await tdb.payments.count_documents({"_id": oid(pid), "method": "online"}):
        raise HTTPException(409, "Gli incassi online si stornano solo con il rimborso automatico all'annullamento della visita")
    res = await tdb.payments.delete_one({"_id": oid(pid)})
    if not res.deleted_count:
        raise HTTPException(404, "Incasso non trovato")
    return {"deleted": pid}


@api.get("/payments/export")
async def export_payments(start: Optional[str] = None, end: Optional[str] = None, user: dict = Depends(current_user)):
    s = start or today_rome()
    e = end or s
    items = await payments_between(s, e)
    rows = []
    for p in items:
        t = datetime.fromisoformat(p["created_at"]).astimezone(ROME).strftime("%H:%M")
        d = datetime.fromisoformat(p["date"]).strftime("%d/%m/%Y")
        rows.append([d, t, p["patient_name"], p["service"], p["clinic"], METHODS[p["method"]], p["amount"]])
    sm = summarize(items)
    pdf = build_cash_pdf(rows, sm["by_method"], sm["total"], user.get("name", ""), s, e)
    ds, de = date.fromisoformat(s), date.fromisoformat(e)
    whole_month = ds.day == 1 and (ds.year, ds.month) == (de.year, de.month) and (de + timedelta(days=1)).month != de.month
    period = s[:7] if whole_month else s if s == e else f"{s}_{e}"
    name = f"MantMed_commercialista_{period}.pdf"
    return Response(pdf, media_type="application/pdf", headers={"Content-Disposition": f"attachment; filename=\"{name}\""})


@api.get("/checkpoints/bands")
async def checkpoint_bands():
    return BANDS


class TourIn(BaseModel):
    completed: bool


@public_api.post("/onboarding/tour")
async def onboarding_tour(body: TourIn, user: dict = Depends(current_user)):
    await db.users.update_one({"_id": ObjectId(user["id"])}, {"$set": {"tour_completed_at": now_iso() if body.completed else None, "tour_version": TOUR_VERSION}})
    return {"tour_done": body.completed}


@api.get("/patients/{pid}/checkpoint")
async def checkpoint_template(pid: str):
    doc = await tdb.patients.find_one({"_id": oid(pid)})
    if not doc:
        raise HTTPException(404, "Paziente non trovato")
    return band_for(age_months(doc["birth_date"]))


@api.post("/patients/{pid}/checkpoints")
async def submit_checkpoint(pid: str, body: CheckpointIn):
    doc = await tdb.patients.find_one({"_id": oid(pid)})
    if not doc:
        raise HTTPException(404, "Paziente non trovato")
    months = age_months(doc["birth_date"])
    band = band_for(months)
    result = {**evaluate(band, body.answers), "next": band["next"]}
    cp = CheckpointDoc(patient_id=pid, band_id=band["id"], band_label=band["label"], age_months=round(months, 1),
                       clinic=body.clinic, answers=body.answers, result=result)
    res = await tdb.checkpoints.insert_one(cp.to_mongo())
    cp.id = str(res.inserted_id)
    await notify_parents(db, pid, doc["owner_id"], "checkpoint", "Nuovo bilancio di salute", f"{doc['name']} · {band['label']}", ref=cp.id)
    return cp.out()


# ---------- GDPR: consensi, audit, crittografia ----------
CONSENT_VERSION = "Informativa privacy v1.0 · 2026-10"


class Consent(BaseDocument):
    patient_id: str
    kind: Literal["privacy", "fse", "passaporto"] = "privacy"
    version: str = CONSENT_VERSION
    signer_name: str
    signer_relation: str
    privacy_policy: bool
    health_data: bool
    email_reports: bool = False
    method: Literal["firma_tablet", "modulo_cartaceo"]
    signature: Optional[str] = None
    signed_at: str = Field(default_factory=now_iso)
    revoked_at: Optional[str] = None
    channel: Optional[str] = None
    document_id: Optional[str] = None
    __encrypted__: ClassVar[tuple] = ("signer_name", "signature")


class ConsentIn(BaseModel):
    signer_name: str
    signer_relation: str
    privacy_policy: bool
    health_data: bool
    email_reports: bool = False
    method: Literal["firma_tablet", "modulo_cartaceo"]
    signature: Optional[str] = Field(default=None, max_length=400_000)


async def audit(action: str, subject: str = ""):
    await tdb.audit.insert_one({"action": action, "subject": seal_fields({"s": subject}, ("s",))["s"], "at": now_iso()})


async def refresh_patient_consent(pid: str):
    active = await tdb.consents.find({"patient_id": pid, "revoked_at": None, "kind": {"$in": [None, "privacy"]}}).sort("signed_at", -1).to_list(1)
    c = active[0] if active else None
    extra = {}
    for kind, field in (("fse", "fse_consent_at"), ("passaporto", "passport_consent_at")):
        k = await tdb.consents.find({"patient_id": pid, "revoked_at": None, "kind": kind}).sort("signed_at", -1).to_list(1)
        extra[field] = k[0]["signed_at"] if k else None
    await tdb.patients.update_one({"_id": oid(pid)}, {"$set": {**extra,
        "consent_at": c["signed_at"] if c and c["privacy_policy"] and c["health_data"] else None,
        "consent_version": c["version"] if c else None, "consent_email": bool(c and c.get("email_reports"))}})


@api.post("/patients/{pid}/consents")
async def record_consent(pid: str, body: ConsentIn, request: Request, user: dict = Depends(current_user)):
    """Compatibilità: delega alla firma elettronica (PDF firmato archiviato se firma su tablet)."""
    doc = await tdb.patients.find_one({"_id": oid(pid)})
    if not doc:
        raise HTTPException(404, "Paziente non trovato")
    return await record_privacy_consent(
        db, owner=user["id"], patient=doc, version=CONSENT_VERSION, signer={"name": body.signer_name, "relation": body.signer_relation},
        clauses=body.model_dump(), method=body.method, signature=body.signature,
        channel="studio_tablet" if body.method == "firma_tablet" else "cartaceo", request=request, client_signed_at=None,
        collected_by=f"{user['name']} ({user['email']})", signer_ident=f"studio:{pid}:{body.signer_name.strip().lower()}")


class ConsentKindIn(BaseModel):
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
    """Nome confrontabile: senza prefisso di relazione ('Mamma: …'), accenti e spazi doppi."""
    return " ".join(_fold((t or "").split(":", 1)[-1]).split())


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
    if not doc or needs_signature(doc):
        raise HTTPException(409, "Verifica e firma prima il referto")
    if not doc.get("signed_at"):  # referti firmati prima del connettore: la scadenza parte dalla data della visita
        doc["signed_at"] = doc["created_at"]
        await tdb.consultations.update_one({"_id": doc["_id"]}, {"$set": {"signed_at": doc["signed_at"]}})
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
        prev = {k: v for k, v in (doc.get("fse") or {}).items() if k != "prev"}
        upd = {"obscured": True, "portal_published": False, "portal_was_published": bool(doc.get("portal_published")),
               "fse": {**prev, "status": "oscurato", "prev": prev}}
    else:
        prev = (doc.get("fse") or {}).get("prev") or {}
        pat = patient_out(await tdb.patients.find_one({"_id": oid(doc["patient_id"])})) if doc.get("patient_id") else {}
        if prev.get("status") in ("inviato", "accettato", "errore"):
            new = prev  # esito già ottenuto: nessun secondo invio
        else:
            new = fse_mod.on_signed({**doc, "obscured": False, "fse": prev}, pat) if doc.get("signed_at") else (prev or None)
        upd = {"obscured": False, "fse": new, "portal_published": bool(doc.get("portal_was_published"))}
    await tdb.consultations.update_one({"_id": doc["_id"]}, {"$set": upd})
    await audit("referto_oscurato" if body.on else "referto_oscuramento_rimosso", doc["patient_name"])
    return Consultation.from_mongo(await tdb.consultations.find_one({"_id": doc["_id"]})).out()


@api.get("/fse/pending")
async def fse_pending_summary():
    items = await tdb.consultations.find({"fse.status": {"$in": ["non_inviato", "in_coda", "errore"]}, "obscured": {"$ne": True}},
                                         {"fse": 1}).to_list(2000)
    dl = sorted(x["fse"]["deadline"] for x in items if x["fse"].get("deadline"))
    return {"count": len(items), "next_deadline": dl[0] if dl else None, "errors": sum(x["fse"]["status"] == "errore" for x in items)}


@api.post("/consents/{cid}/revoke")
async def revoke_consent(cid: str):
    doc = await tdb.consents.find_one_and_update({"_id": oid(cid), "revoked_at": None}, {"$set": {"revoked_at": now_iso()}}, return_document=True)
    if not doc:
        raise HTTPException(404, "Consenso non trovato o già revocato")
    await refresh_patient_consent(doc["patient_id"])
    await db.signed_docs.update_many({"ref_id": cid, "revoked_at": None}, {"$set": {"revoked_at": now_iso()}})
    await audit("consenso_revocato", "")
    return {k: v for k, v in Consent.from_mongo(doc).out().items() if k != "signature"}


ENCRYPTED_COLLECTIONS = {"patients": Patient, "consultations": Consultation, "measurements": Measurement,
                         "checkpoints": CheckpointDoc, "waiting": WaitingPatient, "appointments": Appointment,
                         "payments": Payment, "consents": Consent}


async def encrypt_existing():
    for name, model in ENCRYPTED_COLLECTIONS.items():
        async for d in db[name].find():
            todo = {k: d[k] for k in model.__encrypted__ if k in d and d[k] is not None and not is_sealed(d[k])}
            if todo:
                await db[name].update_one({"_id": d["_id"]}, {"$set": seal_fields(todo, tuple(todo))})


@api.get("/compliance/status")
async def compliance_status():
    stats = []
    for name, model in ENCRYPTED_COLLECTIONS.items():
        total = await tdb[name].count_documents({})
        plain = 0
        async for d in tdb[name].find({}, {k: 1 for k in model.__encrypted__}):
            if any(d.get(k) is not None and not is_sealed(d.get(k)) for k in model.__encrypted__):
                plain += 1
        stats.append({"collection": name, "documents": total, "encrypted": total - plain, "fields": list(model.__encrypted__)})
    url = os.environ["MONGO_URL"]
    host = re.sub(r"^mongodb(\+srv)?://([^@]*@)?", "", url).split("/")[0].split("?")[0]
    atlas = "mongodb.net" in host
    region = os.environ.get("DATA_REGION", "")
    eu = atlas and bool(region)
    patients = await tdb.patients.count_documents({})
    with_consent = await tdb.patients.count_documents({"consent_at": {"$ne": None}})
    logs = await tdb.audit.find().sort("at", -1).to_list(15)
    return {
        "encryption": {"algorithm": "AES-256-GCM", "key_fingerprint": KEY_FINGERPRINT, "key_storage": "Variabile d'ambiente del server, separata dal database", "collections": stats},
        "transit": {"https": True, "hsts": True, "cookies": "httpOnly · Secure · SameSite=Lax", "session": "Token di accesso 15 min · rinnovo 7 giorni"},
        "database": {"provider": "MongoDB Atlas" if atlas else "MongoDB gestito dalla piattaforma", "host": "cluster Atlas" if atlas else ("locale/anteprima" if "localhost" in host else "gestito"),
                     "region": (region or "non dichiarata") if atlas else "USA/India (piattaforma Emergent)", "eu": eu},
        "consents": {"patients": patients, "with_consent": with_consent, "version": CONSENT_VERSION},
        "audit": [{"action": a["action"], "subject": unseal_fields({"s": a.get("subject")}, ("s",))["s"], "at": a["at"]} for a in logs],
    }


@app.middleware("http")
async def security_headers(request, call_next):
    resp = await call_next(request)
    resp.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["X-Frame-Options"] = "DENY"
    resp.headers["Referrer-Policy"] = "no-referrer"
    if request.url.path.startswith("/api/") and request.url.path != "/api/":
        resp.headers["Cache-Control"] = "no-store"
    return resp


async def chart_for(cid: str):
    return report_payload(await db.bodycharts.find_one({"consultation_id": cid}))


async def portal_pdf_for(c: dict):
    out = Consultation.from_mongo(c).out()
    p = await db.patients.find_one({"_id": ObjectId(out["patient_id"])}) if out.get("patient_id") else None
    owner = await db.users.find_one({"_id": ObjectId(c["owner_id"])})
    pdf = build_report(out, (owner or {}).get("name", ""), unseal_fields(p, Patient.__encrypted__) if p else None, await doctor_profile(c["owner_id"]), await chart_for(str(c["_id"])),
                       signature=await doctor_signature(db, c["owner_id"]))
    return pdf, f"Referto_{re.sub(r'[^A-Za-z0-9]+', '_', out['patient_name']).strip('_')}_{out['created_at'][:10]}.pdf"


api.include_router(build_beta(db, current_user))
api.include_router(live_router)
reg_router, admin_doctors, portal_router = build_registration(
    db, current_user, start_session, {"patient": Patient, "consultation": Consultation, "consent": Consent, "appointment": Appointment, "payment": Payment}, portal_pdf_for)
public_api.include_router(reg_router)
bill_doctor, bill_parent, bill_public, refund_online = build_billing(db, current_user, Appointment, Payment, today_rome)
api.include_router(bill_doctor)
api.include_router(build_invoicing(db, tdb, current_user, BaseDocument, Payment, today_rome))
public_api.include_router(bill_parent)
public_api.include_router(bill_public)
flow_doctor, flow_parent, flow_public = build_portal_flow(db, tdb, current_user, Appointment, tenant_clinics, refund_online)
net_admin, net_public, net_parent, net_doctor = build_network(db, current_user, Consultation, portal_pdf_for)
public_api.include_router(net_admin)
public_api.include_router(net_public)
public_api.include_router(net_parent)
api.include_router(net_doctor)
team_doctor, team_parent, team_migrate = build_team(db, current_user, Consultation, portal_pdf_for)
api.include_router(team_doctor)
ai_doctor, ai_parent, ai_migrate = build_ai_replies(db, current_user)
api.include_router(ai_doctor)
public_api.include_router(ai_parent)
public_api.include_router(team_parent)
api.include_router(flow_doctor)
msg_parent, msg_doctor = build_messaging(db, current_user)
public_api.include_router(msg_parent)
api.include_router(msg_doctor)
public_api.include_router(flow_parent)
public_api.include_router(flow_public)
sched_doctor, sched_portal, sched_cron, send_reminders = build_scheduling(db, tdb, current_user)
api.include_router(sched_doctor)
public_api.include_router(sched_portal)
public_api.include_router(sched_cron)
public_api.include_router(admin_doctors)
public_api.include_router(portal_router)
leads_public, leads_private = build_leads(db, require_role(current_user, "admin"))
public_api.include_router(leads_public)
public_api.include_router(leads_private)
public_api.include_router(build_cleanup(db, require_role(current_user, "admin")))
public_api.include_router(build_previsit(db, require_role(current_user, "parent"), notify_doctor))
inbox_admin, inbox_mine = build_support_inbox(db, require_role(current_user, "admin"), current_user)
sc_doctor, sc_public, ensure_doctor_slugs = build_showcase(db, current_user, require_role(current_user, "doctor"))
public_api.include_router(sc_doctor)
public_api.include_router(sc_public)
public_api.include_router(build_portal_docs(db, require_role(current_user, "parent"), Consultation, Patient))
hp_portal, hp_public, hp_doctor, hp_indexes = build_health_passport(db, tdb, current_user, require_role(current_user, "parent"),
                                                                    {"patient": Patient, "consultation": Consultation, "measurement": Measurement}, portal_pdf_for, age_label)
public_api.include_router(hp_portal)
public_api.include_router(hp_public)
api.include_router(hp_doctor)


@public_api.get("/portal/children/{pid}/simple")
async def portal_simple(pid: str, user: dict = Depends(require_role(current_user, "parent"))):
    """'In parole semplici' dell'ultima visita pubblicata: diagnosi, cosa fare, quando tornare + glossario (IA, in cache)."""
    u = await db.users.find_one({"_id": ObjectId(user["id"])}, {"children": 1})
    link = next((c for c in (u or {}).get("children") or [] if c["patient_id"] == pid), None)
    if not link:
        raise HTTPException(404, "Cartella non collegata al suo account")
    raw = await db.consultations.find_one({"patient_id": pid, "owner_id": link["owner_id"], "status": {"$ne": "processing"}, "guardian_hidden": {"$ne": True},
                                           "$or": [{"report_sent_at": {"$ne": None}}, {"portal_published": True}]}, sort=[("created_at", -1)])
    if not raw:
        return {"available": False}
    c = Consultation.from_mongo(raw).out()
    cached = unseal_fields(raw, ("simple",)).get("simple")
    parts = (raw.get("ai_provenance") or {}).get("parti") or {}
    cache = {}
    riep = "" if prov.is_draft(parts.get("riassunto_famiglia")) else c["note"].get("riepilogo", "")  # bozza MantAI non approvata: mai nel portale
    base = {"available": True, "consultation_id": c["id"], "created_at": c["created_at"], "clinic": c.get("clinic", ""), "riepilogo": riep,
            "riepilogo_provenance": await prov.present(db, parts.get("riassunto_famiglia"), cache),
            "report_provenance": await prov.present(db, {k: v for k, v in (raw.get("ai_provenance") or {}).items() if k != "parti"}, cache)}
    if cached:
        return {**base, **cached, "ai_provenance": await prov.present(db, parts.get("spiegazione_semplice"), cache)}
    n = c["note"]
    spec = n.get("specialita") or "Pediatria"
    who = "ai genitori" if is_pediatric(spec) else "al paziente"
    try:
        data = await llm_json(
            f"Sei un medico ({spec}) che spiega {who} l'ultima visita in italiano semplice, caldo e rassicurante, senza inventare nulla. "
            f"Dati della visita:\nMotivo: {n.get('motivo_visita','')}\nDiagnosi: {n.get('diagnosi','')}\nTerapia: {n.get('terapia','')}\n"
            f"Controlli: {n.get('follow_up','')}\nRiepilogo: {riep}\n"
            'Rispondi SOLO con JSON: {"diagnosi": "1-2 frasi semplici", "cosa_fare": ["azione concreta", "..."] (max 4), '
            '"quando_tornare": "1 frase", "glossario": [{"termine": "termine tecnico o medico usato nel referto", "spiegazione": "spiegazione semplice in max 20 parole"}] (0-5 termini: solo parole specialistiche davvero presenti nei dati, es. nomi di esami, farmaci, diagnosi o parti del corpo; mai espressioni di uso comune; lista vuota se non ce ne sono)}')
        simple = {"diagnosi": str(data.get("diagnosi") or "")[:400], "cosa_fare": [str(x)[:200] for x in (data.get("cosa_fare") or [])][:4],
                  "quando_tornare": str(data.get("quando_tornare") or "")[:300],
                  "glossario": [{"termine": str(g.get("termine"))[:60], "spiegazione": str(g.get("spiegazione"))[:200]}
                                for g in (data.get("glossario") or []) if isinstance(g, dict) and g.get("termine")][:6]}
    except Exception:
        logger.exception("Spiegazione semplice non generata")
        return {**base, "diagnosi": n.get("diagnosi", ""), "cosa_fare": [], "quando_tornare": n.get("follow_up", ""), "glossario": []}
    sp = prov.make("riassunto_famiglia", prov.GPT, prov.AUTO)
    await db.consultations.update_one({"_id": raw["_id"]}, {"$set": {**seal_fields({"simple": simple}, ("simple",)),
                                                                    **({"ai_provenance.parti.spiegazione_semplice": sp} if raw.get("ai_provenance") else {"ai_provenance": {"ai_generated": False, "parti": {"spiegazione_semplice": sp}}})}})
    await prov.log(db, link["owner_id"], f"visita di {c['patient_name']}", None, prov.AUTO, tipo="spiegazione_semplice")
    return {**base, **simple, "ai_provenance": sp}
public_api.include_router(inbox_admin)
public_api.include_router(inbox_mine)
public_api.include_router(auth_router)
public_api.include_router(build_password_reset(db, current_user))
public_api.include_router(build_account(db, current_user))
bc_doctor, bc_parent, bc_migrate_photos = build_bodychart(db, current_user, llm_json)
sd_doctor, sd_parent, sd_public = build_signed_docs(db, current_user, CONSENT_VERSION)
api.include_router(sd_doctor)
public_api.include_router(sd_parent)
public_api.include_router(sd_public)
api.include_router(bc_doctor)
api.include_router(tpl_router)
api.include_router(module_router)
public_api.include_router(bc_parent)
app.include_router(public_api)
app.include_router(api)
app.add_middleware(prov.ProvenanceGuard)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ['CORS_ORIGINS'].split(','),
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
