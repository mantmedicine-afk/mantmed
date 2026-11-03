import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { FlaskConical, FileText, Timer, MessageSquareText, Star, MessageSquarePlus } from "lucide-react";
import { api } from "@/lib/api";

const SCOPES = [{ id: "mine", label: "I miei dati" }, { id: "all", label: "Tutti i tester" }];
const num = (v) => (Number(v) || 0).toLocaleString("it-IT", { maximumFractionDigits: 1 });

const Kpi = ({ icon: Icon, label, value, unit, sub, dark, testid }) => (
  <div className={`relative overflow-hidden rounded-3xl p-5 ${dark ? "grain bg-[var(--accent)] text-[var(--ink)]" : "border border-[var(--hair)] bg-[var(--surface)] text-[var(--fg)]"}`} data-testid={testid}>
    <div className={`relative flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] ${dark ? "text-[var(--fg2)]" : "text-[var(--fg2)]"}`}><Icon size={14} /> {label}</div>
    <div className="relative mt-2 font-display text-5xl leading-none" data-testid={`${testid}-value`}>{value}<span className="ml-1 text-xl">{unit}</span></div>
    <div className={`relative mt-2 text-xs ${dark ? "text-[var(--fg2)]" : "text-[var(--fg2)]"}`}>{sub}</div>
  </div>
);

const Daily = ({ days }) => {
  const max = Math.max(1, ...days.map((d) => d.count));
  return (
    <div className="rounded-3xl border border-[var(--hair)] bg-[var(--surface)] p-5" data-testid="beta-daily">
      <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--fg2)]">Referti · ultimi 14 giorni</div>
      <div className="mt-4 flex h-32 items-end gap-1.5">
        {days.map((d) => (
          <div key={d.date} className="flex h-full flex-1 flex-col justify-end" title={`${new Date(`${d.date}T12:00:00`).toLocaleDateString("it-IT", { day: "numeric", month: "short" })}: ${d.count}`}>
            <motion.div initial={{ height: 0 }} animate={{ height: `${Math.max(4, (d.count / max) * 100)}%` }} transition={{ duration: 0.7 }} className={`rounded-t-md ${d.count ? "bg-[var(--accent)]" : "bg-[var(--raised)]"}`} />
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between font-mono text-[11px] text-[var(--fg2)]"><span>{days[0]?.date.slice(5).split("-").reverse().join("/")}</span><span>oggi</span></div>
    </div>
  );
};

const Areas = ({ areas }) => {
  const max = Math.max(1, ...areas.map((a) => a.count));
  return (
    <div className="rounded-3xl border border-[var(--hair)] bg-[var(--surface)] p-5" data-testid="beta-areas">
      <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--fg2)]">Segnalazioni per area</div>
      {areas.map((a) => (
        <div key={a.area} className="mt-3" data-testid={`beta-area-${a.area}`}>
          <div className="flex justify-between text-sm text-[var(--fg)]"><span>{a.label}</span><span className="font-mono text-xs text-[var(--fg2)]">{a.count}{a.count ? ` · ${num(a.avg_rating)}★` : ""}</span></div>
          <div className="mt-1.5 h-1.5 rounded-full bg-[var(--raised)]"><motion.div className="h-full rounded-full bg-[var(--accent)]" initial={{ width: 0 }} animate={{ width: `${(a.count / max) * 100}%` }} transition={{ duration: 0.8 }} /></div>
        </div>
      ))}
    </div>
  );
};

const Recent = ({ items, onFeedback }) => (
  <div className="rounded-3xl border border-[var(--hair)] bg-[var(--surface)] p-5" data-testid="beta-recent">
    <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--fg2)]">Ultime segnalazioni</div>
    {items.length === 0 && (
      <div className="mt-4 text-sm text-[var(--fg2)]">Nessuna segnalazione ancora.
        <button onClick={onFeedback} className="ml-1 font-medium text-[var(--fg)] underline underline-offset-4" data-testid="beta-empty-feedback-btn">Invii la prima</button>
      </div>
    )}
    {items.map((f) => (
      <div key={f.id} className="mt-3 border-b border-[var(--hair)] pb-3 last:border-0" data-testid={`beta-feedback-${f.id}`}>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--fg2)]">
          <span className="flex items-center gap-1 text-[var(--fg)]">{[1, 2, 3, 4, 5].map((n) => <Star key={n} size={12} className={n <= f.rating ? "fill-[var(--accent)] text-[var(--fg)]" : "text-[var(--fg2)]"} />)}<span className="ml-2 font-medium">{f.area_label}</span></span>
          <span>{f.mine ? "Lei" : f.doctor_name} · {new Date(f.created_at).toLocaleString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
        </div>
        {f.text && <p className="mt-1 line-clamp-3 text-sm text-[var(--fg)]">{f.text}</p>}
      </div>
    ))}
  </div>
);

export const BetaMetrics = ({ refreshKey, onFeedback }) => {
  const [data, setData] = useState(null);
  const [scope, setScope] = useState("mine");
  useEffect(() => {
    api.betaMetrics().then(setData).catch(() => setData(null));
  }, [refreshKey]);
  if (!data) return null;
  const s = data[scope] ?? {};
  return (
    <section className="mx-auto max-w-[1440px] px-5 pb-10 lg:px-8" data-testid="beta-metrics">
      <div className="flex flex-col gap-4 border-t border-[var(--hair)] pt-8 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-[var(--fg2)]"><FlaskConical size={13} /> Programma Beta · validazione sul campo</div>
          <h2 className="mt-1 font-display text-4xl text-[var(--fg)]">Metriche <span className="italic text-[var(--fg2)]">di utilizzo</span></h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="grid grid-cols-2 gap-1 rounded-full bg-[var(--surface)] p-1 ring-1 ring-[var(--hair)]" role="tablist">
            {SCOPES.map((o) => (
              <button key={o.id} role="tab" aria-selected={scope === o.id} onClick={() => setScope(o.id)} className={`relative h-9 rounded-full px-4 text-sm font-medium transition-colors ${scope === o.id ? "text-[var(--ink)]" : "text-[var(--fg2)] hover:text-[var(--fg)]"}`} data-testid={`beta-scope-${o.id}`}>
                {scope === o.id && <motion.span layoutId="beta-scope-pill" className="absolute inset-0 rounded-full bg-[var(--accent)]" transition={{ type: "spring", stiffness: 400, damping: 32 }} />}
                <span className="relative">{o.label}</span>
              </button>
            ))}
          </div>
          <button onClick={onFeedback} className="flex h-11 items-center gap-2 rounded-full bg-[var(--accent)] px-5 text-sm font-medium text-[var(--ink)] transition-transform hover:-translate-y-0.5" data-testid="beta-feedback-btn"><MessageSquarePlus size={15} /> Invia feedback</button>
        </div>
      </div>
      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi dark icon={FileText} label="Referti generati" value={num(s.reports)} sub={`${num(s.pdf_exports)} PDF scaricati o inviati`} testid="beta-kpi-reports" />
        <Kpi icon={Timer} label="Tempo risparmiato" value={num(s.avg_saved_min)} unit="min" sub={`Media per visita · ${num(s.total_saved_min)} min in totale`} testid="beta-kpi-saved" />
        <Kpi icon={MessageSquareText} label="Segnalazioni" value={num(s.feedback)} sub={scope === "all" ? `${num(data.all?.testers)} medici tester` : "Inviate da lei"} testid="beta-kpi-feedback" />
        <Kpi icon={Star} label="Usabilità media" value={s.avg_rating ? num(s.avg_rating) : "—"} unit={s.avg_rating ? "/5" : ""} sub="Valutazione a stelle dei tester" testid="beta-kpi-rating" />
      </div>
      <p className="mt-3 text-xs text-[var(--fg2)]" data-testid="beta-method-note">
        Stima: {data.baseline_min} min di refertazione manuale meno il tempo reale in app (generazione AI + revisione fino all'ultimo salvataggio, PDF o invio) · media in app {num(s.avg_app_min)} min su {num(s.timed_reports)} visite misurate.
      </p>
      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Daily days={Array.isArray(data.daily) ? data.daily : []} />
        <Areas areas={Array.isArray(data.by_area) ? data.by_area : []} />
        <Recent items={Array.isArray(data.recent) ? data.recent : []} onFeedback={onFeedback} />
      </div>
    </section>
  );
};
