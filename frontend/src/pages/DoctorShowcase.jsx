import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { LogoMark } from "@/components/dash/Logo";
import { ShowcaseView } from "@/components/showcase/ShowcaseView";
import { Availability } from "@/components/showcase/Availability";

/** Pagina pubblica condivisibile della Vetrina: /medico/:slug (nessun accesso richiesto). */
export default function DoctorShowcase() {
  const { slug } = useParams();
  const [d, setD] = useState(undefined);
  useEffect(() => { api.publicDoctor(slug).then((x) => { setD(x); document.title = `${x.name} · ${x.specialty} | MantMed`; }).catch(() => setD(null)); }, [slug]);
  return (
    <div className="min-h-screen bg-[var(--bg)]" data-testid="public-showcase-page"><ThemeToggle floating />
      <header className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5">
        <Link to="/" className="flex items-center gap-2" data-testid="public-showcase-home"><LogoMark size={32} /><span className="font-display text-2xl text-[var(--fg)]">MantMed</span></Link>
        <Link to="/portale/trova-specialista" className="rounded-full border border-[var(--sel)] px-4 py-2 text-sm text-[var(--fg)] transition-colors hover:border-[var(--accent)]" data-testid="public-showcase-portal">Trova Specialista</Link>
      </header>
      <main className="mx-auto max-w-5xl px-3 pb-16 sm:px-5">
        {d === undefined && <Loader2 className="mx-auto mt-20 animate-spin text-[var(--fg)]" />}
        {d === null && <p className="mt-20 text-center text-[var(--fg2)]" data-testid="public-showcase-missing">Vetrina non disponibile.</p>}
        {d && <ShowcaseView d={d} onBook={() => { window.location.href = `/portale/trova-specialista?medico=${d.slug}`; }} bookLabel="Prenota dal Portale"
          extra={<Availability slug={d.slug} onPick={(s) => { window.location.href = `/portale/trova-specialista?medico=${d.slug}&slot=${encodeURIComponent([s.date, s.time, s.clinic, s.service].join("|"))}`; }} />} />}
        {d && <p className="mt-6 text-center text-xs text-[var(--fg2)]">La prenotazione avviene nel Portale Paziente MantMed: se non ha un account può registrarsi in un minuto.</p>}
      </main>
    </div>
  );
}
