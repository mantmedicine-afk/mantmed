"""Uso: PLAYWRIGHT_BROWSERS_PATH=/pw-browsers python scripts/record_tour_videos.py <BASE_URL> [clip...] (venv con playwright + imageio-ffmpeg).
Registra le clip dimostrative del tour (8-12s, senza audio) sull'app demo e le converte in MP4 + poster."""
import asyncio
import os
import subprocess
import sys
import time
import imageio_ffmpeg
from playwright.async_api import async_playwright

BASE = sys.argv[1].rstrip("/")
OUT = "/app/frontend/public/tour"
RAW = "/tmp/tour_raw"
FF = imageio_ffmpeg.get_ffmpeg_exe()
DOC = ("medico@mantmed.it", "Auscula-Studio-2026")
CARDIO = ("cardiologo.demo@example.com", "Cardio-Demo-2026")
PAR = ("genitore.demo@example.com", "Portale-Demo-2026")

CURSOR = """
addEventListener('DOMContentLoaded', () => {
  const c = document.createElement('div');
  c.style.cssText = 'position:fixed;z-index:2147483647;width:22px;height:22px;border-radius:50%;background:rgba(59,108,246,.35);border:2px solid #3B6CF6;pointer-events:none;transform:translate(-50%,-50%);transition:width .15s,height .15s;left:-50px;top:-50px';
  document.body.appendChild(c);
  addEventListener('mousemove', e => { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; }, true);
  addEventListener('mousedown', () => { c.style.width = '34px'; c.style.height = '34px'; }, true);
  addEventListener('mouseup', () => { c.style.width = '22px'; c.style.height = '22px'; }, true);
});
"""


async def move_click(page, sel, click=True, nth=0):
    loc = page.locator(sel).nth(nth)
    await loc.scroll_into_view_if_needed()
    b = await loc.bounding_box()
    await page.mouse.move(b["x"] + b["width"] / 2, b["y"] + b["height"] / 2, steps=28)
    await page.wait_for_timeout(250)
    if click:
        await loc.click()


async def type_slow(page, sel, text):
    await move_click(page, sel)
    await page.locator(sel).type(text, delay=70)


async def wheel(page, dy, steps=6):
    for _ in range(steps):
        await page.mouse.wheel(0, dy / steps)
        await page.wait_for_timeout(70)


# ---------- clip ----------
async def doc_agenda(p):
    await p.goto(f"{BASE}/app"); await p.wait_for_selector('[data-testid="agenda-panel"]'); return p
async def doc_agenda_act(p):
    await move_click(p, '[data-testid="agenda-panel"]', click=False); await p.wait_for_timeout(900)
    tabs = p.locator('[data-testid="agenda-panel"] [role=tab], [data-testid^="agenda-clinic-"]')
    if await tabs.count() > 1:
        await tabs.nth(1).click(); await p.wait_for_timeout(1400); await tabs.nth(0).click(); await p.wait_for_timeout(1200)
    await wheel(p, 260); await p.wait_for_timeout(1300)
    await move_click(p, '[data-testid="consult-hub"]', click=False); await p.wait_for_timeout(1500)
    await wheel(p, -260); await p.wait_for_timeout(1500)


async def doc_mantai(p):
    await p.goto(f"{BASE}/app"); await p.wait_for_selector('[data-testid="start-consultation-btn"]'); return p
async def doc_mantai_act(p):
    await move_click(p, '[data-testid="start-consultation-btn"]'); await p.wait_for_timeout(900)
    await move_click(p, '[data-testid="consult-free-name-input"]'); await p.locator('[data-testid="consult-free-name-input"]').type("Sofia Esposito", delay=35)
    cb = '[data-testid="consultation-overlay"] input[type=checkbox]'
    if await p.locator(cb).count():
        await move_click(p, cb)
    await move_click(p, '[data-testid="consult-begin-btn"]'); await p.wait_for_selector('[data-testid="recording-timer"]', timeout=8000); await p.wait_for_timeout(3200)


async def doc_bodychart(p):
    await p.goto(f"{BASE}/app/visite"); await p.wait_for_selector('[data-testid^="visit-row-"]'); return p
async def doc_bodychart_act(p):
    rows = p.locator('[data-testid^="visit-row-"]').filter(has_not_text="TEST")
    await rows.first.scroll_into_view_if_needed(); b = await rows.first.bounding_box()
    await p.mouse.move(b["x"] + b["width"] / 2, b["y"] + b["height"] / 2, steps=28); await rows.first.click(); await p.wait_for_timeout(1500)
    await move_click(p, '[data-testid="note-bodychart-btn"]'); await p.wait_for_selector('[data-testid="bodychart-canvas"]'); await p.wait_for_load_state("networkidle"); await p.wait_for_timeout(1200)
    cv = await p.locator('[data-testid="bodychart-canvas"]').bounding_box()
    for fx, fy in ((0.5, 0.32), (0.38, 0.55)):
        await p.mouse.move(cv["x"] + cv["width"] * fx, cv["y"] + cv["height"] * fy, steps=25)
        await p.mouse.down(); await p.mouse.up(); await p.wait_for_timeout(1100)
    z = p.locator('[data-testid^="bodychart-zoom-"]')
    if await z.count() > 1:
        await move_click(p, '[data-testid^="bodychart-zoom-"]', nth=1); await p.wait_for_timeout(1300)
    await move_click(p, '[data-testid="bodychart-tab-history"]'); await p.wait_for_timeout(1300)


async def doc_team(p):
    await p.goto(f"{BASE}/app/pazienti"); await p.wait_for_selector('[data-testid^="patient-card-"]'); return p
async def doc_team_act(p):
    await move_click(p, '[data-testid="team-network-search"]', click=False); await p.wait_for_timeout(1000)
    card = p.locator('[data-testid^="patient-card-"]').filter(has_text="Aurora").first
    b = await card.bounding_box(); await p.mouse.move(b["x"] + b["width"] / 2, b["y"] + b["height"] / 2, steps=28); await card.click()
    await p.wait_for_selector('[data-testid="team-panel"]', timeout=10000); await p.wait_for_timeout(1200)
    await p.wait_for_timeout(800)
    await p.locator('[data-testid="team-panel"]').scroll_into_view_if_needed(); await p.wait_for_timeout(800)
    await move_click(p, '[data-testid="team-panel"]', click=False); await p.wait_for_timeout(1500)
    if await p.locator('[data-testid="team-request-reason"]').count():
        await move_click(p, '[data-testid="team-request-reason"]'); await p.locator('[data-testid="team-request-reason"]').type("Consulto ortopedico", delay=60)
        await move_click(p, '[data-testid="team-request-btn"]', click=False)
    await p.wait_for_timeout(1500)


async def doc_vetrina(p):
    await p.goto(f"{BASE}/app/impostazioni?sezione=vetrina"); await p.wait_for_selector('[data-testid="account-section-vetrina"]'); return p
async def doc_vetrina_act(p):
    await p.wait_for_timeout(600); await wheel(p, 420); await p.wait_for_timeout(900); await wheel(p, 420); await p.wait_for_timeout(900)
    await p.goto(f"{BASE}/app/cassa"); await p.wait_for_selector('[data-testid="cash-register"]'); await p.wait_for_timeout(1200)
    await wheel(p, 300); await p.wait_for_timeout(1500)


async def par_home(p):
    await p.goto(f"{BASE}/portale"); await p.wait_for_selector('[data-testid="portal-overview"]'); return p
async def par_home_act(p):
    await move_click(p, '[data-testid="portal-overview"]', click=False); await p.wait_for_timeout(1200)
    for dy in (300, 300, 300):
        await wheel(p, dy); await p.wait_for_timeout(1300)
    await wheel(p, -900); await p.wait_for_timeout(1500)


async def par_docs(p):
    await p.goto(f"{BASE}/portale/documenti"); await p.wait_for_selector('[data-testid="documents-area"]'); return p
async def par_docs_act(p):
    tabs = p.locator('[data-testid^="docs-tab-"]')
    for i in range(min(4, await tabs.count())):
        await move_click(p, '[data-testid^="docs-tab-"]', nth=i); await p.wait_for_timeout(1300)
    await move_click(p, '[data-testid^="docs-tab-"]', nth=0); await p.wait_for_timeout(1200)


async def par_simple(p):
    await p.goto(f"{BASE}/portale"); await p.wait_for_selector('[data-testid="portal-simple-box"]')
    await p.locator('[data-testid="portal-simple-box"]').scroll_into_view_if_needed(); return p
async def par_simple_act(p):
    await move_click(p, '[data-testid="portal-simple-box"]', click=False); await p.wait_for_timeout(900)
    terms = p.locator('[data-testid="portal-simple-glossary"] button')
    for i in range(min(2, await terms.count())):
        await move_click(p, '[data-testid="portal-simple-glossary"] button', nth=i); await p.wait_for_timeout(1500)
    await wheel(p, 200); await p.wait_for_timeout(1200)


async def par_spec(p):
    await p.goto(f"{BASE}/portale/trova-specialista"); await p.wait_for_selector('[data-testid="specialists-directory"]'); return p
async def par_spec_act(p):
    await type_slow(p, '[data-testid="specialists-search-input"]', "Pediatria"); await p.wait_for_timeout(900)
    if await p.locator('[data-testid^="specialist-view-"]').count():
        await move_click(p, '[data-testid^="specialist-view-"]'); await p.wait_for_timeout(1800)
        await p.mouse.move(640, 500, steps=20); await wheel(p, 400); await p.wait_for_timeout(1200); await wheel(p, 400); await p.wait_for_timeout(1200)


async def par_msg(p):
    await p.goto(f"{BASE}/portale/messaggi"); await p.wait_for_selector('[data-testid="portal-messages"]'); return p
async def par_msg_act(p):
    q = p.locator('[data-testid="quick-requests"] button')
    if await q.count():
        await move_click(p, '[data-testid="quick-requests"] button', nth=min(3, await q.count() - 1))
        await p.wait_for_selector('[data-testid="new-thread-body"]'); await p.wait_for_timeout(500)
        await move_click(p, '[data-testid="new-thread-body"]'); await p.locator('[data-testid="new-thread-body"]').fill("")
        await p.locator('[data-testid="new-thread-body"]').type("Buongiorno dottoressa, la febbre è scesa stanotte: proseguo con la terapia?", delay=45)
        await move_click(p, '[data-testid="new-thread-submit"]', click=False)
    await p.wait_for_timeout(1500)


CLIPS = [
    ("doctor-1", DOC, doc_agenda, doc_agenda_act), ("doctor-2", DOC, doc_mantai, doc_mantai_act), ("doctor-3", DOC, doc_bodychart, doc_bodychart_act),
    ("doctor-4", DOC, doc_team, doc_team_act), ("doctor-5", DOC, doc_vetrina, doc_vetrina_act),
    ("patient-1", PAR, par_home, par_home_act), ("patient-2", PAR, par_docs, par_docs_act), ("patient-3", PAR, par_simple, par_simple_act),
    ("patient-4", PAR, par_spec, par_spec_act), ("patient-5", PAR, par_msg, par_msg_act),
]


def encode(raw, name, start, dur):
    mp4, jpg = f"{OUT}/{name}.mp4", f"{OUT}/{name}.jpg"
    subprocess.run([FF, "-y", "-loglevel", "error", "-ss", f"{start:.2f}", "-i", raw, "-t", f"{min(dur, 12):.2f}", "-an", "-vf", "scale=960:-2,fps=24",
                    "-c:v", "libx264", "-preset", "slow", "-crf", "31", "-pix_fmt", "yuv420p", "-movflags", "+faststart", mp4], check=True)
    subprocess.run([FF, "-y", "-loglevel", "error", "-i", mp4, "-an", "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "40", "-row-mt", "1", "-cpu-used", "4", f"{OUT}/{name}.webm"], check=True)
    subprocess.run([FF, "-y", "-loglevel", "error", "-ss", "0.6", "-i", mp4, "-frames:v", "1", "-vf", "scale=640:-2", "-q:v", "5", jpg], check=True)
    print(name, os.path.getsize(mp4) // 1024, "KB")


async def main(only):
    os.makedirs(OUT, exist_ok=True); os.makedirs(RAW, exist_ok=True)
    async with async_playwright() as pw:
        br = await pw.chromium.launch(args=["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"])
        for name, (email, pwd), setup, act in CLIPS:
            if only and name not in only:
                continue
            ctx = await br.new_context(viewport={"width": 1280, "height": 800}, record_video_dir=RAW, record_video_size={"width": 1280, "height": 800}, locale="it-IT")
            await ctx.add_init_script(CURSOR)
            r = await ctx.request.post(f"{BASE}/api/auth/login", data={"email": email, "password": pwd})
            assert r.ok, await r.text()
            await ctx.request.post(f"{BASE}/api/onboarding/tour", data={"completed": True})
            p = await ctx.new_page()
            t0 = time.monotonic()
            try:
                await setup(p); await p.wait_for_timeout(700)
                start = time.monotonic() - t0
                await act(p)
                dur = time.monotonic() - t0 - start
            except Exception as e:  # noqa: BLE001
                print("FAIL", name, e); await ctx.close(); continue
            raw = await p.video.path()
            await ctx.close()
            encode(raw, name, start, dur)
        await br.close()


asyncio.run(main(sys.argv[2:]))
