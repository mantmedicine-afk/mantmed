import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { Mail, ChevronDown, Loader2, Save } from "lucide-react";
import { api, errMsg } from "@/lib/api";

export const STATUSES = [
  { id: "nuova", label: "Nuova", cls: "bg-amber-100 text-amber-900" },
  { id: "contattato", label: "Contattato", cls: "bg-sky-100 text-sky-900" },
  { id: "attivato", label: "Attivato", cls: "bg-emerald-100 text-emerald-900" },
  { id: "archiviata", label: "Archiviata", cls: "bg-slate-200 text-slate-700" },
];
const fmt = (iso) => (iso ? new Date(iso).toLocaleString("it-IT", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");

export const LeadRow = ({ lead, onChange }) => {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(lead.note ?? "");
  const [busy, setBusy] = useState(false);
  const st = STATUSES.find((s) => s.id === lead.status) ?? STATUSES[0];
  const patch = async (b, msg) => {
    setBusy(true);
    try { onChange(await api.updateLead(lead.id, b)); if (msg) toast.success(msg); } catch (e) { toast.error(errMsg(e)); }
    setBusy(false);
  };
  return (
    <div className="rounded-2xl border border-slate-200 bg-white" data-testid={`admin-lead-${lead.id}`}>
      <button onClick={() => setOpen((o) => !o)} className="grid w-full grid-cols-[1fr_auto] items-center gap-3 p-4 text-left md:grid-cols-[1.4fr_1fr_1fr_auto_auto]" data-testid={`admin-lead-toggle-${lead.id}`}>
        <div className="min-w-0"><div className="truncate font-medium text-night">{lead.name}</div><div className="truncate text-xs text-slate-600">{lead.email}</div></div>
        <div className="hidden min-w-0 text-sm text-night md:block"><div className="truncate">{lead.specialty}</div><div className="truncate text-xs text-slate-600">{lead.city || "—"}</div></div>
        <div className="hidden text-xs text-slate-600 md:block">{lead.kind_label}<div>{fmt(lead.created_at)}</div></div>
        <span className={`rounded-full px-3 py-1 text-[11px] font-semibold ${st.cls}`} data-testid={`admin-lead-status-${lead.id}`}>{st.label}</span>
        <ChevronDown size={16} className={`hidden text-slate-500 transition-transform md:block ${open ? "rotate-180" : ""}`} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
            <div className="grid grid-cols-1 gap-4 border-t border-slate-100 p-4 lg:grid-cols-2">
              <div className="space-y-2 text-sm text-night">
                <div className="md:hidden text-xs text-slate-600">{lead.specialty} · {lead.city || "—"} · {lead.kind_label} · {fmt(lead.created_at)}</div>
                <p className="whitespace-pre-wrap">{lead.message || <span className="text-slate-500">Nessun messaggio.</span>}</p>
                <a href={`mailto:${lead.email}?subject=${encodeURIComponent("MantMed · la sua richiesta")}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-night underline underline-offset-4" data-testid={`admin-lead-mail-${lead.id}`}><Mail size={14} /> Scrivi a {lead.email}</a>
                <div className="text-xs text-slate-600">Contattato: {fmt(lead.contacted_at)} · Attivato: {fmt(lead.activated_at)}</div>
              </div>
              <div>
                <div className="flex flex-wrap gap-1.5">
                  {STATUSES.map((s) => (
                    <button key={s.id} disabled={busy} onClick={() => patch({ status: s.id }, `Segnata come ${s.label.toLowerCase()}`)} className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${lead.status === s.id ? "bg-night text-white" : "border border-slate-200 text-slate-700 hover:border-night"}`} data-testid={`admin-lead-set-${lead.id}-${s.id}`}>{s.label}</button>
                  ))}
                </div>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={2000} placeholder="Nota interna (es. chiamata fissata, preventivo inviato…)" className="mt-3 w-full resize-none rounded-xl border border-slate-200 bg-[#F4F5F7] p-3 text-sm text-night outline-none focus:border-night" data-testid={`admin-lead-note-${lead.id}`} />
                <button disabled={busy || note === (lead.note ?? "")} onClick={() => patch({ note }, "Nota salvata")} className="mt-2 flex h-9 items-center gap-1.5 rounded-full bg-night px-4 text-xs font-semibold text-white disabled:opacity-40" data-testid={`admin-lead-save-note-${lead.id}`}>{busy ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Salva nota</button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
