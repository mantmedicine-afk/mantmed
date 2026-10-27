import { useEffect, useMemo, useState } from "react";
import { Loader2, Columns2, Images } from "lucide-react";
import { api } from "@/lib/api";
import { CAT, VIEWS, VB_W, VB_H } from "@/lib/bodychart";
import { Silhouette, Strokes, Pins } from "./Silhouette";
import { LesionHistory, StatoBadge, day } from "./LesionHistory";

const sel = "h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-night";

/** Una visita del confronto: figura disegnata dal vivo (niente immagini pesanti) + elenco dei reperti con stato. */
const Panel = ({ id, side, view, items }) => {
  const [d, setD] = useState(null);
  useEffect(() => { setD(null); if (id) api.bodychart(id, true).then(setD).catch(() => setD({ markers: [], strokes: [] })); }, [id]);
  const info = items.find((x) => x.id === id);
  const nums = useMemo(() => Object.fromEntries((d?.markers ?? []).map((m, i) => [m.id, i + 1])), [d]);
  return (
    <div className="min-w-0 rounded-3xl bg-white p-3 ring-1 ring-slate-200 sm:p-4" data-testid={`bodychart-compare-${side}`}>
      <div className="flex items-center justify-between gap-2"><span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{side === "a" ? "Prima" : "Dopo"}</span><span className="font-display text-lg text-night">{info ? day(info.visit_date) : "…"}</span></div>
      {!d ? <Loader2 className="mt-4 animate-spin text-night" /> : (
        <>
          <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="mx-auto mt-2 h-[46vh] max-h-[480px] min-h-[300px] w-full" role="img" aria-label={`Bodychart del ${day(d.visit_date)}`}>
            <Silhouette kind={d.silhouette} view={view} /><Strokes items={(d.strokes ?? []).filter((s) => s.view === view)} />
            <Pins items={d.markers.filter((m) => m.view === view)} numbers={nums} />
          </svg>
          <ol className="mt-3 space-y-1.5">{d.markers.map((m) => (
            <li key={m.id} className="flex items-center gap-2 text-sm text-night" data-testid={`bodychart-compare-${side}-pin-${m.id}`}>
              <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white" style={{ background: CAT[m.cat]?.color }}>{nums[m.id]}</span>
              <span className="min-w-0 flex-1 truncate">{m.note || CAT[m.cat]?.label}{m.size_cm ? ` · ${m.size_cm} cm` : ""} · <span className="text-slate-500">{VIEWS.find((v) => v.id === m.view)?.label}</span></span>
              <StatoBadge stato={m.stato} testId={`bodychart-compare-${side}-stato-${m.id}`} />
            </li>))}
            {!d.markers.length && <li className="text-sm text-slate-500">Nessun reperto in questa visita.</li>}
          </ol>
        </>
      )}
    </div>
  );
};

/** Confronta: due visite affiancate scelte per data, e storia/foto di ogni reperto. */
export const BodychartHistory = ({ patientId }) => {
  const [items, setItems] = useState(null);
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [view, setView] = useState("front");
  const [les, setLes] = useState(null);
  useEffect(() => {
    if (!patientId) { setItems([]); return; }
    api.patientBodycharts(patientId).then((r) => {
      const asc = [...r].sort((x, y) => x.visit_date.localeCompare(y.visit_date));
      setItems(asc); setA(asc.length > 1 ? asc[asc.length - 2].id : asc[0]?.id ?? ""); setB(asc[asc.length - 1]?.id ?? "");
      const v = asc[asc.length - 1]?.markers[0]?.view; if (v) setView(v);
    }).catch(() => setItems([]));
    api.bodychartLesions(patientId).then(setLes).catch(() => setLes({ lesions: [], photo_meta: {} }));
  }, [patientId]);
  if (items === null) return <Loader2 className="animate-spin text-night" />;
  if (!items.length) return <div className="rounded-3xl bg-white p-6 ring-1 ring-slate-200" data-testid="bodychart-history"><p className="text-sm text-slate-600" data-testid="bodychart-history-empty">{patientId ? "Nessun bodychart salvato nelle visite precedenti." : "Paziente non collegato a una cartella: lo storico non è disponibile."}</p></div>;
  const used = VIEWS.filter((v) => items.filter((x) => x.id === a || x.id === b).some((x) => x.markers.some((m) => m.view === v.id)) || v.id === "front");
  const opt = (x) => <option key={x.id} value={x.id}>{day(x.visit_date)} · {new Date(x.created_at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })} · {x.markers.length} {x.markers.length === 1 ? "reperto" : "reperti"}</option>;
  const multi = (les?.lesions ?? []).filter((l) => l.entries.length > 1 || l.entries.some((e) => e.photos?.length));
  return (
    <div className="space-y-5" data-testid="bodychart-history">
      <div className="rounded-3xl bg-white p-4 ring-1 ring-slate-200 sm:p-6">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600"><Columns2 size={14} /> Confronta due visite</div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-slate-600">Prima<select value={a} onChange={(e) => setA(e.target.value)} className={`${sel} mt-1`} data-testid="bodychart-compare-date-a">{items.map(opt)}</select></label>
          <label className="text-xs text-slate-600">Dopo<select value={b} onChange={(e) => setB(e.target.value)} className={`${sel} mt-1`} data-testid="bodychart-compare-date-b">{items.map(opt)}</select></label>
        </div>
        <div className="-mx-1 mt-3 flex gap-1 overflow-x-auto px-1" role="tablist" data-testid="bodychart-compare-views">
          {used.map((v) => <button key={v.id} role="tab" aria-selected={view === v.id} onClick={() => setView(v.id)} className={`h-9 shrink-0 rounded-full px-3.5 text-[13px] font-medium ${view === v.id ? "bg-night text-white" : "bg-[#F4F5F7] text-night"}`} data-testid={`bodychart-compare-view-${v.id}`}>{v.label}</button>)}
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2"><Panel id={a} side="a" view={view} items={items} /><Panel id={b} side="b" view={view} items={items} /></div>
      <div className="rounded-3xl bg-white p-4 ring-1 ring-slate-200 sm:p-6" data-testid="bodychart-gallery">
        <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600"><Images size={14} /> Evoluzione dei reperti</div>
        {!les ? <Loader2 className="animate-spin text-night" /> : multi.length === 0 ? <p className="text-sm text-slate-600" data-testid="bodychart-gallery-empty">Nessun reperto seguito in più visite o con foto.</p>
          : <div className="grid gap-4 lg:grid-cols-2">{multi.map((l) => {
            const last = l.entries[l.entries.length - 1];
            return (
              <div key={l.lesion_id} className="rounded-2xl bg-[#F8FAFC] p-4 ring-1 ring-slate-100" data-testid={`bodychart-lesion-${l.lesion_id}`}>
                <div className="mb-2 flex items-center gap-2 text-sm font-medium text-night"><span className="h-3 w-3 rounded-full" style={{ background: CAT[last.cat]?.color }} />{last.note || CAT[last.cat]?.label}<span className="text-xs font-normal text-slate-500">· {VIEWS.find((v) => v.id === last.view)?.label}</span></div>
                <LesionHistory entries={l.entries} meta={les.photo_meta} />
              </div>
            );
          })}</div>}
      </div>
    </div>
  );
};
