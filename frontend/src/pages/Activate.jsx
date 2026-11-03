import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Loader2, KeyRound, CheckCircle2 } from "lucide-react";
import { LogoMark } from "@/components/dash/Logo";
import { api, errMsg } from "@/lib/api";

const inp = "h-12 w-full rounded-xl border border-[var(--hair)] bg-[var(--sel)] px-4 text-sm text-[var(--ink)] outline-none placeholder:text-[var(--fg2)] focus:border-[var(--hair)]";

export default function Activate() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [info, setInfo] = useState(null);
  const [error, setError] = useState("");
  const [pw, setPw] = useState({ a: "", b: "" });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  useEffect(() => {
    let alive = true;
    api.activateInfo(token).then((r) => alive && setInfo(r)).catch((e) => alive && setError(errMsg(e)));
    return () => { alive = false; };
  }, [token]);
  const submit = async (e) => {
    e.preventDefault();
    if (pw.a !== pw.b) return toast.error("Le due password non coincidono");
    setBusy(true);
    try { await api.activate({ token, password: pw.a }); setDone(true); } catch (err) { toast.error(errMsg(err)); }
    setBusy(false);
  };
  return (
    <div className="grid min-h-screen place-items-center theme-page bg-[var(--bg)] px-5 py-10 text-[var(--ink)]" data-testid="activate-page"><ThemeToggle floating />
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3"><LogoMark size={38} light /><div className="font-display text-3xl">MantMed</div></div>
        <div className="mt-8 rounded-[28px] border border-[var(--hair)] bg-[var(--surface)] p-6">
          <div className="text-[11px] uppercase tracking-[0.22em] text-[var(--fg2)]">Rete multispecialistica</div>
          {error && <p className="mt-3 text-sm text-[var(--alert)]" data-testid="activate-error">{error}</p>}
          {!error && !info && <Loader2 className="mt-4 animate-spin" />}
          {info && !done && (
            <form onSubmit={submit} className="mt-2 space-y-3">
              <h1 className="font-display text-4xl">Attivi il suo account</h1>
              <p className="text-sm text-[var(--fg2)]" data-testid="activate-info">{info.name} · {info.specialty}<br />Accederà con <strong className="text-[var(--ink)]">{info.email}</strong></p>
              <input type="password" value={pw.a} onChange={(e) => setPw({ ...pw, a: e.target.value })} placeholder="Nuova password (min. 10 caratteri, lettere e numeri)" required className={inp} data-testid="activate-password" />
              <input type="password" value={pw.b} onChange={(e) => setPw({ ...pw, b: e.target.value })} placeholder="Ripeta la password" required className={inp} data-testid="activate-password-confirm" />
              <button disabled={busy} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[var(--accent)] text-sm font-semibold text-[var(--ink)] disabled:opacity-60" data-testid="activate-submit">{busy ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />} Attiva account</button>
            </form>
          )}
          {done && (
            <div className="mt-3" data-testid="activate-done">
              <CheckCircle2 className="text-[var(--ok)]" />
              <h1 className="mt-2 font-display text-4xl">Account attivo</h1>
              <p className="mt-1 text-sm text-[var(--fg2)]">Acceda alla dashboard e configuri sedi, orari, prestazioni e tariffe da "Orari e tariffe".</p>
              <Link to="/app" className="mt-5 flex h-12 items-center justify-center rounded-full bg-[var(--accent)] text-sm font-semibold text-[var(--ink)]" data-testid="activate-login-link">Vai all'accesso</Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
