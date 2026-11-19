# 📍 Listen & find: "เผยตำแหน่ง" shows where the word is (spotlight + pulsing box, no word label);
# tapping it then goes on, but it doesn't count as right the first time.
import asyncio
from playwright.async_api import async_playwright
from common import *
async def main():
    out={}; errs=[]
    async with async_playwright() as p:
        b=await launch(p)
        ctx=await b.new_context(locale='th-TH', viewport={'width':390,'height':844}, is_mobile=True, has_touch=True, service_workers='block')
        await ctx.add_init_script("window.speechSynthesis && (window.speechSynthesis.speak=()=>{});")
        pg=await ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.route('**/*', lambda r: app_route(r)); await pg.goto('https://piccab.test/app'); await pg.wait_for_timeout(700)
        await pg.click('.cont .icbtn'); await pg.wait_for_timeout(200); await pg.click('.mopt[data-mode=find]'); await pg.wait_for_timeout(600)
        out['pill0']=await pg.inner_text('#sub .pill')
        await pg.click('#sub button:has-text("เผยตำแหน่ง")'); await pg.wait_for_timeout(300)
        out['hint']=await pg.locator('#scene .item.hint').count()
        out['spot']=await pg.locator('#scene .spot.on').count()
        out['tag_hidden']=await pg.locator('#tag').is_hidden()
        await pg.screenshot(path=shot('find_reveal.png'))
        tid=await pg.locator('#scene .item.hint').first.get_attribute('data-id')
        await pg.locator(f'#scene .item[data-id="{tid}"]').first.dispatch_event('click'); await pg.wait_for_timeout(1500)
        out['pill1']=await pg.inner_text('#sub .pill')
        out['hint_after']=await pg.locator('#scene .item.hint').count()
        await b.close()
    check('ถูก 0' in out['pill0'], 'find game started', out['pill0'])
    check(out['hint']==1 and out['spot']==1 and out['tag_hidden'], 'shows where, not the word', (out['hint'], out['spot'], out['tag_hidden']))
    check('ถูก 0' in out['pill1'] and out['hint_after']==0 and out['pill0']!=out['pill1'], 'tapping it goes on, not counted as right', (out['pill0'], out['pill1']))
    finish('find reveal', out, errs)
asyncio.run(main())
