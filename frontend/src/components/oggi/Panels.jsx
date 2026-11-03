import { ChevronRight, FolderOpen } from "lucide-react";
import { isDone, shortClinic } from "./data";
import { MantAIMark } from "@/components/mantai/MantAILogo";

export const Dot = ({ color, label }) => <span className="inline-block h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: color }} aria-label={label} role={label ? "img" : undefined} />;
export const STATUS = { done: ["#4E7A57", "Fatto"], planned: ["#A87A47", "In programma"] };
const card = "rounded-[20px] border border-[#DCDDDF] bg-white p-5 sm:p-6";

export const NextBar = ({ next, until, age, onOpen, onStart }) => (
  <section className="flex min-h-[52px] flex-wrap items-center gap-x-4 gap-y-2 rounded-[20px] bg-[#0A192F] px-4 py-2 text-white sm:flex-nowrap sm:px-5" aria-label="Prossimo paziente" data-testid="oggi-next-bar">
    {next ? <>
      <span className="shrink-0 text-sm text-[#C9CCD3]" data-testid="oggi-next-when">Prossimo · <span className="font-semibold text-[#FFFFFF]">{next.time}, {until}</span></span>
      <span className="min-w-0 flex-1 truncate text-sm" data-testid="oggi-next-who"><span className="font-semibold">{next.patient_name}</span>{age ? ` · ${age}` : ""} · {next.visit_type}</span>
      <div className="flex shrink-0 gap-2">
        {next.patient_id && <button onClick={onOpen} className="h-8 rounded-full border border-[#FFFFFF]/35 px-3.5 text-sm font-medium transition-colors hover:bg-[#FFFFFF]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B6CF6]" data-testid="oggi-next-folder-btn">Cartella</button>}
        <button onClick={onStart} className="flex h-8 items-center gap-1.5 rounded-full bg-white pl-1.5 pr-3.5 text-sm font-semibold text-[#0A192F] transition-colors hover:bg-[#F2F2EF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A9C2FF]" data-testid="oggi-next-start-btn"><MantAIMark size={18} /> Inizia visita</button>
      </div>
    </> : <span className="text-sm" data-testid="oggi-next-empty">Nessun'altra visita in programma oggi.</span>}
  </section>
);

const Row = ({ k, v, children }) => (
  <div className="flex gap-4 border-t border-[#0A192F]/10 py-2.5 text-sm first:border-t-0"><dt className="w-20 shrink-0 text-[#475569]">{k}</dt><dd className="min-w-0 text-[#0A192F]">{children ?? v}</dd></div>
);

export const VisitDetail = ({ appt, patient, onOpen }) => {
  if (!appt) return <section className={card} data-testid="oggi-detail"><p className="text-sm text-[#475569]">Selezioni una visita dall'agenda.</p></section>;
  const [color, label] = STATUS[isDone(appt) ? "done" : "planned"];
  return (
    <section className={`${card} flex flex-col`} aria-live="polite" data-testid="oggi-detail">
      <div className="flex items-center gap-2 text-sm text-[#475569]" data-testid="oggi-detail-status"><Dot color={color} /> {label} · {appt.time}</div>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[#0A192F]" data-testid="oggi-detail-name">{appt.patient_name}</h2>
      {patient?.age_label && <div className="mt-0.5 text-sm text-[#475569]" data-testid="oggi-detail-age">{patient.age_label}</div>}
      <dl className="mt-4">
        <Row k="Motivo" v={appt.visit_type} />
        <Row k="Studio" v={shortClinic(appt.clinic)} />
        <Row k="Allergie">{patient?.allergies ? <span className="flex items-center gap-2" data-testid="oggi-detail-allergies"><Dot color="#B0533F" /> {patient.allergies}</span> : <span className="text-[#475569]">Nessuna nota</span>}</Row>
      </dl>
      {appt.patient_id && <button onClick={() => onOpen(appt.patient_id)} className="mt-5 flex h-10 w-fit items-center gap-2 rounded-full bg-[#F2F2EF] px-4 text-sm font-semibold text-[#0A192F] transition-colors hover:bg-[#E8E8E4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A192F]" data-testid="oggi-detail-open-btn"><FolderOpen size={15} /> Apri cartella</button>}
    </section>
  );
};

export const TodoPanel = ({ items }) => (
  <section className={card} data-testid="oggi-todo">
    <h2 className="text-base font-semibold text-[#0A192F]">Da fare</h2>
    <ul className="mt-3 space-y-1.5">
      {items.map(({ id, label, count, onClick }) => (
        <li key={id}>
          <button onClick={onClick} className="flex w-full items-center justify-between gap-3 rounded-2xl px-3 py-3 text-left text-sm text-[#0A192F] transition-colors hover:bg-[#F2F2EF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A192F]" data-testid={`oggi-todo-${id}`}>
            <span>{label} <span className="font-semibold" data-testid={`oggi-todo-${id}-count`}>({count})</span></span>
            <ChevronRight size={17} className="text-[#475569]" aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  </section>
);
