import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { Fragment, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { AlertTriangle, ArrowLeft, ShieldCheck } from "lucide-react";
import { LogoMark } from "@/components/dash/Logo";
import { api } from "@/lib/api";
import { PROVIDERS, SECTIONS, UPDATED } from "@/components/privacy/content";

const Fill = ({ text }) => text.split(/(\{\{[^}]+\}\})/).map((part, i) => (part.startsWith("{{")
  ? <mark key={i} className="rounded bg-[var(--sel)] px-1 text-[var(--fg)]" data-testid="privacy-placeholder">[da completare: {part.slice(2, -2)}]</mark>
  : <Fragment key={i}>{part}</Fragment>));

const AdminNotice = () => {
  const [admin, setAdmin] = useState(false);
  useEffect(() => { api.me().then((u) => setAdmin(u?.role === "admin")).catch(() => {}); }, []);
  if (!admin) return null;
  return (
    <div className="mt-8 flex gap-3 rounded-2xl border border-[var(--hair)] bg-[var(--sel)] p-4 text-sm text-[var(--fg)]" role="note" data-testid="privacy-admin-draft-notice">
      <AlertTriangle size={18} className="mt-0.5 shrink-0" />
      <p><strong>Bozza da validare con il suo consulente privacy / DPO.</strong> Visibile solo agli amministratori. Completi i campi evidenziati e verifichi con i fornitori gli accordi di trattamento (DPA), le garanzie per i trasferimenti e l'esclusione dei dati dall'addestramento dei modelli.</p>
    </div>
  );
};

const Providers = () => (
  <section id="fornitori" className="scroll-mt-24" data-testid="privacy-providers">
    <h2 className="font-display text-3xl text-[var(--fg)]">Fornitori e sub-responsabili</h2>
    <p className="mt-2 text-sm text-[var(--fg2)]">Servizi esterni che trattano dati per conto di MantMed, vincolati da accordi ai sensi dell'art. 28 GDPR.</p>
    <div className="mt-5 grid gap-3">
      {PROVIDERS.map(([name, purpose, data, transfer]) => (
        <article key={name} className="grid gap-3 rounded-2xl border border-[var(--hair)] bg-[var(--surface)] p-5 md:grid-cols-[160px_1fr_1fr]" data-testid={`privacy-provider-${name.toLowerCase()}`}>
          <div className="font-display text-2xl text-[var(--fg)]">{name}</div>
          <div><div className="text-[11px] uppercase tracking-[0.18em] text-[var(--fg2)]">Finalità</div><p className="mt-1 text-sm text-[var(--fg2)]">{purpose}</p></div>
          <div><div className="text-[11px] uppercase tracking-[0.18em] text-[var(--fg2)]">Dati e trasferimento</div><p className="mt-1 text-sm text-[var(--fg2)]">{data}</p><p className="mt-1 text-xs text-[var(--fg2)]">{transfer}</p></div>
        </article>
      ))}
    </div>
  </section>
);

export default function Privacy() {
  useEffect(() => { document.title = "Informativa privacy · MantMed"; const el = window.location.hash && document.getElementById(window.location.hash.slice(1));
    setTimeout(() => (el ? el.scrollIntoView({ behavior: "smooth" }) : window.scrollTo(0, 0)), 100); }, []);
  return (
    <div className="min-h-screen bg-[var(--raised)]" data-testid="privacy-page"><ThemeToggle floating />
      <header className="grain theme-page bg-[var(--bg)] text-[var(--ink)]">
        <div className="mx-auto max-w-5xl px-5 pb-14 pt-8 lg:px-8">
          <div className="flex items-center justify-between">
            <Link to="/" className="flex items-center gap-3" data-testid="privacy-home-link"><LogoMark size={32} light /><span className="font-display text-2xl">MantMed</span></Link>
            <button onClick={() => (window.history.length > 1 ? window.history.back() : (window.location.href = "/"))} className="flex items-center gap-1.5 text-sm text-[var(--fg2)] hover:text-[var(--ink)]" data-testid="privacy-back-btn"><ArrowLeft size={15} /> Indietro</button>
          </div>
          <div className="mt-12 flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-[var(--fg2)]"><ShieldCheck size={14} /> Artt. 13–14 Reg. UE 2016/679</div>
          <h1 className="mt-2 font-display text-4xl leading-tight sm:text-5xl lg:text-6xl">Informativa privacy <span className="italic text-[var(--fg2)]">e uso dell'AI.</span></h1>
          <p className="mt-4 max-w-2xl text-base text-[var(--fg2)] md:text-lg">Come MantMed e MantAI trattano i dati di medici, famiglie e pazienti. Ultimo aggiornamento: {UPDATED}.</p>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-5 pb-20 lg:px-8">
        <AdminNotice />
        <nav className="mt-8 flex flex-wrap gap-2" aria-label="Indice" data-testid="privacy-toc">
          {[...SECTIONS.slice(0, 4), ["fornitori", "Fornitori"], ...SECTIONS.slice(4)].map(([id, t]) => (
            <a key={id} href={`#${id}`} className="rounded-full border border-[var(--hair)] bg-[var(--surface)] px-4 py-2 text-sm text-[var(--fg2)] transition-colors hover:border-[var(--accent)] hover:text-[var(--fg)]" data-testid={`privacy-toc-${id}`}>{t}</a>
          ))}
        </nav>
        <div className="mt-10 space-y-12">
          {SECTIONS.map(([id, title, paras], i) => (
            <Fragment key={id}>
              <motion.section id={id} initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="scroll-mt-24" data-testid={`privacy-section-${id}`}>
                <h2 className="font-display text-3xl text-[var(--fg)]">{title}</h2>
                <div className="mt-3 max-w-3xl space-y-3 text-base leading-relaxed text-[var(--fg2)]">{paras.map((p) => <p key={p}><Fill text={p} /></p>)}</div>
              </motion.section>
              {i === 3 && <Providers />}
            </Fragment>
          ))}
        </div>
      </main>
    </div>
  );
}
