import { Fragment } from "react";
import { Check, CheckCheck, FileText, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { MantAIButton } from "@/components/mantai/MantAI";
import { AILabel } from "@/components/mantai/AILabel";

export const hm = (iso) => new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });

export const dayLabel = (iso) => {
  const d = new Date(iso), t = new Date();
  const y = new Date(t); y.setDate(t.getDate() - 1);
  if (d.toDateString() === t.toDateString()) return "Oggi";
  if (d.toDateString() === y.toDateString()) return "Ieri";
  return d.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", ...(d.getFullYear() !== t.getFullYear() ? { year: "numeric" } : {}) });
};

const RECEIPT = { inviato: ["Inviato", Check, "opacity-60"], consegnato: ["Consegnato", CheckCheck, "opacity-60"], letto: ["Letto", CheckCheck, "text-sky-400"] };

export const Ticks = ({ m }) => {
  const [label, Icon, cls] = RECEIPT[m.receipt] ?? RECEIPT.inviato;
  return <span className={`inline-flex ${cls}`} title={label} aria-label={label} data-testid={`msg-receipt-${m.id}`} data-receipt={m.receipt}><Icon size={14} strokeWidth={2.4} /></span>;
};

export const DaySeparator = ({ iso }) => (
  <div className="flex items-center gap-3 py-1" data-testid="msg-day-separator">
    <span className="h-px flex-1 bg-[var(--hair)]" /><span className="rounded-full bg-[var(--surface)] px-3 py-0.5 text-[11px] font-medium capitalize text-[var(--fg2)] ring-1 ring-[var(--hair)]">{dayLabel(iso)}</span><span className="h-px flex-1 bg-[var(--hair)]" />
  </div>
);

const AiLine = ({ m, side }) => (
  <div className="mt-2 border-t border-[var(--hair)] pt-2 text-[11px] text-[var(--fg2)]" data-testid={`msg-ai-label-${m.id}`}>
    {m.ai_provenance?.ai_generated ? <AILabel provenance={m.ai_provenance} reviewer={m.ai_provenance.reviewer_name || m.author} view={side === "parent" ? "patient" : "doctor"} testId={`msg-ai-pill-${m.id}`} />
      : <span className="flex flex-wrap items-center gap-2"><Sparkles size={12} /> {m.ai_label}{side === "parent" && <MantAIButton variant="link" view="patient" />}</span>}
  </div>
);

const Attachment = ({ a, tid, side, mine }) => {
  const url = api.attachmentUrl(side, tid, a.id);
  return a.type.startsWith("image/") && !a.type.includes("hei") ? (
    <a href={url} target="_blank" rel="noreferrer" className="mb-2 block overflow-hidden rounded-xl" data-testid={`msg-attachment-${a.id}`}><img src={url} alt={a.name} className="max-h-60 w-full object-cover" loading="lazy" onLoad={(e) => { const b = e.currentTarget.closest("[data-testid='conversation-messages']"); if (b && b.scrollHeight - b.scrollTop - b.clientHeight < 400) b.scrollTop = b.scrollHeight; }} /></a>
  ) : (
    <a href={url} target="_blank" rel="noreferrer" className={`mb-2 flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium ${mine ? "bg-[var(--sel)]" : "bg-[var(--raised)]"}`} data-testid={`msg-attachment-${a.id}`}>
      <FileText size={16} className="shrink-0" /><span className="min-w-0 truncate">{a.name}</span><span className="shrink-0 opacity-70">{Math.max(1, Math.round(a.size / 1024))} KB</span>
    </a>
  );
};

export const Bubble = ({ m, mine, side, tid }) => m.from === "system" ? (
  <div className="flex justify-center" data-testid={`msg-${m.id}`}>
    <div className="max-w-[90%] rounded-2xl border border-[var(--hair)] bg-[var(--raised)] px-4 py-3 text-sm text-[var(--fg2)]" data-testid={`msg-system-${m.id}`}>
      <p className="whitespace-pre-wrap break-words leading-relaxed">{m.body}</p>
      <div className="mt-1 text-right text-[11px] opacity-70">{hm(m.created_at)}</div>
      {m.ai_label && <AiLine m={m} side={side} />}
    </div>
  </div>
) : (
  <div className={`flex ${mine ? "justify-end" : "justify-start"}`} data-testid={`msg-${m.id}`}>
    <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm sm:max-w-[72%] ${mine ? "rounded-br-md bg-[var(--accent)] text-[var(--ink)]" : "rounded-bl-md border border-[var(--hair)] bg-[var(--surface)] text-[var(--fg)]"}`}>
      {!mine && <div className="mb-1 text-[11px] font-semibold text-[var(--fg2)]">{m.author || (m.from === "doctor" ? "Studio" : "Genitore")}</div>}
      {m.fields?.length > 0 && (
        <dl className={`mb-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 rounded-xl p-2 text-xs ${mine ? "bg-[var(--sel)]" : "bg-[var(--raised)]"}`} data-testid={`msg-fields-${m.id}`}>
          {m.fields.map((f, i) => <Fragment key={i}><dt className="font-semibold">{f.label}</dt><dd className="break-words">{f.value}</dd></Fragment>)}
        </dl>
      )}
      {m.attachments?.map((a) => <Attachment key={a.id} a={a} tid={tid} side={side} mine={mine} />)}
      {m.body && <p className="whitespace-pre-wrap break-words leading-relaxed">{m.body}</p>}
      <div className="mt-1 flex items-center justify-end gap-1.5 text-[11px] opacity-80">{hm(m.created_at)}{mine && <Ticks m={m} />}</div>
      {m.ai_label && <AiLine m={m} side={side} />}
    </div>
  </div>
);
