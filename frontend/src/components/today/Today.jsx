import { useState } from "react";
import { AudioLines, ChevronDown, Clock, PenLine, MessagesSquare, CalendarPlus, ClipboardList, Users2, CheckCircle2 } from "lucide-react";
import { needsSignature } from "@/components/dash/SignNote";

const hm = (iso) => new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });

/** Prossimo paziente: dalla sala d'attesa (chi è in studio prima) o dal primo appuntamento di oggi non ancora passato. */
export const pickNext = (waiting, appointments) => {
  const w = waiting.find((x) => x.status === "in_studio") ?? waiting[0];
  if (w) return { ...w, when: w.arrived_at ? `in sala dalle ${hm(w.arrived_at)}` : "in sala d'attesa" };
  const now = new Date().toTimeString().slice(0, 5);
  const open = [...appointments].filter((x) => !["annullato", "completato", "cancelled", "completed"].includes(x.status)).sort((x, y) => x.time.localeCompare(y.time));
  const a = open.find((x) => x.time >= now) ?? open[0];
  return a ? { name: a.patient_name, patient_id: a.patient_id, reason: a.visit_type, clinic: a.clinic, when: `ore ${a.time}` } : null;
};

export const NextPatient = ({ next, age, onStart, onOpen }) => (
  <section className="rounded-2xl border border-[#DCDDDF] bg-white p-6 sm:p-8" data-testid="next-patient-card">
    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Prossimo paziente</div>
    {next ? (
      <div className="mt-3 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <button onClick={next.patient_id ? onOpen : undefined} className="text-left text-3xl font-semibold tracking-tight text-[#0A192F] hover:underline disabled:no-underline sm:text-4xl" disabled={!next.patient_id} data-testid="next-patient-name">{next.name}</button>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-base text-slate-600">
            {age && <span data-testid="next-patient-age">{age}</span>}
            <span className="flex items-center gap-1.5" data-testid="next-patient-time"><Clock size={15} /> {next.when}</span>
            {next.reason && <span data-testid="next-patient-reason">{next.reason}</span>}
            {next.clinic && <span className="text-slate-500">{next.clinic}</span>}
          </div>
        </div>
        <button onClick={() => onStart(next)} className="flex h-14 items-center justify-center gap-2 rounded-xl bg-[#0A192F] px-8 text-base font-semibold text-white transition-colors hover:bg-[#13284A]" data-testid="start-consultation-btn">
          <AudioLines size={19} /> Inizia visita
        </button>
      </div>
    ) : (
      <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-lg text-slate-600" data-testid="next-patient-empty">Nessun paziente in attesa né appuntamenti in arrivo.</p>
        <button onClick={() => onStart(null)} className="flex h-12 items-center justify-center gap-2 rounded-xl bg-[#0A192F] px-6 text-base font-semibold text-white" data-testid="start-consultation-btn"><AudioLines size={18} /> Inizia visita</button>
      </div>
    )}
  </section>
);

const Row = ({ icon: Icon, n, label, cta, onClick, testId }) => (
  <li>
    <button onClick={onClick} className="flex min-h-[52px] w-full items-center gap-3 rounded-xl px-3 text-left transition-colors hover:bg-[#F2F2EF]" data-testid={testId}>
      <Icon size={18} className="shrink-0 text-[#0A192F]" />
      <span className="min-w-0 flex-1 text-[15px] text-[#0A192F]"><strong className="font-semibold tabular-nums">{n}</strong> {label}</span>
      <span className="text-sm font-medium text-[#3B6CF6]">{cta} →</span>
    </button>
  </li>
);

/** "Da fare": solo le voci con qualcosa in sospeso, ognuna porta all'azione. */
export const TodoBox = ({ notes, unread, requests, onSign, onMessages, onRequests, onTeam }) => {
  const toSign = notes.filter((c) => c.status === "ready" && needsSignature(c));
  const rows = [
    toSign.length > 0 && <Row key="s" icon={PenLine} n={toSign.length} label={toSign.length === 1 ? "nota da firmare" : "note da firmare"} cta="Rivedi e firma" onClick={() => onSign(toSign[0])} testId="todo-sign" />,
    unread > 0 && <Row key="m" icon={MessagesSquare} n={unread} label="messaggi da leggere" cta="Rispondi" onClick={onMessages} testId="todo-messages" />,
    requests > 0 && <Row key="r" icon={CalendarPlus} n={requests} label="richieste di appuntamento dal portale" cta="Gestisci" onClick={onRequests} testId="todo-requests" />,
  ].filter(Boolean);
  return (
    <section className="rounded-2xl border border-[#DCDDDF] bg-white p-5" data-testid="todo-box">
      <h2 className="text-lg font-semibold text-[#0A192F]">Da fare</h2>
      {rows.length ? <ul className="mt-2 space-y-1">{rows}</ul> : <p className="mt-3 flex items-center gap-2 text-[15px] text-slate-600" data-testid="todo-empty"><CheckCircle2 size={17} className="text-emerald-600" /> Tutto in ordine.</p>}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-[#EEEEEB] pt-3 text-sm">
        <span className="flex items-center gap-1.5 text-slate-500"><ClipboardList size={14} /> Questionari pre-visita: nella nota di ogni bilancio</span>
        <button onClick={onTeam} className="flex items-center gap-1.5 font-medium text-[#3B6CF6]" data-testid="todo-team"><Users2 size={14} /> Medicina di Squadra</button>
      </div>
    </section>
  );
};

export const Fold = ({ title, children, testId, defaultOpen = false }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-2xl border border-[#DCDDDF] bg-white" data-testid={testId}>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex min-h-[56px] w-full items-center justify-between px-5 text-left text-lg font-semibold text-[#0A192F]" data-testid={`${testId}-toggle`}>
        {title}<ChevronDown size={18} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="pb-2">{children}</div>}
    </section>
  );
};
