import { useCallback, useEffect, useRef, useState } from "react";

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
      if (segSec.current >= SEGMENT_SEC && stream.current) {
        segSec.current = 0;
        const old = rec.current;
        rec.current = makeRecorder(stream.current); // la nuova parte parte prima di chiudere la vecchia: nessun buco
        old?.stop();
      }
    }, 1000);
    return () => clearInterval(t);
  }, [state, makeRecorder]);

  const start = async () => {
    const s = await navigator.mediaDevices.getUserMedia({ audio: true });
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
    setSeconds(0);
    setState("recording");
  };

  const pause = () => { rec.current?.pause(); setState("paused"); };
  const resume = () => { rec.current?.resume(); setState("recording"); };

  /** Ferma la registrazione e restituisce le parti audio in ordine (Blob[]). */
  const stop = async () => {
    const r = rec.current;
    if (!r) return [];
    rec.current = null;
    if (r.state !== "inactive") r.stop();
    await Promise.all(pending.current);
    cleanup();
    setState("idle");
    return blobs.current.filter((b) => b && b.size);
  };

  return { state, seconds, parts, start, pause, resume, stop, analyser };
};

export const fmtClock = (s) => {
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};
