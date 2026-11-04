import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { CLINICS } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { needsSignature } from "@/components/dash/SignNote";
import { StartButton, NextLine, Summary, VisitSheet, rise } from "./Panels";
import { AgendaList } from "./AgendaList";
import { VaccinesCard, BilanciCard, PillCard } from "./SideCards";
import { demoVaccines, demoBilanci } from "./homeDemo";
import { AppointmentDialog } from "@/components/dash/AppointmentDialog";
import { CANCELLED, LONG_DATE, greeting, isDone, nowHM, shortClinic, surname } from "./data";

const useNow = () => {
  const [d, setD] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setD(new Date()), 30000); return () => clearInterval(t); }, []);
  return d;
};

const Segmented = ({ value, onChange, options }) => (
  <div className="inline-flex rounded-full bg-[var(--raised)] p-1" role="radiogroup" aria-label="Filtra per studio" data-testid="oggi-clinic-filter">
    {options.map(([v, l]) => (
      <button key={v} role="radio" aria-checked={value === v} onClick={() => onChange(v)}
        className={`h-8 rounded-full px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${value === v ? "bg-[var(--surface)] text-[var(--fg)] shadow-sm" : "text-[var(--fg2)] hover:text-[var(--fg)]"}`} data-testid={`oggi-filter-${l.toLowerCase()}`}>{l}</button>
    ))}
  </div>
);

export const OggiScreen = ({ appointments, patients, notes, unread, requests, onStart, onOpenPatient, onSign, onBooked, top }) => {
  const { user } = useAuth();
  const nav = useNavigate();
  const date = useNow();
  const now = nowHM(date);
  const [clinic, setClinic] = useState("all");
  const [selected, setSelected] = useState(null);
  const [booking, setBooking] = useState(null);
  const vaccines = useMemo(() => demoVaccines(patients), [patients]);
  const bilanci = useMemo(() => demoBilanci(patients), [patients]);
  const byId = useMemo(() => Object.fromEntries(patients.map((p) => [p.id, p])), [patients]);

  const today = useMemo(() => appointments.filter((a) => !CANCELLED.includes(a.status) && (a.date == null || a.date === date.toLocaleDateString("sv-SE")))
    .sort((x, y) => x.time.localeCompare(y.time)), [appointments, date]);
  const groups = CLINICS.filter((c) => clinic === "all" || c === clinic).map((c) => ({ clinic: c, items: today.filter((a) => a.clinic === c) }));
  const shown = groups.flatMap((g) => g.items);
  const next = shown.find((a) => !isDone(a) && a.time >= now) ?? null;
  const sel = today.find((a) => a.id === selected) ?? null;
  const toSign = notes.filter(needsSignature);
  const startNext = () => onStart(next ? { name: next.patient_name, patient_id: next.patient_id } : null);

  return (
    <main className="mx-auto max-w-[1280px] space-y-10 px-5 pb-16 pt-8 sm:space-y-12 lg:px-8 lg:pt-10" data-testid="today-page">
      {top}
      <motion.header {...rise(0)} className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-sm text-[var(--fg2)]" data-testid="oggi-date">{LONG_DATE(date)}</div>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-[var(--fg)] sm:text-4xl" data-testid="oggi-title">{greeting(date)}, {surname(user?.name)}</h1>
        </div>
        <Segmented value={clinic} onChange={setClinic} options={[["all", "Tutti"], ...CLINICS.map((c) => [c, shortClinic(c)])]} />
      </motion.header>
      <motion.section {...rise(1)} className="flex flex-col items-center gap-6 py-2 sm:gap-7" aria-label="Prossimo paziente" data-testid="oggi-next-bar">
        <StartButton onStart={startNext} />
        <NextLine next={next} age={byId[next?.patient_id]?.age_label} onOpen={() => onOpenPatient(next.patient_id)} />
      </motion.section>
      <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:gap-8">
        <motion.div {...rise(2)} className="min-w-0">
          <AgendaList groups={groups} patients={patients} now={now} onSelect={setSelected} />
        </motion.div>
        <aside className="space-y-4 md:sticky md:top-32 md:max-h-[calc(100vh-9rem)] md:overflow-y-auto md:pb-2 md:[scrollbar-width:thin]" data-testid="oggi-side">
          <Summary visits={shown.length} done={shown.filter(isDone).length} toSign={toSign.length} unread={unread} requests={requests}
            onVisits={() => document.getElementById("oggi-agenda")?.scrollIntoView({ behavior: "smooth", block: "start" })}
            onSign={() => (toSign[0] ? onSign(toSign[0]) : nav("/app/visite"))}
            onMessages={() => nav("/app/messaggi")} />
          <VaccinesCard i={6} items={vaccines} onOpen={onOpenPatient} />
          <BilanciCard i={7} items={bilanci} onBook={(b) => setBooking({ patient_name: b.name, patient_id: b.patient_id, visit_type: `Bilancio di salute · ${b.age}`, date: b.date, clinic: CLINICS[0], time: "09:00" })} />
          <PillCard i={8} />
        </aside>
      </div>
      <AppointmentDialog value={booking} onClose={() => setBooking(null)} onSaved={onBooked} patients={patients} />
      <VisitSheet appt={sel} patient={byId[sel?.patient_id]} onClose={() => setSelected(null)} onOpen={onOpenPatient} />
    </main>
  );
};
