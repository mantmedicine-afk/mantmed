import { useEffect, useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { api, CLINICS, errMsg } from "@/lib/api";

const IND = [
  { id: "wfa", key: "weight", pct: "peso", label: "Peso", unit: "kg", max: 120 },
  { id: "lhfa", key: "height", pct: "altezza", label: "Altezza", unit: "cm", max: 228 },
  { id: "hcfa", key: "hc", pct: "cc", label: "Circ. cranica", unit: "cm", max: 60 },
];
const BANDS = [["p3", "3°"], ["p15", "15°"], ["p50", "50°"], ["p85", "85°"], ["p97", "97°"]];

export const GrowthChart = ({ patient, measurements, onAdded }) => {
  const [ind, setInd] = useState(IND[0]);
  const [curve, setCurve] = useState([]);
  const maxMonth = Math.min(ind.max, Math.max(12, Math.ceil((patient.age_months + 6) / 6) * 6));
  useEffect(() => {
    api.curves({ sex: patient.sex, indicator: ind.id, max_month: maxMonth }).then(setCurve).catch(() => setCurve([]));
  }, [patient.sex, ind.id, maxMonth]);

  const points = useMemo(() => measurements.filter((m) => m[ind.key] != null && m.age_months <= ind.max).map((m) => ({ month: m.age_months, value: m[ind.key] })), [measurements, ind]);
  const data = useMemo(() => [...curve, ...points].sort((a, b) => a.month - b.month), [curve, points]);
  const step = maxMonth > 36 ? 12 : 6;
  const ticks = Array.from({ length: Math.floor(maxMonth / step) + 1 }, (_, i) => i * step);
  const outOfRange = patient.age_months > ind.max;

  return (
    <div className="space-y-5" data-testid="growth-chart">
      <div className="flex flex-wrap items-center gap-2">
        {IND.map((x) => (
          <button key={x.id} onClick={() => setInd(x)} className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${x.id === ind.id ? "bg-night text-white" : "border border-slate-200 text-slate-600 hover:border-night"}`} data-testid={`growth-indicator-${x.id}`}>{x.label}</button>
        ))}
        <span className="ml-auto text-xs text-slate-500">Curve OMS · {patient.sex === "F" ? "femmine" : "maschi"}</span>
      </div>
      <div className="h-72 rounded-3xl border border-slate-200 bg-white p-3 sm:h-80">
        {outOfRange ? (
          <div className="grid h-full place-items-center text-center text-sm text-slate-500">Le curve OMS per questo parametro arrivano a {ind.max / 12} anni.</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 10, right: 28, bottom: 0, left: -12 }}>
              <CartesianGrid stroke="#EEF1F7" />
              <XAxis dataKey="month" type="number" domain={[0, maxMonth]} ticks={ticks} tickFormatter={(m) => (step === 12 ? `${m / 12}a` : `${m}m`)} tick={{ fontSize: 11, fill: "#5B6478" }} />
              <YAxis domain={["auto", "auto"]} tick={{ fontSize: 11, fill: "#5B6478" }} />
              <Tooltip formatter={(v, n) => [`${v} ${ind.unit}`, n]} labelFormatter={(m) => `${Math.round(m * 10) / 10} mesi`} />
              {BANDS.map(([k, l]) => (
                <Line key={k} dataKey={k} name={`${l} pc`} connectNulls dot={false} activeDot={false} isAnimationActive={false} stroke={k === "p50" ? "#3B6CF6" : "#C3CDE3"} strokeWidth={k === "p50" ? 1.6 : 1} strokeDasharray={k === "p3" || k === "p97" ? "4 4" : undefined} />
              ))}
              <Line dataKey="value" name={ind.label} connectNulls stroke="#0B1736" strokeWidth={2.4} dot={{ r: 4, fill: "#0B1736" }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
      <MeasureTable measurements={measurements} />
      <AddMeasurement patient={patient} onAdded={onAdded} />
    </div>
  );
};

const MeasureTable = ({ measurements }) => (
  <div className="overflow-x-auto rounded-3xl border border-slate-200" data-testid="measurements-table">
    <table className="w-full min-w-[560px] text-left text-sm">
      <thead className="bg-night text-[11px] uppercase tracking-[0.14em] text-white">
        <tr>{["Data", "Età", "Studio", "Peso", "Altezza", "Circ. cranica"].map((h) => <th key={h} className="px-4 py-2.5 font-semibold">{h}</th>)}</tr>
      </thead>
      <tbody>
        {[...measurements].reverse().map((m) => (
          <tr key={m.id} className="border-t border-slate-100 text-night">
            <td className="px-4 py-2.5 font-mono text-xs">{new Date(m.date).toLocaleDateString("it-IT")}</td>
            <td className="px-4 py-2.5">{m.age_label}</td>
            <td className="px-4 py-2.5 text-slate-600">{m.clinic || "—"}</td>
            {[["weight", "peso", "kg"], ["height", "altezza", "cm"], ["hc", "cc", "cm"]].map(([k, p, u]) => (
              <td key={k} className="px-4 py-2.5">{m[k] != null ? <>{String(m[k]).replace(".", ",")} {u} <span className="text-xs text-slate-500">{m.percentiles?.[p]?.label ?? ""}</span></> : "—"}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const AddMeasurement = ({ patient, onAdded }) => {
  const [f, setF] = useState({ date: new Date().toISOString().slice(0, 10), clinic: CLINICS[0], weight: "", height: "", hc: "" });
  const num = (v) => (v === "" ? null : Number(v));
  const save = async () => {
    if (!f.weight && !f.height && !f.hc) return toast.error("Inserisci almeno una misura");
    try {
      await api.addMeasurement(patient.id, { ...f, weight: num(f.weight), height: num(f.height), hc: num(f.hc) });
      toast.success("Misura sincronizzata nel passaporto");
      setF((x) => ({ ...x, weight: "", height: "", hc: "" }));
      onAdded();
    } catch (e) { toast.error(errMsg(e)); }
  };
  const inp = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-night outline-none focus:border-night";
  return (
    <div className="grid grid-cols-2 gap-2 rounded-3xl bg-slate-50 p-4 md:grid-cols-[1.2fr_1.2fr_1fr_1fr_1fr_auto]" data-testid="add-measurement-form">
      <input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} className={inp} data-testid="measure-date" />
      <select value={f.clinic} onChange={(e) => setF({ ...f, clinic: e.target.value })} className={inp} data-testid="measure-clinic">{CLINICS.map((c) => <option key={c}>{c}</option>)}</select>
      <input type="number" step="0.1" placeholder="Peso kg" value={f.weight} onChange={(e) => setF({ ...f, weight: e.target.value })} className={inp} data-testid="measure-weight" />
      <input type="number" step="0.1" placeholder="Altezza cm" value={f.height} onChange={(e) => setF({ ...f, height: e.target.value })} className={inp} data-testid="measure-height" />
      <input type="number" step="0.1" placeholder="C. cranica cm" value={f.hc} onChange={(e) => setF({ ...f, hc: e.target.value })} className={inp} data-testid="measure-hc" />
      <button onClick={save} className="col-span-2 flex items-center justify-center gap-2 rounded-full bg-night px-4 py-2 text-sm font-medium text-white transition-transform hover:-translate-y-0.5 md:col-span-1" data-testid="measure-save-btn"><Plus size={15} /> Misura</button>
    </div>
  );
};
