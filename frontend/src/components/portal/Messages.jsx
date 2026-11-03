import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { MessagesSquare, Trophy, Pill, HelpCircle, Stethoscope, Inbox } from "lucide-react";
import { api, errMsg } from "@/lib/api";
import { usePoll } from "@/hooks/usePoll";
import { Conversation, StatusChip, when } from "./Conversation";
import { NewThreadDialog } from "./NewThreadDialog";

const QUICK = [
  { kind: "certificato_sportivo", icon: Trophy, title: "Certificato sportivo", text: "Idoneità all'attività sportiva" },
  { kind: "ricetta", icon: Pill, title: "Ricetta ripetibile", text: "Rinnovo della terapia in corso" },
  { kind: "info", icon: HelpCircle, title: "Informazioni", text: "Orari, documenti, pratiche" },
  { kind: "clinico", icon: Stethoscope, title: "Dubbio clinico", text: "Domande non urgenti al medico" },
];

const ThreadRow = ({ t, active, onOpen }) => (
  <button onClick={() => onOpen(t.id)} className={`w-full rounded-2xl border p-3 text-left transition-colors ${active ? "border-night bg-white ring-2 ring-night/10" : "border-slate-200 bg-white hover:border-night"}`} data-testid={`thread-row-${t.id}`}>
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0"><div className="truncate text-sm font-semibold text-night">{t.subject}</div><div className="truncate text-xs text-slate-600">{t.patient_name} · {t.doctor_name}</div></div>
      {t.unread > 0 ? <span className="grid h-6 min-w-6 place-items-center rounded-full bg-rose-600 px-1.5 text-[11px] font-bold text-white" data-testid={`thread-unread-${t.id}`}>{t.unread}</span> : <StatusChip status={t.status} testId={`thread-status-${t.id}`} />}
    </div>
    <div className="mt-1 text-[11px] text-slate-600">{t.kind_label} · {when(t.last_at)}</div>
  </button>
);

export const Messages = ({ kids, openId, onOpened, onRead }) => {
  const [threads, setThreads] = useState(null);
  const [active, setActive] = useState(null);
  const [data, setData] = useState(null);
  const [kind, setKind] = useState(null);
  const loadList = useCallback(() => api.portalThreads().then(setThreads).catch(() => setThreads((t) => t ?? [])), []);
  const loadThread = useCallback((id) => api.portalThread(id).then((d) => { setData(d); onRead?.(); }).catch((e) => toast.error(errMsg(e))), [onRead]);
  usePoll(() => { loadList(); if (active) loadThread(active); }, [active]);
  const open = (id) => { setData(null); setActive(id); };
  useEffect(() => {
    if (!openId) return undefined;
    open(openId);
    onOpened?.();
    document.getElementById("portal-messages")?.scrollIntoView({ behavior: "smooth", block: "start" });
    return undefined;
  }, [openId]); // eslint-disable-line react-hooks/exhaustive-deps
  const send = async (body) => {
    try { setData(await api.portalReply(active, body)); loadList(); return true; } catch (e) { toast.error(errMsg(e)); return false; }
  };
  const list = Array.isArray(threads) ? threads : [];
  const t = data?.thread;
  return (
    <section id="portal-messages" className="scroll-mt-24 rounded-[28px] border border-slate-200 bg-white p-5 sm:p-7" data-testid="portal-messages">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-slate-600"><MessagesSquare size={13} /> Comunicazioni con lo studio</div>
      <h2 className="mt-1 font-display text-2xl text-night">Messaggi e richieste</h2>
      <div className="mt-5 grid grid-cols-2 gap-2 lg:grid-cols-4" data-testid="quick-requests">
        {QUICK.map((q) => (
          <button key={q.kind} disabled={!kids.length} onClick={() => setKind(q.kind)} className="group flex flex-col items-start gap-2 rounded-2xl border border-slate-200 bg-[#F4F5F7] p-4 text-left transition-all hover:-translate-y-0.5 hover:border-night disabled:opacity-50" data-testid={`quick-request-${q.kind}`}>
            <span className="grid h-10 w-10 place-items-center rounded-full bg-night text-white transition-transform group-hover:scale-105"><q.icon size={17} /></span>
            <span><span className="block text-sm font-semibold text-night">{q.title}</span><span className="block text-xs text-slate-600">{q.text}</span></span>
          </button>
        ))}
      </div>
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-[340px_1fr]">
        <div className={`${active ? "hidden lg:block" : ""} space-y-2`} data-testid="thread-list">
          {threads === null && <div className="h-16 animate-pulse rounded-2xl bg-slate-100" />}
          {threads !== null && list.length === 0 && <p className="flex items-center gap-2 rounded-2xl border border-dashed border-slate-300 p-5 text-sm text-slate-600" data-testid="thread-list-empty"><Inbox size={16} /> Nessuna conversazione. Usi una richiesta rapida qui sopra per scrivere allo studio.</p>}
          {list.map((x) => <ThreadRow key={x.id} t={x} active={x.id === active} onOpen={open} />)}
        </div>
        <div className={`${active ? "" : "hidden lg:flex"} overflow-hidden rounded-2xl border border-slate-200 lg:flex lg:flex-col`}>
          {active ? (
            <Conversation data={data} side="parent" onSend={send} onBack={() => setActive(null)}
              header={t && <><div className="flex flex-wrap items-center gap-2"><span className="font-semibold text-night" data-testid="conversation-subject">{t.subject}</span><StatusChip status={t.status} testId="conversation-status" /></div><div className="text-xs text-slate-600">{t.patient_name} · {t.doctor_name}</div></>} />
          ) : <div className="grid min-h-[300px] flex-1 place-items-center p-6 text-center text-sm text-slate-600">Selezioni una conversazione per leggerla e rispondere.</div>}
        </div>
      </div>
      {kind && <NewThreadDialog key={kind} kind={kind} kids={kids} onClose={() => setKind(null)} onSent={(x) => { setKind(null); loadList(); open(x.id); }} />}
    </section>
  );
};
