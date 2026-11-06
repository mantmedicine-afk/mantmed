"""Catalogo dei moduli di specialità: cartella base comune + campi propri di ogni modulo (versionati).
I moduli documentano solo ciò che dice il medico: nessun calcolo clinico, punteggio, soglia o suggerimento."""
import re
import unicodedata
from collections import Counter
from datetime import datetime, timezone
from typing import List, Literal

from bson import ObjectId
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

BASE_FIELDS = [
    {"key": "motivo_visita", "label": "Motivo della visita", "gruppo": "sintomi"},
    {"key": "anamnesi_fisiologica", "label": "Anamnesi", "gruppo": "anamnesi"},
    {"key": "allergie", "label": "Allergie e intolleranze", "gruppo": "anamnesi", "hint": "Come riferite"},
    {"key": "farmaci_in_uso", "label": "Farmaci in uso", "gruppo": "anamnesi", "hint": "Come riferiti"},
    {"key": "sintomi", "label": "Sintomi", "gruppo": "sintomi"},
    {"key": "esame_obiettivo", "label": "Esame obiettivo generale (condizioni generali)", "gruppo": "esame_obiettivo"},
    {"key": "diagnosi", "label": "Diagnosi", "gruppo": "terapia"},
    {"key": "terapia", "label": "Terapia e indicazioni", "gruppo": "terapia"},
    {"key": "follow_up", "label": "Follow-up", "gruppo": "terapia"},
]
NEW_BASE_KEYS = ("esame_obiettivo", "allergie", "farmaci_in_uso")


def T(key, label, gruppo, hint=""):
    return {"key": key, "label": label, "gruppo": gruppo, "tipo": "testo", "hint": hint}


def N(key, label, gruppo, unita, lo, hi, hint=""):
    return {"key": key, "label": label, "gruppo": gruppo, "tipo": "numero", "unita": unita, "min": lo, "max": hi, "hint": hint}


AS_SAID = "Solo se indicata dal medico"
MODULES = {
    "pediatria": {
        "id": "pediatria", "versione": 1, "nome": "Pediatria", "match": r"pediatr|neonatolog",
        "etichette": {"anamnesi_fisiologica": "Fisiologica"}, "gruppi": {},
        "campi": [
            T("allattamento", "Allattamento", "anamnesi", "Materno, artificiale, misto · durata"),
            T("svezzamento", "Svezzamento", "anamnesi", "Età d'inizio, alimenti introdotti, tolleranza"),
            T("torl", "TORL", "esame_obiettivo", "Otoscopia, faringe, rinofaringe, linfonodi"),
            T("torace_auscultazione", "Torace · Auscultazione", "esame_obiettivo", "MV, rumori aggiunti, toni cardiaci"),
            T("addome", "Addome", "esame_obiettivo", "Trattabilità, organomegalie, dolorabilità"),
        ],
        "funzioni": ["percentili_oms", "calcolo_dosi", "bilanci_salute"],
    },
    "cardiologia": {
        "id": "cardiologia", "versione": 1, "nome": "Cardiologia", "match": r"cardiolog",
        "etichette": {}, "gruppi": {"esami": "Esami strumentali"},
        "campi": [
            {**T("fattori_rischio", "Fattori di rischio cardiovascolari", "anamnesi", "Come riferiti dal paziente: fumo, familiarità, patologie già note"),
             "ai": "solo ciò che il paziente riferisce; MAI valori di laboratorio o misure (es. LDL, colesterolo, pressione), che vanno solo nei loro campi; non classificare mai un valore come fattore di rischio"},
            T("anamnesi_cardiologica", "Anamnesi cardiologica", "anamnesi", "Eventi, interventi, dispositivi impiantati"),
            T("farmaci_cardiologici", "Farmaci cardiologici in uso", "anamnesi"),
            T("sintomi_cardiologici", "Sintomi cardiologici", "anamnesi", "Dolore toracico, dispnea, palpitazioni, sincope, edemi"),
            T("classe_funzionale", "Classe funzionale", "anamnesi", AS_SAID),
            {"key": "pressione", "label": "Pressione arteriosa", "gruppo": "parametri", "tipo": "pressione", "unita": "mmHg",
             "min": 40, "max": 300, "min2": 20, "max2": 200, "hint": "Più misurazioni possibili"},
            N("frequenza_cardiaca", "Frequenza cardiaca", "parametri", "bpm", 20, 300),
            N("saturazione", "Saturazione O2", "parametri", "%", 50, 100),
            N("peso", "Peso", "parametri", "kg", 1, 400),
            N("altezza", "Altezza", "parametri", "cm", 30, 250),
            T("auscultazione_cardiaca", "Auscultazione cardiaca", "esame_obiettivo"),
            T("auscultazione_polmonare", "Auscultazione polmonare", "esame_obiettivo"),
            T("polsi_periferici", "Polsi periferici", "esame_obiettivo"),
            T("edemi_circolo", "Edemi e circolo venoso", "esame_obiettivo"),
            T("ecg", "ECG", "esami", "Referto come dettato"),
            T("ecocardiogramma", "Ecocardiogramma", "esami", "Referto come dettato"),
            T("esami_laboratorio", "Esami di laboratorio", "esami", "Valori come dettati (es. LDL, glicemia)"),
            T("altri_esami", "Altri esami", "esami", "Holter, test da sforzo"),
            T("accertamenti", "Accertamenti richiesti", "piano"),
        ],
        "funzioni": [],
    },
    "dermatologia": {
        "id": "dermatologia", "versione": 1, "nome": "Dermatologia", "match": r"dermatolog",
        "etichette": {}, "gruppi": {"esami": "Procedure"},
        "campi": [
            T("anamnesi_dermatologica", "Anamnesi dermatologica", "anamnesi", "Patologie cutanee pregresse, familiarità"),
            {"key": "fototipo", "label": "Fototipo", "gruppo": "anamnesi", "tipo": "scelta", "opzioni": ["I", "II", "III", "IV", "V", "VI"], "hint": AS_SAID},
            T("esposizione_solare", "Esposizione solare e fotoprotezione", "anamnesi"),
            T("trattamenti_in_corso", "Trattamenti in corso", "anamnesi", "Topici o sistemici"),
            T("sintomi_locali", "Sintomi locali ed evoluzione", "anamnesi", "Prurito, dolore, durata"),
            T("sede_lesioni", "Sede delle lesioni", "esame_obiettivo", "Si collega alla Bodychart"),
            T("morfologia", "Morfologia", "esame_obiettivo", "Tipo, colore, dimensioni, margini, distribuzione"),
            T("dermatoscopia", "Dermatoscopia", "esame_obiettivo", "Descrizione dettata"),
            T("annessi_mucose", "Annessi e mucose", "esame_obiettivo", "Capelli, unghie, mucose"),
            T("controllo_nei", "Controllo dei nei", "esame_obiettivo", "Lesioni da monitorare, come indicate dal medico"),
            T("procedure_eseguite", "Procedure eseguite", "esami", "Biopsia, crioterapia, asportazione"),
            T("foto_cliniche", "Foto cliniche", "esami", "Le foto si aggiungono dalla Bodychart"),
            T("accertamenti", "Accertamenti e controlli", "piano"),
        ],
        "funzioni": [],
    },
    "ginecologia": {
        "id": "ginecologia", "versione": 1, "nome": "Ginecologia", "match": r"ginecolog",
        "etichette": {}, "gruppi": {"esami": "Esami e prelievi"},
        "campi": [
            N("eta_menarca", "Età del menarca", "anamnesi", "anni", 5, 25),
            {"key": "data_ultima_mestruazione", "label": "Data dell'ultima mestruazione", "gruppo": "anamnesi", "tipo": "data"},
            T("ciclo_mestruale", "Ciclo mestruale", "anamnesi", "Regolarità, durata, flusso"),
            N("gravidanze", "Gravidanze", "anamnesi", "", 0, 30, "Come riferite"),
            N("parti", "Parti", "anamnesi", "", 0, 30, "Come riferiti"),
            N("aborti", "Aborti", "anamnesi", "", 0, 30, "Come riferiti"),
            {"key": "gravidanza_in_corso", "label": "Gravidanza in corso", "gruppo": "anamnesi", "tipo": "sino"},
            N("settimane_gestazione", "Settimane di gestazione", "anamnesi", "sett.", 0, 45, "Solo come dette dal medico, nessun calcolo"),
            T("contraccezione", "Contraccezione", "anamnesi"),
            T("screening", "Screening", "anamnesi", "Ultimo Pap test o test HPV, mammografia: data ed esito riferito"),
            T("menopausa", "Menopausa", "anamnesi", "Età, sintomi"),
            T("anamnesi_ginecologica", "Anamnesi ginecologica", "anamnesi", "Malattie e interventi"),
            T("esame_seno", "Esame del seno", "esame_obiettivo"),
            T("genitali_esterni", "Ispezione dei genitali esterni", "esame_obiettivo"),
            T("esame_speculum", "Esame con speculum", "esame_obiettivo"),
            T("esplorazione_bimanuale", "Esplorazione bimanuale", "esame_obiettivo"),
            T("ecografia", "Ecografia pelvica o transvaginale", "esami", "Descrizione dettata"),
            T("prelievi", "Prelievi eseguiti", "esami", "Pap test, test HPV, tamponi"),
            T("accertamenti", "Accertamenti richiesti", "piano"),
        ],
        "funzioni": ["riservata_ai_tutori_minori"],
    },
    "generale": {
        "id": "generale", "versione": 1, "nome": "Generale", "match": "",
        "etichette": {}, "gruppi": {}, "campi": [], "funzioni": [],
    },
}
SPECIALTIES = ["Pediatria", "Neonatologia", "Cardiologia", "Dermatologia e venereologia", "Ginecologia e ostetricia", "Medicina interna",
               "Medicina generale", "Allergologia e immunologia clinica", "Endocrinologia", "Gastroenterologia", "Geriatria", "Nefrologia", "Neurologia",
               "Oftalmologia", "Oncologia", "Ortopedia e traumatologia", "Otorinolaringoiatria", "Pneumologia", "Psichiatria", "Reumatologia",
               "Urologia", "Chirurgia generale", "Medicina fisica e riabilitativa"]
STRUCTURED = ("cardiologia", "dermatologia", "ginecologia")  # moduli a campi definiti (con "Altre voci")
LEGACY_KEYS = {f["key"] for f in MODULES["pediatria"]["campi"]}


def module_for(specialty: str) -> str:
    """Modulo di default per una specializzazione."""
    spec = (specialty or "").strip()
    for m in MODULES.values():
        if m["match"] and re.search(m["match"], spec, re.I):
            return m["id"]
    return "pediatria" if not spec else "generale"


def module_fields(mid: str) -> list:
    return MODULES.get(mid, MODULES["generale"])["campi"]


def module_keys(mid: str) -> list:
    return [f["key"] for f in module_fields(mid)]


def _f(v):
    try:
        return None if v in (None, "") else float(str(v).replace(",", "."))
    except ValueError:
        return None


def clean_value(f: dict, v):
    """Valore di un campo del modulo nel formato salvato (numeri come detti, nessun calcolo)."""
    t = f.get("tipo", "testo")
    if t == "numero":
        v = v if isinstance(v, dict) else {"v": v}
        num = _f(v.get("v", v.get("valore")))
        return {"v": num, "note": str(v.get("note") or "")[:120], "verifica": bool(v.get("verifica", v.get("incerto"))) and num is None}
    if t == "pressione":
        out = []
        for x in v if isinstance(v, list) else []:
            if isinstance(x, dict):
                s, d = _f(x.get("sis", x.get("sistolica"))), _f(x.get("dia", x.get("diastolica")))
                ver = bool(x.get("verifica", x.get("incerto"))) and (s is None or d is None)
                if s is not None or d is not None or ver or (x.get("note") or "").strip():
                    out.append({"sis": s, "dia": d, "note": str(x.get("note") or "")[:120], "verifica": ver})
        return out[:6]
    if t == "scelta":
        return v if v in f.get("opzioni", []) else ""
    if t == "sino":
        return {"si": "sì", "sì": "sì", "no": "no", True: "sì", False: "no"}.get(v.strip().lower() if isinstance(v, str) else v, "")
    if t == "data":
        return v if isinstance(v, str) and re.match(r"^\d{4}-\d{2}-\d{2}$", v) else ""
    s = str(v or "").strip()
    return "" if s.lower() in ("non riportato", "non riportata") else s


def upgrade_note(d: dict) -> dict:
    """Nota in formato precedente (campi pediatrici al primo livello) → base + modulo. Senza perdita di dati, idempotente."""
    d = dict(d)
    legacy = {k: d.pop(k) for k in list(d) if k in LEGACY_KEYS}
    mod = dict(d.get("modulo") or {})
    mid = mod.get("id") or module_for(d.get("specialita") or "")
    own = module_keys(mid)
    campi = {k: "" for k in own if mid == "pediatria"}
    campi.update({k: str(v or "") for k, v in legacy.items() if k in own or str(v or "").strip()})
    campi.update(mod.get("campi") or {})
    if mid in STRUCTURED:
        campi.update({f["key"]: clean_value(f, campi.get(f["key"])) for f in module_fields(mid)})
    d["modulo"] = {**mod, "id": mid, "versione": mod.get("versione") or MODULES.get(mid, MODULES["generale"])["versione"], "campi": campi}
    return d


def _norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def _stem(s: str) -> str:
    return " ".join(w[:-1] if len(w) > 4 and w[-1] in "aeiou" else w for w in _norm(s).split())


def drop_duplicates(fields: list, mid: str) -> list:
    """Campi del modello visita già coperti dalla base o dal modulo (moduli strutturati): non si ripetono."""
    if mid not in STRUCTURED:
        return fields
    taken = {_stem(f["label"]) for f in module_fields(mid) + BASE_FIELDS} | {_stem(x) for x in ("anamnesi fisiologica", "terapia", "diagnosi valutazione", "parametri vitali")}
    def dup(title: str) -> bool:
        return title in taken or any((t in title and len(t) > 10 and len(title) <= len(t) + 12) or (title in t and len(title) > 10) for t in taken)
    return [f for f in fields or [] if not dup(_stem(f.get("titolo")))]


def module_prompt(mid: str, hidden: list) -> str:
    """Istruzioni IA per i moduli strutturati: solo ciò che è stato detto, nessuna interpretazione o calcolo."""
    m = MODULES[mid]
    lines = []
    for f in module_fields(mid):
        if f["key"] in hidden:
            continue
        t = f.get("tipo", "testo")
        fmt = {"testo": "stringa", "numero": f'{{"valore": numero|null, "incerto": true|false, "note": stringa}} ({f.get("unita") or "numero"})',
               "pressione": 'lista di {"sistolica": numero|null, "diastolica": numero|null, "note": stringa, "incerto": true|false} (mmHg), una voce per misurazione',
               "scelta": "uno tra " + ", ".join(f.get("opzioni", [])) + ' oppure ""', "data": '"AAAA-MM-GG" oppure ""', "sino": '"sì", "no" oppure ""'}[t]
        lines.append(f'"{f["key"]}" = {f["label"]}' + (f' ({f["hint"]})' if f.get("hint") else "") + (f' [{f["ai"]}]' if f.get("ai") else "") + f": {fmt}")
    return (f"Modulo {m['nome']}: aggiungi al primo livello del JSON la chiave \"campi\", un oggetto con queste chiavi:\n" + "\n".join(lines) + "\n"
            "e, sempre al primo livello, la chiave altre_voci: lista di {titolo, testo} SOLO per informazioni effettivamente dette in visita che non hanno un campo dedicato (altrimenti lista vuota).\n"
            "Regole del modulo: riporta esclusivamente ciò che è stato detto. Se un'informazione non è stata detta usa \"\" (stringhe) o null (numeri). "
            "Non aggiungere mai diagnosi, ipotesi, interpretazioni, giudizi su valori normali o anomali, punteggi di rischio o suggerimenti. "
            "Non calcolare nulla (nessun indice, nessuna data presunta, nessuna conversione). Se un numero non è chiaro lascia valore null e incerto true. "
            "Le note dei parametri (es. seduto, braccio destro) solo se dette. Ogni informazione va in un solo campo: usa il campo più specifico del modulo "
            "e non ripeterla nei campi base (anamnesi, sintomi, esame obiettivo).\n")


def parse_module(mid: str, data: dict) -> tuple:
    keys = set(module_keys(mid))
    nested = [v for v in data.values() if isinstance(v, dict) and keys & set(v)]
    campi_in = data["campi"] if isinstance(data.get("campi"), dict) else nested[0] if nested else {k: v for k, v in data.items() if k in keys}
    if not data.get("altre_voci") and isinstance(campi_in.get("altre_voci"), list):
        data = {**data, "altre_voci": campi_in["altre_voci"]}
    campi = {f["key"]: clean_value(f, campi_in.get(f["key"])) for f in module_fields(mid)}
    altre = [{"gruppo": "altre_voci", "titolo": str(x["titolo"])[:80], "testo": str(x.get("testo") or ""), "fonte": "ai", "da_verificare": True}
             for x in data.get("altre_voci") or [] if isinstance(x, dict) and str(x.get("titolo") or "").strip() and str(x.get("testo") or "").strip()]
    return campi, altre[:12]


def catalog() -> dict:
    return {"specialita": SPECIALTIES, "base": BASE_FIELDS, "moduli": [{k: v for k, v in m.items() if k != "match"} for m in MODULES.values()]}


# ---------- Impostazioni del medico: modulo in uso, personalizzazioni, voci frequenti ----------
class ChoiceIn(BaseModel):
    choice: str = ""


class PrefsIn(BaseModel):
    module_id: str
    hidden: List[str] = Field(default_factory=list)
    order: List[str] = Field(default_factory=list)


class SuggestionIn(BaseModel):
    titolo: str = Field(min_length=1, max_length=80)
    action: Literal["add", "ignore"]


def build_module_settings(db, tdb, specialty_of, current_owner):
    r = APIRouter(prefix="/settings/module")

    async def user_doc(uid):
        return await db.users.find_one({"_id": ObjectId(uid)}, {"module_choice": 1, "module_prefs": 1, "module_notice_seen_at": 1, "profile": 1}) if uid and ObjectId.is_valid(uid) else None

    async def visit_module_options(uid) -> list:
        """Moduli selezionabili all'inizio della visita: specialità principale, secondarie, Generale."""
        u = await user_doc(uid) or {}
        prof = u.get("profile") or {}
        main = await specialty_of(uid)
        specs = [main] + [x for x in prof.get("secondary_specialties") or [] if x and x != main]
        out = {}
        for sp in specs:
            mid = module_for(sp)
            key = mid if mid != "generale" or sp == main else f"generale|{sp}"  # secondaria senza modulo: cartella Generale con la sua specialità
            out.setdefault(key, {"key": key, "id": mid, "nome": MODULES[mid]["nome"] if key == mid else f"Generale · {sp}", "specialita": sp})
        choice = u.get("module_choice") or ""
        if choice in MODULES:
            out.setdefault(choice, {"key": choice, "id": choice, "nome": MODULES[choice]["nome"], "specialita": main if choice == module_for(main) else MODULES[choice]["nome"]})
        out.setdefault("generale", {"key": "generale", "id": "generale", "nome": "Generale", "specialita": main})
        return list(out.values())

    async def doctor_module(uid) -> str:
        u = await user_doc(uid)
        choice = (u or {}).get("module_choice") or ""
        return choice if choice in MODULES else module_for(await specialty_of(uid))

    async def layout(uid, mid) -> dict:
        p = (((await user_doc(uid)) or {}).get("module_prefs") or {}).get(mid) or {}
        keys = set(module_keys(mid))
        return {"nascosti": [k for k in p.get("hidden") or [] if k in keys], "ordine": [k for k in p.get("order") or [] if k in keys]}

    async def suggestions(uid, mid) -> list:
        if mid not in STRUCTURED:
            return []
        dismissed = {_norm(x) for x in ((((await user_doc(uid)) or {}).get("module_prefs") or {}).get(mid) or {}).get("dismissed") or []}
        have = {_norm(f["titolo"]) async for t in tdb.visit_templates.find({}, {"fields": 1}) for f in t.get("fields") or []}
        from crypto import unseal_fields
        cnt, label = Counter(), {}
        async for c in tdb.consultations.find({"status": "ready"}, {"note": 1}).sort("created_at", -1).limit(40):
            note = unseal_fields(c, ("note",)).get("note") or {}
            if (note.get("modulo") or {}).get("id") != mid:
                continue
            for k in {_norm(x.get("titolo")) for x in note.get("sezioni") or [] if x.get("gruppo") == "altre_voci" and not x.get("da_verificare")}:
                cnt[k] += 1
            label.update({_norm(x.get("titolo")): x.get("titolo") for x in note.get("sezioni") or [] if x.get("gruppo") == "altre_voci"})
        return [{"titolo": label[k], "visite": n} for k, n in cnt.most_common(5) if n >= 3 and k not in dismissed and k not in have]

    @r.get("")
    async def get_settings():
        uid = current_owner()
        u = await user_doc(uid) or {}
        mid = await doctor_module(uid)
        auto = module_for(await specialty_of(uid))
        return {"module_id": mid, "auto": auto, "choice": u.get("module_choice") or "", "nome": MODULES[mid]["nome"],
                "available": [{"id": m["id"], "nome": m["nome"]} for m in MODULES.values()],
                "layout": await layout(uid, mid), "suggestions": await suggestions(uid, mid), "visit_options": await visit_module_options(uid),
                "notice": mid in STRUCTURED and not u.get("module_choice") and not u.get("module_notice_seen_at")}

    @r.put("")
    async def set_choice(body: ChoiceIn):
        if body.choice and body.choice not in MODULES:
            raise HTTPException(400, "Modulo non disponibile")
        await db.users.update_one({"_id": ObjectId(current_owner())}, {"$set": {"module_choice": body.choice, "module_notice_seen_at": datetime.now(timezone.utc).isoformat()}})
        return await get_settings()

    @r.put("/prefs")
    async def set_prefs(body: PrefsIn):
        if body.module_id not in MODULES:
            raise HTTPException(400, "Modulo non disponibile")
        keys = set(module_keys(body.module_id))
        await db.users.update_one({"_id": ObjectId(current_owner())}, {"$set": {
            f"module_prefs.{body.module_id}.hidden": [k for k in body.hidden if k in keys],
            f"module_prefs.{body.module_id}.order": [k for k in body.order if k in keys]}})
        return await get_settings()

    @r.post("/reset")
    async def reset(body: ChoiceIn):
        if body.choice not in MODULES:
            raise HTTPException(400, "Modulo non disponibile")
        await db.users.update_one({"_id": ObjectId(current_owner())}, {"$unset": {f"module_prefs.{body.choice}.hidden": "", f"module_prefs.{body.choice}.order": ""}})
        return await get_settings()

    @r.post("/notice-seen")
    async def notice_seen():
        await db.users.update_one({"_id": ObjectId(current_owner())}, {"$set": {"module_notice_seen_at": datetime.now(timezone.utc).isoformat()}})
        return {"ok": True}

    @r.post("/suggestions")
    async def suggestion(body: SuggestionIn):
        uid = current_owner()
        mid = await doctor_module(uid)
        if body.action == "ignore":
            await db.users.update_one({"_id": ObjectId(uid)}, {"$addToSet": {f"module_prefs.{mid}.dismissed": body.titolo}})
            return await get_settings()
        tpl = await tdb.visit_templates.find_one({"bilancio": None}, sort=[("created_at", 1)])
        if not tpl:
            raise HTTPException(404, "Nessun modello visita da aggiornare")
        import uuid
        field = {"id": uuid.uuid4().hex[:10], "titolo": body.titolo.strip()[:80], "gruppo": "altro", "hint": "", "required": False}
        await tdb.visit_templates.update_one({"_id": tpl["_id"]}, {"$push": {"fields": field}, "$set": {"modified": True, "updated_at": datetime.now(timezone.utc).isoformat()}})
        return {**await get_settings(), "added_to": tpl["name"]}

    @r.get("/layout/{mid}")
    async def get_layout(mid: str):
        if mid not in MODULES:
            raise HTTPException(404, "Modulo non disponibile")
        return await layout(current_owner(), mid)

    return r, doctor_module, layout, visit_module_options
