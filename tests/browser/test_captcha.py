import asyncio, json, time, base64, re, urllib.parse
from playwright.async_api import async_playwright
from common import *
# Fake Turnstile: hands out tok-1, tok-2… shortly after render/reset; MODE 'fail' fires error-callback instead.
FAKE_TS = r"""
window.__ts={n:0, w:{}, removed:[], renders:0, mode:window.__tsMode||'ok'};
window.turnstile={
  render(el,o){ const id='w'+(++__ts.renders); __ts.w[id]=o; __ts.opts=o; const d=document.createElement('div'); d.className='fake-ts'; el.appendChild(d); this._go(id); return id; },
  _go(id){ setTimeout(()=>{ const o=__ts.w[id]; if(!o) return; if(__ts.mode==='fail') o['error-callback'](); else o.callback('tok-'+(++__ts.n)); },120); },
  reset(id){ this._go(id); },
  remove(id){ __ts.removed.push(id); delete __ts.w[id]; },
};
"""
def tok(uid): return 'h.'+base64.urlsafe_b64encode(json.dumps({'sub':uid}).encode()).decode().rstrip('=')+'.s'
def session(uid, email=None, anon=False, meta=None):
    now=int(time.time())
    return {"access_token":tok(uid),"token_type":"bearer","expires_in":3600,"expires_at":now+3600,"refresh_token":"r-"+uid,
      "user":{"id":uid,"aud":"authenticated","role":"authenticated","email":email or "","is_anonymous":anon,"app_metadata":{},"user_metadata":meta or {},"created_at":"2026-11-06T00:00:00Z"}}

def make(cfg, calls):
    async def route(r):
        req=r.request; u=req.url; m=req.method
        if u.startswith('https://challenges.cloudflare.com/turnstile/'):
            calls.append(('ts-script',u))
            if cfg.get('block_script'): return await r.abort()
            return await r.fulfill(status=200, content_type='application/javascript', body=FAKE_TS)
        if u.endswith('/vendor/supabase-2.119.0.js'): return await r.fulfill(status=200, content_type='application/javascript', body=SBJS)
        if u.endswith('/api/health'): return await r.fulfill(status=200, content_type='application/json', body=json.dumps({"ai":False,"captcha":cfg.get('key','')}))
        if '/api/classes' in u:
            calls.append(('class',m,urllib.parse.urlparse(u).path, req.post_data))
            if u.endswith('/api/classes/join'): return await r.fulfill(status=200, content_type='application/json', body='{"id":"c1","name":"ป.4/2"}')
            return await r.fulfill(status=200, content_type="application/json", body='{"teaching":[],"learning":[]}') if urllib.parse.urlparse(u).path=="/api/classes" else await r.fulfill(status=404, content_type="application/json", body="{}")
        if '/api/' in u: return await r.fulfill(status=404, content_type='application/json', body='{}')
        if 'supabase.co' in u:
            path=urllib.parse.urlparse(u).path
            body=json.loads(req.post_data) if req.post_data else None
            calls.append(('sb',m,path,body))
            cap=(body or {}).get('gotrue_meta_security',{}).get('captcha_token')
            if cfg.get('server_requires') and path in ('/auth/v1/otp','/auth/v1/signup') and not cap:
                return await r.fulfill(status=400, content_type='application/json', body='{"code":"captcha_failed","message":"captcha protection: request disallowed (no captcha response)"}')
            if path=='/auth/v1/otp': return await r.fulfill(status=200, content_type='application/json', body='{}')
            if path=='/auth/v1/signup':
                return await r.fulfill(status=200, content_type='application/json', body=json.dumps(session('cccccccc-0000-0000-0000-000000000003', anon=True, meta=body.get('data'))))
            if path=='/auth/v1/settings': return await r.fulfill(status=200, content_type='application/json', body='{"external":{"google":false}}')
            if path.startswith('/rest/v1/'): return await r.fulfill(status=200, content_type='application/json', body='[]')
            return await r.fulfill(status=404, body='{}')
        return await page_or_built(r)
    return route

def caps(calls, path):
    return [ (c[3] or {}).get('gotrue_meta_security',{}).get('captcha_token') for c in calls if c[0]=='sb' and c[2]==path ]

async def main():
    out={}; errs=[]
    async with async_playwright() as p:
        b=await launch(p)
        async def page(cfg, path='/', w=1200, h=860, mobile=False):
            calls=[]
            ctx=await b.new_context(locale='th-TH', viewport={'width':w,'height':h}, is_mobile=mobile, has_touch=mobile, service_workers='block')
            if cfg.get('mode'): await ctx.add_init_script(f"window.__tsMode='{cfg['mode']}'")
            pg=await ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
            await pg.route('**/*', make(cfg, calls)); await pg.goto('https://piccab.test'+path); await pg.wait_for_timeout(700)
            return pg, calls

        # 1) switched on: e-mail sign-in sends a token, "send again" uses a fresh one
        pg,calls=await page({'key':'0x4AAAAAAAtest','server_requires':True})
        await pg.click('#acctBtn'); await pg.wait_for_timeout(400)
        await pg.fill('.mbox input[type=email]','t@example.com'); await pg.click('.mbox button.primary'); await pg.wait_for_timeout(700)
        out['otp_tokens']=caps(calls,'/auth/v1/otp')
        out['code_step']=await pg.locator('.mbox h3').inner_text()
        out['opts']=await pg.evaluate("({key:__ts.opts.sitekey, look:__ts.opts.appearance, lang:__ts.opts.language})")
        await pg.evaluate("document.querySelector('.mbox .linkbtn').disabled=false")
        await pg.click('.mbox .linkbtn'); await pg.wait_for_timeout(600)
        out['otp_tokens2']=caps(calls,'/auth/v1/otp')
        out['resend_err']=await pg.locator('.mbox .err').inner_text()
        await pg.click('.mbox .row button:first-child'); await pg.wait_for_timeout(300)   # ← เปลี่ยนอีเมล
        out['removed_on_back']=await pg.evaluate("__ts.removed.length")
        await pg.screenshot(path=shot('cp1_login.png'))
        await pg.context.close()

        # 2) student joins a class with no e-mail: anonymous sign-in carries a token
        pg,calls=await page({'key':'0x4AAAAAAAtest','server_requires':True}, '/c/ABC234')
        await pg.wait_for_timeout(400)
        await pg.fill('.mbox input[aria-label="ชื่อเล่น"]','มิ้นท์'); await pg.click('.mbox button.primary'); await pg.wait_for_timeout(1500)
        out['anon_tokens']=caps(calls,'/auth/v1/signup')
        out['joined']=[c[2] for c in calls if c[0]=='class' and c[2].endswith('/join')]
        out['acct']=await pg.locator('#acctBtn').inner_text()
        await pg.context.close()

        # 3) Turnstile can't decide (error) → clear message, no account request
        pg,calls=await page({'key':'0x4AAAAAAAtest','mode':'fail'}, '/c/ABC234', 390, 800, True)
        await pg.wait_for_timeout(400)
        await pg.fill('.mbox input[aria-label="ชื่อเล่น"]','บอต'); await pg.click('.mbox button.primary'); await pg.wait_for_timeout(600)
        out['fail_msg']=await pg.locator('.mbox .err').inner_text()
        out['fail_signup_calls']=len(caps(calls,'/auth/v1/signup'))
        out['fail_btn']=await pg.locator('.mbox button.primary').inner_text()
        await pg.screenshot(path=shot('cp2_fail_m.png'))
        await pg.context.close()

        # 4) script blocked (ad blocker) → tells the user what to do
        pg,calls=await page({'key':'0x4AAAAAAAtest','block_script':True})
        await pg.click('#acctBtn'); await pg.wait_for_timeout(300)
        await pg.fill('.mbox input[type=email]','t@example.com'); await pg.click('.mbox button.primary'); await pg.wait_for_timeout(500)
        out['blocked_msg']=await pg.locator('.mbox .err').inner_text()
        out['blocked_otp_calls']=len(caps(calls,'/auth/v1/otp'))
        await pg.context.close()

        # 5) server says captcha failed → friendly message
        pg,calls=await page({'key':'','server_requires':True})
        await pg.click('#acctBtn'); await pg.wait_for_timeout(300)
        await pg.fill('.mbox input[type=email]','t@example.com'); await pg.click('.mbox button.primary'); await pg.wait_for_timeout(500)
        out['server_msg']=await pg.locator('.mbox .err').inner_text()
        await pg.context.close()

        # 6) switched off (no TURNSTILE_SITE_KEY): no script, no token, works as before
        pg,calls=await page({'key':''})
        await pg.click('#acctBtn'); await pg.wait_for_timeout(300)
        await pg.fill('.mbox input[type=email]','t@example.com'); await pg.click('.mbox button.primary'); await pg.wait_for_timeout(500)
        out['off_tokens']=caps(calls,'/auth/v1/otp'); out['off_script']=[c for c in calls if c[0]=='ts-script']
        out['off_code_step']=await pg.locator('.mbox h3').inner_text()
        await pg.context.close()
        pg,calls=await page({'key':''}, '/c/ABC234')
        await pg.wait_for_timeout(400)
        await pg.fill('.mbox input[aria-label="ชื่อเล่น"]','มิ้นท์'); await pg.click('.mbox button.primary'); await pg.wait_for_timeout(1200)
        out['off_anon']=caps(calls,'/auth/v1/signup'); out['off_joined']=[c[2] for c in calls if c[0]=='class' and c[2].endswith('/join')]
        await pg.context.close()
        await b.close()
    check(out['otp_tokens']==['tok-1'] and out['code_step']=='📩 ใส่รหัสจากอีเมล', 'email sign-in sends the Turnstile token', (out['otp_tokens'], out['code_step']))
    check(out['opts'].get('key')=='0x4AAAAAAAtest' and out['opts'].get('look')=='interaction-only', 'Turnstile widget settings', out['opts'])
    check(out['otp_tokens2']==['tok-1','tok-2'], 'resending uses a new token', out['otp_tokens2'])
    check(out['anon_tokens']==['tok-1'] and out['joined']==['/api/classes/join'], 'students join with a token', (out['anon_tokens'], out['joined']))
    check('บอต' in out['fail_msg'] and out['fail_signup_calls']==0, 'failed check stops the sign-up', (out['fail_msg'], out['fail_signup_calls']))
    check('โหลดระบบตรวจสอบ' in out['blocked_msg'] and out['blocked_otp_calls']==0, 'blocked Turnstile script explained', out['blocked_msg'])
    check(out['off_tokens']==[None] and out['off_script']==[] and out['off_joined']==['/api/classes/join'], 'without a site key nothing changes', (out['off_tokens'], out['off_script']))
    finish('captcha', out, errs)
asyncio.run(main())
