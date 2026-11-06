"""Passaggio 5: studi configurabili. Assegna id e colore a ogni studio e registra l'intestazione attuale come versione iniziale
(valida da sempre), così i documenti già emessi restano identici anche se poi si cambiano intestazione, logo o contatti.
Uso: python scripts/migrate_clinics.py --backup /app/backups/<cartella>"""
import argparse
import asyncio
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).parent.parent))
load_dotenv(Path(__file__).parent.parent / ".env")
from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402
from clinics import clinics_of, current_letterhead  # noqa: E402


async def main(backup: str):
    if not (backup and any(Path(backup).rglob("users.bson*"))):
        sys.exit("Backup non trovato: esegua prima mongodump e indichi la cartella con --backup")
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    if await db.meta.find_one({"_id": "clinics_v1"}):
        sys.exit("Migrazione già applicata")
    n = 0
    async for u in db.users.find({"role": "doctor"}):
        clinics = clinics_of(u)
        u2 = {**u, "clinics": clinics}
        log = [{"clinic": c["name"], "from": "", "data": current_letterhead(u2, c["name"])} for c in clinics]
        log.append({"clinic": "", "from": "", "data": current_letterhead(u2, "")})  # visite libere senza studio
        await db.users.update_one({"_id": u["_id"]}, {"$set": {"clinics": clinics, "letterhead_log": log}})
        n += 1
        print(f"  {u.get('name')}: {len(clinics)} studi")
    await db.meta.insert_one({"_id": "clinics_v1", "backup": backup, "doctors": n})
    print(f"APPLICATO: {n} medici")


if __name__ == "__main__":
    a = argparse.ArgumentParser()
    a.add_argument("--backup", required=True)
    asyncio.run(main(a.parse_args().backup))
