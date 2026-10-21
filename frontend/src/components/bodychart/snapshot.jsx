import { renderToStaticMarkup } from "react-dom/server";
import { VIEWS, VB_W, VB_H, svgToPng } from "@/lib/bodychart";
import { Silhouette, Strokes, Pins } from "./Silhouette";

const GAP = 24;
const TOP = 58;
export const SNAP_W = VIEWS.length * VB_W + (VIEWS.length + 1) * GAP;
export const SNAP_H = VB_H + TOP + GAP;

const Snapshot = ({ kind, markers, strokes, numbers, title }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={SNAP_W} height={SNAP_H} viewBox={`0 0 ${SNAP_W} ${SNAP_H}`}>
    <rect width={SNAP_W} height={SNAP_H} fill="#ffffff" />
    <text x={GAP} y={22} fontFamily="Arial, sans-serif" fontSize={13} fontWeight={700} fill="#0A192F">{title}</text>
    {VIEWS.map((v, i) => (
      <g key={v.id} transform={`translate(${GAP + i * (VB_W + GAP)} ${TOP})`}>
        <text x={VB_W / 2} y={-10} textAnchor="middle" fontFamily="Arial, sans-serif" fontSize={11} fill="#5B6478">{v.label.toUpperCase()}</text>
        <Silhouette kind={kind} view={v.id} />
        <Strokes items={strokes.filter((s) => s.view === v.id)} />
        <Pins items={markers.filter((m) => m.view === v.id)} numbers={numbers} />
      </g>
    ))}
  </svg>
);

export const makeSnapshot = (props) => svgToPng(renderToStaticMarkup(<Snapshot {...props} />), SNAP_W, SNAP_H, 2);
