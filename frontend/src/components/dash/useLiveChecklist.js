import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

const RETRIES = 3;
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`);

// Regola per scegliere il modello dal motivo della visita in agenda
export const pickChecklist = (models, reason = "") => models.find((m) => m.id !== "acuta" && new RegExp(m.match, "i").test(reason)) ?? models.find((m) => m.id === "acuta") ?? models[0];

/** Stato della checklist + coda dei blocchi audio da 30 s (invio in ordine, riprova in background). */
export const useLiveChecklist = ({ models, model, demo }) => {
  const [values, setValues] = useState({}); // id -> { status: "ai" | "manual", preview }
  const session = useRef(uid());
  const queue = useRef(Promise.resolve());
  const sent = useRef(new Set());
  const failed = useRef(new Map()); // seq -> blob
  const valuesRef = useRef(values);
  valuesRef.current = values;
  const fields = models.find((m) => m.id === model)?.fields ?? [];
  const fieldsRef = useRef(fields);
  fieldsRef.current = fields;

  const reset = useCallback(() => { setValues({}); session.current = uid(); sent.current = new Set(); failed.current = new Map(); queue.current = Promise.resolve(); }, []);

  const detected = (list) => setValues((v) => {
    const n = { ...v };
    list.forEach((d) => { if (!n[d.id]) n[d.id] = { status: "ai", preview: d.preview }; });
    return n;
  });

  const send = async (blob, seq, tries = RETRIES) => {
    const empty = fieldsRef.current.filter((f) => !valuesRef.current[f.id]).map(({ id, label, hint }) => ({ id, label, hint }));
    try {
      const r = await api.liveChunk(blob, session.current, seq, empty);
      sent.current.add(seq);
      failed.current.delete(seq);
      detected(r.detected ?? []);
    } catch {
      if (tries > 1) { await new Promise((ok) => setTimeout(ok, 4000)); return send(blob, seq, tries - 1); }
      failed.current.set(seq, blob);
    }
    return undefined;
  };

  const onChunk = useCallback((blob, seq) => { queue.current = queue.current.then(() => send(blob, seq)); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Modalità dimostrativa: spunta un campo ogni 6 s con dati finti, nessuna chiamata
  const [demoOn, setDemoOn] = useState(false);
  useEffect(() => {
    if (!demo || !demoOn) return undefined;
    const t = setInterval(() => {
      const next = fieldsRef.current.find((f) => !valuesRef.current[f.id]);
      if (next) detected([{ id: next.id, preview: `${next.label}: ${next.demo}` }]);
    }, 6000);
    return () => clearInterval(t);
  }, [demo, demoOn]);

  /** Al termine: attende la coda, ritenta i blocchi falliti; true se la trascrizione a blocchi è completa. */
  const flush = async (count) => {
    await queue.current;
    for (const [seq, blob] of [...failed.current.entries()]) await send(blob, seq, 2); // eslint-disable-line no-await-in-loop
    return count > 0 && [...Array(count).keys()].every((i) => sent.current.has(i));
  };

  const setManual = (id, text) => setValues((v) => {
    const n = { ...v };
    if (text.trim()) n[id] = { status: "manual", preview: text.trim() }; else delete n[id];
    return n;
  });

  const manualValues = () => Object.fromEntries(Object.entries(values).filter(([, x]) => x.status === "manual").map(([k, x]) => [k, x.preview]));

  const aiValues = () => Object.fromEntries(Object.entries(values).filter(([, x]) => x.status === "ai").map(([k, x]) => [k, x.preview]));

  return { values, fields, session, onChunk, flush, reset, setManual, manualValues, aiValues, setDemoOn };
};
