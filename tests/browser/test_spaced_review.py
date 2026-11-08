import asyncio, json, time, re
from playwright.async_api import async_playwright
from common import *
async def route(r):
    u=r.request.url
    if u.endswith('/vendor/supabase-2.119.0.js'): return await r.fulfill(status=200, content_type='application/javascript', body=SBJS)
    if u.endswith('/api/health'): return await r.fulfill(status=200, content_type='application/json', body='{"ai":false}')
    if 'supabase.co' in u: return await r.fulfill(status=404, body='{}')
    return await r.fulfill(status=200, content_type='text/html', body=HTML)
DAY=86400000
def today():
    t=time.time()*1000; off=-time.localtime().tm_gmtoff*1000 if False else 0
    return None
async def main():
    out={}; errs=[]
    async with async_playwright() as p:
        b=await launch(p)
        async def page(seed, w=1200, h=900, mobile=False):
            ctx=await b.new_context(locale='th-TH', viewport={'width':w,'height':h}, is_mobile=mobile, has_touch=mobile, service_workers='block', timezone_id='Asia/Bangkok')
            if seed is not None: await ctx.add_init_script("localStorage.setItem('pv-progress', JSON.stringify(("+seed+")()))")
            pg=await ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
            await pg.route('**/*', route); await pg.goto('https://piccab.test/'); await pg.wait_for_timeout(500)
            return pg
        TD="Math.floor((Date.now()-new Date().getTimezoneOffset()*60000)/86400000)"
        # 1) nothing learned → explains how words get in
        pg=await page(None)
        out['idle']=await pg.locator('.tile.srs').inner_text()
        await pg.context.close()
        # 2) mix: 4 due (2 legacy true from 10 days ago, 2 past-due objects), 2 later, 1 tomorrow, rest todo
        seed=f"""()=>{{ const T={TD}; return {{tea:{{updatedAt:Date.now()-10*86400000, star:{{macaron:true}}, done:{{
          'macaron':true, 'sponge-cake':true, 'shortbread':{{b:2,d:T-1}}, 'cake-stand':{{b:3,d:T}},
          'lemon-drizzle-cake':{{b:2,d:T+3}}, 'teapot':{{b:1,d:T+1}} }} }} }}; }}"""
        pg=await page(seed)
        out['tile']=await pg.locator('.tile.srs').inner_text()
        out['tile_label']=await pg.locator('.tile.srs').get_attribute('aria-label')
        out['tile_cls']=await pg.locator('.tile.srs').get_attribute('class')
        await pg.screenshot(path=shot('srs1_home.png'))
        # words page: filter + labels
        await pg.click('.mainnav button[data-view=words]'); await pg.wait_for_timeout(300)
        out['filters']=await pg.locator('#wdFilters').inner_text()
        await pg.click('#wdFilters button[data-f=due]'); await pg.wait_for_timeout(200)
        out['due_cards']=await pg.locator('#wdGrid .wd-card b').all_inner_texts()
        out['due_labels']=list(set(await pg.locator('#wdGrid .wd-next').all_inner_texts()))
        await pg.click('#wdFilters button[data-f=all]'); await pg.wait_for_timeout(200)
        out['labels_all']=sorted(set(await pg.locator('#wdGrid .wd-next').all_inner_texts()))
        await pg.screenshot(path=shot('srs2_words.png'), full_page=False)
        # 3) start today's review from home: answer each with "ดูเฉลย" (needs help) except we type the word right away when we can guess
        await pg.click('.mainnav button[data-view=home]'); await pg.wait_for_timeout(300)
        await pg.click('.tile.srs.due'); await pg.wait_for_timeout(300)
        out['rv_title']=await pg.locator('.rv-top h3').inner_text()
        out['rv_n']=await pg.locator('.rv-n').inner_text()
        answered=[]
        for i in range(4):
            await pg.click('.rv-tools button:has-text("ดูเฉลย")'); await pg.wait_for_timeout(100)
            msg=await pg.locator('#rvMsg').inner_text(); word=re.search(r'เฉลย: (.+?) —',msg).group(1)
            await pg.fill('#rvIn', word); await pg.press('#rvIn','Enter'); await pg.wait_for_timeout(1500)
            answered.append(word)
        out['answered']=answered
        out['end']=await pg.locator('.rv-end').inner_text()
        await pg.screenshot(path=shot('srs3_end.png'))
        prog=await pg.evaluate("JSON.parse(localStorage.getItem('pv-progress')).tea.done")
        T=await pg.evaluate(TD)
        out['after']={k:(v if v is True else [v['b'],v['d']-T]) for k,v in prog.items()}
        await pg.click('.rv-end button:has-text("ปิด")'); await pg.wait_for_timeout(300)
        out['tile_after']=await pg.locator('.tile.srs').inner_text()
        out['streak_today']=await pg.locator('#streakPill').get_attribute('aria-label')
        await pg.context.close()
        # 4) scene quiz on a due word: clean answer moves it up (type the right word into the quiz card)
        seed2=f"""()=>{{ const T={TD}; return {{tea:{{updatedAt:Date.now(), star:{{}}, done:{{'macaron':{{b:2,d:T}} }} }} }}; }}"""
        pg=await page(seed2)
        await pg.evaluate("localStorage.setItem('pv-scene','tea')")
        await pg.click('.tile.srs.due'); await pg.wait_for_timeout(300)
        await pg.fill('#rvIn','macaron'); await pg.press('#rvIn','Enter'); await pg.wait_for_timeout(1500)
        v=await pg.evaluate("JSON.parse(localStorage.getItem('pv-progress')).tea.done.macaron"); T=await pg.evaluate(TD)
        out['clean']=[v['b'], v['d']-T]
        out['end2']=await pg.locator('.rv-end').inner_text()
        await pg.context.close()
        # 5) wrong try first → counts as hard
        pg=await page(seed2)
        await pg.click('.tile.srs.due'); await pg.wait_for_timeout(300)
        await pg.fill('#rvIn','muffin'); await pg.press('#rvIn','Enter'); await pg.wait_for_timeout(200)
        await pg.fill('#rvIn','macaron'); await pg.press('#rvIn','Enter'); await pg.wait_for_timeout(1500)
        v=await pg.evaluate("JSON.parse(localStorage.getItem('pv-progress')).tea.done.macaron"); T=await pg.evaluate(TD)
        out['after_wrong']=[v['b'], v['d']-T]
        await pg.context.close()
        # 6) phone: tile layout
        pg=await page(seed, 390, 844, True)
        await pg.screenshot(path=shot('srs4_phone.png'))
        out['phone_tile']=await pg.locator('.tile.srs').bounding_box()
        await pg.context.close()
        await b.close()
    check('ทบทวนตามรอบ' in out['idle'], 'idle tile explains spaced review', out['idle'])
    check(out['tile_label']=='คำที่ต้องทบทวนวันนี้ 4 คำ' and re.search(r'ทบทวนด่วน\s*4', out['tile']) and 'due' in out['tile_cls'], 'home shows 4 words due', (out['tile'], out['tile_label'], out['tile_cls']))
    check('ถึงรอบ4' in out['filters'].replace('\n',''), 'My words has a Due filter', out['filters'])
    check(len(out['due_cards'])==4 and out['due_labels']==['🔁 ถึงรอบทบทวน'], 'due words listed', (out['due_cards'], out['due_labels']))
    check(out['rv_n']=='1/4' and 'ตอบถูก 4/4' in out['end'], 'review round of 4 finishes', (out['rv_n'], out['end']))
    check('ทบทวนครบ' in out['tile_after'], 'tile says done for today', out['tile_after'])
    check('1 วันติดกัน' in out['streak_today'], 'streak counts today', out['streak_today'])
    check(out['after_wrong']==[1,1], 'a wrong answer brings the word back sooner', out['after_wrong'])
    check(out['phone_tile'] and out['phone_tile']['width']>300, 'tile fits the phone', out['phone_tile'])
    finish('spaced review', out, errs)
asyncio.run(main())
