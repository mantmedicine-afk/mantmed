import { useEffect, useRef } from "react";
import { Save, Trash2, X, Sparkles } from "lucide-react";
import { CATS, CAT, NOTE_HINTS, VIEWS, DESCRITTORI, STATI } from "@/lib/bodychart";
import { PinPhotos } from "./PinPhotos";
import { LesionHistory } from "./LesionHistory";

const field = "h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-night outline-none focus:border-night";

/** Scheda compatta del reperto: categoria, descrizione, misura, descrittore, stato, foto. Un solo pulsante salva. Esc chiude, Invio salva. */
export const PinSheet = ({ m, n, isNew, cid, photoMeta, onMeta, history, onChange, onSave, onCancel, onDelete, busy }) => {
  const box = useRef(null);
  useEffect(() => {
    const key = (e) => {
      if (document.querySelector('[role="alertdialog"], [data-testid="bodychart-photo-lightbox"]')) return;
      if (e.key === "Escape") { e.preventDefault(); onCancel(); }
      if (e.key === "Enter" && !e.shiftKey && !["TEXTAREA", "SELECT", "BUTTON"].includes(e.target.tagName)) { e.preventDefault(); onSave(); }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onCancel, onSave]);
  const c = CAT[m.cat];
  return (
    <div ref={box} className="fixed inset-x-0 bottom-0 z-[70] max-h-[78vh] overflow-y-auto rounded-t-[28px] bg-white p-4 shadow-[0_-12px_40px_rgba(10,25,47,0.18)] ring-2 sm:p-5 lg:static lg:z-auto lg:max-h-none lg:rounded-3xl lg:shadow-none"
      style={{ "--tw-ring-color": c.color }} data-testid="bodychart-marker-editor" role="dialog" aria-label={isNew ? "Nuovo reperto" : `Reperto ${n}`}>
      <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-slate-200 lg:hidden" />
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-semibold text-night">
          <span className="grid h-6 w-6 place-items-center rounded-full text-[11px] text-white" style={{ background: c.color }}>{isNew ? "+" : n}</span>
          {isNew ? "Nuovo reperto" : "Reperto"} · {VIEWS.find((v) => v.id === m.view)?.label}
        </span>
        <div className="flex gap-1.5">
          {!isNew && <button onClick={onDelete} className="grid h-9 w-9 place-items-center rounded-full text-rose-700 ring-1 ring-slate-200 hover:ring-rose-300" aria-label="Elimina reperto" data-testid="bodychart-marker-delete"><Trash2 size={15} /></button>}
          <button onClick={onCancel} className="grid h-9 w-9 place-items-center rounded-full ring-1 ring-slate-200 hover:ring-night" aria-label="Chiudi scheda (Esc)" data-testid="bodychart-sheet-close"><X size={15} /></button>
        </div>
      </div>
      {m.origin === "mantai" && <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[#FFF1CC] px-3 py-1 text-xs font-semibold text-[#5C3A00] ring-1 ring-[#E3A92B]" data-testid="bodychart-sheet-mantai"><Sparkles size={12} /> Posizione proposta da MantAI: verifichi e trascini il pin se serve</div>}
      <div className="mt-3 grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Categoria" data-testid="bodychart-marker-cat">
        {CATS.map((x) => (
          <button key={x.id} role="radio" aria-checked={m.cat === x.id} onClick={() => onChange({ ...m, cat: x.id })}
            className={`flex min-h-[44px] items-center gap-1.5 rounded-xl px-2 text-left text-[12px] font-medium leading-tight transition-colors ${m.cat === x.id ? "bg-night text-white" : "bg-[#F4F5F7] text-night hover:bg-slate-200"}`} data-testid={`bodychart-sheet-cat-${x.id}`}>
            <span className="h-3 w-3 shrink-0 rounded-full ring-2 ring-white" style={{ background: x.color }} />{x.label}
          </button>
        ))}
      </div>
      <input autoFocus={window.innerWidth >= 1024} maxLength={140} value={m.note} onChange={(e) => onChange({ ...m, note: e.target.value })} placeholder="Descrizione breve (es. Livido)" className={`${field} mt-3`} data-testid="bodychart-marker-note" />
      <div className="mt-2 flex flex-wrap gap-1.5">
        {(NOTE_HINTS[m.cat] ?? []).map((h) => <button key={h} onClick={() => onChange({ ...m, note: h })} className="rounded-full bg-[#F4F5F7] px-3 py-1.5 text-xs text-night hover:bg-slate-200" data-testid={`bodychart-hint-${h.replace(/\W+/g, "-").toLowerCase()}`}>{h}</button>)}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Misura (cm)
          <input type="number" inputMode="decimal" min="0.1" max="100" step="0.1" value={m.size_cm ?? ""} onChange={(e) => onChange({ ...m, size_cm: e.target.value === "" ? null : Math.min(100, Math.max(0.1, +e.target.value)) })} placeholder="facoltativa" className={`${field} mt-1 normal-case tracking-normal`} data-testid="bodychart-marker-size" />
        </label>
        <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Descrittore
          <select value={m.descrittore ?? ""} onChange={(e) => onChange({ ...m, descrittore: e.target.value || null })} className={`${field} mt-1 normal-case tracking-normal`} data-testid="bodychart-marker-descrittore">
            <option value="">— facoltativo —</option>
            {DESCRITTORI.map((d) => <option key={d} value={d}>{d[0].toUpperCase() + d.slice(1)}</option>)}
          </select>
        </label>
      </div>
      <div className="mt-3 flex rounded-full bg-[#F4F5F7] p-1" role="radiogroup" aria-label="Stato" data-testid="bodychart-marker-stato">
        {STATI.map((s) => <button key={s.id} role="radio" aria-checked={(m.stato ?? "attivo") === s.id} onClick={() => onChange({ ...m, stato: s.id })} className={`h-9 flex-1 rounded-full text-xs font-medium transition-colors ${(m.stato ?? "attivo") === s.id ? "bg-night text-white" : "text-slate-600"}`} data-testid={`bodychart-stato-${s.id}`}>{s.label}</button>)}
      </div>
      <PinPhotos cid={cid} m={m} onChange={onChange} meta={photoMeta} onMeta={onMeta} />
      {history?.length > 0 && <LesionHistory entries={history} meta={photoMeta} compact />}
      <button onClick={onSave} disabled={busy} className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-night text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 disabled:opacity-60" data-testid="bodychart-sheet-save">
        <Save size={16} /> {isNew ? "Salva reperto" : "Salva modifiche"} <span className="hidden text-xs font-normal text-white/60 lg:inline">· Invio</span>
      </button>
    </div>
  );
};
