import { useCallback, useEffect, useState } from "react";
import { Loader2, Search, Users } from "lucide-react";
import { api, errMsg } from "@/lib/api";
import { cfError } from "@/lib/validators";
import { TeamState } from "./TeamState";

export const TeamPanel = ({ patientId }) => {
  const [data, setData] = useState(null);
  const load = useCallback(() => api.teamPatient(patientId).then(setData).catch((e) => setData({ status: "error", error: errMsg(e) })), [patientId]);
  useEffect(() => { setData(null); load(); }, [load]);
  return (
    <section className="space-y-3" data-testid="team-panel">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--fg2)]"><Users size={14} /> Medicina di squadra</div>
      {!data ? <div className="h-32 animate-pulse rounded-3xl bg-[var(--raised)]" /> : data.status === "error" ? <p className="text-sm text-[var(--alert)]">{data.error}</p> : <TeamState data={data} onReload={load} />}
    </section>
  );
};

export const NetworkSearch = () => {
  const [cf, setCf] = useState("");
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);
  const err = touched || cf.length === 16 ? cfError(cf) : "";
  const run = async (e) => {
    e?.preventDefault();
    setTouched(true);
    if (cfError(cf)) return;
    setBusy(true);
    try { setData(await api.teamSearch(cf)); } catch (x) { setData({ status: "error", error: errMsg(x) }); }
    setBusy(false);
  };
  const reload = () => api.teamView(data.ref).then(setData).catch(() => {});
  return (
    <section className="mx-5 rounded-[28px] border border-[var(--hair)] bg-[var(--surface)] p-5 sm:p-6 lg:mx-8" data-testid="team-network-search">
      <div className="font-display text-2xl text-[var(--fg)]">Cerca nella rete MantMed</div>
      <p className="mt-1 text-sm text-[var(--fg2)]">Paziente seguito da un collega? Inserisca il codice fiscale per verificare la delega del genitore o richiederla.</p>
      <form onSubmit={run} className="mt-4 flex flex-col gap-2 sm:flex-row">
        <label className="relative flex-1"><Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--fg2)]" />
          <input value={cf} onChange={(e) => { setCf(e.target.value.toUpperCase().replace(/\s/g, "").slice(0, 16)); setData(null); }} onBlur={() => cf && setTouched(true)} placeholder="Codice fiscale del bambino"
            className={`h-12 w-full rounded-full border pl-11 pr-4 font-mono text-sm uppercase outline-none ${err ? "border-[var(--alert)]" : "border-[var(--hair)] focus:border-[var(--accent)]"}`} data-testid="team-search-input" /></label>
        <button disabled={busy} className="flex h-12 items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-6 text-sm font-medium text-[var(--ink)] disabled:opacity-60" data-testid="team-search-btn">{busy ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />} Verifica</button>
      </form>
      {err && <p className="mt-2 text-xs text-[var(--alert)]" data-testid="team-search-error">{err}</p>}
      {data && <div className="mt-5">{data.status === "error" ? <p className="text-sm text-[var(--alert)]" data-testid="team-search-fail">{data.error}</p> : <TeamState data={data} onReload={reload} />}</div>}
    </section>
  );
};
