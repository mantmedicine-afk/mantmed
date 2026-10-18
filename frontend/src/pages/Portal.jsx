import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { LogOut, CalendarClock, FileSignature, FileDown, Plus, Loader2, Baby, Info } from "lucide-react";
import { LogoMark } from "@/components/dash/Logo";
import { api, errMsg } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const day = (iso) => new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
const TABS = [{ id: "reports", label: "Referti", icon: FileDown }, { id: "appointments", label: "Appuntamenti", icon: CalendarClock }, { id: "consents", label: "Consensi", icon: FileSignature }];

const Empty = ({ text }) => <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-600">{text}</p>;

const Reports = ({ items }) => {
  const [busy, setBusy] = useState("");
  const dl = async (id) => { setBusy(id); try { await api.portalReport(id); toast.success("Referto scaricato"); } catch (e) { toast.error(errMsg(e)); } setBusy(""); };
  if (!items.length) return <Empty text="Nessun referto disponibile. I referti compaiono qui quando il medico li invia o li pubblica nel portale." />;
  return items.map((r) => (
    <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4" data-testid={`portal-report-${r.id}`}>
      <div className="min-w-0"><div className="text-xs text-slate-600">{day(r.created_at)} · {r.clinic || "Studio"}</div><div className="font-medium text-night">{r.motivo || "Visita"}</div>{r.diagnosi && <div className="text-sm text-slate-600">{r.diagnosi}</div>}</div>
      <button onClick={() => dl(r.id)} disabled={busy === r.id} className="flex h-10 items-center gap-2 rounded-full bg-night px-4 text-sm font-medium text-white disabled:opacity-60" data-testid={`portal-report-pdf-${r.id}`}>{busy === r.id ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />} PDF</button>
    </div>
  ));
};

const Appointments = ({ items }) => (items.length ? items.map((a) => (
  <div key={a.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4" data-testid={`portal-appt-${a.id}`}>
    <div><div className="font-medium text-night">{a.visit_type}</div><div className="text-sm text-slate-600">{a.clinic}</div></div>
    <div className="text-right"><div className="font-display text-2xl text-night">{a.time}</div><div className="text-xs text-slate-600">{a.status === "in_attesa" ? "In sala d'attesa" : "Oggi"}</div></div>
  </div>
)) : <Empty text="Nessun appuntamento in programma." />);

const Consents = ({ items }) => (items.length ? items.map((c) => (
  <div key={c.id} className="rounded-2xl border border-slate-200 bg-white p-4" data-testid={`portal-consent-${c.id}`}>
    <div className="flex flex-wrap items-center justify-between gap-2"><div className="font-medium text-night">{c.version}</div>
      <span className={`rounded-full px-3 py-1 text-[11px] font-semibold ${c.revoked_at ? "bg-slate-200 text-slate-700" : "bg-emerald-100 text-emerald-900"}`}>{c.revoked_at ? `Revocato il ${day(c.revoked_at)}` : "Attivo"}</span></div>
    <div className="mt-1 text-sm text-slate-600">Firmato il {day(c.signed_at)} da {c.signer_name} ({c.signer_relation}) · {c.method === "firma_tablet" ? "firma su tablet" : "modulo cartaceo"}{c.email_reports ? " · referti via email" : ""}</div>
  </div>
)) : <Empty text="Nessun consenso registrato dallo studio." />);

const Child = ({ c }) => {
  const [tab, setTab] = useState("reports");
  const p = c.patient;
  return (
    <section className="rounded-[28px] border border-slate-200 bg-[#F4F5F7] p-5 sm:p-7" data-testid={`portal-child-${p.id}`}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><div className="text-[11px] uppercase tracking-[0.2em] text-slate-600">Nato/a il {day(p.birth_date)}</div><h2 className="font-display text-4xl text-night">{p.name}</h2><div className="text-sm text-slate-600">Medico: {c.doctor.name}</div></div>
        <div className="flex flex-wrap gap-1 rounded-full bg-white p-1 ring-1 ring-slate-200" role="tablist">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={`flex h-9 items-center gap-1.5 rounded-full px-3 text-sm transition-colors ${tab === t.id ? "bg-night text-white" : "text-slate-600 hover:text-night"}`} data-testid={`portal-tab-${t.id}-${p.id}`}>
              <t.icon size={14} /> {t.label} <span className="font-mono text-xs opacity-70">{c[t.id].length}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="mt-5 space-y-2">
        {tab === "reports" && <Reports items={c.reports} />}
        {tab === "appointments" && <Appointments items={c.appointments} />}
        {tab === "consents" && <Consents items={c.consents} />}
      </div>
    </section>
  );
};

const AddChild = ({ onLinked }) => {
  const [cf, setCf] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api.portalAddChild(cf);
      if (r.linked) { toast.success("Cartella collegata"); setCf(""); onLinked(); }
      else toast.message("Nessuna cartella corrisponde a codice fiscale ed email. Verifichi i dati con lo studio: la colleghiamo appena coincidono.");
    } catch (err) { toast.error(errMsg(err)); }
    setBusy(false);
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-2 rounded-[28px] border border-slate-200 bg-white p-5 sm:flex-row sm:items-center" data-testid="portal-add-child-form">
      <div className="flex-1"><div className="text-sm font-medium text-night">Collega un altro figlio</div><div className="text-xs text-slate-600">Inserisca il codice fiscale del bambino: deve coincidere con quello registrato dallo studio, insieme alla sua email.</div></div>
      <input value={cf} onChange={(e) => setCf(e.target.value.toUpperCase().slice(0, 16))} placeholder="Codice fiscale" className="h-11 rounded-full border border-slate-200 px-4 font-mono text-sm uppercase text-night outline-none focus:border-night" data-testid="portal-add-child-input" />
      <button disabled={busy || cf.length !== 16} className="flex h-11 items-center justify-center gap-2 rounded-full bg-night px-5 text-sm font-medium text-white disabled:opacity-50" data-testid="portal-add-child-btn">{busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Collega</button>
    </form>
  );
};

export default function Portal() {
  const { user, logout } = useAuth();
  const [data, setData] = useState(null);
  const load = useCallback(() => api.portalMe().then(setData).catch((e) => toast.error(errMsg(e))), []);
  useEffect(() => {
    load();
  }, [load]);
  const children = Array.isArray(data?.children) ? data.children : [];
  return (
    <div className="min-h-screen bg-white" data-testid="portal-page">
      <header className="sticky top-0 z-40 border-b border-[#C9CCD3]/15 bg-[#0A192F]">
        <div className="mx-auto flex max-w-[1100px] items-center justify-between gap-3 px-5 py-3">
          <div className="flex items-center gap-3"><LogoMark size={34} light /><div className="leading-none"><div className="font-display text-2xl text-white">MantMed</div><div className="mt-1 text-[10px] uppercase tracking-[0.22em] text-[#C9CCD3]">Portale Paziente</div></div></div>
          <div className="flex items-center gap-3"><span className="hidden text-sm text-[#C9CCD3] sm:inline" data-testid="portal-user-name">{user?.name}</span>
            <button onClick={() => logout()} className="grid h-10 w-10 place-items-center rounded-full border border-[#C9CCD3]/30 text-white hover:border-white" aria-label="Esci" data-testid="portal-logout-btn"><LogOut size={16} /></button></div>
        </div>
      </header>
      <main className="mx-auto max-w-[1100px] space-y-5 px-5 py-10">
        <div><div className="text-[11px] uppercase tracking-[0.22em] text-slate-600">Area personale protetta</div><h1 className="mt-1 font-display text-4xl text-night sm:text-5xl">Buongiorno, <span className="italic text-slate-500">{user?.name?.split(" ")[0]}</span></h1></div>
        {!data && <Loader2 className="animate-spin text-night" />}
        {data && children.length === 0 && (
          <div className="flex gap-3 rounded-[28px] bg-[#0A192F] p-6 text-white" data-testid="portal-no-children"><Baby className="shrink-0 text-[#C9CCD3]" />
            <p className="text-sm leading-relaxed text-slate-200">Non abbiamo ancora trovato una cartella collegata. Il collegamento avviene in automatico quando lo studio registra il codice fiscale del bambino e la sua email ({user?.email}). Se ha già fatto una visita, chieda allo studio di verificare questi due dati.</p></div>
        )}
        {children.map((c) => <Child key={c.patient.id} c={c} />)}
        {data && <AddChild onLinked={load} />}
        {data?.consent && <p className="flex items-center gap-2 text-xs text-slate-600" data-testid="portal-consent-note"><Info size={13} /> Consenso accettato il {day(data.consent.at)} · {data.consent.version}</p>}
      </main>
    </div>
  );
}
