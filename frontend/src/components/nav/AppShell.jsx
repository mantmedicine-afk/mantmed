import { createContext, useContext, useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Menu, X, LogOut, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { LogoMark } from "@/components/dash/Logo";
import { MantAIButton } from "@/components/mantai/MantAI";
import { useAuth } from "@/lib/auth";

const ShellCtx = createContext({ open: () => {} });

export const MenuButton = ({ dark }) => {
  const { open } = useContext(ShellCtx);
  return (
    <button onClick={open} className={`grid h-10 w-10 shrink-0 place-items-center rounded-full transition-colors lg:hidden ${dark ? "border border-[#C9CCD3]/30 text-white hover:border-white" : "border border-slate-200 text-night hover:border-night"}`} aria-label="Apri il menu di navigazione" data-testid="sidebar-open-btn">
      <Menu size={18} />
    </button>
  );
};

const Item = ({ it, onNav, mini }) => (
  <NavLink to={it.to} end={it.end} onClick={onNav} data-testid={`sidebar-link-${it.id}`} title={mini ? it.label : undefined} aria-label={mini ? it.label : undefined}
    className={({ isActive }) => `group relative flex min-h-[48px] items-center gap-3 rounded-2xl py-2 text-[15px] font-medium transition-colors duration-200 ${mini ? "justify-center px-0" : "px-3.5"} ${isActive ? "bg-white text-night" : "text-[#C9CCD3] hover:bg-white/10 hover:text-white"}`}>
    {({ isActive }) => (
      <>
        <span className={`absolute -left-3 top-1/2 h-7 w-1 -translate-y-1/2 rounded-r-full bg-[#A9C2FF] transition-opacity ${isActive ? "opacity-100" : "opacity-0"}`} />
        <it.icon size={19} className={`shrink-0 transition-transform duration-200 group-hover:scale-110 ${isActive ? "text-night" : ""}`} />
        {mini ? <span className="sr-only" aria-current={isActive ? "page" : undefined}>{it.label}</span> : <span className="min-w-0 flex-1 leading-tight" aria-current={isActive ? "page" : undefined}>{it.label}</span>}
        {it.badge > 0 && (mini
          ? <span className="absolute right-2 top-2 grid h-4 min-w-4 place-items-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white" data-testid={`sidebar-badge-${it.id}`}>{it.badge > 9 ? "9+" : it.badge}</span>
          : <span className="grid h-5 min-w-5 place-items-center rounded-full bg-rose-600 px-1.5 text-[11px] font-bold text-white" data-testid={`sidebar-badge-${it.id}`}>{it.badge > 9 ? "9+" : it.badge}</span>)}
      </>
    )}
  </NavLink>
);

const Panel = ({ items, area, onNav, onClose, mini, onToggle }) => {
  const { user, logout } = useAuth();
  return (
    <div className={`flex h-full flex-col bg-[#0A192F] pb-5 pt-5 text-white ${mini ? "px-3" : "px-4"}`}>
      <div className={`flex items-center gap-2 px-1 ${mini ? "justify-center" : "justify-between"}`}>
        <div className="flex items-center gap-3"><LogoMark size={36} light />{!mini && <div className="leading-none"><div className="font-display text-2xl">MantMed</div><div className="mt-1 text-[10px] uppercase tracking-[0.22em] text-[#C9CCD3]">{area}</div></div>}</div>
        {onClose && <button onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full border border-white/20 hover:bg-white hover:text-night" aria-label="Chiudi menu" data-testid="sidebar-close-btn"><X size={17} /></button>}
      </div>
      <nav className={`mt-8 flex-1 space-y-1.5 overflow-y-auto pl-3`} aria-label="Navigazione principale" data-testid="sidebar-nav">
        {items.map((it) => <Item key={it.id} it={it} onNav={onNav} mini={mini} />)}
      </nav>
      <MantAIButton variant="sidebar" view={user?.role === "parent" ? "patient" : "doctor"} mini={mini} />
      {onToggle && (
        <button onClick={onToggle} className={`mb-3 flex h-11 items-center gap-2 rounded-2xl text-sm text-[#C9CCD3] transition-colors hover:bg-white/10 hover:text-white ${mini ? "justify-center" : "px-3.5"}`}
          aria-label={mini ? "Espandi la barra laterale" : "Riduci la barra alle icone"} title={mini ? "Espandi" : "Riduci alle icone"} aria-expanded={!mini} data-testid="sidebar-collapse-btn">
          {mini ? <PanelLeftOpen size={19} /> : <><PanelLeftClose size={19} /> Riduci barra</>}
        </button>
      )}
      {mini ? (
        <button onClick={() => logout()} className="grid h-11 w-full place-items-center rounded-2xl border border-white/15 text-white transition-colors hover:bg-white hover:text-night" aria-label="Esci" title={`Esci · ${user?.name ?? ""}`} data-testid="sidebar-logout-btn"><LogOut size={17} /></button>
      ) : (
      <div className="rounded-2xl border border-white/10 p-3">
        <div className="truncate text-sm font-medium" data-testid="sidebar-user-name">{user?.name}</div>
        <div className="truncate text-xs text-slate-300">{user?.email}</div>
        <button onClick={() => logout()} className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-full border border-white/20 text-sm text-white transition-colors hover:bg-white hover:text-night" data-testid="sidebar-logout-btn"><LogOut size={15} /> Esci</button>
      </div>)}
    </div>
  );
};

const KEY = "mantmed.sidebar.mini";

export const AppShell = ({ items, area, children }) => {
  const [open, setOpen] = useState(false);
  const [mini, setMini] = useState(() => { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } });
  const toggle = () => setMini((m) => { const v = !m; try { localStorage.setItem(KEY, v ? "1" : "0"); } catch { /* storage non disponibile */ } return v; });
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
      <aside className={`fixed inset-y-0 left-0 z-40 hidden transition-[width] duration-300 ease-out lg:block ${mini ? "w-[84px]" : "w-[264px]"}`} data-testid="sidebar" data-mini={mini}><Panel items={items} area={area} mini={mini} onToggle={toggle} /></aside>
      <div className={`fixed inset-0 z-[55] lg:hidden ${open ? "" : "pointer-events-none"}`} aria-hidden={!open}>
        <div onClick={() => setOpen(false)} className={`absolute inset-0 bg-[#0A192F]/50 backdrop-blur-sm transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0"}`} data-testid="sidebar-backdrop" />
        <div className={`absolute inset-y-0 left-0 w-[min(86vw,300px)] shadow-2xl transition-transform duration-300 ease-out ${open ? "translate-x-0" : "-translate-x-full"}`} data-testid="sidebar-drawer">
          <Panel items={items} area={area} onNav={() => setOpen(false)} onClose={() => setOpen(false)} />
        </div>
      </div>
      <div className={`transition-[padding] duration-300 ease-out ${mini ? "lg:pl-[84px]" : "lg:pl-[264px]"}`}>{children}</div>
    </ShellCtx.Provider>
  );
};
