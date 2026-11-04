export const day = (iso) => (iso ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" }) : "");
export const card = "rounded-3xl bg-[var(--surface)] p-5 ring-1 ring-[var(--sel)]";

export const Label = ({ icon: I, children, className = "" }) => (
  <div className={`flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--fg2)] ${className}`}>{I && <I size={14} strokeWidth={1.5} />} {children}</div>
);

export const Meta = ({ by, at, testId }) => (
  <div className="mt-1 text-xs text-[var(--fg2)]" data-testid={testId}>Inserito da {by || "studio medico"}{at ? ` · ${day(at)}` : ""}</div>
);

export const Empty = ({ text, testId }) => <p className="rounded-2xl border border-dashed border-[var(--hair)] p-5 text-center text-sm text-[var(--fg2)]" data-testid={testId}>{text}</p>;
