"""Manual inspection helper: prints riepilogo + motivo for the faithfulness transcript, then deletes the visit."""
import os, sys, time
from pathlib import Path
import requests
from dotenv import load_dotenv
from bson import ObjectId
from pymongo import MongoClient
sys.path.insert(0, str(Path(__file__).parent))
from test_mantai_faithfulness import TRANSCRIPT

load_dotenv(Path(__file__).parents[2] / "frontend/.env"); load_dotenv(Path(__file__).parents[1] / ".env")
B = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"
s = requests.Session(); s.post(f"{B}/auth/login", json={"email": "cardiologo.demo@example.com", "password": "Cardio-Demo-2026"})
c = s.post(f"{B}/consultations/start", data={"patient_name": "TEST_Inspect73", "transcript": TRANSCRIPT, "paper_consent": "true"}).json()
for _ in range(60):
    if c.get("status") != "processing": break
    time.sleep(3); c = s.get(f"{B}/consultations/{c['id']}").json()
n = c["note"]
print("RIEPILOGO:", n.get("riepilogo")); print("MOTIVO:", n.get("motivo_visita")); print("DIAGNOSI:", n.get("diagnosi")); print("TERAPIA:", n.get("terapia"))
print("CAMPI:", n["modulo"]["campi"])
MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]].consultations.delete_one({"_id": ObjectId(c["id"]), "patient_name": "TEST_Inspect73"})
