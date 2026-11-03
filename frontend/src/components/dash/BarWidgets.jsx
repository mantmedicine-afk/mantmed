import { useEffect, useState } from "react";
import { CircleHelp, Sun, Cloud, CloudRain } from "lucide-react";
import { api } from "@/lib/api";

export const TourButton = ({ onClick, testId = "tour-open-button", className = "" }) => (
  <button onClick={onClick} className={`grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[var(--hair)] text-[var(--ink)] transition-colors hover:bg-[var(--sel)] ${className}`} aria-label="Rivedi tour / guida" title="Rivedi tour / guida" data-testid={testId}>
    <CircleHelp size={17} />
  </button>
);

const fmt = (d) => d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

export const LiveClock = () => {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  return <time dateTime={now.toISOString()} className="hidden shrink-0 px-1 font-mono text-base tabular-nums text-[var(--ink)] lg:block" data-testid="bar-clock">{fmt(now)}</time>;
};

const iconFor = (code) => (code <= 1 ? Sun : code >= 51 ? CloudRain : Cloud);
const labelFor = (code) => (code <= 1 ? "sereno" : code >= 51 ? "pioggia" : "nuvoloso");

const getJson = (url) => fetch(url).then((r) => { if (!r.ok) throw new Error("meteo"); return r.json(); });

const current = (lat, lon) => getJson(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code`).then((r) => r.current);

const reverseCity = async (lat, lon) => {
  const k = `mantmed.city.${lat.toFixed(2)},${lon.toFixed(2)}`;
  const hit = localStorage.getItem(k);
  if (hit) return hit;
  const r = await getJson(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=10&accept-language=it`);
  const c = r.address?.city || r.address?.town || r.address?.village || r.address?.municipality || "";
  if (c) localStorage.setItem(k, c);
  return c;
};

// Indirizzo libero ("Via Roma 1, 20100 Milano (MI)") -> candidati città, dal fondo
const cityCandidates = (addr = "") => addr.split(",").map((p) => p.replace(/\(.*?\)/g, "").replace(/\d+/g, "").trim()).filter((p) => p && !/^(via|viale|piazza|corso|largo|vicolo)\b/i.test(p)).reverse();

const geocode = async (names) => {
  for (const n of names) {
    const r = await getJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(n)}&count=1&language=it&countryCode=IT`).catch(() => null);
    if (r?.results?.[0]) return r.results[0];
  }
  return null;
};

const studioPlace = async () => geocode(cityCandidates((await api.account())?.studio_address));
const studioCity = async () => (await studioPlace())?.name || "";

const fromStudio = async () => {
  const g = await studioPlace();
  if (!g) return null;
  return { city: g.name, ...(await current(g.latitude, g.longitude)) };
};

const fromBrowser = () => new Promise((ok, ko) => {
  if (!navigator.geolocation) return ko(new Error("geo"));
  navigator.geolocation.getCurrentPosition(async ({ coords: { latitude: la, longitude: lo } }) => {
    try {
      const [city, cur] = await Promise.all([reverseCity(la, lo).catch(() => ""), current(la, lo)]);
      ok({ city: city || (await studioCity().catch(() => "")), ...cur });
    } catch (e) { ko(e); }
  }, ko, { timeout: 8000, maximumAge: 30 * 60 * 1000 });
});

export const Weather = () => {
  const [w, setW] = useState(null);
  useEffect(() => {
    let alive = true;
    fromBrowser().catch(() => fromStudio()).then((v) => alive && v && setW(v)).catch(() => {});
    return () => { alive = false; };
  }, []);
  if (!w || w.temperature_2m == null) return null;
  const Icon = iconFor(w.weather_code);
  return (
    <div className="hidden shrink-0 items-center gap-1.5 rounded-full border border-[var(--hair)] bg-[var(--surface)] px-3 py-1.5 text-sm font-medium text-[var(--fg)] sm:flex" title={`Meteo attuale: ${labelFor(w.weather_code)}`} data-testid="topbar-weather">
      <Icon size={16} aria-label={labelFor(w.weather_code)} data-testid="topbar-weather-icon" />
      {w.city && <span className="max-w-[140px] truncate" data-testid="topbar-weather-city">{w.city}</span>}
      <span className="tabular-nums" data-testid="topbar-weather-temp">{Math.round(w.temperature_2m)}°</span>
    </div>
  );
};
