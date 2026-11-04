import { motion } from "framer-motion";
import { ArrowRight, ArrowUpRight, BookOpenCheck } from "lucide-react";
import { Dot, card, rise } from "./Panels";
import { toMin } from "./data";

const human = (m) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}`);
export const timeLeft = (time, now) => {
  const d = toMin(time) - toMin(now);
  return d > 0 ? `tra ${human(d)}` : d === 0 ? "adesso" : `in ritardo di ${human(-d)}`;
};

export const NextCard = ({ next, patient, now, onOpen }) => (
  <div className="w-full max-w-[260px] rounded-[16px] bg-[var(--surface)] shadow-[var(--shadow)] px-5 py-5" data-testid="oggi-next-card">
    {next ? <>
      <div className="text-center text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--fg2)]">Prossimo paziente</div>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-x-2 gap-y-1" data-testid="oggi-next-who">
        <span className="text-xl font-bold leading-tight text-[var(--fg)]" data-testid="oggi-next-name">{next.patient_name}</span>
        {patient?.allergies && <span className="flex items-center gap-1.5 text-xs font-semibold text-[var(--alert)]" title={patient.allergies} data-testid="oggi-next-allergies"><Dot color="var(--alert)" /> Allergie</span>}
      </div>
      <div className="mt-1 truncate text-center text-sm text-[var(--fg2)]" title={[patient?.age_label, next.visit_type].filter(Boolean).join(" · ")} data-testid="oggi-next-meta">{[patient?.age_label, next.visit_type].filter(Boolean).join(" · ")}</div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <span className="whitespace-nowrap rounded-full bg-[var(--sel)] px-2.5 py-1 text-xs font-medium tabular-nums text-[var(--fg)]" data-testid="oggi-next-when">{next.time} · {timeLeft(next.time, now)}</span>
        {next.patient_id && <button onClick={onOpen} className="flex shrink-0 items-center gap-1 text-sm font-semibold text-[var(--fg)] transition-transform hover:translate-x-0.5" data-testid="oggi-next-folder-btn">Cartella <ArrowRight size={14} /></button>}
      </div>
    </> : <p className="text-center text-sm text-[var(--fg2)]" data-testid="oggi-next-empty">Nessun'altra visita oggi</p>}
  </div>
);

export const VeraCard = ({ i }) => (
  <motion.section {...rise(i)} className={`${card} px-5 py-5`} aria-label="Vera Health" data-testid="oggi-vera">
    <div className="flex items-center gap-4">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--sel)] text-[var(--fg)]" aria-hidden="true"><BookOpenCheck size={17} /></span>
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-[var(--fg)]">Vera Health · Ricerca clinica</h2>
        <p className="mt-0.5 text-sm text-[var(--fg2)]">Risposte cliniche basate sulle evidenze</p>
      </div>
    </div>
    <a href="https://www.verahealth.ai" target="_blank" rel="noopener noreferrer"
      className="mt-5 inline-flex h-11 items-center gap-2 rounded-full bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--ink)] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]" data-testid="oggi-vera-open">
      Apri Vera Health <ArrowUpRight size={15} />
    </a>
    <p className="mt-3 text-xs text-[var(--fg2)]" data-testid="oggi-vera-note">Non inserire dati identificativi del paziente</p>
  </motion.section>
);
