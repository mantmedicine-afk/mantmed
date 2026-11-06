import { useState } from "react";
import { toast } from "sonner";
import { CalendarClock, Plane, Trash2, Plus, Loader2, Clock } from "lucide-react";
import { ScheduleDialog } from "@/components/dash/ScheduleDialog";
import { api, errMsg } from "@/lib/api";
import { Card, Field, inp, day } from "./ui";
import { DateInput } from "@/components/ui/it-date";

const today = () => new Date().toLocaleDateString("sv-SE");

export const AvailabilitySection = ({ data, onSaved }) => {
  const [sched, setSched] = useState(false);
  const [f, setF] = useState({ from: today(), to: today(), reason: "" });
  const [busy, setBusy] = useState("");
  const items = Array.isArray(data.absences) ? data.absences : [];
  const run = async (key, fn, msg) => {
    setBusy(key);
    try { onSaved({ ...data, absences: await fn() }); toast.success(msg); } catch (e) { toast.error(errMsg(e)); }
    setBusy("");
  };
  const add = (e) => { e.preventDefault(); run("add", () => api.addAbsence(f), "Periodo di assenza aggiunto: il portale non mostra orari in quei giorni"); };
  return (
    <div className="space-y-5">
      <Card id="account-hours" icon={CalendarClock} title="Orari e disponibilità" text="Sedi, giorni lavorativi e orari di ricevimento per sede, prestazioni con durata media e tariffe. Il Portale Paziente propone solo gli orari liberi."
        action={<button onClick={() => setSched(true)} className="flex h-10 items-center gap-2 rounded-full bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--ink)] transition-transform hover:-translate-y-0.5" data-testid="account-open-schedule"><Clock size={15} /> Configura orari</button>}>
        <ScheduleDialog open={sched} onClose={() => setSched(false)} />
        <p className="text-xs text-[var(--fg2)]">Le modifiche si applicano subito all'agenda e alle prenotazioni online.</p>
      </Card>
      <Card id="account-absences" icon={Plane} title="Ferie e assenze" text="Nei periodi indicati il Portale Paziente non mostra orari prenotabili e la dashboard li segnala.">
        <form onSubmit={add} className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_1.4fr_auto] sm:items-end">
          <Field label="Dal"><DateInput required min={today()} value={f.from} onChange={(e) => { const v = e.target.value; setF((x) => ({ ...x, from: v, to: v && v > x.to ? v : x.to })); }} className={inp} data-testid="absence-from" /></Field>
          <Field label="Al"><DateInput required min={f.from} value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} className={inp} data-testid="absence-to" /></Field>
          <Field label="Motivo (facoltativo)"><input maxLength={120} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder="Ferie, congresso…" className={inp} data-testid="absence-reason" /></Field>
          <button disabled={!!busy} className="flex h-11 items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--ink)] disabled:opacity-60" data-testid="absence-add-btn">{busy === "add" ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Aggiungi</button>
        </form>
        <ul className="mt-5 space-y-2" data-testid="absence-list">
          {items.length === 0 && <li className="text-sm text-[var(--fg2)]" data-testid="absence-empty">Nessuna assenza in programma.</li>}
          {items.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-[var(--raised)] p-4" data-testid={`absence-${a.id}`}>
              <div><div className="font-medium text-[var(--fg)]">{a.from === a.to ? day(a.from) : `${day(a.from)} → ${day(a.to)}`}</div>{a.reason && <div className="text-xs text-[var(--fg2)]">{a.reason}</div>}</div>
              <button onClick={() => run(a.id, () => api.deleteAbsence(a.id), "Assenza rimossa")} disabled={!!busy} className="grid h-9 w-9 place-items-center rounded-full border border-[var(--hair)] text-[var(--alert)] hover:border-[var(--alert)]" aria-label="Rimuovi assenza" data-testid={`absence-delete-${a.id}`}>{busy === a.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}</button>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
};
