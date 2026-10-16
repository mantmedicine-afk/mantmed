import io
import os
import re
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
    return {"specialty": os.environ["DOCTOR_SPECIALTY"], "titles": os.environ.get("DOCTOR_TITLES", ""),
            "order": os.environ["DOCTOR_ORDER_NUMBER"], "phone": os.environ["STUDIO_PHONE"], "email": os.environ["STUDIO_EMAIL"],
            "address": os.environ[f"{key}_ADDRESS"], "city": os.environ["REPORT_CITY"]}

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
    "cellR": ParagraphStyle("cr", fontName="Sans", fontSize=9, leading=12, textColor=NIGHT, alignment=2),
    "cellHR": ParagraphStyle("chr", fontName="SansB", fontSize=7.5, leading=10, textColor=white, alignment=2),
    "hdName": ParagraphStyle("hn", fontName="Serif", fontSize=17, leading=19, textColor=white, alignment=2),
    "hdSpec": ParagraphStyle("hs", fontName="SansB", fontSize=7.8, leading=10, textColor=white, alignment=2),
    "hdText": ParagraphStyle("ht", fontName="Sans", fontSize=6.6, leading=8.6, textColor=HexColor("#D9DCE2"), alignment=2),
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


def grid(header, rows, widths, right=()):
    head = [Paragraph(escape(h), S["cellHR" if i in right else "cellH"]) for i, h in enumerate(header)]
    body = [[P(c, "cellR" if i in right else "cell") for i, c in enumerate(r)] for r in rows]
    t = Table([head] + body, colWidths=widths, repeatRows=1)
    t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), NIGHT), ("ROWBACKGROUNDS", (0, 1), (-1, -1), [white, MIST]),
                           ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("TOPPADDING", (0, 0), (-1, -1), 5),
                           ("BOTTOMPADDING", (0, 0), (-1, -1), 5), ("LEFTPADDING", (0, 0), (-1, -1), 6),
                           ("RIGHTPADDING", (0, 0), (-1, -1), 6), ("LINEBELOW", (0, -1), (-1, -1), 0.6, PLATINUM)]))
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
    blank = "_______________"
    cf = (patient or {}).get("fiscal_code") or blank
    birth = (patient or {}).get("birth_date")
    birth_s = datetime.fromisoformat(birth).strftime("%d/%m/%Y") if birth else blank

    HB = 50 * mm

    def on_page(cv, doc):
        cv.saveState()
        cv.setFillColor(NIGHT)
        cv.rect(0, H - HB, W, HB, stroke=0, fill=1)
        cv.setFillColor(PLATINUM)
        cv.rect(0, H - HB - 0.8 * mm, W, 0.8 * mm, stroke=0, fill=1)
        cv.setStrokeColor(PLATINUM)
        cv.setLineWidth(0.5)
        cv.roundRect(MX, H - 30 * mm, 18 * mm, 18 * mm, 4 * mm, stroke=1, fill=0)
        draw_monogram(cv, MX + 1 * mm, H - 29 * mm, 16 * mm, stroke=white, accent=PLATINUM)
        cv.setFillColor(white)
        cv.setFont("Serif", 25)
        cv.drawString(MX + 23 * mm, H - 20 * mm, BRAND)
        cv.setFont("Sans", 7)
        cv.setFillColor(PLATINUM)
        cv.drawString(MX + 23 * mm, H - 25.5 * mm, "STUDIO MEDICO SPECIALISTICO · PEDIATRIA")
        col_w = 86 * mm
        y = H - 9 * mm
        blocks = [(doctor, "hdName", 1.5), (info["specialty"], "hdSpec", 1.2), (info["titles"], "hdText", 1.6),
                  (info["order"], "hdText", 0.6), (f"{clinic} · {info['address']}", "hdText", 0.6),
                  (f"Tel. {info['phone']} · {info['email']}", "hdText", 0)]
        for text, style, gap in blocks:
            if not text:
                continue
            para = Paragraph(escape(text), S[style])
            _, h = para.wrap(col_w, 30 * mm)
            y -= h
            para.drawOn(cv, W - MX - col_w, y)
            y -= gap * mm
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
                          leftMargin=MX, rightMargin=MX, topMargin=60 * mm, bottomMargin=24 * mm)
    doc.addPageTemplates([PageTemplate(frames=[Frame(MX, 24 * mm, W - 2 * MX, H - 84 * mm, id="f", leftPadding=0,
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

    peso, alt, cc = g.get("peso_kg"), g.get("altezza_cm"), g.get("circonferenza_cranica_cm")
    bmi = peso / (alt / 100) ** 2 if peso and alt else None
    sesso = {"F": "Femmina", "M": "Maschio"}.get(g.get("sesso"), "—")

    def split_pct(s):
        m = re.match(r"^(.*?)\s*\(z\s*([^)]+)\)\s*$", s or "")
        return (m.group(1), f"z {m.group(2)}") if m else ((s or "—"), "—")

    rows_g = []
    for label, val, unit, pct in (("Peso", peso, "kg", g.get("percentile_peso")), ("Altezza / lunghezza", alt, "cm", g.get("percentile_altezza")),
                                  ("Circonferenza cranica", cc, "cm", g.get("percentile_cc"))):
        p, z = split_pct(pct) if val is not None else ("—", "—")
        rows_g.append([label, fmt(val, unit), p, z])
    rows_g.append(["BMI", f"{fmt(bmi)} kg/m²" if bmi else "—", "—", "—"])
    gw = W - 2 * MX - 42 * mm
    growth = grid(["Parametro", "Valore", "Percentile OMS", "z-score"], rows_g, [gw * 0.34, gw * 0.22, gw * 0.24, gw * 0.20], right=(1, 2, 3))
    story += section("04", "Parametri di crescita", [("Età · sesso", f"{fmt(g.get('eta_mesi'), 'mesi')} · {sesso}"),
                                                     ("Misure e percentili", growth)])

    rows = [("Diagnosi", note.get("diagnosi")), ("Terapia", note.get("terapia"))]
    drugs = [d for d in note.get("farmaci") or [] if d.get("nome")]
    if drugs:
        lines = []
        for d in drugs:
            x = dose_for(d, peso)
            dose = fmt(x["mg"], "mg") if x else "—"
            ml = fmt(x["ml"], "ml") if x and x["ml"] else "—"
            freq = f"{int(d['dosi_giorno'])} volte/die" if d.get("dosi_giorno") else "al bisogno"
            dur = f"{int(d['giorni'])} gg" if d.get("giorni") else "—"
            lines.append([d["nome"], fmt(d.get("mg_kg_dose"), "mg/kg"), dose, ml, freq, dur])
        dw = W - 2 * MX - 42 * mm
        rows.append(("Prescrizione su misura", grid(["Farmaco", "Posologia", "Dose", "Volume", "Frequenza", "Durata"], lines,
                                                    [dw * 0.25, dw * 0.15, dw * 0.14, dw * 0.13, dw * 0.19, dw * 0.14], right=(1, 2, 3, 5))))
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
