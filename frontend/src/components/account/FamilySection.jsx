import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Users, Plus, Loader2, PencilLine, UserPlus, X, Receipt } from "lucide-react";
import { api, http, errMsg, eur } from "@/lib/api";
import { Card, inp, day } from "./ui";

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

// Il paziente maggiorenne delega un familiare: consenso esplicito, revocabile in ogni momento
const Delegations = ({ k, items, onChange }) => {
  const [f, setF] = useState({ name: "", email: "", consent: false });
  const [busy, setBusy] = useState(false);
  const add = async (e) => {
    e.preventDefault();
    setBusy(true);
    try { await http.post("/portal/access/delegations", { ...f, patient_id: k.patient.id }); toast.success("Delega attiva: il familiare vedrà la cartella al prossimo accesso"); setF({ name: "", email: "", consent: false }); onChange(); }
    catch (err) { toast.error(errMsg(err)); }
    setBusy(false);
  };
  const revoke = async (g) => {
    try { await http.delete(`/portal/access/delegations/${g.id}`); toast.success("Delega revocata"); onChange(); } catch (err) { toast.error(errMsg(err)); }
  };
  const mine = items.filter((g) => !g.revoked_at);
  return (
    <div className="mt-3 rounded-2xl bg-[var(--raised)] p-3" data-testid={`family-delegations-${k.patient.id}`}>
      <div className="text-sm font-semibold text-[var(--fg)]">Familiari delegati</div>
      <ul className="mt-2 space-y-1.5">
        {mine.length === 0 && <li className="text-xs text-[var(--fg2)]">Nessuna delega attiva.</li>}
        {mine.map((g) => (
          <li key={g.id} className="flex items-center justify-between gap-2 text-sm text-[var(--fg)]" data-testid={`family-delegation-${g.id}`}>
            <span>{g.name} <span className="text-[var(--fg2)]">{g.email} · dal {day(g.created_at)}</span></span>
            <button onClick={() => revoke(g)} className="flex items-center gap-1 rounded-full border border-[var(--hair)] px-3 py-1 text-xs font-semibold" data-testid={`family-delegation-revoke-${g.id}`}><X size={12} /> Revoca</button>
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="mt-3 grid gap-2 sm:grid-cols-2" data-testid={`family-delegate-form-${k.patient.id}`}>
        <input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Nome e cognome del familiare" className={inp} data-testid="family-delegate-name" />
        <input required type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="Email del suo account MantMed" className={inp} data-testid="family-delegate-email" />
        <label className="flex items-start gap-2 text-xs leading-relaxed text-[var(--fg2)] sm:col-span-2">
          <input type="checkbox" checked={f.consent} onChange={(e) => setF({ ...f, consent: e.target.checked })} className="mt-0.5 h-4 w-4" data-testid="family-delegate-consent" />
          Acconsento che questa persona veda la mia cartella clinica nel Portale (referti, appuntamenti, documenti). Posso revocare la delega in ogni momento.
        </label>
        <button disabled={busy || !f.consent} className="flex h-11 items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--ink)] disabled:opacity-50 sm:col-span-2" data-testid="family-delegate-btn">{busy ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />} Delega l'accesso</button>
      </form>
    </div>
  );
};

const Child = ({ k, delegations, onChange }) => {
  const [edit, setEdit] = useState(false);
  const own = k.relation === "paziente";
  return (
    <li className="rounded-2xl border border-[var(--hair)] p-4" data-testid={`family-child-${k.patient.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-display text-2xl text-[var(--fg)]">{k.patient.name}</div>
          <div className="text-xs text-[var(--fg2)]">Nato/a il {day(k.patient.birth_date)} · {k.doctor.name} ({k.doctor.specialty})</div>
          <div className="mt-1 inline-flex rounded-full bg-[var(--sel)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--fg)]" data-testid={`family-relation-${k.patient.id}`}>{own ? "La sua cartella" : k.relation_label}</div>
        </div>
        <button onClick={() => setEdit(!edit)} className="flex h-9 items-center gap-1.5 rounded-full border border-[var(--hair)] px-3 text-xs font-medium text-[var(--fg)] hover:border-[var(--accent)]" data-testid={`family-edit-${k.patient.id}`}><PencilLine size={13} /> Richiedi modifica</button>
      </div>
      {edit && <Correction k={k} onDone={() => setEdit(false)} />}
      {own && <Delegations k={k} items={delegations} onChange={onChange} />}
    </li>
  );
};

const FiscalOnly = ({ items }) => (
  <div className="mt-5 space-y-2" data-testid="family-fiscal-only">
    <div className="text-sm font-semibold text-[var(--fg)]">Accesso chiuso al compimento dei 18 anni</div>
    <p className="text-xs leading-relaxed text-[var(--fg2)]">Restano visibili solo le ricevute che ha pagato, senza contenuti clinici. Il paziente può delegarla di nuovo dal suo account.</p>
    {items.map((x) => (
      <div key={x.patient.id} className="rounded-2xl border border-[var(--hair)] p-3" data-testid={`family-fiscal-${x.patient.id}`}>
        <div className="text-sm font-semibold text-[var(--fg)]">{x.patient.name} <span className="font-normal text-[var(--fg2)]">· {x.doctor.name} · chiuso il {day(x.closed_at)}</span></div>
        <ul className="mt-1.5 space-y-1">
          {x.receipts.length === 0 && <li className="text-xs text-[var(--fg2)]">Nessuna ricevuta pagata da lei.</li>}
          {x.receipts.map((r) => (
            <li key={r.id}><a href={`${process.env.REACT_APP_BACKEND_URL}/api/portal/receipts/${r.id}/pdf`} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-[var(--fg)] underline underline-offset-4" data-testid={`family-fiscal-receipt-${r.id}`}><Receipt size={13} /> Ricevuta {r.receipt_no} · {r.service} · {eur(r.amount)}</a></li>
          ))}
        </ul>
      </div>
    ))}
  </div>
);

export const FamilySection = () => {
  const [me, setMe] = useState(null);
  const [acc, setAcc] = useState({ delegations: [] });
  const [cf, setCf] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    api.portalMe().then((d) => setMe({ children: Array.isArray(d?.children) ? d.children : [], fiscal: d?.fiscal_only ?? [] })).catch(() => setMe({ children: [], fiscal: [] }));
    http.get("/portal/access").then((r) => setAcc(r.data)).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);
  const add = async (e) => {
    e.preventDefault();
    setBusy(true);
    try { const r = await api.portalAddChild(cf); if (r.linked) { toast.success("Cartella collegata"); setCf(""); load(); } else toast.message("Nessuna cartella corrisponde: lo studio deve registrare il codice fiscale del paziente con la sua email."); }
    catch (err) { toast.error(errMsg(err)); }
    setBusy(false);
  };
  return (
    <Card id="account-family" icon={Users} title="Cartelle collegate" text="La sua cartella e quelle delle persone che assiste. Le schede cliniche sono tenute dal medico: per correggere un dato invii una richiesta allo studio.">
      {me === null ? <Loader2 className="animate-spin text-[var(--fg)]" /> : (
        <ul className="space-y-2">{me.children.length ? me.children.map((k) => <Child key={`${k.patient.id}-${k.doctor.id}`} k={k} delegations={acc.delegations.filter((g) => g.patient_id === k.patient.id)} onChange={load} />) : <li className="text-sm text-[var(--fg2)]" data-testid="family-empty">Nessuna cartella collegata.</li>}</ul>
      )}
      {me?.fiscal?.length > 0 && <FiscalOnly items={me.fiscal} />}
      <form onSubmit={add} className="mt-5 flex flex-col gap-2 sm:flex-row" data-testid="family-add-form">
        <input value={cf} onChange={(e) => setCf(e.target.value.toUpperCase().slice(0, 16))} placeholder="Codice fiscale del paziente" className={`${inp} font-mono uppercase placeholder:font-sans placeholder:normal-case sm:max-w-xs`} data-testid="family-add-cf" />
        <button disabled={busy || cf.length !== 16} className="flex h-11 items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--ink)] disabled:opacity-50" data-testid="family-add-btn">{busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Collega cartella</button>
      </form>
    </Card>
  );
};
