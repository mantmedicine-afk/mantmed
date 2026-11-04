import { motion, useReducedMotion } from "framer-motion";
import { FolderOpen, CalendarCheck, PenLine, MessagesSquare, ChevronRight } from "lucide-react";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { isDone, shortClinic } from "./data";

export const Dot = ({ color, label }) => <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: color }} aria-label={label} role={label ? "img" : undefined} />;
export const STATUS = { done: ["var(--ok)", "Fatto"], planned: ["var(--wait)", "In programma"] };
export const card = "rounded-3xl bg-[var(--surface)]";

export const rise = (i = 0) => ({ initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.55, delay: 0.08 * i, ease: [0.22, 1, 0.36, 1] } });

const PulseRing = () => {
  const still = useReducedMotion();
  return (
    <motion.span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-full border-2 border-[var(--fg2)]"
      animate={still ? { opacity: 0.35 } : { scale: [1, 1.22], opacity: [0.55, 0] }}
      transition={still ? undefined : { duration: 2.6, repeat: Infinity, ease: "easeOut" }} />
  );
};

export const StartButton = ({ onStart }) => (
  <div className="relative grid h-[180px] w-[180px] place-items-center sm:h-[240px] sm:w-[240px]">
    <PulseRing />
    <span aria-hidden="true" className="pointer-events-none absolute -inset-3 rounded-full border border-[var(--hair)]" />
    <button onClick={onStart}
      className="theme-bar start-btn relative flex h-full w-full flex-col items-center justify-center gap-3 rounded-full transition-[transform,box-shadow] duration-300 ease-out hover:scale-[1.04] hover:shadow-[0_22px_48px_-14px_var(--scrim)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--accent)] active:scale-[0.98]"
      data-testid="oggi-next-start-btn">
      <img src="/mantmed-logo-white.png" alt="" aria-hidden="true" draggable="false" className="block h-auto w-[40%] select-none object-contain" data-testid="start-btn-logo" />
      <span className="text-base font-semibold sm:text-lg">Avvia MantAI</span>
    </button>
  </div>
);

const Stat = ({ id, icon: Icon, value, label, sub, onClick, i }) => (
  <motion.button {...rise(i)} onClick={onClick}
    className={`${card} group flex items-center gap-3.5 px-5 py-3.5 text-left transition-transform duration-300 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]`} data-testid={`oggi-stat-${id}`}>
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--sel)] text-[var(--fg)]"><Icon size={17} /></span>
    <span className="flex min-w-0 flex-1 items-center gap-3">
      <span className="block text-2xl font-semibold tabular-nums tracking-tight text-[var(--fg)]" data-testid={`oggi-stat-${id}-count`}>{value}</span>
      <span className="block min-w-0 text-sm text-[var(--fg2)]">{label}{sub && <span className="block text-xs" data-testid={`oggi-stat-${id}-sub`}>{sub}</span>}</span>
    </span>
    <ChevronRight size={17} className="text-[var(--fg2)] transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
  </motion.button>
);

export const Summary = ({ visits, done, toSign, unread, requests, onVisits, onSign, onMessages }) => (
  <section className="grid grid-cols-1 gap-3" aria-label="Riepilogo" data-testid="oggi-summary">
    <Stat i={3} id="visits" icon={CalendarCheck} value={visits} label="Visite di oggi" sub={`di cui ${done} ${done === 1 ? "fatta" : "fatte"}`} onClick={onVisits} />
    <Stat i={4} id="sign" icon={PenLine} value={toSign} label="Note da firmare" onClick={onSign} />
    <Stat i={5} id="messages" icon={MessagesSquare} value={unread} label="Messaggi da leggere" sub={requests > 0 ? `+ ${requests} richieste dal portale` : null} onClick={onMessages} />
  </section>
);

const Row = ({ k, children }) => (
  <div className="flex gap-4 border-t border-[var(--sel)] py-3 text-sm first:border-t-0"><dt className="w-20 shrink-0 text-[var(--fg2)]">{k}</dt><dd className="min-w-0 text-[var(--fg)]">{children}</dd></div>
);

export const VisitSheet = ({ appt, patient, onClose, onOpen }) => {
  const [color, label] = appt ? STATUS[isDone(appt) ? "done" : "planned"] : [];
  return (
    <Sheet open={Boolean(appt)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full border-0 bg-[var(--surface)] p-7 text-[var(--fg)] sm:max-w-md" data-testid="oggi-detail">
        {appt && <>
          <div className="flex items-center gap-2 text-sm text-[var(--fg2)]" data-testid="oggi-detail-status"><Dot color={color} /> {label} · <span className="tabular-nums">{appt.time}</span></div>
          <SheetTitle className="mt-3 text-3xl font-semibold tracking-tight text-[var(--fg)]" data-testid="oggi-detail-name">{appt.patient_name}</SheetTitle>
          <SheetDescription className="mt-1 text-sm text-[var(--fg2)]" data-testid="oggi-detail-age">{patient?.age_label || "Dettaglio della visita"}</SheetDescription>
          <dl className="mt-6">
            <Row k="Motivo">{appt.visit_type}</Row>
            <Row k="Studio">{shortClinic(appt.clinic)}</Row>
            <Row k="Allergie">{patient?.allergies ? <span className="inline-flex rounded-full bg-[var(--alert-bg)] px-2.5 py-0.5 font-semibold text-[var(--alert)]" data-testid="oggi-detail-allergies">Allergia: {patient.allergies}</span> : <span className="text-[var(--fg2)]">Nessuna nota</span>}</Row>
          </dl>
          {appt.patient_id && <button onClick={() => { onClose(); onOpen(appt.patient_id); }} className="mt-8 flex h-12 w-full items-center justify-center gap-3 rounded-full bg-[var(--accent)] text-sm font-semibold text-[var(--ink)] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]" data-testid="oggi-detail-open-btn"><FolderOpen size={16} /> Apri cartella</button>}
        </>}
      </SheetContent>
    </Sheet>
  );
};
