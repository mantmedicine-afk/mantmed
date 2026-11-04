import { useCallback, useEffect, useRef, useState } from "react";
import { micConstraints } from "@/lib/mic";

// Visite lunghe: ogni 10 minuti di registrazione si chiude una parte audio autonoma (file valido a sé)
// e se ne apre subito un'altra sullo stesso microfono, senza interruzioni. Ogni parte resta sotto i 25 MB di Whisper.
export const SEGMENT_SEC = 600;

export const useRecorder = () => {
  const [state, setState] = useState("idle");
  const [seconds, setSeconds] = useState(0);
  const [parts, setParts] = useState(0);
  const rec = useRef(null);
  const segSec = useRef(0);
  const blobs = useRef([]);
  const pending = useRef([]);
  const stream = useRef(null);
  const ctx = useRef(null);
  const analyser = useRef(null);
  const mime = useRef("");
  // Blocchi brevi (es. 30 s) per la checklist in tempo reale: secondo registratore sullo stesso microfono, file autonomi
  const chunkRec = useRef(null);
  const chunkCfg = useRef(null);
  const chunkSec = useRef(0);
  const chunkSeq = useRef(0);
  const chunkDone = useRef(Promise.resolve());

  const makeChunk = useCallback((s) => {
    const seq = chunkSeq.current++;
    const parts = [];
    const r = new MediaRecorder(s, mime.current ? { mimeType: mime.current } : undefined);
    r.ondataavailable = (e) => { if (e.data.size) parts.push(e.data); };
    chunkDone.current = new Promise((resolve) => {
      r.onstop = () => { const b = new Blob(parts, { type: r.mimeType || "audio/webm" }); if (b.size) chunkCfg.current?.onChunk(b, seq); resolve(); };
    });
    r.start(1000);
    return r;
  }, []);

  const cleanup = useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop());
    ctx.current?.close().catch(() => {});
    ctx.current = null;
    analyser.current = null;
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  const makeRecorder = useCallback((s) => {
    const idx = pending.current.length;
    const chunks = [];
    const r = new MediaRecorder(s, mime.current ? { mimeType: mime.current } : undefined);
    r.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    pending.current.push(new Promise((resolve) => {
      r.onstop = () => { blobs.current[idx] = new Blob(chunks, { type: r.mimeType || "audio/webm" }); resolve(); };
    }));
    r.start(1000);
    setParts(idx + 1);
    return r;
  }, []);

  useEffect(() => {
    if (state !== "recording") return undefined;
    const t = setInterval(() => {
      setSeconds((x) => x + 1);
      segSec.current += 1;
      chunkSec.current += 1;
      if (chunkCfg.current && chunkSec.current >= chunkCfg.current.every && stream.current) {
        chunkSec.current = 0;
        const old = chunkRec.current;
        chunkRec.current = makeChunk(stream.current);
        old?.stop();
      }
      if (segSec.current >= SEGMENT_SEC && stream.current) {
        segSec.current = 0;
        const old = rec.current;
        rec.current = makeRecorder(stream.current); // la nuova parte parte prima di chiudere la vecchia: nessun buco
        old?.stop();
      }
    }, 1000);
    return () => clearInterval(t);
  }, [state, makeRecorder, makeChunk]);

  const start = async (chunks = null) => {
    if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error("unsupported"), { name: "NotSupportedError" });
    let timer;
    const s = await Promise.race([
      navigator.mediaDevices.getUserMedia(micConstraints()),
      new Promise((_, rej) => { timer = setTimeout(() => rej(Object.assign(new Error("timeout"), { name: "TimeoutError" })), 20000); }),
    ]).finally(() => clearTimeout(timer));
    stream.current = s;
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx.current = new AC();
    analyser.current = ctx.current.createAnalyser();
    analyser.current.fftSize = 128;
    ctx.current.createMediaStreamSource(s).connect(analyser.current);
    mime.current = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
    blobs.current = [];
    pending.current = [];
    segSec.current = 0;
    rec.current = makeRecorder(s);
    chunkCfg.current = chunks;
    chunkSec.current = 0;
    chunkSeq.current = 0;
    chunkRec.current = chunks ? makeChunk(s) : null;
    setSeconds(0);
    setState("recording");
  };

  const pause = () => { rec.current?.pause(); chunkRec.current?.pause(); setState("paused"); };
  const resume = () => { rec.current?.resume(); chunkRec.current?.resume(); setState("recording"); };

  /** Ferma la registrazione e restituisce le parti audio in ordine (Blob[]). */
  const stop = async () => {
    const r = rec.current;
    if (!r) return [];
    rec.current = null;
    if (r.state !== "inactive") r.stop();
    const c = chunkRec.current;
    chunkRec.current = null;
    if (c && c.state !== "inactive") c.stop();
    await Promise.all([...pending.current, chunkDone.current]);
    chunkCfg.current = null;
    cleanup();
    setState("idle");
    return blobs.current.filter((b) => b && b.size);
  };

  return { state, seconds, parts, start, pause, resume, stop, analyser, chunkCount: () => chunkSeq.current };
};

export const fmtClock = (s) => {
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};
