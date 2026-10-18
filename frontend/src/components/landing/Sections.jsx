import { motion } from "framer-motion";
import { AudioLines, LineChart, FileCheck2, CalendarRange, Wallet, ShieldCheck, KeyRound, Server, FileSignature, ScrollText, TimerReset } from "lucide-react";

const reveal = (d = 0) => ({ initial: { y: 24 }, whileInView: { y: 0 }, viewport: { once: true, amount: 0.15 }, transition: { delay: d, duration: 0.7, ease: [0.22, 1, 0.36, 1] } });

const FEATURES = [
  { id: "trascrizione", icon: AudioLines, title: "Trascrizione vocale istantanea", text: "Registra la visita con un tocco: la conversazione diventa anamnesi, esame obiettivo, diagnosi e terapia nella cartella pediatrica standard.", span: "md:col-span-2", big: "Parli. Il resto è scritto." },
  { id: "percentili", icon: LineChart, title: "Percentili pediatrici automatici", text: "Peso, altezza e circonferenza cranica confrontati con le curve OMS, con z-score e grafico di crescita aggiornati a ogni visita." },
  { id: "pdf", icon: FileCheck2, title: "Referti PDF in 30 secondi", text: "Referto impaginato con intestazione dello studio, pronto da stampare o da inviare ai genitori via email.", big: "30″" },
  { id: "agenda", icon: CalendarRange, title: "Agenda multi-studio", text: "Studio Centro e Studio Provincia in un'unica vista: appuntamenti, sala d'attesa e prossimo paziente sempre in primo piano." },
  { id: "cassa", icon: Wallet, title: "Cassa integrata", text: "Incasso a fine visita in contanti, POS o bonifico, con riepilogo giornaliero ed export CSV per il commercialista." },
];

export const LandingFeatures = () => (
  <section id="vantaggi" className="scroll-mt-20 bg-[#F4F5F7]" data-testid="landing-features">
    <div className="mx-auto max-w-[1280px] px-5 py-24 lg:px-10 lg:py-32">
      <motion.div {...reveal()} className="max-w-2xl">
        <div className="text-[11px] uppercase tracking-[0.24em] text-slate-600">Vantaggi chiave</div>
        <h2 className="mt-3 font-display text-4xl leading-tight text-[#0A192F] sm:text-5xl">Meno tastiera, <span className="italic text-slate-500">più medicina.</span></h2>
        <p className="mt-5 text-base text-slate-600 md:text-lg">Ogni funzione nasce da una visita reale: niente moduli superflui, solo gli strumenti che servono tra un paziente e l'altro.</p>
      </motion.div>
      <div className="mt-14 grid grid-cols-1 gap-4 md:grid-cols-3">
        {FEATURES.map((f, i) => (
          <motion.article key={f.id} {...reveal(i * 0.06)} className={`group relative overflow-hidden rounded-[28px] p-7 transition-transform duration-300 hover:-translate-y-1 ${f.span ?? ""} ${i === 0 ? "grain bg-[#0A192F] text-white" : "border border-slate-200 bg-white text-[#0A192F]"}`} data-testid={`feature-${f.id}`}>
            <div className="relative flex items-start justify-between gap-4">
              <span className={`grid h-12 w-12 place-items-center rounded-2xl ${i === 0 ? "bg-white/10 text-white" : "bg-[#0A192F] text-white"}`}><f.icon size={20} /></span>
              {f.big && <span className={`font-display text-5xl leading-none ${i === 0 ? "text-[#C9CCD3]" : "text-[#0A192F]"}`}>{f.big}</span>}
            </div>
            <h3 className="relative mt-10 font-display text-3xl leading-tight">{f.title}</h3>
            <p className={`relative mt-3 max-w-lg text-sm leading-relaxed ${i === 0 ? "text-[#C9CCD3]" : "text-slate-600"}`}>{f.text}</p>
          </motion.article>
        ))}
      </div>
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
        <div className="text-[11px] uppercase tracking-[0.24em] text-[#C9CCD3]">Sicurezza &amp; GDPR</div>
        <h2 className="mt-3 font-display text-4xl leading-tight text-white sm:text-5xl">Dati sanitari trattati <span className="italic text-[#C9CCD3]">come devono essere.</span></h2>
        <p className="mt-5 text-base leading-relaxed text-[#C9CCD3]">Misure tecniche progettate per i dati particolari (art. 9 Reg. UE 2016/679) e verificabili dal pannello "Sicurezza e GDPR" della dashboard.</p>
        <p className="mt-6 rounded-2xl border border-[#C9CCD3]/20 p-4 text-xs leading-relaxed text-[#C9CCD3]" data-testid="security-disclaimer">
          MantMed fornisce strumenti a supporto degli obblighi GDPR. La conformità complessiva resta in capo allo studio, in qualità di titolare del trattamento (informativa, registro dei trattamenti, nomine).
        </p>
      </motion.div>
      <div className="grid grid-cols-1 border-l border-t border-[#C9CCD3]/20 sm:grid-cols-2">
        {SPECS.map(({ icon: Icon, k, v }, i) => (
          <motion.div key={k} {...reveal(i * 0.05)} className="border-b border-r border-[#C9CCD3]/20 p-6" data-testid={`security-spec-${i}`}>
            <div className="flex items-center gap-3 font-mono text-sm text-white"><Icon size={16} className="text-[#C9CCD3]" /> {k}</div>
            <p className="mt-3 text-sm leading-relaxed text-[#C9CCD3]">{v}</p>
          </motion.div>
        ))}
      </div>
    </div>
  </section>
);
