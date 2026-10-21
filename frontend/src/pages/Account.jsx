import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, UserRound, Users, ShieldCheck, BellRing, FileLock2, Stethoscope, CalendarClock, Loader2, PenLine, LayoutTemplate } from "lucide-react";
import { VisitTemplatesSection } from "@/components/account/VisitTemplatesSection";
import { LogoMark } from "@/components/dash/Logo";
import { api, errMsg } from "@/lib/api";
import { ParentProfile, DoctorProfile } from "@/components/account/ProfileForms";
import { FamilySection } from "@/components/account/FamilySection";
import { SecuritySection } from "@/components/account/SecuritySection";
import { NotificationsSection } from "@/components/account/NotificationsSection";
import { PrivacySection } from "@/components/account/PrivacySection";
import { AvailabilitySection } from "@/components/account/AvailabilitySection";
import { DoctorSignatureSection } from "@/components/account/DoctorSignatureSection";

const SECTIONS = {
  parent: [
    { id: "dati", label: "Dati personali", icon: UserRound, C: ParentProfile },
    { id: "famiglia", label: "Nucleo familiare", icon: Users, C: FamilySection },
    { id: "sicurezza", label: "Sicurezza", icon: ShieldCheck, C: SecuritySection },
    { id: "notifiche", label: "Notifiche", icon: BellRing, C: NotificationsSection },
    { id: "privacy", label: "Privacy e consensi", icon: FileLock2, C: PrivacySection },
  ],
  doctor: [
    { id: "profilo", label: "Profilo professionale", icon: Stethoscope, C: DoctorProfile },
    { id: "orari", label: "Orari e disponibilità", icon: CalendarClock, C: AvailabilitySection },
    { id: "modelli", label: "Modelli Visita", icon: LayoutTemplate, C: VisitTemplatesSection },
    { id: "firma", label: "Firma per i referti", icon: PenLine, C: DoctorSignatureSection },
    { id: "notifiche", label: "Notifiche e avvisi", icon: BellRing, C: NotificationsSection },
    { id: "sicurezza", label: "Sicurezza e accesso", icon: ShieldCheck, C: SecuritySection },
  ],
};

export default function Account({ role, embedded = false, extras = null }) {
  const [data, setData] = useState(null);
  const [params, setParams] = useSearchParams();
  const list = SECTIONS[role] ?? SECTIONS.parent;
  const cur = list.find((s) => s.id === params.get("sezione")) ?? list[0];
  const load = useCallback(() => api.account().then(setData).catch((e) => toast.error(errMsg(e))), []);
  useEffect(() => { load(); }, [load]);
  const back = role === "doctor" ? "/app" : "/portale";
  return (
    <div className={embedded ? "" : "min-h-screen bg-[#F4F5F7]"} data-testid="account-page">
      {!embedded && <header className="sticky top-0 z-40 bg-[#0A192F]">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-3 px-5 py-3">
          <div className="flex items-center gap-3"><LogoMark size={34} light /><div className="leading-none"><div className="font-display text-2xl text-white">MantMed</div><div className="mt-1 text-[10px] uppercase tracking-[0.22em] text-[#C9CCD3]">Area riservata</div></div></div>
          <Link to={back} className="flex h-10 items-center gap-2 rounded-full border border-[#C9CCD3]/30 px-4 text-sm text-white transition-colors hover:border-white" data-testid="account-back-link"><ArrowLeft size={15} /> <span className="hidden sm:inline">{role === "doctor" ? "Torna alla dashboard" : "Torna al portale"}</span></Link>
        </div>
      </header>}
      <main className={`mx-auto max-w-[1200px] px-5 ${embedded ? "pb-12 pt-8" : "py-8 lg:py-12"}`}>
        <div className="text-[11px] uppercase tracking-[0.22em] text-slate-600">{embedded ? "Impostazioni account" : "Gestione account"}</div>
        <h1 className="mt-1 font-display text-4xl text-night sm:text-5xl">{data?.name || "Il mio profilo"}</h1>
        <p className="mt-1 text-sm text-slate-600" data-testid="account-email">{data?.email}</p>
        {extras && <div className="mt-5">{extras}</div>}
        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[260px_1fr]">
          <nav className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0" aria-label="Sezioni" data-testid="account-nav">
            {list.map((s) => (
              <button key={s.id} ref={(el) => { if (el && cur.id === s.id) el.scrollIntoView({ block: "nearest", inline: "nearest" }); }} onClick={() => setParams({ sezione: s.id }, { replace: true })} aria-current={cur.id === s.id ? "page" : undefined}
                className={`flex h-11 shrink-0 items-center gap-2.5 rounded-full px-4 text-sm font-medium transition-colors lg:w-full lg:rounded-2xl ${cur.id === s.id ? "bg-night text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:text-night"}`} data-testid={`account-nav-${s.id}`}>
                <s.icon size={16} /> {s.label}
              </button>
            ))}
          </nav>
          <div className="min-w-0" data-testid={`account-section-${cur.id}`}>
            {data ? <cur.C key={cur.id} data={data} onSaved={setData} /> : <Loader2 className="animate-spin text-night" />}
          </div>
        </div>
      </main>
    </div>
  );
}
