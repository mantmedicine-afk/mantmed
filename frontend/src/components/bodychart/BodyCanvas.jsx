import { useRef, useState } from "react";
import { VB_W, VB_H } from "@/lib/bodychart";
import { Silhouette, Strokes, Pins } from "./Silhouette";

const toVB = (svg, e) => {
  const pt = svg.createSVGPoint();
  pt.x = e.clientX;
  pt.y = e.clientY;
  const p = pt.matrixTransform(svg.getScreenCTM().inverse());
  return [Math.max(0, Math.min(VB_W, +p.x.toFixed(1))), Math.max(0, Math.min(VB_H, +p.y.toFixed(1)))];
};

export const BodyCanvas = ({ kind, view, tool, pen, markers, strokes, numbers, selected, onMarker, onStroke, onPick }) => {
  const ref = useRef(null);
  const [live, setLive] = useState(null);
  const picked = useRef(false);
  const drawing = tool === "pen" || tool === "highlighter";
  const down = (e) => {
    if (!drawing) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setLive({ view, tool, color: pen.color, width: tool === "highlighter" ? 14 : pen.width, points: [toVB(ref.current, e)] });
  };
  const move = (e) => {
    if (!live) return;
    const p = toVB(ref.current, e);
    const last = live.points[live.points.length - 1];
    if (Math.hypot(p[0] - last[0], p[1] - last[1]) < 1.2 || live.points.length >= 3000) return;
    setLive({ ...live, points: [...live.points, p] });
  };
  const up = (e) => {
    if (live) { onStroke(live); setLive(null); return; }
    if (picked.current) { picked.current = false; return; }
    if (drawing) return;
    const [x, y] = toVB(ref.current, e);
    onMarker({ view, x: +(x / VB_W).toFixed(4), y: +(y / VB_H).toFixed(4) });
  };
  return (
    <svg ref={ref} viewBox={`0 0 ${VB_W} ${VB_H}`} className="h-full w-full select-none" style={{ touchAction: "none", cursor: drawing ? "crosshair" : "copy" }}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => setLive(null)} data-testid="bodychart-canvas" role="img" aria-label={`Sagoma ${view}`}>
      <Silhouette kind={kind} view={view} />
      <Strokes items={strokes.filter((s) => s.view === view)} />
      {live && <Strokes items={[live]} />}
      <Pins items={markers.filter((m) => m.view === view)} numbers={numbers} selected={selected} onPick={drawing ? undefined : (id) => { picked.current = true; onPick(id); }} />
    </svg>
  );
};
