import { useEffect, useState } from "react";
import { toast } from "sonner";
import { FileSignature, Loader2, PenLine, ShieldCheck } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { SignatureField } from "@/components/signature/SignaturePadModal";
import { api, errMsg } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const dlong = (d) => new Date(`${d}T12:00:00`).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });

export const PortalConsentDialog = ({ open, onClose, child, onSigned }) => {
  const { user } = useAuth();
  const [tpl, setTpl] = useState(null);
  const [f, setF] = useState({ privacy_policy: false, health_data: false, email_reports: false, relation: "Madre" });
  const [sig, setSig] = useState(null);
  const [busy, setBusy] = useState(false);
  const pid = child?.patient.id;
  useEffect(() => {
    if (!open || !pid) return;
    setF({ privacy_policy: false, health_data: false, email_reports: false, relation: "Madre" });
    setSig(null);
    setTpl(null);
    api.portalSignTemplate(pid).then(setTpl).catch((e) => toast.error(errMsg(e)));
  }, [open, pid]);

  const submit = async () => {
    if (!f.privacy_policy || !f.health_data) return toast.error("Informativa e trattamento dei dati sanitari sono obbligatori");
    if (!sig) return toast.error("Manca la firma: tocchi il riquadro per firmare");
    setBusy(true);
    try {
      const out = await api.portalSignConsent({
        patient_id: pid, document_id: "consenso_privacy", signature: sig.image, client_signed_at: sig.signedAt,
        signer: { name: sig.signerName, relation: f.relation }, privacy_policy: true, health_data: true, email_reports: f.email_reports,
      });
      toast.success(`Consenso firmato e inviato allo studio · documento ${out.document?.code ?? ""}`);
      onSigned?.();
      onClose();
    } catch (e) { toast.error(errMsg(e)); }
    setBusy(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] w-[calc(100vw-1.5rem)] overflow-y-auto rounded-3xl bg-[var(--surface)] sm:max-w-lg" data-testid="portal-consent-dialog" data-lenis-prevent>
        <DialogHeader className="text-left">
          <DialogTitle className="flex items-center gap-2 font-display text-3xl font-normal text-[var(--fg)]"><ShieldCheck /> Consenso informato</DialogTitle>
          <DialogDescription className="text-sm text-[var(--fg2)]">Per {child?.patient.name} presso {tpl?.doctor ?? child?.doctor.name}. Dopo la firma riceverà il PDF nella sezione Consensi.</DialogDescription>
        </DialogHeader>
        {!tpl ? <Loader2 className="animate-spin text-[var(--fg)]" /> : (
          <>
            <p className="max-h-36 overflow-y-auto rounded-2xl bg-[var(--raised)] p-4 text-xs leading-relaxed text-[var(--fg2)]" data-testid="portal-consent-text">{tpl.text}</p>
            <div className="grid gap-2">
              {tpl.clauses.map((c) => (
                <label key={c.key} className="flex cursor-pointer items-start gap-3 rounded-2xl border border-[var(--hair)] px-4 py-3 text-sm text-[var(--fg)] hover:border-[var(--accent)]">
                  <input type="checkbox" checked={f[c.key]} onChange={(e) => setF({ ...f, [c.key]: e.target.checked })} className="mt-0.5 h-4 w-4 accent-[var(--accent)]" data-testid={`portal-consent-${c.key}`} />
                  <span>{c.label} {c.required ? <span className="text-[var(--alert)]">*</span> : <span className="text-[var(--fg2)]">(facoltativo)</span>}</span>
                </label>
              ))}
            </div>
            <label className="grid gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--fg2)]">Lei è</span>
              <select value={f.relation} onChange={(e) => setF({ ...f, relation: e.target.value })} className="h-11 rounded-xl border border-[var(--hair)] bg-[var(--surface)] px-3 text-sm text-[var(--fg)]" data-testid="portal-consent-relation">
                {tpl.relations.map((r) => <option key={r}>{r}</option>)}
              </select>
            </label>
            <SignatureField value={sig} onChange={setSig} defaultName={user?.name ?? ""} testId="portal-consent-signature"
              description={`Consenso informato per ${child?.patient.name}. Firmi per esteso con il dito o il pennino.`} />
            <button onClick={submit} disabled={busy} className="flex h-12 items-center justify-center gap-2 rounded-full bg-[var(--accent)] text-sm font-semibold text-[var(--ink)] disabled:opacity-60" data-testid="portal-consent-submit">
              {busy ? <Loader2 size={16} className="animate-spin" /> : <PenLine size={16} />} Firma e invia allo studio
            </button>
            <p className="text-[11px] leading-relaxed text-[var(--fg2)]">Registriamo data e ora, indirizzo IP e dispositivo come prova della firma elettronica. Il PDF è protetto da modifiche e archiviato cifrato su server UE.</p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

/** Banner "Firma ora" quando la cartella del bambino presso il medico non ha un consenso valido. */
export const ConsentBanner = ({ child, onSigned }) => {
  const [open, setOpen] = useState(false);
  if (child.consent_at) return null;
  const next = child.appointments?.[0];
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[var(--accent)] p-4 text-[var(--ink)] sm:p-5" data-testid={`portal-consent-banner-${child.patient.id}`}>
      <div className="flex min-w-0 items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--sel)]"><FileSignature size={18} className="text-[var(--fg2)]" /></span>
        <div className="min-w-0">
          <div className="font-medium">Consenso informato da firmare</div>
          <p className="text-sm text-[var(--fg2)]">
            {next ? `Prima della visita ${next.date ? `di ${dlong(next.date)}` : "di oggi"} alle ${next.time}` : "Prima della prima visita"} con {child.doctor.name} serve il consenso al trattamento dei dati. Può firmarlo ora; in alternativa lo firmerà in studio.
          </p>
        </div>
      </div>
      <button onClick={() => setOpen(true)} className="flex h-11 items-center gap-2 rounded-full bg-[var(--surface)] px-5 text-sm font-semibold text-[var(--fg)] transition-transform hover:-translate-y-0.5" data-testid={`portal-consent-sign-btn-${child.patient.id}`}>
        <PenLine size={15} /> Firma ora
      </button>
      <PortalConsentDialog open={open} onClose={() => setOpen(false)} child={child} onSigned={onSigned} />
    </div>
  );
};
