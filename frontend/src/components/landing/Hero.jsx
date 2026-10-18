import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, ArrowDown, Mic, FileText, Check } from "lucide-react";
import { LogoMark } from "@/components/dash/Logo";

export const scrollTo = (id) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
const rise = (d = 0) => ({ initial: { y: 18 }, animate: { y: 0 }, transition: { delay: d, duration: 0.8, ease: [0.22, 1, 0.36, 1] } });

export const LandingHeader = () => (
  <header className="sticky top-0 z-50 border-b border-[#C9CCD3]/15 bg-[#0A192F]/85 backdrop-blur-xl">
    <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-4 px-5 py-4 lg:px-10">
      <a href="/" className="flex items-center gap-3" data-testid="landing-logo">
        <LogoMark size={38} light />
        <div className="leading-none">
          <div className="font-display text-[26px] tracking-tight text-white">MantMed</div>
          <div className="mt-1 hidden text-[10px] uppercase tracking-[0.24em] text-[#C9CCD3] sm:block">Precisione clinica · tempo per il paziente</div>
        </div>
      </a>
      <nav className="flex items-center gap-2">
        <button onClick={() => scrollTo("vantaggi")} className="hidden h-10 px-4 text-sm text-[#C9CCD3] transition-colors hover:text-white md:block" data-testid="nav-features">Vantaggi</button>
        <button onClick={() => scrollTo("sicurezza")} className="hidden h-10 px-4 text-sm text-[#C9CCD3] transition-colors hover:text-white md:block" data-testid="nav-security">Sicurezza</button>
        <button onClick={() => scrollTo("contatti")} className="hidden h-10 px-4 text-sm text-[#C9CCD3] transition-colors hover:text-white md:block" data-testid="nav-contact">Contatti</button>
        <Link to="/app" className="flex h-10 items-center gap-2 rounded-full border border-[#C9CCD3]/40 px-5 text-sm font-medium text-white transition-colors hover:border-white hover:bg-white hover:text-[#0A192F]" data-testid="landing-login-btn">Accedi <ArrowRight size={15} /></Link>
      </nav>
    </div>
  </header>
);

const STEPS = [
  { icon: Mic, title: "Visita registrata", meta: "Trascrizione ambientale · 14:32" },
  { icon: FileText, title: "Cartella compilata", meta: "Anamnesi · Esame obiettivo · Terapia" },
  { icon: Check, title: "Referto PDF pronto", meta: "Firmato e inviabile ai genitori" },
];

const HeroMock = () => (
  <motion.div {...rise(0.3)} className="relative" data-testid="hero-mock">
    <div className="absolute -inset-10 rounded-full bg-[#C9CCD3]/10 blur-3xl" aria-hidden="true" />
    <div className="relative rounded-[28px] border border-[#C9CCD3]/20 bg-[#0E2240] p-6 shadow-2xl">
      <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.2em] text-[#C9CCD3]">
        <span>Refertazione</span><span className="font-mono text-white">00:28</span>
      </div>
      <div className="mt-5 flex h-14 items-center gap-[3px]" aria-hidden="true">
        {Array.from({ length: 42 }).map((_, i) => (
          <motion.span key={i} className="w-full rounded-full bg-[#C9CCD3]/70" animate={{ height: [8, 10 + ((i * 37) % 40), 8] }} transition={{ duration: 1.6, repeat: Infinity, delay: (i % 7) * 0.12 }} style={{ height: 8 }} />
        ))}
      </div>
      <div className="mt-6 space-y-3">
        {STEPS.map(({ icon: Icon, title, meta }, i) => (
          <motion.div key={title} initial={{ x: 16 }} animate={{ x: 0 }} transition={{ delay: 0.6 + i * 0.25, duration: 0.6 }} className="flex items-center gap-4 rounded-2xl border border-[#C9CCD3]/15 bg-[#0A192F] p-4">
            <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${i === 2 ? "bg-white text-[#0A192F]" : "bg-[#C9CCD3]/15 text-white"}`}><Icon size={17} /></span>
            <div className="min-w-0"><div className="text-sm font-medium text-white">{title}</div><div className="truncate text-xs text-[#C9CCD3]">{meta}</div></div>
          </motion.div>
        ))}
      </div>
    </div>
  </motion.div>
);

export const LandingHero = ({ onBeta }) => (
  <section className="grain relative overflow-hidden" data-testid="landing-hero">
    <div className="relative mx-auto grid max-w-[1280px] grid-cols-1 items-center gap-16 px-5 pb-24 pt-16 lg:grid-cols-[1.25fr_1fr] lg:px-10 lg:pb-36 lg:pt-28">
      <div>
        <motion.div {...rise(0)} className="inline-flex items-center gap-2 rounded-full border border-[#C9CCD3]/25 px-4 py-1.5 text-[11px] uppercase tracking-[0.22em] text-[#C9CCD3]">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Beta sul campo · Pediatria specialistica
        </motion.div>
        <motion.h1 {...rise(0.08)} className="mt-8 font-display text-4xl leading-[1.04] tracking-tight text-white sm:text-5xl lg:text-6xl" data-testid="hero-title">
          Il workspace clinico d'élite per il medico specialista: <span className="italic text-[#C9CCD3]">zero burocrazia, massima precisione.</span>
        </motion.h1>
        <motion.p {...rise(0.16)} className="mt-7 max-w-xl text-base leading-relaxed text-[#C9CCD3] md:text-lg">
          Lei visita, MantMed scrive. La conversazione con il paziente diventa cartella strutturata e referto PDF in circa 30 secondi, con percentili, agenda e cassa nello stesso spazio.
        </motion.p>
        <motion.div {...rise(0.24)} className="mt-10 flex flex-wrap gap-3">
          <button onClick={onBeta} className="flex h-14 items-center gap-2 rounded-full bg-white px-7 text-sm font-semibold text-[#0A192F] transition-transform hover:-translate-y-0.5 active:scale-[0.98]" data-testid="hero-beta-btn">Richiedi accesso beta <ArrowRight size={16} /></button>
          <button onClick={() => scrollTo("vantaggi")} className="flex h-14 items-center gap-2 rounded-full border border-[#C9CCD3]/35 px-7 text-sm font-medium text-white transition-colors hover:border-white" data-testid="hero-discover-btn">Scopri di più <ArrowDown size={16} /></button>
        </motion.div>
        <motion.dl {...rise(0.32)} className="mt-14 grid max-w-lg grid-cols-3 gap-6 border-t border-[#C9CCD3]/15 pt-6">
          {[["~30 s", "per un referto"], ["2", "studi, un'agenda"], ["AES-256", "dati cifrati"]].map(([v, l]) => (
            <div key={l}><dt className="font-display text-3xl text-white">{v}</dt><dd className="mt-1 text-xs text-[#C9CCD3]">{l}</dd></div>
          ))}
        </motion.dl>
      </div>
      <HeroMock />
    </div>
  </section>
);
