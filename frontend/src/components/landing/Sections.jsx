import { motion } from "framer-motion";
import { ShieldCheck, KeyRound, Server, FileSignature } from "lucide-react";

const reveal = (d = 0) => ({ initial: { y: 24 }, whileInView: { y: 0 }, viewport: { once: true, amount: 0.15 }, transition: { delay: d, duration: 0.7, ease: [0.22, 1, 0.36, 1] } });

const STEPS = [
  { n: "01", title: "Registra", text: "Un tocco all'inizio della visita. Lei parla con il paziente, come sempre." },
  { n: "02", title: "Rilegga", text: "Anamnesi, esame obiettivo, diagnosi e terapia compaiono già al loro posto nella cartella. Lei controlla e corregge." },
  { n: "03", title: "Consegna", text: "Il referto PDF con l'intestazione dello studio è pronto da stampare o da inviare al paziente." },
];

export const LandingHowItWorks = () => (
  <section id="come-funziona" className="scroll-mt-20 bg-[var(--raised)]" data-testid="landing-how">
    <div className="mx-auto max-w-[1280px] px-5 py-24 lg:px-10 lg:py-32">
      <motion.div {...reveal()} className="max-w-2xl">
        <div className="text-[11px] uppercase tracking-[0.24em] text-[var(--fg2)]">Come funziona</div>
        <h2 className="mt-3 font-display text-4xl leading-tight text-[var(--fg)] sm:text-5xl">Meno tastiera, <span className="italic text-[var(--fg2)]">più medicina.</span></h2>
      </motion.div>
      <ol className="relative mt-16 grid grid-cols-1 gap-12 md:grid-cols-3 md:gap-10">
        <span className="absolute left-0 right-0 top-[2.4rem] hidden h-px bg-[var(--hair)] md:block" aria-hidden="true" />
        {STEPS.map((s, i) => (
          <motion.li key={s.n} {...reveal(i * 0.1)} className="relative" data-testid={`how-step-${s.n}`}>
            <span className="relative inline-block bg-[var(--raised)] pr-5 font-display text-7xl leading-none text-[var(--fg)]">{s.n}</span>
            <h3 className="mt-6 text-xl font-semibold text-[var(--fg)]">{s.title}</h3>
            <p className="mt-2 max-w-sm text-base leading-relaxed text-[var(--fg2)]">{s.text}</p>
          </motion.li>
        ))}
      </ol>
    </div>
  </section>
);

const POINTS = [
  { icon: Server, k: "Dati in Europa", v: "Database su server UE a Francoforte." },
  { icon: KeyRound, k: "Cifratura AES-256", v: "I dati sanitari sono cifrati prima del salvataggio." },
  { icon: ShieldCheck, k: "Accesso protetto", v: "Password e codice a 6 cifre, con chiusura automatica per inattività." },
  { icon: FileSignature, k: "Consenso e tracciabilità", v: "Consenso firmato prima della visita, ogni accesso registrato." },
];

export const LandingSecurity = () => (
  <section id="sicurezza" className="grain relative scroll-mt-20 overflow-hidden" data-testid="landing-security">
    <div className="relative mx-auto max-w-[1280px] px-5 py-20 lg:px-10 lg:py-28">
      <motion.div {...reveal()} className="max-w-2xl">
        <div className="text-[11px] uppercase tracking-[0.24em] text-[var(--fg2)]">Sicurezza &amp; GDPR</div>
        <h2 className="mt-3 font-display text-4xl leading-tight text-[var(--ink)] sm:text-5xl">Dati sanitari trattati <span className="italic text-[var(--fg2)]">come devono essere.</span></h2>
      </motion.div>
      <ul className="mt-12 grid grid-cols-1 gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
        {POINTS.map(({ icon: Icon, k, v }, i) => (
          <motion.li key={k} {...reveal(i * 0.06)} className="border-t border-[var(--hair)] pt-6" data-testid={`security-point-${i}`}>
            <Icon size={26} strokeWidth={1.3} className="text-[var(--fg2)]" aria-hidden="true" />
            <h3 className="mt-4 text-lg font-semibold text-[var(--ink)]">{k}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-[var(--fg2)]">{v}</p>
          </motion.li>
        ))}
      </ul>
      <p className="mt-12 text-xs text-[var(--fg2)]" data-testid="security-disclaimer">MantMed fornisce gli strumenti; lo studio resta titolare del trattamento dei dati dei suoi pazienti.</p>
    </div>
  </section>
);
