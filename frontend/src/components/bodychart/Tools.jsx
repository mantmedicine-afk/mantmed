import { Undo2, Eraser, PenLine, Highlighter } from "lucide-react";
import { CATS, CAT, VIEWS, STATO } from "@/lib/bodychart";

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

export const MarkerList = ({ markers, numbers, selected, onPick }) => (
  <ol className="space-y-1.5" data-testid="bodychart-marker-list">
    {markers.length === 0 && <li className="text-sm text-slate-600">Nessun reperto: tocchi la figura per aggiungerne uno.</li>}
    {markers.map((m) => (
      <li key={m.id}>
        <button onClick={() => onPick(m)} className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm transition-colors ${selected === m.id ? "bg-white ring-1 ring-night" : "hover:bg-white"}`} data-testid={`bodychart-marker-row-${m.id}`}>
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white" style={{ background: CAT[m.cat]?.color }}>{numbers[m.id]}</span>
          <span className="min-w-0"><span className="block truncate font-medium text-night">{m.note || CAT[m.cat]?.label}</span><span className="block text-xs text-slate-600">{CAT[m.cat]?.label} · {VIEWS.find((v) => v.id === m.view)?.label} · {STATO[m.stato ?? "attivo"]?.label}{m.photos?.length ? ` · ${m.photos.length} foto` : ""}</span></span>
        </button>
      </li>
    ))}
  </ol>
);
