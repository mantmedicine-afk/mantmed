"""Per-doctor data isolation: every clinical query is scoped to the current doctor's owner_id."""
import hmac
import hashlib
import os
from contextvars import ContextVar

OWNER: ContextVar[str] = ContextVar("owner_id")
CLINICS_CV: ContextVar[list] = ContextVar("clinics")
_CF_KEY = hashlib.sha256(("cf-index:" + os.environ["DATA_ENCRYPTION_KEY"]).encode()).digest()


def cf_hash(cf: str) -> str:
    return hmac.new(_CF_KEY, (cf or "").strip().upper().encode(), hashlib.sha256).hexdigest()


def set_tenant(owner_id: str, clinics: list):
    OWNER.set(owner_id)
    CLINICS_CV.set(clinics)


def tenant_clinics() -> list:
    return CLINICS_CV.get()


class TenantCollection:
    def __init__(self, coll):
        self.c = coll

    @staticmethod
    def _f(f=None):
        return {**(f or {}), "owner_id": OWNER.get()}

    def find(self, f=None, *a, **k):
        return self.c.find(self._f(f), *a, **k)

    async def find_one(self, f=None, *a, **k):
        return await self.c.find_one(self._f(f), *a, **k)

    async def count_documents(self, f=None, **k):
        return await self.c.count_documents(self._f(f), **k)

    async def insert_one(self, doc, **k):
        return await self.c.insert_one({**doc, "owner_id": OWNER.get()}, **k)

    async def insert_many(self, docs, **k):
        return await self.c.insert_many([{**d, "owner_id": OWNER.get()} for d in docs], **k)

    async def update_one(self, f, u, **k):
        return await self.c.update_one(self._f(f), u, **k)

    async def update_many(self, f, u, **k):
        return await self.c.update_many(self._f(f), u, **k)

    async def find_one_and_update(self, f, u, **k):
        return await self.c.find_one_and_update(self._f(f), u, **k)

    async def delete_one(self, f, **k):
        return await self.c.delete_one(self._f(f), **k)

    async def delete_many(self, f, **k):
        return await self.c.delete_many(self._f(f), **k)

    def aggregate(self, pipeline, **k):
        return self.c.aggregate([{"$match": {"owner_id": OWNER.get()}}, *pipeline], **k)


class TenantDB:
    def __init__(self, db):
        self.db = db

    def __getattr__(self, name):
        return TenantCollection(self.db[name])

    def __getitem__(self, name):
        return TenantCollection(self.db[name])
