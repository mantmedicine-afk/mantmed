import { useState } from "react";
import { Siren, Download } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

const W = 1080, H = 1920, PAD = 90;
const C = { bg: "#0F1A1E", fg: "#F7F9FB", fg2: "rgba(247, 249, 251, 0.76)", red: "#EE9C89", line: "rgba(247, 249, 251, 0.18)" };
const FONT = "Inter, system-ui, -apple-system, sans-serif";

const wrap = (ctx, text, y, size, color, weight = 500) => {
  ctx.font = `${weight} ${size}px ${FONT}`; ctx.fillStyle = color; ctx.textBaseline = "top";
  let line = "";
  for (const w of String(text).split(/\s+/)) {
    const t = line ? `${line} ${w}` : w;
    if (ctx.measureText(t).width > W - PAD * 2 && line) { ctx.fillText(line, PAD, y); y += size * 1.3; line = w; } else line = t;
  }
  if (line) { ctx.fillText(line, PAD, y); y += size * 1.3; }
  return y;
};

const block = (ctx, title, values, y, color) => {
  y = wrap(ctx, title.toUpperCase(), y, 30, color === C.red ? C.red : C.fg2, 700) + 6;
  for (const v of values.length ? values : ["Nessuna segnalata"]) y = wrap(ctx, v, y, 44, color, values.length ? 650 : 400);
  ctx.fillStyle = C.line; ctx.fillRect(PAD, y + 10, W - PAD * 2, 2);
  return y + 60;
};

export const drawEmergency = (d) => {
  const cv = Object.assign(document.createElement("canvas"), { width: W, height: H });
  const ctx = cv.getContext("2d");
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  let y = 600;
  y = wrap(ctx, "SCHEDA EMERGENZA", y, 32, C.red, 800) + 10;
  y = wrap(ctx, d.child.name, y, 76, C.fg, 700);
  y = wrap(ctx, d.child.age_label, y, 40, C.fg2, 400) + 40;
  y = block(ctx, "Allergie e intolleranze", d.summary.allergies.map((x) => x.value), y, C.red);
  y = block(ctx, "Patologie", d.summary.chronic.map((x) => x.value), y, C.fg);
  y = block(ctx, "Terapie in corso", d.summary.therapies.map((x) => x.value), y, C.fg);
  if (d.summary.blood_group) y = block(ctx, "Gruppo sanguigno", [d.summary.blood_group.value], y, C.fg);
  y = wrap(ctx, "CONTATTO DEL GENITORE", y, 30, C.fg2, 700) + 6;
  y = wrap(ctx, d.contact?.name || "", y, 48, C.fg, 650);
  wrap(ctx, d.contact?.phone || d.contact?.email || "", y, 48, C.fg, 650);
  wrap(ctx, `MantMed · aggiornata il ${new Date().toLocaleDateString("it-IT")}`, H - 110, 28, C.fg2, 400);
  return cv.toDataURL("image/png");
};

export const EmergencyCard = ({ data }) => {
  const [img, setImg] = useState(null);
  const save = () => Object.assign(document.createElement("a"), { href: img, download: `Scheda_emergenza_${data.child.name.replace(/\s+/g, "_")}.png` }).click();
  return (
    <>
      <button onClick={() => setImg(drawEmergency(data))} className="flex h-11 items-center gap-2 rounded-full border border-[var(--alert)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--alert)] transition-transform hover:-translate-y-0.5" data-testid="emergency-card-btn"><Siren size={16} /> Scheda emergenza</button>
      <Dialog open={!!img} onOpenChange={(o) => !o && setImg(null)}>
        <DialogContent className="z-[60] max-h-[94vh] overflow-y-auto rounded-3xl bg-[var(--surface)] sm:max-w-sm" data-testid="emergency-dialog">
          <DialogHeader><DialogTitle className="text-2xl font-semibold text-[var(--fg)]">Scheda emergenza</DialogTitle>
            <DialogDescription className="text-[var(--fg2)]">Salvi l'immagine e la imposti come sfondo della schermata di blocco: al pronto soccorso è visibile anche senza sbloccare il telefono.</DialogDescription></DialogHeader>
          {img && <img src={img} alt={`Scheda emergenza di ${data.child.name}`} className="mx-auto w-full max-w-[240px] rounded-2xl ring-1 ring-[var(--sel)]" data-testid="emergency-preview" />}
          <button onClick={save} className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[var(--accent)] text-sm font-medium text-[var(--ink)]" data-testid="emergency-save-btn"><Download size={15} /> Salva immagine</button>
        </DialogContent>
      </Dialog>
    </>
  );
};
