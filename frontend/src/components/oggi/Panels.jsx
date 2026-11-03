import { ChevronRight, FolderOpen } from "lucide-react";
import { isDone, shortClinic } from "./data";
import { MantAIMark } from "@/components/mantai/MantAILogo";

export const Dot = ({ color, label }) => <span className="inline-block h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: color }} aria-label={label} role={label ? "img" : undefined} />;
export const STATUS = { done: ["var(--ok)", "Fatto"], planned: ["var(--wait)", "In programma"] };
const card = "rounded-[20px] border border-[var(--hair)] bg-[var(--surface)] p-5 sm:p-6";

export const NextBar = ({ next, until, age, onOpen, onStart }) => (
  <section className="flex min-h-[52px] flex-wrap items-center gap-x-4 gap-y-2 rounded-[20px] bg-[var(--accent)] px-4 py-2 text-[var(--ink)] sm:flex-nowrap sm:px-5" aria-label="Prossimo paziente" data-testid="oggi-next-bar">
    {next ? <>
      <span className="shrink-0 text-sm text-[var(--fg2)]" data-testid="oggi-next-when">Prossimo · <span className="font-semibold text-[var(--ink)]">{next.time}, {until}</span></span>
      <span className="w-full min-w-0 text-sm sm:w-auto sm:flex-1 sm:truncate" data-testid="oggi-next-who"><span className="font-semibold">{next.patient_name}</span>{age ? ` · ${age}` : ""} · {next.visit_type}</span>
    </> : <span className="min-w-0 flex-1 text-sm" data-testid="oggi-next-empty">Nessun'altra visita in programma oggi.</span>}
      <div className="flex shrink-0 gap-2">
        {next?.patient_id && <button onClick={onOpen} className="h-8 rounded-full border border-[var(--hair)] px-3.5 text-sm font-medium transition-colors hover:bg-[var(--raised)]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]" data-testid="oggi-next-folder-btn">Cartella</button>}
        <button onClick={onStart} className="flex h-8 items-center gap-1.5 rounded-full bg-[var(--surface)] pl-1.5 pr-3.5 text-sm font-semibold text-[var(--fg)] transition-colors hover:bg-[var(--raised)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]" data-testid="oggi-next-start-btn"><MantAIMark size={18} /> Inizia visita</button>
      </div>
  </section>
);

const Row = ({ k, v, children }) => (
  <div className="flex gap-4 border-t border-[var(--sel)] py-2.5 text-sm first:border-t-0"><dt className="w-20 shrink-0 text-[var(--fg2)]">{k}</dt><dd className="min-w-0 text-[var(--fg)]">{children ?? v}</dd></div>
);

export const VisitDetail = ({ appt, patient, onOpen }) => {
  if (!appt) return <section className={card} data-testid="oggi-detail"><p className="text-sm text-[var(--fg2)]">Selezioni una visita dall'agenda.</p></section>;
  const [color, label] = STATUS[isDone(appt) ? "done" : "planned"];
  return (
    <section className={`${card} flex flex-col`} aria-live="polite" data-testid="oggi-detail">
      <div className="flex items-center gap-2 text-sm text-[var(--fg2)]" data-testid="oggi-detail-status"><Dot color={color} /> {label} · {appt.time}</div>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--fg)]" data-testid="oggi-detail-name">{appt.patient_name}</h2>
      {patient?.age_label && <div className="mt-0.5 text-sm text-[var(--fg2)]" data-testid="oggi-detail-age">{patient.age_label}</div>}
      <dl className="mt-4">
        <Row k="Motivo" v={appt.visit_type} />
        <Row k="Studio" v={shortClinic(appt.clinic)} />
        <Row k="Allergie">{patient?.allergies ? <span className="inline-flex rounded-full bg-[var(--alert-bg)] px-2.5 py-0.5 font-semibold text-[var(--alert)]" data-testid="oggi-detail-allergies">Allergia: {patient.allergies}</span> : <span className="text-[var(--fg2)]">Nessuna nota</span>}</Row>
      </dl>
      {appt.patient_id && <button onClick={() => onOpen(appt.patient_id)} className="mt-5 flex h-10 w-fit items-center gap-2 rounded-full bg-[var(--raised)] px-4 text-sm font-semibold text-[var(--fg)] transition-colors hover:bg-[var(--raised)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]" data-testid="oggi-detail-open-btn"><FolderOpen size={15} /> Apri cartella</button>}
    </section>
  );
};

export const TodoPanel = ({ items }) => (
  <section className={card} data-testid="oggi-todo">
    <h2 className="text-base font-semibold text-[var(--fg)]">Da fare</h2>
    <ul className="mt-3 space-y-1.5">
      {items.map(({ id, label, count, onClick }) => (
        <li key={id}>
          <button onClick={onClick} className="flex w-full items-center justify-between gap-3 rounded-2xl px-3 py-3 text-left text-sm text-[var(--fg)] transition-colors hover:bg-[var(--raised)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]" data-testid={`oggi-todo-${id}`}>
            <span>{label} <span className="font-semibold" data-testid={`oggi-todo-${id}-count`}>({count})</span></span>
            <ChevronRight size={17} className="text-[var(--fg2)]" aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  </section>
);
