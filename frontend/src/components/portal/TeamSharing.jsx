import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, ChevronDown, History, Loader2, PenLine, ShieldCheck, Undo2, UserPlus, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SignatureField } from "@/components/signature/SignaturePadModal";
import { api, errMsg } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const day = (iso) => (iso ? new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" }) : "");
const stamp = (iso) => (iso ? new Date(iso).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" }) : "");
const ACT = { consultazione: "ha consultato la cartella", referto_pdf: "ha scaricato un referto", nota: "ha scritto una nota di squadra", richiesta: "ha chiesto l'accesso" };
const card = "rounded-3xl bg-white p-5 ring-1 ring-[#0A192F]/10 sm:p-6";

const GrantDialog = ({ target, text, onClose, onDone }) => {
  const { user } = useAuth();
  const [ok, setOk] = useState(false);
  const [sig, setSig] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setOk(false); setSig(null); }, [target]);
  const submit = async () => {
    if (!ok) return toast.error("Serve il consenso esplicito");
    if (!sig) return toast.error("Manca la firma: tocchi il riquadro per firmare");
    setBusy(true);
    try {
      await api.portalTeamGrant({ group: target.group, doctor_id: target.doctor.id, signer_name: sig.signerName, signature: sig.image, accepted: ok });
      toast.success(`${target.doctor.name} ora può consultare la cartella condivisa`); onDone(); onClose();
    } catch (e) { toast.error(errMsg(e)); }
    setBusy(false);
  };
  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto rounded-3xl bg-white sm:max-w-lg" data-testid="team-grant-dialog">
        <DialogHeader>
          <DialogTitle className="font-display text-3xl font-normal text-night">Autorizza {target?.doctor.name}</DialogTitle>
          <DialogDescription className="text-sm text-slate-600">{target?.doctor.specialty} · accesso alla cartella condivisa di {target?.child}</DialogDescription>
        </DialogHeader>
        <p className="max-h-32 overflow-y-auto rounded-2xl bg-[#F4F5F7] p-4 text-xs leading-relaxed text-slate-700" data-testid="team-grant-text">{text}</p>
        <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 px-4 py-3 text-sm text-night hover:border-night">
          <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#0A192F]" data-testid="team-grant-accept" />
          <span>Ho letto l'informativa e autorizzo questo specialista <span className="text-red-600">*</span></span>
        </label>
        <SignatureField value={sig} onChange={setSig} defaultName={user?.name ?? ""} testId="team-grant-signature" title="Firma delega" description="Delega Medicina di Squadra. Firmi per esteso nel riquadro." />
        <button onClick={submit} disabled={busy} className="flex h-12 items-center justify-center gap-2 rounded-full bg-night text-sm font-semibold text-white disabled:opacity-60" data-testid="team-grant-submit">{busy ? <Loader2 size={16} className="animate-spin" /> : <PenLine size={16} />} Firma e autorizza</button>
      </DialogContent>
    </Dialog>
  );
};

const Row = ({ g, info, actions, testid }) => (
  <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#FBF8F3] p-4" data-testid={testid}>
    <div className="min-w-0"><div className="font-medium text-night">{g.doctor.name} <span className="text-sm font-normal text-[#3B6CF6]">· {g.doctor.specialty}</span></div>{info}</div>
    <div className="flex gap-2">{actions}</div>
  </div>
);

const Group = ({ grp, child, network, onAuthorize, onChange }) => {
  const [log, setLog] = useState(false);
  const [all, setAll] = useState(false);
  const act = async (fn, id, msg) => { try { await fn(id); toast.success(msg); onChange(); } catch (e) { toast.error(errMsg(e)); } };
  const active = grp.grants.filter((g) => g.status === "active");
  const pending = grp.grants.filter((g) => g.status === "pending");
  const closed = grp.grants.filter((g) => ["revoked", "denied"].includes(g.status));
  const busyIds = new Set([...active, ...pending].map((g) => g.doctor.id));
  const candidates = [...grp.followers, ...network, ...closed.map((g) => g.doctor)].filter((d, i, a) => a.findIndex((x) => x.id === d.id) === i && !busyIds.has(d.id));
  const [pick, setPick] = useState("");
  return (
    <article className={`${card} space-y-5`} data-testid={`team-group-${child.id}`}>
      <div><div className="font-display text-3xl text-night">{child.name}</div>
        <p className="mt-1 text-sm text-[#0A192F]/60">Seguito da {grp.followers.map((f) => `${f.name} (${f.specialty})`).join(", ") || "—"}</p></div>
      {pending.length > 0 && <div className="space-y-2"><div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">Richieste di accesso</div>
        {pending.map((g) => <Row key={g.id} g={g} testid={`team-pending-${g.id}`}
          info={<p className="text-sm text-[#0A192F]/70">Richiesta del {day(g.requested_at)}{g.reason ? ` · "${g.reason}"` : ""}</p>}
          actions={<><button onClick={() => onAuthorize({ group: grp.group, doctor: g.doctor, child: child.name })} className="flex h-10 items-center gap-1.5 rounded-full bg-night px-4 text-sm font-medium text-white" data-testid={`team-authorize-${g.id}`}><Check size={14} /> Autorizza</button>
              <button onClick={() => act(api.portalTeamDeny, g.id, "Richiesta rifiutata")} className="flex h-10 items-center gap-1.5 rounded-full border border-slate-200 px-4 text-sm text-night hover:border-night" data-testid={`team-deny-${g.id}`}><X size={14} /> Rifiuta</button></>} />)}</div>}
      <div className="space-y-2"><div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-800"><ShieldCheck size={13} /> Specialisti con accesso</div>
        {active.length === 0 && <p className="text-sm text-[#0A192F]/60" data-testid={`team-none-${child.id}`}>Nessuno: ogni specialista vede solo le proprie visite.</p>}
        {active.map((g) => <Row key={g.id} g={g} testid={`team-active-${g.id}`}
          info={<p className="text-sm text-emerald-800">Autorizzato dal {day(g.granted_at)}{g.migrated ? " · dalla condivisione precedente" : ""}</p>}
          actions={<button onClick={() => act(api.portalTeamRevoke, g.id, "Accesso revocato")} className="flex h-10 items-center gap-1.5 rounded-full border border-slate-200 px-4 text-sm text-rose-700 hover:border-rose-700" data-testid={`team-revoke-${g.id}`}><Undo2 size={14} /> Revoca</button>} />)}</div>
      {candidates.length > 0 && <div className="flex flex-col gap-2 sm:flex-row">
        <select value={pick} onChange={(e) => setPick(e.target.value)} className="h-11 flex-1 rounded-full border border-slate-200 bg-white px-4 text-sm text-night outline-none focus:border-night" data-testid={`team-candidate-${child.id}`}>
          <option value="">Autorizza un altro specialista della rete…</option>
          {candidates.map((d) => <option key={d.id} value={d.id}>{d.name} · {d.specialty}</option>)}
        </select>
        <button disabled={!pick} onClick={() => onAuthorize({ group: grp.group, doctor: candidates.find((d) => d.id === pick), child: child.name })} className="flex h-11 items-center justify-center gap-2 rounded-full bg-night px-5 text-sm font-medium text-white disabled:opacity-40" data-testid={`team-add-${child.id}`}><UserPlus size={15} /> Autorizza</button>
      </div>}
      <button onClick={() => setLog((v) => !v)} className="flex items-center gap-1.5 text-sm font-medium text-[#3B6CF6]" data-testid={`team-log-toggle-${child.id}`}><History size={14} /> Registro accessi e storico ({grp.log.length + closed.length}) <ChevronDown size={14} className={`transition-transform ${log ? "rotate-180" : ""}`} /></button>
      {log && <div className="grid gap-4 md:grid-cols-2" data-testid={`team-log-${child.id}`}>
        <div><div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#0A192F]/50">Deleghe chiuse</div>
          <ul className="mt-2 space-y-1.5 text-sm text-[#0A192F]/70">{(all ? closed : closed.slice(0, 10)).map((g) => <li key={g.id}>{stamp(g.updated_at || g.revoked_at)} · {g.doctor.name} · {g.status === "revoked" ? "revocata" : "rifiutata"}</li>)}{!closed.length && <li>Nessuna.</li>}</ul></div>
        <div><div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#0A192F]/50">Registro accessi</div>
          <ul className="mt-2 space-y-1.5 text-sm text-[#0A192F]/70">{(all ? grp.log : grp.log.slice(0, 10)).map((l, i) => <li key={i}>{stamp(l.at)} · {l.doctor_name} ({l.specialty}) {ACT[l.action] ?? l.action}</li>)}{!grp.log.length && <li>Nessun accesso registrato.</li>}</ul>
          {(grp.log.length > 10 || closed.length > 10) && <button onClick={() => setAll((v) => !v)} className="mt-2 text-sm font-medium text-[#3B6CF6]" data-testid={`team-log-all-${child.id}`}>{all ? "Mostra meno" : `Mostra tutto (${grp.log.length + closed.length})`}</button>}</div>
      </div>}
    </article>
  );
};

export const TeamSharing = ({ kids }) => {
  const [data, setData] = useState(null);
  const [target, setTarget] = useState(null);
  const load = useCallback(() => api.portalTeam().then(setData).catch((e) => toast.error(errMsg(e))), []);
  useEffect(() => { load(); }, [load]);
  if (!data) return <Loader2 className="animate-spin text-night" />;
  const childOf = (group) => kids.find((k) => k.group === group)?.patient;
  return (
    <div className="space-y-5" data-testid="team-sharing">
      <div className="rounded-3xl bg-[#0A192F] p-6 text-white"><div className="font-display text-3xl">Condivisione e Deleghe Specialistiche</div>
        <p className="mt-2 max-w-2xl text-sm text-slate-300">Decida quali specialisti della rete MantMed possono consultare la cartella condivisa (referti, visite, bilanci di salute) e lasciare note di squadra. Ogni accesso è registrato e può revocare con un clic.</p></div>
      {data.groups.length === 0 && <p className="text-sm text-[#0A192F]/60" data-testid="team-no-groups">Nessuna cartella con codice fiscale collegata al suo profilo.</p>}
      {data.groups.map((g) => { const child = childOf(g.group); return child && <Group key={g.group} grp={g} child={child} network={data.network} onAuthorize={setTarget} onChange={load} />; })}
      <GrantDialog target={target} text={data.text} onClose={() => setTarget(null)} onDone={load} />
    </div>
  );
};
