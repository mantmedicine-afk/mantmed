"""Portale: promemoria terapia in PDF dai farmaci indicati nei referti pubblicati (non sostituisce la ricetta)."""
import re
from datetime import datetime, timezone
from io import BytesIO
from html import escape as hesc

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Response
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

import report  # noqa: F401  registra i font Serif/Sans

NAVY = HexColor("#0A192F")
MUTED = HexColor("#5B6478")
S = {"h": ParagraphStyle("h", fontName="Serif", fontSize=26, leading=30, textColor=NAVY),
     "sub": ParagraphStyle("sub", fontName="Sans", fontSize=9, leading=12, textColor=MUTED),
     "b": ParagraphStyle("b", fontName="Sans", fontSize=9.5, leading=13, textColor=NAVY),
     "bb": ParagraphStyle("bb", fontName="SansB", fontSize=9.5, leading=13, textColor=NAVY)}


def num(v):
    return f"{v:g}" if isinstance(v, (int, float)) else ""


def drug_text(d: dict) -> str:
    parts = []
    if d.get("mg_kg_dose"):
        parts.append(f"{num(d['mg_kg_dose'])} mg/kg per dose")
    if d.get("dosi_giorno"):
        parts.append(f"{num(d['dosi_giorno'])} volte al giorno")
    if d.get("giorni"):
        parts.append(f"per {num(d['giorni'])} giorni")
    return ", ".join(parts)


def therapy_rows(reports: list) -> list:
    """Una riga per farmaco (o per terapia testuale) di ogni referto pubblicato."""
    rows = []
    for r in reports:
        note = r.get("note") or {}
        drugs = [d for d in note.get("farmaci") or [] if (d.get("nome") or "").strip()]
        for d in drugs:
            rows.append({"date": r["created_at"], "doctor": r["doctor"], "clinic": r.get("clinic", ""), "consultation_id": r["id"],
                         "farmaco": d["nome"].strip(), "posologia": drug_text(d), "note": (d.get("note") or "").strip(), "terapia": ""})
        if not drugs and (note.get("terapia") or "").strip() and not re.match(r"^(non riportat|nessun)", note["terapia"].strip(), re.I):
            rows.append({"date": r["created_at"], "doctor": r["doctor"], "clinic": r.get("clinic", ""), "consultation_id": r["id"],
                         "farmaco": "", "posologia": "", "note": "", "terapia": note["terapia"].strip()})
    return rows


def therapy_pdf(patient: str, rows: list) -> bytes:
    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=18 * mm, bottomMargin=18 * mm,
                            title=f"Promemoria terapia - {patient}")
    story = [Paragraph("MantMed", S["sub"]), Paragraph("Promemoria terapia", S["h"]),
             Paragraph(f"{hesc(patient)} · generato il {datetime.now(timezone.utc).strftime('%d/%m/%Y')}", S["sub"]), Spacer(1, 8 * mm)]
    data = [[Paragraph("Data", S["bb"]), Paragraph("Farmaco / terapia", S["bb"]), Paragraph("Come assumerlo", S["bb"]), Paragraph("Medico", S["bb"])]]
    for r in rows:
        what = r["farmaco"] or "Indicazioni"
        how = "; ".join(x for x in (r["posologia"], r["note"], r["terapia"]) if x)
        data.append([Paragraph(datetime.fromisoformat(r["date"]).strftime("%d/%m/%Y"), S["b"]), Paragraph(hesc(what), S["bb"]),
                     Paragraph(hesc(how) or "—", S["b"]), Paragraph(hesc(r["doctor"]), S["b"])])
    t = Table(data, colWidths=[24 * mm, 45 * mm, 70 * mm, 35 * mm], repeatRows=1)
    t.setStyle(TableStyle([("LINEBELOW", (0, 0), (-1, 0), 0.8, NAVY), ("LINEBELOW", (0, 1), (-1, -1), 0.3, HexColor("#D9DCE3")),
                           ("VALIGN", (0, 0), (-1, -1), "TOP"), ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5)]))
    story += [t, Spacer(1, 10 * mm),
              Paragraph("Questo promemoria riassume le indicazioni riportate nei referti e <b>non sostituisce la ricetta medica</b>. "
                        "Per dosi, durata e sospensioni segua sempre le indicazioni del medico; in caso di dubbi lo contatti.", S["sub"])]
    doc.build(story)
    return buf.getvalue()


def build_portal_docs(db, parent_user, consultation_model, patient_model):
    r = APIRouter(prefix="/portal")

    async def group_reports(user: dict, pid: str):
        """Referti pubblicati dello stesso bambino presso tutti i medici collegati (stesso codice fiscale)."""
        u = await db.users.find_one({"_id": ObjectId(user["id"])}, {"children": 1})
        links = (u or {}).get("children") or []
        link = next((c for c in links if c["patient_id"] == pid), None)
        p = await db.patients.find_one({"_id": ObjectId(pid), "owner_id": link["owner_id"]}) if link and ObjectId.is_valid(pid) else None
        if not p:
            raise HTTPException(404, "Cartella non collegata al suo account")
        same = [link]
        if p.get("cf_hash"):
            for c in links:
                if c is not link and ObjectId.is_valid(c["patient_id"]) and await db.patients.find_one({"_id": ObjectId(c["patient_id"]), "owner_id": c["owner_id"], "cf_hash": p["cf_hash"]}):
                    same.append(c)
        out = []
        for c in same:
            doc = await db.users.find_one({"_id": ObjectId(c["owner_id"])}, {"name": 1})
            async for raw in db.consultations.find({"patient_id": c["patient_id"], "owner_id": c["owner_id"],
                                                    "$or": [{"report_sent_at": {"$ne": None}}, {"portal_published": True}]}):
                x = consultation_model.from_mongo(raw).out()
                out.append({**x, "doctor": (doc or {}).get("name", "")})
        return patient_model.from_mongo(p).out(), sorted(out, key=lambda x: x["created_at"], reverse=True)

    @r.get("/children/{pid}/therapy")
    async def therapy(pid: str, user: dict = Depends(parent_user)):
        _, reports = await group_reports(user, pid)
        return therapy_rows(reports)

    @r.get("/children/{pid}/therapy/pdf")
    async def therapy_download(pid: str, user: dict = Depends(parent_user)):
        p, reports = await group_reports(user, pid)
        rows = therapy_rows(reports)
        if not rows:
            raise HTTPException(404, "Nessuna terapia nei referti pubblicati")
        name = f"Promemoria_terapia_{p['name'].replace(' ', '_')}.pdf"
        return Response(therapy_pdf(p["name"], rows), media_type="application/pdf", headers={"Content-Disposition": f"attachment; filename=\"{name}\""})

    return r
