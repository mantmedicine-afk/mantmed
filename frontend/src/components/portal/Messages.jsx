import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { MessagesSquare, Trophy, Pill, HelpCircle, Stethoscope } from "lucide-react";
import { api, errMsg } from "@/lib/api";
import { usePoll } from "@/hooks/usePoll";
import { useFillHeight, useScrollLock } from "@/lib/scrollLock";
import { Conversation } from "./Conversation";
import { ThreadList, filterThreads } from "./ThreadList";
import { NewThreadDialog } from "./NewThreadDialog";

const QUICK = [
  { kind: "certificato_sportivo", icon: Trophy, title: "Certificato sportivo", text: "Idoneità all'attività sportiva" },
  { kind: "ricetta", icon: Pill, title: "Ricetta ripetibile", text: "Rinnovo della terapia in corso" },
  { kind: "info", icon: HelpCircle, title: "Informazioni", text: "Orari, documenti, pratiche" },
  { kind: "clinico", icon: Stethoscope, title: "Dubbio clinico", text: "Domande non urgenti al medico" },
];

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
  const attach = async (file, body) => {
    try { setData(await api.portalAttach(active, file, body)); loadList(); return true; } catch (e) { toast.error(errMsg(e)); return false; }
  };
  const grid = useRef(null);
  const fillH = useFillHeight(grid, 48, 440);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  useScrollLock(!!active && window.innerWidth < 768);
  const list = filterThreads((Array.isArray(threads) ? threads : []).map((x) => ({ ...x, display_name: `${x.doctor_name} · ${x.patient_name}`, parent_name: x.doctor_name })), filter, q);
  const t = data?.thread;
  return (
    <section id="portal-messages" className="scroll-mt-24 rounded-[28px] border border-[var(--hair)] bg-[var(--surface)] p-5 sm:p-7" data-testid="portal-messages">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-[var(--fg2)]"><MessagesSquare size={13} /> Comunicazioni con lo studio</div>
      <h2 className="mt-1 font-display text-2xl text-[var(--fg)]">Messaggi e richieste</h2>
      <div className="mt-5 grid grid-cols-2 gap-2 lg:grid-cols-4" data-testid="quick-requests">
        {QUICK.map((q) => (
          <button key={q.kind} disabled={!kids.length} onClick={() => setKind(q.kind)} className="group flex flex-col items-start gap-2 rounded-2xl border border-[var(--hair)] bg-[var(--raised)] p-4 text-left transition-all hover:-translate-y-0.5 hover:border-[var(--accent)] disabled:opacity-50" data-testid={`quick-request-${q.kind}`}>
            <span className="grid h-10 w-10 place-items-center rounded-full bg-[var(--accent)] text-[var(--ink)] transition-transform group-hover:scale-105"><q.icon size={17} /></span>
            <span><span className="block text-sm font-semibold text-[var(--fg)]">{q.title}</span><span className="block text-xs text-[var(--fg2)]">{q.text}</span></span>
          </button>
        ))}
      </div>
      <div ref={grid} style={{ height: fillH ?? undefined }} className="mt-6 grid grid-cols-1 grid-rows-[minmax(0,1fr)] gap-4 md:grid-cols-[300px_1fr] lg:grid-cols-[340px_1fr]">
        <div className={`${active ? "hidden md:block" : ""} h-full min-h-0`}>
          <ThreadList prefix="thread" threads={threads} list={list} active={active} onOpen={open} q={q} setQ={setQ} filter={filter} setFilter={setFilter}
            empty="Nessuna conversazione. Usi una richiesta rapida qui sopra per scrivere allo studio." />
        </div>
        <div className={`${active ? "flex" : "hidden md:flex"} h-full min-h-0 flex-col overflow-hidden border border-[var(--hair)] bg-[var(--surface)] max-md:fixed max-md:inset-0 max-md:z-[60] max-md:h-[100dvh] md:rounded-2xl`} data-testid="portal-conversation-pane">
          {active ? (
            <Conversation fill data={data} side="parent" onSend={send} onAttach={attach} onBack={() => setActive(null)}
              header={t && <><div className="truncate font-semibold text-[var(--fg)]" data-testid="conversation-subject">{t.doctor_name} · {t.patient_name}</div><div className="truncate text-xs text-[var(--fg2)]">{t.subject}</div></>} />
          ) : <div className="grid flex-1 place-items-center p-6 text-center text-sm text-[var(--fg2)]">Selezioni una conversazione per leggerla e rispondere.</div>}
        </div>
      </div>
      {kind && <NewThreadDialog key={kind} kind={kind} kids={kids} onClose={() => setKind(null)} onSent={(x) => { setKind(null); loadList(); open(x.id); }} />}
    </section>
  );
};
