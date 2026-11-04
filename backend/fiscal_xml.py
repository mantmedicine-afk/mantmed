"""File XML in SIMULAZIONE: fattura elettronica FatturaPA (FPR12) per lo SdI e comunicazione spese al Sistema Tessera Sanitaria."""
import xml.etree.ElementTree as ET

MP = {"contanti": "MP01", "bonifico": "MP05", "carta": "MP08", "pos": "MP08", "online": "MP08"}


def _sub(parent, tag, text=None):
    el = ET.SubElement(parent, tag)
    if text is not None:
        el.text = str(text)
    return el


def _path(parent, spec: dict):
    for k, v in spec.items():
        if v in (None, ""):
            continue
        if isinstance(v, dict):
            _path(_sub(parent, k), v)
        else:
            _sub(parent, k, v)


def _xml(root) -> bytes:
    ET.indent(root)
    return b'<?xml version="1.0" encoding="UTF-8"?>\n' + ET.tostring(root, encoding="utf-8")


def fattura_pa(inv: dict, billing: dict, progressive: str) -> bytes:
    t, c, forf = inv["totals"], inv.get("company") or {}, inv["regime"] == "forfettario"
    root = ET.Element("p:FatturaElettronica", {"versione": "FPR12", "xmlns:p": "http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2"})
    head = _sub(root, "FatturaElettronicaHeader")
    _path(head, {"DatiTrasmissione": {"IdTrasmittente": {"IdPaese": "IT", "IdCodice": billing.get("tax_code")}, "ProgressivoInvio": progressive,
                                      "FormatoTrasmissione": "FPR12", "CodiceDestinatario": c.get("sdi_code") or "0000000", "PECDestinatario": None if c.get("sdi_code") else c.get("pec")},
                 "CedentePrestatore": {"DatiAnagrafici": {"IdFiscaleIVA": {"IdPaese": "IT", "IdCodice": billing.get("vat_number")}, "CodiceFiscale": billing.get("tax_code"),
                                                          "Anagrafica": {"Denominazione": billing.get("holder")}, "RegimeFiscale": "RF19" if forf else "RF01"},
                                       "Sede": {"Indirizzo": billing.get("address"), "Nazione": "IT"}},
                 "CessionarioCommittente": {"DatiAnagrafici": {"IdFiscaleIVA": {"IdPaese": "IT", "IdCodice": c.get("vat")} if c.get("vat") else None,
                                                               "CodiceFiscale": c.get("cf"), "Anagrafica": {"Denominazione": c.get("name")}},
                                            "Sede": {"Indirizzo": c.get("address"), "Nazione": "IT"}}})
    body = _sub(root, "FatturaElettronicaBody")
    gen = {"TipoDocumento": "TD01", "Divisa": "EUR", "Data": inv["date"], "Numero": inv["number"]}
    if t["ritenuta"]:
        gen["DatiRitenuta"] = {"TipoRitenuta": "RT01", "ImportoRitenuta": f"{t['ritenuta']:.2f}", "AliquotaRitenuta": "20.00", "CausalePagamento": "A"}
    if t["stamp"]:
        gen["DatiBollo"] = {"BolloVirtuale": "SI", "ImportoBollo": f"{t['stamp']:.2f}"}
    gen["ImportoTotaleDocumento"] = f"{t['total']:.2f}"
    _path(_sub(body, "DatiGenerali"), {"DatiGeneraliDocumento": gen})
    beni = _sub(body, "DatiBeniServizi")
    groups = {}
    for n, l in enumerate(inv["lines"], 1):
        rate = "0.00" if forf or l["vat"] == "esente" else "22.00"
        natura = "N2.2" if forf else ("N4" if l["vat"] == "esente" else None)
        _path(_sub(beni, "DettaglioLinee"), {"NumeroLinea": n, "Descrizione": l["description"], "PrezzoUnitario": f"{l['amount']:.2f}",
                                             "PrezzoTotale": f"{l['amount']:.2f}", "AliquotaIVA": rate, "Ritenuta": "SI" if t["ritenuta"] else None, "Natura": natura})
        g = groups.setdefault((rate, natura), 0.0)
        groups[(rate, natura)] = g + l["amount"]
    for (rate, natura), amount in groups.items():
        tax = round(amount * 0.22, 2) if rate == "22.00" else 0.0
        _path(_sub(beni, "DatiRiepilogo"), {"AliquotaIVA": rate, "Natura": natura, "ImponibileImporto": f"{amount:.2f}", "Imposta": f"{tax:.2f}",
                                            "RiferimentoNormativo": "Art. 10 c.1 n.18 DPR 633/72" if natura == "N4" else ("Art. 1 c.54-89 L. 190/2014" if natura else None)})
    _path(_sub(body, "DatiPagamento"), {"CondizioniPagamento": "TP02", "DettaglioPagamento": {"ModalitaPagamento": MP.get(inv["method"], "MP01"),
                                                                                             "ImportoPagamento": f"{t['due']:.2f}", "IBAN": billing.get("iban") if inv["method"] == "bonifico" else None}})
    return _xml(root)


def sts_file(invoices: list, billing: dict) -> bytes:
    root = ET.Element("precompilata", {"simulazione": "true"})
    _path(root, {"proprietario": {"cfProprietario": billing.get("tax_code")}})
    for i in invoices:
        _path(_sub(root, "documentoSpesa"), {
            "idSpesa": {"pIva": billing.get("vat_number"), "dataEmissione": i["date"], "numDocumentoFiscale": {"dispositivo": 1, "numDocumento": i.get("number")}},
            "dataPagamento": (i.get("paid_at") or i["date"])[:10], "cfCittadino": i.get("patient_cf"),
            "voceSpesa": {"tipoSpesa": "SP", "importo": f"{i['totals']['total']:.2f}"},
            "pagamentoTracciato": "NO" if i["method"] == "contanti" else "SI", "tipoDocumento": "F", "flagOpposizione": 0})
    return _xml(root)
