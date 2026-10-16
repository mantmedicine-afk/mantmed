import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { ArrowLeft, Sparkles, Loader2, AlertTriangle } from "lucide-react";
import { api, errMsg } from "@/lib/api";

export const CheckpointWizard = ({ patient, clinic, onDone, onCancel }) => {
  const [band, setBand] = useState(null);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    api.checkpointTemplate(patient.id).then(setBand).catch((e) => toast.error(errMsg(e)));
  }, [patient.id]);

  if (!band) return <div className="grid h-60 place-items-center"><Loader2 className="animate-spin text-night" /></div>;
  if (result) return <CheckpointResult cp={result} onClose={onDone} />;

  const qs = band.questions ?? [];
  const q = qs[step];
  const choose = async (value) => {
    const next = { ...answers, [q.id]: value };
    setAnswers(next);
    if (step < qs.length - 1) return setStep(step + 1);
    setBusy(true);
    try { setResult(await api.submitCheckpoint(patient.id, { answers: next, clinic })); }
    catch (e) { toast.error(errMsg(e)); }
    setBusy(false);
  };

  return (
    <div className="rounded-3xl bg-night p-6 text-white lg:p-8" data-testid="checkpoint-wizard">
      <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.22em] text-slate-300">
        <span className="flex items-center gap-2"><Sparkles size={13} className="text-[#A9C2FF]" /> Check-point · {band.label}</span>
        <span className="font-mono">{step + 1} / {qs.length}</span>
      </div>
      <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/10"><motion.div className="h-full bg-[#7FA6FF]" animate={{ width: `${((step + 1) / qs.length) * 100}%` }} /></div>
      <motion.div key={q.id} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3 }} className="mt-8">
        <div className="text-xs uppercase tracking-[0.2em] text-[#A9C2FF]">{q.area}</div>
        <h3 className="mt-2 font-display text-3xl leading-tight lg:text-4xl" data-testid="checkpoint-question">{q.text}</h3>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {q.options.map((o) => (
            <button key={o.value} disabled={busy} onClick={() => choose(o.value)} className={`rounded-2xl border px-5 py-4 text-left text-lg font-medium transition-colors ${answers[q.id] === o.value ? "border-white bg-white text-night" : "border-white/20 hover:border-white/60"}`} data-testid={`checkpoint-option-${o.value}`}>
              {o.label}
            </button>
          ))}
        </div>
      </motion.div>
      <div className="mt-8 flex items-center justify-between">
        <button onClick={() => (step ? setStep(step - 1) : onCancel())} className="flex items-center gap-2 text-sm text-slate-300 hover:text-white" data-testid="checkpoint-back-btn"><ArrowLeft size={15} /> {step ? "Indietro" : "Annulla"}</button>
        {busy && <span className="flex items-center gap-2 text-sm text-slate-300"><Loader2 size={15} className="animate-spin" /> Analisi in corso…</span>}
      </div>
    </div>
  );
};

const STATUS = { ottimo: "text-emerald-600", buono: "text-[#3B6CF6]", "da approfondire": "text-amber-600" };

export const CheckpointResult = ({ cp, onClose }) => {
  const r = cp.result ?? {};
  const flags = Array.isArray(r.flags) ? r.flags : [];
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 text-night" data-testid="checkpoint-result">
      <div className="flex flex-wrap items-center gap-6">
        <Ring value={r.score ?? 0} />
        <div className="min-w-0 flex-1">
          <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Check-point {cp.band_label} · {new Date(cp.created_at).toLocaleDateString("it-IT")}</div>
          <div className={`font-display text-4xl capitalize ${STATUS[r.status] ?? ""}`} data-testid="checkpoint-status">{r.status}</div>
          <div className="mt-1 text-sm text-slate-600">Prossimo appuntamento consigliato: {r.next}</div>
        </div>
        {onClose && <button onClick={onClose} className="rounded-full bg-night px-5 py-2.5 text-sm font-medium text-white" data-testid="checkpoint-close-btn">Fatto</button>}
      </div>
      <div className="mt-5 grid gap-2 sm:grid-cols-3">
        {(r.areas ?? []).map((a) => (
          <div key={a.area} className="rounded-2xl bg-slate-50 px-4 py-3">
            <div className="text-xs text-slate-500">{a.area}</div>
            <div className="mt-1 h-1.5 rounded-full bg-slate-200"><div className="h-full rounded-full bg-night" style={{ width: `${(a.ok / a.total) * 100}%` }} /></div>
          </div>
        ))}
      </div>
      {flags.length > 0 && (
        <ul className="mt-5 space-y-2" data-testid="checkpoint-flags">
          {flags.map((f) => (
            <li key={f.id} className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600" />
              <span><span className="font-semibold">{f.question}</span> <span className="text-slate-600">— {f.answer}</span><span className="block text-slate-700">{f.tip}</span></span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 text-xs text-slate-500">Questionario orientativo di supporto al bilancio di salute: non sostituisce strumenti di screening validati né la valutazione clinica.</p>
    </div>
  );
};

const Ring = ({ value }) => (
  <div className="relative grid h-24 w-24 place-items-center" data-testid="checkpoint-score">
    <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90"><circle cx="18" cy="18" r="15.5" fill="none" stroke="#EEF1F7" strokeWidth="3" /><motion.circle cx="18" cy="18" r="15.5" fill="none" stroke="#0B1736" strokeWidth="3" strokeLinecap="round" strokeDasharray="97.4" initial={{ strokeDashoffset: 97.4 }} animate={{ strokeDashoffset: 97.4 * (1 - value / 100) }} transition={{ duration: 1 }} /></svg>
    <span className="font-display text-3xl">{value}</span>
  </div>
);
