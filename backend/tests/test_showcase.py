"""Vetrina pubblica (showcase), directory Trova Specialista, file pubblici e 'In parole semplici' del portale."""
import io
import os
import struct
import zlib
import time
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values

_env = dotenv_values(Path(__file__).resolve().parents[2] / "frontend" / ".env")
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _env.get("REACT_APP_BACKEND_URL") or "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL missing"

FOTI = ("medico@mantmed.it", "Auscula-Studio-2026")
PARENT = ("genitore.demo@example.com", "Portale-Demo-2026")
CARDIO = ("cardiologo.demo@example.com", "Cardio-Demo-2026")
SLUG = "tiziana-foti"


def _png(w=4, h=4):
    raw = b"".join(b"\x00" + b"\xff\x80\x40" * w for _ in range(h))
    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")


def _sess(email, pw):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pw})
    assert r.status_code == 200, r.text
    return s


@pytest.fixture(scope="module")
def foti():
    return _sess(*FOTI)


@pytest.fixture(scope="module")
def parent():
    return _sess(*PARENT)


@pytest.fixture(scope="module")
def original(foti):
    r = foti.get(f"{BASE_URL}/api/showcase")
    assert r.status_code == 200
    orig = r.json()
    yield orig
    # restore: published, original bio/tagline/services, no images
    foti.put(f"{BASE_URL}/api/showcase", json={"bio": orig["bio"], "tagline": orig["tagline"], "services": orig["services"], "published": True})
    foti.delete(f"{BASE_URL}/api/showcase/image/photo")
    foti.delete(f"{BASE_URL}/api/showcase/image/cover")


# --- doctor showcase CRUD ---
class TestShowcaseDoctor:
    def test_get_mine(self, original):
        assert original["slug"] == SLUG
        assert isinstance(original["services"], list)
        assert "_id" not in original

    def test_requires_auth(self):
        assert requests.get(f"{BASE_URL}/api/showcase").status_code in (401, 403)

    def test_parent_forbidden(self, parent):
        assert parent.get(f"{BASE_URL}/api/showcase").status_code in (401, 403)

    def test_put_and_public_reflects(self, foti, original):
        body = {"bio": "TEST_bio vetrina", "tagline": "TEST_tagline", "published": True,
                "services": [{"name": "TEST_Visita", "duration_min": 30, "price": 80, "description": "TEST desc"}]}
        r = foti.put(f"{BASE_URL}/api/showcase", json=body)
        assert r.status_code == 200, r.text
        assert r.json()["bio"] == "TEST_bio vetrina"
        p = requests.get(f"{BASE_URL}/api/public/doctors/{SLUG}")
        assert p.status_code == 200
        d = p.json()
        assert d["tagline"] == "TEST_tagline" and d["services"][0]["name"] == "TEST_Visita" and d["services"][0]["price"] == 80

    def test_put_validation(self, foti, original):
        r = foti.put(f"{BASE_URL}/api/showcase", json={"bio": "", "tagline": "x" * 200, "services": [], "published": True})
        assert r.status_code == 422
        r = foti.put(f"{BASE_URL}/api/showcase", json={"services": [{"name": "A"}]})
        assert r.status_code == 422

    def test_unpublish_hides(self, foti, original):
        r = foti.put(f"{BASE_URL}/api/showcase", json={"bio": "", "tagline": "", "services": original["services"], "published": False})
        assert r.status_code == 200
        assert requests.get(f"{BASE_URL}/api/public/doctors/{SLUG}").status_code == 404
        slugs = [d["slug"] for d in requests.get(f"{BASE_URL}/api/public/doctors").json()]
        assert SLUG not in slugs
        r = foti.put(f"{BASE_URL}/api/showcase", json={"bio": "", "tagline": "", "services": original["services"], "published": True})
        assert requests.get(f"{BASE_URL}/api/public/doctors/{SLUG}").status_code == 200
        assert SLUG in [d["slug"] for d in requests.get(f"{BASE_URL}/api/public/doctors").json()]


# --- image upload via object storage ---
class TestShowcaseImages:
    def test_upload_photo_serve_delete(self, foti, original):
        r = foti.post(f"{BASE_URL}/api/showcase/image/photo", files={"file": ("t.png", _png(), "image/png")})
        assert r.status_code == 200, r.text
        url = r.json()["photo_url"]
        assert url and url.startswith("/api/public/files/")
        img = requests.get(f"{BASE_URL}{url}")
        assert img.status_code == 200 and img.headers["content-type"].startswith("image/png") and img.content[:4] == b"\x89PNG"
        # replace -> old file 404
        r2 = foti.post(f"{BASE_URL}/api/showcase/image/photo", files={"file": ("t2.png", _png(6, 6), "image/png")})
        assert r2.status_code == 200
        url2 = r2.json()["photo_url"]
        assert url2 != url
        assert requests.get(f"{BASE_URL}{url}").status_code == 404
        d = foti.delete(f"{BASE_URL}/api/showcase/image/photo")
        assert d.status_code == 200 and d.json()["photo_url"] is None
        assert requests.get(f"{BASE_URL}{url2}").status_code == 404

    def test_upload_cover(self, foti, original):
        r = foti.post(f"{BASE_URL}/api/showcase/image/cover", files={"file": ("c.png", _png(), "image/png")})
        assert r.status_code == 200, r.text
        url = r.json()["cover_url"]
        assert requests.get(f"{BASE_URL}{url}").status_code == 200
        assert requests.get(f"{BASE_URL}/api/public/doctors/{SLUG}").json()["cover_url"] == url
        assert foti.delete(f"{BASE_URL}/api/showcase/image/cover").status_code == 200
        assert requests.get(f"{BASE_URL}{url}").status_code == 404

    def test_bad_type(self, foti):
        r = foti.post(f"{BASE_URL}/api/showcase/image/photo", files={"file": ("x.gif", b"GIF89a", "image/gif")})
        assert r.status_code == 400

    def test_too_big(self, foti):
        r = foti.post(f"{BASE_URL}/api/showcase/image/photo", files={"file": ("big.jpg", b"\xff" * (8 * 1024 * 1024 + 10), "image/jpeg")})
        assert r.status_code in (400, 413), r.status_code

    def test_bad_kind(self, foti):
        r = foti.post(f"{BASE_URL}/api/showcase/image/banner", files={"file": ("t.png", _png(), "image/png")})
        assert r.status_code in (400, 404)

    def test_parent_cannot_upload(self, parent):
        r = parent.post(f"{BASE_URL}/api/showcase/image/photo", files={"file": ("t.png", _png(), "image/png")})
        assert r.status_code in (401, 403)

    def test_public_file_invalid(self):
        assert requests.get(f"{BASE_URL}/api/public/files/notanid").status_code == 404
        assert requests.get(f"{BASE_URL}/api/public/files/0123456789abcdef01234567").status_code == 404


# --- public directory ---
class TestPublicDirectory:
    def test_directory(self):
        r = requests.get(f"{BASE_URL}/api/public/doctors")
        assert r.status_code == 200
        lst = r.json()
        assert any(d["slug"] == SLUG for d in lst)
        assert all(d["in_network"] for d in lst)
        assert all("_id" not in d and "email" not in d for d in lst)

    def test_unknown_slug(self):
        assert requests.get(f"{BASE_URL}/api/public/doctors/nessuno-xyz").status_code == 404


# --- portal simple ---
class TestPortalSimple:
    def _pid(self, parent):
        r = parent.get(f"{BASE_URL}/api/portal/me")
        assert r.status_code == 200, r.text
        kids = r.json()["children"]
        aurora = next(k for k in kids if "Aurora" in k["patient"]["name"])
        return aurora["patient"]["id"], aurora

    def test_simple_and_cache(self, parent):
        pid, kid = self._pid(parent)
        assert kid["doctor"].get("slug") == SLUG
        t = time.time()
        r = parent.get(f"{BASE_URL}/api/portal/children/{pid}/simple", timeout=90)
        assert r.status_code == 200, r.text
        s = r.json()
        assert s["available"] is True
        assert s["diagnosi"]
        print("first", round(time.time() - t, 1), "glossario", s.get("glossario"))
        t = time.time()
        r2 = parent.get(f"{BASE_URL}/api/portal/children/{pid}/simple")
        assert r2.json() == s
        assert time.time() - t < 5

    def test_not_linked(self, parent):
        assert parent.get(f"{BASE_URL}/api/portal/children/0123456789abcdef01234567/simple").status_code == 404

    def test_doctor_forbidden(self, foti, parent):
        pid, _ = self._pid(parent)
        assert foti.get(f"{BASE_URL}/api/portal/children/{pid}/simple").status_code in (401, 403)


# --- cache invalidation on doctor PATCH ---
class TestSimpleCacheInvalidation:
    def test_patch_clears_cache(self, foti, parent):
        kids = parent.get(f"{BASE_URL}/api/portal/me").json()["children"]
        pid = next(k for k in kids if "Aurora" in k["patient"]["name"])["patient"]["id"]
        s1 = parent.get(f"{BASE_URL}/api/portal/children/{pid}/simple", timeout=90).json()
        cid = s1["consultation_id"]
        c = foti.get(f"{BASE_URL}/api/consultations/{cid}")
        assert c.status_code == 200, c.text
        r = foti.patch(f"{BASE_URL}/api/consultations/{cid}", json={"note": c.json()["note"]})
        assert r.status_code == 200, r.text
        from pymongo import MongoClient
        be = dotenv_values("/app/backend/.env")
        raw = MongoClient(be["MONGO_URL"])[be["DB_NAME"]].consultations.find_one({"_id": __import__("bson").ObjectId(cid)})
        assert raw is not None and "simple" not in raw
        t = time.time()
        s2 = parent.get(f"{BASE_URL}/api/portal/children/{pid}/simple", timeout=90).json()
        print("regen secs", round(time.time() - t, 1))
        assert s2["available"] and s2["diagnosi"]
