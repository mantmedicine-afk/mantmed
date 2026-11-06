"""MantAI non deve aggiungere giudizi, interpretazioni o indicazioni non dette dal medico (riepilogo per il paziente e campi della cartella)."""
import os
import re
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).parents[2] / "frontend/.env")
BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"

# Il medico riporta i valori senza giudicarli e non dà indicazioni su ramipril: il paziente dice solo di prenderlo.
TRANSCRIPT = ("Medico: Buongiorno, come mai è qui? Paziente: Per un controllo, prendo il ramipril da due anni. "
              "Medico: Misuro la pressione: 150 su 95. Frequenza 80. Ha portato gli esami? Paziente: Sì, il colesterolo è 245. "
              "Medico: Va bene, ausculto il cuore: toni validi. Facciamo un ECG: ritmo sinusale. Ci rivediamo tra tre mesi.")
FORBIDDEN = r"\b(alt[aoie]|bass[aoie]|normal[ei]|nella norma|elevat[aoie]|aumentat[aoie]|prosegu\w*|continu\w*|sospend\w*|buon[aoie]?|preoccup\w*)\b"


def test_no_invented_judgements_or_instructions():
    s = requests.Session()
    assert s.post(f"{BASE_URL}/auth/login", json={"email": "cardiologo.demo@example.com", "password": "Cardio-Demo-2026"}).status_code == 200
    r = s.post(f"{BASE_URL}/consultations/start", data={"patient_name": "TEST_Fedelta", "transcript": TRANSCRIPT, "paper_consent": "true"}, timeout=60)
    assert r.status_code == 200, r.text
    c = r.json()
    import time
    for _ in range(60):
        if c.get("status") != "processing":
            break
        time.sleep(3)
        c = s.get(f"{BASE_URL}/consultations/{c['id']}").json()
    assert c["status"] == "ready", c.get("ai_error")
    n = c["note"]
    try:
        riep = n["riepilogo"]
        assert riep.strip()
        bad = re.findall(FORBIDDEN, riep, re.I)
        assert not bad, f"Riepilogo con parole non dette dal medico {bad}: {riep}"
        texts = " ".join(str(v) for k, v in n.items() if isinstance(v, str) and k not in ("riepilogo", "specialita"))
        texts += " " + " ".join(str(v) for v in n["modulo"]["campi"].values() if isinstance(v, str))
        texts += " " + " ".join(x.get("testo", "") for x in n.get("sezioni") or [])
        bad = re.findall(r"\b(elevat[aoie]|ipertes[aoie]|ipercolesterolemi\w*|prosegu\w*|continu\w*)\b", texts, re.I)
        assert not bad, f"Cartella con giudizi o indicazioni non dette {bad}"
        assert n["motivo_visita"].strip(), "Motivo della visita non compilato"
    finally:
        from pymongo import MongoClient
        MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))["mantmed"].consultations.delete_one({"patient_name": "TEST_Fedelta"})
