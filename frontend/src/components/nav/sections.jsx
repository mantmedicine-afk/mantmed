import { useEffect, useMemo, useState } from "react";
import { Search, FileText, PersonStanding, Landmark, X } from "lucide-react";
import { BodychartHistory } from "@/components/bodychart/BodychartHistory";
import { TeamPanel } from "@/components/team/TeamPanel";
import { api } from "@/lib/api";

const dt = (iso) => new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" });

export const PageTitle = ({ kicker, title, it }) => (
  <div className="mx-auto max-w-[1440px] px-5 pb-6 pt-8 lg:px-8">
    <div className="text-[11px] uppercase tracking-[0.22em] text-[var(--fg2)]">{kicker}</div>
    <h1 className="mt-1 font-display text-4xl text-[var(--fg)] sm:text-5xl">{title} {it && <span className="italic text-[var(--fg2)]">{it}</span>}</h1>
  </div>
);

const VisitRow = ({ c, onOpen }) => (
  <button onClick={() => onOpen(c)} className="group flex w-full flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--hair)] bg-[var(--surface)] p-4 text-left transition-all hover:-translate-y-0.5 hover:border-[var(--accent)]" data-testid={`visit-row-${c.id}`}>
    <span className="min-w-0"><span className="block font-medium text-[var(--fg)]">{c.patient_name}</span><span className="block truncate text-sm text-[var(--fg2)]">{c.status === "processing" ? "Elaborazione referto in corso…" : (c.note?.motivo_visita && c.note.motivo_visita !== "Non riportato") ? c.note.motivo_visita : "Visita"} · {c.clinic || "Studio"}</span></span>
    <span className="flex items-center gap-2 text-xs text-[var(--fg2)]">{dt(c.created_at)} <PersonStanding size={15} className="text-[var(--fg)] transition-transform group-hover:scale-110" /></span>
  </button>
);

export const VisitsList = ({ notes, onOpen }) => {
  const [q, setQ] = useState("");
  const list = useMemo(() => notes.filter((c) => c.patient_name.toLowerCase().includes(q.trim().toLowerCase())), [notes, q]);
  return (
    <section className="mx-auto max-w-[1440px] px-5 pb-12 lg:px-8" data-testid="visits-page">
      <p className="mb-4 max-w-2xl text-sm text-[var(--fg2)]">Apra una visita per rivedere la cartella clinica, il referto e compilare il Bodychart (pulsante "Bodychart" nella scheda).</p>
      <label className="relative mb-4 block max-w-md"><Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--fg2)]" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca per paziente" className="h-12 w-full rounded-full border border-[var(--hair)] bg-[var(--surface)] pl-11 pr-4 text-sm text-[var(--fg)] outline-none focus:border-[var(--accent)]" data-testid="visits-search" /></label>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {list.length === 0 && <p className="text-sm text-[var(--fg2)]" data-testid="visits-empty">Nessuna visita trovata.</p>}
        {list.map((c) => <VisitRow key={c.id} c={c} onOpen={onOpen} />)}
      </div>
    </section>
  );
};

export const PatientFolder = ({ patient, ...rest }) => (patient ? <PatientFolderBody key={patient.id} patient={patient} {...rest} /> : null);

const PatientFolderBody = ({ patient, notes, onOpenVisit, onPassport, onClose }) => {
  const [own, setOwn] = useState(null);
  useEffect(() => { let alive = true; api.patientConsultations(patient.id).then((v) => alive && setOwn(v)).catch(() => {}); return () => { alive = false; }; }, [patient.id, notes]);
  const visits = own ?? notes.filter((c) => c.patient_id === patient.id);
  return (
    <div className="space-y-4" data-testid={`patient-folder-${patient.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[28px] bg-[var(--accent)] p-5 text-[var(--ink)]">
        <div><div className="text-[11px] uppercase tracking-[0.2em] text-[var(--fg2)]">Cartella clinica</div><div className="font-display text-3xl">{patient.name}</div></div>
        <div className="flex flex-wrap gap-2"><button onClick={() => onPassport(patient.id)} className="flex h-11 items-center gap-2 rounded-full bg-[var(--surface)] px-5 text-sm font-semibold text-[var(--fg)] transition-transform hover:-translate-y-0.5" data-testid="patient-folder-passport-btn"><FileText size={15} /> Passaporto sanitario</button>
          <button onClick={onClose} className="grid h-11 w-11 place-items-center rounded-full border border-[var(--hair)] hover:bg-[var(--surface)] hover:text-[var(--fg)]" aria-label="Chiudi cartella" data-testid="patient-folder-close"><X size={16} /></button></div>
      </div>
<div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <div className="rounded-[28px] border border-[var(--hair)] bg-[var(--surface)] p-4 sm:p-6">
        <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--fg2)]">Visite ({visits.length})</div>
        <div className="space-y-2">{visits.length ? visits.map((c) => <VisitRow key={c.id} c={c} onOpen={onOpenVisit} />) : <p className="text-sm text-[var(--fg2)]" data-testid="patient-folder-no-visits">Nessuna visita registrata.</p>}</div>
      </div>
      <BodychartHistory patientId={patient.id} />
      </div>
      <TeamPanel patientId={patient.id} />
    </div>
  );
};

export const TsCard = () => (
  <div className="mx-auto max-w-[1440px] px-5 pb-6 lg:px-8">
    <div className="flex flex-wrap items-center gap-4 rounded-[28px] border border-dashed border-[var(--hair)] bg-[var(--surface)] p-5" data-testid="ts-card">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-[var(--raised)] text-[var(--fg)]"><Landmark size={20} /></span>
      <div className="min-w-0 flex-1"><div className="font-medium text-[var(--fg)]">Invio al Sistema Tessera Sanitaria</div><div className="text-sm text-[var(--fg2)]">La trasmissione automatica delle spese sanitarie per il 730 precompilato sarà disponibile a breve.</div></div>
      <span className="rounded-full bg-[var(--sel)] px-3 py-1 text-xs font-semibold text-[var(--fg)]" data-testid="ts-coming-soon">In arrivo</span>
    </div>
  </div>
);
