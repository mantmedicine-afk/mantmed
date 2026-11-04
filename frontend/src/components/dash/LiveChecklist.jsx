import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Circle, CheckCircle2, ChevronDown, ChevronUp, PenLine } from "lucide-react";

const strip = (preview, label) => (preview.toLowerCase().startsWith(`${label.toLowerCase()}:`) ? preview.slice(label.length + 1).trim() : preview);

const FieldRow = ({ f, v, onSave }) => {
  const [edit, setEdit] = useState(false);
  const [text, setText] = useState("");
  const open = () => { setText(v?.status === "manual" ? v.preview : ""); setEdit(true); };
  const save = () => { onSave(f.id, text); setEdit(false); };
  const done = Boolean(v);
  return (
    <li className="py-1.5" data-testid={`live-field-${f.id}`} data-state={v?.status ?? "empty"}>
      <button type="button" onClick={done && v.status === "ai" ? undefined : open} className={`flex w-full items-start gap-2.5 text-left ${done && v.status === "ai" ? "cursor-default" : ""}`} aria-label={done ? f.label : `Scrivi a mano: ${f.label}`}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span key={done ? "on" : "off"} initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 420, damping: 22 }} className="mt-0.5 shrink-0">
            {done ? <CheckCircle2 size={16} className="text-[var(--ok)]" /> : <Circle size={16} className="text-[var(--fg2)] opacity-60" />}
          </motion.span>
        </AnimatePresence>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] leading-snug">{f.label}{f.required && <span className="ml-0.5 text-[var(--fg2)]" aria-label="obbligatorio">*</span>}</span>
          {done && !edit && <span className="flex items-center gap-1 truncate text-xs text-[var(--fg2)]" data-testid={`live-field-preview-${f.id}`}>{v.status === "manual" && <PenLine size={11} className="shrink-0" aria-label="Scritto a mano" />}<span className="truncate">{strip(v.preview, f.label)}</span></span>}
        </span>
      </button>
      {edit && (
        <form onSubmit={(e) => { e.preventDefault(); save(); }} className="ml-6 mt-1.5 flex gap-1.5">
          <input autoFocus value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setEdit(false)} placeholder={f.hint || f.label}
            className="min-w-0 flex-1 rounded-lg border border-[var(--hair)] px-2.5 py-1.5 text-xs outline-none focus:border-[var(--ink)]" data-testid={`live-field-input-${f.id}`} />
          <button type="submit" className="rounded-lg border border-[var(--hair)] px-2.5 text-xs font-medium" data-testid={`live-field-save-${f.id}`}>OK</button>
        </form>
      )}
    </li>
  );
};

export const Counter = ({ done, total }) => (
  <div data-testid="live-counter">
    <div className="flex items-center justify-between text-xs text-[var(--fg2)]"><span>Campi compilati: <span className="font-semibold tabular-nums text-[var(--ink)]" data-testid="live-counter-value">{done} di {total}</span></span></div>
    <div className="mt-1.5 h-[3px] overflow-hidden rounded-full bg-[var(--sel)]"><motion.div className="h-full rounded-full bg-[var(--ok)]" initial={false} animate={{ width: `${total ? (done / total) * 100 : 0}%` }} transition={{ duration: 0.5 }} /></div>
  </div>
);

export const LiveChecklist = ({ models, model, onModel, live, realtime, collapsible = true, bare = false }) => {
  const [collapsed, setCollapsed] = useState(false);
  const done = live.fields.filter((f) => live.values[f.id]).length;
  const sections = [...new Set(live.fields.map((f) => f.section))];
  return (
    <aside className={`text-left ${bare ? "pr-8" : "rounded-2xl border border-[var(--hair)] p-4"}`} aria-label="Modello di visita" data-testid="live-checklist">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] uppercase tracking-[0.2em] text-[var(--fg2)]">Modello di visita</span>
        {collapsible && <button onClick={() => setCollapsed((c) => !c)} className="grid h-7 w-7 place-items-center rounded-full text-[var(--fg2)] hover:bg-[var(--sel)]" aria-label={collapsed ? "Espandi il modello" : "Comprimi il modello"} aria-expanded={!collapsed} data-testid="live-collapse-btn">{collapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}</button>}
      </div>
      {!collapsed && (
        <select value={model} onChange={(e) => onModel(e.target.value)} aria-label="Scegli il modello" className="mt-2.5 w-full rounded-lg border border-[var(--hair)] px-2.5 py-1.5 text-xs outline-none" data-testid="live-model-picker">
          {models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      )}
      <div className="mt-3"><Counter done={done} total={live.fields.length} /></div>
      {!collapsed && <>
        {!realtime && <p className="mt-2 text-[11px] text-[var(--fg2)]" data-testid="live-off-note">Checklist in tempo reale disattivata: i campi si compilano al termine.</p>}
        <div className="mt-3 max-h-[52vh] space-y-3 overflow-y-auto pr-1">
          {sections.map((s) => (
            <div key={s}>
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--fg2)]">{s}</div>
              <ul className="mt-0.5">{live.fields.filter((f) => f.section === s).map((f) => <FieldRow key={f.id} f={f} v={live.values[f.id]} onSave={live.setManual} />)}</ul>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-[var(--fg2)]">* obbligatorio · tocchi un campo vuoto per scriverlo a mano</p>
      </>}
    </aside>
  );
};
