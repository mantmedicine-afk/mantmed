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
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, BeforeValidator
from typing import List, Optional, Annotated, Literal
from datetime import datetime, timezone
from emergentintegrations.llm.openai import OpenAISpeechToText
from emergentintegrations.llm.chat import LlmChat, UserMessage
from auth import build_auth, seed_doctor
from report import build_report
from growth import age_months, all_percentiles, curves, lms, value_at
from checkpoints import BANDS, band_for, evaluate
from datetime import date, timedelta
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

    @classmethod
    def from_mongo(cls, doc):
        return cls.model_validate(doc)

    def to_mongo(self):
        data = self.model_dump(by_alias=True, exclude={"id"})
        data.pop("_id", None)
        return data

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
    created_at: str = Field(default_factory=now_iso)


class ConsultationIn(BaseModel):
    patient_name: str
    patient_id: Optional[str] = None
    clinic: str = ""
    waiting_id: Optional[str] = None
    transcript: str
    duration_sec: int = 0


class ConsultationPatch(BaseModel):
    note: ClinicalNote


# ---------- Pediatric models ----------
class Patient(BaseDocument):
    name: str
    birth_date: str
    sex: Literal["F", "M"]
    guardian: str = ""
    allergies: str = ""
    notes: str = ""
    created_at: str = Field(default_factory=now_iso)


class PatientIn(BaseModel):
    name: str
    birth_date: str
    sex: Literal["F", "M"]
    guardian: str = ""
    allergies: str = ""
    notes: str = ""


class PatientPatch(BaseModel):
    name: Optional[str] = None
    birth_date: Optional[str] = None
    sex: Optional[Literal["F", "M"]] = None
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
    return await db.patients.find_one({"_id": ObjectId(pid)})


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
    doc = await db.appointments.find_one_and_update({"_id": oid(aid)}, {"$set": upd}, return_document=True)
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
    doc = await db.waiting.find_one_and_update({"_id": oid(wid)}, {"$set": body.model_dump(exclude_none=True)}, return_document=True)
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
async def create_consultation(body: ConsultationIn):
    if not body.transcript.strip():
        raise HTTPException(400, "Trascrizione vuota")
    try:
        note = await structure_note(body.transcript, f"consult-{uuid.uuid4()}")
    except Exception as e:
        logger.exception("Strutturazione fallita")
        raise HTTPException(502, f"Generazione nota fallita: {e}")
    patient = await get_patient(body.patient_id)
    enrich_growth(note, patient, date.today())
    c = Consultation(**body.model_dump(), note=note)
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
    pdf = build_report(c, user["name"])
    name = f"Referto_{re.sub(r'[^A-Za-z0-9]+', '_', c['patient_name']).strip('_')}_{c['created_at'][:10]}.pdf"
    return Response(pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f"attachment; filename=\"{name}\"; filename*=UTF-8''{quote(name)}"})


@api.patch("/consultations/{cid}")
async def update_consultation(cid: str, body: ConsultationPatch):
    existing = await db.consultations.find_one({"_id": oid(cid)})
    if not existing:
        raise HTTPException(404, "Consultazione non trovata")
    enrich_growth(body.note, await get_patient(existing.get("patient_id")), date.fromisoformat(existing["created_at"][:10]))
    doc = await db.consultations.find_one_and_update({"_id": oid(cid)}, {"$set": {"note": body.note.model_dump()}}, return_document=True)
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
    res = await db.patients.insert_one(Patient(**body.model_dump()).to_mongo())
    return patient_out(await db.patients.find_one({"_id": res.inserted_id}))


@api.patch("/patients/{pid}")
async def update_patient(pid: str, body: PatientPatch):
    doc = await db.patients.find_one_and_update({"_id": oid(pid)}, {"$set": body.model_dump(exclude_none=True)}, return_document=True)
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
    cons = [Consultation.from_mongo(c).out() for c in await db.consultations.find({"patient_id": pid}).sort("created_at", -1).to_list(200)]
    meas = [measurement_out(m, patient) for m in await db.measurements.find({"patient_id": pid}).sort("date", 1).to_list(500)]
    cps = [CheckpointDoc.from_mongo(c).out() for c in await db.checkpoints.find({"patient_id": pid}).sort("created_at", -1).to_list(100)]
    clinics = {c: {"clinic": c, "visits": 0, "measurements": 0, "checkpoints": 0} for c in CLINICS}
    for c in cons:
        clinics.setdefault(c["clinic"] or "Altro", {"clinic": c["clinic"] or "Altro", "visits": 0, "measurements": 0, "checkpoints": 0})["visits"] += 1
    for m in meas:
        if m["clinic"] in clinics:
            clinics[m["clinic"]]["measurements"] += 1
    for c in cps:
        if c["clinic"] in clinics:
            clinics[c["clinic"]]["checkpoints"] += 1
    return {"patient": patient, "consultations": cons, "measurements": meas, "checkpoints": cps,
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
