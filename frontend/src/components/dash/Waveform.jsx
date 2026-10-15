import { useEffect, useRef } from "react";

export const Waveform = ({ analyser, active }) => {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return undefined;
    const g = c.getContext("2d");
    let raf;
    const bars = 48;
    const draw = (t) => {
      const w = (c.width = c.offsetWidth * 2);
      const h = (c.height = c.offsetHeight * 2);
      g.clearRect(0, 0, w, h);
      const a = analyser.current;
      const data = a ? new Uint8Array(a.frequencyBinCount) : null;
      if (a && active) a.getByteFrequencyData(data);
      const bw = w / bars;
      for (let i = 0; i < bars; i++) {
        const v = data && active ? data[i % data.length] / 255 : 0.06 + 0.04 * Math.sin(t / 400 + i / 3);
        const bh = Math.max(6, v * h * 0.9);
        g.fillStyle = i % 6 === 0 ? "#7FA6FF" : "rgba(255,255,255,0.85)";
        g.beginPath();
        g.roundRect(i * bw + bw * 0.3, (h - bh) / 2, bw * 0.4, bh, bw * 0.2);
        g.fill();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [analyser, active]);
  return <canvas ref={ref} className="h-28 w-full" data-testid="recording-waveform" />;
};
