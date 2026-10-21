import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { X, Mic, Pause, Play, Square, Keyboard, Loader2 } from "lucide-react";
import { api, errMsg } from "@/lib/api";
import { useRecorder, fmtClock } from "@/hooks/useRecorder";
import { Waveform } from "./Waveform";
import { NoteEditor } from "./NoteEditor";
import { ConsentGate } from "./ConsentGate";
import { useProcessing } from "@/lib/processing";

export const ConsultationOverlay = ({ open, patient, waiting, initial, onClose, onDone, patients = [], onPatientsChange, onEditPatient }) => {
  const [paper, setPaper] = useState(false);
  const [stage, setStage] = useState("setup");
  const [sel, setSel] = useState(null);
  const [freeName, setFreeName] = useState("");
  const [manual, setManual] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const lastBlob = useRef(null);
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
  }, [open, patient, initial]);

  const name = sel?.name || freeName.trim();

  // Invia audio/trascrizione e apre subito la cartella: Whisper + IA lavorano in background sul server
  const process = async (transcript, duration) => {
    setSending(true);
    try {
      let blob = null;
      if (transcript === null) {
        blob = rec.state !== "idle" ? await rec.stop() : lastBlob.current;
        lastBlob.current = blob;
        if (!blob || !blob.size) throw new Error("Registrazione vuota");
      }
      const c = await api.startConsultation({
        patient_name: name, patient_id: sel?.patient_id ?? "", clinic: sel?.clinic ?? "", waiting_id: sel?.id ?? "",
        duration_sec: duration, paper_consent: paper, transcript: transcript ?? "",
      }, blob);
      lastBlob.current = null;
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

  const start = async () => {
    if (!name) return toast.error("Seleziona o inserisci il paziente");
    const linked = patients.find((p) => p.id === sel?.patient_id);
    if (linked && !linked.consent_at) return toast.error("Registra prima il consenso privacy del paziente");
    if (!sel?.patient_id && !paper) return toast.error("Conferma l'acquisizione del consenso privacy");
    if (manual) {
      if (text.trim().length < 20) return toast.error("Trascrizione troppo breve");
      return process(text, 0);
    }
    try { await rec.start(); setStage("recording"); }
    catch { toast.error("Microfono non disponibile: consenti l'accesso o usa la trascrizione manuale"); }
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
            <Setup {...{ waiting, sel, setSel, freeName, setFreeName, manual, setManual, text, setText, start, sending }} gate={<ConsentGate patient={patients.find((p) => p.id === sel?.patient_id)} free={!sel?.patient_id && Boolean(freeName.trim())} paper={paper} setPaper={setPaper} onSaved={onPatientsChange} />} />
          )}
          {(stage === "recording") && (
            <Recording name={name} rec={rec} sending={sending} onStop={() => process(null, rec.seconds)} />
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
          {stage === "note" && result && <NoteEditor consultation={result} onSaved={onDone} onEditPatient={onEditPatient} />}
        </div>
      </div>
    </motion.div>
  );
};

const stageLabel = { setup: "preparazione", recording: "registrazione", retry: "invio audio", note: "cartella della visita" };

const Setup = ({ waiting, sel, setSel, freeName, setFreeName, manual, setManual, text, setText, start, gate, sending }) => (
  <div className="grid gap-10 lg:grid-cols-[1.1fr_1fr]" data-testid="consultation-setup">
    <div>
      <h2 className="font-display text-5xl leading-[1.02] lg:text-6xl">Chi stai<br /><span className="italic text-[#A9C2FF]">visitando?</span></h2>
      <p className="mt-4 max-w-md text-slate-300">La visita viene registrata, trascritta e trasformata nella cartella pediatrica: anamnesi, motivo e sintomi, esame obiettivo, crescita, diagnosi e terapia su misura.</p>
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
      <button onClick={() => setManual(!manual)} className="flex items-center gap-2 text-sm text-slate-300 hover:text-white" data-testid="consult-manual-toggle"><Keyboard size={15} /> {manual ? "Torna alla registrazione vocale" : "Senza microfono? Incolla una trascrizione"}</button>
      {manual && <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} placeholder="Medico: Buongiorno, cosa la porta qui oggi? Paziente: …" className="w-full rounded-2xl border border-white/15 bg-white/5 px-5 py-4 text-white placeholder:text-slate-400 outline-none focus:border-white/50" data-testid="consult-manual-textarea" />}
      <button onClick={start} disabled={sending} className="mt-2 flex w-full items-center justify-center gap-3 rounded-full bg-white py-5 text-lg font-semibold text-night transition-transform hover:-translate-y-0.5 active:scale-[0.98]" data-testid="consult-begin-btn">
        {sending ? <Loader2 size={20} className="animate-spin" /> : manual ? <Keyboard size={20} /> : <Mic size={20} />} {manual ? "Genera nota clinica" : "Inizia registrazione"}
      </button>
    </div>
  </div>
);

const Recording = ({ name, rec, onStop, sending }) => {
  const live = rec.state === "recording";
  return (
    <div className="flex flex-col items-center text-center" data-testid="consultation-recording">
      <div className={`flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] ${live ? "border-red-400/50 text-red-300" : "border-white/20 text-slate-300"}`}>
        <span className={`h-2 w-2 rounded-full ${live ? "animate-pulse bg-red-500" : "bg-slate-400"}`} /> {live ? "Registrazione in corso" : "In pausa"}
      </div>
      <div className="mt-6 font-mono text-7xl tabular-nums sm:text-8xl lg:text-9xl" data-testid="recording-timer">{fmtClock(rec.seconds)}</div>
      <div className="mt-3 text-slate-300">{name}</div>
      <div className="mt-8 w-full max-w-3xl"><Waveform analyser={rec.analyser} active={live} /></div>
      <div className="mt-10 flex items-center gap-4">
        <button onClick={live ? rec.pause : rec.resume} className="grid h-16 w-16 place-items-center rounded-full border border-white/25 transition-colors hover:bg-white/10" data-testid="recording-pause-btn" aria-label="Pausa">{live ? <Pause /> : <Play />}</button>
        <button onClick={onStop} disabled={sending} className="flex h-16 items-center gap-3 rounded-full bg-white px-8 text-lg font-semibold text-night transition-transform hover:-translate-y-0.5 disabled:opacity-80" data-testid="recording-stop-btn">
          {sending ? <Loader2 size={18} className="animate-spin" /> : <Square size={18} fill="currentColor" />} {sending ? "Apertura cartella…" : "Termina e trascrivi"}
        </button>
      </div>
    </div>
  );
};
