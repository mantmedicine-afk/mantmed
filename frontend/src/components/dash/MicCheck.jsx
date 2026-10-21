import { useEffect, useRef, useState } from "react";
import { Loader2, Mic, X } from "lucide-react";
import { MIC_KEY, micConstraints, micError, savedMic } from "@/lib/mic";

const BARS = 24;
const verdict = (lvl) => (lvl < 6 ? ["Troppo basso: si avvicini al microfono o alzi il volume", "text-amber-300", "low"]
  : lvl > 85 ? ["Troppo alto: si allontani leggermente dal microfono", "text-rose-300", "high"]
  : ["Livello buono: la voce viene captata correttamente", "text-emerald-300", "good"]);

const useMicLevel = (active, deviceId) => {
  const [level, setLevel] = useState(0);
  const [devices, setDevices] = useState([]);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!active) return undefined;
    let stream, ctx, raf, dead = false;
    setReady(false);
    setError("");
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error(), { name: "NotSupportedError" });
        stream = await navigator.mediaDevices.getUserMedia(micConstraints(deviceId));
        if (dead) return stream.getTracks().forEach((t) => t.stop());
        setDevices((await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "audioinput"));
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        const an = ctx.createAnalyser();
        an.fftSize = 1024;
        ctx.createMediaStreamSource(stream).connect(an);
        const buf = new Float32Array(an.fftSize);
        let smooth = 0;
        const tick = () => {
          an.getFloatTimeDomainData(buf);
          const rms = Math.sqrt(buf.reduce((s, v) => s + v * v, 0) / buf.length);
          smooth = Math.max(rms, smooth * 0.9);
          setLevel(Math.min(100, Math.round(smooth * 300)));
          raf = requestAnimationFrame(tick);
        };
        setReady(true);
        tick();
      } catch (e) { if (!dead) setError(micError(e)); }
    })();
    return () => { dead = true; cancelAnimationFrame(raf); stream?.getTracks().forEach((t) => t.stop()); ctx?.close().catch(() => {}); setLevel(0); };
  }, [active, deviceId]);
  return { level, devices, error, ready };
};

export const MicCheck = () => {
  const [open, setOpen] = useState(false);
  const [deviceId, setDeviceId] = useState(savedMic());
  const { level, devices, error, ready } = useMicLevel(open, deviceId);
  const heard = useRef(0);
  if (level > heard.current) heard.current = level;
  const [text, cls, key] = verdict(level);
  const pick = (id) => { localStorage.setItem(MIC_KEY, id); setDeviceId(id); };

  if (!open) return (
    <button type="button" onClick={() => { heard.current = 0; setOpen(true); }} className="flex items-center gap-2 text-sm text-slate-300 transition-colors hover:text-white" data-testid="mic-check-btn">
      <Mic size={15} /> Prova microfono e livello audio
    </button>
  );
  return (
    <div className="rounded-2xl border border-white/15 bg-white/[0.04] p-4" data-testid="mic-check-panel">
      <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.2em] text-slate-300">
        <span className="flex items-center gap-1.5"><Mic size={13} /> Prova microfono</span>
        <button type="button" onClick={() => setOpen(false)} className="flex items-center gap-1 normal-case tracking-normal text-[#A9C2FF] hover:text-white" data-testid="mic-check-close"><X size={13} /> Fine prova</button>
      </div>
      {error ? <p role="alert" className="mt-3 text-sm text-rose-200" data-testid="mic-check-error">{error}</p> : !ready ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-slate-300" data-testid="mic-check-waiting"><Loader2 size={14} className="animate-spin" /> Consenta l'accesso al microfono…</p>
      ) : (
        <>
          {devices.length > 1 && (
            <select value={deviceId || devices[0]?.deviceId} onChange={(e) => pick(e.target.value)} className="mt-3 w-full rounded-xl border border-white/15 bg-night px-3 py-2 text-sm text-white outline-none" data-testid="mic-check-device">
              {devices.map((d, i) => <option key={d.deviceId || i} value={d.deviceId}>{d.label || `Microfono ${i + 1}`}</option>)}
            </select>
          )}
          <div className="mt-4 flex h-10 items-end gap-1" data-testid="mic-check-meter" data-level={level}>
            {Array.from({ length: BARS }, (_, i) => {
              const on = level >= ((i + 1) / BARS) * 100;
              const color = i > BARS * 0.85 ? "bg-rose-400" : i > BARS * 0.6 ? "bg-amber-300" : "bg-emerald-400";
              return <span key={i} className={`flex-1 rounded-sm transition-[height,opacity] duration-75 ${on ? color : "bg-white/10"}`} style={{ height: `${30 + (i / BARS) * 70}%` }} />;
            })}
          </div>
          <p className={`mt-3 text-sm ${heard.current < 6 ? "text-slate-300" : cls}`} data-testid="mic-check-verdict" data-verdict={heard.current < 6 ? "silent" : key}>
            {heard.current < 6 ? "Parli normalmente per qualche secondo: l'indicatore si muove con la sua voce" : text}
          </p>
        </>
      )}
    </div>
  );
};
