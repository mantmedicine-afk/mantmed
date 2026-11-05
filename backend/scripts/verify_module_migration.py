"""Confronta le visite del backup (prima della migrazione) con quelle attuali: nessun valore deve andare perso."""
import asyncio
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent / ".env")
from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402
from crypto import unseal_fields  # noqa: E402

KEYS = ("allattamento", "svezzamento", "torl", "torace_auscultazione", "addome")
BASE = ("anamnesi_fisiologica", "motivo_visita", "sintomi", "diagnosi", "terapia", "follow_up", "riepilogo")


async def main(pre_db: str):
    c = AsyncIOMotorClient(os.environ["MONGO_URL"])
    pre, cur = c[pre_db], c[os.environ["DB_NAME"]]
    checked = bad = 0
    async for d in pre.consultations.find({}, {"note": 1}):
        old = unseal_fields(d, ("note",)).get("note") or {}
        nd = await cur.consultations.find_one({"_id": d["_id"]}, {"note": 1, "note_schema": 1})
        if not nd:
            continue
        new = unseal_fields(nd, ("note",)).get("note") or {}
        campi = (new.get("modulo") or {}).get("campi") or {}
        diffs = [k for k in KEYS if (old.get(k) or "") != (campi.get(k) or "")]
        diffs += [k for k in BASE if (old.get(k) or "") != (new.get(k) or "")]
        diffs += ["farmaci"] if [d.get("nome") for d in old.get("farmaci") or []] != [d.get("nome") for d in new.get("farmaci") or []] else []
        diffs += ["crescita"] if any(v not in (None, "") and (new.get("crescita") or {}).get(kk) != v for kk, v in (old.get("crescita") or {}).items()) else []
        sz = lambda n: [(x.get("gruppo"), x.get("titolo"), x.get("testo"), x.get("sezione", ""), x.get("fonte", ""), bool(x.get("mancante"))) for x in n.get("sezioni") or []]
        diffs += ["sezioni"] if sz(old) != sz(new) else []
        checked += 1
        if diffs or nd.get("note_schema") != 2 or any(k in new for k in KEYS):
            bad += 1
            print("DIFF", d["_id"], diffs, (new.get("modulo") or {}).get("id"))
    print(f"Visite confrontate: {checked} · differenze: {bad}")


asyncio.run(main(sys.argv[1]))
