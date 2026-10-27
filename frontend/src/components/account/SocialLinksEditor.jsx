import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, ExternalLink, Info, Loader2 } from "lucide-react";
import { api, errMsg } from "@/lib/api";
import { PLATFORMS, normalizeLink } from "@/lib/socialLinks";
import { Switch } from "@/components/ui/switch";
import { SOCIAL_ICONS } from "@/components/showcase/SocialRow";
import { inp } from "./ui";

const Row = ({ r, i, last, set, move }) => {
  const Icon = SOCIAL_ICONS[r.piattaforma];
  const v = normalizeLink(r.piattaforma, r.url);
  const id = r.piattaforma;
  return (
    <li className="rounded-2xl border border-slate-200 bg-[#F8FAFC] p-3" data-testid={`social-row-${id}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#0A192F] text-[#C9CCD3]"><Icon size={16} strokeWidth={1.75} className="h-4 w-4" /></span>
        <label htmlFor={`social-input-${id}`} className="min-w-[72px] text-sm font-medium text-night">{PLATFORMS[id].label}</label>
        <div className="ml-auto flex items-center gap-1">
          <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="grid h-8 w-8 place-items-center rounded-full border border-slate-200 bg-white text-night disabled:opacity-30" aria-label={`Sposta ${PLATFORMS[id].label} in su`} data-testid={`social-up-${id}`}><ArrowUp size={14} /></button>
          <button type="button" onClick={() => move(i, 1)} disabled={last} className="grid h-8 w-8 place-items-center rounded-full border border-slate-200 bg-white text-night disabled:opacity-30" aria-label={`Sposta ${PLATFORMS[id].label} in giù`} data-testid={`social-down-${id}`}><ArrowDown size={14} /></button>
        </div>
      </div>
      <input id={`social-input-${id}`} value={r.url} maxLength={300} onChange={(e) => set({ url: e.target.value })} placeholder={PLATFORMS[id].ph} aria-invalid={!!v.error}
        className={`${inp} mt-2 ${v.error ? "border-rose-400 focus:border-rose-500" : ""}`} data-testid={`social-input-${id}`} />
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
        {v.error ? <span className="flex-1 text-rose-700" role="alert" data-testid={`social-error-${id}`}>{v.error}</span>
          : v.url ? <span className="min-w-0 flex-1 break-all text-slate-600" data-testid={`social-preview-${id}`}>{v.url}</span>
          : <span className="flex-1 text-slate-400">Nessun link</span>}
        {v.url && !v.error && <a href={v.url} target="_blank" rel="noopener noreferrer nofollow" className="flex items-center gap-1 font-medium text-[#3B6CF6] hover:underline" data-testid={`social-open-${id}`}><ExternalLink size={12} /> Apri per verificare</a>}
        <label className="flex items-center gap-2 text-slate-600"><Switch checked={r.visibile} onCheckedChange={(c) => set({ visibile: c })} aria-label={`Mostra ${PLATFORMS[id].label} in vetrina`} data-testid={`social-visible-${id}`} /> Mostra in vetrina</label>
      </div>
    </li>
  );
};

const visibleOf = (rows) => rows.map((r) => ({ ...r, url: normalizeLink(r.piattaforma, r.url).url })).filter((r) => r.visibile && r.url);

/** Impostazioni > Vetrina: profili social e sito web con validazione in tempo reale e ordine delle icone. */
export const SocialLinksEditor = ({ onPreview }) => {
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.socialLinks().then((r) => setRows(r.links)).catch((e) => toast.error(errMsg(e))); }, []);
  useEffect(() => { if (rows) onPreview(visibleOf(rows).map((r) => ({ piattaforma: r.piattaforma, url: r.url, label: PLATFORMS[r.piattaforma].label }))); }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!rows) return <Loader2 className="animate-spin text-night" />;
  const set = (i, patch) => setRows((x) => x.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const move = (i, d) => setRows((x) => { const y = [...x]; [y[i], y[i + d]] = [y[i + d], y[i]]; return y; });
  const invalid = rows.some((r) => normalizeLink(r.piattaforma, r.url).error);
  const save = async () => {
    setBusy(true);
    try { const r = await api.saveSocialLinks(rows.map(({ piattaforma, url, visibile }) => ({ piattaforma, url, visibile }))); setRows(r.links); toast.success("Profili social salvati"); }
    catch (e) { toast.error(errMsg(e)); }
    setBusy(false);
  };
  return (
    <section data-testid="social-links-editor">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600">Profili social</div>
      <ul className="space-y-2">{rows.map((r, i) => <Row key={r.piattaforma} r={r} i={i} last={i === rows.length - 1} set={(p) => set(i, p)} move={move} />)}</ul>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button onClick={save} disabled={busy || invalid} className="flex h-11 items-center gap-2 rounded-full bg-night px-6 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 disabled:opacity-50" data-testid="social-save-btn">{busy && <Loader2 size={15} className="animate-spin" />} Salva profili social</button>
        {invalid && <span className="text-xs text-rose-700" data-testid="social-invalid-hint">Correggi i campi segnati in rosso per salvare</span>}
      </div>
      <p className="mt-3 flex items-start gap-2 rounded-2xl bg-[#F3F6FF] p-3 text-xs leading-relaxed text-slate-600" data-testid="social-disclaimer"><Info size={14} className="mt-px shrink-0 text-night" /> I contenuti dei tuoi profili social restano sotto la tua responsabilità e devono rispettare le norme deontologiche sull'informazione sanitaria.</p>
    </section>
  );
};
