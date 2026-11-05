import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { LogoMark } from "@/components/dash/Logo";

export const scrollTo = (id) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
const rise = (d = 0) => ({ initial: { y: 18 }, animate: { y: 0 }, transition: { delay: d, duration: 0.8, ease: [0.22, 1, 0.36, 1] } });

export const LandingHeader = () => (
  <header className="theme-bar sticky top-0 z-50 border-b border-[var(--hair)]">
    <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-4 px-5 py-4 lg:px-10">
      <a href="/" className="flex items-center gap-3" data-testid="landing-logo">
        <LogoMark size={38} light />
        <div className="leading-none">
          <div className="font-display text-[26px] tracking-tight text-[var(--ink)]">MantMed</div>
          <div className="mt-1 hidden text-[10px] uppercase tracking-[0.24em] text-[var(--fg2)] sm:block">Precisione clinica · tempo per il paziente</div>
        </div>
      </a>
      <nav className="flex items-center gap-2">
        <button onClick={() => scrollTo("come-funziona")} className="hidden h-10 px-4 text-sm text-[var(--fg2)] transition-colors hover:text-[var(--ink)] md:block" data-testid="nav-how">Come funziona</button>
        <button onClick={() => scrollTo("sicurezza")} className="hidden h-10 px-4 text-sm text-[var(--fg2)] transition-colors hover:text-[var(--ink)] md:block" data-testid="nav-security">Sicurezza</button>
        <button onClick={() => scrollTo("contatti")} className="hidden h-10 px-4 text-sm text-[var(--fg2)] transition-colors hover:text-[var(--ink)] md:block" data-testid="nav-contact">Contatti</button>
        <Link to="/portale" className="hidden h-10 items-center px-3 text-sm text-[var(--fg2)] transition-colors hover:text-[var(--ink)] sm:flex" data-testid="landing-portal-link">Area pazienti</Link>
        <ThemeToggle />
        <Link to="/app" className="flex h-10 items-center gap-2 rounded-full border border-[var(--hair)] px-5 text-sm font-medium text-[var(--ink)] transition-colors hover:border-[var(--ink)] hover:bg-[var(--surface)] hover:text-[var(--fg)]" data-testid="landing-login-btn">Accedi <ArrowRight size={15} /></Link>
      </nav>
    </div>
  </header>
);

const AMBER = "#E8A33D";

const TabletShot = () => (
  <motion.div {...rise(0.3)} className="relative mx-auto w-full max-w-[640px] lg:max-w-none" data-testid="hero-tablet">
    <div className="absolute -inset-8 rounded-[48px] bg-[var(--sel)] opacity-70 blur-3xl" aria-hidden="true" />
    <div className="relative rotate-[-2.5deg] rounded-[34px] bg-[#0f1418] p-3 shadow-[0_40px_80px_-30px_rgba(10,20,30,0.55),0_18px_36px_-18px_rgba(10,20,30,0.35)] ring-1 ring-black/40 transition-transform duration-700 hover:rotate-[-1deg] sm:p-4">
      <span className="absolute left-1/2 top-[7px] h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-white/20 sm:top-[9px]" aria-hidden="true" />
      <picture>
        <source media="(max-width: 639px)" srcSet="/img/cartella-clinica-mobile.jpg" width="732" height="720" />
        <img src="/img/cartella-clinica.jpg" alt="Schermata della cartella clinica di MantMed con dati di esempio: esame obiettivo compilato" className="block aspect-[732/720] w-full rounded-[22px] object-cover object-top sm:aspect-[1180/820]" width="1180" height="820" loading="eager" data-testid="hero-screenshot" />
      </picture>
    </div>
  </motion.div>
);

export const LandingHero = ({ onBeta }) => (
  <section className="grain relative overflow-hidden" data-testid="landing-hero">
    <div className="relative mx-auto grid max-w-[1280px] grid-cols-1 items-center gap-14 px-5 pb-20 pt-14 lg:grid-cols-[1fr_1.15fr] lg:gap-16 lg:px-10 lg:pb-32 lg:pt-24">
      <div>
        <motion.h1 {...rise(0.05)} className="font-display text-[38px] leading-[1.04] tracking-tight text-[var(--ink)] sm:text-6xl lg:text-7xl" data-testid="hero-title">
          Lei visita. <span className="whitespace-nowrap italic">MantMed scrive.</span>
        </motion.h1>
        <motion.p {...rise(0.12)} className="mt-6 max-w-xl text-base leading-relaxed text-[var(--fg2)] md:text-lg" data-testid="hero-subtitle">
          La conversazione con il paziente diventa cartella clinica e referto PDF in circa 30 secondi. Lei rilegge, corregge e firma.
        </motion.p>
        <motion.div {...rise(0.2)} className="mt-9">
          <button onClick={onBeta} style={{ backgroundColor: AMBER }} className="flex h-14 items-center gap-2 rounded-full px-7 text-sm font-semibold text-[#1F1606] shadow-[0_10px_24px_-12px_rgba(232,163,61,0.8)] transition-[transform,filter] hover:-translate-y-0.5 hover:brightness-105 active:scale-[0.98]" data-testid="hero-beta-btn">Richiedi accesso beta <ArrowRight size={16} /></button>
          <p className="mt-4 text-xs text-[var(--fg2)]" data-testid="hero-trust-line">Dati cifrati e conservati in UE · Verifica iscrizione all'Ordine</p>
        </motion.div>
      </div>
      <TabletShot />
    </div>
  </section>
);
