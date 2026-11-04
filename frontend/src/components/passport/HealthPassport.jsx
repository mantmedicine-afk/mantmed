import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Share2, RefreshCw } from "lucide-react";
import { api, errMsg } from "@/lib/api";
import { PassportBody } from "./PassportBody";
import { ShareDialog } from "./ShareDialog";
import { SharesPanel } from "./SharesPanel";
import { EmergencyCard } from "./EmergencyCard";
import { Empty, day } from "./ui";

/** Portale: Passaporto sanitario del figlio, condivisione decisa dal genitore e scheda emergenza. */
export const HealthPassport = ({ kids }) => {
  const groups = useMemo(() => Object.values(kids.reduce((m, c) => ({ ...m, [c.group]: m[c.group] ?? c }), {})), [kids]);
  const [pid, setPid] = useState(groups[0]?.patient.id);
  const [data, setData] = useState(null);
  const [shares, setShares] = useState([]);
  const [log, setLog] = useState([]);
  const [share, setShare] = useState(false);
  const load = useCallback(() => {
    if (!pid) return;
    api.portalPassport(pid).then(setData).catch((e) => toast.error(errMsg(e)));
    api.passportShares(pid).then(setShares).catch(() => setShares([]));
    api.passportAccess(pid).then(setLog).catch(() => setLog([]));
  }, [pid]);
  useEffect(() => { setData(null); load(); }, [load]);
  if (!groups.length) return <Empty text="Nessuna cartella collegata al suo account." testId="passport-no-kids" />;
  const hide = async (v) => { await api.passportHide(pid, v.id, !v.hidden); toast.success(v.hidden ? "Referto di nuovo visibile nel passaporto" : "Referto nascosto: non comparirà nelle condivisioni"); load(); };
  return (
    <section className="space-y-5" data-testid="health-passport">
      {groups.length > 1 && <div className="flex flex-wrap gap-2" data-testid="passport-kids">{groups.map((c) => <button key={c.patient.id} onClick={() => setPid(c.patient.id)} className={`rounded-full px-4 py-2 text-sm transition-colors ${c.patient.id === pid ? "bg-[var(--accent)] text-[var(--ink)]" : "bg-[var(--surface)] text-[var(--fg)] ring-1 ring-[var(--sel)]"}`} data-testid={`passport-kid-${c.patient.id}`}>{c.patient.name}</button>)}</div>}
      {!data ? <Loader2 className="animate-spin text-[var(--fg)]" /> : (
        <>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div><h2 className="text-3xl font-semibold text-[var(--fg)]" data-testid="passport-child-name">{data.child.name}</h2>
              <div className="text-sm text-[var(--fg2)]">{data.child.age_label} · {data.doctors.join(", ")}</div>
              <div className="mt-1 flex items-center gap-1.5 text-xs text-[var(--fg2)]"><RefreshCw size={12} /> Si aggiorna da solo dopo ogni visita firmata · {day(data.updated_at)}</div></div>
            <div className="flex flex-wrap gap-2">
              <EmergencyCard data={data} />
              <button onClick={() => setShare(true)} className="flex h-11 items-center gap-2 rounded-full bg-[var(--accent)] px-5 text-sm font-medium text-[var(--ink)] transition-transform hover:-translate-y-0.5" data-testid="passport-share-btn"><Share2 size={16} /> Condividi con un medico</button>
            </div>
          </div>
          <SharesPanel pid={pid} shares={shares} log={log} onChange={load} />
          <PassportBody data={data} onPdf={(id) => api.portalReport(id).then(() => toast.success("Referto scaricato"))} onHide={hide} />
          <ShareDialog pid={pid} open={share} onClose={() => setShare(false)} onCreated={load} />
        </>
      )}
    </section>
  );
};
