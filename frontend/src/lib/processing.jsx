import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";
import { api, errMsg } from "@/lib/api";

/**
 * Elaborazioni IA dei referti in background (Whisper + compilazione cartella).
 * track(c) avvia il monitoraggio, subscribe(id, cb) riceve la visita aggiornata quando è pronta o fallita.
 */
const Ctx = createContext({ jobs: {}, track: () => {}, subscribe: () => () => {}, retry: async () => {} });
const POLL = 2000;

export const ProcessingProvider = ({ children, onSettled, onOpen }) => {
  const [jobs, setJobs] = useState({});
  const listeners = useRef(new Map());
  const settledRef = useRef(onSettled);
  const openRef = useRef(onOpen);
  settledRef.current = onSettled;
  openRef.current = onOpen;

  const track = useCallback((c) => {
    if (!c?.id || c.status !== "processing") return;
    setJobs((j) => (j[c.id] ? j : { ...j, [c.id]: { id: c.id, patient_name: c.patient_name, since: Date.now() } }));
  }, []);

  const subscribe = useCallback((id, cb) => {
    if (!listeners.current.has(id)) listeners.current.set(id, new Set());
    listeners.current.get(id).add(cb);
    return () => listeners.current.get(id)?.delete(cb);
  }, []);

  const retry = useCallback(async (id, transcript = "") => {
    try {
      const c = await api.retryConsultation(id, transcript);
      listeners.current.get(id)?.forEach((cb) => cb(c));
      track(c);
      return c;
    } catch (e) { toast.error(errMsg(e)); return null; }
  }, [track]);

  const ids = Object.keys(jobs).join(",");
  useEffect(() => {
    if (!ids) return undefined;
    let alive = true;
    const tick = async () => {
      for (const id of ids.split(",")) {
        let c;
        try { c = await api.getConsultation(id); } catch (e) { if (e?.response?.status === 404) c = { id, status: "gone" }; else continue; }
        if (!alive || c.status === "processing") continue;
        setJobs((j) => { const n = { ...j }; delete n[id]; return n; });
        if (c.status === "gone") continue;
        const watching = (listeners.current.get(id)?.size ?? 0) > 0;
        listeners.current.get(id)?.forEach((cb) => cb(c));
        settledRef.current?.(c);
        if (c.status === "ready") {
          toast.success(`Referto pronto · ${c.patient_name}`, {
            description: watching ? "La cartella è stata compilata dall'IA: controlli e salvi." : "Cartella clinica compilata dall'IA.",
            action: watching ? undefined : { label: "Apri", onClick: () => openRef.current?.(c) },
            duration: 7000,
            position: "bottom-right",
          });
        } else {
          toast.error(`Elaborazione non riuscita · ${c.patient_name}`, {
            description: c.ai_error || "Riprovi tra qualche istante.",
            action: { label: watching ? "Riprova" : "Apri", onClick: () => (watching ? retry(id) : openRef.current?.(c)) },
            duration: 12000,
            position: "bottom-right",
          });
        }
      }
    };
    const t = setInterval(() => { if (!document.hidden) tick(); }, POLL);
    return () => { alive = false; clearInterval(t); };
  }, [ids, retry]);

  const value = useMemo(() => ({ jobs, track, subscribe, retry }), [jobs, track, subscribe, retry]);
  return <Ctx.Provider value={value}>{children}<ProcessingIndicator jobs={jobs} /></Ctx.Provider>;
};

export const useProcessing = () => useContext(Ctx);

const ProcessingIndicator = ({ jobs }) => {
  const list = Object.values(jobs);
  return (
    <AnimatePresence>
      {list.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -12, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -12, scale: 0.96 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className="pointer-events-none fixed right-3 top-[76px] z-50 sm:right-5"
          role="status"
          aria-live="polite"
          data-testid="processing-indicator"
        >
          <div className="flex items-center gap-3 rounded-full border border-slate-200 bg-white/95 py-2 pl-2 pr-4 text-night shadow-[0_10px_30px_-12px_rgba(10,25,47,0.35)] backdrop-blur">
            <span className="relative grid h-8 w-8 place-items-center rounded-full bg-night text-white">
              <Loader2 size={15} className="animate-spin" />
              <Sparkles size={9} className="absolute -right-0.5 -top-0.5 text-[#A9C2FF]" />
            </span>
            <span className="leading-tight">
              <span className="block text-xs font-semibold sm:text-sm">Elaborazione referto in corso…</span>
              <span className="hidden max-w-[220px] truncate text-[11px] text-slate-500 sm:block" data-testid="processing-indicator-names">
                {list.length === 1 ? list[0].patient_name : `${list.length} referti · ${list.map((j) => j.patient_name).join(", ")}`}
              </span>
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
