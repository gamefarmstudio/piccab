# ⭐ End of a round: stars for right-first-time, XP, best combo, time, 🏆 new best, practise the missed words,
# and the best stars on the scene's card.
import asyncio, json, base64
from playwright.async_api import async_playwright
from common import *
W=['cat','sofa','lamp','rug']
async def main():
    out={}; errs=[]
    img='data:image/png;base64,'+base64.b64encode(open(PHOTO,'rb').read()).decode()
    async with async_playwright() as p:
        b=await launch(p)
        ctx=await b.new_context(locale='th-TH', viewport={'width':1100,'height':860}, service_workers='block')
        await ctx.add_init_script("window.speechSynthesis && (window.speechSynthesis.speak=()=>{});")
        pg=await ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.route('**/*', lambda r: app_route(r)); await pg.goto('https://piccab.test/app'); await pg.wait_for_timeout(500)
        await pg.evaluate("""(img)=>{ const it={}; ['cat','sofa','lamp','rug'].forEach((w,i)=>{ it['a'+i]={word:w,th:'',alts:[],x:60+i*270,y:200,w:200,h:300}; });
          localStorage.setItem('pv-scenes2',JSON.stringify([{id:'s1r',name:'My room',w:1200,h:900,img,items:it}])); localStorage.setItem('pv-scene','s1r');
          localStorage.setItem('pv-recent',JSON.stringify({s1r:Date.now()})); }""", img)
        await pg.reload(); await pg.wait_for_timeout(700)
        await pg.click('.cont .icbtn'); await pg.wait_for_timeout(200); await pg.click('.mopt[data-mode=find]'); await pg.wait_for_timeout(500)
        await pg.click('#sub button:has-text("แสดงคำ")'); await pg.wait_for_timeout(100)
        async def play(miss_first):
            n=0
            while await pg.locator('#sub .target').count():
                w=await pg.inner_text('#sub .target'); i=W.index(w)
                if miss_first and n==0:
                    await pg.locator(f'#scene .item[data-id="a{(i+1)%4}"]').first.dispatch_event('click'); await pg.wait_for_timeout(300)
                await pg.locator(f'#scene .item[data-id="a{i}"]').first.dispatch_event('click'); await pg.wait_for_timeout(1250); n+=1
            await pg.wait_for_selector('.rdend', timeout=4000); await pg.wait_for_timeout(1700)
        await play(True)
        out['r1']=[await pg.locator('.rdstar.on').count(), await pg.inner_text('.rdstats'), await pg.locator('.rdbest').count(), await pg.inner_text('.rdend .row')]
        await pg.screenshot(path=shot('rd1_two_stars.png'))
        await pg.click('.rdend button:has-text("ฝึกคำที่พลาด")'); await pg.wait_for_timeout(500)
        out['practice_left']=await pg.inner_text('#sub .pill')
        await play(False)
        out['r2']=[await pg.locator('.rdstar.on').count(), await pg.locator('.rdbest').count()]
        out['best_after_practice']=json.loads(await pg.evaluate("localStorage.getItem('pv-best')"))
        await pg.click('.rdend button:has-text("เล่นอีกรอบ")'); await pg.wait_for_timeout(500)
        await play(False)
        out['r3']=[await pg.locator('.rdstar.on').count(), await pg.locator('.rdbest').count(), await pg.inner_text('.rdstats')]
        await pg.screenshot(path=shot('rd2_three_stars.png'))
        await pg.click('.rdend button:has-text("ปิด")'); await pg.click('#homeBtn'); await pg.wait_for_timeout(400)
        out['home_stars']=await pg.inner_text('.cont .cstars')
        await pg.click('.mainnav [data-view=library]'); await pg.wait_for_timeout(300)
        out['card_stars']=await pg.locator('#libList .lcard:has-text("My room") .cstars').inner_text()
        await b.close()
    check(out['r1'][0]==2 and '3/4' in out['r1'][1] and 'XP' in out['r1'][1] and out['r1'][2]==0 and 'ฝึกคำที่พลาด (1)' in out['r1'][3], '3 of 4 first time → 2 stars, missed word offered', out['r1'])
    check('1/1' in out['practice_left'] or 'เหลือ 1/1' in out['practice_left'], 'practice round of the missed word', out['practice_left'])
    check(out['r2'][0]==3 and out['r2'][1]==0 and list(out['best_after_practice'].values())[0]['s']==2, "practice round doesn't become the best", (out['r2'], out['best_after_practice']))
    check(out['r3'][0]==3 and out['r3'][1]==1 and '🔥 x4' in out['r3'][2], 'perfect round: 3 stars, 🏆 new best, combo x4', out['r3'])
    check(out['home_stars'].startswith('★★★') and out['card_stars'].startswith('★★★'), 'best stars on the scene cards', (out['home_stars'], out['card_stars']))
    finish('round stars', out, errs)
asyncio.run(main())
