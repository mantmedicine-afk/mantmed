import { Search, Inbox } from "lucide-react";
import { hm, dayLabel } from "@/components/portal/Bubble";

export const FILTERS = [{ id: "all", label: "Tutti" }, { id: "unread", label: "Non letti" }, { id: "todo", label: "Da rispondere" }];
export const filterThreads = (all, filter, q) => all.filter((t) => (filter === "all" || (filter === "unread" ? t.unread > 0 : t.needs_reply))
  && (!q.trim() || `${t.display_name} ${t.patient_name} ${t.subject} ${t.preview}`.toLowerCase().includes(q.trim().toLowerCase())));

const initials = (s) => (s || "?").replace(/^(dott\.?ssa|dott\.?|dr\.?|prof\.?ssa|prof\.?)\s+/i, "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
const stamp = (iso) => { const l = dayLabel(iso); return l === "Oggi" ? hm(iso) : l === "Ieri" ? "Ieri" : new Date(iso).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" }); };

const Row = ({ t, active, onOpen, prefix }) => (
  <button onClick={() => onOpen(t.id)} className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors ${active ? "bg-[var(--sel)]" : "hover:bg-[var(--raised)]"}`} data-testid={`${prefix}-row-${t.id}`}>
    <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-full text-sm font-semibold ${t.unread ? "bg-[var(--accent)] text-[var(--ink)]" : "bg-[var(--raised)] text-[var(--fg)]"}`} aria-hidden="true">{initials(t.parent_name || t.doctor_name)}</span>
    <span className="min-w-0 flex-1">
      <span className="flex items-baseline justify-between gap-2">
        <span className={`truncate text-sm text-[var(--fg)] ${t.unread ? "font-semibold" : "font-medium"}`} data-testid={`${prefix}-name-${t.id}`}>{t.display_name}</span>
        <span className="shrink-0 text-[11px] text-[var(--fg2)]">{stamp(t.last_at)}</span>
      </span>
      <span className="mt-0.5 flex items-center justify-between gap-2">
        <span className="truncate text-xs text-[var(--fg2)]" data-testid={`${prefix}-preview-${t.id}`}>{t.last_from === (prefix === "doc-thread" ? "doctor" : "parent") ? "Tu: " : ""}{t.preview || t.subject}</span>
        {t.unread > 0 && <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-[var(--alert)] px-1.5 text-[10px] font-bold text-white" data-testid={`${prefix}-unread-${t.id}`}>{t.unread}</span>}
      </span>
    </span>
  </button>
);

export const ThreadList = ({ threads, list, active, onOpen, q, setQ, filter, setFilter, prefix = "doc-thread", empty = "Nessuna conversazione in questa vista.", placeholder = "Cerca genitore, bambino, messaggio" }) => (
  <div className="flex h-full min-h-0 flex-col rounded-2xl border border-[var(--hair)] bg-[var(--surface)]" data-testid={`${prefix}-panel`}>
    <div className="shrink-0 space-y-2 border-b border-[var(--hair)] p-3">
      <label className="flex h-10 items-center gap-2 rounded-full bg-[var(--raised)] px-3 focus-within:ring-2 focus-within:ring-[var(--accent)]">
        <Search size={15} className="text-[var(--fg2)]" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} className="w-full bg-transparent text-sm text-[var(--fg)] outline-none" data-testid={`${prefix}-search`} />
      </label>
      <div className="flex gap-1" role="tablist">
        {FILTERS.map((f) => <button key={f.id} role="tab" aria-selected={filter === f.id} onClick={() => setFilter(f.id)} className={`h-8 rounded-full px-3 text-xs font-medium transition-colors ${filter === f.id ? "bg-[var(--accent)] text-[var(--ink)]" : "text-[var(--fg2)] hover:text-[var(--fg)]"}`} data-testid={`${prefix}-filter-${f.id}`}>{f.label}</button>)}
      </div>
    </div>
    <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto overscroll-contain p-2" data-testid={prefix === "doc-thread" ? "doc-thread-list" : "thread-list"} data-lenis-prevent>
      {threads === null && <div className="h-16 animate-pulse rounded-2xl bg-[var(--raised)]" />}
      {threads !== null && list.length === 0 && <p className="flex items-center gap-2 p-5 text-sm text-[var(--fg2)]" data-testid={`${prefix}-list-empty`}><Inbox size={16} /> {empty}</p>}
      {list.map((t) => <Row key={t.id} t={t} active={t.id === active} onOpen={onOpen} prefix={prefix} />)}
    </div>
  </div>
);
