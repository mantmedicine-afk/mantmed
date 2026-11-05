import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Copy, Printer, Save, Check, FileDown, Loader2, PersonStanding, IdCard, Sparkles, AlertTriangle, RotateCcw, Plus, X, PenLine } from "lucide-react";
import { useProcessing } from "@/lib/processing";
import { SignatureHint } from "@/components/signature/SignatureReminder";
import { api, errMsg } from "@/lib/api";
import { tabsFor, tabDone, noteToText, isPediatric, getField, setField } from "@/lib/pediatric";
import { GrowthPanel } from "./GrowthPanel";
import { DoseCalculator } from "./DoseCalculator";
import { SendToParents } from "./SendToParents";
import { CashPanel } from "./CashPanel";
import { PrevisitPanel } from "./PrevisitPanel";
import { BodychartEditor } from "@/components/bodychart/BodychartEditor";
import { AILabel, AIFieldMark } from "@/components/mantai/AILabel";
import { SignNote, needsSignature } from "./SignNote";

const BR = { position: "bottom-right" };
const motivo = (n) => (n.motivo_visita && n.motivo_visita !== "Non riportato" ? n.motivo_visita : "");
const visitLabel = (n) => {
  const m = motivo(n);
  if (isPediatric(n)) return m ? `Visita pediatrica · ${m}` : "";
  return `Visita specialistica di ${n.specialita}${m ? ` · ${m}` : ""}`;
};
// Parametri per le specializzazioni dell'adulto: solo peso, altezza e BMI (niente percentili OMS)
// Riepilogo in parole semplici per genitori / paziente (generato dall'IA insieme alla cartella, modificabile)
const SummaryCard = ({ note, setNote, consultation, processing, glow, flash, marked, touch }) => {
  const [busy, setBusy] = useState(false);
  const ped = isPediatric(note);
  const regen = async () => {
    setBusy(true);
    try { const t = await api.regenerateSummary(consultation.id); setNote((n) => ({ ...n, riepilogo: t })); toast.success("Riepilogo rigenerato: controlli e salvi", BR); } catch (e) { toast.error(errMsg(e), BR); }
    setBusy(false);
  };
  return (
    <div className="mt-6 rounded-3xl border border-[var(--hair)] bg-[var(--raised)] p-5" data-testid="note-summary-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-[var(--accent)]">In parole semplici</div>
          <div className="font-display text-2xl text-[var(--fg)]">{ped ? "Riepilogo per i genitori" : "Riepilogo per il paziente"}{marked && <AIFieldMark testId="note-ai-mark-riepilogo" />}</div>
        </div>
        {!processing && (
          <div className="flex gap-2">
            <button onClick={() => { navigator.clipboard.writeText(note.riepilogo || ""); toast.success("Riepilogo copiato", BR); }} disabled={!note.riepilogo} className="flex h-9 items-center gap-1.5 rounded-full border border-[var(--hair)] bg-[var(--surface)] px-3 text-sm text-[var(--fg)] hover:border-[var(--accent)] disabled:opacity-40" data-testid="note-summary-copy"><Copy size={14} /> Copia</button>
            <button onClick={regen} disabled={busy || consultation.status !== "ready"} className="flex h-9 items-center gap-1.5 rounded-full border border-[var(--hair)] bg-[var(--surface)] px-3 text-sm text-[var(--fg)] hover:border-[var(--accent)] disabled:opacity-40" data-testid="note-summary-regen">{busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} {note.riepilogo ? "Rigenera" : "Genera"}</button>
          </div>
        )}
      </div>
      {processing ? (
        <div className="mt-3 space-y-2" data-testid="note-summary-loading">{[95, 88, 70].map((w) => <div key={w} className="ai-shimmer h-3 rounded-full" style={{ width: `${w}%` }} />)}</div>
      ) : (
        <motion.textarea key={`sum-${flash}`} initial={glow ? { opacity: 0, y: 6 } : false} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
          value={note.riepilogo ?? ""} onChange={(e) => { touch("riepilogo"); setNote((n) => ({ ...n, riepilogo: e.target.value })); }} rows={5}
          placeholder={`Spiegazione della visita per ${ped ? "i genitori" : "il paziente"}: viene allegata all'email del referto e mostrata nel Portale.`}
          className={`mt-3 w-full resize-y rounded-2xl border border-[var(--hair)] bg-[var(--surface)] px-4 py-3 text-[15px] leading-relaxed outline-none focus:border-[var(--accent)] ${glow ? "ai-filled" : ""}`} data-testid="note-summary-text" />
      )}
      <p className="mt-2 text-xs text-[var(--fg2)]">Viene inserito nell’email del referto e mostrato nel Portale. Lo verifichi prima dell’invio.</p>
    </div>
  );
};

const AdultParams = ({ g, set }) => {
  const num = (v) => (v === "" ? null : Number(v));
  const bmiV = g.peso_kg && g.altezza_cm ? g.peso_kg / (g.altezza_cm / 100) ** 2 : null;
  return (
    <div className="grid gap-4 sm:grid-cols-3" data-testid="adult-params">
      {[["peso_kg", "Peso", "kg"], ["altezza_cm", "Altezza", "cm"]].map(([k, l, u]) => (
        <label key={k} className="block">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--fg2)]">{l}</span>
          <div className="mt-1.5 flex items-center rounded-2xl border border-[var(--hair)] bg-[var(--raised)] px-4 focus-within:border-[var(--accent)]">
            <input type="number" step="0.1" min="0" value={g[k] ?? ""} onChange={(e) => set({ ...g, [k]: num(e.target.value) })} className="h-12 w-full bg-transparent text-[15px] outline-none" data-testid={`adult-${k}`} />
            <span className="text-sm text-[var(--fg2)]">{u}</span>
          </div>
        </label>
      ))}
      <div className="rounded-2xl bg-[var(--accent)] p-4 text-[var(--ink)]"><div className="text-xs uppercase tracking-[0.18em] text-[var(--fg2)]">BMI</div><div className="mt-1 font-display text-3xl" data-testid="adult-bmi">{bmiV ? bmiV.toFixed(1).replace(".", ",") : "—"}</div></div>
    </div>
  );
};
const SignatureSlot = ({ onLeave }) => <div className="-mt-1 xl:col-start-1 xl:row-start-2"><SignatureHint onNavigate={onLeave} /></div>;
const GROWTH_KEYS = ["peso_kg", "altezza_cm", "circonferenza_cranica_cm", "eta_mesi"];

export const NoteEditor = ({ consultation: initialC, onSaved, onEditPatient, onLeave }) => {
  const [consultation, setC] = useState(initialC);
  const [note, setNote] = useState(initialC.note ?? {});
  const [flash, setFlash] = useState(0);
  const [glow, setGlow] = useState(false);
  const edited = useRef(false);
  const { subscribe, retry, track } = useProcessing();
  const processing = consultation.status === "processing";
  const failed = consultation.status === "failed";
  const ready = !processing && !failed;
  const [tab, setTab] = useState("anamnesi");
  const [saving, setSaving] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [chart, setChart] = useState(false);
  const [pins, setPins] = useState(null);
  const [touched, setTouched] = useState(() => new Set());
  const touch = (k) => setTouched((t) => (t.has(k) ? t : new Set(t).add(k)));
  const pending = new Set(consultation.ai_fields_pending ?? []);
  const marked = (k) => ready && pending.has(k) && !touched.has(k);
  const secKey = (x) => `sez:${(x.titolo ?? "").trim().toLowerCase()}`;
  useEffect(() => {
    let alive = true;
    api.getBodychart(consultation.id, true).then((b) => { if (alive) setPins(b ? (b.markers ?? []).length : null); }).catch(() => {});
    return () => { alive = false; };
  }, [consultation.id]);
  useEffect(() => {
    setC(initialC);
    setNote(initialC.note ?? {});
    setTouched(new Set());
    edited.current = false;
    track(initialC);
  }, [initialC, track]);

  // Durante l'elaborazione crescita e farmaci del medico vengono salvati in automatico (il server li unirà alla nota IA)
  const noteRef = useRef(note);
  noteRef.current = note;
  const autosave = useRef(null);
  const queueAutosave = () => {
    clearTimeout(autosave.current);
    autosave.current = setTimeout(() => { api.updateConsultation(consultation.id, noteRef.current, true).catch(() => {}); }, 900);
  };
  useEffect(() => () => clearTimeout(autosave.current), []);

  // Quando l'IA ha finito: i campi si popolano con animazione; crescita/farmaci inseriti dal medico restano
  useEffect(() => subscribe(consultation.id, (upd) => {
    setC(upd);
    if (upd.status !== "ready") return;
    const local = noteRef.current;
    const merged = { ...upd.note };
    if (edited.current) {
      const g = { ...(upd.note?.crescita ?? {}) };
      GROWTH_KEYS.forEach((k) => { const v = local.crescita?.[k]; if (v !== null && v !== undefined && v !== "") g[k] = v; });
      merged.crescita = g;
      if ((local.farmaci ?? []).some((d) => d.nome)) merged.farmaci = local.farmaci;
      clearTimeout(autosave.current);
      api.updateConsultation(upd.id, merged).then((r) => { if (r?.note) setNote(r.note); }).catch(() => {});
    }
    setNote(merged);
    setFlash((n) => n + 1);
    setGlow(true);
    setTimeout(() => setGlow(false), 2600);
    onSaved?.();
  }), [consultation.id, subscribe]); // eslint-disable-line react-hooks/exhaustive-deps
  const setGrowth = (v) => { edited.current = true; setNote((n) => ({ ...n, crescita: v })); if (processing) queueAutosave(); };
  const setDrugs = (v) => { edited.current = true; setNote((n) => ({ ...n, farmaci: v })); if (processing) queueAutosave(); };
  const [paste, setPaste] = useState(null);

  const g = note.crescita ?? {};
  const tabs = tabsFor(note);
  const current = tabs.find((t) => t.id === tab) ?? tabs[0];
  const sections = (note.sezioni ?? []).map((x, i) => ({ ...x, i })).filter((x) => x.gruppo === current.group || (current.id === "esame" && x.gruppo === "esame_obiettivo"));
  const setSection = (i, patch) => setNote((n) => ({ ...n, sezioni: (n.sezioni ?? []).map((x, j) => (j === i ? { ...x, ...patch } : x)) }));
  const addSection = () => setNote((n) => ({ ...n, sezioni: [...(n.sezioni ?? []), { gruppo: current.group || "esame_obiettivo", titolo: "Nuova voce", testo: "" }] }));
  const delSection = (i) => setNote((n) => ({ ...n, sezioni: (n.sezioni ?? []).filter((_, j) => j !== i) }));
  const sectionList = (
    <div className="space-y-4" data-testid={`note-sections-${current.id}`}>
              {sections.map((x) => (
                <div key={x.i} className="block" data-testid={`note-sezione-${x.i}`}>
                  <div className="flex items-center gap-2">
                    {marked(secKey(x)) ? <AIFieldMark testId={`note-ai-mark-sezione-${x.i}`} /> : x.fonte === "ai" && <Sparkles size={12} className="shrink-0 text-[var(--fg2)]" aria-label="Compilato da MantAI" title="Compilato da MantAI" data-testid={`note-sezione-ai-${x.i}`} />}
                    {x.fonte === "manuale" && <PenLine size={12} className="shrink-0 text-[var(--fg2)]" aria-label="Inserito a mano" title="Inserito a mano" data-testid={`note-sezione-manual-${x.i}`} />}
                    <input value={x.titolo} onChange={(e) => setSection(x.i, { titolo: e.target.value })} disabled={processing} className="min-w-0 flex-1 bg-transparent text-xs font-semibold uppercase tracking-[0.18em] text-[var(--fg2)] outline-none focus:text-[var(--fg)]" aria-label="Titolo della voce" data-testid={`note-sezione-title-${x.i}`} />
                    {!processing && <button onClick={() => delSection(x.i)} className="grid h-7 w-7 place-items-center rounded-full text-[var(--fg2)] hover:bg-[var(--raised)] hover:text-[var(--alert)]" aria-label="Rimuovi voce" data-testid={`note-sezione-del-${x.i}`}><X size={14} /></button>}
                  </div>
                  {processing ? <div className="mt-1.5 flex h-[64px] flex-col justify-center gap-2 rounded-2xl border border-[var(--hair)] bg-[var(--raised)] px-4" data-testid={`note-sezione-loading-${x.i}`}><div className="ai-shimmer h-3 w-11/12 rounded-full" /><div className="ai-shimmer h-3 w-2/3 rounded-full" /></div> : <motion.textarea key={`s${x.i}-${flash}`} initial={glow ? { opacity: 0, y: 6 } : false} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} value={x.testo} onChange={(e) => { touch(secKey(x)); setSection(x.i, { testo: e.target.value, mancante: false }); }} rows={2}
                    className={`mt-1.5 w-full resize-y rounded-2xl border px-4 py-3 text-[15px] leading-relaxed outline-none transition-colors focus:border-[var(--accent)] focus:bg-[var(--surface)] ${x.mancante ? "border-[var(--late)] bg-[var(--late-bg)] text-[var(--late)]" : "border-[var(--hair)] bg-[var(--raised)]"} ${glow ? "ai-filled" : ""}`} data-mancante={x.mancante ? "true" : undefined} data-testid={`note-sezione-text-${x.i}`} />}
                </div>
              ))}
              {!isPediatric(note) && current.id === "esame" && processing && !sections.length && [1, 2, 3].map((k) => (
                <div key={k} className="space-y-2"><div className="ai-shimmer h-3 w-40 rounded-full" /><div className="ai-shimmer h-14 w-full rounded-2xl" /></div>
              ))}
              {!processing && current.group && (
                <button onClick={addSection} className="flex items-center gap-1.5 rounded-full border border-dashed border-[var(--hair)] px-4 py-2 text-sm text-[var(--fg2)] hover:border-[var(--accent)] hover:text-[var(--fg)]" data-testid="note-sezione-add"><Plus size={14} /> Aggiungi voce</button>
              )}
    </div>
  );

  const save = async () => {
    setSaving(true);
    try {
      const r = await api.updateConsultation(consultation.id, note, processing);
      if (r?.note && r.status !== "processing") setNote(r.note);
      if (r?.status) setC(r);
      toast.success(r?.status === "processing" ? "Crescita e terapia salvate: il resto lo compila l'IA" : "Cartella pediatrica salvata", BR);
      onSaved?.();
    }
    catch (e) { toast.error(errMsg(e), BR); }
    setSaving(false);
  };
  const generatePdf = async () => {
    setPdfBusy(true);
    try {
      await api.updateConsultation(consultation.id, note);
      await api.downloadReport(consultation.id);
      toast.success("Referto PDF scaricato", BR);
      onSaved?.();
    } catch (e) { toast.error(errMsg(e), BR); }
    setPdfBusy(false);
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(noteToText(consultation, note)); toast.success("Nota copiata negli appunti", BR); }
    catch { toast.error("Copia non consentita dal browser", BR); }
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[0.75fr_1.6fr]" data-testid="note-editor">
      <div className="rounded-3xl border border-[var(--hair)] bg-[var(--sel)] p-5">
        <div className="text-[11px] uppercase tracking-[0.22em] text-[var(--fg2)]">Trascrizione · Whisper</div>
        {consultation.ai_provenance?.parti?.trascrizione && <AILabel variant="trascrizione" view="doctor" className="mt-2" testId="note-ai-label-transcript" />}
        {processing && !consultation.transcript ? (
          <div className="mt-4 space-y-2.5" data-testid="note-transcript-loading">
            {[92, 78, 88, 64, 82, 55].map((w, i) => <div key={i} className="ai-shimmer-dark h-3 rounded-full" style={{ width: `${w}%` }} />)}
            <p className="pt-2 text-xs text-[var(--fg2)]">Trascrizione dell’audio in corso…</p>
          </div>
        ) : (
          <motion.p key={`t-${flash}`} initial={glow ? { opacity: 0 } : false} animate={{ opacity: 1 }} transition={{ duration: 0.6 }} className="mt-3 max-h-[22vh] overflow-auto whitespace-pre-wrap text-[15px] leading-relaxed text-[var(--fg2)] lg:max-h-[60vh]" data-testid="note-transcript" data-lenis-prevent>{consultation.transcript || "—"}</motion.p>
        )}
      </div>
      <div className="min-w-0 rounded-3xl bg-[var(--surface)] p-5 text-[var(--fg)] lg:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-[0.22em] text-[var(--fg2)]" data-testid="note-specialty">{isPediatric(note) ? "Cartella pediatrica · visita specialistica" : `Cartella clinica · ${note.specialita}`}</div>
            <div className="font-display text-3xl">{consultation.patient_name}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setChart(true)} className="flex items-center gap-2 rounded-full border border-[var(--accent)] bg-[var(--raised)] px-4 py-2 text-sm font-semibold text-[var(--fg)] transition-transform hover:-translate-y-0.5" data-testid="note-bodychart-btn">
              <PersonStanding size={15} /> Bodychart{pins !== null && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[var(--accent)] px-1 text-[11px] text-[var(--ink)]" data-testid="note-bodychart-count">{pins}</span>}
            </button>
            {consultation.patient_id && onEditPatient && <ActionBtn onClick={() => onEditPatient(consultation.patient_id)} id="note-patient-btn"><IdCard size={15} /> Dati anagrafici</ActionBtn>}
            <ActionBtn onClick={copy} id="note-copy-btn" disabled={!ready}><Copy size={15} /> Copia</ActionBtn>
            <ActionBtn onClick={() => printNote(consultation, note)} id="note-print-btn" disabled={!ready}><Printer size={15} /> Stampa</ActionBtn>
            <button onClick={save} disabled={saving} className="flex items-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--ink)] transition-transform hover:-translate-y-0.5 disabled:opacity-60" data-testid="note-save-btn"><Save size={15} /> {saving ? "Salvataggio…" : "Salva"}</button>
          </div>
        </div>

        {processing && (
          <div className="mt-4 flex items-center gap-3 rounded-2xl border border-[var(--hair)] bg-[var(--raised)] px-4 py-3 text-sm text-[var(--fg)]" data-testid="note-processing-banner">
            <span className="relative grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--accent)] text-[var(--ink)]"><Loader2 size={15} className="animate-spin" /><Sparkles size={9} className="absolute -right-0.5 -top-0.5 text-[var(--fg2)]" /></span>
            <span><span className="font-semibold">L’IA sta compilando la cartella.</span> <span className="text-[var(--fg2)]">Nel frattempo può usare Bodychart, Cassa, Crescita e Dati anagrafici: i campi si riempiranno da soli.</span></span>
          </div>
        )}
        <SignNote consultation={consultation} hasChart={!!pins} beforeSign={() => api.updateConsultation(consultation.id, note)} onSigned={(r) => { setC(r); setNote(r.note); setTouched(new Set()); onSaved?.(); }} />
        {failed && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--alert)] bg-[var(--alert-bg)] px-4 py-3 text-sm text-[var(--alert)]" data-testid="note-failed-banner">
            <span className="flex items-center gap-2"><AlertTriangle size={16} className="shrink-0" /> {consultation.ai_error || "Elaborazione IA non riuscita"}</span>
            <span className="flex flex-wrap gap-2">
              <button onClick={() => setPaste(paste === null ? "" : null)} className="flex h-9 items-center gap-1.5 rounded-full border border-[var(--alert)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--alert)]" data-testid="note-paste-toggle">Incolla trascrizione</button>
              <button onClick={() => retry(consultation.id)} className="flex h-9 items-center gap-1.5 rounded-full bg-[var(--alert)] px-4 text-sm font-semibold text-[var(--ink)]" data-testid="note-retry-btn"><RotateCcw size={14} /> Riprova</button>
            </span>
            <span className="w-full text-xs text-rose-800/80">In alternativa compili i campi qui sotto e prema Salva: la cartella diventa definitiva.</span>
            {paste !== null && (
              <div className="w-full space-y-2">
                <textarea value={paste} onChange={(e) => setPaste(e.target.value)} rows={4} placeholder="Medico: Buongiorno… Genitore: …" className="w-full rounded-xl border border-[var(--alert)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--fg)] outline-none focus:border-[var(--accent)]" data-testid="note-paste-textarea" />
                <button onClick={async () => { if (paste.trim().length < 20) return toast.error("Trascrizione troppo breve", BR); const r = await retry(consultation.id, paste); if (r) setPaste(null); }} className="flex h-9 items-center gap-1.5 rounded-full bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--ink)]" data-testid="note-paste-submit"><Sparkles size={14} /> Compila con l’IA</button>
              </div>
            )}
          </div>
        )}
        <div className="mt-5 grid grid-cols-1 gap-3 xl:grid-cols-[1.25fr_1fr]">
        <button onClick={generatePdf} disabled={pdfBusy || !ready} className="group flex w-full items-center justify-between gap-4 rounded-2xl bg-[var(--accent)] px-5 py-4 text-left text-[var(--ink)] transition-transform hover:-translate-y-0.5 active:scale-[0.99] disabled:opacity-70" data-testid="generate-pdf-btn">
          <span className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-full bg-[var(--surface)] text-[var(--fg)]">{pdfBusy ? <Loader2 size={18} className="animate-spin" /> : <FileDown size={18} />}</span>
            <span>
              <span className="block font-display text-2xl leading-none">{pdfBusy ? "Generazione in corso…" : "Genera & Scarica Referto PDF"}</span>
              <span className="mt-1 block text-xs text-[var(--fg2)]">{ready ? "Salva la visita e scarica subito il referto ufficiale, pronto per la firma" : "Disponibile appena l'IA completa la cartella"}</span>
            </span>
          </span>
          <span className="text-[11px] uppercase tracking-[0.2em] text-[var(--fg2)] transition-transform group-hover:translate-x-1">A4 · PDF</span>
        </button>
        <SignatureSlot onLeave={onLeave} />
        <SendToParents consultation={consultation} disabled={!ready} needsSign={needsSignature(consultation)} beforeSend={() => api.updateConsultation(consultation.id, note)} />
        </div>
        <CashPanel consultation={consultation} service={visitLabel(note)} onChange={onSaved} />

        <div className="-mx-1 mt-5 flex gap-1 overflow-x-auto px-1 pb-1 md:mx-0 md:grid md:auto-cols-fr md:grid-flow-col md:overflow-visible md:rounded-2xl md:bg-[var(--raised)] md:p-1" role="tablist" data-testid="note-tabs">
          {tabs.map((t) => {
            const active = t.id === tab;
            const done = ready && tabDone(t, note);
            const toCheck = (t.fields ?? []).some(([k]) => marked(k)) || (note.sezioni ?? []).some((x) => (x.gruppo === t.group || (t.id === "esame" && x.gruppo === "esame_obiettivo")) && marked(secKey(x)));
            return (
              <button key={t.id} role="tab" aria-selected={active} onClick={() => setTab(t.id)} className={`relative flex shrink-0 items-center gap-2 rounded-2xl px-3.5 py-2.5 text-left text-sm font-medium leading-tight transition-colors md:shrink md:px-2.5 ${active ? "text-[var(--ink)]" : "text-[var(--fg2)] hover:bg-[var(--surface)] hover:text-[var(--fg)]"}`} data-testid={`note-tab-${t.id}`}>
                {active && <motion.span layoutId="note-tab-pill" className="absolute inset-0 -z-0 rounded-2xl bg-[var(--accent)]" transition={{ type: "spring", stiffness: 380, damping: 32 }} />}
                <span className={`relative font-mono text-xs ${active ? "text-[var(--fg2)]" : "text-[var(--accent)]"}`}>{t.n}</span>
                <span className="relative">{t.label}</span>
                {done && <Check size={13} className={`relative ${active ? "text-[var(--ok)]" : "text-[var(--ok)]"}`} />}
                {toCheck && <span className="relative h-2 w-2 shrink-0 rounded-full bg-[var(--sel)]" role="img" aria-label="Contiene campi compilati da MantAI da verificare" title="Campi MantAI da verificare" data-testid={`note-tab-ai-dot-${t.id}`} />}
              </button>
            );
          })}
        </div>

        <div className="mt-5 max-h-[58vh] overflow-auto pr-1" data-lenis-prevent data-testid={`note-panel-${tab}`}>
          {tab === "crescita" ? (
            <div className="space-y-6">{isPediatric(note) ? <GrowthPanel g={g} set={setGrowth} /> : <AdultParams g={g} set={setGrowth} />}{sectionList}</div>
          ) : (
            <div className="space-y-4">
              {current.fields.map(([k, l, hint]) => (
                <label key={k} className="block">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--fg2)]">{l}</span>
                  {hint && <span className="ml-2 text-xs text-[var(--fg2)]">· {hint}</span>}
                  {marked(k) && <AIFieldMark testId={`note-ai-mark-${k}`} />}
                  {!processing ? (
                    <motion.textarea key={`${k}-${flash}`} initial={glow ? { opacity: 0, y: 6 } : false} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                      value={getField(note, k) ?? ""} onChange={(e) => { touch(k); const v = e.target.value; setNote((n) => setField(n, k, v)); }} rows={k === "terapia" || k === "sintomi" || k === "anamnesi_fisiologica" ? 3 : 2}
                      className={`mt-1.5 w-full resize-y rounded-2xl border border-[var(--hair)] bg-[var(--raised)] px-4 py-3 text-[15px] leading-relaxed outline-none transition-colors focus:border-[var(--accent)] focus:bg-[var(--surface)] ${glow ? "ai-filled" : ""}`} data-testid={`note-section-${k}`} />
                  ) : (
                    <div className={`mt-1.5 flex flex-col justify-center gap-2 rounded-2xl border border-[var(--hair)] bg-[var(--raised)] px-4 ${k === "terapia" || k === "sintomi" || k === "anamnesi_fisiologica" ? "h-[88px]" : "h-[64px]"}`} aria-busy={processing} data-testid={`note-section-${k}-loading`}>
                      {processing ? <><div className="ai-shimmer h-3 w-11/12 rounded-full" /><div className="ai-shimmer h-3 w-2/3 rounded-full" /></> : <span className="text-sm text-[var(--fg2)]">In attesa dell’elaborazione IA</span>}
                    </div>
                  )}
                </label>
              ))}
              {sectionList}
              {tab === "terapia" && <DoseCalculator drugs={note.farmaci ?? []} peso={g.peso_kg} set={setDrugs} />}
            </div>
          )}
        </div>
        <PrevisitPanel pv={consultation.previsit} />
        <SummaryCard note={note} setNote={setNote} consultation={consultation} processing={processing} glow={glow} flash={flash} marked={marked("riepilogo")} touch={touch} />
      </div>
      {chart && <BodychartEditor consultation={consultation} defaultKind={(g.eta_mesi ?? 0) >= 168 ? "adult" : "child"} onClose={() => setChart(false)} onSaved={(n) => { setPins(n); setChart(false); onSaved?.(); }} />}
    </div>
  );
};

const esc = (s) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const printNote = (c, note) => {
  const w = window.open("", "_blank");
  if (!w) return toast.error("Consenti i popup per stampare", BR);
  w.document.write(`<html><head><title>${esc(c.patient_name)}</title></head><body style="font:14px/1.6 Georgia,serif;color:#0B1736;padding:40px;white-space:pre-wrap">${esc(noteToText(c, note))}</body></html>`);
  w.document.close();
  w.print();
};

const ActionBtn = ({ children, onClick, id, disabled = false }) => (
  <button onClick={onClick} disabled={disabled} className="flex items-center gap-2 rounded-full border border-[var(--hair)] px-4 py-2 text-sm font-medium transition-colors hover:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-40" data-testid={id}>{children}</button>
);
