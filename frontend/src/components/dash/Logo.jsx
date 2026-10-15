import { motion } from "framer-motion";

export const LogoMark = ({ size = 34, light = false }) => (
  <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true">
    <rect width="40" height="40" rx="12" fill={light ? "#FFFFFF" : "#0B1736"} />
    <motion.path
      d="M7 21h6l3-8 5 15 4-11 2 4h6"
      stroke={light ? "#0B1736" : "#FFFFFF"}
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      initial={{ pathLength: 0.15 }}
      animate={{ pathLength: 1 }}
      transition={{ duration: 1.4, ease: [0.65, 0, 0.35, 1], delay: 0.2 }}
    />
    <circle cx="33" cy="21" r="2.2" fill="#7FA6FF" />
  </svg>
);

export const Logo = () => (
  <div className="flex items-center gap-3" data-testid="brand-logo">
    <LogoMark />
    <div className="leading-none">
      <div className="font-display text-[26px] tracking-tight text-night">Auscula</div>
      <div className="mt-1 text-[10px] font-medium uppercase tracking-[0.22em] text-slate-500">studio specialistico</div>
    </div>
  </div>
);
