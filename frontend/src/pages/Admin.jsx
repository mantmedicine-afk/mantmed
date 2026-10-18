import { useEffect, useMemo, useState } from "react";
import { Search, LogOut, ShieldCheck, Download, Inbox, RefreshCw } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LogoMark } from "@/components/dash/Logo";
import { TwoFactorCard } from "@/components/dash/Security";
import { LeadRow, STATUSES } from "@/components/admin/LeadRow";
import { DoctorsPanel } from "@/components/admin/Doctors";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const csv = (rows) => {
  const cols = ["created_at", "name", "email", "specialty", "city", "kind_label", "status", "message", "note"];
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const blob = new Blob(["\ufeff" + [cols.join(";"), ...rows.map((r) => cols.map((c) => esc(r[c])).join(";"))].join("\n")], { type: "text/csv;charset=utf-8" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "MantMed_richieste.csv" });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
};

const Kpi = ({ label, value, dark, testid, wide }) => (
  <div className={`rounded-3xl p-5 ${wide ? "col-span-2 lg:col-span-1" : ""} ${dark ? "grain relative overflow-hidden bg-night text-white" : "border border-slate-200 bg-white text-night"}`} data-testid={testid}>
    <div className={`relative text-[11px] uppercase tracking-[0.2em] ${dark ? "text-[#C9CCD3]" : "text-slate-500"}`}>{label}</div>
    <div className="relative mt-2 font-display text-5xl leading-none">{value}</div>
  </div>
);

export default function Admin() {
  const { user, logout } = useAuth();
  const [leads, setLeads] = useState([]);
  const [filter, setFilter] = useState("tutte");
  const [kind, setKind] = useState("tutti");
  const [q, setQ] = useState("");
  const [sec, setSec] = useState(false);
  const [view, setView] = useState("leads");
  const load = () => api.leads().then(setLeads).catch(() => setLeads([]));
  useEffect(() => {
    load();
  }, []);

  const count = (s) => leads.filter((l) => l.status === s).length;
  const conv = leads.length ? Math.round((count("attivato") / leads.length) * 100) : 0;
  const shown = useMemo(() => leads.filter((l) => (filter === "tutte" || l.status === filter) && (kind === "tutti" || l.kind === kind)
    && `${l.name} ${l.email} ${l.specialty} ${l.city}`.toLowerCase().includes(q.trim().toLowerCase())), [leads, filter, kind, q]);
  const update = (u) => setLeads((xs) => xs.map((x) => (x.id === u.id ? u : x)));

  return (
    <div className="min-h-screen bg-paper" data-testid="admin-page">
      <header className="sticky top-0 z-40 border-b border-[#C9CCD3]/15 bg-[#0A192F]/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-3 px-5 py-3 lg:px-8">
          <div className="flex items-center gap-3"><LogoMark size={36} light /><div className="leading-none"><div className="font-display text-2xl text-white">MantMed</div><div className="mt-1 text-[10px] uppercase tracking-[0.22em] text-[#C9CCD3]">Pannello Founder</div></div></div>
          <div className="flex items-center gap-2">
            <span className="hidden text-sm text-[#C9CCD3] sm:inline" data-testid="admin-user-email">{user?.email}</span>
            <button onClick={() => setSec(true)} className="grid h-10 w-10 place-items-center rounded-full border border-[#C9CCD3]/30 text-white hover:border-white" aria-label="Sicurezza account" data-testid="admin-security-btn"><ShieldCheck size={16} /></button>
            <button onClick={() => logout()} className="grid h-10 w-10 place-items-center rounded-full border border-[#C9CCD3]/30 text-white hover:border-white" aria-label="Esci" data-testid="admin-logout-btn"><LogOut size={16} /></button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1280px] px-5 py-10 lg:px-8">
        <div className="mb-8 inline-flex rounded-full bg-white p-1 ring-1 ring-slate-200" role="tablist">
          {[["leads", "Richieste dalla landing"], ["doctors", "Medici e licenze"]].map(([id, label]) => (
            <button key={id} role="tab" aria-selected={view === id} onClick={() => setView(id)} className={`h-10 rounded-full px-5 text-sm font-medium transition-colors ${view === id ? "bg-night text-white" : "text-slate-600 hover:text-night"}`} data-testid={`admin-view-${id}`}>{label}</button>
          ))}
        </div>
        {view === "doctors" ? <DoctorsPanel /> : <>
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-slate-500"><Inbox size={13} /> Lead box · landing page pubblica</div>
        <h1 className="mt-1 font-display text-4xl text-night sm:text-5xl">Medici <span className="italic text-slate-500">interessati a MantMed</span></h1>
        <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Kpi dark label="Richieste totali" value={leads.length} testid="admin-kpi-total" />
          <Kpi label="Nuove" value={count("nuova")} testid="admin-kpi-nuova" />
          <Kpi label="Contattati" value={count("contattato")} testid="admin-kpi-contattato" />
          <Kpi label="Attivati" value={count("attivato")} testid="admin-kpi-attivato" />
          <Kpi wide label="Conversione" value={`${conv}%`} testid="admin-kpi-conversion" />
        </div>
        <div className="mt-8 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-1.5">
            {[{ id: "tutte", label: "Tutte" }, ...STATUSES].map((s) => (
              <button key={s.id} onClick={() => setFilter(s.id)} className={`rounded-full px-4 py-2 text-sm transition-colors ${filter === s.id ? "bg-night text-white" : "border border-slate-200 bg-white text-night hover:border-night"}`} data-testid={`admin-filter-${s.id}`}>{s.label}</button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <select value={kind} onChange={(e) => setKind(e.target.value)} className="h-10 rounded-full border border-slate-200 bg-white px-4 text-sm text-night" data-testid="admin-kind-filter">
              <option value="tutti">Tutti i tipi</option><option value="beta">Accesso beta</option><option value="commerciale">Info commerciali</option>
            </select>
            <label className="flex h-10 items-center gap-2 rounded-full border border-slate-200 bg-white px-4"><Search size={14} className="text-slate-500" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca nome, città…" className="w-40 bg-transparent text-sm text-night outline-none" data-testid="admin-search-input" /></label>
            <button onClick={load} className="grid h-10 w-10 place-items-center rounded-full border border-slate-200 bg-white text-night hover:border-night" aria-label="Aggiorna" data-testid="admin-refresh-btn"><RefreshCw size={14} /></button>
            <button onClick={() => csv(shown)} className="flex h-10 items-center gap-2 rounded-full bg-night px-4 text-sm font-medium text-white" data-testid="admin-export-btn"><Download size={14} /> CSV</button>
          </div>
        </div>
        <div className="mt-5 space-y-2" data-testid="admin-leads-list">
          {shown.length === 0 && <p className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-600" data-testid="admin-leads-empty">Nessuna richiesta per questo filtro.</p>}
          {shown.map((l) => <LeadRow key={l.id} lead={l} onChange={update} />)}
        </div>
        </>}
      </main>
      <Dialog open={sec} onOpenChange={setSec}>
        <DialogContent className="max-h-[90vh] overflow-y-auto rounded-3xl bg-white sm:max-w-lg" data-testid="admin-security-dialog">
          <DialogHeader><DialogTitle className="font-display text-3xl font-normal text-night">Sicurezza account</DialogTitle></DialogHeader>
          <TwoFactorCard />
        </DialogContent>
      </Dialog>
    </div>
  );
}
