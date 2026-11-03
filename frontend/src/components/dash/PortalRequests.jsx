import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, X, Loader2, Inbox, CalendarDays, Clock } from "lucide-react";
import { api, errMsg, eur } from "@/lib/api";
import { ScheduleDialog } from "@/components/dash/ScheduleDialog";

const day = (d) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" }) : "Oggi");
const inp = "h-9 rounded-full border border-[var(--hair)] bg-[var(--surface)] px-3 text-sm text-[var(--fg)] outline-none focus:border-[var(--accent)]";

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
    <div className="rounded-2xl border border-[var(--hair)] bg-[var(--sel)] p-4" data-testid={`appt-request-${r.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><div className="font-medium text-[var(--fg)]">{r.patient_name}</div><div className="text-xs text-[var(--fg2)]">{r.service} · {r.clinic} · da {r.parent_name}</div></div>
        <span className="rounded-full bg-[var(--sel)] px-3 py-1 text-[11px] font-semibold text-[var(--fg)]">In attesa di conferma</span>
      </div>
      {r.note && <p className="mt-2 text-sm text-[var(--fg)]">{r.note}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input type="date" value={d} onChange={(e) => setD(e.target.value)} className={inp} data-testid={`appt-request-date-${r.id}`} />
        <input type="time" value={t} onChange={(e) => setT(e.target.value)} className={inp} data-testid={`appt-request-time-${r.id}`} />
        <button onClick={() => act("ok")} disabled={!!busy} className="flex h-9 items-center gap-1.5 rounded-full bg-[var(--accent)] px-4 text-xs font-semibold text-[var(--ink)] disabled:opacity-50" data-testid={`appt-request-confirm-${r.id}`}>{busy === "ok" ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Conferma</button>
        <button onClick={() => act("no")} disabled={!!busy} className="flex h-9 items-center gap-1.5 rounded-full border border-[var(--hair)] bg-[var(--surface)] px-4 text-xs font-medium text-[var(--fg)] hover:border-[var(--accent)] disabled:opacity-50" data-testid={`appt-request-decline-${r.id}`}><X size={13} /> Rifiuta</button>
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
      <div className="grid grid-cols-1 gap-6 border-t border-[var(--hair)] pt-8 lg:grid-cols-2">
        <div>
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-[var(--fg2)]"><Inbox size={13} /> Portale Paziente</div>
          <h2 className="mt-1 font-display text-4xl text-[var(--fg)]">Richieste <span className="italic text-[var(--fg2)]">di appuntamento</span> <span className="align-middle font-mono text-sm text-[var(--fg2)]" data-testid="appt-requests-count">{pending.length}</span></h2>
          <div className="mt-5 space-y-2">
            {pending.length === 0 && <p className="text-sm text-[var(--fg2)]" data-testid="appt-requests-empty">Nessuna richiesta in attesa di conferma.</p>}
            {pending.map((r) => <RequestCard key={r.id} r={r} onDone={done} />)}
          </div>
          {cancelled.length > 0 && (
            <div className="mt-6" data-testid="cancellations-list">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--alert)]">Annullate dal genitore · ultimi 7 giorni</div>
              <div className="mt-2 space-y-2">
                {cancelled.map((c) => (
                  <div key={c.id} className="rounded-2xl border border-[var(--alert)] bg-[var(--alert-bg)] p-3 text-sm" data-testid={`cancellation-${c.id}`}>
                    <div className="flex flex-wrap justify-between gap-2"><span className="font-medium text-[var(--fg)]">{c.patient_name}</span><span className="font-mono text-xs capitalize text-[var(--fg2)]">{day(c.date)} · {c.time} · {c.clinic}</span></div>
                    <div className="text-xs text-[var(--fg2)]">{c.visit_type} · orario tornato libero{c.reason ? ` · Motivo: ${c.reason}` : ""}</div>
                    {c.refunded ? <div className="mt-1 text-xs font-medium text-[var(--alert)]" data-testid={`cancellation-refund-${c.id}`}>Pagamento online di {eur(c.refunded)} rimborsato in automatico</div> : null}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-[var(--fg2)]"><CalendarDays size={13} /> Agenda</div>
            <button onClick={() => setSched(true)} className="flex h-9 items-center gap-1.5 rounded-full border border-[var(--hair)] px-4 text-xs font-medium text-[var(--fg)] hover:border-[var(--accent)]" data-testid="schedule-open-btn"><Clock size={13} /> Orari e tariffe</button>
          </div>
          <ScheduleDialog open={sched} onClose={() => setSched(false)} />
          <h2 className="mt-1 font-display text-4xl text-[var(--fg)]">Prossimi <span className="italic text-[var(--fg2)]">giorni</span></h2>
          <div className="mt-5 space-y-2" data-testid="upcoming-list">
            {next.length === 0 && <p className="text-sm text-[var(--fg2)]">Nessun appuntamento nei prossimi giorni.</p>}
            {next.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--hair)] bg-[var(--surface)] p-4" data-testid={`upcoming-${a.id}`}>
                <div className="min-w-0"><div className="truncate font-medium text-[var(--fg)]">{a.patient_name}</div><div className="truncate text-xs text-[var(--fg2)]">{a.visit_type} · {a.clinic}</div>{a.paid_online && <span className="mt-1 inline-block rounded-full bg-[var(--sel)] px-2 py-0.5 text-[11px] font-semibold text-[var(--ok)]" data-testid={`upcoming-paid-${a.id}`}>Confermato & Pagato online</span>}</div>
                <div className="shrink-0 text-right"><div className="text-xs capitalize text-[var(--fg2)]">{day(a.date)}</div><div className="font-mono text-lg text-[var(--fg)]">{a.time}</div></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
