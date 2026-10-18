import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { TopBar } from "@/components/dash/TopBar";
import { Marquee } from "@/components/dash/Marquee";
import { Hero } from "@/components/dash/Hero";
import { Agenda } from "@/components/dash/Agenda";
import { WaitingList } from "@/components/dash/WaitingList";
import { ConsultHub } from "@/components/dash/ConsultHub";
import { RecentNotes } from "@/components/dash/RecentNotes";
import { ConsultationOverlay } from "@/components/dash/ConsultationOverlay";
import { PassportSection } from "@/components/dash/PassportSection";
import { Passport } from "@/components/dash/Passport";
import { PatientDialog } from "@/components/dash/PatientDialog";
import { CashRegister } from "@/components/dash/CashRegister";
import { CompliancePanel } from "@/components/dash/CompliancePanel";
import { FeedbackDialog } from "@/components/dash/FeedbackDialog";
import { BetaMetrics } from "@/components/dash/BetaMetrics";

const isToday = (iso) => new Date(iso).toDateString() === new Date().toDateString();

const col = (d) => ({ initial: { opacity: 0, y: 24 }, animate: { opacity: 1, y: 0 }, transition: { delay: d, duration: 0.7, ease: [0.22, 1, 0.36, 1] } });

export default function Dashboard() {
  const { user } = useAuth();
  const shortName = (user?.name || "Dottore").replace(/^(Dott\.ssa|Dott\.)\s*(\S+)\s+/, "$1 ");
  const [appointments, setAppointments] = useState([]);
  const [waiting, setWaiting] = useState([]);
  const [notes, setNotes] = useState([]);
  const [overlay, setOverlay] = useState({ open: false, patient: null, initial: null });
  const [patients, setPatients] = useState([]);
  const [passportId, setPassportId] = useState(null);
  const [editPatient, setEditPatient] = useState(null);
  const [passportKey, setPassportKey] = useState(0);
  const [income, setIncome] = useState(0);
  const [cashKey, setCashKey] = useState(0);
  const [compliance, setCompliance] = useState(false);
  const [feedback, setFeedback] = useState(false);

  const load = useCallback(() => {
    api.payments().then((r) => setIncome(r.summary?.total ?? 0)).catch(() => {});
    setCashKey((k) => k + 1);
    api.appointments().then(setAppointments).catch(() => {});
    api.waiting().then(setWaiting).catch(() => {});
    api.consultations().then(setNotes).catch(() => {});
    api.patients().then(setPatients).catch(() => {});
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const next = waiting.find((w) => w.status === "in_studio") ?? waiting[0] ?? null;
  const ticker = [
    ...CLINICS.map((c) => `${c} · ${appointments.filter((a) => a.clinic === c).length} visite`),
    `${waiting.length} pazienti in sala d'attesa`,
    next ? `Prossimo: ${next.name}` : "Sala d'attesa libera",
    `${patients.length} passaporti sanitari sincronizzati`,
    "Percentili OMS automatici · Check-point di benessere per l'età evolutiva",
    "Trascrizione AI attiva · Whisper",
    "Cartella pediatrica · Anamnesi · Sintomi · Esame obiettivo · Crescita · Terapia su misura",
  ];

  const start = (patient) => setOverlay({ open: true, patient: patient ?? null, initial: null });

  return (
    <div className="min-h-screen overflow-x-clip bg-paper" data-testid="dashboard">
      <TopBar onCompliance={() => setCompliance(true)} onFeedback={() => setFeedback(true)} />
      <Marquee items={ticker} />
      <Hero total={appointments.length} waiting={waiting.length} name={shortName} income={income} />
      <main className="mx-auto grid max-w-[1440px] grid-cols-1 gap-5 px-5 pb-10 lg:grid-cols-12 lg:px-8">
        <motion.div {...col(0.35)} className="order-2 min-w-0 lg:order-1 lg:col-span-4"><Agenda appointments={appointments} onChange={load} patients={patients} onPassport={setPassportId} /></motion.div>
        <motion.div {...col(0.45)} className="order-1 min-w-0 lg:order-2 lg:col-span-4"><ConsultHub next={next} onStart={start} /></motion.div>
        <motion.div {...col(0.55)} className="order-3 min-w-0 lg:col-span-4"><WaitingList waiting={waiting} onChange={load} onStart={start} patients={patients} onPassport={setPassportId} /></motion.div>
      </main>
      <RecentNotes items={notes.filter((c) => isToday(c.created_at))} onOpen={(c) => setOverlay({ open: true, patient: null, initial: c })} />
      <CashRegister refreshKey={cashKey} />
      <BetaMetrics refreshKey={cashKey} onFeedback={() => setFeedback(true)} />
      <PassportSection patients={patients} onOpen={setPassportId} onAdd={() => setEditPatient({})} />
      {passportId && <Passport key={`${passportId}-${passportKey}`} patientId={passportId} onClose={() => { setPassportId(null); load(); }} onEdit={setEditPatient} />}
      <PatientDialog value={editPatient} onClose={() => setEditPatient(null)} onSaved={() => { load(); setPassportKey((k) => k + 1); }} />
      {compliance && <CompliancePanel onClose={() => setCompliance(false)} />}
      <FeedbackDialog open={feedback} onClose={() => setFeedback(false)} onSent={() => setCashKey((k) => k + 1)} />
      <ConsultationOverlay
        patients={patients}
        onPatientsChange={load}
        open={overlay.open}
        patient={overlay.patient}
        initial={overlay.initial}
        waiting={waiting}
        onClose={() => setOverlay({ open: false, patient: null, initial: null })}
        onDone={load}
      />
    </div>
  );
}
