"""Modelli Visita: più modelli per medico, ciascuno con campi personalizzati che l'IA compila in refertazione."""
import json
import logging
import re
import uuid
from datetime import datetime, timezone
from typing import List, Literal, Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator

logger = logging.getLogger(__name__)
GROUPS = ("anamnesi", "sintomi", "parametri_vitali", "esame_obiettivo", "altro")
GROUP_LABEL = {"anamnesi": "Anamnesi mirata", "sintomi": "Motivo e sintomi", "parametri_vitali": "Parametri vitali",
               "esame_obiettivo": "Esame obiettivo", "altro": "Accertamenti e altro"}

A, V, E = "anamnesi", "parametri_vitali", "esame_obiettivo"
LIBRARY = [
    (r"pediatr|neonatolog", [(A, "Vaccinazioni", "Calendario vaccinale, richiami mancanti"), (A, "Sviluppo psicomotorio", "Tappe raggiunte per età"),
                             (A, "Allergie e intolleranze", "Farmaci, alimenti, ambientali"), (V, "Temperatura corporea", "°C, sede di misurazione"),
                             (V, "Frequenza cardiaca", "bpm"), (V, "Frequenza respiratoria e SpO2", "atti/min, % in aria ambiente"),
                             (E, "Cute e mucose", "Colorito, idratazione, esantemi"), (E, "Apparato muscolo-scheletrico", "Anche, colonna, piedi"),
                             (E, "Esame neurologico", "Tono, riflessi, comportamento")]),
    (r"cardio", [(A, "Fattori di rischio cardiovascolare", "Fumo, ipertensione, diabete, dislipidemia, familiarità"), (A, "Farmaci cardiologici in uso", ""),
                 (A, "Sintomi cardiologici", "Dolore toracico, dispnea, palpitazioni, sincope, classe NYHA"), (V, "Pressione arteriosa", "mmHg, braccio dx/sx"),
                 (V, "Frequenza cardiaca e ritmo", "bpm, regolare/irregolare"), (V, "Saturazione O2", "%"),
                 (E, "Auscultazione cardiaca", "Toni, soffi, sfregamenti"), (E, "Polsi periferici ed edemi", ""),
                 (E, "ECG", "Ritmo, asse, conduzione, ripolarizzazione"), (E, "Ecocardiogramma", "FE, cinetica, valvole")]),
    (r"ortop|traumatolog|fisiatr", [(A, "Dinamica del trauma / esordio", ""), (A, "Dolore", "Sede, irradiazione, scala NRS, orario"),
                                    (A, "Limitazioni funzionali", "Attività quotidiane, sport, lavoro"), (V, "Peso e BMI", ""),
                                    (E, "Ispezione", "Deformità, tumefazioni, atteggiamento"), (E, "Palpazione", "Punti dolorosi, versamento"),
                                    (E, "Range of motion", "Articolare attivo e passivo, gradi"), (E, "Test specifici", "Lachman, McMurray, Neer, Lasègue…"),
                                    (E, "Esame neurovascolare distale", ""), (E, "Imaging", "RX, RM, ecografia")]),
    (r"dermat", [(A, "Storia della lesione", "Comparsa, evoluzione, prurito, sanguinamento"), (A, "Fototipo ed esposizione solare", "Scottature, lampade"),
                 (A, "Familiarità per melanoma / dermatosi", ""), (A, "Trattamenti topici e sistemici precedenti", ""),
                 (E, "Sede e distribuzione", ""), (E, "Morfologia delle lesioni", "Lesione elementare, colore, margini, dimensioni"),
                 (E, "Dermatoscopia", "Pattern, criteri ABCDE"), (E, "Annessi cutanei e mucose", "Unghie, capelli, mucose"),
                 (E, "Mappatura nevi", "Lesioni da monitorare")]),
    (r"otorino|orl\b", [(A, "Sintomi otologici", "Ipoacusia, acufeni, otalgia, otorrea, vertigini"), (A, "Sintomi rinosinusali", "Ostruzione, rinorrea, iposmia"),
                        (A, "Sintomi faringo-laringei", "Disfonia, disfagia, russamento"), (V, "Temperatura corporea", ""),
                        (E, "Otoscopia", "CUE, membrana timpanica"), (E, "Rinoscopia anteriore", "Setto, turbinati, secrezioni"),
                        (E, "Orofaringoscopia", "Tonsille, palato, base lingua"), (E, "Laringoscopia", "Corde vocali, motilità"),
                        (E, "Collo e linfonodi", ""), (E, "Esame audiometrico / impedenzometrico", "")]),
    (r"neurol", [(A, "Esordio e decorso dei sintomi", ""), (A, "Cefalea", "Tipo, frequenza, durata, aura"), (A, "Eventi critici", "Crisi, perdita di coscienza, TIA"),
                 (V, "Pressione arteriosa", "mmHg"), (E, "Stato di coscienza e funzioni cognitive", "MMSE se eseguito"),
                 (E, "Nervi cranici", ""), (E, "Forza e tono muscolare", "Scala MRC"), (E, "Riflessi osteotendinei", ""),
                 (E, "Sensibilità", ""), (E, "Coordinazione, equilibrio e marcia", "Romberg, prove indice-naso")]),
    (r"ginec|ostetr", [(A, "Anamnesi mestruale", "Menarca, ciclo, ultima mestruazione"), (A, "Anamnesi ostetrica", "Gravidanze, parti, aborti"),
                       (A, "Contraccezione e screening", "Pap test, HPV, mammografia"), (V, "Pressione arteriosa", "mmHg"), (V, "Peso e BMI", ""),
                       (E, "Esame mammario", ""), (E, "Ispezione genitali esterni", ""), (E, "Esame con speculum", "Collo, secrezioni"),
                       (E, "Esplorazione bimanuale", "Utero, annessi"), (E, "Ecografia pelvica / transvaginale", "")]),
    (r"gastro|epatolog", [(A, "Abitudini alimentari e alvo", "Frequenza, consistenza, sangue"), (A, "Sintomi digestivi", "Pirosi, dolore, nausea, calo ponderale"),
                          (A, "Farmaci gastrolesivi e alcol", ""), (V, "Peso e variazioni ponderali", ""), (V, "Pressione arteriosa e FC", ""),
                          (E, "Ispezione addome", ""), (E, "Palpazione addome", "Dolorabilità, masse, Blumberg, Murphy"),
                          (E, "Fegato e milza", "Margine, dimensioni"), (E, "Esplorazione rettale", ""), (E, "Endoscopia / ecografia", "")]),
    (r"endocrin|diabet", [(A, "Storia della malattia metabolica", "Esordio, terapie, complicanze"), (A, "Alimentazione e attività fisica", ""),
                          (A, "Sintomi tiroidei / metabolici", "Astenia, palpitazioni, poliuria, polidipsia"), (V, "Pressione arteriosa", ""),
                          (V, "Peso, BMI e circonferenza vita", ""), (V, "Glicemia capillare", "mg/dl"), (E, "Tiroide", "Palpazione, noduli"),
                          (E, "Piede diabetico", "Sensibilità, polsi, lesioni"), (E, "Esami ematochimici", "HbA1c, TSH, profilo lipidico")]),
    (r"pneumo", [(A, "Tosse ed espettorato", ""), (A, "Dispnea", "Scala mMRC"), (A, "Esposizione a fumo e inquinanti", "Pack-years, professione"),
                 (V, "Saturazione O2", "% a riposo / sotto sforzo"), (V, "Frequenza respiratoria", ""), (V, "Frequenza cardiaca", ""),
                 (E, "Ispezione torace", ""), (E, "Auscultazione polmonare", "MV, rantoli, sibili"), (E, "Spirometria", "FEV1, FVC, Tiffeneau"),
                 (E, "Imaging toracico", "")]),
    (r"urolog|androlog", [(A, "Sintomi urinari", "LUTS, IPSS, disuria, ematuria"), (A, "Anamnesi sessuale", ""), (A, "Calcolosi / infezioni pregresse", ""),
                          (V, "Pressione arteriosa", ""), (E, "Addome e logge renali", "Giordano"), (E, "Genitali esterni", ""),
                          (E, "Esplorazione rettale prostatica", ""), (E, "Ecografia apparato urinario", ""), (E, "PSA ed esame urine", "")]),
    (r"oculist|oftalm", [(A, "Disturbi visivi", "Calo visus, diplopia, miodesopsie"), (A, "Uso di lenti / chirurgia pregressa", ""),
                         (A, "Patologie sistemiche correlate", "Diabete, ipertensione"), (V, "Acuità visiva", "OD / OS, naturale e corretta"),
                         (V, "Tonometria", "mmHg OD / OS"), (E, "Biomicroscopia segmento anteriore", ""), (E, "Fundus oculi", ""),
                         (E, "Motilità oculare", ""), (E, "Riflessi pupillari", ""), (E, "OCT / campo visivo", "")]),
    (r"reumat", [(A, "Dolore e rigidità articolare", "Sede, durata della rigidità mattutina"), (A, "Sintomi sistemici", "Febbre, astenia, Raynaud"),
                 (A, "Terapie in corso", "DMARD, biologici, steroidi"), (V, "Pressione arteriosa", ""), (V, "Peso", ""),
                 (E, "Articolazioni tumefatte e dolenti", "Conteggio"), (E, "Colonna e sacroiliache", ""), (E, "Cute e annessi", ""),
                 (E, "Indici di attività", "DAS28, BASDAI"), (E, "Esami di laboratorio", "VES, PCR, autoanticorpi")]),
]
GENERIC = [(A, "Anamnesi patologica remota", ""), (A, "Farmaci in uso", ""), (A, "Allergie", ""), (V, "Pressione arteriosa", "mmHg"),
           (V, "Frequenza cardiaca", "bpm"), (V, "Peso e BMI", ""), (E, "Esame obiettivo generale", ""), (E, "Esame obiettivo di distretto", ""),
           (E, "Esami strumentali", "")]


class TField(BaseModel):
    id: str = Field(default_factory=lambda: uuid.uuid4().hex[:10])
    titolo: str
    gruppo: Literal["anamnesi", "sintomi", "parametri_vitali", "esame_obiettivo", "altro"] = "esame_obiettivo"
    hint: str = ""

    @field_validator("titolo")
    @classmethod
    def _t(cls, v):
        v = (v or "").strip()
        if not v:
            raise ValueError("Ogni campo deve avere un titolo")
        return v[:80]

    @field_validator("hint")
    @classmethod
    def _h(cls, v):
        return (v or "").strip()[:200]


class TemplateIn(BaseModel):
    name: str
    fields: Optional[List[TField]] = None

    @field_validator("name")
    @classmethod
    def _n(cls, v):
        v = (v or "").strip()
        if not v:
            raise ValueError("Il nome del modello è obbligatorio")
        return v[:60]


def _mk(rows):
    return [TField(titolo=t, gruppo=g, hint=h).model_dump() for g, t, h in rows]


def library_for(spec: str):
    for pat, rows in LIBRARY:
        if re.search(pat, spec or "", re.I):
            return rows
    return None


def fields_prompt(fields: list) -> str:
    """Istruzioni per l'IA: un valore per ogni campo del modello, chiave = posizione."""
    lines = "\n".join(f'"{i + 1}" = {f["titolo"]} [{GROUP_LABEL.get(f["gruppo"], f["gruppo"])}]' + (f' (indicazioni: {f["hint"]})' if f.get("hint") else "")
                      for i, f in enumerate(fields))
    return ("campi_modello: oggetto JSON con ESATTAMENTE queste chiavi, una per ogni campo del modello di visita scelto dal medico:\n" + lines +
            "\nPer ogni chiave scrivi il contenuto clinico estratto dalla trascrizione pertinente a quel campo (valori numerici con unità di misura), "
            "oppure 'Non riportato'. Non duplicare nei campi del modello contenuti già scritti negli altri campi principali.\n")


def map_fields(fields: list, data) -> list:
    vals = data if isinstance(data, dict) else {str(i + 1): v for i, v in enumerate(data or [])} if isinstance(data, list) else {}
    by_title = {str(k).strip().lower(): v for k, v in vals.items()}
    out = []
    for i, f in enumerate(fields):
        v = vals.get(str(i + 1), by_title.get(f["titolo"].lower()))
        if isinstance(v, dict):
            v = v.get("testo") or v.get("valore") or ""
        out.append({"gruppo": f["gruppo"], "titolo": f["titolo"][:80], "testo": str(v).strip() if v not in (None, "") else "Non riportato"})
    return out


def build_visit_templates(db, tdb, specialty_of, llm_json):
    r = APIRouter(prefix="/visit-templates")
    from tenancy import OWNER

    async def base_fields(spec: str) -> list:
        rows = library_for(spec)
        if rows:
            return _mk(rows)
        key = spec.strip().lower()
        cached = await db.visit_template_bases.find_one({"spec": key})
        if cached:
            return [TField(**{k: f[k] for k in ("titolo", "gruppo", "hint")}).model_dump() for f in cached["fields"]]
        try:
            data = await llm_json(
                f"Sei un medico specialista in {spec}. Proponi il modello di cartella per una prima visita di {spec}: da 8 a 10 campi specifici "
                "divisi tra anamnesi mirata, parametri vitali ed esame obiettivo di branca (con manovre, scale o esami tipici). "
                'Rispondi SOLO con JSON: {"campi": [{"titolo": "...", "gruppo": "anamnesi"|"parametri_vitali"|"esame_obiettivo", "hint": "breve indicazione"}]}')
            rows = [(f.get("gruppo") if f.get("gruppo") in GROUPS else E, str(f.get("titolo") or "").strip(), str(f.get("hint") or ""))
                    for f in (data.get("campi") or []) if isinstance(f, dict) and str(f.get("titolo") or "").strip()][:12]
            if len(rows) >= 5:
                fields = _mk(rows)
                await db.visit_template_bases.update_one({"spec": key}, {"$set": {"fields": fields}}, upsert=True)
                return fields
        except Exception:
            logger.exception("Modello base IA non generato per %s", spec)
        return _mk(GENERIC)

    def out(d):
        return {"id": str(d["_id"]), "name": d["name"], "fields": d.get("fields") or [], "updated_at": d.get("updated_at")}

    async def ensure() -> list:
        docs = await tdb.visit_templates.find().sort("created_at", 1).to_list(None)
        if docs:
            return docs
        await db.visit_templates.create_index([("owner_id", 1), ("seed", 1)], unique=True, partialFilterExpression={"seed": True})
        now = datetime.now(timezone.utc).isoformat()
        doc = {"name": "Prima visita", "fields": await base_fields(await specialty_of(OWNER.get())), "created_at": now, "updated_at": now}
        try:
            await tdb.visit_templates.update_one({"seed": True}, {"$setOnInsert": doc}, upsert=True)
        except Exception:
            logger.info("Modello iniziale già creato da una richiesta concorrente")
        return await tdb.visit_templates.find().sort("created_at", 1).to_list(None)

    async def resolve(tid: Optional[str]) -> Optional[dict]:
        """Modello scelto per la visita (o il primo del medico): {id, name, fields}."""
        docs = await ensure()
        doc = next((d for d in docs if tid and str(d["_id"]) == tid), docs[0])
        return out(doc)

    async def get_one(tid: str):
        d = await tdb.visit_templates.find_one({"_id": ObjectId(tid)}) if ObjectId.is_valid(tid) else None
        if not d:
            raise HTTPException(404, "Modello non trovato")
        return d

    @r.get("")
    async def list_templates():
        return [out(d) for d in await ensure()]

    @r.get("/base")
    async def base():
        spec = await specialty_of(OWNER.get())
        return {"specialty": spec, "fields": await base_fields(spec)}

    @r.post("")
    async def create(body: TemplateIn):
        now = datetime.now(timezone.utc).isoformat()
        fields = [f.model_dump() for f in body.fields] if body.fields is not None else await base_fields(await specialty_of(OWNER.get()))
        doc = {"name": body.name, "fields": fields, "created_at": now, "updated_at": now}
        res = await tdb.visit_templates.insert_one(doc)
        return out({**doc, "_id": res.inserted_id})

    @r.put("/{tid}")
    async def update(tid: str, body: TemplateIn):
        await get_one(tid)
        upd = {"name": body.name, "updated_at": datetime.now(timezone.utc).isoformat()}
        if body.fields is not None:
            upd["fields"] = [f.model_dump() for f in body.fields]
        await tdb.visit_templates.update_one({"_id": ObjectId(tid)}, {"$set": upd})
        return out(await get_one(tid))

    @r.delete("/{tid}")
    async def delete(tid: str):
        await get_one(tid)
        if await tdb.visit_templates.count_documents({}) <= 1:
            raise HTTPException(400, "Serve almeno un modello di visita: crei un altro modello prima di eliminare questo")
        await tdb.visit_templates.delete_one({"_id": ObjectId(tid)})
        return {"ok": True}

    return r, resolve


def parse_json(raw: str) -> dict:
    m = re.search(r"\{.*\}", raw or "", re.S)
    return json.loads(m.group(0)) if m else {}
