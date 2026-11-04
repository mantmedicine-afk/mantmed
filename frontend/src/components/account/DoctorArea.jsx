import { useNavigate, useSearchParams } from "react-router-dom";
import { useEffect } from "react";
import { ChevronLeft } from "lucide-react";
import { AREA_SECTIONS } from "./areaSections";
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

const BEHAVIOR = ({ stats, onCompliance, onFeedback, nav }) => ({
  profilo: { C: ProfessionalProfile }, orari: { C: AvailabilitySection }, modelli: { C: VisitTemplatesSection },
  "mantai-risposte": { C: AiRepliesSection }, notifiche: { C: NotificationsSection }, sicurezza: { C: SecuritySection },
  statistiche: { node: stats }, "tessera-sanitaria": { node: <TsCard /> },
  esportazioni: { onClick: () => nav("/app/cassa#cash-monthly") }, gdpr: { onClick: onCompliance }, feedback: { onClick: onFeedback },
});
const tiles = (tools) => { const b = BEHAVIOR(tools); return AREA_SECTIONS.map((s) => ({ ...s, ...b[s.id] })); };

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
  useEffect(() => {
    if (cur?.onClick) { setParams({}, { replace: true }); cur.onClick(); }
  }, [raw]); // eslint-disable-line react-hooks/exhaustive-deps
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
