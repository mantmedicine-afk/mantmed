import { useEffect } from "react";

// Blocco dello scorrimento della pagina condiviso da tutte le finestre sovrapposte (conteggio per finestre annidate).
let count = 0;
let saved = null;
let lenis = null;
let startY = 0;
let startX = 0;

export const setLenis = (l) => { lenis = l; };
export const isScrollLocked = () => count > 0;

// C'è un contenitore (fra gli antenati del tocco) che può ancora scorrere in questa direzione?
const canScroll = (el, dy) => {
  for (let n = el; n && n !== document.body; n = n.parentElement) {
    if (!/(auto|scroll)/.test(getComputedStyle(n).overflowY) || n.scrollHeight <= n.clientHeight + 1) continue;
    if (dy > 0 ? n.scrollTop > 0 : n.scrollTop + n.clientHeight < n.scrollHeight - 1) return true;
  }
  return false;
};

const onTouchStart = (e) => { startY = e.touches[0]?.clientY ?? 0; startX = e.touches[0]?.clientX ?? 0; };
const onTouchMove = (e) => {
  if (e.touches.length > 1 || !e.cancelable) return;
  const dy = (e.touches[0]?.clientY ?? 0) - startY;
  const dx = (e.touches[0]?.clientX ?? 0) - startX;
  startY += dy; startX += dx;
  if (Math.abs(dx) > Math.abs(dy) || dy === 0) return;  // scorrimenti orizzontali liberi
  if (!canScroll(e.target, dy)) e.preventDefault();
};

export const lockScroll = () => {
  if (count++ > 0) return;
  const y = window.scrollY;
  const { documentElement: html, body } = document;
  saved = { y, html: html.style.cssText, body: body.style.cssText };
  Object.assign(html.style, { overflow: "hidden", overscrollBehavior: "none" });
  Object.assign(body.style, { overflow: "hidden", overscrollBehavior: "none", position: "fixed", top: `-${y}px`, left: "0", right: "0", width: "100%" });
  document.addEventListener("touchstart", onTouchStart, { passive: true });
  document.addEventListener("touchmove", onTouchMove, { passive: false });
  lenis?.stop();
};

export const unlockScroll = () => {
  if (count === 0 || --count > 0) return;
  const { documentElement: html, body } = document;
  html.style.cssText = saved.html;
  body.style.cssText = saved.body;
  document.removeEventListener("touchstart", onTouchStart);
  document.removeEventListener("touchmove", onTouchMove);
  window.scrollTo(0, saved.y);
  lenis?.start();
  lenis?.resize();
  lenis?.scrollTo(saved.y, { immediate: true, force: true });
  saved = null;
};

/** Da usare in ogni finestra sovrapposta: blocca la pagina sotto finché la finestra è montata/aperta. */
export const useScrollLock = (active = true) => {
  useEffect(() => {
    if (!active) return undefined;
    lockScroll();
    return unlockScroll;
  }, [active]);
};

/** Classi per il contenitore che scorre dentro una finestra. */
export const SCROLL_BOX = "overflow-y-auto overscroll-contain";

/** Versione componente: montato dentro il contenuto di una finestra aperta. */
export const ScrollLock = () => { useScrollLock(); return null; };
