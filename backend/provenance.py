"""Tracciabilità dei contenuti AI (ai_provenance): costruzione, revisione, registro GDPR, protezione e migrazione."""
import io
import json
import re
from datetime import datetime, timezone
from typing import Optional

import fitz
from bson import ObjectId
from starlette.responses import JSONResponse

from crypto import seal_fields

WHISPER = "OpenAI / whisper-1"
GPT = "OpenAI / gpt-5.6-terra"
CLAUDE = "Anthropic / claude-opus-5-5"
DRAFT, VERIFIED, AUTO = "bozza_non_verificata", "verificato_dal_medico", "invio_automatico"
UNKNOWN = "provenienza_non_determinabile"
PROTECTED = (b'"ai_provenance"', b'"ai_snapshot"')


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def make(tipo: str, modello: str, stato: str = DRAFT, at: Optional[str] = None) -> dict:
    return {"ai_generated": True, "tipo": tipo, "modello": modello, "generated_at": at or _now(), "stato_revisione": stato,
            "reviewed_by": None, "reviewed_at": None, "modificato_dal_medico": False}


def undetermined() -> dict:
    return {"ai_generated": None, "tipo": None, "modello": None, "generated_at": None, "stato_revisione": UNKNOWN,
            "reviewed_by": None, "reviewed_at": None, "modificato_dal_medico": None}


def reviewed(p: dict, uid: str, modified: Optional[bool], name: str = "", at: Optional[str] = None) -> dict:
    return {**p, "stato_revisione": VERIFIED, "reviewed_by": uid, "reviewed_at": at or _now(), "modificato_dal_medico": modified, "reviewer_name": name}


def note_tipo(template_name: str = "", fields=None, bilancio: bool = False) -> str:
    if bilancio or re.search(r"bilancio", template_name or "", re.I):
        return "bilancio"
    return "nota_clinica"


def is_draft(p: Optional[dict]) -> bool:
    return bool(p and p.get("ai_generated") is True and p.get("stato_revisione") == DRAFT)


async def log(db, owner: str, target: str, old: Optional[str], new: str, actor: Optional[str] = None, tipo: str = ""):
    """Ogni cambio di stato_revisione va nel registro attività GDPR."""
    label = f"{tipo or 'contenuto AI'} · {target} · {old or 'creato'} → {new}"
    await db.audit.insert_one({"action": f"ai_provenance_{new}", "subject": seal_fields({"s": label}, ("s",))["s"], "at": _now(),
                               "owner_id": owner, "actor_id": actor})


def _bare(name: str) -> str:
    return re.sub(r"^\s*(dott\.?\s*ssa|dott\.?|dr\.?|dr\.?ssa)\s+", "", name or "", flags=re.I).strip()


async def reviewer_label(db, uid: Optional[str], cache: Optional[dict] = None) -> str:
    if not uid or not ObjectId.is_valid(uid):
        return ""
    if cache is not None and uid in cache:
        return cache[uid]
    u = await db.users.find_one({"_id": ObjectId(uid)}, {"name": 1}) or {}
    name = u.get("name") or ""
    title = "Dott.ssa" if re.match(r"^\s*(dott\.?\s*ssa|dr\.?ssa)", name, re.I) else "Dott."
    out = f"{title} {_bare(name)}".strip() if name else ""
    if cache is not None:
        cache[uid] = out
    return out


async def present(db, p: Optional[dict], cache: Optional[dict] = None) -> Optional[dict]:
    """Copia per il frontend con il nome del medico revisore (titolo scelto dal medico)."""
    if not p:
        return None
    out = {k: v for k, v in p.items() if k != "parti"}
    if p.get("stato_revisione") == VERIFIED:
        out["reviewer_name"] = await reviewer_label(db, p.get("reviewed_by"), cache) or p.get("reviewer_name", "")
    if p.get("parti"):
        out["parti"] = {k: await present(db, v, cache) for k, v in p["parti"].items()}
    return out


# ---------- Campi compilati dall'AI (indicatori per campo) ----------
def field_values(note: Optional[dict]) -> dict:
    note = note or {}
    out = {k: v for k, v in note.items() if isinstance(v, str) and k != "specialita"}
    for s in note.get("sezioni") or []:
        out[f"sez:{(s.get('titolo') or '').strip().lower()}"] = s.get("testo") or ""
    out["farmaci"] = json.dumps([d.get("nome") for d in note.get("farmaci") or []])
    return out


def pending_fields(prov: Optional[dict], snap: Optional[dict], note: Optional[dict]) -> list:
    if not snap or not prov:
        return []
    a, b = field_values(snap), field_values(note)
    main = is_draft(prov)
    summ = is_draft((prov.get("parti") or {}).get("riassunto_famiglia"))
    keep = lambda k: (k == "riepilogo" and summ) or (k not in ("riepilogo", "farmaci") and main)
    return [k for k, v in a.items() if keep(k) and v.strip() and v.strip() != "Non riportato" and b.get(k) == v]


def changed(snap: Optional[dict], note: Optional[dict], keys=None) -> bool:
    a, b = field_values(snap), field_values(note)
    ks = keys or [k for k in a if k != "riepilogo"]
    return any(a.get(k, "") != b.get(k, "") for k in ks)


# ---------- PDF ----------
FOOTER_VERIFIED = "Documento redatto con il supporto di strumenti di intelligenza artificiale (MantAI), verificato e firmato dal medico."
FOOTER_DRAFT = "BOZZA generata con il supporto di MantAI: non ancora verificata né firmata dal medico."


def pdf_footer(p: Optional[dict]) -> str:
    if not p or p.get("ai_generated") is not True:
        return ""
    return FOOTER_VERIFIED if p.get("stato_revisione") == VERIFIED else FOOTER_DRAFT


def pdf_marks(p: Optional[dict]) -> dict:
    p = p or {}
    flag = {True: "true", False: "false"}.get(p.get("ai_generated"), "undetermined")
    return {"ai_assisted": flag, "tipo": p.get("tipo") or "", "stato_revisione": p.get("stato_revisione") or "", "modello": p.get("modello") or "",
            "reviewed_by": p.get("reviewed_by") or "", "reviewed_at": p.get("reviewed_at") or ""}


def mark_pdf(pdf: bytes, p: Optional[dict]) -> bytes:
    """Marcatura leggibile da macchina: Document Info (Keywords) + XMP con namespace mantai."""
    m = pdf_marks(p)
    doc = fitz.open(stream=pdf, filetype="pdf")
    meta = doc.metadata or {}
    meta["keywords"] = "; ".join(f"{k}={v}" for k, v in m.items())
    meta["subject"] = (meta.get("subject") or "Documento MantMed") + (" · redatto con il supporto di MantAI" if m["ai_assisted"] == "true" else "")
    doc.set_metadata(meta)
    attrs = " ".join(f'mantai:{k}="{v}"' for k, v in m.items())
    doc.set_xml_metadata('<?xpacket begin="\ufeff" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/">'
                         '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">'
                         f'<rdf:Description rdf:about="" xmlns:mantai="https://mantmed.it/ns/mantai/1.0/" {attrs}/>'
                         '</rdf:RDF></x:xmpmeta><?xpacket end="w"?>')
    out = io.BytesIO()
    doc.save(out, garbage=3, deflate=True)
    return out.getvalue()


# ---------- Protezione: ai_provenance non è scrivibile dal frontend ----------
class ProvenanceGuard:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope["method"] not in ("POST", "PUT", "PATCH", "DELETE") or not scope["path"].startswith("/api/"):
            return await self.app(scope, receive, send)
        ctype = dict(scope.get("headers") or []).get(b"content-type", b"")
        if b"json" not in ctype and b"x-www-form-urlencoded" not in ctype:
            return await self.app(scope, receive, send)
        chunks, more = [], True
        while more:
            m = await receive()
            if m["type"] != "http.request":
                break
            chunks.append(m.get("body", b""))
            more = m.get("more_body", False)
        body = b"".join(chunks)
        if any(k in body for k in PROTECTED) or b"ai_provenance=" in body:
            return await JSONResponse({"detail": "La provenienza dei contenuti AI (ai_provenance) non è modificabile: la aggiornano solo la revisione e la firma del medico."},
                                      status_code=403)(scope, receive, send)
        done = False

        async def replay():
            nonlocal done
            if not done:
                done = True
                return {"type": "http.request", "body": body, "more_body": False}
            return await receive()
        return await self.app(scope, replay, send)


# ---------- Migrazione dei dati esistenti ----------
async def migrate(db) -> dict:
    """Marca come AI solo ciò che è certo; il resto 'provenienza_non_determinabile'. Idempotente."""
    stats = {"consultazioni_ai": 0, "consultazioni_non_determinabili": 0, "messaggi_ai": 0, "bozze_ai": 0, "spiegazioni_semplici": 0}
    async for c in db.consultations.find({"ai_provenance": {"$exists": False}}):
        if (c.get("ai_sec") or 0) > 0 and c.get("status", "ready") == "ready":
            p = make(note_tipo(c.get("template_name", ""), c.get("template_fields")), GPT, at=c["created_at"])
            if c.get("report_sent_at") or c.get("portal_published"):
                p = reviewed(p, c.get("doctor_id") or c.get("owner_id"), None, at=c.get("finalized_at") or c["created_at"])
            stats["consultazioni_ai"] += 1
        else:
            p = undetermined()
            stats["consultazioni_non_determinabili"] += 1
        if c.get("simple"):
            p["parti"] = {"spiegazione_semplice": make("riassunto_famiglia", GPT, AUTO, at=c["created_at"])}
            stats["spiegazioni_semplici"] += 1
        await db.consultations.update_one({"_id": c["_id"]}, {"$set": {"ai_provenance": p}})
    async for m in db.messages.find({"ai_label": {"$exists": True}, "ai_provenance": {"$exists": False}}):
        label = m.get("ai_label") or ""
        if label.startswith("Risposta automatica di MantAI"):
            p = make("risposta_messaggio", CLAUDE, AUTO, at=m["created_at"])
        elif label.startswith("Risposta preparata con l'assistenza di MantAI"):
            t = await db.threads.find_one({"_id": ObjectId(m["thread_id"])}, {"owner_id": 1}) if ObjectId.is_valid(m.get("thread_id", "")) else None
            p = reviewed(make("risposta_messaggio", CLAUDE, at=m["created_at"]), (t or {}).get("owner_id"), None, at=m["created_at"])
        else:
            continue
        await db.messages.update_one({"_id": m["_id"]}, {"$set": {"ai_provenance": p}})
        stats["messaggi_ai"] += 1
    async for d in db.ai_reply_drafts.find({"ai_provenance": {"$exists": False}}):
        if d.get("ai_failed"):
            p = undetermined()
        elif d.get("status") == "inviata" and d.get("auto"):
            p = make("risposta_messaggio", CLAUDE, AUTO, at=d["created_at"])
        elif d.get("status") == "inviata":
            p = reviewed(make("risposta_messaggio", CLAUDE, at=d["created_at"]), d.get("editor_id"), bool(d.get("edited")), at=d.get("updated_at"))
        else:
            p = make("risposta_messaggio", CLAUDE, at=d["created_at"])
        await db.ai_reply_drafts.update_one({"_id": d["_id"]}, {"$set": {"ai_provenance": p}})
        stats["bozze_ai"] += 1
    if any(stats.values()):
        await db.meta.update_one({"_id": "ai_provenance_migration"}, {"$set": {**stats, "at": _now()}}, upsert=True)
        await db.audit.insert_one({"action": "ai_provenance_migrazione", "subject": seal_fields({"s": json.dumps(stats)}, ("s",))["s"], "at": _now()})
    return stats

