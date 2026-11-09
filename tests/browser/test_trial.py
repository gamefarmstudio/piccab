"""Tools for the trial: 💬 feedback from the app, 🐞 errors on people's devices, 📊 usage counts — and the admin tabs that show them."""
import asyncio, json, urllib.request
from playwright.async_api import async_playwright
from common import *
BASE=SERVER
async def fwd(r):
    resp=await r.fetch(url=r.request.url.replace('https://oftzpfyydnmahkntucnj.supabase.co', FAKE)); await r.fulfill(response=resp)
async def newpage(b, errs, vw=390, vh=844, mobile=True):
    ctx=await b.new_context(locale='th-TH', viewport={'width':vw,'height':vh}, is_mobile=mobile, has_touch=mobile, service_workers='block')
    pg=await ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e))); await pg.route('https://oftzpfyydnmahkntucnj.supabase.co/**', fwd); return pg
async def login(pg, em):
    await pg.click('#acctBtn'); await pg.fill('.mbox input[type=email]',em); await pg.click('.mbox button.primary'); await pg.wait_for_timeout(400)
    await pg.type('.mbox input.code','123456'); await pg.press('.mbox input.code','Enter'); await pg.wait_for_timeout(2500)
def fake(path):
    with urllib.request.urlopen(urllib.request.Request(FAKE+path, headers={'apikey':'sb_secret_test','authorization':'Bearer sb_secret_test'})) as x: return json.loads(x.read() or b'null')
async def main():
    out={}; errs=[]
    async with async_playwright() as p:
        b=await launch(p)
        # a visitor (not signed in): opens the app, practises, sends feedback, hits an error
        V=await newpage(b, errs); await V.goto(BASE+'/app'); await V.wait_for_timeout(1200)
        await V.click('#mbox .x') if await V.locator('#mbox .x').count() and await V.locator('#modal').is_visible() else None
        await V.goto(BASE+'/app'); await V.wait_for_timeout(1000)
        out['strip']=await V.locator('.fbstrip').count(); out['footer']=await V.locator('#fbLink').count()
        await V.click('.cont .primary.big'); await V.wait_for_timeout(500)                      # continue the sample scene
        await V.click('#modes button[data-mode=quiz]'); await V.wait_for_timeout(300)
        await V.click('#modes button[data-mode=find]'); await V.wait_for_timeout(300)
        await V.click('#homeBtn'); await V.wait_for_timeout(400)
        await V.click('.fbstrip'); await V.wait_for_timeout(300)
        out['dlg']=await V.inner_text('#mbox h3')
        await V.click('#mbox .fbkind button:nth-child(2)')
        await V.fill('#mbox textarea', 'อยากให้มีเกมจับคู่คำ'); await V.fill('#mbox input[type=email]', 'mom@example.com')
        await V.screenshot(path=shot('tr1_feedback.png'))
        await V.click('#mbox button.primary'); await V.wait_for_timeout(1200)
        out['toast']=await V.inner_text('#toast')
        # an error in the app, twice (sent once) + one from the network going away (not sent)
        await V.evaluate("setTimeout(()=>{ null.boom; }, 0); setTimeout(()=>{ null.boom; }, 0); Promise.reject(new TypeError('Failed to fetch')); 0")
        await V.wait_for_timeout(1200); errs[:]=[e for e in errs if 'boom' not in e and 'Failed to fetch' not in e]   # (made on purpose)
        await V.evaluate("window.dispatchEvent(new Event('pagehide'))"); await V.wait_for_timeout(1200)   # counts go out when the page is hidden
        out['pending']=await V.evaluate("JSON.parse(localStorage.getItem('pv-usage')).events")
        await V.context.close()
        out['fb_db']=[(f['kind'],f['message'],f['contact'],f['page'],f['user_id']) for f in fake('/rest/v1/feedback')]
        out['err_db']=[(e['msg'][:40],e['n'],e['page']) for e in fake('/rest/v1/client_errors')]
        out['usage_db']={u['event']:u['n'] for u in fake('/rest/v1/usage_daily')}
        # the admin sees it all
        A=await newpage(b, errs, 1200, 900, False); await A.goto(BASE+'/app'); await A.wait_for_timeout(500); await login(A,'boss@piccab.th')
        await A.click('#acctBtn'); await A.wait_for_timeout(300); await A.click('#mbox button:has-text("ดูแลระบบ")'); await A.wait_for_timeout(1200)
        out['tabs']=await A.locator('.admtabs button').all_inner_texts()
        await A.click('.admtabs button:has-text("ความเห็น")'); await A.wait_for_timeout(1200)
        out['fb_card']=await A.inner_text('#adminView .admcard')
        await A.screenshot(path=shot('tr2_admin_feedback.png'), full_page=True)
        A.on('dialog', lambda d: asyncio.ensure_future(d.accept('ตอบแล้ว')))
        await A.click('#adminView .admcard button.primary'); await A.wait_for_timeout(1200)
        out['fb_after']=await A.inner_text('#adminView')
        await A.click('.admtabs button:has-text("การใช้งาน")'); await A.wait_for_timeout(1500)
        out['stats']=await A.inner_text('#adminView')
        await A.screenshot(path=shot('tr3_admin_stats.png'), full_page=True)
        await A.click('.admtabs button:has-text("ข้อผิดพลาด")'); await A.wait_for_timeout(1200)
        out['errs']=await A.inner_text('#adminView')
        await A.screenshot(path=shot('tr4_admin_errors.png'), full_page=True)
        await A.goto(BASE+'/admin?tab=feedback'); await A.wait_for_selector('.admtabs button.on', timeout=15000)   # the link in the feedback e-mail
        out['tab_link']=await A.inner_text('.admtabs button.on')
        await b.close()
    check(out['strip']==1 and out['footer']==1, 'feedback on home and in the footer', (out['strip'], out['footer']))
    check(out['dlg'].strip()=='ส่งความเห็น' and 'ขอบคุณ' in out['toast'], 'feedback dialog sends', (out['dlg'], out['toast']))
    check(out['fb_db']==[('idea','อยากให้มีเกมจับคู่คำ','mom@example.com','home',None)], 'feedback saved with kind, contact and page', out['fb_db'])
    check(len(out['err_db'])==1 and out['err_db'][0][1]==1 and 'Cannot read' in out['err_db'][0][0], 'one app error saved once; network errors ignored', out['err_db'])
    u=out['usage_db']
    check(u.get('open')==1 and u.get('new_device')==1 and u.get('age:0')==1 and u.get('mode:learn',0)>=1 and u.get('mode:quiz')==1 and u.get('mode:find')==1 and u.get('feedback')==1,
          'usage counted per day (open, new device, modes, feedback)', u)
    check(out['pending']=={}, 'counts cleared after sending', out['pending'])
    check(out['tabs']==['🚩 รายงาน','💬 ความเห็น','🖼️ คลังภาพ','📊 การใช้งาน','🐞 ข้อผิดพลาด','✨ การใช้ AI'], 'admin tabs', out['tabs'])
    check('อยากให้มีเกมจับคู่คำ' in out['fb_card'] and 'mom@example.com' in out['fb_card'] and 'หน้า home' in out['fb_card'], 'admin reads the feedback', out['fb_card'][:300])
    check('ไม่มีความเห็นที่ต้องจัดการ' in out['fb_after'], 'feedback closed', out['fb_after'][:200])
    check('เปิดแอปวันนี้ (เครื่อง)' in out['stats'] and 'ฟังแล้วหา' in out['stats'], 'usage page', out['stats'][:400])
    check('Cannot read' in out['errs'] and '1 ครั้ง' in out['errs'], 'errors page', out['errs'][:300])
    check(out['tab_link']=='💬 ความเห็น', '/admin?tab=feedback opens the feedback tab', out['tab_link'])
    finish('trial tools', out, errs)
asyncio.run(main())
