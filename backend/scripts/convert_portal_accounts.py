"""Passaggio 4: conversione degli account portale "parent" -> "patient" e calcolo dei rapporti (paziente, tutore, legale, delegato).
Uso: python scripts/convert_portal_accounts.py            (solo anteprima, non modifica nulla)
     python scripts/convert_portal_accounts.py --apply --backup /app/backups/<cartella>   (richiede un backup esistente)"""
import argparse
import asyncio
import os
import re
import sys
from pathlib import Path

from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).parent.parent))
load_dotenv(Path(__file__).parent.parent / ".env")
from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402
from crypto import seal_fields, unseal_fields  # noqa: E402
from access_rules import active_grants, emails_of, is_adult, relation_for, sync_links  # noqa: E402

norm = lambda s: re.sub(r"\s+", " ", re.sub(r"^[^:]{1,20}:\s*", "", (s or "")).strip().lower())


async def main(apply: bool, backup: str):
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    if apply and not (backup and Path(backup).is_dir() and any(Path(backup).rglob("users.bson*"))):
        sys.exit("Backup non trovato: esegua prima mongodump e indichi la cartella con --backup")
    users = await db.users.find({"role": {"$in": ["parent", "patient"]}}).to_list(10000)
    own_email = []  # pazienti maggiorenni la cui unica email registrata è la loro (nessun tutore indicato o tutore = paziente)
    async for p in db.patients.find({}):
        s = unseal_fields(p, ("guardian", "guardian_email", "patient_email"))
        if is_adult(p) and not (s.get("patient_email") or "").strip() and (s.get("guardian_email") or "").strip() and norm(s.get("guardian")) in ("", norm(p["name"])):
            own_email.append((p, s["guardian_email"].strip().lower()))
    own_ids = {str(p["_id"]): e for p, e in own_email}
    rows = []
    for u in users:
        grants = await active_grants(db, email=u["email"])
        for c in u.get("children", []):
            p = await db.patients.find_one({"_id": __import__("bson").ObjectId(c["patient_id"])})
            if not p:
                continue
            if c["patient_id"] in own_ids:
                p = {**p, **seal_fields({"patient_email": own_ids[c["patient_id"]]}, ("patient_email",))}
            rows.append((u["email"], p["name"], "maggiorenne" if is_adult(p) else "minorenne", relation_for(u["email"], p, grants) or "ACCESSO CHIUSO"))
    print(f"Account portale: {len(users)} (ancora 'parent': {sum(u['role'] == 'parent' for u in users)})")
    print(f"Pazienti maggiorenni con la propria email nel campo tutore (verrà spostata in 'email del paziente'): {len(own_email)}")
    for r in rows:
        print("  ", " | ".join(r))
    if not apply:
        print("ANTEPRIMA: nessuna modifica. Per applicare: --apply --backup <cartella del backup>")
        return
    for p, e in own_email:
        await db.patients.update_one({"_id": p["_id"]}, {"$set": seal_fields({"patient_email": e, "guardian_email": "", "guardian": ""}, ("patient_email", "guardian_email", "guardian"))})
    res = await db.users.update_many({"role": "parent"}, {"$set": {"role": "patient", "converted_from_parent_at": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat()}})
    await db.meta.update_one({"_id": "access_rules_v2"}, {"$set": {"at": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(), "backup": backup}}, upsert=True)
    for u in await db.users.find({"role": "patient"}).to_list(10000):
        await sync_links(db, u)
    await db.audit.insert_one({"action": "conversione_account_portale", "subject": "", "at": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
                               "converted": res.modified_count, "backup": backup})
    print(f"APPLICATO: {res.modified_count} account convertiti, {len(own_email)} email spostate")


if __name__ == "__main__":
    a = argparse.ArgumentParser()
    a.add_argument("--apply", action="store_true")
    a.add_argument("--backup", default="")
    x = a.parse_args()
    asyncio.run(main(x.apply, x.backup))
