import { useCallback, useEffect, useRef, useState } from "react";

export const useRecorder = () => {
  const [state, setState] = useState("idle");
  const [seconds, setSeconds] = useState(0);
  const rec = useRef(null);
  const chunks = useRef([]);
  const stream = useRef(null);
  const ctx = useRef(null);
  const analyser = useRef(null);

  useEffect(() => {
    if (state !== "recording") return undefined;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [state]);

  const cleanup = useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop());
    ctx.current?.close().catch(() => {});
    ctx.current = null;
    analyser.current = null;
  }, []);

  useEffect(() => {
    return () => cleanup();
  }, [cleanup]);

  const start = async () => {
    const s = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.current = s;
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx.current = new AC();
    analyser.current = ctx.current.createAnalyser();
    analyser.current.fftSize = 128;
    ctx.current.createMediaStreamSource(s).connect(analyser.current);
    chunks.current = [];
    const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
    rec.current = new MediaRecorder(s, mime ? { mimeType: mime } : undefined);
    rec.current.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
    rec.current.start(1000);
    setSeconds(0);
    setState("recording");
  };

  const pause = () => { rec.current?.pause(); setState("paused"); };
  const resume = () => { rec.current?.resume(); setState("recording"); };

  const stop = () => new Promise((resolve) => {
    const r = rec.current;
    if (!r) return resolve(null);
    r.onstop = () => {
      cleanup();
      setState("idle");
      resolve(new Blob(chunks.current, { type: r.mimeType || "audio/webm" }));
    };
    r.stop();
  });

  return { state, seconds, start, pause, resume, stop, analyser };
};

export const fmtClock = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
