export const VB_W = 200;
export const VB_H = 460;

export const CATS = [
  { id: "lesione", label: "Trauma / Lesione", color: "#DC2626", group: "Rosso" },
  { id: "trauma", label: "Contusione / Ecchimosi", color: "#991B1B", group: "Rosso scuro" },
  { id: "nevo", label: "Nevo / Macchia", color: "#2563EB", group: "Blu" },
  { id: "eruzione", label: "Dermatite / Eruzione", color: "#EA580C", group: "Arancione" },
  { id: "dolore", label: "Dolore", color: "#7C3AED", group: "Viola" },
  { id: "controllo", label: "Controllo", color: "#16A34A", group: "Verde" },
];
export const CAT = Object.fromEntries(CATS.map((c) => [c.id, c]));

export const VIEWS = [
  { id: "front", label: "Frontale", group: "body" },
  { id: "back", label: "Posteriore", group: "body" },
  { id: "left", label: "Lat. sinistra", group: "body" },
  { id: "right", label: "Lat. destra", group: "body" },
  { id: "head", label: "Testa / viso", group: "detail" },
  { id: "ears", label: "Orecchie", group: "detail" },
  { id: "mouth", label: "Cavo orale", group: "detail" },
  { id: "hand_palm", label: "Mani · palmo", group: "detail" },
  { id: "hand_back", label: "Mani · dorso", group: "detail" },
  { id: "foot_back", label: "Piedi · dorso", group: "detail" },
  { id: "foot_sole", label: "Piedi · pianta", group: "detail" },
];
export const isBodyView = (v) => ["front", "back", "left", "right"].includes(v);

export const DESCRITTORI = ["macula", "papula", "placca", "nodulo", "vescicola", "bolla", "pustola", "pomfo", "crosta", "squama", "erosione", "ulcera", "petecchia", "ecchimosi", "cicatrice", "lichenificazione"];
export const STATI = [
  { id: "attivo", label: "Attivo", cls: "bg-rose-50 text-rose-800 ring-rose-200" },
  { id: "in_miglioramento", label: "In miglioramento", cls: "bg-amber-50 text-amber-900 ring-amber-200" },
  { id: "risolto", label: "Risolto", cls: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
];
export const STATO = Object.fromEntries(STATI.map((s) => [s.id, s]));

// Zone intime (genitale/perianale): stesso elenco di backend/bodychart_media.py
const INTIMATE = { front: [0.39, 0.42, 0.61, 0.56], back: [0.39, 0.42, 0.61, 0.56], left: [0.36, 0.45, 0.64, 0.55], right: [0.36, 0.45, 0.64, 0.55] };
export const isIntimate = (view, x, y) => { const b = INTIMATE[view]; return !!b && x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3]; };

// Zoom anatomici (viewBox) sulle viste del corpo; i pin restano in coordinate normalizzate
export const ZOOMS = [
  { id: "full", label: "Intera", box: [0, 0, VB_W, VB_H] },
  { id: "head", label: "Testa / Volto", box: [40, 0, 120, 110] },
  { id: "torso", label: "Torace / Addome", box: [30, 60, 140, 190] },
  { id: "arms", label: "Arti superiori", box: [0, 60, VB_W, 220] },
  { id: "legs", label: "Arti inferiori", box: [20, 200, 160, 260] },
];

export const NOTE_HINTS = {
  lesione: ["Escoriazione", "Ferita lacero-contusa", "Crosta"],
  trauma: ["Livido 2 cm", "Ecchimosi", "Tumefazione"],
  dolore: ["Dolore alla palpazione", "Dolore al movimento", "Dolore riferito"],
  eruzione: ["Arrossamento intenso", "Papule pruriginose", "Eczema"],
  nevo: ["Nevo da monitorare", "Neo piano < 5 mm", "Macchia caffellatte"],
  controllo: ["In miglioramento", "Invariato", "Guarito"],
};

const P = {
  adult: { headR: 19, headY: 30, neckW: 15, shY: 72, sh: 46, chest: 40, waist: 30, waistY: 175, hip: 38, hipY: 215, crotch: 240, knee: 340, ankle: 425, armW: 15, foreW: 11, elbowY: 160, wristY: 238, thighW: 31, shinW: 20, depth: 24 },
  child: { headR: 27, headY: 37, neckW: 16, shY: 84, sh: 38, chest: 36, waist: 33, waistY: 178, hip: 35, hipY: 208, crotch: 226, knee: 325, ankle: 418, armW: 16, foreW: 13, elbowY: 160, wristY: 226, thighW: 32, shinW: 23, depth: 26 },
};

const C = 100;
const line = (x1, y1, x2, y2, w) => ({ t: "line", x1, y1, x2, y2, w });

const torsoFront = (p) => {
  const { shY, sh, chest, waist, waistY, hip, hipY, crotch } = p;
  return `M ${C - sh + 6} ${shY} Q ${C} ${shY - 8} ${C + sh - 6} ${shY} Q ${C + sh + 2} ${shY + 4} ${C + sh - 2} ${shY + 26}
    L ${C + chest} ${shY + 60} Q ${C + waist - 2} ${waistY - 30} ${C + waist} ${waistY} Q ${C + hip + 2} ${hipY - 18} ${C + hip} ${hipY}
    L ${C + hip - 4} ${crotch} L ${C} ${crotch + 6} L ${C - hip + 4} ${crotch} L ${C - hip} ${hipY}
    Q ${C - hip - 2} ${hipY - 18} ${C - waist} ${waistY} Q ${C - waist + 2} ${waistY - 30} ${C - chest} ${shY + 60} L ${C - sh + 2} ${shY + 26} Q ${C - sh - 2} ${shY + 4} ${C - sh + 6} ${shY} Z`;
};

const frontShapes = (p) => {
  const s = [{ t: "ellipse", cx: C, cy: p.headY, rx: p.headR * 0.84, ry: p.headR }, { t: "rect", x: C - p.neckW / 2, y: p.headY + p.headR - 6, w: p.neckW, h: p.shY - p.headY - p.headR + 12 },
    { t: "path", d: torsoFront(p) }];
  for (const k of [-1, 1]) {
    const sx = C + k * (p.sh - 4), ex = C + k * (p.sh + 13), wx = C + k * (p.sh + 24);
    s.push(line(sx, p.shY + 10, ex, p.elbowY, p.armW), line(ex, p.elbowY, wx, p.wristY, p.foreW), { t: "ellipse", cx: wx + k * 2, cy: p.wristY + 11, rx: 7, ry: 11 });
    const hx = C + k * (p.hip - p.thighW / 2), kx = C + k * (p.thighW / 2 + 6), ax = C + k * (p.shinW / 2 + 9);
    s.push(line(hx, p.hipY + 6, kx, p.knee, p.thighW), line(kx, p.knee, ax, p.ankle, p.shinW), { t: "ellipse", cx: ax + k * 4, cy: p.ankle + 10, rx: 11, ry: 7 });
  }
  return s;
};

const sideShapes = (p) => {
  const d = p.depth, x0 = C - 4;
  const torso = `M ${x0 - d + 6} ${p.shY} Q ${x0} ${p.shY - 6} ${x0 + d - 2} ${p.shY + 4} Q ${x0 + d + 8} ${p.shY + 40} ${x0 + d - 2} ${p.shY + 80}
    Q ${x0 + d + 4} ${p.waistY} ${x0 + d - 2} ${p.hipY} L ${x0 + d - 6} ${p.crotch} L ${x0 - d + 2} ${p.crotch} Q ${x0 - d - 12} ${p.hipY} ${x0 - d} ${p.waistY}
    Q ${x0 - d - 6} ${p.shY + 50} ${x0 - d + 6} ${p.shY} Z`;
  return [[{ t: "ellipse", cx: x0 + 4, cy: p.headY, rx: p.headR * 0.92, ry: p.headR }, { t: "ellipse", cx: x0 + 4 + p.headR * 0.9, cy: p.headY + 4, rx: 4, ry: 5 },
    { t: "rect", x: x0 - p.neckW / 2, y: p.headY + p.headR - 6, w: p.neckW, h: p.shY - p.headY - p.headR + 12 }, { t: "path", d: torso },
    line(x0, p.hipY, x0 + 4, p.knee, p.thighW + 4), line(x0 + 4, p.knee, x0, p.ankle, p.shinW), { t: "ellipse", cx: x0 + 10, cy: p.ankle + 10, rx: 17, ry: 7 }],
    [line(x0 - 2, p.shY + 14, x0 + 4, p.elbowY, p.armW - 2), line(x0 + 4, p.elbowY, x0 + 14, p.wristY, p.foreW - 1), { t: "ellipse", cx: x0 + 15, cy: p.wristY + 10, rx: 6.5, ry: 10 }]];
};

const details = (p, view) => {
  if (view === "front") return [`M ${C - 22} ${p.shY + 8} Q ${C - 10} ${p.shY + 14} ${C - 3} ${p.shY + 8}`, `M ${C + 22} ${p.shY + 8} Q ${C + 10} ${p.shY + 14} ${C + 3} ${p.shY + 8}`,
    `M ${C - 1.5} ${p.waistY - 6} a 1.5 1.5 0 1 0 3 0 a 1.5 1.5 0 1 0 -3 0`, `M ${C} ${p.crotch - 22} L ${C} ${p.crotch + 4}`];
  if (view === "back") return [`M ${C} ${p.shY - 2} L ${C} ${p.waistY + 20}`, `M ${C - 26} ${p.shY + 18} Q ${C - 14} ${p.shY + 44} ${C - 8} ${p.shY + 22}`,
    `M ${C + 26} ${p.shY + 18} Q ${C + 14} ${p.shY + 44} ${C + 8} ${p.shY + 22}`, `M ${C} ${p.hipY - 6} L ${C} ${p.crotch + 4}`, `M ${C - 30} ${p.crotch - 4} Q ${C - 16} ${p.crotch + 6} ${C - 3} ${p.crotch}`,
    `M ${C + 30} ${p.crotch - 4} Q ${C + 16} ${p.crotch + 6} ${C + 3} ${p.crotch}`];
  return [`M ${C + 4} ${p.knee - 4} q 6 4 0 10`];
};

export const silhouette = (kind, view) => {
  const p = P[kind] ?? P.child;
  const side = view === "left" || view === "right";
  return { layers: side ? sideShapes(p) : [frontShapes(p)], details: details(p, view), mirror: view === "left" };
};

export const sideLabels = (view) => (view === "front" ? ["D", "S"] : view === "back" ? ["S", "D"] : null);

/** Zone sensibili sulla figura intera che aprono le viste di dettaglio. */
export const hotspots = (kind, view) => {
  const p = P[kind] ?? P.child;
  if (view !== "front" && view !== "back") return [];
  const hand = view === "front" ? "hand_palm" : "hand_back";
  const foot = view === "front" ? "foot_back" : "foot_sole";
  const hx = p.sh + 26, fx = p.shinW / 2 + 13;
  return [
    { id: "head", label: "Testa / viso", x: C + p.headR + 4, y: p.headY - p.headR + 4 },
    { id: "ears", label: "Orecchie", x: C - p.headR - 4, y: p.headY - p.headR + 4 },
    ...(view === "front" ? [{ id: "mouth", label: "Cavo orale", x: C + p.headR + 4, y: p.headY + p.headR - 2 }] : []),
    { id: hand, label: "Mani", x: C - hx, y: p.wristY + 30 }, { id: hand, label: "Mani", x: C + hx, y: p.wristY + 30 },
    { id: foot, label: "Piedi", x: C - fx - 14, y: p.ankle + 24 }, { id: foot, label: "Piedi", x: C + fx + 14, y: p.ankle + 24 },
  ];
};

export const pathOf = (pts) => (pts.length === 1 ? `M ${pts[0][0]} ${pts[0][1]} l 0.01 0` : `M ${pts.map((q) => q.join(" ")).join(" L ")}`);

export const uid = () => Math.random().toString(36).slice(2, 10);

export const svgToPng = (svg, w, h, scale = 2) => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => {
    const cv = document.createElement("canvas");
    cv.width = w * scale;
    cv.height = h * scale;
    const ctx = cv.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.drawImage(img, 0, 0, cv.width, cv.height);
    resolve(cv.toDataURL("image/png"));
  };
  img.onerror = reject;
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
});
