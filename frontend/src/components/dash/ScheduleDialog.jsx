import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Save, Plus, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { api, errMsg } from "@/lib/api";

const DAYS = [[1, "Lun"], [2, "Mar"], [3, "Mer"], [4, "Gio"], [5, "Ven"], [6, "Sab"], [7, "Dom"]];
const inp = "h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-night outline-none focus:border-night";
const BILLING = [["holder", "Intestatario", "Nome e cognome"], ["tax_code", "Codice fiscale", "16 caratteri"], ["vat_number", "Partita IVA", "11 cifre"],
  ["address", "Domicilio fiscale", "Via, CAP, Città"], ["note", "Nota in calce (facoltativa)", "Es. regime fiscale applicato"]];
const Label = ({ children }) => <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600">{children}</div>;
const DEF_HOURS = { days: [1, 2, 3, 4, 5], start: "09:00", end: "18:00" };

const toForm = (s) => ({ clinics: (s.clinics ?? []).map((c) => ({ ...c, hours: s.hours?.[c.name] ?? DEF_HOURS })), services: s.services ?? [], billing: s.billing ?? {} });
const toBody = (f) => ({
  clinics: f.clinics.map(({ name, address }) => ({ name: name.trim(), address })),
  hours: Object.fromEntries(f.clinics.map((c) => [c.name.trim(), c.hours])),
  services: f.services.map((x) => ({ ...x, name: x.name.trim() })), billing: f.billing,
});

const ClinicCard = ({ c, i, set, onRemove }) => {
  const h = c.hours;
  const setH = (k, v) => set({ ...c, hours: { ...h, [k]: v } });
  return (
    <div className="rounded-2xl border border-slate-200 p-4" data-testid={`schedule-clinic-${i}`}>
      <div className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[180px_1fr_auto]">
        <input value={c.name} onChange={(e) => set({ ...c, name: e.target.value })} placeholder="Nome sede" className={inp} data-testid={`schedule-clinic-name-${i}`} />
        <input value={c.address} onChange={(e) => set({ ...c, address: e.target.value })} placeholder="Indirizzo" className={`${inp} col-span-2 sm:col-span-1`} data-testid={`schedule-clinic-address-${i}`} />
        {onRemove && <button type="button" onClick={onRemove} className="row-start-1 grid h-10 w-10 place-items-center rounded-xl border border-slate-200 text-slate-600 hover:text-rose-700 sm:row-start-auto" aria-label="Rimuovi sede" data-testid={`schedule-clinic-remove-${i}`}><Trash2 size={15} /></button>}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {DAYS.map(([d, l]) => (
          <button key={d} type="button" onClick={() => setH("days", h.days.includes(d) ? h.days.filter((x) => x !== d) : [...h.days, d].sort())} aria-pressed={h.days.includes(d)} className={`h-9 w-11 rounded-full text-xs font-medium transition-colors ${h.days.includes(d) ? "bg-night text-white" : "border border-slate-200 text-slate-600 hover:border-night"}`} data-testid={`schedule-day-${i}-${d}`}>{l}</button>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2 text-sm text-slate-600">
        dalle <input type="time" value={h.start} onChange={(e) => setH("start", e.target.value)} className={inp} data-testid={`schedule-start-${i}`} />
        alle <input type="time" value={h.end} onChange={(e) => setH("end", e.target.value)} className={inp} data-testid={`schedule-end-${i}`} />
      </div>
    </div>
  );
};

const ServiceRow = ({ s, i, set, onRemove }) => (
  <div className="grid grid-cols-[1fr_auto] items-end gap-2 rounded-xl border border-slate-200 p-2 sm:grid-cols-[1fr_90px_100px_auto]" data-testid={`schedule-service-${i}`}>
    <input value={s.name} onChange={(e) => set({ ...s, name: e.target.value })} placeholder="Nome prestazione" className={`${inp} w-full`} data-testid={`schedule-service-name-${i}`} />
    <button type="button" onClick={onRemove} disabled={!onRemove} className="grid h-10 w-10 place-items-center rounded-xl text-slate-600 hover:text-rose-700 disabled:opacity-30 sm:order-last" aria-label="Rimuovi prestazione" data-testid={`schedule-service-remove-${i}`}><Trash2 size={15} /></button>
    <label className="text-xs text-slate-600">Minuti<input type="number" min={5} max={240} step={5} value={s.duration} onChange={(e) => set({ ...s, duration: Number(e.target.value) })} className={`${inp} w-full`} data-testid={`schedule-service-duration-${i}`} /></label>
    <label className="text-xs text-slate-600">Tariffa €<input type="number" min={0} max={5000} step={1} value={s.price} onChange={(e) => set({ ...s, price: Number(e.target.value) })} className={`${inp} w-full`} data-testid={`schedule-service-price-${i}`} /></label>
  </div>
);

export const ScheduleDialog = ({ open, onClose }) => {
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return undefined;
    setF(null);
    api.getSchedule().then((s) => setF(toForm(s))).catch((e) => toast.error(errMsg(e)));
    return undefined;
  }, [open]);
  const setAt = (k, i) => (v) => setF((p) => ({ ...p, [k]: p[k].map((x, j) => (j === i ? v : x)) }));
  const removeAt = (k, i) => () => setF((p) => ({ ...p, [k]: p[k].filter((_, j) => j !== i) }));
  const save = async () => {
    setBusy(true);
    try { setF(toForm(await api.saveSchedule(toBody(f)))); toast.success("Impostazioni salvate: il portale mostra subito sedi, orari liberi, prestazioni e tariffe"); onClose(); }
    catch (e) { toast.error(errMsg(e)); }
    setBusy(false);
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto rounded-3xl bg-white sm:max-w-2xl" data-testid="schedule-dialog">
        <DialogHeader>
          <DialogTitle className="font-display text-3xl font-normal text-night">Orari, tariffe e dati fiscali</DialogTitle>
          <DialogDescription className="text-sm text-slate-600">Il Portale Paziente propone solo gli orari liberi delle sue sedi, in base alla durata della prestazione scelta.</DialogDescription>
        </DialogHeader>
        {!f ? <Loader2 className="animate-spin text-night" /> : (
          <div className="space-y-6">
            <div data-testid="schedule-clinics">
              <Label>Sedi e orari di apertura</Label>
              <p className="mb-2 text-xs text-slate-600">Rinominare una sede non sposta gli appuntamenti già registrati con il nome precedente.</p>
              <div className="space-y-3">{f.clinics.map((c, i) => <ClinicCard key={i} c={c} i={i} set={setAt("clinics", i)} onRemove={f.clinics.length > 1 ? removeAt("clinics", i) : null} />)}</div>
              {f.clinics.length < 6 && <button type="button" onClick={() => setF({ ...f, clinics: [...f.clinics, { name: "", address: "", hours: DEF_HOURS }] })} className="mt-2 flex items-center gap-1.5 text-sm font-medium text-night hover:underline" data-testid="schedule-add-clinic"><Plus size={14} /> Aggiungi sede</button>}
            </div>
            <div data-testid="schedule-services">
              <Label>Prestazioni, durata e tariffe</Label>
              <p className="mb-2 text-xs text-slate-600">Tariffa 0 = solo pagamento in studio. Sopra 77,47 € il portale aggiunge 2 € di imposta di bollo.</p>
              <div className="space-y-2">{f.services.map((s, i) => <ServiceRow key={i} s={s} i={i} set={setAt("services", i)} onRemove={f.services.length > 1 ? removeAt("services", i) : null} />)}</div>
              {f.services.length < 20 && <button type="button" onClick={() => setF({ ...f, services: [...f.services, { name: "", duration: 30, price: 0 }] })} className="mt-2 flex items-center gap-1.5 text-sm font-medium text-night hover:underline" data-testid="schedule-add-service"><Plus size={14} /> Aggiungi prestazione</button>}
            </div>
            <div data-testid="schedule-billing">
              <Label>Dati fiscali per le ricevute</Label>
              <p className="mb-2 text-xs text-slate-600">Servono per attivare il pagamento online: compaiono su ogni ricevuta sanitaria.</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {BILLING.map(([k, l, ph]) => (
                  <label key={k} className={k === "address" || k === "note" ? "sm:col-span-2" : ""}><span className="mb-1 block text-xs text-slate-600">{l}</span>
                    <input value={f.billing?.[k] ?? ""} placeholder={ph} onChange={(e) => setF({ ...f, billing: { ...f.billing, [k]: k === "tax_code" ? e.target.value.toUpperCase() : e.target.value } })} className={`${inp} w-full`} data-testid={`schedule-billing-${k}`} />
                  </label>
                ))}
              </div>
            </div>
            <button onClick={save} disabled={busy} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-night text-sm font-semibold text-white disabled:opacity-60" data-testid="schedule-save-btn">{busy ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Salva impostazioni</button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
