import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, Check, CheckCheck, Inbox, Loader2, PencilLine, Send, Sparkles, Trash2 } from "lucide-react";
import { api, errMsg } from "@/lib/api";
import { when } from "@/components/portal/Conversation";

export const CAT = {
  urgenza: ["Possibile urgenza", "bg-rose-600 text-white"],
  clinico: ["Clinico", "bg-amber-100 text-amber-900"],
  amministrativo: ["Amministrativo", "bg-sky-100 text-sky-900"],
};
const VISIT_RE = /\b(fiss|prenot|programm|organizz|propon|consigli|vedere|valut)\w*[^.?!]*\b(visita|appuntamento|controllo)|\b(visita|appuntamento|controllo) in studio|\bvenire in studio/i;

const CatChip = ({ c, testId }) => <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${CAT[c][1]}`} data-testid={testId}>{CAT[c][0]}</span>;

const Highlighted = ({ text }) => (
  <div className="whitespace-pre-wrap rounded-2xl bg-[#F4F5F7] p-4 text-sm leading-relaxed text-night" data-testid="ai-draft-preview">
    {text.split(/(?<=[.!?\n])/).map((s, i) => VISIT_RE.test(s)
      ? <mark key={i} className="rounded bg-emerald-100 px-0.5 text-emerald-900" data-testid="ai-draft-visit-highlight">{s}</mark> : <span key={i}>{s}</span>)}
  </div>
);

const QueueRow = ({ d, onOpen }) => (
  <button onClick={() => onOpen(d.id)} className={`w-full rounded-2xl border p-3 text-left transition-colors hover:border-night ${d.category === "urgenza" ? "border-rose-300 bg-rose-50" : "border-slate-200 bg-white"}`} data-testid={`ai-queue-row-${d.id}`}>
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0"><div className="truncate text-sm font-semibold text-night">{d.patient_name}</div><div className="truncate text-xs text-slate-600">{d.original}</div></div>
      <CatChip c={d.category} testId={`ai-queue-cat-${d.id}`} />
    </div>
    <div className="mt-1 text-[11px] text-slate-600">{d.clinic} · {when(d.created_at)}{d.ai_failed ? " · bozza non disponibile" : ""}</div>
  </button>
);

const DraftEditor = ({ id, onDone, onBack, onOpenThread, onChanged }) => {
  const [d, setD] = useState(null);
  const [text, setText] = useState("");
  const [edit, setEdit] = useState(false);
  const [busy, setBusy] = useState("");
  useEffect(() => { setD(null); setEdit(false); api.aiDraft(id).then((x) => { setD(x); setText(x.text); setEdit(!x.text); }).catch((e) => toast.error(errMsg(e))); }, [id]);
  if (!d) return <div className="grid min-h-[300px] place-items-center"><Loader2 className="animate-spin text-night" /></div>;
  const run = async (key, fn, msg) => { setBusy(key); try { const r = await fn(); toast.success(msg); onDone(r); setBusy(""); return true; } catch (e) { toast.error(errMsg(e)); setBusy(""); return false; } };
  const patch = async (fn, val, msg) => { try { await fn(id, val); setD((x) => ({ ...x, ...(fn === api.aiCategory ? { category: val } : { clinic: val }) })); toast.success(msg); onChanged(); } catch (e) { toast.error(errMsg(e)); } };
  const sel = "h-9 rounded-full border border-slate-200 bg-white px-3 text-xs text-night outline-none focus:border-night";
  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4 sm:p-5" data-testid="ai-draft-editor">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={onBack} className="grid h-9 w-9 place-items-center rounded-full border border-slate-200 lg:hidden" aria-label="Indietro" data-testid="ai-draft-back"><ArrowLeft size={15} /></button>
        <span className="font-semibold text-night">{d.patient_name}</span><span className="text-xs text-slate-600">scrive {d.parent_name} · {d.subject}</span>
      </div>
      {d.category === "urgenza" && <p className="flex items-start gap-2 rounded-2xl bg-rose-600 p-3 text-sm text-white" data-testid="ai-draft-urgent-banner"><AlertTriangle size={16} className="mt-0.5 shrink-0" /> Possibile urgenza: alla famiglia è già stato inviato il messaggio fisso con l'invito a chiamare il 112/118. Valuti di contattarla direttamente.</p>}
      <div className="flex flex-wrap gap-2">
        <label className="flex items-center gap-2 text-xs text-slate-600">Categoria
          <select value={d.category} onChange={(e) => patch(api.aiCategory, e.target.value, "Categoria aggiornata")} className={sel} data-testid="ai-draft-category">{Object.entries(CAT).map(([k, v]) => <option key={k} value={k}>{v[0]}</option>)}</select></label>
        <label className="flex items-center gap-2 text-xs text-slate-600">Studio
          <select value={d.clinic} onChange={(e) => patch(api.aiClinic, e.target.value, "Studio aggiornato")} className={sel} data-testid="ai-draft-clinic">{d.clinics.map((c) => <option key={c}>{c}</option>)}</select></label>
      </div>
      {d.history.length > 0 && <div className="space-y-1.5 rounded-2xl border border-slate-200 p-3" data-testid="ai-draft-history"><div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Storico recente</div>
        {d.history.map((h, i) => <p key={i} className="text-xs text-slate-600"><span className="font-semibold">{h.from === "parent" ? "Famiglia" : h.from === "system" ? "MantAI" : "Studio"}:</span> {h.body}</p>)}</div>}
      <div><div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Messaggio della famiglia</div>
        <p className="mt-1 whitespace-pre-wrap rounded-2xl border border-slate-200 bg-white p-4 text-sm text-night" data-testid="ai-draft-original">{d.original}</p>
        {d.fields.length > 0 && <p className="mt-1 text-xs text-slate-600">{d.fields.map((f) => `${f.label}: ${f.value}`).join(" · ")}</p>}</div>
      <div><div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-[#3B6CF6]"><Sparkles size={12} /> Bozza MantAI {d.ai_failed && "· non disponibile, scriva la risposta"}</div>
        <div className="mt-1">{edit
          ? <textarea value={text} onChange={(e) => setText(e.target.value)} rows={10} maxLength={4000} className="w-full rounded-2xl border border-slate-200 p-4 text-sm leading-relaxed outline-none focus:border-night" data-testid="ai-draft-textarea" />
          : <Highlighted text={text} />}</div>
        <p className="mt-1 text-[11px] text-slate-500">In verde le frasi in cui MantAI propone una visita. La famiglia vedrà: "Risposta preparata con l'assistenza di MantAI e verificata da lei".</p></div>
      <div className="flex flex-wrap gap-2">
        {!edit && <button onClick={() => run("ok", () => api.aiApprove(id, text), "Risposta approvata e inviata")} disabled={!!busy || text.trim().length < 2} className="flex h-11 items-center gap-2 rounded-full bg-night px-5 text-sm font-semibold text-white disabled:opacity-50" data-testid="ai-draft-approve">{busy === "ok" ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Approva e invia</button>}
        {edit ? <button onClick={() => run("ok", () => api.aiApprove(id, text), "Risposta modificata e inviata")} disabled={!!busy || text.trim().length < 2} className="flex h-11 items-center gap-2 rounded-full bg-night px-5 text-sm font-semibold text-white disabled:opacity-50" data-testid="ai-draft-edit-send">{busy === "ok" ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Invia la versione modificata</button>
          : <button onClick={() => setEdit(true)} className="flex h-11 items-center gap-2 rounded-full border border-slate-200 px-5 text-sm text-night hover:border-night" data-testid="ai-draft-edit"><PencilLine size={15} /> Modifica e invia</button>}
        <button onClick={() => run("x", () => api.aiDiscard(id), "Bozza scartata").then((ok) => ok && onOpenThread(d.thread_id))} disabled={!!busy} className="flex h-11 items-center gap-2 rounded-full border border-slate-200 px-5 text-sm text-night hover:border-night" data-testid="ai-draft-discard"><Trash2 size={15} /> Scarta e rispondi da zero</button>
        <button onClick={() => run("h", () => api.aiHandled(id), "Segnato come gestito")} disabled={!!busy} className="flex h-11 items-center gap-2 rounded-full border border-slate-200 px-5 text-sm text-slate-600 hover:border-night" data-testid="ai-draft-handled"><CheckCheck size={15} /> Segna come gestito senza risposta</button>
      </div>
    </div>
  );
};

export const ReplyQueue = ({ queue, reload, onOpenThread }) => {
  const [active, setActive] = useState(null);
  const items = queue?.items ?? [];
  const done = () => { setActive(null); reload(); };
  return (
    <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[360px_1fr]" data-testid="ai-reply-queue">
      <div className={`${active ? "hidden lg:block" : ""} max-h-[640px] space-y-2 overflow-y-auto`}>
        {!queue && <div className="h-16 animate-pulse rounded-2xl bg-slate-100" />}
        {queue && items.length === 0 && <p className="flex items-center gap-2 rounded-2xl border border-dashed border-slate-300 p-5 text-sm text-slate-600" data-testid="ai-queue-empty"><Inbox size={16} /> Nessuna bozza in attesa.</p>}
        {items.map((d) => <QueueRow key={d.id} d={d} onOpen={setActive} />)}
      </div>
      <div className={`${active ? "flex" : "hidden lg:flex"} min-h-[300px] overflow-hidden rounded-2xl border border-slate-200 bg-white`}>
        {active ? <DraftEditor key={active} id={active} onDone={done} onBack={() => setActive(null)} onOpenThread={onOpenThread} onChanged={reload} />
          : <div className="grid flex-1 place-items-center p-6 text-center text-sm text-slate-600">Selezioni una bozza: nessuna risposta clinica viene inviata senza la sua approvazione.</div>}
      </div>
    </div>
  );
};
