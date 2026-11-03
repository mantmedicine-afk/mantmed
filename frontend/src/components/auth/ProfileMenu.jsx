import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { KeyRound, LogOut, ShieldCheck, ChevronDown, UserCog, FolderOpen, Compass } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useAuth } from "@/lib/auth";
import { ChangePasswordDialog } from "./ChangePasswordDialog";

export const ProfileMenu = ({ trigger, onSecurity, onTour }) => {
  const { user, logout } = useAuth();
  const [pw, setPw] = useState(false);
  const nav = useNavigate();
  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64 rounded-2xl p-1.5" data-testid="profile-menu">
          <DropdownMenuLabel className="px-3 py-2">
            <span className="block text-sm font-semibold text-night">{user?.name}</span>
            <span className="block truncate text-xs font-normal text-slate-600" data-testid="profile-menu-email">{user?.email}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => nav(user?.role === "parent" ? "/portale/impostazioni" : "/app/impostazioni")} className="cursor-pointer gap-2 rounded-xl px-3 py-2.5 text-sm font-medium" data-testid="profile-account"><UserCog size={15} /> {user?.role === "parent" ? "Impostazioni account" : "Area riservata"}</DropdownMenuItem>
          {user?.role === "parent" && <DropdownMenuItem onSelect={() => nav("/portale/documenti")} className="cursor-pointer gap-2 rounded-xl px-3 py-2.5 text-sm" data-testid="profile-documents"><FolderOpen size={15} /> Area Riservata · documenti e famiglia</DropdownMenuItem>}
          <DropdownMenuItem onSelect={() => setPw(true)} className="cursor-pointer gap-2 rounded-xl px-3 py-2.5 text-sm" data-testid="profile-change-password"><KeyRound size={15} /> Cambia password</DropdownMenuItem>
          {onSecurity && <DropdownMenuItem onSelect={onSecurity} className="cursor-pointer gap-2 rounded-xl px-3 py-2.5 text-sm" data-testid="profile-security"><ShieldCheck size={15} /> Sicurezza e 2FA</DropdownMenuItem>}
          {onTour && <DropdownMenuItem onSelect={onTour} className="cursor-pointer gap-2 rounded-xl px-3 py-2.5 text-sm" data-testid="profile-tour"><Compass size={15} /> Rivedi tour</DropdownMenuItem>}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => logout()} className="cursor-pointer gap-2 rounded-xl px-3 py-2.5 text-sm text-rose-700" data-testid="profile-logout"><LogOut size={15} /> Esci</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ChangePasswordDialog open={pw} onClose={() => setPw(false)} />
    </>
  );
};

export const Caret = () => <ChevronDown size={14} className="opacity-70" />;
