import { Facebook, Globe, Instagram, Linkedin, Youtube } from "lucide-react";

const TikTok = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
    <path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5" /><path d="M14 3c.4 2.6 2.3 4.5 5 4.8" />
  </svg>
);
const XLogo = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true" {...p}>
    <path d="M4 4l16 16M20 4L4 20" />
  </svg>
);

export const SOCIAL_ICONS = { instagram: Instagram, facebook: Facebook, linkedin: Linkedin, youtube: Youtube, tiktok: TikTok, x: XLogo, website: Globe };

const ofDoctor = (name = "") => (/^\s*(dott\.?\s*ssa|dr\.?\s*ssa|prof\.?\s*ssa)/i.test(name) ? `della ${name}` : /^\s*(dott|dr|prof)/i.test(name) ? `del ${name}` : `di ${name}`);

/** Riga di icone social della vetrina: semplici link diretti, nessuno script/immagine/cookie dei social. */
export const SocialRow = ({ links = [], name, compact = false }) => {
  if (!links.length) return null;
  return (
    <ul className="mt-3 flex flex-wrap items-center gap-2" aria-label="Profili social e sito web" data-testid="showcase-social-row">
      {links.map((l) => {
        const Icon = SOCIAL_ICONS[l.piattaforma] ?? Globe;
        const label = l.piattaforma === "website" ? `Sito web ${ofDoctor(name)}` : `Profilo ${l.label} ${ofDoctor(name)}`;
        return (
          <li key={l.piattaforma} className="group relative">
            <a href={l.url} target="_blank" rel="noopener noreferrer nofollow" aria-label={label}
              className={`grid ${compact ? "h-9 w-9" : "h-10 w-10"} place-items-center rounded-full bg-[var(--accent)] text-[var(--fg2)] ring-1 ring-[var(--hair)] transition-[transform,color,background-color] duration-200 hover:-translate-y-0.5 hover:bg-[var(--accent)] hover:text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]`}
              data-testid={`showcase-social-${l.piattaforma}`}>
              <Icon size={compact ? 16 : 18} strokeWidth={1.75} className="h-[18px] w-[18px]" />
            </a>
            <span role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-full bg-[var(--accent)] px-2.5 py-1 text-[11px] font-medium text-[var(--ink)] opacity-0 shadow transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">{l.label}</span>
          </li>
        );
      })}
    </ul>
  );
};
