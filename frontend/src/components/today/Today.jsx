import { useState } from "react";
import { ChevronDown, Clock, PenLine, MessagesSquare, CalendarPlus, ClipboardList, Users2, CheckCircle2 } from "lucide-react";
import { needsSignature } from "@/components/dash/SignNote";
import { MantAILogo } from "@/components/mantai/MantAILogo";

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

const StartButton = ({ onClick }) => (
  <button onClick={onClick} className="group mt-7 flex w-full max-w-[460px] flex-col items-center gap-3 rounded-[22px] bg-[var(--accent)] px-8 py-6 text-[var(--ink)] transition-colors hover:bg-[var(--accent)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--accent)]" data-testid="start-consultation-btn">
    <MantAILogo size={44} light />
    <span className="text-2xl font-semibold tracking-tight sm:text-[28px]">Inizia visita</span>
    <span className="text-sm text-[var(--fg2)]">MantAI ascolta la visita e prepara la nota da rivedere</span>
  </button>
);

export const NextPatient = ({ next, age, onStart, onOpen }) => (
  <section className="flex flex-col items-center rounded-2xl border border-[var(--hair)] bg-[var(--surface)] px-6 py-8 text-center sm:px-10 sm:py-10" data-testid="next-patient-card">
    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--fg2)]">Prossimo paziente</div>
    {next ? (
      <>
        <button onClick={next.patient_id ? onOpen : undefined} className="mt-3 text-3xl font-semibold tracking-tight text-[var(--fg)] hover:underline disabled:no-underline sm:text-4xl" disabled={!next.patient_id} data-testid="next-patient-name">{next.name}</button>
        <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-base text-[var(--fg2)]">
          {age && <span data-testid="next-patient-age">{age}</span>}
          <span className="flex items-center gap-1.5" data-testid="next-patient-time"><Clock size={15} /> {next.when}</span>
          {next.reason && <span data-testid="next-patient-reason">{next.reason}</span>}
          {next.clinic && <span className="text-[var(--fg2)]">{next.clinic}</span>}
        </div>
      </>
    ) : <p className="mt-3 text-lg text-[var(--fg2)]" data-testid="next-patient-empty">Nessun paziente in attesa né appuntamenti in arrivo.</p>}
    <StartButton onClick={() => onStart(next)} />
  </section>
);

const Row = ({ icon: Icon, n, label, cta, onClick, testId }) => (
  <li>
    <button onClick={onClick} className="flex min-h-[52px] w-full items-center gap-3 rounded-xl px-3 text-left transition-colors hover:bg-[var(--raised)]" data-testid={testId}>
      <Icon size={18} className="shrink-0 text-[var(--fg)]" />
      <span className="min-w-0 flex-1 text-[15px] text-[var(--fg)]"><strong className="font-semibold tabular-nums">{n}</strong> {label}</span>
      <span className="shrink-0 whitespace-nowrap text-sm font-medium text-[var(--accent)]">{cta} →</span>
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
    <section className="rounded-2xl border border-[var(--hair)] bg-[var(--surface)] p-5" data-testid="todo-box">
      <h2 className="text-lg font-semibold text-[var(--fg)]">Da fare</h2>
      {rows.length ? <ul className="mt-2 space-y-1">{rows}</ul> : <p className="mt-3 flex items-center gap-2 text-[15px] text-[var(--fg2)]" data-testid="todo-empty"><CheckCircle2 size={17} className="text-[var(--ok)]" /> Tutto in ordine.</p>}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-[var(--hair)] pt-3 text-sm">
        <span className="flex items-center gap-1.5 text-[var(--fg2)]"><ClipboardList size={14} /> Questionari pre-visita: nella nota di ogni bilancio</span>
        <button onClick={onTeam} className="flex items-center gap-1.5 font-medium text-[var(--accent)]" data-testid="todo-team"><Users2 size={14} /> Medicina di Squadra</button>
      </div>
    </section>
  );
};

export const Fold = ({ title, children, testId, defaultOpen = false }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-2xl border border-[var(--hair)] bg-[var(--surface)]" data-testid={testId}>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex min-h-[56px] w-full items-center justify-between px-5 text-left text-lg font-semibold text-[var(--fg)]" data-testid={`${testId}-toggle`}>
        {title}<ChevronDown size={18} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="pb-2">{children}</div>}
    </section>
  );
};
