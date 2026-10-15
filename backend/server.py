from fastapi import FastAPI, APIRouter, HTTPException, UploadFile, File
from dotenv import load_dotenv
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

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

client = AsyncIOMotorClient(os.environ['MONGO_URL'])
db = client[os.environ['DB_NAME']]
LLM_KEY = os.environ['EMERGENT_LLM_KEY']

app = FastAPI()
api = APIRouter(prefix="/api")
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
    visit_type: str
    duration: int = 30
    status: Literal["programmato", "in_attesa", "in_corso", "completato"] = "programmato"
    notes: str = ""


class AppointmentIn(BaseModel):
    clinic: str
    time: str
    patient_name: str
    visit_type: str
    duration: int = 30
    status: Literal["programmato", "in_attesa", "in_corso", "completato"] = "programmato"
    notes: str = ""


class AppointmentPatch(BaseModel):
    clinic: Optional[str] = None
    time: Optional[str] = None
    patient_name: Optional[str] = None
    visit_type: Optional[str] = None
    duration: Optional[int] = None
    status: Optional[Literal["programmato", "in_attesa", "in_corso", "completato"]] = None
    notes: Optional[str] = None


class WaitingPatient(BaseDocument):
    name: str
    clinic: str
    reason: str
    age: Optional[int] = None
    priority: Literal["normale", "urgente"] = "normale"
    arrived_at: str = Field(default_factory=now_iso)
    status: Literal["in_attesa", "in_studio"] = "in_attesa"


class WaitingIn(BaseModel):
    name: str
    clinic: str
    reason: str
    age: Optional[int] = None
    priority: Literal["normale", "urgente"] = "normale"


class WaitingPatch(BaseModel):
    name: Optional[str] = None
    clinic: Optional[str] = None
    reason: Optional[str] = None
    age: Optional[int] = None
    priority: Optional[Literal["normale", "urgente"]] = None
    status: Optional[Literal["in_attesa", "in_studio"]] = None


class ClinicalNote(BaseModel):
    anamnesi: str = ""
    esame_obiettivo: str = ""
    diagnosi: str = ""
    terapia: str = ""
    follow_up: str = ""


class Consultation(BaseDocument):
    patient_name: str
    clinic: str = ""
    waiting_id: Optional[str] = None
    transcript: str
    note: ClinicalNote
    duration_sec: int = 0
    created_at: str = Field(default_factory=now_iso)


class ConsultationIn(BaseModel):
    patient_name: str
    clinic: str = ""
    waiting_id: Optional[str] = None
    transcript: str
    duration_sec: int = 0


class ConsultationPatch(BaseModel):
    note: ClinicalNote


# ---------- Seed ----------
SEED_APPTS = [
    ("Studio Centro", "08:30", "Laura Bianchi", "Prima visita cardiologica", "completato"),
    ("Studio Centro", "09:15", "Giorgio Esposito", "Controllo ECG", "in_attesa"),
    ("Studio Centro", "10:00", "Chiara Romano", "Visita di controllo", "in_attesa"),
    ("Studio Centro", "11:00", "Paolo Greco", "Holter pressorio — referto", "programmato"),
    ("Studio Centro", "12:00", "Elena Marino", "Ecocardiogramma", "programmato"),
    ("Studio Provincia", "15:00", "Francesco Ricci", "Prima visita", "programmato"),
    ("Studio Provincia", "15:45", "Sofia Conti", "Controllo terapia", "programmato"),
    ("Studio Provincia", "16:30", "Matteo Gallo", "Test da sforzo — referto", "programmato"),
    ("Studio Provincia", "17:30", "Anna De Luca", "Visita di controllo", "programmato"),
]
SEED_WAITING = [
    ("Giorgio Esposito", "Studio Centro", "Palpitazioni notturne, controllo ECG", 58, "urgente", 22),
    ("Chiara Romano", "Studio Centro", "Visita di controllo post-terapia", 41, "normale", 9),
    ("Luca Ferrari", "Studio Centro", "Dolore toracico atipico — senza appuntamento", 47, "normale", 4),
]


@app.on_event("startup")
async def seed():
    if await db.appointments.count_documents({}) == 0:
        await db.appointments.insert_many([
            Appointment(clinic=c, time=t, patient_name=p, visit_type=v, status=s).to_mongo()
            for c, t, p, v, s in SEED_APPTS
        ])
    if await db.waiting.count_documents({}) == 0:
        base = datetime.now(timezone.utc).timestamp()
        await db.waiting.insert_many([
            WaitingPatient(name=n, clinic=c, reason=r, age=a, priority=p,
                           arrived_at=datetime.fromtimestamp(base - m * 60, timezone.utc).isoformat()).to_mongo()
            for n, c, r, a, p, m in SEED_WAITING
        ])


# ---------- Routes ----------
@api.get("/")
async def root():
    return {"app": "Auscula", "ok": True}


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
                                   prompt="Consultazione medica specialistica tra medico e paziente.")
    except Exception as e:
        logger.exception("Trascrizione fallita")
        raise HTTPException(502, f"Trascrizione fallita: {e}")
    return {"transcript": (res.text or "").strip()}


NOTE_SYSTEM = (
    "Sei un assistente clinico per medici specialisti italiani. Ricevi la trascrizione di una consultazione "
    "e la trasformi nel MODELLO STANDARD UNICO di nota clinica. Rispondi SOLO con un JSON valido con le chiavi: "
    "anamnesi, esame_obiettivo, diagnosi, terapia, follow_up. Ogni valore è testo in italiano, conciso e clinico. "
    "Non inventare dati non presenti: se un'informazione manca scrivi 'Non riportato'."
)


async def structure_note(transcript: str, session: str) -> ClinicalNote:
    chat = LlmChat(api_key=LLM_KEY, session_id=session, system_message=NOTE_SYSTEM).with_model("openai", "gpt-5.6-terra")
    raw = await chat.send_message(UserMessage(text=f"Trascrizione:\n{transcript}"))
    match = re.search(r"\{.*\}", raw, re.S)
    data = json.loads(match.group(0)) if match else {}
    return ClinicalNote(**{k: str(data.get(k, "")) for k in ClinicalNote.model_fields})


@api.post("/consultations")
async def create_consultation(body: ConsultationIn):
    if not body.transcript.strip():
        raise HTTPException(400, "Trascrizione vuota")
    try:
        note = await structure_note(body.transcript, f"consult-{uuid.uuid4()}")
    except Exception as e:
        logger.exception("Strutturazione fallita")
        raise HTTPException(502, f"Generazione nota fallita: {e}")
    c = Consultation(**body.model_dump(), note=note)
    res = await db.consultations.insert_one(c.to_mongo())
    c.id = str(res.inserted_id)
    if body.waiting_id and ObjectId.is_valid(body.waiting_id):
        await db.waiting.delete_one({"_id": ObjectId(body.waiting_id)})
        await db.appointments.update_many({"patient_name": body.patient_name}, {"$set": {"status": "completato"}})
    return c.out()


@api.get("/consultations")
async def list_consultations():
    docs = await db.consultations.find().sort("created_at", -1).to_list(20)
    return [Consultation.from_mongo(d).out() for d in docs]


@api.patch("/consultations/{cid}")
async def update_consultation(cid: str, body: ConsultationPatch):
    doc = await db.consultations.find_one_and_update({"_id": oid(cid)}, {"$set": {"note": body.note.model_dump()}}, return_document=True)
    if not doc:
        raise HTTPException(404, "Consultazione non trovata")
    return Consultation.from_mongo(doc).out()


app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
