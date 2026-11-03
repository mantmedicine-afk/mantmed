import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { useEffect, useState } from "react";
import { LogOut, ShieldCheck, MessageSquarePlus, Compass, MessagesSquare } from "lucide-react";
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
    <header className="sticky top-0 z-40 border-b border-[var(--hair)] bg-[var(--bg)]">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-3 px-5 py-3 lg:px-8">
        <div className="flex min-w-0 flex-1 items-center gap-3"><MenuButton />{search && <GlobalSearch {...search} />}</div>
        <div className="hidden whitespace-nowrap text-center 2xl:block">
          <div className="text-[11px] uppercase tracking-[0.22em] text-[var(--fg2)]">Oggi</div>
          <div className="text-sm font-medium capitalize text-[var(--fg)]" data-testid="topbar-date">{fmtDate(now)}</div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="hidden font-mono text-lg text-[var(--fg)] tabular-nums xl:block" data-testid="topbar-clock">{fmtTime(now)}</div>
          <ThemeToggle />
          <ProfileMenu onSecurity={onCompliance} onTour={onTour} trigger={
            <button className="flex items-center gap-2 rounded-full border border-[var(--hair)] bg-[var(--surface)] py-1 pl-1 pr-3 text-[var(--fg)] transition-colors hover:border-[var(--accent)]" data-testid="doctor-chip" aria-label="Il mio profilo">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-[var(--accent)] text-xs font-semibold text-[var(--ink)]">{initials(name)}</span>
              <span className="hidden max-w-[180px] truncate text-sm font-medium xl:inline">{name}</span><Caret />
            </button>} />
          <button onClick={onTour} className="flex h-10 items-center gap-2 rounded-full border border-[var(--hair)] px-3 text-sm font-medium text-[var(--fg2)] transition-colors hover:border-[var(--accent)] hover:text-[var(--fg)]" data-testid="tour-open-button" aria-label="Rivedi Tour / Guida" title="Rivedi Tour / Guida">
            <Compass size={16} /><span className="hidden whitespace-nowrap 2xl:inline">Rivedi Tour</span>
          </button>
          <button onClick={onFeedback} className="hidden lg:flex h-10 items-center gap-2 rounded-full border border-[var(--hair)] px-3 text-sm font-medium text-[var(--fg2)] transition-colors hover:border-[var(--accent)] hover:text-[var(--fg)]" data-testid="feedback-beta-button" aria-label="Feedback e assistenza" title="Feedback e assistenza">
            <MessageSquarePlus size={16} /><span className="hidden whitespace-nowrap 2xl:inline">Feedback e assistenza</span>
          </button>
          <button onClick={() => nav("/app/messaggi")} className="relative grid h-10 w-10 place-items-center rounded-full border border-[var(--hair)] text-[var(--fg2)] transition-colors hover:border-[var(--accent)] hover:text-[var(--fg)]" data-testid="topbar-messages-btn" aria-label={`Messaggi dalle famiglie${unread ? `: ${unread} non letti` : ""}`} title="Messaggi dalle famiglie">
            <MessagesSquare size={16} />
            {unread > 0 && <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-[var(--alert)] px-1 text-[11px] font-bold text-[var(--ink)] ring-2 ring-[var(--ink)]" data-testid="topbar-messages-badge">{unread > 9 ? "9+" : unread}</span>}
          </button>
          <button onClick={onCompliance} className="hidden lg:grid h-10 w-10 place-items-center rounded-full border border-[var(--hair)] text-[var(--fg2)] transition-colors hover:border-[var(--accent)] hover:text-[var(--fg)]" data-testid="compliance-button" aria-label="Sicurezza e GDPR" title="Sicurezza e GDPR">
            <ShieldCheck size={16} />
          </button>
          <button onClick={() => logout()} className="grid h-10 w-10 place-items-center rounded-full border border-[var(--hair)] text-[var(--fg2)] transition-colors hover:border-[var(--accent)] hover:text-[var(--fg)]" data-testid="logout-button" aria-label="Esci" title="Esci">
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </header>
  );
};
