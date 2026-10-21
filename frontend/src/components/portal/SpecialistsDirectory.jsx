import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { MapPin, Search, ArrowUpRight } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { Avatar, ShowcaseView, imgSrc } from "@/components/showcase/ShowcaseView";

const DoctorTile = ({ d, onOpen, onBook }) => (
  <article className="group flex flex-col overflow-hidden rounded-3xl bg-white ring-1 ring-[#0A192F]/10 transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-lg" data-testid={`specialist-card-${d.slug}`}>
    <button onClick={onOpen} className="relative h-32 overflow-hidden bg-[radial-gradient(circle_at_20%_30%,#1E3A5F_0,#0A192F_60%)]" aria-label={`Vetrina di ${d.name}`}>{d.cover_url && <img src={imgSrc(d.cover_url)} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />}</button>
    <div className="relative z-10 -mt-9 flex flex-1 flex-col gap-2 px-5 pb-5">
      <Avatar src={d.photo_url} name={d.name} size="h-16 w-16 text-xl" ring="ring-4 ring-white" />
      <div className="font-display text-2xl leading-tight text-night">{d.name}</div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm"><span className="font-medium text-[#3B6CF6]">{d.specialty}</span>{d.city && <span className="flex items-center gap-1 text-[#0A192F]/60"><MapPin size={13} strokeWidth={1.5} /> {d.city}</span>}</div>
      <p className="line-clamp-3 text-sm leading-relaxed text-[#0A192F]/70" data-testid={`specialist-bio-${d.slug}`}>{d.bio_short || d.tagline || "Medico della rete MantMed."}</p>
      {d.services?.length > 0 && <div className="flex flex-wrap gap-1.5" data-testid={`specialist-services-${d.slug}`}>{d.services.map((s) => <span key={s} className="rounded-full bg-[#F6F1E9] px-3 py-1 text-xs text-night">{s}</span>)}{d.services_count > d.services.length && <span className="px-1 py-1 text-xs text-[#0A192F]/50">+{d.services_count - d.services.length}</span>}</div>}
      <div className="mt-auto grid grid-cols-2 gap-2 pt-3">
        <button onClick={onOpen} className="flex h-11 items-center justify-center gap-1 rounded-full text-sm font-medium text-night ring-1 ring-[#0A192F]/15 transition-colors hover:ring-night" data-testid={`specialist-view-${d.slug}`}>Visualizza profilo <ArrowUpRight size={14} /></button>
        <button onClick={onBook} className="h-11 rounded-full bg-night text-sm font-semibold text-white transition-transform hover:-translate-y-0.5" data-testid={`specialist-book-${d.slug}`}>Richiedi appuntamento</button>
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
  useEffect(() => { if (slug) api.publicDoctor(slug).then(setOpen).catch(() => setOpen(null)); else setOpen(null); }, [slug]);
  const show = (s) => setParams(s ? { medico: s } : {});
  const [spec, setSpec] = useState("");
  const specs = [...new Set((list ?? []).map((d) => d.specialty))].sort();
  const shown = (list ?? []).filter((d) => (!spec || d.specialty === spec) && `${d.name} ${d.specialty} ${d.city}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <section data-testid="specialists-directory">
      <p className="max-w-2xl text-[#0A192F]/70">I medici della rete MantMed: conosca chi la seguirà, le prestazioni e gli studi, poi prenoti in pochi passaggi.</p>
      <label className="mt-6 flex h-12 max-w-md items-center gap-2 rounded-full bg-white px-5 ring-1 ring-[#0A192F]/10 focus-within:ring-night"><Search size={16} className="text-[#0A192F]/50" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome, specialità o città" className="w-full bg-transparent text-sm text-night outline-none" data-testid="specialists-search-input" /></label>
      {specs.length > 0 && <div className="mt-4 flex flex-wrap gap-2" data-testid="specialists-filters">{["", ...specs].map((x) => <button key={x || "all"} onClick={() => setSpec(x)} className={`rounded-full px-4 py-2 text-sm transition-colors ${spec === x ? "bg-night text-white" : "bg-white text-night ring-1 ring-[#0A192F]/10 hover:ring-night"}`} data-testid={`specialists-filter-${x || "tutti"}`}>{x || "Tutte le specialità"}</button>)}</div>}
      <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((d) => <DoctorTile key={d.id} d={d} onOpen={() => show(d.slug)} onBook={() => onBook(d.id)} />)}
      </div>
      {list && !shown.length && <p className="mt-6 rounded-2xl border border-dashed border-[#0A192F]/20 p-8 text-center text-sm text-[#0A192F]/60" data-testid="specialists-empty">Nessuno specialista trovato.</p>}
      <Dialog open={!!open} onOpenChange={(o) => !o && show(null)}>
        <DialogContent className="max-h-[92vh] w-[calc(100%-1.5rem)] overflow-y-auto rounded-3xl border-0 bg-transparent p-0 shadow-none sm:max-w-3xl [&>button]:z-10 [&>button]:rounded-full [&>button]:bg-white [&>button]:p-1.5" data-testid="specialist-dialog">
          <DialogTitle className="sr-only">Vetrina del medico</DialogTitle>
          {open && <ShowcaseView d={open} onBook={() => { show(null); onBook(open.id); }} />}
        </DialogContent>
      </Dialog>
    </section>
  );
};
