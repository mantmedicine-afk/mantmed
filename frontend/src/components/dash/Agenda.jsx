import { useState } from "react";
import { motion } from "framer-motion";
import { Plus, MapPin } from "lucide-react";
import { CLINICS } from "@/lib/api";
import { AppointmentDialog } from "./AppointmentDialog";

const STATUS = {
  programmato: { label: "Programmato", dot: "bg-slate-300", text: "text-slate-600" },
  in_attesa: { label: "In attesa", dot: "bg-amber-500", text: "text-amber-700" },
  in_corso: { label: "In corso", dot: "bg-[#3B6CF6]", text: "text-[#2747B8]" },
  completato: { label: "Completato", dot: "bg-emerald-500", text: "text-emerald-700" },
};

const slug = (s) => s.toLowerCase().replace(/\s+/g, "-");

export const Agenda = ({ appointments, onChange }) => {
  const [clinic, setClinic] = useState(CLINICS[0]);
  const [editing, setEditing] = useState(null);
  const items = appointments.filter((a) => a.clinic === clinic);

  return (
    <section className="flex h-full flex-col rounded-[28px] border border-slate-200 bg-white p-5 lg:p-6" data-testid="agenda-panel">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Agenda del giorno</div>
          <h2 className="mt-1 font-display text-3xl text-night">Studi</h2>
        </div>
        <button
          onClick={() => setEditing({ clinic })}
          className="grid h-11 w-11 place-items-center rounded-full bg-night text-white transition-transform duration-200 hover:rotate-90 active:scale-95"
          data-testid="add-appointment-btn"
          aria-label="Aggiungi appuntamento"
        >
          <Plus size={18} />
        </button>
      </div>

      <div className="relative mt-5 grid grid-cols-2 rounded-full bg-slate-100 p-1" data-testid="clinic-tabs">
        {CLINICS.map((c) => {
          const n = appointments.filter((a) => a.clinic === c).length;
          return (
            <button
              key={c}
              onClick={() => setClinic(c)}
              className={`relative z-10 rounded-full px-3 py-2.5 text-sm font-medium transition-colors ${clinic === c ? "text-white" : "text-slate-600 hover:text-night"}`}
              data-testid={`${slug(c)}-tab`}
            >
              {clinic === c && <motion.span layoutId="clinic-pill" className="absolute inset-0 -z-10 rounded-full bg-night" transition={{ type: "spring", stiffness: 380, damping: 32 }} />}
              {c} <span className="ml-1 font-mono text-xs opacity-70">{n}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-2 flex items-center gap-1.5 px-1 text-xs text-slate-500">
        <MapPin size={12} /> {clinic === "Studio Centro" ? "Via Roma 12 · mattina" : "Piazza Garibaldi 4 · pomeriggio"}
      </div>

      <ol className="relative mt-4 flex-1 space-y-1" data-testid="agenda-list">
        <span className="absolute bottom-3 left-[62px] top-3 w-px bg-slate-200" />
        {items.length === 0 && <li className="py-10 text-center text-sm text-slate-500">Nessun appuntamento.</li>}
        {items.map((a, i) => <AgendaRow key={a.id} a={a} i={i} onClick={() => setEditing(a)} />)}
      </ol>

      <AppointmentDialog value={editing} onClose={() => setEditing(null)} onSaved={onChange} />
    </section>
  );
};

const AgendaRow = ({ a, i, onClick }) => {
  const s = STATUS[a.status] ?? STATUS.programmato;
  return (
    <motion.li
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.05 * i, duration: 0.35 }}
      key={a.id}
    >
      <button
        onClick={onClick}
        className={`group grid w-full grid-cols-[50px_24px_1fr] items-center gap-0 rounded-2xl px-1 py-2.5 text-left transition-colors hover:bg-slate-50 ${a.status === "completato" ? "opacity-60" : ""}`}
        data-testid={`appointment-row-${a.id}`}
      >
        <span className="font-mono text-sm tabular-nums text-night">{a.time}</span>
        <span className="relative z-10 flex justify-center"><span className={`h-2.5 w-2.5 rounded-full ring-4 ring-white ${s.dot}`} /></span>
        <span className="min-w-0 pl-2">
          <span className="block truncate text-[15px] font-medium text-night transition-transform duration-200 group-hover:translate-x-0.5">{a.patient_name}</span>
          <span className="flex items-center gap-2 text-xs">
            <span className="truncate text-slate-500">{a.visit_type}</span>
            <span className={`shrink-0 ${s.text}`}>· {s.label}</span>
          </span>
        </span>
      </button>
    </motion.li>
  );
};
