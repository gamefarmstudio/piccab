# 🔄 A word sheet changed on one device shows the new picture on the other device too.
# (Before: if the new words arrived but the picture download didn't finish — or the browser cache handed back the
#  old one — the phone kept the old picture for good: the 🎨 pictures were missing and the end of a Thai meaning
#  peeked out beside the English word.)
import asyncio, json, urllib.request
from playwright.async_api import async_playwright
from common import *
BASE=SERVER
async def fwd(r):
    resp=await r.fetch(url=r.request.url.replace('https://oftzpfyydnmahkntucnj.supabase.co', FAKE)); await r.fulfill(response=resp)
async def newpage(b, errs, vw=1200, vh=900, mobile=False):
    ctx=await b.new_context(locale='th-TH', viewport={'width':vw,'height':vh}, is_mobile=mobile, has_touch=mobile, service_workers='block')
    pg=await ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e))); await pg.route('https://oftzpfyydnmahkntucnj.supabase.co/**', fwd); return pg
async def login(pg, em):
    await pg.click('#acctBtn'); await pg.fill('.mbox input[type=email]',em); await pg.click('.mbox button.primary'); await pg.wait_for_timeout(400)
    await pg.type('.mbox input.code','123456'); await pg.press('.mbox input.code','Enter'); await pg.wait_for_timeout(2500)
# the sheet: words, picture height, and the picture kept on the device (IndexedDB) with its real height
SHEET="""(async()=>{ const a=JSON.parse(localStorage.getItem('pv-scenes2')||'[]').filter(s=>s.meta&&s.meta.kind==='list');
  const db=await new Promise(r=>{ const q=indexedDB.open('piccab',1); q.onupgradeneeded=()=>q.result.createObjectStore('img'); q.onsuccess=()=>r(q.result); q.onerror=()=>r(null); });
  const get=id=>new Promise(r=>{ try{ const q=db.transaction('img').objectStore('img').get(id); q.onsuccess=()=>r(q.result||''); q.onerror=()=>r(''); }catch(e){ r(''); } });
  const size=u=>new Promise(r=>{ if(!u) return r(0); const i=new Image(); i.onload=()=>r(i.naturalHeight); i.onerror=()=>r(0); i.src=u; });
  const out=[]; for(const s of a){ const im=db ? await get(s.id) : ''; out.push({n:Object.keys(s.items).length, h:s.h, img:await size(im)}); }
  return out; })()"""
LIST="minus ลบ\nplus บวก\ntimes คูณ"
async def wait_for(pg, n, tries=40):
    for i in range(tries):
        v=await pg.evaluate(SHEET)
        if v and v[0]['n']==n and v[0]['img']==v[0]['h']: return v[0]
        await pg.wait_for_timeout(500)
    return await pg.evaluate(SHEET)
async def main():
    async with async_playwright() as p:
        b=await launch(p); errs=[]; out={}
        # desktop: a sheet of 3 words, signed in → it goes to the account
        A=await newpage(b, errs); await A.goto(BASE+'/app'); await A.wait_for_timeout(700)
        await open_set_maker(A)
        await paste_words(A, LIST); await A.click('.wsbox .row .primary'); await A.wait_for_timeout(1200)
        out['a_modal']=await A.evaluate("(document.querySelector('#modal:not([hidden]) #mbox')||{}).innerText||''")
        for _ in range(5):
            if not await A.locator('#modal:not([hidden])').count(): break
            await A.evaluate("document.querySelector('#modal').click()"); await A.wait_for_timeout(300)
        await A.click('#homeBtn'); await A.wait_for_timeout(400)
        await login(A,'teacher@school.th'); await A.wait_for_timeout(3000)
        # phone: signs in → gets the sheet and its picture
        P=await newpage(b, errs, 390, 820, True); await P.goto(BASE+'/app'); await P.wait_for_timeout(700)
        await login(P,'teacher@school.th')
        out['p1']=await wait_for(P, 3)
        await P.screenshot(path=shot('ss_p1.png'))
        # desktop: two more words → a taller picture, same address
        await A.click('.cont .primary.big'); await A.wait_for_timeout(500)
        await A.click('#editBtn'); await A.wait_for_timeout(300)
        await paste_words(A, LIST+'\nhalf ครึ่ง\nequals เท่ากับ\none hundred หนึ่งร้อย')
        await A.click('.wsbox .row .primary'); await A.wait_for_timeout(5000)
        out['a2']=(await A.evaluate(SHEET))[0]
        # phone opens the app, gets the new words, but the picture download is cut short (app closed / signal lost)
        await P.route('**/api/img/**', lambda r: r.abort())
        await P.reload(); await P.wait_for_timeout(4000)
        out['p_cut']=(await P.evaluate(SHEET))[0]
        await P.unroute('**/api/img/**')
        # next time the app opens → the new picture comes after all
        await P.reload(); await P.wait_for_timeout(1500)
        out['p2']=await wait_for(P, 6)
        out['pending']=await P.evaluate("localStorage.getItem('pv-imgneed')")
        await P.screenshot(path=shot('ss_phone.png'), full_page=True)
        await b.close()
    check(isinstance(out['p1'],dict) and out['p1']['n']==3 and out['p1']['img']==out['p1']['h'], 'phone got the sheet', out['p1'])
    check(out['a2']['n']==6 and out['a2']['h']>out['p1']['h'], 'desktop: sheet now 6 words, taller picture', out['a2'])
    check(out['p_cut']['n']==6 and out['p_cut']['img']==out['p1']['h'], 'download cut short: new words, old picture for now', out['p_cut'])
    check(out['p2']['n']==6 and out['p2']['h']==out['a2']['h'], 'phone: 6 words', out['p2'])
    check(out['pending'] in ('[]', None), 'nothing left to download', out['pending'])
    check(out['p2']['img']==out['a2']['h'], 'phone: the NEW picture (not the old one from the browser cache)', (out['p2'], out['a2']))
    finish('word sheet sync', out, errs)
asyncio.run(main())
