import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Store, Loader2, ImagePlus, Trash2, Copy, ExternalLink, Plus, X, Eye } from "lucide-react";
import { api, errMsg } from "@/lib/api";
import { Card, inp } from "./ui";
import { ShowcaseView } from "@/components/showcase/ShowcaseView";
import { SocialLinksEditor } from "./SocialLinksEditor";

const Upload = ({ kind, label, url, onDone, onRemove, testid }) => {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  const pick = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (f.size > 8 * 1024 * 1024) return toast.error("Immagine troppo grande (massimo 8 MB)");
    setBusy(true);
    try { onDone(await api.uploadShowcaseImage(kind, f)); toast.success(`${label} aggiornata`); } catch (er) { toast.error(errMsg(er)); }
    setBusy(false);
  };
  return (
    <div className="flex items-center gap-2">
      <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={pick} data-testid={`${testid}-input`} />
      <button type="button" onClick={() => ref.current?.click()} disabled={busy} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl border border-dashed border-[var(--hair)] bg-[var(--bg)] px-4 text-sm text-[var(--fg)] transition-colors hover:border-[var(--accent)]" data-testid={`${testid}-btn`}>
        {busy ? <Loader2 size={15} className="animate-spin" /> : <ImagePlus size={15} strokeWidth={1.5} />} {url ? `Cambia ${label.toLowerCase()}` : `Carica ${label.toLowerCase()}`}
      </button>
      {url && <button type="button" onClick={onRemove} className="grid h-11 w-11 place-items-center rounded-2xl border border-[var(--hair)] text-[var(--alert)] hover:border-[var(--alert)]" aria-label={`Rimuovi ${label}`} data-testid={`${testid}-remove`}><Trash2 size={15} /></button>}
    </div>
  );
};

const ServiceRow = ({ s, i, set, del }) => (
  <div className="grid grid-cols-[1fr_1fr_auto] gap-2 rounded-2xl border border-[var(--hair)] bg-[var(--raised)] p-3" data-testid={`showcase-edit-service-${i}`}>
    <input value={s.name} onChange={(e) => set({ name: e.target.value })} placeholder="Prestazione" className={`${inp} col-span-2`} data-testid={`showcase-service-name-${i}`} />
    <button type="button" onClick={del} className="grid h-11 w-11 place-items-center rounded-full border border-[var(--hair)] text-[var(--alert)] hover:border-[var(--alert)]" aria-label="Rimuovi prestazione" data-testid={`showcase-service-del-${i}`}><X size={14} /></button>
    <input type="number" min={5} value={s.duration_min ?? ""} onChange={(e) => set({ duration_min: e.target.value ? Number(e.target.value) : null })} placeholder="Min" className={inp} aria-label="Durata in minuti" data-testid={`showcase-service-duration-${i}`} />
    <input type="number" min={0} value={s.price ?? ""} onChange={(e) => set({ price: e.target.value ? Number(e.target.value) : null })} placeholder="€ (facolt.)" className={`${inp} col-span-2`} aria-label="Prezzo" data-testid={`showcase-service-price-${i}`} />
    <input value={s.description} onChange={(e) => set({ description: e.target.value })} placeholder="Breve descrizione (facoltativa)" className={`${inp} col-span-3`} data-testid={`showcase-service-desc-${i}`} />
  </div>
);

/** Area Riservata: Vetrina pubblica del medico con anteprima dal vivo. */
export const ShowcaseSection = () => {
  const [d, setD] = useState(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  useEffect(() => { api.showcase().then(setD).catch((e) => toast.error(errMsg(e))); }, []);
  if (!d) return <Card id="account-showcase" icon={Store} title="Vetrina pubblica" text=""><Loader2 className="animate-spin text-[var(--fg)]" /></Card>;
  const set = (patch) => setD((x) => ({ ...x, ...patch }));
  const setSvc = (i, patch) => set({ services: d.services.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const keepImages = (r) => setD((x) => ({ ...x, photo_url: r.photo_url, cover_url: r.cover_url }));
  const link = `${window.location.origin}/medico/${d.slug}`;
  const save = async () => {
    setBusy(true);
    try { setD(await api.saveShowcase({ bio: d.bio, tagline: d.tagline, published: d.published, services: d.services.filter((s) => s.name.trim()) })); toast.success("Vetrina pubblicata"); } catch (e) { toast.error(errMsg(e)); }
    setBusy(false);
  };
  return (
    <Card id="account-showcase" icon={Store} title="Vetrina pubblica" text="La pagina con cui i pazienti la conoscono: compare in «Trova Specialista» nel Portale ed è condivisibile con un link.">
      <div className="grid grid-cols-1 items-start gap-8 xl:grid-cols-2">
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-[var(--raised)] p-3 text-sm" data-testid="showcase-link">
            <span className="min-w-0 flex-1 truncate text-[var(--fg)]">{link}</span>
            <button onClick={() => navigator.clipboard?.writeText(link).then(() => toast.success("Link copiato"))} className="flex h-9 items-center gap-1.5 rounded-full bg-[var(--surface)] px-3 text-[var(--fg)] ring-1 ring-[var(--hair)] hover:ring-[var(--accent)]" data-testid="showcase-copy-link"><Copy size={13} /> Copia</button>
            <a href={link} target="_blank" rel="noreferrer" className="flex h-9 items-center gap-1.5 rounded-full bg-[var(--surface)] px-3 text-[var(--fg)] ring-1 ring-[var(--hair)] hover:ring-[var(--accent)]" data-testid="showcase-open-link"><ExternalLink size={13} /> Apri</a>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--fg2)]">Foto profilo</div><Upload kind="photo" label="Foto" url={d.photo_url} onDone={keepImages} onRemove={() => api.deleteShowcaseImage("photo").then(keepImages)} testid="showcase-photo" /></div>
            <div><div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--fg2)]">Copertina dello studio</div><Upload kind="cover" label="Copertina" url={d.cover_url} onDone={keepImages} onRemove={() => api.deleteShowcaseImage("cover").then(keepImages)} testid="showcase-cover" /></div>
          </div>
          <label className="block"><span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--fg2)]">Frase di benvenuto</span><input value={d.tagline} maxLength={120} onChange={(e) => set({ tagline: e.target.value })} placeholder="Es. Ascolto, chiarezza e tempo dedicato a ogni paziente." className={inp} data-testid="showcase-tagline-input" /></label>
          <label className="block"><span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--fg2)]">Biografia</span><textarea value={d.bio} maxLength={2500} rows={6} onChange={(e) => set({ bio: e.target.value })} placeholder="Si presenti con calore: formazione, approccio, cosa possono aspettarsi i pazienti…" className="w-full rounded-2xl border border-[var(--hair)] bg-[var(--surface)] p-3 text-sm text-[var(--fg)] outline-none focus:border-[var(--accent)]" data-testid="showcase-bio-input" /></label>
          <div>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--fg2)]">Prestazioni offerte</div>
            <div className="space-y-2">{d.services.map((s, i) => <ServiceRow key={s.id ?? i} s={s} i={i} set={(p) => setSvc(i, p)} del={() => set({ services: d.services.filter((_, j) => j !== i) })} />)}</div>
            <button type="button" onClick={() => set({ services: [...d.services, { id: Math.random().toString(36).slice(2, 12), name: "", duration_min: 30, price: null, description: "" }] })} className="mt-2 flex items-center gap-1.5 rounded-full border border-dashed border-[var(--hair)] px-4 py-2 text-sm text-[var(--fg2)] hover:border-[var(--accent)] hover:text-[var(--fg)]" data-testid="showcase-service-add"><Plus size={14} /> Aggiungi prestazione</button>
          </div>
          <SocialLinksEditor onPreview={(social_links) => set({ social_links })} />
          <label className="flex items-center gap-3 text-sm text-[var(--fg)]"><input type="checkbox" checked={d.published} onChange={(e) => set({ published: e.target.checked })} className="h-5 w-5 accent-[var(--accent)]" data-testid="showcase-published-toggle" /> Vetrina visibile ai pazienti</label>
          <div className="flex flex-wrap gap-2">
            <button onClick={save} disabled={busy} className="flex h-11 items-center gap-2 rounded-full bg-[var(--accent)] px-6 text-sm font-semibold text-[var(--ink)] transition-transform hover:-translate-y-0.5 disabled:opacity-50" data-testid="showcase-save-btn">{busy && <Loader2 size={15} className="animate-spin" />} Salva e pubblica</button>
            <button onClick={() => setPreview((p) => !p)} className="flex h-11 items-center gap-2 rounded-full border border-[var(--hair)] px-5 text-sm text-[var(--fg)] xl:hidden" data-testid="showcase-preview-toggle"><Eye size={15} /> {preview ? "Nascondi anteprima" : "Anteprima"}</button>
          </div>
        </div>
        <div className={`${preview ? "block" : "hidden"} xl:sticky xl:top-[9.5rem] xl:block`} data-testid="showcase-preview">
          <div className="rounded-[28px] bg-[var(--sel)] p-2">
            <div className="flex items-center gap-1.5 px-3 py-2"><span className="h-2.5 w-2.5 rounded-full bg-rose-300" /><span className="h-2.5 w-2.5 rounded-full bg-[var(--wait)]" /><span className="h-2.5 w-2.5 rounded-full bg-[var(--ok)]" /><span className="ml-3 truncate text-[11px] text-[var(--fg2)]">mantmed · /medico/{d.slug}</span></div>
            <div className="max-h-[75vh] overflow-y-auto rounded-3xl"><ShowcaseView d={d} compact onBook={() => {}} /></div>
          </div>
        </div>
      </div>
    </Card>
  );
};
