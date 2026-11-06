import { useState } from "react";
import { ArrowLeft, Loader2, Send, MailCheck } from "lucide-react";
import { api, errMsg } from "@/lib/api";

const inputCls = "mt-1.5 w-full rounded-2xl border border-[var(--hair)] bg-[var(--sel)] px-4 py-3.5 text-[var(--ink)] outline-none transition-colors placeholder:text-[var(--fg2)] focus:border-[var(--hair)] focus:bg-[var(--sel)]";

export const ForgotStep = ({ parent, initial, onBack }) => {
  const [value, setValue] = useState(initial || "");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState("");
  const [error, setError] = useState("");
  const submit = async (e) => {
    e.preventDefault();
    if (value.trim().length < 3) return;
    setBusy(true);
    setError("");
    try { const r = await api.forgotPassword(value.trim()); setSent(r?.message || "Richiesta inviata."); } catch (err) { setError(errMsg(err)); }
    setBusy(false);
  };
  return (
    <div data-testid="forgot-step">
      <button type="button" onClick={onBack} className="flex items-center gap-1 text-xs text-[var(--fg2)] hover:text-[var(--ink)]" data-testid="forgot-back-btn"><ArrowLeft size={13} /> Torna all'accesso</button>
      <h1 className="mt-3 font-display text-4xl leading-tight">Recupera password</h1>
      {sent ? (
        <div className="mt-5 rounded-2xl border border-[var(--hair)] bg-[var(--ok)] p-4" data-testid="forgot-success">
          <MailCheck className="text-[var(--ok)]" size={22} />
          <p className="mt-2 text-sm leading-relaxed text-[var(--ok)]">{sent}</p>
          <p className="mt-2 text-xs text-[var(--fg2)]">Il link vale 30 minuti e si può usare una sola volta. Controlli anche la cartella spam.</p>
        </div>
      ) : (
        <form onSubmit={submit} noValidate>
          <p className="mt-1 text-sm text-[var(--fg2)]">{parent ? "Inserisca l'email con cui accede al portale oppure il codice fiscale del paziente: le invieremo un link per impostare una nuova password." : "Inserisca l'email del suo account: le invieremo un link per impostare una nuova password."}</p>
          <label className="mt-6 block text-xs uppercase tracking-[0.16em] text-[var(--fg2)]">{parent ? "Email o codice fiscale del figlio" : "Email"}</label>
          <input autoFocus value={value} onChange={(e) => setValue(e.target.value)} type={parent ? "text" : "email"} autoComplete="username" placeholder={parent ? "nome@email.it o RSSMRA20A01H224X" : "nome@mantmed.it"} className={inputCls} data-testid="forgot-identifier-input" />
          {error && <p className="mt-4 rounded-xl bg-[var(--alert-bg)] px-4 py-3 text-sm text-[var(--alert)]" data-testid="forgot-error">{error}</p>}
          <button disabled={busy || value.trim().length < 3} className="mt-7 flex w-full items-center justify-center gap-3 rounded-full bg-[var(--accent)] py-4 font-semibold text-[var(--ink)] transition-transform hover:-translate-y-0.5 active:scale-[0.98] disabled:opacity-60" data-testid="forgot-submit-btn">
            {busy ? <Loader2 className="animate-spin" size={18} /> : <Send size={16} />} Invia link di ripristino
          </button>
        </form>
      )}
    </div>
  );
};
