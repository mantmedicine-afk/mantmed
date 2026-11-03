export const MantAIMark = ({ size = 40, light = false }) => (
  <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true" data-testid="mantai-logo-mark">
    <rect width="40" height="40" rx="12" fill={light ? "var(--onbar)" : "var(--accent)"} />
    <path d="M8 22v-4M12.5 26V14M17 23v-6M21.5 28V12" stroke={light ? "var(--bar)" : "var(--ink-base)"} strokeWidth="2.4" strokeLinecap="round" />
    <path d="M29.5 9.5l1.4 3.6 3.6 1.4-3.6 1.4-1.4 3.6-1.4-3.6-3.6-1.4 3.6-1.4z" fill="var(--wait)" />
    <path d="M28 24.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" fill="var(--wait)" />
  </svg>
);

export const MantAILogo = ({ size = 40, light = false, className = "" }) => (
  <span className={`inline-flex items-center gap-2.5 ${className}`} data-testid="mantai-logo">
    <MantAIMark size={size} light={light} />
    <span className={`font-semibold tracking-tight ${light ? "text-[var(--ink)]" : "text-[var(--fg)]"}`} style={{ fontSize: size * 0.5 }}>Mant<span className={light ? "text-[var(--fg2)]" : "text-[var(--accent)]"}>AI</span></span>
  </span>
);
