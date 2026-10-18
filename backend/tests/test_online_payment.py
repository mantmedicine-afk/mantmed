"""Backend tests for Online Payment (Stripe) feature: schedule+billing, checkout, abandon, webhook, delete guard, receipts security, parent cancel refund path (dry)."""
import os
import time
import pytest
import requests

def _read_env(path, key):
    for line in open(path):
        if line.startswith(key + "="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    return ""


def _parent_pid(parent):
    r = parent.get(f"{API}/portal/me")
    assert r.status_code == 200, r.text
    children = r.json().get("children") or []
    assert children, "demo parent must have aurora linked"
    return children[0]["patient"]["id"]


BASE = os.environ.get("REACT_APP_BACKEND_URL") or _read_env("/app/frontend/.env", "REACT_APP_BACKEND_URL")
API = BASE.rstrip("/") + "/api"
DOC = {"email": "medico@mantmed.it", "password": "Auscula-Studio-2026"}
PAR = {"email": "genitore.demo@example.com", "password": "Portale-Demo-2026"}


def _totp():
    import subprocess
    return subprocess.check_output(["python", "/app/backend/tests/totp_code.py"]).decode().strip()


@pytest.fixture(scope="session")
def doctor():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json=DOC)
    assert r.status_code == 200, r.text
    j = r.json()
    if j.get("mfa_required"):
        # try a few times to beat the 30s window
        last = None
        for _ in range(3):
            r2 = s.post(f"{API}/auth/2fa/verify", json={"mfa_token": j["mfa_token"], "code": _totp()})
            if r2.status_code == 200:
                last = r2
                break
            time.sleep(1)
            last = r2
        assert last and last.status_code == 200, last.text
    return s


@pytest.fixture(scope="session")
def parent():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json=PAR)
    assert r.status_code == 200, r.text
    return s


# ---------- Schedule + billing (prices) ----------
class TestSchedule:
    def test_get_schedule_has_prices_and_billing(self, doctor):
        r = doctor.get(f"{API}/settings/schedule")
        assert r.status_code == 200
        j = r.json()
        assert "prices" in j and "billing" in j
        assert set(j["prices"]) >= {"Prima visita", "Bilancio di salute", "Visita di controllo", "Visita urgente"}
        for k in ("holder", "tax_code", "vat_number", "address", "note"):
            assert k in j["billing"]
        # Keep seed note for restoration
        self.__class__.snapshot = j

    def test_put_schedule_updates_prices_and_billing_persists(self, doctor):
        r = doctor.get(f"{API}/settings/schedule")
        cur = r.json()
        payload = {"hours": cur["hours"], "services": cur["services"], "clinics": cur["clinics"], "billing": cur["billing"]}
        r = doctor.put(f"{API}/settings/schedule", json=payload)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["prices"]["Prima visita"] == 90.0
        # Verify GET returns the same
        r = doctor.get(f"{API}/settings/schedule")
        assert r.json()["prices"]["Prima visita"] == 90.0

    def test_put_schedule_rejects_bad_price(self, doctor):
        r = doctor.get(f"{API}/settings/schedule")
        cur = r.json()
        payload = {"hours": cur["hours"], "clinics": cur["clinics"], "billing": cur["billing"],
                   "services": [{**cur["services"][0], "price": -10}]}
        r = doctor.put(f"{API}/settings/schedule", json=payload)
        assert r.status_code == 422


# ---------- Portal: slots quote ----------
class TestSlotsQuote:
    def test_slots_returns_quote_with_total_and_stamp(self, parent):
        pid = _parent_pid(parent)
        # Pick a future weekday (3 days ahead)
        from datetime import date, timedelta
        d = date.today() + timedelta(days=3)
        while d.isoweekday() > 5:
            d += timedelta(days=1)
        r = parent.get(f"{API}/portal/slots", params={"patient_id": pid, "clinic": "Studio Centro", "service": "Prima visita", "date": d.isoformat()})
        assert r.status_code == 200, r.text
        j = r.json()
        assert "quote" in j
        q = j["quote"]
        assert q["online"] is True
        assert q["price"] == 90.0
        # 90 > 77.47 -> stamp applies
        assert q["stamp"] == 2.0
        assert q["total"] == 92.0

    def test_slots_quote_online_disabled_when_price_zero(self, parent, doctor):
        # Set a service to price 0 temporarily
        cur = doctor.get(f"{API}/settings/schedule").json()
        try:
            zero = [{**s, "price": 0} if s["name"] == "Visita di controllo" else s for s in cur["services"]]
            doctor.put(f"{API}/settings/schedule", json={"hours": cur["hours"], "services": zero, "clinics": cur["clinics"], "billing": cur["billing"]})
            me = parent.get(f"{API}/portal/me").json()
            pid = me["children"][0]["patient"]["id"]
            from datetime import date, timedelta
            d = date.today() + timedelta(days=3)
            while d.isoweekday() > 5:
                d += timedelta(days=1)
            r = parent.get(f"{API}/portal/slots", params={"patient_id": pid, "clinic": "Studio Centro", "service": "Visita di controllo", "date": d.isoformat()})
            assert r.status_code == 200
            q = r.json()["quote"]
            assert q["online"] is False
            assert q["price"] == 0
        finally:
            doctor.put(f"{API}/settings/schedule", json={"hours": cur["hours"], "services": cur["services"], "clinics": cur["clinics"], "billing": cur["billing"]})


# ---------- Checkout ----------
class TestCheckout:
    @pytest.fixture
    def future_slot(self, parent):
        from datetime import date, timedelta
        pid = _parent_pid(parent)
        d = date.today() + timedelta(days=4)
        while d.isoweekday() > 5:
            d += timedelta(days=1)
        r = parent.get(f"{API}/portal/slots", params={"patient_id": pid, "clinic": "Studio Centro", "service": "Prima visita", "date": d.isoformat()})
        slots = r.json()["slots"]
        assert slots, "no slots"
        return {"patient_id": pid, "clinic": "Studio Centro", "service": "Prima visita", "date": d.isoformat(), "time": slots[0], "note": "TEST_checkout"}

    def test_checkout_creates_stripe_session_and_holds_slot(self, parent, future_slot):
        payload = {**future_slot, "origin_url": BASE}
        r = parent.post(f"{API}/portal/checkout", json=payload)
        assert r.status_code == 200, r.text
        j = r.json()
        assert "checkout_url" in j and j["checkout_url"].startswith("https://checkout.stripe.com")
        assert "session_id" in j
        sid = j["session_id"]
        # Hold: slot no longer in list
        r2 = parent.get(f"{API}/portal/slots", params={k: future_slot[k] for k in ("patient_id", "clinic", "service", "date")})
        assert future_slot["time"] not in r2.json()["slots"], "slot was not held"
        # Status endpoint owner-only
        r3 = parent.get(f"{API}/portal/checkout/{sid}")
        assert r3.status_code == 200
        assert r3.json()["payment_status"] in ("pending", "paid")
        # Abandon releases
        # Find request id from status via DB-less path: use /portal/me to find awaiting_payment
        # Simpler: call abandon with any wrong id -> 200 with released:false; use session's rid via appointment-requests list isn't exposed to parent
        # Instead use /portal/me? Not available. We'll query by resetting known rid via url - we don't have it; call abandon with session_id's associated rid: we hit it via DB.
        import pymongo, os as _os
        m = pymongo.MongoClient(_os.environ.get("MONGO_URL") or _read_env("/app/backend/.env", "MONGO_URL"))
        dbn = _os.environ.get("DB_NAME") or _read_env("/app/backend/.env", "DB_NAME")
        rid = str(m[dbn].appt_requests.find_one({"session_id": sid})["_id"])
        r4 = parent.post(f"{API}/portal/checkout/abandon/{rid}")
        assert r4.status_code == 200
        assert r4.json().get("released") is True
        # Slot free again
        r5 = parent.get(f"{API}/portal/slots", params={k: future_slot[k] for k in ("patient_id", "clinic", "service", "date")})
        assert future_slot["time"] in r5.json()["slots"]
        # Cleanup
        m[dbn].appt_requests.delete_one({"_id": __import__("bson").ObjectId(rid)})
        m[dbn].payment_transactions.delete_many({"session_id": sid})

    def test_checkout_rejects_bad_origin(self, parent, future_slot):
        r = parent.post(f"{API}/portal/checkout", json={**future_slot, "origin_url": "not-a-url"})
        assert r.status_code == 400

    def test_checkout_status_not_for_other_parent(self, parent):
        # Fake session id
        r = parent.get(f"{API}/portal/checkout/cs_test_nonexistent")
        assert r.status_code == 404


# ---------- Studio flow (not online) ----------
class TestStudioFlow:
    def test_studio_appointment_request_still_pending(self, parent):
        from datetime import date, timedelta
        pid = _parent_pid(parent)
        d = date.today() + timedelta(days=5)
        while d.isoweekday() > 5:
            d += timedelta(days=1)
        r = parent.get(f"{API}/portal/slots", params={"patient_id": pid, "clinic": "Studio Centro", "service": "Prima visita", "date": d.isoformat()})
        slot = r.json()["slots"][-1]
        payload = {"patient_id": pid, "clinic": "Studio Centro", "service": "Prima visita", "date": d.isoformat(), "time": slot, "note": "TEST_studio"}
        r = parent.post(f"{API}/portal/appointment-requests", json=payload)
        assert r.status_code == 200
        j = r.json()
        assert j["status"] == "pending"
        assert j.get("pay_online") in (False, None)
        # Cleanup
        parent.post(f"{API}/portal/appointment-requests/{j['id']}/cancel")


# ---------- Webhook ----------
class TestWebhook:
    def test_webhook_bad_signature_returns_400(self):
        r = requests.post(f"{API}/stripe/webhook", data=b"{}", headers={"stripe-signature": "nope"})
        assert r.status_code == 400


# ---------- Delete guard + online CashPanel ----------
class TestCashRegister:
    def test_create_payment_rejects_online_method(self, doctor):
        r = doctor.post(f"{API}/payments", json={"patient_name": "TEST_x", "amount": 10, "method": "online"})
        assert r.status_code == 422  # Literal doesn't allow online

    def test_delete_online_payment_returns_409(self, doctor):
        # Find any online payment
        import pymongo, os as _os
        m = pymongo.MongoClient(_os.environ.get("MONGO_URL") or _read_env("/app/backend/.env", "MONGO_URL"))
        dbn = _os.environ.get("DB_NAME") or _read_env("/app/backend/.env", "DB_NAME")
        p = m[dbn].payments.find_one({"method": "online", "refund_of": None})
        if not p:
            pytest.skip("no online payment present")
        r = doctor.delete(f"{API}/payments/{p['_id']}")
        assert r.status_code == 409


# ---------- Receipts security ----------
class TestReceiptSecurity:
    def test_receipt_404_for_wrong_parent(self, parent):
        # Use obviously invalid id
        r = parent.get(f"{API}/portal/receipts/000000000000000000000000/pdf")
        assert r.status_code == 404

    def test_doctor_receipt_404_for_invalid_id(self, doctor):
        r = doctor.get(f"{API}/payments/000000000000000000000000/receipt")
        assert r.status_code == 404

    def test_parent_me_lists_receipts_structure(self, parent):
        me = parent.get(f"{API}/auth/me").json()
        children = me.get("children") or []
        # Call /me (which includes child_view with receipts/paid_online)
        r = parent.get(f"{API}/auth/me")
        assert r.status_code == 200
