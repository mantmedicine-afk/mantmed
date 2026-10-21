import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { ChevronDown, Loader2, Send, Save, Star } from "lucide-react";
import { api, errMsg } from "@/lib/api";

export const ST = {
  nuovo: { label: "Nuovi", one: "Nuovo", cls: "bg-amber-100 text-amber-900" },
  in_lavorazione: { label: "In lavorazione", one: "In lavorazione", cls: "bg-sky-100 text-sky-900" },
  risolto: { label: "Risolti", one: "Risolto", cls: "bg-emerald-100 text-emerald-900" },
};
const QUICK = [
  "Grazie per la segnalazione: il nostro team la sta già verificando e la aggiorneremo a breve.",
  "Abbiamo risolto il problema: può riprovare dal suo account. Se dovesse ripresentarsi ci scriva pure.",
  "Grazie del suo feedback, è prezioso: lo terremo in considerazione nei prossimi aggiornamenti di MantMed.",
];
const fmt = (iso) => new Date(iso).toLocaleString("it-IT", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export const SupportRow = ({ item: i, onChange }) => {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(i.note);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState("");
  const run = async (key, fn, msg) => { setBusy(key); try { onChange(await fn()); if (msg) toast.success(msg); } catch (e) { toast.error(errMsg(e)); } setBusy(""); };
  const send = async (resolve) => {
    setBusy(resolve ? "resolve" : "reply");
    try {
      const r = await api.replyFeedback(i.id, { text: reply, resolve });
      onChange(r);
      setReply("");
      if (r.reply_email_sent) toast.success(`Risposta inviata a ${i.email} e mostrata nel suo account`);
      else toast.warning("Risposta salvata e visibile nell'account dell'utente, ma l'email non è stata recapitata");
    } catch (e) { toast.error(e?.response?.status >= 500 ? "Invio non riuscito: riprovi tra qualche istante" : errMsg(e)); }
    setBusy("");
  };
  const st = ST[i.status] ?? ST.nuovo;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white" data-testid={`inbox-item-${i.id}`}>
      <button onClick={() => setOpen((o) => !o)} className="grid w-full grid-cols-[1fr_auto] items-center gap-3 p-4 text-left md:grid-cols-[220px_200px_minmax(0,1fr)_120px_16px]" data-testid={`inbox-toggle-${i.id}`}>
        <div className="min-w-0"><div className="truncate font-medium text-night">{i.name}</div><div className="truncate text-xs text-slate-600">{i.role_label} · {i.email}</div></div>
        <div className="hidden text-xs text-slate-600 md:block"><span className="font-semibold text-night">{i.kind_label}</span><div>{fmt(i.created_at)}</div></div>
        <div className="hidden truncate text-sm text-slate-600 md:block">{i.text || "—"}</div>
        <span className={`rounded-full px-3 py-1 text-[11px] font-semibold ${st.cls}`} data-testid={`inbox-status-${i.id}`}>{st.one}</span>
        <ChevronDown size={16} className={`hidden text-slate-500 transition-transform md:block ${open ? "rotate-180" : ""}`} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
            <div className="grid grid-cols-1 gap-5 border-t border-slate-100 p-4 lg:grid-cols-2">
              <div className="space-y-3 text-sm text-night">
                <div className="text-xs text-slate-600">{i.kind_label} · {i.area_label}{i.rating ? <span className="ml-2 inline-flex items-center gap-1"><Star size={12} className="fill-night" /> {i.rating}/5</span> : null}</div>
                <p className="whitespace-pre-wrap" data-testid={`inbox-text-${i.id}`}>{i.text || <span className="text-slate-500">Nessun testo.</span>}</p>
                {i.tech && <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600" data-testid={`inbox-tech-${i.id}`}>Pagina: {i.tech.page} · Schermo: {i.tech.screen} · {i.tech.language}<div className="mt-1 break-all">{i.tech.user_agent}</div></div>}
                {i.replies.map((r, n) => <div key={n} className="rounded-xl border-l-2 border-night bg-[#F3F6FF] p-3 text-sm" data-testid={`inbox-reply-${i.id}-${n}`}><div className="text-[11px] text-slate-500">Risposta del {fmt(r.at)}{r.email_sent === false ? " · email non recapitata, visibile solo in app" : ""}</div><p className="mt-1 whitespace-pre-wrap">{r.text}</p></div>)}
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(ST).map(([id, s]) => <button key={id} disabled={!!busy || i.status === id} onClick={() => run("st", () => api.patchFeedback(i.id, { status: id }), `Segnato come ${s.one.toLowerCase()}`)} className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-opacity disabled:opacity-100 ${i.status === id ? s.cls : "border border-slate-200 text-slate-600 hover:border-night"}`} data-testid={`inbox-set-${id}-${i.id}`}>{s.one}</button>)}
                </div>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Nota interna (non visibile all'utente)" className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm outline-none focus:border-night" data-testid={`inbox-note-${i.id}`} />
                <button onClick={() => run("note", () => api.patchFeedback(i.id, { note }), "Nota salvata")} disabled={!!busy || note === i.note} className="flex h-9 items-center gap-1.5 rounded-full border border-slate-200 px-4 text-sm disabled:opacity-40" data-testid={`inbox-note-save-${i.id}`}>{busy === "note" ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Salva nota</button>
              </div>
              <div className="space-y-2">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Risposta rapida · email + avviso in app</div>
                <div className="flex flex-wrap gap-1.5">{QUICK.map((q, n) => <button key={n} onClick={() => setReply(q)} className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:border-night" data-testid={`inbox-quick-${n}-${i.id}`}>{["Presa in carico", "Risolto", "Grazie del feedback"][n]}</button>)}</div>
                <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={5} placeholder={`Scrivi a ${i.name}…`} className="w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-night" data-testid={`inbox-reply-input-${i.id}`} />
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => send(false)} disabled={!!busy || reply.trim().length < 2} className="flex h-10 items-center gap-1.5 rounded-full bg-night px-4 text-sm font-semibold text-white disabled:opacity-40" data-testid={`inbox-send-${i.id}`}>{busy === "reply" ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Invia risposta</button>
                  <button onClick={() => send(true)} disabled={!!busy || reply.trim().length < 2} className="flex h-10 items-center gap-1.5 rounded-full border border-emerald-300 px-4 text-sm font-semibold text-emerald-800 disabled:opacity-40" data-testid={`inbox-send-resolve-${i.id}`}>{busy === "resolve" && <Loader2 size={14} className="animate-spin" />} Invia e segna risolto</button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
