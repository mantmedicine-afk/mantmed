import { toast } from "sonner";
import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { api, CLINICS, errMsg } from "@/lib/api";
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
import { PortalRequests } from "@/components/dash/PortalRequests";
import { CompliancePanel } from "@/components/dash/CompliancePanel";
import { FeedbackDialog } from "@/components/dash/FeedbackDialog";
import { BetaMetrics } from "@/components/dash/BetaMetrics";
import { OnboardingTour } from "@/components/dash/OnboardingTour";
import { DoctorMessages } from "@/components/dash/DoctorMessages";
import { AbsenceBanner } from "@/components/dash/AbsenceBanner";
import { SupportReplies } from "@/components/support/SupportReplies";
import { SignatureReminder } from "@/components/signature/SignatureReminder";
import { usePoll } from "@/hooks/usePoll";
import { useNavigate, useParams, Navigate } from "react-router-dom";
import { LayoutDashboard, Users, MessagesSquare, PersonStanding, ReceiptText, Settings } from "lucide-react";
import { AppShell } from "@/components/nav/AppShell";
import { PageTitle, VisitsList, PatientFolder, TsCard, SettingsExtras } from "@/components/nav/sections";
import Account from "@/pages/Account";
import { ProcessingProvider, useProcessing } from "@/lib/processing";

const SECTIONS = ["agenda", "pazienti", "messaggi", "visite", "cassa", "impostazioni"];

const isToday = (iso) => new Date(iso).toDateString() === new Date().toDateString();

const col = (d) => ({ initial: { opacity: 0, y: 24 }, animate: { opacity: 1, y: 0 }, transition: { delay: d, duration: 0.7, ease: [0.22, 1, 0.36, 1] } });

export default function Dashboard() {
  const { user, setUser } = useAuth();
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
  const [tour, setTour] = useState(false);
  const [unread, setUnread] = useState(0);
  const loadUnread = useCallback(() => api.msgSummary().then(setUnread).catch(() => {}), []);
  usePoll(loadUnread, []);
  useEffect(() => {
    if (user && user.tour_done === false) { const t = setTimeout(() => setTour(true), 900); return () => clearTimeout(t); }
    return undefined;
  }, [user?.tour_done]); // eslint-disable-line react-hooks/exhaustive-deps
  const endTour = useCallback(() => {
    setTour(false);
    if (user?.tour_done === false) { setUser((u) => (u ? { ...u, tour_done: true } : u)); api.saveTour(true).catch(() => {}); }
  }, [user?.tour_done, setUser]);

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
  const { sezione = "agenda" } = useParams();
  const [folder, setFolder] = useState(null);
  const openVisit = (c) => setOverlay({ open: true, patient: null, initial: c });
  const navTo = useNavigate();
  const search = {
    onPatient: (id) => { setOverlay((o) => (o.open ? { ...o, open: false } : o)); navTo("/app/pazienti"); setFolder(id); window.scrollTo({ top: 0, behavior: "smooth" }); },
    onReport: async (id) => {
      try { openVisit(notes.find((c) => c.id === id) ?? await api.getConsultation(id)); } catch (e) { toast.error(errMsg(e)); }
    },
    onAppointment: (a) => {
      const when = `${new Date(`${a.date}T12:00:00`).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })} alle ${a.time}`;
      if (a.patient_id) { search.onPatient(a.patient_id); toast(`Appuntamento di ${a.patient_name}`, { description: `${when}${a.clinic ? ` · ${a.clinic}` : ""}` }); }
      else { setOverlay((o) => (o.open ? { ...o, open: false } : o)); navTo("/app/agenda"); toast(`Appuntamento di ${a.patient_name}`, { description: `${when}${a.clinic ? ` · ${a.clinic}` : ""}` }); }
    },
  };
  const items = [
    { id: "agenda", to: "/app", end: true, label: "Dashboard / Agenda", icon: LayoutDashboard },
    { id: "pazienti", to: "/app/pazienti", label: "Pazienti & Cartelle", icon: Users },
    { id: "messaggi", to: "/app/messaggi", label: "Messaggi / Chat", icon: MessagesSquare, badge: unread },
    { id: "visite", to: "/app/visite", label: "Bodychart / Visite", icon: PersonStanding },
    { id: "cassa", to: "/app/cassa", label: "Fatturazione & Tessera Sanitaria", icon: ReceiptText },
    { id: "impostazioni", to: "/app/impostazioni", label: "Impostazioni Account", icon: Settings },
  ];
  if (!SECTIONS.includes(sezione)) return <Navigate to="/app" replace />;

  return (
    <ProcessingProvider onSettled={load} onOpen={openVisit}>
    <TrackPending notes={notes} />
    <AppShell items={items} area="Studio medico">
    <div className="min-h-screen overflow-x-clip bg-paper" data-testid="dashboard" data-section={sezione}>
      <TopBar onCompliance={() => setCompliance(true)} onFeedback={() => setFeedback(true)} onTour={() => setTour(true)} unread={unread} search={search} />
      {sezione === "agenda" && <>
      <Marquee items={ticker} />
      <Hero total={appointments.length} waiting={waiting.length} name={shortName} income={income} />
      <AbsenceBanner />
      <SupportReplies />
      <SignatureReminder />
      <main className="mx-auto grid max-w-[1440px] grid-cols-1 gap-5 px-5 pb-10 lg:grid-cols-12 lg:px-8">
        <motion.div {...col(0.35)} className="order-2 min-w-0 lg:order-1 lg:col-span-4"><Agenda appointments={appointments} onChange={load} patients={patients} onPassport={setPassportId} /></motion.div>
        <motion.div {...col(0.45)} className="order-1 min-w-0 lg:order-2 lg:col-span-4"><ConsultHub next={next} onStart={start} /></motion.div>
        <motion.div {...col(0.55)} className="order-3 min-w-0 lg:col-span-4"><WaitingList waiting={waiting} onChange={load} onStart={start} patients={patients} onPassport={setPassportId} /></motion.div>
      </main>
      <RecentNotes items={notes.filter((c) => isToday(c.created_at))} onOpen={openVisit} />
      <PortalRequests onChange={load} />
      <BetaMetrics refreshKey={cashKey} onFeedback={() => setFeedback(true)} />
      </>}
      {sezione === "pazienti" && <>
        <PageTitle kicker="Archivio clinico" title="Pazienti" it="& cartelle cliniche" />
        <div className="mx-auto max-w-[1440px] space-y-5 pb-12" data-testid="patients-page">
          {folder && <div className="px-5 lg:px-8" id="patient-folder"><PatientFolder patient={patients.find((p) => p.id === folder)} notes={notes} onOpenVisit={openVisit} onPassport={setPassportId} onClose={() => setFolder(null)} /></div>}
          <PassportSection patients={patients} onOpen={(id) => { setFolder(id); window.scrollTo({ top: 0, behavior: "smooth" }); }} onAdd={() => setEditPatient({})} />
        </div>
      </>}
      {sezione === "messaggi" && <div className="pt-4"><DoctorMessages onRead={loadUnread} /></div>}
      {sezione === "visite" && <><PageTitle kicker="Diario clinico" title="Visite" it="e Bodychart" /><VisitsList notes={notes} onOpen={openVisit} /></>}
      {sezione === "cassa" && <><PageTitle kicker="Amministrazione" title="Fatturazione" it="& Tessera Sanitaria" /><TsCard /><CashRegister refreshKey={cashKey} /></>}
      {sezione === "impostazioni" && <Account role="doctor" embedded extras={<SettingsExtras onCompliance={() => setCompliance(true)} onFeedback={() => setFeedback(true)} onTour={() => setTour(true)} />} />}
      {passportId && <Passport key={`${passportId}-${passportKey}`} patientId={passportId} onClose={() => { setPassportId(null); load(); }} onEdit={setEditPatient} />}
      <PatientDialog value={editPatient} onClose={() => setEditPatient(null)} onSaved={() => { load(); setPassportKey((k) => k + 1); }} />
      {compliance && <CompliancePanel onClose={() => setCompliance(false)} />}
      <FeedbackDialog open={feedback} onClose={() => setFeedback(false)} onSent={() => setCashKey((k) => k + 1)} />
      <OnboardingTour open={tour} name={shortName} onDone={endTour} />
      <ConsultationOverlay
        patients={patients}
        onPatientsChange={load}
        open={overlay.open}
        patient={overlay.patient}
        initial={overlay.initial}
        waiting={waiting}
        onClose={() => setOverlay({ open: false, patient: null, initial: null })}
        onDone={load}
        onEditPatient={(pid) => setEditPatient(patients.find((p) => p.id === pid) ?? null)}
      />
    </div>
    </AppShell>
    </ProcessingProvider>
  );
}

// Riprende il monitoraggio delle elaborazioni IA ancora in corso (es. dopo un ricaricamento della pagina)
const TrackPending = ({ notes }) => {
  const { track } = useProcessing();
  useEffect(() => { notes.filter((c) => c.status === "processing").forEach(track); }, [notes, track]);
  return null;
};
