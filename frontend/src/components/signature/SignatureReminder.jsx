import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PenLine, X } from "lucide-react";
import { api } from "@/lib/api";

const KEY = "mm_sig_reminder_dismissed";
const SIG_URL = "/app/impostazioni?sezione=firma";

/** Promemoria finché la/il medico non ha disegnato la firma da apporre sui referti PDF. */
export const useDoctorSignature = () => {
  const [has, setHas] = useState(null);
  useEffect(() => { api.doctorSignature().then((s) => setHas(Boolean(s?.image))).catch(() => setHas(null)); }, []);
  return has;
};

export const SignatureReminder = () => {
  const has = useDoctorSignature();
  const [hidden, setHidden] = useState(() => sessionStorage.getItem(KEY) === "1");
  if (has !== false || hidden) return null;
  return (
    <div className="mx-auto max-w-[1440px] px-5 pb-5 lg:px-8" data-testid="signature-reminder">
      <div className="flex flex-wrap items-center gap-4 rounded-[28px] border border-[var(--hair)] bg-[var(--raised)] p-4 sm:p-5">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[var(--accent)] text-[var(--ink)]"><PenLine size={18} /></span>
        <div className="min-w-0 flex-1">
          <div className="font-medium text-[var(--fg)]">Aggiunga la sua firma ai referti</div>
          <div className="text-sm text-[var(--fg2)]">La disegna una volta con dito, pennino o mouse: verrà apposta in automatico su ogni referto PDF, con data e ora.</div>
        </div>
        <Link to={SIG_URL} className="flex h-11 items-center gap-2 rounded-full bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--ink)] transition-transform hover:-translate-y-0.5" data-testid="signature-reminder-cta"><PenLine size={15} /> Disegna la firma</Link>
        <button onClick={() => { sessionStorage.setItem(KEY, "1"); setHidden(true); }} className="grid h-9 w-9 place-items-center rounded-full text-[var(--fg2)] hover:bg-[var(--surface)] hover:text-[var(--fg)]" aria-label="Nascondi promemoria" data-testid="signature-reminder-dismiss"><X size={16} /></button>
      </div>
    </div>
  );
};

/** Riga compatta sotto il pulsante del referto PDF. */
export const SignatureHint = ({ onNavigate }) => {
  const has = useDoctorSignature();
  if (has !== false) return null;
  return (
    <Link to={SIG_URL} onClick={onNavigate} className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-[var(--accent)] hover:underline" data-testid="note-signature-hint">
      <PenLine size={12} /> Il referto non ha ancora la sua firma: la disegni ora
    </Link>
  );
};
