import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { bmi, r1 } from "@/lib/pediatric";

const NUM = [
  ["eta_mesi", "Età", "mesi"],
  ["peso_kg", "Peso", "kg"],
  ["altezza_cm", "Altezza / lunghezza", "cm"],
  ["circonferenza_cranica_cm", "Circ. cranica", "cm"],
];
const PCT = [["peso", "Peso per età"], ["altezza", "Altezza per età"], ["cc", "Circ. cranica per età"]];

const usePercentiles = (g) => {
  const [pct, setPct] = useState({});
  const { sesso, eta_mesi, peso_kg, altezza_cm, circonferenza_cranica_cm } = g;
  useEffect(() => {
    if (!sesso || eta_mesi == null) { setPct({}); return undefined; }
    const t = setTimeout(() => {
      api.percentiles({ sex: sesso, age_months: eta_mesi, weight: peso_kg ?? undefined, height: altezza_cm ?? undefined, hc: circonferenza_cranica_cm ?? undefined })
        .then((d) => setPct(d ?? {})).catch(() => setPct({}));
    }, 350);
    return () => clearTimeout(t);
  }, [sesso, eta_mesi, peso_kg, altezza_cm, circonferenza_cranica_cm]);
  return pct;
};

export const GrowthPanel = ({ g, set }) => {
  const upd = (k) => (e) => set({ ...g, [k]: e.target.value === "" ? null : Number(e.target.value) });
  const pct = usePercentiles(g);
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
              <input type="number" step="0.1" inputMode="decimal" value={g[k] ?? ""} onChange={upd(k)} className="w-full min-w-0 bg-transparent font-display text-4xl text-night outline-none" data-testid={`growth-${k}`} />
              <span className="text-sm text-slate-500">{u}</span>
            </span>
          </label>
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_0.7fr]">
        {PCT.map(([k, l]) => <PercentileCard key={k} id={k} label={l} r={pct[k]} />)}
        <div className="rounded-2xl bg-night px-4 py-3 text-white" data-testid="growth-bmi">
          <div className="text-[11px] uppercase tracking-[0.16em] text-slate-300">BMI</div>
          <div className="font-display text-4xl">{r1(bmi(g))}</div>
        </div>
      </div>
      <p className="text-xs text-slate-500">Percentili calcolati in automatico con il metodo LMS sulle curve OMS: Child Growth Standards 0–5 anni; Growth Reference 2007 per peso 5–10 anni e altezza 5–19 anni.</p>
    </div>
  );
};

const PercentileCard = ({ id, label, r }) => {
  const p = r?.percentile;
  const tone = p == null ? "text-slate-400" : p < 3 || p > 97 ? "text-red-600" : p < 15 || p > 85 ? "text-amber-600" : "text-emerald-600";
  return (
    <div className="rounded-2xl border border-slate-200 p-4" data-testid={`growth-pct-${id}`}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className={`mt-1 font-display text-4xl leading-none ${tone}`}>{r?.label ?? "—"}</div>
      <div className="mt-1 font-mono text-xs text-slate-500">{r?.z != null ? `z ${r.z > 0 ? "+" : ""}${String(r.z).replace(".", ",")}` : r ? "" : "inserisci la misura"}</div>
      <div className="relative mt-3 h-1.5 rounded-full bg-gradient-to-r from-red-200 via-emerald-200 to-red-200">
        {p != null && <span className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-night shadow transition-all duration-500" style={{ left: `${Math.min(99, Math.max(1, p))}%` }} />}
      </div>
    </div>
  );
};
