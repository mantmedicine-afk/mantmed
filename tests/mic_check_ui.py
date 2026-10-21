# MicCheck UI test (playwright script body for browser_automation tool)
INIT = r"""
window.__gumCalls = []; window.__gumMode = 'ok'; window.__gains = []; window.__gainVal = 0.1; window.__stopped = 0;
window.__setGain = (v) => { window.__gainVal = v; window.__gains.forEach(g => g.gain.value = v); };
const md = navigator.mediaDevices || {};
md.enumerateDevices = async () => [
  { kind: 'audioinput', deviceId: 'mic-A', label: 'Microfono A (USB)', groupId: 'a' },
  { kind: 'audioinput', deviceId: 'mic-B', label: 'Microfono B (Cuffie)', groupId: 'b' },
  { kind: 'audiooutput', deviceId: 'spk', label: 'Speaker', groupId: 'c' },
];
md.getUserMedia = async (c) => {
  window.__gumCalls.push(JSON.stringify(c));
  if (window.__gumMode === 'deny') throw new DOMException('denied', 'NotAllowedError');
  const ctx = new AudioContext(); const o = ctx.createOscillator(); const g = ctx.createGain();
  g.gain.value = window.__gainVal; o.connect(g); const d = ctx.createMediaStreamDestination(); g.connect(d); o.start();
  window.__gains.push(g);
  d.stream.getTracks().forEach(t => { const s = t.stop.bind(t); t.stop = () => { window.__stopped++; s(); }; });
  return d.stream;
};
"""
