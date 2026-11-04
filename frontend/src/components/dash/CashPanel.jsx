import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Banknote, CreditCard, Landmark, Globe, Smartphone, FileText, Plus } from "lucide-react";
import { api, errMsg, eur } from "@/lib/api";
import { InvoiceDialog } from "@/components/cash/InvoiceDialog";
import { Badge } from "@/components/cash/ui";

export const METHODS = [
  { id: "contanti", label: "Contanti", icon: Banknote },
  { id: "carta", label: "Carta / Bancomat", icon: CreditCard },
  { id: "pos", label: "POS", icon: Smartphone },
  { id: "bonifico", label: "Bonifico", icon: Landmark },
  { id: "online", label: "Pagamento Digitale / Online", icon: Globe },
];
export const methodLabel = (m) => METHODS.find((x) => x.id === m)?.label ?? m;

/** Fatture della visita: nuova fattura precompilata con paziente, data, studio e prestazione. */
export const CashPanel = ({ consultation, service, onChange }) => {
  const [items, setItems] = useState([]);
  const [settings, setSettings] = useState(null);
  const [open, setOpen] = useState(false);
  const load = useCallback(() => api.invoices({ consultation_id: consultation.id }).then((r) => setItems(r.items)).catch(() => setItems([])), [consultation.id]);
  useEffect(() => { load(); }, [load]);
  const start = () => api.cashSettings().then((s) => { setSettings(s); setOpen(true); }).catch((e) => toast.error(errMsg(e)));
  const live = items.filter((i) => i.status !== "annullata");

  return (
    <div className="mt-3 rounded-2xl border border-[var(--hair)] bg-[var(--raised)] p-4" data-testid="cash-panel">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--fg2)]">Cassa · fattura della visita</div>
        {live.length > 0 && <div className="font-mono text-xs text-[var(--fg)]" data-testid="cash-visit-total">Totale visita {eur(live.reduce((s, i) => s + i.totals.due, 0))}</div>}
      </div>
      {items.map((i) => (
        <div key={i.id} className="mt-2 flex items-center justify-between gap-3 rounded-xl bg-[var(--surface)] px-3 py-2 text-sm" data-testid={`cash-item-${i.id}`}>
          <span className="min-w-0 truncate text-[var(--fg)]"><span className="font-mono text-xs">{i.number ?? "s.n."}</span> · <span className="font-semibold">{eur(i.totals.due)}</span> · {methodLabel(i.method)}</span>
          <span className="flex shrink-0 items-center gap-2"><Badge status={i.status} testid={`cash-item-status-${i.id}`} />
            <button onClick={() => api.invoicePdf(i.id).catch((e) => toast.error(errMsg(e)))} className="flex items-center gap-1 text-xs font-medium text-[var(--fg)] hover:underline" data-testid={`cash-item-pdf-${i.id}`}><FileText size={13} /> PDF</button></span>
        </div>
      ))}
      <button onClick={start} className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] text-sm font-semibold text-[var(--ink)] transition-transform hover:-translate-y-0.5 active:scale-[0.99]" data-testid="cash-register-btn"><Plus size={16} /> Crea fattura dalla visita</button>
      <InvoiceDialog open={open} source={{ consultation_id: consultation.id, service }} settings={settings} onClose={() => setOpen(false)} onSaved={() => { load(); onChange?.(); }} />
    </div>
  );
};
