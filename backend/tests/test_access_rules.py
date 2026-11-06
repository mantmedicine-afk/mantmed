"""Regole del passaggio 4 su un database temporaneo: tutori (max 2), 18 anni, nomina legale, paziente, deleghe, ricevute del genitore."""
import asyncio
import os
from datetime import date, timedelta
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv(Path(__file__).parents[1] / ".env")
import sys  # noqa: E402
sys.path.insert(0, str(Path(__file__).parents[1]))
from access_rules import sync_links, fiscal_only, email_hash, contact_emails  # noqa: E402
from crypto import seal_fields  # noqa: E402
from tenancy import cf_hash  # noqa: E402

SEALED = ("guardian_email", "guardian2_email", "patient_email")


def born(years: int, days: int = 0) -> str:
    t = date.today()
    return (date(t.year - years, t.month, min(t.day, 28)) + timedelta(days=days)).isoformat()


async def scenario():
    cli = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = cli["mantmed_test_access_rules"]
    await cli.drop_database("mantmed_test_access_rules")
    try:
        await db.meta.insert_one({"_id": "access_rules_v2"})
        owner = "64b000000000000000000001"
        mk = lambda name, b, cf, **e: {"name": name, "birth_date": b, "owner_id": owner, "cf_hash": cf_hash(cf), **seal_fields({k: "" for k in SEALED} | e, SEALED)}
        minor = (await db.patients.insert_one(mk("Minore", born(10), "CFMINORE", guardian_email="a@x.it", guardian2_email="b@x.it"))).inserted_id
        turning = (await db.patients.insert_one(mk("Diciottenne", born(18, 2), "CFTURN", guardian_email="a@x.it", patient_email="p@x.it"))).inserted_id
        legal = (await db.patients.insert_one(mk("Assistito", born(40), "CFLEGAL"))).inserted_id
        u = lambda e, cfs: {"email": e, "role": "patient", "child_cfs": [cf_hash(c) for c in cfs], "children": []}
        for doc in (u("a@x.it", ["CFMINORE", "CFTURN"]), u("b@x.it", ["CFMINORE"]), u("c@x.it", ["CFMINORE"]), u("p@x.it", ["CFTURN"]), u("l@x.it", [])):
            await db.users.insert_one(doc)
        get = lambda e: db.users.find_one({"email": e})
        rel = lambda links: {l["patient_id"]: l["relation"] for l in links}
        a = rel(await sync_links(db, await get("a@x.it")))
        assert a == {str(minor): "tutore", str(turning): "tutore"}, a
        assert rel(await sync_links(db, await get("b@x.it"))) == {str(minor): "tutore"}
        assert await sync_links(db, await get("c@x.it")) == []  # terza persona: mai, i tutori sono al massimo due
        assert await sync_links(db, await get("p@x.it")) == []  # minorenne: nessun account proprio
        assert contact_emails(await db.patients.find_one({"_id": turning})) == ["a@x.it"]
        # compie 18 anni: accesso del tutore chiuso, il paziente accede, ricevute pagate dal genitore restano
        await db.patients.update_one({"_id": turning}, {"$set": {"birth_date": born(18, -1)}})
        pay = (await db.payments.insert_one({"patient_id": str(turning), "owner_id": owner, "receipt_no": "1/2026", "service": "Visita", "amount": 80})).inserted_id
        ua = await get("a@x.it")
        await db.payment_transactions.insert_one({"parent_id": str(ua["_id"]), "payment_id": str(pay)})
        assert rel(await sync_links(db, ua)) == {str(minor): "tutore"}
        ua = await get("a@x.it")
        assert ua["children_closed"][0]["reason"] == "maggiore_eta"
        f = await fiscal_only(db, ua)
        assert f[0]["receipts"][0]["receipt_no"] == "1/2026" and "reports" not in f[0]
        assert rel(await sync_links(db, await get("p@x.it"))) == {str(turning): "paziente"}
        assert contact_emails(await db.patients.find_one({"_id": turning})) == ["p@x.it"]
        # il paziente delega di nuovo il genitore (consenso revocabile), poi revoca
        g = {"patient_id": str(turning), "owner_id": owner, "kind": "delega", "email_hash": email_hash("a@x.it"), "revoked_at": None}
        gid = (await db.access_grants.insert_one(g)).inserted_id
        assert rel(await sync_links(db, await get("a@x.it")))[str(turning)] == "delegato"
        await db.access_grants.update_one({"_id": gid}, {"$set": {"revoked_at": "now"}})
        assert str(turning) not in rel(await sync_links(db, await get("a@x.it")))
        assert (await get("a@x.it"))["children_closed"][-1]["reason"] == "revoca"
        # nomina con documento: accesso anche da adulto, non si chiude
        await db.access_grants.insert_one({"patient_id": str(legal), "owner_id": owner, "kind": "legale", "email_hash": email_hash("l@x.it"), "revoked_at": None})
        assert rel(await sync_links(db, await get("l@x.it"))) == {str(legal): "legale"}
        assert await db.audit.count_documents({"action": "accesso_portale_chiuso"}) == 2
    finally:
        await cli.drop_database("mantmed_test_access_rules")


def test_access_rules():
    asyncio.run(scenario())
