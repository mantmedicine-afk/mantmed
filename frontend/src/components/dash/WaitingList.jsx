import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Pencil, Trash2, DoorOpen, Mic } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg, minutesSince } from "@/lib/api";
import { WaitingDialog } from "./WaitingDialog";

export const WaitingList = ({ waiting, onChange, onStart }) => {
  const [editing, setEditing] = useState(null);
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);

  const call = async (w) => {
    try { await api.updateWaiting(w.id, { status: w.status === "in_studio" ? "in_attesa" : "in_studio" }); onChange(); }
    catch (e) { toast.error(errMsg(e)); }
  };
  const remove = async (w) => {
    try { await api.deleteWaiting(w.id); toast.success(`${w.name} rimosso dalla sala d'attesa`); onChange(); }
    catch (e) { toast.error(errMsg(e)); }
  };

  return (
    <section className="flex h-full flex-col rounded-[28px] border border-slate-200 bg-white p-5 lg:p-6" data-testid="waiting-panel">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Sala d'attesa</div>
          <h2 className="mt-1 font-display text-3xl text-night">Pazienti in attesa</h2>
        </div>
        <button onClick={() => setEditing({})} className="grid h-11 w-11 place-items-center rounded-full border border-night text-night transition-all duration-200 hover:bg-night hover:text-white active:scale-95" data-testid="add-waiting-btn" aria-label="Aggiungi paziente">
          <Plus size={18} />
        </button>
      </div>

      <ul className="mt-5 flex-1 space-y-3" data-testid="waiting-list">
        {waiting.length === 0 && <li className="rounded-2xl border border-dashed border-slate-200 py-10 text-center text-sm text-slate-500">Sala d'attesa vuota.</li>}
        <AnimatePresence initial={false}>
          {waiting.map((w, i) => (
            <motion.li key={w.id} layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 30 }} transition={{ duration: 0.3, delay: 0.04 * i }}>
              <WaitingCard w={w} onCall={() => call(w)} onEdit={() => setEditing(w)} onRemove={() => remove(w)} onStart={() => onStart(w)} />
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      <WaitingDialog value={editing} onClose={() => setEditing(null)} onSaved={onChange} />
    </section>
  );
};

const WaitingCard = ({ w, onCall, onEdit, onRemove, onStart }) => {
  const inStudio = w.status === "in_studio";
  const mins = minutesSince(w.arrived_at);
  return (
    <div className={`group rounded-2xl border p-4 transition-colors ${inStudio ? "border-night bg-night text-white" : "border-slate-200 bg-slate-50/60 hover:border-slate-300"}`} data-testid={`waiting-card-${w.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-[15px] font-semibold">{w.name}</span>
            {w.age ? <span className={`text-xs ${inStudio ? "text-slate-300" : "text-slate-500"}`}>{w.age} anni</span> : null}
          </div>
          <p className={`mt-1 line-clamp-2 text-sm ${inStudio ? "text-slate-300" : "text-slate-600"}`}>{w.reason}</p>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-mono text-xl tabular-nums leading-none" data-testid={`waiting-minutes-${w.id}`}>{mins < 60 ? `${mins}′` : mins < 1440 ? `${Math.floor(mins / 60)}h ${mins % 60}′` : `${Math.floor(mins / 1440)}g`}</div>
          <div className={`mt-1 text-[10px] uppercase tracking-[0.18em] ${inStudio ? "text-slate-300" : "text-slate-500"}`}>attesa</div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {w.priority === "urgente" && <span className="rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-red-700" data-testid={`waiting-priority-${w.id}`}>Urgente</span>}
        <span className={`text-xs ${inStudio ? "text-slate-300" : "text-slate-500"}`}>{w.clinic}</span>
        <div className="ml-auto flex items-center gap-1">
          <IconBtn onClick={onEdit} label="Modifica" id={`waiting-edit-${w.id}`} dark={inStudio}><Pencil size={14} /></IconBtn>
          <IconBtn onClick={onRemove} label="Rimuovi" id={`waiting-remove-${w.id}`} dark={inStudio}><Trash2 size={14} /></IconBtn>
          <button onClick={onCall} className={`flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium transition-colors ${inStudio ? "bg-white/10 text-white hover:bg-white/20" : "bg-white text-night ring-1 ring-slate-200 hover:ring-night"}`} data-testid={`waiting-call-${w.id}`}>
            <DoorOpen size={14} /> {inStudio ? "In studio" : "Chiama"}
          </button>
          <button onClick={onStart} className={`grid h-8 w-8 place-items-center rounded-full transition-transform hover:scale-110 ${inStudio ? "bg-white text-night" : "bg-night text-white"}`} data-testid={`waiting-start-${w.id}`} aria-label="Avvia consultazione">
            <Mic size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};

const IconBtn = ({ children, onClick, label, id, dark }) => (
  <button onClick={onClick} aria-label={label} data-testid={id} className={`grid h-8 w-8 place-items-center rounded-full transition-colors ${dark ? "text-slate-300 hover:bg-white/10" : "text-slate-500 hover:bg-slate-200 hover:text-night"}`}>
    {children}
  </button>
);
