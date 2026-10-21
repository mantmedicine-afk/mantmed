import { useState } from "react";
import { toast } from "sonner";
import { ShieldCheck, Download, UserX, Loader2, FileSignature } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { api, errMsg } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Card, Field, inp, day } from "./ui";

const DeleteDialog = ({ open, onClose }) => {
  const { logout } = useAuth();
  const [f, setF] = useState({ password: "", reason: "", ok: false });
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try { await api.deleteAccount(f.password, f.reason); toast.success("Account disattivato. Lo studio e MantMed sono stati avvisati."); setTimeout(() => logout(), 1200); }
    catch (err) { toast.error(errMsg(err)); setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="rounded-3xl bg-white sm:max-w-md" data-testid="delete-account-dialog">
        <DialogHeader>
          <DialogTitle className="font-display text-3xl font-normal text-night">Cancella account</DialogTitle>
          <DialogDescription className="text-sm text-slate-600">L'account viene disattivato subito e non potrà più accedere. La richiesta di cancellazione arriva ai medici dei suoi figli e a MantMed. Le cartelle cliniche restano custodite dagli studi per gli obblighi di legge.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Motivo (facoltativo)"><textarea rows={2} maxLength={500} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} className={`${inp} h-auto resize-none py-2`} data-testid="delete-account-reason" /></Field>
          <Field label="Password per confermare"><input type="password" required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} className={inp} data-testid="delete-account-password" /></Field>
          <label className="flex items-start gap-2 text-sm text-night"><input type="checkbox" checked={f.ok} onChange={(e) => setF({ ...f, ok: e.target.checked })} className="mt-1 h-4 w-4 accent-rose-700" data-testid="delete-account-confirm" /> Ho capito che l'account verrà disattivato subito.</label>
          <button disabled={busy || !f.ok || !f.password} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-rose-700 text-sm font-semibold text-white disabled:opacity-50" data-testid="delete-account-submit">{busy ? <Loader2 size={16} className="animate-spin" /> : <UserX size={16} />} Disattiva e richiedi la cancellazione</button>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export const PrivacySection = ({ data }) => {
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState(false);
  const c = data.consent;
  const dl = async () => { setBusy(true); try { await api.exportMyData(); toast.success("Dati scaricati"); } catch (e) { toast.error(errMsg(e)); } setBusy(false); };
  return (
    <div className="space-y-5">
      <Card id="account-consents" icon={FileSignature} title="Consensi accettati" text="I consensi dati alla registrazione. I consensi firmati in studio e quelli di condivisione in rete sono nel Portale, scheda Consensi di ogni figlio.">
        <ul className="space-y-2" data-testid="account-consent-list">
          <li className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-[#F4F5F7] p-4"><span className="text-sm font-medium text-night">Informativa privacy</span><span className="rounded-full bg-emerald-100 px-3 py-1 text-[11px] font-semibold text-emerald-900">{c?.privacy_policy ? `Accettata il ${day(c.at)}` : "Non registrata"}</span></li>
          <li className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-[#F4F5F7] p-4"><span className="text-sm font-medium text-night">Trattamento dei dati sanitari (art. 9 GDPR)</span><span className="rounded-full bg-emerald-100 px-3 py-1 text-[11px] font-semibold text-emerald-900">{c?.health_data ? `Accettato il ${day(c.at)}` : "Non registrato"}</span></li>
        </ul>
        {c?.version && <p className="mt-3 text-xs text-slate-600">Versione: {c.version}</p>}
      </Card>
      <Card id="account-gdpr" icon={ShieldCheck} title="I miei dati" text="Può scaricare una copia dei suoi dati personali (art. 15 e 20 GDPR) o chiedere la cancellazione dell'account (art. 17).">
        <div className="flex flex-wrap gap-2">
          <button onClick={dl} disabled={busy} className="flex h-11 items-center gap-2 rounded-full bg-night px-5 text-sm font-semibold text-white disabled:opacity-60" data-testid="account-export-btn">{busy ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} Scarica i miei dati</button>
          <button onClick={() => setDel(true)} className="flex h-11 items-center gap-2 rounded-full border border-rose-200 px-5 text-sm font-semibold text-rose-700 hover:border-rose-400" data-testid="account-delete-btn"><UserX size={15} /> Cancella account</button>
        </div>
      </Card>
      <DeleteDialog open={del} onClose={() => setDel(false)} />
    </div>
  );
};
