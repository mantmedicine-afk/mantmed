import { Check, Trash2, Sparkles } from "lucide-react";

// Voci aggiunte da MantAI fuori dai campi del modulo: da confermare o cancellare; nel referto solo quelle confermate
export const AltreVoci = ({ sezioni, setSection, delSection, processing }) => {
  const items = (sezioni ?? []).map((x, i) => ({ ...x, i })).filter((x) => x.gruppo === "altre_voci");
  if (!items.length || processing) return null;
  return (
    <div className="mt-6 rounded-3xl border border-[var(--hair)] bg-[var(--raised)] p-5" data-testid="altre-voci">
      <div className="text-[11px] uppercase tracking-[0.22em] text-[var(--fg2)]">Altre voci</div>
      <p className="mt-1 text-xs text-[var(--fg2)]">Informazioni dette in visita senza un campo dedicato. Nel referto compaiono solo quelle confermate.</p>
      <div className="mt-4 space-y-3">
        {items.map((x) => (
          <div key={x.i} className="rounded-2xl border border-[var(--hair)] bg-[var(--surface)] p-3" data-testid={`altra-voce-${x.i}`}>
            <div className="flex flex-wrap items-center gap-2">
              <input value={x.titolo} onChange={(e) => setSection(x.i, { titolo: e.target.value })} className="min-w-0 flex-1 bg-transparent text-xs font-semibold uppercase tracking-[0.18em] text-[var(--fg2)] outline-none" aria-label="Titolo della voce" data-testid={`altra-voce-title-${x.i}`} />
              {x.da_verificare ? (
                <>
                  <span className="inline-flex items-center gap-1 rounded-full bg-[var(--late-bg)] px-2 py-0.5 text-[11px] font-semibold text-[var(--late)]" data-testid={`altra-voce-pending-${x.i}`}><Sparkles size={11} /> Da verificare</span>
                  <button onClick={() => setSection(x.i, { da_verificare: false })} className="flex h-8 items-center gap-1 rounded-full bg-[var(--accent)] px-3 text-xs font-semibold text-[var(--ink)]" data-testid={`altra-voce-confirm-${x.i}`}><Check size={13} /> Conferma</button>
                </>
              ) : <span className="text-[11px] font-semibold text-[var(--ok)]" data-testid={`altra-voce-confirmed-${x.i}`}>Confermata</span>}
              <button onClick={() => delSection(x.i)} className="grid h-8 w-8 place-items-center rounded-full text-[var(--fg2)] hover:text-[var(--alert)]" aria-label="Cancella voce" data-testid={`altra-voce-del-${x.i}`}><Trash2 size={14} /></button>
            </div>
            <textarea value={x.testo} onChange={(e) => setSection(x.i, { testo: e.target.value })} rows={2} className="mt-2 w-full resize-y rounded-xl border border-[var(--hair)] bg-[var(--raised)] px-3 py-2 text-[15px] outline-none focus:border-[var(--accent)]" data-testid={`altra-voce-text-${x.i}`} />
          </div>
        ))}
      </div>
    </div>
  );
};
