import asyncio, json, urllib.request, urllib.error
from playwright.async_api import async_playwright
from common import *
BASE=SERVER
def req(base, method, path, tok=None, body=None, raw=None, ctype='application/json'):
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    r=urllib.request.Request(base+path, data=data, method=method, headers={'content-type':ctype, **({'authorization':'Bearer '+tok} if tok else {})})
    with urllib.request.urlopen(r) as x: t=x.read(); return json.loads(t) if t else None
async def fwd(r):
    resp=await r.fetch(url=r.request.url.replace('https://oftzpfyydnmahkntucnj.supabase.co', FAKE)); await r.fulfill(response=resp)
async def newpage(b, errs, vw=1200, vh=900, mobile=False):
    ctx=await b.new_context(locale='th-TH', viewport={'width':vw,'height':vh}, is_mobile=mobile, has_touch=mobile, service_workers='block')
    pg=await ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e))); await pg.route('https://oftzpfyydnmahkntucnj.supabase.co/**', fwd)
    pg.admin_files=[]; pg.on('request', lambda q: '/assets/admin-page' in q.url and pg.admin_files.append(q.url)); return pg
async def login(pg, em):
    await pg.click('#acctBtn'); await pg.fill('.mbox input[type=email]',em); await pg.click('.mbox button.primary'); await pg.wait_for_timeout(400)
    await pg.type('.mbox input.code','123456'); await pg.press('.mbox input.code','Enter'); await pg.wait_for_timeout(2500)
async def main():
    # someone shares a picture
    X=req(FAKE,'POST','/auth/v1/verify',body={'email':'bad@x.th','token':'1','type':'email'})['access_token']
    req(BASE,'PUT','/api/img/s1',X,raw=open(PHOTO,'rb').read(),ctype='image/jpeg')
    sh=req(BASE,'POST','/api/share',X,{'kind':'scene','name':'ภาพไม่ดี','scenes':[{'id':'s1','name':'x','w':800,'h':600,'items':{'h':{'word':'cup','x':1,'y':1,'w':50,'h':50}}}]})
    async with async_playwright() as p:
        b=await launch(p); errs=[]; out={}
        # visitor (not signed in) reports the link
        V=await newpage(b, errs, 390, 820, True); await V.goto(BASE+'/s/'+sh['id']); await V.wait_for_timeout(1500)
        await V.click('#mbox button:has-text("รายงานเนื้อหาไม่เหมาะสม")'); await V.wait_for_timeout(200)
        await V.screenshot(path=shot('ad0_report.png'))
        await V.select_option('#mbox select','มีข้อมูลส่วนตัวของคนอื่น'); await V.click('#mbox button.danger'); await V.wait_for_timeout(800)
        out['v_toast']=await V.inner_text('#toast')
        # non-admin: no admin button, /admin does nothing
        N=await newpage(b, errs); await N.goto(BASE+'/app'); await N.wait_for_timeout(500); await login(N,'normal@x.th')
        await N.click('#acctBtn'); await N.wait_for_timeout(300); out['n_btn']=await N.locator('#mbox button:has-text("ดูแลระบบ")').count(); await N.click('#mbox button.primary')
        # admin
        A=await newpage(b, errs); await A.goto(BASE+'/app'); await A.wait_for_timeout(500); await login(A,'boss@piccab.th')
        await A.click('#acctBtn'); await A.wait_for_timeout(300); out['a_btn']=await A.locator('#mbox button:has-text("ดูแลระบบ")').count()
        await A.click('#mbox button:has-text("ดูแลระบบ")'); await A.wait_for_timeout(1500)
        out['cards']=await A.locator('.admcard').count(); out['card']=await A.inner_text('.admcard')
        await A.click('.admcard button:has-text("ดูหลักฐาน")'); await A.wait_for_timeout(1200)
        out['evidence']=await A.inner_text('.admev')
        await A.screenshot(path=shot('ad1_admin.png'), full_page=True)
        await A.click('.admcard button:has-text("ระงับบัญชี")'); await A.click('#mbox button.primary'); await A.wait_for_timeout(1500)
        out['banned_pill']=await A.locator('.admcard .pill.bad').count()
        await A.click('.admcard button:has-text("ลบลิงก์นี้")'); await A.click('#mbox button.primary'); await A.wait_for_timeout(1500)
        out['share_gone']=urllib.request.urlopen(urllib.request.Request(BASE+'/api/share/'+sh['id'])).status if False else None
        try: urllib.request.urlopen(BASE+'/api/share/'+sh['id']); out['share_gone']=False
        except urllib.error.HTTPError as e: out['share_gone']=e.code==404
        await A.click('.admcard button:has-text("ปิดเรื่อง")'); await A.fill('#mbox input','ลบลิงก์ + ระงับแล้ว'); await A.click('#mbox button.primary'); await A.wait_for_timeout(1500)
        out['empty']=await A.inner_text('#adminView .libempty')
        await A.click('#adminView .seg button:has-text("ทั้งหมด")'); await A.wait_for_timeout(1200)
        out['all']=await A.inner_text('.admcard')
        await A.screenshot(path=shot('ad2_resolved.png'), full_page=True)
        # /admin link opens the page for the admin
        await A.goto(BASE+'/admin'); await A.wait_for_timeout(3500); out['admin_link']=await A.locator('#adminView').is_visible()
        await N.goto(BASE+'/admin'); await N.wait_for_timeout(3500); out['n_admin_link']=await N.locator('#adminView').is_visible()
        out['admin_file']=(len(A.admin_files), len(N.admin_files))
        # the suspended user can no longer use the API
        try: req(BASE,'GET','/api/friends',X); out['x_blocked']=False
        except urllib.error.HTTPError as e: out['x_blocked']=e.code
        st=json.loads(urllib.request.urlopen(FAKE+'/__state').read())['db']['friend_reports']; out['report_row']=[(r['reason'], r['share_id']==sh['id'], r['reporter'], r.get('note')) for r in st]
        await b.close()
    check('ส่งรายงานแล้ว' in out['v_toast'], 'visitors can report a shared link', out['v_toast'])
    check(out['n_btn']==0 and out['a_btn']==1, 'only admins see the admin button', (out['n_btn'], out['a_btn']))
    check(out['cards']==1 and 'ลิงก์แชร์' in out['card'], 'the report is listed', out['card'])
    check(out['banned_pill']==1 and out['x_blocked']==401, 'suspending blocks the account', (out['banned_pill'], out['x_blocked']))
    check(out['share_gone'], 'admin can delete the shared link')
    check('ไม่มีรายงานที่ต้องจัดการ' in out['empty'], 'closing the report empties the list', out['empty'])
    check(out['admin_link'] and not out['n_admin_link'], '/admin works only for admins', (out['admin_link'], out['n_admin_link']))
    check(out['admin_file'][0]>=1 and out['admin_file'][1]==0, 'the admin page file loads for admins only', out['admin_file'])
    check(out['report_row'][0][1] and out['report_row'][0][3]=='ลบลิงก์ + ระงับแล้ว', 'report saved with the note', out['report_row'])
    finish('admin', out, errs)
asyncio.run(main())
