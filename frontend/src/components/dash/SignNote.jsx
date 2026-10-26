import { useState } from "react";
import { toast } from "sonner";
import { Loader2, PenLine } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { api, errMsg } from "@/lib/api";
import { AILabel } from "@/components/mantai/AILabel";

const BR = { position: "bottom-right" };
const isDraft = (p) => p?.ai_generated === true && p.stato_revisione === "bozza_non_verificata";
export const needsSignature = (c) => isDraft(c?.ai_provenance) || isDraft(c?.ai_provenance?.parti?.riassunto_famiglia);

/** Testata della nota MantAI: etichetta "bozza" + firma con assunzione di responsabilità, poi etichetta "verificato". */
export const SignNote = ({ consultation, beforeSign, onSigned }) => {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const p = consultation.ai_provenance;
  if (consultation.status !== "ready" || p?.ai_generated !== true && !p?.parti?.riassunto_famiglia) return null;
  if (!needsSignature(consultation)) {
    const shown = p?.ai_generated === true ? p : p.parti.riassunto_famiglia;
    return <div className="mt-4" data-testid="note-ai-verified"><AILabel provenance={shown} view="doctor" testId="note-ai-label-verified" /></div>;
  }
  const sign = async () => {
    setBusy(true);
    try { await beforeSign(); const r = await api.signConsultation(consultation.id); onSigned(r); toast.success("Nota firmata: ora può inviarla o pubblicarla", BR); setOpen(false); }
    catch (e) { toast.error(errMsg(e), BR); }
    setBusy(false);
  };
  return (
    <div className="mt-4 flex flex-col gap-3 rounded-2xl border-2 border-[#E3A92B] bg-[#FFF8E6] p-4 sm:flex-row sm:items-center sm:justify-between" data-testid="note-ai-draft-banner">
      <div className="min-w-0 space-y-1.5">
        <AILabel variant="bozza" view="doctor" testId="note-ai-label-draft" />
        <p className="text-xs leading-relaxed text-[#5C3A00]">Rilegga e corregga i campi segnati: alla firma la nota diventa un referto sotto la sua responsabilità e potrà essere inviata o pubblicata.</p>
      </div>
      <button onClick={() => setOpen(true)} className="flex h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-night px-5 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5" data-testid="note-sign-btn">
        <PenLine size={15} /> Firma e conferma la nota
      </button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent className="rounded-[24px]" data-testid="note-sign-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-3xl font-normal text-night">Firma della nota</AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-relaxed text-slate-600">
              Firmando dichiara di aver verificato il contenuto proposto da MantAI e se ne assume la responsabilità professionale. Le etichette diventeranno "verificato" con il suo nome, e il cambio sarà annotato nel registro attività.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full" data-testid="note-sign-cancel">Rileggo ancora</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); sign(); }} disabled={busy} className="rounded-full bg-night" data-testid="note-sign-confirm">
              {busy ? <Loader2 size={15} className="mr-2 animate-spin" /> : <PenLine size={15} className="mr-2" />} Ho verificato, firmo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
