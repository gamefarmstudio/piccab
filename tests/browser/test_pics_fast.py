# 🖼️ A new device signing in gets the account's scene pictures quickly: the most recent scene first (the "เรียนต่อ"
# card), several at a time, each shown as soon as it arrives; a download that fails is tried again by itself.
import asyncio, json, time
from playwright.async_api import async_playwright
from common import *
BASE=SERVER
async def fwd(r):
    resp=await r.fetch(url=r.request.url.replace(SUPA, FAKE)); await r.fulfill(response=resp)
async def newpage(b, errs, vw=1200, vh=900, mobile=False):
    ctx=await b.new_context(locale='th-TH', viewport={'width':vw,'height':vh}, is_mobile=mobile, has_touch=mobile, service_workers='block')
    pg=await ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e))); await pg.route(SUPA+'/**', fwd); return pg
async def login(pg, em):
    await pg.click('#acctBtn'); await pg.fill('.mbox input[type=email]',em); await pg.click('.mbox button.primary'); await pg.wait_for_timeout(400)
    await pg.type('.mbox input.code','123456'); await pg.press('.mbox input.code','Enter')
PICS="""(async()=>{ const a=JSON.parse(localStorage.getItem('pv-scenes2')||'[]').filter(s=>s.meta&&s.meta.kind==='list');
  const db=await new Promise(r=>{ const q=indexedDB.open('piccab',1); q.onupgradeneeded=()=>q.result.createObjectStore('img'); q.onsuccess=()=>r(q.result); q.onerror=()=>r(null); });   // (made the way the app makes it)
  const get=id=>new Promise(r=>{ try{ const q=db.transaction('img').objectStore('img').get(id); q.onsuccess=()=>r(!!q.result); q.onerror=()=>r(false); }catch(e){ r(false); } });
  const out={}; for(const s of a) out[s.name]=db ? await get(s.id) : false; return out; })()"""
async def main():
    async with async_playwright() as p:
        b=await launch(p); errs=[]; out={}
        # the tablet: five word sheets, made one after another (the last one is the newest)
        A=await newpage(b, errs); await A.goto(BASE+'/app'); await A.wait_for_timeout(700)
        names=[]
        for i in range(5):
            if i==0: await A.click('.welcome .wslink')
            else: await A.click('.cbtn.wide:has-text("ชีทคำศัพท์จากครู")')
            await A.wait_for_timeout(250)
            name=f'Sheet {i+1}'; names.append(name)
            await A.fill('.wsbox input[aria-label="ชื่อชุดคำ"]', name)
            if await A.locator('.wsbox input[type=checkbox]').count(): await A.locator('.wsbox input[type=checkbox]').first.uncheck()
            await A.fill('.wsbox textarea', f"cat แมว\ndog สุนัข\nbird นก{i}"); await A.click('.wsbox .row .primary'); await A.wait_for_timeout(900)
            for _ in range(4):
                if not await A.locator('#modal:not([hidden])').count(): break
                await A.evaluate("document.querySelector('#modal').click()"); await A.wait_for_timeout(250)
            await A.click('#homeBtn'); await A.wait_for_timeout(400)
        await login(A,'kid@pics.th'); await A.wait_for_timeout(6000)
        out['names']=await A.evaluate("JSON.parse(localStorage.getItem('pv-scenes2')||'[]').filter(s=>s.meta&&s.meta.kind==='list').map(s=>s.name)")
        # the phone (new device): every picture takes 1.2 s; the first try of one picture fails
        P=await newpage(b, errs, 390, 820, True)
        log={'order':[], 'busy':0, 'most':0, 'failed':None, 'tries':{}}
        async def slow(r):
            sid=r.request.url.rsplit('/',1)[-1]; log['tries'][sid]=log['tries'].get(sid,0)+1
            if log['tries'][sid]==1: log['order'].append(sid)
            fail = log['failed'] is None and len(log['order'])==3 and log['tries'][sid]==1
            if fail: log['failed']=sid
            log['busy']+=1; log['most']=max(log['most'], log['busy'])
            try:
                await asyncio.sleep(1.2)
                if fail: return await r.fulfill(status=503, body='busy')
                resp=await r.fetch(); log.setdefault('st',[]).append(resp.status); await r.fulfill(response=resp)
            finally: log['busy']-=1
        await P.route('**/api/img/**', slow)
        await P.goto(BASE+'/app'); await P.wait_for_timeout(700)
        t0=time.time(); await login(P,'kid@pics.th')
        for _ in range(60):
            got=await P.evaluate(PICS)
            if len(got)==5 and all(got.values()): break
            await P.wait_for_timeout(250)
        out['secs']=round(time.time()-t0,1); out['got']=got; out['log']={k:v for k,v in log.items() if k!='order'}
        out['first']=await P.evaluate("id=>((JSON.parse(localStorage.getItem('pv-scenes2')||'[]').find(s=>s.id===id))||{}).name", log['order'][0] if log['order'] else '')
        out['pending']=await P.evaluate("localStorage.getItem('pv-imgneed')")
        await P.screenshot(path=shot('pics_fast.png'))
        await b.close()
    check(len(out['got'])==5 and all(out['got'].values()), 'the phone has all five pictures', out['got'])
    check(out['first']==out['names'][-1] if out['names'] else False, 'the newest scene\'s picture comes first', (out['first'], out['names']))
    check(out['log']['most']>=3, 'several pictures at a time', out['log'])
    check(out['log']['failed'] and out['log']['tries'].get(out['log']['failed'])==2, 'a failed download is tried again by itself', out['log'])
    check(out['secs']<8, 'all there in a few seconds (one at a time would take 7 s or more)', out['secs'])
    check(out['pending'] in ('[]', None), 'nothing left to download', out['pending'])
    finish('pictures on a new device', out, errs)
asyncio.run(main())
