"""Connettore FSE 2.0 (SIMULAZIONE): coda, invio, esito, oscuramento. Un solo modulo da sostituire con il gateway regionale reale."""
import re
from datetime import datetime, timedelta, timezone
from typing import Optional

FSE_DAYS = 5
SEND_AFTER = 4   # secondi in coda prima dell'invio simulato
ACCEPT_AFTER = 8  # secondi dopo l'invio prima dell'esito simulato
CF_RE = re.compile(r"^[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]$", re.I)
REQUIRED = [("fiscal_code", "Codice fiscale"), ("name", "Nome e cognome"), ("birth_date", "Data di nascita"), ("sex", "Sesso"),
            ("guardian", "Genitore/tutore"), ("guardian_fiscal_code", "Codice fiscale del genitore/tutore")]


def _now():
    return datetime.now(timezone.utc)


def missing_data(p: dict) -> list:
    return [label for key, label in REQUIRED if not (p.get(key) or "").strip()]


def blockers(p: dict) -> list:
    out = []
    if not p.get("fse_consent_at"):
        out.append("Manca il consenso all'alimentazione del FSE")
    miss = missing_data(p)
    if miss:
        out.append("Dati incompleti: " + ", ".join(miss))
    return out


def deadline_from(signed_at: Optional[str]) -> Optional[str]:
    if not signed_at:
        return None
    return (datetime.fromisoformat(signed_at) + timedelta(days=FSE_DAYS)).isoformat()


def on_signed(doc: dict, patient: dict) -> dict:
    """Stato FSE dopo la firma: in coda se consenso e dati sono a posto, altrimenti non inviato con il motivo."""
    if doc.get("obscured"):
        return {**(doc.get("fse") or {}), "status": "oscurato"}
    signed = doc.get("signed_at") or _now().isoformat()
    why = blockers(patient)
    base = {"deadline": deadline_from(signed), "history": (doc.get("fse") or {}).get("history", [])}
    if why:
        return {**base, "status": "non_inviato", "reason": "; ".join(why)}
    return {**base, "status": "in_coda", "queued_at": _now().isoformat(), "reason": "",
            "history": base["history"] + [{"status": "in_coda", "at": _now().isoformat()}]}


def advance(fse: Optional[dict], patient: dict) -> Optional[dict]:
    """Simulazione del gateway: in coda → inviato → accettato (o errore se il codice fiscale non è valido)."""
    if not fse:
        return fse
    now = _now()
    f = dict(fse)
    if f.get("status") == "in_coda" and not patient.get("fse_consent_at"):  # consenso revocato: l'invio si ferma
        f.update(status="non_inviato", reason="Consenso all'alimentazione del FSE revocato")
        return f
    if f.get("status") == "in_coda" and now - datetime.fromisoformat(f["queued_at"]) >= timedelta(seconds=SEND_AFTER):
        f.update(status="inviato", sent_at=now.isoformat())
        f["history"] = f.get("history", []) + [{"status": "inviato", "at": now.isoformat()}]
    if f.get("status") == "inviato" and now - datetime.fromisoformat(f["sent_at"]) >= timedelta(seconds=ACCEPT_AFTER):
        ok = bool(CF_RE.match(patient.get("fiscal_code") or ""))
        f.update(status="accettato" if ok else "errore", result_at=now.isoformat(),
                 reason="" if ok else "Rifiutato dal FSE (simulazione): codice fiscale del paziente non valido")
        f["history"] = f.get("history", []) + [{"status": f["status"], "at": now.isoformat()}]
    return f


def pending(fse: Optional[dict]) -> bool:
    return bool(fse) and fse.get("status") in ("non_inviato", "in_coda", "errore")
