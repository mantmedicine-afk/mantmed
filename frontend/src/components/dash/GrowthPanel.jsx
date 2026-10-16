import { bmi, r1 } from "@/lib/pediatric";

const NUM = [
  ["eta_mesi", "Età", "mesi"],
  ["peso_kg", "Peso", "kg"],
  ["altezza_cm", "Altezza / lunghezza", "cm"],
  ["circonferenza_cranica_cm", "Circ. cranica", "cm"],
];
const PCT = [["percentile_peso", "Percentile peso"], ["percentile_altezza", "Percentile altezza"], ["percentile_cc", "Percentile circ. cranica"]];

export const GrowthPanel = ({ g, set }) => {
  const upd = (k, num) => (e) => set({ ...g, [k]: num ? (e.target.value === "" ? null : Number(e.target.value)) : e.target.value });
  const b = bmi(g);
  return (
    <div className="space-y-5" data-testid="growth-panel">
      <div className="flex gap-2">
        {[["F", "Femmina"], ["M", "Maschio"]].map(([v, l]) => (
          <button key={v} onClick={() => set({ ...g, sesso: v })} className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${g.sesso === v ? "bg-night text-white" : "border border-slate-200 text-slate-600 hover:border-night"}`} data-testid={`growth-sex-${v}`}>{l}</button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {NUM.map(([k, l, u]) => (
          <label key={k} className="rounded-2xl border border-slate-200 bg-slate-50 p-3 transition-colors focus-within:border-night focus-within:bg-white">
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{l}</span>
            <span className="mt-1 flex items-baseline gap-1">
              <input type="number" step="0.1" inputMode="decimal" value={g[k] ?? ""} onChange={upd(k, true)} className="w-full bg-transparent font-display text-4xl text-night outline-none" data-testid={`growth-${k}`} />
              <span className="text-sm text-slate-500">{u}</span>
            </span>
          </label>
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_0.8fr]">
        {PCT.map(([k, l]) => (
          <label key={k} className="block">
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{l}</span>
            <input value={g[k] ?? ""} onChange={upd(k)} placeholder="es. 50° pc" className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-night outline-none focus:border-night focus:bg-white" data-testid={`growth-${k}`} />
          </label>
        ))}
        <div className="rounded-2xl bg-night px-4 py-3 text-white" data-testid="growth-bmi">
          <div className="text-[11px] uppercase tracking-[0.16em] text-slate-300">BMI calcolato</div>
          <div className="font-display text-3xl">{r1(b)}</div>
        </div>
      </div>
      <p className="text-xs text-slate-500">I percentili si inseriscono a mano dalle curve di riferimento. Il peso guida il calcolo delle dosi nella scheda 05.</p>
    </div>
  );
};
