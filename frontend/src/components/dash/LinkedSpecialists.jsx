import { useEffect, useState } from "react";
import { toast } from "sonner";
import { FileDown, Loader2, Lock, ShieldCheck, Users } from "lucide-react";
import { api, errMsg } from "@/lib/api";

const day = (iso) => new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" });
const num = (v, u) => (v == null ? null : `${String(v).replace(".", ",")} ${u}`);

const Specialist = ({ s, pid }) => {
  const [busy, setBusy] = useState("");
  const dl = async (cid) => { setBusy(cid); try { await api.sharedReport(pid, cid); toast.success("Referto scaricato"); } catch (e) { toast.error(errMsg(e)); } setBusy(""); };
  const g = s.growth;
  const last = s.reports[0];
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5" data-testid={`linked-specialist-${s.doctor_id}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><div className="font-display text-2xl text-night">{s.name}</div><div className="text-sm text-slate-600">{s.specialty}</div></div>
        <span className="flex items-center gap-1 rounded-full bg-[#F4F5F7] px-3 py-1 text-[11px] font-semibold text-slate-700"><Lock size={11} /> Sola lettura</span>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3" data-testid={`linked-summary-${s.doctor_id}`}>
        <div className="rounded-2xl bg-[#F4F5F7] p-3"><div className="text-[11px] uppercase tracking-[0.16em] text-slate-600">Ultima diagnosi</div><div className="mt-1 text-sm text-night">{last?.diagnosi || "—"}</div></div>
        <div className="rounded-2xl bg-[#F4F5F7] p-3"><div className="text-[11px] uppercase tracking-[0.16em] text-slate-600">Terapia</div><div className="mt-1 text-sm text-night">{last?.terapia || "—"}</div></div>
        <div className="rounded-2xl bg-[#F4F5F7] p-3"><div className="text-[11px] uppercase tracking-[0.16em] text-slate-600">Ultime misure</div>
          <div className="mt-1 text-sm text-night">{g ? [num(g.weight, "kg"), num(g.height, "cm"), num(g.hc, "cm CC")].filter(Boolean).join(" · ") || "—" : "—"}</div>{g?.date && <div className="text-xs text-slate-600">{day(g.date)}</div>}</div>
      </div>
      <div className="mt-4 space-y-2">
        {s.reports.length === 0 && <p className="text-sm text-slate-600">Nessun referto ancora disponibile presso questo specialista.</p>}
        {s.reports.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2" data-testid={`linked-report-${r.id}`}>
            <div className="min-w-0"><div className="text-xs text-slate-600">{day(r.created_at)} · {r.clinic || "Studio"}</div><div className="truncate text-sm font-medium text-night">{r.motivo || "Visita"}{r.diagnosi ? ` · ${r.diagnosi}` : ""}</div></div>
            <button onClick={() => dl(r.id)} disabled={busy === r.id} className="flex h-9 items-center gap-1.5 rounded-full bg-night px-4 text-xs font-medium text-white disabled:opacity-60" data-testid={`linked-report-pdf-${r.id}`}>{busy === r.id ? <Loader2 size={13} className="animate-spin" /> : <FileDown size={13} />} PDF</button>
          </div>
        ))}
      </div>
    </div>
  );
};

export const LinkedSpecialists = ({ patientId }) => {
  const [data, setData] = useState(null);
  useEffect(() => {
    let alive = true;
    api.patientNetwork(patientId).then((r) => alive && setData(r)).catch(() => alive && setData({ consent: null, specialists: [] }));
    return () => { alive = false; };
  }, [patientId]);
  if (!data) return <div className="h-40 animate-pulse rounded-3xl bg-slate-100" />;
  if (!data.consent) {
    return (
      <div className="flex gap-3 rounded-3xl bg-night p-6 text-white" data-testid="linked-no-consent">
        <Users className="shrink-0 text-[#C9CCD3]" />
        <div><div className="font-display text-2xl">Nessuna condivisione attiva</div>
          <p className="mt-1 text-sm text-slate-300">I referti degli altri specialisti della rete compaiono qui solo dopo il consenso firmato dal genitore nel Portale Paziente (sezione "Medicina di squadra"). Il genitore può revocarlo in qualsiasi momento.</p></div>
      </div>
    );
  }
  return (
    <div className="space-y-3" data-testid="linked-specialists">
      <p className="flex items-center gap-2 text-sm text-slate-600" data-testid="linked-consent"><ShieldCheck size={15} className="text-emerald-700" /> Consenso del genitore firmato il {day(data.consent.signed_at)} · {data.consent.version}. Ogni consultazione è registrata.</p>
      {data.specialists.map((s) => <Specialist key={s.doctor_id} s={s} pid={patientId} />)}
    </div>
  );
};
