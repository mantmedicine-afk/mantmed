import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { X, Mic, Pause, Play, Square, Keyboard, Loader2, LayoutTemplate } from "lucide-react";
import { api, errMsg } from "@/lib/api";
import { useScrollLock, ScrollLock } from "@/lib/scrollLock";
import { useRecorder, fmtClock } from "@/hooks/useRecorder";
import { Waveform } from "./Waveform";
import { NoteEditor } from "./NoteEditor";
import { ConsentGate } from "./ConsentGate";
import { useProcessing } from "@/lib/processing";
import { micError } from "@/lib/mic";
import { MicCheck } from "./MicCheck";
import { MantAIButton } from "@/components/mantai/MantAI";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { LiveChecklist } from "./LiveChecklist";
import { useLiveChecklist, toChecklist, autoTemplate } from "./useLiveChecklist";

export const ConsultationOverlay = ({ open, patient, waiting, initial, onClose, onDone, onAppointmentDone, patients = [], onPatientsChange, onEditPatient }) => {
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
  const [mods, setMods] = useState({ options: [], id: "" });
  const { track } = useProcessing();
  const rec = useRecorder();
  const [cfg, setCfg] = useState({ realtime: true, demo: false });
  const [confirm, setConfirm] = useState(null);
  const models = templates.map(toChecklist);
  const live = useLiveChecklist({ models, model: tplId, demo: cfg.demo });

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
    setConfirm(null);
    live.reset();
    if (!initial) {
      api.mantaiSettings().then(setCfg).catch(() => {});
      api.moduleSettings().then((r) => setMods({ options: r.visit_options ?? [], id: r.module_id })).catch(() => setMods({ options: [], id: "" }));
    }
    if (!initial) api.visitTemplates().then((xs) => { setTemplates(xs); setTplId((cur) => (xs.some((t) => t.id === cur) ? cur : xs[0]?.id ?? "")); }).catch(() => setTemplates([]));
  }, [open, patient, initial]); // eslint-disable-line react-hooks/exhaustive-deps

  // Bilancio di salute consigliato per l'età del paziente; preselezionato se il motivo della visita è un bilancio
  const linkedPatient = patients.find((p) => p.id === sel?.patient_id);
  const ageM = ageMonths(linkedPatient?.birth_date);
  const suggested = ageM === null ? null : templates.find((t) => t.bilancio && ageM >= t.age_from && ageM < t.age_to);
  // Modello scelto in automatico dal motivo in agenda (bilancio per età), finché il medico non lo cambia
  const userPicked = useRef(false);
  useEffect(() => { if (open) userPicked.current = false; }, [open]);
  useEffect(() => {
    if (!templates.length || userPicked.current) return;
    const t = autoTemplate(templates, `${sel?.visit_type ?? ""} ${sel?.reason ?? ""}`, ageM);
    if (t) setTplId(t.id);
  }, [templates.length, sel?.id, sel?.name, ageM]); // eslint-disable-line react-hooks/exhaustive-deps
  const pickTpl = (id) => { userPicked.current = true; setTplId(id); };

  const name = sel?.name || freeName.trim();
  useEffect(() => { setHint(""); }, [name, paper, manual]);

  // Invia audio/trascrizione e apre subito la cartella: Whisper + IA lavorano in background sul server
  const process = async (transcript, duration, opts = {}) => {
    setSending(true);
    try {
      let partIds = [];
      if (transcript === null && !opts.demo) {
        // le parti (una ogni 10 minuti) vengono caricate una alla volta; in caso di errore si riprende dalla prima non inviata
        // finish() ha già fermato il registratore: qui rec.state può essere ancora "recording" (closure del render precedente)
        if (!lastBlob.current?.length) { lastBlob.current = await rec.stop(); uploaded.current = []; }
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
        duration_sec: duration, paper_consent: paper, transcript: transcript ?? "", part_ids: partIds.join(","), template_id: tplId, module_id: mods.id,
        ...(opts.checklist ? { checklist_id: "template", checklist_manual: JSON.stringify(live.manualValues()), ...(opts.demo ? { checklist_demo: JSON.stringify(live.aiValues()) } : {}) } : {}),
        ...(opts.liveChunks ? { live_session_id: live.session.current, live_chunks: opts.liveChunks } : {}),
      }, null);
      lastBlob.current = null;
      uploaded.current = [];
      track(c);
      setResult(c);
      setStage("note");
      if (sel?.appointment_id) await onAppointmentDone?.(sel.appointment_id);
      onDone();
    } catch (e) {
      const msg = e?.response ? errMsg(e) : e.message;
      if (opts.liveChunks && lastBlob.current) { setSending(false); return process(null, duration, { checklist: true }); }
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
    live.reset();
    const chunked = cfg.realtime && !cfg.demo;
    try { await rec.start(chunked ? { every: 30, onChunk: live.onChunk } : null); live.setDemoOn(cfg.demo); setStage("recording"); }
    catch (e) { fail(micError(e)); }
    setStarting(false);
  };

  // Termina: promemoria dei campi obbligatori vuoti (mai bloccante), poi trascrizione già accumulata a blocchi
  const missing = live.fields.filter((f) => f.required && !live.values[f.id]);
  const finish = async () => {
    setConfirm(null);
    live.setDemoOn(false);
    const duration = rec.seconds;
    if (rec.state !== "idle") { lastBlob.current = await rec.stop(); uploaded.current = []; }
    if (cfg.demo) return process(null, duration, { checklist: true, demo: true });
    if (cfg.realtime) {
      setSending(true);
      setSendStep("Completamento trascrizione…");
      const count = rec.chunkCount();
      if (await live.flush(count)) return process("", duration, { checklist: true, liveChunks: count });
    }
    return process(null, duration, { checklist: true });
  };
  const onStop = () => (missing.length ? setConfirm(missing) : finish());

  const close = async () => {
    if (rec.state !== "idle") await rec.stop();
    onClose();
  };

  useScrollLock(open);
  if (!open) return null;
  return (
    <motion.div
      initial={{ clipPath: "circle(0% at 50% 60%)" }}
      animate={{ clipPath: "circle(150% at 50% 60%)" }}
      transition={{ duration: 0.8, ease: [0.65, 0, 0.35, 1] }}
      className="theme-bar grain fixed inset-0 z-50 overflow-auto overscroll-contain text-[var(--ink)]"
      data-testid="consultation-overlay"
      data-lenis-prevent
    >
      <div className="mx-auto flex min-h-full max-w-[1280px] flex-col px-5 py-6 lg:px-10">
        <div className="flex items-center justify-between">
          <div className="text-[11px] uppercase tracking-[0.22em] text-[var(--fg2)]">Consultazione · {stageLabel[stage]}</div>
          <button onClick={close} className="grid h-11 w-11 place-items-center rounded-full border border-[var(--hair)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--fg)]" data-testid="consultation-close-btn" aria-label="Chiudi"><X size={18} /></button>
        </div>
        <div className="flex flex-1 flex-col justify-center py-8">
          {stage === "setup" && (
            <Setup {...{ waiting, sel, setSel, freeName, setFreeName, manual, setManual, text, setText, start, hint, sending: sending || starting, starting }} picker={<><ModulePicker mods={mods} setId={(id) => setMods((m) => ({ ...m, id }))} /><ModelRow tpl={templates.find((t) => t.id === tplId)}><TemplatePicker templates={templates} value={tplId} onChange={pickTpl} suggested={suggested} ageM={ageM} /></ModelRow></>} gate={<ConsentGate patient={patients.find((p) => p.id === sel?.patient_id)} free={!sel?.patient_id && Boolean(freeName.trim())} paper={paper} setPaper={setPaper} onSaved={onPatientsChange} />} />
          )}
          {(stage === "recording") && (
            <RecordingLayout panel={<LiveChecklist models={models} model={tplId} onModel={pickTpl} live={live} realtime={cfg.realtime || cfg.demo} />}
              sheetPanel={<LiveChecklist models={models} model={tplId} onModel={pickTpl} live={live} realtime={cfg.realtime || cfg.demo} collapsible={false} bare />}
              counter={`${live.fields.filter((f) => live.values[f.id]).length}/${live.fields.length}`} demo={cfg.demo}>
              <Recording name={name} rec={rec} sending={sending} sendStep={sendStep} onStop={onStop} />
            </RecordingLayout>
          )}
          {stage === "retry" && (
            <div className="flex flex-col items-center gap-5 text-center" data-testid="consultation-retry">
              <div className="font-display text-4xl">Invio della registrazione non riuscito</div>
              <div className="text-sm text-[var(--fg2)]">L'audio di {name} è ancora qui: verifichi la connessione e riprovi.</div>
              <button onClick={() => process(null, rec.seconds, { checklist: true })} disabled={sending} className="flex h-14 items-center gap-2 rounded-full bg-[var(--accent)] px-7 font-semibold text-[var(--fg)] disabled:opacity-60" data-testid="consultation-retry-btn">
                {sending ? <Loader2 size={18} className="animate-spin" /> : <Square size={16} fill="currentColor" />} Riprova invio
              </button>
            </div>
          )}
          {confirm && <MissingDialog missing={confirm} onBack={() => setConfirm(null)} onFinish={finish} />}
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

const ModelRow = ({ tpl, children }) => {
  const [open, setOpen] = useState(false);
  if (!tpl) return null;
  return (
    <div className="space-y-3" data-testid="consult-model-row">
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--hair)] px-5 py-3">
        <span className="min-w-0"><span className="block text-[11px] uppercase tracking-[0.18em] text-[var(--fg2)]">Modello di visita</span><span className="block truncate font-medium" data-testid="consult-model-name">{tpl.name}</span></span>
        <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="shrink-0 rounded-full border border-[var(--hair)] px-3 py-1.5 text-sm font-medium" data-testid="consult-model-change">{open ? "Chiudi" : "Cambia"}</button>
      </div>
      {open && <div onClick={(e) => e.target.closest("button[data-testid^='consult-template-']") && setOpen(false)}>{children}</div>}
    </div>
  );
};

const TplPill = ({ t, value, onChange, hint }) => (
  <button type="button" onClick={() => onChange(t.id)} className={`rounded-full px-4 py-2 text-sm transition-colors ${t.id === value ? "bg-[var(--accent)] font-semibold text-[var(--fg)]" : hint ? "border border-[var(--accent)] text-[var(--ink)] hover:border-[var(--ink)]" : "border border-[var(--hair)] text-[var(--fg2)] hover:border-[var(--hair)]"}`} data-testid={`consult-template-${t.id}`}>
    {t.name.replace("Bilancio di salute · ", "")} <span className="opacity-60">· {t.fields.length} campi</span>{hint && <span className="ml-1.5 rounded-full bg-[var(--accent)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--fg)]" data-testid="consult-template-suggested">{hint}</span>}
  </button>
);

// Cartella della visita: preselezionata la specialità principale, cambiabile solo se serve (specialità secondarie o Generale)
const ModulePicker = ({ mods, setId }) => (mods.options.length > 1 ? (
  <label className="mb-3 flex flex-wrap items-center gap-2 text-sm" data-testid="consult-module-picker">
    <span className="text-[11px] uppercase tracking-[0.2em] text-[var(--fg2)]">Cartella</span>
    <select value={mods.id} onChange={(e) => setId(e.target.value)} className="h-9 rounded-full border border-[var(--hair)] bg-[var(--raised)] px-3 text-sm outline-none focus:border-[var(--accent)]" data-testid="consult-module-select">
      {mods.options.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
    </select>
  </label>
) : null);

const TemplatePicker = ({ templates, value, onChange, suggested, ageM }) => (templates.length ? (
  <div className="rounded-2xl border border-[var(--hair)] p-4" data-testid="consult-template-picker">
    <div className="flex items-center justify-between gap-2 text-[11px] uppercase tracking-[0.2em] text-[var(--fg2)]"><span className="flex items-center gap-1.5"><LayoutTemplate size={13} /> Modello di visita</span><Link to="/app/area-personale?sezione=modelli" className="normal-case tracking-normal text-[var(--fg2)] hover:text-[var(--ink)]" data-testid="consult-template-manage">Gestisci</Link></div>
    <div className="mt-3 flex flex-wrap gap-2">
      {templates.filter((t) => !t.bilancio).map((t) => <TplPill key={t.id} t={t} value={value} onChange={onChange} />)}
    </div>
    {templates.some((t) => t.bilancio) && (
      <>
        <div className="mt-4 text-[11px] uppercase tracking-[0.2em] text-[var(--fg2)]">Bilanci di salute{suggested ? ` · consigliato per ${ageLabel(ageM)}` : ""}</div>
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
      <h2 className="font-display text-5xl leading-[1.02] lg:text-6xl">Chi stai<br /><span className="italic text-[var(--fg2)]">visitando?</span></h2>
      <p className="mt-4 max-w-md text-[var(--fg2)]">La visita viene registrata, trascritta e trasformata nella cartella clinica secondo il modello scelto: anamnesi, motivo e sintomi, parametri, esame obiettivo, diagnosi e terapia su misura.</p>
      <div className="mt-5"><MantAIButton variant="icon" view="doctor" /></div>
    </div>
    <div className="space-y-3">
      {waiting.map((w) => (
        <button key={w.id} onClick={() => { setSel(w); setFreeName(""); }} className={`flex w-full items-center justify-between rounded-2xl border px-5 py-4 text-left transition-colors ${sel?.id === w.id ? "border-[var(--ink)] bg-[var(--accent)] text-[var(--fg)]" : "border-[var(--hair)] hover:border-[var(--hair)]"}`} data-testid={`consult-select-${w.id}`}>
          <span><span className="block font-medium">{w.name}</span><span className={`text-sm ${sel?.id === w.id ? "text-[var(--fg2)]" : "text-[var(--fg2)]"}`}>{w.clinic} · {w.reason}</span></span>
          {w.priority === "urgente" && <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--alert)]">Urgente</span>}
        </button>
      ))}
      {sel && !waiting.some((w) => w.id === sel.id) && (
        <div className="flex w-full items-center justify-between gap-3 rounded-2xl border border-[var(--ink)] bg-[var(--accent)] px-5 py-4 text-[var(--fg)]" data-testid="consult-preselected">
          <span className="min-w-0"><span className="block text-[11px] uppercase tracking-[0.18em] text-[var(--fg2)]">Paziente selezionato</span><span className="block truncate font-medium" data-testid="consult-preselected-name">{sel.name}</span></span>
          <button onClick={() => setSel(null)} className="shrink-0 rounded-full border border-[var(--hair)] px-3 py-1.5 text-sm font-medium" data-testid="consult-preselected-change">Cambia</button>
        </div>
      )}
      <input value={freeName} onChange={(e) => { setFreeName(e.target.value); setSel(null); }} placeholder="Oppure scrivi nome e cognome del paziente" className="w-full rounded-2xl border border-[var(--hair)] bg-transparent px-5 py-4 text-[var(--ink)] placeholder:text-[var(--fg2)] outline-none focus:border-[var(--hair)]" data-testid="consult-free-name-input" />
      {gate}
      {picker}
      <button onClick={() => setManual(!manual)} className="flex items-center gap-2 text-sm text-[var(--fg2)] hover:text-[var(--ink)]" data-testid="consult-manual-toggle"><Keyboard size={15} /> {manual ? "Torna alla registrazione vocale" : "Senza microfono? Incolla una trascrizione"}</button>
      {manual && <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} placeholder="Medico: Buongiorno, cosa la porta qui oggi? Paziente: …" className="w-full rounded-2xl border border-[var(--hair)] bg-[var(--sel)] px-5 py-4 text-[var(--ink)] placeholder:text-[var(--fg2)] outline-none focus:border-[var(--hair)]" data-testid="consult-manual-textarea" />}
      {!manual && <MicCheck />}
      {hint && <p role="alert" className="rounded-2xl border border-[var(--alert)] bg-[var(--alert-bg)] px-5 py-3 text-sm text-[var(--alert)]" data-testid="consult-start-error">{hint}</p>}
      <button onClick={start} disabled={sending} className="mt-2 flex w-full items-center justify-center gap-3 rounded-full bg-[var(--accent)] py-5 text-lg font-semibold text-[var(--fg)] transition-transform hover:-translate-y-0.5 active:scale-[0.98]" data-testid="consult-begin-btn">
        {sending ? <Loader2 size={20} className="animate-spin" /> : manual ? <Keyboard size={20} /> : <Mic size={20} />} {starting ? "In attesa del microfono…" : manual ? "Genera nota clinica" : "Inizia registrazione"}
      </button>
    </div>
  </div>
);

const RecordingLayout = ({ panel, sheetPanel, counter, demo, children }) => {
  const [sheet, setSheet] = useState(false);
  return (
    <div className="grid items-start gap-8 md:grid-cols-[minmax(0,1fr)_320px] lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0">
        {demo && <div className="mb-4 text-center text-[11px] uppercase tracking-[0.2em] text-[var(--fg2)]" data-testid="live-demo-badge">Modalità dimostrativa · dati finti</div>}
        {children}
        <div className="mt-8 flex justify-center md:hidden">
          <button onClick={() => setSheet(true)} className="rounded-full border border-[var(--hair)] px-5 py-2.5 text-sm font-medium" data-testid="live-sheet-btn">Modello ({counter})</button>
        </div>
      </div>
      <div className="hidden md:block">{panel}</div>
      <Sheet open={sheet} onOpenChange={setSheet}>
        <SheetContent side="bottom" className="theme-bar bg-[var(--bar)] max-h-[85vh] overflow-y-auto rounded-t-3xl border-0 p-5 text-[var(--ink)]" data-testid="live-sheet">
          <SheetTitle className="sr-only">Modello di visita</SheetTitle>
          {sheetPanel}
        </SheetContent>
      </Sheet>
    </div>
  );
};

const MissingDialog = ({ missing, onBack, onFinish }) => (
  <div className="fixed inset-0 z-[60] grid place-items-center bg-[var(--scrim)] p-5" role="alertdialog" aria-modal="true" aria-labelledby="missing-title" data-testid="live-missing-dialog">
    <ScrollLock />
    <div className="max-h-[90dvh] w-full max-w-md overflow-y-auto overscroll-contain rounded-3xl bg-[var(--surface)] p-6 text-[var(--fg)]">
      <h3 id="missing-title" className="text-lg font-semibold">Mancano {missing.length} {missing.length === 1 ? "campo" : "campi"}: {missing.map((f) => f.label).join(", ")}</h3>
      <p className="mt-2 text-sm text-[var(--fg2)]">Può tornare alla visita per completarli o terminare comunque: nella nota compariranno come "Non rilevato".</p>
      <div className="mt-6 flex flex-wrap justify-end gap-2">
        <button onClick={onBack} className="h-11 rounded-full border border-[var(--hair)] px-5 text-sm font-medium" data-testid="live-missing-back">Torna alla visita</button>
        <button onClick={onFinish} className="h-11 rounded-full bg-[var(--fg)] px-5 text-sm font-semibold text-[var(--surface)]" data-testid="live-missing-finish">Termina comunque</button>
      </div>
    </div>
  </div>
);

const Recording = ({ name, rec, onStop, sending, sendStep }) => {
  const live = rec.state === "recording";
  return (
    <div className="flex flex-col items-center text-center" data-testid="consultation-recording">
      <div className={`flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] ${live ? "border-[var(--alert)] text-[var(--alert)]" : "border-[var(--hair)] text-[var(--fg2)]"}`}>
        <span className={`h-2 w-2 rounded-full ${live ? "animate-pulse bg-[var(--alert)]" : "bg-[var(--wait)]"}`} /> {live ? "Registrazione in corso" : "In pausa"}
      </div>
      <div className="mt-6 font-mono text-7xl tabular-nums sm:text-8xl lg:text-9xl" data-testid="recording-timer">{fmtClock(rec.seconds)}</div>
      <div className="mt-3 text-[var(--fg2)]">{name}</div>
      {rec.parts > 1 && <div className="mt-2 text-xs uppercase tracking-[0.18em] text-[var(--fg2)]" data-testid="recording-parts">Visita lunga · parte {rec.parts} · salvataggio automatico ogni 10 minuti</div>}
      <div className="mt-8 w-full max-w-3xl"><Waveform analyser={rec.analyser} active={live} /></div>
      <div className="mt-10 flex items-center gap-4">
        <button onClick={live ? rec.pause : rec.resume} className="grid h-16 w-16 place-items-center rounded-full border border-[var(--hair)] transition-colors hover:bg-[var(--sel)]" data-testid="recording-pause-btn" aria-label="Pausa">{live ? <Pause /> : <Play />}</button>
        <button onClick={onStop} disabled={sending} className="flex h-16 items-center gap-3 rounded-full bg-[var(--accent)] px-8 text-lg font-semibold text-[var(--fg)] transition-transform hover:-translate-y-0.5 disabled:opacity-80" data-testid="recording-stop-btn">
          {sending ? <Loader2 size={18} className="animate-spin" /> : <Square size={18} fill="currentColor" />} {sending ? sendStep || "Apertura cartella…" : "Termina e trascrivi"}
        </button>
      </div>
    </div>
  );
};
