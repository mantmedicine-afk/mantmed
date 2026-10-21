import { useEffect, useState } from "react";
import { CalendarClock, Loader2 } from "lucide-react";
import { api } from "@/lib/api";

const dshort = (d) => new Date(`${d}T12:00:00`).toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" });

/** Prossimi orari liberi del medico (14 giorni), per prestazione e studio; un clic apre la prenotazione precompilata. */
export const Availability = ({ slug, onPick }) => {
  const [f, setF] = useState({ service: "", clinic: "" });
  const [a, setA] = useState(null);
  useEffect(() => { setA(null); api.publicAvailability(slug, f).then(setA).catch(() => setA({ slots: [], services: [], clinics: [] })); }, [slug, f]);
  const sel = "h-10 rounded-full border border-[#0A192F]/15 bg-white px-4 text-sm text-night";
  return (
    <section className="rounded-3xl bg-white p-5 ring-1 ring-[#0A192F]/10 sm:p-6" data-testid="showcase-availability">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 font-display text-2xl text-night"><CalendarClock size={20} strokeWidth={1.5} className="text-[#3B6CF6]" /> Prossime disponibilità</div>
        {a && a.services.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <select value={f.service || a.service} onChange={(e) => setF((x) => ({ ...x, service: e.target.value }))} className={sel} aria-label="Prestazione" data-testid="availability-service">{a.services.map((s) => <option key={s}>{s}</option>)}</select>
            {a.clinics.length > 1 && <select value={f.clinic} onChange={(e) => setF((x) => ({ ...x, clinic: e.target.value }))} className={sel} aria-label="Studio" data-testid="availability-clinic"><option value="">Tutti gli studi</option>{a.clinics.map((c) => <option key={c}>{c}</option>)}</select>}
          </div>
        )}
      </div>
      {!a ? <Loader2 className="mt-4 animate-spin text-night" /> : a.slots.length ? (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3" data-testid="availability-slots">
          {a.slots.map((s) => (
            <button key={`${s.date}-${s.time}-${s.clinic}`} onClick={() => onPick(s)} className="rounded-2xl bg-[#F6F1E9] px-3 py-3 text-left transition-[transform,background-color] hover:-translate-y-0.5 hover:bg-[#FFF9E6]" data-testid={`availability-slot-${s.date}-${s.time.replace(":", "")}`}>
              <div className="text-xs capitalize text-[#0A192F]/60">{dshort(s.date)}</div>
              <div className="font-display text-2xl text-night">{s.time}</div>
              <div className="truncate text-xs text-[#0A192F]/60">{s.clinic}</div>
            </button>
          ))}
        </div>
      ) : <p className="mt-4 text-sm text-[#0A192F]/60" data-testid="availability-empty">Nessun orario libero nei prossimi 14 giorni: può comunque inviare una richiesta allo studio.</p>}
    </section>
  );
};
