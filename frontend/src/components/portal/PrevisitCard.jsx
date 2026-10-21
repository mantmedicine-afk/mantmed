import { useEffect, useState } from "react";
import { ClipboardList } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { CheckpointWizard } from "@/components/dash/CheckpointWizard";
import { api } from "@/lib/api";

/** Portale: il genitore compila il questionario per età prima del bilancio di salute. */
export const PrevisitCard = ({ child, onDone }) => {
  const [open, setOpen] = useState(false);
  const [last, setLast] = useState(undefined);
  const p = child.patient;
  const soon = child.appointments.length > 0;
  useEffect(() => { api.portalCheckpointTemplate(p.id).then((b) => setLast(b.last)).catch(() => setLast(null)); }, [p.id, open]);
  if (!/pediatr|neonatolog/i.test(child.doctor.specialty)) return null;
  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4 ${soon && !last ? "border-[#3B6CF6] bg-[#F3F6FF]" : "border-slate-200 bg-white"}`} data-testid={`portal-previsit-${p.id}`}>
      <div className="flex min-w-0 items-start gap-3">
        <ClipboardList size={18} className="mt-0.5 shrink-0 text-[#3B6CF6]" />
        <div><div className="font-medium text-night">Questionario pre-visita</div>
          <div className="text-sm text-slate-600" data-testid={`portal-previsit-status-${p.id}`}>{last ? `Compilato il ${new Date(last.created_at).toLocaleDateString("it-IT")}: la pediatra lo troverà nel prossimo bilancio.` : soon ? "Ha una visita in programma: bastano 2 minuti per aiutare la pediatra a prepararla." : "Poche domande su sviluppo, sonno e abitudini, utili per il prossimo bilancio di salute."}</div></div>
      </div>
      <button onClick={() => setOpen(true)} className="h-10 rounded-full bg-night px-4 text-sm font-medium text-white transition-transform hover:-translate-y-0.5" data-testid={`portal-previsit-btn-${p.id}`}>{last ? "Compila di nuovo" : "Compila il questionario"}</button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92vh] w-[calc(100%-1.5rem)] overflow-y-auto rounded-3xl border-0 bg-transparent p-0 shadow-none sm:max-w-2xl [&>button]:text-white" data-testid="portal-previsit-dialog">
          <DialogTitle className="sr-only">Questionario pre-visita</DialogTitle>
          {open && <CheckpointWizard patient={p} load={() => api.portalCheckpointTemplate(p.id)} send={(b) => api.submitPortalCheckpoint({ patient_id: p.id, answers: b.answers })} onCancel={() => setOpen(false)} onDone={() => { setOpen(false); onDone?.(); }} />}
        </DialogContent>
      </Dialog>
    </div>
  );
};
