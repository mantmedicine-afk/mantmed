import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, X, Loader2, Inbox, CalendarDays, Clock } from "lucide-react";
import { api, errMsg } from "@/lib/api";
import { ScheduleDialog } from "@/components/dash/ScheduleDialog";

const day = (d) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" }) : "Oggi");
const inp = "h-9 rounded-full border border-slate-200 bg-white px-3 text-sm text-night outline-none focus:border-night";

const RequestCard = ({ r, onDone }) => {
  const [d, setD] = useState(r.date);
  const [t, setT] = useState(r.time);
  const [busy, setBusy] = useState("");
  const act = async (kind) => {
    setBusy(kind);
    try {
      if (kind === "ok") { await api.confirmRequest(r.id, { date: d, time: t }); toast.success("Appuntamento inserito in agenda · genitore avvisato"); }
      else { await api.declineRequest(r.id, ""); toast.success("Richiesta rifiutata · genitore avvisato"); }
      onDone();
    } catch (e) { toast.error(errMsg(e)); }
    setBusy("");
  };
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4" data-testid={`appt-request-${r.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><div className="font-medium text-night">{r.patient_name}</div><div className="text-xs text-slate-600">{r.service} · {r.clinic} · da {r.parent_name}</div></div>
        <span className="rounded-full bg-amber-100 px-3 py-1 text-[11px] font-semibold text-amber-900">In attesa di conferma</span>
      </div>
      {r.note && <p className="mt-2 text-sm text-night">{r.note}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input type="date" value={d} onChange={(e) => setD(e.target.value)} className={inp} data-testid={`appt-request-date-${r.id}`} />
        <input type="time" value={t} onChange={(e) => setT(e.target.value)} className={inp} data-testid={`appt-request-time-${r.id}`} />
        <button onClick={() => act("ok")} disabled={!!busy} className="flex h-9 items-center gap-1.5 rounded-full bg-night px-4 text-xs font-semibold text-white disabled:opacity-50" data-testid={`appt-request-confirm-${r.id}`}>{busy === "ok" ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Conferma</button>
        <button onClick={() => act("no")} disabled={!!busy} className="flex h-9 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 text-xs font-medium text-night hover:border-night disabled:opacity-50" data-testid={`appt-request-decline-${r.id}`}><X size={13} /> Rifiuta</button>
      </div>
    </div>
  );
};

export const PortalRequests = ({ onChange }) => {
  const [reqs, setReqs] = useState([]);
  const [next, setNext] = useState([]);
  const [sched, setSched] = useState(false);
  const [cancelled, setCancelled] = useState([]);
  const load = useCallback(() => {
    api.cancellations().then(setCancelled).catch(() => setCancelled([]));
    api.apptRequests().then(setReqs).catch(() => setReqs([]));
    api.upcoming().then(setNext).catch(() => setNext([]));
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  const pending = reqs.filter((r) => r.status === "pending");
  const done = () => { load(); onChange?.(); };
  return (
    <section className="mx-auto max-w-[1440px] px-5 pb-10 lg:px-8" data-testid="portal-requests">
      <div className="grid grid-cols-1 gap-6 border-t border-slate-200 pt-8 lg:grid-cols-2">
        <div>
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-slate-500"><Inbox size={13} /> Portale Paziente</div>
          <h2 className="mt-1 font-display text-4xl text-night">Richieste <span className="italic text-slate-500">di appuntamento</span> <span className="align-middle font-mono text-sm text-slate-600" data-testid="appt-requests-count">{pending.length}</span></h2>
          <div className="mt-5 space-y-2">
            {pending.length === 0 && <p className="text-sm text-slate-600" data-testid="appt-requests-empty">Nessuna richiesta in attesa di conferma.</p>}
            {pending.map((r) => <RequestCard key={r.id} r={r} onDone={done} />)}
          </div>
          {cancelled.length > 0 && (
            <div className="mt-6" data-testid="cancellations-list">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-rose-700">Annullate dal genitore · ultimi 7 giorni</div>
              <div className="mt-2 space-y-2">
                {cancelled.map((c) => (
                  <div key={c.id} className="rounded-2xl border border-rose-200 bg-rose-50/60 p-3 text-sm" data-testid={`cancellation-${c.id}`}>
                    <div className="flex flex-wrap justify-between gap-2"><span className="font-medium text-night">{c.patient_name}</span><span className="font-mono text-xs capitalize text-slate-600">{day(c.date)} · {c.time} · {c.clinic}</span></div>
                    <div className="text-xs text-slate-600">{c.visit_type} · orario tornato libero{c.reason ? ` · Motivo: ${c.reason}` : ""}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-slate-500"><CalendarDays size={13} /> Agenda</div>
            <button onClick={() => setSched(true)} className="flex h-9 items-center gap-1.5 rounded-full border border-slate-200 px-4 text-xs font-medium text-night hover:border-night" data-testid="schedule-open-btn"><Clock size={13} /> Orari studio</button>
          </div>
          <ScheduleDialog open={sched} onClose={() => setSched(false)} />
          <h2 className="mt-1 font-display text-4xl text-night">Prossimi <span className="italic text-slate-500">giorni</span></h2>
          <div className="mt-5 space-y-2" data-testid="upcoming-list">
            {next.length === 0 && <p className="text-sm text-slate-600">Nessun appuntamento nei prossimi giorni.</p>}
            {next.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4" data-testid={`upcoming-${a.id}`}>
                <div className="min-w-0"><div className="truncate font-medium text-night">{a.patient_name}</div><div className="truncate text-xs text-slate-600">{a.visit_type} · {a.clinic}</div></div>
                <div className="shrink-0 text-right"><div className="text-xs capitalize text-slate-600">{day(a.date)}</div><div className="font-mono text-lg text-night">{a.time}</div></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
