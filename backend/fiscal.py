"""Regole fiscali della fattura sanitaria: calcoli (bollo, IVA, ritenuta) e diciture obbligatorie."""
import re
from datetime import date

STAMP_THRESHOLD = 77.47
STAMP_DUTY = 2.0
VAT_RATE = 0.22
WITHHOLDING = 0.20
CF_RE = re.compile(r"^[A-Z]{6}[0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$")
METHODS = {"contanti": "Contanti", "carta": "Carta / Bancomat", "bonifico": "Bonifico", "pos": "POS", "online": "Pagamento Digitale / Online"}
VAT_LABELS = {"esente": "Esente art. 10 n. 18 DPR 633/72", "iva22": "IVA 22%"}

N_ESENTE = "Operazione esente IVA ai sensi dell'art. 10, comma 1, n. 18 del D.P.R. 633/1972 (prestazione sanitaria)."
N_FORF = ("Operazione effettuata ai sensi dell'art. 1, commi da 54 a 89, della Legge n. 190/2014 (regime forfettario): "
          "operazione senza applicazione dell'IVA.")
N_FORF_RIT = "Operazione non soggetta a ritenuta alla fonte a titolo di acconto ai sensi dell'art. 1, comma 67, della Legge n. 190/2014."
N_RIT = "Ritenuta d'acconto del 20% ai sensi dell'art. 25 del D.P.R. 600/1973, da versare a cura del committente."
N_CASH = "Pagamento in contanti, non tracciabile: la spesa non potrà essere portata in detrazione (art. 1, comma 679, L. 160/2019)."
N_OPPOSE = "Il paziente si è opposto alla trasmissione dei dati di questa spesa al Sistema Tessera Sanitaria (art. 3 D.M. 31/07/2015)."
N_STS = "I dati di questa spesa saranno trasmessi al Sistema Tessera Sanitaria per la dichiarazione dei redditi precompilata."
N_ANALOG = ("Fattura emessa in formato analogico: per le prestazioni sanitarie verso persone fisiche vige il divieto di fatturazione "
            "elettronica (art. 10-bis D.L. 119/2018).")


def r2(v: float) -> float:
    return round(v + 1e-9, 2)


def compute(lines: list, regime: str, client_type: str, stamp_charge: str) -> dict:
    forf = regime == "forfettario"
    esente = r2(sum(l["amount"] for l in lines if forf or l["vat"] == "esente"))
    imponibile = 0.0 if forf else r2(sum(l["amount"] for l in lines if l["vat"] == "iva22"))
    iva = r2(imponibile * VAT_RATE)
    stamp = STAMP_DUTY if esente > STAMP_THRESHOLD else 0.0
    ritenuta = r2((esente + imponibile) * WITHHOLDING) if not forf and client_type == "azienda" else 0.0
    total = r2(esente + imponibile + iva + (stamp if stamp_charge == "paziente" else 0))
    return {"esente": esente, "imponibile": imponibile, "iva": iva, "stamp": stamp, "stamp_charge": stamp_charge,
            "ritenuta": ritenuta, "total": total, "due": r2(total - ritenuta)}


def notes_for(inv: dict) -> list[str]:
    t, forf = inv["totals"], inv["regime"] == "forfettario"
    out = [N_FORF, N_FORF_RIT] if forf else ([N_ESENTE] if t["esente"] else [])
    if t["ritenuta"]:
        out.append(N_RIT)
    if t["stamp"]:
        how = "in modo virtuale (D.M. 17/06/2014)" if inv["client_type"] == "azienda" else "sull'originale"
        who = "a carico del paziente" if t["stamp_charge"] == "paziente" else "a carico del professionista"
        out.append(f"Imposta di bollo di 2,00 € assolta {how} ai sensi del D.P.R. 642/1972, {who} (importo esente superiore a 77,47 €).")
    if inv["method"] == "contanti":
        out.append(N_CASH)
    if inv["client_type"] == "persona":
        out += ([N_OPPOSE] if inv.get("sts_opposition") else [N_STS] if inv.get("number") else []) + [N_ANALOG]
    return out


def sts_deadline(year: int) -> str:
    return date(year + 1, 2, 1).isoformat()
