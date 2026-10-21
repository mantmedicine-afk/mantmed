import { useEffect, useState } from "react";
import { LogOut, ShieldCheck, MessageSquarePlus, Compass, MessagesSquare } from "lucide-react";
import { Logo } from "./Logo";
import { useAuth } from "@/lib/auth";
import { useNavigate } from "react-router-dom";
import { MenuButton } from "@/components/nav/AppShell";
import { ProfileMenu, Caret } from "@/components/auth/ProfileMenu";
import { GlobalSearch } from "@/components/search/GlobalSearch";

const initials = (n) => n.replace(/^(Dott\.ssa|Dott\.|Dr\.)\s*/i, "").split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();

const fmtDate = (d) => d.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
const fmtTime = (d) => d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });

export const TopBar = ({ onCompliance, onFeedback, onTour, unread = 0, search }) => {
  const { user, logout } = useAuth();
  const name = user?.name || "Medico";
  const nav = useNavigate();
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 20000);
    return () => clearInterval(t);
  }, []);
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-5 py-3 lg:px-8">
        <div className="flex items-center gap-3"><MenuButton /><span className="hidden sm:inline lg:hidden"><Logo /></span>{search && <GlobalSearch {...search} />}</div>
        <div className="hidden text-center xl:block">
          <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Oggi</div>
          <div className="text-sm font-medium capitalize text-night" data-testid="topbar-date">{fmtDate(now)}</div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden font-mono text-lg text-night tabular-nums sm:block" data-testid="topbar-clock">{fmtTime(now)}</div>
          <ProfileMenu onSecurity={onCompliance} trigger={
            <button className="flex items-center gap-2 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-3 text-night transition-colors hover:border-night" data-testid="doctor-chip" aria-label="Il mio profilo">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-night text-xs font-semibold text-white">{initials(name)}</span>
              <span className="hidden text-sm font-medium sm:inline">{name}</span><Caret />
            </button>} />
          <button onClick={onTour} className="flex h-10 items-center gap-2 rounded-full border border-slate-200 px-3 text-sm font-medium text-slate-600 transition-colors hover:border-night hover:text-night" data-testid="tour-open-button" aria-label="Rivedi Tour / Guida" title="Rivedi Tour / Guida">
            <Compass size={16} /><span className="hidden lg:inline">Rivedi Tour</span>
          </button>
          <button onClick={onFeedback} className="flex h-10 items-center gap-2 rounded-full border border-slate-200 px-3 text-sm font-medium text-slate-600 transition-colors hover:border-night hover:text-night" data-testid="feedback-beta-button" aria-label="Invia feedback beta" title="Invia feedback beta">
            <MessageSquarePlus size={16} /><span className="hidden lg:inline">Feedback Beta</span>
          </button>
          <button onClick={() => nav("/app/messaggi")} className="relative grid h-10 w-10 place-items-center rounded-full border border-slate-200 text-slate-600 transition-colors hover:border-night hover:text-night" data-testid="topbar-messages-btn" aria-label={`Messaggi dalle famiglie${unread ? `: ${unread} non letti` : ""}`} title="Messaggi dalle famiglie">
            <MessagesSquare size={16} />
            {unread > 0 && <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-rose-600 px-1 text-[11px] font-bold text-white ring-2 ring-white" data-testid="topbar-messages-badge">{unread > 9 ? "9+" : unread}</span>}
          </button>
          <button onClick={onCompliance} className="grid h-10 w-10 place-items-center rounded-full border border-slate-200 text-slate-600 transition-colors hover:border-night hover:text-night" data-testid="compliance-button" aria-label="Sicurezza e GDPR" title="Sicurezza e GDPR">
            <ShieldCheck size={16} />
          </button>
          <button onClick={() => logout()} className="grid h-10 w-10 place-items-center rounded-full border border-slate-200 text-slate-600 transition-colors hover:border-night hover:text-night" data-testid="logout-button" aria-label="Esci" title="Esci">
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </header>
  );
};
