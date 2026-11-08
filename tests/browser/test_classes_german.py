import asyncio, json
from playwright.async_api import async_playwright
from common import *
BASE=SERVER
async def fwd(r):
    u=r.request.url.replace('https://oftzpfyydnmahkntucnj.supabase.co', FAKE)
    resp=await r.fetch(url=u); await r.fulfill(response=resp)
async def newpage(b, errs, vw=1200, vh=860, mobile=False, locale='th-TH'):
    ctx=await b.new_context(locale=locale, viewport={'width':vw,'height':vh}, is_mobile=mobile, has_touch=mobile, service_workers='block')
    pg=await ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e))); await pg.route('https://oftzpfyydnmahkntucnj.supabase.co/**', fwd); return pg
async def main():
    out={}; errs=[]
    async with async_playwright() as p:
        b=await launch(p)
        T=await newpage(b, errs); await T.goto(BASE+'/app'); await T.wait_for_timeout(700)
        await T.click('#acctBtn'); await T.fill('.mbox input[type=email]','lehrer@schule.de'); await T.click('.mbox button.primary'); await T.wait_for_timeout(400)
        await T.type('.mbox input.code','123456'); await T.press('.mbox input.code','Enter'); await T.wait_for_timeout(3000)
        await T.click('.mainnav button[data-view=class]'); await T.wait_for_timeout(500)
        await T.click('#classView button:has-text("สร้างห้องเรียน")'); await T.fill('#mbox input','Deutsch 4'); await T.press('#mbox input','Enter'); await T.wait_for_timeout(1500)
        code=await T.inner_text('.clcode')
        # assign the sample scene in German, and again in English (another class item → conflict)
        await T.click('#classView button:has-text("มอบหมายฉากหรือชุดคำ")'); await T.wait_for_timeout(300)
        await T.click('#mbox .aslang button:has-text("เยอรมัน")'); await T.wait_for_timeout(200)
        out['picker_meta']=await T.locator('#mbox .asrow small').first.inner_text()
        await T.screenshot(path=shot('cd1_picker.png'))
        await T.locator('#mbox .asrow', has_text='Afternoon tea').click(); await T.wait_for_timeout(2500)
        out['teacher_head']=await T.locator('.cltable th').all_inner_texts()
        await T.click('#classView button:has-text("มอบหมายฉากหรือชุดคำ")'); await T.wait_for_timeout(300)
        await T.click('#mbox .aslang button:has-text("อังกฤษ")'); await T.locator('#mbox .asrow', has_text='Afternoon tea').click(); await T.wait_for_timeout(2500)
        out['conflict']=await T.inner_text('#mbox .err'); await T.click('#mbox button:has-text("ปิด")')
        # student (English phone) joins and practises in German
        S=await newpage(b, errs, 390, 820, True, 'en-GB'); await S.goto(BASE+'/c/'+code); await S.wait_for_timeout(1500)
        await S.fill('#mbox input.clcodein', code) if await S.locator('#mbox input.clcodein').count() else None
        await S.locator('#mbox input').nth(1).fill('Mia'); await S.click('#mbox button.primary'); await S.wait_for_timeout(2500)
        out['s_item']=await S.locator('.clitem').first.inner_text()
        await S.screenshot(path=shot('cd2_student.png'))
        await S.locator('.clitem').first.locator('button').click(); await S.wait_for_timeout(1000)
        out['s_lang']=await S.evaluate("localStorage.getItem('pv-lang')")
        out['s_pill']=(await S.locator('#playBar .langpill').text_content()).strip()
        await S.click('#modes [data-mode=quiz]'); await S.wait_for_timeout(300)
        await S.locator('#scene .item[data-id="vase"]').click(force=True); await S.wait_for_timeout(500)
        await S.fill('#qin','die Vase'); await S.press('#qin','Enter'); await S.wait_for_timeout(600)
        out['s_msg']=await S.inner_text('#qmsg')
        await S.wait_for_timeout(5500)
        await S.goto(BASE+'/app'); await S.wait_for_timeout(1500)
        await S.click('#bnav [data-view=class]'); await S.wait_for_timeout(800); await S.locator('#classView .lrow').first.click(); await S.wait_for_timeout(1500)
        out['s_after']=await S.locator('.clitem').first.inner_text()
        await S.wait_for_timeout(5000)
        # teacher sees 1/24 in German
        await T.click('#classView .ghead button.ghost'); await T.wait_for_timeout(1500)
        out['table']=[await r.inner_text() for r in await T.locator('.cltable tr').all()]
        await T.screenshot(path=shot('cd3_teacher.png'), full_page=True)
        await b.close()
    check('🇩🇪' in out['teacher_head'][1], 'teacher table shows the German flag', out['teacher_head'])
    check('ภาษาอื่น' in out['conflict'], 'one language per assignment', out['conflict'])
    check('German' in out['s_item'] and out['s_lang']=='"de"' and out['s_pill']=='🇩🇪 German', 'student practises in German', (out['s_item'], out['s_lang']))
    check('★' in out['s_msg'], '"die Vase" earns a star', out['s_msg'])
    check('1/24' in out['s_after'] and 'Mia\t1/24 ★1' in '\n'.join(out['table']), 'German progress reaches the teacher', (out['s_after'], out['table']))
    finish('classes in German', out, errs)
asyncio.run(main())
