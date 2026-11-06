"""Listini per studio collegati alla prestazione per identificativo: salva l'id di ogni prestazione e converte le
personalizzazioni degli studi salvate per nome. Idempotente. Uso: python scripts/migrate_service_ids.py --backup /app/backups/<cartella>"""
import argparse
import asyncio
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).parent.parent))
load_dotenv(Path(__file__).parent.parent / ".env")
from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402
from scheduling import services_of  # noqa: E402


async def main(backup: str):
    if not (backup and any(Path(backup).rglob("users.bson*"))):
        sys.exit("Backup non trovato: esegua prima mongodump e indichi la cartella con --backup")
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    n = 0
    async for u in db.users.find({"role": "doctor"}):
        services = services_of(u)
        by_name = {s["name"]: s["id"] for s in services}
        clinics = [{**c, "prices": {by_name.get(k, k): v for k, v in (c.get("prices") or {}).items()}} for c in u.get("clinics") or []]
        upd = {"clinics": clinics}
        if (u.get("schedule") or {}).get("services"):
            upd["schedule.services"] = services
        await db.users.update_one({"_id": u["_id"]}, {"$set": upd})
        n += 1
    await db.meta.update_one({"_id": "service_ids_v1"}, {"$set": {"backup": backup, "doctors": n}}, upsert=True)
    print(f"APPLICATO: {n} medici")


if __name__ == "__main__":
    a = argparse.ArgumentParser()
    a.add_argument("--backup", required=True)
    asyncio.run(main(a.parse_args().backup))
