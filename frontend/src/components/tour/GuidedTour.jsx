import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { TourVideo } from "./TourVideo";
import { isScrollLocked } from "@/lib/scrollLock";
import { ArrowLeft, ArrowRight, Check, Compass, ExternalLink, Sparkles, X } from "lucide-react";

const PAD = 10;
const HEADER = 72;
const GAP = 14;
const M = 12;
const visible = (el) => {
  const r = el?.getBoundingClientRect();
  return !!r && r.width > 0 && r.height > 0 && r.right > 0 && r.left < window.innerWidth;
};
const find = (ids) => ids?.flatMap((id) => [...document.querySelectorAll(id.endsWith("*") ? `[data-testid^="${id.slice(0, -1)}"]` : `[data-testid="${id}"]`)]).find(visible) ?? null;

const useTargetRect = (ids, key, active) => {
  const [rect, setRect] = useState(null);
  const scrolled = useRef("");
  useEffect(() => {
    if (!active) { scrolled.current = ""; return undefined; }
    let raf = 0;
    const tick = () => {
      const el = find(ids);
      if (el && scrolled.current !== key && !isScrollLocked()) {
        scrolled.current = key;
        const b = el.getBoundingClientRect();
        if (b.top < 0 || b.bottom > window.innerHeight) window.scrollTo({ top: Math.max(0, b.top + window.scrollY - HEADER - 16), behavior: "smooth" });
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

/** Posiziona il fumetto accanto all'elemento evidenziato, sempre dentro lo schermo. */
const place = (rect, { h, min }) => {
  const vw = window.innerWidth, vh = window.innerHeight;
  const w = Math.min(440, vw - M * 2);
  const clampX = (x) => Math.min(Math.max(x, M), vw - M - w);
  if (!rect) { const hh = Math.min(h, vh - M * 2); return { width: w, left: (vw - w) / 2, top: (vh - hh) / 2, maxHeight: vh - M * 2 }; }
  const below = vh - rect.bottom - PAD - GAP - M;
  const above = rect.top - PAD - GAP - M;
  const cx = clampX(rect.left + rect.width / 2 - w / 2);
  if (below >= h) return { width: w, left: cx, top: rect.bottom + PAD + GAP, maxHeight: below };
  if (above >= h) return { width: w, left: cx, top: rect.top - PAD - GAP - h, maxHeight: above };
  const right = vw - rect.right - PAD - GAP - M, leftSpace = rect.left - PAD - GAP - M;
  const ty = Math.min(Math.max(rect.top, M), Math.max(M, vh - M - h));
  if (right >= w) return { width: w, left: rect.right + PAD + GAP, top: ty, maxHeight: vh - M * 2 };
  if (leftSpace >= w) return { width: w, left: rect.left - PAD - GAP - w, top: ty, maxHeight: vh - M * 2 };
  if (Math.max(below, above) >= min) {
    if (below >= above) return { width: w, left: cx, top: rect.bottom + PAD + GAP, maxHeight: below };
    return { width: w, left: cx, top: rect.top - PAD - GAP - Math.min(h, above), maxHeight: above };
  }
  const hh = Math.min(h, Math.max(vh * 0.6, min), vh - M * 2);
  return { width: w, left: cx, top: vh - M - hh, maxHeight: hh };
};

const Spotlight = ({ rect }) => {
  if (!rect) return <motion.div key="backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 bg-[var(--scrim)]" data-testid="tour-backdrop" />;
  const top = Math.max(rect.top - PAD, 2);
  const bottom = Math.min(rect.bottom + PAD, window.innerHeight - 2);
  return (
    <motion.div key="spot" initial={{ opacity: 0 }} className="pointer-events-none fixed rounded-[32px] ring-2 ring-[var(--hair)] shadow-[0_0_0_9999px_var(--scrim)]"
      animate={{ opacity: 1, top, left: rect.left - PAD, width: rect.width + PAD * 2, height: Math.max(0, bottom - top) }}
      transition={{ type: "spring", stiffness: 260, damping: 30 }} data-testid="tour-spotlight" />
  );
};

const Btn = ({ primary, children, ...p }) => (
  <button className={`flex h-11 items-center gap-1.5 rounded-full px-4 text-sm transition-[transform,border-color,opacity] disabled:opacity-30 ${primary ? "bg-[var(--raised)] px-5 font-semibold text-[var(--fg)] hover:-translate-y-0.5" : "border border-[var(--hair)] text-[var(--ink)] hover:border-[var(--ink)]"}`} {...p}>{children}</button>
);

const StepBody = ({ step, i, total }) => {
  const [more, setMore] = useState(false);
  return (
  <>
    <div className="mt-4 flex items-start gap-3">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-[var(--hair)] bg-[var(--sel)] text-[var(--fg2)]"><step.icon size={20} /></span>
      <div>
        <div className="font-mono text-xs text-[var(--fg2)]" data-testid="tour-progress">Passo {i + 1} di {total} · {step.kicker}</div>
        <h2 id="tour-title" className="font-display text-2xl leading-tight text-[var(--ink)] sm:text-3xl">{step.title}</h2>
      </div>
    </div>
    <p className="mt-3 text-sm leading-relaxed text-[var(--fg2)]">{step.text}</p>
    <button onClick={() => setMore((v) => !v)} className="mt-2 text-xs text-[var(--fg2)] underline underline-offset-4 sm:hidden" data-testid="tour-more-btn">{more ? "Meno dettagli" : "Più dettagli"}</button>
    <ul className={`mt-3 space-y-2 ${more ? "" : "hidden sm:block"}`}>{step.points.map((p) => <li key={p} className="flex gap-2 text-sm text-[var(--fg2)]"><span className="mt-2 h-1 w-3 shrink-0 rounded-full bg-[var(--hair)]" />{p}</li>)}</ul>
  </>
  );
};

const DoneBody = ({ where }) => (
  <div className="mt-4 text-center" data-testid="tour-done">
    <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[var(--raised)] text-[var(--fg)]"><Check size={24} /></span>
    <h2 id="tour-title" className="mt-4 font-display text-3xl text-[var(--ink)]">Tutto pronto</h2>
    <p className="mt-2 text-sm leading-relaxed text-[var(--fg2)]">Può rivedere questa guida quando vuole da <span className="inline-flex items-center gap-1 text-[var(--ink)]"><Compass size={13} /> Rivedi tour</span> {where}.</p>
  </div>
);

export const GuidedTour = ({ open, steps, name, where = "in Impostazioni", onDone }) => {
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
  const card = useRef(null);
  const [h, setH] = useState({ h: 420, min: 320 });
  useLayoutEffect(() => {
    const el = card.current;
    if (!el) return undefined;
    const measure = () => {
      const inner = el.firstElementChild, body = el.querySelector('[data-testid="tour-body"]');
      if (inner && body) { const fixed = inner.offsetHeight - body.clientHeight; const full = Math.min(body.scrollHeight, parseFloat(getComputedStyle(body).maxHeight) || Infinity); setH((p) => { const n = { h: fixed + full, min: fixed + Math.min(full, 80) }; return p.h === n.h && p.min === n.min ? p : n; }); }
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    const t = setTimeout(measure, 320);
    return () => { ro.disconnect(); clearTimeout(t); };
  }, [open, i, done]);
  const [, setVp] = useState(0);
  useEffect(() => { const f = () => setVp((n) => n + 1); window.addEventListener("resize", f); return () => window.removeEventListener("resize", f); }, []);
  if (!open) return null;
  const pos = place(done ? null : rect, h);
  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-labelledby="tour-title" data-testid="onboarding-tour">
      <Spotlight rect={done ? null : rect} />
      <div ref={card} className="fixed flex flex-col overflow-hidden rounded-[28px] transition-[top,left] duration-300 ease-out" style={pos} data-testid="tour-card">
        <AnimatePresence mode="wait">
          <motion.div key={i} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}
            className="theme-bar grain relative flex max-h-full min-h-0 flex-col [&>*:not([data-testid=tour-body])]:shrink-0 rounded-[28px] border border-[var(--hair)] p-5 text-[var(--ink)] shadow-[var(--shadow)] sm:p-6" data-testid={done ? "tour-step-done" : `tour-step-${i + 1}`}>
            <div className="flex items-center justify-between">
              <span className="flex min-w-0 items-center gap-2 truncate text-[11px] uppercase tracking-[0.22em] text-[var(--fg2)]"><Sparkles size={13} className="shrink-0" /> <span className="truncate">{i === 0 ? `Benvenuto${name ? `, ${name}` : ""}` : "Guida MantMed"}</span></span>
              {!done && <button onClick={onDone} className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-1 text-xs text-[var(--fg2)] transition-colors hover:text-[var(--ink)]" data-testid="tour-skip-btn"><X size={13} /> Salta il tour</button>}
            </div>
            {!done && <TourVideo id={step.video} title={step.title} />}
            <div className="max-h-[30vh] min-h-0 flex-1 overflow-y-auto overscroll-contain sm:max-h-[34vh]" data-testid="tour-body">{done ? <DoneBody where={where} /> : <StepBody step={step} i={i} total={steps.length} />}</div>
            {!done && step.extra && <button onClick={() => go(step.extra.to)} className="mt-3 inline-flex items-center gap-1.5 text-sm text-[var(--fg2)] underline underline-offset-4 hover:text-[var(--ink)]" data-testid="tour-extra-link"><ExternalLink size={13} /> {step.extra.label}</button>}
            <div className="mt-5 flex gap-1.5" aria-hidden="true">
              {steps.map((s, k) => <button key={s.title} tabIndex={-1} onClick={() => setI(k)} className={`h-1.5 flex-1 rounded-full transition-colors ${k <= i ? "bg-[var(--raised)]" : "bg-[var(--sel)]"}`} data-testid={`tour-dot-${k + 1}`} />)}
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
