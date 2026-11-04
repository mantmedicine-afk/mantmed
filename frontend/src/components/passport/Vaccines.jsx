import { Syringe, CalendarClock, AlertCircle } from "lucide-react";
import { Label, Meta, Empty, card, day } from "./ui";

export const Vaccines = ({ v }) => (
  <section className="space-y-3" data-testid="passport-vaccines">
    <div className="grid gap-3 md:grid-cols-2">
      <div className={card}>
        <Label icon={Syringe}>Vaccinazioni eseguite</Label>
        {v.done.length ? <ul className="mt-2 divide-y divide-[var(--sel)]">{v.done.map((x) => (
          <li key={x.id} className="py-2" data-testid={`passport-vaccine-done-${x.id}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2"><span className="font-medium text-[var(--fg)]">{x.name}</span><span className="text-sm text-[var(--fg2)]">dose {x.dose} · {day(x.date)}</span></div>
            <Meta by={x.by} at={x.at} />
          </li>
        ))}</ul> : <div className="mt-2"><Empty text="Nessuna vaccinazione registrata dai medici in MantMed." testId="passport-vaccines-empty" /></div>}
      </div>
      <div className={card}>
        <Label icon={CalendarClock}>Prossime in scadenza</Label>
        {v.upcoming.length ? <ul className="mt-2 space-y-2">{v.upcoming.map((x) => (
          <li key={`${x.code}-${x.dose}`} className="flex flex-wrap items-baseline justify-between gap-2 rounded-2xl bg-[var(--raised)] px-4 py-3" data-testid={`passport-vaccine-next-${x.code}-${x.dose}`}>
            <span className="text-sm font-medium text-[var(--fg)]">{x.name} · dose {x.dose}</span><span className="text-sm text-[var(--fg2)]">dal {day(x.due)}</span>
          </li>
        ))}</ul> : <p className="mt-2 text-sm text-[var(--fg2)]">Nessuna vaccinazione prevista a breve.</p>}
        {v.to_check?.length > 0 && <p className="mt-3 flex gap-2 text-xs text-[var(--late)]" data-testid="passport-vaccines-check"><AlertCircle size={14} className="shrink-0" /> {v.to_check.length} {v.to_check.length === 1 ? "dose prevista non risulta registrata" : "dosi previste non risultano registrate"}: verificate con il pediatra o con il libretto vaccinale.</p>}
        <p className="mt-3 text-xs text-[var(--fg2)]">Scadenze indicative secondo il calendario vaccinale nazionale: la data esatta la conferma il pediatra o il centro vaccinale.</p>
      </div>
    </div>
  </section>
);
