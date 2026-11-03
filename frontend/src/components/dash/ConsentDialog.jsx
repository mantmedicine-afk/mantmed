import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ShieldCheck, FileSignature, PenLine, Printer, Loader2 } from "lucide-react";
import { SignatureField } from "@/components/signature/SignaturePadModal";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api, errMsg } from "@/lib/api";
import { Field } from "./AppointmentDialog";
import { useAuth } from "@/lib/auth";

const informativa = (doctor) => `Ai sensi degli artt. 13 e 9 del Reg. UE 2016/679, il titolare del trattamento (${doctor}) tratta i dati personali e sanitari del minore esclusivamente per finalità di diagnosi, cura e gestione amministrativa della visita. I dati sono conservati con crittografia AES-256, accessibili solo al medico e non diffusi. Il genitore può esercitare in ogni momento i diritti di accesso, rettifica, cancellazione e revoca del consenso contattando lo studio. [Testo da validare con il proprio consulente privacy/DPO]`;

export const ConsentDialog = ({ patient, open, onClose, onSaved }) => {
  const { user } = useAuth();
  const [f, setF] = useState({ signer_name: "", signer_relation: "Madre", privacy_policy: false, health_data: false, email_reports: false, method: "firma_tablet" });
  const [signature, setSignature] = useState(null);
  const [busy, setBusy] = useState(false);
  const [tpl, setTpl] = useState(null);
  const [printing, setPrinting] = useState(false);
  useEffect(() => {
    if (open) {
      setF((x) => ({ ...x, signer_name: (patient?.guardian || "").replace(/^[^:]+:\s*/, "") }));
      setSignature(null);
      api.signTemplate().then(setTpl).catch(() => setTpl(null));
    }
  }, [open, patient]);
  const printForm = async () => {
    setPrinting(true);
    try { await api.consentForm(patient.id, { signer: f.signer_name, relation: f.signer_relation }); } catch (e) { toast.error(errMsg(e)); }
    setPrinting(false);
  };

  const save = async () => {
    if (!f.privacy_policy || !f.health_data) return toast.error("Informativa e trattamento dei dati sanitari sono obbligatori");
    const tablet = f.method === "firma_tablet";
    if (tablet && !signature) return toast.error("Manca la firma: tocchi il riquadro per firmare");
    const signer = tablet ? signature.signerName : f.signer_name.trim();
    if (!signer) return toast.error("Inserisci il nome del firmatario");
    setBusy(true);
    try {
      const out = await api.signConsent({
        patient_id: patient.id, document_id: "consenso_privacy", method: f.method, signature: tablet ? signature.image : null,
        signer: { name: signer, relation: f.signer_relation }, privacy_policy: f.privacy_policy, health_data: f.health_data,
        email_reports: f.email_reports, client_signed_at: tablet ? signature.signedAt : null,
      });
      toast.success(out.document ? `Consenso firmato · PDF ${out.document.code} archiviato nei Documenti` : "Consenso cartaceo registrato");
      onSaved?.();
      onClose();
    } catch (e) { toast.error(errMsg(e)); }
    setBusy(false);
  };
  const Check = ({ k, label, required }) => (
    <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-[var(--hair)] px-4 py-3 text-sm text-[var(--fg)] hover:border-[var(--accent)]">
      <input type="checkbox" checked={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.checked })} className="mt-0.5 h-4 w-4 accent-[var(--accent)]" data-testid={`consent-${k}`} />
      <span>{label} {required ? <span className="text-[var(--alert)]">*</span> : <span className="text-[var(--fg2)]">(facoltativo)</span>}</span>
    </label>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto rounded-3xl bg-[var(--surface)] sm:max-w-lg" data-testid="consent-dialog" data-lenis-prevent>
        <DialogHeader><DialogTitle className="flex items-center gap-2 font-display text-3xl font-normal text-[var(--fg)]"><ShieldCheck className="text-[var(--fg)]" /> Consenso informato</DialogTitle></DialogHeader>
        <p className="max-h-32 overflow-y-auto rounded-2xl bg-[var(--raised)] p-4 text-xs leading-relaxed text-[var(--fg2)]" data-testid="consent-informativa">{tpl?.text || informativa(user?.name || "il medico")}</p>
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
            <button key={v} onClick={() => setF({ ...f, method: v })} className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium ${f.method === v ? "bg-[var(--accent)] text-[var(--ink)]" : "border border-[var(--hair)] text-[var(--fg2)]"}`} data-testid={`consent-method-${v}`}><Icon size={15} /> {l}</button>
          ))}
        </div>
        {f.method === "firma_tablet" ? (
          <SignatureField value={signature} onChange={setSignature} defaultName={f.signer_name} testId="consent-signature"
            title={`Firma ${f.signer_relation === "Tutore legale" ? "del Tutore" : "del Genitore / Tutore"}`}
            description={`Consenso informato al trattamento dei dati di ${patient?.name || "del minore"}. Firmi per esteso nel riquadro.`} />
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--hair)] p-4">
            <p className="text-xs text-[var(--fg2)]">Stampi il modulo precompilato, lo faccia firmare a mano e lo conservi in studio.</p>
            <button type="button" onClick={printForm} disabled={printing} className="flex h-10 items-center gap-2 rounded-full border border-[var(--hair)] px-4 text-sm font-medium text-[var(--fg)] hover:border-[var(--accent)] disabled:opacity-60" data-testid="consent-print-form-btn">
              {printing ? <Loader2 size={15} className="animate-spin" /> : <Printer size={15} />} Scarica modulo da stampare
            </button>
          </div>
        )}
        <button onClick={save} disabled={busy} className="rounded-full bg-[var(--accent)] py-3.5 text-sm font-semibold text-[var(--ink)] transition-transform hover:-translate-y-0.5 disabled:opacity-60" data-testid="consent-save-btn">Registra consenso</button>
      </DialogContent>
    </Dialog>
  );
};
