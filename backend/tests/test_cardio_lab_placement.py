"""I valori di laboratorio vanno solo in "Esami di laboratorio", mai nei fattori di rischio."""
import os
import re
import time
from pathlib import Path

import requests
from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv(Path(__file__).parents[2] / "frontend/.env")
load_dotenv(Path(__file__).parents[1] / ".env")
BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"
TRANSCRIPT = ("Medico: Buongiorno, fuma? Paziente: Sì, dieci sigarette al giorno, e mio padre ha avuto un infarto a 50 anni. "
              "Medico: Ha portato gli esami? Paziente: Sì, LDL 160 e glicemia 98. Medico: Pressione 135 su 85. Ci rivediamo tra sei mesi.")


def test_ldl_only_in_lab_field():
    s = requests.Session()
    assert s.post(f"{BASE_URL}/auth/login", json={"email": "cardiologo.demo@example.com", "password": "Cardio-Demo-2026"}).status_code == 200
    r = s.post(f"{BASE_URL}/consultations/start", data={"patient_name": "TEST_LDL", "transcript": TRANSCRIPT, "paper_consent": "true"}, timeout=60)
    assert r.status_code == 200, r.text
    c = r.json()
    try:
        for _ in range(60):
            if c.get("status") != "processing":
                break
            time.sleep(3)
            c = s.get(f"{BASE_URL}/consultations/{c['id']}").json()
        assert c["status"] == "ready", c.get("ai_error")
        campi = c["note"]["modulo"]["campi"]
        fr, lab = campi.get("fattori_rischio", ""), campi.get("esami_laboratorio", "")
        assert "160" in lab, lab
        assert not re.search(r"ldl|160|glicemia|colesterol", fr, re.I), f"Fattori di rischio con valori: {fr}"
        assert re.search(r"fum|sigarett", fr, re.I), fr
    finally:
        db = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
        for x in db.consultations.find({"patient_name": "TEST_LDL"}, {"patient_id": 1}):
            if x.get("patient_id"):
                db.patients.delete_one({"id": x["patient_id"]})
        db.consultations.delete_many({"patient_name": "TEST_LDL"})
