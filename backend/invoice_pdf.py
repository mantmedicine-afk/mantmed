"""Fattura / ricevuta sanitaria in PDF (stessa carta intestata del referto) e registro fatture A4 per il commercialista."""
import io
from datetime import date, datetime
from xml.sax.saxutils import escape
from zoneinfo import ZoneInfo
from pypdf import PdfWriter, PdfReader
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import white
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, KeepTogether
from clinics import draw_logo
from report import NIGHT, PLATINUM, MUTED, LINE, MIST, BRAND, S, P, draw_monogram, doctor_sign_cell
from cash_pdf import _Numbered, euro, period_label, BOLD, BOLDR
from fiscal import METHODS, VAT_LABELS, notes_for

W, H = A4
MX = 18 * mm
MISSING = "[da completare in Cassa > Impostazioni]"


def _fmt(d: str) -> str:
    return date.fromisoformat(d[:10]).strftime("%d/%m/%Y")


def _block(title, rows):
    w = (W - 2 * MX - 6 * mm) / 2
    t = Table([[P(title, "label")]] + [[Paragraph(f'<font name="Sans" size="7.5" color="#5B6478">{escape(k.upper())}</font><br/>{escape(str(v))}', S["body"])]
                                       for k, v in rows if v], colWidths=[w])
    t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), MIST), ("LINEABOVE", (0, 0), (-1, 0), 1.2, NIGHT),
                           ("LEFTPADDING", (0, 0), (-1, -1), 9), ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3)]))
    return t


def build_invoice_pdf(inv: dict, doctor: str, specialty: str, billing: dict, signature: dict | None, lh: dict | None = None) -> bytes:
    lh = lh or {}
    number = inv.get("number") or "s.n."
    issued = _fmt(inv["date"])
    t = inv["totals"]

    def on_page(cv, doc):
        cv.saveState()
        cv.setFillColor(NIGHT)
        cv.rect(0, H - 38 * mm, W, 38 * mm, stroke=0, fill=1)
        if not draw_logo(cv, lh.get("logo", ""), MX, H - 30 * mm, 18 * mm):
            draw_monogram(cv, MX, H - 30 * mm, 18 * mm, stroke=white, accent=PLATINUM)
        cv.setFillColor(white)
        cv.setFont("Serif", 22)
        cv.drawString(MX + 23 * mm, H - 19 * mm, billing.get("holder") or doctor or BRAND)
        cv.setFont("Sans", 7.5)
        cv.setFillColor(PLATINUM)
        cv.drawString(MX + 23 * mm, H - 25 * mm, (specialty or "Pediatria").upper()[:70])
        cv.setFont("Sans", 6.6)
        contact = " · ".join(x for x in (lh.get("header"), lh.get("clinic"), lh.get("address"), f"Tel. {lh['phone']}" if lh.get("phone") else "") if x)
        cv.drawString(MX + 23 * mm, H - 30.5 * mm, contact[:140])
        cv.setFont("Sans", 7.5)
        cv.drawRightString(W - MX, H - 19 * mm, f"FATTURA N. {number}")
        cv.drawRightString(W - MX, H - 25 * mm, f"DEL {issued}")
        cv.setStrokeColor(LINE)
        cv.line(MX, 16 * mm, W - MX, 16 * mm)
        cv.setFont("Sans", 6.8)
        cv.setFillColor(MUTED)
        cv.drawString(MX, 11 * mm, "Documento contenente dati personali (Reg. UE 2016/679). Conservare ai fini della detrazione delle spese sanitarie.")
        cv.drawRightString(W - MX, 7.5 * mm, f"{BRAND} · fattura {number}")
        cv.restoreState()

    issuer = [("Professionista", billing.get("holder") or doctor), ("Codice fiscale", billing.get("tax_code") or MISSING),
              ("Partita IVA", billing.get("vat_number") or MISSING), ("Domicilio fiscale", billing.get("address") or MISSING),
              ("Iscrizione all'Ordine", billing.get("order_registration")), ("Sede della prestazione", inv.get("clinic"))]
    if inv["client_type"] == "azienda":
        c = inv.get("company") or {}
        client = [("Intestatario", c.get("name")), ("Partita IVA", c.get("vat")), ("Codice fiscale", c.get("cf")), ("Sede", c.get("address")),
                  ("Codice destinatario / PEC", c.get("sdi_code") or c.get("pec")), ("Prestazione resa a", inv["patient_name"])]
    else:
        client = [("Intestatario (chi paga)", inv.get("payer_name")), ("Codice fiscale intestatario", inv.get("payer_cf")),
                  ("Paziente", inv["patient_name"]), ("Codice fiscale paziente", inv.get("patient_cf") or "—")]
    parties = Table([[_block("EMESSA DA", issuer), "", _block("INTESTATA A", client)]], colWidths=[(W - 2 * MX - 6 * mm) / 2, 6 * mm, (W - 2 * MX - 6 * mm) / 2])
    parties.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0)]))

    forf = inv["regime"] == "forfettario"
    rows = [["Descrizione", "Regime IVA", "Importo"]]
    rows += [[l["description"], "Non soggetta (forfettario)" if forf else VAT_LABELS[l["vat"]], euro(l["amount"])] for l in inv["lines"]]
    if t["iva"]:
        rows.append(["IVA 22% sull'imponibile di " + euro(t["imponibile"]), "", euro(t["iva"])])
    if t["stamp"]:
        rows.append(["Imposta di bollo" + ("" if t["stamp_charge"] == "paziente" else " (a carico del professionista)"), "",
                     euro(t["stamp"]) if t["stamp_charge"] == "paziente" else "—"])
    rows.append(["TOTALE FATTURA", "", euro(t["total"])])
    if t["ritenuta"]:
        rows += [["Ritenuta d'acconto 20%", "", "- " + euro(t["ritenuta"])], ["NETTO A PAGARE", "", euro(t["due"])]]
    cw = [W - 2 * MX - 88 * mm, 52 * mm, 36 * mm]
    lines = Table([[Paragraph(escape(a), S["cellH" if i == 0 else "cell"]), Paragraph(escape(b), S["cellH" if i == 0 else "cell"]),
                    Paragraph(escape(c), S["cellHR" if i == 0 else "cellR"])] for i, (a, b, c) in enumerate(rows)], colWidths=cw)
    lines.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), NIGHT), ("LINEABOVE", (0, -1), (-1, -1), 1, NIGHT), ("LINEBELOW", (0, 1), (-1, -2), 0.4, LINE),
                               ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                               ("LEFTPADDING", (0, 0), (-1, -1), 8), ("RIGHTPADDING", (0, 0), (-1, -1), 8)]))

    paid = f"Pagata il {_fmt(inv['paid_at'])}" if inv.get("paid_at") else "Da incassare"
    pay = f"Metodo di pagamento: {METHODS.get(inv['method'], inv['method'])} · {paid}."
    if inv["method"] == "bonifico" and billing.get("iban"):
        pay += f" IBAN: {billing['iban']}."
    story = [Paragraph("Fattura", S["title"]), Paragraph("per prestazione sanitaria", S["titleIt"]), Spacer(1, 5 * mm), parties, Spacer(1, 5 * mm), lines,
             Spacer(1, 4 * mm), P(pay, "body"), Spacer(1, 2 * mm)]
    notes = [P(n, "small") for n in notes_for(inv)]
    if inv.get("cancelled_at"):
        notes += [Spacer(1, 2 * mm), P(f"FATTURA ANNULLATA il {_fmt(inv['cancelled_at'])}.", "body")]
    sign = [P("FIRMA DEL PROFESSIONISTA", "label")] + doctor_sign_cell(billing.get("holder") or doctor, signature, 52 * mm)
    foot = Table([[notes, sign]], colWidths=[W - 2 * MX - 62 * mm, 62 * mm])
    foot.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (0, -1), 8)]))
    story.append(foot)
    buf = io.BytesIO()
    SimpleDocTemplate(buf, pagesize=A4, title=f"Fattura {number}", author=doctor, leftMargin=MX, rightMargin=MX,
                      topMargin=46 * mm, bottomMargin=22 * mm).build(story, onFirstPage=on_page, onLaterPages=on_page)
    return buf.getvalue()


def merge_pdfs(pdfs: list[bytes]) -> bytes:
    w = PdfWriter()
    for b in pdfs:
        for page in PdfReader(io.BytesIO(b)).pages:
            w.add_page(page)
    buf = io.BytesIO()
    w.write(buf)
    return buf.getvalue()


def build_register_pdf(invoices: list, summary: dict, doctor: str, start: str, end: str, clinic: str) -> bytes:
    generated = datetime.now(ZoneInfo("Europe/Rome")).strftime("%d/%m/%Y %H:%M")
    period = period_label(start, end) + (f" · {clinic}" if clinic else " · tutti gli studi")
    mx = 12 * mm

    def on_page(cv, doc):
        cv.saveState()
        cv.setFillColor(NIGHT)
        cv.setFont("Serif", 17)
        cv.drawString(mx, H - 16 * mm, doctor or BRAND)
        cv.setFont("Sans", 8)
        cv.setFillColor(MUTED)
        cv.drawString(mx, H - 21.5 * mm, f"Registro fatture per il commercialista · Periodo: {period}")
        cv.drawRightString(W - mx, H - 16 * mm, f"Generato il {generated}")
        cv.drawRightString(W - mx, H - 21.5 * mm, BRAND)
        cv.setStrokeColor(LINE)
        cv.line(mx, H - 25 * mm, W - mx, H - 25 * mm)
        cv.line(mx, 14 * mm, W - mx, 14 * mm)
        cv.drawString(mx, 10 * mm, f"{BRAND} · {doctor or ''} · {period}")
        cv.restoreState()

    head = ["N.", "Data", "Intestatario", "Studio", "Metodo", "Esente", "Imponib.", "IVA", "Bollo", "Rit.", "Totale", "Stato"]
    data = [[P(h, "cellHR" if 5 <= i <= 10 else "cellH") for i, h in enumerate(head)]]
    for i in invoices:
        t = i["totals"]
        who = (i.get("company") or {}).get("name") if i["client_type"] == "azienda" else (i.get("payer_name") or i["patient_name"])
        state = "Annullata" if i.get("cancelled_at") else ("Pagata" if i.get("paid_at") else "Da incassare")
        data.append([P(i.get("number") or "s.n.", "cell"), P(_fmt(i["date"]), "cell"), P(who or "—", "cell"), P(i.get("clinic") or "—", "cell"),
                     P(METHODS.get(i["method"], i["method"]), "cell")] + [P(euro(t[k]), "cellR") for k in ("esente", "imponibile", "iva", "stamp", "ritenuta", "total")]
                    + [P(state, "cell")])
    if not invoices:
        data.append([P("Nessuna fattura nel periodo.", "small")] + [""] * 11)
    widths = [13, 19, 31, 21, 19, 15, 15, 12, 11, 12, 16, 16]
    tb = Table(data, colWidths=[w * mm for w in widths], repeatRows=1)
    style = [("BACKGROUND", (0, 0), (-1, 0), NIGHT), ("VALIGN", (0, 0), (-1, -1), "TOP"), ("LINEBELOW", (0, 1), (-1, -1), 0.4, LINE),
             ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3), ("LEFTPADDING", (0, 0), (-1, -1), 2), ("RIGHTPADDING", (0, 0), (-1, -1), 2)]
    style += [("BACKGROUND", (0, i), (-1, i), MIST) for i in range(2, len(data), 2)]
    if not invoices:
        style.append(("SPAN", (0, 1), (-1, 1)))
    tb.setStyle(TableStyle(style))

    s = summary
    rows = [("Fatture emesse", str(s["count"])), ("Totale imponibile", euro(s["imponibile"])), ("Totale esente / non soggetto", euro(s["esente"])),
            ("IVA", euro(s["iva"])), ("Bolli", euro(s["stamp"])), ("Ritenute d'acconto", euro(s["ritenuta"])), ("Totale fatturato", euro(s["total"]))]
    rows += [(f"Incassi · {m['label']}", euro(m["total"])) for m in s["by_method"] if m["total"]]
    rows += [("Fatture ad aziende inviate allo SdI (simulazione)", f"{s['sdi_sent']} di {s['companies']}"),
             ("Sistema TS · inviate / da inviare / errore", f"{s['sts']['inviata']} / {s['sts']['da_inviare']} / {s['sts']['errore']}")]
    st = Table([[P("Riepilogo del periodo", "cellH"), P("Valore", "cellHR")]] + [[Paragraph(escape(a), BOLD if a.startswith("Totale fatt") else S["cell"]),
                                                                           Paragraph(escape(b), BOLDR if a.startswith("Totale fatt") else S["cellR"])] for a, b in rows],
               colWidths=[120 * mm, 66 * mm])
    st.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), NIGHT), ("LINEBELOW", (0, 1), (-1, -1), 0.4, LINE),
                            ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4)]))
    buf = io.BytesIO()
    SimpleDocTemplate(buf, pagesize=A4, leftMargin=mx, rightMargin=mx, topMargin=31 * mm, bottomMargin=20 * mm,
                      title=f"Registro fatture {period}", author=doctor or BRAND).build([tb, Spacer(1, 8 * mm), KeepTogether([st])],
                                                                                     onFirstPage=on_page, onLaterPages=on_page, canvasmaker=_Numbered)
    return buf.getvalue()
