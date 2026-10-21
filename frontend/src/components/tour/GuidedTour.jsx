import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { TourVideo } from "./TourVideo";
import { ArrowLeft, ArrowRight, Check, Compass, ExternalLink, Sparkles, X } from "lucide-react";

const PAD = 10;
const HEADER = 72;
const find = (ids) => ids?.map((id) => document.querySelector(id.endsWith("*") ? `[data-testid^="${id.slice(0, -1)}"]` : `[data-testid="${id}"]`)).find(Boolean) ?? null;

const useTargetRect = (ids, key, active) => {
  const [rect, setRect] = useState(null);
  const scrolled = useRef("");
  useEffect(() => {
    if (!active) return undefined;
    let raf = 0;
    const tick = () => {
      const el = find(ids);
      if (el && scrolled.current !== key) {
        scrolled.current = key;
        window.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top + window.scrollY - HEADER - 16), behavior: "smooth" });
      }
      const r = el?.getBoundingClientRect();
      setRect((p) => (!r ? null : p && p.top === r.top && p.left === r.left && p.width === r.width && p.height === r.height ? p : r));
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [ids, key, active]);
  return rect;
};

const Spotlight = ({ rect }) => {
  if (!rect) return <motion.div key="backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 bg-[#0A192F]/80" data-testid="tour-backdrop" />;
  const top = Math.max(rect.top - PAD, HEADER - PAD);
  const bottom = Math.min(rect.bottom + PAD, window.innerHeight - 8);
  return (
    <motion.div key="spot" initial={{ opacity: 0 }} className="pointer-events-none fixed rounded-[32px] ring-2 ring-[#C9CCD3] shadow-[0_0_0_9999px_rgba(10,25,47,0.78)]"
      animate={{ opacity: 1, top, left: rect.left - PAD, width: rect.width + PAD * 2, height: Math.max(0, bottom - top) }}
      transition={{ type: "spring", stiffness: 260, damping: 30 }} data-testid="tour-spotlight" />
  );
};

const Btn = ({ primary, children, ...p }) => (
  <button className={`flex h-11 items-center gap-1.5 rounded-full px-4 text-sm transition-[transform,border-color,opacity] disabled:opacity-30 ${primary ? "bg-[#E5E4E2] px-5 font-semibold text-[#0A192F] hover:-translate-y-0.5" : "border border-[#C9CCD3]/40 text-white hover:border-white"}`} {...p}>{children}</button>
);

const StepBody = ({ step, i, total }) => {
  const [more, setMore] = useState(false);
  return (
  <>
    <div className="mt-4 flex items-start gap-3">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-[#C9CCD3]/40 bg-white/5 text-[#E5E4E2]"><step.icon size={20} /></span>
      <div>
        <div className="font-mono text-xs text-[#C9CCD3]" data-testid="tour-progress">Passo {i + 1} di {total} · {step.kicker}</div>
        <h2 id="tour-title" className="font-display text-2xl leading-tight text-white sm:text-3xl">{step.title}</h2>
      </div>
    </div>
    <p className="mt-3 text-sm leading-relaxed text-slate-200">{step.text}</p>
    <button onClick={() => setMore((v) => !v)} className="mt-2 text-xs text-[#C9CCD3] underline underline-offset-4 sm:hidden" data-testid="tour-more-btn">{more ? "Meno dettagli" : "Più dettagli"}</button>
    <ul className={`mt-3 space-y-2 ${more ? "" : "hidden sm:block"}`}>{step.points.map((p) => <li key={p} className="flex gap-2 text-sm text-slate-300"><span className="mt-2 h-1 w-3 shrink-0 rounded-full bg-[#C9CCD3]" />{p}</li>)}</ul>
  </>
  );
};

const DoneBody = ({ where }) => (
  <div className="mt-4 text-center" data-testid="tour-done">
    <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[#E5E4E2] text-[#0A192F]"><Check size={24} /></span>
    <h2 id="tour-title" className="mt-4 font-display text-3xl text-white">Tutto pronto</h2>
    <p className="mt-2 text-sm leading-relaxed text-slate-300">Può rivedere questa guida quando vuole da <span className="inline-flex items-center gap-1 text-white"><Compass size={13} /> Rivedi tour</span> in {where}.</p>
  </div>
);

export const GuidedTour = ({ open, steps, name, where = "Impostazioni", onDone }) => {
  const [i, setI] = useState(0);
  const nav = useNavigate();
  const loc = useLocation();
  const done = i === steps.length;
  const step = steps[Math.min(i, steps.length - 1)];
  useEffect(() => { if (open) { setI(0); toast.dismiss(); } }, [open]);
  const go = useCallback((to) => { if (to && `${loc.pathname}${loc.search}` !== to) nav(to); }, [loc.pathname, loc.search, nav]);
  useEffect(() => { if (open && !done) go(step.to); }, [open, i]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (document.querySelector('[data-testid="tour-video-fullscreen"]')) return;
      if (e.key === "Escape") onDone();
      if (e.key === "ArrowRight") setI((n) => Math.min(n + 1, steps.length));
      if (e.key === "ArrowLeft") setI((n) => Math.max(n - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onDone, steps.length]);
  const rect = useTargetRect(done ? null : step.targets, `${i}`, open);
  if (!open) return null;
  const left = rect && !done && rect.left + rect.width / 2 > window.innerWidth / 2 && rect.width < window.innerWidth * 0.6;
  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-labelledby="tour-title" data-testid="onboarding-tour">
      <Spotlight rect={done ? null : rect} />
      <div className={`fixed inset-x-3 bottom-3 sm:inset-x-auto sm:bottom-6 sm:w-[440px] ${left ? "sm:left-6" : "sm:right-6"} ${done ? "sm:left-1/2 sm:right-auto sm:top-1/2 sm:bottom-auto sm:-translate-x-1/2 sm:-translate-y-1/2" : ""}`}>
        <AnimatePresence mode="wait">
          <motion.div key={i} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}
            className="grain relative rounded-[28px] border border-[#C9CCD3]/30 bg-[#0A192F] p-5 text-white shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)] sm:p-6" data-testid={done ? "tour-step-done" : `tour-step-${i + 1}`}>
            <div className="flex items-center justify-between">
              <span className="flex min-w-0 items-center gap-2 truncate text-[11px] uppercase tracking-[0.22em] text-[#C9CCD3]"><Sparkles size={13} className="shrink-0" /> <span className="truncate">{i === 0 ? `Benvenuto${name ? `, ${name}` : ""}` : "Guida MantMed"}</span></span>
              {!done && <button onClick={onDone} className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-1 text-xs text-[#C9CCD3] transition-colors hover:text-white" data-testid="tour-skip-btn"><X size={13} /> Salta il tour</button>}
            </div>
            {!done && <TourVideo id={step.video} title={step.title} />}
            <div className="max-h-[30vh] overflow-y-auto sm:max-h-[34vh]" data-testid="tour-body">{done ? <DoneBody where={where} /> : <StepBody step={step} i={i} total={steps.length} />}</div>
            {!done && step.extra && <button onClick={() => go(step.extra.to)} className="mt-3 inline-flex items-center gap-1.5 text-sm text-[#C9CCD3] underline underline-offset-4 hover:text-white" data-testid="tour-extra-link"><ExternalLink size={13} /> {step.extra.label}</button>}
            <div className="mt-5 flex gap-1.5" aria-hidden="true">
              {steps.map((s, k) => <button key={s.title} tabIndex={-1} onClick={() => setI(k)} className={`h-1.5 flex-1 rounded-full transition-colors ${k <= i ? "bg-[#E5E4E2]" : "bg-white/15"}`} data-testid={`tour-dot-${k + 1}`} />)}
            </div>
            <div className="mt-5 flex items-center justify-between gap-2">
              <Btn onClick={() => setI((n) => n - 1)} disabled={i === 0} data-testid="tour-back-btn"><ArrowLeft size={15} /> Indietro</Btn>
              {done ? <Btn primary onClick={onDone} data-testid="tour-finish-btn">Inizia a usare MantMed <ArrowRight size={15} /></Btn>
                : <Btn primary onClick={() => setI((n) => n + 1)} data-testid="tour-next-btn">{i === steps.length - 1 ? "Concludi" : "Avanti"} <ArrowRight size={15} /></Btn>}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};
