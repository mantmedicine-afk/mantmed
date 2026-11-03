import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Pencil, Trash2, DoorOpen, Mic, BookUser } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg, minutesSince } from "@/lib/api";
import { WaitingDialog } from "./WaitingDialog";

export const WaitingList = ({ waiting, onChange, onStart, patients = [], onPassport }) => {
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
    <section className="flex flex-col rounded-[28px] border border-[var(--hair)] bg-[var(--surface)] p-5 lg:p-6" data-testid="waiting-panel">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-[var(--fg2)]">Sala d'attesa</div>
          <h2 className="mt-1 font-display text-3xl text-[var(--fg)]">Pazienti in attesa</h2>
        </div>
        <button onClick={() => setEditing({})} className="grid h-11 w-11 place-items-center rounded-full border border-[var(--accent)] text-[var(--fg)] transition-all duration-200 hover:bg-[var(--accent)] hover:text-[var(--ink)] active:scale-95" data-testid="add-waiting-btn" aria-label="Aggiungi paziente">
          <Plus size={18} />
        </button>
      </div>

      <ul className="mt-5 space-y-3" data-testid="waiting-list">
        {waiting.length === 0 && <li className="rounded-2xl border border-dashed border-[var(--hair)] py-6 text-center text-sm text-[var(--fg2)]" data-testid="waiting-empty">Sala d'attesa vuota.</li>}
        <AnimatePresence initial={false}>
          {waiting.map((w, i) => (
            <motion.li key={w.id} layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 30 }} transition={{ duration: 0.3, delay: 0.04 * i }}>
              <WaitingCard w={w} age={patients.find((p) => p.id === w.patient_id)?.age_label} onPassport={w.patient_id && onPassport ? () => onPassport(w.patient_id) : null} onCall={() => call(w)} onEdit={() => setEditing(w)} onRemove={() => remove(w)} onStart={() => onStart(w)} />
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      <WaitingDialog value={editing} onClose={() => setEditing(null)} onSaved={onChange} patients={patients} />
    </section>
  );
};

const WaitingCard = ({ w, age, onPassport, onCall, onEdit, onRemove, onStart }) => {
  const inStudio = w.status === "in_studio";
  const mins = minutesSince(w.arrived_at);
  return (
    <div className={`group rounded-2xl border p-4 transition-colors ${inStudio ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--ink)]" : "border-[var(--hair)] bg-[var(--raised)]/60 hover:border-[var(--hair)]"}`} data-testid={`waiting-card-${w.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-[15px] font-semibold">{w.name}</span>
            {age ? <span className={`text-xs ${inStudio ? "text-[var(--fg2)]" : "text-[var(--fg2)]"}`}>{age}</span> : null}
          </div>
          <p className={`mt-1 line-clamp-2 text-sm ${inStudio ? "text-[var(--fg2)]" : "text-[var(--fg2)]"}`}>{w.reason}</p>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-mono text-xl tabular-nums leading-none" data-testid={`waiting-minutes-${w.id}`}>{mins < 60 ? `${mins}′` : mins < 1440 ? `${Math.floor(mins / 60)}h ${mins % 60}′` : `${Math.floor(mins / 1440)}g`}</div>
          <div className={`mt-1 text-[10px] uppercase tracking-[0.18em] ${inStudio ? "text-[var(--fg2)]" : "text-[var(--fg2)]"}`}>attesa</div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {w.priority === "urgente" && <span className="rounded-full bg-[var(--alert-bg)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--alert)]" data-testid={`waiting-priority-${w.id}`}>Urgente</span>}
        <span className={`text-xs ${inStudio ? "text-[var(--fg2)]" : "text-[var(--fg2)]"}`}>{w.clinic}</span>
        <div className="ml-auto flex items-center gap-1">
          {onPassport && <IconBtn onClick={onPassport} label="Passaporto sanitario" id={`waiting-passport-${w.id}`} dark={inStudio}><BookUser size={14} /></IconBtn>}
          <IconBtn onClick={onEdit} label="Modifica" id={`waiting-edit-${w.id}`} dark={inStudio}><Pencil size={14} /></IconBtn>
          <IconBtn onClick={onRemove} label="Rimuovi" id={`waiting-remove-${w.id}`} dark={inStudio}><Trash2 size={14} /></IconBtn>
          <button onClick={onCall} className={`flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium transition-colors ${inStudio ? "bg-[var(--sel)] text-[var(--ink)] hover:bg-[var(--sel)]" : "bg-[var(--surface)] text-[var(--fg)] ring-1 ring-[var(--hair)] hover:ring-[var(--accent)]"}`} data-testid={`waiting-call-${w.id}`}>
            <DoorOpen size={14} /> {inStudio ? "In studio" : "Chiama"}
          </button>
          <button onClick={onStart} className={`grid h-8 w-8 place-items-center rounded-full transition-transform hover:scale-110 ${inStudio ? "bg-[var(--surface)] text-[var(--fg)]" : "bg-[var(--accent)] text-[var(--ink)]"}`} data-testid={`waiting-start-${w.id}`} aria-label="Avvia consultazione">
            <Mic size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};

const IconBtn = ({ children, onClick, label, id, dark }) => (
  <button onClick={onClick} aria-label={label} data-testid={id} className={`grid h-8 w-8 place-items-center rounded-full transition-colors ${dark ? "text-[var(--fg2)] hover:bg-[var(--sel)]" : "text-[var(--fg2)] hover:bg-[var(--hair)] hover:text-[var(--fg)]"}`}>
    {children}
  </button>
);
