import { useEffect, useState } from "react";
import { toast } from "sonner";
import { isPediatric } from "@/lib/pediatric";
import { Mail, Loader2, CheckCircle2 } from "lucide-react";
import { api, errMsg } from "@/lib/api";

export const SendToParents = ({ consultation, beforeSend, disabled = false, needsSign = false }) => {
  const [patient, setPatient] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(consultation.report_sent_at ? { to: consultation.report_sent_to, at: consultation.report_sent_at } : null);
  useEffect(() => {
    if (!consultation.patient_id) return;
    api.patients().then((list) => setPatient(list.find((p) => p.id === consultation.patient_id) ?? null)).catch(() => {});
  }, [consultation.patient_id]);

  const email = patient?.guardian_email;
  const send = async () => {
    setBusy(true);
    try {
      await beforeSend();
      const r = await api.sendReport(consultation.id);
      setSent({ to: r?.to, at: r?.sent_at });
      toast.success(`Referto inviato a ${r?.to}`);
    } catch (e) { toast.error(errMsg(e)); }
    setBusy(false);
  };

  const ped = isPediatric(consultation.note);
  const who = ped ? "genitore" : "paziente";
  const hint = disabled ? "Disponibile appena l'IA completa la cartella" : needsSign ? "Firmi prima la nota redatta con MantAI" : !consultation.patient_id ? "Visita libera: collega il paziente al passaporto per inviare il referto"
    : !email ? `Aggiungi l'email del ${who} nel passaporto del paziente`
    : !patient?.consent_email ? `Manca il consenso del ${who} all'invio via email`
    : sent ? `Inviato a ${sent.to} il ${new Date(sent.at).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" })}`
    : `Destinatario: ${patient?.guardian || (ped ? "genitore" : consultation.patient_name)} · ${email}`;

  return (
    <button onClick={send} disabled={disabled || needsSign || busy || !email || !patient?.consent_email} className="group flex w-full items-center gap-3 rounded-2xl border border-night px-5 py-4 text-left text-night transition-all hover:-translate-y-0.5 hover:bg-slate-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:opacity-70" data-testid="send-parents-btn">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-night text-white">{busy ? <Loader2 size={18} className="animate-spin" /> : sent ? <CheckCircle2 size={18} /> : <Mail size={18} />}</span>
      <span className="min-w-0">
        <span className="block font-display text-2xl leading-none">{busy ? "Invio in corso…" : `${sent ? "Invia di nuovo" : "Invia"} ${ped ? "ai genitori" : "al paziente"}`}</span>
        <span className="mt-1 block text-xs text-slate-600" data-testid="send-parents-hint">{hint}</span>
      </span>
    </button>
  );
};
