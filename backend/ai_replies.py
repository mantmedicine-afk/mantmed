"""MantAI Risposte: classificazione dei messaggi del portale, bozze di risposta con revisione del medico, risposte amministrative automatiche e messaggio fisso di urgenza."""
import asyncio
import json
import logging
import os
import re
import uuid
from datetime import datetime, timezone, timedelta
from html import escape as hesc
from typing import Literal, Optional
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from emergentintegrations.llm.chat import LlmChat, UserMessage, TextDelta, StreamDone
from auth import require_role
from crypto import seal_fields, unseal_fields
from mailer import send_email
from registration import mail_shell
from messaging import HOOKS, T_SEALED, M_SEALED, add_message, notify_parents, KIND_LABEL

log = logging.getLogger(__name__)
LLM_KEY = os.environ["EMERGENT_LLM_KEY"]
MODEL = ("anthropic", "claude-opus-5-5")
CATS = ("urgenza", "clinico", "amministrativo")
PRUDENCE = {c: i for i, c in enumerate(CATS)}
DEFAULT_URGENT = ("Se il bambino ha difficoltà a respirare, perde conoscenza, ha convulsioni o sta molto male, chiama subito il 112/118. "
                  "Fuori dagli orari dello studio puoi rivolgerti alla Guardia Medica. Il tuo messaggio è stato segnalato al medico.")
ACK = "Il tuo messaggio è stato ricevuto. Il medico ti risponderà appena possibile."
LABEL_AUTO = "Risposta automatica di MantAI"
LABEL_SYSTEM = "Messaggio automatico di MantAI"
KB_FIELDS = ("hours", "address", "booking", "fees", "cancellation", "signature")
DISCARD_TTL_DAYS = 30

URGENT_RE = re.compile("|".join([
    r"non respir", r"respira (male|a fatica|con fatica)", r"fatica a respirare", r"difficolt\w* (a|di|nel) respir", r"affann", r"soffoc", r"cianotic", r"labbra (blu|viola)",
    r"convulsion", r"convuls", r"crisi epilett", r"spasm[io] (?:in tutto|generalizz)", r"svenut", r"svenimento", r"perso (i )?(la )?conoscenza", r"perdita di coscienza", r"incosciente", r"non (si )?risponde",
    r"sangue", r"sanguin", r"emorragi", r"vomit\w* (sangue|nero)", r"ingerit", r"ingoiat", r"ha (mangiato|bevuto) (un|una|del|della|dei|delle) (detersiv|farmac|medicin|pastigli|batteri|candeggin|pila)", r"intossica", r"avvelena",
    r"anafilass", r"gonfi\w* (la )?(gola|lingua|labbra|viso)", r"orticaria (diffusa|ovunque)", r"shock", r"trauma cranico", r"(battuto|sbattuto) (la )?testa", r"caduto (di testa|dal fasciatoio|dal letto)",
    r"suicid", r"farmi del male", r"farsi del male", r"autolesion", r"tagliat\w* (le|i) (vene|polsi)", r"non vuole pi[uù] vivere",
    r"(neonato|neonata|\d+ (giorni|settimane)|[12] mes[ei]).{0,40}febbre|febbre.{0,40}(neonato|neonata|\d+ (giorni|settimane)|[12] mes[ei])",
]), re.I)
CLINICAL_OUT_RE = re.compile(r"\b(mg|ml|gocce|compress|supposte|sciropp|paracetamolo|tachipirina|ibuprofene|nurofen|antibiotic|cortison|dosaggi|dose|diagnos)", re.I)
CF_RE = re.compile(r"\b[A-Z]{6}[0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]\b", re.I)
EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
PHONE_RE = re.compile(r"\+?\d[\d \-]{7,}\d")

SYSTEM_DRAFT = ("Sei l'assistente di segreteria di uno studio medico pediatrico/specialistico italiano. Prepari BOZZE di risposta che il medico rivedrà. "
                "Scrivi in italiano, con un tono {tone}, in modo breve e chiaro. Non formulare diagnosi, non indicare farmaci o dosaggi, non rassicurare sull'assenza di gravità "
                "e non sconsigliare mai una visita. Per le domande cliniche, scrivi una bozza che il medico possa completare: riconosci la domanda, poni eventuali domande utili "
                "(da quanti giorni, febbre, come sta mangiando…) e, se opportuno, proponi di fissare una visita. Se compaiono segnali di urgenza, invita a chiamare il 112/118. "
                "Per le domande amministrative usa SOLO le informazioni fornite nella base di conoscenza; se mancano, scrivi che lo studio risponderà a breve. Non inventare mai informazioni. "
                "I segnaposto come [BAMBINO] e [GENITORE] vanno lasciati invariati. Restituisci solo il testo della bozza in testo semplice (niente markdown, asterischi o titoli), senza firma e senza commenti.")
SYSTEM_CLASSIFY = ("Classifica il messaggio di una famiglia allo studio medico in UNA categoria: \"amministrativo\" (orari, indirizzo, prenotare/spostare/annullare, documenti e ricevute, "
                   "costi delle prestazioni private, uso del portale), \"clinico\" (qualsiasi riferimento a salute, sintomi, farmaci, referti, crescita, vaccini, alimentazione del bambino), "
                   "\"urgenza\" (difficoltà respiratoria, convulsioni, perdita di coscienza, febbre in neonato sotto 3 mesi, sangue, sospetta intossicazione o ingestione, reazione allergica grave, "
                   "trauma cranico, pensieri di autolesionismo e simili). In caso di dubbio scegli la più prudente: urgenza > clinico > amministrativo. "
                   "Rispondi solo con JSON: {\"categoria\": \"...\"}")
SYSTEM_ADMIN = SYSTEM_DRAFT + (" Questa è una domanda amministrativa. Rispondi solo con JSON: {\"risposta_possibile\": true|false, \"testo\": \"...\"}. "
                               "risposta_possibile è true SOLO se tutte le informazioni necessarie sono scritte esplicitamente nella base di conoscenza; altrimenti false.")


def _now():
    return datetime.now(timezone.utc).isoformat()


def prudent(*cats) -> str:
    return min((c for c in cats if c in PRUDENCE), key=PRUDENCE.get, default="clinico")


def tone_text(kb: dict) -> str:
    return f"{'cordiale' if kb.get('tone') == 'cordiale' else 'formale'}, dando del {'tu' if kb.get('address') == 'tu' else 'Lei'}"


def _json(text: str) -> dict:
    m = re.search(r"\{.*\}", text or "", re.S)
    return json.loads(m.group(0)) if m else {}


async def llm(system: str, text: str) -> str:
    chat = LlmChat(api_key=LLM_KEY, session_id=f"air-{uuid.uuid4()}", system_message=system).with_model(*MODEL)
    out = []
    async def run():
        async for ev in chat.stream_message(UserMessage(text=text)):
            if isinstance(ev, TextDelta):
                out.append(ev.content)
            elif isinstance(ev, StreamDone):
                break
    await asyncio.wait_for(run(), timeout=90)
    return "".join(out).strip()


class Pseudo:
    def __init__(self, child: str, parent: str):
        self.map = []
        for full, tag in ((child, "[BAMBINO]"), (parent, "[GENITORE]")):
            parts = [p for p in (full or "").split() if len(p) > 2]
            for token in sorted({full.strip(), *parts}, key=len, reverse=True):
                if token:
                    self.map.append((re.compile(rf"\b{re.escape(token)}\b", re.I), tag, full.split()[0] if full else ""))

    def hide(self, text: str) -> str:
        for rx, tag, _ in self.map:
            text = rx.sub(tag, text)
        return PHONE_RE.sub("[TELEFONO]", EMAIL_RE.sub("[EMAIL]", CF_RE.sub("[CODICE FISCALE]", text)))

    def show(self, text: str) -> str:
        for _, tag, first in self.map:
            if first:
                text = text.replace(tag, first)
        return text


def age_text(birth: Optional[str]) -> str:
    try:
        b = datetime.fromisoformat(birth[:10]).date()
    except Exception:  # noqa: BLE001
        return "non indicata"
    t = datetime.now(timezone.utc).date()
    months = (t.year - b.year) * 12 + t.month - b.month - (t.day < b.day)
    return f"{months} mesi" if months < 24 else f"{months // 12} anni"


def kb_text(kb: dict) -> str:
    rows = [("Orari", kb.get("hours")), ("Indirizzo", kb.get("address")), ("Prenotazioni", kb.get("booking")), ("Tariffe prestazioni private", kb.get("fees")),
            ("Politica di cancellazione", kb.get("cancellation"))]
    rows += [(f"FAQ: {f.get('q', '')}", f.get("a")) for f in kb.get("faqs") or []]
    filled = [f"- {k}: {v.strip()}" for k, v in rows if (v or "").strip()]
    return "\n".join(filled) if filled else "(base di conoscenza vuota)"


class SettingsIn(BaseModel):
    clinic: str = Field(min_length=1, max_length=120)
    enabled: bool = False
    auto_admin: bool = False
    urgent_text: str = Field(default=DEFAULT_URGENT, min_length=20, max_length=800)


class FaqIn(BaseModel):
    q: str = Field(max_length=300)
    a: str = Field(max_length=1500)


class KbIn(BaseModel):
    clinic: str = Field(min_length=1, max_length=120)
    hours: str = Field(default="", max_length=1500)
    address: str = Field(default="", max_length=500)
    booking: str = Field(default="", max_length=1500)
    fees: str = Field(default="", max_length=1500)
    cancellation: str = Field(default="", max_length=1500)
    faqs: list[FaqIn] = Field(default_factory=list, max_length=30)
    signature: str = Field(default="", max_length=300)
    tone: Literal["formale", "cordiale"] = "formale"
    address_form: Literal["lei", "tu"] = "lei"


class ApproveIn(BaseModel):
    text: str = Field(min_length=2, max_length=4000)


class CategoryIn(BaseModel):
    category: Literal["urgenza", "clinico", "amministrativo"]


class ClinicIn(BaseModel):
    clinic: str = Field(min_length=1, max_length=120)


def build_ai_replies(db, current_user):
    r = APIRouter(prefix="/ai-replies", dependencies=[Depends(require_role(current_user, "doctor"))])

    async def audit(owner: str, action: str, message_id: str, actor: Optional[str] = None, **extra):
        await db.audit.insert_one({"action": action, "subject": seal_fields({"s": f"Messaggio {message_id}"}, ("s",))["s"], "at": _now(), "owner_id": owner,
                                   "actor_id": actor or "mantai", "message_id": message_id, **extra})

    async def clinics_of(owner: str) -> list:
        d = await db.users.find_one({"_id": ObjectId(owner)}, {"clinics": 1}) or {}
        return [c["name"] for c in d.get("clinics") or []] or ["Studio principale"]

    async def settings_of(owner: str, clinic: str) -> dict:
        s = await db.ai_reply_settings.find_one({"owner_id": owner, "clinic": clinic}) or {}
        return {"clinic": clinic, "enabled": bool(s.get("enabled")), "auto_admin": bool(s.get("auto_admin")), "urgent_text": s.get("urgent_text") or DEFAULT_URGENT}

    async def kb_of(owner: str, clinic: str) -> dict:
        k = unseal_fields(await db.ai_knowledge_base.find_one({"owner_id": owner, "clinic": clinic}) or {}, (*KB_FIELDS, "faqs"))
        return {"clinic": clinic, **{f: k.get(f) or "" for f in KB_FIELDS}, "faqs": k.get("faqs") or [], "tone": k.get("tone", "formale"), "address_form": k.get("address_form", "lei")}

    async def clinic_for(t: dict) -> str:
        names = await clinics_of(t["owner_id"])
        today = datetime.now(timezone.utc).date().isoformat()
        q = {"patient_id": t["patient_id"], "owner_id": t["owner_id"]}
        a = await db.appointments.find_one({**q, "status": "programmato", "date": {"$gte": today}}, sort=[("date", 1), ("time", 1)]) \
            or await db.appointments.find_one(q, sort=[("date", -1)])
        return a["clinic"] if a and a.get("clinic") in names else names[0]

    async def refresh_thread(tid: str):
        pending = await db.ai_reply_drafts.find({"thread_id": tid, "status": "in_attesa"}).to_list(50)
        await db.threads.update_one({"_id": ObjectId(tid)}, {"$set": {"ai_pending": bool(pending), "ai_urgent": any(d["category"] == "urgenza" for d in pending)}})

    async def urgent_alert(t: dict):
        d = await db.users.find_one({"_id": ObjectId(t["owner_id"])}) or {}
        if d.get("email"):
            try:
                await send_email(to=d["email"], subject="MantMed · messaggio da gestire con priorità", html=mail_shell("AVVISO PRIORITARIO",
                    "<p>Un messaggio ricevuto nel Portale Paziente è stato segnalato come <strong>possibile urgenza</strong>.</p>"
                    "<p>Acceda a MantMed › Messaggi › Coda risposte. Per riservatezza questa email non contiene dati clinici.</p>"))
            except Exception:  # noqa: BLE001
                log.exception("Email urgenza non inviata")

    async def generate(system: str, ps: Pseudo, kb: dict, age: str, history: list, current: str) -> str:
        hist = "\n".join(f"{'Famiglia' if m['from'] == 'parent' else 'Studio'}: {ps.hide(m['body'])}" for m in history)
        return await llm(system, f"Base di conoscenza dello studio:\n{kb_text(kb)}\n\nEtà del bambino: {age}\n\nUltimi messaggi:\n{hist or '(nessuno)'}\n\nMessaggio da gestire:\n{ps.hide(current)}")

    async def process(tid: str, mid: str):
        try:
            t = await db.threads.find_one({"_id": ObjectId(tid)})
            m = await db.messages.find_one({"_id": ObjectId(mid)})
            if not t or not m:
                return
            clinic = t.get("ai_clinic") or await clinic_for(t)
            st = await settings_of(t["owner_id"], clinic)
            if not st["enabled"]:
                return
            await db.threads.update_one({"_id": t["_id"]}, {"$set": {"ai_clinic": clinic}})
            names = unseal_fields(t, T_SEALED)
            current = unseal_fields(m, M_SEALED)["body"]
            fields = unseal_fields(m, M_SEALED).get("fields") or []
            current = current + "".join(f"\n{f['label']}: {f['value']}" for f in fields)
            prior = await db.messages.find({"thread_id": tid, "_id": {"$ne": m["_id"]}, "from": {"$in": ["parent", "doctor"]}}).sort("created_at", -1).limit(5).to_list(5)
            history = [{"from": x["from"], "body": unseal_fields(x, M_SEALED)["body"]} for x in reversed(prior)]
            p = await db.patients.find_one({"_id": ObjectId(t["patient_id"])}, {"birth_date": 1}) or {}
            age = age_text(unseal_fields(p, ("birth_date",)).get("birth_date"))
            kb = await kb_of(t["owner_id"], clinic)
            ps = Pseudo(names["patient_name"], names["parent_name"])
            keyword = "urgenza" if URGENT_RE.search(current) else None
            try:
                ai_cat = _json(await llm(SYSTEM_CLASSIFY, ps.hide(current))).get("categoria")
            except Exception:  # noqa: BLE001
                log.exception("Classificazione MantAI non riuscita")
                ai_cat = None
            if ai_cat is None and not keyword:
                return
            cat = prudent(ai_cat, keyword or "amministrativo") if ai_cat else "urgenza"
            await db.threads.update_one({"_id": t["_id"]}, {"$set": {"ai_category": cat}})
            await audit(t["owner_id"], "mantai_classificazione", mid, category=cat, keyword_hit=bool(keyword))
            base = {"message_id": mid, "thread_id": tid, "doctor_id": t["owner_id"], "studio_id": clinic, "category": cat, "created_at": m["created_at"], "updated_at": _now(), "editor_id": None}
            if cat == "urgenza":
                await add_message(db, t, "system", "MantAI", st["urgent_text"], ai_label=LABEL_SYSTEM)
                await audit(t["owner_id"], "mantai_messaggio_urgenza_inviato", mid)
                await db.threads.update_one({"_id": t["_id"]}, {"$set": {"ai_urgent": True, "ai_pending": True}})
                asyncio.create_task(urgent_alert(t))
            if cat == "amministrativo" and st["auto_admin"] and kb_text(kb) != "(base di conoscenza vuota)":
                try:
                    res = _json(await generate(SYSTEM_ADMIN.replace("{tone}", tone_text({"tone": kb["tone"], "address": kb["address_form"]})), ps, kb, age, history, current))
                except Exception:  # noqa: BLE001
                    log.exception("Risposta amministrativa MantAI non riuscita")
                    res = {}
                text = ps.show((res.get("testo") or "").replace("**", "")).strip()
                if res.get("risposta_possibile") is True and text and not CLINICAL_OUT_RE.search(text) and not re.search(r"\[[A-Z ]+\]", text):
                    final = text + (f"\n\n{kb['signature']}" if kb["signature"] else "")
                    await add_message(db, t, "doctor", t.get("doctor_name", "Studio"), final, ai_label=LABEL_AUTO)
                    await db.ai_reply_drafts.insert_one({**base, "status": "inviata", "auto": True, **seal_fields({"text": final}, ("text",))})
                    await notify_parents(db, t["patient_id"], t["owner_id"], "reply", f"{t.get('doctor_name', 'Lo studio')} ha risposto", KIND_LABEL[t["kind"]], ref=tid, only=t["parent_id"])
                    await audit(t["owner_id"], "mantai_invio_automatico", mid)
                    return
            try:
                draft = await generate(SYSTEM_DRAFT.replace("{tone}", tone_text({"tone": kb["tone"], "address": kb["address_form"]})), ps, kb, age, history, current)
                draft = ps.show(draft.replace("**", "")) + (f"\n\n{kb['signature']}" if kb["signature"] else "")
                failed = False
            except Exception:  # noqa: BLE001
                log.exception("Bozza MantAI non generata")
                draft, failed = "", True
            await db.ai_reply_drafts.insert_one({**base, "status": "in_attesa", "ai_failed": failed, **seal_fields({"text": draft}, ("text",))})
            await audit(t["owner_id"], "mantai_bozza_generata" if not failed else "mantai_bozza_non_generata", mid, category=cat)
            if cat != "urgenza":
                await add_message(db, t, "system", "MantAI", ACK, ai_label=LABEL_SYSTEM)
            await refresh_thread(tid)
        except Exception:  # noqa: BLE001
            log.exception("Elaborazione MantAI Risposte non riuscita")

    async def superseded(tid: str, user: dict):
        async for d in db.ai_reply_drafts.find({"thread_id": tid, "doctor_id": user["id"], "status": "in_attesa"}):
            await db.ai_reply_drafts.update_one({"_id": d["_id"]}, {"$set": {"status": "gestita", "updated_at": _now(), "editor_id": user["id"]}})
            await audit(user["id"], "mantai_bozza_superata_da_risposta_manuale", d["message_id"], user["id"])
        await refresh_thread(tid)

    HOOKS["parent_message"] = process
    HOOKS["doctor_reply"] = superseded

    async def draft_doc(did: str, user: dict) -> dict:
        d = await db.ai_reply_drafts.find_one({"_id": ObjectId(did), "doctor_id": user["id"]}) if ObjectId.is_valid(did) else None
        if not d:
            raise HTTPException(404, "Bozza non trovata")
        return d

    async def draft_out(d: dict, full: bool = False) -> dict:
        t = await db.threads.find_one({"_id": ObjectId(d["thread_id"])}) or {}
        names = unseal_fields(t, T_SEALED) if t else {}
        m = await db.messages.find_one({"_id": ObjectId(d["message_id"])}) or {}
        mu = unseal_fields(m, M_SEALED) if m else {}
        out = {"id": str(d["_id"]), "message_id": d["message_id"], "thread_id": d["thread_id"], "clinic": d["studio_id"], "category": d["category"], "status": d["status"],
               "created_at": d["created_at"], "ai_failed": bool(d.get("ai_failed")), "patient_name": names.get("patient_name", ""), "parent_name": names.get("parent_name", ""),
               "subject": names.get("subject", ""), "original": mu.get("body", ""), "fields": mu.get("fields") or []}
        if full:
            hist = await db.messages.find({"thread_id": d["thread_id"], "created_at": {"$lt": d["created_at"]}}).sort("created_at", -1).limit(5).to_list(5)
            out["history"] = [{"from": x["from"], "author": x.get("author", ""), "created_at": x["created_at"], "body": unseal_fields(x, M_SEALED)["body"], "ai_label": x.get("ai_label")} for x in reversed(hist)]
            out["text"] = unseal_fields(d, ("text",))["text"]
            out["clinics"] = await clinics_of(d["doctor_id"])
        return out

    async def close(d: dict, user: dict, status: str, action: str):
        await db.ai_reply_drafts.update_one({"_id": d["_id"]}, {"$set": {"status": status, "updated_at": _now(), "editor_id": user["id"], **({"discarded_at": _now()} if status == "scartata" else {})}})
        await audit(user["id"], action, d["message_id"], user["id"])
        await refresh_thread(d["thread_id"])

    @r.get("/queue")
    async def queue(user: dict = Depends(current_user)):
        await db.ai_reply_drafts.delete_many({"status": "scartata", "discarded_at": {"$lt": (datetime.now(timezone.utc) - timedelta(days=DISCARD_TTL_DAYS)).isoformat()}})
        items = [await draft_out(d) async for d in db.ai_reply_drafts.find({"doctor_id": user["id"], "status": "in_attesa"})]
        items.sort(key=lambda x: (PRUDENCE[x["category"]], x["created_at"]))
        return {"items": items, "count": len(items), "urgent": sum(1 for x in items if x["category"] == "urgenza")}

    @r.get("/settings")
    async def get_settings(user: dict = Depends(current_user)):
        return {"clinics": [await settings_of(user["id"], c) for c in await clinics_of(user["id"])], "default_urgent": DEFAULT_URGENT}

    @r.put("/settings")
    async def put_settings(body: SettingsIn, user: dict = Depends(current_user)):
        if body.clinic not in await clinics_of(user["id"]):
            raise HTTPException(404, "Studio non trovato")
        await db.ai_reply_settings.update_one({"owner_id": user["id"], "clinic": body.clinic}, {"$set": {**body.model_dump(), "updated_at": _now()}}, upsert=True)
        await audit(user["id"], "mantai_impostazioni_aggiornate", "-", user["id"], clinic=body.clinic, enabled=body.enabled, auto_admin=body.auto_admin)
        return await settings_of(user["id"], body.clinic)

    @r.get("/knowledge-base")
    async def get_kb(user: dict = Depends(current_user)):
        return {"clinics": [await kb_of(user["id"], c) for c in await clinics_of(user["id"])]}

    @r.put("/knowledge-base")
    async def put_kb(body: KbIn, user: dict = Depends(current_user)):
        if body.clinic not in await clinics_of(user["id"]):
            raise HTTPException(404, "Studio non trovato")
        data = body.model_dump()
        sealed = seal_fields({k: data[k] for k in (*KB_FIELDS, "faqs")}, (*KB_FIELDS, "faqs"))
        await db.ai_knowledge_base.update_one({"owner_id": user["id"], "clinic": body.clinic},
                                              {"$set": {**sealed, "tone": body.tone, "address_form": body.address_form, "updated_at": _now()}}, upsert=True)
        await audit(user["id"], "mantai_base_conoscenza_aggiornata", "-", user["id"], clinic=body.clinic)
        return await kb_of(user["id"], body.clinic)

    @r.get("/{did}")
    async def get_draft(did: str, user: dict = Depends(current_user)):
        return await draft_out(await draft_doc(did, user), full=True)

    @r.post("/{did}/approve")
    async def approve(did: str, body: ApproveIn, user: dict = Depends(current_user)):
        d = await draft_doc(did, user)
        if d["status"] != "in_attesa":
            raise HTTPException(400, "Bozza già gestita")
        t = await db.threads.find_one({"_id": ObjectId(d["thread_id"]), "owner_id": user["id"]})
        if not t:
            raise HTTPException(404, "Conversazione non trovata")
        edited = body.text.strip() != unseal_fields(d, ("text",))["text"].strip()
        await add_message(db, t, "doctor", user["name"], body.text, ai_label=f"Risposta preparata con l'assistenza di MantAI e verificata da {user['name']}")
        await db.ai_reply_drafts.update_one({"_id": d["_id"]}, {"$set": {"status": "inviata", "edited": edited, "updated_at": _now(), "editor_id": user["id"], **seal_fields({"text": body.text.strip()}, ("text",))}})
        if edited:
            await audit(user["id"], "mantai_bozza_modificata", d["message_id"], user["id"])
        await audit(user["id"], "mantai_bozza_approvata_inviata", d["message_id"], user["id"])
        pname = unseal_fields(t, T_SEALED)["patient_name"]
        await notify_parents(db, t["patient_id"], t["owner_id"], "reply", f"{user['name']} ha risposto", f"{KIND_LABEL[t['kind']]} · {pname}", ref=d["thread_id"], only=t["parent_id"])
        await refresh_thread(d["thread_id"])
        return {"status": "inviata", "edited": edited}

    @r.post("/{did}/discard")
    async def discard(did: str, user: dict = Depends(current_user)):
        d = await draft_doc(did, user)
        await close(d, user, "scartata", "mantai_bozza_scartata")
        return {"status": "scartata", "thread_id": d["thread_id"]}

    @r.post("/{did}/handled")
    async def handled(did: str, user: dict = Depends(current_user)):
        d = await draft_doc(did, user)
        await close(d, user, "gestita", "mantai_bozza_gestita_senza_risposta")
        return {"status": "gestita"}

    @r.patch("/{did}/category")
    async def category(did: str, body: CategoryIn, user: dict = Depends(current_user)):
        d = await draft_doc(did, user)
        await db.ai_reply_drafts.update_one({"_id": d["_id"]}, {"$set": {"category": body.category, "updated_at": _now(), "editor_id": user["id"]}})
        await db.threads.update_one({"_id": ObjectId(d["thread_id"])}, {"$set": {"ai_category": body.category}})
        await audit(user["id"], "mantai_categoria_corretta", d["message_id"], user["id"], old=d["category"], new=body.category)
        await refresh_thread(d["thread_id"])
        return {"category": body.category}

    @r.patch("/{did}/clinic")
    async def clinic(did: str, body: ClinicIn, user: dict = Depends(current_user)):
        d = await draft_doc(did, user)
        if body.clinic not in await clinics_of(user["id"]):
            raise HTTPException(404, "Studio non trovato")
        await db.ai_reply_drafts.update_one({"_id": d["_id"]}, {"$set": {"studio_id": body.clinic, "updated_at": _now()}})
        await db.threads.update_one({"_id": ObjectId(d["thread_id"])}, {"$set": {"ai_clinic": body.clinic}})
        await audit(user["id"], "mantai_studio_corretto", d["message_id"], user["id"], clinic=body.clinic)
        return {"clinic": body.clinic}

    return r
