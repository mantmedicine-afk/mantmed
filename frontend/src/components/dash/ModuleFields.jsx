import { useState } from "react";
import { Plus, X } from "lucide-react";
import { AIFieldMark } from "@/components/mantai/AILabel";
import { box, lbl, pill, num, out, Verify, Plausible } from "./moduleUi";
import { EyesField, EyeTherapy } from "./EyeFields";
import { DateInput } from "@/components/ui/it-date";

const NumberField = ({ f, v, set }) => {
  const [ask, setAsk] = useState(false);
  const val = v ?? { v: null, note: "", verifica: false };
  return (
    <div>
      <div className="mt-1.5 flex gap-2">
        <div className={`flex w-40 items-center px-4 ${box}`}>
          <input type="number" step="any" inputMode="decimal" value={val.v ?? ""} onChange={(e) => set({ ...val, v: num(e.target.value), verifica: false })} onBlur={() => setAsk(out(val.v, f.min, f.max))} className="h-12 w-full bg-transparent text-[15px] outline-none" aria-label={f.label} data-testid={`module-field-${f.key}`} />
          {f.unita && <span className="text-sm text-[var(--fg2)]">{f.unita}</span>}
        </div>
        <input value={val.note ?? ""} onChange={(e) => set({ ...val, note: e.target.value })} placeholder="Note (facoltative)" className={`h-12 min-w-0 flex-1 px-4 text-sm outline-none ${box}`} data-testid={`module-field-${f.key}-note`} />
      </div>
      {ask && <Plausible id={f.key} value={val.v} unit={f.unita} onKeep={() => setAsk(false)} onFix={() => { setAsk(false); set({ ...val, v: null }); }} />}
    </div>
  );
};

const PressureField = ({ f, v, set }) => {
  const [ask, setAsk] = useState(null);
  const rows = v?.length ? v : [{ sis: null, dia: null, note: "", verifica: false }];
  const upd = (i, patch) => set(rows.map((r, j) => (j === i ? { ...r, ...patch, verifica: false } : r)));
  const check = (i) => setAsk(out(rows[i].sis, f.min, f.max) || out(rows[i].dia, f.min2, f.max2) ? i : null);
  return (
    <div className="mt-1.5 space-y-2">
      {rows.map((r, i) => (
        <div key={i} data-testid={`module-pressure-row-${i}`}>
          <div className="flex flex-wrap items-center gap-2">
            <div className={`flex items-center gap-1 px-3 ${box}`}>
              <input type="number" inputMode="numeric" value={r.sis ?? ""} onChange={(e) => upd(i, { sis: num(e.target.value) })} onBlur={() => check(i)} className="h-12 w-16 bg-transparent text-center text-[15px] outline-none" aria-label="Sistolica" data-testid={`module-pressure-sis-${i}`} />
              <span className="text-[var(--fg2)]">/</span>
              <input type="number" inputMode="numeric" value={r.dia ?? ""} onChange={(e) => upd(i, { dia: num(e.target.value) })} onBlur={() => check(i)} className="h-12 w-16 bg-transparent text-center text-[15px] outline-none" aria-label="Diastolica" data-testid={`module-pressure-dia-${i}`} />
              <span className="pr-1 text-sm text-[var(--fg2)]">mmHg</span>
            </div>
            <input value={r.note ?? ""} onChange={(e) => upd(i, { note: e.target.value })} placeholder="Note (es. seduto, braccio destro)" className={`h-12 min-w-0 flex-1 px-4 text-sm outline-none ${box}`} data-testid={`module-pressure-note-${i}`} />
            {r.verifica && <Verify id={`pressione-${i}`} />}
            {rows.length > 1 && <button type="button" onClick={() => set(rows.filter((_, j) => j !== i))} className="grid h-8 w-8 place-items-center rounded-full text-[var(--fg2)] hover:text-[var(--alert)]" aria-label="Rimuovi misurazione" data-testid={`module-pressure-del-${i}`}><X size={14} /></button>}
          </div>
          {ask === i && <Plausible id={`pressione-${i}`} value={`${r.sis ?? "—"}/${r.dia ?? "—"}`} unit="mmHg" onKeep={() => setAsk(null)} onFix={() => { setAsk(null); upd(i, { ...(out(r.sis, f.min, f.max) ? { sis: null } : {}), ...(out(r.dia, f.min2, f.max2) ? { dia: null } : {}) }); }} />}
        </div>
      ))}
      <button type="button" onClick={() => set([...rows, { sis: null, dia: null, note: "", verifica: false }])} className="flex items-center gap-1.5 rounded-full border border-dashed border-[var(--hair)] px-4 py-2 text-sm text-[var(--fg2)] hover:border-[var(--accent)] hover:text-[var(--fg)]" data-testid="module-pressure-add"><Plus size={14} /> Aggiungi misurazione</button>
    </div>
  );
};

const Choice = ({ f, v, set, options }) => (
  <div className="mt-1.5 flex flex-wrap gap-2" role="radiogroup" aria-label={f.label}>
    {options.map((o) => <button key={o} type="button" role="radio" aria-checked={v === o} onClick={() => set(v === o ? "" : o)} className={pill(v === o)} data-testid={`module-field-${f.key}-${o}`}>{o}</button>)}
  </div>
);

const Input = ({ f, v, set }) => {
  if (f.tipo === "occhi") return <EyesField f={f} v={v} set={set} />;
  if (f.tipo === "terapia_occhi") return <EyeTherapy f={f} v={v} set={set} />;
  if (f.tipo === "numero") return <NumberField f={f} v={v} set={set} />;
  if (f.tipo === "pressione") return <PressureField f={f} v={v} set={set} />;
  if (f.tipo === "scelta") return <Choice f={f} v={v} set={set} options={f.opzioni ?? []} />;
  if (f.tipo === "sino") return <Choice f={f} v={v} set={set} options={["sì", "no"]} />;
  if (f.tipo === "data") return <DateInput value={v ?? ""} onChange={(e) => set(e.target.value)} className={`mt-1.5 h-12 px-4 text-[15px] outline-none ${box}`} data-testid={`module-field-${f.key}`} />;
  return <textarea value={v ?? ""} onChange={(e) => set(e.target.value)} rows={2} className={`mt-1.5 w-full resize-y px-4 py-3 text-[15px] leading-relaxed outline-none ${box}`} data-testid={`module-field-${f.key}`} />;
};

export const ModuleFields = ({ fields, campi, onChange, processing, marked }) => (
  <div className="space-y-4" data-testid="module-fields">
    {fields.map((f, i) => (
      <div key={f.key} className="block" data-testid={`module-row-${f.key}`}>
        {f.sezione && f.sezione !== fields[i - 1]?.sezione && <div className="mb-3 mt-6 border-b border-[var(--hair)] pb-2 font-display text-lg text-[var(--fg)]" data-testid={`module-section-${f.key}`}>{f.sezione}</div>}
        <span className={lbl}>{f.label}</span>
        {f.hint && <span className="ml-2 text-xs text-[var(--fg2)]">· {f.hint}</span>}
        {marked(f.key) && <AIFieldMark testId={`note-ai-mark-${f.key}`} />}
        {campi?.[f.key]?.verifica === true && <Verify id={f.key} />}
        {processing ? <div className="mt-1.5 h-12 rounded-2xl ai-shimmer" /> : <Input f={f} v={campi?.[f.key]} set={(v) => onChange(f.key, v)} />}
      </div>
    ))}
  </div>
);
