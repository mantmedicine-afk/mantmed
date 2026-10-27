// Validazione e normalizzazione dei link social: identica a backend/social_links.py.
export const PLATFORMS = {
  instagram: { label: "Instagram", domains: ["instagram.com"], user: (u) => `https://instagram.com/${u}`, ph: "@nomeutente o https://instagram.com/…" },
  facebook: { label: "Facebook", domains: ["facebook.com", "fb.com"], user: (u) => `https://facebook.com/${u}`, ph: "@nomepagina o https://facebook.com/…" },
  linkedin: { label: "LinkedIn", domains: ["linkedin.com"], user: (u) => `https://linkedin.com/in/${u}`, ph: "@nomeutente o https://linkedin.com/in/…" },
  youtube: { label: "YouTube", domains: ["youtube.com", "youtu.be"], user: (u) => `https://youtube.com/@${u}`, ph: "@canale o https://youtube.com/…" },
  tiktok: { label: "TikTok", domains: ["tiktok.com"], user: (u) => `https://tiktok.com/@${u}`, ph: "@nomeutente o https://tiktok.com/@…" },
  x: { label: "X", domains: ["x.com", "twitter.com"], user: (u) => `https://x.com/${u}`, ph: "@nomeutente o https://x.com/…" },
  website: { label: "Sito web", domains: null, user: null, ph: "https://www.ilmiostudio.it" },
};
const MAX_LEN = 300;
const BAD_SCHEME = /^\s*(javascript|data|vbscript|file)\s*:/i;
const USERNAME = /^@?([A-Za-z0-9._-]{1,100})$/;
const URL_RE = /^https:\/\/([^/?#]+)([^?#]*)(\?[^#]*)?(#.*)?$/i;
const HOST = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/;
const SAFE = /^[^\s<>"'`\\{}|^]*$/;

const err = (p) => (PLATFORMS[p].domains ? `Inserisci un indirizzo di ${PLATFORMS[p].domains[0]} valido` : "Inserisci un indirizzo web valido che inizi con https://");

/** Ritorna { url } normalizzato (stringa vuota = nessun link) oppure { error }. */
export const normalizeLink = (p, raw) => {
  let s = (raw ?? "").trim();
  if (!s) return { url: "" };
  if (s.length > MAX_LEN) return { error: `Indirizzo troppo lungo (massimo ${MAX_LEN} caratteri)` };
  if (BAD_SCHEME.test(s)) return { error: "Indirizzo non ammesso: sono accettati solo link https" };
  const { user, domains } = PLATFORMS[p];
  const m = s.match(USERNAME);
  if (user && m && (s.startsWith("@") || !s.includes("."))) return { url: user(m[1]) };
  if (user && m) return { error: `${err(p)} (per il solo nome utente scrivi la @ davanti)` };
  if (/^[a-z][a-z0-9+.-]*:/i.test(s) && !s.toLowerCase().startsWith("https://")) return { error: "Sono accettati solo link sicuri che iniziano con https://" };
  if (!s.includes("://")) s = `https://${s}`;
  const u = s.match(URL_RE);
  if (!u || !SAFE.test(s)) return { error: err(p) };
  const host = u[1].toLowerCase();
  let path = u[2];
  const query = u[3] ?? "";
  if (host.includes("@")) return { error: "Indirizzo non ammesso: non può contenere nome utente o password" };
  if (!HOST.test(host)) return { error: err(p) };
  if (domains) {
    if (!domains.some((d) => host === d || host.endsWith(`.${d}`))) return { error: err(p) };
    if (path.replace(/\//g, "") === "") return { error: `Inserisci l'indirizzo del profilo, non solo ${domains[0]}` };
  }
  path = path === "" || path === "/" ? "" : path.replace(/\/+$/, "");
  const out = `https://${host}${path}${query}`;
  return out.length > MAX_LEN ? { error: `Indirizzo troppo lungo (massimo ${MAX_LEN} caratteri)` } : { url: out };
};
