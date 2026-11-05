import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { CalendarClock, Download, Send, ShieldCheck, Loader2 } from "lucide-react";
import { api, errMsg, eur } from "@/lib/api";
import { Badge, Kicker, btnGhost, btnMain, card, fmtDate } from "./ui";

const thisYear = () => Number(new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" }).slice(0, 4));

const Deadline = ({ d, year }) => {
  const days = Math.ceil((new Date(`${d.deadline}T23:59:59`) - new Date()) / 86400000);
  return (
    <div className="grain relative overflow-hidden rounded-3xl bg-[var(--accent)] p-6 text-[var(--ink)]" data-testid="sts-deadline">
      <div className="relative flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] opacity-70"><CalendarClock size={13} /> Scadenza annuale</div>
      <div className="relative mt-2 font-display text-4xl leading-tight">Dati {year} entro il {new Date(`${d.deadline}T12:00:00`).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" })}</div>
      <div className="relative mt-2 text-sm opacity-80" data-testid="sts-deadline-days">{days > 0 ? `Mancano ${days} giorni` : "Scadenza superata"}</div>
    </div>
  );
};

export const StsPanel = ({ refreshKey }) => {
  const [year, setYear] = useState(thisYear());
  const [d, setD] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api.sts(year).then(setD).catch(() => setD(null)), [year]);
  useEffect(() => { load(); }, [load, refreshKey]);
  const send = async () => {
    setBusy(true);
    try { const r = await api.stsSend(year); toast.success(`Simulazione: ${r.sent} inviate${r.errors ? `, ${r.errors} con errore` : ""}`); load(); } catch (e) { toast.error(errMsg(e)); }
    setBusy(false);
  };

  return (
    <div className="space-y-5" data-testid="sts-panel">
      <div className="rounded-2xl border border-dashed border-[var(--hair)] p-3 text-sm text-[var(--fg2)]" data-testid="sts-simulation-note"><ShieldCheck size={14} className="mr-1 inline" /> MODALITÀ SIMULAZIONE: il file viene preparato e gli stati aggiornati, ma nulla viene trasmesso davvero al Sistema TS.</div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.3fr_1fr]">
        {d && <Deadline d={d} year={year} />}
        <div className={card}>
          <div className="flex items-center justify-between"><Kicker>Anno di riferimento</Kicker>
            <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="h-9 rounded-full border border-[var(--hair)] bg-[var(--surface)] px-3 text-sm text-[var(--fg)]" data-testid="sts-year">{[thisYear(), thisYear() - 1, thisYear() - 2].map((y) => <option key={y} value={y}>{y}</option>)}</select></div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            {[["da_inviare", "Da inviare"], ["inviata", "Inviate"], ["errore", "Errori"]].map(([k, l]) => <div key={k} className="rounded-2xl bg-[var(--raised)] p-3" data-testid={`sts-count-${k}`}><div className="font-display text-3xl text-[var(--fg)]">{d?.count?.[k] ?? 0}</div><div className="text-xs text-[var(--fg2)]">{l}</div></div>)}
          </div>
          <p className="mt-3 text-xs text-[var(--fg2)]" data-testid="sts-opposed">{d?.opposed ?? 0} fatture escluse per opposizione del paziente.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={() => api.stsFile(year).catch((e) => toast.error(errMsg(e)))} className={btnGhost} data-testid="sts-file-btn"><Download size={15} /> Prepara file</button>
            <button onClick={send} disabled={busy || !(d?.count?.da_inviare || d?.count?.errore)} className={btnMain} data-testid="sts-send-btn">{busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Invia (simulazione)</button>
          </div>
        </div>
      </div>
      <div className="overflow-x-auto rounded-3xl border border-[var(--hair)] bg-[var(--surface)]" data-testid="sts-list">
        <table className="w-full min-w-[680px] text-left text-sm">
          <thead className="bg-[var(--accent)] text-[11px] uppercase tracking-[0.14em] text-[var(--ink)]"><tr>{["N.", "Data", "Paziente", "Codice fiscale", "Importo", "Stato"].map((h) => <th key={h} className="px-4 py-2.5 font-semibold">{h}</th>)}</tr></thead>
          <tbody>
            {(d?.items ?? []).length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-[var(--fg2)]">Nessuna fattura da comunicare per il {year}.</td></tr>}
            {(d?.items ?? []).map((i) => (
              <tr key={i.id} className="border-t border-[var(--hair)] text-[var(--fg)]" data-testid={`sts-row-${i.id}`}>
                <td className="px-4 py-2.5 font-mono text-xs">{i.number}</td><td className="px-4 py-2.5 font-mono text-xs">{fmtDate(i.date)}</td>
                <td className="px-4 py-2.5">{i.patient_name}</td><td className="px-4 py-2.5 font-mono text-xs">{i.patient_cf || "—"}</td>
                <td className="px-4 py-2.5 font-mono">{eur(i.totals.total)}</td>
                <td className="px-4 py-2.5"><Badge status={i.sts_status} testid={`sts-status-${i.id}`} />{i.sts_action === "cancellazione" && <span className="ml-1.5 text-xs text-[var(--fg2)]" data-testid={`sts-cancel-${i.id}`}>{i.sts_status === "inviata" ? "cancellazione comunicata" : "fattura annullata: cancellazione da comunicare"}</span>}{i.sts_error && <div className="mt-1 text-xs text-[var(--alert)]">{i.sts_error}</div>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
