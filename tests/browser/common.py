"""Shared bits for Piccab's browser tests (Playwright for Python).
Each test_*.py is a plain script: it drives Chrome, then checks what it saw and exits 1 on any failure.
Run them all with tests/browser/run.sh (it also starts the fake Supabase and `wrangler dev` for the server tests)."""
import json, os, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
PUB = ROOT / 'dist'      # what Cloudflare serves: the built app + public/ (run.sh runs `npm run build` first)
if not (PUB / 'app.html').is_file(): sys.exit('dist/app.html is missing: run `npm run build` (tests/browser/run.sh does it)')
FIX = ROOT / 'tests' / 'fixtures'
SHOTS = pathlib.Path(os.environ.get('SHOTS', '/tmp/piccab-shots')); SHOTS.mkdir(parents=True, exist_ok=True)
SERVER = os.environ.get('SERVER', 'http://127.0.0.1:8788')        # wrangler dev (server tests)
FAKE = os.environ.get('FAKE_SUPABASE', 'http://127.0.0.1:54321')   # tests/fake_supabase.py
SUPA = 'https://oftzpfyydnmahkntucnj.supabase.co'
HTML = (PUB / 'app.html').read_text(encoding='utf-8')
EN = (PUB / 'i18n' / 'en.js').read_text(encoding='utf-8')
SBJS = (PUB / 'vendor' / 'supabase-2.119.0.js').read_text(encoding='utf-8')
PHOTO = str(FIX / 'kitchen.jpg'); PORTRAIT = str(FIX / 'portrait.jpg')

def shot(name): return str(SHOTS / name)
def launch(p): return p.chromium.launch(executable_path=os.environ.get('CHROME') or None)

async def app_route(r, health='{"ai":false}', extra=None):
    """Serve the app from the repo at https://piccab.test/… without any server (Supabase answers 404)."""
    u = r.request.url
    if extra:
        res = await extra(r)
        if res is not False: return
    if u.endswith('/vendor/supabase-2.119.0.js'): return await r.fulfill(status=200, content_type='application/javascript', body=SBJS)
    if u.endswith('/i18n/en.js'): return await r.fulfill(status=200, content_type='application/javascript', body=EN)
    if u.endswith('/api/health'): return await r.fulfill(status=200, content_type='application/json', body=health)
    if u.endswith(('/api/usage', '/api/log')): return await r.fulfill(status=204)
    if 'supabase.co' in u: return await r.fulfill(status=404, body='{}')
    if 'piccab.test' not in u: return await r.abort()
    if '/fonts/' in u or u.endswith(('.svg', '.png', '.webp', '.ico', '.css')):
        path = PUB / u.split('piccab.test/', 1)[1].split('?')[0]
        return await r.fulfill(status=200, path=str(path)) if path.is_file() else await r.fulfill(status=404, body='')
    return await page_or_built(r)

async def page_or_built(r):
    """The app page, or one of its built files (/assets/app-<hash>.js|css) from dist/."""
    path = r.request.url.split('piccab.test', 1)[-1].split('?')[0].split('#')[0]
    if path.startswith('/assets/') and (PUB / path[1:]).is_file():
        ct = 'text/css' if path.endswith('.css') else 'application/javascript'
        return await r.fulfill(status=200, content_type=ct, body=(PUB / path[1:]).read_bytes())
    return await r.fulfill(status=200, content_type='text/html', body=HTML)

async def to_fake_supabase(r):
    """For server tests: send the app's Supabase calls to the fake."""
    resp = await r.fetch(url=r.request.url.replace(SUPA, FAKE)); await r.fulfill(response=resp)

# Text still in Thai on the page (for English-menu checks); elements marked lang=th or data-noi18n are skipped.
THAI_LEFT = """() => { const out=new Set(); const w=document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT|NodeFilter.SHOW_ELEMENT);
  let n; while((n=w.nextNode())){ if(n.nodeType===3){ const p=n.parentElement; if(!p || /SCRIPT|STYLE/.test(p.nodeName) || p.closest('[lang=th],[data-noi18n]')) continue;
      if(/[\\u0E00-\\u0E7F]/.test(n.nodeValue)) out.add(n.nodeValue.trim().slice(0,90)); }
    else if(!n.closest('[lang=th],[data-noi18n]')) for(const a of ['placeholder','title','aria-label','alt']){ const v=n.getAttribute(a); if(v && /[\\u0E00-\\u0E7F]/.test(v)) out.add('@'+a+': '+v.slice(0,90)); } }
  return [...out]; }"""

FAILS = []
def check(ok, what, got=None):
    if not ok: FAILS.append(f'✗ {what}' + (f' — got {got!r}' if got is not None else ''))

def finish(name, out, errs):
    errs = [e for e in errs if 'ERR_FAILED' not in e and 'Failed to load resource' not in e]
    check(not errs, 'no errors on the page', errs)
    if os.environ.get('VERBOSE'): print(json.dumps(out, ensure_ascii=False, indent=1))
    if FAILS:
        print(f'FAILED {name}:'); [print('  ' + f) for f in FAILS]
        print(json.dumps(out, ensure_ascii=False, indent=1)[:6000])
        sys.exit(1)
    print(f'ok  {name}')

async def skip_ai_offer(pg):
    """After adding a picture with AI available, the app offers "✨ Let AI find words" — close it to draw boxes by hand."""
    await pg.wait_for_timeout(300)
    if await pg.locator('#modal:not([hidden])').count() and not await pg.locator('#mbox input.word').count():
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(200)
