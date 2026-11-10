import asyncio, json
from playwright.async_api import async_playwright
from common import *
IMG=PHOTO
async def route(r):
    u=r.request.url
    if u.endswith('/vendor/supabase-2.119.0.js'): return await r.fulfill(status=200, content_type='application/javascript', body=SBJS)
    if u.endswith('/api/health'): return await r.fulfill(status=200, content_type='application/json', body='{"ai":false}')
    if 'supabase.co' in u: return await r.fulfill(status=404, body='{}')
    return await page_or_built(r)

async def touch_drag(pg, cdp, x0,y0,x1,y1, steps=8):
    await cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x0,'y':y0}]})
    for i in range(1,steps+1):
        await cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':x0+(x1-x0)*i/steps,'y':y0+(y1-y0)*i/steps}]})
        await pg.wait_for_timeout(16)
    await cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})

async def items(pg):
    return await pg.evaluate("(()=>{ const a=JSON.parse(localStorage.getItem('pv-scenes2')||'[]'); const sc=a[a.length-1]||{}; return Object.values(sc.items||{}).map(i=>[i.word,i.x,i.y,i.w,i.h]); })()")

async def main():
    out={}; errs=[]
    async with async_playwright() as p:
        b=await launch(p)
        ctx=await b.new_context(locale='th-TH', viewport={'width':390,'height':844}, is_mobile=True, has_touch=True, device_scale_factor=2, service_workers='block')
        pg=await ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.route('**/*', route); await pg.goto('https://piccab.test/'); await pg.wait_for_timeout(500)
        cdp=await ctx.new_cdp_session(pg)
        await pg.set_input_files('#fileImg', IMG); await pg.wait_for_timeout(900)
        out['editing']=await pg.evaluate("document.body.classList.contains('editing')")
        out['first_btn']=await pg.locator('#sub button').first.inner_text()
        sb=await pg.locator('#scene').bounding_box()
        X=lambda f: sb['x']+sb['width']*f; Y=lambda f: sb['y']+sb['height']*f
        await pg.evaluate("window.scrollTo(0,0)"); sb=await pg.locator('#scene').bounding_box()
        # 1) big box on empty picture (old gesture still works)
        sb.update(await pg.locator('#scene').bounding_box())
        await touch_drag(pg,cdp, X(.1),Y(.3), X(.9),Y(.8)); await pg.wait_for_timeout(400)
        out['form1']=await pg.locator('.mbox h3').inner_text()
        await pg.fill('.mbox input.word','counter'); await pg.click('.mbox button.primary'); await pg.wait_for_timeout(400)
        out['after1']=await items(pg)
        # 2) without draw mode, dragging inside the big box moves it (unchanged behaviour)
        await pg.click('.selbar button[aria-label="ยกเลิกการเลือก"]'); await pg.wait_for_timeout(200)
        before=await items(pg)
        sb.update(await pg.locator('#scene').bounding_box())
        await touch_drag(pg,cdp, X(.4),Y(.5), X(.45),Y(.55)); await pg.wait_for_timeout(300)
        moved=await items(pg)
        out['drag_moves_box']=before[0][1:3]!=moved[0][1:3] and len(moved)==1
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(150)
        # 3) ➕ draw mode: a new small box inside the big one
        await pg.click('#sub button.drawbtn'); await pg.wait_for_timeout(1300)
        out['scene_top_visible']=await pg.evaluate("document.getElementById('scene').getBoundingClientRect().top>=-1")
        out['mode_on']=(await pg.evaluate("document.body.classList.contains('drawmode')"), await pg.locator('#sub button.drawbtn').inner_text(), await pg.locator('.drawhint span').inner_text())
        await pg.screenshot(path=shot('dw1_mode.png'))
        big=await items(pg)
        sb.update(await pg.locator('#scene').bounding_box())
        await touch_drag(pg,cdp, X(.45),Y(.5), X(.6),Y(.62)); await pg.wait_for_timeout(400)
        out['form2']=await pg.locator('.mbox h3').inner_text()
        out['mode_off_after_draw']=not await pg.evaluate("document.body.classList.contains('drawmode')")
        await pg.fill('.mbox input.word','cup'); await pg.fill('.mbox label:nth-of-type(2) input','แก้ว'); await pg.click('.mbox button.primary'); await pg.wait_for_timeout(400)
        after=await items(pg)
        out['two_items']=sorted(i[0] for i in after)
        out['big_unchanged']=[i for i in after if i[0]=='counter'][0]==big[0]
        cup=[i for i in after if i[0]=='cup'][0]; c=big[0]
        out['cup_inside']=c[1]<=cup[1] and cup[1]+cup[3]<=c[1]+c[3] and c[2]<=cup[2] and cup[2]+cup[4]<=c[2]+c[4]
        await pg.screenshot(path=shot('dw2_cup.png'))
        # 4) cancel: drawn then cancel form → no item, draft gone
        await pg.evaluate("window.__pd=[]; ['pointerdown','pointerup','pointercancel','touchstart'].forEach(t=>document.addEventListener(t,e=>__pd.push([t,(e.target.id||e.target.className&&e.target.className.baseVal||e.target.className||e.target.tagName)+'',Math.round(e.clientX||0),Math.round(e.clientY||0)]),true))")
        await pg.click('#sub button.drawbtn'); await pg.wait_for_timeout(1300)
        sb.update(await pg.locator('#scene').bounding_box())
        await touch_drag(pg,cdp, X(.2),Y(.35), X(.3),Y(.45)); await pg.wait_for_timeout(300)
        out['pd']=await pg.evaluate("window.__pd")
        out['dbg4']=await pg.evaluate("({dm:document.body.classList.contains('drawmode'), modal:!document.getElementById('modal').hidden, h3:(document.querySelector('.mbox h3')||{}).textContent, toast:document.getElementById('toast').textContent, sy:scrollY})")
        await pg.screenshot(path=shot('dw_dbg.png'))
        if out['dbg4']['modal']: await pg.click('.mbox button:has-text("ยกเลิก")'); await pg.wait_for_timeout(200)
        out['cancel']=(len(await items(pg)), await pg.evaluate("document.querySelectorAll('#scene rect.draft').length"))
        # 5) tiny tap in draw mode keeps the mode and explains
        await pg.click('#sub button.drawbtn'); await pg.wait_for_timeout(1300)
        sb.update(await pg.locator('#scene').bounding_box())
        await touch_drag(pg,cdp, X(.5),Y(.4), X(.501),Y(.401), 1); await pg.wait_for_timeout(300)
        out['tiny']=(await pg.evaluate("document.body.classList.contains('drawmode')"), await pg.locator('#toast').inner_text())
        # banner cancel button / Esc
        out['dbg5']=await pg.evaluate("({dm:document.body.classList.contains('drawmode'), hint:document.querySelectorAll('.drawhint').length, ov:document.querySelector('.drawhint')&&document.querySelector('.drawhint').getBoundingClientRect().toJSON()})")
        if not out['dbg5']['hint']: print(out)
        await pg.click('.drawhint button', timeout=3000); await pg.wait_for_timeout(200)
        out['banner_cancel']=not await pg.evaluate("document.body.classList.contains('drawmode')")
        await pg.click('#sub button.drawbtn'); await pg.wait_for_timeout(150); await pg.keyboard.press('Escape'); await pg.wait_for_timeout(150)
        out['esc_cancel']=not await pg.evaluate("document.body.classList.contains('drawmode')")
        # 6) done → leaves edit; draw mode off; learn shows both words
        await pg.click('#sub button.drawbtn'); await pg.wait_for_timeout(150)
        await pg.click('#sub button.primary:has-text("เสร็จแล้ว")'); await pg.wait_for_timeout(300)
        out['after_done']=(await pg.evaluate("document.body.classList.contains('editing')"), await pg.evaluate("document.body.classList.contains('drawmode')"))
        await pg.screenshot(path=shot('dw3_done.png'))
        # desktop: mouse
        d=await b.new_page(locale='th-TH', viewport={'width':1280,'height':900}); d.on('pageerror', lambda e: errs.append(str(e)))
        await d.route('**/*', route); await d.goto('https://piccab.test/'); await d.wait_for_timeout(400)
        await d.set_input_files('#fileImg', IMG); await d.wait_for_timeout(800)
        sb=await d.locator('#scene').bounding_box()
        await d.mouse.move(sb['x']+sb['width']*.1, sb['y']+sb['height']*.2); await d.mouse.down(); await d.mouse.move(sb['x']+sb['width']*.9, sb['y']+sb['height']*.9, steps=6); await d.mouse.up(); await d.wait_for_timeout(300)
        await d.fill('.mbox input.word','floor'); await d.keyboard.press('Enter'); await d.wait_for_timeout(300)
        await d.keyboard.press('Escape'); await d.click('#sub button.drawbtn'); await d.wait_for_timeout(200)
        await d.screenshot(path=shot('dw4_desktop.png'))
        await d.mouse.move(sb['x']+sb['width']*.4, sb['y']+sb['height']*.4); await d.mouse.down(); await d.mouse.move(sb['x']+sb['width']*.55, sb['y']+sb['height']*.6, steps=6); await d.mouse.up(); await d.wait_for_timeout(300)
        await d.fill('.mbox input.word','tile'); await d.keyboard.press('Enter'); await d.wait_for_timeout(300)
        out['desktop']=await d.evaluate("(()=>{ const a=JSON.parse(localStorage.getItem('pv-scenes2')||'[]'); return Object.values(a[a.length-1].items).map(i=>i.word).sort(); })()")
        await b.close()
    check(out['editing'] and out['first_btn']=='➕ ตีกรอบคำใหม่', 'new picture opens the editor', (out['editing'], out['first_btn']))
    check(out['form1']=='เพิ่มคำศัพท์' and out['after1'] and out['after1'][0][0]=='counter', 'drag on the picture adds a word', out['after1'])
    check(out['drag_moves_box'], 'dragging a box moves it')
    check(out['mode_on'][0] and out['mode_off_after_draw'], 'draw mode turns on and off', out['mode_on'])
    check(out['two_items']==['counter','cup'] and out['big_unchanged'] and out['cup_inside'], 'can draw a box inside another', out['two_items'])
    check(out['cancel']==(2,0), 'cancel adds nothing', out['cancel'])
    check(out['tiny'][0], 'too small a box asks to drag', out['tiny'])
    check(out['banner_cancel'] and out['esc_cancel'] and out['after_done']==(False,False), 'leaving draw mode / editing', out['after_done'])
    check(out['desktop']==['floor','tile'], 'drawing with a mouse', out['desktop'])
    finish('draw boxes', out, errs)
asyncio.run(main())
