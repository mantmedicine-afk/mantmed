import { useState } from "react";
import { toast } from "sonner";
import { Eye, EyeOff, FileDown, Loader2, HeartPulse, CalendarHeart } from "lucide-react";
import { errMsg } from "@/lib/api";
import { Label, Empty, card, day } from "./ui";

const Btn = ({ onClick, children, testId }) => {
  const [busy, setBusy] = useState(false);
  const run = async () => { setBusy(true); try { await onClick(); } catch (e) { toast.error(errMsg(e)); } setBusy(false); };
  return <button onClick={run} disabled={busy} className="flex h-10 items-center gap-2 rounded-full border border-[var(--hair)] px-4 text-sm font-medium text-[var(--fg)] transition-colors hover:border-[var(--accent)] disabled:opacity-60" data-testid={testId}>{busy && <Loader2 size={14} className="animate-spin" />}{children}</button>;
};

export const VisitsTimeline = ({ items, onPdf, onHide }) => (
  <section className="space-y-2" data-testid="passport-visits">
    {!items.length && <Empty text="Nessuna visita pubblicata nel passaporto." testId="passport-visits-empty" />}
    {items.map((v) => (
      <article key={v.id} className={`${card} flex flex-wrap items-start justify-between gap-3 ${v.hidden ? "opacity-60" : ""}`} data-testid={`passport-visit-${v.id}`}>
        <div className="min-w-0">
          <div className="text-xs text-[var(--fg2)]">{day(v.date)} · {v.doctor}{v.clinic ? ` · ${v.clinic}` : ""}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-lg font-semibold text-[var(--fg)]">{v.type}{v.module && <span className="rounded-full bg-[var(--sel)] px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--fg)]" data-testid={`passport-visit-module-${v.id}`}>{v.module}</span>}</div>
          {v.diagnosis && <div className="text-sm text-[var(--fg2)]"><span className="font-medium text-[var(--fg)]">Diagnosi:</span> {v.diagnosis}</div>}
          <div className="mt-1 text-xs text-[var(--fg2)]">Inserito da {v.by} · firmato il {day(v.at)}</div>
          {v.hidden && <div className="mt-1 text-xs font-medium text-[var(--late)]" data-testid={`passport-visit-hidden-${v.id}`}>Nascosto: non compare nelle condivisioni</div>}
        </div>
        <div className="flex flex-wrap gap-2">
          {onPdf && <Btn onClick={() => onPdf(v.id)} testId={`passport-visit-pdf-${v.id}`}><FileDown size={14} /> Referto PDF</Btn>}
          {onHide && <Btn onClick={() => onHide(v)} testId={`passport-visit-hide-${v.id}`}>{v.hidden ? <><Eye size={14} /> Mostra</> : <><EyeOff size={14} /> Nascondi</>}</Btn>}
        </div>
      </article>
    ))}
  </section>
);

export const Bilanci = ({ b }) => (
  <section className="grid gap-3 md:grid-cols-2" data-testid="passport-bilanci">
    <div className="rounded-3xl bg-[var(--sel)] p-5" data-testid="passport-bilanci-next">
      <Label icon={CalendarHeart}>Prossimo bilancio previsto</Label>
      <div className="mt-2 text-xl font-semibold text-[var(--fg)]">{b.next ? b.next.name : "Nessun altro bilancio previsto"}</div>
      {b.next && <div className="text-sm text-[var(--fg2)]">a partire dal {day(b.next.from)}</div>}
    </div>
    <div className={card}>
      <Label icon={HeartPulse}>Bilanci eseguiti</Label>
      {b.done.length ? <ul className="mt-2 space-y-2">{b.done.map((x) => <li key={x.id} data-testid={`passport-bilancio-${x.id}`}><div className="font-medium text-[var(--fg)]">{x.name}</div><div className="text-xs text-[var(--fg2)]">Inserito da {x.by} · {day(x.date)}</div></li>)}</ul>
        : <p className="mt-2 text-sm text-[var(--fg2)]">Nessun bilancio di salute registrato.</p>}
    </div>
  </section>
);
