import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useSearchParams } from "react-router-dom";
import { FileDown, Loader2, Pill, ReceiptText, Stethoscope, ShieldCheck, FileSignature, ClipboardList } from "lucide-react";
import { api, errMsg, eur } from "@/lib/api";
import { PortalBodychart } from "@/components/portal/PortalBodychart";
import { SignedDocsList } from "@/components/signature/SignedDocs";

const day = (iso) => new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
const year = (iso) => new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).getFullYear();
const byYear = (items, key) => Object.entries(items.reduce((m, x) => ({ ...m, [year(x[key])]: [...(m[year(x[key])] ?? []), x] }), {})).sort(([a], [b]) => b - a);
const Empty = ({ text, testid }) => <p className="rounded-2xl border border-dashed border-[#0A192F]/20 bg-white/60 p-8 text-center text-sm text-[#0A192F]/60" data-testid={testid}>{text}</p>;
const Year = ({ y, right }) => <div className="flex items-baseline justify-between pt-4"><span className="font-display text-3xl text-night">{y}</span>{right}</div>;
const TABS = [["visite", "Visite Passate & Referti", Stethoscope], ["prescrizioni", "Prescrizioni & Ricette", Pill], ["ricevute", "Ricevute e Fatture", ReceiptText]];

const DlBtn = ({ onClick, label, testid, dark = true }) => {
  const [busy, setBusy] = useState(false);
  const run = async () => { setBusy(true); try { await onClick(); toast.success(`${label} scaricato`); } catch (e) { toast.error(errMsg(e)); } setBusy(false); };
  return <button onClick={run} disabled={busy} className={`flex h-10 items-center gap-2 rounded-full px-4 text-sm font-medium transition-transform hover:-translate-y-0.5 disabled:opacity-60 ${dark ? "bg-night text-white" : "bg-white text-night ring-1 ring-[#0A192F]/15"}`} data-testid={testid}>{busy ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} strokeWidth={1.5} />} {label}</button>;
};

const Visit = ({ r }) => (
  <div className="rounded-3xl bg-white p-5 ring-1 ring-[#0A192F]/10 transition-shadow hover:shadow-md" data-testid={`docs-visit-${r.id}`}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="text-xs text-[#0A192F]/60">{[day(r.created_at), r.clinic, r.doctor].filter(Boolean).join(" · ")}</div>
        <div className="mt-1 flex flex-wrap items-center gap-2"><span className="font-display text-xl text-night">{r.motivo || "Visita"}</span>{/bilancio/i.test(`${r.template_name} ${r.motivo}`) && <span className="rounded-full bg-[#FFF9E6] px-2.5 py-0.5 text-[11px] font-semibold text-[#B7791F] ring-1 ring-[#FFE5B4]">Bilancio di salute</span>}</div>
        {r.diagnosi && <div className="mt-1 text-sm text-[#0A192F]/70">{r.diagnosi}</div>}
      </div>
      <div className="flex flex-wrap gap-2">{r.bodychart && <PortalBodychart cid={r.id} />}<DlBtn onClick={() => api.portalReport(r.id)} label="Referto PDF" testid={`docs-visit-pdf-${r.id}`} /></div>
    </div>
    {r.riepilogo && <details className="mt-3 rounded-2xl bg-[#FFF9E6] px-4 py-3 text-sm" data-testid={`docs-visit-simple-${r.id}`}><summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.16em] text-[#B7791F]">In parole semplici</summary><p className="mt-2 whitespace-pre-line leading-relaxed text-[#0A192F]/80">{r.riepilogo}</p></details>}
  </div>
);

const Visits = ({ reports, checkpoints, docs }) => (
  <div className="space-y-3" data-testid="docs-visits">
    {!reports.length && <Empty text="Nessun referto ancora: compare qui quando il medico lo invia o lo pubblica nel Portale." testid="docs-visits-empty" />}
    {byYear(reports, "created_at").map(([y, xs]) => <div key={y} className="space-y-3"><Year y={y} right={<span className="text-sm text-[#0A192F]/60">{xs.length} {xs.length === 1 ? "visita" : "visite"}</span>} />{xs.map((r) => <Visit key={r.id} r={r} />)}</div>)}
    {checkpoints.length > 0 && <div className="pt-6"><div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#0A192F]/60"><ClipboardList size={14} /> Bilanci e questionari</div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">{checkpoints.map((k) => <div key={k.id} className="rounded-2xl bg-white p-4 text-sm ring-1 ring-[#0A192F]/10" data-testid={`docs-checkpoint-${k.id}`}><div className="text-xs text-[#0A192F]/60">{day(k.created_at)}</div><div className="font-medium text-night">{k.source === "portale" ? `Questionario pre-visita ${k.band_label}` : `Bilancio ${k.band_label}`}</div>{k.next && <div className="text-[#0A192F]/60">Prossimo: {k.next}</div>}</div>)}</div></div>}
    <div className="pt-6"><div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#0A192F]/60"><FileSignature size={14} /> Documenti firmati</div>
      <SignedDocsList docs={docs} download={api.portalDocumentPdf} testId="docs-signed" empty="Nessun documento firmato: consensi e moduli firmati compaiono qui in PDF." /></div>
  </div>
);

const Prescriptions = ({ pid }) => {
  const [rows, setRows] = useState(null);
  useEffect(() => { setRows(null); api.portalTherapy(pid).then(setRows).catch(() => setRows([])); }, [pid]);
  if (!rows) return <Loader2 className="animate-spin text-night" />;
  return (
    <div className="space-y-3" data-testid="docs-prescriptions">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl bg-[#F3F6FF] p-5 text-sm text-[#0A192F]/80">
        <span className="max-w-xl">Farmaci e terapie indicati dai medici nei referti. Il promemoria in PDF <strong>non sostituisce la ricetta</strong>: per l'acquisto dei farmaci serve sempre la prescrizione del medico.</span>
        {rows.length > 0 && <DlBtn onClick={() => api.portalTherapyPdf(pid)} label="Promemoria terapia" testid="docs-therapy-pdf" />}
      </div>
      {!rows.length && <Empty text="Nessuna terapia nei referti pubblicati." testid="docs-prescriptions-empty" />}
      {byYear(rows, "date").map(([y, xs]) => <div key={y} className="space-y-2"><Year y={y} />{xs.map((r, i) => (
        <div key={`${r.consultation_id}-${i}`} className="grid gap-2 rounded-3xl bg-white p-5 ring-1 ring-[#0A192F]/10 sm:grid-cols-[auto_1fr_auto] sm:items-center" data-testid={`docs-rx-${r.consultation_id}-${i}`}>
          <span className="grid h-11 w-11 place-items-center rounded-full bg-[#FFF9E6] text-[#B7791F] ring-1 ring-[#FFE5B4]"><Pill size={18} strokeWidth={1.5} /></span>
          <div className="min-w-0"><div className="font-display text-xl text-night">{r.farmaco || "Indicazioni terapeutiche"}</div><div className="text-sm text-[#0A192F]/70">{[r.posologia, r.note, r.terapia].filter(Boolean).join(" · ") || "—"}</div></div>
          <div className="text-xs text-[#0A192F]/60 sm:text-right">{day(r.date)}<div>{r.doctor}</div></div>
        </div>
      ))}</div>)}
    </div>
  );
};

const Receipts = ({ items }) => (
  <div className="space-y-3" data-testid="docs-receipts">
    {!items.length && <Empty text="Nessuna ricevuta: le ricevute sanitarie dei pagamenti online compaiono qui in automatico." testid="docs-receipts-empty" />}
    {byYear(items, "date").map(([y, xs]) => {
      const tot = xs.filter((x) => !x.refunded_at).reduce((s, x) => s + Number(x.amount || 0), 0);
      return (
        <div key={y} className="space-y-2">
          <Year y={y} right={<span className="rounded-full bg-white px-4 py-1.5 text-sm text-night ring-1 ring-[#0A192F]/10" data-testid={`docs-receipts-total-${y}`}>Totale spese sanitarie <strong>{eur(tot)}</strong></span>} />
          {xs.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-3xl bg-white p-5 ring-1 ring-[#0A192F]/10" data-testid={`docs-receipt-${r.id}`}>
              <div className="min-w-0"><div className="text-xs text-[#0A192F]/60">Ricevuta n. {r.receipt_no} · {day(r.date)}</div><div className="font-medium text-night">{r.service} · {eur(r.amount)}</div><div className="text-sm text-[#0A192F]/60">{r.clinic}{r.refunded_at ? ` · rimborsata il ${day(r.refunded_at)}` : ""}</div></div>
              <DlBtn onClick={() => api.portalReceipt(r.id)} label="Ricevuta PDF" testid={`docs-receipt-pdf-${r.id}`} dark={false} />
            </div>
          ))}
        </div>
      );
    })}
    {items.length > 0 && <p className="text-xs text-[#0A192F]/50">Le ricevute sono valide ai fini della detrazione delle spese sanitarie; il totale esclude i pagamenti rimborsati.</p>}
  </div>
);

/** Portale: "I miei Documenti e Visite" — visite e referti, prescrizioni, ricevute, per ogni figlio. */
export const DocumentsArea = ({ kids }) => {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some(([id]) => id === params.get("tab")) ? params.get("tab") : "visite";
  const groups = useMemo(() => Object.values(kids.reduce((m, c) => ({ ...m, [c.group]: [...(m[c.group] ?? []), c] }), {})), [kids]);
  const [gid, setGid] = useState(null);
  const g = groups.find((x) => x[0].group === gid) ?? groups[0];
  if (!g) return <Empty text="Nessuna cartella collegata al suo account." testid="docs-no-kids" />;
  const reports = g.flatMap((c) => c.reports.map((r) => ({ ...r, doctor: c.doctor.name }))).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const receipts = g.flatMap((c) => c.receipts).sort((a, b) => b.date.localeCompare(a.date));
  const set = (k, v) => setParams((p) => { const n = new URLSearchParams(p); n.set(k, v); return n; });
  return (
    <section className="space-y-5" data-testid="documents-area">
      <div className="flex items-center gap-2 text-sm text-[#0A192F]/60"><ShieldCheck size={15} strokeWidth={1.5} className="text-emerald-700" /> Documenti cifrati e visibili solo a lei e ai medici di {g[0].patient.name.split(" ")[0]}.</div>
      {groups.length > 1 && <div className="flex flex-wrap gap-2" data-testid="docs-kids">{groups.map((x) => <button key={x[0].group} onClick={() => setGid(x[0].group)} className={`rounded-full px-4 py-2 text-sm transition-colors ${x === g ? "bg-night text-white" : "bg-white text-night ring-1 ring-[#0A192F]/10 hover:ring-night"}`} data-testid={`docs-kid-${x[0].patient.id}`}>{x[0].patient.name}</button>)}</div>}
      <div className="-mx-1 flex snap-x gap-1 overflow-x-auto rounded-full bg-white p-1 ring-1 ring-[#0A192F]/10 [mask-image:linear-gradient(to_right,black_85%,transparent)] sm:mx-0 sm:inline-flex sm:[mask-image:none]" role="tablist">
        {TABS.map(([id, label, I]) => <button key={id} role="tab" aria-selected={tab === id} onClick={() => set("tab", id)} className={`flex shrink-0 items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium transition-colors ${tab === id ? "bg-night text-white" : "text-night hover:bg-[#F6F1E9]"}`} data-testid={`docs-tab-${id}`}><I size={15} strokeWidth={1.5} /> {label}</button>)}
      </div>
      {tab === "visite" && <Visits reports={reports} checkpoints={g.flatMap((c) => c.checkpoints ?? [])} docs={g.flatMap((c) => c.documents ?? [])} />}
      {tab === "prescrizioni" && <Prescriptions pid={g[0].patient.id} />}
      {tab === "ricevute" && <Receipts items={receipts} />}
    </section>
  );
};
