import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { Mic, ArrowUpRight } from "lucide-react";

export const ConsultHub = ({ next, onStart }) => {
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const rx = useSpring(useTransform(my, [-0.5, 0.5], [8, -8]), { stiffness: 120, damping: 18 });
  const ry = useSpring(useTransform(mx, [-0.5, 0.5], [-8, 8]), { stiffness: 120, damping: 18 });

  const move = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    mx.set((e.clientX - r.left) / r.width - 0.5);
    my.set((e.clientY - r.top) / r.height - 0.5);
  };
  const reset = () => { mx.set(0); my.set(0); };

  return (
    <section
      onPointerMove={move}
      onPointerLeave={reset}
      className="grain relative flex h-full min-h-[520px] flex-col items-center justify-between overflow-hidden rounded-[28px] bg-night px-6 py-7 text-white [perspective:1000px]"
      data-testid="consult-hub"
    >
      <div className="relative z-10 flex w-full items-center justify-between text-[11px] uppercase tracking-[0.22em] text-slate-300">
        <span>Consultazione</span>
        <span className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> AI pronta</span>
      </div>

      <motion.div style={{ rotateX: rx, rotateY: ry }} className="relative z-10 grid place-items-center [transform-style:preserve-3d]">
        {[0, 1, 2].map((i) => <span key={i} className="ring-pulse absolute rounded-full border border-[#7FA6FF]/40" style={{ animationDelay: `${i * 1.2}s` }} />)}
        <motion.button
          onClick={() => onStart(next)}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.96 }}
          className="relative grid h-[250px] w-[250px] place-items-center rounded-full bg-white text-night shadow-[0_30px_80px_-20px_rgba(127,166,255,0.55)] sm:h-[280px] sm:w-[280px]"
          style={{ transform: "translateZ(40px)" }}
          data-testid="start-consultation-btn"
        >
          <span className="flex flex-col items-center px-8 text-center">
            <span className="mb-4 grid h-14 w-14 place-items-center rounded-full bg-night text-white"><Mic size={24} /></span>
            <span className="font-display text-[28px] leading-[1.05]">Avvia Consultazione</span>
            <span className="mt-1 text-sm font-medium uppercase tracking-[0.2em] text-slate-500">/ Registrazione</span>
          </span>
        </motion.button>
      </motion.div>

      <div className="relative z-10 w-full rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md" data-testid="next-patient-chip">
        <div className="text-[11px] uppercase tracking-[0.2em] text-slate-300">Prossimo paziente</div>
        {next ? (
          <div className="mt-1 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-lg font-medium" data-testid="next-patient-name">{next.name}</div>
              <div className="truncate text-sm text-slate-300">{next.clinic} · {next.reason}</div>
            </div>
            <ArrowUpRight className="shrink-0 text-[#7FA6FF]" />
          </div>
        ) : (
          <div className="mt-1 text-sm text-slate-300">Nessuno in attesa — avvia una consultazione libera.</div>
        )}
      </div>
    </section>
  );
};
