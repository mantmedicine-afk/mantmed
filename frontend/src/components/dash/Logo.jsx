import { motion } from "framer-motion";

const draw = (d) => ({ initial: { pathLength: 0 }, animate: { pathLength: 1 }, transition: { duration: 1.3, delay: d, ease: [0.65, 0, 0.35, 1] } });

export const LogoMark = ({ size = 34, light = false }) => (
  <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true">
    <rect width="40" height="40" rx="12" fill={light ? "#FFFFFF" : "#0B1736"} />
    <motion.path d="M9 30V10l11 13 11-13v20" stroke={light ? "#0B1736" : "#FFFFFF"} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" {...draw(0.15)} />
    <motion.path d="M13 30l7-18 7 18M15.6 24h8.8" stroke="#7FA6FF" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" {...draw(0.45)} />
  </svg>
);

export const Logo = () => (
  <div className="flex items-center gap-3" data-testid="brand-logo">
    <LogoMark />
    <div className="leading-none">
      <div className="font-display text-[26px] tracking-tight text-night">MantMed</div>
      <div className="mt-1 text-[10px] font-medium uppercase tracking-[0.22em] text-slate-500">pediatria d'eccellenza</div>
    </div>
  </div>
);
