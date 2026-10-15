import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, Printer, Save } from "lucide-react";
import { api, errMsg } from "@/lib/api";

export const SECTIONS = [
  ["anamnesi", "Anamnesi"],
  ["esame_obiettivo", "Esame obiettivo"],
  ["diagnosi", "Diagnosi"],
  ["terapia", "Terapia"],
  ["follow_up", "Follow-up"],
];

export const noteToText = (c, note) =>
  `${c.patient_name} — ${new Date(c.created_at).toLocaleString("it-IT")}\n\n` +
  SECTIONS.map(([k, l]) => `${l.toUpperCase()}\n${note[k] || "—"}`).join("\n\n");

export const NoteEditor = ({ consultation, onSaved }) => {
  const [note, setNote] = useState(consultation.note ?? {});
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setNote(consultation.note ?? {});
  }, [consultation]);

  const save = async () => {
    setSaving(true);
    try { await api.updateConsultation(consultation.id, note); toast.success("Nota clinica salvata"); onSaved?.(); }
    catch (e) { toast.error(errMsg(e)); }
    setSaving(false);
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(noteToText(consultation, note)); toast.success("Nota copiata negli appunti"); }
    catch { toast.error("Copia non consentita dal browser"); }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]" data-testid="note-editor">
      <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
        <div className="text-[11px] uppercase tracking-[0.22em] text-slate-300">Trascrizione · Whisper</div>
        <p className="mt-3 max-h-[52vh] overflow-auto whitespace-pre-wrap text-[15px] leading-relaxed text-slate-200" data-testid="note-transcript" data-lenis-prevent>{consultation.transcript}</p>
      </div>
      <div className="rounded-3xl bg-white p-5 text-night lg:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Modello standard · nota clinica</div>
            <div className="font-display text-3xl">{consultation.patient_name}</div>
          </div>
          <div className="flex gap-2">
            <ActionBtn onClick={copy} id="note-copy-btn"><Copy size={15} /> Copia</ActionBtn>
            <ActionBtn onClick={() => window.print()} id="note-print-btn"><Printer size={15} /> Stampa</ActionBtn>
            <button onClick={save} disabled={saving} className="flex items-center gap-2 rounded-full bg-night px-4 py-2 text-sm font-medium text-white transition-transform hover:-translate-y-0.5 disabled:opacity-60" data-testid="note-save-btn"><Save size={15} /> {saving ? "Salvataggio…" : "Salva"}</button>
          </div>
        </div>
        <div className="mt-5 max-h-[52vh] space-y-4 overflow-auto pr-1" data-lenis-prevent>
          {SECTIONS.map(([k, l], i) => (
            <label key={k} className="block">
              <span className="flex items-baseline gap-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                <span className="font-mono text-[#3B6CF6]">0{i + 1}</span>{l}
              </span>
              <textarea
                value={note[k] ?? ""}
                onChange={(e) => setNote((n) => ({ ...n, [k]: e.target.value }))}
                rows={k === "anamnesi" ? 4 : 2}
                className="mt-1.5 w-full resize-y rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-[15px] leading-relaxed outline-none transition-colors focus:border-night focus:bg-white"
                data-testid={`note-section-${k}`}
              />
            </label>
          ))}
        </div>
      </div>
    </div>
  );
};

const ActionBtn = ({ children, onClick, id }) => (
  <button onClick={onClick} className="flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-medium transition-colors hover:border-night" data-testid={id}>{children}</button>
);
