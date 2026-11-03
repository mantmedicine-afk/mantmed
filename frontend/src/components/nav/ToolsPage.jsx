import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { BarChart3, LayoutTemplate, HeartPulse, Download, CreditCard, ShieldCheck, Store, ChevronLeft } from "lucide-react";
import { TsCard } from "./sections";

const Card = ({ icon: Icon, title, text, onClick, testId }) => (
  <button onClick={onClick} className="flex min-h-[120px] flex-col items-start gap-2 rounded-2xl border border-[var(--hair)] bg-[var(--surface)] p-5 text-left transition-colors hover:border-[var(--accent)]" data-testid={testId}>
    <Icon size={22} className="text-[var(--fg)]" />
    <span className="text-lg font-semibold text-[var(--fg)]">{title}</span>
    <span className="text-[15px] leading-snug text-[var(--fg2)]">{text}</span>
  </button>
);

/** Strumenti: funzioni meno frequenti, raccolte in un'unica pagina. */
export const ToolsPage = ({ stats, onCompliance }) => {
  const nav = useNavigate();
  const [panel, setPanel] = useState(null);
  if (panel) return (
    <div className="mx-auto max-w-[1200px] px-5 py-6 lg:px-8" data-testid={`tools-panel-${panel}`}>
      <button onClick={() => setPanel(null)} className="mb-4 flex min-h-[44px] items-center gap-1 text-[15px] font-medium text-[var(--fg)]" data-testid="tools-back"><ChevronLeft size={18} /> Strumenti</button>
      {panel === "stats" ? stats : <TsCard />}
    </div>
  );
  return (
    <div className="mx-auto max-w-[1200px] px-5 py-8 lg:px-8" data-testid="tools-page">
      <h1 className="text-3xl font-semibold tracking-tight text-[var(--fg)]">Strumenti</h1>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card icon={BarChart3} title="Statistiche" text="Visite, sala d'attesa, incassi e metriche di utilizzo." onClick={() => setPanel("stats")} testId="tools-stats" />
        <Card icon={LayoutTemplate} title="Modelli di visita" text="Crei e modifichi i modelli che MantAI compila." onClick={() => nav("/app/impostazioni?sezione=modelli")} testId="tools-templates" />
        <Card icon={HeartPulse} title="Bilanci di salute" text="I modelli di bilancio per età, nello stesso archivio dei modelli." onClick={() => nav("/app/impostazioni?sezione=modelli")} testId="tools-bilanci" />
        <Card icon={Download} title="Esportazioni" text="Registro cassa per il commercialista e copia dei dati (GDPR)." onClick={() => nav("/app/cassa")} testId="tools-exports" />
        <Card icon={CreditCard} title="Tessera Sanitaria" text="Invio delle spese sanitarie al Sistema TS." onClick={() => setPanel("ts")} testId="tools-ts" />
        <Card icon={ShieldCheck} title="Pannello GDPR" text="Registro attività, cifratura, consensi e conservazione." onClick={onCompliance} testId="tools-gdpr" />
        <Card icon={Store} title="Vetrina pubblica" text="Il suo profilo pubblico, prestazioni e profili social." onClick={() => nav("/app/impostazioni?sezione=vetrina")} testId="tools-showcase" />
      </div>
    </div>
  );
};
