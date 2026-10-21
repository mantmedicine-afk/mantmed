"""PDF dei documenti firmati elettronicamente (consenso privacy, condivisione tra specialisti, modulo cartaceo).

Il PDF è protetto da modifiche (cifratura standard con password proprietario casuale, sola stampa),
riporta i metadati legali della firma e l'impronta SHA-256 dei dati firmati.
"""
import base64
import io
import secrets
from datetime import datetime
from xml.sax.saxutils import escape
from zoneinfo import ZoneInfo

from reportlab.lib.pdfencrypt import StandardEncryption
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib.colors import white
from reportlab.platypus import BaseDocTemplate, Frame, PageTemplate, Paragraph, Spacer, Table, TableStyle, KeepTogether, Image as RLImage
from reportlab.lib.utils import ImageReader

from report import S, NIGHT, PLATINUM, MUTED, LINE, MIST, BRAND, W, H, MX, draw_monogram

ROME = ZoneInfo("Europe/Rome")
CHANNEL_LABEL = {"studio_tablet": "Firma su tablet in studio, alla presenza del medico",
                 "portale": "Firma dal Portale Paziente (account del genitore autenticato)",
                 "cartaceo": "Modulo cartaceo da firmare a mano"}

S2 = {
    "mono": ParagraphStyle("mono", fontName="Sans", fontSize=7.2, leading=9, textColor=NIGHT),
    "legalL": ParagraphStyle("legalL", fontName="SansB", fontSize=6.6, leading=9, textColor=MUTED),
    "check": ParagraphStyle("check", fontName="Sans", fontSize=9.6, leading=13.5, textColor=NIGHT),
    "text": ParagraphStyle("text", fontName="Sans", fontSize=9.2, leading=13.6, textColor=NIGHT),
}


def rome(iso: str) -> datetime:
    return datetime.fromisoformat(iso).astimezone(ROME)


def fmt_dt(iso: str) -> str:
    d = rome(iso)
    return d.strftime("%d/%m/%Y alle ore %H:%M:%S")


def _png(data_url: str):
    if not data_url or not data_url.startswith("data:image/png;base64,"):
        return None
    raw = base64.b64decode(data_url.split(",", 1)[1])
    return raw


def sig_image(data_url: str, max_w: float, max_h: float):
    raw = _png(data_url)
    if not raw:
        return None
    iw, ih = ImageReader(io.BytesIO(raw)).getSize()
    k = min(max_w / iw, max_h / ih)
    return RLImage(io.BytesIO(raw), width=iw * k, height=ih * k, hAlign="LEFT")


def _letterhead(doctor: str, info: dict, clinic: str, specialty: str, code: str, protected: bool):
    HB = 44 * mm

    def on_page(cv, doc):
        cv.saveState()
        cv.setFillColor(NIGHT)
        cv.rect(0, H - HB, W, HB, stroke=0, fill=1)
        cv.setFillColor(PLATINUM)
        cv.rect(0, H - HB - 0.8 * mm, W, 0.8 * mm, stroke=0, fill=1)
        cv.setStrokeColor(PLATINUM)
        cv.setLineWidth(0.5)
        cv.roundRect(MX, H - 28 * mm, 17 * mm, 17 * mm, 4 * mm, stroke=1, fill=0)
        draw_monogram(cv, MX + 1 * mm, H - 27 * mm, 15 * mm, stroke=white, accent=PLATINUM)
        cv.setFillColor(white)
        cv.setFont("Serif", 24)
        cv.drawString(MX + 22 * mm, H - 19 * mm, BRAND)
        cv.setFont("Sans", 7)
        cv.setFillColor(PLATINUM)
        cv.drawString(MX + 22 * mm, H - 24.5 * mm, ("STUDIO MEDICO SPECIALISTICO · " + (specialty or "PEDIATRIA").upper())[:70])
        col_w = 86 * mm
        y = H - 9 * mm
        for text, style, gap in ((doctor, "hdName", 1.4), (info.get("specialty"), "hdSpec", 1.1), (info.get("order"), "hdText", 0.6),
                                 (f"{clinic} · {info.get('address', '')}" if info.get("address") else clinic, "hdText", 0.6),
                                 (f"Tel. {info.get('phone', '')} · {info.get('email', '')}", "hdText", 0)):
            if not text:
                continue
            para = Paragraph(escape(text), S[style])
            _, h = para.wrap(col_w, 30 * mm)
            y -= h
            para.drawOn(cv, W - MX - col_w, y)
            y -= gap * mm
        cv.setStrokeColor(LINE)
        cv.line(MX, 16 * mm, W - MX, 16 * mm)
        cv.setFont("Sans", 6.6)
        cv.setFillColor(MUTED)
        cv.drawString(MX, 12 * mm, "Documento contenente dati personali e sanitari (art. 9 Reg. UE 2016/679). Archiviato cifrato AES-256 su server UE.")
        cv.drawString(MX, 8.5 * mm, "Protetto da modifiche · firma elettronica (art. 3 eIDAS) · integrità verificabile su MantMed > Verifica documento"
                      if protected else "Modulo da stampare e firmare a mano · da conservare in studio")
        cv.drawRightString(W - MX, 12 * mm, code)
        cv.drawRightString(W - MX, 8.5 * mm, f"pag. {doc.page}")
        cv.restoreState()

    return on_page, HB


def _doc(buf, title: str, author: str, protected: bool, HB: float):
    kw = {}
    if protected:
        kw["encrypt"] = StandardEncryption("", ownerPassword=secrets.token_hex(24), canPrint=1, canModify=0, canCopy=1, canAnnotate=0, strength=128)
    doc = BaseDocTemplate(buf, pagesize=(W, H), title=title, author=author, subject="Documento firmato elettronicamente - MantMed",
                          creator="MantMed", leftMargin=MX, rightMargin=MX, topMargin=HB + 10 * mm, bottomMargin=22 * mm, **kw)
    return doc


def _meta_table(cells: list[tuple[str, str]]):
    n = len(cells)
    cw = (W - 2 * MX) / n
    t = Table([[Paragraph(escape(k), S["label"]) for k, _ in cells], [Paragraph(escape(v or "—"), S["cell"]) for _, v in cells]], colWidths=[cw] * n)
    t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), MIST), ("LEFTPADDING", (0, 0), (-1, -1), 8), ("TOPPADDING", (0, 0), (-1, 0), 8),
                           ("BOTTOMPADDING", (0, -1), (-1, -1), 8), ("LINEABOVE", (0, 0), (-1, 0), 1.2, NIGHT), ("VALIGN", (0, 0), (-1, -1), "TOP")]))
    return t


def _section(title: str):
    return [Spacer(1, 4 * mm), Paragraph(escape(title).upper(), S["label"]), Spacer(1, 2 * mm)]


def _signature_block(signer: dict, signature: str | None, signed_at: str | None, city: str):
    """signer = {name, relation, fiscal_code}; signature None → empty box for handwriting."""
    img = sig_image(signature, 70 * mm, 20 * mm) if signature else None
    left = [Paragraph("FIRMATARIO", S["label"]), Spacer(1, 1.5 * mm), Paragraph(escape(signer.get("name") or "______________________________"), S["sec"]),
            Paragraph(escape(" · ".join(x for x in (signer.get("relation"), f"C.F. {signer['fiscal_code']}" if signer.get("fiscal_code") else "") if x)), S["small"]),
            Spacer(1, 3 * mm), Paragraph("LUOGO E DATA", S["label"]), Spacer(1, 1.5 * mm),
            Paragraph(escape(f"{city}, {rome(signed_at).strftime('%d/%m/%Y')}" if signed_at else f"{city}, ____ / ____ / ________"), S["body"])]
    right = [Paragraph("FIRMA ELETTRONICA DEL FIRMATARIO" if signature else "FIRMA AUTOGRAFA DEL FIRMATARIO", S["label"]), Spacer(1, 2 * mm)]
    right += [img] if img else [Spacer(1, 22 * mm)]
    right += [Spacer(1, 1.5 * mm), Paragraph(escape(f"Firmato il {fmt_dt(signed_at)}") if signed_at else "", S["small"])]
    t = Table([[left, right]], colWidths=[(W - 2 * MX) * 0.45, (W - 2 * MX) * 0.55])
    t.setStyle(TableStyle([("BOX", (1, 0), (1, 0), 0.6, PLATINUM), ("LINEABOVE", (0, 0), (-1, 0), 1.2, NIGHT), ("VALIGN", (0, 0), (-1, -1), "TOP"),
                           ("LEFTPADDING", (0, 0), (-1, -1), 8), ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 8)]))
    return t


def _legal_box(meta: dict):
    rows = [("Documento n.", meta["code"]), ("Modello", meta["version"]),
            ("Marca temporale (server)", f"{fmt_dt(meta['signed_at'])} (Europe/Rome) · UTC {meta['signed_at'][:19].replace('T', ' ')}"),
            ("Ora sul dispositivo", fmt_dt(meta["client_signed_at"]) if meta.get("client_signed_at") else "—"),
            ("Indirizzo IP", meta.get("ip") or "—"), ("Dispositivo", (meta.get("user_agent") or "—")[:110]),
            ("Canale di firma", CHANNEL_LABEL.get(meta["channel"], meta["channel"])),
            ("Codice identificativo firmatario", meta["signer_code"]),
            ("Raccolta da / account", meta.get("collected_by") or "—"),
            ("Impronta SHA-256 dei dati firmati", meta["payload_sha256"])]
    data = [[Paragraph(escape(k).upper(), S2["legalL"]), Paragraph(escape(v), S2["mono"])] for k, v in rows]
    t = Table([[Paragraph("DATI DI FIRMA ELETTRONICA · NON MODIFICABILI", ParagraphStyle("lh", parent=S["cellH"], fontSize=7.4)), ""]] + data,
              colWidths=[52 * mm, W - 2 * MX - 52 * mm])
    t.setStyle(TableStyle([("SPAN", (0, 0), (1, 0)), ("BACKGROUND", (0, 0), (-1, 0), NIGHT), ("BACKGROUND", (0, 1), (-1, -1), MIST),
                           ("LINEBELOW", (0, 1), (-1, -2), 0.3, LINE), ("VALIGN", (0, 0), (-1, -1), "TOP"),
                           ("LEFTPADDING", (0, 0), (-1, -1), 7), ("TOPPADDING", (0, 0), (-1, -1), 2.6), ("BOTTOMPADDING", (0, 0), (-1, -1), 2.6)]))
    note = Paragraph("La firma è una firma elettronica (art. 3 eIDAS) raccolta con tratto grafico, marca temporale del server, indirizzo IP e dispositivo. "
                     "Il file è protetto da modifiche; la sua impronta SHA-256 è registrata nell'archivio MantMed al momento della firma: "
                     "per verificarne l'integrità carichi il PDF in \"Verifica documento\". Qualsiasi alterazione rende la verifica negativa.", S["small"])
    return KeepTogether([Spacer(1, 4 * mm), t, Spacer(1, 1.5 * mm), note])


def build_consent_pdf(*, doctor: str, info: dict, clinic: str, specialty: str, patient: dict, text: str, version: str,
                      clauses: list[tuple[str, bool]], signer: dict, signature: str | None, meta: dict | None, code: str) -> bytes:
    """Consenso informato privacy. signature/meta None → modulo cartaceo da stampare."""
    protected = meta is not None
    on_page, HB = _letterhead(doctor, info, clinic, specialty, code, protected)
    buf = io.BytesIO()
    doc = _doc(buf, f"Consenso informato {patient.get('name', '')}", doctor, protected, HB)
    doc.addPageTemplates([PageTemplate(frames=[Frame(MX, 22 * mm, W - 2 * MX, H - HB - 32 * mm, leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)], onPage=on_page)])
    birth = patient.get("birth_date")
    story = [Paragraph("Consenso informato", S["title"]), Paragraph("al trattamento dei dati personali e sanitari", S["titleIt"]), Spacer(1, 5 * mm),
             _meta_table([("MINORE / PAZIENTE", patient.get("name", "")), ("CODICE FISCALE", patient.get("fiscal_code") or "________________"),
                          ("DATA DI NASCITA", datetime.fromisoformat(birth).strftime("%d/%m/%Y") if birth else "—"), ("TITOLARE", doctor)])]
    story += _section("Informativa (artt. 13 e 9 Reg. UE 2016/679)")
    story += [Paragraph(escape(p), S2["text"]) for p in text.split("\n") if p.strip()]
    story += _section("Dichiarazioni del firmatario")
    for label, val in clauses:
        box = "[X]" if (protected and val) else "[&nbsp;&nbsp;]"
        story.append(Paragraph(f"{box}&nbsp;&nbsp;{escape(label)}", S2["check"]))
        story.append(Spacer(1, 1.2 * mm))
    story += [Spacer(1, 3 * mm), _signature_block(signer, signature, meta["signed_at"] if meta else None, info.get("city") or "")]
    if meta:
        story.append(_legal_box(meta))
    else:
        story += [Spacer(1, 4 * mm), Paragraph(f"Modello {escape(version)} · Modulo n. {escape(code)}. Il modulo firmato va conservato in studio; "
                                               "lo studio registra in MantMed l'avvenuta acquisizione del consenso cartaceo.", S["small"])]
    doc.build(story)
    return buf.getvalue()


def build_share_pdf(*, child: str, specialists: list[dict], text: str, version: str, signer: dict, signature: str, meta: dict, code: str, city: str) -> bytes:
    on_page, HB = _letterhead("Rete multispecialistica MantMed", {"specialty": "Consenso del genitore", "address": ""}, "Medicina di squadra", "RETE SPECIALISTICA", code, True)
    buf = io.BytesIO()
    doc = _doc(buf, f"Consenso condivisione referti {child}", "MantMed", True, HB)
    doc.addPageTemplates([PageTemplate(frames=[Frame(MX, 22 * mm, W - 2 * MX, H - HB - 32 * mm, leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)], onPage=on_page)])
    story = [Paragraph("Consenso alla condivisione", S["title"]), Paragraph("dei referti tra specialisti", S["titleIt"]), Spacer(1, 5 * mm),
             _meta_table([("MINORE / PAZIENTE", child), ("SPECIALISTI AUTORIZZATI", str(len(specialists))), ("MODELLO", version)])]
    story += _section("Specialisti che possono consultare reciprocamente i referti")
    story += [Paragraph(escape(f"• {s['name']} · {s.get('specialty') or ''}"), S2["check"]) for s in specialists]
    story += _section("Informativa e consenso")
    story += [Paragraph(escape(p), S2["text"]) for p in text.split("\n") if p.strip()]
    story += [Spacer(1, 2 * mm), Paragraph("[X]&nbsp;&nbsp;Ho letto l'informativa e acconsento alla condivisione dei referti tra gli specialisti selezionati. "
                                          "Posso revocare il consenso in ogni momento dal Portale.", S2["check"])]
    story += [Spacer(1, 4 * mm), _signature_block(signer, signature, meta["signed_at"], city), _legal_box(meta)]
    doc.build(story)
    return buf.getvalue()
