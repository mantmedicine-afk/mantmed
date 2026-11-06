import { inp, Label } from "./ui";

const F = ({ label, k, v, set, ph, upper, testid }) => (
  <div>
    <Label htmlFor={testid}>{label}</Label>
    <input id={testid} value={v[k] ?? ""} placeholder={ph} onChange={(e) => set({ [k]: upper ? e.target.value.toUpperCase().replace(/\s/g, "") : e.target.value })} className={inp} data-testid={testid} />
  </div>
);

export const PersonFields = ({ f, set }) => (
  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" data-testid="invoice-person-fields">
    <F label="Genitore che paga · nome e cognome" k="payer_name" v={f} set={set} ph="Es. Giulia Ricci" testid="invoice-payer-name" />
    <F label="Codice fiscale di chi paga" k="payer_cf" v={f} set={set} ph="16 caratteri" upper testid="invoice-payer-cf" />
  </div>
);

export const CompanyFields = ({ company, set }) => {
  const up = (patch) => set({ company: { ...company, ...patch } });
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" data-testid="invoice-company-fields">
      <div className="sm:col-span-2"><F label="Ragione sociale" k="name" v={company} set={up} ph="Es. ASD Calcio Gallico" testid="invoice-company-name" /></div>
      <F label="Partita IVA" k="vat" v={company} set={up} ph="11 cifre" upper testid="invoice-company-vat" />
      <F label="Codice fiscale (se diverso)" k="cf" v={company} set={up} ph="Facoltativo" upper testid="invoice-company-cf" />
      <div className="sm:col-span-2"><F label="Sede" k="address" v={company} set={up} ph="Via, CAP Città (Prov)" testid="invoice-company-address" /></div>
      <F label="Codice destinatario SdI" k="sdi_code" v={company} set={up} ph="7 caratteri" upper testid="invoice-company-sdi" />
      <F label="oppure PEC" k="pec" v={company} set={up} ph="fatture@pec.it" testid="invoice-company-pec" />
    </div>
  );
};

export const PatientFields = ({ f, set, patients }) => {
  const q = (f.patient_name || "").trim().toLowerCase();
  const hits = q.length >= 2 && !f.patient_id ? patients.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 5) : [];
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" data-testid="invoice-patient-fields">
      <div className="relative">
        <Label htmlFor="invoice-patient-name">Paziente (prestazione eseguita su)</Label>
        <input id="invoice-patient-name" value={f.patient_name} onChange={(e) => set({ patient_name: e.target.value, patient_id: null })} placeholder="Nome del paziente" className={inp} autoComplete="off" data-testid="invoice-patient-name" />
        {hits.length > 0 && (
          <div className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-xl border border-[var(--hair)] bg-[var(--surface)] shadow-[var(--shadow)]" data-testid="invoice-patient-suggestions">
            {hits.map((p) => <button key={p.id} type="button" onClick={() => set({ pick: p.id })} className="block w-full px-3 py-2 text-left text-sm text-[var(--fg)] hover:bg-[var(--raised)]" data-testid={`invoice-patient-pick-${p.id}`}>{p.name}</button>)}
          </div>
        )}
      </div>
      <F label="Codice fiscale paziente" k="patient_cf" v={f} set={set} ph="Serve per il Sistema TS" upper testid="invoice-patient-cf" />
    </div>
  );
};
