import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, CalendarDays, Mic, Wallet, X, Sparkles } from "lucide-react";

const STEPS = [
  {
    target: "agenda-panel", icon: CalendarDays, title: "Gestione Agenda e Sedi",
    text: "Qui trova gli appuntamenti del giorno divisi per sede: scelga lo studio dalle schede in alto per vedere solo le sue visite.",
    points: ["Il pulsante + aggiunge un appuntamento nella sede selezionata", "Tocchi una visita per modificarla, cambiarne lo stato o annullarla", "Le visite prenotate e pagate dal Portale Paziente compaiono qui con il segno \"Pagato online\""],
  },
  {
    target: "consult-hub", icon: Mic, title: "Trascrizione Ambientale AI",
    text: "Avvii la visita da \"Avvia Consultazione\": scelga il paziente e attivi la registrazione mentre parla con la famiglia.",
    points: ["L'AI trascrive il colloquio e compila Anamnesi, Esame Obiettivo e Parametri di Crescita", "I percentili OMS vengono calcolati in automatico da peso, altezza e circonferenza cranica", "Lei rivede e corregge ogni campo prima di generare il referto PDF"],
  },
  {
    target: "cash-register", icon: Wallet, title: "Cassa e Dati per il Commercialista",
    text: "Il Registro Cassa riunisce gli incassi in studio (contanti, POS, bonifico) e i pagamenti online del portale, con i rimborsi.",
    points: ["\"Esporta per il commercialista\" scarica il CSV della giornata scelta", "\"Esporta mese\" scarica il report mensile con riepilogo per metodo di pagamento", "Per ogni pagamento online trova la ricevuta sanitaria PDF già pronta"],
  },
];
const PAD = 10;
const HEADER = 76;

const useTargetRect = (id, active) => {
  const [rect, setRect] = useState(null);
  const measure = useCallback(() => {
    const el = document.querySelector(`[data-testid="${id}"]`);
    setRect(el ? el.getBoundingClientRect() : null);
  }, [id]);
  useLayoutEffect(() => {
    if (!active) return undefined;
    const el = document.querySelector(`[data-testid="${id}"]`);
    if (el) window.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top + window.scrollY - HEADER - 16), behavior: "smooth" });
    measure();
    let raf = 0;
    const tick = () => { measure(); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [id, active, measure]);
  return rect;
};

const Spotlight = ({ rect }) => {
  if (!rect) return <div className="fixed inset-0 bg-[#0A192F]/80" />;
  const top = Math.max(rect.top - PAD, HEADER - PAD);
  const bottom = Math.min(rect.bottom + PAD, window.innerHeight - 8);
  return (
    <motion.div
      className="pointer-events-none fixed rounded-[32px] ring-2 ring-[#C9CCD3] shadow-[0_0_0_9999px_rgba(10,25,47,0.78)]"
      animate={{ top, left: rect.left - PAD, width: rect.width + PAD * 2, height: Math.max(0, bottom - top) }}
      transition={{ type: "spring", stiffness: 260, damping: 30 }}
      data-testid="tour-spotlight"
    />
  );
};

export const OnboardingTour = ({ open, name, onDone }) => {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (open) setI(0);
    return undefined;
  }, [open]);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") onDone(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onDone]);
  const step = STEPS[i];
  const rect = useTargetRect(step.target, open);
  if (!open) return null;
  const last = i === STEPS.length - 1;
  const Icon = step.icon;
  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-labelledby="tour-title" data-testid="onboarding-tour">
      <Spotlight rect={rect} />
      <div className="fixed inset-x-3 bottom-3 sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-[420px]">
        <motion.div key={i} initial={{ opacity: 0.4, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
          className="grain relative rounded-[28px] border border-[#C9CCD3]/30 bg-[#0A192F] p-5 text-white shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)] sm:p-6"
          data-testid={`tour-step-${i + 1}`}>
          <div className="relative flex items-center justify-between">
            <span className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-[#C9CCD3]"><Sparkles size={13} /> {i === 0 ? `Benvenuto${name ? `, ${name}` : ""}` : "Guida MantMed"}</span>
            <button onClick={onDone} className="flex items-center gap-1 rounded-full px-2 py-1 text-xs text-[#C9CCD3] transition-colors hover:text-white" data-testid="tour-skip-btn"><X size={13} /> Salta Tour</button>
          </div>
          <div className="relative max-h-[30vh] overflow-y-auto sm:max-h-none" data-testid="tour-body">
          <div className="relative mt-4 flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-[#C9CCD3]/40 bg-white/5 text-[#E5E4E2]"><Icon size={20} /></span>
            <div>
              <div className="font-mono text-xs text-[#C9CCD3]" data-testid="tour-progress">Passo {i + 1} di {STEPS.length}</div>
              <h2 id="tour-title" className="font-display text-2xl leading-tight text-white sm:text-3xl">{step.title}</h2>
            </div>
          </div>
          <p className="relative mt-3 text-sm leading-relaxed text-slate-200">{step.text}</p>
          <ul className="relative mt-3 space-y-2">
            {step.points.map((p) => <li key={p} className="flex gap-2 text-sm text-slate-300"><span className="mt-2 h-1 w-3 shrink-0 rounded-full bg-[#C9CCD3]" />{p}</li>)}
          </ul>
          </div>
          <div className="relative mt-5 flex gap-1.5" aria-hidden="true">
            {STEPS.map((s, k) => <span key={s.target} className={`h-1 flex-1 rounded-full transition-colors ${k <= i ? "bg-[#E5E4E2]" : "bg-white/15"}`} />)}
          </div>
          <div className="relative mt-5 flex items-center justify-between gap-2">
            <button onClick={() => setI((n) => n - 1)} disabled={i === 0} className="flex h-11 items-center gap-1.5 rounded-full border border-[#C9CCD3]/40 px-4 text-sm text-white transition-colors hover:border-white disabled:opacity-30" data-testid="tour-back-btn"><ArrowLeft size={15} /> Indietro</button>
            {last ? (
              <button onClick={onDone} className="flex h-11 items-center gap-1.5 rounded-full bg-[#E5E4E2] px-5 text-sm font-semibold text-[#0A192F] transition-transform hover:-translate-y-0.5" data-testid="tour-finish-btn">Inizia a usare MantMed <ArrowRight size={15} /></button>
            ) : (
              <button onClick={() => setI((n) => n + 1)} className="flex h-11 items-center gap-1.5 rounded-full bg-[#E5E4E2] px-5 text-sm font-semibold text-[#0A192F] transition-transform hover:-translate-y-0.5" data-testid="tour-next-btn">Avanti <ArrowRight size={15} /></button>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
};
