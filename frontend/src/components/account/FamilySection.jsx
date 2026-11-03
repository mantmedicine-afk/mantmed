import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Users, Plus, Loader2, PencilLine } from "lucide-react";
import { api, errMsg } from "@/lib/api";
import { Card, Field, inp, day } from "./ui";

const FIELDS = ["Nome e cognome", "Data di nascita", "Codice fiscale", "Allergie", "Altro"];

const Correction = ({ k, onDone }) => {
  const [f, setF] = useState({ field: FIELDS[0], value: "" });
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.portalNewThread({ patient_id: k.patient.id, owner_id: k.doctor.id, kind: "altro", subject: `Correzione scheda di ${k.patient.name}`,
        body: `Gentile dottore, chiedo di aggiornare la scheda di ${k.patient.name}: ${f.field.toLowerCase()} → ${f.value}`, fields: [{ label: "Dato", value: f.field }, { label: "Valore corretto", value: f.value }] });
      toast.success("Richiesta inviata allo studio: la trova nei Messaggi del portale");
      onDone();
    } catch (err) { toast.error(errMsg(err)); }
    setBusy(false);
  };
  return (
    <form onSubmit={submit} className="mt-3 grid grid-cols-1 gap-2 rounded-2xl bg-[var(--raised)] p-3 sm:grid-cols-[180px_1fr_auto]" data-testid={`family-correction-form-${k.patient.id}`}>
      <select value={f.field} onChange={(e) => setF({ ...f, field: e.target.value })} className={inp} data-testid={`family-correction-field-${k.patient.id}`}>{FIELDS.map((x) => <option key={x}>{x}</option>)}</select>
      <input required minLength={2} maxLength={300} value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} placeholder="Dato corretto" className={inp} data-testid={`family-correction-value-${k.patient.id}`} />
      <button disabled={busy} className="flex h-11 items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--ink)] disabled:opacity-60" data-testid={`family-correction-send-${k.patient.id}`}>{busy && <Loader2 size={14} className="animate-spin" />} Invia</button>
    </form>
  );
};

const Child = ({ k }) => {
  const [edit, setEdit] = useState(false);
  return (
    <li className="rounded-2xl border border-[var(--hair)] p-4" data-testid={`family-child-${k.patient.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><div className="font-display text-2xl text-[var(--fg)]">{k.patient.name}</div><div className="text-xs text-[var(--fg2)]">Nato/a il {day(k.patient.birth_date)} · {k.doctor.name} ({k.doctor.specialty})</div></div>
        <button onClick={() => setEdit(!edit)} className="flex h-9 items-center gap-1.5 rounded-full border border-[var(--hair)] px-3 text-xs font-medium text-[var(--fg)] hover:border-[var(--accent)]" data-testid={`family-edit-${k.patient.id}`}><PencilLine size={13} /> Richiedi modifica</button>
      </div>
      {edit && <Correction k={k} onDone={() => setEdit(false)} />}
    </li>
  );
};

export const FamilySection = () => {
  const [kids, setKids] = useState(null);
  const [cf, setCf] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api.portalMe().then((d) => setKids(Array.isArray(d?.children) ? d.children : [])).catch(() => setKids([])), []);
  useEffect(() => { load(); }, [load]);
  const add = async (e) => {
    e.preventDefault();
    setBusy(true);
    try { const r = await api.portalAddChild(cf); if (r.linked) { toast.success("Figlio collegato"); setCf(""); load(); } else toast.message("Nessuna cartella corrisponde: lo studio deve registrare il codice fiscale del bambino con la sua email."); }
    catch (err) { toast.error(errMsg(err)); }
    setBusy(false);
  };
  return (
    <Card id="account-family" icon={Users} title="Nucleo familiare" text="I figli collegati al suo profilo. Le schede cliniche sono tenute dal medico: per correggere un dato invii una richiesta allo studio.">
      {kids === null ? <Loader2 className="animate-spin text-[var(--fg)]" /> : (
        <ul className="space-y-2">{kids.length ? kids.map((k) => <Child key={`${k.patient.id}-${k.doctor.id}`} k={k} />) : <li className="text-sm text-[var(--fg2)]" data-testid="family-empty">Nessun figlio collegato.</li>}</ul>
      )}
      <form onSubmit={add} className="mt-5 flex flex-col gap-2 sm:flex-row" data-testid="family-add-form">
        <input value={cf} onChange={(e) => setCf(e.target.value.toUpperCase().slice(0, 16))} placeholder="Codice fiscale del figlio" className={`${inp} font-mono uppercase sm:max-w-xs`} data-testid="family-add-cf" />
        <button disabled={busy || cf.length !== 16} className="flex h-11 items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--ink)] disabled:opacity-50" data-testid="family-add-btn">{busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Aggiungi figlio</button>
      </form>
    </Card>
  );
};
