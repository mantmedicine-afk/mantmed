import json
import math
from datetime import date
from pathlib import Path

TABLES = json.loads((Path(__file__).parent / "who_lms.json").read_text())
LIMITS = {"wfa": 120, "lhfa": 228, "hcfa": 60}
CURVE_Z = {3: -1.8808, 15: -1.0364, 50: 0.0, 85: 1.0364, 97: 1.8808}


def age_months(birth: str, on: date | None = None) -> float:
    b = date.fromisoformat(birth[:10])
    return max(0.0, ((on or date.today()) - b).days / 30.4375)


def lms(ind: str, sex: str, months: float):
    rows = TABLES[ind]["F" if sex == "F" else "M"]
    if months < 0 or months > LIMITS[ind]:
        return None
    i = min(int(months), len(rows) - 2)
    f = months - i
    a, b = rows[i], rows[i + 1]
    return tuple(a[k] + (b[k] - a[k]) * f for k in (1, 2, 3))


def value_at(L, M, S, z):
    return M * math.exp(S * z) if abs(L) < 1e-9 else M * (1 + L * S * z) ** (1 / L)


def zscore(ind, sex, months, x):
    p = lms(ind, sex, months)
    if not p or not x:
        return None
    L, M, S = p
    z = math.log(x / M) / S if abs(L) < 1e-9 else ((x / M) ** L - 1) / (L * S)
    if ind != "lhfa" and abs(z) > 3:
        sd3, sd2 = (value_at(L, M, S, 3), value_at(L, M, S, 2)) if z > 0 else (value_at(L, M, S, -3), value_at(L, M, S, -2))
        z = 3 + (x - sd3) / (sd3 - sd2) if z > 0 else -3 + (x - sd3) / (sd2 - sd3)
    return z


def pct_label(p):
    if p < 0.1:
        return "<0,1° pc"
    if p > 99.9:
        return ">99,9° pc"
    v = round(p, 1) if p < 3 or p > 97 else round(p)
    return f"{str(v).replace('.', ',')}° pc"


def percentile(ind, sex, months, x):
    if x is None or months is None or sex not in ("M", "F"):
        return None
    z = zscore(ind, sex, months, x)
    if z is None:
        return {"z": None, "percentile": None, "label": "fuori range OMS", "in_range": False}
    p = 50 * (1 + math.erf(z / math.sqrt(2)))
    return {"z": round(z, 2), "percentile": round(p, 1), "label": pct_label(p), "in_range": True}


def all_percentiles(sex, months, weight=None, height=None, hc=None):
    return {"peso": percentile("wfa", sex, months, weight), "altezza": percentile("lhfa", sex, months, height),
            "cc": percentile("hcfa", sex, months, hc)}


def curves(ind, sex, max_month):
    top = min(LIMITS[ind], max(6, int(max_month)))
    out = []
    for m in range(0, top + 1):
        L, M, S = lms(ind, sex, m)
        out.append({"month": m, **{f"p{k}": round(value_at(L, M, S, z), 2) for k, z in CURVE_Z.items()}})
    return out
