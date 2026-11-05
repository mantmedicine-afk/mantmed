"""Dati di prova: ginecologa demo, paziente demo di 16 anni con tutore demo e una visita di Ginecologia firmata.
Idempotente. Uso: cd /app/backend && python scripts/seed_gyn_demo.py"""
import asyncio
import os
import sys
from datetime import date, datetime, timezone
from pathlib import Path

import httpx
from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).parent.parent))
load_dotenv(Path(__file__).parent.parent / ".env")
from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402
from auth import hash_password  # noqa: E402
from crypto import seal_fields  # noqa: E402
from registration import _CF_ODD, PORTAL_CONSENT  # noqa: E402

API = [ln.split("=", 1)[1].strip() for ln in open(Path(__file__).parents[2] / "frontend/.env") if ln.startswith("REACT_APP_BACKEND_URL=")][0] + "/api"
DOCTOR = ("ginecologo.demo@example.com", "Gineco-Demo-2026")
GUARDIAN = ("tutore.demo@example.com", "Tutore-Demo-2026")
PATIENT = "Giulia Demo"
TRANSCRIPT = ("Giulia, 16 anni, accompagnata dalla madre, viene per dolore mestruale. Menarca a 12 anni. Ultima mestruazione il 20 ottobre 2026. "
              "Ciclo regolare di 28 giorni, flusso abbondante i primi due giorni, dolore che richiede antidolorifico. Nessuna gravidanza. "
              "Non usa contraccezione. Nessuna allergia nota. Condizioni generali buone. Genitali esterni nella norma. "
              "Ecografia pelvica transaddominale: utero e ovaie regolari. Diagnosi: dismenorrea primaria. "
              "Terapia: ibuprofene 400 mg al bisogno durante il ciclo. Controllo tra sei mesi.")


def cf_with_check(first15: str) -> str:
    val = lambda ch: int(ch) if ch.isdigit() else ord(ch) - 65
    s = sum(_CF_ODD[val(ch)] if i % 2 == 0 else val(ch) for i, ch in enumerate(first15))
    return first15 + chr(65 + s % 26)


def birth_16() -> str:
    t = date.today()
    return date(t.year - 16, 3, 14).isoformat()


async def main():
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    now = datetime.now(timezone.utc).isoformat()
    born = birth_16()
    cf = cf_with_check(f"DMEGLU{born[2:4]}C54H501")
    if not await db.users.find_one({"email": DOCTOR[0]}):
        await db.users.insert_one({"email": DOCTOR[0], "password_hash": hash_password(DOCTOR[1]), "created_at": now, "email_verified_at": now,
                                   "approved_at": now, "first_name": "Elena", "last_name": "Demo", "name": "Dott.ssa Elena Demo", "role": "doctor",
                                   "status": "active", "phone": seal_fields({"p": "+39 06 0000000"}, ("p",))["p"],
                                   "clinics": [{"name": "Studio principale", "address": "Via Demo 1, Roma"}],
                                   "profile": {"specialty": "Ginecologia e ostetricia", "order_number": "RM-DEMO-0001", "phone": "+39 06 0000000",
                                               "studio_address": "Via Demo 1, Roma"}})
    if not await db.users.find_one({"email": GUARDIAN[0]}):
        await db.users.insert_one({"email": GUARDIAN[0], "password_hash": hash_password(GUARDIAN[1]), "created_at": now, "email_verified_at": now,
                                   "first_name": "Laura", "last_name": "Demo", "name": "Laura Demo", "role": "parent", "status": "active",
                                   "phone": seal_fields({"p": ""}, ("p",))["p"],
                                   "consent": {"version": PORTAL_CONSENT, "privacy_policy": True, "health_data": True, "at": now},
                                   "child_cfs": [], "children": []})
    async with httpx.AsyncClient(base_url=API, timeout=180) as doc_c, httpx.AsyncClient(base_url=API, timeout=60) as tut_c:
        assert (await doc_c.post("/auth/login", json={"email": DOCTOR[0], "password": DOCTOR[1]})).status_code == 200
        pats = (await doc_c.get("/patients")).json()
        pat = next((p for p in pats if p["name"] == PATIENT), None)
        if not pat:
            pat = (await doc_c.post("/patients", json={"name": PATIENT, "birth_date": born, "sex": "F", "fiscal_code": cf, "guardian": "Laura Demo (madre)",
                                                       "guardian_email": GUARDIAN[0]})).json()
            consent = {"signer_name": "Laura Demo", "signer_relation": "Madre", "method": "modulo_cartaceo"}
            r = await doc_c.post(f"/patients/{pat['id']}/consents", json={**consent, "privacy_policy": True, "health_data": True, "email_reports": True})
            assert r.status_code == 200, r.text
            assert (await doc_c.post(f"/patients/{pat['id']}/consents/passaporto", json=consent)).status_code == 200
        assert (await tut_c.post("/auth/login", json={"email": GUARDIAN[0], "password": GUARDIAN[1]})).status_code == 200
        r = await tut_c.post("/portal/children", json={"fiscal_code": cf})
        assert r.status_code in (200, 409), r.text
        visits = [c for c in (await doc_c.get("/consultations")).json() if c.get("patient_id") == pat["id"]]
        if not visits:
            c = (await doc_c.post("/consultations", json={"patient_id": pat["id"], "patient_name": PATIENT, "transcript": TRANSCRIPT})).json()
            assert c.get("status") == "ready", c
            assert (await doc_c.post(f"/consultations/{c['id']}/sign")).status_code == 200
            visits = [c]
        c = visits[0]
        print("Paziente:", PATIENT, born, cf, "| visita:", c["id"], "| modulo:", c["note"]["modulo"]["id"], "| riservata ai tutori:", c.get("guardian_hidden"))


asyncio.run(main())
