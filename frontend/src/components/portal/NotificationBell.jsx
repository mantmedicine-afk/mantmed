import { useCallback, useState } from "react";
import { Bell, FileText, HeartPulse, MessageCircleReply, CalendarClock, CheckCheck, ShieldCheck } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { api } from "@/lib/api";
import { usePoll } from "@/hooks/usePoll";
import { when } from "./Conversation";

const KIND = {
  report: [FileText, "bg-[var(--sel)] text-[var(--fg)]"],
  checkpoint: [HeartPulse, "bg-[var(--sel)] text-[var(--fg)]"],
  reply: [MessageCircleReply, "bg-[var(--sel)] text-[var(--ok)]"],
  reminder: [CalendarClock, "bg-[var(--sel)] text-[var(--fg)]"],
  team: [ShieldCheck, "bg-[var(--sel)] text-[var(--ok)]"],
};

export const useNotifications = () => {
  const [state, setState] = useState({ items: [], unread: 0, messages_unread: 0 });
  const load = useCallback(() => api.notifications().then(setState).catch(() => {}), []);
  usePoll(load, []);
  return [state, load];
};

const Item = ({ n, onPick }) => {
  const [Icon, cls] = KIND[n.kind] ?? KIND.report;
  return (
    <button onClick={() => onPick(n)} className={`flex w-full items-start gap-3 rounded-2xl p-3 text-left transition-colors hover:bg-[var(--raised)] ${n.read_at ? "" : "bg-[var(--sel)]"}`} data-testid={`notification-${n.id}`}>
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${cls}`}><Icon size={16} /></span>
      <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-[var(--fg)]">{n.title}</span><span className="block truncate text-xs text-[var(--fg2)]">{n.body}</span><span className="block text-[11px] text-[var(--fg2)]">{when(n.created_at)}</span></span>
      {!n.read_at && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[var(--alert)]" aria-label="Non letta" />}
    </button>
  );
};

export const NotificationBell = ({ state, reload, onPick }) => {
  const [open, setOpen] = useState(false);
  const items = Array.isArray(state?.items) ? state.items : [];
  const unread = state?.unread ?? 0;
  const pick = async (n) => {
    setOpen(false);
    if (!n.read_at) await api.readNotifications([n.id]).catch(() => {});
    reload();
    onPick(n);
  };
  const readAll = async () => { await api.readNotifications().catch(() => {}); reload(); };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="relative grid h-10 w-10 place-items-center rounded-full border border-[var(--hair)] text-[var(--fg2)] transition-colors hover:border-[var(--accent)] hover:text-[var(--fg)]" aria-label={`Notifiche${unread ? `: ${unread} non lette` : ""}`} data-testid="portal-bell-btn">
          <Bell size={16} />
          {unread > 0 && <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-[var(--alert)] px-1 text-[11px] font-bold text-[var(--ink)] ring-2 ring-[var(--accent)]" data-testid="portal-bell-badge">{unread > 9 ? "9+" : unread}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(92vw,380px)] rounded-3xl p-2" data-testid="portal-notifications">
        <div className="flex items-center justify-between px-3 py-2">
          <span className="font-display text-xl text-[var(--fg)]">Notifiche</span>
          {unread > 0 && <button onClick={readAll} className="flex items-center gap-1 text-xs font-medium text-[var(--fg)] hover:underline" data-testid="portal-notifications-read-all"><CheckCheck size={13} /> Segna tutte come lette</button>}
        </div>
        <div className="max-h-[60vh] space-y-1 overflow-y-auto">
          {items.length === 0 ? <p className="p-4 text-center text-sm text-[var(--fg2)]" data-testid="portal-notifications-empty">Nessuna notifica.</p> : items.map((n) => <Item key={n.id} n={n} onPick={pick} />)}
        </div>
      </PopoverContent>
    </Popover>
  );
};
