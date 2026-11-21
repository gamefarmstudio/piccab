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
        elif b.get('draw'): pics={w:SVG('#ffc928') for w in ws if w!='zebra' and (w!='past' or b.get('retry'))}   # 'past' only on the free retry; 'zebra' never
        else: pics={w:SVG('#ef5a78') for w in ws if w=='minus'}
        missing=[w for w in ws if w not in pics]
        return await r.fulfill(status=200, content_type='application/json', body=json.dumps({'pics':pics,'missing':missing, **({'retry':'TOK'+str(len(CALLS))} if missing and b.get('draw') and not b.get('redraw') else {})}))
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
        await pg.click('#mbox button.primary'); await pg.wait_for_timeout(1200)     # 👀 the preview
        out['preview_imgs']=await pg.locator('.pcprev .ppage').first.locator('img').count()
        await pg.click('#mbox button.primary'); await pg.wait_for_timeout(1200)     # 🖨️ print
        out['print_imgs']=await pg.locator('#printSheet .ppage').first.locator('img').count()
        await pg.evaluate("document.getElementById('printSheet')?.remove(); document.body.classList.remove('printing')")
        # words left out: the next try is free (signed note), and 🎨 on a word draws just that one
        await pg.locator('#libList .lcard').first.click(); await pg.wait_for_timeout(400)
        await pg.click('#mbox button:has-text("แก้ไขรายการคำ")'); await pg.wait_for_timeout(300)
        await pg.fill('.wsbox textarea', 'minus ลบ\nplus บวก\nhalf ครึ่ง\npast อดีต\nzebra ม้าลาย')
        await pg.click('.wsbox .row button.primary'); await pg.wait_for_timeout(2500)
        meta=lambda: pg.evaluate("(()=>{ const a=JSON.parse(localStorage.getItem('pv-scenes2')||'[]'); const s=a.find(x=>x.meta&&x.meta.kind==='list'); return [s.meta.picRetry||null, Object.values(s.items).filter(i=>!i.pic).map(i=>i.word)]; })()")
        out['left1']=await meta()
        await pg.click('.mainnav [data-view=library]'); await pg.wait_for_timeout(300)
        await pg.locator('#libList .lcard').first.click(); await pg.wait_for_timeout(400)
        out['free_btn']=await pg.locator('#mbox button:has-text("ใส่รูปที่ขาด (ฟรี)")').count()
        await pg.click('#mbox button:has-text("ใส่รูปที่ขาด")'); await pg.wait_for_timeout(2000)
        out['retry_sent']=CALLS[-1].get('retry'); out['left2']=await meta()
        await pg.evaluate("localStorage.setItem('pv-scene', JSON.parse(localStorage.getItem('pv-scenes2')).find(x=>x.meta&&x.meta.kind==='list').id)")
        await pg.reload(); await pg.wait_for_timeout(700)
        await pg.click('.cont .primary.big'); await pg.wait_for_timeout(600)
        zid=await pg.evaluate("(()=>{ const s=JSON.parse(localStorage.getItem('pv-scenes2')).find(x=>x.meta&&x.meta.kind==='list'); return Object.entries(s.items).find(([k,v])=>v.word==='zebra')[0]; })()")
        await pg.locator(f'#scene .item[data-id="{zid}"]').first.dispatch_event('click'); await pg.wait_for_timeout(300)
        out['draw_btn']=await pg.locator('#tag button[aria-label="วาดรูปคำนี้"]').count()
        await pg.click('#tag button[aria-label="วาดรูปคำนี้"]'); await pg.wait_for_timeout(1500)
        out['left3']=await meta(); out['last2']=[c.get('draw',False) or False for c in CALLS[-2:]], CALLS[-1].get('redraw')
        await b.close()
    check(out['checkbox'][0] and '1 เครดิตต่อชีท' in out['checkbox'][1], 'pictures on by default, cost explained', out['checkbox'])
    check(out['calls']==[[['minus','plus','half'],False],[['plus','half'],True]], 'bank first (free), then one AI call for the rest', out['calls'])
    check([i[1] for i in out['items']]==['#ef5a78','#ffc928','#ffc928'], 'each word has its picture', out['items'])
    check(len(out['overlay_w'])==3 and max(out['overlay_w'])<300, 'learn-mode cards leave the picture visible', out['overlay_w'])
    check(out['redraw_btn']==1 and out['after'][0]==1 and out['after'][1]==[False,True,False] and out['last_call'].get('redraw') is True, '🔄 redraws one word', (out['after'], out['last_call']))
    check(out['add_btn']==0 and out['print_imgs']==3 and out['preview_imgs']==3, 'flashcards show the pictures (preview and print)', (out['add_btn'], out['preview_imgs'], out['print_imgs']))
    check(out['left1'][0] and out['left1'][1]==['past','zebra'], 'words left out → a free-retry note kept on the sheet', out['left1'])
    check(out['free_btn']==1 and out['retry_sent']==out['left1'][0] and out['left2'][1]==['zebra'], 'the free retry sends the note and fills what it can', (out['free_btn'], out['retry_sent'], out['left2']))
    check(out['draw_btn']==1 and out['left3'][1]==[] and out['last2'][1] is True, '🎨 on a word draws just that one', (out['draw_btn'], out['left3'], out['last2']))
    finish('sheet pictures', out, errs)
asyncio.run(main())
