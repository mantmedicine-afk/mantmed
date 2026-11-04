import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

const RETRIES = 3;
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`);

const SECTION = { anamnesi: "Anamnesi", sintomi: "Motivo e sintomi", parametri_vitali: "Parametri vitali", esame_obiettivo: "Esame obiettivo", altro: "Accertamenti e altro" };
export const toChecklist = (t) => ({ id: t.id, name: t.name, fields: (t.fields ?? []).map((f) => ({ id: f.id, section: SECTION[f.gruppo] ?? "Altro", label: f.titolo, required: Boolean(f.required), hint: f.hint })) });

const AGE_RE = /(\d+)\s*°?\s*(mese|mesi|anno|anni)/i;
// Scelta automatica: bilancio per età (dal motivo o dalla data di nascita), altrimenti per tipo di visita
export const autoTemplate = (ts, reason = "", ageM = null) => {
  const bil = ts.filter((t) => t.bilancio);
  if (/bilancio/i.test(reason) && bil.length) {
    const m = reason.match(AGE_RE);
    const months = m ? Number(m[1]) * (/ann/i.test(m[2]) ? 12 : 1) : ageM;
    if (months == null) return bil[0];
    const dist = (t) => (months >= t.age_from && months < t.age_to ? -1 : Math.min(Math.abs(months - t.age_from), Math.abs(months - t.age_to)));
    return bil.reduce((a, b) => (dist(b) < dist(a) ? b : a));
  }
  const kind = /certificat|sport|idoneit/i.test(reason) ? "certificato" : /ricontroll|controllo|follow/i.test(reason) ? "controllo"
    : /febbre|tosse|otite|mal di|acut|malatt|vomito|diarrea|dolor|raffreddore|faringite|eruzione/i.test(reason) ? "acuta" : "prima";
  return ts.find((t) => t.kind === kind) ?? ts.find((t) => !t.bilancio) ?? ts[0];
};

const DEMO = [[/peso/i, "7,4 kg (50° pc)"], [/lunghezza|altezza/i, "66 cm (50° pc)"], [/cranica/i, "43 cm (75° pc)"], [/vaccin/i, "Esavalente 2ª dose eseguita"],
  [/sviluppo|tappe/i, "Tappe adeguate per l'età"], [/aliment/i, "Allattamento misto, svezzamento iniziato"], [/sonno/i, "Dorme 10 ore"], [/pressione/i, "100/60 mmHg"],
  [/frequenza cardiaca/i, "82 bpm"], [/motivo|sintomo/i, "Febbre da 2 giorni"], [/diagnosi|valutazione/i, "Nella norma"], [/indicazioni|terapia/i, "Vitamina D 400 UI/die"]];
const demoText = (label) => (DEMO.find(([re]) => re.test(label))?.[1] ?? "Nella norma");

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
      if (next) detected([{ id: next.id, preview: demoText(next.label) }]);
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
