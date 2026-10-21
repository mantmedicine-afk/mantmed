import { silhouette, sideLabels, pathOf, CAT, VB_W, VB_H } from "@/lib/bodychart";

const OUT = "#0A192F";
const FILL = "#F1F4F9";

const Shape = ({ s, outline }) => {
  const o = outline ? { fill: OUT, stroke: OUT, strokeWidth: 3.2, strokeLinejoin: "round" } : { fill: FILL };
  if (s.t === "ellipse") return <ellipse cx={s.cx} cy={s.cy} rx={s.rx} ry={s.ry} {...o} />;
  if (s.t === "rect") return <rect x={s.x} y={s.y} width={s.w} height={s.h} rx={3} {...o} />;
  if (s.t === "path") return <path d={s.d} {...o} />;
  return <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={outline ? OUT : FILL} strokeWidth={s.w + (outline ? 3.2 : 0)} strokeLinecap="round" />;
};

export const Silhouette = ({ kind, view }) => {
  const { layers, details, mirror } = silhouette(kind, view);
  const labels = sideLabels(view);
  return (
    <g>
      <g transform={mirror ? `translate(${VB_W} 0) scale(-1 1)` : undefined}>
        {layers.map((shapes, l) => (
          <g key={l}>
            <g>{shapes.map((s, i) => <Shape key={`o${i}`} s={s} outline />)}</g>
            <g>{shapes.map((s, i) => <Shape key={`f${i}`} s={s} />)}</g>
          </g>
        ))}
        <g fill="none" stroke="#9AA7BD" strokeWidth={1} strokeLinecap="round">{details.map((d, i) => <path key={i} d={d} />)}</g>
      </g>
      {labels && <g fontFamily="Arial, sans-serif" fontSize={11} fontWeight={700} fill="#5B6478"><text x={10} y={VB_H - 8}>{labels[0]}</text><text x={VB_W - 18} y={VB_H - 8}>{labels[1]}</text></g>}
    </g>
  );
};

export const Strokes = ({ items }) => items.map((s, i) => (
  <path key={i} d={pathOf(s.points)} fill="none" stroke={s.color} strokeWidth={s.width} strokeLinecap="round" strokeLinejoin="round" opacity={s.tool === "highlighter" ? 0.35 : 1} />
));

export const Pins = ({ items, numbers, selected, onPick }) => items.map((m) => {
  const c = CAT[m.cat]?.color ?? "#0A192F";
  const x = m.x * VB_W, y = m.y * VB_H;
  const sel = selected === m.id;
  return (
    <g key={m.id} onPointerDown={onPick ? (e) => { e.stopPropagation(); onPick(m.id); } : undefined} style={onPick ? { cursor: "pointer" } : undefined} data-testid={`bodychart-pin-${m.id}`}>
      {sel && <circle cx={x} cy={y} r={11} fill="none" stroke={c} strokeWidth={2} opacity={0.5} />}
      <circle cx={x} cy={y} r={7.5} fill={c} stroke="#fff" strokeWidth={1.8} />
      <text x={x} y={y + 3.2} textAnchor="middle" fontFamily="Arial, sans-serif" fontSize={8.5} fontWeight={700} fill="#fff">{numbers[m.id]}</text>
    </g>
  );
});
