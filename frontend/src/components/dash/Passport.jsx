import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { X, RefreshCw, Cloud, FileDown, Sparkles, AlertCircle, Pencil, ShieldCheck, ShieldAlert, Globe, Send, Loader2 } from "lucide-react";
import { ConsentDialog } from "./ConsentDialog";
import { http } from "@/lib/api";
import { api, CLINICS, errMsg, eur } from "@/lib/api";
import { methodLabel } from "./CashPanel";
import { GrowthChart } from "./GrowthChart";
import { CheckpointWizard, CheckpointResult } from "./CheckpointWizard";

const TABS = [["crescita", "Crescita"], ["visite", "Visite"], ["checkpoint", "Check-point benessere"], ["privacy", "Privacy e consensi"]];

export const Passport = ({ patientId, onClose, onEdit }) => {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("crescita");
  const [syncing, setSyncing] = useState(false);
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
    <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }} className="fixed inset-0 z-50 overflow-auto bg-paper" data-testid="passport-overlay" data-lenis-prevent>
      <header className="grain relative overflow-hidden bg-night text-white">
        <div className="relative z-10 mx-auto max-w-[1280px] px-5 pb-8 pt-6 lg:px-10">
          <div className="flex items-center justify-between">
            <div className="text-[11px] uppercase tracking-[0.22em] text-slate-300">Passaporto sanitario dinamico</div>
            <div className="flex items-center gap-2">
              {p && <InviteButton p={p} onSent={load} />}
              <button onClick={onClose} className="grid h-11 w-11 place-items-center rounded-full border border-white/20 transition-colors hover:bg-white hover:text-night" data-testid="passport-close-btn" aria-label="Chiudi"><X size={18} /></button>
            </div>
          </div>
          {p && (
            <div className="mt-6 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="font-display text-5xl leading-none lg:text-6xl" data-testid="passport-name">{p.name}</h2>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-300">
                  <span data-testid="passport-age">{p.age_label}</span><span>{p.sex === "F" ? "Femmina" : "Maschio"}</span>
                  <span>nata/o il {new Date(p.birth_date).toLocaleDateString("it-IT")}</span>{p.fiscal_code && <span className="font-mono" data-testid="passport-cf">CF {p.fiscal_code}</span>}{p.guardian && <span>{p.guardian}</span>}
                  <button onClick={() => onEdit(p)} className="flex items-center gap-1 text-[#A9C2FF] hover:text-white" data-testid="passport-edit-btn"><Pencil size={13} /> Modifica</button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button onClick={() => setTab("privacy")} className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${p.consent_at ? "bg-emerald-400/15 text-emerald-200" : "bg-red-500/20 text-red-200"}`} data-testid="passport-consent-badge">{p.consent_at ? <ShieldCheck size={13} /> : <ShieldAlert size={13} />} {p.consent_at ? "Consenso privacy valido" : "Consenso privacy mancante"}</button>
                  {p.allergies && <span className="flex items-center gap-1.5 rounded-full bg-red-500/15 px-3 py-1 text-xs font-semibold text-red-200" data-testid="passport-allergies"><AlertCircle size={13} /> Allergie: {p.allergies}</span>}
                  {p.notes && <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-slate-200">{p.notes}</span>}
                </div>
              </div>
              <SyncPanel data={data} syncing={syncing} onSync={load} />
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-[1280px] px-5 py-8 lg:px-10">
        <div className="flex gap-1 overflow-x-auto rounded-2xl bg-slate-100 p-1 sm:inline-flex" role="tablist">
          {TABS.map(([id, l]) => (
            <button key={id} onClick={() => setTab(id)} className={`relative shrink-0 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors ${tab === id ? "text-white" : "text-slate-600 hover:text-night"}`} data-testid={`passport-tab-${id}`}>
              {tab === id && <motion.span layoutId="passport-tab" className="absolute inset-0 rounded-xl bg-night" />}
              <span className="relative">{l}</span>
            </button>
          ))}
        </div>
        <div className="mt-6">
          {!data ? <div className="h-60 animate-pulse rounded-3xl bg-slate-100" /> : (
            <>
              {tab === "crescita" && <GrowthChart patient={p} measurements={data.measurements ?? []} onAdded={load} />}
              {tab === "visite" && <Visits items={data.consultations ?? []} payments={data.payments ?? []} />}
              {tab === "checkpoint" && <Checkpoints patient={p} items={data.checkpoints ?? []} onDone={load} />}
              {tab === "privacy" && <ConsentsTab patient={p} items={data.consents ?? []} onChange={load} />}
            </>
          )}
        </div>
      </main>
    </motion.div>
  );
};

const SyncPanel = ({ data, syncing, onSync }) => (
  <div className="rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur-md lg:min-w-[380px]" data-testid="passport-sync">
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-2 text-sm"><Cloud size={16} className="text-[#A9C2FF]" /> Storico sincronizzato in cloud</span>
      <button onClick={onSync} className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-night" data-testid="passport-sync-btn"><RefreshCw size={13} className={syncing ? "animate-spin" : ""} /> Sincronizza</button>
    </div>
    <div className="mt-3 grid grid-cols-2 gap-2">
      {(data?.clinics ?? []).filter((c) => CLINICS.includes(c.clinic)).map((c) => (
        <div key={c.clinic} className="rounded-2xl bg-white/5 px-3 py-2">
          <div className="text-xs text-slate-300">{c.clinic}</div>
          <div className="mt-0.5 font-mono text-xs text-white">{c.visits} visite · {c.measurements} misure · {c.checkpoints} check</div>
        </div>
      ))}
    </div>
    <div className="mt-2 text-[11px] text-slate-300" data-testid="passport-synced-at">Ultima sincronizzazione: {data?.synced_at ? new Date(data.synced_at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—"}</div>
  </div>
);

const InviteButton = ({ p, onSent }) => {
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try { const r = await api.invitePortal(p.id); toast.success(`Invito inviato a ${r.to}`); onSent(); } catch (e) { toast.error(errMsg(e)); }
    setBusy(false);
  };
  return (
    <button onClick={send} disabled={busy} className="flex h-11 items-center gap-2 rounded-full bg-white px-4 text-sm font-semibold text-night transition-transform hover:-translate-y-0.5 disabled:opacity-60" title={p.portal_invited_at ? `Ultimo invito: ${new Date(p.portal_invited_at).toLocaleDateString("it-IT")}` : ""} data-testid="passport-invite-btn">
      {busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} <span className="hidden sm:inline">{p.portal_invited_at ? "Invita di nuovo al Portale" : "Invita Genitore al Portale"}</span><span className="sm:hidden">Invita</span>
    </button>
  );
};

const PortalToggle = ({ c }) => {
  const [on, setOn] = useState(Boolean(c.portal_published || c.report_sent_at));
  const sent = Boolean(c.report_sent_at);
  const toggle = async () => {
    try { await api.publishToPortal(c.id, !on); setOn(!on); toast.success(!on ? "Referto visibile nel Portale Paziente" : "Referto ritirato dal portale"); }
    catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <button onClick={toggle} disabled={sent} title={sent ? "Già inviato al genitore: visibile nel portale" : ""} className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors disabled:cursor-default ${on ? "bg-night text-white" : "border border-slate-200 text-night hover:border-night"}`} data-testid={`passport-visit-portal-${c.id}`}>
      <Globe size={15} /> {on ? "Nel portale" : "Pubblica nel portale"}
    </button>
  );
};

const Visits = ({ items, payments = [] }) => {
  const pdf = async (id) => {
    try { await api.downloadReport(id); toast.success("Referto PDF scaricato"); } catch (e) { toast.error(errMsg(e)); }
  };
  if (!items.length) return <p className="text-sm text-slate-500">Nessuna visita registrata.</p>;
  return (
    <ol className="relative space-y-3 border-l border-slate-200 pl-6" data-testid="passport-visits">
      {items.map((c) => (
        <li key={c.id} className="relative rounded-3xl border border-slate-200 bg-white p-5">
          <span className="absolute -left-[31px] top-6 h-3 w-3 rounded-full bg-night ring-4 ring-paper" />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-xs text-slate-500"><span className="font-mono">{new Date(c.created_at).toLocaleDateString("it-IT")}</span><span className="rounded-full bg-slate-100 px-2 py-0.5 text-night">{c.clinic || "Consultazione libera"}</span></div>
              <div className="mt-1 font-display text-2xl text-night">{c.note?.motivo_visita || "Visita"}</div>
              <div className="text-sm text-slate-600"><span className="font-semibold text-night">Diagnosi:</span> {c.note?.diagnosi || "—"}</div>
              {payments.filter((x) => x.consultation_id === c.id).map((x) => (
                <span key={x.id} className="mt-2 mr-2 inline-flex items-center gap-1.5 rounded-full bg-[#ECEDEF] px-3 py-1 text-xs font-medium text-night" data-testid={`passport-payment-${x.id}`}>{eur(x.amount)} · {methodLabel(x.method)}</span>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <PortalToggle c={c} />
              <button onClick={() => pdf(c.id)} className="flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-night hover:border-night" data-testid={`passport-visit-pdf-${c.id}`}><FileDown size={15} /> Referto PDF</button>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
};

const ConsentsTab = ({ patient, items, onChange }) => {
  const [open, setOpen] = useState(false);
  const revoke = async (id) => {
    try { await http.post(`/consents/${id}/revoke`); toast.success("Consenso revocato"); onChange(); } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <div className="space-y-3" data-testid="passport-consents">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl bg-night p-6 text-white">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-[#C9CCD3]">Consenso informato · GDPR art. 9</div>
          <div className="mt-1 font-display text-3xl">{patient.consent_at ? `Valido dal ${new Date(patient.consent_at).toLocaleDateString("it-IT")}` : "Da registrare prima della visita"}</div>
          <p className="mt-1 text-sm text-slate-300">Email referti: {patient.consent_email ? "autorizzata" : "non autorizzata"}</p>
        </div>
        <button onClick={() => setOpen(true)} className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-night" data-testid="passport-consent-register-btn">{patient.consent_at ? "Aggiorna consenso" : "Registra consenso"}</button>
      </div>
      {items.map((c) => (
        <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-slate-200 bg-white p-5 text-sm" data-testid={`consent-row-${c.id}`}>
          <div>
            <div className="font-medium text-night">{c.signer_name} · {c.signer_relation} · {c.method === "firma_tablet" ? "firma su tablet" : "modulo cartaceo"}</div>
            <div className="text-slate-600">{c.version} · {new Date(c.signed_at).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" })} · email {c.email_reports ? "sì" : "no"}</div>
          </div>
          {c.signature && <img src={c.signature} alt="Firma" className="h-12 rounded-lg border border-slate-200 bg-slate-50" />}
          {c.revoked_at ? <span className="text-xs text-slate-500">Revocato il {new Date(c.revoked_at).toLocaleDateString("it-IT")}</span>
            : <button onClick={() => revoke(c.id)} className="text-xs font-medium text-red-600 hover:underline" data-testid={`consent-revoke-${c.id}`}>Revoca</button>}
        </div>
      ))}
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
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-night p-6 text-white">
        <div>
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-[#A9C2FF]"><Sparkles size={13} /> Check-point di benessere intelligente</div>
          <div className="mt-1 font-display text-3xl">Micro-questionario per {patient.age_label}</div>
          <p className="mt-1 text-sm text-slate-300">Domande scelte in automatico per la fascia d'età: sviluppo, alimentazione, sonno, sicurezza, benessere.</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={clinic} onChange={(e) => setClinic(e.target.value)} className="rounded-full border border-white/20 bg-night px-3 py-2.5 text-sm text-white" data-testid="checkpoint-clinic">{CLINICS.map((c) => <option key={c}>{c}</option>)}</select>
          <button onClick={() => setRunning(true)} className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-night transition-transform hover:-translate-y-0.5" data-testid="checkpoint-start-btn">Avvia check-point</button>
        </div>
      </div>
      {items.length === 0 ? <p className="text-sm text-slate-500">Nessun check-point ancora compilato.</p> : items.map((cp) => <CheckpointResult key={cp.id} cp={cp} />)}
    </div>
  );
};
