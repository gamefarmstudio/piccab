"""Full screen on a landscape phone with a tall picture: it fills the width and scrolls; ▲/▼ show there is more,
and Auto brings each word into view."""
import asyncio
from playwright.async_api import async_playwright
from common import *
WORDS="\n".join(f"word{i} คำที่{i}" for i in range(1,17))
async def main():
    out={}; errs=[]
    async with async_playwright() as p:
        b=await launch(p)
        ctx=await b.new_context(locale='th-TH', viewport={'width':844,'height':390}, is_mobile=True, has_touch=True, device_scale_factor=2, service_workers='block')
        pg=await ctx.new_page(); pg.on('pageerror',lambda e: errs.append(str(e)))
        await pg.route('**/*', lambda r: app_route(r)); await pg.goto('https://piccab.test/app'); await pg.wait_for_timeout(1200)
        await pg.click('.welcome .wslink'); await pg.wait_for_timeout(300)
        await pg.fill('.wsbox textarea', WORDS); await pg.click('.wsbox .row .primary'); await pg.wait_for_timeout(1500)   # a word sheet: a tall picture
        await pg.evaluate("document.getElementById('fsBtn').click()"); await pg.wait_for_timeout(800)
        out['fill']=await pg.evaluate("['fsside','fsnarrow','fsfill'].every(c=>document.body.classList.contains(c))")
        cues=lambda: pg.evaluate("[...document.querySelectorAll('.fscue')].map(c=>getComputedStyle(c).display)")
        out['cues_top']=await cues()
        await pg.click('#sub button:has-text("Auto")'); await pg.wait_for_timeout(300)
        tops=[]
        for i in range(15):
            await pg.evaluate("document.querySelector('#sub button[aria-label=\"คำถัดไป\"]').click()"); await pg.wait_for_timeout(600)
            tops.append(await pg.evaluate("Math.round(document.querySelector('#playView>main').scrollTop)"))
        out['tops']=tops
        out['shown_visible']=await pg.evaluate("""(()=>{ const m=document.querySelector('#playView>main').getBoundingClientRect(), e=document.querySelector('#scene .item.hl');
            if(!e) return false; const b=e.getBoundingClientRect(); return b.top>=m.top-1 && b.bottom<=m.bottom+1; })()""")
        out['cues_bottom']=await cues()
        await pg.screenshot(path=shot('fs_tall.png'))
        await pg.click('.fscue.up'); await pg.wait_for_timeout(700)
        out['after_up']=await pg.evaluate("Math.round(document.querySelector('#playView>main').scrollTop)")
        await b.close()
    check(out['fill'], 'tall picture fills the width in landscape full screen', out['fill'])
    check(out['cues_top']==['none','block'], 'at the top: only ▼', out['cues_top'])
    check(out['tops'][0]==0 and out['tops'][-1]>out['tops'][0] and out['tops']==sorted(out['tops']), 'Auto scrolls down with the words', out['tops'])
    check(out['shown_visible'], 'the word being shown is on screen', out['shown_visible'])
    check(out['cues_bottom']==['block','none'], 'at the bottom: only ▲', out['cues_bottom'])
    check(out['after_up']<out['tops'][-1], '▲ scrolls up', (out['after_up'], out['tops'][-1]))
    finish('full screen, tall picture', out, errs)
asyncio.run(main())
