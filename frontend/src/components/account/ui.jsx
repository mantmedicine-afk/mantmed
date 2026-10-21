import { Loader2 } from "lucide-react";

export const inp = "h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-night outline-none transition-colors focus:border-night disabled:bg-slate-50 disabled:text-slate-500";

export const Card = ({ id, icon: Icon, title, text, children, action }) => (
  <section className="rounded-[28px] border border-slate-200 bg-white p-5 sm:p-7" data-testid={id}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-600">{Icon && <Icon size={14} className="text-night" />} {title}</h2>
        {text && <p className="mt-1 max-w-xl text-sm text-slate-600">{text}</p>}
      </div>
      {action}
    </div>
    <div className="mt-5">{children}</div>
  </section>
);

export const Field = ({ label, children, wide }) => (
  <label className={`block ${wide ? "sm:col-span-2" : ""}`}>
    <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600">{label}</span>
    {children}
  </label>
);

export const SaveBtn = ({ busy, children = "Salva modifiche", testId, disabled }) => (
  <button disabled={busy || disabled} className="flex h-11 items-center justify-center gap-2 rounded-full bg-night px-6 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 disabled:opacity-50" data-testid={testId}>
    {busy && <Loader2 size={15} className="animate-spin" />} {children}
  </button>
);

export const day = (iso) => (iso ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" }) : "");
