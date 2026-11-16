# Editing a scene: every box can show its meaning under the word (🔤 แสดงคำแปล), to check words and meanings at once.
import asyncio
from playwright.async_api import async_playwright
from common import *

async def route(r):
    u=r.request.url
    if u.endswith('/vendor/supabase-2.119.0.js'): return await r.fulfill(status=200, content_type='application/javascript', body=SBJS)
    if u.endswith('/api/health'): return await r.fulfill(status=200, content_type='application/json', body='{"ai":false}')
    if 'supabase.co' in u: return await r.fulfill(status=404, body='{}')
    return await page_or_built(r)

async def touch_drag(pg, cdp, x0,y0,x1,y1, steps=8):
    await cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x0,'y':y0}]})
    for i in range(1,steps+1):
        await cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':x0+(x1-x0)*i/steps,'y':y0+(y1-y0)*i/steps}]})
        await pg.wait_for_timeout(16)
    await cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})

async def main():
    out={}; errs=[]
    async with async_playwright() as p:
        b=await launch(p)
        ctx=await b.new_context(locale='th-TH', viewport={'width':1280,'height':900}, has_touch=True, service_workers='block')
        pg=await ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.route('**/*', route); await pg.goto('https://piccab.test/'); await pg.wait_for_timeout(500)
        cdp=await ctx.new_cdp_session(pg)
        await pg.set_input_files('#fileImg', PHOTO); await pg.wait_for_timeout(900)
        sb=await pg.locator('#scene').bounding_box()
        X=lambda f: sb['x']+sb['width']*f; Y=lambda f: sb['y']+sb['height']*f
        for (x0,y0,x1,y1,w,th) in [(.1,.3,.4,.6,'sofa','โซฟา'),(.55,.35,.85,.7,'lamp','โคมไฟ')]:
            await pg.click('#sub button.drawbtn'); await pg.wait_for_timeout(900)
            sb.update(await pg.locator('#scene').bounding_box())
            await touch_drag(pg,cdp, X(x0),Y(y0), X(x1),Y(y1)); await pg.wait_for_timeout(400)
            await pg.fill('.mbox input.word',w); await pg.fill('.mbox label:nth-of-type(2) input',th); await pg.click('.mbox button.primary'); await pg.wait_for_timeout(400)
        out['selbar']=await pg.locator('.selbar b').inner_text()
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)
        btn=pg.locator('#sub button', has_text='แสดงคำแปล')
        out['btn_on']=await btn.inner_text()
        out['labels_on']=sorted(await pg.locator('.mini.edit').evaluate_all("a=>a.map(m=>[m.querySelector('span').textContent, (m.querySelector('small')||{}).textContent||''])"))
        await pg.screenshot(path=shot('em1_on.png'))
        await btn.click(); await pg.wait_for_timeout(300)
        out['btn_off']=await pg.locator('#sub button', has_text='แสดงคำแปล').inner_text()
        out['labels_off']=sorted(await pg.locator('.mini.edit').evaluate_all("a=>a.map(m=>[m.textContent, !!m.querySelector('small')])"))
        out['kept']=await pg.evaluate("localStorage.getItem('pv-editmean')")
        await pg.screenshot(path=shot('em2_off.png'))
        await b.close()
    print(out, errs)
    ok = ('โซฟา' in out['selbar'] or 'โคมไฟ' in out['selbar']) and out['btn_on'].endswith('เปิด') and out['labels_on']==[['lamp','โคมไฟ'],['sofa','โซฟา']] \
        and out['btn_off'].endswith('ปิด') and out['labels_off']==[['lamp',False],['sofa',False]] and out['kept']=='false' and not errs
    print('PASS' if ok else 'FAIL'); assert ok
asyncio.run(main())
