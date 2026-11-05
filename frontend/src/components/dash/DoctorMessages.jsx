import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { MessagesSquare, ArrowUpRight } from "lucide-react";
import { api, errMsg } from "@/lib/api";
import { usePoll } from "@/hooks/usePoll";
import { useFillHeight, useScrollLock } from "@/lib/scrollLock";
import { Conversation } from "@/components/portal/Conversation";
import { ThreadList, filterThreads } from "@/components/portal/ThreadList";

const Header = ({ t, onOpenPatient }) => (
  <div className="flex flex-wrap items-center justify-between gap-2">
    <div className="min-w-0">
      <div className="truncate font-semibold text-[var(--fg)]" data-testid="doc-conversation-patient">{t.patient_name}{t.patient_age && <span className="font-normal text-[var(--fg2)]"> · {t.patient_age}</span>}</div>
      <div className="truncate text-xs text-[var(--fg2)]" data-testid="doc-conversation-subject">{t.display_name} · {t.subject}</div>
    </div>
    {t.patient_id && onOpenPatient && <button onClick={() => onOpenPatient(t.patient_id)} className="flex items-center gap-1 rounded-full border border-[var(--hair)] px-3 py-1.5 text-xs font-medium text-[var(--fg)] hover:border-[var(--accent)]" data-testid="doc-conversation-patient-link">Scheda paziente <ArrowUpRight size={13} /></button>}
  </div>
);

export const DoctorMessages = ({ onRead, onOpenPatient }) => {
  const grid = useRef(null);
  const fillH = useFillHeight(grid, 40, 320);
  const [threads, setThreads] = useState(null);
  const [active, setActive] = useState(null);
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const loadList = useCallback(() => api.msgThreads().then(setThreads).catch(() => setThreads((t) => t ?? [])), []);
  const loadThread = useCallback((id) => api.msgThread(id).then((d) => { setData(d); onRead?.(); }).catch((e) => toast.error(errMsg(e))), [onRead]);
  usePoll(() => { loadList(); if (active) loadThread(active); }, [active]);
  const open = (id) => { setData(null); setActive(id); };
  const done = (d, msg) => { setData(d); loadList(); if (msg) toast.success(msg); return true; };
  const fail = (e) => { toast.error(errMsg(e)); return false; };
  const send = (body) => api.msgReply(active, body).then((d) => done(d, "Risposta inviata")).catch(fail);
  const attach = (file, body) => api.msgAttach(active, file, body).then((d) => done(d, "Allegato inviato")).catch(fail);
  const useDraft = (id, text) => api.aiApprove(id, text).then(() => loadThread(active)).then(() => { loadList(); toast.success("Risposta inviata"); return true; }).catch(fail);
  const ignoreDraft = (id) => api.aiDiscard(id).then(() => setData((d) => ({ ...d, ai_draft: null }))).catch(fail);
  const all = Array.isArray(threads) ? threads : [];
  const list = filterThreads(all, filter, q);
  const t = data?.thread;
  useScrollLock(!!active && window.innerWidth < 768);

  return (
    <section id="doctor-messages" className="mx-auto max-w-[1440px] scroll-mt-24 px-5 pb-10 lg:px-8" data-testid="doctor-messages">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-[var(--fg2)]"><MessagesSquare size={13} /> Portale Paziente</div>
      <h2 className="mt-1 font-display text-4xl text-[var(--fg)]">Messaggi <span className="italic text-[var(--fg2)]">dalle famiglie</span> <span className="align-middle font-mono text-sm text-[var(--fg2)]" data-testid="doc-messages-todo-count">{all.filter((x) => x.needs_reply).length}</span></h2>
      <div ref={grid} style={{ height: fillH ?? undefined }} className="mt-5 grid grid-cols-1 grid-rows-[minmax(0,1fr)] gap-4 md:grid-cols-[320px_1fr] lg:grid-cols-[360px_1fr]" data-testid="doc-messages-grid">
        <div className={`${active ? "hidden md:block" : ""} h-full min-h-0`}>
          <ThreadList threads={threads} list={list} active={active} onOpen={open} q={q} setQ={setQ} filter={filter} setFilter={setFilter} />
        </div>
        <div className={`${active ? "flex" : "hidden md:flex"} h-full min-h-0 flex-col overflow-hidden border border-[var(--hair)] bg-[var(--surface)] max-md:fixed max-md:inset-0 max-md:z-[60] max-md:h-[100dvh] md:rounded-2xl`} data-testid="doc-conversation-pane">
          {active ? (
            <Conversation fill data={data} side="doctor" onSend={send} onAttach={attach} onBack={() => setActive(null)} draft={data?.ai_draft} onUseDraft={useDraft} onIgnoreDraft={ignoreDraft}
              header={t && <Header t={t} onOpenPatient={onOpenPatient} />} />
          ) : <div className="grid flex-1 place-items-center p-6 text-center text-sm text-[var(--fg2)]">Selezioni una conversazione per leggerla e rispondere.</div>}
        </div>
      </div>
    </section>
  );
};
