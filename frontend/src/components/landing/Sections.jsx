import { motion } from "framer-motion";
import { ShieldCheck, KeyRound, Server, FileSignature, ScrollText, TimerReset } from "lucide-react";

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

const SPECS = [
  { icon: KeyRound, k: "AES-256-GCM", v: "Cifratura applicativa dei dati sanitari prima del salvataggio, con chiave separata dal database." },
  { icon: Server, k: "UE · Francoforte", v: "Database MongoDB Atlas nella regione eu-central-1: i dati clinici restano in Europa." },
  { icon: ShieldCheck, k: "2FA · TOTP", v: "Accesso con password e codice a 6 cifre, blocco dopo 5 tentativi errati." },
  { icon: TimerReset, k: "Sessione protetta", v: "Chiusura automatica per inattività: nessuna cartella resta aperta sul tablet." },
  { icon: FileSignature, k: "Consenso informato", v: "Firma su tablet o modulo cartaceo, versionata e revocabile. Senza consenso la visita non parte." },
  { icon: ScrollText, k: "Registro accessi", v: "Ogni consultazione del passaporto, PDF o invio email viene tracciata." },
];

export const LandingSecurity = () => (
  <section id="sicurezza" className="grain relative scroll-mt-20 overflow-hidden" data-testid="landing-security">
    <div className="relative mx-auto grid max-w-[1280px] grid-cols-1 gap-14 px-5 py-24 lg:grid-cols-[1fr_1.5fr] lg:px-10 lg:py-32">
      <motion.div {...reveal()}>
        <div className="text-[11px] uppercase tracking-[0.24em] text-[var(--fg2)]">Sicurezza &amp; GDPR</div>
        <h2 className="mt-3 font-display text-4xl leading-tight text-[var(--ink)] sm:text-5xl">Dati sanitari trattati <span className="italic text-[var(--fg2)]">come devono essere.</span></h2>
        <p className="mt-5 text-base leading-relaxed text-[var(--fg2)]">Misure tecniche progettate per i dati particolari (art. 9 Reg. UE 2016/679) e verificabili dal pannello "Sicurezza e GDPR" della dashboard.</p>
        <p className="mt-6 rounded-2xl border border-[var(--hair)] p-4 text-xs leading-relaxed text-[var(--fg2)]" data-testid="security-disclaimer">
          MantMed fornisce strumenti a supporto degli obblighi GDPR. La conformità complessiva resta in capo allo studio, in qualità di titolare del trattamento (informativa, registro dei trattamenti, nomine).
        </p>
      </motion.div>
      <div className="grid grid-cols-1 border-l border-t border-[var(--hair)] sm:grid-cols-2">
        {SPECS.map(({ icon: Icon, k, v }, i) => (
          <motion.div key={k} {...reveal(i * 0.05)} className="border-b border-r border-[var(--hair)] p-6" data-testid={`security-spec-${i}`}>
            <div className="flex items-center gap-3 font-mono text-sm text-[var(--ink)]"><Icon size={16} className="text-[var(--fg2)]" /> {k}</div>
            <p className="mt-3 text-sm leading-relaxed text-[var(--fg2)]">{v}</p>
          </motion.div>
        ))}
      </div>
    </div>
  </section>
);
