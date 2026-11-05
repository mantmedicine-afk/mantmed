"""Catalogo dei moduli di specialità: cartella base comune + campi propri di ogni modulo (versionati)."""
import re

BASE_FIELDS = [
    {"key": "motivo_visita", "label": "Motivo della visita", "gruppo": "sintomi"},
    {"key": "anamnesi_fisiologica", "label": "Anamnesi", "gruppo": "anamnesi"},
    {"key": "sintomi", "label": "Sintomi", "gruppo": "sintomi"},
    {"key": "diagnosi", "label": "Diagnosi", "gruppo": "terapia"},
    {"key": "terapia", "label": "Terapia e indicazioni", "gruppo": "terapia"},
    {"key": "follow_up", "label": "Follow-up", "gruppo": "terapia"},
]

MODULES = {
    "pediatria": {
        "id": "pediatria", "versione": 1, "nome": "Pediatria", "match": r"pediatr|neonatolog",
        "etichette": {"anamnesi_fisiologica": "Fisiologica"},
        "campi": [
            {"key": "allattamento", "label": "Allattamento", "gruppo": "anamnesi", "hint": "Materno, artificiale, misto · durata"},
            {"key": "svezzamento", "label": "Svezzamento", "gruppo": "anamnesi", "hint": "Età d'inizio, alimenti introdotti, tolleranza"},
            {"key": "torl", "label": "TORL", "gruppo": "esame_obiettivo", "hint": "Otoscopia, faringe, rinofaringe, linfonodi"},
            {"key": "torace_auscultazione", "label": "Torace · Auscultazione", "gruppo": "esame_obiettivo", "hint": "MV, rumori aggiunti, toni cardiaci"},
            {"key": "addome", "label": "Addome", "gruppo": "esame_obiettivo", "hint": "Trattabilità, organomegalie, dolorabilità"},
        ],
        "funzioni": ["percentili_oms", "calcolo_dosi", "bilanci_salute"],
    },
    "generale": {
        "id": "generale", "versione": 1, "nome": "Generale", "match": "",
        "etichette": {}, "campi": [], "funzioni": [],
    },
}

MODULE_KEYS = {f["key"] for m in MODULES.values() for f in m["campi"]}


def module_for(specialty: str) -> str:
    """Modulo di default per una specializzazione (fino al passaggio 2 esistono solo Pediatria e Generale)."""
    spec = (specialty or "").strip()
    for m in MODULES.values():
        if m["match"] and re.search(m["match"], spec, re.I):
            return m["id"]
    return "pediatria" if not spec else "generale"


def module_keys(mid: str) -> list:
    return [f["key"] for f in MODULES.get(mid, MODULES["generale"])["campi"]]


def upgrade_note(d: dict) -> dict:
    """Nota in formato precedente (campi pediatrici al primo livello) → base + modulo. Senza perdita di dati, idempotente."""
    d = dict(d)
    legacy = {k: d.pop(k) for k in list(d) if k in MODULE_KEYS}
    mod = dict(d.get("modulo") or {})
    mid = mod.get("id") or module_for(d.get("specialita") or "")
    own = module_keys(mid)
    campi = {k: "" for k in own}
    campi.update({k: str(v or "") for k, v in legacy.items() if k in own or str(v or "").strip()})
    campi.update({k: str(v or "") for k, v in (mod.get("campi") or {}).items()})
    d["modulo"] = {"id": mid, "versione": mod.get("versione") or MODULES.get(mid, MODULES["generale"])["versione"], "campi": campi}
    return d


def catalog() -> dict:
    return {"base": BASE_FIELDS, "moduli": [{k: v for k, v in m.items() if k != "match"} for m in MODULES.values()]}
