import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarClock, MessagesSquare, CalendarPlus, Sparkles, ListChecks, CalendarHeart, BookOpen, MapPin } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { MantAIButton } from "@/components/mantai/MantAI";
import { api } from "@/lib/api";
import { Avatar } from "@/components/showcase/ShowcaseView";

const greet = () => { const h = new Date().getHours(); return h < 13 ? "Buongiorno" : h < 18 ? "Buon pomeriggio" : "Buonasera"; };
const longDay = (d) => new Date(`${d}T12:00:00`).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });

export const PortalCover = ({ user, kids }) => {
  const next = kids.flatMap((c) => c.appointments.filter((a) => a.date).map((a) => ({ ...a, who: c.patient.name }))).sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))[0];
  return (
    <section className="relative overflow-hidden rounded-[32px] bg-[#0A192F] p-7 text-[#FDFBF7] sm:p-10" data-testid="portal-cover">
      <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full bg-[#3B6CF6]/25 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 left-1/3 h-64 w-64 rounded-full bg-[#FFE5B4]/15 blur-3xl" />
      <div className="relative">
        <div className="text-[11px] uppercase tracking-[0.24em] text-[#C9CCD3]">Area personale protetta</div>
        <h1 className="mt-2 font-display text-4xl leading-tight sm:text-5xl lg:text-6xl" data-testid="portal-greeting">{greet()}, <span className="italic text-[#FFE5B4]">{user?.name?.split(" ")[0]}</span></h1>
        <div className="mt-6 flex flex-wrap gap-2">
          {[...new Map(kids.map((c) => [c.group, c])).values()].map((c) => <span key={c.group} className="rounded-full bg-white/10 px-4 py-1.5 text-sm text-white ring-1 ring-white/15" data-testid={`portal-cover-kid-${c.patient.id}`}>{c.patient.name.split(" ")[0]}</span>)}
        </div>
        <div className="mt-6 flex items-center gap-3 rounded-2xl bg-white/[0.07] p-4 ring-1 ring-white/10 sm:max-w-md" data-testid="portal-cover-next">
          <CalendarClock size={20} strokeWidth={1.5} className="shrink-0 text-[#FFE5B4]" />
          {next ? <div className="text-sm"><div className="text-[#C9CCD3]">Prossimo appuntamento</div><div className="font-medium capitalize text-white">{longDay(next.date)} · {next.time} · {next.who.split(" ")[0]}</div><div className="text-[#C9CCD3]">{next.visit_type} · {next.clinic}</div></div>
            : <div className="text-sm text-[#C9CCD3]">Nessun appuntamento in programma.</div>}
        </div>
      </div>
    </section>
  );
};

const Term = ({ g }) => (
  <Tooltip><TooltipTrigger asChild><button className="rounded-full bg-white px-3 py-1.5 text-sm text-night ring-1 ring-[#FFE5B4] decoration-dotted underline-offset-4 hover:underline" data-testid={`simple-term-${g.termine}`}>{g.termine}</button></TooltipTrigger>
    <TooltipContent className="max-w-xs bg-night text-sm text-white">{g.spiegazione}</TooltipContent></Tooltip>
);

export const SimpleBox = ({ kid }) => {
  const [s, setS] = useState(null);
  const pid = kid.patient.id;
  useEffect(() => { setS(null); api.portalSimple(pid).then(setS).catch(() => setS({ available: false })); }, [pid]);
  const who = kid.patient.name.split(" ")[0];
  return (
    <section className="rounded-[32px] border border-[#FFE5B4] bg-[#FFF9E6] p-6 sm:p-8" data-testid="portal-simple-box">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#B7791F]"><Sparkles size={14} strokeWidth={1.5} /> Ultima visita di {who}</div>
      <h2 className="mt-2 font-display text-3xl text-night sm:text-4xl">In parole semplici</h2>
      {!s && <div className="mt-6 space-y-3"><div className="ai-shimmer h-4 w-11/12 rounded-full" /><div className="ai-shimmer h-4 w-2/3 rounded-full" /><div className="ai-shimmer h-4 w-3/4 rounded-full" /></div>}
      {s && !s.available && <p className="mt-4 max-w-xl text-[#0A192F]/70" data-testid="portal-simple-empty">Dopo la prossima visita troverà qui, spiegato con parole chiare, cosa ha detto il medico, cosa fare a casa e quando tornare.</p>}
      {s?.available && (
        <TooltipProvider delayDuration={100}>
          <div className="mt-1 text-sm text-[#0A192F]/60">{new Date(s.created_at).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" })}{s.clinic ? ` · ${s.clinic}` : ""}</div>
          <p className="mt-5 text-lg leading-relaxed text-night" data-testid="portal-simple-diagnosi">{s.diagnosi || s.riepilogo}</p>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {s.cosa_fare?.length > 0 && <div className="rounded-2xl bg-white/70 p-5"><div className="flex items-center gap-2 text-sm font-semibold text-night"><ListChecks size={16} strokeWidth={1.5} /> Cosa fare</div><ul className="mt-3 space-y-2 text-sm text-[#0A192F]/80" data-testid="portal-simple-todo">{s.cosa_fare.map((x) => <li key={x} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#B7791F]" />{x}</li>)}</ul></div>}
            {s.quando_tornare && <div className="rounded-2xl bg-white/70 p-5"><div className="flex items-center gap-2 text-sm font-semibold text-night"><CalendarHeart size={16} strokeWidth={1.5} /> Quando tornare</div><p className="mt-3 text-sm text-[#0A192F]/80" data-testid="portal-simple-when">{s.quando_tornare}</p></div>}
          </div>
          {s.glossario?.length > 0 && <div className="mt-6"><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#0A192F]/60"><BookOpen size={14} strokeWidth={1.5} /> Le parole del referto</div><div className="mt-3 flex flex-wrap gap-2" data-testid="portal-simple-glossary">{s.glossario.map((g) => <Term key={g.termine} g={g} />)}</div></div>}
        </TooltipProvider>
      )}
    </section>
  );
};

export const DoctorCard = ({ kid, onWrite, onBook }) => {
  const d = kid.doctor;
  return (
    <section className="flex flex-col gap-5 rounded-[32px] bg-white p-6 ring-1 ring-[#0A192F]/10 transition-shadow duration-300 hover:shadow-md" data-testid="portal-doctor-card">
      <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#0A192F]/50">Il medico di {kid.patient.name.split(" ")[0]}</div>
      <div className="flex items-center gap-4"><Avatar src={d.photo_url} name={d.name} size="h-16 w-16 text-xl" /><div className="min-w-0"><div className="font-display text-2xl leading-tight text-night" data-testid="portal-doctor-name">{d.name}</div><div className="text-sm font-medium text-[#3B6CF6]">{d.specialty}</div></div></div>
      {(d.clinics ?? []).length > 0 && <ul className="space-y-1.5 text-sm text-[#0A192F]/70">{d.clinics.map((c) => <li key={c.name} className="flex gap-2"><MapPin size={14} strokeWidth={1.5} className="mt-0.5 shrink-0" /><span><span className="text-night">{c.name}</span>{c.address ? ` · ${c.address}` : ""}</span></li>)}</ul>}
      <div className="mt-auto grid grid-cols-2 gap-2">
        <button onClick={onWrite} className="flex h-11 items-center justify-center gap-1.5 rounded-full border border-[#0A192F]/15 text-sm font-medium text-night transition-colors hover:border-night" data-testid="portal-doctor-write"><MessagesSquare size={15} strokeWidth={1.5} /> Scrivi</button>
        <button onClick={onBook} className="flex h-11 items-center justify-center gap-1.5 rounded-full bg-night text-sm font-semibold text-white transition-transform hover:-translate-y-0.5" data-testid="portal-doctor-book"><CalendarPlus size={15} strokeWidth={1.5} /> Prenota</button>
      </div>
      {d.slug && <Link to={`/portale/trova-specialista?medico=${d.slug}`} className="text-center text-sm text-[#3B6CF6] hover:underline" data-testid="portal-doctor-showcase">Vedi la Vetrina dello studio</Link>}
    </section>
  );
};

/** Panoramica: copertina, "In parole semplici" in evidenza e medico curante (con selettore se più figli). */
export const PortalOverview = ({ user, kids, onWrite, onBook }) => {
  const uniq = [...new Map(kids.map((c) => [c.patient.id, c])).values()];
  const [pid, setPid] = useState(uniq[0]?.patient.id);
  const kid = uniq.find((c) => c.patient.id === pid) ?? uniq[0];
  return (
    <div className="space-y-5" data-testid="portal-overview">
      <PortalCover user={user} kids={kids} />
      {uniq.length > 1 && <div className="flex flex-wrap gap-2" data-testid="portal-overview-kids">{uniq.map((c) => <button key={c.patient.id} onClick={() => setPid(c.patient.id)} className={`rounded-full px-4 py-2 text-sm transition-colors ${c.patient.id === kid?.patient.id ? "bg-night text-white" : "bg-white text-night ring-1 ring-[#0A192F]/10 hover:ring-night"}`} data-testid={`portal-overview-kid-${c.patient.id}`}>{c.patient.name.split(" ")[0]} · {c.doctor.specialty}</button>)}</div>}
      {kid && <div className="grid grid-cols-1 gap-5 lg:grid-cols-12"><div className="space-y-3 lg:col-span-8"><SimpleBox kid={kid} /><MantAIButton variant="banner" view="patient" /></div><div className="lg:col-span-4"><DoctorCard kid={kid} onWrite={() => onWrite(kid)} onBook={() => onBook(kid)} /></div></div>}
    </div>
  );
};
