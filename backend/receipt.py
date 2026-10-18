"""Ricevuta sanitaria PDF for online-paid visits (same letterhead style as the clinical report)."""
import io
from datetime import date
from xml.sax.saxutils import escape
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import white
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from report import NIGHT, PLATINUM, MUTED, LINE, MIST, BRAND, S, P, draw_monogram

W, H = A4
MX = 18 * mm
VAT_NOTE = "Operazione esente IVA ai sensi dell'art. 10, comma 1, n. 18 del D.P.R. 633/1972 (prestazione sanitaria)."


def euro(v: float) -> str:
    return f"{v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".") + " €"


def build_receipt(pay: dict, doctor: str, specialty: str, billing: dict, patient_cf: str) -> bytes:
    issued = date.fromisoformat(pay["date"]).strftime("%d/%m/%Y")
    stamp = float(pay.get("stamp") or 0)
    fee = round(pay["amount"] - stamp, 2)
    missing = "[da completare nelle impostazioni]"

    def on_page(cv, doc):
        cv.saveState()
        cv.setFillColor(NIGHT)
        cv.rect(0, H - 38 * mm, W, 38 * mm, stroke=0, fill=1)
        draw_monogram(cv, MX, H - 30 * mm, 18 * mm, stroke=white, accent=PLATINUM)
        cv.setFillColor(white)
        cv.setFont("Serif", 22)
        cv.drawString(MX + 23 * mm, H - 19 * mm, doctor or BRAND)
        cv.setFont("Sans", 7.5)
        cv.setFillColor(PLATINUM)
        cv.drawString(MX + 23 * mm, H - 25 * mm, (specialty or "Pediatria").upper()[:70])
        cv.drawRightString(W - MX, H - 19 * mm, f"RICEVUTA N. {pay['receipt_no']}")
        cv.drawRightString(W - MX, H - 25 * mm, f"DEL {issued}")
        cv.setStrokeColor(LINE)
        cv.line(MX, 16 * mm, W - MX, 16 * mm)
        cv.setFont("Sans", 6.8)
        cv.setFillColor(MUTED)
        cv.drawString(MX, 11 * mm, "Documento contenente dati personali (Reg. UE 2016/679). Conservare ai fini della detrazione delle spese sanitarie.")
        cv.drawRightString(W - MX, 7.5 * mm, f"{BRAND} · ricevuta {pay['receipt_no']}")
        cv.restoreState()

    issuer = [("Professionista", billing.get("holder") or doctor), ("Codice fiscale", billing.get("tax_code") or missing),
              ("Partita IVA", billing.get("vat_number") or missing), ("Domicilio fiscale", billing.get("address") or missing)]
    client = [("Paziente", pay["patient_name"]), ("Codice fiscale paziente", patient_cf or "—"),
              ("Pagato da", pay.get("payer_name") or "—"), ("Sede della visita", pay.get("clinic") or "—")]

    def block(title, rows):
        t = Table([[P(title, "label")]] + [[Paragraph(f'<font name="Sans" size="7.5" color="#5B6478">{escape(k.upper())}</font><br/>{escape(str(v))}', S["body"])] for k, v in rows],
                  colWidths=[(W - 2 * MX - 6 * mm) / 2])
        t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), MIST), ("LINEABOVE", (0, 0), (-1, 0), 1.2, NIGHT),
                               ("LEFTPADDING", (0, 0), (-1, -1), 9), ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5)]))
        return t

    parties = Table([[block("EMESSA DA", issuer), "", block("INTESTATA A", client)]], colWidths=[(W - 2 * MX - 6 * mm) / 2, 6 * mm, (W - 2 * MX - 6 * mm) / 2])
    parties.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0)]))

    rows = [["Descrizione", "Importo"], [f"{pay['service']} · {pay.get('visit_date_label') or ''}".strip(" ·"), euro(fee)]]
    if stamp:
        rows.append(["Imposta di bollo (importo superiore a 77,47 €)", euro(stamp)])
    rows.append(["TOTALE PAGATO", euro(pay["amount"])])
    lines = Table([[Paragraph(escape(a), S["cellH" if i == 0 else "cell"]), Paragraph(escape(b), S["cellHR" if i == 0 else "cellR"])] for i, (a, b) in enumerate(rows)],
                  colWidths=[W - 2 * MX - 40 * mm, 40 * mm])
    lines.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), NIGHT), ("LINEABOVE", (0, -1), (-1, -1), 1, NIGHT),
                               ("FONTNAME", (0, -1), (-1, -1), "SansB"), ("TOPPADDING", (0, 0), (-1, -1), 7), ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
                               ("LEFTPADDING", (0, 0), (-1, -1), 8), ("RIGHTPADDING", (0, 0), (-1, -1), 8)]))

    story = [Paragraph("Ricevuta sanitaria", S["title"]), Paragraph("per prestazione medica", S["titleIt"]), Spacer(1, 7 * mm), parties, Spacer(1, 8 * mm), lines,
             Spacer(1, 6 * mm), P(f"Pagamento elettronico tracciabile (carta / Apple Pay / Google Pay) ricevuto online il {issued}.", "body"), Spacer(1, 2 * mm),
             P(VAT_NOTE, "small")]
    if stamp:
        story.append(P("Imposta di bollo di 2,00 € assolta dal professionista e addebitata al paziente.", "small"))
    if billing.get("note"):
        story.append(P(billing["note"], "small"))
    if pay.get("refunded_at"):
        story += [Spacer(1, 5 * mm), P(f"RICEVUTA STORNATA: importo rimborsato integralmente il {date.fromisoformat(pay['refunded_at'][:10]).strftime('%d/%m/%Y')} "
                                       "per annullamento della visita.", "body")]
    buf = io.BytesIO()
    SimpleDocTemplate(buf, pagesize=A4, title=f"Ricevuta {pay['receipt_no']}", author=doctor, leftMargin=MX, rightMargin=MX,
                      topMargin=50 * mm, bottomMargin=24 * mm).build(story, onFirstPage=on_page, onLaterPages=on_page)
    return buf.getvalue()
