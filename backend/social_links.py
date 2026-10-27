"""Profili social e sito web del medico per la vetrina: validazione e normalizzazione (identica a frontend/src/lib/socialLinks.js)."""
import re

PLATFORMS = {
    "instagram": {"label": "Instagram", "domains": ("instagram.com",), "user": "https://instagram.com/{u}"},
    "facebook": {"label": "Facebook", "domains": ("facebook.com", "fb.com"), "user": "https://facebook.com/{u}"},
    "linkedin": {"label": "LinkedIn", "domains": ("linkedin.com",), "user": "https://linkedin.com/in/{u}"},
    "youtube": {"label": "YouTube", "domains": ("youtube.com", "youtu.be"), "user": "https://youtube.com/@{u}"},
    "tiktok": {"label": "TikTok", "domains": ("tiktok.com",), "user": "https://tiktok.com/@{u}"},
    "x": {"label": "X", "domains": ("x.com", "twitter.com"), "user": "https://x.com/{u}"},
    "website": {"label": "Sito web", "domains": None, "user": None},
}
MAX_LEN = 300
BAD_SCHEME = re.compile(r"^\s*(javascript|data|vbscript|file)\s*:", re.I)
USERNAME = re.compile(r"^@?([A-Za-z0-9._-]{1,100})$")
URL = re.compile(r"^https://([^/?#]+)([^?#]*)(\?[^#]*)?(#.*)?$", re.I)
HOST = re.compile(r"^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$")
SAFE = re.compile(r"^[^\s<>\"'`\\{}|^]*$")


def _err(p: str) -> str:
    d = PLATFORMS[p]["domains"]
    return f"Inserisci un indirizzo di {d[0]} valido" if d else "Inserisci un indirizzo web valido che inizi con https://"


def normalize(p: str, raw: str) -> str:
    """URL https normalizzato oppure ValueError con messaggio in italiano. Stringa vuota = nessun link."""
    if p not in PLATFORMS:
        raise ValueError("Piattaforma non ammessa")
    s = (raw or "").strip()
    if not s:
        return ""
    if len(s) > MAX_LEN:
        raise ValueError(f"Indirizzo troppo lungo (massimo {MAX_LEN} caratteri)")
    if BAD_SCHEME.match(s):
        raise ValueError("Indirizzo non ammesso: sono accettati solo link https")
    tpl = PLATFORMS[p]["user"]
    m = USERNAME.match(s)
    if tpl and m and (s.startswith("@") or "." not in s):
        return tpl.format(u=m.group(1))
    if tpl and m:
        raise ValueError(f"{_err(p)} (per il solo nome utente scrivi la @ davanti)")
    if re.match(r"^[a-z][a-z0-9+.-]*:", s, re.I) and not s.lower().startswith("https://"):
        raise ValueError("Sono accettati solo link sicuri che iniziano con https://")
    if "://" not in s:
        s = "https://" + s
    u = URL.match(s)
    if not u or not SAFE.match(s):
        raise ValueError(_err(p))
    host, path, query = u.group(1).lower(), u.group(2), u.group(3) or ""
    if "@" in host:
        raise ValueError("Indirizzo non ammesso: non può contenere nome utente o password")
    if not HOST.match(host):
        raise ValueError(_err(p))
    domains = PLATFORMS[p]["domains"]
    if domains:
        if not any(host == d or host.endswith("." + d) for d in domains):
            raise ValueError(_err(p))
        if path.strip("/") == "":
            raise ValueError(f"Inserisci l'indirizzo del profilo, non solo {domains[0]}")
    path = path.rstrip("/") if path not in ("", "/") else ""
    out = f"https://{host}{path}{query}"
    if len(out) > MAX_LEN:
        raise ValueError(f"Indirizzo troppo lungo (massimo {MAX_LEN} caratteri)")
    return out


def public_links(links: list) -> list:
    return [{"piattaforma": x["piattaforma"], "url": x["url"], "label": PLATFORMS[x["piattaforma"]]["label"]}
            for x in sorted(links or [], key=lambda x: x.get("ordine", 0)) if x.get("visibile") and x.get("url") and x.get("piattaforma") in PLATFORMS]
