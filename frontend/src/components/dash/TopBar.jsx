import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { LogOut } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { MenuButton } from "@/components/nav/AppShell";
import { ProfileMenu, Caret } from "@/components/auth/ProfileMenu";
import { GlobalSearch } from "@/components/search/GlobalSearch";
import { Weather, TourButton } from "./BarWidgets";

const initials = (n) => n.replace(/^(Dott\.ssa|Dott\.|Dr\.)\s*/i, "").split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();

const fmtDate = (d) => d.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });

export const TopBar = ({ onCompliance, onTour, search }) => {
  const { user, logout } = useAuth();
  const name = user?.name || "Medico";
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--hair)] bg-[var(--bg)]">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-3 px-5 py-3 lg:px-8">
        <div className="flex min-w-0 flex-1 items-center gap-3"><MenuButton />{search && <GlobalSearch {...search} />}</div>
        <div className="hidden whitespace-nowrap text-center 2xl:block">
          <div className="text-[11px] uppercase tracking-[0.22em] text-[var(--fg2)]">Oggi</div>
          <div className="text-sm font-medium capitalize text-[var(--fg)]" data-testid="topbar-date">{fmtDate(new Date())}</div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Weather />
          <div className="flex items-center gap-2 md:hidden"><TourButton onClick={onTour} testId="tour-open-button-mobile" light /><ThemeToggle /></div>
          <ProfileMenu onSecurity={onCompliance} onTour={onTour} trigger={
            <button className="flex items-center gap-2 rounded-full border border-[var(--hair)] bg-[var(--surface)] py-1 pl-1 pr-3 text-[var(--fg)] transition-colors hover:border-[var(--accent)]" data-testid="doctor-chip" aria-label="Il mio profilo">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-[var(--accent)] text-xs font-semibold text-[var(--ink)]">{initials(name)}</span>
              <span className="hidden max-w-[180px] truncate text-sm font-medium xl:inline">{name}</span><Caret />
            </button>} />
          <button onClick={() => logout()} className="grid h-10 w-10 place-items-center rounded-full border border-[var(--hair)] text-[var(--fg2)] transition-colors hover:border-[var(--accent)] hover:text-[var(--fg)]" data-testid="logout-button" aria-label="Esci" title="Esci">
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </header>
  );
};
