import { useState } from "react";
import { toast } from "sonner";
import { KeyRound, Loader2, Timer } from "lucide-react";
import { api, errMsg } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export const IdleWarning = () => {
  const { warnLeft, stayActive, logout } = useAuth();
  if (warnLeft == null) return null;
  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-[#0A192F]/80 px-5 backdrop-blur-md" data-testid="idle-warning">
      <div className="w-full max-w-sm rounded-3xl bg-white p-7 text-center text-night">
        <Timer className="mx-auto text-night" size={30} />
        <h2 className="mt-3 font-display text-3xl">Sei ancora qui?</h2>
        <p className="mt-2 text-sm text-slate-600">Per proteggere i dati dei pazienti la sessione si chiuderà tra</p>
        <div className="mt-2 font-mono text-5xl" data-testid="idle-countdown">{warnLeft}s</div>
        <div className="mt-6 grid grid-cols-2 gap-2">
          <button onClick={() => logout("Sessione chiusa manualmente.")} className="rounded-full border border-slate-200 py-3 text-sm font-medium" data-testid="idle-logout-btn">Esci</button>
          <button onClick={stayActive} className="rounded-full bg-night py-3 text-sm font-semibold text-white" data-testid="idle-stay-btn">Resta connessa</button>
        </div>
      </div>
    </div>
  );
};

export const TwoFactorCard = () => {
  const { user, setUser } = useAuth();
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async (fn) => { setBusy(true); try { await fn(); } catch (e) { toast.error(errMsg(e)); } setBusy(false); };

  const start = () => run(async () => setSetup(await api.setup2fa()));
  const enable = () => run(async () => { await api.enable2fa(code); setUser({ ...user, totp_enabled: true }); setSetup(null); setCode(""); toast.success("Verifica in due passaggi attivata"); });
  const disable = () => run(async () => { await api.disable2fa(password, code); setUser({ ...user, totp_enabled: false }); setCode(""); setPassword(""); toast.success("Verifica in due passaggi disattivata"); });
  const inp = "h-11 rounded-xl border border-slate-200 px-3 text-sm text-night outline-none focus:border-night";

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 lg:col-span-2" data-testid="twofa-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.16em] text-slate-600"><KeyRound size={16} className="text-night" /> Verifica in due passaggi (2FA)</h3>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${user?.totp_enabled ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`} data-testid="twofa-status">{user?.totp_enabled ? "Attiva" : "Non attiva · raccomandata"}</span>
      </div>
      <p className="mt-2 text-sm text-slate-600">All'accesso, dopo la password, viene richiesto un codice a 6 cifre generato da un'app come Google Authenticator, Microsoft Authenticator o Authy. Sessione chiusa automaticamente dopo {user?.idle_minutes ?? 10} minuti di inattività.</p>
      {!user?.totp_enabled && !setup && <button onClick={start} disabled={busy} className="mt-4 rounded-full bg-night px-5 py-3 text-sm font-semibold text-white" data-testid="twofa-setup-btn">{busy ? <Loader2 size={15} className="animate-spin" /> : "Attiva 2FA"}</button>}
      {setup && (
        <div className="mt-4 grid gap-4 sm:grid-cols-[auto_1fr]" data-testid="twofa-setup">
          <img src={setup.qr} alt="QR code 2FA" className="h-44 w-44 rounded-2xl border border-slate-200" data-testid="twofa-qr" />
          <div>
            <p className="text-sm text-slate-700">1. Inquadra il QR con l'app di autenticazione, oppure inserisci la chiave:</p>
            <p className="mt-1 break-all rounded-xl bg-[#F4F5F7] px-3 py-2 font-mono text-xs text-night" data-testid="twofa-secret">{setup.secret}</p>
            <p className="mt-3 text-sm text-slate-700">2. Inserisci il codice a 6 cifre mostrato dall'app:</p>
            <div className="mt-2 flex gap-2">
              <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" placeholder="000000" className={`${inp} w-36 font-mono tracking-[0.3em]`} data-testid="twofa-code-input" />
              <button onClick={enable} disabled={busy || code.length !== 6} className="rounded-full bg-night px-5 text-sm font-semibold text-white disabled:opacity-50" data-testid="twofa-enable-btn">Conferma</button>
            </div>
          </div>
        </div>
      )}
      {user?.totp_enabled && (
        <div className="mt-4 flex flex-wrap gap-2">
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" className={inp} data-testid="twofa-disable-password" />
          <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" placeholder="Codice 2FA" className={`${inp} w-32 font-mono`} data-testid="twofa-disable-code" />
          <button onClick={disable} disabled={busy || !password || code.length !== 6} className="rounded-full border border-red-200 px-5 text-sm font-medium text-red-600 disabled:opacity-50" data-testid="twofa-disable-btn">Disattiva</button>
        </div>
      )}
    </section>
  );
};
