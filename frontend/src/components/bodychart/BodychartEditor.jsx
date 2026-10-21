import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { X, Save, Loader2, Baby, User, Map as MapIcon, History, ZoomIn, CopyPlus } from "lucide-react";
import { api, errMsg } from "@/lib/api";
import { VIEWS, ZOOMS, uid } from "@/lib/bodychart";
import { BodyCanvas } from "./BodyCanvas";
import { Tools, MarkerEditor, MarkerList } from "./Tools";
import { BodychartHistory } from "./BodychartHistory";
import { makeSnapshot } from "./snapshot";
import { PinPhotos } from "./PinPhotos";

const seg = (on) => `flex h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-medium transition-colors ${on ? "bg-night text-white" : "text-slate-600 hover:text-night"}`;

export const BodychartEditor = ({ consultation, defaultKind = "child", onClose, onSaved }) => {
  const [tab, setTab] = useState("map");
  const [loading, setLoading] = useState(true);
  const [kind, setKind] = useState(defaultKind);
  const [view, setView] = useState("front");
  const [zoom, setZoom] = useState("full");
  const [prev, setPrev] = useState(null);
  const [tool, setTool] = useState("marker");
  const [cat, setCat] = useState("lesione");
  const [pen, setPen] = useState({ color: "#DC2626", width: 2.5 });
  const [doc, setDoc] = useState({ markers: [], strokes: [] });
  const [past, setPast] = useState([]);
  const [selected, setSelected] = useState(null);
  const [include, setInclude] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    api.getBodychart(consultation.id).then((b) => {
      if (!alive || !b) return;
      setKind(b.silhouette); setDoc({ markers: b.markers ?? [], strokes: b.strokes ?? [] }); setInclude(!!b.include_in_report);
    }).catch((e) => toast.error(errMsg(e))).finally(() => { if (alive) setLoading(false); });
    if (consultation.patient_id) api.patientBodycharts(consultation.patient_id).then((xs) => { if (alive) setPrev(xs.find((b) => b.consultation_id !== consultation.id && b.markers.length) ?? null); }).catch(() => {});
    return () => { alive = false; };
  }, [consultation.id, consultation.patient_id]);
  const carryOver = () => {
    const copied = prev.markers.map((m) => ({ ...m, id: uid(), cat: "controllo", photos: [], note: `Controllo: ${m.note || "reperto"}`.slice(0, 140) }));
    commit({ ...doc, markers: [...doc.markers, ...copied] });
    toast.success(`${copied.length} marcatori riportati dalla visita del ${new Date(`${prev.visit_date}T12:00:00`).toLocaleDateString("it-IT")}`);
  };
  const box = view === "mouth" ? undefined : ZOOMS.find((z) => z.id === zoom)?.box;

  const numbers = useMemo(() => Object.fromEntries(doc.markers.map((m, i) => [m.id, i + 1])), [doc.markers]);
  const commit = (next) => { setPast((p) => [...p.slice(-49), doc]); setDoc(next); };
  const addMarker = (pos) => { const m = { id: uid(), cat, note: "", ...pos }; commit({ ...doc, markers: [...doc.markers, m] }); setSelected(m.id); };
  const update = (m) => setDoc((d) => ({ ...d, markers: d.markers.map((x) => (x.id === m.id ? m : x)) }));
  const remove = (id) => { commit({ ...doc, markers: doc.markers.filter((x) => x.id !== id) }); setSelected(null); };
  const undo = () => { if (!past.length) return; setDoc(past[past.length - 1]); setPast((p) => p.slice(0, -1)); setSelected(null); };
  const clearView = () => commit({ markers: doc.markers.filter((m) => m.view !== view), strokes: doc.strokes.filter((s) => s.view !== view) });
  const sel = doc.markers.find((m) => m.id === selected);

  const save = async () => {
    setBusy(true);
    try {
      const date = new Date(consultation.created_at).toLocaleDateString("it-IT");
      const snapshot = await makeSnapshot({ kind, markers: doc.markers, strokes: doc.strokes, numbers, title: `${consultation.patient_name} · Bodychart visita del ${date}` });
      await api.saveBodychart(consultation.id, { silhouette: kind, markers: doc.markers, strokes: doc.strokes, snapshot, include_in_report: include });
      toast.success(include ? "Bodychart salvato nella visita e incluso nel referto" : "Bodychart salvato nella visita");
      onSaved?.(doc.markers.length);
    } catch (e) { toast.error(e?.response ? errMsg(e) : "Impossibile generare l'istantanea"); }
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-[60] overflow-auto bg-[#F4F5F7] text-night" data-testid="bodychart-editor" data-lenis-prevent>
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 px-4 py-3 lg:px-8">
          <div className="min-w-0"><div className="text-[11px] uppercase tracking-[0.22em] text-slate-600">Bodychart · mappa corporea</div><div className="truncate font-display text-2xl">{consultation.patient_name}</div></div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-full bg-[#F4F5F7] p-1" role="tablist">
              <button role="tab" aria-selected={tab === "map"} onClick={() => setTab("map")} className={seg(tab === "map")} data-testid="bodychart-tab-map"><MapIcon size={15} /> Mappa</button>
              <button role="tab" aria-selected={tab === "history"} onClick={() => setTab("history")} className={seg(tab === "history")} data-testid="bodychart-tab-history"><History size={15} /> Storico</button>
            </div>
            <button onClick={onClose} className="grid h-11 w-11 place-items-center rounded-full ring-1 ring-slate-200 hover:ring-night" aria-label="Chiudi bodychart" data-testid="bodychart-close"><X size={18} /></button>
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-[1440px] px-4 py-5 lg:px-8">
        {tab === "history" ? <BodychartHistory patientId={consultation.patient_id} currentId={consultation.id} /> : loading ? <Loader2 className="animate-spin" /> : (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_380px]">
            <div className="rounded-3xl bg-white p-3 ring-1 ring-slate-200 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="-mx-1 flex gap-1 overflow-x-auto px-1" role="tablist" data-testid="bodychart-views">
                  {VIEWS.map((v) => <button key={v.id} role="tab" aria-selected={view === v.id} onClick={() => { setView(v.id); setSelected(null); }} className={seg(view === v.id)} data-testid={`bodychart-view-${v.id}`}>{v.label} {doc.markers.some((m) => m.view === v.id) && <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />}</button>)}
                </div>
                <div className="flex rounded-full bg-[#F4F5F7] p-1" data-testid="bodychart-silhouette">
                  <button onClick={() => setKind("child")} className={seg(kind === "child")} data-testid="bodychart-kind-child"><Baby size={15} /> Bambino</button>
                  <button onClick={() => setKind("adult")} className={seg(kind === "adult")} data-testid="bodychart-kind-adult"><User size={15} /> Adulto</button>
                </div>
              </div>
              {view !== "mouth" && (
                <div className="-mx-1 mt-3 flex items-center gap-1 overflow-x-auto px-1" role="tablist" data-testid="bodychart-zooms">
                  <ZoomIn size={15} className="mr-1 shrink-0 text-slate-500" />
                  {ZOOMS.map((z) => <button key={z.id} role="tab" aria-selected={zoom === z.id} onClick={() => setZoom(z.id)} className={`h-9 shrink-0 rounded-full px-3.5 text-[13px] font-medium transition-colors ${zoom === z.id ? "bg-[#3B6CF6] text-white" : "bg-[#F4F5F7] text-night hover:bg-slate-200"}`} data-testid={`bodychart-zoom-${z.id}`}>{z.label}</button>)}
                </div>
              )}
              <div className="mx-auto mt-3 h-[62vh] min-h-[440px] max-w-[520px]">
                <BodyCanvas box={box} kind={kind} view={view} tool={tool} pen={pen} markers={doc.markers} strokes={doc.strokes} numbers={numbers} selected={selected}
                  onMarker={addMarker} onStroke={(s) => commit({ ...doc, strokes: [...doc.strokes, s] })} onPick={setSelected} />
              </div>
            </div>
            <aside className="space-y-4">
              {sel && <MarkerEditor m={sel} n={numbers[sel.id]} onChange={update} onDelete={() => remove(sel.id)} extra={<PinPhotos cid={consultation.id} m={sel} onChange={update} />} />}
              {prev && <button onClick={carryOver} className="flex w-full items-center gap-3 rounded-3xl bg-[#F0FDF4] p-4 text-left text-sm text-night ring-1 ring-emerald-200 transition-colors hover:ring-emerald-400" data-testid="bodychart-carry-over"><CopyPlus size={18} className="shrink-0 text-emerald-700" /><span><span className="block font-medium">Riporta i marcatori della visita precedente</span><span className="text-xs text-slate-600">{prev.markers.length} reperti del {new Date(`${prev.visit_date}T12:00:00`).toLocaleDateString("it-IT")} come «Controllo»</span></span></button>}
              <div className="rounded-3xl bg-white p-4 ring-1 ring-slate-200"><Tools {...{ tool, cat, pen, setTool, setCat, setPen }} onUndo={undo} onClear={clearView} canUndo={past.length > 0} /></div>
              <div className="rounded-3xl bg-white p-4 ring-1 ring-slate-200">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">Marcatori ({doc.markers.length})</div>
                <MarkerList markers={doc.markers} numbers={numbers} selected={selected} onPick={(m) => { setView(m.view); setSelected(m.id); setTool("marker"); }} />
              </div>
              <div className="rounded-3xl bg-white p-4 ring-1 ring-slate-200">
                <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={include} onChange={(e) => setInclude(e.target.checked)} className="mt-0.5 h-5 w-5 accent-[#0A192F]" data-testid="bodychart-include-report" />
                  <span><span className="block font-medium">Includi nel referto</span><span className="text-xs text-slate-600">Aggiunge una pagina con la mappa e la legenda al PDF della visita, anche quello inviato o pubblicato alla famiglia.</span></span></label>
                <button onClick={save} disabled={busy} className="mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-full bg-night text-base font-semibold text-white transition-transform hover:-translate-y-0.5 disabled:opacity-60" data-testid="bodychart-save-btn">
                  {busy ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} Salva Bodychart nella Visita
                </button>
              </div>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
};
