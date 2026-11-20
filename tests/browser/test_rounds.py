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
        golds=[]
        async def play(miss_first):
            n=0
            while await pg.locator('#sub .target').count():
                golds.append(await pg.locator('#sub .goldpill').count())
                w=await pg.inner_text('#sub .target'); i=W.index(w)
                if miss_first and n==0:
                    await pg.locator(f'#scene .item[data-id="a{(i+1)%4}"]').first.dispatch_event('click'); await pg.wait_for_timeout(300)
                await pg.locator(f'#scene .item[data-id="a{i}"]').first.dispatch_event('click'); await pg.wait_for_timeout(1250); n+=1
            await pg.wait_for_selector('.rdend', timeout=4000); await pg.wait_for_timeout(1700)
        await play(True)
        out['r1']=[await pg.locator('.rdstar.on').count(), await pg.inner_text('.rdstats'), await pg.locator('.rdbest').count(), await pg.inner_text('.rdend .row')]
        await pg.screenshot(path=shot('rd1_two_stars.png'))
        out['chest1']=await pg.inner_text('.rdend .chest')
        await pg.click('.rdend .chest'); await pg.wait_for_timeout(1300)
        out['reveal']=await pg.inner_text('.rdend .stkreveal')
        await pg.screenshot(path=shot('rd3_sticker.png'))
        out['stk']=json.loads(await pg.evaluate("localStorage.getItem('pv-stk')"))
        await pg.click('.rdend button:has-text("ฝึกคำที่พลาด")'); await pg.wait_for_timeout(500)
        out['practice_left']=await pg.inner_text('#sub .pill')
        await play(False)
        out['r2']=[await pg.locator('.rdstar.on').count(), await pg.locator('.rdbest').count(), await pg.locator('.rdend .chest').count()]
        out['best_after_practice']=json.loads(await pg.evaluate("localStorage.getItem('pv-best')"))
        await pg.click('.rdend button:has-text("เล่นอีกรอบ")'); await pg.wait_for_timeout(500)
        await play(False)
        out['r3']=[await pg.locator('.rdstar.on').count(), await pg.locator('.rdbest').count(), await pg.inner_text('.rdstats'), await pg.inner_text('.rdend .chest')]
        out['golds']=golds; out['bonus']=await pg.evaluate("localStorage.getItem('pv-bonusxp')")
        await pg.screenshot(path=shot('rd2_three_stars.png'))
        await pg.click('.rdend .row button:text-is("ปิด")'); await pg.click('#homeBtn'); await pg.wait_for_timeout(400)
        out['home_stars']=await pg.inner_text('.cont .cstars')
        out['qtile']=await pg.inner_text('.tile.qtile')
        await pg.click('.tile.qtile'); await pg.wait_for_timeout(300)
        out['quests']=await pg.locator('.dqrow').all_inner_texts()
        await pg.screenshot(path=shot('rd4_quests.png'))
        await pg.click('.qbox .chest'); await pg.wait_for_timeout(2400)
        out['quest_text']=await pg.inner_text('.qbox')                     # redrawn without a chest
        await pg.click('.qbox .row button:text-is("ปิด")'); await pg.wait_for_timeout(300)
        await pg.click('.tile.qtile'); await pg.wait_for_timeout(300)
        out['quest_text2']=await pg.inner_text('.qbox')                    # opened with no chest waiting
        out['stk2']=sum(json.loads(await pg.evaluate("localStorage.getItem('pv-stk')")).values())
        await pg.click('.qbox button:has-text("สมุดสติกเกอร์")'); await pg.wait_for_timeout(600)
        out['book']=await pg.inner_text('#stkBook h3'); out['got']=await pg.locator('#stkBook .stk.got').count()
        await pg.screenshot(path=shot('rd5_book.png'), full_page=True)
        await pg.click('#homeBtn') if await pg.locator('#homeBtn').is_visible() else None
        await pg.click('.mainnav [data-view=home]'); await pg.wait_for_timeout(300)
        await pg.click('.mainnav [data-view=library]'); await pg.wait_for_timeout(300)
        out['card_stars']=await pg.locator('#libList .lcard:has-text("My room") .cstars').inner_text()
        await b.close()
    check(out['r1'][0]==2 and '3/4' in out['r1'][1] and 'XP' in out['r1'][1] and out['r1'][2]==0 and 'ฝึกคำที่พลาด (1)' in out['r1'][3], '3 of 4 first time → 2 stars, missed word offered', out['r1'])
    check('1/1' in out['practice_left'] or 'เหลือ 1/1' in out['practice_left'], 'practice round of the missed word', out['practice_left'])
    check(out['r2'][0]==3 and out['r2'][1]==0 and list(out['best_after_practice'].values())[0]['s']==2, "practice round doesn't become the best", (out['r2'], out['best_after_practice']))
    check(out['r3'][0]==3 and out['r3'][1]==1 and '🔥 x4' in out['r3'][2], 'perfect round: 3 stars, 🏆 new best, combo x4', out['r3'])
    check(out['home_stars'].startswith('★★★') and out['card_stars'].startswith('★★★'), 'best stars on the scene cards', (out['home_stars'], out['card_stars']))
    check('หีบเงิน' in out['chest1'] and ('ใหม่' in out['reveal']) and sum(out['stk'].values())==1, '2 stars → silver chest → a new sticker', (out['chest1'], out['reveal'], out['stk']))
    check(out['r2'][2]==0 and 'หีบทอง' in out['r3'][3], 'no chest for a practice round; 3 stars → gold chest', (out['r2'], out['r3'][3]))
    check(sum(out['golds'])>=1 and int(out['bonus'] or 0)>=2, '✨ golden word shown and gave bonus XP', (out['golds'], out['bonus']))
    check(len(out['quests'])==3 and 'ภารกิจวันนี้' in out['qtile'], "today's 3 quests", (out['qtile'], out['quests']))
    check('null' not in out['quest_text'] and 'null' not in out['quest_text2'], 'no stray "null" in the quests panel', (out['quest_text'], out['quest_text2']))
    check(out['stk2']==2 and out['got']>=1 and '/48' in out['book'], 'chest from the quests panel; sticker book', (out['stk2'], out['book'], out['got']))
    finish('round stars', out, errs)
asyncio.run(main())
