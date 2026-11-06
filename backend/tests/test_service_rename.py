"""Le personalizzazioni di prezzo e durata degli studi restano collegate alla prestazione anche se la si rinomina."""
import os
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).parents[2] / "frontend/.env")
BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"
OCU = ("oculista.demo@example.com", "Oculista-Demo-2026")


def body_of(s: dict) -> dict:
    keys = ("id", "name", "address", "phone", "email", "color", "header", "methods", "prices")
    return {"clinics": [{k: c.get(k) for k in keys} for c in s["clinics"]], "hours": s["hours"], "services": s["services"], "billing": s["billing"]}


def test_rename_keeps_studio_overrides():
    sess = requests.Session()
    assert sess.post(f"{BASE_URL}/auth/login", json=dict(zip(("email", "password"), OCU))).status_code == 200
    orig = sess.get(f"{BASE_URL}/settings/schedule").json()
    try:
        b = body_of(orig)
        svc = b["services"][0]
        sid, old_name = svc["id"], svc["name"]
        assert sid
        b["clinics"][0]["prices"] = {sid: {"price": 111, "duration": 50, "off": False}}
        s1 = sess.put(f"{BASE_URL}/settings/schedule", json=b).json()
        assert s1["clinics"][0]["prices"][sid]["price"] == 111
        for new_name in ("TEST Prima visita oculistica", "TEST Visita completa"):  # rinomina più volte, in momenti diversi
            b = body_of(s1)
            b["services"][0]["name"] = new_name
            s1 = sess.put(f"{BASE_URL}/settings/schedule", json=b).json()
            assert s1["services"][0]["id"] == sid
            assert s1["clinics"][0]["prices"][sid] == {"price": 111, "duration": 50, "off": False}
            clinic = s1["clinics"][0]["name"]
            r = sess.get(f"{BASE_URL}/settings/schedule").json()
            assert r["services"][0]["name"] == new_name and r["clinics"][0]["prices"][sid]["price"] == 111
        # il listino dello studio applica la personalizzazione alla prestazione rinominata
        import sys
        sys.path.insert(0, str(Path(__file__).parents[1]))
        from pymongo import MongoClient
        from scheduling import schedule_of
        load_dotenv(Path(__file__).parents[1] / ".env")
        u = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]].users.find_one({"email": OCU[0]})
        sch = schedule_of(u, clinic)
        assert sch["prices"]["TEST Visita completa"] == 111 and sch["durations"]["TEST Visita completa"] == 50
        assert old_name not in sch["prices"]
    finally:
        b = body_of(orig)
        assert sess.put(f"{BASE_URL}/settings/schedule", json=b).status_code == 200
