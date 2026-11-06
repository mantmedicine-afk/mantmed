export const DONE = ["completato", "completed"];
export const CANCELLED = ["annullato", "cancelled"];
export const nowHM = (d = new Date()) => d.toTimeString().slice(0, 5);
export const shortClinic = (c = "") => { const s = c.replace(/^Studio\s+/i, ""); return s.charAt(0).toUpperCase() + s.slice(1); };
export const isDone = (a) => DONE.includes(a.status);
export const toMin = (hm) => { const [h, m] = hm.split(":").map(Number); return h * 60 + m; };

export const untilLabel = (time, now) => {
  const d = toMin(time) - toMin(now);
  if (d <= 0) return "adesso";
  if (d < 60) return `tra ${d} min`;
  const h = Math.floor(d / 60), m = d % 60;
  return `tra ${h} h${m ? ` ${m} min` : ""}`;
};

export const LONG_DATE = (d = new Date()) => {
  const s = d.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export const greeting = (d = new Date()) => (d.getHours() < 13 ? "Buongiorno" : d.getHours() < 18 ? "Buon pomeriggio" : "Buonasera");
export const surname = (name = "") => { const m = name.match(/^(Dott\.ssa|Dott\.)\s+.*\s(\S+)$/); return m ? `${m[1]} ${m[2]}` : name; };
export const initials = (name = "") => name.replace(/^(Dott\.ssa|Dott\.)\s*/, "").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
