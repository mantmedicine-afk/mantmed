"""Registro cassa in PDF per il commercialista (A4, tabella, totali e numeri di pagina)."""
import io
from datetime import date, datetime
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.platypus import SimpleDocTemplate, Spacer, Table, TableStyle, KeepTogether, Paragraph
from reportlab.lib.styles import ParagraphStyle
from zoneinfo import ZoneInfo
from report import NIGHT, MUTED, LINE, MIST, BRAND, P, S

BOLD = ParagraphStyle("cb", parent=S["cell"], fontName="SansB")
BOLDR = ParagraphStyle("cbr", parent=S["cellR"], fontName="SansB")

W, H = A4
MX = 16 * mm


def euro(v: float) -> str:
    return f"{v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".") + " €"


def period_label(s: str, e: str) -> str:
    fmt = lambda x: date.fromisoformat(x).strftime("%d/%m/%Y")
    return fmt(s) if s == e else f"dal {fmt(s)} al {fmt(e)}"


class _Numbered(rl_canvas.Canvas):
    def __init__(self, *a, **k):
        super().__init__(*a, **k)
        self._pages = []

    def showPage(self):
        self._pages.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        total = len(self._pages)
        for st in self._pages:
            self.__dict__.update(st)
            self.setFont("Sans", 7.5)
            self.setFillColor(MUTED)
            self.drawRightString(W - MX, 10 * mm, f"Pagina {self._pageNumber} di {total}")
            super().showPage()
        super().save()


def build_cash_pdf(rows: list, by_method: list, total: float, doctor: str, start: str, end: str) -> bytes:
    generated = datetime.now(ZoneInfo("Europe/Rome")).strftime("%d/%m/%Y %H:%M")
    period = period_label(start, end)

    def on_page(cv, doc):
        cv.saveState()
        cv.setFillColor(NIGHT)
        cv.setFont("Serif", 17)
        cv.drawString(MX, H - 16 * mm, doctor or BRAND)
        cv.setFont("Sans", 8)
        cv.setFillColor(MUTED)
        cv.drawString(MX, H - 21.5 * mm, f"Registro cassa per il commercialista · Periodo: {period}")
        cv.drawRightString(W - MX, H - 16 * mm, f"Generato il {generated}")
        cv.drawRightString(W - MX, H - 21.5 * mm, BRAND)
        cv.setStrokeColor(LINE)
        cv.line(MX, H - 25 * mm, W - MX, H - 25 * mm)
        cv.line(MX, 14 * mm, W - MX, 14 * mm)
        cv.drawString(MX, 10 * mm, f"{BRAND} · {doctor or ''} · {period}")
        cv.restoreState()

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=MX, rightMargin=MX, topMargin=31 * mm, bottomMargin=20 * mm,
                            title=f"Registro cassa {period}", author=doctor or BRAND)
    head = ["Data", "Ora", "Paziente", "Prestazione", "Studio", "Metodo", "Importo (EUR)"]
    data = [[P(h, "cellHR" if i == 6 else "cellH") for i, h in enumerate(head)]]
    data += [[P(r[0], "cell"), P(r[1], "cell"), P(r[2], "cell"), P(r[3], "cell"), P(r[4], "cell"), P(r[5], "cell"), P(euro(r[6]), "cellR")] for r in rows]
    if not rows:
        data.append([P("Nessun movimento nel periodo.", "small"), "", "", "", "", "", ""])
    widths = [22 * mm, 13 * mm, 34 * mm, 40 * mm, 25 * mm, 23 * mm, 21 * mm]
    t = Table(data, colWidths=widths, repeatRows=1)
    style = [("BACKGROUND", (0, 0), (-1, 0), NIGHT), ("VALIGN", (0, 0), (-1, -1), "TOP"),
             ("LINEBELOW", (0, 1), (-1, -1), 0.4, LINE), ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
             ("LEFTPADDING", (0, 0), (-1, -1), 3), ("RIGHTPADDING", (0, 0), (-1, -1), 3)]
    style += [("BACKGROUND", (0, i), (-1, i), MIST) for i in range(2, len(data), 2)]
    if not rows:
        style.append(("SPAN", (0, 1), (-1, 1)))
    t.setStyle(TableStyle(style))

    summary = [[P("Riepilogo", "cellH"), P("Metodo", "cellH"), P("Totale (EUR)", "cellHR")]]
    summary += [["", P(m["label"], "cell"), P(euro(m["total"]), "cellR")] for m in by_method]
    summary += [["", Paragraph("Totale", BOLD), Paragraph(euro(total), BOLDR)]]
    st = Table(summary, colWidths=[86 * mm, 50 * mm, 42 * mm])
    st.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), NIGHT), ("LINEBELOW", (0, 1), (-1, -1), 0.4, LINE),
                            ("LINEABOVE", (0, -1), (-1, -1), 1, NIGHT), ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4)]))
    doc.build([t, Spacer(1, 8 * mm), KeepTogether([st])], onFirstPage=on_page, onLaterPages=on_page, canvasmaker=_Numbered)
    return buf.getvalue()
