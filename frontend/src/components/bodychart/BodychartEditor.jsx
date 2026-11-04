import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { X, Save, Loader2, Baby, User, Map as MapIcon, History, ZoomIn, CopyPlus, Sparkles, Check } from "lucide-react";
import { api, errMsg } from "@/lib/api";
import { useScrollLock } from "@/lib/scrollLock";
import { VIEWS, ZOOMS, CAT, uid, isBodyView, isIntimate } from "@/lib/bodychart";
import { BodyCanvas } from "./BodyCanvas";
import { Tools, MarkerList } from "./Tools";
import { BodychartHistory } from "./BodychartHistory";
import { makeSnapshot } from "./snapshot";
import { PinSheet } from "./PinSheet";
import { IntimateConfirm } from "./PinPhotos";

const seg = (on) => `flex h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-medium transition-colors ${on ? "bg-[var(--accent)] text-[var(--ink)]" : "text-[var(--fg2)] hover:text-[var(--fg)]"}`;

const ViewPicker = ({ view, setView, markers }) => ["body", "detail"].map((g) => (
  <div key={g} className="-mx-1 flex gap-1 overflow-x-auto px-1" role="tablist" aria-label={g === "body" ? "Viste del corpo" : "Viste di dettaglio"} data-testid={g === "body" ? "bodychart-views" : "bodychart-detail-views"}>
    {VIEWS.filter((v) => v.group === g).map((v) => <button key={v.id} role="tab" aria-selected={view === v.id} onClick={() => setView(v.id)} className={seg(view === v.id)} data-testid={`bodychart-view-${v.id}`}>{v.label} {markers.some((m) => m.view === v.id) && <span className="h-1.5 w-1.5 rounded-full bg-[var(--alert)]" />}</button>)}
  </div>
));

const Proposals = ({ items, onOpen, onDrop }) => items.length > 0 && (
  <div className="rounded-3xl bg-[var(--sel)] p-4 ring-2 ring-[#E3A92B]" data-testid="bodychart-proposals">
    <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--fg)]"><Sparkles size={13} /> Proposto da MantAI, da confermare</div>
    <p className="mt-1 text-xs text-[var(--fg)]/80">Sedi citate nella nota. Nessun pin viene salvato finché non lo conferma.</p>
    <ul className="mt-2 space-y-1.5">{items.map((p) => (
      <li key={p.id} className="flex items-center gap-2 rounded-xl bg-[var(--surface)] px-3 py-2 text-sm" data-testid={`bodychart-proposal-${p.id}`}>
        <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: CAT[p.cat]?.color }} />
        <span className="min-w-0 flex-1"><span className="block truncate font-medium text-[var(--fg)]">{p.regione}</span><span className="block truncate text-xs text-[var(--fg2)]">«{p.note}»</span></span>
        <button onClick={() => onOpen(p)} className="flex h-8 items-center gap-1 rounded-full bg-[var(--accent)] px-3 text-xs font-semibold text-[var(--ink)]" data-testid={`bodychart-proposal-confirm-${p.id}`}><Check size={12} /> Verifica</button>
        <button onClick={() => onDrop(p.id)} className="grid h-8 w-8 place-items-center rounded-full ring-1 ring-[var(--hair)]" aria-label="Scarta proposta" data-testid={`bodychart-proposal-drop-${p.id}`}><X size={13} /></button>
      </li>))}
    </ul>
  </div>
);

export const BodychartEditor = ({ consultation, defaultKind = "child", onClose, onSaved }) => {
  useScrollLock();
  const [tab, setTab] = useState("map");
  const [loading, setLoading] = useState(true);
  const [kind, setKind] = useState(defaultKind);
  const [view, setViewRaw] = useState("front");
  const [zoom, setZoom] = useState("full");
  const [prev, setPrev] = useState(null);
  const [tool, setTool] = useState("marker");
  const [cat, setCat] = useState("lesione");
  const [pen, setPen] = useState({ color: "#DC2626", width: 2.5 });
  const [doc, setDoc] = useState({ markers: [], strokes: [] });
  const [past, setPast] = useState([]);
  const [sheet, setSheet] = useState(null);
  const [include, setInclude] = useState(false);
  const [busy, setBusy] = useState(false);
  const [meta, setMeta] = useState({});
  const [lesions, setLesions] = useState({});
  const [proposals, setProposals] = useState([]);
  const [pendingMove, setPendingMove] = useState(null);
  const dirty = useRef(false);
  const latest = useRef({ doc, kind, include });
  latest.current = { doc, kind, include };

  useEffect(() => {
    let alive = true;
    api.getBodychart(consultation.id).then((b) => {
      if (!alive || !b) return;
      setKind(b.silhouette); setDoc({ markers: b.markers ?? [], strokes: b.strokes ?? [] }); setInclude(!!b.include_in_report); setMeta(b.photo_meta ?? {});
    }).catch((e) => toast.error(errMsg(e))).finally(() => { if (alive) setLoading(false); });
    const today = consultation.created_at.slice(0, 10);
    if (consultation.patient_id) {
      api.patientBodycharts(consultation.patient_id).then((xs) => { if (alive) setPrev(xs.find((b) => b.consultation_id !== consultation.id && b.visit_date <= today && b.markers.length) ?? null); }).catch(() => {});
      api.bodychartLesions(consultation.patient_id).then((r) => { if (!alive) return; setLesions(Object.fromEntries(r.lesions.map((l) => [l.lesion_id, l.entries.filter((e) => e.consultation_id !== consultation.id)]))); setMeta((m) => ({ ...r.photo_meta, ...m })); }).catch(() => {});
    }
    if (consultation.status === "ready") api.suggestBodychart(consultation.id).then((r) => alive && setProposals(r.proposals ?? [])).catch(() => {});
    return () => { alive = false; };
  }, [consultation.id, consultation.patient_id, consultation.created_at, consultation.status]);

  const numbers = useMemo(() => Object.fromEntries(doc.markers.map((m, i) => [m.id, i + 1])), [doc.markers]);
  const persist = useCallback(async (quiet) => {
    const { doc: d, kind: k, include: inc } = latest.current;
    const date = new Date(consultation.created_at).toLocaleDateString("it-IT");
    const nums = Object.fromEntries(d.markers.map((m, i) => [m.id, i + 1]));
    const snapshot = await makeSnapshot({ kind: k, markers: d.markers, strokes: d.strokes, numbers: nums, title: `${consultation.patient_name} · Bodychart visita del ${date}` });
    const r = await api.saveBodychart(consultation.id, { silhouette: k, markers: d.markers, strokes: d.strokes, snapshot, include_in_report: inc });
    dirty.current = false;
    setMeta((m) => ({ ...m, ...r.photo_meta }));
    if (!quiet) { toast.success(inc ? "Bodychart salvato nella visita e incluso nel referto" : "Bodychart salvato nella visita"); onSaved?.(d.markers.length); }
  }, [consultation.id, consultation.created_at, consultation.patient_name, onSaved]);
  useEffect(() => {
    if (!dirty.current) return undefined;
    const t = setTimeout(() => persist(true).catch((e) => toast.error(e?.response ? errMsg(e) : "Salvataggio automatico non riuscito")), 600);
    return () => clearTimeout(t);
  }, [doc, include, kind, persist]);

  const commit = (next) => { setPast((p) => [...p.slice(-49), doc]); dirty.current = true; setDoc(next); };
  const setView = (v) => { setViewRaw(v); setSheet(null); if (!isBodyView(v)) setZoom("full"); };
  const box = isBodyView(view) ? ZOOMS.find((z) => z.id === zoom)?.box : undefined;
  const openNew = (pos) => setSheet({ isNew: true, m: { id: uid(), cat, note: "", photos: [], stato: "attivo", origin: "medico", ...pos } });
  const openPin = (id) => {
    const p = proposals.find((x) => x.id === id);
    if (p) { setViewRaw(p.view); setSheet({ isNew: true, fromProposal: p.id, m: { ...p, id: uid(), proposed: false } }); return; }
    const m = doc.markers.find((x) => x.id === id);
    if (m) setSheet({ isNew: false, m: { ...m } });
  };
  const saveSheet = () => {
    if (!sheet) return;
    const m = { ...sheet.m, lesion_id: sheet.m.lesion_id || sheet.m.id };
    setCat(m.cat);
    commit({ ...doc, markers: sheet.isNew ? [...doc.markers, m] : doc.markers.map((x) => (x.id === m.id ? m : x)) });
    if (sheet.fromProposal) { handled(proposals.find((p) => p.id === sheet.fromProposal)); setProposals((ps) => ps.filter((p) => p.id !== sheet.fromProposal)); }
    setSheet(null);
  };
  const move = (id, pos) => {
    if (proposals.some((p) => p.id === id)) { setProposals((ps) => ps.map((p) => (p.id === id ? { ...p, ...pos } : p))); return; }
    const m = doc.markers.find((x) => x.id === id);
    if (m?.photos?.length && isIntimate(m.view, pos.x, pos.y) && !isIntimate(m.view, m.x, m.y)) { setPendingMove({ id, pos }); return; }
    applyMove(id, pos);
  };
  const applyMove = (id, pos) => {
    commit({ ...doc, markers: doc.markers.map((x) => (x.id === id ? { ...x, ...pos } : x)) });
    toast.success("Reperto spostato");
  };
  const handled = (p) => p?.regione_id && api.bodychartSuggestionHandled(consultation.id, p.regione_id).catch(() => {});
  const remove = (id) => { commit({ ...doc, markers: doc.markers.filter((x) => x.id !== id) }); setSheet(null); };
  const undo = () => { if (!past.length) return; dirty.current = true; setDoc(past[past.length - 1]); setPast((p) => p.slice(0, -1)); setSheet(null); };
  const clearView = () => commit({ markers: doc.markers.filter((m) => m.view !== view), strokes: doc.strokes.filter((s) => s.view !== view) });
  const carryOver = () => {
    const copied = prev.markers.filter((m) => m.stato !== "risolto").map((m) => ({ ...m, id: uid(), lesion_id: m.lesion_id || m.id, photos: [], origin: "medico" }));
    commit({ ...doc, markers: [...doc.markers, ...copied] });
    setPrev(null);
    toast.success(`${copied.length} reperti riportati dalla visita del ${new Date(`${prev.visit_date}T12:00:00`).toLocaleDateString("it-IT")}: aggiorni lo stato di ciascuno`);
  };
  const save = async () => { setBusy(true); try { await persist(false); } catch (e) { toast.error(e?.response ? errMsg(e) : "Impossibile generare l'istantanea"); } setBusy(false); };
  const close = async () => { if (dirty.current) await persist(true).catch(() => {}); if (onSaved) onSaved(latest.current.doc.markers.length); else onClose(); };
  const carried = prev && prev.markers.some((m) => doc.markers.some((x) => x.lesion_id && x.lesion_id === (m.lesion_id || m.id)));

  return (
    <div className="fixed inset-0 z-[60] overflow-auto overscroll-contain bg-[var(--raised)] text-[var(--fg)]" data-testid="bodychart-editor" data-lenis-prevent>
      <div className="sticky top-0 z-10 border-b border-[var(--hair)] bg-[var(--bg)]">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 px-4 py-3 lg:px-8">
          <div className="min-w-0"><div className="text-[11px] uppercase tracking-[0.22em] text-[var(--fg2)]">Bodychart · mappa corporea</div><div className="truncate font-display text-2xl">{consultation.patient_name}</div></div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-full bg-[var(--raised)] p-1" role="tablist">
              <button role="tab" aria-selected={tab === "map"} onClick={() => setTab("map")} className={seg(tab === "map")} data-testid="bodychart-tab-map"><MapIcon size={15} /> Mappa</button>
              <button role="tab" aria-selected={tab === "history"} onClick={() => setTab("history")} className={seg(tab === "history")} data-testid="bodychart-tab-history"><History size={15} /> Confronta</button>
            </div>
            <button onClick={close} className="grid h-11 w-11 place-items-center rounded-full ring-1 ring-[var(--hair)] hover:ring-[var(--accent)]" aria-label="Chiudi bodychart" data-testid="bodychart-close"><X size={18} /></button>
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-[1440px] px-4 py-5 lg:px-8">
        {tab === "history" ? <BodychartHistory patientId={consultation.patient_id} currentId={consultation.id} /> : loading ? <Loader2 className="animate-spin" /> : (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_380px]">
            <div className="rounded-3xl bg-[var(--surface)] p-3 ring-1 ring-[var(--hair)] sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 space-y-1.5"><ViewPicker view={view} setView={setView} markers={doc.markers} /></div>
                <div className="flex rounded-full bg-[var(--raised)] p-1" data-testid="bodychart-silhouette">
                  <button onClick={() => setKind("child")} className={seg(kind === "child")} data-testid="bodychart-kind-child"><Baby size={15} /> Bambino</button>
                  <button onClick={() => setKind("adult")} className={seg(kind === "adult")} data-testid="bodychart-kind-adult"><User size={15} /> Adulto</button>
                </div>
              </div>
              {isBodyView(view) && (
                <div className="-mx-1 mt-3 flex items-center gap-1 overflow-x-auto px-1" role="tablist" data-testid="bodychart-zooms">
                  <ZoomIn size={15} className="mr-1 shrink-0 text-[var(--fg2)]" />
                  {ZOOMS.map((z) => <button key={z.id} role="tab" aria-selected={zoom === z.id} onClick={() => setZoom(z.id)} className={`h-9 shrink-0 rounded-full px-3.5 text-[13px] font-medium transition-colors ${zoom === z.id ? "bg-[var(--accent)] text-[var(--ink)]" : "bg-[var(--raised)] text-[var(--fg)] hover:bg-[var(--hair)]"}`} data-testid={`bodychart-zoom-${z.id}`}>{z.label}</button>)}
                </div>
              )}
              <p className="mt-2 text-xs text-[var(--fg2)]" data-testid="bodychart-help">Tocchi la figura per un nuovo reperto · tocchi un pin per aprirlo · per spostarlo tenga premuto e trascini · la lente apre il dettaglio.</p>
              <div className="mx-auto mt-2 h-[62vh] min-h-[440px] max-w-[520px]">
                <BodyCanvas box={box} kind={kind} view={view} tool={tool} pen={pen} markers={[...doc.markers, ...proposals]} strokes={doc.strokes} numbers={numbers} selected={sheet?.m.id}
                  onTap={openNew} onStroke={(s) => commit({ ...doc, strokes: [...doc.strokes, s] })} onPick={openPin} onMove={move} onDetail={setView} />
              </div>
            </div>
            <aside className="space-y-4">
              {sheet && <PinSheet key={sheet.m.id} m={sheet.m} n={numbers[sheet.m.id]} isNew={sheet.isNew} cid={consultation.id} photoMeta={meta} onMeta={(id, v) => setMeta((x) => ({ ...x, [id]: v }))}
                history={lesions[sheet.m.lesion_id || sheet.m.id]} onChange={(m) => setSheet((s) => ({ ...s, m }))} onSave={saveSheet} onCancel={() => setSheet(null)} onDelete={() => remove(sheet.m.id)} />}
              <Proposals items={proposals} onOpen={(p) => openPin(p.id)} onDrop={(id) => { handled(proposals.find((p) => p.id === id)); setProposals((ps) => ps.filter((p) => p.id !== id)); }} />
              <IntimateConfirm open={!!pendingMove} onOpenChange={(o) => !o && setPendingMove(null)} action="Sposta e rendi riservate le foto"
                onConfirm={() => { applyMove(pendingMove.id, pendingMove.pos); setPendingMove(null); }} />
              {prev && !carried && <button onClick={carryOver} className="flex w-full items-center gap-3 rounded-3xl bg-[#F0FDF4] p-4 text-left text-sm text-[var(--fg)] ring-1 ring-emerald-200 transition-colors hover:ring-emerald-400" data-testid="bodychart-carry-over"><CopyPlus size={18} className="shrink-0 text-[var(--ok)]" /><span><span className="block font-medium">Riporta i reperti della visita precedente</span><span className="text-xs text-[var(--fg2)]">{prev.markers.length} reperti del {new Date(`${prev.visit_date}T12:00:00`).toLocaleDateString("it-IT")}, con la loro storia (esclusi i risolti)</span></span></button>}
              <div className="rounded-3xl bg-[var(--surface)] p-4 ring-1 ring-[var(--hair)]"><Tools {...{ tool, cat, pen, setTool, setCat, setPen }} onUndo={undo} onClear={clearView} canUndo={past.length > 0} /></div>
              <div className="rounded-3xl bg-[var(--surface)] p-4 ring-1 ring-[var(--hair)]">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--fg2)]">Reperti ({doc.markers.length})</div>
                <MarkerList markers={doc.markers} numbers={numbers} selected={sheet?.m.id} onPick={(m) => { setViewRaw(m.view); setTool("marker"); openPin(m.id); }} />
              </div>
              <div className="rounded-3xl bg-[var(--surface)] p-4 ring-1 ring-[var(--hair)]">
                <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={include} onChange={(e) => { setInclude(e.target.checked); dirty.current = true; }} className="mt-0.5 h-5 w-5 accent-[var(--accent)]" data-testid="bodychart-include-report" />
                  <span><span className="block font-medium">Includi nel referto</span><span className="text-xs text-[var(--fg2)]">Aggiunge una pagina con la mappa e la legenda al PDF della visita, anche quello inviato o pubblicato alla famiglia.</span></span></label>
                <button onClick={save} disabled={busy} className="mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-full bg-[var(--accent)] text-base font-semibold text-[var(--ink)] transition-transform hover:-translate-y-0.5 disabled:opacity-60" data-testid="bodychart-save-btn">
                  {busy ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} Salva Bodychart nella Visita
                </button>
                <p className="mt-2 text-center text-[11px] text-[var(--fg2)]">I reperti si salvano anche in automatico a ogni modifica.</p>
              </div>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
};
