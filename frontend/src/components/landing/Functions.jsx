import { motion } from "framer-motion";
import { CalendarDays, Wallet } from "lucide-react";

const reveal = (d = 0) => ({ initial: { y: 20 }, whileInView: { y: 0 }, viewport: { once: true, amount: 0.2 }, transition: { delay: d, duration: 0.6, ease: [0.22, 1, 0.36, 1] } });

const PercentileChart = () => (
  <svg viewBox="0 0 64 40" className="h-10 w-16 shrink-0 text-[var(--fg2)]" fill="none" aria-hidden="true" data-testid="funzioni-percentile-svg">
    <path d="M2 34 C 12 18, 28 9, 62 5" stroke="currentColor" strokeWidth="1" opacity="0.5" strokeLinecap="round" />
    <path d="M2 38 C 14 24, 30 16, 62 12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    <path d="M2 39 C 16 30, 32 23, 62 19" stroke="currentColor" strokeWidth="1" opacity="0.5" strokeLinecap="round" />
    <circle cx="24.5" cy="21.25" r="2.8" fill="#E8A33D" />
  </svg>
);

const Icon = ({ as: I }) => <I size={30} strokeWidth={1.25} className="text-[var(--fg2)]" aria-hidden="true" />;

const ITEMS = [
  { id: "percentili", visual: <PercentileChart />, title: "Cartella su misura per la sua specialità", text: "Campi, esami e modelli pensati per ogni specialità. In Pediatria: percentili OMS e grafici di crescita inclusi." },
  { id: "agenda", visual: <Icon as={CalendarDays} />, title: "Agenda multi-studio", text: "Più studi in un'unica vista, con la sala d'attesa e il prossimo paziente sempre in primo piano." },
  { id: "cassa", visual: <Icon as={Wallet} />, title: "Cassa", text: "Incasso a fine visita in contanti, POS o bonifico, con riepilogo giornaliero per il commercialista." },
];

export const LandingFunctions = () => (
  <section id="funzioni" className="scroll-mt-20" data-testid="landing-functions">
    <div className="mx-auto max-w-[1280px] px-5 py-12 lg:px-10 lg:py-20">
      <motion.div {...reveal()}>
        <div className="text-[11px] uppercase tracking-[0.24em] text-[var(--fg2)]">Tutto lo studio, in un posto</div>
        <h2 className="mt-3 font-display text-3xl leading-tight text-[var(--ink)] sm:text-4xl">Quello che serve tra un paziente e l'altro.</h2>
      </motion.div>
      <div className="mt-8 grid grid-cols-1 gap-3 md:mt-10 md:grid-cols-3 md:gap-4">
        {ITEMS.map((f, i) => (
          <motion.article key={f.id} {...reveal(i * 0.08)} className="flex gap-4 rounded-2xl border border-[var(--hair)] p-5 transition-colors duration-300 hover:border-[var(--fg2)] md:block md:p-6" data-testid={`funzioni-${f.id}`}>
            <div className="flex h-10 w-16 shrink-0 items-center">{f.visual}</div>
            <div className="min-w-0">
              <h3 className="text-lg font-semibold text-[var(--ink)] md:mt-5">{f.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-[var(--fg2)]">{f.text}</p>
            </div>
          </motion.article>
        ))}
      </div>
    </div>
  </section>
);
