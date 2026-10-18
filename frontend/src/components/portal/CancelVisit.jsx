import { useState } from "react";
import { toast } from "sonner";
import { Loader2, XCircle, Phone } from "lucide-react";
import { api, errMsg } from "@/lib/api";

const CUTOFF_H = 12;

export const canCancel = (a) => {
  const day = a.date || new Date().toISOString().slice(0, 10);
  return new Date(`${day}T${a.time}:00`).getTime() - Date.now() >= CUTOFF_H * 3600 * 1000;
};

export const CancelVisit = ({ a, onDone, autoOpen = false }) => {
  const [open, setOpen] = useState(autoOpen);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  if (!canCancel(a)) {
    return <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-600" data-testid={`portal-cancel-closed-${a.id}`}><Phone size={12} /> Mancano meno di {CUTOFF_H} ore: per annullare telefoni allo studio.</p>;
  }
  const go = async () => {
    setBusy(true);
    try { await api.cancelAppointment(a.id, reason); toast.success("Visita annullata: lo studio è stato avvisato"); onDone(); }
    catch (e) { toast.error(errMsg(e)); }
    setBusy(false);
  };
  if (!open) {
    return <button onClick={() => setOpen(true)} className="mt-2 flex items-center gap-1.5 text-xs font-medium text-rose-700 underline-offset-4 hover:underline" data-testid={`portal-cancel-btn-${a.id}`}><XCircle size={13} /> Annulla visita</button>;
  }
  return (
    <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50/60 p-3" data-testid={`portal-cancel-box-${a.id}`}>
      <p className="text-sm text-night">Vuole annullare questa visita? L'orario tornerà disponibile per altri pazienti.</p>
      <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="Motivo (facoltativo)" className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-night outline-none focus:border-night" data-testid={`portal-cancel-reason-${a.id}`} />
      <div className="mt-2 flex flex-wrap gap-2">
        <button onClick={go} disabled={busy} className="flex h-9 items-center gap-1.5 rounded-full bg-rose-700 px-4 text-xs font-semibold text-white disabled:opacity-60" data-testid={`portal-cancel-confirm-${a.id}`}>{busy ? <Loader2 size={13} className="animate-spin" /> : <XCircle size={13} />} Conferma annullamento</button>
        <button onClick={() => setOpen(false)} className="h-9 rounded-full border border-slate-200 bg-white px-4 text-xs text-night" data-testid={`portal-cancel-keep-${a.id}`}>Mantieni la visita</button>
      </div>
    </div>
  );
};
