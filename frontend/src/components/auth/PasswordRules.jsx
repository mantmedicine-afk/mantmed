import { Check, X } from "lucide-react";

export const RULES = [
  { id: "len", label: "Almeno 10 caratteri", test: (p) => p.length >= 10 },
  { id: "letter", label: "Almeno una lettera", test: (p) => /[A-Za-z]/.test(p) },
  { id: "digit", label: "Almeno un numero", test: (p) => /\d/.test(p) },
  { id: "special", label: "Almeno un carattere speciale (es. ! ? # -)", test: (p) => /[^A-Za-z0-9]/.test(p) },
];
export const isStrong = (p) => RULES.every((r) => r.test(p));
const BAR = ["bg-rose-400", "bg-amber-400", "bg-amber-300", "bg-emerald-500"];

export const Strength = ({ pw, dark = true, prefix = "reset" }) => {
  const ok = RULES.filter((r) => r.test(pw)).length;
  return (
    <div data-testid={`${prefix}-strength`}>
      <div className="mt-3 grid grid-cols-4 gap-1.5">{RULES.map((r, i) => <span key={r.id} className={`h-1.5 rounded-full transition-colors ${i < ok ? BAR[ok - 1] : dark ? "bg-white/10" : "bg-slate-200"}`} />)}</div>
      <ul className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {RULES.map((r) => {
          const pass = r.test(pw);
          const cls = pass ? (dark ? "text-emerald-300" : "text-emerald-700") : (dark ? "text-slate-300" : "text-slate-600");
          return <li key={r.id} className={`flex items-center gap-1.5 text-xs ${cls}`} data-testid={`${prefix}-rule-${r.id}`} data-pass={pass}>{pass ? <Check size={13} /> : <X size={13} />} {r.label}</li>;
        })}
      </ul>
    </div>
  );
};
