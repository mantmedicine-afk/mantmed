import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { api, errMsg } from "@/lib/api";

const DAYS = [[1, "Lun"], [2, "Mar"], [3, "Mer"], [4, "Gio"], [5, "Ven"], [6, "Sab"], [7, "Dom"]];
const inp = "h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-night outline-none focus:border-night";

export const ScheduleDialog = ({ open, onClose }) => {
  const [s, setS] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return undefined;
    setS(null);
    api.getSchedule().then(setS).catch((e) => toast.error(errMsg(e)));
    return undefined;
  }, [open]);
  const setHour = (n, k, v) => setS((p) => ({ ...p, hours: { ...p.hours, [n]: { ...p.hours[n], [k]: v } } }));
  const toggleDay = (n, d) => setHour(n, "days", s.hours[n].days.includes(d) ? s.hours[n].days.filter((x) => x !== d) : [...s.hours[n].days, d].sort());
  const save = async () => {
    setBusy(true);
    try { setS(await api.saveSchedule(s)); toast.success("Orari salvati: il portale mostra subito i nuovi orari liberi"); onClose(); }
    catch (e) { toast.error(errMsg(e)); }
    setBusy(false);
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto rounded-3xl bg-white sm:max-w-xl" data-testid="schedule-dialog">
        <DialogHeader>
          <DialogTitle className="font-display text-3xl font-normal text-night">Orari studio</DialogTitle>
          <DialogDescription className="text-sm text-slate-600">Il Portale Paziente propone solo gli orari liberi dentro questi orari, in base alla durata della prestazione.</DialogDescription>
        </DialogHeader>
        {!s ? <Loader2 className="animate-spin text-night" /> : (
          <div className="space-y-5">
            {Object.entries(s.hours).map(([n, h]) => (
              <div key={n} className="rounded-2xl border border-slate-200 p-4" data-testid={`schedule-clinic-${n.replace(/\s+/g, "-").toLowerCase()}`}>
                <div className="font-medium text-night">{n}</div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {DAYS.map(([d, l]) => (
                    <button key={d} type="button" onClick={() => toggleDay(n, d)} aria-pressed={h.days.includes(d)} className={`h-9 w-11 rounded-full text-xs font-medium transition-colors ${h.days.includes(d) ? "bg-night text-white" : "border border-slate-200 text-slate-600 hover:border-night"}`} data-testid={`schedule-day-${n.replace(/\s+/g, "-").toLowerCase()}-${d}`}>{l}</button>
                  ))}
                </div>
                <div className="mt-3 flex items-center gap-2 text-sm text-slate-600">
                  dalle <input type="time" value={h.start} onChange={(e) => setHour(n, "start", e.target.value)} className={inp} data-testid={`schedule-start-${n.replace(/\s+/g, "-").toLowerCase()}`} />
                  alle <input type="time" value={h.end} onChange={(e) => setHour(n, "end", e.target.value)} className={inp} data-testid={`schedule-end-${n.replace(/\s+/g, "-").toLowerCase()}`} />
                </div>
              </div>
            ))}
            <div>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600">Durata prestazioni (minuti)</div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {Object.entries(s.durations).map(([k, v]) => (
                  <label key={k} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2 text-sm text-night">{k}
                    <input type="number" min={5} max={240} step={5} value={v} onChange={(e) => setS((p) => ({ ...p, durations: { ...p.durations, [k]: Number(e.target.value) } }))} className={`${inp} w-20`} data-testid={`schedule-duration-${k.split(" ")[0].toLowerCase()}-${k.split(" ").pop().toLowerCase()}`} />
                  </label>
                ))}
              </div>
            </div>
            <button onClick={save} disabled={busy} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-night text-sm font-semibold text-white disabled:opacity-60" data-testid="schedule-save-btn">{busy ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Salva orari</button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
