"""Bodychart: elaborazione foto (EXIF rimossi, compressione, miniatura, cifratura), zone intime e sedi corporee per MantAI."""
import io

from PIL import Image, ImageOps
from pillow_heif import register_heif_opener

from crypto import seal_bytes, unseal_bytes

register_heif_opener()
MAX_SIDE, THUMB_SIDE = 2048, 360

# Zone intime (genitale/perianale) in coordinate normalizzate: stesso elenco in frontend/src/lib/bodychartZones.js
INTIMATE = {"front": (0.39, 0.42, 0.61, 0.56), "back": (0.39, 0.42, 0.61, 0.56), "left": (0.36, 0.45, 0.64, 0.55), "right": (0.36, 0.45, 0.64, 0.55)}


def is_intimate(view: str, x: float, y: float) -> bool:
    b = INTIMATE.get(view)
    return bool(b and b[0] <= x <= b[2] and b[1] <= y <= b[3])


def _jpeg(img: Image.Image, side: int, quality: int) -> bytes:
    im = img.copy()
    im.thumbnail((side, side), Image.LANCZOS)
    out = io.BytesIO()
    im.save(out, "JPEG", quality=quality, optimize=True, progressive=True)  # nessun exif/icc/xmp passato
    return out.getvalue()


def process_photo(data: bytes) -> tuple[bytes, bytes]:
    """Ritorna (foto, miniatura) JPEG senza metadati, già cifrate con AES-256-GCM."""
    with Image.open(io.BytesIO(data)) as src:
        src.load()
        img = ImageOps.exif_transpose(src)
        if img.mode not in ("RGB", "L"):
            bg = Image.new("RGB", img.size, (255, 255, 255))
            bg.paste(img.convert("RGBA"), mask=img.convert("RGBA").split()[-1])
            img = bg
        img = img.convert("RGB")
        clean = Image.new("RGB", img.size)
        clean.paste(img)
        return seal_bytes(_jpeg(clean, MAX_SIDE, 82)), seal_bytes(_jpeg(clean, THUMB_SIDE, 72))


def open_photo(blob: bytes) -> bytes:
    return unseal_bytes(blob)


# Sedi corporee riconoscibili da MantAI -> posizione proposta (figura bambino; il medico conferma e può spostarla)
REGIONS = {
    "cuoio_capelluto": ("Cuoio capelluto", "head", 0.5, 0.24), "fronte": ("Fronte", "head", 0.5, 0.3),
    "occhio_dx": ("Occhio destro", "head", 0.36, 0.4), "occhio_sx": ("Occhio sinistro", "head", 0.64, 0.4),
    "naso": ("Naso", "head", 0.5, 0.47), "guancia_dx": ("Guancia destra", "head", 0.31, 0.49), "guancia_sx": ("Guancia sinistra", "head", 0.69, 0.49),
    "labbra": ("Labbra", "head", 0.5, 0.555), "mento": ("Mento", "head", 0.5, 0.62),
    "orecchio_dx": ("Orecchio destro", "ears", 0.5, 0.26), "orecchio_sx": ("Orecchio sinistro", "ears", 0.5, 0.75),
    "palato": ("Palato", "mouth", 0.5, 0.33), "faringe_tonsille": ("Faringe / tonsille", "mouth", 0.5, 0.44), "lingua": ("Lingua", "mouth", 0.5, 0.69),
    "denti_superiori": ("Arcata superiore", "mouth", 0.5, 0.19), "denti_inferiori": ("Arcata inferiore", "mouth", 0.5, 0.81),
    "collo": ("Collo", "front", 0.5, 0.165), "torace": ("Torace", "front", 0.5, 0.27), "addome": ("Addome", "front", 0.5, 0.36), "ombelico": ("Ombelico", "front", 0.5, 0.374),
    "spalla_dx": ("Spalla destra", "front", 0.33, 0.2), "spalla_sx": ("Spalla sinistra", "front", 0.67, 0.2),
    "braccio_dx": ("Braccio destro", "front", 0.29, 0.276), "braccio_sx": ("Braccio sinistro", "front", 0.71, 0.276),
    "gomito_dx": ("Gomito destro", "front", 0.245, 0.348), "gomito_sx": ("Gomito sinistro", "front", 0.755, 0.348),
    "avambraccio_dx": ("Avambraccio destro", "front", 0.22, 0.42), "avambraccio_sx": ("Avambraccio sinistro", "front", 0.78, 0.42),
    "palmo_dx": ("Palmo mano destra", "hand_palm", 0.5, 0.35), "palmo_sx": ("Palmo mano sinistra", "hand_palm", 0.5, 0.84),
    "dorso_mano_dx": ("Dorso mano destra", "hand_back", 0.5, 0.35), "dorso_mano_sx": ("Dorso mano sinistra", "hand_back", 0.5, 0.84),
    "coscia_dx": ("Coscia destra", "front", 0.4, 0.587), "coscia_sx": ("Coscia sinistra", "front", 0.6, 0.587),
    "ginocchio_dx": ("Ginocchio destro", "front", 0.39, 0.707), "ginocchio_sx": ("Ginocchio sinistro", "front", 0.61, 0.707),
    "gamba_dx": ("Gamba destra", "front", 0.395, 0.808), "gamba_sx": ("Gamba sinistra", "front", 0.605, 0.808),
    "caviglia_dx": ("Caviglia destra", "front", 0.398, 0.909), "caviglia_sx": ("Caviglia sinistra", "front", 0.602, 0.909),
    "dorso_piede_dx": ("Dorso piede destro", "foot_back", 0.27, 0.45), "dorso_piede_sx": ("Dorso piede sinistro", "foot_back", 0.73, 0.45),
    "pianta_piede_dx": ("Pianta piede destro", "foot_sole", 0.27, 0.55), "pianta_piede_sx": ("Pianta piede sinistro", "foot_sole", 0.73, 0.55),
    "nuca": ("Nuca", "back", 0.5, 0.15), "schiena": ("Dorso / schiena", "back", 0.5, 0.28), "zona_lombare": ("Zona lombare", "back", 0.5, 0.39),
    "polpaccio_dx": ("Polpaccio destro", "back", 0.605, 0.8), "polpaccio_sx": ("Polpaccio sinistro", "back", 0.395, 0.8),
}
