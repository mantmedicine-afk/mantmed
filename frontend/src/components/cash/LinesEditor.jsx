import { Plus, Trash2, Euro } from "lucide-react";
import { inp } from "./ui";

const VATS = [["esente", "Esente art. 10 n. 18"], ["iva22", "IVA 22%"]];

export const LinesEditor = ({ lines, tariffs, regime, onChange }) => {
  const set = (i, patch) => onChange(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const pickTariff = (i, name) => {
    const t = tariffs.find((x) => x.name === name);
    set(i, t ? { description: t.name, amount: t.price || "", vat: t.vat } : { description: name });
  };
  return (
    <div className="space-y-2" data-testid="invoice-lines">
      <datalist id="invoice-tariffs">{tariffs.map((t) => <option key={t.name} value={t.name} />)}</datalist>
      {lines.map((l, i) => (
        <div key={i} className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[1fr_120px_170px_auto]" data-testid={`invoice-line-${i}`}>
          <input list="invoice-tariffs" value={l.description} onChange={(e) => pickTariff(i, e.target.value)} placeholder="Prestazione (dal tariffario o libera)" className={`${inp} col-span-2 sm:col-span-1`} data-testid={`invoice-line-desc-${i}`} />
          <label className="flex items-center gap-1 rounded-xl border border-[var(--hair)] bg-[var(--surface)] px-3 focus-within:border-[var(--accent)]">
            <Euro size={14} className="text-[var(--fg2)]" />
            <input inputMode="decimal" value={l.amount} onChange={(e) => set(i, { amount: e.target.value.replace(/[^0-9.,]/g, "") })} placeholder="0,00" className="h-11 w-full bg-transparent font-mono text-sm text-[var(--fg)] outline-none" data-testid={`invoice-line-amount-${i}`} />
          </label>
          <select value={regime === "forfettario" ? "esente" : l.vat} disabled={regime === "forfettario"} onChange={(e) => set(i, { vat: e.target.value })} className={`${inp} disabled:opacity-60`} title={regime === "forfettario" ? "In regime forfettario non si applica l'IVA" : ""} data-testid={`invoice-line-vat-${i}`}>
            {VATS.map(([id, label]) => <option key={id} value={id}>{regime === "forfettario" ? "Non soggetta (forfettario)" : label}</option>)}
          </select>
          <button type="button" disabled={lines.length === 1} onClick={() => onChange(lines.filter((_, j) => j !== i))} className="grid h-11 w-11 place-items-center rounded-xl border border-[var(--hair)] text-[var(--fg2)] hover:text-[var(--alert)] disabled:opacity-40" aria-label="Rimuovi riga" data-testid={`invoice-line-remove-${i}`}><Trash2 size={15} /></button>
        </div>
      ))}
      {lines.length < 20 && <button type="button" onClick={() => onChange([...lines, { description: "", amount: "", vat: "esente" }])} className="flex items-center gap-1.5 text-sm font-medium text-[var(--fg)] hover:underline" data-testid="invoice-add-line"><Plus size={14} /> Aggiungi prestazione</button>}
    </div>
  );
};
