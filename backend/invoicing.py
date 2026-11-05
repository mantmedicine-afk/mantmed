"""Cassa: impostazioni fiscali, fatture/ricevute, Sistema TS e pacchetto per il commercialista (SdI e Sistema TS in SIMULAZIONE)."""
import base64
import os
import re
import secrets
from datetime import date, datetime, timezone
from html import escape as hesc
from typing import ClassVar, Literal, Optional
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field
from pymongo import ReturnDocument
from crypto import unseal_fields
from fiscal import CF_RE, METHODS, compute, r2, sts_deadline
from fiscal_xml import fattura_pa, sts_file
from invoice_pdf import build_invoice_pdf, build_register_pdf, merge_pdfs
from mailer import send_email
from registration import mail_shell
from scheduling import schedule_of
from signed_docs import doctor_signature
from tenancy import OWNER, tenant_clinics
from zoneinfo import ZoneInfo

ROME = ZoneInfo("Europe/Rome")

Vat = Literal["esente", "iva22"]


class Line(BaseModel):
    description: str = Field(min_length=1, max_length=200)
    amount: float = Field(ge=0, le=100000)
    vat: Vat = "esente"


class Company(BaseModel):
    name: str = Field(default="", max_length=120)
    vat: str = Field(default="", max_length=13)
    cf: str = Field(default="", max_length=16)
    address: str = Field(default="", max_length=200)
    sdi_code: str = Field(default="", max_length=7)
    pec: str = Field(default="", max_length=120)


class Draft(BaseModel):
    client_type: Literal["persona", "azienda"] = "persona"
    lines: list[Line] = Field(min_length=1, max_length=20)
    stamp_charge: Literal["paziente", "medico"] = "paziente"


class InvoiceIn(Draft):
    consultation_id: Optional[str] = None
    patient_id: Optional[str] = None
    patient_name: str = Field(min_length=1, max_length=120)
    patient_cf: str = Field(default="", max_length=16)
    date: str
    clinic: str = Field(default="", max_length=60)
    payer_name: str = Field(default="", max_length=120)
    payer_cf: str = Field(default="", max_length=16)
    company: Company = Field(default_factory=Company)
    method: Literal["contanti", "carta", "bonifico", "pos"]
    paid: bool = True
    sts_opposition: bool = False


class Tariff(BaseModel):
    name: str = Field(min_length=2, max_length=60)
    price: float = Field(default=0, ge=0, le=5000)
    vat: Vat = "esente"


class FiscalIn(BaseModel):
    regime: Literal["ordinario", "forfettario"]
    holder: str = Field(default="", max_length=120)
    tax_code: str = Field(default="", max_length=16)
    vat_number: str = Field(default="", max_length=13)
    address: str = Field(default="", max_length=200)
    order_registration: str = Field(default="", max_length=120)
    iban: str = Field(default="", max_length=34)
    accountant_email: str = Field(default="", max_length=160)
    stamp_charge: Literal["paziente", "medico"] = "paziente"
    tariffs: list[Tariff] = Field(default_factory=list, max_length=20)


class PayIn(BaseModel):
    method: Optional[Literal["contanti", "carta", "bonifico", "pos"]] = None


class PeriodIn(BaseModel):
    start: str
    end: str
    clinic: str = ""


def _iso(d: str) -> str:
    try:
        return date.fromisoformat(d[:10]).isoformat()
    except ValueError:
        raise HTTPException(422, "Data non valida")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _safe(s: str) -> str:
    return re.sub(r"[^A-Za-z0-9]+", "_", s or "").strip("_")


def build_invoicing(db, tdb, current_user, BaseDocument, Payment, today_rome):
    r = APIRouter(prefix="/cash")

    class Invoice(BaseDocument):
        number: Optional[str] = None
        date: str
        clinic: str = ""
        consultation_id: Optional[str] = None
        patient_id: Optional[str] = None
        patient_name: str
        patient_cf: str = ""
        client_type: Literal["persona", "azienda"] = "persona"
        payer_name: str = ""
        payer_cf: str = ""
        company: dict = Field(default_factory=dict)
        lines: list = Field(default_factory=list)
        method: str
        regime: str = "ordinario"
        totals: dict
        sts_opposition: bool = False
        sts_status: Optional[Literal["da_inviare", "inviata", "errore"]] = None
        sts_error: str = ""
        sts_sent_at: Optional[str] = None
        sdi_status: Optional[str] = None
        sdi_id: Optional[str] = None
        paid_at: Optional[str] = None
        payment_id: Optional[str] = None
        cancelled_at: Optional[str] = None
        sts_action: Optional[str] = None
        legacy: bool = False
        created_at: str = Field(default_factory=_now)
        __encrypted__: ClassVar[tuple] = ("patient_cf", "payer_name", "payer_cf", "company", "lines")

    async def owner() -> dict:
        return await db.users.find_one({"_id": ObjectId(OWNER.get())})

    def billing_of(u: dict) -> dict:
        return {"regime": "forfettario", "order_registration": "", "iban": "", "accountant_email": "", "stamp_charge": "paziente", **schedule_of(u)["billing"]}

    async def patient_cf(pid: Optional[str]) -> dict:
        p = await tdb.patients.find_one({"_id": ObjectId(pid)}) if pid and ObjectId.is_valid(pid) else None
        return unseal_fields(p, ("fiscal_code", "guardian", "guardian_fiscal_code")) if p else {}

    async def next_number(year: int, bump: bool) -> str:
        key = f"receipt:{OWNER.get()}:{year}"
        if not bump:
            c = await db.counters.find_one({"_id": key})
            return f"{(c or {}).get('n', 0) + 1}/{year}"
        c = await db.counters.find_one_and_update({"_id": key}, {"$inc": {"n": 1}}, upsert=True, return_document=ReturnDocument.AFTER)
        return f"{c['n']}/{year}"

    async def sync_legacy():
        """Le ricevute e gli incassi già registrati entrano nell'elenco con il loro numero (dati originali invariati)."""
        regime = billing_of(await owner())["regime"]
        async for p in tdb.payments.find({"invoice_id": None, "refund_of": None}):
            pay = Payment.from_mongo(p)
            pt = await patient_cf(pay.patient_id)
            fee = r2(pay.amount - (pay.stamp or 0))
            inv = Invoice(number=pay.receipt_no, date=pay.date, clinic=pay.clinic, consultation_id=pay.consultation_id, patient_id=pay.patient_id,
                          patient_name=pay.patient_name, patient_cf=pt.get("fiscal_code") or "", payer_name=pay.payer_name or pt.get("guardian") or "",
                          payer_cf=pt.get("guardian_fiscal_code") or "", lines=[{"description": pay.service, "amount": fee, "vat": "esente"}],
                          method=pay.method, regime=regime, paid_at=pay.date, payment_id=str(p["_id"]), legacy=True, created_at=pay.created_at,
                          totals={"esente": fee, "imponibile": 0, "iva": 0, "stamp": pay.stamp or 0, "stamp_charge": "paziente", "ritenuta": 0,
                                  "total": pay.amount, "due": pay.amount},
                          sts_status="da_inviare" if pay.receipt_no else None, cancelled_at=pay.refunded_at)
            iid = str((await tdb.invoices.insert_one(inv.to_mongo())).inserted_id)
            await tdb.payments.update_one({"_id": p["_id"]}, {"$set": {"invoice_id": iid}})
        await tdb.invoices.update_many({"legacy": True, "regime": {"$ne": regime}}, {"$set": {"regime": regime}})
        async for p in tdb.payments.find({"refunded_at": {"$ne": None}, "invoice_id": {"$ne": None}, "refund_of": None}):
            await tdb.invoices.update_one({"_id": ObjectId(p["invoice_id"]), "cancelled_at": None}, {"$set": {"cancelled_at": p["refunded_at"]}})

    def out(doc: dict) -> dict:
        i = Invoice.from_mongo(doc).out()
        i["status"] = "annullata" if i["cancelled_at"] else ("pagata" if i["paid_at"] else "da_incassare")
        i["payer"] = i["company"].get("name") if i["client_type"] == "azienda" else (i["payer_name"] or i["patient_name"])
        return i

    async def load(iid: str) -> dict:
        d = await tdb.invoices.find_one({"_id": ObjectId(iid)}) if ObjectId.is_valid(iid) else None
        if not d:
            raise HTTPException(404, "Fattura non trovata")
        return d

    async def record_payment(i: dict, iid: str, day: str) -> str:
        pay = Payment(patient_id=i.get("patient_id"), patient_name=i["patient_name"], clinic=i.get("clinic", ""), consultation_id=i.get("consultation_id"),
                      service=" · ".join(l["description"] for l in i["lines"])[:200], amount=i["totals"]["due"], method=i["method"], date=day,
                      receipt_no=i.get("number"), stamp=i["totals"]["stamp"] if i["totals"]["stamp_charge"] == "paziente" else 0,
                      payer_name=i.get("payer") or None)
        return str((await tdb.payments.insert_one({**pay.to_mongo(), "invoice_id": iid})).inserted_id)

    async def query(start: str = "", end: str = "", clinic: str = "", consultation_id: str = "") -> list:
        await sync_legacy()
        f = {}
        if start or end:
            f["date"] = {"$gte": _iso(start or "1900-01-01"), "$lte": _iso(end or "2999-12-31")}
        if clinic:
            f["clinic"] = clinic
        if consultation_id:
            f["consultation_id"] = consultation_id
        docs = await tdb.invoices.find(f).sort([("date", -1), ("created_at", -1)]).to_list(5000)
        return [out(d) for d in docs]

    # ---------- Impostazioni fiscali ----------
    @r.get("/settings")
    async def get_settings():
        u = await owner()
        sch = schedule_of(u)
        return {"billing": billing_of(u), "tariffs": [{"name": s["name"], "price": s.get("price", 0), "vat": s.get("vat") or "esente"} for s in sch["services"]],
                "clinics": [c["name"] for c in sch["clinics"]], "next_number": await next_number(int(today_rome()[:4]), False),
                "configured": bool((u.get("billing") or {}).get("fiscal_saved_at"))}

    @r.put("/settings")
    async def put_settings(body: FiscalIn):
        u = await owner()
        if body.tax_code.strip() and not CF_RE.match(body.tax_code.strip().upper()):
            raise HTTPException(400, "Codice fiscale non valido")
        if body.vat_number.strip() and not re.fullmatch(r"\d{11}", body.vat_number.strip()):
            raise HTTPException(400, "La partita IVA deve avere 11 cifre")
        if body.accountant_email.strip() and not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", body.accountant_email.strip()):
            raise HTTPException(400, "Email del commercialista non valida")
        names = [t.name.strip().lower() for t in body.tariffs]
        if len(set(names)) != len(names):
            raise HTTPException(400, "Ogni prestazione del tariffario deve avere un nome diverso")
        data = body.model_dump(exclude={"tariffs"})
        data = {**(u.get("billing") or {}), **{k: (v.strip() if isinstance(v, str) else v) for k, v in data.items()},
                "tax_code": body.tax_code.strip().upper(), "iban": body.iban.replace(" ", "").upper(), "fiscal_saved_at": _now()}
        services = {s["name"].lower(): s for s in schedule_of(u)["services"]}
        merged = [{**services.get(t.name.strip().lower(), {"duration": 30}), "name": t.name.strip(), "price": round(t.price, 2), "vat": t.vat} for t in body.tariffs]
        upd = {"billing": data}
        if body.tariffs:
            upd["schedule.services"] = merged
        await db.users.update_one({"_id": u["_id"]}, {"$set": upd})
        return await get_settings()

    # ---------- Fatture ----------
    @r.post("/invoices/preview")
    async def preview(body: Draft):
        regime = billing_of(await owner())["regime"]
        return {**compute([l.model_dump() for l in body.lines], regime, body.client_type, body.stamp_charge), "regime": regime}

    @r.get("/invoices/draft")
    async def draft(consultation_id: str = "", patient_id: str = "", service: str = ""):
        u = await owner()
        sch, b = schedule_of(u), billing_of(u)
        c = await tdb.consultations.find_one({"_id": ObjectId(consultation_id)}) if ObjectId.is_valid(consultation_id) else None
        pid = (c or {}).get("patient_id") or patient_id
        pt = await patient_cf(pid)
        tariffs = {s["name"].lower(): s for s in sch["services"]}
        if c:
            day = datetime.fromisoformat(c["created_at"]).astimezone(ROME).date().isoformat()
            a = await tdb.appointments.find_one({"date": day, **({"patient_id": pid} if pid else {"patient_name": c["patient_name"]})})
            service = (unseal_fields(a, ("visit_type",)).get("visit_type") if a else "") or service
        low = (service or "").lower()
        words = lambda k: [w for w in re.findall(r"\w+", k) if len(w) >= 5 and w != "visita"]
        best = max(tariffs.items(), key=lambda kv: sum(w in low for w in words(kv[0])), default=(None, None))
        t = tariffs.get(low) or next((s for k, s in tariffs.items() if low and (k in low or low in k)), None) \
            or (best[1] if best[0] and any(w in low for w in words(best[0])) else None) or (next(iter(tariffs.values()), None) if c else None)
        return {"consultation_id": consultation_id or None, "patient_id": pid or None, "patient_name": (c or {}).get("patient_name") or pt.get("name") or "",
                "patient_cf": pt.get("fiscal_code") or "", "payer_name": re.sub(r"^[^:]{1,20}:\s*", "", pt.get("guardian") or ""), "payer_cf": pt.get("guardian_fiscal_code") or "",
                "date": ((c or {}).get("created_at") or today_rome())[:10] if c else today_rome(), "clinic": (c or {}).get("clinic") or "",
                "lines": [{"description": (t or {}).get("name") or service or "Visita pediatrica", "amount": (t or {}).get("price") or 0, "vat": (t or {}).get("vat") or "esente"}],
                "stamp_charge": b["stamp_charge"], "regime": b["regime"]}

    @r.post("/invoices")
    async def create(body: InvoiceIn):
        u = await owner()
        b = billing_of(u)
        day = _iso(body.date)
        if day > today_rome():
            raise HTTPException(400, "La data della fattura non può essere futura")
        if not (b.get("tax_code") or b.get("vat_number")):
            raise HTTPException(400, "Completi prima i dati fiscali in Cassa > Impostazioni")
        if body.client_type == "persona":
            if not body.payer_name.strip():
                raise HTTPException(400, "Indichi il genitore o la persona che paga")
            if not CF_RE.match(body.payer_cf.strip().upper()):
                raise HTTPException(400, "Codice fiscale dell'intestatario non valido")
        else:
            if not body.company.name.strip() or not (body.company.vat.strip() or body.company.cf.strip()):
                raise HTTPException(400, "Indichi ragione sociale e partita IVA o codice fiscale dell'azienda/ente")
            if not (body.company.sdi_code.strip() or body.company.pec.strip()):
                raise HTTPException(400, "Per la fattura elettronica serve il codice destinatario SdI o la PEC dell'azienda")
        if body.patient_cf.strip() and not CF_RE.match(body.patient_cf.strip().upper()):
            raise HTTPException(400, "Codice fiscale del paziente non valido")
        if any(l.amount <= 0 for l in body.lines):
            raise HTTPException(400, "Ogni prestazione deve avere un importo maggiore di zero")
        lines = [{**l.model_dump(), "description": l.description.strip(), "amount": round(l.amount, 2)} for l in body.lines]
        persona = body.client_type == "persona"
        inv = Invoice(**{**body.model_dump(exclude={"paid", "lines", "company", "stamp_charge"}), "date": day, "lines": lines,
                         "company": {} if persona else {k: v.strip() for k, v in body.company.model_dump().items()},
                         "patient_cf": body.patient_cf.strip().upper(), "payer_cf": body.payer_cf.strip().upper() if persona else "",
                         "payer_name": body.payer_name.strip() if persona else "", "regime": b["regime"],
                         "totals": compute(lines, b["regime"], body.client_type, body.stamp_charge),
                         "number": await next_number(int(day[:4]), True), "paid_at": day if body.paid else None,
                         "sts_status": "da_inviare" if persona and not body.sts_opposition else None,
                         "sts_opposition": persona and body.sts_opposition})
        if not persona:
            inv.sdi_status, inv.sdi_id = "inviata_simulazione", f"SIM-{secrets.token_hex(4).upper()}"
        iid = str((await tdb.invoices.insert_one(inv.to_mongo())).inserted_id)
        if body.paid:
            i = out({**inv.to_mongo(), "_id": iid})
            await tdb.invoices.update_one({"_id": ObjectId(iid)}, {"$set": {"payment_id": await record_payment(i, iid, day)}})
        return out(await load(iid))

    @r.get("/invoices")
    async def list_invoices(clinic: str = "", consultation_id: str = "", start: str = "", end: str = "", limit: int = 100):
        items = await query(start, end, clinic, consultation_id)
        return {"items": items[:max(1, min(limit, 1000))], "count": len(items)}

    @r.post("/invoices/{iid}/pay")
    async def pay(iid: str, body: PayIn):
        d = await load(iid)
        if d.get("cancelled_at") or d.get("paid_at"):
            raise HTTPException(409, "Fattura già incassata o annullata")
        day = today_rome()
        upd = {"paid_at": day, **({"method": body.method} if body.method else {})}
        await tdb.invoices.update_one({"_id": d["_id"]}, {"$set": upd})
        i = out(await load(iid))
        await tdb.invoices.update_one({"_id": d["_id"]}, {"$set": {"payment_id": await record_payment(i, iid, day)}})
        return out(await load(iid))

    @r.post("/invoices/{iid}/cancel")
    async def cancel(iid: str):
        d = await load(iid)
        if d.get("cancelled_at"):
            raise HTTPException(409, "Fattura già annullata")
        if d.get("legacy"):
            raise HTTPException(409, "Le ricevute registrate prima della nuova Cassa restano invariate: quelle online si annullano con il rimborso della visita")
        if d.get("payment_id"):
            await tdb.payments.delete_one({"_id": ObjectId(d["payment_id"])})
        sent = d.get("sts_status") == "inviata"
        await tdb.invoices.update_one({"_id": d["_id"]}, {"$set": {"cancelled_at": _now(), "sts_status": "da_inviare" if sent else None,
                                                                   "sts_action": "cancellazione" if sent else None}})
        return out(await load(iid))

    async def pdf_of(i: dict, u: dict) -> bytes:
        specialty = (u.get("profile") or {}).get("specialty") or os.environ["DOCTOR_SPECIALTY"]
        return build_invoice_pdf(i, u.get("name", ""), specialty, billing_of(u), await doctor_signature(db, str(u["_id"])))

    def file_name(i: dict, ext: str) -> str:
        return f"Fattura_{(i.get('number') or 'sn').replace('/', '-')}_{_safe(i['patient_name'])}.{ext}"

    @r.get("/invoices/{iid}/pdf")
    async def invoice_pdf(iid: str):
        i = out(await load(iid))
        return Response(await pdf_of(i, await owner()), media_type="application/pdf", headers={"Content-Disposition": f"attachment; filename=\"{file_name(i, 'pdf')}\""})

    @r.get("/invoices/{iid}/xml")
    async def invoice_xml(iid: str):
        i = out(await load(iid))
        if i["client_type"] != "azienda":
            raise HTTPException(409, "Le fatture a persone fisiche non vanno al Sistema di Interscambio")
        xml = fattura_pa(i, billing_of(await owner()), i["sdi_id"][-5:])
        return Response(xml, media_type="application/xml", headers={"Content-Disposition": f"attachment; filename=\"{file_name(i, 'xml')}\""})

    # ---------- Home della cassa ----------
    @r.get("/overview")
    async def overview(clinic: str = ""):
        await sync_legacy()
        today = today_rome()
        clinics = tenant_clinics()
        buckets = {k: {"total": 0.0, "by_clinic": {c: 0.0 for c in clinics}} for k in ("today", "month", "year")}
        async for p in tdb.payments.find({"date": {"$gte": f"{today[:4]}-01-01", "$lte": today}}):
            c = p.get("clinic") or "Altro"
            for k, ok in (("year", True), ("month", p["date"][:7] == today[:7]), ("today", p["date"] == today)):
                if ok:
                    buckets[k]["total"] += p["amount"]
                    buckets[k]["by_clinic"][c] = buckets[k]["by_clinic"].get(c, 0.0) + p["amount"]
        stats = {k: {"total": r2(v["total"]), "by_clinic": [{"clinic": c, "total": r2(t)} for c, t in v["by_clinic"].items()]} for k, v in buckets.items()}
        items = await query(clinic=clinic)
        due = [i for i in items if i["status"] == "da_incassare"]
        return {"stats": stats, "clinics": clinics, "today": today, "recent": items[:60], "to_collect": {"count": len(due), "total": r2(sum(i["totals"]["due"] for i in due))}}

    # ---------- Sistema Tessera Sanitaria (SIMULAZIONE) ----------
    def sts_items(items: list) -> list:
        return [i for i in items if i["client_type"] == "persona" and not i["sts_opposition"] and i.get("number")
                and (not i["cancelled_at"] or i.get("sts_action") == "cancellazione")]

    @r.get("/sts")
    async def sts(year: int):
        items = sts_items(await query(f"{year}-01-01", f"{year}-12-31"))
        for i in items:
            i["sts_status"] = i["sts_status"] or "da_inviare"
        count = {s: sum(1 for i in items if i["sts_status"] == s) for s in ("da_inviare", "inviata", "errore")}
        opposed = sum(1 for i in await query(f"{year}-01-01", f"{year}-12-31") if i["sts_opposition"] and not i["cancelled_at"])
        return {"year": year, "deadline": sts_deadline(year), "items": items, "count": count, "opposed": opposed, "simulation": True}

    def sts_check(i: dict) -> str:
        if not CF_RE.match(i.get("patient_cf") or ""):
            return "Codice fiscale del paziente mancante o non valido"
        if not i.get("number"):
            return "Numero della fattura mancante"
        return ""

    @r.get("/sts/file")
    async def sts_download(year: int):
        items = [i for i in sts_items(await query(f"{year}-01-01", f"{year}-12-31")) if i["sts_status"] != "inviata" and not sts_check(i)]
        return Response(sts_file(items, billing_of(await owner())), media_type="application/xml",
                        headers={"Content-Disposition": f"attachment; filename=\"SistemaTS_{year}_simulazione.xml\""})

    @r.post("/sts/send")
    async def sts_send(year: int):
        sent = errors = 0
        for i in sts_items(await query(f"{year}-01-01", f"{year}-12-31")):
            if i["sts_status"] == "inviata":
                continue
            err = "" if i.get("sts_action") else sts_check(i)
            upd = {"sts_status": "errore", "sts_error": err} if err else {"sts_status": "inviata", "sts_error": "", "sts_sent_at": _now()}
            await tdb.invoices.update_one({"_id": ObjectId(i["id"])}, {"$set": upd})
            errors, sent = errors + bool(err), sent + (not err)
        return {"sent": sent, "errors": errors, "simulation": True}

    # ---------- Per il commercialista ----------
    async def period(start: str, end: str, clinic: str):
        s, e = _iso(start), _iso(end)
        if s > e:
            raise HTTPException(400, "Periodo non valido")
        items = [i for i in await query(s, e, clinic)]
        valid = [i for i in items if not i["cancelled_at"]]
        pf = {"date": {"$gte": s, "$lte": e}, **({"clinic": clinic} if clinic else {})}
        by_method = {m: {"method": m, "label": l, "total": 0.0, "count": 0} for m, l in METHODS.items()}
        async for p in tdb.payments.find(pf):
            by_method.setdefault(p["method"], {"method": p["method"], "label": p["method"], "total": 0.0, "count": 0})
            by_method[p["method"]]["total"] += p["amount"]
            by_method[p["method"]]["count"] += 1
        tot = lambda k: r2(sum(i["totals"][k] for i in valid))
        persona = sts_items(items)
        companies = [i for i in valid if i["client_type"] == "azienda"]
        summary = {"count": len(valid), "cancelled": len(items) - len(valid), **{k: tot(k) for k in ("imponibile", "esente", "iva", "stamp", "ritenuta", "total")},
                   "by_method": [{**m, "total": r2(m["total"])} for m in by_method.values()], "collected": r2(sum(m["total"] for m in by_method.values())),
                   "companies": len(companies), "sdi_sent": sum(1 for i in companies if i["sdi_status"]),
                   "sts": {st: sum(1 for i in persona if (i["sts_status"] or "da_inviare") == st) for st in ("da_inviare", "inviata", "errore")}}
        return s, e, items, summary

    @r.get("/accountant")
    async def accountant(start: str, end: str, clinic: str = ""):
        s, e, items, summary = await period(start, end, clinic)
        u = await owner()
        return {"start": s, "end": e, "clinic": clinic, "summary": summary, "items": items, "accountant_email": billing_of(u)["accountant_email"]}

    async def pack(start: str, end: str, clinic: str):
        s, e, items, summary = await period(start, end, clinic)
        u = await owner()
        reg = build_register_pdf(list(reversed(items)), summary, billing_of(u).get("holder") or u.get("name", ""), s, e, clinic)
        pdfs = [await pdf_of(i, u) for i in reversed(items)]
        tag = f"{s}_{e}{'_' + _safe(clinic) if clinic else ''}"
        return u, s, e, summary, reg, (merge_pdfs(pdfs) if pdfs else None), tag

    @r.get("/accountant/register.pdf")
    async def register_pdf(start: str, end: str, clinic: str = ""):
        _, _, _, _, reg, _, tag = await pack(start, end, clinic)
        return Response(reg, media_type="application/pdf", headers={"Content-Disposition": f"attachment; filename=\"Registro_fatture_{tag}.pdf\""})

    @r.get("/accountant/invoices.pdf")
    async def invoices_pdf(start: str, end: str, clinic: str = ""):
        _, _, _, _, _, allp, tag = await pack(start, end, clinic)
        if not allp:
            raise HTTPException(404, "Nessuna fattura nel periodo")
        return Response(allp, media_type="application/pdf", headers={"Content-Disposition": f"attachment; filename=\"Fatture_{tag}.pdf\""})

    @r.post("/accountant/send")
    async def send_accountant(body: PeriodIn, user: dict = Depends(current_user)):
        u, s, e, sm, reg, allp, tag = await pack(body.start, body.end, body.clinic)
        to = billing_of(u)["accountant_email"]
        if not to:
            raise HTTPException(400, "Salvi prima l'email del commercialista in Cassa > Impostazioni")
        fmt = lambda d: date.fromisoformat(d).strftime("%d/%m/%Y")
        eu = lambda v: f"{v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".") + " €"
        att = [{"filename": f"Registro_fatture_{tag}.pdf", "content": base64.b64encode(reg).decode()}]
        if allp:
            att.append({"filename": f"Fatture_{tag}.pdf", "content": base64.b64encode(allp).decode()})
        name = hesc(billing_of(u).get("holder") or u.get("name", ""))
        html = mail_shell("DOCUMENTI PER IL COMMERCIALISTA",
                          f"<p>Gentile commercialista,</p><p>in allegato il registro delle fatture e le fatture di <strong>{name}</strong> "
                          f"dal {fmt(s)} al {fmt(e)}{' · ' + hesc(body.clinic) if body.clinic else ' · tutti gli studi'}.</p>"
                          f"<p>Fatture: {sm['count']} · Totale fatturato: {eu(sm['total'])} · Esente: {eu(sm['esente'])} · Imponibile: {eu(sm['imponibile'])} · "
                          f"IVA: {eu(sm['iva'])} · Bolli: {eu(sm['stamp'])} · Ritenute: {eu(sm['ritenuta'])}.</p>"
                          "<p style=\"color:#5B6478;font-size:13px\">Email inviata dall'app MantMed su richiesta del medico.</p>")
        await send_email(to=to, subject=f"MantMed · fatture dal {fmt(s)} al {fmt(e)} · {name}", html=html, attachments=att, reply_to=user.get("email"))
        await db.users.update_one({"_id": u["_id"]}, {"$set": {"billing.accountant_last_sent_at": _now()}})
        return {"sent_to": to, "attachments": len(att)}

    return r
