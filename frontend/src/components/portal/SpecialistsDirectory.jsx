import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { MapPin, Search, ArrowUpRight } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { Avatar, ShowcaseView, imgSrc } from "@/components/showcase/ShowcaseView";

const DoctorTile = ({ d, onOpen }) => (
  <button onClick={onOpen} className="group flex flex-col overflow-hidden rounded-3xl bg-white text-left ring-1 ring-[#0A192F]/10 transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-lg" data-testid={`specialist-card-${d.slug}`}>
    <div className="relative h-28 bg-[#0A192F]">{d.cover_url && <img src={imgSrc(d.cover_url)} alt="" className="h-full w-full object-cover opacity-90" />}</div>
    <div className="relative z-10 -mt-9 flex flex-1 flex-col gap-2 px-5 pb-5">
      <Avatar src={d.photo_url} name={d.name} size="h-16 w-16 text-xl" ring="ring-4 ring-white" />
      <div className="font-display text-2xl leading-tight text-night">{d.name}</div>
      <div className="text-sm font-medium text-[#3B6CF6]">{d.specialty}</div>
      {d.city && <div className="flex items-center gap-1.5 text-sm text-[#0A192F]/60"><MapPin size={13} strokeWidth={1.5} /> {d.city}</div>}
      {d.tagline && <p className="line-clamp-2 text-sm italic text-[#0A192F]/70">«{d.tagline}»</p>}
      <span className="mt-auto flex items-center gap-1 pt-3 text-sm font-semibold text-night">Vedi la Vetrina <ArrowUpRight size={15} className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" /></span>
    </div>
  </button>
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
  const shown = (list ?? []).filter((d) => `${d.name} ${d.specialty} ${d.city}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <section data-testid="specialists-directory">
      <p className="max-w-2xl text-[#0A192F]/70">I medici della rete MantMed: conosca chi la seguirà, le prestazioni e gli studi, poi prenoti in pochi passaggi.</p>
      <label className="mt-6 flex h-12 max-w-md items-center gap-2 rounded-full bg-white px-5 ring-1 ring-[#0A192F]/10 focus-within:ring-night"><Search size={16} className="text-[#0A192F]/50" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome, specialità o città" className="w-full bg-transparent text-sm text-night outline-none" data-testid="specialists-search-input" /></label>
      <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((d) => <DoctorTile key={d.id} d={d} onOpen={() => show(d.slug)} />)}
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
