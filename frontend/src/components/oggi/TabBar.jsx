import { NavLink } from "react-router-dom";
import { Sun, Users, MessagesSquare, ReceiptText, Mic } from "lucide-react";

const Tab = ({ to, label, icon: Icon, dot, id }) => (
  <NavLink to={to} end className={({ isActive }) => `relative flex flex-1 flex-col items-center gap-1 py-2 text-[11px] font-medium ${isActive ? "text-[#22272B]" : "text-[#3A4045]"}`} data-testid={`oggi-tab-${id}`}>
    <Icon size={20} aria-hidden="true" />{label}
    {dot && <><span className="absolute right-[calc(50%-14px)] top-1.5 h-[7px] w-[7px] rounded-full bg-[#B98A57]" aria-hidden="true" /><span className="sr-only">messaggi non letti</span></>}
  </NavLink>
);

export const TabBar = ({ unread, onStart }) => (
  <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[#22272B]/10 bg-[#B9C1C7]/90 backdrop-blur-xl md:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }} aria-label="Navigazione" data-testid="oggi-tabbar">
    <div className="mx-auto flex max-w-md items-end px-2" style={{ paddingLeft: "max(0.5rem, env(safe-area-inset-left))", paddingRight: "max(0.5rem, env(safe-area-inset-right))" }}>
      <Tab to="/app" label="Oggi" icon={Sun} id="oggi" />
      <Tab to="/app/pazienti" label="Pazienti" icon={Users} id="pazienti" />
      <div className="flex flex-1 justify-center">
        <button onClick={onStart} className="-mt-5 grid h-14 w-14 place-items-center rounded-full bg-[#B98A57] text-[#1E1A16] ring-4 ring-[#A4AEB6] focus-visible:outline-none focus-visible:ring-[#22272B]" aria-label="Inizia visita" data-testid="oggi-tab-start-btn"><Mic size={22} /></button>
      </div>
      <Tab to="/app/messaggi" label="Messaggi" icon={MessagesSquare} id="messaggi" dot={unread > 0} />
      <Tab to="/app/cassa" label="Cassa" icon={ReceiptText} id="cassa" />
    </div>
  </nav>
);
