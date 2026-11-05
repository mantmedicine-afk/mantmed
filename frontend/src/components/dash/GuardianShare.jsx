import { useState } from "react";
import { toast } from "sonner";
import { Lock, Users } from "lucide-react";
import { api, errMsg } from "@/lib/api";

// Visita riservata ai tutori (es. Ginecologia di paziente minorenne): visibile solo per scelta esplicita del medico
export const GuardianShare = ({ consultation, onChange }) => {
  const [busy, setBusy] = useState(false);
  if (!consultation.guardian_hidden && !consultation.guardian_shared_at) return null;
  const hidden = consultation.guardian_hidden;
  const toggle = async () => {
    setBusy(true);
    try { onChange(await api.shareWithGuardians(consultation.id, hidden)); toast.success(hidden ? "Visita condivisa con i tutori" : "Visita di nuovo riservata"); }
    catch (e) { toast.error(errMsg(e)); }
    setBusy(false);
  };
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--hair)] bg-[var(--raised)] px-4 py-3 text-sm" data-testid="guardian-share">
      <span className="flex items-center gap-2">{hidden ? <Lock size={16} /> : <Users size={16} />}
        <span><strong>{hidden ? "Visita riservata" : "Visita condivisa con i tutori"}</strong> <span className="text-[var(--fg2)]">{hidden ? "Paziente minorenne: non è visibile ai tutori nel portale né inviabile per email." : "I tutori possono vederla se il referto è pubblicato o inviato."}</span></span>
      </span>
      <button onClick={toggle} disabled={busy} className="rounded-full border border-[var(--hair)] px-4 py-2 text-sm font-semibold hover:border-[var(--accent)] disabled:opacity-60" data-testid="guardian-share-toggle">{hidden ? "Condividi con i tutori" : "Rendi di nuovo riservata"}</button>
    </div>
  );
};
