import { useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, Loader2, Lock, X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { api, errMsg } from "@/lib/api";
import { isIntimate } from "@/lib/bodychart";

export const PhotoLightbox = ({ src, caption, onClose }) => (
  <Dialog open={!!src} onOpenChange={(o) => !o && onClose()}>
    <DialogContent className="w-[calc(100%-1rem)] max-w-4xl border-0 bg-[#0A192F] p-2 sm:p-3 [&>button]:rounded-full [&>button]:bg-white [&>button]:p-1 [&>button]:text-night [&>button]:opacity-100" data-testid="bodychart-photo-lightbox">
      <DialogTitle className="sr-only">Foto del reperto</DialogTitle>
      {src && <img src={src} alt={caption} className="max-h-[80vh] w-full rounded-xl object-contain" />}
      {caption && <p className="px-2 pb-1 text-sm text-[#C9CCD3]">{caption}</p>}
    </DialogContent>
  </Dialog>
);

export const Thumb = ({ id, reserved, onClick, size = "h-16 w-16", testId }) => (
  <button onClick={onClick} className={`relative block ${size} overflow-hidden rounded-xl bg-slate-100 ring-1 ring-slate-200`} data-testid={testId}>
    <img src={api.bodychartPhotoUrl(id, "thumb")} alt="Miniatura del reperto" loading="lazy" decoding="async" className="h-full w-full object-cover" />
    {reserved && <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-[#0A192F]/85 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white" data-testid={`${testId}-reserved`}><Lock size={9} /> Riservata</span>}
  </button>
);

/** Conferma obbligatoria prima di fotografare le zone intime. */
const IntimateConfirm = ({ open, onOpenChange, onConfirm }) => {
  const [a, setA] = useState(false);
  const [b, setB] = useState(false);
  return (
    <AlertDialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) { setA(false); setB(false); } }}>
      <AlertDialogContent className="rounded-[24px]" data-testid="bodychart-intimate-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle className="font-display text-2xl font-normal text-night">Foto di una zona intima</AlertDialogTitle>
          <AlertDialogDescription className="text-sm leading-relaxed text-slate-600">La foto sarà marcata «riservata»: mai visibile nel Portale Famiglia ed esclusa da qualsiasi condivisione con altri medici.</AlertDialogDescription>
        </AlertDialogHeader>
        <label className="flex items-start gap-3 text-sm text-night"><input type="checkbox" checked={a} onChange={(e) => setA(e.target.checked)} className="mt-0.5 h-5 w-5 accent-[#0A192F]" data-testid="bodychart-intimate-need" /> Confermo la necessità clinica della documentazione fotografica.</label>
        <label className="flex items-start gap-3 text-sm text-night"><input type="checkbox" checked={b} onChange={(e) => setB(e.target.checked)} className="mt-0.5 h-5 w-5 accent-[#0A192F]" data-testid="bodychart-intimate-consent" /> Confermo di aver raccolto il consenso del genitore o tutore.</label>
        <AlertDialogFooter>
          <AlertDialogCancel className="rounded-full" data-testid="bodychart-intimate-cancel">Annulla</AlertDialogCancel>
          <AlertDialogAction disabled={!a || !b} onClick={onConfirm} className="rounded-full bg-night" data-testid="bodychart-intimate-confirm">Continua e scatta</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

/** Foto reali ancorate al pin (fino a 4): metadati rimossi e cifratura lato server, miniature caricate solo quando servono. */
export const PinPhotos = ({ cid, m, onChange, meta = {}, onMeta }) => {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(null);
  const [ask, setAsk] = useState(false);
  const [ok, setOk] = useState(false);
  const photos = m.photos ?? [];
  const intimate = isIntimate(m.view, m.x, m.y);
  const start = () => (intimate && !ok ? setAsk(true) : ref.current?.click());
  const pick = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setBusy(true);
    try {
      const r = await api.uploadBodychartPhoto(cid, f, { view: m.view, x: m.x, y: m.y, conferma_necessita: ok, conferma_consenso: ok });
      onMeta?.(r.id, { reserved: r.reserved, created_at: r.created_at });
      onChange({ ...m, photos: [...photos, r.id] });
      toast.success(r.reserved ? "Foto riservata allegata (metadati rimossi, cifrata)" : "Foto allegata: metadati rimossi e cifrata");
    } catch (er) { toast.error(errMsg(er)); }
    setBusy(false);
  };
  return (
    <div className="mt-3" data-testid="bodychart-pin-photos">
      <div className="flex flex-wrap gap-2">
        {photos.map((p) => (
          <div key={p} className="group relative">
            <Thumb id={p} reserved={meta[p]?.reserved} onClick={() => setOpen(p)} testId={`bodychart-photo-${p}`} />
            <button onClick={() => onChange({ ...m, photos: photos.filter((x) => x !== p) })} className="absolute -right-1.5 -top-1.5 grid h-6 w-6 place-items-center rounded-full bg-white text-rose-700 shadow ring-1 ring-slate-200" aria-label="Rimuovi foto" data-testid={`bodychart-photo-remove-${p}`}><X size={12} /></button>
          </div>
        ))}
        {photos.length < 4 && (
          <button onClick={start} disabled={busy} className="flex h-16 min-w-[64px] flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-slate-300 px-3 text-[11px] font-medium text-night transition-colors hover:border-night" data-testid="bodychart-photo-add">
            {busy ? <Loader2 size={18} className="animate-spin" /> : intimate ? <Lock size={18} strokeWidth={1.5} /> : <Camera size={18} strokeWidth={1.5} />} {photos.length ? "Altra foto" : intimate ? "Foto riservata" : "Scatta / allega foto"}
          </button>
        )}
      </div>
      <input ref={ref} type="file" accept="image/*" capture="environment" className="hidden" onChange={pick} data-testid="bodychart-photo-input" />
      <IntimateConfirm open={ask} onOpenChange={setAsk} onConfirm={() => { setOk(true); setAsk(false); setTimeout(() => ref.current?.click(), 50); }} />
      <PhotoLightbox src={open && api.bodychartPhotoUrl(open)} caption={m.note} onClose={() => setOpen(null)} />
    </div>
  );
};
