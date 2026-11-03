import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { MapPin, Search, ArrowUpRight } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { Avatar, ShowcaseView, imgSrc } from "@/components/showcase/ShowcaseView";
import { Availability } from "@/components/showcase/Availability";

const DoctorTile = ({ d, onOpen, onBook }) => (
  <article className="group flex flex-col overflow-hidden rounded-3xl bg-[var(--surface)] ring-1 ring-[var(--sel)] transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-lg" data-testid={`specialist-card-${d.slug}`}>
    <button onClick={onOpen} className="relative h-32 overflow-hidden bg-[radial-gradient(circle_at_20%_30%,var(--accent)_0,var(--bar)_60%)]" aria-label={`Vetrina di ${d.name}`}>{d.cover_url && <img src={imgSrc(d.cover_url)} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />}</button>
    <div className="relative z-10 -mt-9 flex flex-1 flex-col gap-2 px-5 pb-5">
      <Avatar src={d.photo_url} name={d.name} size="h-16 w-16 text-xl" ring="ring-4 ring-[var(--ink)]" />
      <div className="font-display text-2xl leading-tight text-[var(--fg)]">{d.name}</div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm"><span className="font-medium text-[var(--accent)]">{d.specialty}</span>{d.city && <span className="flex items-center gap-1 text-[var(--fg2)]"><MapPin size={13} strokeWidth={1.5} /> {d.city}</span>}</div>
      <p className="line-clamp-3 text-sm leading-relaxed text-[var(--fg2)]" data-testid={`specialist-bio-${d.slug}`}>{d.bio_short || d.tagline || "Medico della rete MantMed."}</p>
      {d.services?.length > 0 && <div className="flex flex-wrap gap-1.5" data-testid={`specialist-services-${d.slug}`}>{d.services.map((s) => <span key={s} className="rounded-full bg-[var(--bg)] px-3 py-1 text-xs text-[var(--fg)]">{s}</span>)}{d.services_count > d.services.length && <span className="px-1 py-1 text-xs text-[var(--fg2)]">+{d.services_count - d.services.length}</span>}</div>}
      <div className="mt-auto flex flex-col gap-2 pt-3 sm:flex-row">
        <button onClick={onOpen} className="flex h-11 flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-full px-3 text-sm font-medium text-[var(--fg)] ring-1 ring-[var(--sel)] transition-colors hover:ring-[var(--accent)]" data-testid={`specialist-view-${d.slug}`}>Visualizza profilo <ArrowUpRight size={14} /></button>
        <button onClick={onBook} className="h-11 flex-1 whitespace-nowrap rounded-full bg-[var(--accent)] px-3 text-sm font-semibold text-[var(--ink)] transition-transform hover:-translate-y-0.5" data-testid={`specialist-book-${d.slug}`} title="Richiedi appuntamento">Richiedi visita</button>
      </div>
    </div>
  </article>
);

/** Portale: "Trova Specialista" — medici della rete MantMed con la loro Vetrina e prenotazione. */
export const SpecialistsDirectory = ({ onBook }) => {
  const [list, setList] = useState(null);
  const [q, setQ] = useState("");
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = useState(null);
  const slug = params.get("medico");
  useEffect(() => { api.publicDoctors().then(setList).catch(() => setList([])); }, []);
  const slotParam = params.get("slot");
  useEffect(() => {
    if (!slug) { setOpen(null); return; }
    api.publicDoctor(slug).then((doc) => {
      if (slotParam) {  // arrivo dalla pagina pubblica con un orario scelto: prenotazione già compilata
        const [date, time, clinic, service] = slotParam.split("|");
        setParams({});
        onBook(doc.id, { date, time, clinic, service });
      } else setOpen(doc);
    }).catch(() => setOpen(null));
  }, [slug]); // eslint-disable-line react-hooks/exhaustive-deps
  const show = (s) => setParams(s ? { medico: s } : {});
  const [spec, setSpec] = useState("");
  const specs = [...new Set((list ?? []).map((d) => d.specialty))].sort();
  const shown = (list ?? []).filter((d) => (!spec || d.specialty === spec) && `${d.name} ${d.specialty} ${d.city}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <section data-testid="specialists-directory">
      <p className="max-w-2xl text-[var(--fg2)]">I medici della rete MantMed: conosca chi la seguirà, le prestazioni e gli studi, poi prenoti in pochi passaggi.</p>
      <label className="mt-6 flex h-12 max-w-md items-center gap-2 rounded-full bg-[var(--surface)] px-5 ring-1 ring-[var(--sel)] focus-within:ring-[var(--accent)]"><Search size={16} className="text-[var(--fg2)]" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome, specialità o città" className="w-full bg-transparent text-sm text-[var(--fg)] outline-none" data-testid="specialists-search-input" /></label>
      {specs.length > 0 && <div className="mt-4 flex flex-wrap gap-2" data-testid="specialists-filters">{["", ...specs].map((x) => <button key={x || "all"} onClick={() => setSpec(x)} className={`rounded-full px-4 py-2 text-sm transition-colors ${spec === x ? "bg-[var(--accent)] text-[var(--ink)]" : "bg-[var(--surface)] text-[var(--fg)] ring-1 ring-[var(--sel)] hover:ring-[var(--accent)]"}`} data-testid={`specialists-filter-${x || "tutti"}`}>{x || "Tutte le specialità"}</button>)}</div>}
      <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((d) => <DoctorTile key={d.id} d={d} onOpen={() => show(d.slug)} onBook={() => onBook(d.id)} />)}
      </div>
      {list && !shown.length && <p className="mt-6 rounded-2xl border border-dashed border-[var(--sel)] p-8 text-center text-sm text-[var(--fg2)]" data-testid="specialists-empty">Nessuno specialista trovato.</p>}
      <Dialog open={!!open} onOpenChange={(o) => !o && show(null)}>
        <DialogContent className="max-h-[92vh] w-[calc(100%-1.5rem)] overflow-y-auto rounded-3xl border-0 bg-transparent p-0 shadow-none sm:max-w-3xl [&>button]:z-10 [&>button]:rounded-full [&>button]:bg-[var(--surface)] [&>button]:p-1.5" data-testid="specialist-dialog">
          <DialogTitle className="sr-only">Vetrina del medico</DialogTitle>
          {open && <ShowcaseView d={open} onBook={() => { show(null); onBook(open.id); }} extra={<Availability slug={open.slug} onPick={(s) => { show(null); onBook(open.id, s); }} />} />}
        </DialogContent>
      </Dialog>
    </section>
  );
};
