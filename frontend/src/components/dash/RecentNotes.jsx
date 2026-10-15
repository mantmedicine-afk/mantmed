import { motion } from "framer-motion";
import { FileText } from "lucide-react";

export const RecentNotes = ({ items, onOpen }) => (
  <section className="mx-auto max-w-[1440px] px-5 pb-16 lg:px-8" data-testid="recent-notes">
    <motion.div initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.1 }} transition={{ duration: 0.6 }}>
      <div className="flex items-end justify-between border-t border-slate-200 pt-8">
        <h2 className="font-display text-4xl text-night">Note cliniche <span className="italic text-slate-500">di oggi</span></h2>
        <span className="font-mono text-sm text-slate-500">{String(items.length).padStart(2, "0")}</span>
      </div>
      {items.length === 0 ? (
        <p className="mt-6 text-sm text-slate-500" data-testid="recent-notes-empty">Le note generate dalle consultazioni compariranno qui.</p>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((c) => (
            <button key={c.id} onClick={() => onOpen(c)} className="group rounded-3xl border border-slate-200 bg-white p-5 text-left transition-all duration-300 hover:-translate-y-1 hover:border-night" data-testid={`recent-note-${c.id}`}>
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span className="flex items-center gap-1.5"><FileText size={13} /> {new Date(c.created_at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}</span>
                <span>{c.clinic || "Consultazione libera"}</span>
              </div>
              <div className="mt-3 font-display text-2xl text-night">{c.patient_name}</div>
              <p className="mt-2 line-clamp-2 text-sm text-slate-600"><span className="font-semibold text-night">Diagnosi: </span>{c.note?.diagnosi || "—"}</p>
            </button>
          ))}
        </div>
      )}
    </motion.div>
  </section>
);
