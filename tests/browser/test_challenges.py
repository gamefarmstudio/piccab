# ⚔️ Challenges in listen & find: ⏱️ 60 seconds (a wrong tap costs 3 s; ends with a round card), ❤️ 3 hearts
# (three wrong taps = game over), and 👾 the boss after a round: type the most-missed word.
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
        await pg.clock.install(); await pg.clock.resume()
        await pg.route('**/*', lambda r: app_route(r)); await pg.goto('https://piccab.test/app'); await pg.wait_for_timeout(500)
        await pg.evaluate("""(img)=>{ const it={}; ['cat','sofa','lamp','rug'].forEach((w,i)=>{ it['a'+i]={word:w,th:'',alts:[],x:60+i*270,y:200,w:200,h:300}; });
          localStorage.setItem('pv-scenes2',JSON.stringify([{id:'s1c',name:'My room',w:1200,h:900,img,items:it}])); localStorage.setItem('pv-scene','s1c');
          localStorage.setItem('pv-recent',JSON.stringify({s1c:Date.now()})); }""", img)
        await pg.reload(); await pg.wait_for_timeout(700)
        await pg.click('.cont .icbtn'); await pg.wait_for_timeout(200); await pg.click('.mopt[data-mode=find]'); await pg.wait_for_timeout(500)
        await pg.click('#sub button:has-text("แสดงคำ")'); await pg.wait_for_timeout(100)
        async def target(): return W.index(await pg.inner_text('#sub .target'))
        async def tap(i, wait=1250): await pg.locator(f'#scene .item[data-id="a{i}"]').first.dispatch_event('click'); await pg.wait_for_timeout(wait)
        # ⏱️ 60 seconds
        await pg.click('#sub .chbtn'); await pg.wait_for_timeout(200)
        out['opts']=await pg.locator('.chopt b').all_inner_texts()
        await pg.click('.chopt:has-text("แข่งกับเวลา")'); await pg.wait_for_timeout(400)
        out['t0']=await pg.inner_text('#chTime b')
        for k in range(5): await tap(await target())            # goes round again after 4
        i=await target(); await tap((i+1)%4, 300)                # wrong: −3 s
        out['t1']=await pg.inner_text('#chTime b')
        await pg.screenshot(path=shot('ch1_time.png'))
        await pg.clock.fast_forward(60000); await pg.wait_for_timeout(1700)
        out['time_end']=[await pg.inner_text('.rdend h3'), await pg.inner_text('.rdstats')]
        out['timebest']=await pg.evaluate("localStorage.getItem('pv-timebest')")
        await pg.click('.rdend .row button:text-is("ปิด")'); await pg.wait_for_timeout(300)
        # ❤️ 3 hearts: three wrong taps → game over
        await pg.click('#sub .chx'); await pg.wait_for_timeout(300); await pg.click('#sub .chbtn'); await pg.wait_for_timeout(200)
        await pg.click('.chopt:has-text("3 หัวใจ")'); await pg.wait_for_timeout(400)
        out['h0']=await pg.get_attribute('#sub .chhearts','aria-label')
        for k in range(3):
            i=await target(); await tap((i+1)%4, 300)
        out['over']=await pg.inner_text('#mbox')
        await pg.screenshot(path=shot('ch2_hearts.png'))
        await pg.click('#mbox button:has-text("ลองใหม่")'); await pg.wait_for_timeout(400)
        # a hearts round with one miss, then the boss is that word
        i=await target(); await tap((i+1)%4, 300); boss=W[i]; await tap(i)
        for k in range(3): await tap(await target())
        await pg.wait_for_selector('.rdend', timeout=4000); await pg.wait_for_timeout(1500)
        out['hearts_end']=await pg.inner_text('.rdend h3')
        await pg.click('.rdend .bossbtn'); await pg.wait_for_timeout(600)
        out['boss']=[await pg.inner_text('.bossend h3'), await pg.inner_text('.bosshint'), await pg.locator('.bosspic img').count()]
        await pg.fill('.bossend input','zzz'); await pg.press('.bossend input','Enter'); await pg.wait_for_timeout(300)
        out['boss_miss']=[await pg.get_attribute('.bosshp','aria-label'), await pg.inner_text('.bosshint')]
        await pg.screenshot(path=shot('ch3_boss.png'))
        await pg.fill('.bossend input', boss); await pg.press('.bossend input','Enter'); await pg.wait_for_timeout(800)
        out['boss_win']=[await pg.inner_text('.bossend .msg'), await pg.locator('.bossend .chest').count(), await pg.evaluate("localStorage.getItem('pv-boss')")]
        await pg.screenshot(path=shot('ch4_boss_win.png'))
        out['boss_word']=boss
        await b.close()
    check(out['opts']==['ปกติ','แข่งกับเวลา','3 หัวใจ'], 'challenge choices', out['opts'])
    check(out['t0'] in ('60 วิ','59 วิ') and int(out['t1'].split()[0])<=55, 'clock runs; a wrong tap costs 3 s', (out['t0'], out['t1']))
    check('หมดเวลา! หาได้ 5 คำ' in out['time_end'][0] and '5 คำ' in out['time_end'][1] and out['timebest']=='5', 'time up → round card, best kept', (out['time_end'], out['timebest']))
    check(out['h0']=='เหลือ 3 หัวใจ' and 'หัวใจหมดแล้ว' in out['over'], '3 wrong taps → out of hearts', (out['h0'], out['over']))
    check('ผ่านด่าน' in out['hearts_end'] and 'เหลือหัวใจ 2 ดวง' in out['hearts_end'], 'hearts round cleared with 2 left', out['hearts_end'])
    check('บอส' in out['boss'][0] and out['boss'][1].startswith(out['boss_word'][0]) and out['boss'][2]==1, 'boss = the missed word, with its picture', (out['boss'], out['boss_word']))
    check(out['boss_miss'][0]=='เหลือ 2 หัวใจ' and out['boss_miss'][1].replace(' ','').startswith(out['boss_word'][:2]), 'a wrong try costs a heart and shows another letter', out['boss_miss'])
    check('ปราบบอสสำเร็จ' in out['boss_win'][0] and out['boss_win'][1]==1 and out['boss_win'][2]=='1', 'boss beaten: chest and count', out['boss_win'])
    finish('challenges', out, errs)
asyncio.run(main())
