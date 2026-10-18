"""Online payment for portal bookings (Stripe Checkout): instant confirmation, automatic cash-register entry, receipts and refunds."""
import os
import re
import asyncio
import logging
from datetime import datetime, timezone, timedelta
from html import escape as hesc
import stripe
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from pydantic import Field
from pymongo import ReturnDocument
from auth import require_role
from crypto import unseal_fields
from mailer import send_email
from registration import mail_shell
from scheduling import online_quote, schedule_of
from portal_flow import RequestIn, check_request, request_doc, _fmt_day
from receipt import build_receipt

logger = logging.getLogger(__name__)
stripe.api_key = os.environ["STRIPE_SECRET_KEY"]
WEBHOOK_SECRET = os.environ["STRIPE_WEBHOOK_SECRET"]
HOLD_MIN = 35
MAX_HOLDS = 3
MEDICAL_TAX_CODE = "txcd_20060027"
NONTAXABLE = "txcd_00000000"
ORIGIN_RE = re.compile(r"^https?://[A-Za-z0-9.\-:]+$")


class CheckoutIn(RequestIn):
    origin_url: str = Field(max_length=200)


def _now():
    return datetime.now(timezone.utc)


def build_billing(db, current_user, Appointment, Payment, today_rome):
    doctor = APIRouter()
    parent = APIRouter(prefix="/portal", dependencies=[Depends(require_role(current_user, "parent"))])
    public = APIRouter()

    async def stripe_call(fn, **kw):
        return await asyncio.to_thread(fn, **kw)

    async def create_session(kw: dict):
        try:
            return await stripe_call(stripe.checkout.Session.create, **kw, automatic_tax={"enabled": True}, billing_address_collection="required")
        except stripe.error.InvalidRequestError:
            logger.warning("Stripe Tax non disponibile: sessione senza calcolo imposte")
            return await stripe_call(stripe.checkout.Session.create, **kw)

    # ---------- Genitore: prenotazione con pagamento online ----------
    @parent.post("/checkout")
    async def checkout(body: CheckoutIn, user: dict = Depends(current_user)):
        origin = body.origin_url.rstrip("/")
        if not ORIGIN_RE.match(origin):
            raise HTTPException(400, "Origine non valida")
        if await db.appt_requests.count_documents({"parent_id": user["id"], "status": "awaiting_payment", "hold_until": {"$gte": _now().isoformat()}}) >= MAX_HOLDS:
            raise HTTPException(429, "Ha già alcuni pagamenti in sospeso: li completi o attenda qualche minuto")
        u, doc, p = await check_request(db, body, user["id"])
        q = online_quote(doc, body.service)
        if not q["online"]:
            raise HTTPException(400, "Il pagamento online non è attivo per questa prestazione: scelga Paga in Studio")
        r = {**request_doc(body, u, doc, p, "awaiting_payment"), "pay_online": True, "amount": q["total"], "stamp": q["stamp"],
             "hold_until": (_now() + timedelta(minutes=HOLD_MIN)).isoformat()}
        rid = str((await db.appt_requests.insert_one(r)).inserted_id)
        when = f"{_fmt_day(body.date)} ore {body.time} · {body.clinic}"
        items = [{"price_data": {"currency": "eur", "unit_amount": round(q["price"] * 100),
                                 "product_data": {"name": f"Prestazione sanitaria · {doc['name']}", "description": when, "tax_code": MEDICAL_TAX_CODE}}, "quantity": 1}]
        if q["stamp"]:
            items.append({"price_data": {"currency": "eur", "unit_amount": round(q["stamp"] * 100),
                                         "product_data": {"name": "Imposta di bollo sulla ricevuta", "tax_code": NONTAXABLE}}, "quantity": 1})
        meta = {"request_id": rid, "owner_id": str(doc["_id"])}
        try:
            s = await create_session(dict(
                mode="payment", payment_method_types=["card"], customer_email=u["email"], line_items=items, locale="it", metadata=meta,
                adaptive_pricing={"enabled": False},
                payment_intent_data={"metadata": meta, "description": f"MantMed · {when}"},
                success_url=f"{origin}/portale?pagamento=ok&session_id={{CHECKOUT_SESSION_ID}}",
                cancel_url=f"{origin}/portale?pagamento=annullato&richiesta={rid}",
                expires_at=int((_now() + timedelta(minutes=31)).timestamp())))
        except stripe.error.StripeError:
            logger.exception("Checkout Stripe non creato")
            await db.appt_requests.delete_one({"_id": ObjectId(rid)})
            raise HTTPException(502, "Pagamento online momentaneamente non disponibile: riprovi o scelga Paga in Studio")
        await db.payment_transactions.insert_one({"session_id": s.id, "request_id": rid, "owner_id": str(doc["_id"]), "parent_id": user["id"],
                                                  "amount": q["total"], "currency": "eur", "status": "initiated", "payment_status": "pending",
                                                  "created_at": _now().isoformat(), "updated_at": _now().isoformat()})
        await db.appt_requests.update_one({"_id": ObjectId(rid)}, {"$set": {"session_id": s.id}})
        return {"checkout_url": s.url, "session_id": s.id}

    async def fulfil(sid: str, pi: str):
        """Idempotent: only the caller that flips the transaction to paid books the visit and records the payment."""
        tx = await db.payment_transactions.find_one_and_update(
            {"session_id": sid, "payment_status": {"$ne": "paid"}},
            {"$set": {"status": "completed", "payment_status": "paid", "stripe_payment_intent_id": pi, "updated_at": _now().isoformat()}})
        if not tx:
            return
        r = await db.appt_requests.find_one({"_id": ObjectId(tx["request_id"])})
        owner = await db.users.find_one({"_id": ObjectId(r["owner_id"])})
        note = unseal_fields(r, ("note",)).get("note") or ""
        appt = Appointment(clinic=r["clinic"], date=r["date"], time=r["time"], patient_name=r["patient_name"], patient_id=r["patient_id"], visit_type=r["service"],
                           duration=schedule_of(owner)["durations"].get(r["service"], 30), paid_online=True,
                           notes=f"Prenotata e pagata online dal portale. {note}".strip())
        aid = str((await db.appointments.insert_one({**appt.to_mongo(), "owner_id": r["owner_id"]})).inserted_id)
        year = today_rome()[:4]
        c = await db.counters.find_one_and_update({"_id": f"receipt:{r['owner_id']}:{year}"}, {"$inc": {"n": 1}}, upsert=True, return_document=ReturnDocument.AFTER)
        pay = Payment(patient_id=r["patient_id"], patient_name=r["patient_name"], clinic=r["clinic"], service=r["service"], amount=r["amount"], method="online",
                      appointment_id=aid, receipt_no=f"{c['n']}/{year}", stamp=r.get("stamp") or 0, payer_name=r["parent_name"],
                      visit_date=r["date"], visit_time=r["time"])
        pid = str((await db.payments.insert_one({**pay.to_mongo(), "owner_id": r["owner_id"]})).inserted_id)
        await db.appointments.update_one({"_id": ObjectId(aid)}, {"$set": {"payment_id": pid}})
        await db.payment_transactions.update_one({"_id": tx["_id"]}, {"$set": {"payment_id": pid, "appointment_id": aid}})
        await db.appt_requests.update_one({"_id": r["_id"]}, {"$set": {"status": "confirmed", "confirmed_date": r["date"], "confirmed_time": r["time"],
                                                                     "appointment_id": aid, "payment_id": pid, "decided_at": _now().isoformat()}})
        try:
            await send_email(to=r["parent_email"], subject=f"MantMed · visita di {r['patient_name']} confermata e pagata", html=mail_shell("CONFERMATO & PAGATO",
                f"<p>Gentile {hesc(r['parent_name'])},</p><p>abbiamo ricevuto il pagamento e la visita di <strong>{hesc(r['patient_name'])}</strong> è confermata:</p>"
                f"<p style=\"font-family:Georgia,serif;font-size:22px\">{_fmt_day(r['date'])} alle {r['time']}</p>"
                f"<p>{hesc(r['service'])} · {hesc(r['clinic'])} · {hesc(owner.get('name', ''))}</p>"
                f"<p>Ricevuta n. {pay.receipt_no} di {f'{pay.amount:.2f}'.replace('.', ',')} €: la scarica dal Portale Paziente, sezione Ricevute.</p>"
                "<p style=\"color:#5B6478;font-size:13px\">Può annullare dal portale fino a 12 ore prima con rimborso completo.</p>"))
        except Exception:
            logger.exception("Email di conferma pagamento non inviata")

    async def expire(r: dict):
        await db.appt_requests.update_one({"_id": r["_id"], "status": "awaiting_payment"}, {"$set": {"status": "expired"}})
        await db.payment_transactions.update_one({"request_id": str(r["_id"]), "payment_status": {"$ne": "paid"}},
                                                 {"$set": {"status": "expired", "payment_status": "expired", "updated_at": _now().isoformat()}})

    async def sync_session(sid: str) -> None:
        s = await stripe_call(stripe.checkout.Session.retrieve, id=sid)
        if s.payment_status == "paid":
            await fulfil(sid, s.payment_intent)
        elif s.status == "expired":
            r = await db.appt_requests.find_one({"session_id": sid})
            if r:
                await expire(r)

    @parent.get("/checkout/{sid}")
    async def checkout_status(sid: str, user: dict = Depends(current_user)):
        tx = await db.payment_transactions.find_one({"session_id": sid, "parent_id": user["id"]})
        if not tx:
            raise HTTPException(404, "Pagamento non trovato")
        if tx["payment_status"] == "pending":
            try:
                await sync_session(sid)
            except stripe.error.StripeError:
                logger.warning("Stato sessione Stripe non disponibile")
            tx = await db.payment_transactions.find_one({"_id": tx["_id"]})
        return {"session_id": sid, "status": tx["status"], "payment_status": tx["payment_status"], "appointment_id": tx.get("appointment_id")}

    @parent.post("/checkout/abandon/{rid}")
    async def abandon(rid: str, user: dict = Depends(current_user)):
        r = await db.appt_requests.find_one({"_id": ObjectId(rid), "parent_id": user["id"], "status": "awaiting_payment"}) if ObjectId.is_valid(rid) else None
        if not r:
            return {"released": False}
        try:
            await stripe_call(stripe.checkout.Session.expire, session=r["session_id"])
        except stripe.error.StripeError:
            await sync_session(r["session_id"])
        if (await db.appt_requests.find_one({"_id": r["_id"]}))["status"] == "confirmed":
            return {"released": False, "paid": True}
        await expire(r)
        return {"released": True}

    @public.post("/stripe/webhook")
    async def stripe_webhook(request: Request):
        try:
            event = stripe.Webhook.construct_event(await request.body(), request.headers.get("stripe-signature", ""), WEBHOOK_SECRET)
        except (ValueError, stripe.error.SignatureVerificationError):
            raise HTTPException(400, "Firma non valida")
        obj, t = event["data"]["object"], event["type"]
        if t in ("checkout.session.completed", "checkout.session.async_payment_succeeded") and obj.get("payment_status") == "paid":
            await fulfil(obj["id"], obj.get("payment_intent"))
        elif t in ("checkout.session.expired", "checkout.session.async_payment_failed"):
            r = await db.appt_requests.find_one({"session_id": obj["id"]})
            if r:
                await expire(r)
        elif t == "charge.refunded":
            await db.payment_transactions.update_one({"stripe_payment_intent_id": obj.get("payment_intent")},
                                                     {"$set": {"status": "refunded", "payment_status": "refunded", "updated_at": _now().isoformat()}})
        return {"status": "ok"}

    # ---------- Rimborso automatico all'annullamento ----------
    async def refund_online(a: dict):
        if not a.get("payment_id"):
            return None
        p = await db.payments.find_one({"_id": ObjectId(a["payment_id"])})
        if not p or p.get("refunded_at"):
            return None
        tx = await db.payment_transactions.find_one({"payment_id": a["payment_id"]})
        try:
            await stripe_call(stripe.Refund.create, payment_intent=tx["stripe_payment_intent_id"], metadata={"appointment_id": str(a["_id"])})
        except stripe.error.StripeError:
            logger.exception("Rimborso Stripe non riuscito")
            raise HTTPException(502, "Rimborso non riuscito: la visita non è stata annullata. Riprovi tra qualche minuto o contatti lo studio")
        now = _now().isoformat()
        await db.payments.update_one({"_id": p["_id"]}, {"$set": {"refunded_at": now}})
        pay = Payment.from_mongo(p)
        back = Payment(patient_id=pay.patient_id, patient_name=pay.patient_name, clinic=pay.clinic, service=f"Rimborso · {pay.service}", amount=-pay.amount,
                       method="online", appointment_id=pay.appointment_id, refund_of=str(p["_id"]), payer_name=pay.payer_name, receipt_no=pay.receipt_no)
        await db.payments.insert_one({**back.to_mongo(), "owner_id": p["owner_id"]})
        await db.payment_transactions.update_one({"_id": tx["_id"]}, {"$set": {"status": "refunded", "payment_status": "refunded", "updated_at": now}})
        return pay.amount

    # ---------- Ricevute ----------
    async def receipt_response(p: dict):
        pay = Payment.from_mongo(p).out()
        owner = await db.users.find_one({"_id": ObjectId(p["owner_id"])}) or {}
        pt = await db.patients.find_one({"_id": ObjectId(pay["patient_id"]), "owner_id": p["owner_id"]}) if pay.get("patient_id") else None
        cf = unseal_fields(pt, ("fiscal_code",)).get("fiscal_code") if pt else ""
        if pay.get("visit_date"):
            pay["visit_date_label"] = f"visita del {_fmt_day(pay['visit_date'])} ore {pay.get('visit_time') or ''}".strip()
        specialty = (owner.get("profile") or {}).get("specialty") or os.environ["DOCTOR_SPECIALTY"]
        pdf = build_receipt(pay, owner.get("name", ""), specialty, schedule_of(owner)["billing"], cf)
        name = f"Ricevuta_{pay['receipt_no'].replace('/', '-')}_{re.sub(r'[^A-Za-z0-9]+', '_', pay['patient_name']).strip('_')}.pdf"
        return Response(pdf, media_type="application/pdf", headers={"Content-Disposition": f"attachment; filename=\"{name}\""})

    def receipt_filter(pid: str) -> dict:
        if not ObjectId.is_valid(pid):
            raise HTTPException(404, "Ricevuta non trovata")
        return {"_id": ObjectId(pid), "method": "online", "receipt_no": {"$ne": None}, "refund_of": None}

    @parent.get("/receipts/{pid}/pdf")
    async def parent_receipt(pid: str, user: dict = Depends(current_user)):
        p = await db.payments.find_one(receipt_filter(pid))
        u = await db.users.find_one({"_id": ObjectId(user["id"])})
        if not p or not any(c["patient_id"] == p.get("patient_id") and c["owner_id"] == p["owner_id"] for c in u.get("children", [])):
            raise HTTPException(404, "Ricevuta non trovata")
        return await receipt_response(p)

    @doctor.get("/payments/{pid}/receipt")
    async def doctor_receipt(pid: str, user: dict = Depends(current_user)):
        p = await db.payments.find_one({**receipt_filter(pid), "owner_id": user["id"]})
        if not p:
            raise HTTPException(404, "Ricevuta non trovata")
        return await receipt_response(p)

    return doctor, parent, public, refund_online
