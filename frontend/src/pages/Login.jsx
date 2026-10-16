import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { Lock, ArrowRight, Loader2, Eye, EyeOff, ShieldCheck, Check, AlertTriangle, ArrowLeft } from "lucide-react";
import { LogoMark } from "@/components/dash/Logo";
import { useAuth } from "@/lib/auth";
import { errMsg } from "@/lib/api";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const Line = ({ children, delay }) => (
  <span className="block overflow-hidden pb-1">
    <motion.span className="block" initial={{ y: "105%" }} animate={{ y: 0 }} transition={{ duration: 0.9, delay, ease: [0.22, 1, 0.36, 1] }}>{children}</motion.span>
  </span>
);

const Hint = ({ ok, show, children, id }) => show ? (
  <p className={`mt-1.5 flex items-center gap-1.5 text-xs ${ok ? "text-emerald-300" : "text-amber-300"}`} data-testid={id}>{ok ? <Check size={12} /> : <AlertTriangle size={12} />}{children}</p>
) : null;

const inputCls = "mt-1.5 w-full rounded-2xl border bg-white/5 px-4 py-3.5 text-white outline-none transition-colors placeholder:text-slate-400 focus:bg-white/10";

export default function Login() {
  const { login, verify2fa, reason } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [touched, setTouched] = useState({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [mfa, setMfa] = useState(null);

  const emailOk = EMAIL_RE.test(email.trim());
  const pwOk = password.length >= 8;

  const submit = async (e) => {
    e.preventDefault();
    setTouched({ email: true, password: true });
    if (!emailOk || !pwOk) return;
    setError("");
    setBusy(true);
    try { const r = await login(email, password); if (r.mfaToken) setMfa(r.mfaToken); }
    catch (err) { setError(errMsg(err)); }
    setBusy(false);
  };

  return (
    <div className="grain relative grid min-h-screen place-items-center overflow-hidden bg-[#0A192F] px-5 py-10 text-white" data-testid="login-page">
      {[0, 1, 2].map((i) => <span key={i} className="ring-pulse pointer-events-none absolute left-1/2 top-1/2 -ml-[140px] -mt-[140px] rounded-full border border-[#C9CCD3]/20" style={{ animationDelay: `${i * 1.2}s` }} />)}
      <div className="relative z-10 w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="rounded-2xl border border-[#C9CCD3]/40 p-1.5"><LogoMark size={52} /></div>
          <div className="mt-4 font-display text-4xl">MantMed</div>
          <div className="mt-1 text-[11px] uppercase tracking-[0.28em] text-[#C9CCD3]">Studio medico specialistico · Pediatria</div>
        </div>
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25, duration: 0.6 }} className="rounded-[28px] border border-[#C9CCD3]/25 bg-white/[0.04] p-7 backdrop-blur-xl">
          {mfa ? <MfaStep token={mfa} onBack={() => { setMfa(null); setPassword(""); }} verify2fa={verify2fa} /> : (
            <form onSubmit={submit} noValidate data-testid="login-form">
              <h1 className="font-display text-4xl leading-tight"><Line delay={0.3}>Area riservata</Line></h1>
              <p className="mt-1 text-sm text-slate-300">Accesso protetto per la Dott.ssa Tiziana Foti</p>
              {reason && <p className="mt-4 rounded-xl border border-[#C9CCD3]/30 bg-white/5 px-4 py-3 text-sm text-slate-200" data-testid="login-reason">{reason}</p>}
              <label className="mt-6 block text-xs uppercase tracking-[0.16em] text-[#C9CCD3]">Email</label>
              <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} onBlur={() => setTouched((t) => ({ ...t, email: true }))} placeholder="nome@mantmed.it" className={`${inputCls} ${touched.email && !emailOk ? "border-amber-300/60" : "border-white/15 focus:border-[#C9CCD3]"}`} data-testid="login-email-input" />
              <Hint show={touched.email || email.length > 3} ok={emailOk} id="login-email-hint">{emailOk ? "Formato email valido" : "Inserisci un'email valida"}</Hint>
              <label className="mt-5 block text-xs uppercase tracking-[0.16em] text-[#C9CCD3]">Password</label>
              <div className="relative">
                <input type={show ? "text" : "password"} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} onBlur={() => setTouched((t) => ({ ...t, password: true }))} className={`${inputCls} pr-12 ${touched.password && !pwOk ? "border-amber-300/60" : "border-white/15 focus:border-[#C9CCD3]"}`} data-testid="login-password-input" />
                <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 mt-[3px] -translate-y-1/2 p-1 text-slate-300 hover:text-white" aria-label={show ? "Nascondi password" : "Mostra password"} data-testid="login-password-toggle">{show ? <EyeOff size={17} /> : <Eye size={17} />}</button>
              </div>
              <Hint show={touched.password || password.length > 0} ok={pwOk} id="login-password-hint">{pwOk ? "Lunghezza adeguata" : "Almeno 8 caratteri"}</Hint>
              {error && <p className="mt-4 rounded-xl bg-red-500/15 px-4 py-3 text-sm text-red-200" data-testid="login-error">{error}</p>}
              <button type="submit" disabled={busy} className="group mt-7 flex w-full items-center justify-center gap-3 rounded-full bg-white py-4 font-semibold text-[#0A192F] transition-transform hover:-translate-y-0.5 active:scale-[0.98] disabled:opacity-60" data-testid="login-submit-button">
                {busy ? <Loader2 className="animate-spin" size={18} /> : <Lock size={16} />} Accedi
                {!busy && <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />}
              </button>
            </form>
          )}
        </motion.div>
        <p className="mt-6 flex items-center justify-center gap-2 text-center text-xs text-slate-300"><ShieldCheck size={14} /> Connessione cifrata · blocco dopo 5 tentativi · chiusura automatica per inattività</p>
      </div>
    </div>
  );
}

const MfaStep = ({ token, onBack, verify2fa }) => {
  const [digits, setDigits] = useState(Array(6).fill(""));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const refs = useRef([]);
  const submit = async (code) => {
    setBusy(true);
    setError("");
    try { await verify2fa(token, code); }
    catch (e) { setError(errMsg(e)); setDigits(Array(6).fill("")); refs.current[0]?.focus(); }
    setBusy(false);
  };
  const set = (i, v) => {
    const clean = v.replace(/\D/g, "");
    const next = [...digits];
    if (clean.length > 1) clean.slice(0, 6).split("").forEach((d, j) => { if (i + j < 6) next[i + j] = d; });
    else next[i] = clean;
    setDigits(next);
    const pos = Math.min(5, i + Math.max(1, clean.length));
    if (clean) refs.current[pos]?.focus();
    if (next.every(Boolean)) submit(next.join(""));
  };
  return (
    <div data-testid="mfa-step">
      <button onClick={onBack} className="flex items-center gap-1 text-xs text-slate-300 hover:text-white" data-testid="mfa-back-btn"><ArrowLeft size={13} /> Indietro</button>
      <h1 className="mt-3 font-display text-4xl">Verifica in due passaggi</h1>
      <p className="mt-1 text-sm text-slate-300">Inserisci il codice a 6 cifre dell'app di autenticazione.</p>
      <div className="mt-6 grid grid-cols-6 gap-2">
        {digits.map((d, i) => (
          <input key={i} ref={(el) => { refs.current[i] = el; }} autoFocus={i === 0} inputMode="numeric" maxLength={6} value={d} disabled={busy}
            onChange={(e) => set(i, e.target.value)} onKeyDown={(e) => { if (e.key === "Backspace" && !d && i) refs.current[i - 1]?.focus(); }}
            className="h-14 w-full rounded-xl border border-white/15 bg-white/5 text-center font-mono text-2xl text-white outline-none focus:border-[#C9CCD3]" data-testid={`mfa-digit-${i}`} />
        ))}
      </div>
      {busy && <p className="mt-4 flex items-center gap-2 text-sm text-slate-300"><Loader2 size={15} className="animate-spin" /> Verifica in corso…</p>}
      {error && <p className="mt-4 rounded-xl bg-red-500/15 px-4 py-3 text-sm text-red-200" data-testid="mfa-error">{error}</p>}
    </div>
  );
};
