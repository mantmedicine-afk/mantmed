import { useEffect, useRef, useState } from "react";
import { Loader2, Send, ArrowLeft, Check, CheckCheck, Reply, Lock, Hourglass, Paperclip, X } from "lucide-react";
import { toast } from "sonner";
import { UrgencyNotice } from "./UrgencyNotice";
import { Bubble, DaySeparator } from "./Bubble";
import { AiSuggestion } from "./AiSuggestion";

export const STATUS = {
  inviato: ["Ricevuto", "bg-[var(--hair)] text-[var(--fg2)]", Check],
  letto: ["Letto", "bg-[var(--sel)] text-[var(--fg)]", CheckCheck],
  in_attesa: ["In attesa del medico", "bg-[var(--sel)] text-[var(--fg)]", Hourglass],
  risposto: ["Risposto", "bg-[var(--sel)] text-[var(--ok)]", Reply],
};

export const StatusChip = ({ status, testId }) => {
  const [label, cls, Icon] = STATUS[status] ?? STATUS.inviato;
  return <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${cls}`} data-testid={testId}><Icon size={12} /> {label}</span>;
};

export const when = (iso) => {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return today ? d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }) : d.toLocaleDateString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
};

const ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf";
const MAX = 10 * 1024 * 1024;

/** Conversazione condivisa medico/genitore: fumetti, separatori di data, spunte, allegati, suggerimento MantAI (solo medico). */
export const Conversation = ({ data, side, onSend, onAttach, onBack, header, fill = false, draft, onUseDraft, onIgnoreDraft }) => {
  const [text, setText] = useState("");
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [usingDraft, setUsingDraft] = useState(null);
  const box = useRef(null);
  const pick = useRef(null);
  const msgs = Array.isArray(data?.messages) ? data.messages : [];
  const tid = data?.thread?.id;
  useEffect(() => { if (box.current) box.current.scrollTop = box.current.scrollHeight; }, [msgs.length, tid]);
  useEffect(() => { setText(""); setFile(null); setUsingDraft(null); }, [tid]);

  const choose = (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!ACCEPT.split(",").includes(f.type)) return toast.error("Si possono allegare solo foto o PDF");
    if (f.size > MAX) return toast.error("File troppo grande: massimo 10 MB");
    setFile(f);
  };
  const send = async (e) => {
    e.preventDefault();
    if (!text.trim() && !file) return;
    setBusy(true);
    const ok = file ? await onAttach(file, text.trim()) : usingDraft ? await onUseDraft(usingDraft, text.trim()) : await onSend(text.trim());
    if (ok) { setText(""); setFile(null); setUsingDraft(null); }
    setBusy(false);
  };
  let lastDay = "";

  return (
    <div className={`flex flex-col ${fill ? "h-full min-h-0" : "h-full min-h-[420px]"}`} data-testid="conversation">
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--hair)] p-4">
        {onBack && <button onClick={onBack} className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[var(--hair)] text-[var(--fg)] md:hidden" aria-label="Torna all'elenco" data-testid="conversation-back-btn"><ArrowLeft size={16} /></button>}
        <div className="min-w-0 flex-1">{header}</div>
      </div>
      <div ref={box} className="min-h-0 flex-1 space-y-2.5 overflow-y-auto overscroll-contain bg-[var(--raised)]/60 p-4" style={fill ? undefined : { maxHeight: 460 }} data-testid="conversation-messages" data-lenis-prevent>
        {!data && <Loader2 className="animate-spin text-[var(--fg)]" />}
        {msgs.map((m) => {
          const day = new Date(m.created_at).toDateString();
          const sep = day !== lastDay;
          lastDay = day;
          return [sep && <DaySeparator key={`d-${m.id}`} iso={m.created_at} />, <Bubble key={m.id} m={m} mine={m.from === side} side={side} tid={tid} />];
        })}
      </div>
      {side === "parent" && <UrgencyNotice ownerId={data?.thread?.owner_id} patientId={data?.thread?.patient_id} className="mx-3 mt-3" />}
      {draft && !usingDraft && <AiSuggestion text={draft.text} onUse={() => { setText(draft.text); setUsingDraft(draft.id); }} onIgnore={() => onIgnoreDraft(draft.id)} />}
      <form onSubmit={send} className="shrink-0 border-t border-[var(--hair)] p-3">
        {file && <div className="mb-2 flex items-center gap-2 rounded-xl bg-[var(--raised)] px-3 py-2 text-xs text-[var(--fg)]" data-testid="conversation-file-chip"><Paperclip size={13} /><span className="min-w-0 flex-1 truncate">{file.name}</span><button type="button" onClick={() => setFile(null)} aria-label="Rimuovi allegato" data-testid="conversation-file-remove"><X size={14} /></button></div>}
        <div className="flex items-end gap-2">
          <input ref={pick} type="file" accept={ACCEPT} className="hidden" onChange={choose} data-testid="conversation-file-input" />
          <button type="button" onClick={() => pick.current?.click()} className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-[var(--hair)] text-[var(--fg2)] transition-colors hover:text-[var(--fg)]" aria-label="Allega foto o PDF" data-testid="conversation-attach-btn"><Paperclip size={17} /></button>
          <textarea rows={2} maxLength={4000} value={text} onChange={(e) => setText(e.target.value)} placeholder={side === "doctor" ? "Scriva la risposta al genitore…" : "Scriva un messaggio allo studio…"}
            className="min-h-[48px] flex-1 resize-none rounded-2xl border border-[var(--hair)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--fg)] outline-none focus:border-[var(--accent)]" data-testid="conversation-input" />
          <button disabled={busy || (!text.trim() && !file)} className="flex h-12 shrink-0 items-center gap-2 rounded-full bg-[var(--accent)] px-5 text-sm font-medium text-[var(--ink)] transition-transform hover:-translate-y-0.5 disabled:opacity-50" data-testid="conversation-send-btn">{busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}<span className="hidden sm:inline">Invia</span></button>
        </div>
      </form>
      <p className="flex shrink-0 items-center gap-1.5 px-4 pb-3 text-[11px] text-[var(--fg2)]"><Lock size={11} /> Messaggi cifrati AES-256 · {side === "doctor" ? "il genitore riceve una notifica nel portale" : "lo studio riceve una notifica"}</p>
    </div>
  );
};
