import { AlertCircle } from "lucide-react";

export const box = "rounded-2xl border border-[var(--hair)] bg-[var(--raised)] focus-within:border-[var(--accent)]";
export const lbl = "text-xs font-semibold uppercase tracking-[0.18em] text-[var(--fg2)]";
export const pill = (on) => `rounded-full border px-3.5 py-1.5 text-sm transition-colors ${on ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--ink)]" : "border-[var(--hair)] text-[var(--fg)] hover:border-[var(--accent)]"}`;
export const num = (s) => (s === "" || s == null ? null : Number(String(s).replace(",", ".")));
export const out = (v, lo, hi) => v != null && !Number.isNaN(v) && (v < lo || v > hi);

export const Verify = ({ id, text = "Da verificare" }) => <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-[var(--late-bg)] px-2 py-0.5 text-[11px] font-semibold text-[var(--late)]" data-testid={`module-verify-${id}`}><AlertCircle size={11} /> {text}</span>;

// Controllo di plausibilità: solo errori di battitura/trascrizione, nessun giudizio clinico
export const Plausible = ({ id, value, unit, onKeep, onFix }) => (
  <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-[var(--late)] bg-[var(--late-bg)] px-3 py-2 text-sm text-[var(--late)]" role="alert" data-testid={`module-plausibility-${id}`}>
    <span>Valore insolito, forse un errore di battitura: conferma {String(value).replace(".", ",")}{unit ? ` ${unit}` : ""}?</span>
    <button type="button" onClick={onKeep} className="rounded-full bg-[var(--surface)] px-3 py-1 text-xs font-semibold text-[var(--fg)]" data-testid={`module-plausibility-keep-${id}`}>Confermo</button>
    <button type="button" onClick={onFix} className="rounded-full border border-[var(--late)] px-3 py-1 text-xs font-semibold" data-testid={`module-plausibility-fix-${id}`}>Correggi</button>
  </div>
);
