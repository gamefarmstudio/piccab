# 🧩 Match: from a scene's preview, tap a word then its picture (or meaning); a wrong pair adds 1 second.
# 6 pairs a round; the best time per set is kept (pv-matchbest), stars / XP / a chest at the end, the day counts it.
# A word set without pictures can only be played word ↔ meaning.
import asyncio, json, base64
from playwright.async_api import async_playwright
from common import *

SEED = """(img)=>{ const it={}; const W=['cat','sofa','lamp','rug','clock','plant','book','cup','vase','fan'], T=['แมว','โซฟา','โคมไฟ','พรม','นาฬิกา','ต้นไม้','หนังสือ','ถ้วย','แจกัน','พัดลม'];
  W.forEach((w,i)=>{ it['a'+i]={word:w,th:T[i],alts:[],x:40+(i%5)*220,y:60+Math.floor(i/5)*400,w:180,h:300}; });
  localStorage.setItem('pv-scenes2',JSON.stringify([{id:'s1mt',name:'My room',w:1200,h:900,img,items:it}])); localStorage.setItem('pv-scene','s1mt'); }"""

async def play_all(pg, wrong_first=True):
    """match every pair (one wrong pair first, if asked)"""
    if wrong_first:
        await pg.click('.mttile.w[data-p="0"]'); await pg.click('.mttile:not(.w)[data-p="1"]'); await pg.wait_for_timeout(120)
    n = await pg.locator('.mttile.w').count()
    for i in range(n):
        await pg.click(f'.mttile.w[data-p="{i}"]'); await pg.click(f'.mttile:not(.w)[data-p="{i}"]'); await pg.wait_for_timeout(60)
    await pg.wait_for_timeout(900)

async def main():
    out = {}; errs = []
    img = 'data:image/jpeg;base64,' + base64.b64encode(open(PHOTO, 'rb').read()).decode()
    async with async_playwright() as p:
        b = await launch(p)
        ctx = await b.new_context(locale='th-TH', viewport={'width': 390, 'height': 800}, service_workers='block')
        pg = await ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.route('**/*', lambda r: app_route(r)); await pg.goto('https://piccab.test/app'); await pg.wait_for_timeout(500)
        await pg.evaluate(SEED, img); await pg.reload(); await pg.wait_for_timeout(700)
        await pg.click('#bnav [data-view=library]'); await pg.wait_for_timeout(300)
        await pg.locator('#libList .lcard:has-text("My room")').click(); await pg.wait_for_timeout(400)
        out['btn'] = await pg.locator('#mbox .mtbtn').count()
        await pg.click('#mbox .mtbtn'); await pg.wait_for_timeout(900)
        out['start'] = await pg.inner_text('#mbox')
        out['kinds_on'] = await pg.locator('.mtkind button:not([disabled])').count()
        out['kind_sel'] = await pg.get_attribute('.mtkind button.on', 'data-k')
        await pg.screenshot(path=shot('match_start.png'))
        await pg.click('.mtgo'); await pg.wait_for_timeout(300)
        out['tiles'] = await pg.locator('.mttile').count()
        out['words'] = await pg.locator('.mttile.w').count(); out['pics'] = await pg.locator('.mttile.pic img').count()
        out['left0'] = await pg.inner_text('.mtleft')
        await pg.screenshot(path=shot('match_board.png'))
        # a wrong pair: both shake, +1 second on the clock
        await pg.click('.mttile.w[data-p="0"]'); out['sel'] = await pg.locator('.mttile.on').count()
        await pg.click('.mttile:not(.w)[data-p="1"]'); await pg.wait_for_timeout(100)
        out['bad'] = await pg.locator('.mttile.bad').count(); out['pen'] = await pg.locator('.mtpen').count()
        await pg.wait_for_timeout(500)
        # tapping the same tile again lets go; two words in a row: the second one is chosen
        await pg.click('.mttile.w[data-p="2"]'); await pg.click('.mttile.w[data-p="2"]'); out['letgo'] = await pg.locator('.mttile.on').count()
        await pg.click('.mttile.w[data-p="2"]'); await pg.click('.mttile.w[data-p="3"]'); out['switch'] = await pg.get_attribute('.mttile.on', 'data-p')
        await pg.click('.mttile.w[data-p="3"]')
        # a right pair goes away
        await pg.click('.mttile.w[data-p="4"]'); await pg.click('.mttile:not(.w)[data-p="4"]'); await pg.wait_for_timeout(700)
        out['gone'] = await pg.locator('.mttile.gone').count(); out['left1'] = await pg.inner_text('.mtleft')
        for i in [0, 1, 2, 3, 5]:
            await pg.click(f'.mttile.w[data-p="{i}"]'); await pg.click(f'.mttile:not(.w)[data-p="{i}"]'); await pg.wait_for_timeout(60)
        await pg.wait_for_timeout(1000)
        out['end'] = await pg.inner_text('#mbox')
        out['end_stars'] = await pg.locator('#mbox .rdstar.on').count()
        await pg.screenshot(path=shot('match_end.png'))
        out['best'] = await pg.evaluate("JSON.parse(localStorage.getItem('pv-matchbest')||'{}')")
        out['days'] = await pg.evaluate("Object.values(JSON.parse(localStorage.getItem('pv-days')||'{}')).map(d=>d.m&&d.m.match||0)")
        out['rbest'] = await pg.evaluate("Object.keys(JSON.parse(localStorage.getItem('pv-best')||'{}'))")
        # 🔁 again: a new board straight away
        await pg.click('#mbox button:has-text("เล่นอีกรอบ")'); await pg.wait_for_timeout(300)
        out['again_tiles'] = await pg.locator('.mttile').count()
        await pg.click('#mbox .mthead .x'); await pg.wait_for_timeout(200)
        out['closed'] = await pg.locator('#modal').is_hidden()
        # the best time shows on the start screen; word ↔ meaning
        await pg.locator('#libList .lcard:has-text("My room")').click(); await pg.wait_for_timeout(400)
        await pg.click('#mbox .mtbtn'); await pg.wait_for_timeout(900)
        out['best_line'] = await pg.inner_text('.mtbest')
        await pg.click('.mtkind button[data-k=mean]'); out['best_mean'] = await pg.inner_text('.mtbest')
        await pg.click('.mtgo'); await pg.wait_for_timeout(300)
        out['means'] = await pg.locator('.mttile.mean').all_inner_texts()
        await play_all(pg, wrong_first=False)
        out['end2_stars'] = await pg.locator('#mbox .rdstar.on').count()
        out['best2'] = await pg.evaluate("Object.keys(JSON.parse(localStorage.getItem('pv-matchbest')||'{}')).sort()")
        out['kind_kept'] = await pg.evaluate("localStorage.getItem('pv-match-kind')")
        for _ in range(4):   # the end, then maybe a new badge / level
            if await pg.locator('#modal:not([hidden])').count(): await pg.evaluate("document.querySelector('#modal').click()"); await pg.wait_for_timeout(250)
        out['modal_left'] = await pg.locator('#modal:not([hidden])').count()
        # a word set with no pictures: word ↔ meaning only
        await open_set_maker(pg)
        await paste_words(pg, 'apple แอปเปิล\nbanana กล้วย\ncherry เชอร์รี่\ngrape องุ่น', replace=True)
        await pg.click('.wsbox .row .primary'); await pg.wait_for_timeout(1500)
        if await pg.locator('#modal:not([hidden])').count(): await pg.keyboard.press('Escape'); await pg.wait_for_timeout(200)
        await pg.evaluate("document.querySelector('#bnav [data-view=class]').click()"); await pg.wait_for_timeout(400)
        await pg.locator('.setrow').first.click(); await pg.wait_for_timeout(400)
        await pg.click('#mbox .mtbtn'); await pg.wait_for_timeout(600)
        out['set_pic_disabled'] = await pg.locator('.mtkind button[data-k=pic][disabled]').count()
        out['set_kind'] = await pg.get_attribute('.mtkind button.on', 'data-k')
        await pg.click('.mtgo'); await pg.wait_for_timeout(300)
        out['set_tiles'] = await pg.locator('.mttile').count()
        await pg.screenshot(path=shot('match_set.png'))
        await b.close()
    check(out['btn'] == 1 and 'จับคู่' in out['start'] and out['kinds_on'] == 2 and out['kind_sel'] == 'pic' and 'ยังไม่เคยเล่น' in out['start'], 'start: 🧩 in the preview, word ↔ picture or meaning, no best yet', out)
    check(out['tiles'] == 12 and out['words'] == 6 and out['pics'] == 6 and out['left0'] == 'เหลือ 6 คู่', '6 pairs: 6 words and 6 pictures', (out['tiles'], out['words'], out['pics'], out['left0']))
    check(out['sel'] == 1 and out['bad'] == 2 and out['pen'] == 1, 'a wrong pair shakes both, +1 second', (out['sel'], out['bad'], out['pen']))
    check(out['letgo'] == 0 and out['switch'] == '3', 'tap again to let go; another word is chosen instead', (out['letgo'], out['switch']))
    check(out['gone'] == 2 and out['left1'] == 'เหลือ 5 คู่', 'a right pair disappears', (out['gone'], out['left1']))
    check('วินาที' in out['end'] and 'จับถูกตั้งแต่ครั้งแรก' in out['end'] and '4/6' in out['end'] and out['end_stars'] == 2, 'the end: the time, 4/6 right first time, 2 stars', (out['end'], out['end_stars']))
    check(list(out['best'].keys()) == ['s1mt|pic|en'] and 1000 <= list(out['best'].values())[0] < 30000, 'the best time is kept, with the penalty second', out['best'])
    check(sum(out['days']) == 6 and 's1mt|match|en' in out['rbest'], 'the day counts 6 matches; the stars go with the scene', (out['days'], out['rbest']))
    check(out['again_tiles'] == 12 and out['closed'], 'play again: a new board; ✕ closes', (out['again_tiles'], out['closed']))
    check(out['best_line'].startswith('🏆 เร็วที่สุด') and 'ยังไม่เคยเล่น' in out['best_mean'], 'the start shows the best time per kind', (out['best_line'], out['best_mean']))
    check(len(out['means']) == 6 and all(any('฀' <= ch <= '๿' for ch in t) for t in out['means']) and out['end2_stars'] == 3, 'word ↔ meaning: Thai meanings; all right → 3 stars', (out['means'], out['end2_stars']))
    check(out['best2'] == ['s1mt|mean|en', 's1mt|pic|en'] and out['kind_kept'] == '"mean"', 'a best time for each kind; the last kind is remembered', (out['best2'], out['kind_kept']))
    check(out['set_pic_disabled'] == 1 and out['set_kind'] == 'mean' and out['set_tiles'] == 8, 'a set without pictures: meaning only, 4 pairs', (out['set_pic_disabled'], out['set_kind'], out['set_tiles']))
    finish('test_match', out, errs)

asyncio.run(main())
