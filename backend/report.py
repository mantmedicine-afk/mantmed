import io
import os
from datetime import datetime
from pathlib import Path
from xml.sax.saxutils import escape
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor, white
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (BaseDocTemplate, Frame, PageTemplate, Paragraph, Spacer, Table, TableStyle,
                                KeepTogether, Flowable)

FONTS = Path(__file__).parent / "fonts"
pdfmetrics.registerFont(TTFont("Serif", str(FONTS / "InstrumentSerif-Regular.ttf")))
pdfmetrics.registerFont(TTFont("SerifIt", str(FONTS / "InstrumentSerif-Italic.ttf")))
pdfmetrics.registerFont(TTFont("Sans", str(FONTS / "LiberationSans-Regular.ttf")))
pdfmetrics.registerFont(TTFont("SansB", str(FONTS / "LiberationSans-Bold.ttf")))

NIGHT = HexColor("#0A192F")
ICE = HexColor("#E5E4E2")
PLATINUM = HexColor("#C9CCD3")
MUTED = HexColor("#5B6478")
LINE = HexColor("#DADDE3")
MIST = HexColor("#F4F5F7")

BRAND = "MantMed"


def studio_info(clinic: str) -> dict:
    key = "STUDIO_PROVINCIA" if "Provincia" in (clinic or "") else "STUDIO_CENTRO"
    return {"specialty": os.environ.get("DOCTOR_SPECIALTY", "Specialista in Pediatria"),
            "order": os.environ.get("DOCTOR_ORDER_NUMBER", "[n. iscrizione]"),
            "phone": os.environ.get("STUDIO_PHONE", "[Telefono]"), "email": os.environ.get("STUDIO_EMAIL", "[Email]"),
            "address": os.environ.get(f"{key}_ADDRESS", "[Indirizzo studio]"), "city": os.environ.get(f"{key}_CITY", "[Città]")}

W, H = A4
MX = 18 * mm

S = {
    "title": ParagraphStyle("t", fontName="Serif", fontSize=26, leading=30, textColor=NIGHT),
    "titleIt": ParagraphStyle("ti", fontName="SerifIt", fontSize=26, leading=30, textColor=MUTED),
    "sec": ParagraphStyle("s", fontName="Serif", fontSize=17, leading=20, textColor=NIGHT),
    "label": ParagraphStyle("l", fontName="SansB", fontSize=7.5, leading=10, textColor=MUTED),
    "body": ParagraphStyle("b", fontName="Sans", fontSize=10, leading=14.5, textColor=NIGHT),
    "small": ParagraphStyle("sm", fontName="Sans", fontSize=8, leading=11, textColor=MUTED),
    "cell": ParagraphStyle("c", fontName="Sans", fontSize=9, leading=12, textColor=NIGHT),
    "cellH": ParagraphStyle("ch", fontName="SansB", fontSize=7.5, leading=10, textColor=white),
}


def P(text, style="body"):
    return Paragraph(escape(str(text or "—")).replace("\n", "<br/>"), S[style])


def draw_monogram(c, x, y, s, stroke=white, accent=ICE):
    u = s / 40
    c.saveState()
    c.setLineJoin(1)
    c.setLineCap(1)
    c.setLineWidth(2.6 * u)
    c.setStrokeColor(stroke)
    P_ = lambda px, py: (x + px * u, y + (40 - py) * u)
    p = c.beginPath()
    p.moveTo(*P_(9, 30)); p.lineTo(*P_(9, 10)); p.lineTo(*P_(20, 23)); p.lineTo(*P_(31, 10)); p.lineTo(*P_(31, 30))
    c.drawPath(p, stroke=1, fill=0)
    c.setStrokeColor(accent)
    p = c.beginPath()
    p.moveTo(*P_(13, 30)); p.lineTo(*P_(20, 12)); p.lineTo(*P_(27, 30))
    c.drawPath(p, stroke=1, fill=0)
    c.line(*P_(15.6, 24), *P_(24.4, 24))
    c.restoreState()


class Monogram(Flowable):
    def __init__(self, size):
        super().__init__()
        self.size = size

    def wrap(self, *_):
        return self.size, self.size

    def draw(self):
        draw_monogram(self.canv, 0, 0, self.size, stroke=NIGHT, accent=ICE)


def fmt(n, unit=""):
    if n is None:
        return "—"
    v = round(float(n), 1)
    s = (f"{v:.1f}".rstrip("0").rstrip(".")).replace(".", ",")
    return f"{s} {unit}".strip()


def dose_for(d, peso):
    if not peso or not d.get("mg_kg_dose"):
        return None
    raw = d["mg_kg_dose"] * peso
    mg = min(raw, d["max_mg_dose"]) if d.get("max_mg_dose") else raw
    return {"mg": mg, "ml": mg / d["concentrazione_mg_ml"] if d.get("concentrazione_mg_ml") else None,
            "daily": mg * d["dosi_giorno"] if d.get("dosi_giorno") else None}


def section(n, title, rows):
    head = Table([[Paragraph(f'<font name="Sans" size="8" color="#8A93A6">{n}</font>&nbsp;&nbsp;{escape(title)}', S["sec"])]],
                 colWidths=[W - 2 * MX])
    head.setStyle(TableStyle([("LINEBELOW", (0, 0), (-1, -1), 0.6, NIGHT), ("LEFTPADDING", (0, 0), (-1, -1), 0),
                              ("BOTTOMPADDING", (0, 0), (-1, -1), 5)]))
    body = [[P(lbl.upper(), "label") if lbl else "", val if isinstance(val, Flowable) else P(val)] for lbl, val in rows]
    t = Table(body, colWidths=[42 * mm, W - 2 * MX - 42 * mm])
    t.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0),
                           ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                           ("LINEBELOW", (0, 0), (-1, -2), 0.4, LINE)]))
    return [KeepTogether([head, t]), Spacer(1, 7 * mm)]


def grid(header, rows, widths):
    t = Table([[Paragraph(escape(h), S["cellH"]) for h in header]] + [[P(c, "cell") for c in r] for r in rows],
              colWidths=widths, repeatRows=1)
    t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), NIGHT), ("ROWBACKGROUNDS", (0, 1), (-1, -1), [white, MIST]),
                           ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("TOPPADDING", (0, 0), (-1, -1), 5),
                           ("BOTTOMPADDING", (0, 0), (-1, -1), 5), ("LEFTPADDING", (0, 0), (-1, -1), 6)]))
    return t


def build_report(c: dict, doctor: str, patient: dict | None = None) -> bytes:
    note = c.get("note") or {}
    g = note.get("crescita") or {}
    created = datetime.fromisoformat(c["created_at"])
    date_s = created.strftime("%d/%m/%Y")
    ref_no = f"MM-{created.strftime('%Y%m%d')}-{c['id'][-5:].upper()}"
    clinic = c.get("clinic") or "Studio"
    info = studio_info(clinic)
    parts = (c["patient_name"] or "").split()
    first, last = (parts[0], " ".join(parts[1:])) if len(parts) > 1 else (c["patient_name"], "")
    blank = "____________________"
    cf = (patient or {}).get("fiscal_code") or blank
    birth = (patient or {}).get("birth_date")
    birth_s = datetime.fromisoformat(birth).strftime("%d/%m/%Y") if birth else blank

    def on_page(cv, doc):
        cv.saveState()
        cv.setFillColor(NIGHT)
        cv.rect(0, H - 38 * mm, W, 38 * mm, stroke=0, fill=1)
        cv.setFillColor(PLATINUM)
        cv.rect(0, H - 38.8 * mm, W, 0.8 * mm, stroke=0, fill=1)
        cv.setStrokeColor(PLATINUM)
        cv.setLineWidth(0.5)
        cv.roundRect(MX, H - 29 * mm, 18 * mm, 18 * mm, 4 * mm, stroke=1, fill=0)
        draw_monogram(cv, MX + 1 * mm, H - 28 * mm, 16 * mm, stroke=white, accent=PLATINUM)
        cv.setFillColor(white)
        cv.setFont("Serif", 25)
        cv.drawString(MX + 23 * mm, H - 19 * mm, BRAND)
        cv.setFont("Sans", 7)
        cv.setFillColor(PLATINUM)
        cv.drawString(MX + 23 * mm, H - 24.5 * mm, "STUDIO MEDICO SPECIALISTICO · PEDIATRIA")
        cv.setFillColor(white)
        cv.setFont("Serif", 16)
        cv.drawRightString(W - MX, H - 13 * mm, doctor)
        cv.setFont("Sans", 7.8)
        cv.setFillColor(ICE)
        cv.drawRightString(W - MX, H - 18.5 * mm, info["specialty"])
        cv.drawRightString(W - MX, H - 22.5 * mm, f"Iscr. Ordine dei Medici n. {info['order']}")
        cv.drawRightString(W - MX, H - 26.5 * mm, f"{clinic} · {info['address']}, {info['city']}")
        cv.drawRightString(W - MX, H - 30.5 * mm, f"Tel. {info['phone']} · {info['email']}")
        cv.setStrokeColor(LINE)
        cv.line(MX, 16 * mm, W - MX, 16 * mm)
        cv.setFont("Sans", 6.8)
        cv.setFillColor(MUTED)
        cv.drawString(MX, 12 * mm, "Documento riservato contenente dati personali e sanitari (art. 9 Reg. UE 2016/679 - GDPR). "
                                   "Uso esclusivo del paziente e dei suoi tutori legali.")
        cv.drawString(MX, 8.5 * mm, "Vietata la diffusione o la riproduzione non autorizzata. Se ricevuto per errore, distruggere e avvisare lo studio.")
        cv.drawRightString(W - MX, 8.5 * mm, f"{ref_no} · pag. {doc.page}")
        cv.restoreState()

    buf = io.BytesIO()
    doc = BaseDocTemplate(buf, pagesize=A4, title=f"Referto {c['patient_name']}", author=doctor,
                          leftMargin=MX, rightMargin=MX, topMargin=48 * mm, bottomMargin=24 * mm)
    doc.addPageTemplates([PageTemplate(frames=[Frame(MX, 24 * mm, W - 2 * MX, H - 72 * mm, id="f", leftPadding=0,
                                                     rightPadding=0, topPadding=0, bottomPadding=0)], onPage=on_page)])

    cw = (W - 2 * MX) / 5
    meta = Table([[P("NOME", "label"), P("COGNOME", "label"), P("CODICE FISCALE", "label"), P("DATA DI NASCITA", "label"), P("DATA VISITA", "label")],
                  [Paragraph(escape(first), S["sec"]), Paragraph(escape(last or "—"), S["sec"]), P(cf), P(birth_s), P(date_s)],
                  [P(f"Sede: {clinic}", "small"), "", "", P(f"Referto n. {ref_no}", "small"), ""]],
                 colWidths=[cw, cw, cw * 1.25, cw * 0.95, cw * 0.8])
    meta.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), MIST), ("LEFTPADDING", (0, 0), (-1, -1), 8),
                              ("TOPPADDING", (0, 0), (-1, 0), 9), ("BOTTOMPADDING", (0, -1), (-1, -1), 8),
                              ("LINEABOVE", (0, 0), (-1, 0), 1.2, NIGHT), ("LINEABOVE", (0, 2), (-1, 2), 0.4, LINE),
                              ("SPAN", (0, 2), (2, 2)), ("SPAN", (3, 2), (4, 2)), ("VALIGN", (0, 0), (-1, 1), "BOTTOM")]))

    story = [Paragraph("Referto di visita", S["title"]), Paragraph("pediatrica specialistica", S["titleIt"]),
             Spacer(1, 6 * mm), meta, Spacer(1, 9 * mm)]

    story += section("01", "Anamnesi", [("Fisiologica", note.get("anamnesi_fisiologica")),
                                        ("Allattamento", note.get("allattamento")), ("Svezzamento", note.get("svezzamento"))])
    story += section("02", "Motivo della visita e sintomi", [("Motivo", note.get("motivo_visita")), ("Sintomi", note.get("sintomi"))])
    story += section("03", "Esame obiettivo", [("TORL", note.get("torl")), ("Torace · Auscultazione", note.get("torace_auscultazione")),
                                               ("Addome", note.get("addome"))])

    peso, alt = g.get("peso_kg"), g.get("altezza_cm")
    bmi = peso / (alt / 100) ** 2 if peso and alt else None
    sesso = {"F": "Femmina", "M": "Maschio"}.get(g.get("sesso"), "—")
    growth = grid(["Età", "Sesso", "Peso", "Altezza", "Circ. cranica", "BMI"],
                  [[fmt(g.get("eta_mesi"), "mesi"), sesso, f"{fmt(peso, 'kg')}\n{g.get('percentile_peso') or ''}",
                    f"{fmt(alt, 'cm')}\n{g.get('percentile_altezza') or ''}",
                    f"{fmt(g.get('circonferenza_cranica_cm'), 'cm')}\n{g.get('percentile_cc') or ''}", fmt(bmi)]],
                  [(W - 2 * MX - 42 * mm) / 6] * 6)
    story += section("04", "Parametri di crescita", [("Misure e percentili", growth)])

    rows = [("Diagnosi", note.get("diagnosi")), ("Terapia", note.get("terapia"))]
    drugs = [d for d in note.get("farmaci") or [] if d.get("nome")]
    if drugs:
        lines = []
        for d in drugs:
            x = dose_for(d, peso)
            dose = f"{fmt(x['mg'], 'mg')}" + (f" = {fmt(x['ml'], 'ml')}" if x and x["ml"] else "") if x else "—"
            freq = f"{int(d['dosi_giorno'])} volte/die" if d.get("dosi_giorno") else "al bisogno"
            dur = f"{int(d['giorni'])} giorni" if d.get("giorni") else "—"
            lines.append([d["nome"], fmt(d.get("mg_kg_dose"), "mg/kg"), dose, freq, dur])
        rows.append(("Prescrizione su misura", grid(["Farmaco", "Posologia", "Dose singola", "Frequenza", "Durata"], lines,
                                                    [30 * mm, 22 * mm, 28 * mm, 22 * mm, W - 2 * MX - 144 * mm])))
        if peso:
            rows.append(("", P(f"Dosi calcolate sul peso di {fmt(peso, 'kg')} rilevato in visita.", "small")))
    rows.append(("Follow-up", note.get("follow_up")))
    story += section("05", "Diagnosi e terapia", rows)

    box = lambda label, content: [P(label, "label"), Spacer(1, 2 * mm), content]
    sign = Table([[box("LUOGO", P(info["city"])), box("DATA", P(date_s)), box("TIMBRO DELLO STUDIO", Spacer(1, 24 * mm)),
                   box("FIRMA DIGITALE / AUTOGRAFA", [Spacer(1, 12 * mm), Paragraph(escape(doctor), S["body"])])]],
                 colWidths=[32 * mm, 26 * mm, 54 * mm, W - 2 * MX - 112 * mm])
    sign.setStyle(TableStyle([("BOX", (2, 0), (2, 0), 0.6, PLATINUM), ("BOX", (3, 0), (3, 0), 0.6, PLATINUM),
                              ("LINEBELOW", (0, 0), (1, 0), 0.6, PLATINUM), ("VALIGN", (0, 0), (-1, -1), "TOP"),
                              ("LINEABOVE", (0, 0), (-1, 0), 1.2, NIGHT),
                              ("LEFTPADDING", (0, 0), (-1, -1), 8), ("TOPPADDING", (0, 0), (-1, -1), 8),
                              ("BOTTOMPADDING", (0, 0), (-1, -1), 8)]))
    story.append(KeepTogether([Spacer(1, 4 * mm), sign, Spacer(1, 3 * mm),
                               P("Referto generato con il supporto di trascrizione AI e verificato dal medico firmatario.", "small")]))
    doc.build(story)
    return buf.getvalue()
