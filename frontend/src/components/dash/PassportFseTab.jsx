import { useState } from "react";
import { Eye, Users, FileCheck2, FileX2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { FSE_LABEL } from "./ReportStates";

const box = "rounded-3xl border border-[var(--hair)] bg-[var(--surface)] p-5";
const STATUS = { attivo: "Attivo: il genitore ha un account", invitato: "Genitore invitato: in attesa di registrazione", non_attivo: "Non attivo" };
const visible = (c) => (c.portal_published || c.report_sent_at) && !c.obscured && !c.portal_hidden_by_parent;
const when = (c) => new Date(c.created_at).toLocaleDateString("it-IT");

const ParentPreview = ({ patient, items, onClose }) => (
  <div className="fixed inset-0 z-[60] grid place-items-center bg-[var(--scrim)] p-5" role="dialog" aria-modal="true" aria-label="Anteprima genitore" data-testid="portal-preview">
    <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-[var(--bg)] p-6 text-[var(--fg)]">
      <div className="text-[11px] uppercase tracking-[0.22em] text-[var(--fg2)]">Come lo vede il genitore</div>
      <h3 className="mt-1 text-2xl font-semibold">Passaporto di {patient.name}</h3>
      <p className="mt-1 text-sm text-[var(--fg2)]">{patient.age_label} · curve di crescita e referti pubblicati</p>
      <ul className="mt-4 space-y-2">
        {items.length ? items.map((c) => <li key={c.id} className="rounded-2xl bg-[var(--surface)] p-4 text-sm"><div className="text-xs text-[var(--fg2)]">{when(c)} · {c.clinic}</div><div className="font-semibold">{c.note?.motivo_visita || "Visita"}</div></li>)
          : <li className="text-sm text-[var(--fg2)]">Nessun referto visibile.</li>}
      </ul>
      <button onClick={onClose} className="mt-5 h-11 w-full rounded-full border border-[var(--hair)] text-sm font-medium" data-testid="portal-preview-close">Chiudi anteprima</button>
    </div>
  </div>
);

export const PassportFseTab = ({ data, onEdit, onTab }) => {
  const [preview, setPreview] = useState(false);
  const p = data.patient;
  const cons = data.consultations ?? [];
  const shown = cons.filter(visible);
  const hidden = cons.filter((c) => !visible(c));
  const fse = data.fse ?? { missing: [], consent: false };
  const sends = cons.filter((c) => c.fse && c.fse.status);
  return (
    <div className="grid gap-4 lg:grid-cols-2" data-testid="passport-fse-tab">
      <section className={box} data-testid="passport-portal-box">
        <div className="text-[11px] uppercase tracking-[0.22em] text-[var(--fg2)]">Passaporto sanitario</div>
        <div className="mt-1 text-xl font-semibold" data-testid="passport-portal-status">{STATUS[data.portal?.status] ?? "Non attivo"}</div>
        <button onClick={() => setPreview(true)} className="mt-3 flex items-center gap-2 rounded-full border border-[var(--hair)] px-4 py-2 text-sm font-medium" data-testid="passport-portal-preview-btn"><Eye size={15} /> Vedi come il genitore</button>
        <div className="mt-5 text-sm font-semibold">Referti visibili ({shown.length})</div>
        <ul className="mt-1 space-y-1 text-sm" data-testid="passport-portal-visible">{shown.map((c) => <li key={c.id} className="flex items-center gap-2"><FileCheck2 size={14} className="text-[var(--ok)]" /> {when(c)} · {c.note?.motivo_visita || "Visita"}</li>)}</ul>
        <div className="mt-4 text-sm font-semibold">Referti nascosti ({hidden.length})</div>
        <ul className="mt-1 space-y-1 text-sm text-[var(--fg2)]" data-testid="passport-portal-hidden">{hidden.map((c) => <li key={c.id} className="flex items-center gap-2"><FileX2 size={14} /> {when(c)} · {c.note?.motivo_visita || "Visita"}{c.obscured ? " · oscurato" : c.portal_hidden_by_parent ? " · nascosto dal genitore" : ""}</li>)}</ul>
        <div className="mt-4 flex items-center gap-2 text-sm font-semibold"><Users size={14} /> Condivisioni attive del genitore</div>
        <ul className="mt-1 text-sm text-[var(--fg2)]" data-testid="passport-portal-shares">{data.portal?.shares?.length ? data.portal.shares.map((s) => <li key={s.id}>Dal {new Date(s.signed_at).toLocaleDateString("it-IT")}{s.specialists?.filter(Boolean).length ? ` · ${s.specialists.filter(Boolean).join(", ")}` : ""}</li>) : <li>Nessuna condivisione attiva.</li>}</ul>
      </section>
      <section className={box} data-testid="passport-fse-box">
        <div className="text-[11px] uppercase tracking-[0.22em] text-[var(--fg2)]">Fascicolo Sanitario Elettronico 2.0 · simulazione</div>
        <div className="mt-2 flex items-center gap-2 text-sm" data-testid="fse-consent-state">{fse.consent ? <CheckCircle2 size={15} className="text-[var(--ok)]" /> : <AlertTriangle size={15} className="text-[var(--late)]" />} Consenso all'alimentazione: <b>{fse.consent ? "sì" : "no"}</b>
          {!fse.consent && <button onClick={() => onTab("privacy")} className="ml-1 font-medium underline underline-offset-4" data-testid="fse-consent-link">Registra</button>}</div>
        <div className="mt-3 text-sm font-semibold">Dati obbligatori</div>
        {fse.missing.length ? <div className="mt-1 text-sm" data-testid="fse-missing"><span className="text-[var(--late)]">Mancano: {fse.missing.join(", ")}</span> <button onClick={() => onEdit(p)} className="ml-1 font-medium underline underline-offset-4" data-testid="fse-complete-link">Completa i dati</button></div>
          : <div className="mt-1 flex items-center gap-2 text-sm" data-testid="fse-complete"><CheckCircle2 size={15} className="text-[var(--ok)]" /> Codice fiscale, anagrafica e genitore/tutore completi</div>}
        <div className="mt-4 text-sm font-semibold">Invii</div>
        <ul className="mt-1 divide-y divide-[var(--sel)] text-sm" data-testid="fse-sends">
          {sends.length ? sends.map((c) => <li key={c.id} className="flex justify-between gap-3 py-1.5"><span>{when(c)} · {c.note?.motivo_visita || "Visita"}</span><span className="font-medium">{FSE_LABEL[c.obscured ? "oscurato" : c.fse.status]}</span></li>) : <li className="py-1.5 text-[var(--fg2)]">Nessun invio: i referti entrano in coda alla firma.</li>}
        </ul>
      </section>
      {preview && <ParentPreview patient={p} items={shown} onClose={() => setPreview(false)} />}
    </div>
  );
};
