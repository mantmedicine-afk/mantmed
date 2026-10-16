import { Plus, Trash2, Scale } from "lucide-react";
import { doseFor, r1 } from "@/lib/pediatric";

const COLS = [["mg_kg_dose", "mg/kg/dose"], ["dosi_giorno", "dosi/die"], ["concentrazione_mg_ml", "mg/ml"], ["max_mg_dose", "max mg/dose"], ["giorni", "giorni"]];
const EMPTY = { nome: "", mg_kg_dose: null, dosi_giorno: null, concentrazione_mg_ml: null, max_mg_dose: null, giorni: null, note: "" };

export const DoseCalculator = ({ drugs, peso, set }) => {
  const upd = (i, k, num) => (e) => set(drugs.map((d, j) => (j === i ? { ...d, [k]: num ? (e.target.value === "" ? null : Number(e.target.value)) : e.target.value } : d)));
  return (
    <div className="rounded-3xl border border-slate-200 p-4" data-testid="dose-calculator">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500"><Scale size={14} /> Terapia su misura</div>
        <div className="rounded-full bg-slate-100 px-3 py-1 font-mono text-xs text-night" data-testid="dose-weight">{peso ? `peso ${r1(peso)} kg` : "inserisci il peso nella scheda 04"}</div>
      </div>
      <div className="mt-3 space-y-3">
        {drugs.map((d, i) => {
          const x = doseFor(d, peso);
          return (
            <div key={i} className="rounded-2xl bg-slate-50 p-3" data-testid={`drug-row-${i}`}>
              <div className="flex gap-2">
                <input value={d.nome} onChange={upd(i, "nome")} placeholder="Farmaco" className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 font-medium text-night outline-none focus:border-night" data-testid={`drug-name-${i}`} />
                <button onClick={() => set(drugs.filter((_, j) => j !== i))} className="grid h-10 w-10 place-items-center rounded-full text-slate-500 hover:bg-slate-200 hover:text-night" aria-label="Rimuovi farmaco" data-testid={`drug-remove-${i}`}><Trash2 size={15} /></button>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5">
                {COLS.map(([k, l]) => (
                  <label key={k} className="block">
                    <span className="text-[10px] uppercase tracking-[0.14em] text-slate-500">{l}</span>
                    <input type="number" step="0.1" inputMode="decimal" value={d[k] ?? ""} onChange={upd(i, k, true)} className="mt-0.5 w-full rounded-xl border border-slate-200 bg-white px-2 py-1.5 font-mono text-sm text-night outline-none focus:border-night" data-testid={`drug-${k}-${i}`} />
                  </label>
                ))}
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-night p-3 text-white" data-testid={`drug-result-${i}`}>
                <Out label="mg / dose" v={x ? r1(x.mg) : "—"} hint={x?.capped ? "limitata al massimo" : ""} />
                <Out label="ml / dose" v={x?.ml != null ? r1(x.ml) : "—"} />
                <Out label="mg / die" v={x?.daily != null ? r1(x.daily) : "—"} />
              </div>
            </div>
          );
        })}
      </div>
      <button onClick={() => set([...drugs, { ...EMPTY }])} className="mt-3 flex items-center gap-2 rounded-full border border-dashed border-slate-300 px-4 py-2 text-sm font-medium text-night transition-colors hover:border-night" data-testid="drug-add-btn"><Plus size={15} /> Aggiungi farmaco</button>
      <p className="mt-3 text-xs text-slate-500">Calcolo aritmetico sui valori inseriti dal medico: verificare sempre posologia e dosi massime.</p>
    </div>
  );
};

const Out = ({ label, v, hint }) => (
  <div>
    <div className="text-[10px] uppercase tracking-[0.14em] text-slate-300">{label}</div>
    <div className="font-display text-2xl leading-tight">{v}</div>
    {hint && <div className="text-[10px] text-amber-300">{hint}</div>}
  </div>
);
