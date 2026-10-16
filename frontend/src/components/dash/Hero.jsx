import { motion } from "framer-motion";

const Line = ({ children, delay }) => (
  <span className="block overflow-hidden pb-1">
    <motion.span
      className="block"
      initial={{ y: "105%" }}
      animate={{ y: 0 }}
      transition={{ duration: 0.9, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.span>
  </span>
);

const greeting = () => {
  const h = new Date().getHours();
  return h < 13 ? "Buongiorno" : h < 18 ? "Buon pomeriggio" : "Buonasera";
};

export const Hero = ({ total, waiting, name, income = 0 }) => (
  <section className="mx-auto max-w-[1440px] px-5 pb-6 pt-8 lg:px-8 lg:pt-10" data-testid="hero">
    <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
      <h1 className="font-display text-4xl leading-[1.02] tracking-tight text-night sm:text-5xl lg:text-6xl">
        <Line delay={0.1}>{greeting()}, {name}.</Line>
        <Line delay={0.22}>
          <span className="italic text-slate-500">{total} visite, due studi, </span>
          <span className="italic">una giornata.</span>
        </Line>
      </h1>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.6 }}
        className="flex gap-8 border-l border-slate-200 pl-6"
      >
        <Stat label="Visite oggi" value={total} id="stat-total" />
        <Stat label="In attesa" value={waiting} id="stat-waiting" />
        <div>
          <div className="font-display text-5xl leading-none text-night" data-testid="stat-income">{(Number(income) || 0).toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })}</div>
          <div className="mt-2 text-[11px] uppercase tracking-[0.2em] text-slate-500">Incassato oggi</div>
        </div>
      </motion.div>
    </div>
  </section>
);

const Stat = ({ label, value, id }) => (
  <div>
    <div className="font-display text-5xl leading-none text-night" data-testid={id}>{String(value).padStart(2, "0")}</div>
    <div className="mt-2 text-[11px] uppercase tracking-[0.2em] text-slate-500">{label}</div>
  </div>
);
