import { Clock, MapPin, Stethoscope, Mail, Phone, CalendarPlus } from "lucide-react";
import { SocialRow } from "./SocialRow";

const BACKEND = process.env.REACT_APP_BACKEND_URL;
export const imgSrc = (u) => (u ? (u.startsWith("http") || u.startsWith("blob:") ? u : `${BACKEND}${u}`) : null);
export const initials = (name = "") => name.replace(/^(dott\.?(ssa)?|dr\.?|prof\.?(ssa)?)\s+/i, "").split(" ").filter(Boolean).slice(0, 2).map((x) => x[0]).join("").toUpperCase();
const euro = (n) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: n % 1 ? 2 : 0 }).format(n);

export const Avatar = ({ src, name, size = "h-16 w-16 text-xl", ring = "" }) => (src
  ? <img src={imgSrc(src)} alt={name} className={`${size} ${ring} shrink-0 rounded-full object-cover`} />
  : <span className={`${size} ${ring} grid shrink-0 place-items-center rounded-full bg-[var(--raised)] font-display text-[var(--fg)]`}>{initials(name)}</span>);

const ServiceCard = ({ s, i }) => (
  <div className="group rounded-2xl border border-[var(--sel)] bg-[var(--surface)] p-5 transition-[transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-md" data-testid={`showcase-service-${i}`}>
    <div className="flex items-start justify-between gap-3">
      <div className="font-display text-xl leading-tight text-[var(--fg)]">{s.name}</div>
      {s.price ? <div className="shrink-0 rounded-full bg-[var(--sel)] px-3 py-1 text-sm font-semibold text-[var(--fg)] ring-1 ring-[var(--hair)]">{euro(s.price)}</div> : null}
    </div>
    {s.description && <p className="mt-2 text-sm leading-relaxed text-[var(--fg2)]">{s.description}</p>}
    {s.duration_min ? <div className="mt-3 flex items-center gap-1.5 text-xs text-[var(--fg2)]"><Clock size={13} strokeWidth={1.5} /> {s.duration_min} minuti</div> : null}
  </div>
);

/** Vetrina del medico: usata nella pagina pubblica, nel Portale e come anteprima dal vivo nell'editor. */
export const ShowcaseView = ({ d, onBook, bookLabel = "Prenota una visita", compact = false, extra = null }) => (
  <article className="overflow-hidden rounded-3xl bg-[var(--bg)] ring-1 ring-[var(--sel)]" data-testid="showcase-view">
    <div className={`relative ${compact ? "h-36" : "h-48 sm:h-64 lg:h-72"} bg-[var(--accent)]`}>
      {d.cover_url ? <img src={imgSrc(d.cover_url)} alt="Lo studio" className="h-full w-full object-cover" data-testid="showcase-cover" />
        : <div className="h-full w-full bg-[radial-gradient(circle_at_20%_30%,#1E3A5F_0,#0A192F_60%)]" />}
      <div className="absolute inset-0 bg-gradient-to-t from-[var(--sel)] to-transparent" />
    </div>
    <div className={`relative ${compact ? "px-5 pb-6" : "px-5 pb-10 sm:px-10"}`}>
      <div className={compact ? "-mt-10" : "-mt-14"}><Avatar src={d.photo_url} name={d.name} size={compact ? "h-20 w-20 text-2xl" : "h-28 w-28 text-4xl"} ring="ring-4 ring-[var(--hair)] shadow-lg" /></div>
      <div className={`mt-4 flex flex-col gap-4 ${compact ? "" : "sm:flex-row sm:items-end sm:justify-between sm:gap-6"}`}>
        <div className="min-w-0 flex-1">
          <h1 className={`font-display ${compact ? "text-2xl" : "text-4xl sm:text-5xl"} leading-tight text-[var(--fg)]`} data-testid="showcase-name">{d.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[var(--fg2)]">
            <span className="flex items-center gap-1.5 font-medium text-[var(--accent)]"><Stethoscope size={14} strokeWidth={1.5} /> {d.specialty}</span>
            {d.city && <span className="flex items-center gap-1.5"><MapPin size={14} strokeWidth={1.5} /> {d.city}</span>}
          </div>
          <SocialRow links={d.social_links} name={d.name} compact={compact} />
        </div>
        {onBook && <button onClick={onBook} className="flex h-12 items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-6 text-sm font-semibold text-[var(--ink)] transition-transform hover:-translate-y-0.5" data-testid="showcase-book-btn"><CalendarPlus size={16} strokeWidth={1.5} /> {bookLabel}</button>}
      </div>
      {extra && <div className="mt-8">{extra}</div>}
      {d.tagline && <p className={`mt-6 font-display italic text-[var(--fg2)] ${compact ? "text-lg" : "text-2xl"}`} data-testid="showcase-tagline">«{d.tagline}»</p>}
      <div className={`mt-8 grid gap-8 ${compact ? "" : "lg:grid-cols-[1.4fr_1fr]"}`}>
        <section>
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--fg2)]">Chi sono</div>
          <p className="mt-3 whitespace-pre-line leading-relaxed text-[var(--fg2)]" data-testid="showcase-bio">{d.bio || "La biografia del medico sarà disponibile a breve."}</p>
        </section>
        <aside className="space-y-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--fg2)]">Dove riceve</div>
          {(d.clinics ?? []).map((c) => <div key={c.name} className="rounded-2xl bg-[var(--surface)] p-4 text-sm ring-1 ring-[var(--sel)]"><div className="font-medium text-[var(--fg)]">{c.name}</div>{c.address && <div className="mt-0.5 text-[var(--fg2)]">{c.address}</div>}</div>)}
          {(d.phone || d.contact_email) && <div className="space-y-1 text-sm text-[var(--fg2)]">{d.phone && <div className="flex items-center gap-2"><Phone size={13} strokeWidth={1.5} /> {d.phone}</div>}{d.contact_email && <div className="flex items-center gap-2"><Mail size={13} strokeWidth={1.5} /> {d.contact_email}</div>}</div>}
        </aside>
      </div>
      {(d.services ?? []).length > 0 && (
        <section className="mt-10">
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--fg2)]">Prestazioni</div>
          <div className={`mt-4 grid gap-3 ${compact ? "" : "sm:grid-cols-2"}`}>{d.services.map((s, i) => <ServiceCard key={s.id ?? i} s={s} i={i} />)}</div>
        </section>
      )}
    </div>
  </article>
);
