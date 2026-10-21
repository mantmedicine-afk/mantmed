import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plane } from "lucide-react";
import { api } from "@/lib/api";

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fmt = (s) => new Date(`${s}T12:00:00`).toLocaleDateString("it-IT", { day: "numeric", month: "short" });

export const AbsenceBanner = () => {
  const [items, setItems] = useState([]);
  useEffect(() => {
    let alive = true;
    api.account().then((r) => { if (alive) setItems(Array.isArray(r?.absences) ? r.absences : []); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  const today = iso(new Date());
  const soon = iso(new Date(Date.now() + 14 * 86400000));
  const list = items.filter((a) => a.to >= today && a.from <= soon);
  if (!list.length) return null;
  return (
    <div className="mx-auto max-w-[1440px] px-5 pb-4 lg:px-8" data-testid="absence-banner">
      <Link to="/app/impostazioni?sezione=orari" className="flex flex-wrap items-center gap-3 rounded-2xl bg-amber-50 p-4 text-sm text-amber-950 ring-1 ring-amber-200 transition-colors hover:bg-amber-100">
        <Plane size={18} className="shrink-0" />
        {list.map((a) => (
          <span key={a.id} data-testid={`absence-banner-${a.id}`}><strong>{a.from <= today ? "Assente oggi" : "Assenza"}</strong> {a.from === a.to ? fmt(a.from) : `${fmt(a.from)} – ${fmt(a.to)}`}{a.reason ? ` · ${a.reason}` : ""} · prenotazioni online bloccate</span>
        ))}
      </Link>
    </div>
  );
};
