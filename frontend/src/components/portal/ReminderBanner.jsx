import { CalendarClock } from "lucide-react";

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const ReminderBanner = ({ kids, onOpen }) => {
  const today = new Date();
  const tomorrow = new Date(today.getTime() + 86400000);
  const days = { [iso(today)]: "Oggi", [iso(tomorrow)]: "Domani" };
  const items = kids.flatMap((c) => (c.appointments ?? []).filter((a) => a.status === "programmato" && days[a.date]).map((a) => ({ ...a, child: c.patient, doctor: c.doctor })));
  if (!items.length) return null;
  return (
    <div className="space-y-2" data-testid="portal-reminders">
      {items.map((a) => (
        <button key={a.id} onClick={() => onOpen(a.child.id, a.id)} className="flex w-full items-center gap-4 rounded-[24px] bg-[var(--accent)] p-4 text-left text-[var(--ink)] transition-transform hover:-translate-y-0.5 sm:p-5" data-testid={`portal-reminder-${a.id}`}>
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[var(--sel)] text-[var(--fg)]"><CalendarClock size={20} /></span>
          <span className="min-w-0 flex-1"><span className="block text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--fg)]">Promemoria · {days[a.date]}</span>
            <span className="block truncate text-base font-medium">{a.child.name} · {a.visit_type}</span>
            <span className="block truncate text-sm text-[var(--fg2)]">{a.clinic} · {a.doctor.name}</span></span>
          <span className="shrink-0 font-display text-3xl">{a.time}</span>
        </button>
      ))}
    </div>
  );
};
