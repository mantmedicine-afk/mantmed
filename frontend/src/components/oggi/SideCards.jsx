import { useState } from "react";
import { motion } from "framer-motion";
import { Syringe, HeartPulse, Lightbulb, CalendarPlus, ChevronRight } from "lucide-react";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { card, rise } from "./Panels";
import { shortDate, pillOfDay } from "./homeDemo";

const Box = ({ id, icon: Icon, title, action, children, i }) => (
  <motion.section {...rise(i)} className={`${card} px-5 py-4`} aria-label={title} data-testid={id}>
    <header className="mb-3 flex items-center justify-between gap-3">
      <h2 className="flex min-w-0 items-center gap-2 text-base font-semibold text-[var(--fg)]"><span className="grid h-8 w-8 place-items-center rounded-xl bg-[var(--sel)]"><Icon size={16} /></span>{title}</h2>
      {action}
    </header>
    {children}
  </motion.section>
);

const VacRow = ({ v, onOpen }) => (
  <li className="flex items-center justify-between gap-3 py-2" data-testid={`vac-${v.id}`}>
    <span className="min-w-0">
      {v.patient_id ? <button onClick={() => onOpen(v.patient_id)} className="block truncate text-left text-sm font-semibold text-[var(--fg)] hover:underline">{v.name}</button> : <span className="block truncate text-sm font-semibold text-[var(--fg)]">{v.name}</span>}
      <span className="block truncate text-xs text-[var(--fg2)]">{v.vaccine}</span>
    </span>
    <span className="shrink-0 text-xs font-medium tabular-nums text-[var(--fg)]">{shortDate(v.date)}</span>
  </li>
);

export const VaccinesCard = ({ items, onOpen, i }) => {
  const [all, setAll] = useState(false);
  return (
    <Box i={i} id="oggi-vaccines" icon={Syringe} title="Vaccinazioni in scadenza"
      action={<button onClick={() => setAll(true)} className="flex shrink-0 items-center whitespace-nowrap text-sm font-medium text-[var(--fg)] hover:underline" data-testid="oggi-vaccines-all">Vedi tutte <ChevronRight size={15} /></button>}>
      <ul className="divide-y divide-[var(--sel)]">{items.slice(0, 3).map((v) => <VacRow key={v.id} v={v} onOpen={onOpen} />)}</ul>
      <Sheet open={all} onOpenChange={setAll}>
        <SheetContent side="right" className="w-full overflow-y-auto border-0 bg-[var(--surface)] p-7 text-[var(--fg)] sm:max-w-md" data-testid="oggi-vaccines-sheet">
          <SheetTitle className="text-2xl font-semibold text-[var(--fg)]">Vaccinazioni in scadenza</SheetTitle>
          <SheetDescription className="mt-1 text-sm text-[var(--fg2)]">Richiami da fare entro fine mese · {items.length} pazienti</SheetDescription>
          <ul className="mt-5 divide-y divide-[var(--sel)]">{items.map((v) => <VacRow key={v.id} v={v} onOpen={(id) => { setAll(false); onOpen(id); }} />)}</ul>
        </SheetContent>
      </Sheet>
    </Box>
  );
};

export const BilanciCard = ({ items, onBook, i }) => (
  <Box i={i} id="oggi-bilanci" icon={HeartPulse} title="Bilanci di salute da programmare">
    <ul className="divide-y divide-[var(--sel)]">
      {items.map((b) => (
        <li key={b.id} className="flex items-center justify-between gap-3 py-2" data-testid={`bil-${b.id}`}>
          <span className="min-w-0"><span className="block truncate text-sm font-semibold text-[var(--fg)]">{b.name}</span><span className="block text-xs text-[var(--fg2)]">Bilancio {b.age} · dal {shortDate(b.date)}</span></span>
          <button onClick={() => onBook(b)} className="flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-[var(--accent)] px-3.5 text-xs font-semibold text-[var(--ink)] transition-transform hover:-translate-y-0.5" data-testid={`bil-book-${b.id}`}><CalendarPlus size={14} /> Prenota</button>
        </li>
      ))}
    </ul>
  </Box>
);

export const PillCard = ({ i }) => {
  const [text, source] = pillOfDay();
  return (
    <Box i={i} id="oggi-pill" icon={Lightbulb} title="Pillola del giorno">
      <p className="text-[15px] leading-relaxed text-[var(--fg)]" data-testid="oggi-pill-text">{text}</p>
      <p className="mt-2 text-xs text-[var(--fg2)]" data-testid="oggi-pill-source">Fonte: {source}</p>
    </Box>
  );
};
