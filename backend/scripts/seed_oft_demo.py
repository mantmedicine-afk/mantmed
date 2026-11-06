"""Dati di prova: oculista demo, paziente adulto demo e una visita di Oftalmologia (non firmata, da controllare).
Idempotente. Uso: cd /app/backend && python scripts/seed_oft_demo.py"""
import asyncio
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import httpx
from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).parent.parent))
load_dotenv(Path(__file__).parent.parent / ".env")
from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402
from auth import hash_password  # noqa: E402
from crypto import seal_fields  # noqa: E402

API = [ln.split("=", 1)[1].strip() for ln in open(Path(__file__).parents[2] / "frontend/.env") if ln.startswith("REACT_APP_BACKEND_URL=")][0] + "/api"
DOCTOR = ("oculista.demo@example.com", "Oculista-Demo-2026")
PATIENT = "Marco Demo"
TRANSCRIPT = ("Medico: Buongiorno, cosa la porta qui? Paziente: Vedo sfocato da lontano, porto occhiali da cinque anni. Mia madre ha il glaucoma. "
              "Medico: Visus naturale occhio destro 4 decimi, occhio sinistro 5 decimi. Corretto 10 decimi in entrambi. "
              "Autorefrattometro: destro sfera meno 2,25 cilindro meno 0,50 asse 180; sinistro sfera meno 2 cilindro meno 0,75 asse 170. "
              "Tonometria Goldmann alle 10 e 30: destro 16, sinistro 17. Cornea trasparente in entrambi gli occhi. "
              "Cristallino: lieve opacità nucleare. Papilla destra C/D 0,3, sinistra C/D 0,3. Macula in ordine in entrambi. "
              "Prescrivo occhiali per lontano: destro meno 2,25 cilindro meno 0,50 asse 180, sinistro meno 2 cilindro meno 0,75 asse 170, distanza interpupillare 63. "
              "Lacrime artificiali in entrambi gli occhi tre volte al giorno. Controllo tra un anno con campo visivo.")


async def main():
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    now = datetime.now(timezone.utc).isoformat()
    if not await db.users.find_one({"email": DOCTOR[0]}):
        await db.users.insert_one({"email": DOCTOR[0], "password_hash": hash_password(DOCTOR[1]), "created_at": now, "email_verified_at": now,
                                   "approved_at": now, "first_name": "Paolo", "last_name": "Demo", "name": "Dott. Paolo Demo", "role": "doctor",
                                   "status": "active", "phone": seal_fields({"p": "+39 06 0000001"}, ("p",))["p"], "onboarding_done": True,
                                   "clinics": [{"name": "Studio principale", "address": "Via Demo 2, Roma"}],
                                   "profile": {"specialty": "Oftalmologia", "order_number": "RM-DEMO-0002", "phone": "+39 06 0000001",
                                               "studio_address": "Via Demo 2, Roma"}})
    async with httpx.AsyncClient(base_url=API, timeout=180) as doc_c:
        assert (await doc_c.post("/auth/login", json={"email": DOCTOR[0], "password": DOCTOR[1]})).status_code == 200
        pats = (await doc_c.get("/patients")).json()
        pat = next((p for p in pats if p["name"] == PATIENT), None)
        if not pat:
            pat = (await doc_c.post("/patients", json={"name": PATIENT, "birth_date": "1980-05-10", "sex": "M"})).json()
            consent = {"signer_name": PATIENT, "signer_relation": "Interessato", "method": "modulo_cartaceo"}
            r = await doc_c.post(f"/patients/{pat['id']}/consents", json={**consent, "privacy_policy": True, "health_data": True, "email_reports": False})
            assert r.status_code == 200, r.text
        visits = [c for c in (await doc_c.get("/consultations")).json() if c.get("patient_id") == pat["id"]]
        if not visits:
            c = (await doc_c.post("/consultations", json={"patient_id": pat["id"], "patient_name": PATIENT, "transcript": TRANSCRIPT})).json()
            assert c.get("status") == "ready", c
            visits = [c]
        c = visits[0]
        print("Paziente:", PATIENT, "| visita:", c["id"], "| modulo:", c["note"]["modulo"]["id"])


if __name__ == "__main__":
    asyncio.run(main())
