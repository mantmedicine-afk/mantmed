() => {
  const parse = (s) => {
    if (!s) return null;
    let m = s.match(/rgba?\(([^)]+)\)/);
    if (m) { const p = m[1].split(/[\s,\/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; }
    m = s.match(/color\(srgb ([^)]+)\)/);
    if (m) { const p = m[1].split(/[\s\/]+/).filter(Boolean).map(Number); return [p[0] * 255, p[1] * 255, p[2] * 255, p.length > 3 ? p[3] : 1]; }
    return null;
  };
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
  const blend = (top, bot) => { const a = top[3]; return [top[0] * a + bot[0] * (1 - a), top[1] * a + bot[1] * (1 - a), top[2] * a + bot[2] * (1 - a), 1]; };
  const SKIP = new Set(["IMG", "VIDEO", "CANVAS", "IFRAME", "SVG", "PATH", "svg", "path", "SCRIPT", "STYLE", "NOSCRIPT"]);
  const tid = (el) => { const t = el.closest("[data-testid]"); return t ? t.getAttribute("data-testid") : el.tagName; };
  const visible = (el) => { const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return false; const cs = getComputedStyle(el); if (cs.visibility === "hidden" || cs.display === "none") return false; let p = el; while (p && p !== document.documentElement) { if (parseFloat(getComputedStyle(p).opacity) < 0.3) return false; p = p.parentElement; } return true; };
  const inBody = (el) => !!el.closest('[data-testid*="bodychart"], [data-testid*="body-canvas"], [data-testid*="silhouette"], .recharts-wrapper');
  const white = [], black = [], navy = [], lowc = [];
  const effBg = (el) => {
    const stack = []; let p = el, img = false;
    while (p) { const cs = getComputedStyle(p); if (cs.backgroundImage && cs.backgroundImage !== "none" && !cs.backgroundImage.includes("radial-gradient(circle")) img = img || /url|gradient/.test(cs.backgroundImage); const c = parse(cs.backgroundColor); if (c && c[3] > 0) { stack.push(c); if (c[3] >= 0.99) break; } p = p.parentElement; }
    let bg = [255, 255, 255, 1]; for (let i = stack.length - 1; i >= 0; i--) bg = blend(stack[i], bg); return { bg, img };
  };
  const all = document.querySelectorAll("body *");
  for (const el of all) {
    if (SKIP.has(el.tagName) || el.closest("svg")) continue;
    if (!visible(el) || inBody(el)) continue;
    const cs = getComputedStyle(el);
    const bgc = parse(cs.backgroundColor);
    if (bgc && bgc[3] > 0.9) {
      const [r, g, b] = bgc.map(Math.round);
      if (r === 255 && g === 255 && b === 255) white.push(tid(el) + "<" + el.tagName.toLowerCase() + ">." + (el.className && el.className.toString ? el.className.toString().slice(0, 60) : ""));
      if (r === 0 && g === 0 && b === 0) black.push(tid(el) + "<" + el.tagName.toLowerCase() + ">");
      if ((r === 10 && g === 25 && b === 47) || (r === 11 && g === 23 && b === 54)) navy.push(tid(el) + "<" + el.tagName.toLowerCase() + ">");
    }
    if (/#0A192F|rgb\(10, 25, 47\)|rgb\(11, 23, 54\)/i.test(cs.backgroundImage)) navy.push("bgimg:" + tid(el));
    if ((el.tagName === "INPUT" && !["checkbox", "radio", "range", "hidden", "file"].includes(el.type)) || el.tagName === "TEXTAREA" || el.tagName === "SELECT") {
      const fgI = parse(cs.color); const { bg: bgI } = effBg(el);
      if (fgI) { const rI = ratio(fgI[3] < 1 ? blend(fgI, bgI) : fgI, bgI); if (rI < 4.45) lowc.push(`INPUT:${tid(el)} ${rI.toFixed(2)} fg=${fgI.slice(0, 3).map(Math.round)} bg=${bgI.slice(0, 3).map(Math.round)}`); }
      const ph = parse(getComputedStyle(el, "::placeholder").color);
      if (ph && el.placeholder) { const rP = ratio(ph[3] < 1 ? blend(ph, bgI) : ph, bgI); if (rP < 3) lowc.push(`PLACEHOLDER:${tid(el)} ${rP.toFixed(2)}`); }
      continue;
    }
    const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 0);
    if (!hasText) continue;
    const fg = parse(cs.color); if (!fg) continue;
    const { bg, img } = effBg(el); if (img) continue;
    const fgc = fg[3] < 1 ? blend(fg, bg) : fg;
    const rt = ratio(fgc, bg);
    const fs = parseFloat(cs.fontSize), fw = parseInt(cs.fontWeight);
    const large = fs >= 24 || (fs >= 18.66 && fw >= 700);
    const need = large ? 3 : 4.5;
    if (rt < need - 0.05) lowc.push(`${tid(el)}<${el.tagName.toLowerCase()}> "${el.textContent.trim().slice(0, 30)}" ${rt.toFixed(2)} fg=${fgc.slice(0, 3).map(Math.round)} bg=${bg.slice(0, 3).map(Math.round)}`);
  }
  const uniq = (a) => [...new Set(a)];
  return { theme: document.documentElement.dataset.theme, white: uniq(white).slice(0, 10), black: uniq(black).slice(0, 5), navy: uniq(navy).slice(0, 6), lowc: uniq(lowc).slice(0, 14), lowcCount: lowc.length };
}
