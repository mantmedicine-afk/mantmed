import { useEffect, useState } from "react";
import { LogOut } from "lucide-react";
import { Logo } from "./Logo";
import { useAuth } from "@/lib/auth";

const initials = (n) => n.replace(/^(Dott\.ssa|Dott\.|Dr\.)\s*/i, "").split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();

const fmtDate = (d) => d.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
const fmtTime = (d) => d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });

export const TopBar = () => {
  const { user, logout } = useAuth();
  const name = user?.name || "Medico";
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 20000);
    return () => clearInterval(t);
  }, []);
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-5 py-3 lg:px-8">
        <Logo />
        <div className="hidden text-center md:block">
          <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Oggi</div>
          <div className="text-sm font-medium capitalize text-night" data-testid="topbar-date">{fmtDate(now)}</div>
        </div>
        <div className="flex items-center gap-3">
          <div className="font-mono text-lg text-night tabular-nums" data-testid="topbar-clock">{fmtTime(now)}</div>
          <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-3" data-testid="doctor-chip">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-night text-xs font-semibold text-white">{initials(name)}</span>
            <span className="hidden text-sm font-medium text-night sm:inline">{name}</span>
          </div>
          <button onClick={logout} className="grid h-10 w-10 place-items-center rounded-full border border-slate-200 text-slate-600 transition-colors hover:border-night hover:text-night" data-testid="logout-button" aria-label="Esci" title="Esci">
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </header>
  );
};
