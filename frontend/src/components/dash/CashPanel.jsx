import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { Banknote, CreditCard, Landmark, Loader2, Undo2, Euro, Globe } from "lucide-react";
import { api, errMsg, eur } from "@/lib/api";

export const METHODS = [
  { id: "contanti", label: "Contanti", icon: Banknote },
  { id: "pos", label: "POS", icon: CreditCard },
  { id: "bonifico", label: "Bonifico", icon: Landmark },
  { id: "online", label: "Pagamento Digitale / Online", icon: Globe },
];
const MANUAL = METHODS.filter((m) => m.id !== "online");
export const methodLabel = (m) => METHODS.find((x) => x.id === m)?.label ?? m;

export const CashPanel = ({ consultation, service, onChange }) => {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("pos");
  const [desc, setDesc] = useState(service || "Visita pediatrica specialistica");
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.payments({ consultation_id: consultation.id }).then((r) => setItems(r.items)).catch(() => setItems([]));
  }, [consultation.id]);
  useEffect(() => {
    load();
  }, [load]);

  const register = async () => {
    const value = Number(String(amount).replace(",", "."));
    if (!value || value <= 0) return toast.error("Inserisci un importo valido");
    setBusy(true);
    try {
      await api.addPayment({ consultation_id: consultation.id, patient_id: consultation.patient_id ?? null, patient_name: consultation.patient_name, clinic: consultation.clinic ?? "", service: desc.trim() || "Visita pediatrica specialistica", amount: value, method });
      toast.success(`Incasso di ${eur(value)} registrato · ${methodLabel(method)}`);
      setAmount("");
      load();
      onChange?.();
    } catch (e) { toast.error(errMsg(e)); }
    setBusy(false);
  };
  const undo = async (p) => {
    try { await api.deletePayment(p.id); toast.success("Incasso annullato"); load(); onChange?.(); }
    catch (e) { toast.error(errMsg(e)); }
  };

  return (
    <div className="mt-3 rounded-2xl border border-slate-200 bg-[#F4F5F7] p-4" data-testid="cash-panel">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Registro cassa · incasso visita</div>
        {items.length > 0 && <div className="font-mono text-xs text-night" data-testid="cash-visit-total">Totale visita {eur(items.reduce((s, p) => s + p.amount, 0))}</div>}
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto]">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[150px_1fr]">
          <label className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 focus-within:border-night">
            <Euro size={16} className="text-slate-500" />
            <input type="text" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.,]/g, ""))} placeholder="0,00" className="h-12 w-full bg-transparent font-display text-3xl text-night outline-none" data-testid="cash-amount-input" />
          </label>
          <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Prestazione" className="h-12 rounded-xl border border-slate-200 bg-white px-3 text-sm text-night outline-none focus:border-night" data-testid="cash-service-input" />
        </div>
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-white p-1 ring-1 ring-slate-200" role="radiogroup">
          {MANUAL.map(({ id, label, icon: Icon }) => (
            <button key={id} role="radio" aria-checked={method === id} onClick={() => setMethod(id)} className={`relative flex h-10 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors ${method === id ? "text-white" : "text-slate-600 hover:text-night"}`} data-testid={`cash-method-${id}`}>
              {method === id && <motion.span layoutId={`cash-method-pill-${consultation.id}`} className="absolute inset-0 rounded-lg bg-night" transition={{ type: "spring", stiffness: 400, damping: 32 }} />}
              <Icon size={15} className="relative" /><span className="relative">{label}</span>
            </button>
          ))}
        </div>
      </div>
      <button onClick={register} disabled={busy} className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-night text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 active:scale-[0.99] disabled:opacity-60" data-testid="cash-register-btn">
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Euro size={16} />} Registra incasso
      </button>
      <AnimatePresence initial={false}>
        {items.map((p) => (
          <motion.div key={p.id} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="mt-2 flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2 text-sm" data-testid={`cash-item-${p.id}`}>
              <span className="min-w-0 truncate text-night"><span className="font-semibold">{eur(p.amount)}</span> · {methodLabel(p.method)} · <span className="text-slate-500">{p.service}</span></span>
              {p.method !== "online" && <button onClick={() => undo(p)} className="flex shrink-0 items-center gap-1 text-xs text-slate-500 hover:text-red-600" data-testid={`cash-undo-${p.id}`}><Undo2 size={13} /> Annulla</button>}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};
