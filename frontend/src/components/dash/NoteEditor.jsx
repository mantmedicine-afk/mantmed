import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Copy, Printer, Save, Check, FileDown, Loader2 } from "lucide-react";
import { api, errMsg } from "@/lib/api";
import { TABS, tabDone, noteToText } from "@/lib/pediatric";
import { GrowthPanel } from "./GrowthPanel";
import { DoseCalculator } from "./DoseCalculator";

export const NoteEditor = ({ consultation, onSaved }) => {
  const [note, setNote] = useState(consultation.note ?? {});
  const [tab, setTab] = useState(TABS[0].id);
  const [saving, setSaving] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  useEffect(() => {
    setNote(consultation.note ?? {});
  }, [consultation]);

  const g = note.crescita ?? {};
  const current = TABS.find((t) => t.id === tab);

  const save = async () => {
    setSaving(true);
    try { await api.updateConsultation(consultation.id, note); toast.success("Cartella pediatrica salvata"); onSaved?.(); }
    catch (e) { toast.error(errMsg(e)); }
    setSaving(false);
  };
  const generatePdf = async () => {
    setPdfBusy(true);
    try {
      await api.updateConsultation(consultation.id, note);
      await api.downloadReport(consultation.id);
      toast.success("Referto PDF scaricato");
      onSaved?.();
    } catch (e) { toast.error(errMsg(e)); }
    setPdfBusy(false);
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(noteToText(consultation, note)); toast.success("Nota copiata negli appunti"); }
    catch { toast.error("Copia non consentita dal browser"); }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[0.75fr_1.6fr]" data-testid="note-editor">
      <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
        <div className="text-[11px] uppercase tracking-[0.22em] text-slate-300">Trascrizione · Whisper</div>
        <p className="mt-3 max-h-[22vh] overflow-auto whitespace-pre-wrap text-[15px] leading-relaxed text-slate-200 lg:max-h-[60vh]" data-testid="note-transcript" data-lenis-prevent>{consultation.transcript}</p>
      </div>
      <div className="min-w-0 rounded-3xl bg-white p-5 text-night lg:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Cartella pediatrica · visita specialistica</div>
            <div className="font-display text-3xl">{consultation.patient_name}</div>
          </div>
          <div className="flex gap-2">
            <ActionBtn onClick={copy} id="note-copy-btn"><Copy size={15} /> Copia</ActionBtn>
            <ActionBtn onClick={() => printNote(consultation, note)} id="note-print-btn"><Printer size={15} /> Stampa</ActionBtn>
            <button onClick={save} disabled={saving} className="flex items-center gap-2 rounded-full bg-night px-4 py-2 text-sm font-medium text-white transition-transform hover:-translate-y-0.5 disabled:opacity-60" data-testid="note-save-btn"><Save size={15} /> {saving ? "Salvataggio…" : "Salva"}</button>
          </div>
        </div>

        <button onClick={generatePdf} disabled={pdfBusy} className="group mt-5 flex w-full items-center justify-between gap-4 rounded-2xl bg-night px-5 py-4 text-left text-white transition-transform hover:-translate-y-0.5 active:scale-[0.99] disabled:opacity-70" data-testid="generate-pdf-btn">
          <span className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-full bg-white text-night">{pdfBusy ? <Loader2 size={18} className="animate-spin" /> : <FileDown size={18} />}</span>
            <span>
              <span className="block font-display text-2xl leading-none">{pdfBusy ? "Generazione in corso…" : "Genera Referto PDF"}</span>
              <span className="mt-1 block text-xs text-slate-300">Salva le modifiche e scarica il referto ufficiale firmabile</span>
            </span>
          </span>
          <span className="text-[11px] uppercase tracking-[0.2em] text-[#A9C2FF] transition-transform group-hover:translate-x-1">A4 · PDF</span>
        </button>

        <div className="-mx-1 mt-5 flex gap-1 overflow-x-auto px-1 pb-1 md:mx-0 md:grid md:grid-cols-5 md:overflow-visible md:rounded-2xl md:bg-slate-100 md:p-1" role="tablist" data-testid="note-tabs">
          {TABS.map((t) => {
            const active = t.id === tab;
            const done = tabDone(t, note);
            return (
              <button key={t.id} role="tab" aria-selected={active} onClick={() => setTab(t.id)} className={`relative flex shrink-0 items-center gap-2 rounded-2xl px-3.5 py-2.5 text-left text-sm font-medium leading-tight transition-colors md:shrink md:px-2.5 ${active ? "text-white" : "text-slate-600 hover:bg-white hover:text-night"}`} data-testid={`note-tab-${t.id}`}>
                {active && <motion.span layoutId="note-tab-pill" className="absolute inset-0 -z-0 rounded-2xl bg-night" transition={{ type: "spring", stiffness: 380, damping: 32 }} />}
                <span className={`relative font-mono text-xs ${active ? "text-[#A9C2FF]" : "text-[#3B6CF6]"}`}>{t.n}</span>
                <span className="relative">{t.label}</span>
                {done && <Check size={13} className={`relative ${active ? "text-emerald-300" : "text-emerald-600"}`} />}
              </button>
            );
          })}
        </div>

        <div className="mt-5 max-h-[58vh] overflow-auto pr-1" data-lenis-prevent data-testid={`note-panel-${tab}`}>
          {tab === "crescita" ? (
            <GrowthPanel g={g} set={(v) => setNote((n) => ({ ...n, crescita: v }))} />
          ) : (
            <div className="space-y-4">
              {current.fields.map(([k, l, hint]) => (
                <label key={k} className="block">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{l}</span>
                  {hint && <span className="ml-2 text-xs text-slate-500">· {hint}</span>}
                  <textarea value={note[k] ?? ""} onChange={(e) => setNote((n) => ({ ...n, [k]: e.target.value }))} rows={k === "terapia" || k === "sintomi" || k === "anamnesi_fisiologica" ? 3 : 2} className="mt-1.5 w-full resize-y rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-[15px] leading-relaxed outline-none transition-colors focus:border-night focus:bg-white" data-testid={`note-section-${k}`} />
                </label>
              ))}
              {tab === "terapia" && <DoseCalculator drugs={note.farmaci ?? []} peso={g.peso_kg} set={(v) => setNote((n) => ({ ...n, farmaci: v }))} />}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const esc = (s) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const printNote = (c, note) => {
  const w = window.open("", "_blank");
  if (!w) return toast.error("Consenti i popup per stampare");
  w.document.write(`<html><head><title>${esc(c.patient_name)}</title></head><body style="font:14px/1.6 Georgia,serif;color:#0B1736;padding:40px;white-space:pre-wrap">${esc(noteToText(c, note))}</body></html>`);
  w.document.close();
  w.print();
};

const ActionBtn = ({ children, onClick, id }) => (
  <button onClick={onClick} className="flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-medium transition-colors hover:border-night" data-testid={id}>{children}</button>
);
