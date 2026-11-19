# 🎨 Line pictures on word sheets: words in the shared bank are free, the rest drawn by AI in one call;
# the picture shows on each card (learn mode keeps it visible), 🔄 redraws one (3 a sheet), flashcards use them.
import asyncio, json
from playwright.async_api import async_playwright
from common import *
SVG=lambda c: f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none" stroke="#2d2a5a" stroke-width="4"><circle cx="50" cy="50" r="30" fill="{c}"/></svg>'
CALLS=[]
async def extra(r):
    if r.request.url.endswith('/api/wordpics'):
        b=json.loads(r.request.post_data or '{}'); CALLS.append(b)
        ws=[w.lower() for w in b['words']]
        if b.get('redraw'): pics={ws[0]:SVG('#23915a')}
        elif b.get('draw'): pics={w:SVG('#ffc928') for w in ws}
        else: pics={w:SVG('#ef5a78') for w in ws if w=='minus'}
        return await r.fulfill(status=200, content_type='application/json', body=json.dumps({'pics':pics,'missing':[w for w in ws if w not in pics]}))
    return False
async def main():
    out={}; errs=[]
    async with async_playwright() as p:
        b=await launch(p)
        ctx=await b.new_context(locale='th-TH', viewport={'width':1000,'height':860}, service_workers='block')
        await ctx.add_init_script("window.print=()=>{}; window.speechSynthesis && (speechSynthesis.speak=()=>{});")
        pg=await ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.route('**/*', lambda r: app_route(r, health='{"ai":true}', extra=extra)); await pg.goto('https://piccab.test/app'); await pg.wait_for_timeout(700)
        await pg.click('.welcome .wslink'); await pg.wait_for_timeout(300)
        out['checkbox']=[await pg.is_checked('.wspics input'), await pg.inner_text('.wspics')]
        await pg.fill('.wsbox textarea','minus ลบ\nplus บวก\nhalf ครึ่ง')
        await pg.click('.wsbox .row button.primary'); await pg.wait_for_timeout(2500)
        out['calls']=[[c['words'], c.get('draw',False)] for c in CALLS]
        items=await pg.evaluate("(()=>{ const a=JSON.parse(localStorage.getItem('pv-scenes2')||'[]'); const s=a.find(x=>x.meta&&x.meta.kind==='list'); return Object.values(s.items).map(i=>[i.word, (i.pic||'').match(/fill=\"(#\\w+)\"><\\/circle>|fill=\"(#\\w+)\"\\/>/)?.slice(1).find(Boolean)||'']); })()")
        out['items']=items
        out['overlay_w']=await pg.evaluate("[...document.querySelectorAll('#scene .lcards rect')].map(r=>+r.getAttribute('width'))")
        await pg.screenshot(path=shot('sp1_sheet.png'))
        # 🔄 redraw from the word's tag
        await pg.locator('#scene .item').nth(1).dispatch_event('click'); await pg.wait_for_timeout(300)
        out['redraw_btn']=await pg.locator('#tag button[aria-label="วาดรูปนี้ใหม่"]').count()
        await pg.click('#tag button[aria-label="วาดรูปนี้ใหม่"]'); await pg.wait_for_timeout(1500)
        out['after']=await pg.evaluate("(()=>{ const a=JSON.parse(localStorage.getItem('pv-scenes2')||'[]'); const s=a.find(x=>x.meta&&x.meta.kind==='list'); return [s.meta.redraws, Object.values(s.items).map(i=>i.pic.includes('#23915a'))]; })()")
        out['last_call']=CALLS[-1]
        # flashcards use the pictures
        await pg.click('#homeBtn'); await pg.wait_for_timeout(300)
        await pg.click('.mainnav [data-view=library]'); await pg.wait_for_timeout(300)
        await pg.locator('#libList .lcard').first.click(); await pg.wait_for_timeout(400)
        out['add_btn']=await pg.locator('#mbox button:has-text("ใส่รูปลายเส้น")').count()
        await pg.click('#mbox button:has-text("แฟลชการ์ด")'); await pg.wait_for_timeout(300)
        await pg.click('#mbox button.primary'); await pg.wait_for_timeout(1200)
        out['print_imgs']=await pg.locator('#printSheet .ppage').first.locator('img').count()
        await b.close()
    check(out['checkbox'][0] and '1 เครดิตต่อชีท' in out['checkbox'][1], 'pictures on by default, cost explained', out['checkbox'])
    check(out['calls']==[[['minus','plus','half'],False],[['plus','half'],True]], 'bank first (free), then one AI call for the rest', out['calls'])
    check([i[1] for i in out['items']]==['#ef5a78','#ffc928','#ffc928'], 'each word has its picture', out['items'])
    check(len(out['overlay_w'])==3 and max(out['overlay_w'])<300, 'learn-mode cards leave the picture visible', out['overlay_w'])
    check(out['redraw_btn']==1 and out['after'][0]==1 and out['after'][1]==[False,True,False] and out['last_call'].get('redraw') is True, '🔄 redraws one word', (out['after'], out['last_call']))
    check(out['add_btn']==0 and out['print_imgs']==3, 'flashcards show the pictures', (out['add_btn'], out['print_imgs']))
    finish('sheet pictures', out, errs)
asyncio.run(main())
