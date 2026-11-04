import { useState } from "react";
import { toast } from "sonner";
import { Globe, EyeOff, Eye, RotateCw, Loader2 } from "lucide-react";
import { api, errMsg } from "@/lib/api";
import { needsSignature } from "./SignNote";

export const FSE_LABEL = { non_inviato: "Non inviato", in_coda: "In coda", inviato: "Inviato", accettato: "Accettato", errore: "Errore", oscurato: "Oscurato" };
const SIGN_FIRST = "Verifica e firma prima il referto";
const tone = { ok: "bg-[var(--sel)] text-[var(--ok)]", warn: "bg-[var(--late-bg)] text-[var(--late)]", bad: "bg-[var(--alert-bg)] text-[var(--alert)]", neutral: "bg-[var(--raised)] text-[var(--fg2)]" };
const fseTone = (s) => (s === "accettato" || s === "inviato" ? "ok" : s === "errore" ? "bad" : s === "in_coda" ? "warn" : "neutral");

const Badge = ({ k, v, t, testId, title }) => (
  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${tone[t]}`} title={title} data-testid={testId}>
    <span className="opacity-70">{k}:</span> {v}
  </span>
);

const daysLeft = (iso) => Math.ceil((new Date(iso) - Date.now()) / 86400000);
export const deadlineText = (iso) => { const d = daysLeft(iso); return d < 0 ? `scaduta da ${-d} g` : d === 0 ? "scade oggi" : `entro ${d} g (${new Date(iso).toLocaleDateString("it-IT")})`; };

export const ReportStates = ({ c, onChanged }) => {
  const [busy, setBusy] = useState("");
  const draft = needsSignature(c);
  const fse = c.obscured ? { ...(c.fse ?? {}), status: "oscurato" } : (c.fse ?? { status: "non_inviato" });
  const passport = c.obscured ? "Nascosto (oscurato)" : c.portal_hidden_by_parent ? "Nascosto dal genitore" : c.portal_published || c.report_sent_at ? "Pubblicato" : "Non pubblicato";
  const run = async (key, fn, ok) => { setBusy(key); try { await fn(); if (ok) toast.success(ok); onChanged?.(); } catch (e) { toast.error(errMsg(e)); } setBusy(""); };
  const published = c.portal_published || c.report_sent_at;
  return (
    <div className="mt-3 space-y-2" data-testid={`report-states-${c.id}`}>
      <div className="flex flex-wrap gap-1.5">
        <Badge k="Referto" v={draft ? "Bozza da verificare" : "Firmato"} t={draft ? "warn" : "ok"} testId={`report-state-sign-${c.id}`} />
        <Badge k="Passaporto" v={passport} t={passport === "Pubblicato" ? "ok" : "neutral"} testId={`report-state-passport-${c.id}`} />
        <Badge k="FSE" v={FSE_LABEL[fse.status] ?? "Non inviato"} t={fseTone(fse.status)} title={fse.reason || ""} testId={`report-state-fse-${c.id}`} />
        {!draft && !c.obscured && fse.deadline && !["inviato", "accettato"].includes(fse.status) && <span className="self-center text-xs text-[var(--fg2)]" data-testid={`report-fse-deadline-${c.id}`}>Invio FSE {deadlineText(fse.deadline)}</span>}
      </div>
      {fse.reason && !draft && <p className="text-xs text-[var(--fg2)]" data-testid={`report-fse-reason-${c.id}`}>{fse.reason}</p>}
      {draft && <p className="text-xs text-[var(--late)]" data-testid={`report-sign-first-${c.id}`}>{SIGN_FIRST}</p>}
      <div className="flex flex-wrap gap-2">
        <button disabled={draft || c.obscured || !!busy || Boolean(c.report_sent_at)} title={draft ? SIGN_FIRST : ""}
          onClick={() => run("pub", () => api.publishToPortal(c.id, !published), published ? "Referto ritirato dal portale" : "Referto visibile nel Portale Paziente")}
          className="flex items-center gap-2 rounded-full border border-[var(--hair)] px-4 py-2 text-sm font-medium text-[var(--fg)] hover:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50" data-testid={`passport-visit-portal-${c.id}`}>
          <Globe size={15} /> {published ? "Ritira dal portale" : "Pubblica nel portale"}
        </button>
        {!draft && !c.obscured && ["errore", "non_inviato"].includes(fse.status) && (
          <button disabled={!!busy} onClick={() => run("retry", () => api.fseRetry(c.id), "Referto rimesso in coda per il FSE")} className="flex items-center gap-2 rounded-full border border-[var(--hair)] px-4 py-2 text-sm font-medium text-[var(--fg)] hover:border-[var(--accent)]" data-testid={`report-fse-retry-${c.id}`}>
            {busy === "retry" ? <Loader2 size={15} className="animate-spin" /> : <RotateCw size={15} />} {fse.status === "errore" ? "Riprova" : "Invia al FSE"}
          </button>
        )}
        <button disabled={!!busy} onClick={() => run("obs", () => api.obscureReport(c.id, !c.obscured), c.obscured ? "Oscuramento rimosso" : "Referto oscurato: escluso da FSE e Passaporto")} className="flex items-center gap-2 rounded-full border border-[var(--hair)] px-4 py-2 text-sm font-medium text-[var(--fg)] hover:border-[var(--accent)]" data-testid={`report-obscure-${c.id}`}>
          {c.obscured ? <Eye size={15} /> : <EyeOff size={15} />} {c.obscured ? "Rimuovi oscuramento" : "Oscura"}
        </button>
      </div>
    </div>
  );
};
