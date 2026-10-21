import { useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, Loader2, X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { api, errMsg } from "@/lib/api";

export const PhotoLightbox = ({ src, caption, onClose }) => (
  <Dialog open={!!src} onOpenChange={(o) => !o && onClose()}>
    <DialogContent className="w-[calc(100%-1rem)] max-w-4xl border-0 bg-[#0A192F] p-2 sm:p-3 [&>button]:rounded-full [&>button]:bg-white [&>button]:p-1 [&>button]:text-night [&>button]:opacity-100" data-testid="bodychart-photo-lightbox">
      <DialogTitle className="sr-only">Foto del reperto</DialogTitle>
      {src && <img src={src} alt={caption} className="max-h-[80vh] w-full rounded-xl object-contain" />}
      {caption && <p className="px-2 pb-1 text-sm text-[#C9CCD3]">{caption}</p>}
    </DialogContent>
  </Dialog>
);

/** Foto reali ancorate al pin: fotocamera del tablet o galleria, fino a 4 per reperto. */
export const PinPhotos = ({ cid, m, onChange }) => {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(null);
  const photos = m.photos ?? [];
  const pick = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setBusy(true);
    try { const r = await api.uploadBodychartPhoto(cid, f); onChange({ ...m, photos: [...photos, r.id] }); toast.success("Foto allegata al marcatore: salvi il bodychart per confermare"); } catch (er) { toast.error(errMsg(er)); }
    setBusy(false);
  };
  return (
    <div className="mt-3" data-testid="bodychart-pin-photos">
      <div className="flex flex-wrap gap-2">
        {photos.map((p) => (
          <div key={p} className="group relative">
            <button onClick={() => setOpen(p)} className="block h-16 w-16 overflow-hidden rounded-xl ring-1 ring-slate-200" data-testid={`bodychart-photo-${p}`}><img src={api.bodychartPhotoUrl(p)} alt="Foto reperto" className="h-full w-full object-cover" /></button>
            <button onClick={() => onChange({ ...m, photos: photos.filter((x) => x !== p) })} className="absolute -right-1.5 -top-1.5 grid h-6 w-6 place-items-center rounded-full bg-white text-rose-700 shadow ring-1 ring-slate-200" aria-label="Rimuovi foto" data-testid={`bodychart-photo-remove-${p}`}><X size={12} /></button>
          </div>
        ))}
        {photos.length < 4 && (
          <button onClick={() => ref.current?.click()} disabled={busy} className="flex h-16 min-w-[64px] flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-slate-300 px-3 text-[11px] font-medium text-night transition-colors hover:border-night" data-testid="bodychart-photo-add">
            {busy ? <Loader2 size={18} className="animate-spin" /> : <Camera size={18} strokeWidth={1.5} />} {photos.length ? "Altra foto" : "Scatta / allega foto"}
          </button>
        )}
      </div>
      <input ref={ref} type="file" accept="image/*" capture="environment" className="hidden" onChange={pick} data-testid="bodychart-photo-input" />
      <PhotoLightbox src={open && api.bodychartPhotoUrl(open)} caption={m.note} onClose={() => setOpen(null)} />
    </div>
  );
};
