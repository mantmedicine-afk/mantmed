import { useMemo, useState } from "react";
import { Search, RefreshCw } from "lucide-react";
import { useEffect } from "react";
import { api } from "@/lib/api";
import { SupportRow, ST } from "./SupportRow";

const Kpi = ({ label, value, testid }) => (
  <div className="rounded-3xl border border-slate-200 bg-white p-5" data-testid={testid}>
    <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">{label}</div>
    <div className="mt-2 font-display text-5xl leading-none text-night">{value}</div>
  </div>
);
const Sel = ({ value, set, opts, testid }) => (
  <select value={value} onChange={(e) => set(e.target.value)} className="h-10 rounded-full border border-slate-200 bg-white px-4 text-sm text-night" data-testid={testid}>
    {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
  </select>
);

/** Inbox Founder: feedback, richieste di supporto e segnalazioni da medici e pazienti. */
export const SupportInbox = () => {
  const [items, setItems] = useState(null);
  const [f, setF] = useState({ status: "aperti", kind: "tutti", role: "tutti", q: "" });
  const load = () => api.adminFeedback().then(setItems).catch(() => setItems([]));
  useEffect(() => { load(); }, []);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const count = (s) => (items ?? []).filter((i) => i.status === s).length;
  const shown = useMemo(() => (items ?? []).filter((i) => (f.status === "tutti" || (f.status === "aperti" ? i.status !== "risolto" : i.status === f.status))
    && (f.kind === "tutti" || i.kind === f.kind) && (f.role === "tutti" || i.role === f.role)
    && `${i.name} ${i.email} ${i.text}`.toLowerCase().includes(f.q.trim().toLowerCase())), [items, f]);
  const update = (u) => setItems((xs) => xs.map((x) => (x.id === u.id ? u : x)));

  return (
    <section data-testid="support-inbox">
      <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Inbox · medici e pazienti</div>
      <h1 className="mt-1 font-display text-4xl text-night sm:text-5xl">Feedback <span className="italic text-slate-500">e assistenza</span></h1>
      <div className="mt-8 grid grid-cols-3 gap-3">
        {Object.entries(ST).map(([id, s]) => <Kpi key={id} label={s.label} value={count(id)} testid={`inbox-kpi-${id}`} />)}
      </div>
      <div className="mt-8 flex flex-wrap items-center gap-2">
        <Sel value={f.status} set={set("status")} testid="inbox-filter-status" opts={[["aperti", "Da gestire"], ["tutti", "Tutti gli stati"], ["nuovo", "Nuovi"], ["in_lavorazione", "In lavorazione"], ["risolto", "Risolti"]]} />
        <Sel value={f.kind} set={set("kind")} testid="inbox-filter-kind" opts={[["tutti", "Tutti i tipi"], ["feedback", "Feedback"], ["supporto", "Supporto tecnico"], ["segnalazione", "Segnalazioni"]]} />
        <Sel value={f.role} set={set("role")} testid="inbox-filter-role" opts={[["tutti", "Medici e pazienti"], ["doctor", "Medici"], ["parent", "Pazienti / genitori"]]} />
        <label className="flex h-10 items-center gap-2 rounded-full border border-slate-200 bg-white px-4"><Search size={14} className="text-slate-500" /><input value={f.q} onChange={(e) => set("q")(e.target.value)} placeholder="Cerca nome, testo…" className="w-40 bg-transparent text-sm text-night outline-none" data-testid="inbox-search-input" /></label>
        <button onClick={load} className="grid h-10 w-10 place-items-center rounded-full border border-slate-200 bg-white text-night hover:border-night" aria-label="Aggiorna" data-testid="inbox-refresh-btn"><RefreshCw size={14} /></button>
      </div>
      <div className="mt-5 space-y-2" data-testid="inbox-list">
        {items && !shown.length && <p className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-600" data-testid="inbox-empty">Nessun messaggio per questo filtro.</p>}
        {shown.map((i) => <SupportRow key={i.id} item={i} onChange={update} />)}
      </div>
    </section>
  );
};
