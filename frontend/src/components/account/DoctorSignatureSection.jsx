import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PenLine, Trash2, Loader2, RotateCcw } from "lucide-react";
import { api, errMsg } from "@/lib/api";
import { SignaturePadModal, fmtSignedAt } from "@/components/signature/SignaturePadModal";
import { Card } from "./ui";

/** Firma del medico: disegnata una volta, salvata cifrata, apposta automaticamente su ogni referto PDF. */
export const DoctorSignatureSection = ({ data }) => {
  const [sig, setSig] = useState(undefined);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.doctorSignature().then(setSig).catch(() => setSig({ image: null })); }, []);

  const save = async ({ image }) => {
    setBusy(true);
    try { setSig(await api.saveDoctorSignature(image)); toast.success("Firma salvata: comparirà su ogni nuovo referto PDF"); } catch (e) { toast.error(errMsg(e)); }
    setBusy(false);
  };
  const remove = async () => {
    setBusy(true);
    try { setSig(await api.deleteDoctorSignature()); toast.success("Firma rimossa dai referti"); } catch (e) { toast.error(errMsg(e)); }
    setBusy(false);
  };

  return (
    <Card id="account-doctor-signature" icon={PenLine} title="Firma per i referti"
      text="Disegni la sua firma una volta: viene salvata cifrata (AES-256) e apposta in automatico nel riquadro “Firma digitale / autografa” di ogni referto PDF, con data e ora di generazione.">
      {sig === undefined ? <Loader2 className="animate-spin text-night" /> : sig?.image ? (
        <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <div className="rounded-2xl border border-slate-200 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Anteprima nel referto</div>
            <div className="mt-3 flex h-24 items-center rounded-xl bg-[#F6F8FC] px-4">
              <img src={sig.image} alt="Firma del medico" className="max-h-20 max-w-full object-contain" data-testid="doctor-signature-image" />
            </div>
            <div className="mt-2 text-sm font-medium text-night">{data?.name}</div>
            <div className="text-xs text-slate-500" data-testid="doctor-signature-date">Firma impostata il {fmtSignedAt(sig.set_at)}</div>
          </div>
          <div className="flex flex-wrap gap-2 sm:flex-col">
            <button onClick={() => setOpen(true)} disabled={busy} className="flex h-11 items-center justify-center gap-2 rounded-full border border-slate-200 px-5 text-sm font-medium text-night hover:border-night" data-testid="doctor-signature-redo"><RotateCcw size={15} /> Rifirma</button>
            <button onClick={remove} disabled={busy} className="flex h-11 items-center justify-center gap-2 rounded-full border border-slate-200 px-5 text-sm font-medium text-rose-700 hover:border-rose-700" data-testid="doctor-signature-delete"><Trash2 size={15} /> Rimuovi</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setOpen(true)} disabled={busy} className="flex h-28 w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-[#F6F8FC] text-slate-600 transition-colors hover:border-night hover:text-night" data-testid="doctor-signature-open">
          {busy ? <Loader2 className="animate-spin" /> : <PenLine size={22} strokeWidth={1.6} />}
          <span className="text-sm font-medium">Disegna la firma per i referti</span>
        </button>
      )}
      <SignaturePadModal open={open} onClose={() => setOpen(false)} onConfirm={save} title="Firma del Medico"
        description="Questa firma verrà apposta automaticamente sui referti PDF." defaultName={data?.name || ""} />
    </Card>
  );
};
