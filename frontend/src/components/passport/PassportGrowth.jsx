import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { day } from "./ui";

const IND = [
  { id: "wfa", key: "weight", pct: "peso", label: "Peso", unit: "kg" },
  { id: "lhfa", key: "height", pct: "altezza", label: "Altezza", unit: "cm" },
  { id: "hcfa", key: "hc", pct: "cc", label: "Circ. cranica", unit: "cm" },
];
const BANDS = [["p3", "3°"], ["p15", "15°"], ["p50", "50°"], ["p85", "85°"], ["p97", "97°"]];
const num = (v) => String(v).replace(".", ",");

const Chart = ({ curve, points, unit }) => {
  const data = useMemo(() => [...curve, ...points].sort((a, b) => a.month - b.month), [curve, points]);
  const max = curve.length ? curve[curve.length - 1].month : 12;
  const step = max > 72 ? 24 : max > 36 ? 12 : 6;
  const ticks = Array.from({ length: Math.floor(max / step) + 1 }, (_, i) => i * step);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 10, right: 24, bottom: 0, left: -12 }}>
        <CartesianGrid stroke="var(--hair)" />
        <XAxis dataKey="month" type="number" domain={[0, max]} ticks={ticks} tickFormatter={(m) => (step >= 12 ? `${m / 12}a` : `${m}m`)} tick={{ fontSize: 11, fill: "var(--fg2)" }} />
        <YAxis domain={["auto", "auto"]} tick={{ fontSize: 11, fill: "var(--fg2)" }} />
        <Tooltip formatter={(v, n) => [`${num(v)} ${unit}`, n]} labelFormatter={(m) => `${Math.round(m * 10) / 10} mesi`} />
        {BANDS.map(([k, l]) => <Line key={k} dataKey={k} name={`${l} pc`} connectNulls dot={false} activeDot={false} isAnimationActive={false} stroke={k === "p50" ? "var(--accent)" : "var(--wait)"} strokeWidth={k === "p50" ? 1.6 : 1} strokeDasharray={k === "p3" || k === "p97" ? "4 4" : undefined} />)}
        <Line dataKey="value" name="Misura" connectNulls stroke="var(--fg)" strokeWidth={2.4} dot={{ r: 4, fill: "var(--fg)" }} />
      </LineChart>
    </ResponsiveContainer>
  );
};

export const PassportGrowth = ({ g }) => {
  const [ind, setInd] = useState(IND[0]);
  const curve = g.curves[ind.id] ?? [];
  const max = curve.length ? curve[curve.length - 1].month : 0;
  const rows = g.measurements.filter((m) => m[ind.key] != null);
  const points = rows.filter((m) => m.age_months <= max).map((m) => ({ month: m.age_months, value: m[ind.key] }));
  return (
    <section className="space-y-3" data-testid="passport-growth">
      <div className="flex flex-wrap items-center gap-2">
        {IND.map((x) => <button key={x.id} onClick={() => setInd(x)} className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${x.id === ind.id ? "bg-[var(--accent)] text-[var(--ink)]" : "border border-[var(--hair)] text-[var(--fg2)] hover:border-[var(--accent)]"}`} data-testid={`passport-growth-${x.id}`}>{x.label}</button>)}
        <span className="ml-auto text-xs text-[var(--fg2)]" data-testid="passport-growth-ref">{ind.id === "hcfa" ? "Curve OMS 0-5 anni" : "Curve OMS fino a 5 anni, poi curve italiane SIEDP (Cacciari 2006)"} · {g.sex === "F" ? "femmine" : "maschi"}</span>
      </div>
      <div className="h-72 rounded-3xl bg-[var(--surface)] p-3 ring-1 ring-[var(--sel)] sm:h-80">
        {curve.length ? <Chart curve={curve} points={points} unit={ind.unit} /> : <div className="grid h-full place-items-center text-sm text-[var(--fg2)]">Curve non disponibili per questa età.</div>}
      </div>
      <ul className="divide-y divide-[var(--sel)] rounded-3xl bg-[var(--surface)] px-5 ring-1 ring-[var(--sel)]" data-testid="passport-growth-rows">
        {[...rows].reverse().slice(0, 8).map((m) => (
          <li key={m.id} className="flex flex-wrap items-baseline justify-between gap-2 py-3" data-testid={`passport-measure-${m.id}`}>
            <div><span className="font-medium text-[var(--fg)]">{num(m[ind.key])} {ind.unit}</span> <span className="text-sm text-[var(--fg2)]">{m.pct?.[ind.pct]?.label ?? ""}{m.pct?.[ind.pct]?.ref ? ` (${m.pct[ind.pct].ref})` : ""}</span></div>
            <div className="text-xs text-[var(--fg2)]">{day(m.date)} · {m.age_label} · inserito da {m.by} ({m.source})</div>
          </li>
        ))}
        {!rows.length && <li className="py-4 text-sm text-[var(--fg2)]">Nessuna misura registrata.</li>}
      </ul>
    </section>
  );
};
