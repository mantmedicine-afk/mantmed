import { useState } from "react";
import { Columns2 } from "lucide-react";
import { api } from "@/lib/api";
import { CAT, STATO } from "@/lib/bodychart";
import { PhotoLightbox, Thumb } from "./PinPhotos";

export const day = (s) => new Date(`${s}T12:00:00`).toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" });

export const StatoBadge = ({ stato = "attivo", testId }) => <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${STATO[stato]?.cls}`} data-testid={testId}>{STATO[stato]?.label}</span>;

/** Storia di un reperto visita per visita + foto ordinate per data, da affiancare a due a due. */
export const LesionHistory = ({ entries, meta = {}, compact = false }) => {
  const [pair, setPair] = useState([]);
  const [open, setOpen] = useState(null);
  const shots = entries.flatMap((e) => (e.photos ?? []).map((p) => ({ p, date: e.visit_date, note: e.note, cat: e.cat }))).sort((a, b) => a.date.localeCompare(b.date));
  const toggle = (p) => setPair((x) => (x.includes(p) ? x.filter((y) => y !== p) : [...x.slice(-1), p]));
  return (
    <div className={compact ? "mt-4 border-t border-[var(--hair)] pt-3" : ""} data-testid="bodychart-lesion-history">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--fg2)]">Storia del reperto</div>
      <ol className="space-y-1.5">
        {entries.map((e) => (
          <li key={`${e.bodychart_id}-${e.id}`} className="flex flex-wrap items-center gap-2 text-sm text-[var(--fg)]" data-testid={`bodychart-lesion-entry-${e.bodychart_id}`}>
            <span className="w-24 shrink-0 text-xs text-[var(--fg2)]">{day(e.visit_date)}</span><StatoBadge stato={e.stato} />
            <span className="min-w-0 flex-1 truncate">{e.note || CAT[e.cat]?.label}{e.size_cm ? ` · ${e.size_cm} cm` : ""}{e.descrittore ? ` · ${e.descrittore}` : ""}</span>
          </li>
        ))}
      </ol>
      {shots.length > 0 && (
        <>
          <div className="mt-3 flex items-center gap-1.5 text-[11px] text-[var(--fg2)]"><Columns2 size={12} /> Tocchi due foto per affiancarle</div>
          <div className="mt-1.5 flex gap-2 overflow-x-auto pb-1" data-testid="bodychart-lesion-gallery">
            {shots.map((s) => (
              <div key={s.p} className={`shrink-0 rounded-xl p-0.5 ${pair.includes(s.p) ? "ring-2 ring-[var(--accent)]" : ""}`}>
                <Thumb id={s.p} reserved={meta[s.p]?.reserved} onClick={() => toggle(s.p)} size="h-20 w-20" testId={`bodychart-lesion-photo-${s.p}`} />
                <div className="mt-0.5 text-center text-[10px] text-[var(--fg2)]">{day(s.date)}</div>
              </div>
            ))}
          </div>
          {pair.length === 2 && (
            <div className="mt-2 grid grid-cols-2 gap-2" data-testid="bodychart-photo-pair">
              {pair.map((p) => { const s = shots.find((x) => x.p === p); return (
                <button key={p} onClick={() => setOpen(s)} className="text-left"><img src={api.bodychartPhotoUrl(p)} alt={`Foto del ${day(s.date)}`} className="aspect-square w-full rounded-xl object-cover ring-1 ring-[var(--hair)]" /><div className="mt-1 text-xs text-[var(--fg)]">{day(s.date)}</div></button>
              ); })}
            </div>
          )}
        </>
      )}
      <PhotoLightbox src={open && api.bodychartPhotoUrl(open.p)} caption={open && `${open.note || CAT[open.cat]?.label} · ${day(open.date)}`} onClose={() => setOpen(null)} />
    </div>
  );
};
