import asyncio, json, time, base64, re, urllib.parse
from playwright.async_api import async_playwright
from common import *

USERS={'a@x.com':'aaaaaaaa-0000-0000-0000-000000000001','b@x.com':'bbbbbbbb-0000-0000-0000-000000000002'}
DB={'scenes':{}, 'progress':{}, 'decks':{}}; OPT={'decks_missing':False}; R2={}; LOG=[]
def tok(uid): return 'h.'+base64.urlsafe_b64encode(json.dumps({'sub':uid}).encode()).decode().rstrip('=')+'.s'
def uid_of(req):
    a=req.headers.get('authorization','')
    m=re.match(r'Bearer h\.([^.]+)\.s',a)
    if not m: return None
    p=m.group(1); p+='='*(-len(p)%4)
    return json.loads(base64.urlsafe_b64decode(p))['sub']
def q(url):
    return dict(urllib.parse.parse_qsl(urllib.parse.urlparse(url).query))
async def route(r):
    req=r.request; u=req.url; m=req.method
    if u.endswith('/vendor/supabase-2.119.0.js'): return await r.fulfill(status=200, content_type='application/javascript', body=SBJS)
    if u.endswith('/api/health'): return await r.fulfill(status=200, content_type='application/json', body='{"ai":false}')
    if '/api/img/' in u:
        uid=uid_of(req); sid=u.split('/api/img/')[1]
        if not uid: return await r.fulfill(status=401, body='{}')
        k=f'u/{uid}/{sid}'; LOG.append(('img',m,k))
        if m=='PUT': R2[k]=req.post_data_buffer; return await r.fulfill(status=200, content_type='application/json', body='{"ok":true}')
        if m=='GET':
            if k not in R2: return await r.fulfill(status=404, body='{}')
            return await r.fulfill(status=200, content_type='image/jpeg', body=R2[k])
        if m=='DELETE': R2.pop(k,None); return await r.fulfill(status=200, body='{}')
    if 'supabase.co' in u:
        path=urllib.parse.urlparse(u).path
        if path=='/auth/v1/otp': return await r.fulfill(status=200, content_type='application/json', body='{}')
        if path=='/auth/v1/verify':
            em=json.loads(req.post_data)['email']; uid=USERS[em]; now=int(time.time())
            return await r.fulfill(status=200, content_type='application/json', body=json.dumps({"access_token":tok(uid),"token_type":"bearer","expires_in":3600,"expires_at":now+3600,"refresh_token":"r-"+uid,
                "user":{"id":uid,"aud":"authenticated","role":"authenticated","email":em,"app_metadata":{},"user_metadata":{},"created_at":"2026-11-06T00:00:00Z"}}))
        if path=='/auth/v1/logout': return await r.fulfill(status=204, body='')
        m2=re.match(r'/rest/v1/(scenes|progress|decks)$', path)
        if m2:
            t=m2.group(1)
            if t=='decks' and OPT['decks_missing']: return await r.fulfill(status=404, content_type='application/json', body=json.dumps({'code':'PGRST205','message':"Could not find the table 'public.decks' in the schema cache"}))
            uid=uid_of(req); key='scene_id' if t=='progress' else 'id'; qs=q(u)
            LOG.append((t,m,qs))
            if not uid: return await r.fulfill(status=401, body='{}')
            mine={k:v for k,v in DB[t].items() if k[0]==uid}
            if m=='GET': return await r.fulfill(status=200, content_type='application/json', body=json.dumps(list(mine.values())))
            if m=='POST':
                rows=json.loads(req.post_data); rows=rows if isinstance(rows,list) else [rows]
                for row in rows:
                    assert row['user_id']==uid
                    DB[t][(uid,row[key])]={**DB[t].get((uid,row[key]),{}), **row}
                return await r.fulfill(status=201, content_type='application/json', body='[]')
            if m in ('PATCH','DELETE'):
                kid=qs.get(key,'').replace('eq.','')
                if (uid,kid) in DB[t]:
                    if m=='PATCH': DB[t][(uid,kid)].update(json.loads(req.post_data))
                    else: DB[t].pop((uid,kid))
                return await r.fulfill(status=204, body='')
        return await r.fulfill(status=404, body='{}')
    return await page_or_built(r)

async def login(pg, email):
    await pg.click('#acctBtn'); await pg.fill('.mbox input[type=email]', email); await pg.click('.mbox button.primary'); await pg.wait_for_timeout(300)
    await pg.type('.mbox input.code','123456'); await pg.press('.mbox input.code','Enter'); await pg.wait_for_timeout(1800)
async def page(b, errs):
    ctx=await b.new_context(locale='th-TH', viewport={'width':1200,'height':860}); pg=await ctx.new_page()
    pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda c: errs.append('console:'+c.text) if c.type=='warning' and 'sync' in c.text else None)
    await pg.route('**/*', route); await pg.goto('https://piccab.test/app'); await pg.wait_for_timeout(500)
    return pg


import os, mimetypes
PUB=str(PUB)
EXT=[]; DELETED=[]; ACCT={'status':200}
_route=route
async def route2(r):
    u=r.request.url; path=urllib.parse.urlparse(u).path
    if 'fonts.g' in u: EXT.append(u); return await r.fulfill(status=200, body='')
    if path=='/api/account':
        uid=uid_of(r.request); DELETED.append((r.request.method, uid))
        if ACCT['status']==200:
            for t in DB:
                for k in [k for k in DB[t] if k[0]==uid]: DB[t].pop(k)
            for k in [k for k in R2 if k.startswith(f'u/{uid}/')]: R2.pop(k)
        return await r.fulfill(status=ACCT['status'], content_type='application/json', body=json.dumps({'ok':True} if ACCT['status']==200 else {'error':'not_configured'}))
    for cand in (path, path+'.html'):
        f=PUB+cand
        if cand not in ('/','') and os.path.isfile(f) and 'piccab.test' in u:
            return await r.fulfill(status=200, content_type=mimetypes.guess_type(f)[0] or 'application/octet-stream', body=open(f,'rb').read())
    return await _route(r)
async def pg_(b, errs, vw=1200, vh=860, mobile=False):
    ctx=await b.new_context(locale='th-TH', viewport={'width':vw,'height':vh}, is_mobile=mobile, has_touch=mobile); pg=await ctx.new_page()
    pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.route('**/*', route2); return pg
async def main():
    async with async_playwright() as p:
        b=await launch(p)
        errs=[]; out={}
        # policy pages
        for name in ('privacy','terms'):
            d=await pg_(b, errs); await d.goto(f'https://piccab.test/{name}'); await d.wait_for_timeout(400)
            out[name+'_h1']=await d.inner_text('h1'); out[name+'_font']=await d.evaluate("getComputedStyle(document.body).fontFamily")
            out[name+'_fontok']=await d.evaluate("document.fonts.check('16px Sarabun','ก')")
            await d.screenshot(path=shot(f'lg_{name}_d.png'))
            m=await pg_(b, errs, 390, 820, True); await m.goto(f'https://piccab.test/{name}'); await m.wait_for_timeout(400)
            await m.screenshot(path=shot(f'lg_{name}_m.png'), full_page=False)
            out[name+'_m_overflow']=await m.evaluate("document.documentElement.scrollWidth>innerWidth")
        # app: no Google Fonts, footer links, consent in login
        A=await pg_(b, errs); await A.goto('https://piccab.test/app'); await A.wait_for_timeout(600)
        out['ext_font_requests']=len(EXT)
        out['app_font_loaded']=await A.evaluate("document.fonts.check('16px Sarabun','ก')")
        out['footer']=await A.inner_text('.settings .legal')
        await A.click('#acctBtn'); await A.wait_for_timeout(200)
        out['consent']=await A.inner_text('.mbox .consent')
        await A.screenshot(path=shot('lg_login.png'))
        await A.click('#mbox >> text=ยกเลิก')
        # sign in, make a scene, sync, then delete account
        await A.set_input_files('#fileImg',PHOTO); await A.wait_for_timeout(700)
        await A.click('text=เสร็จแล้ว') if await A.locator('text=เสร็จแล้ว').count() else None
        await A.click('#homeBtn'); await A.wait_for_timeout(200)
        await login(A,'a@x.com'); await A.wait_for_timeout(2500)
        out['before']=(len([k for k in DB['scenes'] if k[0]==USERS['a@x.com']]), len(R2))
        await A.click('#acctBtn'); await A.wait_for_timeout(300)
        await A.screenshot(path=shot('lg_account.png'))
        await A.click('#mbox >> text=ลบบัญชีและข้อมูลทั้งหมด'); await A.wait_for_timeout(200)
        out['btn_disabled']=await A.locator('#mbox button.danger').is_disabled()
        await A.fill('#mbox input','ลบ'); out['btn_enabled']=await A.locator('#mbox button.danger').is_enabled()
        await A.screenshot(path=shot('lg_delete.png'))
        ACCT['status']=503
        await A.click('#mbox button.danger'); await A.wait_for_timeout(500)
        out['err503']=await A.inner_text('#mbox .err')
        ACCT['status']=200
        await A.click('#mbox button.danger'); await A.wait_for_timeout(2000)
        out['deleted_calls']=DELETED
        out['after_db']=(len([k for t in DB for k in DB[t] if k[0]==USERS['a@x.com']]), len(R2))
        out['local_after']=await A.evaluate("Object.keys(localStorage).filter(k=>k.startsWith('pv-')||k.includes('auth-token'))")
        out['toast']=await A.inner_text('#toast')
        out['acct_btn']=await A.inner_text('#acctBtn')
        out['scenes_left']=await A.evaluate("JSON.parse(localStorage.getItem('pv-scenes2')||'[]').length")
        await A.screenshot(path=shot('lg_after.png'))
        await b.close()
    for n,h in [('privacy','นโยบายความเป็นส่วนตัว'),('terms','ข้อตกลงการใช้งาน')]:
        check(out[n+'_h1']==h and out[n+'_fontok'] and not out[n+'_m_overflow'], f'{n} page: title, our own font, fits a phone', (out[n+'_h1'], out[n+'_m_overflow']))
    check(out['ext_font_requests']==0 and out['app_font_loaded'], 'no Google Fonts requests', out['ext_font_requests'])
    check('นโยบายความเป็นส่วนตัว' in out['footer'] and 'ข้อตกลงการใช้งาน' in out['footer'], 'policy links in the app footer', out['footer'])
    check('ยอมรับ' in out['consent'] and '20 ปี' in out['consent'], 'sign-in shows consent and the age note', out['consent'])
    check(out['before']==(1,1), 'signed-in scene and picture were synced', out['before'])
    check(out['btn_disabled'] and out['btn_enabled'], 'delete needs the word typed', (out['btn_disabled'], out['btn_enabled']))
    check('contact@piccab.com' in out['err503'], 'server not ready → email us', out['err503'])
    check(out['after_db']==(0,0) and out['scenes_left']==0, 'account, scenes and pictures deleted', (out['after_db'], out['scenes_left']))
    check(not any('auth-token' in k for k in out['local_after']), 'signed out on this browser', out['local_after'])
    check('ลบบัญชี' in out['toast'] and 'เข้าสู่ระบบ' in out['acct_btn'], 'confirmation shown', (out['toast'], out['acct_btn']))
    finish('account + policies', out, errs)
asyncio.run(main())
