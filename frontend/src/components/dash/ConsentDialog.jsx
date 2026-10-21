import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ShieldCheck, FileSignature, PenLine } from "lucide-react";
import { SignatureField } from "@/components/signature/SignaturePadModal";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { http, errMsg } from "@/lib/api";
import { Field } from "./AppointmentDialog";
import { useAuth } from "@/lib/auth";

const informativa = (doctor) => `Ai sensi degli artt. 13 e 9 del Reg. UE 2016/679, il titolare del trattamento (${doctor}) tratta i dati personali e sanitari del minore esclusivamente per finalità di diagnosi, cura e gestione amministrativa della visita. I dati sono conservati con crittografia AES-256, accessibili solo al medico e non diffusi. Il genitore può esercitare in ogni momento i diritti di accesso, rettifica, cancellazione e revoca del consenso contattando lo studio. [Testo da validare con il proprio consulente privacy/DPO]`;

export const ConsentDialog = ({ patient, open, onClose, onSaved }) => {
  const { user } = useAuth();
  const [f, setF] = useState({ signer_name: "", signer_relation: "Madre", privacy_policy: false, health_data: false, email_reports: false, method: "firma_tablet" });
  const [signature, setSignature] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) { setF((x) => ({ ...x, signer_name: (patient?.guardian || "").replace(/^[^:]+:\s*/, "") })); setSignature(null); }
  }, [open, patient]);

  const save = async () => {
    if (!f.privacy_policy || !f.health_data) return toast.error("Informativa e trattamento dei dati sanitari sono obbligatori");
    const tablet = f.method === "firma_tablet";
    if (tablet && !signature) return toast.error("Manca la firma: tocchi il riquadro per firmare");
    const signer = tablet ? signature.signerName : f.signer_name.trim();
    if (!signer) return toast.error("Inserisci il nome del firmatario");
    setBusy(true);
    try {
      await http.post(`/patients/${patient.id}/consents`, { ...f, signer_name: signer, signature: tablet ? signature.image : null });
      toast.success("Consenso informato registrato");
      onSaved?.();
      onClose();
    } catch (e) { toast.error(errMsg(e)); }
    setBusy(false);
  };
  const Check = ({ k, label, required }) => (
    <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 px-4 py-3 text-sm text-night hover:border-night">
      <input type="checkbox" checked={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.checked })} className="mt-0.5 h-4 w-4 accent-[#0A192F]" data-testid={`consent-${k}`} />
      <span>{label} {required ? <span className="text-red-600">*</span> : <span className="text-slate-500">(facoltativo)</span>}</span>
    </label>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto rounded-3xl bg-white sm:max-w-lg" data-testid="consent-dialog" data-lenis-prevent>
        <DialogHeader><DialogTitle className="flex items-center gap-2 font-display text-3xl font-normal text-night"><ShieldCheck className="text-night" /> Consenso informato</DialogTitle></DialogHeader>
        <p className="max-h-32 overflow-y-auto rounded-2xl bg-[#F4F5F7] p-4 text-xs leading-relaxed text-slate-700" data-testid="consent-informativa">{informativa(user?.name || "il medico")}</p>
        <div className="grid gap-2">
          <Check k="privacy_policy" label="Dichiaro di aver letto l'informativa privacy" required />
          <Check k="health_data" label="Acconsento al trattamento dei dati sanitari del minore (art. 9 GDPR)" required />
          <Check k="email_reports" label="Acconsento a ricevere referti e comunicazioni via email" />
        </div>
        <div className={`grid gap-3 ${f.method === "modulo_cartaceo" ? "grid-cols-[1fr_130px]" : "grid-cols-1"}`}>
          {f.method === "modulo_cartaceo" && <Field label="Firmatario"><Input value={f.signer_name} onChange={(e) => setF({ ...f, signer_name: e.target.value })} data-testid="consent-signer-input" /></Field>}
          <Field label="Relazione del firmatario con il minore">
            <select value={f.signer_relation} onChange={(e) => setF({ ...f, signer_relation: e.target.value })} className="h-9 rounded-md border border-input bg-transparent px-2 text-sm" data-testid="consent-relation-select">
              {["Madre", "Padre", "Tutore legale"].map((r) => <option key={r}>{r}</option>)}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {[["firma_tablet", "Firma su tablet", PenLine], ["modulo_cartaceo", "Modulo cartaceo", FileSignature]].map(([v, l, Icon]) => (
            <button key={v} onClick={() => setF({ ...f, method: v })} className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium ${f.method === v ? "bg-night text-white" : "border border-slate-200 text-slate-600"}`} data-testid={`consent-method-${v}`}><Icon size={15} /> {l}</button>
          ))}
        </div>
        {f.method === "firma_tablet" ? (
          <SignatureField value={signature} onChange={setSignature} defaultName={f.signer_name} testId="consent-signature"
            title={`Firma ${f.signer_relation === "Tutore legale" ? "del Tutore" : "del Genitore / Tutore"}`}
            description={`Consenso informato al trattamento dei dati di ${patient?.name || "del minore"}. Firmi per esteso nel riquadro.`} />
        ) : <p className="text-xs text-slate-600">Il modulo firmato su carta va conservato in studio.</p>}
        <button onClick={save} disabled={busy} className="rounded-full bg-night py-3.5 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 disabled:opacity-60" data-testid="consent-save-btn">Registra consenso</button>
      </DialogContent>
    </Dialog>
  );
};
