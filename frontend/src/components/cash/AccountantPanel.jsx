import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Download, Mail, Loader2, Briefcase } from "lucide-react";
import { api, errMsg, eur } from "@/lib/api";
import { ClinicFilter, Kicker, Seg, btnGhost, btnMain, card } from "./ui";

const iso = (d) => d.toLocaleDateString("sv-SE");
const now = () => new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Rome" }));
const range = (kind, ref) => {
  const [y, m] = ref.split("-").map(Number);
  if (kind === "anno") return [`${y}-01-01`, `${y}-12-31`];
  if (kind === "trimestre") { const q = Math.floor((m - 1) / 3); return [iso(new Date(y, q * 3, 1)), iso(new Date(y, q * 3 + 3, 0))]; }
  return [iso(new Date(y, m - 1, 1)), iso(new Date(y, m, 0))];
};
const refs = (kind) => {
  const n = now(), out = [];
  if (kind === "anno") for (let i = 0; i < 4; i++) out.push([`${n.getFullYear() - i}-01`, String(n.getFullYear() - i)]);
  else if (kind === "trimestre") for (let i = 0; i < 6; i++) { const d = new Date(n.getFullYear(), Math.floor(n.getMonth() / 3) * 3 - i * 3, 1); out.push([iso(d).slice(0, 7), `${Math.floor(d.getMonth() / 3) + 1}° trimestre ${d.getFullYear()}`]); }
  else for (let i = 0; i < 12; i++) { const d = new Date(n.getFullYear(), n.getMonth() - i, 1); out.push([iso(d).slice(0, 7), d.toLocaleDateString("it-IT", { month: "long", year: "numeric" })]); }
  return out;
};

const Stat = ({ label, value, testid }) => (
  <div className="rounded-2xl bg-[var(--raised)] p-4" data-testid={testid}><div className="text-xs text-[var(--fg2)]">{label}</div><div className="mt-1 font-display text-3xl text-[var(--fg)]">{value}</div></div>
);

export const AccountantPanel = ({ clinics, refreshKey }) => {
  const [kind, setKind] = useState("mese");
  const [ref, setRef] = useState(refs("mese")[0][0]);
  const [clinic, setClinic] = useState("");
  const [d, setD] = useState(null);
  const [busy, setBusy] = useState("");
  const [start, end] = useMemo(() => range(kind, ref), [kind, ref]);
  const params = { start, end, clinic };
  useEffect(() => { api.accountant({ start, end, clinic }).then(setD).catch(() => setD(null)); }, [start, end, clinic, refreshKey]);
  const pick = (k) => { setKind(k); setRef(refs(k)[0][0]); };
  const run = async (id, fn) => { setBusy(id); try { await fn(); } catch (e) { toast.error(errMsg(e)); } setBusy(""); };
  const exportPdf = () => run("pdf", async () => { await api.accountantRegister(params); if (d?.summary?.count + d?.summary?.cancelled) await api.accountantInvoices(params); toast.success("Registro e fatture del periodo scaricati"); });
  const send = () => run("mail", async () => { const r = await api.sendAccountant(params); toast.success(`Email inviata a ${r.sent_to} con ${r.attachments} PDF allegati`); });
  const s = d?.summary;

  return (
    <div className="space-y-5" data-testid="accountant-panel">
      <div className={`${card} space-y-4`}>
        <Kicker icon={Briefcase}>Periodo e studio</Kicker>
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="md:w-80"><Seg value={kind} onChange={pick} testid="accountant-period" options={[{ id: "mese", label: "Mese" }, { id: "trimestre", label: "Trimestre" }, { id: "anno", label: "Anno" }]} /></div>
          <select value={ref} onChange={(e) => setRef(e.target.value)} className="h-11 rounded-full border border-[var(--hair)] bg-[var(--surface)] px-4 text-sm capitalize text-[var(--fg)]" data-testid="accountant-ref">{refs(kind).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        </div>
        <ClinicFilter clinics={clinics} value={clinic} onChange={setClinic} testid="accountant-clinic" />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4" data-testid="accountant-summary">
        <Stat label="Fatture" value={s?.count ?? 0} testid="acc-count" />
        <Stat label="Totale imponibile" value={eur(s?.imponibile)} testid="acc-imponibile" />
        <Stat label="Totale esente" value={eur(s?.esente)} testid="acc-esente" />
        <Stat label="IVA" value={eur(s?.iva)} testid="acc-iva" />
        <Stat label="Bolli" value={eur(s?.stamp)} testid="acc-stamp" />
        <Stat label="Ritenute" value={eur(s?.ritenuta)} testid="acc-ritenuta" />
        <Stat label="Aziende · inviate allo SdI" value={`${s?.sdi_sent ?? 0} / ${s?.companies ?? 0}`} testid="acc-sdi" />
        <Stat label="Sistema TS · inviate / da inviare / errori" value={`${s?.sts?.inviata ?? 0} / ${s?.sts?.da_inviare ?? 0} / ${s?.sts?.errore ?? 0}`} testid="acc-sts" />
      </div>
      <div className={card}>
        <Kicker>Incassi per metodo di pagamento</Kicker>
        <div className="mt-3 grid grid-cols-1 gap-x-8 sm:grid-cols-2">
          {(s?.by_method ?? []).filter((m) => m.method !== "online" || m.total).map((m) => <div key={m.method} className="flex justify-between border-b border-[var(--hair)] py-2 text-sm" data-testid={`acc-method-${m.method}`}><span className="text-[var(--fg2)]">{m.label} · {m.count}</span><span className="font-mono text-[var(--fg)]">{eur(m.total)}</span></div>)}
        </div>
        <div className="mt-3 flex justify-between text-sm font-semibold text-[var(--fg)]"><span>Totale incassato</span><span className="font-mono" data-testid="acc-collected">{eur(s?.collected)}</span></div>
      </div>
      <div className="flex flex-col gap-3 rounded-3xl border border-[var(--hair)] bg-[var(--surface)] p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-[var(--fg2)]" data-testid="accountant-email">{d?.accountant_email ? <>Commercialista: <span className="font-medium text-[var(--fg)]">{d.accountant_email}</span></> : "Email del commercialista non impostata: la aggiunga in Impostazioni."}</p>
        <div className="flex flex-wrap gap-2">
          <button onClick={exportPdf} disabled={!!busy} className={btnGhost} data-testid="accountant-export-btn">{busy === "pdf" ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} Esporta PDF</button>
          <button onClick={send} disabled={!!busy || !d?.accountant_email} className={btnMain} data-testid="accountant-send-btn">{busy === "mail" ? <Loader2 size={15} className="animate-spin" /> : <Mail size={15} />} Invia al commercialista</button>
        </div>
      </div>
    </div>
  );
};
