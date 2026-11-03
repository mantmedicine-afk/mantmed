import { useState } from "react";
import { motion } from "framer-motion";
import { Search, Plus, Cloud, ArrowUpRight } from "lucide-react";
import { CLINICS } from "@/lib/api";

export const PassportSection = ({ patients, onOpen, onAdd }) => {
  const [q, setQ] = useState("");
  const list = patients.filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <section className="mx-auto max-w-[1440px] px-5 pb-10 lg:px-8" data-testid="passport-section">
      <motion.div initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.1 }} transition={{ duration: 0.6 }}>
        <div className="flex flex-col gap-4 border-t border-[var(--hair)] pt-8 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-[var(--fg2)]"><Cloud size={13} /> {CLINICS.length > 1 ? `Sincronizzato tra ${CLINICS.join(" e ")}` : `Archivio di ${CLINICS[0]}`}</div>
            <h2 className="mt-1 font-display text-4xl text-[var(--fg)]">Passaporto sanitario <span className="italic text-[var(--fg2)]">dinamico</span></h2>
          </div>
          <div className="flex gap-2">
            <label className="flex flex-1 items-center gap-2 rounded-full border border-[var(--hair)] bg-[var(--surface)] px-4 md:w-72">
              <Search size={15} className="text-[var(--fg2)]" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca paziente" className="h-11 w-full bg-transparent text-sm text-[var(--fg)] outline-none" data-testid="passport-search-input" />
            </label>
            <button onClick={onAdd} className="flex h-11 items-center gap-2 rounded-full bg-[var(--accent)] px-5 text-sm font-medium text-[var(--ink)] transition-transform hover:-translate-y-0.5" data-testid="add-patient-btn"><Plus size={15} /> Paziente</button>
          </div>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {list.map((p) => (
            <button key={p.id} onClick={() => onOpen(p.id)} className="group rounded-3xl border border-[var(--hair)] bg-[var(--surface)] p-5 text-left transition-all duration-300 hover:-translate-y-1 hover:border-[var(--accent)]" data-testid={`patient-card-${p.id}`}>
              <div className="flex items-start justify-between">
                <span className={`grid h-10 w-10 place-items-center rounded-full text-sm font-semibold ${p.sex === "F" ? "bg-[var(--raised)] text-[var(--fg)]" : "bg-[var(--accent)] text-[var(--ink)]"}`}>{p.name.split(" ").map((s) => s[0]).join("").slice(0, 2)}</span>
                <ArrowUpRight size={18} className="text-[var(--fg2)] transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[var(--fg)]" />
              </div>
              <div className="mt-4 font-display text-2xl leading-tight text-[var(--fg)]">{p.name}</div>
              <div className="text-sm text-[var(--fg2)]">{p.age_label} · {p.sex === "F" ? "F" : "M"}</div>
              <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
                <span className="rounded-full bg-[var(--raised)] px-2 py-0.5 text-[var(--fg2)]">{p.visits} visite</span>
                {(p.clinics ?? []).map((c) => <span key={c} className="rounded-full bg-[var(--raised)] px-2 py-0.5 text-[var(--fg2)]">{c}</span>)}
                {p.allergies && <span className="rounded-full bg-[var(--alert-bg)] px-2 py-0.5 font-semibold text-[var(--alert)]">Allergie</span>}
              </div>
            </button>
          ))}
          {list.length === 0 && <p className="text-sm text-[var(--fg2)]">Nessun paziente trovato.</p>}
        </div>
      </motion.div>
    </section>
  );
};
