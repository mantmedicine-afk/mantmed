import { ArrowUp, ArrowDown, X, Plus } from "lucide-react";
import { inp } from "./ui";
import { Switch } from "@/components/ui/switch";

export const GROUPS = [
  ["anamnesi", "Anamnesi mirata"], ["sintomi", "Motivo e sintomi"], ["parametri_vitali", "Parametri vitali"],
  ["esame_obiettivo", "Esame obiettivo"], ["altro", "Accertamenti e altro"],
];

const IconBtn = ({ onClick, disabled, label, testid, children, danger }) => (
  <button type="button" onClick={onClick} disabled={disabled} aria-label={label} className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[var(--hair)] transition-colors disabled:opacity-30 ${danger ? "text-[var(--alert)] hover:border-[var(--alert)]" : "text-[var(--fg)] hover:border-[var(--accent)]"}`} data-testid={testid}>{children}</button>
);

export const TemplateFields = ({ fields, onChange }) => {
  const set = (i, patch) => onChange(fields.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const move = (i, d) => { const xs = [...fields]; [xs[i], xs[i + d]] = [xs[i + d], xs[i]]; onChange(xs); };
  const add = () => onChange([...fields, { id: Math.random().toString(36).slice(2, 12), titolo: "", gruppo: "esame_obiettivo", hint: "", required: false }]);
  return (
    <div className="space-y-2" data-testid="template-fields">
      {fields.map((f, i) => (
        <div key={f.id} className="grid gap-2 rounded-2xl border border-[var(--hair)] bg-[var(--raised)] p-3 sm:grid-cols-[auto_1.2fr_0.9fr_1.4fr_auto_auto] sm:items-center" data-testid={`template-field-${i}`}>
          <span className="font-mono text-xs text-[var(--accent)]">{String(i + 1).padStart(2, "0")}</span>
          <input value={f.titolo} onChange={(e) => set(i, { titolo: e.target.value })} placeholder="Titolo del campo" className={inp} data-testid={`template-field-title-${i}`} />
          <select value={f.gruppo} onChange={(e) => set(i, { gruppo: e.target.value })} className={inp} data-testid={`template-field-group-${i}`}>
            {GROUPS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <input value={f.hint} onChange={(e) => set(i, { hint: e.target.value })} placeholder="Indicazioni per l'IA (facoltative)" className={inp} data-testid={`template-field-hint-${i}`} />
          <label className="flex items-center gap-2 text-xs text-[var(--fg2)]" data-testid={`template-field-required-${i}`}>
            <Switch checked={Boolean(f.required)} onCheckedChange={(v) => set(i, { required: v })} aria-label={`Obbligatorio: ${f.titolo || "campo"}`} data-testid={`template-field-required-switch-${i}`} /> Obbligatorio
          </label>
          <div className="flex gap-1.5">
            <IconBtn onClick={() => move(i, -1)} disabled={i === 0} label="Sposta su" testid={`template-field-up-${i}`}><ArrowUp size={14} /></IconBtn>
            <IconBtn onClick={() => move(i, 1)} disabled={i === fields.length - 1} label="Sposta giù" testid={`template-field-down-${i}`}><ArrowDown size={14} /></IconBtn>
            <IconBtn onClick={() => onChange(fields.filter((_, j) => j !== i))} label="Rimuovi campo" testid={`template-field-del-${i}`} danger><X size={14} /></IconBtn>
          </div>
        </div>
      ))}
      {!fields.length && <p className="rounded-2xl border border-dashed border-[var(--hair)] p-5 text-center text-sm text-[var(--fg2)]" data-testid="template-fields-empty">Nessun campo: l'IA compilerà solo la cartella standard.</p>}
      <button type="button" onClick={add} className="flex items-center gap-1.5 rounded-full border border-dashed border-[var(--hair)] px-4 py-2 text-sm text-[var(--fg2)] hover:border-[var(--accent)] hover:text-[var(--fg)]" data-testid="template-field-add"><Plus size={14} /> Aggiungi campo</button>
    </div>
  );
};
