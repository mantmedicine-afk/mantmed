import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Save, Plus, Trash2, Euro, Settings2 } from "lucide-react";
import { api, errMsg } from "@/lib/api";
import { Kicker, Label, Seg, btnMain, card, inp } from "./ui";

const FIELDS = [["holder", "Nome e cognome", "Dott.ssa ..."], ["tax_code", "Codice fiscale", "16 caratteri"], ["vat_number", "Partita IVA", "11 cifre"],
  ["address", "Indirizzo (domicilio fiscale)", "Via Roma 1, 89100 Reggio Calabria (RC)"], ["order_registration", "Iscrizione all'Ordine", "Es. OMCeO Reggio Calabria n. 1234"], ["iban", "IBAN", "IT.."]];

const TariffRow = ({ t, i, set, onRemove }) => (
  <div className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[1fr_120px_230px_auto]" data-testid={`tariff-row-${i}`}>
    <input value={t.name} onChange={(e) => set({ name: e.target.value })} placeholder="Prestazione" className={`${inp} col-span-2 sm:col-span-1`} data-testid={`tariff-name-${i}`} />
    <label className="flex items-center gap-1 rounded-xl border border-[var(--hair)] bg-[var(--surface)] px-3 focus-within:border-[var(--accent)]"><Euro size={14} className="text-[var(--fg2)]" />
      <input inputMode="decimal" value={t.price} onChange={(e) => set({ price: e.target.value.replace(/[^0-9.,]/g, "") })} className="h-11 w-full bg-transparent font-mono text-sm text-[var(--fg)] outline-none" data-testid={`tariff-price-${i}`} /></label>
    <select value={t.vat} onChange={(e) => set({ vat: e.target.value })} className={inp} data-testid={`tariff-vat-${i}`}>
      <option value="esente">Esente art. 10 n. 18 DPR 633/72</option><option value="iva22">IVA 22%</option>
    </select>
    <button type="button" onClick={onRemove} className="grid h-11 w-11 place-items-center rounded-xl border border-[var(--hair)] text-[var(--fg2)] hover:text-[var(--alert)]" aria-label="Rimuovi prestazione" data-testid={`tariff-remove-${i}`}><Trash2 size={15} /></button>
  </div>
);

export const FiscalSettings = ({ settings, onSaved }) => {
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (settings) setF({ ...settings.billing, tariffs: settings.tariffs.map((t) => ({ ...t, price: String(t.price ?? 0).replace(".", ",") })) }); }, [settings]);
  if (!f) return null;
  const set = (patch) => setF({ ...f, ...patch });
  const setT = (i) => (patch) => set({ tariffs: f.tariffs.map((t, j) => (j === i ? { ...t, ...patch } : t)) });
  const save = async () => {
    setBusy(true);
    try {
      const r = await api.saveCashSettings({ ...f, tariffs: f.tariffs.filter((t) => t.name.trim()).map((t) => ({ ...t, price: Number(String(t.price).replace(",", ".")) || 0 })) });
      toast.success("Impostazioni fiscali salvate"); onSaved?.(r);
    } catch (e) { toast.error(errMsg(e)); }
    setBusy(false);
  };

  return (
    <div className="space-y-5" data-testid="fiscal-settings">
      {!settings.configured && <p className="rounded-2xl border border-[var(--alert)] p-3 text-sm text-[var(--alert)]" data-testid="fiscal-not-configured">Imposti una volta sola regime e dati fiscali: serviranno su ogni fattura.</p>}
      <div className={`${card} space-y-4`}>
        <Kicker icon={Settings2}>Regime fiscale</Kicker>
        <div className="max-w-md"><Seg value={f.regime} onChange={(v) => set({ regime: v })} testid="fiscal-regime" options={[{ id: "ordinario", label: "Ordinario" }, { id: "forfettario", label: "Forfettario" }]} /></div>
        <p className="text-xs text-[var(--fg2)]">{f.regime === "forfettario" ? "Nessuna IVA e nessuna ritenuta: in fattura comparirà la dicitura obbligatoria del regime forfettario." : "IVA 22% sulle prestazioni non sanitarie; ritenuta d'acconto del 20% sulle fatture ad aziende ed enti."}</p>
      </div>
      <div className={card}>
        <Kicker>Dati per la fattura</Kicker>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {FIELDS.map(([k, l, ph]) => <div key={k}><Label htmlFor={`fiscal-${k}`}>{l}</Label><input id={`fiscal-${k}`} value={f[k] ?? ""} placeholder={ph} onChange={(e) => set({ [k]: ["tax_code", "iban"].includes(k) ? e.target.value.toUpperCase() : e.target.value })} className={inp} data-testid={`fiscal-${k}`} /></div>)}
        </div>
      </div>
      <div className={`${card} grid grid-cols-1 gap-4 sm:grid-cols-2`}>
        <div><Label>Numerazione</Label><p className="text-sm text-[var(--fg)]" data-testid="fiscal-next-number">Prossima fattura: <span className="font-mono">{settings.next_number}</span></p><p className="mt-1 text-xs text-[var(--fg2)]">Unica per anno, comune a {settings.clinics.join(", ")}. Riparte da 1 a gennaio.</p></div>
        <div><Label>Bollo di 2 € · di solito a carico di</Label><Seg value={f.stamp_charge} onChange={(v) => set({ stamp_charge: v })} testid="fiscal-stamp" options={[{ id: "paziente", label: "Paziente" }, { id: "medico", label: "Medico" }]} /></div>
        <div className="sm:col-span-2"><Label htmlFor="fiscal-accountant_email">Email del commercialista</Label><input id="fiscal-accountant_email" type="email" value={f.accountant_email ?? ""} onChange={(e) => set({ accountant_email: e.target.value })} placeholder="studio@commercialista.it" className={inp} data-testid="fiscal-accountant_email" /></div>
      </div>
      <div className={card}>
        <Kicker>Tariffario delle prestazioni</Kicker>
        <p className="mt-1 text-xs text-[var(--fg2)]">Visite, bilanci e controlli sono esenti; certificati non obbligatori e perizie hanno IVA 22%.</p>
        <div className="mt-4 space-y-2">{f.tariffs.map((t, i) => <TariffRow key={i} t={t} i={i} set={setT(i)} onRemove={() => set({ tariffs: f.tariffs.filter((_, j) => j !== i) })} />)}</div>
        {f.tariffs.length < 20 && <button type="button" onClick={() => set({ tariffs: [...f.tariffs, { name: "", price: "", vat: "iva22" }] })} className="mt-3 flex items-center gap-1.5 text-sm font-medium text-[var(--fg)] hover:underline" data-testid="tariff-add"><Plus size={14} /> Aggiungi prestazione</button>}
      </div>
      <div className="flex justify-end"><button onClick={save} disabled={busy} className={btnMain} data-testid="fiscal-save-btn">{busy ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Salva impostazioni</button></div>
    </div>
  );
};
