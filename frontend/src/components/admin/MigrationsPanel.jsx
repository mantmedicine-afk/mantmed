import { useEffect, useState } from "react";
import { toast } from "sonner";
import { DatabaseBackup, Loader2, CheckCircle2 } from "lucide-react";
import { http, errMsg } from "@/lib/api";

const FLAGS = [["clinics_v1", "Studi e intestazioni versionate"], ["service_ids_v1", "Listini per studio collegati alle prestazioni"], ["access_rules_v2", "Account Genitori → Pazienti e nuove regole di accesso"]];

// Migrazioni dei passaggi 4-5: si eseguono una sola volta, dopo aver scaricato il backup del database di produzione
export const MigrationsPanel = () => {
  const [d, setD] = useState(null);
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const load = () => http.get("/admin/migrations").then((r) => setD(r.data)).catch((e) => toast.error(errMsg(e)));
  useEffect(() => { load(); }, []);
  const run = async () => {
    setBusy(true);
    try { const r = await http.post("/admin/migrations/apply", { backup_done: true }); setD(r.data.after); toast.success("Aggiornamento dei dati completato"); }
    catch (e) { toast.error(errMsg(e)); }
    setBusy(false);
  };
  if (!d) return <Loader2 className="animate-spin text-[var(--fg)]" />;
  const pending = FLAGS.filter(([k]) => !d.flags[k]);
  return (
    <section className="max-w-3xl space-y-5" data-testid="migrations-panel">
      <h1 className="font-display text-4xl text-[var(--fg)]">Aggiornamento dei dati</h1>
      <ul className="space-y-2">
        {FLAGS.map(([k, l]) => (
          <li key={k} className="flex items-center gap-2 text-sm text-[var(--fg)]" data-testid={`migration-flag-${k}`}>
            {d.flags[k] ? <CheckCircle2 size={16} className="text-[var(--ok)]" /> : <DatabaseBackup size={16} />} {l} · <strong>{d.flags[k] ? "fatto" : "da fare"}</strong>
          </li>
        ))}
      </ul>
      <div className="rounded-2xl border border-[var(--hair)] bg-[var(--surface)] p-4 text-sm text-[var(--fg)]" data-testid="migrations-preview">
        <p>Account del portale: <strong>{d.portal_accounts}</strong> (ancora "genitore": <strong>{d.still_parent}</strong>) · accessi che si chiuderebbero: <strong>{d.closing}</strong> · email da spostare in "Email del paziente": <strong>{d.own_email_moves}</strong> · medici: <strong>{d.doctors}</strong></p>
        <ul className="mt-2 space-y-1 text-xs text-[var(--fg2)]">{d.links.map((r, i) => <li key={i}>{r.account} → {r.patient} ({r.adult ? "maggiorenne" : "minorenne"}): {r.relation}</li>)}</ul>
      </div>
      {pending.length > 0 ? (
        <>
          <label className="flex items-start gap-2 text-sm text-[var(--fg)]"><input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} className="mt-0.5 h-4 w-4" data-testid="migrations-backup-check" /> Ho scaricato e conservato il backup del database di produzione.</label>
          <button onClick={run} disabled={!ok || busy} className="flex h-12 items-center gap-2 rounded-full bg-[var(--accent)] px-6 text-sm font-semibold text-[var(--ink)] disabled:opacity-50" data-testid="migrations-apply-btn">{busy && <Loader2 size={15} className="animate-spin" />} Esegui l'aggiornamento</button>
        </>
      ) : <p className="text-sm font-semibold text-[var(--fg)]" data-testid="migrations-all-done">Tutti gli aggiornamenti sono già applicati.</p>}
    </section>
  );
};
