import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Inbox, Mail, CalendarDays } from "lucide-react";
import { api, errMsg } from "@/lib/api";

const STATUS = [{ id: "nuova", label: "Nuova" }, { id: "contattato", label: "Contattato" }, { id: "archiviata", label: "Archiviata" }];

const LeadCard = ({ l, onStatus }) => (
  <div className="rounded-3xl border border-slate-200 bg-white p-5" data-testid={`lead-${l.id}`}>
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <div className="font-medium text-night">{l.name}</div>
        <div className="text-xs text-slate-600">{l.specialty}{l.city ? ` · ${l.city}` : ""}</div>
      </div>
      <span className={`rounded-full px-3 py-1 text-[11px] font-semibold ${l.kind === "beta" ? "bg-night text-white" : "bg-[#ECEDEF] text-night"}`}>{l.kind_label}</span>
    </div>
    {l.message && <p className="mt-3 line-clamp-4 text-sm text-night">{l.message}</p>}
    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
      <span className="flex items-center gap-3">
        <a href={`mailto:${l.email}`} className="flex items-center gap-1 text-night hover:underline" data-testid={`lead-email-${l.id}`}><Mail size={13} /> {l.email}</a>
        <span className="hidden items-center gap-1 sm:flex"><CalendarDays size={13} /> {new Date(l.created_at).toLocaleDateString("it-IT", { day: "numeric", month: "short" })}</span>
      </span>
      <div className="flex gap-1">
        {STATUS.map((s) => (
          <button key={s.id} onClick={() => onStatus(l, s.id)} className={`rounded-full px-3 py-1 transition-colors ${l.status === s.id ? "bg-night text-white" : "border border-slate-200 text-slate-600 hover:border-night"}`} data-testid={`lead-status-${l.id}-${s.id}`}>{s.label}</button>
        ))}
      </div>
    </div>
  </div>
);

export const LeadsPanel = () => {
  const [items, setItems] = useState([]);
  useEffect(() => {
    api.leads().then(setItems).catch(() => setItems([]));
  }, []);
  const onStatus = async (l, status) => {
    try { const u = await api.updateLead(l.id, status); setItems((xs) => xs.map((x) => (x.id === u.id ? u : x))); }
    catch (e) { toast.error(errMsg(e)); }
  };
  const fresh = items.filter((l) => l.status === "nuova").length;
  return (
    <section className="mx-auto max-w-[1440px] px-5 pb-10 lg:px-8" data-testid="leads-panel">
      <div className="border-t border-slate-200 pt-8">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-slate-500"><Inbox size={13} /> Landing page pubblica</div>
        <h2 className="mt-1 font-display text-4xl text-night">Richieste <span className="italic text-slate-500">dai medici</span> <span className="ml-2 align-middle font-mono text-sm text-slate-600" data-testid="leads-new-count">{fresh} nuove</span></h2>
      </div>
      {items.length === 0
        ? <p className="mt-4 text-sm text-slate-600" data-testid="leads-empty">Nessuna richiesta ricevuta dalla landing page.</p>
        : <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">{items.map((l) => <LeadCard key={l.id} l={l} onStatus={onStatus} />)}</div>}
    </section>
  );
};
