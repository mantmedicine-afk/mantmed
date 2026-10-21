import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { X, Mic, Pause, Play, Square, Keyboard, Loader2, LayoutTemplate } from "lucide-react";
import { api, errMsg } from "@/lib/api";
import { useRecorder, fmtClock } from "@/hooks/useRecorder";
import { Waveform } from "./Waveform";
import { NoteEditor } from "./NoteEditor";
import { ConsentGate } from "./ConsentGate";
import { useProcessing } from "@/lib/processing";
import { micError } from "@/lib/mic";
import { MicCheck } from "./MicCheck";
import { MantAIButton } from "@/components/mantai/MantAI";

export const ConsultationOverlay = ({ open, patient, waiting, initial, onClose, onDone, patients = [], onPatientsChange, onEditPatient }) => {
  const [paper, setPaper] = useState(false);
  const [stage, setStage] = useState("setup");
  const [sel, setSel] = useState(null);
  const [freeName, setFreeName] = useState("");
  const [manual, setManual] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendStep, setSendStep] = useState("");
  const [starting, setStarting] = useState(false);
  const [hint, setHint] = useState("");
  const uploaded = useRef([]);
  const [result, setResult] = useState(null);
  const lastBlob = useRef(null);
  const [templates, setTemplates] = useState([]);
  const [tplId, setTplId] = useState("");
  const { track } = useProcessing();
  const rec = useRecorder();

  useEffect(() => {
    if (!open) return;
    setResult(initial ?? null);
    setStage(initial ? "note" : "setup");
    setSel(patient ?? null);
    setFreeName("");
    setManual(false);
    setText("");
    setHint("");
    setPaper(false);
    if (!initial) api.visitTemplates().then((xs) => { setTemplates(xs); setTplId((cur) => (xs.some((t) => t.id === cur) ? cur : xs[0]?.id ?? "")); }).catch(() => setTemplates([]));
  }, [open, patient, initial]);

  // Bilancio di salute consigliato per l'età del paziente; preselezionato se il motivo della visita è un bilancio
  const linkedPatient = patients.find((p) => p.id === sel?.patient_id);
  const ageM = ageMonths(linkedPatient?.birth_date);
  const suggested = ageM === null ? null : templates.find((t) => t.bilancio && ageM >= t.age_from && ageM < t.age_to);
  const autoPicked = useRef(false);
  useEffect(() => {
    if (suggested && /bilancio/i.test(`${sel?.reason ?? ""} ${sel?.visit_type ?? ""}`)) { setTplId(suggested.id); autoPicked.current = true; }
    else if (autoPicked.current) { setTplId(templates.find((t) => !t.bilancio)?.id ?? templates[0]?.id ?? ""); autoPicked.current = false; }
  }, [suggested?.id, sel?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const pickTpl = (id) => { autoPicked.current = false; setTplId(id); };

  const name = sel?.name || freeName.trim();
  useEffect(() => { setHint(""); }, [name, paper, manual]);

  // Invia audio/trascrizione e apre subito la cartella: Whisper + IA lavorano in background sul server
  const process = async (transcript, duration) => {
    setSending(true);
    try {
      let partIds = [];
      if (transcript === null) {
        // le parti (una ogni 10 minuti) vengono caricate una alla volta; in caso di errore si riprende dalla prima non inviata
        if (rec.state !== "idle") { lastBlob.current = await rec.stop(); uploaded.current = []; }
        const blobs = lastBlob.current ?? [];
        if (!blobs.length) throw new Error("Registrazione vuota");
        for (let i = uploaded.current.length; i < blobs.length; i += 1) {
          setSendStep(blobs.length > 1 ? `Invio parte ${i + 1} di ${blobs.length}…` : "Apertura cartella…");
          uploaded.current.push(await api.uploadAudioPart(blobs[i], i));
        }
        partIds = uploaded.current;
      }
      setSendStep("Apertura cartella…");
      const c = await api.startConsultation({
        patient_name: name, patient_id: sel?.patient_id ?? "", clinic: sel?.clinic ?? "", waiting_id: sel?.id ?? "",
        duration_sec: duration, paper_consent: paper, transcript: transcript ?? "", part_ids: partIds.join(","), template_id: tplId,
      }, null);
      lastBlob.current = null;
      uploaded.current = [];
      track(c);
      setResult(c);
      setStage("note");
      onDone();
    } catch (e) {
      const msg = e?.response ? errMsg(e) : e.message;
      if (transcript === null && lastBlob.current) {
        toast.error(msg, { action: { label: "Riprova invio", onClick: () => process(null, duration) }, duration: 15000 });
        setStage("retry");
      } else {
        toast.error(msg);
        setStage("setup");
      }
    }
    setSending(false);
  };

  const fail = (msg) => { setHint(msg); toast.error(msg); };
  const start = async () => {
    setHint("");
    if (!name) return fail("Seleziona un paziente in attesa o scrivi nome e cognome");
    const linked = patients.find((p) => p.id === sel?.patient_id);
    if (linked && !linked.consent_at) return fail("Registra prima il consenso privacy del paziente");
    if (!sel?.patient_id && !paper) return fail("Spunta la conferma del consenso privacy cartaceo per avviare la visita libera");
    if (manual) {
      if (text.trim().length < 20) return fail("Trascrizione troppo breve (almeno 20 caratteri)");
      return process(text, 0);
    }
    setStarting(true);
    try { await rec.start(); setStage("recording"); }
    catch (e) { fail(micError(e)); }
    setStarting(false);
  };

  const close = async () => {
    if (rec.state !== "idle") await rec.stop();
    onClose();
  };

  if (!open) return null;
  return (
    <motion.div
      initial={{ clipPath: "circle(0% at 50% 60%)" }}
      animate={{ clipPath: "circle(150% at 50% 60%)" }}
      transition={{ duration: 0.8, ease: [0.65, 0, 0.35, 1] }}
      className="grain fixed inset-0 z-50 overflow-auto bg-night text-white"
      data-testid="consultation-overlay"
      data-lenis-prevent
    >
      <div className="mx-auto flex min-h-full max-w-[1280px] flex-col px-5 py-6 lg:px-10">
        <div className="flex items-center justify-between">
          <div className="text-[11px] uppercase tracking-[0.22em] text-slate-300">Consultazione · {stageLabel[stage]}</div>
          <button onClick={close} className="grid h-11 w-11 place-items-center rounded-full border border-white/20 transition-colors hover:bg-white hover:text-night" data-testid="consultation-close-btn" aria-label="Chiudi"><X size={18} /></button>
        </div>
        <div className="flex flex-1 flex-col justify-center py-8">
          {stage === "setup" && (
            <Setup {...{ waiting, sel, setSel, freeName, setFreeName, manual, setManual, text, setText, start, hint, sending: sending || starting, starting }} picker={<TemplatePicker templates={templates} value={tplId} onChange={pickTpl} suggested={suggested} ageM={ageM} />} gate={<ConsentGate patient={patients.find((p) => p.id === sel?.patient_id)} free={!sel?.patient_id && Boolean(freeName.trim())} paper={paper} setPaper={setPaper} onSaved={onPatientsChange} />} />
          )}
          {(stage === "recording") && (
            <Recording name={name} rec={rec} sending={sending} sendStep={sendStep} onStop={() => process(null, rec.seconds)} />
          )}
          {stage === "retry" && (
            <div className="flex flex-col items-center gap-5 text-center" data-testid="consultation-retry">
              <div className="font-display text-4xl">Invio della registrazione non riuscito</div>
              <div className="text-sm text-slate-300">L'audio di {name} è ancora qui: verifichi la connessione e riprovi.</div>
              <button onClick={() => process(null, rec.seconds)} disabled={sending} className="flex h-14 items-center gap-2 rounded-full bg-white px-7 font-semibold text-night disabled:opacity-60" data-testid="consultation-retry-btn">
                {sending ? <Loader2 size={18} className="animate-spin" /> : <Square size={16} fill="currentColor" />} Riprova invio
              </button>
            </div>
          )}
          {stage === "note" && result && <NoteEditor consultation={result} onSaved={onDone} onEditPatient={onEditPatient} onLeave={close} />}
        </div>
      </div>
    </motion.div>
  );
};

const stageLabel = { setup: "preparazione", recording: "registrazione", retry: "invio audio", note: "cartella della visita" };

const ageMonths = (bd) => {
  if (!bd) return null;
  const b = new Date(`${bd}T12:00:00`), n = new Date();
  const m = (n.getFullYear() - b.getFullYear()) * 12 + n.getMonth() - b.getMonth() - (n.getDate() < b.getDate() ? 1 : 0);
  return m >= 0 ? m + (n.getDate() >= b.getDate() ? (n.getDate() - b.getDate()) / 30 : 0) : null;
};
const ageLabel = (m) => (m < 24 ? `${Math.floor(m)} mesi` : `${Math.floor(m / 12)} anni`);

const TplPill = ({ t, value, onChange, hint }) => (
  <button type="button" onClick={() => onChange(t.id)} className={`rounded-full px-4 py-2 text-sm transition-colors ${t.id === value ? "bg-white font-semibold text-night" : hint ? "border border-[#A9C2FF] text-white hover:border-white" : "border border-white/20 text-slate-200 hover:border-white/50"}`} data-testid={`consult-template-${t.id}`}>
    {t.name.replace("Bilancio di salute · ", "")} <span className="opacity-60">· {t.fields.length} campi</span>{hint && <span className="ml-1.5 rounded-full bg-[#A9C2FF] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-night" data-testid="consult-template-suggested">{hint}</span>}
  </button>
);

const TemplatePicker = ({ templates, value, onChange, suggested, ageM }) => (templates.length ? (
  <div className="rounded-2xl border border-white/15 p-4" data-testid="consult-template-picker">
    <div className="flex items-center justify-between gap-2 text-[11px] uppercase tracking-[0.2em] text-slate-300"><span className="flex items-center gap-1.5"><LayoutTemplate size={13} /> Modello di visita</span><Link to="/app/impostazioni?sezione=modelli" className="normal-case tracking-normal text-[#A9C2FF] hover:text-white" data-testid="consult-template-manage">Gestisci</Link></div>
    <div className="mt-3 flex flex-wrap gap-2">
      {templates.filter((t) => !t.bilancio).map((t) => <TplPill key={t.id} t={t} value={value} onChange={onChange} />)}
    </div>
    {templates.some((t) => t.bilancio) && (
      <>
        <div className="mt-4 text-[11px] uppercase tracking-[0.2em] text-slate-400">Bilanci di salute{suggested ? ` · consigliato per ${ageLabel(ageM)}` : ""}</div>
        <div className="mt-2 flex flex-wrap gap-2" data-testid="consult-bilanci">
          {[...(suggested ? [suggested] : []), ...templates.filter((t) => t.bilancio && t.id !== suggested?.id)].map((t) => <TplPill key={t.id} t={t} value={value} onChange={onChange} hint={t.id === suggested?.id ? "Consigliato" : ""} />)}
        </div>
      </>
    )}
  </div>
) : null);

const Setup = ({ waiting, sel, setSel, freeName, setFreeName, manual, setManual, text, setText, start, gate, sending, starting, hint, picker }) => (
  <div className="grid gap-10 lg:grid-cols-[1.1fr_1fr]" data-testid="consultation-setup">
    <div>
      <h2 className="font-display text-5xl leading-[1.02] lg:text-6xl">Chi stai<br /><span className="italic text-[#A9C2FF]">visitando?</span></h2>
      <p className="mt-4 max-w-md text-slate-300">La visita viene registrata, trascritta e trasformata nella cartella clinica secondo il modello scelto: anamnesi, motivo e sintomi, parametri, esame obiettivo, diagnosi e terapia su misura.</p>
      <div className="mt-5"><MantAIButton variant="icon" view="doctor" /></div>
    </div>
    <div className="space-y-3">
      {waiting.map((w) => (
        <button key={w.id} onClick={() => { setSel(w); setFreeName(""); }} className={`flex w-full items-center justify-between rounded-2xl border px-5 py-4 text-left transition-colors ${sel?.id === w.id ? "border-white bg-white text-night" : "border-white/15 hover:border-white/40"}`} data-testid={`consult-select-${w.id}`}>
          <span><span className="block font-medium">{w.name}</span><span className={`text-sm ${sel?.id === w.id ? "text-slate-600" : "text-slate-300"}`}>{w.clinic} · {w.reason}</span></span>
          {w.priority === "urgente" && <span className="text-[11px] font-semibold uppercase tracking-wider text-red-400">Urgente</span>}
        </button>
      ))}
      <input value={freeName} onChange={(e) => { setFreeName(e.target.value); setSel(null); }} placeholder="Oppure scrivi nome e cognome del paziente" className="w-full rounded-2xl border border-white/15 bg-transparent px-5 py-4 text-white placeholder:text-slate-400 outline-none focus:border-white/50" data-testid="consult-free-name-input" />
      {gate}
      {picker}
      <button onClick={() => setManual(!manual)} className="flex items-center gap-2 text-sm text-slate-300 hover:text-white" data-testid="consult-manual-toggle"><Keyboard size={15} /> {manual ? "Torna alla registrazione vocale" : "Senza microfono? Incolla una trascrizione"}</button>
      {manual && <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} placeholder="Medico: Buongiorno, cosa la porta qui oggi? Paziente: …" className="w-full rounded-2xl border border-white/15 bg-white/5 px-5 py-4 text-white placeholder:text-slate-400 outline-none focus:border-white/50" data-testid="consult-manual-textarea" />}
      {!manual && <MicCheck />}
      {hint && <p role="alert" className="rounded-2xl border border-rose-300/40 bg-rose-500/10 px-5 py-3 text-sm text-rose-200" data-testid="consult-start-error">{hint}</p>}
      <button onClick={start} disabled={sending} className="mt-2 flex w-full items-center justify-center gap-3 rounded-full bg-white py-5 text-lg font-semibold text-night transition-transform hover:-translate-y-0.5 active:scale-[0.98]" data-testid="consult-begin-btn">
        {sending ? <Loader2 size={20} className="animate-spin" /> : manual ? <Keyboard size={20} /> : <Mic size={20} />} {starting ? "In attesa del microfono…" : manual ? "Genera nota clinica" : "Inizia registrazione"}
      </button>
    </div>
  </div>
);

const Recording = ({ name, rec, onStop, sending, sendStep }) => {
  const live = rec.state === "recording";
  return (
    <div className="flex flex-col items-center text-center" data-testid="consultation-recording">
      <div className={`flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] ${live ? "border-red-400/50 text-red-300" : "border-white/20 text-slate-300"}`}>
        <span className={`h-2 w-2 rounded-full ${live ? "animate-pulse bg-red-500" : "bg-slate-400"}`} /> {live ? "Registrazione in corso" : "In pausa"}
      </div>
      <div className="mt-6 font-mono text-7xl tabular-nums sm:text-8xl lg:text-9xl" data-testid="recording-timer">{fmtClock(rec.seconds)}</div>
      <div className="mt-3 text-slate-300">{name}</div>
      {rec.parts > 1 && <div className="mt-2 text-xs uppercase tracking-[0.18em] text-[#A9C2FF]" data-testid="recording-parts">Visita lunga · parte {rec.parts} · salvataggio automatico ogni 10 minuti</div>}
      <div className="mt-8 w-full max-w-3xl"><Waveform analyser={rec.analyser} active={live} /></div>
      <div className="mt-10 flex items-center gap-4">
        <button onClick={live ? rec.pause : rec.resume} className="grid h-16 w-16 place-items-center rounded-full border border-white/25 transition-colors hover:bg-white/10" data-testid="recording-pause-btn" aria-label="Pausa">{live ? <Pause /> : <Play />}</button>
        <button onClick={onStop} disabled={sending} className="flex h-16 items-center gap-3 rounded-full bg-white px-8 text-lg font-semibold text-night transition-transform hover:-translate-y-0.5 disabled:opacity-80" data-testid="recording-stop-btn">
          {sending ? <Loader2 size={18} className="animate-spin" /> : <Square size={18} fill="currentColor" />} {sending ? sendStep || "Apertura cartella…" : "Termina e trascrivi"}
        </button>
      </div>
    </div>
  );
};
