import { useCallback, useState } from "react";
import { toast } from "sonner";
import { MessagesSquare, Inbox } from "lucide-react";
import { api, errMsg } from "@/lib/api";
import { usePoll } from "@/hooks/usePoll";
import { Conversation, StatusChip, when } from "@/components/portal/Conversation";

const FILTERS = [{ id: "all", label: "Tutte" }, { id: "todo", label: "Da rispondere" }, { id: "done", label: "Risposte" }];

const Row = ({ t, active, onOpen }) => (
  <button onClick={() => onOpen(t.id)} className={`w-full rounded-2xl border p-3 text-left transition-colors ${active ? "border-night bg-white ring-2 ring-night/10" : t.unread ? "border-amber-200 bg-amber-50/60 hover:border-night" : "border-slate-200 bg-white hover:border-night"}`} data-testid={`doc-thread-row-${t.id}`}>
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0"><div className="truncate text-sm font-semibold text-night">{t.patient_name}</div><div className="truncate text-xs text-slate-600">{t.subject} · da {t.parent_name}</div></div>
      {t.unread > 0 ? <span className="grid h-6 min-w-6 place-items-center rounded-full bg-rose-600 px-1.5 text-[11px] font-bold text-white" data-testid={`doc-thread-unread-${t.id}`}>{t.unread}</span>
        : t.last_from === "doctor" ? <StatusChip status="risposto" testId={`doc-thread-status-${t.id}`} /> : <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold text-amber-900" data-testid={`doc-thread-status-${t.id}`}>Da rispondere</span>}
    </div>
    <div className="mt-1 text-[11px] text-slate-600">{t.kind_label} · {when(t.last_at)}</div>
  </button>
);

export const DoctorMessages = ({ onRead }) => {
  const [threads, setThreads] = useState(null);
  const [active, setActive] = useState(null);
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState("all");
  const loadThread = useCallback((id) => api.msgThread(id).then((d) => { setData(d); onRead?.(); }).catch((e) => toast.error(errMsg(e))), [onRead]);
  usePoll(() => { api.msgThreads().then(setThreads).catch(() => setThreads((t) => t ?? [])); if (active) loadThread(active); }, [active]);
  const send = async (body) => {
    try { setData(await api.msgReply(active, body)); api.msgThreads().then(setThreads).catch(() => {}); toast.success("Risposta inviata · il genitore riceve la notifica nel portale"); return true; }
    catch (e) { toast.error(errMsg(e)); return false; }
  };
  const all = Array.isArray(threads) ? threads : [];
  const list = all.filter((t) => filter === "all" || (filter === "todo" ? t.last_from === "parent" : t.last_from === "doctor"));
  const t = data?.thread;
  return (
    <section id="doctor-messages" className="mx-auto max-w-[1440px] scroll-mt-24 px-5 pb-10 lg:px-8" data-testid="doctor-messages">
      <div className="border-t border-slate-200 pt-8">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-slate-500"><MessagesSquare size={13} /> Portale Paziente</div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="mt-1 font-display text-4xl text-night">Messaggi <span className="italic text-slate-500">dalle famiglie</span> <span className="align-middle font-mono text-sm text-slate-600" data-testid="doc-messages-todo-count">{all.filter((x) => x.last_from === "parent").length}</span></h2>
          <div className="flex gap-1 rounded-full bg-white p-1 ring-1 ring-slate-200" role="tablist">
            {FILTERS.map((f) => <button key={f.id} role="tab" aria-selected={filter === f.id} onClick={() => setFilter(f.id)} className={`h-8 rounded-full px-3 text-xs font-medium transition-colors ${filter === f.id ? "bg-night text-white" : "text-slate-600 hover:text-night"}`} data-testid={`doc-messages-filter-${f.id}`}>{f.label}</button>)}
          </div>
        </div>
        <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[360px_1fr]">
          <div className={`${active ? "hidden lg:block" : ""} max-h-[560px] space-y-2 overflow-y-auto`} data-testid="doc-thread-list">
            {threads === null && <div className="h-16 animate-pulse rounded-2xl bg-slate-100" />}
            {threads !== null && list.length === 0 && <p className="flex items-center gap-2 rounded-2xl border border-dashed border-slate-300 p-5 text-sm text-slate-600" data-testid="doc-thread-list-empty"><Inbox size={16} /> Nessun messaggio in questa vista.</p>}
            {list.map((x) => <Row key={x.id} t={x} active={x.id === active} onOpen={(id) => { setData(null); setActive(id); }} />)}
          </div>
          <div className={`${active ? "" : "hidden lg:flex"} overflow-hidden rounded-2xl border border-slate-200 bg-white lg:flex lg:flex-col`}>
            {active ? (
              <Conversation data={data} side="doctor" onSend={send} onBack={() => setActive(null)}
                header={t && <><div className="flex flex-wrap items-center gap-2"><span className="font-semibold text-night" data-testid="doc-conversation-subject">{t.subject}</span><span className="text-xs text-slate-600">{t.kind_label}</span></div><div className="text-xs text-slate-600">{t.patient_name} · scrive {t.parent_name}</div></>} />
            ) : <div className="grid min-h-[300px] flex-1 place-items-center p-6 text-center text-sm text-slate-600">Selezioni un messaggio per leggerlo e rispondere. Il genitore vede lo stato Letto appena lo apre.</div>}
          </div>
        </div>
      </div>
    </section>
  );
};
