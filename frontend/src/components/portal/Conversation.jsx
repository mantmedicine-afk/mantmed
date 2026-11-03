import { Fragment, useEffect, useRef, useState } from "react";
import { Loader2, Send, ArrowLeft, Check, CheckCheck, Reply, Lock, Hourglass, Sparkles } from "lucide-react";
import { MantAIButton } from "@/components/mantai/MantAI";
import { AILabel } from "@/components/mantai/AILabel";
import { UrgencyNotice } from "./UrgencyNotice";

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

const AiLabel = ({ m, mine, side }) => m.ai_provenance?.ai_generated ? (
  <div className={`mt-2 border-t pt-2 ${mine ? "border-[var(--hair)]" : "border-[var(--hair)]"}`} data-testid={`msg-ai-label-${m.id}`}>
    <AILabel provenance={m.ai_provenance} reviewer={m.ai_provenance.reviewer_name || m.author} view={side === "parent" ? "patient" : "doctor"} testId={`msg-ai-pill-${m.id}`} />
  </div>
) : (
  <div className={`mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 border-t pt-2 text-[11px] ${mine ? "border-[var(--hair)] text-[var(--fg2)]" : "border-[var(--hair)] text-[var(--fg2)]"}`} data-testid={`msg-ai-label-${m.id}`}>
    <Sparkles size={12} /> <span>{m.ai_label}</span>{side === "parent" && <MantAIButton variant="link" view="patient" />}
  </div>
);

const SystemNote = ({ m, side }) => (
  <div className="flex justify-center" data-testid={`msg-${m.id}`}>
    <div className={`max-w-[90%] rounded-2xl border px-4 py-3 text-sm border-[var(--hair)] bg-[var(--raised)] text-[var(--fg2)]`} data-testid={`msg-system-${m.id}`}>
      <p className="whitespace-pre-wrap break-words leading-relaxed">{m.body}</p>
      <div className="mt-1 text-right text-[11px] opacity-70">{when(m.created_at)}</div>
      {m.ai_label && <AiLabel m={m} side={side} />}
    </div>
  </div>
);

const Bubble = ({ m, mine, side }) => m.from === "system" ? <SystemNote m={m} side={side} /> : (
  <div className={`flex ${mine ? "justify-end" : "justify-start"}`} data-testid={`msg-${m.id}`}>
    <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm sm:max-w-[75%] ${mine ? "rounded-br-md bg-[var(--accent)] text-[var(--ink)]" : "rounded-bl-md border border-[var(--hair)] bg-[var(--surface)] text-[var(--fg)]"}`}>
      <div className={`mb-1 text-[11px] font-semibold ${mine ? "text-[var(--fg2)]" : "text-[var(--fg2)]"}`}>{m.author || (m.from === "doctor" ? "Studio" : "Genitore")}</div>
      {m.fields?.length > 0 && (
        <dl className={`mb-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 rounded-xl p-2 text-xs ${mine ? "bg-[var(--sel)]" : "bg-[var(--raised)]"}`} data-testid={`msg-fields-${m.id}`}>
          {m.fields.map((f, i) => <Fragment key={i}><dt className="font-semibold">{f.label}</dt><dd className="break-words">{f.value}</dd></Fragment>)}
        </dl>
      )}
      <p className="whitespace-pre-wrap break-words leading-relaxed">{m.body}</p>
      <div className={`mt-1.5 flex items-center justify-end gap-2 text-[11px] ${mine ? "text-[var(--fg2)]" : "text-[var(--fg2)]"}`}>
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
      <div className="flex items-start gap-2 border-b border-[var(--hair)] p-4">
        {onBack && <button onClick={onBack} className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[var(--hair)] text-[var(--fg)] lg:hidden" aria-label="Torna all'elenco" data-testid="conversation-back-btn"><ArrowLeft size={16} /></button>}
        <div className="min-w-0 flex-1">{header}</div>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto bg-[var(--raised)]/60 p-4" style={{ maxHeight: 460 }} data-testid="conversation-messages">
        {!data && <Loader2 className="animate-spin text-[var(--fg)]" />}
        {msgs.map((m) => <Bubble key={m.id} m={m} mine={m.from === side} side={side} />)}
        <div ref={end} />
      </div>
      {side === "parent" && <UrgencyNotice ownerId={data?.thread?.owner_id} patientId={data?.thread?.patient_id} className="mx-3 mt-3" />}
      <form onSubmit={send} className="flex items-end gap-2 border-t border-[var(--hair)] p-3">
        <textarea rows={2} maxLength={4000} value={text} onChange={(e) => setText(e.target.value)} placeholder={side === "doctor" ? "Scriva la risposta al genitore…" : "Scriva un messaggio allo studio…"}
          className="min-h-[48px] flex-1 resize-none rounded-2xl border border-[var(--hair)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--fg)] outline-none focus:border-[var(--accent)]" data-testid="conversation-input" />
        <button disabled={busy || !text.trim()} className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[var(--accent)] text-[var(--ink)] transition-transform hover:-translate-y-0.5 disabled:opacity-50" aria-label="Invia" data-testid="conversation-send-btn">{busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}</button>
      </form>
      <p className="flex items-center gap-1.5 px-4 pb-3 text-[11px] text-[var(--fg2)]"><Lock size={11} /> Messaggi cifrati AES-256 · {side === "doctor" ? "il genitore riceve una notifica nel portale" : "lo studio riceve una notifica"}</p>
    </div>
  );
};
