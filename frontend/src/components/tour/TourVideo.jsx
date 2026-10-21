import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Maximize2, Play, X } from "lucide-react";

const src = (id, ext) => `${process.env.PUBLIC_URL || ""}/tour/${id}.${ext}`;
const Sources = ({ id }) => <><source src={src(id, "webm")} type="video/webm" /><source src={src(id, "mp4")} type="video/mp4" /></>;
const useWide = () => {
  const q = "(min-width: 640px)";
  const [wide, setWide] = useState(() => window.matchMedia(q).matches);
  useEffect(() => { const m = window.matchMedia(q); const f = () => setWide(m.matches); m.addEventListener("change", f); return () => m.removeEventListener("change", f); }, []);
  return wide;
};
const saveData = () => {
  const c = navigator.connection;
  return !!c && (c.saveData || c.type === "cellular" || /(^|-)(2g|3g)$/.test(c.effectiveType || ""));
};

const Fullscreen = ({ id, title, onClose }) => {
  useEffect(() => {
    const k = (e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-[90] grid place-items-center bg-black/90 p-3 sm:p-8" onClick={onClose} data-testid="tour-video-fullscreen">
      <div className="w-full max-w-5xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between text-white"><span className="font-display text-xl sm:text-2xl">{title}</span>
          <button onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full border border-white/30 hover:border-white" aria-label="Chiudi video" data-testid="tour-video-close"><X size={18} /></button></div>
        <video poster={src(id, "jpg")} autoPlay loop muted playsInline controls className="w-full rounded-2xl bg-black" data-testid="tour-video-full"><Sources id={id} /></video>
      </div>
    </div>, document.body);
};

const Preview = ({ id, onExpand }) => {
  const ref = useRef(null);
  const [auto] = useState(() => !saveData());
  const [playing, setPlaying] = useState(auto);
  const play = () => { ref.current?.play().catch(() => {}); setPlaying(true); };
  return (
    <div className="group relative mt-4 overflow-hidden rounded-2xl border border-white/10 bg-black/40" data-testid="tour-video-preview">
      <video ref={ref} poster={src(id, "jpg")} autoPlay={auto} loop muted playsInline preload={auto ? "auto" : "none"}
        className="aspect-[16/10] w-full object-cover" data-testid="tour-video"><Sources id={id} /></video>
      {!playing && <button onClick={play} className="absolute inset-0 grid place-items-center bg-black/30" aria-label="Riproduci video" data-testid="tour-video-play"><span className="grid h-14 w-14 place-items-center rounded-full bg-white/90 text-night"><Play size={22} className="ml-1" /></span></button>}
      <button onClick={onExpand} className="absolute bottom-2 right-2 flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-xs text-white opacity-90 backdrop-blur transition-opacity hover:opacity-100" data-testid="tour-video-expand"><Maximize2 size={12} /> Schermo intero</button>
    </div>
  );
};

const Thumb = ({ id, onExpand }) => (
  <button onClick={onExpand} className="relative mt-3 flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-2 text-left" data-testid="tour-video-thumb">
    <span className="relative h-14 w-24 shrink-0 overflow-hidden rounded-xl bg-black/40">
      <img src={src(id, "jpg")} alt="" className="h-full w-full object-cover" loading="lazy" />
      <span className="absolute inset-0 grid place-items-center bg-black/30"><Play size={18} className="text-white" /></span>
    </span>
    <span className="text-sm text-slate-200">Guarda la demo<span className="block text-xs text-slate-400">Breve clip · senza audio</span></span>
  </button>
);

export const TourVideo = ({ id, title }) => {
  const [full, setFull] = useState(false);
  const wide = useWide();
  if (!id) return null;
  return (
    <>
      {wide ? <Preview key={id} id={id} onExpand={() => setFull(true)} /> : <Thumb id={id} onExpand={() => setFull(true)} />}
      {full && <Fullscreen id={id} title={title} onClose={() => setFull(false)} />}
    </>
  );
};
