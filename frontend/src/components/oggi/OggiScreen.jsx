import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { CLINICS, api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { needsSignature } from "@/components/dash/SignNote";
import { StartButton, Summary, VisitSheet, rise } from "./Panels";
import { NextCard, VeraCard } from "./NextCard";
import { AgendaList } from "./AgendaList";
import { CANCELLED, LONG_DATE, greeting, isDone, nowHM, shortClinic, surname } from "./data";

const useNow = () => {
  const [d, setD] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setD(new Date()), 5000); return () => clearInterval(t); }, []);
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

export const OggiScreen = ({ appointments, patients, notes, unread, requests, onStart, onOpenPatient, onSign, onMarkDone, top }) => {
  const { user } = useAuth();
  const nav = useNavigate();
  const date = useNow();
  const now = nowHM(date);
  const [clinic, setClinic] = useState("all");
  const [selected, setSelected] = useState(null);
  const [fse, setFse] = useState(null);
  useEffect(() => { api.fsePending().then(setFse).catch(() => setFse(null)); }, [appointments]);
  const byId = useMemo(() => Object.fromEntries(patients.map((p) => [p.id, p])), [patients]);

  const today = useMemo(() => appointments.filter((a) => !CANCELLED.includes(a.status) && (a.date == null || a.date === date.toLocaleDateString("sv-SE")))
    .sort((x, y) => x.time.localeCompare(y.time)), [appointments, date]);
  const names = [...CLINICS, ...new Set(today.map((a) => a.clinic).filter((c) => c && !CLINICS.includes(c)))];
  const groups = names.filter((c) => clinic === "all" || c === clinic).map((c) => ({ clinic: c, items: today.filter((a) => a.clinic === c) }));
  const shown = groups.flatMap((g) => g.items);
  const next = today.find((a) => (clinic === "all" || a.clinic === clinic) && !isDone(a)) ?? null;
  const sel = today.find((a) => a.id === selected) ?? null;
  const toSign = notes.filter(needsSignature);
  const startNext = () => onStart(next ? { name: next.patient_name, patient_id: next.patient_id, appointment_id: next.id, visit_type: next.visit_type } : null);

  return (
    <main className="mx-auto max-w-[1440px] space-y-10 px-5 pb-16 pt-8 sm:space-y-12 lg:px-8 lg:pt-10" data-testid="today-page">
      {top}
      <motion.header {...rise(0)} className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-sm text-[var(--fg2)]" data-testid="oggi-date">{LONG_DATE(date)}</div>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-[var(--fg)] sm:text-4xl" data-testid="oggi-title">{greeting(date)}, {surname(user?.name)}</h1>
        </div>
        {CLINICS.length > 3 ? (
          <select value={clinic} onChange={(e) => setClinic(e.target.value)} className="h-11 rounded-full border border-[var(--hair)] bg-[var(--surface)] px-4 text-sm text-[var(--fg)]" aria-label="Filtra per studio" data-testid="oggi-clinic-select">
            <option value="all">Tutti gli studi</option>{CLINICS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        ) : <Segmented value={clinic} onChange={setClinic} options={[["all", "Tutti"], ...CLINICS.map((c) => [c, shortClinic(c)])]} />}
      </motion.header>
      <div className="grid grid-cols-1 items-start gap-6 [grid-template-areas:'hero'_'summary'_'agenda'_'vera'] md:grid-cols-2 md:[grid-template-areas:'hero_hero'_'agenda_side'] xl:grid-cols-[minmax(0,38fr)_minmax(0,24fr)_minmax(0,38fr)] xl:gap-8 xl:[grid-template-areas:'agenda_hero_side']">
        <motion.section {...rise(1)} className="flex flex-col items-center gap-6 self-start [grid-area:hero] xl:sticky xl:top-[9.5rem]" aria-label="Prossimo paziente" data-testid="oggi-next-bar">
          <StartButton onStart={startNext} />
          <NextCard next={next} patient={byId[next?.patient_id]} now={now} onOpen={() => onOpenPatient(next.patient_id)} onDone={() => onMarkDone(next)} />
        </motion.section>
        <motion.div {...rise(2)} className="min-w-0 [grid-area:agenda]">
          <AgendaList groups={groups} patients={patients} now={now} onSelect={setSelected} />
        </motion.div>
        <div className="contents md:block md:min-w-0 md:space-y-6 md:self-start md:[grid-area:side] xl:sticky xl:top-[9.5rem]" data-testid="oggi-side">
        <div className="min-w-0 [grid-area:summary]">
          <Summary visits={shown.length} done={shown.filter(isDone).length} toSign={toSign.length} unread={unread} requests={requests}
            onVisits={() => document.getElementById("oggi-agenda")?.scrollIntoView({ behavior: "smooth", block: "start" })}
            onSign={() => (toSign[0] ? onSign(toSign[0]) : nav("/app/visite"))}
            onMessages={() => nav("/app/messaggi")} fse={fse} onFse={() => nav("/app/pazienti?vista=visite")} />
        </div>
        <div className="min-w-0 self-start [grid-area:vera]"><VeraCard i={6} /></div>
        </div>
      </div>
      <VisitSheet appt={sel} patient={byId[sel?.patient_id]} onClose={() => setSelected(null)} onOpen={onOpenPatient} />
    </main>
  );
};
