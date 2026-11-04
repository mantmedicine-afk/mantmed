import { motion } from "framer-motion";
import { Banknote, CreditCard, Landmark, Smartphone } from "lucide-react";

export const inp = "h-11 w-full rounded-xl border border-[var(--hair)] bg-[var(--surface)] px-3 text-sm text-[var(--fg)] outline-none transition-colors focus:border-[var(--accent)]";
export const card = "rounded-3xl border border-[var(--hair)] bg-[var(--surface)] p-5";
export const btnMain = "flex h-11 items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-5 text-sm font-medium text-[var(--ink)] transition-transform hover:-translate-y-0.5 disabled:opacity-60";
export const btnGhost = "flex h-11 items-center justify-center gap-2 rounded-full border border-[var(--hair)] bg-[var(--surface)] px-4 text-sm font-medium text-[var(--fg)] transition-colors hover:border-[var(--accent)] disabled:opacity-60";

export const PAY_METHODS = [
  { id: "contanti", label: "Contanti", icon: Banknote },
  { id: "carta", label: "Carta / Bancomat", icon: CreditCard },
  { id: "bonifico", label: "Bonifico", icon: Landmark },
  { id: "pos", label: "POS", icon: Smartphone },
];

export const Label = ({ children, htmlFor }) => <label htmlFor={htmlFor} className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--fg2)]">{children}</label>;

export const Kicker = ({ icon: Icon, children }) => (
  <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-[var(--fg2)]">{Icon && <Icon size={13} />} {children}</div>
);

export const Seg = ({ value, options, onChange, testid, layoutId }) => (
  <div className="flex flex-wrap gap-1 rounded-xl bg-[var(--surface)] p-1 ring-1 ring-[var(--hair)]" role="radiogroup" data-testid={testid}>
    {options.map(({ id, label, icon: Icon }) => (
      <button key={id} type="button" role="radio" aria-checked={value === id} onClick={() => onChange(id)} className={`relative flex h-9 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-sm font-medium transition-colors ${value === id ? "text-[var(--ink)]" : "text-[var(--fg2)] hover:text-[var(--fg)]"}`} data-testid={`${testid}-${id}`}>
        {value === id && <motion.span layoutId={layoutId ?? testid} className="absolute inset-0 rounded-lg bg-[var(--accent)]" transition={{ type: "spring", stiffness: 400, damping: 32 }} />}
        {Icon && <Icon size={14} className="relative" />}<span className="relative">{label}</span>
      </button>
    ))}
  </div>
);

const STATUS = {
  pagata: ["Pagata", "bg-[var(--accent)] text-[var(--ink)]"],
  da_incassare: ["Da incassare", "border border-[var(--alert)] text-[var(--alert)]"],
  annullata: ["Annullata", "bg-[var(--raised)] text-[var(--fg2)] line-through"],
  da_inviare: ["Da inviare", "border border-[var(--hair)] text-[var(--fg)]"],
  inviata: ["Inviata", "bg-[var(--accent)] text-[var(--ink)]"],
  errore: ["Errore", "bg-[var(--alert)] text-white"],
};
export const Badge = ({ status, testid }) => {
  const [label, cls] = STATUS[status] ?? [status, ""];
  return <span className={`inline-flex h-6 items-center whitespace-nowrap rounded-full px-2.5 text-[11px] font-semibold ${cls}`} data-testid={testid}>{label}</span>;
};

export const ClinicFilter = ({ clinics, value, onChange, testid = "cash-clinic-filter" }) => (
  <div className="flex flex-wrap gap-1.5" role="radiogroup" data-testid={testid}>
    {[["", "Tutti gli studi"], ...clinics.map((c) => [c, c])].map(([id, label]) => (
      <button key={id || "all"} type="button" role="radio" aria-checked={value === id} onClick={() => onChange(id)} className={`h-9 rounded-full px-4 text-sm font-medium transition-colors ${value === id ? "bg-[var(--accent)] text-[var(--ink)]" : "border border-[var(--hair)] text-[var(--fg2)] hover:border-[var(--accent)] hover:text-[var(--fg)]"}`} data-testid={`${testid}-${(id || "all").toLowerCase().replace(/\s+/g, "-")}`}>{label}</button>
    ))}
  </div>
);

export const fmtDate = (d) => (d ? new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—");
