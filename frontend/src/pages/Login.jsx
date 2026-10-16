import { useState } from "react";
import { motion } from "framer-motion";
import { Lock, ArrowRight, Loader2 } from "lucide-react";
import { LogoMark } from "@/components/dash/Logo";
import { useAuth } from "@/lib/auth";
import { errMsg } from "@/lib/api";

const Line = ({ children, delay }) => (
  <span className="block overflow-hidden pb-1">
    <motion.span className="block" initial={{ y: "105%" }} animate={{ y: 0 }} transition={{ duration: 0.9, delay, ease: [0.22, 1, 0.36, 1] }}>{children}</motion.span>
  </span>
);

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try { await login(email, password); }
    catch (err) { setError(errMsg(err)); }
    setBusy(false);
  };

  return (
    <div className="grid min-h-screen bg-paper lg:grid-cols-[1.1fr_1fr]" data-testid="login-page">
      <section className="grain relative flex flex-col justify-between overflow-hidden bg-night px-6 py-8 text-white lg:px-14 lg:py-12">
        <div className="relative z-10 flex items-center gap-3">
          <LogoMark light />
          <span className="font-display text-[28px]">MantMed</span>
        </div>
        <h1 className="relative z-10 my-12 font-display text-4xl leading-[1.02] sm:text-5xl lg:text-6xl">
          <Line delay={0.1}>Ascolta il paziente.</Line>
          <Line delay={0.22}><span className="italic text-[#A9C2FF]">Al resto pensa la nota.</span></Line>
        </h1>
        <div className="relative z-10 hidden text-[11px] uppercase tracking-[0.22em] text-slate-300 sm:block">Area riservata · accesso solo per il medico</div>
        {[0, 1, 2].map((i) => <span key={i} className="ring-pulse pointer-events-none absolute -bottom-24 -right-24 rounded-full border border-[#7FA6FF]/30" style={{ animationDelay: `${i * 1.2}s` }} />)}
      </section>

      <section className="flex items-center justify-center px-6 py-12">
        <motion.form onSubmit={submit} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35, duration: 0.6 }} className="w-full max-w-sm" data-testid="login-form">
          <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Accesso medico</div>
          <h2 className="mt-1 font-display text-4xl text-night">Bentornata.</h2>
          <label className="mt-8 block text-xs uppercase tracking-[0.16em] text-slate-500">Email</label>
          <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-night outline-none transition-colors focus:border-night" data-testid="login-email-input" />
          <label className="mt-5 block text-xs uppercase tracking-[0.16em] text-slate-500">Password</label>
          <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-night outline-none transition-colors focus:border-night" data-testid="login-password-input" />
          {error && <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700" data-testid="login-error">{error}</p>}
          <button type="submit" disabled={busy} className="group mt-7 flex w-full items-center justify-center gap-3 rounded-full bg-night py-4 font-semibold text-white transition-transform hover:-translate-y-0.5 active:scale-[0.98] disabled:opacity-60" data-testid="login-submit-button">
            {busy ? <Loader2 className="animate-spin" size={18} /> : <Lock size={16} />} Accedi
            {!busy && <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />}
          </button>
          <p className="mt-6 text-center text-xs text-slate-500">Nessuna registrazione pubblica: l'account è configurato dallo studio.</p>
        </motion.form>
      </section>
    </div>
  );
}
