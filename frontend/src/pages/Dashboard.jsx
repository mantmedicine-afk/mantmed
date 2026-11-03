import { toast } from "sonner";
import { useCallback, useEffect, useState } from "react";
import { api, CLINICS, errMsg } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { TopBar } from "@/components/dash/TopBar";
import { Hero } from "@/components/dash/Hero";
import { ConsultationOverlay } from "@/components/dash/ConsultationOverlay";
import { PassportSection } from "@/components/dash/PassportSection";
import { Passport } from "@/components/dash/Passport";
import { PatientDialog } from "@/components/dash/PatientDialog";
import { CashRegister } from "@/components/dash/CashRegister";
import { PortalRequests } from "@/components/dash/PortalRequests";
import { CompliancePanel } from "@/components/dash/CompliancePanel";
import { FeedbackDialog } from "@/components/dash/FeedbackDialog";
import { BetaMetrics } from "@/components/dash/BetaMetrics";
import { NetworkSearch } from "@/components/team/TeamPanel";
import { GuidedTour } from "@/components/tour/GuidedTour";
import { DOCTOR_STEPS } from "@/components/tour/steps";
import { useTour } from "@/components/tour/useTour";
import { DoctorMessages } from "@/components/dash/DoctorMessages";
import { AbsenceBanner } from "@/components/dash/AbsenceBanner";
import { SupportReplies } from "@/components/support/SupportReplies";
import { SignatureReminder } from "@/components/signature/SignatureReminder";
import { usePoll } from "@/hooks/usePoll";
import { useNavigate, useParams, Navigate } from "react-router-dom";
import { Sun, Users, MessagesSquare, ReceiptText, Settings, Wrench } from "lucide-react";
import { AppShell } from "@/components/nav/AppShell";
import { PageTitle, VisitsList, PatientFolder, SettingsExtras } from "@/components/nav/sections";
import { ToolsPage } from "@/components/nav/ToolsPage";
import { Fold } from "@/components/today/Today";
import { OggiScreen } from "@/components/oggi/OggiScreen";
import Account from "@/pages/Account";
import { ProcessingProvider, useProcessing } from "@/lib/processing";

const SECTIONS = ["agenda", "pazienti", "messaggi", "visite", "cassa", "impostazioni", "strumenti"];



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
  const tourCtl = useTour();
  const setTour = tourCtl.start;
  const [unread, setUnread] = useState(0);
  const loadUnread = useCallback(() => api.msgSummary().then(setUnread).catch(() => {}), []);
  usePoll(loadUnread, []);
  const [aiQueued, setAiQueued] = useState(0);
  usePoll(() => api.aiQueue().then((q) => setAiQueued(q.count)).catch(() => {}), []);

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

  const [requests, setRequests] = useState(0);
  usePoll(() => api.apptRequests().then((r) => setRequests(r.filter((x) => !x.status || x.status === "pending").length)).catch(() => {}), []);
  const start = (patient) => setOverlay({ open: true, patient: patient ?? null, initial: null });
  const { sezione = "agenda" } = useParams();
  const [folder, setFolder] = useState(null);
  const [showVisits, setShowVisits] = useState(false);
  const openVisit = (c) => setOverlay({ open: true, patient: null, initial: c });
  const navTo = useNavigate();
  const search = {
    onPatient: (id) => { setOverlay((o) => (o.open ? { ...o, open: false } : o)); setPassportId(id); },
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
    { id: "agenda", to: "/app", end: true, label: "Oggi", icon: Sun },
    { id: "pazienti", to: "/app/pazienti", label: "Pazienti", icon: Users },
    { id: "messaggi", to: "/app/messaggi", label: "Messaggi", icon: MessagesSquare, badge: unread + aiQueued },
    { id: "cassa", to: "/app/cassa", label: "Cassa", icon: ReceiptText },
    { id: "impostazioni", to: "/app/impostazioni", label: "Impostazioni", icon: Settings },
    { id: "strumenti", to: "/app/strumenti", label: "Strumenti", icon: Wrench, bottom: true },
  ];
  if (!SECTIONS.includes(sezione)) return <Navigate to="/app" replace />;

  const modals = <>
      {passportId && <Passport key={`${passportId}-${passportKey}`} patientId={passportId} onClose={() => { setPassportId(null); load(); }} onEdit={setEditPatient}
        onStart={(p) => { setPassportId(null); start({ name: p.name, patient_id: p.id }); }} onOpenVisit={(c) => { setPassportId(null); openVisit(c); }} />}
      <PatientDialog value={editPatient} onClose={() => setEditPatient(null)} onSaved={() => { load(); setPassportKey((k) => k + 1); }} />
      {compliance && <CompliancePanel onClose={() => setCompliance(false)} />}
      <FeedbackDialog open={feedback} onClose={() => setFeedback(false)} onSent={() => setCashKey((k) => k + 1)} />
      <GuidedTour open={tourCtl.open} steps={DOCTOR_STEPS} name={shortName} where="Impostazioni o nella barra in alto" onDone={tourCtl.end} />
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
  </>;

  return (
    <ProcessingProvider onSettled={load} onOpen={openVisit}>
    <TrackPending notes={notes} />
    <AppShell items={items} area="Studio medico">
    <div className="min-h-screen overflow-x-clip bg-paper" data-testid="dashboard" data-section={sezione}>
      <TopBar onCompliance={() => setCompliance(true)} onFeedback={() => setFeedback(true)} onTour={() => setTour(true)} unread={unread} search={search} />
      {sezione === "agenda" && <OggiScreen appointments={appointments} patients={patients} notes={notes} unread={unread + aiQueued} requests={requests}
        onStart={start} onOpenPatient={setPassportId} onSign={openVisit} top={<><AbsenceBanner /><SupportReplies /><SignatureReminder /></>} />}
      {sezione === "strumenti" && <ToolsPage onCompliance={() => setCompliance(true)} stats={<div className="space-y-5"><Hero total={appointments.length} waiting={waiting.length} name={shortName} income={income} /><BetaMetrics refreshKey={cashKey} onFeedback={() => setFeedback(true)} /></div>} />}
      {sezione === "pazienti" && <>
        <PageTitle kicker="Archivio clinico" title="Pazienti" it="& cartelle cliniche" />
        <div className="mx-auto max-w-[1440px] space-y-5 pb-12" data-testid="patients-page">
          <div className="flex gap-2 px-5 lg:px-8" role="tablist">
            <button role="tab" aria-selected={!showVisits} onClick={() => setShowVisits(false)} className={`h-11 rounded-xl px-5 text-[15px] font-medium ${!showVisits ? "bg-[#0A192F] text-white" : "bg-[#F2F2EF] text-[#0A192F]"}`} data-testid="patients-tab-list">Pazienti</button>
            <button role="tab" aria-selected={showVisits} onClick={() => setShowVisits(true)} className={`h-11 rounded-xl px-5 text-[15px] font-medium ${showVisits ? "bg-[#0A192F] text-white" : "bg-[#F2F2EF] text-[#0A192F]"}`} data-testid="patients-tab-visits">Tutte le visite</button>
          </div>
          {showVisits ? <VisitsList notes={notes} onOpen={openVisit} /> : <>
          {folder && <div className="px-5 lg:px-8" id="patient-folder"><PatientFolder patient={patients.find((p) => p.id === folder)} notes={notes} onOpenVisit={openVisit} onPassport={setPassportId} onClose={() => setFolder(null)} /></div>}
          <NetworkSearch />
          <PassportSection patients={patients} onOpen={(id) => { setFolder(id); window.scrollTo({ top: 0, behavior: "smooth" }); }} onAdd={() => setEditPatient({})} />
          </>}
        </div>
      </>}
      {sezione === "messaggi" && <div className="space-y-5 pt-4">{requests > 0 && <div className="mx-auto max-w-[1280px] px-5 lg:px-8" id="today-requests"><Fold title={`Richieste dal portale · ${requests}`} testId="today-requests-fold" defaultOpen><PortalRequests onChange={load} /></Fold></div>}<DoctorMessages onRead={loadUnread} /></div>}
      {sezione === "visite" && <><PageTitle kicker="Diario clinico" title="Visite" it="e Bodychart" /><VisitsList notes={notes} onOpen={openVisit} /></>}
      {sezione === "cassa" && <><PageTitle kicker="Amministrazione" title="Cassa" it="ricevute e incassi" /><CashRegister refreshKey={cashKey} /></>}
      {sezione === "impostazioni" && <Account role="doctor" embedded extras={<SettingsExtras onCompliance={() => setCompliance(true)} onFeedback={() => setFeedback(true)} onTour={() => setTour(true)} />} />}
      {modals}
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
