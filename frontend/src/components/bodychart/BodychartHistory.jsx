import { useEffect, useState } from "react";
import { Loader2, History, X } from "lucide-react";
import { api, errMsg } from "@/lib/api";
import { CATS } from "@/lib/bodychart";

const day = (s) => new Date(`${s}T12:00:00`).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });

const Viewer = ({ id, onClose }) => {
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    let alive = true;
    api.bodychart(id).then((r) => { if (alive) setD(r); }).catch((e) => { if (alive) setErr(errMsg(e)); });
    return () => { alive = false; };
  }, [id]);
  return (
    <div className="rounded-3xl bg-white p-4 ring-1 ring-slate-200 sm:p-6" data-testid="bodychart-history-viewer">
      <div className="flex items-center justify-between gap-2"><div className="font-display text-2xl text-night">{d ? `Visita del ${day(d.visit_date)}` : "Caricamento…"}</div>
        <button onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full ring-1 ring-slate-200 hover:ring-night" aria-label="Chiudi" data-testid="bodychart-history-close"><X size={16} /></button></div>
      {err && <p className="mt-3 text-sm text-rose-700">{err}</p>}
      {!d && !err && <Loader2 className="mt-4 animate-spin text-night" />}
      {d?.snapshot && <img src={d.snapshot} alt={`Bodychart del ${day(d.visit_date)}`} className="mt-4 w-full rounded-2xl ring-1 ring-slate-200" data-testid="bodychart-history-image" />}
      {d?.markers?.length > 0 && (
        <ol className="mt-4 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {d.markers.map((m, i) => <li key={m.id} className="flex items-center gap-2 text-sm text-night"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white" style={{ background: CATS.find((c) => c.id === m.cat)?.color }}>{i + 1}</span>{m.note || CATS.find((c) => c.id === m.cat)?.label}</li>)}
        </ol>
      )}
    </div>
  );
};

export const BodychartHistory = ({ patientId, currentId }) => {
  const [items, setItems] = useState(null);
  const [open, setOpen] = useState(null);
  useEffect(() => {
    if (!patientId) { setItems([]); return undefined; }
    let alive = true;
    api.patientBodycharts(patientId).then((r) => { if (alive) setItems(r); }).catch(() => { if (alive) setItems([]); });
    return () => { alive = false; };
  }, [patientId]);
  const list = Array.isArray(items) ? items : [];
  if (open) return <Viewer id={open} onClose={() => setOpen(null)} />;
  return (
    <div className="rounded-3xl bg-white p-4 ring-1 ring-slate-200 sm:p-6" data-testid="bodychart-history">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600"><History size={14} /> Storico bodychart del paziente</div>
      {items === null ? <Loader2 className="mt-4 animate-spin text-night" /> : list.length === 0 ? (
        <p className="mt-3 text-sm text-slate-600" data-testid="bodychart-history-empty">{patientId ? "Nessun bodychart salvato nelle visite precedenti." : "Paziente non collegato a una cartella: lo storico non è disponibile."}</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {list.map((b) => (
            <li key={b.id}>
              <button onClick={() => setOpen(b.id)} className="flex w-full flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#F4F5F7] p-4 text-left transition-colors hover:bg-slate-200" data-testid={`bodychart-history-${b.id}`}>
                <span><span className="block font-medium text-night">Visita del {day(b.visit_date)} {b.consultation_id === currentId && <span className="ml-1 rounded-full bg-night px-2 py-0.5 text-[11px] text-white">questa visita</span>}</span>
                  <span className="text-xs text-slate-600">{b.markers.length} marcatori · sagoma {b.silhouette === "child" ? "pediatrica" : "adulto"}</span></span>
                <span className="flex gap-1">{CATS.filter((c) => b.counts[c.id]).map((c) => <span key={c.id} className="rounded-full px-2 py-0.5 text-[11px] font-bold text-white" style={{ background: c.color }} title={c.label}>{b.counts[c.id]}</span>)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
