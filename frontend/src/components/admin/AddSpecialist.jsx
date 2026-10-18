import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, UserPlus } from "lucide-react";
import { api, errMsg } from "@/lib/api";

const inp = "h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-night outline-none focus:border-night";
const EMPTY = { name: "", email: "", specialty: "", phone: "", order_number: "", clinics: [{ name: "Studio principale", address: "" }] };
const FIELDS = [["name", "Nome e titolo", "Dott. Mario Rossi"], ["specialty", "Specializzazione", "Es. Nutrizionista, Allergologo"], ["email", "Email", "medico@studio.it"],
  ["phone", "Telefono", "+39 ..."], ["order_number", "Iscrizione Ordine", "Es. RC 1234"]];

export const AddSpecialist = ({ onAdded }) => {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const setClinic = (i, k, v) => setF((x) => ({ ...x, clinics: x.clinics.map((c, j) => (j === i ? { ...c, [k]: v } : c)) }));
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api.createDoctor(f);
      toast.success(r.invited ? `Specialista censito: invito di attivazione inviato a ${f.email}` : "Specialista censito, ma l'email di invito non è partita: usi \"Reinvia invito\"");
      setF(EMPTY); setOpen(false); onAdded();
    } catch (err) { toast.error(errMsg(err)); }
    setBusy(false);
  };
  if (!open) return <button onClick={() => setOpen(true)} className="flex h-11 items-center gap-2 rounded-full bg-night px-5 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5" data-testid="admin-add-specialist-btn"><UserPlus size={16} /> Aggiungi specialista alla rete</button>;
  return (
    <form onSubmit={submit} className="rounded-3xl border border-slate-200 bg-white p-5" data-testid="admin-add-specialist-form">
      <div className="font-display text-2xl text-night">Nuovo specialista della rete</div>
      <p className="text-sm text-slate-600">Riceverà un'email con il link per scegliere la password. Orari, prestazioni, tariffe e dati fiscali li configura poi in autonomia.</p>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {FIELDS.map(([k, l, ph]) => (
          <label key={k}><span className="mb-1 block text-xs text-slate-600">{l}</span>
            <input value={f[k]} required={["name", "specialty", "email"].includes(k)} type={k === "email" ? "email" : "text"} placeholder={ph} onChange={(e) => setF({ ...f, [k]: e.target.value })} className={inp} data-testid={`admin-specialist-${k}`} /></label>
        ))}
      </div>
      <div className="mt-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600">Sedi di lavoro</div>
      <div className="mt-2 space-y-2">
        {f.clinics.map((c, i) => (
          <div key={i} className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[200px_1fr_auto]">
            <input value={c.name} required placeholder="Nome sede" onChange={(e) => setClinic(i, "name", e.target.value)} className={inp} data-testid={`admin-specialist-clinic-name-${i}`} />
            <input value={c.address} placeholder="Indirizzo" onChange={(e) => setClinic(i, "address", e.target.value)} className={`${inp} col-span-2 sm:col-span-1`} data-testid={`admin-specialist-clinic-address-${i}`} />
            {f.clinics.length > 1 && <button type="button" onClick={() => setF({ ...f, clinics: f.clinics.filter((_, j) => j !== i) })} className="row-start-1 grid h-11 w-11 place-items-center rounded-xl border border-slate-200 text-slate-600 hover:text-rose-700 sm:row-start-auto" aria-label="Rimuovi sede" data-testid={`admin-specialist-clinic-remove-${i}`}><Trash2 size={15} /></button>}
          </div>
        ))}
        {f.clinics.length < 6 && <button type="button" onClick={() => setF({ ...f, clinics: [...f.clinics, { name: "", address: "" }] })} className="flex items-center gap-1.5 text-sm font-medium text-night hover:underline" data-testid="admin-specialist-add-clinic"><Plus size={14} /> Aggiungi sede</button>}
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <button disabled={busy} className="flex h-11 items-center gap-2 rounded-full bg-night px-5 text-sm font-semibold text-white disabled:opacity-60" data-testid="admin-specialist-submit">{busy ? <Loader2 size={15} className="animate-spin" /> : <UserPlus size={15} />} Censisci e invia invito</button>
        <button type="button" onClick={() => setOpen(false)} className="h-11 rounded-full border border-slate-200 px-5 text-sm text-night" data-testid="admin-specialist-cancel">Annulla</button>
      </div>
    </form>
  );
};
