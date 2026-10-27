import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { VB_W, VB_H, hotspots } from "@/lib/bodychart";
import { Silhouette, Strokes, Pins } from "./Silhouette";

const HOLD_MS = 450;
const SLOP = 8;

const toVB = (svg, e) => {
  const pt = svg.createSVGPoint();
  pt.x = e.clientX;
  pt.y = e.clientY;
  const p = pt.matrixTransform(svg.getScreenCTM().inverse());
  return [Math.max(0, Math.min(VB_W, +p.x.toFixed(1))), Math.max(0, Math.min(VB_H, +p.y.toFixed(1)))];
};
const norm = ([x, y]) => ({ x: +(x / VB_W).toFixed(4), y: +(y / VB_H).toFixed(4) });

/** Lente sulle zone che aprono le viste di dettaglio. */
const Hotspots = ({ kind, view, k, onDetail }) => hotspots(kind, view).map((h, i) => (
  <g key={`${h.id}${i}`} onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => { e.stopPropagation(); onDetail(h.id); }} style={{ cursor: "zoom-in" }}
    role="button" aria-label={`Apri vista di dettaglio: ${h.label}`} data-testid={`bodychart-hotspot-${h.id}-${i}`}>
    <circle cx={h.x} cy={h.y} r={9 * k} fill="#fff" stroke="#3B6CF6" strokeWidth={1.4 * k} />
    <circle cx={h.x - 1 * k} cy={h.y - 1 * k} r={3.6 * k} fill="none" stroke="#3B6CF6" strokeWidth={1.4 * k} />
    <line x1={h.x + 1.6 * k} y1={h.y + 1.6 * k} x2={h.x + 4.4 * k} y2={h.y + 4.4 * k} stroke="#3B6CF6" strokeWidth={1.6 * k} strokeLinecap="round" />
  </g>
));

/**
 * Tocco breve sulla figura = nuovo reperto; tocco breve su un pin = selezione.
 * Il pin si sposta SOLO con pressione prolungata (450 ms senza muoversi) e poi trascinamento: un tocco accidentale non lo muove.
 */
export const BodyCanvas = ({ kind, view, tool, pen, markers, strokes, numbers, selected, onTap, onStroke, onPick, onMove, onDetail, box = [0, 0, VB_W, VB_H] }) => {
  const k = Math.max(0.45, Math.min(1, box[2] / VB_W + 0.15));
  const ref = useRef(null);
  const [live, setLive] = useState(null);
  const [drag, setDrag] = useState(null);
  const press = useRef(null);
  const drawing = tool === "pen" || tool === "highlighter";

  const pinDown = (e, m) => {
    if (drawing) return;
    e.currentTarget.ownerSVGElement?.setPointerCapture?.(e.pointerId);
    const timer = setTimeout(() => { press.current = { ...press.current, armed: true }; setDrag({ id: m.id, ...m }); navigator.vibrate?.(15); }, HOLD_MS);
    press.current = { id: m.id, x: e.clientX, y: e.clientY, timer, armed: false };
  };
  const down = (e) => {
    if (!drawing) { press.current = { id: null, x: e.clientX, y: e.clientY }; return; }
    e.currentTarget.setPointerCapture(e.pointerId);
    setLive({ view, tool, color: pen.color, width: tool === "highlighter" ? 14 : pen.width, points: [toVB(ref.current, e)] });
  };
  const move = (e) => {
    const pr = press.current;
    if (pr?.id && !pr.armed && Math.hypot(e.clientX - pr.x, e.clientY - pr.y) > SLOP) { clearTimeout(pr.timer); press.current = { ...pr, cancelled: true }; }
    if (drag) { setDrag({ ...drag, ...norm(toVB(ref.current, e)) }); return; }
    if (!live) return;
    const p = toVB(ref.current, e);
    const last = live.points[live.points.length - 1];
    if (Math.hypot(p[0] - last[0], p[1] - last[1]) < 1.2 || live.points.length >= 3000) return;
    setLive({ ...live, points: [...live.points, p] });
  };
  const up = (e) => {
    const pr = press.current;
    press.current = null;
    if (live) { onStroke(live); setLive(null); return; }
    if (drag) { onMove(drag.id, { x: drag.x, y: drag.y }); setDrag(null); return; }
    if (pr?.id) { clearTimeout(pr.timer); if (!pr.cancelled) onPick(pr.id); return; }
    if (drawing || !pr || Math.hypot(e.clientX - pr.x, e.clientY - pr.y) > SLOP) return;
    onTap({ view, ...norm(toVB(ref.current, e)) });
  };
  const cancel = () => { if (press.current?.timer) clearTimeout(press.current.timer); press.current = null; setLive(null); setDrag(null); };
  const shown = markers.filter((m) => m.view === view).map((m) => (drag?.id === m.id ? { ...m, x: drag.x, y: drag.y } : m));
  return (
    <motion.svg ref={ref} initial={false} animate={{ viewBox: box.join(" ") }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }} viewBox={box.join(" ")} className="h-full w-full select-none" style={{ touchAction: "none", cursor: drawing ? "crosshair" : drag ? "grabbing" : "copy" }}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel} onContextMenu={(e) => e.preventDefault()} data-testid="bodychart-canvas" data-dragging={drag ? "true" : undefined} role="img" aria-label={`Sagoma ${view}`}>
      <Silhouette kind={kind} view={view} />
      <Strokes items={strokes.filter((s) => s.view === view)} />
      {live && <Strokes items={[live]} />}
      {!drawing && onDetail && <Hotspots kind={kind} view={view} k={k} onDetail={onDetail} />}
      <Pins k={k} items={shown} numbers={numbers} selected={drag?.id ?? selected} onPinDown={drawing ? undefined : pinDown} />
    </motion.svg>
  );
};
