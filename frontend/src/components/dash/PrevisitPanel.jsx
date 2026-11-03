import { ClipboardList, AlertTriangle } from "lucide-react";

/** Questionario pre-visita (genitori o studio, ultimi 30 giorni) mostrato nella cartella del bilancio. */
export const PrevisitPanel = ({ pv }) => {
  if (!pv) return null;
  const flags = pv.flags ?? [];
  return (
    <details className="mt-5 rounded-3xl border border-[var(--hair)] bg-[var(--raised)] p-5" data-testid="note-previsit-panel">
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2"><ClipboardList size={16} className="text-[var(--accent)]" /><span className="font-display text-xl text-[var(--fg)]">Questionario pre-visita</span></span>
        <span className="text-xs text-[var(--fg2)]" data-testid="note-previsit-meta">{pv.source === "portale" ? "Compilato dai genitori nel Portale" : "Compilato in studio"} · {new Date(pv.created_at).toLocaleDateString("it-IT")} · {pv.band_label}{flags.length ? ` · ${flags.length} da approfondire` : ""}</span>
      </summary>
      {flags.length > 0 && (
        <div className="mt-4 space-y-1.5">
          {flags.map((f) => <div key={f.id} className="flex items-start gap-2 rounded-xl bg-[var(--sel)] px-3 py-2 text-sm text-[var(--fg)]" data-testid={`note-previsit-flag-${f.id}`}><AlertTriangle size={14} className="mt-0.5 shrink-0" /><span><strong>{f.question}</strong> — {f.answer}. <span className="text-[var(--fg)]">{f.tip}</span></span></div>)}
        </div>
      )}
      <ul className="mt-4 grid gap-1.5 sm:grid-cols-2">
        {(pv.answers ?? []).map((a) => <li key={a.question} className="rounded-xl bg-[var(--surface)] px-3 py-2 text-sm text-[var(--fg2)] ring-1 ring-[var(--hair)]"><span className="text-[11px] uppercase tracking-[0.14em] text-[var(--fg2)]">{a.area}</span><div>{a.question} <strong className={a.ok ? "text-[var(--fg)]" : "text-[var(--fg)]"}>{a.answer}</strong></div></li>)}
      </ul>
      <p className="mt-3 text-xs text-[var(--fg2)]">L'IA ha usato queste risposte per precompilare i campi del bilancio, indicando "riferito dai genitori".</p>
    </details>
  );
};
