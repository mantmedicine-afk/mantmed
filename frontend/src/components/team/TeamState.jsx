import { useState } from "react";
import { toast } from "sonner";
import { Clock3, FileDown, HeartPulse, Loader2, Lock, MessageSquarePlus, Send, ShieldCheck, Stethoscope, Users } from "lucide-react";
import { api, errMsg } from "@/lib/api";
import { AILabel } from "@/components/mantai/AILabel";

const day = (iso) => (iso ? new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" }) : "");

export const ConsentBadge = ({ since }) => (
  <div className="inline-flex flex-wrap items-center gap-2 rounded-full bg-emerald-100 px-4 py-2 text-sm font-semibold text-emerald-900" data-testid="team-consent-badge">
    <ShieldCheck size={16} /> Consenso Privacy Attivo · Medicina di Squadra
    {since && <span className="font-normal text-emerald-800">dal {day(since)}</span>}
  </div>
);

const Locked = ({ data, onRequested }) => {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try { await api.teamRequest(data.ref, reason); toast.success("Richiesta inviata al Portale Paziente"); onRequested(); } catch (e) { toast.error(errMsg(e)); }
    setBusy(false);
  };
  const pending = data.status === "pending";
  return (
    <div className="rounded-3xl bg-night p-6 text-white" data-testid={`team-locked-${data.status}`}>
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/10"><Lock size={18} /></span>
        <div className="min-w-0">
          <div className="font-display text-2xl">{pending ? "Richiesta in attesa del genitore" : "Cartella condivisa non accessibile"}</div>
          <p className="mt-1 text-sm text-slate-300">
            {data.followers > 0 ? `${data.followers} ${data.followers === 1 ? "altro specialista segue" : "altri specialisti seguono"} questo paziente nella rete MantMed. ` : ""}
            {pending ? `Inviata il ${day(data.requested_at)}: riceverà un avviso quando il genitore risponde.` : "Per consultare referti, visite e bilanci dei colleghi serve la delega firmata dal genitore."}
          </p>
          {data.last_closed && <p className="mt-2 text-xs text-amber-200" data-testid="team-last-closed">Ultima delega {data.last_closed.status === "revoked" ? "revocata" : "rifiutata"} il {day(data.last_closed.at)}.</p>}
        </div>
      </div>
      {!pending && data.parent_linked && (
        <div className="mt-5 space-y-3">
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={2} placeholder="Motivo della richiesta (facoltativo), es. valutazione ortopedica dopo visita pediatrica"
            className="w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-white/40" data-testid="team-request-reason" />
          <button onClick={send} disabled={busy} className="flex h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-semibold text-night transition-transform hover:-translate-y-0.5 disabled:opacity-60" data-testid="team-request-btn">
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Richiesta di autorizzazione
          </button>
        </div>
      )}
      {!pending && !data.parent_linked && <p className="mt-4 rounded-2xl bg-white/5 p-3 text-sm text-slate-300" data-testid="team-no-parent">Nessun genitore ha ancora collegato questa cartella al Portale Paziente: la richiesta sarà possibile dopo il collegamento.</p>}
      {pending && <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-amber-200/20 px-3 py-1.5 text-xs text-amber-100" data-testid="team-pending-badge"><Clock3 size={13} /> In attesa di autorizzazione</div>}
    </div>
  );
};

const Specialist = ({ s, refId }) => {
  const [busy, setBusy] = useState("");
  const dl = async (cid) => { setBusy(cid); try { await api.teamPdf(refId, cid); } catch (e) { toast.error(errMsg(e)); } setBusy(""); };
  return (
    <article className="rounded-3xl border border-slate-200 bg-white p-5" data-testid={`team-specialist-${s.doctor.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2"><Stethoscope size={16} className="text-[#3B6CF6]" /><span className="font-medium text-night">{s.doctor.name}</span><span className="text-sm text-[#3B6CF6]">{s.doctor.specialty}</span></div>
        {s.growth && <span className="text-xs text-slate-500">Ultime misure {day(s.growth.date)}: {[s.growth.weight && `${s.growth.weight} kg`, s.growth.height && `${s.growth.height} cm`].filter(Boolean).join(" · ")}</span>}
      </div>
      <div className="mt-3 space-y-2">
        {s.reports.length === 0 && <p className="text-sm text-slate-500">Nessuna visita registrata.</p>}
        {s.reports.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#F4F5F7] p-3" data-testid={`team-report-${r.id}`}>
            <div className="min-w-0 text-sm"><div className="font-medium text-night">{day(r.created_at)} · {r.motivo || "Visita"}</div>
              {r.diagnosi && <div className="text-slate-600">Diagnosi: {r.diagnosi}</div>}{r.terapia && <div className="text-slate-600">Terapia: {r.terapia}</div>}
              <AILabel provenance={r.ai_provenance} view="doctor" className="mt-1.5" testId={`team-report-ai-label-${r.id}`} /></div>
            {r.status === "ready" && <button onClick={() => dl(r.id)} disabled={busy === r.id} className="flex h-9 items-center gap-1.5 rounded-full bg-night px-3 text-xs font-medium text-white disabled:opacity-60" data-testid={`team-report-pdf-${r.id}`}>{busy === r.id ? <Loader2 size={13} className="animate-spin" /> : <FileDown size={13} />} PDF</button>}
          </div>
        ))}
      </div>
      {s.checkpoints.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{s.checkpoints.map((k) => <span key={k.id} className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-3 py-1 text-xs text-violet-900"><HeartPulse size={12} /> {k.band_label} · {day(k.created_at)}</span>)}</div>}
    </article>
  );
};

const Notes = ({ refId, initial }) => {
  const [notes, setNotes] = useState(initial);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const add = async () => {
    setBusy(true);
    try { const n = await api.teamNote(refId, text); setNotes((x) => [n, ...x]); setText(""); toast.success("Nota di squadra aggiunta"); } catch (e) { toast.error(errMsg(e)); }
    setBusy(false);
  };
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5" data-testid="team-notes">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600"><MessageSquarePlus size={14} /> Note di squadra</div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={2000} placeholder="Aggiornamento per i colleghi che seguono il paziente…" className="min-h-[44px] flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-night" data-testid="team-note-input" />
        <button onClick={add} disabled={busy || text.trim().length < 3} className="flex h-11 items-center justify-center gap-2 rounded-full bg-night px-5 text-sm font-medium text-white disabled:opacity-50 sm:self-end" data-testid="team-note-add">{busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Pubblica</button>
      </div>
      <div className="mt-4 space-y-2">
        {notes.length === 0 && <p className="text-sm text-slate-500" data-testid="team-notes-empty">Nessuna nota di squadra.</p>}
        {notes.map((n) => <div key={n.id} className="rounded-2xl bg-[#F4F5F7] p-3 text-sm" data-testid={`team-note-${n.id}`}><div className="text-xs text-slate-500">{n.author} · {n.specialty} · {day(n.created_at)}</div><p className="mt-1 whitespace-pre-line text-night">{n.text}</p></div>)}
      </div>
    </section>
  );
};

export const TeamState = ({ data, onReload }) => {
  if (data.status === "no_cf") return <p className="rounded-3xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-600" data-testid="team-no-cf">Inserisca il codice fiscale del paziente per collegarlo alla Medicina di Squadra della rete MantMed.</p>;
  if (data.status === "not_found") return <p className="rounded-3xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-600" data-testid="team-not-found">Nessuna cartella trovata nella rete MantMed per questo codice fiscale.</p>;
  if (data.status !== "active") return <Locked data={data} onRequested={onReload} />;
  return (
    <div className="space-y-4" data-testid="team-active">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ConsentBadge since={data.granted_at} />
        <span className="flex items-center gap-1.5 text-xs text-slate-500"><Users size={13} /> {data.patient_name ? `${data.patient_name} · ` : ""}accesso registrato nel log di sicurezza</span>
      </div>
      {data.specialists.length === 0 && <p className="text-sm text-slate-600" data-testid="team-no-colleagues">Nessun altro specialista ha ancora registrato visite per questo paziente.</p>}
      {data.specialists.map((s) => <Specialist key={s.doctor.id} s={s} refId={data.ref} />)}
      <Notes key={data.ref} refId={data.ref} initial={data.notes} />
    </div>
  );
};
