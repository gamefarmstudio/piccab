"""Home on a phone: icon-only bottom bar, stat chips, the mode sheet, and English menus with no Thai left."""
import asyncio, re
from playwright.async_api import async_playwright
from common import *
SEED = """localStorage.setItem('pv-recent', JSON.stringify({tea: Date.now()-3600e3}));
localStorage.setItem('pv-lastmode', JSON.stringify({tea:'quiz'}));
localStorage.setItem('pv-progress', JSON.stringify({tea:{done:{teapot:true, macaron:true}, star:{macaron:true}}}));"""
async def main():
    out={}; errs=[]; left=set()
    async with async_playwright() as p:
        b=await launch(p)
        async def page(ui=None):
            ctx=await b.new_context(locale='th-TH', viewport={'width':390,'height':844}, is_mobile=True, has_touch=True, service_workers='block')
            await ctx.add_init_script(SEED + (f"localStorage.setItem('pv-ui', JSON.stringify('{ui}'));" if ui else ''))
            pg=await ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
            await pg.route('**/*', lambda r: app_route(r)); await pg.goto('https://piccab.test/app'); await pg.wait_for_timeout(700)
            return pg
        pg=await page()
        out['nav']=await pg.evaluate("[...document.querySelectorAll('#bnav button')].map(b=>[b.getAttribute('aria-label'), b.innerText.trim(), b.classList.contains('on')])")
        out['dot']=await pg.evaluate("getComputedStyle(document.querySelector('#bnav button.on'),'::after').backgroundColor")
        out['chips']=await pg.evaluate("[...document.querySelectorAll('.hello .chip')].map(c=>[c.innerText.trim(), c.getAttribute('aria-label')])")
        out['streak']=await pg.locator('#streakPill').get_attribute('aria-label')
        out['pill']=await pg.locator('#galleryBar .langpill').inner_text()
        out['button']=(await pg.locator('.cont .primary.big').inner_text()).strip()
        out['pct']=(await pg.locator('.cont .pct').inner_text()).strip()
        out['card_labels']=await pg.locator('.cont .cimg').inner_text()
        # pills sit inside the picture and fit their words
        out['pills_fit']=await pg.evaluate("""[...document.querySelectorAll('.cont .cimg g')].every(g=>{ const r=g.querySelector('rect').getBBox(), t=g.querySelector('text').getBBox(); return t.x>=r.x-0.5 && t.x+t.width<=r.x+r.width+0.5; })""")
        await pg.screenshot(path=shot('cozy1_home.png'), full_page=True)
        await pg.click('.cont .icbtn'); await pg.wait_for_timeout(200)
        out['sheet']=await pg.evaluate("[...document.querySelectorAll('.mopt')].map(b=>[b.dataset.mode, b.classList.contains('on')])")
        await pg.screenshot(path=shot('cozy2_modes.png'))
        await pg.click('.mopt[data-mode=find]'); await pg.wait_for_timeout(400)
        out['opened']=await pg.evaluate("[document.getElementById('playView').hidden?'home':'play', (document.querySelector('#modes button.on')||{dataset:{}}).dataset.mode]")
        await pg.context.close()
        # English menus: nothing Thai on home, in the sheet, or in labels
        pg=await page('en')
        left.update(await pg.evaluate(THAI_LEFT))
        out['en_button']=(await pg.locator('.cont .primary.big').inner_text()).strip()
        out['en_nav']=await pg.evaluate("[...document.querySelectorAll('#bnav button')].map(b=>b.getAttribute('aria-label'))")
        await pg.click('.cont .icbtn'); await pg.wait_for_timeout(300)
        left.update(await pg.evaluate(THAI_LEFT))
        out['en_sheet']=await pg.locator('#mbox').inner_text()
        await pg.screenshot(path=shot('cozy3_en_modes.png'))
        await pg.context.close()
        await b.close()
    out['thai_left']=sorted(left)
    check([n[0] for n in out['nav']]==['หน้าแรก','คลังฉาก','สร้างฉากจากรูป','คำของฉัน','ห้องเรียน'] and all(n[1]=='' for n in out['nav']), 'bottom bar is icons with labels for screen readers', out['nav'])
    check(out['nav'][0][2] and out['dot'] not in ('rgba(0, 0, 0, 0)','transparent'), 'home is marked with a dot', (out['nav'][0], out['dot']))
    check([c[0] for c in out['chips']]==['0','2','1'] and out['chips'][1][1]=='ผ่านแล้ว 2 คำ', 'stat chips: numbers with labels', out['chips'])
    check(out['streak']=='0 วันติดกัน', 'streak pill label', out['streak'])
    check(out['pill']=='🇬🇧', 'language pill is just the flag on a phone', out['pill'])
    check(out['button']=='ฝึกต่อ' and out['pct']=='8%', 'continue card', (out['button'], out['pct']))
    check('macaron' in out['card_labels'] and out['pills_fit'], 'word pills fit on the picture', (out['card_labels'], out['pills_fit']))
    check(out['sheet']==[['learn',False],['quiz',True],['find',False],['speak',False]], 'mode sheet: 4 modes, last one marked', out['sheet'])
    check(out['opened']==['play','find'], 'picking a mode opens the scene', out['opened'])
    check(out['en_button']=='Continue' and out['en_nav'][0]=='Home' and 'Listen, then tap the right one' in out['en_sheet'], 'English home and sheet', (out['en_button'], out['en_nav'], out['en_sheet']))
    check(out['thai_left']==[], 'no Thai left in English', out['thai_left'])
    finish('cozy home', out, errs)
asyncio.run(main())
