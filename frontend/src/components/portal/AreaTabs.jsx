import { useState } from "react";
import { toast } from "sonner";
import { HeartPulse, Users, ShieldCheck, Stethoscope, FileSignature, CalendarHeart, ClipboardList, FileDown, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { errMsg } from "@/lib/api";
import { api } from "@/lib/api";
import { PrevisitCard } from "@/components/portal/PrevisitCard";
import { ConsentBanner } from "@/components/portal/ConsentSign";
import { SignedDocsList } from "@/components/signature/SignedDocs";

const day = (iso) => new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
const Label = ({ icon: I, children }) => <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--fg2)]"><I size={14} strokeWidth={1.5} /> {children}</div>;
export const DlBtn = ({ onClick, label, testid, dark = true }) => {
  const [busy, setBusy] = useState(false);
  const run = async () => { setBusy(true); try { await onClick(); toast.success(`${label} scaricato`); } catch (e) { toast.error(errMsg(e)); } setBusy(false); };
  return <button onClick={run} disabled={busy} className={`flex h-10 items-center gap-2 rounded-full px-4 text-sm font-medium transition-transform hover:-translate-y-0.5 disabled:opacity-60 ${dark ? "bg-[var(--accent)] text-[var(--ink)]" : "bg-[var(--surface)] text-[var(--fg)] ring-1 ring-[var(--sel)]"}`} data-testid={testid}>{busy ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} strokeWidth={1.5} />} {label}</button>;
};

const card = "rounded-3xl bg-[var(--surface)] p-5 ring-1 ring-[var(--sel)]";
const CP = { ottimo: "bg-[var(--sel)] text-[var(--ok)]", buono: "bg-sky-100 text-sky-900" };

/** Scheda "Bilanci di salute": bilanci in studio, questionari dei genitori, prossimo bilancio e questionario pre-visita. */
export const BilanciTab = ({ g, reports, onChange }) => {
  const cps = g.flatMap((c) => c.checkpoints ?? []).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const visits = reports.filter((r) => /bilancio/i.test(`${r.template_name} ${r.motivo}`));
  const next = cps.find((k) => k.next)?.next;
  const ped = g.find((c) => /pediatr|neonatolog/i.test(c.doctor.specialty));
  return (
    <div className="space-y-5" data-testid="docs-bilanci">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-3xl border border-[var(--hair)] bg-[var(--sel)] p-5" data-testid="docs-bilanci-next"><Label icon={CalendarHeart}>Prossimo bilancio</Label><div className="mt-2 font-display text-2xl text-[var(--fg)]">{next || "Lo indicherà la pediatra al prossimo controllo"}</div></div>
        {ped ? <PrevisitCard child={ped} onDone={onChange} /> : <div className={card}><p className="text-sm text-[var(--fg2)]">I bilanci di salute sono seguiti dal pediatra.</p></div>}
      </div>
      <Label icon={HeartPulse}>Bilanci svolti in studio</Label>
      {visits.length ? visits.map((r) => (
        <div key={r.id} className={`${card} flex flex-wrap items-center justify-between gap-3`} data-testid={`docs-bilancio-visit-${r.id}`}>
          <div><div className="text-xs text-[var(--fg2)]">{day(r.created_at)} · {r.doctor}</div><div className="font-display text-xl text-[var(--fg)]">{r.template_name || r.motivo}</div>{r.follow_up && <div className="text-sm text-[var(--fg2)]">{r.follow_up}</div>}</div>
          <DlBtn onClick={() => api.portalReport(r.id)} label="Referto PDF" testid={`docs-bilancio-pdf-${r.id}`} />
        </div>
      )) : <p className="text-sm text-[var(--fg2)]" data-testid="docs-bilanci-empty">Nessun bilancio di salute pubblicato.</p>}
      <Label icon={ClipboardList}>Questionari e check-point</Label>
      <div className="grid gap-2 sm:grid-cols-2">
        {cps.map((k) => (
          <div key={k.id} className={card} data-testid={`docs-checkpoint-${k.id}`}>
            <div className="flex items-start justify-between gap-2"><div className="text-xs text-[var(--fg2)]">{day(k.created_at)}{k.source === "portale" ? " · compilato da voi" : " · in studio"}</div>{k.status && <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize ${CP[k.status] ?? "bg-[var(--sel)] text-[var(--fg)]"}`}>{k.status}</span>}</div>
            <div className="mt-1 font-medium text-[var(--fg)]">{k.source === "portale" ? "Questionario pre-visita" : "Bilancio"} {k.band_label}</div>
          </div>
        ))}
        {!cps.length && <p className="text-sm text-[var(--fg2)]">Nessun questionario compilato.</p>}
      </div>
    </div>
  );
};

const ConsentRow = ({ c }) => (
  <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-[var(--raised)] px-4 py-3 text-sm" data-testid={`docs-consent-${c.id}`}>
    <div><div className="font-medium text-[var(--fg)]">{c.version}</div><div className="text-[var(--fg2)]">Firmato il {day(c.signed_at)} da {c.signer_name}{c.email_reports ? " · referti via email" : ""}</div></div>
    <span className={`rounded-full px-3 py-1 text-[11px] font-semibold ${c.revoked_at ? "bg-[var(--hair)] text-[var(--fg2)]" : "bg-[var(--sel)] text-[var(--ok)]"}`}>{c.revoked_at ? `Revocato il ${day(c.revoked_at)}` : "Attivo"}</span>
  </div>
);

const FamilyMember = ({ g, onChange }) => {
  const p = g[0].patient;
  const [hist, setHist] = useState(false);
  const f = p.sex === "F";
  const consents = g.flatMap((c) => c.consents ?? []);
  const active = consents.filter((c) => !c.revoked_at);
  const shown = hist ? consents : active;
  return (
    <article className={`${card} space-y-5 sm:p-7`} data-testid={`docs-family-${p.id}`}>
      <div className="flex flex-wrap items-center gap-4">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-[var(--raised)] font-display text-2xl text-[var(--fg)]">{p.name[0]}</span>
        <div><div className="font-display text-3xl text-[var(--fg)]">{p.name}</div><div className="text-sm text-[var(--fg2)]">{f ? "Nata" : "Nato"} il {day(p.birth_date)}</div></div>
      </div>
      <div><Label icon={Stethoscope}>{f ? "Medici che la seguono" : "Medici che lo seguono"}</Label>
        <div className="mt-2 flex flex-wrap gap-2">{g.map((c) => <span key={c.doctor.id} className="rounded-full bg-[var(--bg)] px-4 py-2 text-sm text-[var(--fg)]" data-testid={`docs-family-doctor-${c.doctor.id}`}>{c.doctor.name} · <span className="text-[var(--accent)]">{c.doctor.specialty}</span></span>)}</div></div>
      {g.map((c) => <ConsentBanner key={`b-${c.doctor.id}`} child={c} onSigned={onChange} />)}
      <div className="space-y-2"><Label icon={ShieldCheck}>Consensi privacy</Label>
        {shown.map((c) => <ConsentRow key={c.id} c={c} />)}
        {!shown.length && <p className="text-sm text-[var(--fg2)]">{consents.length ? "Nessun consenso attivo." : "Nessun consenso registrato."}</p>}
        {consents.length > active.length && <button onClick={() => setHist((h) => !h)} className="text-sm font-medium text-[var(--accent)] hover:underline" data-testid={`docs-consent-history-${p.id}`}>{hist ? "Mostra solo i consensi attivi" : `Mostra storico (${consents.length - active.length} revocati)`}</button>}
        <p className="text-xs text-[var(--fg2)]">Per revocare o modificare un consenso contatti lo studio del medico: la revoca viene registrata in cartella.</p></div>
      <div className="space-y-2"><Label icon={FileSignature}>Documenti firmati</Label>
        <SignedDocsList docs={g.flatMap((c) => c.documents ?? [])} download={api.portalDocumentPdf} testId={`docs-family-signed-${p.id}`} empty="Nessun documento firmato." /></div>
      <Link to="/portale/documenti?tab=condivisione" className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--accent)] hover:underline" data-testid={`docs-family-team-link-${p.id}`}><ShieldCheck size={14} /> Gestisci condivisione e deleghe specialistiche</Link>
    </article>
  );
};

/** Scheda "Famiglia e Consensi": figli collegati, medici, consensi, documenti firmati, condivisione e collegamento di un nuovo figlio. */
export const FamilyTab = ({ groups, onChange, addChild }) => (
  <div className="space-y-5" data-testid="docs-family">
    <Label icon={Users}>Familiari collegati al suo profilo</Label>
    {groups.map((g) => <FamilyMember key={g[0].group} g={g} onChange={onChange} />)}
    {addChild}
  </div>
);
