import { Fragment, useEffect, useRef, useState } from "react";
import { Loader2, Send, ArrowLeft, Check, CheckCheck, Reply, Lock, Hourglass, Sparkles } from "lucide-react";
import { MantAIButton } from "@/components/mantai/MantAI";
import { UrgencyNotice } from "./UrgencyNotice";

export const STATUS = {
  inviato: ["Ricevuto", "bg-slate-200 text-slate-700", Check],
  letto: ["Letto", "bg-sky-100 text-sky-900", CheckCheck],
  in_attesa: ["In attesa del medico", "bg-amber-100 text-amber-900", Hourglass],
  risposto: ["Risposto", "bg-emerald-100 text-emerald-900", Reply],
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

const AiLabel = ({ m, mine, side }) => (
  <div className={`mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 border-t pt-2 text-[11px] ${mine ? "border-white/15 text-slate-300" : "border-slate-200 text-slate-600"}`} data-testid={`msg-ai-label-${m.id}`}>
    <Sparkles size={12} /> <span>{m.ai_label}</span>{side === "parent" && <MantAIButton variant="link" view="patient" />}
  </div>
);

const SystemNote = ({ m, side }) => (
  <div className="flex justify-center" data-testid={`msg-${m.id}`}>
    <div className={`max-w-[90%] rounded-2xl border px-4 py-3 text-sm border-slate-200 bg-[#F4F5F7] text-slate-700`} data-testid={`msg-system-${m.id}`}>
      <p className="whitespace-pre-wrap break-words leading-relaxed">{m.body}</p>
      <div className="mt-1 text-right text-[11px] opacity-70">{when(m.created_at)}</div>
      {m.ai_label && <AiLabel m={m} side={side} />}
    </div>
  </div>
);

const Bubble = ({ m, mine, side }) => m.from === "system" ? <SystemNote m={m} side={side} /> : (
  <div className={`flex ${mine ? "justify-end" : "justify-start"}`} data-testid={`msg-${m.id}`}>
    <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm sm:max-w-[75%] ${mine ? "rounded-br-md bg-night text-white" : "rounded-bl-md border border-slate-200 bg-white text-night"}`}>
      <div className={`mb-1 text-[11px] font-semibold ${mine ? "text-slate-300" : "text-slate-600"}`}>{m.author || (m.from === "doctor" ? "Studio" : "Genitore")}</div>
      {m.fields?.length > 0 && (
        <dl className={`mb-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 rounded-xl p-2 text-xs ${mine ? "bg-white/10" : "bg-[#F4F5F7]"}`} data-testid={`msg-fields-${m.id}`}>
          {m.fields.map((f, i) => <Fragment key={i}><dt className="font-semibold">{f.label}</dt><dd className="break-words">{f.value}</dd></Fragment>)}
        </dl>
      )}
      <p className="whitespace-pre-wrap break-words leading-relaxed">{m.body}</p>
      <div className={`mt-1.5 flex items-center justify-end gap-2 text-[11px] ${mine ? "text-slate-300" : "text-slate-600"}`}>
        {when(m.created_at)}
        {m.status && mine && <StatusChip status={m.status} testId={`msg-status-${m.id}`} />}
      </div>
      {m.ai_label && <AiLabel m={m} mine={mine} side={side} />}
    </div>
  </div>
);

export const Conversation = ({ data, side, onSend, onBack, header }) => {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef(null);
  const msgs = Array.isArray(data?.messages) ? data.messages : [];
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [msgs.length]);
  const send = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    const ok = await onSend(text.trim());
    if (ok) setText("");
    setBusy(false);
  };
  return (
    <div className="flex h-full min-h-[420px] flex-col" data-testid="conversation">
      <div className="flex items-start gap-2 border-b border-slate-200 p-4">
        {onBack && <button onClick={onBack} className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-slate-200 text-night lg:hidden" aria-label="Torna all'elenco" data-testid="conversation-back-btn"><ArrowLeft size={16} /></button>}
        <div className="min-w-0 flex-1">{header}</div>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto bg-[#F4F5F7]/60 p-4" style={{ maxHeight: 460 }} data-testid="conversation-messages">
        {!data && <Loader2 className="animate-spin text-night" />}
        {msgs.map((m) => <Bubble key={m.id} m={m} mine={m.from === side} side={side} />)}
        <div ref={end} />
      </div>
      {side === "parent" && <UrgencyNotice ownerId={data?.thread?.owner_id} patientId={data?.thread?.patient_id} className="mx-3 mt-3" />}
      <form onSubmit={send} className="flex items-end gap-2 border-t border-slate-200 p-3">
        <textarea rows={2} maxLength={4000} value={text} onChange={(e) => setText(e.target.value)} placeholder={side === "doctor" ? "Scriva la risposta al genitore…" : "Scriva un messaggio allo studio…"}
          className="min-h-[48px] flex-1 resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-night outline-none focus:border-night" data-testid="conversation-input" />
        <button disabled={busy || !text.trim()} className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-night text-white transition-transform hover:-translate-y-0.5 disabled:opacity-50" aria-label="Invia" data-testid="conversation-send-btn">{busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}</button>
      </form>
      <p className="flex items-center gap-1.5 px-4 pb-3 text-[11px] text-slate-600"><Lock size={11} /> Messaggi cifrati AES-256 · {side === "doctor" ? "il genitore riceve una notifica nel portale" : "lo studio riceve una notifica"}</p>
    </div>
  );
};
