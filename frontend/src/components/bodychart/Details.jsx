// Viste di dettaglio schematiche (viewBox 200x460, stesso stile della sagoma): testa/viso, orecchie, mani, piedi.
const OUT = "#0A192F";
const FILL = "#F1F4F9";
const LINE = "#9AA7BD";
const T = { fontFamily: "Arial, sans-serif", fontSize: 10, fill: "#5B6478", textAnchor: "middle", fontWeight: 700 };
const body = { fill: FILL, stroke: OUT, strokeWidth: 3, strokeLinejoin: "round" };
const thin = { fill: "none", stroke: LINE, strokeWidth: 1.2, strokeLinecap: "round" };

const Head = () => (
  <g data-testid="bodychart-detail-head">
    <rect x={78} y={278} width={44} height={70} rx={10} {...body} />
    <ellipse cx={30} cy={205} rx={10} ry={22} {...body} /><ellipse cx={170} cy={205} rx={10} ry={22} {...body} />
    <ellipse cx={100} cy={200} rx={72} ry={95} {...body} />
    <path d="M 34 170 Q 40 100 100 100 Q 160 100 166 170" {...thin} />
    <path d="M 60 185 q 12 -8 24 0 M 116 185 q 12 -8 24 0" {...thin} />
    <path d="M 100 196 L 94 232 Q 100 238 106 232" {...thin} />
    <path d="M 78 258 Q 100 272 122 258" {...thin} />
    <text x={100} y={70} {...T}>TESTA E VISO</text>
    <text x={20} y={440} {...T} textAnchor="start">Dx</text><text x={180} y={440} {...T} textAnchor="end">Sx</text>
  </g>
);

const Ear = ({ cy, label }) => (
  <g>
    <path d={`M 120 ${cy - 85} C 40 ${cy - 95} 40 ${cy + 10} 80 ${cy + 40} C 95 ${cy + 52} 92 ${cy + 85} 118 ${cy + 85} C 150 ${cy + 85} 160 ${cy + 40} 150 ${cy}
      C 165 ${cy - 40} 160 ${cy - 82} 120 ${cy - 85} Z`} {...body} />
    <path d={`M 118 ${cy - 62} C 70 ${cy - 66} 70 ${cy + 4} 102 ${cy + 26}`} {...thin} />
    <ellipse cx={118} cy={cy + 8} rx={10} ry={14} fill="none" stroke={LINE} strokeWidth={1.2} />
    <text x={100} y={cy - 96} {...T}>{label}</text>
  </g>
);

const Ears = () => <g data-testid="bodychart-detail-ears"><Ear cy={118} label="ORECCHIO DESTRO" /><Ear cy={345} label="ORECCHIO SINISTRO" /></g>;

const Hand = ({ oy, mirror, back, label }) => {
  const fingers = [[58, 62], [82, 78], [106, 74], [128, 58]];
  return (
    <g>
      <text x={100} y={oy + 8} {...T}>{label}</text>
      <g transform={mirror ? "translate(200 0) scale(-1 1)" : undefined}>
        {fingers.map(([x, h]) => <rect key={x} x={x} y={oy + 96 - h} width={18} height={h + 14} rx={9} {...body} />)}
        <rect x={20} y={oy + 120} width={52} height={20} rx={10} transform={`rotate(-35 46 ${oy + 130})`} {...body} />
        <rect x={54} y={oy + 88} width={94} height={104} rx={26} {...body} />
        {back ? fingers.map(([x, h]) => <rect key={`n${x}`} x={x + 4} y={oy + 100 - h} width={10} height={9} rx={3} fill="none" stroke={LINE} strokeWidth={1.2} />)
          : <><path d={`M 62 ${oy + 122} Q 100 ${oy + 112} 144 ${oy + 118}`} {...thin} /><path d={`M 66 ${oy + 148} Q 92 ${oy + 132} 120 ${oy + 186}`} {...thin} /></>}
      </g>
    </g>
  );
};

const Hands = ({ back }) => (
  <g data-testid={`bodychart-detail-hand-${back ? "back" : "palm"}`}>
    <Hand oy={14} back={back} mirror={back} label={`MANO DESTRA · ${back ? "DORSO" : "PALMO"}`} />
    <Hand oy={240} back={back} mirror={!back} label={`MANO SINISTRA · ${back ? "DORSO" : "PALMO"}`} />
  </g>
);

const Foot = ({ cx, sole }) => (
  <g>
    {[[-22, 52, 13], [-4, 46, 10], [10, 46, 9], [22, 50, 8], [32, 58, 7]].map(([dx, y, r], i) => <circle key={i} cx={cx + dx} cy={y} r={r} {...body} />)}
    <path d={`M ${cx - 34} 90 Q ${cx - 40} 70 ${cx - 10} 66 Q ${cx + 30} 62 ${cx + 40} 80 Q ${cx + 44} 180 ${cx + 30} 260 Q ${cx + 26} 330 ${cx + 30} 380
      Q ${cx + 30} 430 ${cx} 432 Q ${cx - 34} 430 ${cx - 32} 380 Q ${cx - 30} 300 ${cx - 40} 220 Q ${cx - 46} 150 ${cx - 34} 90 Z`} {...body} />
    {sole ? <path d={`M ${cx + 22} 200 Q ${cx + 10} 260 ${cx + 20} 320`} {...thin} />
      : [[-22, 52, 13], [-4, 46, 10], [10, 46, 9], [22, 50, 8], [32, 58, 7]].map(([dx, y, r], i) => <circle key={`n${i}`} cx={cx + dx} cy={y - r * 0.35} r={r * 0.45} fill="none" stroke={LINE} strokeWidth={1.1} />)}
  </g>
);

const Feet = ({ sole }) => (
  <g data-testid={`bodychart-detail-foot-${sole ? "sole" : "back"}`}>
    <g transform="translate(108 0) scale(-1 1)"><Foot cx={54} sole={sole} /></g>
    <g transform="translate(92 0)"><Foot cx={54} sole={sole} /></g>
    <text x={54} y={452} {...T}>DESTRO</text><text x={146} y={452} {...T}>SINISTRO</text>
    <text x={100} y={18} {...T}>{sole ? "PIANTA DEI PIEDI" : "DORSO DEI PIEDI"}</text>
  </g>
);

export const DETAIL_DRAWINGS = {
  head: Head, ears: Ears, hand_palm: () => <Hands />, hand_back: () => <Hands back />, foot_back: () => <Feet />, foot_sole: () => <Feet sole />,
};
