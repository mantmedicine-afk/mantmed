"""Modelli Visita: più modelli per medico, ciascuno con campi personalizzati che l'IA compila in refertazione."""
import json
import logging
import re
import uuid
from datetime import datetime, timedelta, timezone
from typing import List, Literal, Optional

from bson import ObjectId
from pymongo.errors import DuplicateKeyError
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
S, O = "sintomi", "altro"
BILANCI = [
    ("1m", "Bilancio di salute · 1° mese", 0, 2, [
        (A, "Gravidanza e parto", "Età gestazionale, tipo di parto, Apgar, peso alla nascita"), (A, "Screening neonatali", "Metabolico esteso, uditivo (OAE), riflesso rosso, eseguiti/esiti"),
        (A, "Ittero e calo ponderale", "Recupero del peso alla nascita"), (A, "Sonno e posizione", "Supina, ambiente libero da fumo"),
        (A, "Profilassi", "Vitamina D, vitamina K"), (E, "Riflesso rosso", ""), (E, "Anche", "Ortolani-Barlow, pieghe, ecografia anche programmata"),
        (E, "Fontanelle e cranio", ""), (E, "Moncone ombelicale e genitali", "Testicoli in sede"), (E, "Riflessi neonatali e tono", "Moro, prensione, suzione"),
        (O, "Benessere materno", "Allattamento, umore, supporto familiare"), (O, "Prevenzione e consigli", "Sicurezza in auto, SIDS, calendario vaccinale")]),
    ("3m", "Bilancio di salute · 3 mesi", 2, 4.5, [
        (A, "Alimentazione e alvo", ""), (A, "Sonno", ""), (A, "Vaccinazioni", "Esavalente, pneumococco, rotavirus, meningococco B"),
        (A, "Tappe dello sviluppo", "Sorriso sociale, controllo del capo, vocalizzi, segue con lo sguardo"), (E, "Esame neurologico e tono", ""),
        (E, "Anche", "Esito ecografia anche"), (E, "Vista e motilità oculare", "Fissazione, inseguimento, riflesso rosso"),
        (E, "Cute", "Dermatite seborroica, angiomi"), (E, "Plagiocefalia", ""), (O, "Prevenzione e consigli", "Tummy time, sicurezza, cadute dal fasciatoio")]),
    ("6m", "Bilancio di salute · 6 mesi", 4.5, 7.5, [
        (A, "Alimentazione complementare", "Inizio, alimenti introdotti, tolleranza"), (A, "Sonno", ""), (A, "Vaccinazioni", ""),
        (A, "Tappe dello sviluppo", "Rotola, sta seduto con appoggio, afferra, lallazione"), (E, "Esame neurologico", ""),
        (E, "Vista", "Riflesso rosso, strabismo, Hirschberg"), (E, "Udito", "Risposta ai suoni, si gira alla voce"),
        (E, "Dentizione", ""), (E, "Anche e arti", ""), (O, "Prevenzione e consigli", "Soffocamento da cibo e piccoli oggetti, seggiolino, schermi")]),
    ("9m", "Bilancio di salute · 9 mesi", 7.5, 10.5, [
        (A, "Alimentazione", "Varietà, consistenze, autonomia"), (A, "Sonno", ""), (A, "Vaccinazioni", ""),
        (A, "Tappe dello sviluppo", "Seduto senza appoggio, gattona, pinza, risponde al nome, angoscia dell'estraneo"),
        (E, "Esame neurologico e postura", ""), (E, "Vista", "Strabismo, cover test"), (E, "Udito e linguaggio", "Lallazione canonica"),
        (E, "Dentizione e igiene orale", ""), (E, "Genitali", "Testicoli in sede"), (O, "Prevenzione e consigli", "Sicurezza domestica, scale, prese, ustioni, lettura ad alta voce")]),
    ("12m", "Bilancio di salute · 12 mesi", 10.5, 15, [
        (A, "Alimentazione", "Latte, pasti in famiglia, ferro"), (A, "Sonno", ""), (A, "Vaccinazioni", "MPRV, meningococco"),
        (A, "Tappe dello sviluppo", "In piedi con appoggio, primi passi, prime parole, indica, gioco del cucù"),
        (E, "Esame neurologico e deambulazione", ""), (E, "Vista", "Riflesso rosso, strabismo"), (E, "Udito e linguaggio", ""),
        (E, "Denti e carie precoci", ""), (E, "Arti inferiori e piedi", ""), (O, "Prevenzione e consigli", "Annegamento, avvelenamenti, seggiolino, schermi"),
        (O, "Segnali di allarme", "Mancato indicare, assenza di risposta al nome")]),
    ("18m", "Bilancio di salute · 18 mesi", 15, 21, [
        (A, "Alimentazione e autonomia", ""), (A, "Sonno e routine", ""), (A, "Vaccinazioni", ""),
        (A, "Tappe dello sviluppo", "Cammina da solo, almeno 5-10 parole, indica per condividere, gioco simbolico"),
        (E, "Screening autismo (M-CHAT-R)", "Punteggio ed esito"), (E, "Deambulazione e motricità", ""), (E, "Vista", ""),
        (E, "Udito e linguaggio", ""), (E, "Denti e igiene orale", "Fluoro, spazzolino"), (O, "Prevenzione e consigli", "Sicurezza, limitare schermi, lettura condivisa")]),
    ("2-3a", "Bilancio di salute · 2-3 anni", 21, 42, [
        (A, "Alimentazione", "Frutta e verdura, bevande zuccherate"), (A, "Sonno", ""), (A, "Controllo sfinterico", ""), (A, "Vaccinazioni", ""),
        (A, "Linguaggio e relazione", "Frasi di 2-3 parole, comprensione, gioco con coetanei, inserimento al nido"),
        (V, "BMI e curva di crescita", "Rischio sovrappeso"), (E, "Vista", "Ambliopia, strabismo, test di stereopsi"),
        (E, "Udito", ""), (E, "Denti e carie", ""), (E, "Motricità", "Corre, salta, scale"), (O, "Prevenzione e consigli", "Movimento quotidiano, schermi < 1 ora, sicurezza in auto")]),
    ("5-6a", "Bilancio di salute · 5-6 anni", 42, 84, [
        (A, "Alimentazione e stile di vita", "Colazione, movimento, schermi"), (A, "Sonno", ""), (A, "Scuola e socialità", "Prerequisiti scolastici, comportamento"),
        (A, "Vaccinazioni", "Richiamo DTPa-IPV, MPRV"), (V, "Pressione arteriosa", "mmHg con percentile per età e statura"), (V, "BMI e curva di crescita", ""),
        (E, "Acuità visiva", "Ottotipo OD / OS"), (E, "Udito", ""), (E, "Linguaggio e articolazione", ""), (E, "Postura e piedi", ""),
        (E, "Denti e malocclusioni", ""), (O, "Prevenzione e consigli", "Sicurezza stradale, bici con casco, nuoto")]),
    ("8-10a", "Bilancio di salute · 8-10 anni", 84, 132, [
        (A, "Alimentazione e attività fisica", "Sport, sedentarietà, schermi"), (A, "Sonno", ""), (A, "Rendimento scolastico", "Difficoltà di apprendimento, attenzione"),
        (A, "Benessere emotivo e relazioni", "Bullismo, ansia"), (V, "Pressione arteriosa", "mmHg con percentile"), (V, "BMI e curva di crescita", ""),
        (E, "Acuità visiva", ""), (E, "Colonna vertebrale", "Test di Adams, scoliosi"), (E, "Stadio puberale (Tanner)", "Segni di pubertà precoce"),
        (E, "Denti e ortodonzia", ""), (O, "Prevenzione e consigli", "Uso di internet e dispositivi, sicurezza, alimentazione sana")]),
    ("11-14a", "Bilancio di salute · 11-14 anni (adolescenza)", 132, 216, [
        (A, "Alimentazione e immagine corporea", "Diete, segnali di disturbi alimentari"), (A, "Attività fisica e sonno", ""),
        (A, "Scuola, relazioni e uso dei social", ""), (A, "Fattori di rischio", "Fumo, alcol, sostanze (colloquio riservato)"),
        (A, "Benessere psicologico", "Umore, ansia, autolesionismo"), (A, "Vaccinazioni", "HPV, dTpa-IPV, meningococco ACWY"),
        (V, "Pressione arteriosa", "mmHg con percentile"), (V, "BMI e curva di crescita", ""), (E, "Stadio puberale (Tanner)", ""),
        (E, "Colonna vertebrale", "Test di Adams"), (E, "Acuità visiva", ""), (E, "Cute", "Acne"), (O, "Educazione alla salute", "Affettività e sessualità, sicurezza online, guida")]),
]
R = True  # campo obbligatorio
GROWTH = [(V, "Peso", "kg e percentile", R), (V, "Lunghezza", "cm e percentile", R), (V, "Circonferenza cranica", "cm e percentile", R)]
BILANCIO_END = [(O, "Valutazione complessiva", "Crescita e sviluppo", R), (O, "Indicazioni ai genitori", "", R), (O, "Prossimo bilancio", "")]
EARLY = {"1m", "3m", "6m", "9m", "12m", "18m"}


def bilancio_rows(key, rows):
    """Bilanci 1-18 mesi: crescita subito dopo l'anamnesi; tutti: valutazione e indicazioni in fondo."""
    rows = list(rows)
    if key in EARLY:
        cut = max((i + 1 for i, r in enumerate(rows) if r[0] == A), default=0)
        rows = rows[:cut] + GROWTH + rows[cut:]
    return rows + BILANCIO_END


PRIMA_PED_HEAD = [(S, "Motivo della visita", "", R), (A, "Anamnesi familiare", ""), (A, "Anamnesi fisiologica", "Gravidanza, parto, allattamento"),
                  (A, "Anamnesi patologica remota", "")]
PRIMA_PED_END = [(O, "Diagnosi/Valutazione", "", R), (O, "Terapia", ""), (O, "Indicazioni ai genitori", "", R)]

EXTRA = {
    "acuta": ("Malattia acuta", [
        (S, "Sintomo principale, esordio e durata", "", R), (S, "Febbre", "Massima, durata, antipiretici"), (S, "Altri sintomi", ""),
        (A, "Alimentazione, idratazione e diuresi", "", R), (A, "Contatti con malati", ""), (A, "Farmaci già assunti", ""),
        (V, "Temperatura, FC, FR e SpO2", ""), (V, "Peso", "kg"), (E, "Condizioni generali e idratazione", "", R), (E, "Orecchie e faringe", "Otoscopia, faringe"),
        (E, "Torace e auscultazione", ""), (E, "Addome", ""), (O, "Test rapidi", "Strepto test, PCR, stick urine"), (O, "Diagnosi", "", R),
        (O, "Terapia", "Dose mg/kg, durata"), (O, "Segni di allarme spiegati ai genitori", "", R), (O, "Ricontrollo", "")]),
    "controllo": ("Controllo", [
        (S, "Motivo e riferimento alla visita precedente", "", R), (S, "Evoluzione dei sintomi", "", R), (A, "Aderenza alla terapia ed effetti collaterali", ""),
        (V, "Parametri utili", ""), (E, "Esame obiettivo mirato", "", R), (O, "Esiti degli esami", ""),
        (O, "Valutazione", "Guarito / in miglioramento / invariato / peggiorato", R), (O, "Modifica della terapia", ""), (O, "Prossimo controllo", "")]),
    "certificato": ("Certificato sportivo non agonistico", [
        (A, "Anamnesi personale e familiare cardiologica", "", R), (V, "Peso e altezza", ""), (V, "Pressione arteriosa", "mmHg", R),
        (V, "Frequenza cardiaca", "bpm", R), (E, "Auscultazione cardiaca", "", R), (E, "ECG a riposo", ""),
        (O, "Esito", "Idoneo / non idoneo / da approfondire", R), (O, "Validità", "")]),
}
TEMPLATES_VERSION = 2

GENERIC = [(A, "Anamnesi patologica remota", ""), (A, "Farmaci in uso", ""), (A, "Allergie", ""), (V, "Pressione arteriosa", "mmHg"),
           (V, "Frequenza cardiaca", "bpm"), (V, "Peso e BMI", ""), (E, "Esame obiettivo generale", ""), (E, "Esame obiettivo di distretto", ""),
           (E, "Esami strumentali", "")]


class TField(BaseModel):
    id: str = Field(default_factory=lambda: uuid.uuid4().hex[:10])
    titolo: str
    gruppo: Literal["anamnesi", "sintomi", "parametri_vitali", "esame_obiettivo", "altro"] = "esame_obiettivo"
    hint: str = ""
    required: bool = False

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
    return [TField(titolo=r[1], gruppo=r[0], hint=r[2], required=len(r) > 3 and r[3]).model_dump() for r in rows]


def prima_rows(rows):
    """Prima visita pediatrica: motivo e anamnesi all'inizio, peso/altezza nei parametri, valutazione in fondo."""
    have = {r[1].lower() for r in rows}
    head = [r for r in PRIMA_PED_HEAD if r[1].lower() not in have]
    body = list(rows)
    cut = max((i + 1 for i, r in enumerate(body) if r[0] == V), default=len(body))
    body = body[:cut] + [(V, "Peso e altezza con percentili", "")] + body[cut:]
    return head + body + PRIMA_PED_END


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
            return _mk(prima_rows(rows) if re.search(r"pediatr|neonatolog", spec or "", re.I) else rows)
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
        kind = d.get("kind") or ("prima" if d.get("seed") or (d.get("name") == "Prima visita" and not d.get("bilancio")) else None)
        return {"id": str(d["_id"]), "name": d["name"], "fields": d.get("fields") or [], "updated_at": d.get("updated_at"),
                "bilancio": d.get("bilancio"), "age_from": d.get("age_from"), "age_to": d.get("age_to"), "kind": kind,
                "pending_fields": d.get("pending_fields") or []}

    def untouched(d) -> bool:
        return not d.get("modified") and d.get("updated_at") == d.get("created_at")

    def same_fields(a, b) -> bool:
        k = lambda xs: [(f.get("titolo"), f.get("gruppo"), f.get("hint", "")) for f in xs or []]  # noqa: E731
        return k(a) == k(b)

    async def base_for(d, spec) -> Optional[list]:
        if d.get("bilancio"):
            row = next((x for x in BILANCI if x[0] == d["bilancio"]), None)
            return _mk(bilancio_rows(row[0], row[4])) if row else None
        kind = d.get("kind") or ("prima" if d.get("seed") or (d.get("name") == "Prima visita" and not d.get("bilancio")) else None)
        if kind in EXTRA:
            return _mk(EXTRA[kind][1])
        return await base_fields(spec) if kind == "prima" else None

    async def upgrade_once():
        """Versione 2 dei modelli: aggiorna i non modificati, propone i nuovi campi agli altri, aggiunge i nuovi modelli."""
        owner = OWNER.get()
        if not ObjectId.is_valid(owner):
            return
        won = await db.users.find_one_and_update({"_id": ObjectId(owner), "$or": [{"templates_v": {"$exists": False}}, {"templates_v": {"$lt": TEMPLATES_VERSION}}]},
                                                 {"$set": {"templates_v": TEMPLATES_VERSION}})
        if not won:
            return
        spec = await specialty_of(owner)
        docs = await tdb.visit_templates.find().to_list(None)
        old_prima = next((d for d in docs if d.get("seed") or (d.get("name") == "Prima visita" and not d.get("bilancio"))), None)
        old_prima_fields = list(old_prima.get("fields") or []) if old_prima else None
        for d in docs:
            base = await base_for(d, spec)
            if not base:
                continue
            if untouched(d):
                await tdb.visit_templates.update_one({"_id": d["_id"]}, {"$set": {"fields": base}})
                continue
            have = {(f.get("titolo") or "").strip().lower() for f in d.get("fields") or []}
            added = [f for f in base if f["titolo"].lower() not in have]
            if added:
                await tdb.visit_templates.update_one({"_id": d["_id"]}, {"$set": {"pending_fields": added}})
        for d in docs:  # «Nuovo modello» identico alla Prima visita e mai modificato
            if d is not old_prima and not d.get("bilancio") and not d.get("kind") and d.get("name") == "Nuovo modello" and untouched(d) \
                    and old_prima_fields is not None and same_fields(d.get("fields"), old_prima_fields):
                await tdb.visit_templates.delete_one({"_id": d["_id"]})
        now = datetime.now(timezone.utc)
        for i, (kind, (name, rows)) in enumerate(EXTRA.items()):
            if not any(d.get("kind") == kind for d in docs):
                ts = (now.replace(microsecond=0) + timedelta(seconds=1 + i)).isoformat()
                await tdb.visit_templates.insert_one({"name": name, "fields": _mk(rows), "kind": kind, "created_at": ts, "updated_at": ts})

    async def import_bilanci(keys=None) -> int:
        await db.visit_templates.create_index([("owner_id", 1), ("bilancio", 1)], unique=True, name="owner_bilancio",
                                              partialFilterExpression={"bilancio": {"$type": "string"}})
        now = datetime.now(timezone.utc)
        n = 0
        for i, (key, name, a, b, rows) in enumerate(BILANCI):
            if keys is not None and key not in keys:
                continue
            ts = (now.replace(microsecond=0) + timedelta(seconds=1 + i)).isoformat()
            try:
                res = await tdb.visit_templates.update_one({"bilancio": key}, {"$setOnInsert": {
                    "name": name, "fields": _mk(bilancio_rows(key, rows)), "bilancio": key, "age_from": a, "age_to": b, "created_at": ts, "updated_at": ts}}, upsert=True)
                n += bool(res.upserted_id)
            except DuplicateKeyError:
                pass
        return n

    async def seed_bilanci_once():
        """Prima volta per ogni pediatra: importa i bilanci; quelli eliminati non vengono ricreati."""
        owner = OWNER.get()
        if not ObjectId.is_valid(owner) or not re.search(r"pediatr|neonatolog", await specialty_of(owner), re.I):
            return
        won = await db.users.find_one_and_update({"_id": ObjectId(owner), "bilanci_seeded_at": {"$exists": False}},
                                                 {"$set": {"bilanci_seeded_at": datetime.now(timezone.utc).isoformat()}})
        if won:
            await import_bilanci()

    async def ensure() -> list:
        if not await tdb.visit_templates.count_documents({}):
            await db.visit_templates.create_index([("owner_id", 1), ("seed", 1)], unique=True, partialFilterExpression={"seed": True})
            now = datetime.now(timezone.utc).isoformat()
            doc = {"name": "Prima visita", "fields": await base_fields(await specialty_of(OWNER.get())), "created_at": now, "updated_at": now}
            try:
                await tdb.visit_templates.update_one({"seed": True}, {"$setOnInsert": doc}, upsert=True)
            except Exception:
                logger.info("Modello iniziale già creato da una richiesta concorrente")
        await seed_bilanci_once()
        await upgrade_once()
        docs = await tdb.visit_templates.find().sort("created_at", 1).to_list(None)
        return sorted(docs, key=lambda d: (bool(d.get("bilancio")), d.get("age_from") or 0))

    @r.get("/bilanci")
    async def bilanci_library():
        have = {d["bilancio"] async for d in tdb.visit_templates.find({"bilancio": {"$ne": None}}, {"bilancio": 1})}
        return [{"key": k, "name": n, "age_from": a, "age_to": b, "fields": _mk(bilancio_rows(k, rows)), "imported": k in have} for k, n, a, b, rows in BILANCI]

    class BilanciIn(BaseModel):
        keys: List[str]

    @r.post("/bilanci")
    async def add_bilanci(body: BilanciIn):
        return {"imported": await import_bilanci(set(body.keys)), "templates": [out(d) for d in await ensure()]}

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
    async def base(kind: Optional[str] = None):
        spec = await specialty_of(OWNER.get())
        if kind in EXTRA:
            return {"specialty": EXTRA[kind][0], "fields": _mk(EXTRA[kind][1])}
        return {"specialty": spec, "fields": await base_fields(spec)}

    class PendingIn(BaseModel):
        action: Literal["add", "ignore"]

    @r.post("/{tid}/pending")
    async def pending(tid: str, body: PendingIn):
        d = await get_one(tid)
        upd = {"pending_fields": []}
        if body.action == "add":
            upd.update(fields=(d.get("fields") or []) + (d.get("pending_fields") or []), modified=True, updated_at=datetime.now(timezone.utc).isoformat())
        await tdb.visit_templates.update_one({"_id": ObjectId(tid)}, {"$set": upd})
        return out(await get_one(tid))

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
        upd = {"name": body.name, "updated_at": datetime.now(timezone.utc).isoformat(), "modified": True}
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
