import { useState } from "react";
import { ShieldCheck, ShieldAlert } from "lucide-react";
import { ConsentDialog } from "./ConsentDialog";

export const ConsentGate = ({ patient, free, paper, setPaper, onSaved }) => {
  const [open, setOpen] = useState(false);
  if (free) {
    return (
      <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-amber-300/40 bg-amber-400/10 px-4 py-3 text-sm text-amber-100" data-testid="consent-gate-free">
        <input type="checkbox" checked={paper} onChange={(e) => setPaper(e.target.checked)} className="mt-0.5 h-4 w-4 accent-white" data-testid="consent-paper-checkbox" />
        Visita libera: confermo di aver acquisito il consenso privacy firmato su modulo cartaceo
      </label>
    );
  }
  if (!patient) return null;
  if (patient.consent_at) {
    return (
      <div className="flex items-center gap-2 rounded-2xl bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200" data-testid="consent-gate-ok">
        <ShieldCheck size={16} /> Consenso privacy valido dal {new Date(patient.consent_at).toLocaleDateString("it-IT")}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-300/40 bg-red-500/10 px-4 py-3 text-sm text-red-100" data-testid="consent-gate-missing">
      <span className="flex items-center gap-2"><ShieldAlert size={16} /> Consenso privacy non registrato: la visita è bloccata</span>
      <button onClick={() => setOpen(true)} className="rounded-full bg-white px-4 py-2 text-xs font-semibold text-night" data-testid="consent-gate-register-btn">Registra consenso</button>
      <ConsentDialog patient={patient} open={open} onClose={() => setOpen(false)} onSaved={onSaved} />
    </div>
  );
};
