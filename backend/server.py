from dotenv import load_dotenv
from pathlib import Path
load_dotenv(Path(__file__).parent / '.env')

from fastapi import FastAPI, APIRouter, HTTPException, UploadFile, File, Depends
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
import os
import io
import json
import re
import uuid
import time
import logging
from beta import build_beta
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, BeforeValidator
from typing import List, Optional, Annotated, Literal, ClassVar
from datetime import datetime, timezone
from crypto import seal_fields, unseal_fields, is_sealed, KEY_FINGERPRINT
from emergentintegrations.llm.openai import OpenAISpeechToText
from emergentintegrations.llm.chat import LlmChat, UserMessage
from auth import build_auth, seed_doctor
from report import build_report
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
LLM_KEY = os.environ['EMERGENT_LLM_KEY']

app = FastAPI()
auth_router, current_user = build_auth(db)
public_api = APIRouter(prefix="/api")
api = APIRouter(prefix="/api", dependencies=[Depends(current_user)])
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


CLINICS = ["Studio Centro", "Studio Provincia"]


class Appointment(BaseDocument):
    clinic: str
    time: str
    patient_name: str
    patient_id: Optional[str] = None
    visit_type: str
    duration: int = 30
    status: Literal["programmato", "in_attesa", "in_corso", "completato"] = "programmato"
    notes: str = ""
    __encrypted__: ClassVar[tuple] = ("visit_type", "notes")


class AppointmentIn(BaseModel):
    clinic: str
    time: str
    patient_name: str
    patient_id: Optional[str] = None
    visit_type: str
    duration: int = 30
    status: Literal["programmato", "in_attesa", "in_corso", "completato"] = "programmato"
    notes: str = ""


class AppointmentPatch(BaseModel):
    clinic: Optional[str] = None
    time: Optional[str] = None
    patient_name: Optional[str] = None
    patient_id: Optional[str] = None
    visit_type: Optional[str] = None
    duration: Optional[int] = None
    status: Optional[Literal["programmato", "in_attesa", "in_corso", "completato"]] = None
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


class ClinicalNote(BaseModel):
    model_config = ConfigDict(extra="ignore")
    anamnesi_fisiologica: str = ""
    allattamento: str = ""
    svezzamento: str = ""
    motivo_visita: str = ""
    sintomi: str = ""
    torl: str = ""
    torace_auscultazione: str = ""
    addome: str = ""
    crescita: Growth = Field(default_factory=Growth)
    diagnosi: str = ""
    terapia: str = ""
    farmaci: List[Drug] = Field(default_factory=list)
    follow_up: str = ""


class Consultation(BaseDocument):
    patient_name: str
    patient_id: Optional[str] = None
    clinic: str = ""
    waiting_id: Optional[str] = None
    transcript: str
    note: ClinicalNote
    duration_sec: int = 0
    report_sent_at: Optional[str] = None
    report_sent_to: Optional[str] = None
    paper_consent: bool = False
    doctor_id: Optional[str] = None
    ai_sec: float = 0
    finalized_at: Optional[str] = None
    pdf_exports: int = 0
    created_at: str = Field(default_factory=now_iso)
    __encrypted__: ClassVar[tuple] = ("transcript", "note", "report_sent_to")


class ConsultationIn(BaseModel):
    patient_name: str
    patient_id: Optional[str] = None
    clinic: str = ""
    waiting_id: Optional[str] = None
    transcript: str
    duration_sec: int = 0
    paper_consent: bool = False


class ConsultationPatch(BaseModel):
    note: ClinicalNote


# ---------- Pediatric models ----------
class Patient(BaseDocument):
    name: str
    birth_date: str
    sex: Literal["F", "M"]
    fiscal_code: str = ""
    guardian: str = ""
    guardian_email: str = ""
    allergies: str = ""
    notes: str = ""
    consent_at: Optional[str] = None
    consent_version: Optional[str] = None
    consent_email: bool = False
    created_at: str = Field(default_factory=now_iso)
    __encrypted__: ClassVar[tuple] = ("fiscal_code", "guardian", "guardian_email", "allergies", "notes")


class PatientIn(BaseModel):
    name: str
    birth_date: str
    sex: Literal["F", "M"]
    fiscal_code: str = ""
    guardian: str = ""
    guardian_email: str = ""
    allergies: str = ""
    notes: str = ""


class PatientPatch(BaseModel):
    name: Optional[str] = None
    birth_date: Optional[str] = None
    sex: Optional[Literal["F", "M"]] = None
    fiscal_code: Optional[str] = None
    guardian_email: Optional[str] = None
    guardian: Optional[str] = None
    allergies: Optional[str] = None
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
    doc = await db.patients.find_one({"_id": ObjectId(pid)})
    return unseal_fields(doc, Patient.__encrypted__) if doc else None


def enrich_growth(note: ClinicalNote, patient: Optional[dict], visit_day: date):
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
    await db.measurements.update_one({"consultation_id": c["id"]}, {"$set": m.to_mongo()}, upsert=True)


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
    await db.appointments.delete_many({})
    await db.waiting.delete_many({})
    await db.patients.delete_many({})
    await db.measurements.delete_many({})
    today = date.today()
    ids = {}
    for i, (name, sex, months, zw, zh, guardian, allergies, notes) in enumerate(SEED_PATIENTS):
        birth = today - timedelta(days=round(months * 30.4375))
        res = await db.patients.insert_one(Patient(name=name, birth_date=birth.isoformat(), sex=sex, guardian=guardian,
                                                   allergies=allergies, notes=notes).to_mongo())
        pid = str(res.inserted_id)
        ids[name] = pid
        past = [m for m in HISTORY_MONTHS if m < months - 0.7][-4:]
        for j, m in enumerate(past):
            jitter = ((i + j) % 3 - 1) * 0.08
            clinic = CLINICS[(i + j) % 2]
            day = birth + timedelta(days=round(m * 30.4375))
            await db.measurements.insert_one(Measurement(
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
            await db.consultations.insert_one(Consultation(
                patient_name=name, patient_id=pid, clinic=CLINICS[(i + len(past) - 1) % 2], transcript="Visita registrata nello storico.",
                note=note, created_at=datetime.combine(day, datetime.min.time(), timezone.utc).replace(hour=10).isoformat()).to_mongo())
    await db.appointments.insert_many([
        Appointment(clinic=c, time=t, patient_name=p, patient_id=ids[p], visit_type=v, status=s).to_mongo()
        for c, t, p, v, s in SEED_APPTS])
    base = datetime.now(timezone.utc).timestamp()
    await db.waiting.insert_many([
        WaitingPatient(name=n, patient_id=ids[n], clinic=c, reason=r, priority=p,
                       arrived_at=datetime.fromtimestamp(base - mins * 60, timezone.utc).isoformat()).to_mongo()
        for n, c, r, p, mins in SEED_WAITING])
    await db.meta.update_one({"_id": "seed"}, {"$set": {"v": 2}}, upsert=True)


@app.on_event("startup")
async def seed():
    await seed_doctor(db)
    await seed_pediatric()
    await encrypt_existing()


# ---------- Routes ----------
@public_api.get("/")
async def root():
    return {"app": "MantMed", "ok": True}


@api.get("/auth/me")
async def me(user: dict = Depends(current_user)):
    return user


@api.get("/clinics")
async def clinics():
    return CLINICS


@api.get("/appointments")
async def list_appointments():
    docs = await db.appointments.find().sort("time", 1).to_list(500)
    return [Appointment.from_mongo(d).out() for d in docs]


@api.post("/appointments")
async def create_appointment(body: AppointmentIn):
    appt = Appointment(**body.model_dump())
    res = await db.appointments.insert_one(appt.to_mongo())
    appt.id = str(res.inserted_id)
    return appt.out()


@api.patch("/appointments/{aid}")
async def update_appointment(aid: str, body: AppointmentPatch):
    upd = body.model_dump(exclude_none=True)
    doc = await db.appointments.find_one_and_update({"_id": oid(aid)}, {"$set": Appointment.sealed_set(upd)}, return_document=True)
    if not doc:
        raise HTTPException(404, "Appuntamento non trovato")
    return Appointment.from_mongo(doc).out()


@api.delete("/appointments/{aid}")
async def delete_appointment(aid: str):
    res = await db.appointments.delete_one({"_id": oid(aid)})
    if not res.deleted_count:
        raise HTTPException(404, "Appuntamento non trovato")
    return {"deleted": aid}


@api.get("/waiting")
async def list_waiting():
    docs = await db.waiting.find().sort("arrived_at", 1).to_list(500)
    items = [WaitingPatient.from_mongo(d).out() for d in docs]
    return sorted(items, key=lambda w: (w["priority"] != "urgente", w["arrived_at"]))


@api.post("/waiting")
async def create_waiting(body: WaitingIn):
    w = WaitingPatient(**body.model_dump())
    res = await db.waiting.insert_one(w.to_mongo())
    w.id = str(res.inserted_id)
    return w.out()


@api.patch("/waiting/{wid}")
async def update_waiting(wid: str, body: WaitingPatch):
    doc = await db.waiting.find_one_and_update({"_id": oid(wid)}, {"$set": WaitingPatient.sealed_set(body.model_dump(exclude_none=True))}, return_document=True)
    if not doc:
        raise HTTPException(404, "Paziente non trovato")
    return WaitingPatient.from_mongo(doc).out()


@api.delete("/waiting/{wid}")
async def delete_waiting(wid: str):
    res = await db.waiting.delete_one({"_id": oid(wid)})
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
    "crescita: {eta_mesi (numero|null), sesso ('M'|'F'|''), peso_kg (numero|null), altezza_cm (numero|null), "
    "circonferenza_cranica_cm (numero|null), percentile_peso, percentile_altezza, percentile_cc (stringhe)};\n"
    "farmaci: lista di {nome, mg_kg_dose (numero|null), dosi_giorno (intero|null), concentrazione_mg_ml (numero|null), "
    "max_mg_dose (numero|null), giorni (intero|null), note}.\n"
    "Regole: usa solo informazioni presenti nella trascrizione. Se un campo testuale manca scrivi 'Non riportato'; "
    "se un numero manca usa null. Per i farmaci riporta SOLO quelli prescritti dal medico e SOLO i dosaggi da lui indicati: "
    "non proporre mai dosaggi o farmaci non menzionati. torl = testa, orecchie, rino, laringe/faringe (otoscopia, faringe, linfonodi)."
)


async def structure_note(transcript: str, session: str) -> ClinicalNote:
    chat = LlmChat(api_key=LLM_KEY, session_id=session, system_message=NOTE_SYSTEM).with_model("openai", "gpt-5.6-terra")
    raw = await chat.send_message(UserMessage(text=f"Trascrizione:\n{transcript}"))
    match = re.search(r"\{.*\}", raw, re.S)
    data = json.loads(match.group(0)) if match else {}
    text_keys = [k for k, f in ClinicalNote.model_fields.items() if f.annotation is str]
    clean = {k: str(data.get(k) or "") for k in text_keys}
    clean["crescita"] = data.get("crescita") if isinstance(data.get("crescita"), dict) else {}
    clean["farmaci"] = [d for d in data.get("farmaci") or [] if isinstance(d, dict)]
    return ClinicalNote.model_validate(clean)


@api.post("/consultations")
async def create_consultation(body: ConsultationIn, user: dict = Depends(current_user)):
    if not body.transcript.strip():
        raise HTTPException(400, "Trascrizione vuota")
    patient = await get_patient(body.patient_id)
    if patient and not patient.get("consent_at"):
        raise HTTPException(412, "Consenso privacy non registrato: registralo nel passaporto prima di avviare la visita")
    if not patient and not body.paper_consent:
        raise HTTPException(412, "Conferma l'acquisizione del consenso privacy per la visita libera")
    t0 = time.monotonic()
    try:
        note = await structure_note(body.transcript, f"consult-{uuid.uuid4()}")
    except Exception as e:
        logger.exception("Strutturazione fallita")
        raise HTTPException(502, f"Generazione nota fallita: {e}")
    enrich_growth(note, patient, date.today())
    c = Consultation(**body.model_dump(), note=note, doctor_id=user["id"], ai_sec=round(time.monotonic() - t0, 1))
    res = await db.consultations.insert_one(c.to_mongo())
    c.id = str(res.inserted_id)
    await sync_measurement(c.out())
    if body.waiting_id and ObjectId.is_valid(body.waiting_id):
        await db.waiting.delete_one({"_id": ObjectId(body.waiting_id)})
        await db.appointments.update_many({"patient_name": body.patient_name}, {"$set": {"status": "completato"}})
    return c.out()


@api.get("/consultations")
async def list_consultations():
    docs = await db.consultations.find().sort("created_at", -1).to_list(20)
    return [Consultation.from_mongo(d).out() for d in docs]


@api.get("/consultations/{cid}/pdf")
async def consultation_pdf(cid: str, user: dict = Depends(current_user)):
    doc = await db.consultations.find_one({"_id": oid(cid)})
    if not doc:
        raise HTTPException(404, "Consultazione non trovata")
    c = Consultation.from_mongo(doc).out()
    pdf = build_report(c, user["name"], await get_patient(c.get("patient_id")))
    await db.consultations.update_one({"_id": oid(cid)}, {"$set": {"finalized_at": now_iso()}, "$inc": {"pdf_exports": 1}})
    await audit("referto_pdf", c["patient_name"])
    name = f"Referto_{re.sub(r'[^A-Za-z0-9]+', '_', c['patient_name']).strip('_')}_{c['created_at'][:10]}.pdf"
    return Response(pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f"attachment; filename=\"{name}\"; filename*=UTF-8''{quote(name)}"})


@api.post("/consultations/{cid}/send-report")
async def send_report(cid: str, user: dict = Depends(current_user)):
    doc = await db.consultations.find_one({"_id": oid(cid)})
    if not doc:
        raise HTTPException(404, "Consultazione non trovata")
    c = Consultation.from_mongo(doc).out()
    patient = await get_patient(c.get("patient_id"))
    to = (patient or {}).get("guardian_email", "").strip()
    if not EMAIL_RE.match(to):
        raise HTTPException(400, "Email del genitore mancante o non valida nel passaporto del paziente")
    if not patient.get("consent_email"):
        raise HTTPException(412, "Il genitore non ha acconsentito all'invio dei referti via email")
    pdf = build_report(c, user["name"], patient)
    day = datetime.fromisoformat(c["created_at"]).strftime("%d/%m/%Y")
    fname = f"Referto_{re.sub(r'[^A-Za-z0-9]+', '_', c['patient_name']).strip('_')}_{c['created_at'][:10]}.pdf"
    subject = f"Referto della visita pediatrica di {c['patient_name']} – {day}"
    html = (
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F5F7;padding:24px 0"><tr><td align="center">'
        '<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;font-family:Arial,sans-serif;color:#0A192F">'
        '<tr><td style="background:#0A192F;padding:22px 28px;color:#ffffff;font-family:Georgia,serif;font-size:24px">MantMed'
        '<div style="font-family:Arial,sans-serif;font-size:11px;letter-spacing:2px;color:#C9CCD3;margin-top:4px">STUDIO MEDICO SPECIALISTICO · PEDIATRIA</div></td></tr>'
        f'<tr><td style="padding:28px;font-size:15px;line-height:1.6"><p>Gentile {hesc(patient.get("guardian") or "famiglia")},</p>'
        f'<p>in allegato trova il referto della visita di <strong>{hesc(c["patient_name"])}</strong> del {day}'
        f'{" presso lo " + hesc(c["clinic"]) if c.get("clinic") else ""}.</p>'
        '<p>Per qualsiasi chiarimento può rispondere a questa email o contattare lo studio.</p>'
        f'<p style="margin-top:24px">Cordiali saluti,<br><strong>{hesc(user["name"])}</strong><br>'
        f'<span style="color:#5B6478;font-size:13px">{hesc(os.environ["DOCTOR_SPECIALTY"])}<br>Tel. {hesc(os.environ["STUDIO_PHONE"])}</span></p></td></tr>'
        '<tr><td style="padding:16px 28px;border-top:1px solid #DADDE3;font-size:11px;color:#5B6478;line-height:1.5">'
        'Comunicazione riservata contenente dati sanitari (art. 9 Reg. UE 2016/679 – GDPR), destinata esclusivamente al genitore o tutore del paziente. '
        'Se l\'ha ricevuta per errore, la elimini e avvisi lo studio. Inviata da MantMed.</td></tr></table></td></tr></table>')
    email_id = await send_email(to=to, subject=subject, html=html,
                                attachments=[{"filename": fname, "content": base64.b64encode(pdf).decode()}])
    sent_at = now_iso()
    await db.consultations.update_one({"_id": oid(cid)}, {"$set": {**Consultation.sealed_set({"report_sent_at": sent_at, "report_sent_to": to}), "finalized_at": sent_at}, "$inc": {"pdf_exports": 1}})
    await audit("referto_email", c["patient_name"])
    return {"sent": True, "to": to, "sent_at": sent_at, "email_id": email_id}


EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


@api.patch("/consultations/{cid}")
async def update_consultation(cid: str, body: ConsultationPatch):
    existing = await db.consultations.find_one({"_id": oid(cid)})
    if not existing:
        raise HTTPException(404, "Consultazione non trovata")
    enrich_growth(body.note, await get_patient(existing.get("patient_id")), date.fromisoformat(existing["created_at"][:10]))
    doc = await db.consultations.find_one_and_update({"_id": oid(cid)}, {"$set": {**Consultation.sealed_set({"note": body.note.model_dump()}), "finalized_at": now_iso()}}, return_document=True)
    out = Consultation.from_mongo(doc).out()
    await sync_measurement(out)
    return out


# ---------- Passaporto sanitario ----------
@api.get("/patients")
async def list_patients():
    docs = await db.patients.find().sort("name", 1).to_list(1000)
    last = {d["_id"]: d for d in await db.consultations.aggregate([
        {"$match": {"patient_id": {"$ne": None}}}, {"$sort": {"created_at": -1}},
        {"$group": {"_id": "$patient_id", "last": {"$first": "$created_at"}, "clinics": {"$addToSet": "$clinic"}, "n": {"$sum": 1}}}]).to_list(1000)}
    out = []
    for d in docs:
        p = patient_out(d)
        info = last.get(p["id"], {})
        out.append({**p, "last_visit": info.get("last"), "visits": info.get("n", 0), "clinics": sorted(c for c in info.get("clinics", []) if c)})
    return out


@api.post("/patients")
async def create_patient(body: PatientIn):
    date.fromisoformat(body.birth_date)
    if body.guardian_email and not EMAIL_RE.match(body.guardian_email.strip()):
        raise HTTPException(400, "Email del genitore non valida")
    res = await db.patients.insert_one(Patient(**body.model_dump()).to_mongo())
    return patient_out(await db.patients.find_one({"_id": res.inserted_id}))


@api.patch("/patients/{pid}")
async def update_patient(pid: str, body: PatientPatch):
    if body.guardian_email and not EMAIL_RE.match(body.guardian_email.strip()):
        raise HTTPException(400, "Email del genitore non valida")
    doc = await db.patients.find_one_and_update({"_id": oid(pid)}, {"$set": Patient.sealed_set(body.model_dump(exclude_none=True))}, return_document=True)
    if not doc:
        raise HTTPException(404, "Paziente non trovato")
    return patient_out(doc)


def measurement_out(m: dict, patient: dict) -> dict:
    x = Measurement.from_mongo(m).out()
    months = age_months(patient["birth_date"], date.fromisoformat(x["date"]))
    return {**x, "age_months": round(months, 1), "age_label": age_label(months),
            "percentiles": all_percentiles(patient["sex"], months, x["weight"], x["height"], x["hc"])}


@api.get("/patients/{pid}/passport")
async def passport(pid: str):
    doc = await db.patients.find_one({"_id": oid(pid)})
    if not doc:
        raise HTTPException(404, "Paziente non trovato")
    patient = patient_out(doc)
    await audit("accesso_passaporto", patient["name"])
    consents = [Consent.from_mongo(x).out() for x in await db.consents.find({"patient_id": pid}).sort("signed_at", -1).to_list(50)]
    cons = [Consultation.from_mongo(c).out() for c in await db.consultations.find({"patient_id": pid}).sort("created_at", -1).to_list(200)]
    meas = [measurement_out(m, patient) for m in await db.measurements.find({"patient_id": pid}).sort("date", 1).to_list(500)]
    cps = [CheckpointDoc.from_mongo(c).out() for c in await db.checkpoints.find({"patient_id": pid}).sort("created_at", -1).to_list(100)]
    pays = [Payment.from_mongo(x).out() for x in await db.payments.find({"patient_id": pid}).sort("created_at", -1).to_list(500)]
    clinics = {c: {"clinic": c, "visits": 0, "measurements": 0, "checkpoints": 0} for c in CLINICS}
    for c in cons:
        clinics.setdefault(c["clinic"] or "Altro", {"clinic": c["clinic"] or "Altro", "visits": 0, "measurements": 0, "checkpoints": 0})["visits"] += 1
    for m in meas:
        if m["clinic"] in clinics:
            clinics[m["clinic"]]["measurements"] += 1
    for c in cps:
        if c["clinic"] in clinics:
            clinics[c["clinic"]]["checkpoints"] += 1
    return {"patient": patient, "consultations": cons, "measurements": meas, "checkpoints": cps, "payments": pays, "consents": consents,
            "clinics": list(clinics.values()), "synced_at": now_iso()}


@api.post("/patients/{pid}/measurements")
async def add_measurement(pid: str, body: MeasurementIn):
    doc = await db.patients.find_one({"_id": oid(pid)})
    if not doc:
        raise HTTPException(404, "Paziente non trovato")
    date.fromisoformat(body.date)
    m = Measurement(patient_id=pid, **body.model_dump())
    res = await db.measurements.insert_one(m.to_mongo())
    return measurement_out(await db.measurements.find_one({"_id": res.inserted_id}), patient_out(doc))


@api.get("/growth/percentiles")
async def growth_percentiles(sex: Literal["F", "M"], age_months: float, weight: Optional[float] = None,
                             height: Optional[float] = None, hc: Optional[float] = None):
    return all_percentiles(sex, age_months, weight, height, hc)


@api.get("/growth/curves")
async def growth_curves(sex: Literal["F", "M"], indicator: Literal["wfa", "lhfa", "hcfa"], max_month: float = 24):
    return curves(indicator, sex, max_month)


# ---------- Registro cassa ----------
ROME = ZoneInfo("Europe/Rome")
METHODS = {"contanti": "Contanti", "pos": "POS", "bonifico": "Bonifico"}


def today_rome() -> str:
    return datetime.now(ROME).date().isoformat()


class Payment(BaseDocument):
    consultation_id: Optional[str] = None
    patient_id: Optional[str] = None
    patient_name: str
    clinic: str = ""
    service: str = "Visita pediatrica specialistica"
    amount: float
    method: Literal["contanti", "pos", "bonifico"]
    date: str = Field(default_factory=today_rome)
    created_at: str = Field(default_factory=now_iso)
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
    by_clinic = {c: {"clinic": c, "total": 0.0, "count": 0} for c in CLINICS}
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
    docs = await db.payments.find({"date": {"$gte": start, "$lte": end}}).sort("created_at", 1).to_list(5000)
    return [Payment.from_mongo(d).out() for d in docs]


@api.post("/payments")
async def create_payment(body: PaymentIn):
    if not body.patient_name.strip():
        raise HTTPException(400, "Paziente obbligatorio")
    p = Payment(**{**body.model_dump(), "amount": round(body.amount, 2)})
    res = await db.payments.insert_one(p.to_mongo())
    p.id = str(res.inserted_id)
    return p.out()


@api.get("/payments")
async def list_payments(start: Optional[str] = None, end: Optional[str] = None, consultation_id: Optional[str] = None):
    if consultation_id:
        docs = await db.payments.find({"consultation_id": consultation_id}).sort("created_at", 1).to_list(50)
        items = [Payment.from_mongo(d).out() for d in docs]
    else:
        s = start or today_rome()
        items = await payments_between(s, end or s)
    return {"items": items, "summary": summarize(items), "today": today_rome()}


@api.delete("/payments/{pid}")
async def delete_payment(pid: str):
    res = await db.payments.delete_one({"_id": oid(pid)})
    if not res.deleted_count:
        raise HTTPException(404, "Incasso non trovato")
    return {"deleted": pid}


@api.get("/payments/export")
async def export_payments(start: Optional[str] = None, end: Optional[str] = None):
    s = start or today_rome()
    e = end or s
    items = await payments_between(s, e)
    eur = lambda v: f"{v:.2f}".replace(".", ",")
    clean = lambda v: str(v or "").replace(";", ",").replace("\n", " ")
    rows = ["Data;Ora;Paziente;Prestazione;Studio;Metodo;Importo (EUR)"]
    for p in items:
        t = datetime.fromisoformat(p["created_at"]).astimezone(ROME).strftime("%H:%M")
        d = datetime.fromisoformat(p["date"]).strftime("%d/%m/%Y")
        rows.append(";".join([d, t, clean(p["patient_name"]), clean(p["service"]), clean(p["clinic"]), METHODS[p["method"]], eur(p["amount"])]))
    sm = summarize(items)
    rows += ["", "Riepilogo;;;;;Metodo;Totale (EUR)"]
    rows += [f";;;;;{m['label']};{eur(m['total'])}" for m in sm["by_method"]]
    rows += [f";;;;;Totale;{eur(sm['total'])}"]
    csv = "\ufeff" + "\r\n".join(rows) + "\r\n"
    name = f"Registro_cassa_{s}" + (f"_{e}" if e != s else "") + ".csv"
    return Response(csv.encode("utf-8"), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": f"attachment; filename=\"{name}\""})


@api.get("/checkpoints/bands")
async def checkpoint_bands():
    return BANDS


@api.get("/patients/{pid}/checkpoint")
async def checkpoint_template(pid: str):
    doc = await db.patients.find_one({"_id": oid(pid)})
    if not doc:
        raise HTTPException(404, "Paziente non trovato")
    return band_for(age_months(doc["birth_date"]))


@api.post("/patients/{pid}/checkpoints")
async def submit_checkpoint(pid: str, body: CheckpointIn):
    doc = await db.patients.find_one({"_id": oid(pid)})
    if not doc:
        raise HTTPException(404, "Paziente non trovato")
    months = age_months(doc["birth_date"])
    band = band_for(months)
    result = {**evaluate(band, body.answers), "next": band["next"]}
    cp = CheckpointDoc(patient_id=pid, band_id=band["id"], band_label=band["label"], age_months=round(months, 1),
                       clinic=body.clinic, answers=body.answers, result=result)
    res = await db.checkpoints.insert_one(cp.to_mongo())
    cp.id = str(res.inserted_id)
    return cp.out()


# ---------- GDPR: consensi, audit, crittografia ----------
CONSENT_VERSION = "Informativa privacy v1.0 · 2026-10"


class Consent(BaseDocument):
    patient_id: str
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
    await db.audit.insert_one({"action": action, "subject": seal_fields({"s": subject}, ("s",))["s"], "at": now_iso()})


async def refresh_patient_consent(pid: str):
    active = await db.consents.find({"patient_id": pid, "revoked_at": None}).sort("signed_at", -1).to_list(1)
    c = active[0] if active else None
    await db.patients.update_one({"_id": oid(pid)}, {"$set": {
        "consent_at": c["signed_at"] if c and c["privacy_policy"] and c["health_data"] else None,
        "consent_version": c["version"] if c else None, "consent_email": bool(c and c.get("email_reports"))}})


@api.post("/patients/{pid}/consents")
async def record_consent(pid: str, body: ConsentIn):
    doc = await db.patients.find_one({"_id": oid(pid)})
    if not doc:
        raise HTTPException(404, "Paziente non trovato")
    if not (body.privacy_policy and body.health_data):
        raise HTTPException(400, "Informativa privacy e trattamento dei dati sanitari sono obbligatori")
    if not body.signer_name.strip():
        raise HTTPException(400, "Nome del firmatario obbligatorio")
    if body.method == "firma_tablet" and not (body.signature or "").startswith("data:image/png;base64,"):
        raise HTTPException(400, "Firma mancante")
    await db.consents.update_many({"patient_id": pid, "revoked_at": None}, {"$set": {"revoked_at": now_iso()}})
    c = Consent(patient_id=pid, **body.model_dump())
    res = await db.consents.insert_one(c.to_mongo())
    c.id = str(res.inserted_id)
    await refresh_patient_consent(pid)
    await audit("consenso_registrato", doc["name"])
    return c.out()


@api.post("/consents/{cid}/revoke")
async def revoke_consent(cid: str):
    doc = await db.consents.find_one_and_update({"_id": oid(cid), "revoked_at": None}, {"$set": {"revoked_at": now_iso()}}, return_document=True)
    if not doc:
        raise HTTPException(404, "Consenso non trovato o già revocato")
    await refresh_patient_consent(doc["patient_id"])
    await audit("consenso_revocato", "")
    return Consent.from_mongo(doc).out()


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
        total = await db[name].count_documents({})
        plain = 0
        async for d in db[name].find({}, {k: 1 for k in model.__encrypted__}):
            if any(d.get(k) is not None and not is_sealed(d.get(k)) for k in model.__encrypted__):
                plain += 1
        stats.append({"collection": name, "documents": total, "encrypted": total - plain, "fields": list(model.__encrypted__)})
    url = os.environ["MONGO_URL"]
    host = re.sub(r"^mongodb(\+srv)?://([^@]*@)?", "", url).split("/")[0].split("?")[0]
    atlas = "mongodb.net" in host
    region = os.environ.get("DATA_REGION", "")
    eu = atlas and bool(region)
    patients = await db.patients.count_documents({})
    with_consent = await db.patients.count_documents({"consent_at": {"$ne": None}})
    logs = await db.audit.find().sort("at", -1).to_list(15)
    return {
        "encryption": {"algorithm": "AES-256-GCM", "key_fingerprint": KEY_FINGERPRINT, "key_storage": "Variabile d'ambiente del server, separata dal database", "collections": stats},
        "transit": {"https": True, "hsts": True, "cookies": "httpOnly · Secure · SameSite=Lax", "session": "Token di accesso 15 min · rinnovo 7 giorni"},
        "database": {"provider": "MongoDB Atlas" if atlas else "MongoDB gestito dalla piattaforma", "host": "cluster Atlas" if atlas else ("locale/anteprima" if "localhost" in host else "gestito"),
                     "region": region or ("non dichiarata" if atlas else "USA/India (piattaforma Emergent)"), "eu": eu},
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


api.include_router(build_beta(db, current_user))
public_api.include_router(auth_router)
app.include_router(public_api)
app.include_router(api)
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
