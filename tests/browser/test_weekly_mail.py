# 📧 Weekly summary e-mail: a parent with a family group sees the switch (on by default) and their address, turns it
# off and on again (kept in the account), and can ask for a sample now (no child yet → says so; e-mail not set up on
# this test server → says so). The e-mail itself and the Sunday run are tested in tests/worker.test.mjs.
import asyncio, json, urllib.request
from playwright.async_api import async_playwright
from common import *
BASE=SERVER
state=lambda: json.loads(urllib.request.urlopen(FAKE+'/__state').read())
async def fwd(r):
    resp=await r.fetch(url=r.request.url.replace(SUPA, FAKE)); await r.fulfill(response=resp)
async def newpage(b, errs, vw=1200, vh=900, mobile=False):
    ctx=await b.new_context(locale='th-TH', viewport={'width':vw,'height':vh}, is_mobile=mobile, has_touch=mobile, service_workers='block')
    pg=await ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e))); await pg.route(SUPA+'/**', fwd); return pg
async def login(pg, em):
    await pg.click('#acctBtn'); await pg.fill('.mbox input[type=email]',em); await pg.click('.mbox button.primary'); await pg.wait_for_timeout(400)
    await pg.type('.mbox input.code','123456'); await pg.press('.mbox input.code','Enter'); await pg.wait_for_timeout(2500)
LAST={'t':''}
async def toast(pg):
    # the next message (not the one still showing from before)
    for _ in range(40):
        t=await pg.evaluate("(document.querySelector('.toast.show')||{}).textContent||''")
        if t and t!=LAST['t']: LAST['t']=t; return t
        await pg.wait_for_timeout(200)
    return ''
async def main():
    async with async_playwright() as p:
        b=await launch(p); errs=[]; out={}
        P=await newpage(b, errs); await P.goto(BASE+'/app'); await P.wait_for_timeout(700); await login(P,'mom@home.th')
        await P.click('.mainnav button[data-view=class]'); await P.wait_for_timeout(600)
        await P.click('#classView button:has-text("สร้างกลุ่มครอบครัว")'); await P.wait_for_timeout(300)
        await P.fill('#mbox input','บ้านเรา'); await P.press('#mbox input','Enter'); await P.wait_for_timeout(1500)
        await P.wait_for_selector('.mailcard .toggle', timeout=10000)
        LAST['t']=await P.evaluate("(document.querySelector('.toast.show')||{}).textContent||''")
        out['card0']=await P.inner_text('.mailcard')
        await P.screenshot(path=shot('mail_card.png'), full_page=True)
        # off, then on again: kept in the account
        await P.click('.mailcard .toggle'); out['t_off']=await toast(P)
        out['card_off']=await P.inner_text('.mailcard .toggle')
        out['db_off']=[(r['weekly'], r['lang']) for r in state()['db']['email_prefs']]
        await P.click('.mailcard .toggle'); out['t_on']=await toast(P)
        out['db_on']=[r['weekly'] for r in state()['db']['email_prefs']]
        # a sample now: no child yet
        await P.click('.mailcard button:has-text("ส่งตัวอย่าง")'); out['t_nokid']=await toast(P)
        # a child joins → the sample is built, but this test server has no e-mail service
        code=await P.inner_text('.clcode')
        C=await newpage(b, errs, 390, 820, True); await C.goto(BASE+'/c/'+code); await C.wait_for_timeout(1500)
        await C.fill('#mbox input[aria-label="ชื่อเล่น"]','ฟ้า'); await C.click('#mbox button.primary'); await C.wait_for_selector('#classView h2', timeout=20000)
        await P.wait_for_timeout(1700)                         # the toast before has gone
        await P.click('.mailcard button:has-text("ส่งตัวอย่าง")'); out['t_nomail']=await toast(P)
        # a class (not a family group) has no e-mail switch
        await P.goto(BASE+'/app'); await P.wait_for_timeout(1500)
        await P.click('.mainnav button[data-view=class]'); await P.wait_for_timeout(800)
        await P.click('#classView button:has-text("สร้างห้องเรียน")'); await P.wait_for_timeout(300)
        await P.fill('#mbox input','ป.4/1'); await P.press('#mbox input','Enter'); await P.wait_for_timeout(1500)
        out['class_card']=await P.locator('.mailcard').count()
        await b.close()
    check('อีเมลสรุปรายสัปดาห์: เปิด' in out['card0'] and 'mom@home.th' in out['card0'] and 'วันอาทิตย์' in out['card0'], 'family group: the switch is on, with the parent\'s address', out['card0'])
    check('ปิด' in out['card_off'] and out['db_off']==[(False,'th')] and 'ปิดอีเมลสรุปแล้ว' in out['t_off'], 'switched off, kept in the account', (out['card_off'], out['db_off'], out['t_off']))
    check(out['db_on']==[True] and 'วันอาทิตย์' in out['t_on'], 'switched on again', (out['db_on'], out['t_on']))
    check('ยังไม่มีลูกในกลุ่ม' in out['t_nokid'], 'a sample with no child yet says so', out['t_nokid'])
    check('ระบบส่งอีเมลยังไม่พร้อม' in out['t_nomail'], 'with a child: the sample is built (this server has no e-mail service)', out['t_nomail'])
    check(out['class_card']==0, 'a class has no e-mail switch', out['class_card'])
    finish('weekly e-mail switch', out, errs)
asyncio.run(main())
