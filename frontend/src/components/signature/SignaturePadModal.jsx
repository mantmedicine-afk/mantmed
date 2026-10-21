import { useCallback, useEffect, useRef, useState } from "react";
import { Eraser, Check, PenLine, CalendarClock, AlertCircle, RotateCcw } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

const INK = "#0A192F";
const MIN_W = 0.9;
const MAX_W = 3.6;
const MAX_EXPORT_W = 1400;

export const fmtSignedAt = (d) =>
  new Date(d).toLocaleString("it-IT", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

/* ---------- stroke math ---------- */
const widthFor = (p, prev, type) => {
  const dt = Math.max(1, p.t - prev.t);
  const v = Math.hypot(p.x - prev.x, p.y - prev.y) / dt; // px per ms
  const byVelocity = Math.max(MIN_W, Math.min(MAX_W, MAX_W / (1 + v * 1.6)));
  if (type === "pen" && p.p > 0) {
    const byPressure = MIN_W + (MAX_W - MIN_W) * Math.min(1, p.p * 1.15);
    return byPressure * 0.75 + byVelocity * 0.25;
  }
  return byVelocity;
};

const drawDot = (g, p) => {
  g.beginPath();
  g.arc(p.x, p.y, (p.w || 2.4) / 2 + 0.4, 0, Math.PI * 2);
  g.fill();
};

// Draw the segment ending at index i of the stroke (smoothed with quadratic curves through midpoints)
const drawSegment = (g, pts, i) => {
  if (i < 1) return;
  const p0 = pts[i - 2] || pts[i - 1];
  const p1 = pts[i - 1];
  const p2 = pts[i];
  const m1 = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
  const m2 = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
  g.lineWidth = (p1.w + p2.w) / 2;
  g.beginPath();
  g.moveTo(m1.x, m1.y);
  g.quadraticCurveTo(p1.x, p1.y, m2.x, m2.y);
  g.stroke();
};

const replay = (g, strokes) => {
  g.lineCap = "round";
  g.lineJoin = "round";
  g.strokeStyle = INK;
  g.fillStyle = INK;
  strokes.forEach((s) => {
    if (s.length === 1) return drawDot(g, s[0]);
    for (let i = 1; i < s.length; i += 1) drawSegment(g, s, i);
    const a = s[s.length - 2];
    const b = s[s.length - 1];
    g.lineWidth = b.w;
    g.beginPath();
    g.moveTo((a.x + b.x) / 2, (a.y + b.y) / 2);
    g.lineTo(b.x, b.y);
    g.stroke();
  });
};

const metrics = (strokes) => {
  let len = 0;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  strokes.forEach((s) => s.forEach((p, i) => {
    if (i) len += Math.hypot(p.x - s[i - 1].x, p.y - s[i - 1].y);
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  }));
  return { len, minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
};

export const signatureIssue = (strokes) => {
  if (!strokes.length) return "Il riquadro è vuoto: firmi con il dito, il pennino o il mouse";
  const m = metrics(strokes);
  if (m.len < 60 || Math.max(m.w, m.h) < 40) return "La firma è troppo corta: firmi per esteso nel riquadro";
  return null;
};

// Cropped, transparent PNG (base64 data URL)
export const exportSignature = (strokes) => {
  const m = metrics(strokes);
  const pad = MAX_W + 6;
  const w = m.w + pad * 2;
  const h = m.h + pad * 2;
  const scale = Math.min(3, MAX_EXPORT_W / w);
  const c = document.createElement("canvas");
  c.width = Math.ceil(w * scale);
  c.height = Math.ceil(h * scale);
  const g = c.getContext("2d");
  g.scale(scale, scale);
  g.translate(pad - m.minX, pad - m.minY);
  replay(g, strokes);
  return c.toDataURL("image/png");
};

/* ---------- canvas ---------- */
const SignatureCanvas = ({ strokesRef, onInk, apiRef }) => {
  const ref = useRef(null);
  const active = useRef(null); // pointerId
  const [empty, setEmpty] = useState(true);

  const ctx = () => ref.current.getContext("2d");

  const fit = useCallback(() => {
    const c = ref.current;
    if (!c) return;
    // clientWidth/Height = layout size, not affected by the modal's zoom-in transform
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    c.width = Math.round(c.clientWidth * dpr);
    c.height = Math.round(c.clientHeight * dpr);
    const g = ctx();
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    replay(g, strokesRef.current);
  }, [strokesRef]);

  useEffect(() => {
    fit();
    setEmpty(strokesRef.current.length === 0);
    const ro = new ResizeObserver(fit);
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [fit, strokesRef]);

  const point = (e, rect) => {
    const c = ref.current;
    const sx = rect.width ? c.clientWidth / rect.width : 1;
    const sy = rect.height ? c.clientHeight / rect.height : 1;
    return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy, t: e.timeStamp || performance.now(), p: e.pressure };
  };

  const down = (e) => {
    if (active.current !== null || (e.pointerType === "mouse" && e.button !== 0)) return;
    e.preventDefault();
    const p = point(e, ref.current.getBoundingClientRect());
    p.w = e.pointerType === "pen" && e.pressure > 0 ? MIN_W + (MAX_W - MIN_W) * e.pressure : (MAX_W + MIN_W) / 2;
    p.type = e.pointerType;
    strokesRef.current.push([p]);
    active.current = e.pointerId;
    try { ref.current.setPointerCapture(e.pointerId); } catch { /* capture non disponibile: il tratto continua comunque */ }
    const g = ctx();
    g.fillStyle = INK;
    drawDot(g, p);
    if (empty) setEmpty(false);
    onInk();
  };

  const move = (e) => {
    if (active.current !== e.pointerId) return;
    e.preventDefault();
    const rect = ref.current.getBoundingClientRect();
    const s = strokesRef.current[strokesRef.current.length - 1];
    if (!s) return;
    const events = e.nativeEvent.getCoalescedEvents?.() || [];
    const list = events.length ? events : [e.nativeEvent];
    const g = ctx();
    g.lineCap = "round";
    g.lineJoin = "round";
    g.strokeStyle = INK;
    list.forEach((ev) => {
      const p = point(ev, rect);
      const prev = s[s.length - 1];
      if (Math.hypot(p.x - prev.x, p.y - prev.y) < 0.6) return;
      p.w = prev.w * 0.55 + widthFor(p, prev, e.pointerType) * 0.45;
      s.push(p);
      drawSegment(g, s, s.length - 1);
    });
  };

  const up = (e) => {
    if (active.current !== e.pointerId) return;
    active.current = null;
    try { ref.current.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    const s = strokesRef.current[strokesRef.current.length - 1];
    if (s && s.length > 1) {
      const g = ctx();
      const a = s[s.length - 2];
      const b = s[s.length - 1];
      g.lineWidth = b.w;
      g.beginPath();
      g.moveTo((a.x + b.x) / 2, (a.y + b.y) / 2);
      g.lineTo(b.x, b.y);
      g.stroke();
    }
    onInk();
  };

  // exposed reset
  if (apiRef) {
    apiRef.current = {
      clear: () => {
        strokesRef.current = [];
        const c = ref.current;
        if (c) ctx().clearRect(0, 0, c.width, c.height);
        setEmpty(true);
      },
    };
  }

  return (
    <div className="relative select-none overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[inset_0_1px_3px_rgba(10,25,47,0.06)]">
      <canvas
        ref={ref}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onContextMenu={(e) => e.preventDefault()}
        className="block h-[220px] w-full cursor-crosshair touch-none sm:h-[260px]"
        style={{ touchAction: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none" }}
        data-testid="signature-canvas"
        aria-label="Area di firma"
      />
      <div className="pointer-events-none absolute inset-x-6 bottom-12 flex items-end gap-2 sm:inset-x-10">
        <span className="font-display text-2xl leading-none text-slate-300">×</span>
        <span className="mb-1 h-px flex-1 bg-slate-300" />
      </div>
      {empty && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 pb-10 text-slate-400" data-testid="signature-placeholder">
          <PenLine size={22} strokeWidth={1.5} />
          <span className="text-sm">Firmi qui con il dito, il pennino o il mouse</span>
        </div>
      )}
    </div>
  );
};

/**
 * Modale "Pad di Firma Digitale".
 * onConfirm({ image, signerName, signedAt }) → image = PNG base64 data URL, ritagliato e trasparente.
 */
export const SignaturePadModal = ({
  open,
  onClose,
  onConfirm,
  title = "Firma del Genitore / Tutore",
  description = "Firmi per esteso nel riquadro. La firma viene salvata insieme a nome, data e ora.",
  defaultName = "",
}) => {
  const strokesRef = useRef([]);
  const padApi = useRef(null);
  const [name, setName] = useState(defaultName);
  const [now, setNow] = useState(new Date());
  const [error, setError] = useState("");
  const [hasInk, setHasInk] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    strokesRef.current = [];
    setName(defaultName);
    setError("");
    setHasInk(false);
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(id);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const clear = () => { padApi.current?.clear(); setHasInk(false); setError(""); };

  const confirm = () => {
    if (name.trim().length < 3) return setError("Inserisca nome e cognome del firmatario");
    const issue = signatureIssue(strokesRef.current);
    if (issue) return setError(issue);
    const signedAt = new Date().toISOString();
    onConfirm({ image: exportSignature(strokesRef.current), signerName: name.trim(), signedAt });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="w-[calc(100vw-1.5rem)] max-w-2xl gap-5 rounded-3xl border-0 bg-white p-5 sm:p-7"
        onInteractOutside={(e) => e.preventDefault()}
        onOpenAutoFocus={(e) => e.preventDefault()}
        data-testid="signature-modal"
        data-lenis-prevent
      >
        <DialogHeader className="pr-8 text-left">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-slate-500">Firma digitale</p>
          <DialogTitle className="font-display text-3xl font-normal leading-tight text-night" data-testid="signature-modal-title">{title}</DialogTitle>
          <DialogDescription className="text-sm text-slate-600">{description}</DialogDescription>
        </DialogHeader>

        <label className="grid gap-1.5">
          <span className="text-xs font-medium uppercase tracking-wider text-slate-500">Nome e cognome del firmatario</span>
          <input
            value={name}
            onChange={(e) => { setName(e.target.value); setError(""); }}
            placeholder="Es. Giulia Ricci"
            autoComplete="name"
            className="h-12 rounded-xl border border-slate-200 px-4 text-base text-night outline-none transition-colors focus:border-night"
            data-testid="signature-signer-input"
          />
        </label>

        <div className="grid gap-2">
          <SignatureCanvas strokesRef={strokesRef} apiRef={padApi} onInk={() => { setHasInk(strokesRef.current.length > 0); setError(""); }} />
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-1 text-sm">
            <span className="font-medium text-night" data-testid="signature-caption-name">{name.trim() || "Firmatario"}</span>
            <span className="flex items-center gap-1.5 text-slate-500" data-testid="signature-caption-date"><CalendarClock size={14} /> {fmtSignedAt(now)}</span>
          </div>
        </div>

        {error && (
          <p className="flex items-center gap-2 rounded-xl bg-rose-50 px-4 py-2.5 text-sm text-rose-700" role="alert" data-testid="signature-error">
            <AlertCircle size={16} className="shrink-0" /> {error}
          </p>
        )}

        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          <button
            type="button"
            onClick={clear}
            disabled={!hasInk}
            className="flex h-14 items-center justify-center gap-2 rounded-full border border-slate-300 px-2 text-sm font-medium sm:text-base text-night transition-colors hover:border-night disabled:opacity-40"
            data-testid="signature-clear-btn"
          >
            <Eraser size={18} className="shrink-0" /> Pulisci / Riscrivi
          </button>
          <button
            type="button"
            onClick={confirm}
            className="flex h-14 items-center justify-center gap-2 rounded-full bg-night px-2 text-sm font-semibold sm:text-base text-white transition-transform hover:-translate-y-0.5"
            data-testid="signature-confirm-btn"
          >
            <Check size={18} className="shrink-0" /> Conferma Firma
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

/** Campo firma da inserire nei moduli: anteprima + apertura del Pad. */
export const SignatureField = ({ value, onChange, title, description, defaultName, testId = "signature-field" }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      {value ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-4" data-testid={`${testId}-preview`}>
          <div className="flex h-24 items-center justify-center rounded-xl bg-[#F6F8FC] px-4">
            <img src={value.image} alt={`Firma di ${value.signerName}`} className="max-h-20 max-w-full object-contain" data-testid={`${testId}-image`} />
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
            <div>
              <div className="font-medium text-night">{value.signerName}</div>
              <div className="text-xs text-slate-500">Firmato il {fmtSignedAt(value.signedAt)}</div>
            </div>
            <button type="button" onClick={() => setOpen(true)} className="flex h-10 items-center gap-1.5 rounded-full border border-slate-200 px-4 text-sm text-night hover:border-night" data-testid={`${testId}-redo`}>
              <RotateCcw size={14} /> Rifirma
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-28 w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-[#F6F8FC] text-slate-600 transition-colors hover:border-night hover:text-night"
          data-testid={`${testId}-open`}
        >
          <PenLine size={22} strokeWidth={1.6} />
          <span className="text-sm font-medium">Tocca per firmare</span>
        </button>
      )}
      <SignaturePadModal open={open} onClose={() => setOpen(false)} onConfirm={onChange} title={title} description={description} defaultName={value?.signerName || defaultName} />
    </>
  );
};
