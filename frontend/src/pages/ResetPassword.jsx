import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Loader2, KeyRound, CheckCircle2, Check, X, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { LogoMark } from "@/components/dash/Logo";
import { api, errMsg } from "@/lib/api";
import { Strength, isStrong } from "@/components/auth/PasswordRules";

const inp = "h-12 w-full rounded-2xl border border-[var(--hair)] bg-[var(--sel)] px-4 pr-12 text-sm text-[var(--ink)] outline-none placeholder:text-[var(--fg2)] focus:border-[var(--hair)] focus:bg-[var(--sel)]";

const PwField = ({ value, onChange, placeholder, testId, show, onToggle }) => (
  <div className="relative">
    <input type={show ? "text" : "password"} autoComplete="new-password" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={inp} data-testid={testId} />
    <button type="button" onClick={onToggle} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[var(--fg2)] hover:text-[var(--ink)]" aria-label={show ? "Nascondi password" : "Mostra password"} data-testid={`${testId}-toggle`}>{show ? <EyeOff size={17} /> : <Eye size={17} />}</button>
  </div>
);

const Done = ({ res }) => (
  <div data-testid="reset-done">
    <CheckCircle2 className="text-[var(--ok)]" size={28} />
    <h1 className="mt-2 font-display text-4xl">Password aggiornata</h1>
    <p className="mt-1 text-sm text-[var(--fg2)]">Per sicurezza abbiamo chiuso tutte le sessioni aperte sugli altri dispositivi.{res.totp_enabled ? " Al prossimo accesso le verrà chiesto anche il codice della verifica in due passaggi." : ""}</p>
    <Link to={res.login_path || "/app"} className="mt-6 flex h-12 items-center justify-center rounded-full bg-[var(--accent)] text-sm font-semibold text-[var(--ink)] transition-transform hover:-translate-y-0.5" data-testid="reset-login-link">Vai all'accesso</Link>
  </div>
);

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [info, setInfo] = useState(null);
  const [error, setError] = useState("");
  const [pw, setPw] = useState({ a: "", b: "" });
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);
  useEffect(() => {
    let alive = true;
    api.resetInfo(token).then((r) => { if (alive) setInfo(r); }).catch((e) => { if (alive) setError(errMsg(e)); });
    return () => { alive = false; };
  }, [token]);
  const strong = isStrong(pw.a);
  const match = pw.b.length > 0 && pw.a === pw.b;
  const submit = async (e) => {
    e.preventDefault();
    if (!strong || !match) return;
    setBusy(true);
    try { setRes(await api.resetPassword(token, pw.a)); } catch (err) { setError(errMsg(err)); }
    setBusy(false);
  };
  const back = ["patient", "parent"].includes(info?.role) ? "/portale" : info?.role === "admin" ? "/admin" : "/app";
  return (
    <div className="grain relative grid min-h-screen place-items-center overflow-hidden theme-page bg-[var(--bg)] px-5 py-10 text-[var(--ink)]" data-testid="reset-page"><ThemeToggle floating />
      <div className="relative z-10 w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="rounded-2xl border border-[var(--hair)] p-1.5"><LogoMark size={52} /></div>
          <div className="mt-4 font-display text-4xl">MantMed</div>
          <div className="mt-1 text-[11px] uppercase tracking-[0.28em] text-[var(--fg2)]">Recupero password</div>
        </div>
        <div className="rounded-[28px] border border-[var(--hair)] bg-[var(--surface)] p-7">
          {res ? <Done res={res} /> : error ? (
            <div data-testid="reset-error">
              <h1 className="font-display text-4xl">Link non valido</h1>
              <p className="mt-2 text-sm text-[var(--alert)]">{error}</p>
              <Link to={back} className="mt-6 flex h-12 items-center justify-center rounded-full bg-[var(--accent)] text-sm font-semibold text-[var(--ink)]" data-testid="reset-new-link">Richiedi un nuovo link</Link>
            </div>
          ) : !info ? <Loader2 className="animate-spin" /> : (
            <form onSubmit={submit} noValidate>
              <h1 className="font-display text-4xl leading-tight">Nuova password</h1>
              <p className="mt-1 text-sm text-[var(--fg2)]" data-testid="reset-account">Account <strong className="text-[var(--ink)]">{info.email}</strong></p>
              <label className="mt-6 block text-xs uppercase tracking-[0.16em] text-[var(--fg2)]">Nuova password</label>
              <div className="mt-1.5"><PwField value={pw.a} onChange={(v) => setPw({ ...pw, a: v })} testId="reset-password-input" show={show} onToggle={() => setShow(!show)} /></div>
              <Strength pw={pw.a} />
              <label className="mt-5 block text-xs uppercase tracking-[0.16em] text-[var(--fg2)]">Conferma password</label>
              <div className="mt-1.5"><PwField value={pw.b} onChange={(v) => setPw({ ...pw, b: v })} testId="reset-password-confirm-input" show={show} onToggle={() => setShow(!show)} /></div>
              {pw.b.length > 0 && <p className={`mt-1.5 flex items-center gap-1.5 text-xs ${match ? "text-[var(--ok)]" : "text-[var(--fg)]"}`} data-testid="reset-match-hint">{match ? <Check size={12} /> : <X size={12} />} {match ? "Le password coincidono" : "Le password non coincidono"}</p>}
              <button disabled={busy || !strong || !match} className="mt-7 flex w-full items-center justify-center gap-3 rounded-full bg-[var(--accent)] py-4 font-semibold text-[var(--ink)] transition-transform hover:-translate-y-0.5 active:scale-[0.98] disabled:opacity-50" data-testid="reset-submit-btn">
                {busy ? <Loader2 className="animate-spin" size={18} /> : <KeyRound size={16} />} Imposta nuova password
              </button>
            </form>
          )}
        </div>
        <p className="mt-6 flex items-center justify-center gap-2 text-center text-xs text-[var(--fg2)]"><ShieldCheck size={14} /> Link monouso valido 30 minuti · la verifica in due passaggi resta attiva</p>
      </div>
    </div>
  );
}
