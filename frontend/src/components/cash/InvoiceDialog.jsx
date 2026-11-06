import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Building2, Loader2, User, FileText } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { api, errMsg, eur, CLINIC_INFO } from "@/lib/api";
import { DateInput } from "@/components/ui/it-date";
import { inp, Label, Seg, PAY_METHODS, btnMain, btnGhost } from "./ui";
import { LinesEditor } from "./LinesEditor";
import { InvoiceTotals } from "./InvoiceTotals";
import { PersonFields, CompanyFields, PatientFields } from "./PartyFields";

const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
const blank = (s) => ({ patient_name: "", patient_id: null, patient_cf: "", payer_name: "", payer_cf: "", date: today(), clinic: s?.clinics?.[0] ?? "",
  client_type: "persona", company: {}, lines: [{ description: "", amount: "", vat: "esente" }], method: "", paid: true,
  stamp_charge: s?.billing?.stamp_charge ?? "paziente", sts_opposition: false, consultation_id: null });
const num = (v) => Number(String(v).replace(",", ".")) || 0;
const fromDraft = (d) => ({ ...d, lines: d.lines.map((l) => ({ ...l, amount: l.amount || "" })) });

const Check = ({ checked, onChange, children, testid }) => (
  <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-[var(--hair)] p-3 text-sm text-[var(--fg)]">
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--accent)]" data-testid={testid} />
    <span>{children}</span>
  </label>
);

export const InvoiceDialog = ({ open, source, settings, onClose, onSaved }) => {
  const [f, setF] = useState(blank(settings));
  const [t, setT] = useState(null);
  const [patients, setPatients] = useState([]);
  const [busy, setBusy] = useState(false);
  const set = (patch) => {
    if (patch.pick) return api.invoiceDraft({ patient_id: patch.pick }).then((d) => setF((x) => ({ ...x, ...fromDraft(d), lines: x.lines, date: x.date, clinic: x.clinic || d.clinic }))).catch(() => {});
    setF((x) => ({ ...x, ...patch }));
  };

  useEffect(() => {
    if (!open) return;
    setF({ ...blank(settings) });
    api.patients().then(setPatients).catch(() => setPatients([]));
    if (source?.consultation_id || source?.patient_id) api.invoiceDraft(source).then((d) => setF((x) => ({ ...x, ...fromDraft(d), clinic: d.clinic || x.clinic }))).catch(() => {});
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const key = JSON.stringify([f.lines, f.client_type, f.stamp_charge]);
  useEffect(() => {
    if (!open) return undefined;
    const id = setTimeout(() => api.invoicePreview({ client_type: f.client_type, stamp_charge: f.stamp_charge, lines: f.lines.map((l) => ({ ...l, description: l.description || "-", amount: num(l.amount) })) }).then(setT).catch(() => {}), 250);
    return () => clearTimeout(id);
  }, [key, open]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!f.method) return toast.error("Scelga il metodo di pagamento");
    setBusy(true);
    try {
      const inv = await api.createInvoice({ ...f, lines: f.lines.map((l) => ({ ...l, amount: num(l.amount) })) });
      toast.success(`Fattura ${inv.number} emessa · ${eur(inv.totals.due)}`);
      onSaved?.(inv);
      onClose();
    } catch (e) { toast.error(errMsg(e)); }
    setBusy(false);
  };
  const company = f.client_type === "azienda";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] w-[calc(100vw-1.5rem)] overflow-y-auto overscroll-contain rounded-3xl bg-[var(--surface)] sm:max-w-3xl" data-testid="invoice-dialog" data-lenis-prevent>
        <DialogHeader>
          <DialogTitle className="font-display text-3xl font-normal text-[var(--fg)]">Nuova fattura <span className="italic text-[var(--fg2)]">/ ricevuta</span></DialogTitle>
          <DialogDescription className="text-[var(--fg2)]">Numero {settings?.next_number ?? "—"} · numerazione unica per anno, comune a tutti gli studi.</DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr]">
            <div><Label htmlFor="invoice-date">Data</Label><DateInput id="invoice-date" value={f.date} max={today()} onChange={(e) => set({ date: e.target.value })} className={inp} data-testid="invoice-date" /></div>
            <div><Label htmlFor="invoice-clinic">Studio</Label>
              <select id="invoice-clinic" value={f.clinic} onChange={(e) => set({ clinic: e.target.value, ...(CLINIC_INFO[e.target.value]?.methods && !CLINIC_INFO[e.target.value].methods.includes(f.method) ? { method: "" } : {}) })} className={inp} data-testid="invoice-clinic">{(settings?.clinics ?? []).map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
          </div>
          <PatientFields f={f} set={set} patients={patients} />
          <div>
            <Label>Intestatario della fattura</Label>
            <Seg value={f.client_type} onChange={(v) => set({ client_type: v })} testid="invoice-client-type" options={[{ id: "persona", label: "Persona fisica", icon: User }, { id: "azienda", label: "Azienda o ente", icon: Building2 }]} />
            <p className="mt-1.5 text-xs text-[var(--fg2)]" data-testid="invoice-channel-note">{company ? "Fattura elettronica XML per il Sistema di Interscambio (SdI) · per ora in SIMULAZIONE." : "Fattura in PDF, non inviata al Sistema di Interscambio (divieto per le prestazioni sanitarie a persone fisiche)."}</p>
          </div>
          {company ? <CompanyFields company={f.company} set={set} /> : <PersonFields f={f} set={set} />}
          <div><Label>Prestazioni</Label><LinesEditor lines={f.lines} tariffs={settings?.tariffs ?? []} regime={settings?.billing?.regime} onChange={(lines) => set({ lines })} /></div>
          <div>
            <Label>Metodo di pagamento (obbligatorio)</Label>
            <Seg value={f.method} onChange={(v) => set({ method: v })} testid="invoice-method" options={PAY_METHODS.filter((m) => !CLINIC_INFO[f.clinic]?.methods || CLINIC_INFO[f.clinic].methods.includes(m.id))} />
            {f.method === "contanti" && <div className="mt-2 flex items-start gap-2 rounded-2xl border border-[var(--alert)] p-3 text-sm text-[var(--alert)]" role="alert" data-testid="invoice-cash-warning"><AlertTriangle size={16} className="mt-0.5 shrink-0" /> Pagamento non tracciabile: il paziente non potrà detrarre la spesa.</div>}
          </div>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_1fr]">
            <div className="space-y-2">
              {t?.stamp > 0 && <div><Label>Bollo di 2 € (totale esente oltre 77,47 €)</Label><Seg value={f.stamp_charge} onChange={(v) => set({ stamp_charge: v })} testid="invoice-stamp-charge" options={[{ id: "paziente", label: "A carico del paziente" }, { id: "medico", label: "A carico del medico" }]} /></div>}
              {!company && <Check checked={f.sts_opposition} onChange={(v) => set({ sts_opposition: v })} testid="invoice-sts-opposition">Il paziente si oppone all'invio dei dati al Sistema TS <span className="block text-xs text-[var(--fg2)]">Verrà riportato sulla fattura e la spesa non sarà comunicata.</span></Check>}
              <Check checked={f.paid} onChange={(v) => set({ paid: v })} testid="invoice-paid">Già incassata <span className="block text-xs text-[var(--fg2)]">Se la togli, resta «da incassare» finché non la segni come pagata.</span></Check>
            </div>
            <InvoiceTotals t={t} clientType={f.client_type} />
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={onClose} className={btnGhost} data-testid="invoice-cancel-btn">Annulla</button>
            <button type="button" onClick={save} disabled={busy} className={btnMain} data-testid="invoice-save-btn">{busy ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />} Emetti fattura</button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
