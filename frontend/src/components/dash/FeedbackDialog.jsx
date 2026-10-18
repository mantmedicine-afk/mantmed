import { useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Star, Loader2, Send, Check } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { api, errMsg } from "@/lib/api";

export const AREAS = [
  { id: "trascrizione", label: "Trascrizione Ambientale / Wispr Flow" },
  { id: "pdf", label: "Generazione PDF" },
  { id: "agenda", label: "Agenda Multi-Studio" },
  { id: "cassa", label: "Cassa" },
  { id: "altro", label: "Altro" },
];
const LABELS = ["", "Molto difficile", "Faticoso", "Accettabile", "Fluido", "Impeccabile"];

const Stars = ({ value, onChange }) => {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <div className="flex items-center gap-1" onMouseLeave={() => setHover(0)} role="radiogroup" aria-label="Usabilità">
      {[1, 2, 3, 4, 5].map((n) => (
        <motion.button key={n} type="button" whileTap={{ scale: 0.85 }} onMouseEnter={() => setHover(n)} onClick={() => onChange(n)} role="radio" aria-checked={value === n} aria-label={`${n} su 5`} className="grid h-12 w-12 place-items-center rounded-full transition-colors hover:bg-slate-100" data-testid={`feedback-star-${n}`}>
          <Star size={28} strokeWidth={1.5} className={`transition-colors ${n <= shown ? "fill-night text-night" : "text-slate-300"}`} />
        </motion.button>
      ))}
      <span className="ml-2 text-sm text-slate-600" data-testid="feedback-rating-label">{LABELS[shown] || "Tocca per valutare"}</span>
    </div>
  );
};

const ThankYou = ({ onClose }) => (
  <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="py-6 text-center" data-testid="feedback-thanks">
    <motion.div initial={{ scale: 0.6 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 260, damping: 18 }} className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-night text-white"><Check size={28} /></motion.div>
    <div className="mt-5 text-[11px] uppercase tracking-[0.24em] text-slate-500">Programma Beta · MantMed</div>
    <h3 className="mt-2 font-display text-3xl text-night">Grazie, <span className="italic">di cuore.</span></h3>
    <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-slate-600">La sua osservazione dal campo è stata registrata. Ogni dettaglio ci aiuta a rendere lo studio più silenzioso, preciso e su misura.</p>
    <button onClick={onClose} className="mt-6 h-11 rounded-full border border-slate-200 px-6 text-sm font-medium text-night hover:border-night" data-testid="feedback-close-btn">Torna alla dashboard</button>
  </motion.div>
);

export const FeedbackDialog = ({ open, onClose, onSent }) => {
  const [rating, setRating] = useState(0);
  const [area, setArea] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const close = () => { onClose(); setTimeout(() => { setRating(0); setArea(""); setText(""); setDone(false); }, 200); };
  const submit = async () => {
    if (!rating) return toast.error("Assegni un punteggio di usabilità");
    if (!area) return toast.error("Selezioni l'area del commento");
    setBusy(true);
    try { await api.sendFeedback({ rating, area, text }); setDone(true); onSent?.(); }
    catch (e) { toast.error(errMsg(e)); }
    setBusy(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto rounded-3xl bg-white sm:max-w-lg" data-testid="feedback-dialog">
        {done ? <ThankYou onClose={close} /> : (
          <>
            <DialogHeader>
              <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Beta sul campo</div>
              <DialogTitle className="font-display text-3xl font-normal text-night">Invia feedback</DialogTitle>
              <DialogDescription className="text-sm text-slate-600">Annoti frizioni, idee o bug riscontrati durante la visita. Bastano pochi secondi.</DialogDescription>
            </DialogHeader>
            <div className="space-y-5">
              <div><div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Usabilità</div><Stars value={rating} onChange={setRating} /></div>
              <div>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Area</div>
                <div className="flex flex-wrap gap-2">
                  {AREAS.map((a) => (
                    <button key={a.id} type="button" onClick={() => setArea(a.id)} aria-pressed={area === a.id} className={`rounded-full border px-4 py-2 text-sm transition-colors ${area === a.id ? "border-night bg-night text-white" : "border-slate-200 text-night hover:border-night"}`} data-testid={`feedback-area-${a.id}`}>{a.label}</button>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Note dal campo</div>
                <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={4000} rows={4} placeholder="Es. la trascrizione ha perso un termine durante l'otoscopia…" className="w-full resize-none rounded-2xl border border-slate-200 bg-[#F4F5F7] p-3 text-sm text-night outline-none focus:border-night" data-testid="feedback-text-input" />
              </div>
              <button onClick={submit} disabled={busy} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-night text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 disabled:opacity-60" data-testid="feedback-submit-btn">
                {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Invia segnalazione
              </button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
