import asyncio, json, urllib.request, re
from playwright.async_api import async_playwright
from common import *
BASE=SERVER
IMG=PHOTO
state=lambda: json.loads(urllib.request.urlopen(FAKE+'/__state').read())
async def fwd(r):
    u=r.request.url.replace('https://oftzpfyydnmahkntucnj.supabase.co', FAKE)
    resp=await r.fetch(url=u); await r.fulfill(response=resp)
async def newpage(b, errs, vw=1200, vh=860, mobile=False):
    ctx=await b.new_context(locale='th-TH', viewport={'width':vw,'height':vh}, is_mobile=mobile, has_touch=mobile, service_workers='block')
    await ctx.grant_permissions(['clipboard-read','clipboard-write'], origin=BASE)
    pg=await ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.route('https://oftzpfyydnmahkntucnj.supabase.co/**', fwd); return pg
async def main():
    async with async_playwright() as p:
        b=await launch(p)
        errs=[]; out={}
        T=await newpage(b, errs); await T.goto(BASE+'/app'); await T.wait_for_timeout(700)
        # teacher: own scene with a word, sign in
        await T.set_input_files('#fileImg', IMG); await T.wait_for_timeout(700); await skip_ai_offer(T)
        sb_=await T.locator('#scene').bounding_box(); x0=sb_['x']+sb_['width']*0.42; y0=sb_['y']+sb_['height']*0.6
        await T.mouse.move(x0,y0); await T.mouse.down(); await T.mouse.move(x0+80,y0+70,steps=4); await T.mouse.up(); await T.wait_for_timeout(150)
        await T.fill('.mbox input.word','jam'); await T.click('.mbox button.primary'); await T.wait_for_timeout(150)
        await T.click('text=เสร็จแล้ว'); await T.wait_for_timeout(200); await T.click('#homeBtn'); await T.wait_for_timeout(200)
        await T.click('#acctBtn'); await T.fill('.mbox input[type=email]','teacher@school.th'); await T.click('.mbox button.primary'); await T.wait_for_timeout(400)
        await T.type('.mbox input.code','123456'); await T.press('.mbox input.code','Enter'); await T.wait_for_timeout(3000)
        out['t_acct']=await T.inner_text('#acctBtn'); print('t_acct', out['t_acct'], flush=True)
        await T.screenshot(path=shot('cl0_login.png'))
        # create a class
        await T.click('.mainnav button[data-view=class]'); await T.wait_for_timeout(500)
        await T.click('#classView button:has-text("สร้างห้องเรียน")'); await T.fill('#mbox input','ป.4/2 อังกฤษ'); await T.press('#mbox input','Enter'); await T.wait_for_timeout(1500)
        code=await T.inner_text('.clcode'); out['code']=code
        # assign the sample scene + own scene
        for name in ('Afternoon tea','kitchen'):
            await T.click('#classView button:has-text("มอบหมายฉากหรือชุดคำ")'); await T.wait_for_timeout(300)
            await T.locator('#mbox .asrow', has_text=name).click(); await T.wait_for_timeout(2500)
        out['teacher_items']=await T.locator('.cltable th').all_inner_texts()
        await T.screenshot(path=shot('cl1_teacher_empty.png'), full_page=True)
        # student 1: phone, invite link, nickname
        S1=await newpage(b, errs, 390, 820, True); await S1.goto(BASE+'/c/'+code); await S1.wait_for_timeout(1500)
        out['s1_prefill']=await S1.input_value('#mbox input.clcodein')
        await S1.screenshot(path=shot('cl2_join.png'))
        await S1.fill('#mbox input[aria-label="ชื่อเล่น"]','มิ้นท์'); await S1.click('#mbox button.primary'); await S1.wait_for_timeout(2500)
        out['s1_acct']=await S1.inner_text('#acctBtn')
        out['s1_items']=await S1.locator('.clitem b').all_inner_texts()
        await S1.screenshot(path=shot('cl3_student.png'))
        # practise the sample scene: type one answer in quiz mode
        await S1.locator('.clitem', has_text='Afternoon tea').locator('button').click(); await S1.wait_for_timeout(800)
        await S1.click('#modes >> text=ทบทวน'); await S1.wait_for_timeout(300)
        await S1.click('#sub .listbtn'); await S1.wait_for_timeout(300); await S1.locator('.wlist .wrow').first.click(); await S1.wait_for_timeout(400)
        await S1.fill('#qin','3-tier cake stand'); await S1.press('#qin','Enter'); await S1.wait_for_timeout(5500)
        # own scene of the teacher (picture copy through the share)
        await S1.click('#homeBtn'); await S1.wait_for_timeout(300); await S1.click('#bnav [data-view=class]'); await S1.wait_for_timeout(800)
        await S1.locator('.clitem', has_text='kitchen').locator('button').click(); await S1.wait_for_timeout(2500)
        out['s1_opened']=await S1.inner_text('#curName')
        out['s1_ai_btn']=await S1.locator('#sub .ai').count()
        # student 2: desktop, types the code
        S2=await newpage(b, errs); await S2.goto(BASE+'/app'); await S2.wait_for_timeout(700)
        await S2.click('.mainnav button[data-view=class]'); await S2.wait_for_timeout(300); await S2.click('#classView button:has-text("เข้าห้องด้วยรหัส")')
        await S2.fill('#mbox input.clcodein', code.lower()); await S2.fill('#mbox input[aria-label="ชื่อเล่น"]','พลอย'); await S2.click('#mbox button.primary'); await S2.wait_for_timeout(2500)
        out['s2_title']=await S2.inner_text('#classView h2')
        # teacher sees both and the progress
        await T.click('#classView .ghead button.ghost'); await T.wait_for_timeout(1500)
        out['table']=[await r.inner_text() for r in await T.locator('.cltable tr').all()]
        await T.screenshot(path=shot('cl4_teacher_progress.png'), full_page=True)
        # export: Excel + CSV
        async with T.expect_download() as dl: await T.click('.clexport button.primary')
        d=await dl.value; await d.save_as(shot('export.xlsx')); out['xlsx_name']=d.suggested_filename
        async with T.expect_download() as dl2: await T.click('.clexport button:has-text("CSV")')
        d2=await dl2.value; await d2.save_as(shot('export.csv')); out['csv_name']=d2.suggested_filename
        await T.locator('.clexport').screenshot(path=shot('cl_export_bar.png'))
        # leaderboard: off for students until the teacher turns it on
        await S2.click('#classView button:has-text("ห้องเรียนทั้งหมด")'); await S2.wait_for_timeout(600); await S2.locator('#classView .lrow').first.click(); await S2.wait_for_timeout(1200)
        out['board_off']=await S2.locator('.board').count()
        await T.click('#classView button:has-text("ตารางอันดับ")'); await T.wait_for_timeout(1500)
        out['teacher_board']=await T.locator('.board .brow').all_inner_texts()
        await T.screenshot(path=shot('lb1_teacher.png'), full_page=True)
        await S2.click('#classView button:has-text("ห้องเรียนทั้งหมด")'); await S2.wait_for_timeout(600); await S2.locator('#classView .lrow').first.click(); await S2.wait_for_timeout(1200)
        out['student_board']=await S2.locator('.board .brow').all_inner_texts()
        await S2.screenshot(path=shot('lb2_student.png'), full_page=True)
        # teacher removes พลอย; มิ้นท์ leaves
        await T.locator('.cltable tr', has_text='พลอย').locator('button.x').click(); await T.click('#mbox button.primary'); await T.wait_for_timeout(1200)
        await S1.click('#homeBtn'); await S1.wait_for_timeout(300); await S1.click('#bnav [data-view=class]'); await S1.wait_for_timeout(800)
        await S1.click('#classView button:has-text("ออกจากห้องนี้")'); await S1.click('#mbox button.primary'); await S1.wait_for_timeout(1200)
        out['s1_after_leave']=await S1.inner_text('#classView')
        await T.click('#classView .ghead button.ghost'); await T.wait_for_timeout(1500)
        out['table_after']=[await r.inner_text() for r in await T.locator('.cltable tr').all()]
        st=state()['db']; out['db']={k:len(v) for k,v in st.items() if k.startswith('class')}
        # student can't create a class
        await S1.click('#classView button:has-text("สร้างห้องเรียน")'); await S1.wait_for_timeout(300); out['s1_create']=await S1.inner_text('#mbox p')
        await b.close()
    check(len(out['code'])==6 and out['s1_prefill']==out['code'], 'class code and invite link', (out['code'], out['s1_prefill']))
    check(out['teacher_items'][1].startswith('🖼️ Afternoon tea') and 'kitchen' in out['teacher_items'][2], 'teacher assigns two scenes', out['teacher_items'])
    check(out['s1_items']==['Afternoon tea ☕','kitchen'] and out['s1_opened']=='kitchen', 'student sees and opens the assignments', (out['s1_items'], out['s1_opened']))
    check(out['s1_ai_btn']==0, 'students have no AI button', out['s1_ai_btn'])
    check('1/24 ★1' in out['table'][1] and 'มิ้นท์' in out['table'][1], "teacher sees the student's progress", out['table'])
    check(out['xlsx_name'].endswith('.xlsx') and out['csv_name'].endswith('.csv'), 'export to Excel and CSV', (out['xlsx_name'], out['csv_name']))
    check(out['board_off']==0 and out['teacher_board'][0].startswith('🥇') and '(ฉัน)' in out['student_board'][1], 'class ranking', (out['teacher_board'], out['student_board']))
    check(out['db']=={'classes':1,'class_members':0,'class_items':2,'class_progress':0}, 'leaving / removing cleans up', out['db'])
    check('บัญชีนักเรียนสร้างห้องเรียนไม่ได้' in out['s1_create'], "student accounts can't create classes", out['s1_create'])
    finish('classes', out, errs)
asyncio.run(main())
