import { useEffect, useState } from "react";
import { Loader2, History, Columns2, Images } from "lucide-react";
import { api } from "@/lib/api";
import { CATS, CAT, VIEWS } from "@/lib/bodychart";
import { PhotoLightbox } from "./PinPhotos";

const day = (s) => new Date(`${s}T12:00:00`).toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" });

const Panel = ({ id, label }) => {
  const [d, setD] = useState(null);
  useEffect(() => { setD(null); if (id) api.bodychart(id).then(setD).catch(() => setD({ markers: [] })); }, [id]);
  return (
    <div className="min-w-0 rounded-3xl bg-white p-3 ring-1 ring-slate-200 sm:p-4" data-testid={`bodychart-compare-${label}`}>
      <div className="flex items-center justify-between gap-2"><span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label === "a" ? "Prima" : "Dopo"}</span><span className="font-display text-lg text-night">{d?.visit_date ? day(d.visit_date) : "…"}</span></div>
      {!d ? <Loader2 className="mt-4 animate-spin text-night" /> : (
        <>
          {d.snapshot && <div className="mt-3 overflow-x-auto rounded-2xl ring-1 ring-slate-100"><img src={d.snapshot} alt={`Bodychart del ${day(d.visit_date)}`} className="w-full min-w-[520px]" /></div>}
          <ol className="mt-3 space-y-1">{d.markers.map((m, i) => <li key={m.id} className="flex items-center gap-2 text-sm text-night"><span className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white" style={{ background: CAT[m.cat]?.color }}>{i + 1}</span><span className="truncate">{m.note || CAT[m.cat]?.label} · <span className="text-slate-500">{VIEWS.find((v) => v.id === m.view)?.label}</span></span></li>)}</ol>
        </>
      )}
    </div>
  );
};

/** Galleria cronologica delle foto dei reperti, per seguire guarigione ed evoluzione. */
const Gallery = ({ items }) => {
  const [open, setOpen] = useState(null);
  const shots = items.flatMap((b) => b.markers.filter((m) => m.photos?.length).flatMap((m) => m.photos.map((p) => ({ p, m, date: b.visit_date })))).sort((a, b) => a.date.localeCompare(b.date));
  if (!shots.length) return <p className="text-sm text-slate-600" data-testid="bodychart-gallery-empty">Nessuna foto ancorata ai marcatori: le foto scattate sui pin compaiono qui in ordine di data.</p>;
  return (
    <div className="flex gap-3 overflow-x-auto pb-2" data-testid="bodychart-gallery">
      {shots.map((s) => (
        <button key={s.p} onClick={() => setOpen(s)} className="w-36 shrink-0 text-left" data-testid={`bodychart-gallery-${s.p}`}>
          <img src={api.bodychartPhotoUrl(s.p)} alt={s.m.note || "Foto reperto"} className="h-36 w-36 rounded-2xl object-cover ring-1 ring-slate-200" />
          <div className="mt-1.5 flex items-center gap-1.5 text-xs text-night"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: CAT[s.m.cat]?.color }} /><span className="truncate">{s.m.note || CAT[s.m.cat]?.label}</span></div>
          <div className="text-[11px] text-slate-500">{day(s.date)}</div>
        </button>
      ))}
      <PhotoLightbox src={open && api.bodychartPhotoUrl(open.p)} caption={open && `${open.m.note || CAT[open.m.cat]?.label} · ${day(open.date)}`} onClose={() => setOpen(null)} />
    </div>
  );
};

/** Timeline di evoluzione: visite in ordine, confronto affiancato di due bodychart e galleria foto. */
export const BodychartHistory = ({ patientId, currentId }) => {
  const [items, setItems] = useState(null);
  const [pair, setPair] = useState([]);
  useEffect(() => {
    if (!patientId) { setItems([]); return; }
    api.patientBodycharts(patientId).then((r) => {
      const asc = [...r].sort((a, b) => a.visit_date.localeCompare(b.visit_date));
      setItems(asc);
      setPair(asc.length > 1 ? [asc[asc.length - 2].id, asc[asc.length - 1].id] : asc.map((x) => x.id));
    }).catch(() => setItems([]));
  }, [patientId]);
  const toggle = (id) => setPair((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p.slice(-1), id].sort((a, b) => items.findIndex((x) => x.id === a) - items.findIndex((x) => x.id === b))));
  if (items === null) return <Loader2 className="animate-spin text-night" />;
  if (!items.length) return <div className="rounded-3xl bg-white p-6 ring-1 ring-slate-200" data-testid="bodychart-history"><p className="text-sm text-slate-600" data-testid="bodychart-history-empty">{patientId ? "Nessun bodychart salvato nelle visite precedenti." : "Paziente non collegato a una cartella: lo storico non è disponibile."}</p></div>;
  return (
    <div className="space-y-5" data-testid="bodychart-history">
      <div className="rounded-3xl bg-white p-4 ring-1 ring-slate-200 sm:p-6">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600"><History size={14} /> Timeline · scelga due visite da confrontare</div>
        <div className="relative mt-5 overflow-x-auto pb-2">
          <div className="absolute left-4 right-4 top-[22px] h-0.5 bg-slate-200" />
          <ol className="relative flex min-w-max gap-3 px-1">
            {items.map((b) => {
              const on = pair.includes(b.id);
              return (
                <li key={b.id}>
                  <button onClick={() => toggle(b.id)} className="flex w-40 flex-col items-center gap-2 text-center" aria-pressed={on} data-testid={`bodychart-history-${b.id}`}>
                    <span className={`grid h-11 w-11 place-items-center rounded-full text-xs font-bold transition-colors ${on ? "bg-night text-white" : "bg-white text-night ring-2 ring-slate-200"}`}>{b.markers.length}</span>
                    <span className="text-sm font-medium text-night">{day(b.visit_date)}{b.consultation_id === currentId && <span className="ml-1 rounded-full bg-[#3B6CF6] px-1.5 py-0.5 text-[10px] text-white">oggi</span>}</span>
                    <span className="flex flex-wrap justify-center gap-1">{CATS.filter((c) => b.counts[c.id]).map((c) => <span key={c.id} className="rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white" style={{ background: c.color }} title={c.label}>{b.counts[c.id]}</span>)}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
      <div><div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600"><Columns2 size={14} /> Confronto affiancato</div>
        <div className={`grid gap-4 ${pair.length > 1 ? "xl:grid-cols-2" : ""}`}>{pair.map((id, i) => <Panel key={id} id={id} label={i === 0 && pair.length > 1 ? "a" : "b"} />)}</div></div>
      <div className="rounded-3xl bg-white p-4 ring-1 ring-slate-200 sm:p-6"><div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600"><Images size={14} /> Evoluzione fotografica dei reperti</div><Gallery items={items} /></div>
    </div>
  );
};
