import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Save, Plus, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { api, errMsg, setClinics } from "@/lib/api";
import { ClinicCard, METHODS } from "./ClinicCard";

const inp = "h-10 rounded-xl border border-[var(--hair)] bg-[var(--surface)] px-3 text-sm text-[var(--fg)] outline-none focus:border-[var(--accent)]";
const BILLING = [["holder", "Intestatario", "Nome e cognome"], ["tax_code", "Codice fiscale", "16 caratteri"], ["vat_number", "Partita IVA", "11 cifre"],
  ["address", "Domicilio fiscale", "Via, CAP, Città"], ["note", "Nota in calce (facoltativa)", "Es. regime fiscale applicato"]];
const Label = ({ children }) => <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--fg2)]">{children}</div>;
const DEF_HOURS = { days: [1, 2, 3, 4, 5], start: "09:00", end: "18:00" };

const toForm = (s) => ({ clinics: (s.clinics ?? []).map((c) => ({ ...c, hours: s.hours?.[c.name] ?? DEF_HOURS })), services: s.services ?? [], billing: s.billing ?? {} });
const toBody = (f) => ({
  clinics: f.clinics.map(({ id, name, address, phone, email, color, header, methods, prices }) => ({ id: id ?? "", name: name.trim(), address, phone: phone ?? "", email: email ?? "", color: color ?? "", header: header ?? "", methods: methods ?? METHODS.map(([m]) => m),
    prices: Object.fromEntries(Object.entries(prices ?? {}).filter(([, v]) => v && (v.off || v.price != null || v.duration))) })),
  hours: Object.fromEntries(f.clinics.map((c) => [c.name.trim(), c.hours])),
  services: f.services.map((x) => ({ ...x, name: x.name.trim() })), billing: f.billing,
});

const ServiceRow = ({ s, i, set, onRemove }) => (
  <div className="grid grid-cols-[1fr_auto] items-end gap-2 rounded-xl border border-[var(--hair)] p-2 sm:grid-cols-[1fr_90px_100px_auto]" data-testid={`schedule-service-${i}`}>
    <input value={s.name} onChange={(e) => set({ ...s, name: e.target.value })} placeholder="Nome prestazione" className={`${inp} w-full`} data-testid={`schedule-service-name-${i}`} />
    <button type="button" onClick={onRemove} disabled={!onRemove} className="grid h-10 w-10 place-items-center rounded-xl text-[var(--fg2)] hover:text-[var(--alert)] disabled:opacity-30 sm:order-last" aria-label="Rimuovi prestazione" data-testid={`schedule-service-remove-${i}`}><Trash2 size={15} /></button>
    <label className="text-xs text-[var(--fg2)]">Minuti<input type="number" min={5} max={240} step={5} value={s.duration} onChange={(e) => set({ ...s, duration: Number(e.target.value) })} className={`${inp} w-full`} data-testid={`schedule-service-duration-${i}`} /></label>
    <label className="text-xs text-[var(--fg2)]">Tariffa €<input type="number" min={0} max={5000} step={1} value={s.price} onChange={(e) => set({ ...s, price: Number(e.target.value) })} className={`${inp} w-full`} data-testid={`schedule-service-price-${i}`} /></label>
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
    try { const s = await api.saveSchedule(toBody(f)); setF(toForm(s)); setClinics(s.clinics); toast.success("Impostazioni salvate: agenda, cassa e portale usano subito studi, orari, listini e pagamenti"); onClose(); }
    catch (e) { toast.error(errMsg(e)); }
    setBusy(false);
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto rounded-3xl bg-[var(--surface)] sm:max-w-2xl" data-testid="schedule-dialog">
        <DialogHeader>
          <DialogTitle className="font-display text-3xl font-normal text-[var(--fg)]">Studi, orari, listini e dati fiscali</DialogTitle>
          <DialogDescription className="text-sm text-[var(--fg2)]">Il Portale Paziente propone solo gli orari liberi delle sue sedi, in base alla durata della prestazione scelta.</DialogDescription>
        </DialogHeader>
        {!f ? <Loader2 className="animate-spin text-[var(--fg)]" /> : (
          <div className="space-y-6">
            <div data-testid="schedule-clinics">
              <Label>Studi, orari e intestazioni</Label>
              <p className="mb-2 text-xs text-[var(--fg2)]">Può aggiungere tutti gli studi che vuole. Rinominare uno studio non sposta appuntamenti e documenti già registrati con il nome precedente.</p>
              <div className="space-y-3">{f.clinics.map((c, i) => <ClinicCard key={c.id || i} c={c} i={i} services={f.services} set={setAt("clinics", i)} onRemove={f.clinics.length > 1 ? removeAt("clinics", i) : null} />)}</div>
              <button type="button" onClick={() => setF({ ...f, clinics: [...f.clinics, { name: "", address: "", hours: DEF_HOURS, methods: METHODS.map(([m]) => m), prices: {} }] })} className="mt-2 flex items-center gap-1.5 text-sm font-medium text-[var(--fg)] hover:underline" data-testid="schedule-add-clinic"><Plus size={14} /> Aggiungi studio</button>
            </div>
            <div data-testid="schedule-services">
              <Label>Prestazioni, durata e tariffe</Label>
              <p className="mb-2 text-xs text-[var(--fg2)]">Tariffa 0 = solo pagamento in studio. Sopra 77,47 € il portale aggiunge 2 € di imposta di bollo.</p>
              <div className="space-y-2">{f.services.map((s, i) => <ServiceRow key={i} s={s} i={i} set={setAt("services", i)} onRemove={f.services.length > 1 ? removeAt("services", i) : null} />)}</div>
              {f.services.length < 20 && <button type="button" onClick={() => setF({ ...f, services: [...f.services, { name: "", duration: 30, price: 0 }] })} className="mt-2 flex items-center gap-1.5 text-sm font-medium text-[var(--fg)] hover:underline" data-testid="schedule-add-service"><Plus size={14} /> Aggiungi prestazione</button>}
            </div>
            <div data-testid="schedule-billing">
              <Label>Dati fiscali per le ricevute</Label>
              <p className="mb-2 text-xs text-[var(--fg2)]">Servono per attivare il pagamento online: compaiono su ogni ricevuta sanitaria.</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {BILLING.map(([k, l, ph]) => (
                  <label key={k} className={k === "address" || k === "note" ? "sm:col-span-2" : ""}><span className="mb-1 block text-xs text-[var(--fg2)]">{l}</span>
                    <input value={f.billing?.[k] ?? ""} placeholder={ph} onChange={(e) => setF({ ...f, billing: { ...f.billing, [k]: k === "tax_code" ? e.target.value.toUpperCase() : e.target.value } })} className={`${inp} w-full`} data-testid={`schedule-billing-${k}`} />
                  </label>
                ))}
              </div>
            </div>
            <button onClick={save} disabled={busy} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[var(--accent)] text-sm font-semibold text-[var(--ink)] disabled:opacity-60" data-testid="schedule-save-btn">{busy ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Salva impostazioni</button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
