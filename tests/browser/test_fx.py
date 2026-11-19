# 🎉 Game effects: confetti and "+XP" on a right answer, 🔥 combo at 3 in a row, combo lost on a miss, 🔔 switch.
import asyncio, re
from playwright.async_api import async_playwright
from common import *
CORE=(ROOT/'app'/'js'/'core.js').read_text(encoding='utf-8')
WORD=dict(re.findall(r"^\s+'([a-z0-9-]+)':\s*\{word:'([^']+)'", CORE, re.M))
async def main():
    out={}; errs=[]
    async with async_playwright() as p:
        b=await launch(p)
        ctx=await b.new_context(locale='th-TH', viewport={'width':1100,'height':860}, service_workers='block')
        await ctx.add_init_script("window.speechSynthesis && (window.speechSynthesis.speak=()=>{});")
        pg=await ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.route('**/*', lambda r: app_route(r)); await pg.goto('https://piccab.test/app'); await pg.wait_for_timeout(700)
        await pg.click('.cont .icbtn'); await pg.wait_for_timeout(200); await pg.click('.mopt[data-mode=quiz]'); await pg.wait_for_timeout(600)
        ids=[i for i in await pg.evaluate("[...document.querySelectorAll('#scene .item[data-id]')].map(e=>e.dataset.id)") if i in WORD][:4]
        out['ids']=ids; seen=[]
        for n,i in enumerate(ids[:3]):
            await pg.locator(f'#scene .item[data-id="{i}"]').first.dispatch_event('click'); await pg.wait_for_timeout(300)
            await pg.fill('#qin', WORD[i]); await pg.press('#qin','Enter'); await pg.wait_for_timeout(250)
            seen.append([await pg.locator('#fxLayer .fxbit').count(), ' '.join((await pg.locator('#fxLayer .fxxp').all_inner_texts())[-1:]), await pg.locator('#fxLayer .fxcombo').count()])
            if n==2: await pg.screenshot(path=shot('fx_combo.png'))
            await pg.wait_for_timeout(1300)
        out['seen']=seen
        await pg.locator(f'#scene .item[data-id="{ids[3]}"]').first.dispatch_event('click'); await pg.wait_for_timeout(300)
        await pg.fill('#qin','zzzz'); await pg.press('#qin','Enter'); await pg.wait_for_timeout(250)
        out['lost']=await pg.locator('#fxLayer .fxnote').all_inner_texts()
        await pg.wait_for_timeout(1800); out['left']=await pg.locator('#fxLayer > *').count()
        await pg.click('#homeBtn'); await pg.wait_for_timeout(300)
        out['sfx0']=await pg.is_checked('#sfx'); await pg.uncheck('#sfx'); out['sfx_store']=await pg.evaluate("localStorage.getItem('pv-sfx')")
        await b.close()
    s=out['seen']
    check(len(out['ids'])==4, 'sample scene words', out['ids'])
    check(s[0][0]>0 and s[0][1].startswith('+17 XP'), 'first right answer: confetti and +17 XP (new word, ★)', s[0])
    check('x2' in s[1][1] and s[1][2]==0 and s[2][2]==1 and 'x3' in s[2][1], 'combo counts up, pops at x3', s)
    check(out['lost']==['คอมโบหลุด — เริ่มใหม่ได้!'] and out['left']==0, 'a miss ends the combo; effects clean up', (out['lost'], out['left']))
    check(out['sfx0'] is True and out['sfx_store']=='false', 'sound switch remembered', (out['sfx0'], out['sfx_store']))
    finish('game effects', out, errs)
asyncio.run(main())
