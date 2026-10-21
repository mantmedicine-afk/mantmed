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

const arch = (n, cx, cy, rx, ry, from, to) => Array.from({ length: n }, (_, i) => { const a = from + ((to - from) * (i + 0.5)) / n; return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)]; });

/** Schema del cavo orale: labbra, palato, lingua e arcate (20 denti da latte / 32 permanenti). */
const Mouth = ({ kind }) => {
  const n = kind === "child" ? 10 : 16;
  const r = kind === "child" ? 8 : 6.2;
  const txt = { fontFamily: "Arial, sans-serif", fontSize: 10, fill: "#5B6478", textAnchor: "middle" };
  return (
    <g data-testid="bodychart-mouth">
      <ellipse cx={100} cy={230} rx={96} ry={200} fill="#F8E1DE" stroke={OUT} strokeWidth={3} />
      <ellipse cx={100} cy={230} rx={82} ry={180} fill="#7F1D1D" opacity={0.12} />
      <ellipse cx={100} cy={150} rx={46} ry={58} fill="#F3C6C0" />
      <ellipse cx={100} cy={318} rx={44} ry={56} fill="#E9A3A0" />
      <path d="M 100 112 L 100 188" stroke="#D99A94" strokeWidth={1.5} strokeDasharray="3 3" />
      {arch(n, 100, 200, 74, 120, Math.PI, 2 * Math.PI).map(([x, y], i) => <rect key={`u${i}`} x={x - r} y={y - r} width={r * 2} height={r * 2} rx={r * 0.6} fill="#FFFDF7" stroke={OUT} strokeWidth={1.4} />)}
      {arch(n, 100, 262, 72, 116, 0, Math.PI).map(([x, y], i) => <rect key={`l${i}`} x={x - r} y={y - r} width={r * 2} height={r * 2} rx={r * 0.6} fill="#FFFDF7" stroke={OUT} strokeWidth={1.4} />)}
      <text x={100} y={20} {...txt}>ARCATA SUPERIORE</text><text x={100} y={150} {...txt}>Palato</text>
      <text x={100} y={322} {...txt}>Lingua</text><text x={100} y={450} {...txt}>ARCATA INFERIORE</text>
      <text x={14} y={234} {...txt} textAnchor="start">Dx</text><text x={186} y={234} {...txt} textAnchor="end">Sx</text>
    </g>
  );
};

export const Silhouette = ({ kind, view }) => {
  if (view === "mouth") return <Mouth kind={kind} />;
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

export const Pins = ({ items, numbers, selected, onPick, k = 1 }) => items.map((m) => {
  const c = CAT[m.cat]?.color ?? "#0A192F";
  const x = m.x * VB_W, y = m.y * VB_H;
  const sel = selected === m.id;
  return (
    <g key={m.id} onPointerDown={onPick ? (e) => { e.stopPropagation(); onPick(m.id); } : undefined} style={onPick ? { cursor: "pointer" } : undefined} data-testid={`bodychart-pin-${m.id}`}>
      {sel && <circle cx={x} cy={y} r={11 * k} fill="none" stroke={c} strokeWidth={2 * k} opacity={0.5} />}
      <circle cx={x} cy={y} r={7.5 * k} fill={c} stroke="#fff" strokeWidth={1.8 * k} />
      <text x={x} y={y + 3.2 * k} textAnchor="middle" fontFamily="Arial, sans-serif" fontSize={8.5 * k} fontWeight={700} fill="#fff">{numbers[m.id]}</text>
      {m.photos?.length > 0 && <g data-testid={`bodychart-pin-photo-${m.id}`}><circle cx={x + 6.5 * k} cy={y - 6.5 * k} r={4 * k} fill="#0A192F" stroke="#fff" strokeWidth={1 * k} /><rect x={x + 4.6 * k} y={y - 8 * k} width={3.8 * k} height={2.8 * k} rx={0.6 * k} fill="#fff" /></g>}
    </g>
  );
});
