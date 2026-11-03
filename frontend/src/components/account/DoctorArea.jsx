import { useNavigate, useSearchParams } from "react-router-dom";
import { ChevronLeft, Stethoscope, CalendarClock, LayoutTemplate, HeartPulse, Sparkles, BellRing, ShieldCheck, BarChart3, CreditCard, Download, FileLock2, MessageSquarePlus } from "lucide-react";
import { DoctorProfile } from "./ProfileForms";
import { ShowcaseSection } from "./ShowcaseSection";
import { DoctorSignatureSection } from "./DoctorSignatureSection";
import { AvailabilitySection } from "./AvailabilitySection";
import { VisitTemplatesSection } from "./VisitTemplatesSection";
import { AiRepliesSection } from "./AiRepliesSection";
import { NotificationsSection } from "./NotificationsSection";
import { SecuritySection } from "./SecuritySection";
import { TsCard } from "@/components/nav/sections";

const ProfessionalProfile = (p) => (
  <div className="space-y-6"><DoctorProfile {...p} /><ShowcaseSection /><DoctorSignatureSection {...p} /></div>
);

const ALIAS = { vetrina: "profilo", firma: "profilo", bilanci: "modelli" };

const tiles = ({ stats, onCompliance, onFeedback, nav }) => [
  { id: "profilo", icon: Stethoscope, title: "Profilo professionale", text: "Dati per referti e ricevute, vetrina pubblica e firma dei referti.", C: ProfessionalProfile },
  { id: "orari", icon: CalendarClock, title: "Orari e disponibilità", text: "Sedi, orari, assenze e slot prenotabili dal portale.", C: AvailabilitySection },
  { id: "modelli", icon: LayoutTemplate, title: "Modelli di visita", text: "Crei e modifichi i modelli che MantAI compila.", C: VisitTemplatesSection },
  { id: "bilanci", icon: HeartPulse, title: "Bilanci di salute", text: "I modelli di bilancio per età, nello stesso archivio dei modelli." },
  { id: "mantai-risposte", icon: Sparkles, title: "MantAI Risposte", text: "Bozze di risposta ai messaggi delle famiglie.", C: AiRepliesSection },
  { id: "notifiche", icon: BellRing, title: "Notifiche e avvisi", text: "Quali avvisi ricevere e come.", C: NotificationsSection },
  { id: "sicurezza", icon: ShieldCheck, title: "Sicurezza e accesso", text: "Password, verifica in due passaggi e sessioni attive.", C: SecuritySection },
  { id: "statistiche", icon: BarChart3, title: "Statistiche", text: "Visite, sala d'attesa, incassi e metriche di utilizzo.", node: stats },
  { id: "tessera-sanitaria", icon: CreditCard, title: "Tessera Sanitaria", text: "Invio delle spese sanitarie al Sistema TS.", node: <TsCard /> },
  { id: "esportazioni", icon: Download, title: "Esportazioni", text: "Registro cassa per il commercialista e copia dei dati (GDPR).", onClick: () => nav("/app/cassa") },
  { id: "gdpr", icon: FileLock2, title: "Sicurezza e GDPR", text: "Registro attività, cifratura, consensi e conservazione.", onClick: onCompliance },
  { id: "feedback", icon: MessageSquarePlus, title: "Feedback e assistenza", text: "Segnali un problema o proponga un miglioramento.", onClick: onFeedback },
];

const Tile = ({ t, onOpen }) => (
  <button onClick={onOpen} className="flex min-h-[120px] flex-col items-start gap-2 rounded-2xl border border-[var(--hair)] bg-[var(--surface)] p-5 text-left transition-colors hover:border-[var(--accent)]" data-testid={`area-tile-${t.id}`}>
    <t.icon size={22} className="text-[var(--fg)]" />
    <span className="text-lg font-semibold text-[var(--fg)]">{t.title}</span>
    <span className="text-[15px] leading-snug text-[var(--fg2)]">{t.text}</span>
  </button>
);

export const DoctorArea = ({ data, onSaved, tools }) => {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const list = tiles({ ...tools, nav });
  const raw = params.get("sezione");
  const cur = list.find((t) => t.id === (ALIAS[raw] ?? raw));
  const open = (t) => (t.onClick ? t.onClick() : setParams({ sezione: t.id === "bilanci" ? "modelli" : t.id }));
  if (cur && (cur.C || cur.node)) return (
    <div data-testid={`account-section-${cur.id}`}>
      <button onClick={() => setParams({})} className="mb-4 flex min-h-[44px] items-center gap-1 text-[15px] font-medium text-[var(--fg)]" data-testid="area-back"><ChevronLeft size={18} /> Area personale</button>
      <h2 className="mb-5 flex items-center gap-2 text-2xl font-semibold text-[var(--fg)]"><cur.icon size={22} /> {cur.title}</h2>
      {cur.C ? <cur.C key={cur.id} data={data} onSaved={onSaved} /> : cur.node}
    </div>
  );
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="area-grid">
      {list.map((t) => <Tile key={t.id} t={t} onOpen={() => open(t)} />)}
    </div>
  );
};
