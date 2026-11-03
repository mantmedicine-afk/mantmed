import { useState } from "react";
import { toast } from "sonner";
import { Loader2, KeyRound, Eye, EyeOff, Check, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { api, errMsg } from "@/lib/api";
import { Strength, isStrong } from "./PasswordRules";

const inp = "h-11 w-full rounded-xl border border-[var(--hair)] bg-[var(--surface)] px-3 pr-11 text-sm text-[var(--fg)] outline-none focus:border-[var(--accent)]";
const Label = ({ children }) => <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--fg2)]">{children}</span>;

const Field = ({ label, value, onChange, show, onToggle, testId, auto }) => (
  <label className="block"><Label>{label}</Label>
    <div className="relative">
      <input type={show ? "text" : "password"} autoComplete={auto} value={value} onChange={(e) => onChange(e.target.value)} className={inp} data-testid={testId} />
      <button type="button" onClick={onToggle} className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-[var(--fg2)] hover:text-[var(--fg)]" aria-label={show ? "Nascondi password" : "Mostra password"} data-testid={`${testId}-toggle`}>{show ? <EyeOff size={16} /> : <Eye size={16} />}</button>
    </div>
  </label>
);

export const ChangePasswordDialog = ({ open, onClose }) => {
  const empty = { cur: "", a: "", b: "" };
  const [f, setF] = useState(empty);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const match = f.b.length > 0 && f.a === f.b;
  const same = f.a.length > 0 && f.a === f.cur;
  const ready = f.cur && isStrong(f.a) && match && !same;
  const close = () => { setF(empty); setError(""); onClose(); };
  const submit = async (e) => {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError("");
    try {
      const r = await api.changePassword(f.cur, f.a);
      toast.success(r?.other_sessions_closed ? `Password aggiornata · ${r.other_sessions_closed} altre sessioni chiuse` : "Password aggiornata");
      close();
    } catch (err) { setError(errMsg(err)); }
    setBusy(false);
  };
  const toggle = () => setShow(!show);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto rounded-3xl bg-[var(--surface)] sm:max-w-md" data-testid="change-password-dialog">
        <DialogHeader>
          <DialogTitle className="font-display text-3xl font-normal text-[var(--fg)]">Cambia password</DialogTitle>
          <DialogDescription className="text-sm text-[var(--fg2)]">Per sicurezza le chiediamo la password attuale. Questo dispositivo resta connesso; le sessioni aperte altrove verranno chiuse. La verifica in due passaggi resta attiva.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Field label="Password attuale" value={f.cur} onChange={(v) => setF({ ...f, cur: v })} show={show} onToggle={toggle} testId="change-password-current" auto="current-password" />
          <div>
            <Field label="Nuova password" value={f.a} onChange={(v) => setF({ ...f, a: v })} show={show} onToggle={toggle} testId="change-password-new" auto="new-password" />
            <Strength pw={f.a} dark={false} prefix="change" />
            {same && <p className="mt-1.5 text-xs text-[var(--fg)]" data-testid="change-password-same">La nuova password deve essere diversa da quella attuale</p>}
          </div>
          <div>
            <Field label="Conferma nuova password" value={f.b} onChange={(v) => setF({ ...f, b: v })} show={show} onToggle={toggle} testId="change-password-confirm" auto="new-password" />
            {f.b.length > 0 && <p className={`mt-1.5 flex items-center gap-1.5 text-xs ${match ? "text-[var(--ok)]" : "text-[var(--fg)]"}`} data-testid="change-password-match">{match ? <Check size={12} /> : <X size={12} />} {match ? "Le password coincidono" : "Le password non coincidono"}</p>}
          </div>
          {error && <p className="rounded-xl bg-[var(--alert-bg)] px-4 py-3 text-sm text-[var(--alert)] ring-1 ring-rose-200" data-testid="change-password-error">{error}</p>}
          <button disabled={busy || !ready} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[var(--accent)] text-sm font-semibold text-[var(--ink)] transition-transform hover:-translate-y-0.5 disabled:opacity-50" data-testid="change-password-submit">{busy ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />} Aggiorna password</button>
        </form>
      </DialogContent>
    </Dialog>
  );
};
