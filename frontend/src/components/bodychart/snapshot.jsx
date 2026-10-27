import { renderToStaticMarkup } from "react-dom/server";
import { VIEWS, VB_W, VB_H, svgToPng } from "@/lib/bodychart";
import { Silhouette, Strokes, Pins } from "./Silhouette";

const GAP = 24;
const TOP = 58;

// Solo le viste utili (frontale, posteriore e quelle con reperti o disegni): immagine più leggera da generare e scaricare.
const usedViews = (markers, strokes) => VIEWS.filter((v) => ["front", "back"].includes(v.id) || markers.some((m) => m.view === v.id) || strokes.some((s) => s.view === v.id));

const Snapshot = ({ kind, markers, strokes, numbers, title, views, w, h }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
    <rect width={w} height={h} fill="#ffffff" />
    <text x={GAP} y={22} fontFamily="Arial, sans-serif" fontSize={13} fontWeight={700} fill="#0A192F">{title}</text>
    {views.map((v, i) => (
      <g key={v.id} transform={`translate(${GAP + i * (VB_W + GAP)} ${TOP})`}>
        <text x={VB_W / 2} y={-10} textAnchor="middle" fontFamily="Arial, sans-serif" fontSize={11} fill="#5B6478">{v.label.toUpperCase()}</text>
        <Silhouette kind={kind} view={v.id} />
        <Strokes items={strokes.filter((s) => s.view === v.id)} />
        <Pins items={markers.filter((m) => m.view === v.id)} numbers={numbers} />
      </g>
    ))}
  </svg>
);

export const makeSnapshot = (props) => {
  const views = usedViews(props.markers, props.strokes);
  const w = views.length * VB_W + (views.length + 1) * GAP, h = VB_H + TOP + GAP;
  return svgToPng(renderToStaticMarkup(<Snapshot {...props} views={views} w={w} h={h} />), w, h, 2);
};
