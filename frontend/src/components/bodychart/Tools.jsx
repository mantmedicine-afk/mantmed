import { Undo2, Eraser, PenLine, Highlighter, Trash2 } from "lucide-react";
import { CATS, CAT, NOTE_HINTS, VIEWS } from "@/lib/bodychart";

const SWATCH = ["#0A192F", "#DC2626", "#7C3AED", "#EA580C", "#0D9488", "#2563EB"];
const btn = (on) => `flex h-11 items-center gap-2 rounded-xl px-3 text-sm font-medium transition-colors ${on ? "bg-night text-white" : "bg-white text-night ring-1 ring-slate-200 hover:ring-night"}`;

export const Tools = ({ tool, cat, pen, setTool, setCat, setPen, onUndo, onClear, canUndo }) => (
  <div className="space-y-4" data-testid="bodychart-tools">
    <div>
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">Categorie reperto · tocca la mappa</div>
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-1">
        {CATS.map((c) => (
          <button key={c.id} onClick={() => { setTool("marker"); setCat(c.id); }} className={btn(tool === "marker" && cat === c.id)} data-testid={`bodychart-cat-${c.id}`}>
            <span className="h-4 w-4 shrink-0 rounded-full ring-2 ring-white" style={{ background: c.color }} /> <span className="truncate">{c.label}</span>
          </button>
        ))}
      </div>
    </div>
    <div>
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">Disegno a mano libera</div>
      <div className="flex flex-wrap gap-1.5">
        <button onClick={() => setTool("pen")} className={btn(tool === "pen")} data-testid="bodychart-tool-pen"><PenLine size={16} /> Penna</button>
        <button onClick={() => setTool("highlighter")} className={btn(tool === "highlighter")} data-testid="bodychart-tool-highlighter"><Highlighter size={16} /> Evidenziatore</button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2" data-testid="bodychart-colors">
        {SWATCH.map((c) => <button key={c} onClick={() => setPen({ ...pen, color: c })} className={`h-8 w-8 rounded-full ring-offset-2 transition-transform hover:scale-110 ${pen.color === c ? "ring-2 ring-night" : ""}`} style={{ background: c }} aria-label={`Colore ${c}`} data-testid={`bodychart-color-${c.slice(1)}`} />)}
      </div>
    </div>
    <div className="flex flex-wrap gap-1.5">
      <button onClick={onUndo} disabled={!canUndo} className={`${btn(false)} disabled:opacity-40`} data-testid="bodychart-undo"><Undo2 size={16} /> Annulla</button>
      <button onClick={onClear} className={btn(false)} data-testid="bodychart-clear-view"><Eraser size={16} /> Pulisci vista</button>
    </div>
  </div>
);

export const MarkerEditor = ({ m, n, onChange, onDelete, extra = null }) => {
  const c = CAT[m.cat];
  return (
    <div className="rounded-2xl bg-white p-4 ring-2" style={{ "--tw-ring-color": c.color }} data-testid="bodychart-marker-editor">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-semibold text-night"><span className="grid h-6 w-6 place-items-center rounded-full text-[11px] text-white" style={{ background: c.color }}>{n}</span> {VIEWS.find((v) => v.id === m.view)?.label}</span>
        <button onClick={onDelete} className="grid h-9 w-9 place-items-center rounded-full text-rose-700 ring-1 ring-slate-200 hover:ring-rose-300" aria-label="Elimina marcatore" data-testid="bodychart-marker-delete"><Trash2 size={15} /></button>
      </div>
      <select value={m.cat} onChange={(e) => onChange({ ...m, cat: e.target.value })} className="mt-3 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-night" data-testid="bodychart-marker-cat">
        {CATS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
      </select>
      <input autoFocus maxLength={140} value={m.note} onChange={(e) => onChange({ ...m, note: e.target.value })} placeholder="Nota breve (es. Livido 2 cm)" className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-night outline-none focus:border-night" data-testid="bodychart-marker-note" />
      <div className="mt-2 flex flex-wrap gap-1.5">
        {(NOTE_HINTS[m.cat] ?? []).map((h) => <button key={h} onClick={() => onChange({ ...m, note: h })} className="rounded-full bg-[#F4F5F7] px-3 py-1.5 text-xs text-night hover:bg-slate-200" data-testid={`bodychart-hint-${h.replace(/\W+/g, "-").toLowerCase()}`}>{h}</button>)}
      </div>
      {extra}
    </div>
  );
};

export const MarkerList = ({ markers, numbers, selected, onPick }) => (
  <ol className="space-y-1.5" data-testid="bodychart-marker-list">
    {markers.length === 0 && <li className="text-sm text-slate-600">Nessun marcatore: scelga una categoria e tocchi la sagoma.</li>}
    {markers.map((m) => (
      <li key={m.id}>
        <button onClick={() => onPick(m)} className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm transition-colors ${selected === m.id ? "bg-white ring-1 ring-night" : "hover:bg-white"}`} data-testid={`bodychart-marker-row-${m.id}`}>
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white" style={{ background: CAT[m.cat]?.color }}>{numbers[m.id]}</span>
          <span className="min-w-0"><span className="block truncate font-medium text-night">{m.note || CAT[m.cat]?.label}</span><span className="block text-xs text-slate-600">{CAT[m.cat]?.label} · {VIEWS.find((v) => v.id === m.view)?.label}{m.photos?.length ? ` · ${m.photos.length} foto` : ""}</span></span>
        </button>
      </li>
    ))}
  </ol>
);
