import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";

const MEGA_W = 880;
const LIST_W = 300;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(v, hi));

const position = (el, mega, place) => {
  const r = el.getBoundingClientRect();
  const w = Math.min(mega ? MEGA_W : LIST_W, window.innerWidth - 24);
  const left = clamp(mega ? r.left + r.width / 2 - w / 2 : r.left, 12, window.innerWidth - w - 12);
  return place === "up" ? { left, width: w, bottom: window.innerHeight - r.top + 8 } : { left, width: w, top: r.bottom + 8 };
};

// Menu a comparsa: hover (150 ms apre, 300 ms chiude), tocco (1° apre, 2° naviga), tastiera (Invio/↓ apre, Esc chiude)
export const useNavMenu = (it, place = "down") => {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const trigger = useRef(null);
  const panel = useRef(null);
  const timer = useRef(null);
  const pointer = useRef("mouse");
  const focusFirst = useRef(false);
  const clicked = useRef(false);
  const loc = useLocation();
  const has = Boolean(it.menu?.length);

  const show = () => { if (clicked.current || !trigger.current) return; setPos(position(trigger.current, it.mega, place)); setOpen(true); };
  const hide = () => setOpen(false);
  const later = (fn, ms) => { clearTimeout(timer.current); timer.current = setTimeout(fn, ms); };
  const cancel = () => clearTimeout(timer.current);

  useEffect(() => { setOpen(false); }, [loc.pathname, loc.search, loc.hash]);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!open) return undefined;
    if (focusFirst.current) { focusFirst.current = false; requestAnimationFrame(() => panel.current?.querySelector("a")?.focus()); }
    const outside = (e) => { if (!trigger.current?.contains(e.target) && !panel.current?.contains(e.target)) hide(); };
    const esc = (e) => { if (e.key === "Escape") { hide(); trigger.current?.focus(); } };
    const away = () => hide();
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", esc);
    window.addEventListener("scroll", away, { passive: true });
    window.addEventListener("resize", away);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", esc); window.removeEventListener("scroll", away); window.removeEventListener("resize", away); };
  }, [open]);

  if (!has) return { open: false, triggerProps: {}, panel: null };

  const triggerProps = {
    ref: trigger,
    "aria-haspopup": "menu",
    "aria-expanded": open,
    onPointerDown: (e) => { pointer.current = e.pointerType; },
    onPointerEnter: (e) => { if (e.pointerType === "mouse") { clicked.current = false; later(show, 150); } },
    onPointerLeave: (e) => { if (e.pointerType === "mouse") { clicked.current = false; later(hide, 300); } },
    onClick: (e) => {
      if (pointer.current !== "mouse" && !open) { e.preventDefault(); show(); return; }
      if (pointer.current === "mouse") { clicked.current = true; cancel(); hide(); }
    },
    onKeyDown: (e) => {
      if ((e.key === "Enter" && !open) || e.key === "ArrowDown") { e.preventDefault(); clicked.current = false; focusFirst.current = true; if (open) panel.current?.querySelector("a")?.focus(); else show(); }
    },
  };

  const panelEl = createPortal(
    <AnimatePresence>
      {open && pos && (
        <motion.div ref={panel} role="menu" aria-label={it.label} style={pos}
          onPointerEnter={(e) => e.pointerType === "mouse" && cancel()} onPointerLeave={(e) => e.pointerType === "mouse" && later(hide, 300)}
          onKeyDown={(e) => {
            const links = [...panel.current.querySelectorAll("a")];
            const i = links.indexOf(document.activeElement);
            if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); links[(i + (e.key === "ArrowDown" ? 1 : -1) + links.length) % links.length]?.focus(); }
          }}
          initial={{ opacity: 0, y: place === "up" ? 6 : -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: place === "up" ? 6 : -6 }} transition={{ duration: 0.18, ease: "easeOut" }}
          className="fixed z-[70] max-h-[min(75vh,640px)] overflow-y-auto rounded-2xl bg-[var(--surface)] p-3 text-[var(--fg)] shadow-[0_24px_60px_-18px_var(--scrim)]" data-testid={`navmenu-${it.id}`}>
          <div className={it.mega ? "gap-2 sm:columns-2 md:columns-3" : ""}>
            {it.menu.map((g, gi) => (
              <div key={g.title ?? gi} className="mb-2 break-inside-avoid">
                {g.title && <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--fg2)]">{g.title}</div>}
                {g.links.map((l) => (
                  <Link key={l.id} to={l.to} role="menuitem" onClick={hide}
                    className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-[var(--sel)] focus-visible:bg-[var(--sel)] focus-visible:outline-none" data-testid={`navmenu-link-${it.id}-${l.id}`}>
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--sel)]"><l.icon size={16} /></span>
                    <span className="min-w-0"><span className="block truncate text-sm font-semibold">{l.label}</span>{l.desc && <span className="block truncate text-xs text-[var(--fg2)]">{l.desc}</span>}</span>
                  </Link>
                ))}
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
  return { open, triggerProps, panel: panelEl };
};
