import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { LogOut, CalendarClock, FileSignature, FileDown, Plus, Loader2, Baby, Info, CalendarPlus, ReceiptText, CheckCircle2, AlertCircle, UserRound } from "lucide-react";
import { RequestDialog } from "@/components/portal/RequestDialog";
import { CancelVisit } from "@/components/portal/CancelVisit";
import { NetworkSharing } from "@/components/portal/NetworkSharing";
import { Messages } from "@/components/portal/Messages";
import { NotificationBell, useNotifications } from "@/components/portal/NotificationBell";
import { ReminderBanner } from "@/components/portal/ReminderBanner";
import { SupportReplies } from "@/components/support/SupportReplies";
import { PrevisitCard } from "@/components/portal/PrevisitCard";
import { PortalOverview } from "@/components/portal/PortalOverview";
import { SpecialistsDirectory } from "@/components/portal/SpecialistsDirectory";
import { DocumentsArea } from "@/components/portal/DocumentsArea";
import { PortalBodychart } from "@/components/portal/PortalBodychart";
import { ConsentBanner } from "@/components/portal/ConsentSign";
import { SignedDocsList } from "@/components/signature/SignedDocs";
import { ProfileMenu, Caret } from "@/components/auth/ProfileMenu";
import { useSearchParams, useParams, useNavigate, Navigate } from "react-router-dom";
import { LayoutGrid, MessagesSquare, Settings, Stethoscope, FolderOpen } from "lucide-react";
import { AppShell, MenuButton } from "@/components/nav/AppShell";
import { FeedbackDialog } from "@/components/dash/FeedbackDialog";
import Account from "@/pages/Account";

const SECTIONS = { panoramica: null, documenti: null, "trova-specialista": null, appuntamenti: "appointments", messaggi: null, impostazioni: null };
const LEGACY = { referti: "visite", ricevute: "ricevute" };
import { LogoMark } from "@/components/dash/Logo";
import { api, errMsg, eur } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const day = (iso) => new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
const TABS = [{ id: "reports", label: "Referti", icon: FileDown }, { id: "appointments", label: "Appuntamenti", icon: CalendarClock }, { id: "receipts", label: "Ricevute", icon: ReceiptText }, { id: "consents", label: "Consensi", icon: FileSignature }];

const Empty = ({ text }) => <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-600">{text}</p>;

const CP_CLS = { ottimo: "bg-emerald-100 text-emerald-900", buono: "bg-sky-100 text-sky-900" };

const Checkpoints = ({ items }) => (items.length > 0 && (
  <>
    <div className="pt-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">Bilanci di salute</div>
    {items.map((k) => (
      <div key={k.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white p-4" data-testid={`portal-checkpoint-${k.id}`}>
        <div className="min-w-0"><div className="text-xs text-slate-600">{day(k.created_at)}{k.clinic ? ` · ${k.clinic}` : ""}</div><div className="font-medium text-night">{k.source === "portale" ? `Questionario pre-visita ${k.band_label} · compilato da voi` : `Bilancio ${k.band_label}`}</div>{k.next && <div className="text-sm text-slate-600">Prossimo: {k.next}</div>}</div>
        {k.status && <span className={`rounded-full px-3 py-1 text-[11px] font-semibold capitalize ${CP_CLS[k.status] ?? "bg-amber-100 text-amber-900"}`}>{k.status}</span>}
      </div>
    ))}
  </>
));

const Reports = ({ items, checkpoints = [] }) => {
  const [busy, setBusy] = useState("");
  const dl = async (id) => { setBusy(id); try { await api.portalReport(id); toast.success("Referto scaricato"); } catch (e) { toast.error(errMsg(e)); } setBusy(""); };
  if (!items.length) return <><Empty text="Nessun referto disponibile. I referti compaiono qui quando il medico li invia o li pubblica nel portale." /><Checkpoints items={checkpoints} /></>;
  return [...items.map((r) => (
    <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4" data-testid={`portal-report-${r.id}`}>
      <div className="min-w-0"><div className="text-xs text-slate-600">{day(r.created_at)} · {r.clinic || "Studio"}</div><div className="font-medium text-night">{r.motivo || "Visita"}</div>{r.diagnosi && <div className="text-sm text-slate-600">{r.diagnosi}</div>}
        {r.riepilogo && (
          <details className="mt-2 rounded-xl bg-[#F3F6FF] px-3 py-2 text-sm text-night" data-testid={`portal-report-summary-${r.id}`}>
            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.16em] text-[#3B6CF6]">In parole semplici</summary>
            <p className="mt-1.5 whitespace-pre-line leading-relaxed text-slate-700">{r.riepilogo}</p>
          </details>
        )}</div>
      <div className="flex flex-wrap gap-2">{r.bodychart && <PortalBodychart cid={r.id} />}<button onClick={() => dl(r.id)} disabled={busy === r.id} className="flex h-10 items-center gap-2 rounded-full bg-night px-4 text-sm font-medium text-white disabled:opacity-60" data-testid={`portal-report-pdf-${r.id}`}>{busy === r.id ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />} PDF</button></div>
    </div>
  )), <Checkpoints key="cp" items={checkpoints} />];
};

const Receipts = ({ items }) => {
  const [busy, setBusy] = useState("");
  const dl = async (id) => { setBusy(id); try { await api.portalReceipt(id); toast.success("Ricevuta scaricata"); } catch (e) { toast.error(errMsg(e)); } setBusy(""); };
  if (!items.length) return <Empty text="Nessuna ricevuta. Le ricevute sanitarie dei pagamenti online compaiono qui in automatico." />;
  return items.map((r) => (
    <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4" data-testid={`portal-receipt-${r.id}`}>
      <div className="min-w-0"><div className="text-xs text-slate-600">Ricevuta n. {r.receipt_no} · {day(r.date)}</div><div className="font-medium text-night">{r.service} · {eur(r.amount)}</div>
        <div className="text-sm text-slate-600">{r.visit_date ? `Visita del ${day(r.visit_date)} ore ${r.visit_time}` : r.clinic}{r.refunded_at ? ` · rimborsata il ${day(r.refunded_at)}` : ""}</div></div>
      <button onClick={() => dl(r.id)} disabled={busy === r.id} className="flex h-10 items-center gap-2 rounded-full bg-night px-4 text-sm font-medium text-white disabled:opacity-60" data-testid={`portal-receipt-pdf-${r.id}`}>{busy === r.id ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />} PDF</button>
    </div>
  ));
};

const REQ = { pending: ["In attesa di conferma", "bg-amber-100 text-amber-900"], confirmed: ["Confermata", "bg-emerald-100 text-emerald-900"], declined: ["Non confermata", "bg-slate-200 text-slate-700"], cancelled: ["Annullata da lei", "bg-rose-100 text-rose-800"] };
const dshort = (d) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" }) : "Oggi");

const Appointments = ({ items, requests = [], focus, onChange }) => (
  <>
    {items.length ? items.map((a) => (
      <div key={a.id} className={`rounded-2xl border bg-white p-4 ${focus === a.id ? "border-night ring-2 ring-night/15" : "border-slate-200"}`} data-testid={`portal-appt-${a.id}`}>
        <div className="flex items-center justify-between gap-3">
          <div><div className="font-medium text-night">{a.visit_type}</div><div className="text-sm text-slate-600">{a.clinic}</div>{a.paid_online && <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-900" data-testid={`portal-appt-paid-${a.id}`}><CheckCircle2 size={12} /> Confermato & Pagato</span>}</div>
          <div className="text-right"><div className="font-display text-2xl text-night">{a.time}</div><div className="text-xs capitalize text-slate-600">{a.status === "in_attesa" ? "In sala d'attesa" : dshort(a.date)}</div></div>
        </div>
        {a.status === "programmato" && <CancelVisit a={a} onDone={onChange} autoOpen={focus === a.id} />}
      </div>
    )) : <Empty text="Nessun appuntamento in programma." />}
    {requests.length > 0 && <div className="pt-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">Le sue richieste</div>}
    {requests.map((r) => {
      const [label, cls] = REQ[r.status] ?? REQ.pending;
      const d = r.status === "confirmed" ? `${dshort(r.confirmed_date)} · ${r.confirmed_time}` : `${dshort(r.date)} · ${r.time}`;
      return (
        <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-dashed border-slate-300 bg-white p-4" data-testid={`portal-request-${r.id}`}>
          <div><div className="font-medium text-night">{r.service}</div><div className="text-sm capitalize text-slate-600">{d} · {r.clinic}</div>{r.reason && <div className="text-xs text-slate-600">Nota dello studio: {r.reason}</div>}</div>
          <span className={`rounded-full px-3 py-1 text-[11px] font-semibold ${cls}`} data-testid={`portal-request-status-${r.id}`}>{label}</span>
          {r.status === "pending" && <button onClick={() => api.cancelRequest(r.id).then(() => { toast.success("Richiesta ritirata"); onChange(); }).catch((e) => toast.error(errMsg(e)))} className="w-full text-left text-xs font-medium text-rose-700 hover:underline" data-testid={`portal-request-cancel-${r.id}`}>Ritira richiesta</button>}
        </div>
      );
    })}
  </>
);

const Consents = ({ items, docs = [] }) => (
  <>
    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">Documenti firmati (PDF)</div>
    <SignedDocsList docs={docs} download={api.portalDocumentPdf} testId="portal-docs" empty="Nessun documento firmato elettronicamente. I consensi firmati dal Portale o su tablet in studio compaiono qui come PDF." />
    <div className="pt-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">Storico consensi</div>
    <ConsentHistory items={items} />
  </>
);

const ConsentHistory = ({ items }) => (items.length ? items.map((c) => (
  <div key={c.id} className="rounded-2xl border border-slate-200 bg-white p-4" data-testid={`portal-consent-${c.id}`}>
    <div className="flex flex-wrap items-center justify-between gap-2"><div className="font-medium text-night">{c.version}</div>
      <span className={`rounded-full px-3 py-1 text-[11px] font-semibold ${c.revoked_at ? "bg-slate-200 text-slate-700" : "bg-emerald-100 text-emerald-900"}`}>{c.revoked_at ? `Revocato il ${day(c.revoked_at)}` : "Attivo"}</span></div>
    <div className="mt-1 text-sm text-slate-600">Firmato il {day(c.signed_at)} da {c.signer_name} ({c.signer_relation}) · {c.channel === "portale" ? "firma dal Portale" : c.method === "firma_tablet" ? "firma su tablet" : "modulo cartaceo"}{c.email_reports ? " · referti via email" : ""}</div>
  </div>
)) : <Empty text="Nessun consenso registrato dallo studio." />);

const Child = ({ c, onRequest, focus, onChange, jump, only }) => {
  const [tabState, setTab] = useState(focus && c.appointments.some((a) => a.id === focus) ? "appointments" : "reports");
  const tab = only ?? tabState;
  const p = c.patient;
  useEffect(() => {
    if (jump?.pid !== p.id) return undefined;
    setTab(jump.tab);
    document.getElementById(`child-${p.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    return undefined;
  }, [jump?.n]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <section id={`child-${p.id}`} className="scroll-mt-24 rounded-[28px] border border-slate-200 bg-[#F4F5F7] p-5 sm:p-7" data-testid={`portal-child-${p.id}`}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><div className="text-[11px] uppercase tracking-[0.2em] text-slate-600">Nato/a il {day(p.birth_date)}</div><h2 className="font-display text-4xl text-night">{p.name}</h2><div className="text-sm text-slate-600" data-testid={`portal-child-doctor-${p.id}`}>{c.doctor.name} · {c.doctor.specialty}</div>
          <button onClick={() => onRequest(p.id)} className="mt-3 flex h-10 items-center gap-2 rounded-full bg-night px-4 text-sm font-medium text-white transition-transform hover:-translate-y-0.5" data-testid={`portal-request-btn-${p.id}`}><CalendarPlus size={15} /> Richiedi appuntamento</button></div>
        {!only && <div className="flex flex-wrap gap-1 rounded-full bg-white p-1 ring-1 ring-slate-200" role="tablist">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={`flex h-9 items-center gap-1.5 rounded-full px-3 text-sm transition-colors ${tab === t.id ? "bg-night text-white" : "text-slate-600 hover:text-night"}`} data-testid={`portal-tab-${t.id}-${p.id}`}>
              <t.icon size={14} /> {t.label} <span className="font-mono text-xs opacity-70">{c[t.id]?.length ?? 0}</span>
            </button>
          ))}
        </div>}
      </div>
      <div className="mt-5 space-y-2">
        <ConsentBanner child={c} onSigned={onChange} />
        {tab === "reports" && <PrevisitCard child={c} onDone={onChange} />}
        {tab === "reports" && <Reports items={c.reports} checkpoints={c.checkpoints ?? []} />}
        {tab === "appointments" && <Appointments items={c.appointments} requests={c.requests ?? []} focus={focus} onChange={onChange} />}
        {tab === "receipts" && <Receipts items={c.receipts ?? []} />}
        {tab === "consents" && <Consents items={c.consents} docs={c.documents ?? []} />}
      </div>
    </section>
  );
};

const AddChild = ({ onLinked }) => {
  const [cf, setCf] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api.portalAddChild(cf);
      if (r.linked) { toast.success("Cartella collegata"); setCf(""); onLinked(); }
      else toast.message("Nessuna cartella corrisponde a codice fiscale ed email. Verifichi i dati con lo studio: la colleghiamo appena coincidono.");
    } catch (err) { toast.error(errMsg(err)); }
    setBusy(false);
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-2 rounded-[28px] border border-slate-200 bg-white p-5 sm:flex-row sm:items-center" data-testid="portal-add-child-form">
      <div className="flex-1"><div className="text-sm font-medium text-night">Collega un altro figlio</div><div className="text-xs text-slate-600">Inserisca il codice fiscale del bambino: deve coincidere con quello registrato dallo studio, insieme alla sua email.</div></div>
      <input value={cf} onChange={(e) => setCf(e.target.value.toUpperCase().slice(0, 16))} placeholder="Codice fiscale" className="h-11 rounded-full border border-slate-200 px-4 font-mono text-sm uppercase text-night outline-none focus:border-night" data-testid="portal-add-child-input" />
      <button disabled={busy || cf.length !== 16} className="flex h-11 items-center justify-center gap-2 rounded-full bg-night px-5 text-sm font-medium text-white disabled:opacity-50" data-testid="portal-add-child-btn">{busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Collega</button>
    </form>
  );
};

const PAY_BANNER = {
  checking: ["bg-[#F4F5F7] text-night", Loader2, "Verifica del pagamento in corso…"],
  paid: ["bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200", CheckCircle2, "Pagamento ricevuto: la visita è Confermata & Pagata. La ricevuta sanitaria è nella sezione Ricevute."],
  failed: ["bg-amber-50 text-amber-900 ring-1 ring-amber-200", AlertCircle, "Non abbiamo ancora la conferma del pagamento. Se l'addebito risulta, la visita comparirà a breve tra gli appuntamenti."],
};

const usePaymentReturn = (params, setParams, load) => {
  const [state, setState] = useState(null);
  useEffect(() => {
    const kind = params.get("pagamento");
    if (!kind) return undefined;
    let alive = true;
    let timer;
    const clear = () => setParams({}, { replace: true });
    if (kind === "annullato") {
      const rid = params.get("richiesta");
      if (rid) api.abandonCheckout(rid).then((r) => { if (!alive) return; if (r?.paid) setState("paid"); load(); }).catch(() => {});
      toast.message("Pagamento annullato: l'orario è stato liberato. Può riprovare o scegliere Paga in Studio.");
      clear();
      return () => { alive = false; };
    }
    const sid = params.get("session_id");
    let n = 0;
    setState("checking");
    const poll = () => api.checkoutStatus(sid).then((r) => {
      if (!alive) return;
      if (r?.payment_status === "paid") { setState("paid"); load(); clear(); }
      else if (r?.payment_status === "expired" || ++n >= 10) { setState("failed"); clear(); }
      else timer = setTimeout(poll, 2000);
    }).catch(() => { if (alive) setState("failed"); });
    poll();
    return () => { alive = false; clearTimeout(timer); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return state;
};

const PayBanner = ({ state }) => {
  if (!state) return null;
  const [cls, Icon, text] = PAY_BANNER[state];
  return <div className={`flex items-center gap-3 rounded-2xl p-4 text-sm ${cls}`} data-testid={`portal-pay-banner-${state}`}><Icon size={18} className={`shrink-0 ${state === "checking" ? "animate-spin" : ""}`} /> {text}</div>;
};

export default function Portal() {
  const { user, logout } = useAuth();
  const [data, setData] = useState(null);
  const [req, setReq] = useState(null);
  const [reqDoctor, setReqDoctor] = useState("");
  const [reqPreset, setReqPreset] = useState(null);
  const [params, setParams] = useSearchParams();
  const focus = params.get("visita");
  const load = useCallback(() => api.portalMe().then(setData).catch((e) => toast.error(errMsg(e))), []);
  const payState = usePaymentReturn(params, setParams, load);
  const [notif, reloadNotif] = useNotifications();
  const [openThread, setOpenThread] = useState(null);
  const [jump, setJump] = useState(null);
  const [feedback, setFeedback] = useState(false);
  const { sezione = "panoramica" } = useParams();
  const nav = useNavigate();
  useEffect(() => {
    load();
  }, [load, notif.unread]);
  const children = Array.isArray(data?.children) ? data.children : [];
  const go = (pid, tab) => { nav(tab === "appointments" ? "/portale/appuntamenti" : "/portale/documenti?tab=visite"); setJump((j) => ({ pid, tab, n: (j?.n ?? 0) + 1 })); };
  const pickNotif = (n) => {
    if (n.kind === "reply") { nav("/portale/messaggi"); setOpenThread(n.ref); }
    else go(n.patient_id, n.kind === "reminder" ? "appointments" : "reports");
  };
  const count = (k) => children.reduce((s, c) => s + (c[k]?.length ?? 0), 0);
  const items = [
    { id: "panoramica", to: "/portale", end: true, label: "Panoramica / Famiglia", icon: LayoutGrid },
    { id: "trova-specialista", to: "/portale/trova-specialista", label: "Trova Specialista", icon: Stethoscope },
    { id: "appuntamenti", to: "/portale/appuntamenti", label: "Appuntamenti", icon: CalendarClock },
    { id: "documenti", to: "/portale/documenti", label: "Area Riservata", icon: FolderOpen },
    { id: "messaggi", to: "/portale/messaggi", label: "Messaggi con lo Studio", icon: MessagesSquare, badge: notif.messages_unread },
    { id: "impostazioni", to: "/portale/impostazioni", label: "Impostazioni / Feedback", icon: Settings },
  ];
  if (LEGACY[sezione]) return <Navigate to={`/portale/documenti?tab=${LEGACY[sezione]}`} replace />;
  if (!(sezione in SECTIONS)) return <Navigate to="/portale" replace />;
  const only = SECTIONS[sezione];
  const TITLES = { documenti: "Area Riservata", "trova-specialista": "Trova Specialista", appuntamenti: "Appuntamenti", referti: "Referti e bilanci di salute", ricevute: "Ricevute e pagamenti", messaggi: "Messaggi con lo studio" };
  return (
    <AppShell items={items} area="Portale Paziente">
    <div className="min-h-screen bg-[#FBF8F3]" data-testid="portal-page" data-section={sezione}>
      <header className="sticky top-0 z-40 border-b border-[#C9CCD3]/15 bg-[#0A192F]">
        <div className="mx-auto flex max-w-[1100px] items-center justify-between gap-3 px-5 py-3">
          <div className="flex items-center gap-3"><MenuButton dark /><span className="flex items-center gap-3 lg:hidden"><LogoMark size={34} light /><span className="hidden leading-none sm:block"><span className="block font-display text-2xl text-white">MantMed</span><span className="mt-1 block text-[10px] uppercase tracking-[0.22em] text-[#C9CCD3]">Portale Paziente</span></span></span>
            <span className="hidden text-[11px] uppercase tracking-[0.22em] text-[#C9CCD3] lg:block" data-testid="portal-section-label">{items.find((i) => i.id === sezione)?.label}</span></div>
          <div className="flex items-center gap-3">
            <ProfileMenu trigger={<button className="flex h-10 items-center gap-2 rounded-full border border-[#C9CCD3]/30 px-2 text-sm text-[#C9CCD3] transition-colors hover:border-white hover:text-white sm:px-3" data-testid="portal-profile-btn" aria-label="Il mio profilo"><UserRound size={16} /><span className="hidden sm:inline" data-testid="portal-user-name">{user?.name}</span><Caret /></button>} />
            <NotificationBell state={notif} reload={reloadNotif} onPick={pickNotif} />
            <button onClick={() => logout()} className="grid h-10 w-10 place-items-center rounded-full border border-[#C9CCD3]/30 text-white hover:border-white" aria-label="Esci" data-testid="portal-logout-btn"><LogOut size={16} /></button></div>
        </div>
      </header>
      {sezione === "impostazioni" ? <Account role="parent" embedded extras={<button onClick={() => setFeedback(true)} className="flex h-11 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-sm font-medium text-night hover:border-night" data-testid="portal-feedback-btn"><MessagesSquare size={15} /> Feedback e assistenza</button>} /> : (
      <main className="mx-auto max-w-[1100px] space-y-5 px-5 py-10">
        {sezione === "panoramica" && children.length > 0 ? <PortalOverview user={user} kids={children} onWrite={() => nav("/portale/messaggi")} onBook={(k) => { setReqDoctor(k.doctor.id); setReq(k.patient.id); }} />
          : <div><div className="text-[11px] uppercase tracking-[0.22em] text-slate-600">Area personale protetta</div><h1 className="mt-1 font-display text-4xl text-night sm:text-5xl">{TITLES[sezione] ?? <>Buongiorno, <span className="italic text-slate-500">{user?.name?.split(" ")[0]}</span></>}</h1></div>}
        <PayBanner state={payState} />
        {sezione === "panoramica" && <SupportReplies />}
        {sezione === "panoramica" && <ReminderBanner kids={children} onOpen={(pid) => go(pid, "appointments")} />}
        {!data && <Loader2 className="animate-spin text-night" />}
        {data && children.length === 0 && (
          <div className="flex gap-3 rounded-[28px] bg-[#0A192F] p-6 text-white" data-testid="portal-no-children"><Baby className="shrink-0 text-[#C9CCD3]" />
            <p className="text-sm leading-relaxed text-slate-200">Non abbiamo ancora trovato una cartella collegata. Il collegamento avviene in automatico quando lo studio registra il codice fiscale del bambino e la sua email ({user?.email}). Se ha già fatto una visita, chieda allo studio di verificare questi due dati.</p></div>
        )}
        {sezione === "trova-specialista" && data && <SpecialistsDirectory onBook={(id, slot) => { setReqDoctor(id); setReqPreset(slot ?? null); setReq(children[0]?.patient.id ?? null); if (!children.length) toast.message("Colleghi prima la cartella di suo figlio per prenotare"); }} />}
        {sezione === "panoramica" && children.length > 0 && <div className="pt-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">La famiglia</div>}
        {sezione === "documenti" && data && <DocumentsArea kids={children} onChange={load} addChild={<AddChild onLinked={load} />} />}
        {!["messaggi", "trova-specialista", "documenti"].includes(sezione) && children.map((c) => <Child key={c.patient.id} c={c} onRequest={setReq} focus={focus} onChange={load} jump={jump} only={only} />)}
        {sezione === "messaggi" && children.length > 0 && <Messages kids={children} openId={openThread} onOpened={() => setOpenThread(null)} onRead={reloadNotif} />}
        {sezione === "panoramica" && [...new Set(children.map((c) => c.group))].map((g) => <NetworkSharing key={g} entries={children.filter((c) => c.group === g)} />)}
        <RequestDialog key={`${req}-${reqDoctor}-${reqPreset?.date}${reqPreset?.time}`} open={!!req} initial={req} doctorId={reqDoctor} preset={reqPreset} kids={children} onClose={() => { setReq(null); setReqDoctor(""); setReqPreset(null); }} onSent={load} />
        {data && sezione === "panoramica" && <AddChild onLinked={load} />}
        {data?.consent && sezione === "panoramica" && <p className="flex items-center gap-2 text-xs text-slate-600" data-testid="portal-consent-note"><Info size={13} /> Consenso accettato il {day(data.consent.at)} · {data.consent.version} · {count("reports")} referti · {count("appointments")} appuntamenti</p>}
      </main>)}
      <FeedbackDialog parent open={feedback} onClose={() => setFeedback(false)} />
    </div>
    </AppShell>
  );
}
