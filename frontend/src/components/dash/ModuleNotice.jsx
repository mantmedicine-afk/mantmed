import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Layers, X } from "lucide-react";
import { api } from "@/lib/api";
import { loadModules } from "@/lib/modules";

// Avviso una tantum ai medici già registrati: la cartella della loro specialità è disponibile
export const ModuleNotice = () => {
  const [s, setS] = useState(null);
  useEffect(() => { loadModules().catch(() => {}); api.moduleSettings().then((r) => r.notice && setS(r)).catch(() => {}); }, []);
  if (!s) return null;
  const close = () => { setS(null); api.moduleNoticeSeen().catch(() => {}); };
  return (
    <div className="mx-auto max-w-[1440px] px-5 pb-4 lg:px-8" data-testid="module-notice">
      <div className="flex items-start gap-3 rounded-2xl bg-[var(--sel)] p-4 text-sm text-[var(--fg)]">
        <Layers size={18} className="mt-0.5 shrink-0" />
        <p className="flex-1">È disponibile la cartella di <strong>{s.nome}</strong>: le nuove visite useranno i campi della sua specialità. Può personalizzarla o tornare al modulo Generale dalle <Link to="/app/area-personale?sezione=modelli" onClick={close} className="font-semibold underline" data-testid="module-notice-settings">impostazioni</Link>.</p>
        <button onClick={close} className="grid h-8 w-8 shrink-0 place-items-center rounded-full hover:bg-[var(--surface)]" aria-label="Chiudi avviso" data-testid="module-notice-close"><X size={15} /></button>
      </div>
    </div>
  );
};
