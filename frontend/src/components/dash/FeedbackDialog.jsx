import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Star, Loader2, Send, Check, AlertTriangle, RotateCcw, MessageSquareHeart, LifeBuoy, Bug } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { api, errMsg } from "@/lib/api";

export const AREAS = [
  { id: "trascrizione", label: "Trascrizione Ambientale / Wispr Flow" },
  { id: "pdf", label: "Generazione PDF" },
  { id: "agenda", label: "Agenda Multi-Studio" },
  { id: "cassa", label: "Cassa" },
  { id: "altro", label: "Altro" },
];
const KINDS = [
  { id: "feedback", label: "Feedback", icon: MessageSquareHeart, ph: "Es. la trascrizione ha perso un termine durante l'otoscopia…" },
  { id: "supporto", label: "Supporto tecnico", icon: LifeBuoy, ph: "Descriva di cosa ha bisogno: la contatteremo all'email del suo account." },
  { id: "segnalazione", label: "Segnala un problema", icon: Bug, ph: "Cosa stava facendo, cosa si aspettava e cosa è successo invece…" },
];
const LABELS = ["", "Molto difficile", "Faticoso", "Accettabile", "Fluido", "Impeccabile"];
const newId = () => (window.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);
const techInfo = () => ({ page: window.location.pathname + window.location.search, user_agent: navigator.userAgent, screen: `${window.screen.width}x${window.screen.height}`, language: navigator.language });
const Label = ({ children }) => <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">{children}</div>;

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

const ThankYou = ({ onClose, parent }) => (
  <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="py-6 text-center" data-testid="feedback-thanks">
    <motion.div initial={{ scale: 0.6 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 260, damping: 18 }} className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-night text-white"><Check size={28} /></motion.div>
    <div className="mt-5 text-[11px] uppercase tracking-[0.24em] text-slate-500">Messaggio inviato · MantMed</div>
    <h3 className="mt-2 font-display text-3xl text-night">Grazie!</h3>
    <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-slate-600" data-testid="feedback-thanks-text">Il tuo messaggio è stato inviato con successo al team di MantMed. Se serve, ti risponderemo all'email del tuo account.</p>
    <button onClick={onClose} className="mt-6 h-11 rounded-full border border-slate-200 px-6 text-sm font-medium text-night hover:border-night" data-testid="feedback-close-btn">{parent ? "Torna al portale" : "Torna alla dashboard"}</button>
  </motion.div>
);

const SendError = ({ msg, onRetry, busy }) => (
  <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900" role="alert" data-testid="feedback-error">
    <span className="flex items-center gap-2"><AlertTriangle size={16} className="shrink-0" /> {msg}</span>
    <button onClick={onRetry} disabled={busy} className="flex h-9 items-center gap-1.5 rounded-full bg-rose-700 px-4 text-sm font-semibold text-white disabled:opacity-60" data-testid="feedback-retry-btn"><RotateCcw size={14} /> Riprova</button>
  </div>
);

export const FeedbackDialog = ({ open, onClose, onSent, parent = false }) => {
  const [kind, setKind] = useState("feedback");
  const [rating, setRating] = useState(0);
  const [area, setArea] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const cid = useRef(newId());
  const k = KINDS.find((x) => x.id === kind);

  const close = () => { onClose(); setTimeout(() => { setKind("feedback"); setRating(0); setArea(""); setText(""); setDone(false); setError(""); cid.current = newId(); }, 200); };
  const submit = async () => {
    if (kind === "feedback" && !rating) return toast.error("Assegni un punteggio di usabilità");
    if (!area) return toast.error("Selezioni l'area del messaggio");
    if (kind !== "feedback" && text.trim().length < 5) return toast.error("Descriva la richiesta in qualche parola");
    setBusy(true);
    setError("");
    try {
      await (parent ? api.sendPortalFeedback : api.sendFeedback)({ kind, rating: kind === "feedback" ? rating : null, area, text, client_id: cid.current, tech: kind === "segnalazione" ? techInfo() : null });
      setDone(true);
      toast.success("Grazie! Il tuo messaggio è stato inviato con successo al team di MantMed");
      onSent?.();
    } catch (e) { setError(e?.response ? errMsg(e) : "Connessione assente: verifichi la rete e riprovi."); }
    setBusy(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto rounded-3xl bg-white sm:max-w-lg" data-testid="feedback-dialog">
        {done ? <ThankYou onClose={close} parent={parent} /> : (
          <>
            <DialogHeader>
              <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Feedback e assistenza</div>
              <DialogTitle className="font-display text-3xl font-normal text-night">Scrivi al team MantMed</DialogTitle>
              <DialogDescription className="text-sm text-slate-600">Il messaggio arriva direttamente al nostro team, che le risponderà all'email del suo account.</DialogDescription>
            </DialogHeader>
            <div className="space-y-5">
              <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Tipo di messaggio">
                {KINDS.map(({ id, label, icon: I }) => (
                  <button key={id} type="button" role="radio" aria-checked={kind === id} onClick={() => setKind(id)} className={`flex flex-col items-center gap-1.5 rounded-2xl border px-2 py-3 text-xs font-medium transition-colors ${kind === id ? "border-night bg-night text-white" : "border-slate-200 text-night hover:border-night"}`} data-testid={`feedback-kind-${id}`}><I size={18} /> {label}</button>
                ))}
              </div>
              {kind === "feedback" && <div data-testid="feedback-rating"><Label>Usabilità</Label><Stars value={rating} onChange={setRating} /></div>}
              <div>
                <Label>Area</Label>
                <div className="flex flex-wrap gap-2">
                  {AREAS.map((a) => (
                    <button key={a.id} type="button" onClick={() => setArea(a.id)} aria-pressed={area === a.id} className={`rounded-full border px-4 py-2 text-sm transition-colors ${area === a.id ? "border-night bg-night text-white" : "border-slate-200 text-night hover:border-night"}`} data-testid={`feedback-area-${a.id}`}>{a.label}</button>
                  ))}
                </div>
              </div>
              <div>
                <Label>{kind === "feedback" ? "Note dal campo" : "Messaggio"}</Label>
                <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={4000} rows={4} placeholder={k.ph} className="w-full resize-none rounded-2xl border border-slate-200 bg-[#F4F5F7] p-3 text-sm text-night outline-none focus:border-night" data-testid="feedback-text-input" />
                {kind === "segnalazione" && <p className="mt-1.5 text-xs text-slate-500" data-testid="feedback-tech-note">Allegheremo in automatico pagina aperta, browser e dispositivo per riprodurre il problema.</p>}
              </div>
              {error && <SendError msg={error} onRetry={submit} busy={busy} />}
              <button onClick={submit} disabled={busy} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-night text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 disabled:opacity-60" data-testid="feedback-submit-btn">
                {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} {busy ? "Invio in corso…" : "Invia al team MantMed"}
              </button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
