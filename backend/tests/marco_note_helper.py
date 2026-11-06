"""Helper (iter75): show / set / restore Marco Demo eye notes via API. Usage: python marco_note_helper.py show|setmulti|restore"""
import json
import os
import sys
from pathlib import Path

import requests

BASE = next(l.split("=", 1)[1].strip() for l in (Path(__file__).parents[2] / "frontend/.env").read_text().splitlines() if l.startswith("REACT_APP_BACKEND_URL=")).rstrip("/") + "/api"
CID = "6aed2716a998ff4c0f9a3db3"
s = requests.Session()
assert s.post(f"{BASE}/auth/login", json={"email": "oculista.demo@example.com", "password": "Oculista-Demo-2026"}).status_code == 200
c = s.get(f"{BASE}/consultations/{CID}").json()
note = c["note"]
campi = note["modulo"]["campi"]
cmd = sys.argv[1]
if cmd == "show":
    print(json.dumps({k: campi.get(k) for k in ("cristallino", "refrazione")}, ensure_ascii=False), c.get("signed_at"))
elif cmd == "setmulti":
    campi["refrazione"]["nota"] = "Addizione +2,00"
    campi["cristallino"]["od"] = {"v": "Esistente"}
    print(s.patch(f"{BASE}/consultations/{CID}", json={"note": note}).status_code)
elif cmd == "restore":
    campi["refrazione"]["nota"] = ""
    for e in ("od", "os"):
        campi["refrazione"][e]["addizione"] = ""
    campi["cristallino"].update({"nota": "Lieve opacità nucleare", "od": {"v": ""}, "os": {"v": ""}})
    print(s.patch(f"{BASE}/consultations/{CID}", json={"note": note}).status_code)
