import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CLINICS } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { needsSignature } from "@/components/dash/SignNote";
import { OggiTopBar } from "./OggiTopBar";
import { NextBar, VisitDetail, TodoPanel } from "./Panels";
import { AgendaList } from "./AgendaList";
import { TabBar } from "./TabBar";
import { CANCELLED, LONG_DATE, greeting, isDone, nowHM, shortClinic, surname, untilLabel } from "./data";

const useNow = () => {
  const [d, setD] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setD(new Date()), 30000); return () => clearInterval(t); }, []);
  return d;
};

const Segmented = ({ value, onChange, options }) => (
  <div className="inline-flex rounded-full bg-[#B9C1C7] p-1" role="radiogroup" aria-label="Filtra per studio" data-testid="oggi-clinic-filter">
    {options.map(([v, l]) => (
      <button key={v} role="radio" aria-checked={value === v} onClick={() => onChange(v)}
        className={`h-8 rounded-full px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#22272B] ${value === v ? "bg-[#CCD2D6] text-[#22272B]" : "text-[#3A4045] hover:text-[#22272B]"}`} data-testid={`oggi-filter-${l.toLowerCase()}`}>{l}</button>
    ))}
  </div>
);

export const OggiScreen = ({ appointments, patients, notes, unread, requests, onStart, onOpenPatient, onSign, top }) => {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const date = useNow();
  const now = nowHM(date);
  const [clinic, setClinic] = useState("all");
  const [selected, setSelected] = useState(null);
  const byId = useMemo(() => Object.fromEntries(patients.map((p) => [p.id, p])), [patients]);

  const today = useMemo(() => appointments.filter((a) => !CANCELLED.includes(a.status) && (a.date == null || a.date === date.toLocaleDateString("sv-SE")))
    .sort((x, y) => x.time.localeCompare(y.time)), [appointments, date]);
  const groups = CLINICS.filter((c) => clinic === "all" || c === clinic).map((c) => ({ clinic: c, items: today.filter((a) => a.clinic === c) }));
  const shown = groups.flatMap((g) => g.items);
  const next = today.find((a) => !isDone(a) && a.time >= now) ?? null;
  const firstFuture = shown.find((a) => a.time > now);
  const lastPastGroup = [...groups].reverse().find((g) => g.items.length && g.items[g.items.length - 1].time <= now);
  const nowBefore = shown.length && shown[0].time <= now ? (firstFuture ? firstFuture.id : lastPastGroup && `end-${lastPastGroup.clinic}`) : null;
  const sel = shown.find((a) => a.id === selected) ?? (next && shown.includes(next) ? next : shown[0]);

  const toSign = notes.filter(needsSignature);
  const todo = [
    { id: "sign", label: "Note da firmare", count: toSign.length, onClick: () => (toSign[0] ? onSign(toSign[0]) : nav("/app/visite")) },
    { id: "messages", label: "Messaggi da leggere", count: unread, onClick: () => nav("/app/messaggi") },
    ...(requests > 0 ? [{ id: "requests", label: "Richieste dal portale", count: requests, onClick: () => nav("/app/messaggi") }] : []),
  ];
  const startNext = () => onStart(next ? { name: next.patient_name, patient_id: next.patient_id } : null);

  return (
    <div className="min-h-screen bg-[#A4AEB6] text-[#22272B]" style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Inter', system-ui, sans-serif" }} data-testid="dashboard" data-section="agenda">
      <OggiTopBar user={user} unread={unread} onStart={startNext} onLogout={() => logout()} onNav={nav} />
      <main className="mx-auto max-w-[1200px] space-y-4 px-4 pb-28 pt-6 sm:px-6 md:pb-12" data-testid="today-page">
        {top}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-sm text-[#3A4045]" data-testid="oggi-date">{LONG_DATE(date)}</div>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl" data-testid="oggi-title">{greeting(date)}, {surname(user?.name)}</h1>
          </div>
          <Segmented value={clinic} onChange={setClinic} options={[["all", "Tutti"], ...CLINICS.map((c) => [c, shortClinic(c)])]} />
        </div>
        <NextBar next={next} until={next && untilLabel(next.time, now)} age={byId[next?.patient_id]?.age_label} onOpen={() => onOpenPatient(next.patient_id)} onStart={startNext} />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <VisitDetail appt={sel} patient={byId[sel?.patient_id]} onOpen={onOpenPatient} />
          <TodoPanel items={todo} />
        </div>
        <AgendaList groups={groups} patients={patients} now={now} nowBefore={nowBefore} selected={sel?.id} onSelect={setSelected} />
      </main>
      <TabBar unread={unread} onStart={startNext} />
    </div>
  );
};
