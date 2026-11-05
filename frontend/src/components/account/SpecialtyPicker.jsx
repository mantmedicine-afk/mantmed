import { useState } from "react";
import { Check } from "lucide-react";
import { useModules } from "@/lib/modules";

const lbl = "mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--fg2)]";
const OTHER = "__altra__";

// Specialità principale (decide la cartella delle nuove visite) + fino a 3 secondarie (selezionabili all'inizio della visita)
export const SpecialtyPicker = ({ main, secondary = [], onChange, inputClass, error, testPrefix = "specialty" }) => {
  const cat = useModules();
  const list = cat?.specialita ?? [];
  const [custom, setCustom] = useState(Boolean(main) && list.length > 0 && !list.includes(main));
  const isCustom = custom || (Boolean(main) && list.length > 0 && !list.includes(main));
  const toggle = (s) => onChange(main, secondary.includes(s) ? secondary.filter((x) => x !== s) : secondary.length < 3 ? [...secondary, s] : secondary);
  return (
    <div className="space-y-4 sm:col-span-2" data-testid={`${testPrefix}-picker`}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className={lbl}>Specializzazione principale</span>
          <select name="specialty" value={isCustom ? OTHER : main} onChange={(e) => { const v = e.target.value; setCustom(v === OTHER); onChange(v === OTHER ? "" : v, secondary.filter((x) => x !== v)); }}
            className={inputClass} aria-invalid={Boolean(error)} data-testid={`${testPrefix}-main`}>
            <option value="">Scelga…</option>
            {list.map((s) => <option key={s} value={s}>{s}</option>)}
            <option value={OTHER}>Altra specialità…</option>
          </select>
        </label>
        {isCustom && (
          <label className="block">
            <span className={lbl}>Quale?</span>
            <input value={main} onChange={(e) => onChange(e.target.value, secondary)} placeholder="es. Angiologia" className={inputClass} data-testid={`${testPrefix}-main-other`} />
          </label>
        )}
      </div>
      {error && <p className="text-xs text-[var(--alert)]" role="alert" data-testid={`${testPrefix}-error`}>{error}</p>}
      <div>
        <span className={lbl}>Specialità secondarie <span className="normal-case tracking-normal">· facoltative, max 3</span></span>
        <div className="flex flex-wrap gap-2">
          {list.filter((s) => s !== main).map((s) => {
            const on = secondary.includes(s);
            return (
              <button key={s} type="button" onClick={() => toggle(s)} aria-pressed={on} className={`flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs transition-colors ${on ? "border-[var(--accent)] bg-[var(--accent)] font-semibold text-[var(--ink)]" : "border-[var(--hair)] text-[var(--fg2)] hover:border-[var(--accent)]"}`} data-testid={`${testPrefix}-secondary-${s}`}>
                {on && <Check size={12} />}{s}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-[var(--fg2)]">La principale decide la cartella delle nuove visite; le secondarie si possono scegliere dal menu all'inizio di ogni visita.</p>
      </div>
    </div>
  );
};
