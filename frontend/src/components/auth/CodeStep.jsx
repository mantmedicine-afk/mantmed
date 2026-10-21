import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowRight, Loader2, MailCheck, RotateCw } from "lucide-react";
import { api, errMsg } from "@/lib/api";
import { FieldMsg } from "./RegisterField";

const WAIT = 60;

export const CodeStep = ({ email, onDone, onBack, onResend }) => {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [left, setLeft] = useState(WAIT);
  useEffect(() => { if (left <= 0) return undefined; const t = setTimeout(() => setLeft(left - 1), 1000); return () => clearTimeout(t); }, [left]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try { const r = await api.registerVerify({ email, code }); await onDone(r); }
    catch (err) { setError(errMsg(err)); setCode(""); setBusy(false); }
  };
  const resend = async () => {
    setError("");
    try { await onResend(); toast.success("Nuovo codice inviato"); setLeft(WAIT); } catch (err) { setError(errMsg(err)); }
  };
  return (
    <form onSubmit={submit} data-testid="register-code-form">
      <MailCheck className="text-[#C9CCD3]" />
      <p className="mt-3 text-sm text-slate-200">Abbiamo inviato un codice a 6 cifre a <strong className="text-white">{email}</strong>. Lo inserisca qui sotto: scade tra 15 minuti.</p>
      <input value={code} onChange={(e) => { setError(""); setCode(e.target.value.replace(/\D/g, "").slice(0, 6)); }} inputMode="numeric" autoFocus placeholder="000000"
        className={`mt-5 h-14 w-full rounded-xl border bg-white/5 text-center font-mono text-2xl tracking-[0.5em] text-white outline-none ${error ? "border-rose-400/70" : "border-white/15 focus:border-[#C9CCD3]"}`} data-testid="register-code-input" />
      <FieldMsg id="register-code" error={error} />
      <button disabled={busy || code.length !== 6} className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-white text-sm font-semibold text-[#0A192F] disabled:opacity-50" data-testid="register-code-submit">
        {busy ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />} {busy ? "Verifica in corso…" : "Verifica email"}
      </button>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm">
        <button type="button" onClick={onBack} className="text-slate-300 underline underline-offset-4" data-testid="register-code-back">Correggi i dati</button>
        <button type="button" disabled={left > 0} onClick={resend} className="inline-flex items-center gap-1.5 text-white underline underline-offset-4 disabled:text-slate-400 disabled:no-underline" data-testid="register-code-resend">
          <RotateCw size={13} /> {left > 0 ? `Nuovo codice tra ${left}s` : "Invia un nuovo codice"}
        </button>
      </div>
    </form>
  );
};
