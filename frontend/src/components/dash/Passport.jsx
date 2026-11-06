import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { X, RefreshCw, Cloud, FileDown, Sparkles, AlertCircle, Pencil, ShieldCheck, ShieldAlert, Globe, Send, Loader2 } from "lucide-react";
import { ConsentDialog } from "./ConsentDialog";
import { SignedDocsList } from "@/components/signature/SignedDocs";
import { http } from "@/lib/api";
import { useScrollLock } from "@/lib/scrollLock";
import { api, CLINICS, errMsg, eur } from "@/lib/api";
import { methodLabel } from "./CashPanel";
import { GrowthChart } from "./GrowthChart";
import { CheckpointWizard, CheckpointResult } from "./CheckpointWizard";
import { TeamPanel } from "@/components/team/TeamPanel";
import { AILabel } from "@/components/mantai/AILabel";
import { BodychartHistory } from "@/components/bodychart/BodychartHistory";
import { ReportStates } from "./ReportStates";
import { KindConsents, ConsentBadges, MismatchNote } from "./KindConsents";
import { PassportFseTab } from "./PassportFseTab";
import { MODULE_NAMES } from "@/lib/modules";
import { PortalAccess } from "./PortalAccess";

const TABS = [["panoramica", "Panoramica"], ["visite", "Visite e referti"], ["crescita", "Crescita"], ["bilanci", "Bilanci"], ["bodychart", "Bodychart"], ["privacy", "Documenti e consensi"], ["rete", "Squadra"], ["passaporto", "Passaporto e FSE"]];

const Overview = ({ data, syncing, onSync, onTab }) => {
  const last = data.consultations?.[0];
  const box = "rounded-2xl border border-[var(--hair)] bg-[var(--surface)] p-5";
  return (
    <div className="grid gap-4 lg:grid-cols-3" data-testid="passport-overview">
      <div className={box}><div className="text-sm text-[var(--fg2)]">Ultima visita</div>
        {last ? <><div className="mt-1 text-lg font-semibold">{last.note?.motivo_visita || "Visita"}</div><div className="text-[15px] text-[var(--fg2)]">{new Date(last.created_at).toLocaleDateString("it-IT")} · {last.note?.diagnosi || "—"}</div>
          <button onClick={() => onTab("visite")} className="mt-3 min-h-[44px] text-[15px] font-medium text-[var(--accent)]" data-testid="passport-overview-visits">Tutte le visite →</button></> : <div className="mt-1 text-[15px] text-[var(--fg2)]">Nessuna visita registrata.</div>}
      </div>
      <div className={box}><div className="text-sm text-[var(--fg2)]">In sintesi</div>
        <ul className="mt-2 space-y-1 text-[15px]"><li>{data.consultations?.length ?? 0} visite</li><li>{data.measurements?.length ?? 0} misurazioni di crescita</li><li>{data.checkpoints?.length ?? 0} check-point di benessere</li></ul>
      </div>
      <div className={box}><SyncPanel data={data} syncing={syncing} onSync={onSync} /></div>
    </div>
  );
};

export const Passport = ({ patientId, onClose, onEdit, onStart, onOpenVisit }) => {
  const [data, setData] = useState(null);
  const [tab, setTabState] = useState(() => sessionStorage.getItem(`passport-tab-${patientId}`) || "panoramica");
  const setTab = (t) => { sessionStorage.setItem(`passport-tab-${patientId}`, t); setTabState(t); };
  const [syncing, setSyncing] = useState(false);
  useScrollLock();
  const load = useCallback(async () => {
    setSyncing(true);
    try { setData(await api.passport(patientId)); } catch (e) { toast.error(errMsg(e)); }
    setSyncing(false);
  }, [patientId]);
  useEffect(() => {
    load();
  }, [load]);

  const p = data?.patient;
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }} className="app-min fixed inset-0 z-50 overflow-auto overscroll-contain bg-[var(--bg)]" data-testid="passport-overlay" data-lenis-prevent>
      <header className="border-b border-[var(--hair)] bg-[var(--raised)] text-[var(--fg)]">
        <div className="mx-auto max-w-[1280px] px-5 pb-6 pt-5 lg:px-10">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--fg2)]">Scheda paziente</div>
            <div className="flex items-center gap-2">
              {p && <InviteButton p={p} onSent={load} />}
              <button onClick={onClose} className="grid h-11 w-11 place-items-center rounded-xl border border-[var(--hair)] bg-[var(--surface)] transition-colors hover:border-[var(--accent)]" data-testid="passport-close-btn" aria-label="Chiudi"><X size={18} /></button>
            </div>
          </div>
          {p && (
            <div className="mt-4 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-0">
                <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl" data-testid="passport-name">{p.name}</h2>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[15px] text-[var(--fg2)]">
                  <span data-testid="passport-age">{p.age_label}</span><span>{p.sex === "F" ? "Femmina" : "Maschio"}</span>
                  <span>nata/o il {new Date(p.birth_date).toLocaleDateString("it-IT")}</span>{p.fiscal_code && <span className="font-mono" data-testid="passport-cf">CF {p.fiscal_code}</span>}{p.guardian && <span>{p.guardian}</span>}
                  <button onClick={() => onEdit(p)} className="flex min-h-[44px] items-center gap-1 font-medium text-[var(--accent)]" data-testid="passport-edit-btn"><Pencil size={13} /> Modifica</button>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {p.allergies && <span className="flex items-center gap-1.5 rounded-xl bg-[var(--alert-bg)] px-3 py-1.5 text-sm font-semibold text-[var(--alert)] ring-1 ring-rose-300" data-testid="passport-allergies"><AlertCircle size={15} /> Allergie: {p.allergies}</span>}
                  <button onClick={() => setTab("privacy")} className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-semibold ${p.consent_at ? "bg-[var(--sel)] text-[var(--ok)]" : "bg-[var(--alert-bg)] text-[var(--alert)]"}`} data-testid="passport-consent-badge">{p.consent_at ? <ShieldCheck size={14} /> : <ShieldAlert size={14} />} {p.consent_at ? "Consenso privacy valido" : "Consenso privacy mancante"}</button>
                  <ConsentBadges p={p} onOpen={() => setTab("privacy")} />
                  {p.notes && <span className="rounded-xl bg-[var(--surface)] px-3 py-1.5 text-sm text-[var(--fg2)]">{p.notes}</span>}
                </div>
              </div>
              {onStart && <button onClick={() => onStart(p)} className="flex h-14 shrink-0 items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-8 text-base font-semibold text-[var(--ink)] hover:bg-[var(--accent)]" data-testid="passport-start-visit-btn"><Sparkles size={18} /> Avvia MantAI</button>}
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-[1280px] px-5 py-6 lg:px-10">
        <div className="-mx-1 flex gap-1 overflow-x-auto px-1" role="tablist">
          {TABS.map(([id, l]) => (
            <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`min-h-[44px] shrink-0 rounded-xl px-4 text-[15px] font-medium transition-colors ${tab === id ? "bg-[var(--accent)] text-[var(--ink)]" : "bg-[var(--raised)] text-[var(--fg)] hover:bg-[var(--raised)]"}`} data-testid={`passport-tab-${id}`}>{l}</button>
          ))}
        </div>
        <div className="mt-6">
          {!data ? <div className="h-60 animate-pulse rounded-2xl bg-[var(--raised)]" /> : (
            <>
              {tab === "panoramica" && <Overview data={data} syncing={syncing} onSync={load} onTab={setTab} />}
              {tab === "crescita" && <GrowthChart patient={p} measurements={data.measurements ?? []} onAdded={load} />}
              {tab === "visite" && <Visits items={data.consultations ?? []} payments={data.payments ?? []} onOpen={onOpenVisit} onChanged={load} />}
              {tab === "bilanci" && <div className="space-y-6"><Checkpoints patient={p} items={data.checkpoints ?? []} onDone={load} />
                <div><h3 className="mb-3 text-lg font-semibold">Visite di bilancio</h3><Visits items={(data.consultations ?? []).filter((c) => /bilancio/i.test(c.template_name || ""))} payments={data.payments ?? []} onOpen={onOpenVisit} /></div></div>}
              {tab === "bodychart" && <BodychartHistory patientId={patientId} />}
              {tab === "rete" && <TeamPanel patientId={patientId} />}
              {tab === "privacy" && <><PortalAccess patientId={p.id} /><ConsentsTab patient={p} items={data.consents ?? []} onChange={load} /></>}
              {tab === "passaporto" && <PassportFseTab data={data} onEdit={onEdit} onTab={setTab} />}
            </>
          )}
        </div>
      </main>
    </motion.div>
  );
};

const SyncPanel = ({ data, syncing, onSync }) => (
  <div className="text-[var(--fg)]" data-testid="passport-sync">
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-2 text-sm"><Cloud size={16} className="text-[var(--accent)]" /> Storico sincronizzato in cloud</span>
      <button onClick={onSync} className="flex items-center gap-1.5 min-h-[44px] rounded-xl bg-[var(--accent)] px-3 text-xs font-semibold text-[var(--ink)]" data-testid="passport-sync-btn"><RefreshCw size={13} className={syncing ? "animate-spin" : ""} /> Sincronizza</button>
    </div>
    <div className="mt-3 grid grid-cols-2 gap-2">
      {(data?.clinics ?? []).filter((c) => CLINICS.includes(c.clinic)).map((c) => (
        <div key={c.clinic} className="rounded-2xl bg-[var(--raised)] px-3 py-2">
          <div className="text-xs text-[var(--fg2)]">{c.clinic}</div>
          <div className="mt-0.5 font-mono text-xs text-[var(--fg)]">{c.visits} visite · {c.measurements} misure · {c.checkpoints} check</div>
        </div>
      ))}
    </div>
    <div className="mt-2 text-[11px] text-[var(--fg2)]" data-testid="passport-synced-at">Ultima sincronizzazione: {data?.synced_at ? new Date(data.synced_at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—"}</div>
  </div>
);

const InviteButton = ({ p, onSent }) => {
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try { const r = await api.invitePortal(p.id); toast.success(`Invito inviato a ${r.to}`); onSent(); } catch (e) { toast.error(errMsg(e)); }
    setBusy(false);
  };
  const adult = p.birth_date && new Date(p.birth_date) <= new Date(new Date().setFullYear(new Date().getFullYear() - 18));
  return (
    <button onClick={send} disabled={busy} className="flex h-11 items-center gap-2 rounded-full bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--fg)] transition-transform hover:-translate-y-0.5 disabled:opacity-60" title={p.portal_invited_at ? `Ultimo invito: ${new Date(p.portal_invited_at).toLocaleDateString("it-IT")}` : ""} data-testid="passport-invite-btn">
      {busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} <span className="hidden sm:inline">{p.portal_invited_at ? "Invita di nuovo al Portale" : adult ? "Invita il paziente al Portale" : "Invita i tutori al Portale"}</span><span className="sm:hidden">Invita</span>
    </button>
  );
};

const Visits = ({ items, payments = [], onOpen, onChanged }) => {
  const pdf = async (id) => {
    try { await api.downloadReport(id); toast.success("Referto PDF scaricato"); } catch (e) { toast.error(errMsg(e)); }
  };
  if (!items.length) return <p className="text-sm text-[var(--fg2)]">Nessuna visita registrata.</p>;
  return (
    <ol className="relative space-y-3 border-l border-[var(--hair)] pl-6" data-testid="passport-visits">
      {items.map((c) => (
        <li key={c.id} className="relative rounded-3xl border border-[var(--hair)] bg-[var(--surface)] p-5">
          <span className="absolute -left-[31px] top-6 h-3 w-3 rounded-full bg-[var(--accent)] ring-4 ring-paper" />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-xs text-[var(--fg2)]"><span className="font-mono">{new Date(c.created_at).toLocaleDateString("it-IT")}</span><span className="rounded-full bg-[var(--raised)] px-2 py-0.5 text-[var(--fg)]">{c.clinic || "Sede da indicare"}</span>{MODULE_NAMES[c.note?.modulo?.id] && <span className="rounded-full bg-[var(--sel)] px-2 py-0.5 font-semibold text-[var(--fg)]" data-testid={`passport-visit-module-${c.id}`}>{MODULE_NAMES[c.note.modulo.id]}</span>}</div>
              <div className="mt-1 font-display text-2xl text-[var(--fg)]">{c.note?.motivo_visita || "Visita"}</div>
              <div className="text-sm text-[var(--fg2)]"><span className="font-semibold text-[var(--fg)]">Diagnosi:</span> {c.note?.diagnosi || "—"}</div>
              <AILabel provenance={c.ai_provenance} view="doctor" className="mt-2" testId={`passport-visit-ai-label-${c.id}`} />
              <ReportStates c={c} onChanged={onChanged} />
              {payments.filter((x) => x.consultation_id === c.id).map((x) => (
                <span key={x.id} className="mt-2 mr-2 inline-flex items-center gap-1.5 rounded-full bg-[var(--raised)] px-3 py-1 text-xs font-medium text-[var(--fg)]" data-testid={`passport-payment-${x.id}`}>{eur(x.amount)} · {methodLabel(x.method)}</span>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {onOpen && <button onClick={() => onOpen(c)} className="flex min-h-[44px] items-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-medium text-[var(--ink)]" data-testid={`passport-visit-open-${c.id}`}>Apri nota e bodychart</button>}
              <button onClick={() => pdf(c.id)} className="flex items-center gap-2 rounded-full border border-[var(--hair)] px-4 py-2 text-sm font-medium text-[var(--fg)] hover:border-[var(--accent)]" data-testid={`passport-visit-pdf-${c.id}`}><FileDown size={15} /> Referto PDF</button>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
};

const ConsentsTab = ({ patient, items, onChange }) => {
  const [open, setOpen] = useState(false);
  const [docs, setDocs] = useState([]);
  const loadDocs = useCallback(() => { api.patientDocuments(patient.id).then(setDocs).catch(() => setDocs([])); }, [patient.id]);
  useEffect(() => { loadDocs(); }, [loadDocs, items]);
  const revoke = async (id) => {
    try { await http.post(`/consents/${id}/revoke`); toast.success("Consenso revocato"); onChange(); } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <div className="space-y-3" data-testid="passport-consents">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl bg-[var(--accent)] p-6 text-[var(--ink)]">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-[var(--fg2)]">Consenso informato · GDPR art. 9</div>
          <div className="mt-1 font-display text-3xl">{patient.consent_at ? `Valido dal ${new Date(patient.consent_at).toLocaleDateString("it-IT")}` : "Da registrare prima della visita"}</div>
          <p className="mt-1 text-sm text-[var(--fg2)]">Email referti: {patient.consent_email ? "autorizzata" : "non autorizzata"}</p>
        </div>
        <button onClick={() => setOpen(true)} className="rounded-full bg-[var(--surface)] px-5 py-3 text-sm font-semibold text-[var(--fg)]" data-testid="passport-consent-register-btn">{patient.consent_at ? "Aggiorna consenso" : "Registra consenso"}</button>
      </div>
      {items.filter((c) => !c.kind || c.kind === "privacy").map((c) => (
        <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-[var(--hair)] bg-[var(--surface)] p-5 text-sm" data-testid={`consent-row-${c.id}`}>
          <div>
            <div className="font-medium text-[var(--fg)]">{c.signer_name} · {c.signer_relation} · {c.method === "firma_tablet" ? "firma su tablet" : "modulo cartaceo"}</div>
            <div className="text-[var(--fg2)]">{c.version} · {new Date(c.signed_at).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" })} · email {c.email_reports ? "sì" : "no"}</div>
            <MismatchNote c={c} />
          </div>
          {c.signature && <img src={c.signature} alt="Firma" className="h-12 max-w-[160px] rounded-lg border border-[var(--hair)] bg-[var(--surface)] object-contain p-1" />}
          {c.revoked_at ? <span className="text-xs text-[var(--fg2)]">Revocato il {new Date(c.revoked_at).toLocaleDateString("it-IT")}</span>
            : <button onClick={() => revoke(c.id)} className="text-xs font-medium text-[var(--alert)] hover:underline" data-testid={`consent-revoke-${c.id}`}>Revoca</button>}
        </div>
      ))}
      <KindConsents patient={patient} items={items} onChange={onChange} revoke={revoke} />
      <div className="pt-3">
        <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
          <div>
            <div className="text-[11px] uppercase tracking-[0.22em] text-[var(--fg2)]">Consensi / Documenti</div>
            <div className="font-display text-2xl text-[var(--fg)]">Documenti firmati elettronicamente</div>
          </div>
          <a href="/verifica" target="_blank" rel="noreferrer" className="text-xs font-medium text-[var(--fg)] underline-offset-4 hover:underline" data-testid="passport-verify-link">Verifica integrità di un PDF</a>
        </div>
        <SignedDocsList docs={docs} download={api.documentPdf} testId="passport-docs" empty="Nessun documento firmato: i consensi firmati su tablet o dal Portale compaiono qui come PDF protetti." />
      </div>
      <ConsentDialog patient={patient} open={open} onClose={() => setOpen(false)} onSaved={onChange} />
    </div>
  );
};

const Checkpoints = ({ patient, items, onDone }) => {
  const [running, setRunning] = useState(false);
  const [clinic, setClinic] = useState(CLINICS[0]);
  if (running) return <CheckpointWizard patient={patient} clinic={clinic} onCancel={() => setRunning(false)} onDone={() => { setRunning(false); onDone(); }} />;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-[var(--accent)] p-6 text-[var(--ink)]">
        <div>
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-[var(--fg2)]"><Sparkles size={13} /> Check-point di benessere intelligente</div>
          <div className="mt-1 font-display text-3xl">Micro-questionario per {patient.age_label}</div>
          <p className="mt-1 text-sm text-[var(--fg2)]">Domande scelte in automatico per la fascia d'età: sviluppo, alimentazione, sonno, sicurezza, benessere.</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={clinic} onChange={(e) => setClinic(e.target.value)} className="rounded-full border border-[var(--hair)] bg-[var(--accent)] px-3 py-2.5 text-sm text-[var(--ink)]" data-testid="checkpoint-clinic">{CLINICS.map((c) => <option key={c}>{c}</option>)}</select>
          <button onClick={() => setRunning(true)} className="rounded-full bg-[var(--surface)] px-5 py-3 text-sm font-semibold text-[var(--fg)] transition-transform hover:-translate-y-0.5" data-testid="checkpoint-start-btn">Avvia check-point</button>
        </div>
      </div>
      {items.length === 0 ? <p className="text-sm text-[var(--fg2)]">Nessun check-point ancora compilato.</p> : items.map((cp) => <CheckpointResult key={cp.id} cp={cp} />)}
    </div>
  );
};
