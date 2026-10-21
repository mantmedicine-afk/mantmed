import { AlertCircle, Check, Loader2 } from "lucide-react";

const base = "h-12 w-full rounded-xl border bg-white/5 px-4 text-sm text-white outline-none transition-colors placeholder:text-slate-400 focus:bg-white/10";

export const FieldMsg = ({ id, error, ok, busy }) => {
  if (busy) return <p className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-300" data-testid={`${id}-checking`}><Loader2 size={12} className="animate-spin" /> {busy}</p>;
  if (error) return <p role="alert" className="mt-1.5 flex items-start gap-1.5 text-xs text-rose-300" data-testid={`${id}-error`}><AlertCircle size={12} className="mt-px shrink-0" /> {error}</p>;
  if (ok) return <p className="mt-1.5 flex items-center gap-1.5 text-xs text-emerald-300" data-testid={`${id}-ok`}><Check size={12} /> {ok}</p>;
  return null;
};

export const RegisterField = ({ name, label, error, ok, busy, wide, className = "", children, ...props }) => (
  <label className={wide ? "sm:col-span-2" : ""}>
    <span className="mb-1.5 block text-[11px] uppercase tracking-[0.16em] text-[#C9CCD3]">{label}</span>
    {children || (
      <input name={name} aria-invalid={!!error} className={`${base} ${error ? "border-rose-400/70" : ok ? "border-emerald-400/50" : "border-white/15 focus:border-[#C9CCD3]"} ${className}`}
        data-testid={`register-${name}-input`} {...props} />
    )}
    <FieldMsg id={`register-${name}`} error={error} ok={ok} busy={busy} />
  </label>
);
