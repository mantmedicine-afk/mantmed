import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Baby, Check, Loader2, ChevronDown } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { api, errMsg } from "@/lib/api";

/** Libreria dei Bilanci di salute pediatrici: anteprima dei campi e importazione nei Modelli Visita. */
export const BilanciDialog = ({ open, onClose, onImported }) => {
  const [lib, setLib] = useState(null);
  const [sel, setSel] = useState([]);
  const [openKey, setOpenKey] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setSel([]); api.visitBilanci().then(setLib).catch((e) => toast.error(errMsg(e))); } }, [open]);
  const toggle = (k) => setSel((xs) => (xs.includes(k) ? xs.filter((x) => x !== k) : [...xs, k]));
  const missing = (lib ?? []).filter((b) => !b.imported).map((b) => b.key);
  const submit = async () => {
    setBusy(true);
    try { const r = await api.addBilanci(sel); onImported(r.templates); toast.success(`${r.imported} bilanci aggiunti ai Modelli Visita`); onClose(); } catch (e) { toast.error(errMsg(e)); }
    setBusy(false);
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] w-[calc(100%-1.5rem)] overflow-y-auto rounded-3xl bg-white sm:max-w-2xl" data-testid="bilanci-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display text-3xl font-normal text-night"><Baby size={22} /> Bilanci di salute</DialogTitle>
          <DialogDescription>Modelli pronti secondo il calendario pediatrico: selezioni quelli da aggiungere, poi potrà modificarli come gli altri modelli.</DialogDescription>
        </DialogHeader>
        {!lib ? <Loader2 className="animate-spin text-night" /> : (
          <div className="space-y-2">
            {missing.length > 1 && <button onClick={() => setSel(sel.length === missing.length ? [] : missing)} className="text-sm font-medium text-[#3B6CF6] hover:underline" data-testid="bilanci-select-all">{sel.length === missing.length ? "Deseleziona tutti" : "Seleziona tutti i mancanti"}</button>}
            {lib.map((b) => (
              <div key={b.key} className="rounded-2xl border border-slate-200" data-testid={`bilancio-${b.key}`}>
                <div className="flex items-center gap-3 px-4 py-3">
                  {b.imported ? <span className="grid h-5 w-5 place-items-center rounded-full bg-emerald-600 text-white"><Check size={12} /></span>
                    : <input type="checkbox" checked={sel.includes(b.key)} onChange={() => toggle(b.key)} className="h-5 w-5 accent-[#0A192F]" data-testid={`bilancio-check-${b.key}`} />}
                  <button onClick={() => setOpenKey(openKey === b.key ? "" : b.key)} className="flex flex-1 items-center justify-between gap-2 text-left" data-testid={`bilancio-preview-${b.key}`}>
                    <span><span className="block text-sm font-medium text-night">{b.name}</span><span className="text-xs text-slate-500">{b.fields.length} campi{b.imported ? " · già presente" : ""}</span></span>
                    <ChevronDown size={16} className={`text-slate-400 transition-transform ${openKey === b.key ? "rotate-180" : ""}`} />
                  </button>
                </div>
                {openKey === b.key && <ol className="list-decimal space-y-1 border-t border-slate-100 px-10 py-3 text-sm text-slate-600">{b.fields.map((f) => <li key={f.id}>{f.titolo}{f.hint && <span className="text-slate-400"> · {f.hint}</span>}</li>)}</ol>}
              </div>
            ))}
            <button onClick={submit} disabled={busy || !sel.length} className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-full bg-night text-sm font-semibold text-white disabled:opacity-40" data-testid="bilanci-import-btn">{busy && <Loader2 size={15} className="animate-spin" />} Aggiungi {sel.length || ""} bilanci</button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
