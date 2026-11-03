import { useState } from "react";
import { NavLink } from "react-router-dom";
import { MantAIMark } from "@/components/mantai/MantAILogo";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MantAIDialog } from "@/components/mantai/MantAI";
import { initials } from "./data";

const LINKS = [["/app", "Oggi", "oggi"], ["/app/pazienti", "Pazienti", "pazienti"], ["/app/messaggi", "Messaggi", "messaggi"], ["/app/cassa", "Cassa", "cassa"]];

export const Brand = () => (
  <NavLink to="/app" className="flex items-center gap-2.5 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A192F]" data-testid="oggi-logo">
    <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-[#0A192F] text-[15px] font-bold text-white" aria-hidden="true">M</span>
    <span className="text-[17px] font-semibold tracking-tight text-[#0A192F]">MantMed</span>
  </NavLink>
);

const NavLinks = ({ unread }) => (
  <nav className="hidden items-center gap-1 md:flex" aria-label="Navigazione principale" data-testid="oggi-nav">
    {LINKS.map(([to, label, id]) => (
      <NavLink key={to} to={to} end className={({ isActive }) => `relative flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium transition-colors hover:bg-[#F2F2EF] ${isActive ? "text-[#0A192F] underline decoration-2 underline-offset-[10px]" : "text-[#475569]"}`} data-testid={`oggi-nav-${id}`}>
        {label}
        {id === "messaggi" && unread > 0 && <><span className="h-[7px] w-[7px] rounded-full bg-[#3B6CF6]" aria-hidden="true" data-testid="oggi-nav-unread-dot" /><span className="sr-only">{unread} non letti</span></>}
      </NavLink>
    ))}
  </nav>
);

const Avatar = ({ user, onLogout, onNav }) => {
  const [mantai, setMantai] = useState(false);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="grid h-9 w-9 place-items-center rounded-full bg-[#0A192F] text-xs font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B6CF6] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FBFBF8]" aria-label="Menu profilo" data-testid="oggi-avatar-btn">{initials(user?.name)}</button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64 rounded-2xl border-[#DCDDDF] bg-white p-1.5 text-[#0A192F]" data-testid="oggi-avatar-menu">
          <DropdownMenuLabel className="px-2.5 py-2 text-sm font-semibold" data-testid="oggi-avatar-name">{user?.name} · <span className="font-normal text-[#475569]">{user?.specialty || "Pediatria"}</span></DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-[#DCDDDF]" />
          {[["Impostazioni", () => onNav("/app/impostazioni"), "settings"], ["Strumenti", () => onNav("/app/strumenti"), "tools"], ["Cos'è MantAI", () => setMantai(true), "mantai"], ["Esci", onLogout, "logout"]].map(([l, fn, id]) => (
            <DropdownMenuItem key={id} onSelect={fn} className="cursor-pointer rounded-xl px-2.5 py-2 text-sm focus:bg-[#F2F2EF] focus:text-[#0A192F]" data-testid={`oggi-menu-${id}`}>{l}</DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <MantAIDialog open={mantai} onOpenChange={setMantai} />
    </>
  );
};

export const OggiTopBar = ({ user, unread, onStart, onLogout, onNav }) => (
  <header className="sticky top-0 z-40 border-b border-[#0A192F]/10 bg-white/85 backdrop-blur-xl" data-testid="oggi-topbar">
    <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-4 px-4 sm:px-6">
      <Brand />
      <NavLinks unread={unread} />
      <div className="flex items-center gap-2.5">
        <button onClick={onStart} className="hidden h-9 items-center gap-2 rounded-full bg-[#0A192F] pl-2 pr-4 text-sm font-semibold text-white transition-colors hover:bg-[#13284A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A192F] sm:flex" data-testid="oggi-topbar-start-btn"><MantAIMark size={20} light /> Inizia visita</button>
        <Avatar user={user} onLogout={onLogout} onNav={onNav} />
      </div>
    </div>
  </header>
);
