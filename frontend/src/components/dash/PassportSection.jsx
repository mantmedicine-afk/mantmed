import { useState } from "react";
import { motion } from "framer-motion";
import { Search, Plus, Cloud, ArrowUpRight } from "lucide-react";

export const PassportSection = ({ patients, onOpen, onAdd }) => {
  const [q, setQ] = useState("");
  const list = patients.filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <section className="mx-auto max-w-[1440px] px-5 pb-10 lg:px-8" data-testid="passport-section">
      <motion.div initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.1 }} transition={{ duration: 0.6 }}>
        <div className="flex flex-col gap-4 border-t border-slate-200 pt-8 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-slate-500"><Cloud size={13} /> Sincronizzato tra Studio Centro e Studio Provincia</div>
            <h2 className="mt-1 font-display text-4xl text-night">Passaporto sanitario <span className="italic text-slate-500">dinamico</span></h2>
          </div>
          <div className="flex gap-2">
            <label className="flex flex-1 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 md:w-72">
              <Search size={15} className="text-slate-500" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca paziente" className="h-11 w-full bg-transparent text-sm text-night outline-none" data-testid="passport-search-input" />
            </label>
            <button onClick={onAdd} className="flex h-11 items-center gap-2 rounded-full bg-night px-5 text-sm font-medium text-white transition-transform hover:-translate-y-0.5" data-testid="add-patient-btn"><Plus size={15} /> Paziente</button>
          </div>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {list.map((p) => (
            <button key={p.id} onClick={() => onOpen(p.id)} className="group rounded-3xl border border-slate-200 bg-white p-5 text-left transition-all duration-300 hover:-translate-y-1 hover:border-night" data-testid={`patient-card-${p.id}`}>
              <div className="flex items-start justify-between">
                <span className={`grid h-10 w-10 place-items-center rounded-full text-sm font-semibold ${p.sex === "F" ? "bg-[#EAF0FF] text-[#2747B8]" : "bg-night text-white"}`}>{p.name.split(" ").map((s) => s[0]).join("").slice(0, 2)}</span>
                <ArrowUpRight size={18} className="text-slate-400 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-night" />
              </div>
              <div className="mt-4 font-display text-2xl leading-tight text-night">{p.name}</div>
              <div className="text-sm text-slate-600">{p.age_label} · {p.sex === "F" ? "F" : "M"}</div>
              <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">{p.visits} visite</span>
                {(p.clinics ?? []).map((c) => <span key={c} className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">{c}</span>)}
                {p.allergies && <span className="rounded-full bg-red-50 px-2 py-0.5 font-semibold text-red-700">Allergie</span>}
              </div>
            </button>
          ))}
          {list.length === 0 && <p className="text-sm text-slate-500">Nessun paziente trovato.</p>}
        </div>
      </motion.div>
    </section>
  );
};
