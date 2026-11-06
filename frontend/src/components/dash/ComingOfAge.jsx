import { useEffect, useState } from "react";
import { Cake } from "lucide-react";
import { http } from "@/lib/api";

const fmt = (d) => new Date(`${d}T12:00:00`).toLocaleDateString("it-IT", { day: "numeric", month: "long" });

// Pazienti che compiono 18 anni nei prossimi 30 giorni: l'accesso dei tutori si chiuderà
export const ComingOfAge = () => {
  const [items, setItems] = useState([]);
  useEffect(() => { http.get("/access/coming-of-age").then((r) => setItems(r.data)).catch(() => {}); }, []);
  if (!items.length) return null;
  return (
    <div className="mx-5 mb-4 rounded-2xl border border-[var(--hair)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--fg)] lg:mx-8" data-testid="coming-of-age">
      <div className="flex items-center gap-2 font-semibold"><Cake size={15} /> Compiono 18 anni nei prossimi 30 giorni</div>
      <ul className="mt-1.5 space-y-1">
        {items.map((p) => (
          <li key={p.id} data-testid={`coming-of-age-${p.id}`}>{p.name} · {fmt(p.adult_on)}{!p.has_email && <span className="text-[var(--late)]"> · manca l'email del paziente per l'invito</span>}</li>
        ))}
      </ul>
    </div>
  );
};
