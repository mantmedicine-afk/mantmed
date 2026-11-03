import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { api } from "@/lib/api";

const todayIso = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
const wd = (d) => new Date(`${d}T12:00:00`).toLocaleDateString("it-IT", { weekday: "short" });
const dn = (d) => new Date(`${d}T12:00:00`).getDate();
const range = (days) => {
  const f = (d, o) => new Date(`${d}T12:00:00`).toLocaleDateString("it-IT", o);
  return `${f(days[0].date, { day: "numeric", month: "short" })} – ${f(days[6].date, { day: "numeric", month: "short", year: "numeric" })}`;
};
const addDays = (d, n) => { const x = new Date(`${d}T12:00:00`); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
const Arrow = ({ dir, disabled, onClick, testid }) => (
  <button onClick={onClick} disabled={disabled} aria-label={dir < 0 ? "Settimana precedente" : "Settimana successiva"} className="grid h-10 w-10 place-items-center rounded-full bg-[var(--surface)] text-[var(--fg)] ring-1 ring-[var(--sel)] transition-colors hover:ring-[var(--accent)] disabled:opacity-30" data-testid={testid}>{dir < 0 ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}</button>
);
const Slot = ({ s, onPick, tp = "week-slot" }) => (
  <button onClick={onPick} className="w-full rounded-xl bg-[var(--bg)] px-2 py-2 text-center transition-[transform,background-color] hover:-translate-y-0.5 hover:bg-[var(--sel)]" data-testid={`${tp}-${s.date}-${s.time.replace(":", "")}-${s.clinic.replace(/\s+/g, "")}`}>
    <div className="font-display text-lg leading-none text-[var(--fg)]">{s.time}</div><div className="mt-0.5 truncate text-[10px] text-[var(--fg2)]">{s.clinic}</div>
  </button>
);

/** Calendario settimanale sfogliabile (8 settimane): colonne su desktop, un giorno alla volta su smartphone. */
export const WeekCalendar = ({ slug, service, clinic, onPick }) => {
  const [start, setStart] = useState("");
  const [w, setW] = useState(null);
  const [sel, setSel] = useState(0);
  const touch = useRef(null);
  useEffect(() => {
    setW(null);
    api.publicWeek(slug, { start, service, clinic }).then((x) => {
      setW(x);
      const t = x.days.findIndex((d) => d.slots.length);
      setSel(t >= 0 ? t : Math.max(0, x.days.findIndex((d) => d.date === todayIso())));
    }).catch(() => setW({ days: [] }));
  }, [slug, start, service, clinic]);
  const go = (n) => w && setStart(addDays(w.week_start, 7 * n));
  const pick = (d, s) => onPick({ date: d.date, time: s.time, clinic: s.clinic, service: w.service });
  const today = todayIso();
  const swipe = (e) => {
    const dx = e.changedTouches[0].clientX - (touch.current ?? 0);
    if (Math.abs(dx) < 50) return;
    const n = sel + (dx < 0 ? 1 : -1);
    if (n > 6) go(1); else if (n < 0) go(-1); else setSel(n);
  };
  return (
    <div className="mt-6 border-t border-[var(--sel)] pt-5" data-testid="week-calendar">
      <div className="flex items-center justify-between gap-3">
        <Arrow dir={-1} disabled={!w?.prev} onClick={() => go(-1)} testid="week-prev" />
        <div className="text-center"><div className="text-[11px] uppercase tracking-[0.2em] text-[var(--fg2)]">Calendario settimanale</div><div className="font-display text-xl text-[var(--fg)]" data-testid="week-range">{w?.days?.length ? range(w.days) : "…"}</div></div>
        <Arrow dir={1} disabled={!w?.next} onClick={() => go(1)} testid="week-next" />
      </div>
      {!w ? <Loader2 className="mx-auto mt-6 animate-spin text-[var(--fg)]" /> : (
        <>
          <div className="mt-4 hidden grid-cols-7 gap-2 md:grid" data-testid="week-grid">
            {w.days.map((d) => (
              <div key={d.date} className={`flex min-w-0 flex-col rounded-2xl p-2 ${d.date === today ? "bg-[var(--raised)] ring-1 ring-[var(--hair)]" : d.slots.length ? "bg-[var(--surface)] ring-1 ring-[var(--sel)]" : "bg-[var(--sel)]"}`} data-testid={`week-day-${d.date}`}>
                <div className="pb-2 text-center"><div className="text-[11px] uppercase text-[var(--fg2)]">{wd(d.date)}</div><div className={`font-display text-2xl ${d.slots.length ? "text-[var(--fg)]" : "text-[var(--fg2)]"}`}>{dn(d.date)}</div></div>
                <div className="max-h-72 space-y-1.5 overflow-y-auto pr-0.5">
                  {d.slots.length ? d.slots.map((s) => <Slot key={`${s.time}-${s.clinic}`} s={{ ...s, date: d.date }} onPick={() => pick(d, s)} />) : <div className="py-4 text-center text-[11px] text-[var(--fg2)]">{d.past ? "—" : "Nessun orario"}</div>}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 md:hidden" onTouchStart={(e) => { touch.current = e.touches[0].clientX; }} onTouchEnd={swipe} data-testid="week-mobile">
            <div className="grid grid-cols-7 gap-1">
              {w.days.map((d, i) => (
                <button key={d.date} onClick={() => setSel(i)} className={`flex flex-col items-center rounded-xl py-1.5 transition-colors ${i === sel ? "bg-[var(--accent)] text-[var(--ink)]" : d.date === today ? "bg-[var(--raised)] text-[var(--fg)]" : "text-[var(--fg)]"}`} data-testid={`week-strip-${d.date}`}>
                  <span className="text-[10px] uppercase opacity-70">{wd(d.date)}</span><span className="font-display text-lg leading-tight">{dn(d.date)}</span>
                  <span className={`mt-0.5 h-1.5 w-1.5 rounded-full ${d.slots.length ? (i === sel ? "bg-[var(--sel)]" : "bg-[var(--accent)]") : "bg-transparent"}`} />
                </button>
              ))}
            </div>
            {w.days[sel] && (
              <div className="mt-3 grid max-h-72 grid-cols-3 gap-2 overflow-y-auto" data-testid="week-mobile-slots">
                {w.days[sel].slots.length ? w.days[sel].slots.map((s) => <Slot key={`${s.time}-${s.clinic}`} tp="week-mslot" s={{ ...s, date: w.days[sel].date }} onPick={() => pick(w.days[sel], s)} />)
                  : <p className="col-span-3 py-4 text-center text-sm text-[var(--fg2)]">Nessun orario libero in questo giorno.</p>}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
