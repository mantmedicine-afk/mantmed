import { useState } from "react";
import { toast } from "sonner";
import { Lock, Users } from "lucide-react";
import { api, errMsg } from "@/lib/api";

// Visita riservata: mai visibile nel portale (tutori, delegati, paziente) né inviabile per email, finché il medico non la rende visibile
export const GuardianShare = ({ consultation, onChange }) => {
  const [busy, setBusy] = useState(false);
  if (!consultation.patient_id) return null;
  const hidden = consultation.guardian_hidden;
  const toggle = async () => {
    setBusy(true);
    try { onChange(await api.shareWithGuardians(consultation.id, hidden)); toast.success(hidden ? "Visita visibile nel portale" : "Visita riservata"); }
    catch (e) { toast.error(errMsg(e)); }
    setBusy(false);
  };
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--hair)] bg-[var(--raised)] px-4 py-3 text-sm" data-testid="guardian-share">
      <span className="flex items-center gap-2">{hidden ? <Lock size={16} /> : <Users size={16} />}
        <span><strong>{hidden ? "Visita riservata" : "Visibile nel portale"}</strong> <span className="text-[var(--fg2)]">{hidden ? "Non compare nel Portale (né a tutori o delegati) e non si può inviare per email." : "Compare nel Portale se il referto è pubblicato o inviato."}</span></span>
      </span>
      <button onClick={toggle} disabled={busy} className="rounded-full border border-[var(--hair)] px-4 py-2 text-sm font-semibold hover:border-[var(--accent)] disabled:opacity-60" data-testid="guardian-share-toggle">{hidden ? "Rendi visibile nel portale" : "Rendi riservata"}</button>
    </div>
  );
};
