import { createContext, useContext, useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Menu, X, LogOut, MoreHorizontal } from "lucide-react";
import { MantAIButton } from "@/components/mantai/MantAI";
import { useAuth } from "@/lib/auth";

const ShellCtx = createContext({ open: () => {} });

export const MenuButton = ({ dark }) => {
  const { open } = useContext(ShellCtx);
  return (
    <button onClick={open} className={`grid h-11 w-11 shrink-0 place-items-center rounded-full transition-colors md:hidden ${dark ? "border border-[var(--hair)] text-[var(--ink)] hover:border-[var(--ink)]" : "border border-[var(--hair)] text-[var(--fg)] hover:border-[var(--accent)]"}`} aria-label="Apri il menu di navigazione" data-testid="sidebar-open-btn">
      <Menu size={18} />
    </button>
  );
};

const Item = ({ it, onNav, mini }) => (
  <NavLink to={it.to} end={it.end} onClick={onNav} data-testid={`sidebar-link-${it.id}`} title={mini ? it.label : undefined} aria-label={mini ? it.label : undefined}
    className={({ isActive }) => `group relative flex min-h-[48px] items-center gap-3 rounded-2xl py-2 text-[15px] font-medium transition-colors duration-200 ${mini ? "justify-center px-0" : "px-3.5"} ${isActive ? "bg-[var(--surface)] text-[var(--fg)]" : "text-[var(--fg2)] hover:bg-[var(--sel)] hover:text-[var(--ink)]"}`}>
    {({ isActive }) => (
      <>
        <span className={`absolute -left-3 top-1/2 h-7 w-1 -translate-y-1/2 rounded-r-full bg-[var(--accent)] transition-opacity ${isActive ? "opacity-100" : "opacity-0"}`} />
        <it.icon size={19} className={`shrink-0 transition-transform duration-200 group-hover:scale-110 ${isActive ? "text-[var(--fg)]" : ""}`} />
        {mini ? <span className="sr-only" aria-current={isActive ? "page" : undefined}>{it.label}</span> : <span className="min-w-0 flex-1 leading-tight" aria-current={isActive ? "page" : undefined}>{it.label}</span>}
        {it.badge > 0 && (mini
          ? <span className="absolute right-2 top-2 grid h-4 min-w-4 place-items-center rounded-full bg-[var(--alert)] px-1 text-[10px] font-bold text-[var(--ink)]" data-testid={`sidebar-badge-${it.id}`}>{it.badge > 9 ? "9+" : it.badge}</span>
          : <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[var(--alert)] px-1.5 text-[11px] font-bold text-[var(--ink)]" data-testid={`sidebar-badge-${it.id}`}>{it.badge > 9 ? "9+" : it.badge}</span>)}
      </>
    )}
  </NavLink>
);

const Panel = ({ items, area, onNav, onClose, mini, onToggle }) => {
  const { user, logout } = useAuth();
  return (
    <div className={`theme-bar flex h-full flex-col pb-5 pt-5 ${mini ? "px-3" : "px-4"}`}>
      <div className={`flex items-center gap-2 px-1 ${mini ? "justify-center" : "justify-between"}`}>
        <div className="flex items-center gap-3"><img src="/mantmed-logo-white.png" alt="" aria-hidden="true" className="h-8 w-auto shrink-0 object-contain" data-testid="nav-logo" />{!mini && <div className="leading-none"><div className="font-display text-2xl">MantMed</div><div className="mt-1 text-[10px] uppercase tracking-[0.22em] text-[var(--fg2)]">{area}</div></div>}</div>
        {onClose && <button onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full border border-[var(--hair)] hover:bg-[var(--surface)] hover:text-[var(--fg)]" aria-label="Chiudi menu" data-testid="sidebar-close-btn"><X size={17} /></button>}
      </div>
      <nav className={`mt-8 flex-1 space-y-1.5 overflow-y-auto pl-3`} aria-label="Navigazione principale" data-testid="sidebar-nav">
        {items.filter((it) => !it.bottom).map((it) => <Item key={it.id} it={it} onNav={onNav} mini={mini} />)}
        {items.some((it) => it.bottom) && <div className="!mt-4 border-t border-[var(--hair)] pt-3">{items.filter((it) => it.bottom).map((it) => <Item key={it.id} it={it} onNav={onNav} mini={mini} />)}</div>}
      </nav>
      <MantAIButton variant="sidebar" view={user?.role === "parent" ? "patient" : "doctor"} mini={mini} />
      {onToggle && (
        <button onClick={onToggle} className={`mb-3 flex h-11 items-center gap-2 rounded-2xl text-sm text-[var(--fg2)] transition-colors hover:bg-[var(--sel)] hover:text-[var(--ink)] ${mini ? "justify-center" : "px-3.5"}`}
          aria-label={mini ? "Espandi la barra laterale" : "Riduci la barra alle icone"} title={mini ? "Espandi" : "Riduci alle icone"} aria-expanded={!mini} data-testid="sidebar-collapse-btn">
          {mini ? <PanelLeftOpen size={19} /> : <><PanelLeftClose size={19} /> Riduci barra</>}
        </button>
      )}
      {mini ? (
        <button onClick={() => logout()} className="grid h-11 w-full place-items-center rounded-2xl border border-[var(--hair)] text-[var(--ink)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--fg)]" aria-label="Esci" title={`Esci · ${user?.name ?? ""}`} data-testid="sidebar-logout-btn"><LogOut size={17} /></button>
      ) : (
      <div className="rounded-2xl border border-[var(--hair)] p-3">
        <div className="truncate text-sm font-medium" data-testid="sidebar-user-name">{user?.name}</div>
        <div className="truncate text-xs text-[var(--fg2)]">{user?.email}</div>
        <button onClick={() => logout()} className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-full border border-[var(--hair)] text-sm text-[var(--ink)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--fg)]" data-testid="sidebar-logout-btn"><LogOut size={15} /> Esci</button>
      </div>)}
    </div>
  );
};


const HItem = ({ it, mini }) => (
  <NavLink to={it.to} end={it.end} data-testid={`sidebar-link-${it.id}`} title={mini ? it.label : undefined} aria-label={mini ? it.label : undefined}
    className={({ isActive }) => `group relative flex h-11 shrink-0 items-center gap-2 rounded-2xl px-3 text-[15px] font-medium transition-colors duration-200 ${isActive ? "bg-[var(--surface)] text-[var(--fg)]" : "text-[var(--fg2)] hover:bg-[var(--sel)] hover:text-[var(--ink)]"}`}>
    {({ isActive }) => (
      <>
        <span className={`absolute -bottom-[10px] left-1/2 h-1 w-7 -translate-x-1/2 rounded-t-full bg-[var(--accent)] transition-opacity ${isActive ? "opacity-100" : "opacity-0"}`} />
        <it.icon size={19} className={`shrink-0 transition-transform duration-200 group-hover:scale-110 ${isActive ? "text-[var(--fg)]" : ""}`} />
        {mini ? <span className="sr-only" aria-current={isActive ? "page" : undefined}>{it.label}</span> : <span className="whitespace-nowrap leading-tight" aria-current={isActive ? "page" : undefined}>{it.label}</span>}
        {it.badge > 0 && <span className={mini ? "absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-[var(--alert)] px-1 text-[10px] font-bold text-[var(--ink)]" : "grid h-5 min-w-5 place-items-center rounded-full bg-[var(--alert)] px-1.5 text-[11px] font-bold text-[var(--ink)]"} data-testid={`sidebar-badge-${it.id}`}>{it.badge > 9 ? "9+" : it.badge}</span>}
      </>
    )}
  </NavLink>
);

/** Computer e tablet: barra di navigazione orizzontale in cima alla pagina. */
const useMedia = (q) => {
  const [m, setM] = useState(() => window.matchMedia(q).matches);
  useEffect(() => { const mq = window.matchMedia(q); const f = () => setM(mq.matches); mq.addEventListener("change", f); return () => mq.removeEventListener("change", f); }, [q]);
  return m;
};

const TopNav = ({ items, area, mini: miniPref, testId, extras }) => {
  const { user, logout } = useAuth();
  const wide = useMedia("(min-width: 1536px)");
  const xl = useMedia("(min-width: 1280px)");
  const mini = miniPref || !xl;
  return (
    <header className="theme-bar" data-testid={testId} data-mini={miniPref}>
      <div className="flex h-16 items-center gap-4 px-5 lg:px-8">
        <div className="flex shrink-0 items-center gap-3"><img src="/mantmed-logo-white.png" alt="" aria-hidden="true" className="h-8 w-auto shrink-0 object-contain" data-testid="nav-logo" />{!mini && <div className="leading-none"><div className="font-display text-2xl">MantMed</div><div className="mt-1 text-[10px] uppercase tracking-[0.22em] text-[var(--fg2)]">{area}</div></div>}</div>
        <nav className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto overflow-y-hidden py-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Navigazione principale" data-testid="sidebar-nav">
          {items.filter((it) => !it.bottom).map((it) => <HItem key={it.id} it={it} mini={mini} />)}
          {items.some((it) => it.bottom) && <div className="flex items-center gap-1.5 border-l border-[var(--hair)] pl-1.5">{items.filter((it) => it.bottom).map((it) => <HItem key={it.id} it={it} mini={mini} />)}</div>}
        </nav>
        <div className="flex shrink-0 items-center gap-1.5 [&_[data-testid=mantai-sidebar-btn]]:mb-0 [&_[data-testid=mantai-sidebar-btn]]:px-3">
          <MantAIButton variant="sidebar" view={user?.role === "parent" ? "patient" : "doctor"} mini={mini || !wide} />
          {extras}
          {!mini && <div className="hidden max-w-[180px] text-right leading-tight min-[1800px]:block"><div className="truncate text-sm font-medium" data-testid="sidebar-user-name">{user?.name}</div><div className="truncate text-xs text-[var(--fg2)]">{user?.email}</div></div>}
          <button onClick={() => logout()} className={`flex h-10 items-center justify-center gap-2 rounded-full border border-[var(--hair)] text-sm text-[var(--ink)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--fg)] ${mini || !wide ? "w-10" : "px-4"}`} aria-label="Esci" title={`Esci · ${user?.name ?? ""}`} data-testid="sidebar-logout-btn"><LogOut size={15} />{!mini && wide && " Esci"}</button>
        </div>
      </div>
    </header>
  );
};

/** Smartphone: barra fissa in basso con le 4 voci principali + "Altro" (apre il menu completo). */
const BottomBar = ({ items, onMore }) => (
  <nav className="fixed inset-x-0 bottom-0 z-40 theme-bar grid grid-cols-5 border-t border-[var(--hair)] pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden" aria-label="Navigazione rapida" data-testid="bottom-nav">
    {items.filter((it) => !it.bottom).slice(0, 4).map((it) => (
      <NavLink key={it.id} to={it.to} end={it.end} data-testid={`bottom-link-${it.id}`}
        className={({ isActive }) => `relative flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${isActive ? "text-[var(--fg)]" : "text-[var(--fg2)]"}`}>
        <it.icon size={20} />{it.short ?? it.label}
        {it.badge > 0 && <span className="absolute right-[22%] top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-[var(--alert)] px-1 text-[10px] font-bold text-[var(--ink)]">{it.badge > 9 ? "9+" : it.badge}</span>}
      </NavLink>
    ))}
    <button onClick={onMore} className="flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-[var(--fg2)]" data-testid="bottom-link-altro"><MoreHorizontal size={20} /> Altro</button>
  </nav>
);

export const AppShell = ({ items, area, children, barExtras }) => {
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => { setOpen(false); }, [loc.pathname]);
  useEffect(() => {
    if (!open) return undefined;
    const esc = (e) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open]);
  return (
    <ShellCtx.Provider value={{ open: () => setOpen(true) }}>
      <div className="hidden md:block lg:hidden"><TopNav items={items} area={area} mini testId="sidebar-tablet" extras={barExtras} /></div>
      <div className="hidden lg:block"><TopNav items={items} area={area} mini={false} testId="sidebar" extras={barExtras} /></div>
      <div className={`fixed inset-0 z-[55] lg:hidden ${open ? "" : "pointer-events-none"}`} aria-hidden={!open}>
        <div onClick={() => setOpen(false)} className={`absolute inset-0 bg-[var(--scrim)] backdrop-blur-sm transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0"}`} data-testid="sidebar-backdrop" />
        <div className={`absolute inset-y-0 left-0 w-[min(86vw,300px)] transition-transform duration-300 ease-out ${open ? "translate-x-0 shadow-2xl" : "-translate-x-full"}`} data-testid="sidebar-drawer">
          <Panel items={items} area={area} onNav={() => setOpen(false)} onClose={() => setOpen(false)} />
        </div>
      </div>
      <BottomBar items={items} onMore={() => setOpen(true)} />
      <div className="app-min min-h-screen pb-[72px] md:pb-0">{children}</div>
    </ShellCtx.Provider>
  );
};
