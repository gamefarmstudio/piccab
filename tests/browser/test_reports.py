# 📈 Learning reports: a parent makes a family group, the child joins on their own phone, the child's device sends
# its report, the parent opens it (days, minutes, games, words passed, words still missed, CEFR). An admin turns on Pro.
# Also: a class student chooses whether to share.
import asyncio, json, urllib.request, datetime
from playwright.async_api import async_playwright
from common import *
BASE=SERVER
state=lambda: json.loads(urllib.request.urlopen(FAKE+'/__state').read())
async def fwd(r):
    resp=await r.fetch(url=r.request.url.replace('https://oftzpfyydnmahkntucnj.supabase.co', FAKE)); await r.fulfill(response=resp)
async def newpage(b, errs, vw=1200, vh=900, mobile=False, init=None):
    ctx=await b.new_context(locale='th-TH', viewport={'width':vw,'height':vh}, is_mobile=mobile, has_touch=mobile, service_workers='block')
    if init: await ctx.add_init_script(init)
    pg=await ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e))); await pg.route('https://oftzpfyydnmahkntucnj.supabase.co/**', fwd); return pg
async def login(pg, em):
    await pg.click('#acctBtn'); await pg.fill('.mbox input[type=email]',em); await pg.click('.mbox button.primary'); await pg.wait_for_timeout(400)
    await pg.type('.mbox input.code','123456'); await pg.press('.mbox input.code','Enter'); await pg.wait_for_timeout(2500)
# A few weeks of practice on the child's phone, before this test (days, word stats, progress, school year)
SEED = """(()=>{ if(localStorage.getItem('pv-seeded')) return; localStorage.setItem('pv-seeded','1');
  const dk=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  const days={}, pat=[1,1,0,1,1,1,0,1,0,1,1,1,1,0,0,1,1,0,1,1,1];
  pat.forEach((on,i)=>{ if(!on) return; const d=new Date(); d.setDate(d.getDate()-i-1); const n=4+(i*7)%13;
    days[dk(d)]={n, t:3+(i*5)%11, m:{quiz:n-2, find:2, learn:1, ...(i%3===0?{speak:3}:{}), ...(i%4===0?{sent:2}:{})}}; });
  localStorage.setItem('pv-days', JSON.stringify(days));
  const today=Math.floor((Date.now()-new Date().getTimezoneOffset()*60000)/86400000);
  localStorage.setItem('pv-wstat', JSON.stringify({'tea|teapot':[4,today-9],'tea|sugar-bowl':[3,today-6],'tea|milk-jug':[0,today-2],'tea|jam':[2,today-1],'tea|scone':[0,today-1]}));
  const done={}, star={}; ['teapot','sugar-bowl','milk-jug','jam','scone','teacup','saucer','napkin'].forEach((k,i)=>{ done[k]={b:2,d:today+3}; if(i%2) star[k]=true; });
  localStorage.setItem('pv-progress', JSON.stringify({tea:{done, star, updatedAt:Date.now()}}));
  localStorage.setItem('pv-stage', JSON.stringify('p34'));
})();"""
async def main():
    async with async_playwright() as p:
        b=await launch(p); errs=[]; out={}
        # parent: signs in, makes a family group
        P=await newpage(b, errs); await P.goto(BASE+'/app'); await P.wait_for_timeout(700); await login(P,'parent@home.th')
        await P.click('.mainnav button[data-view=class]'); await P.wait_for_timeout(600)
        out['tiles']=await P.locator('#classView .tile b').all_inner_texts()
        await P.click('#classView button:has-text("สร้างกลุ่มครอบครัว")'); await P.wait_for_timeout(300)
        await P.fill('#mbox input','บ้านมิ้นท์'); await P.press('#mbox input','Enter'); await P.wait_for_timeout(1500)
        code=await P.inner_text('.clcode'); out['code']=code
        out['p_head']=await P.inner_text('#classView .ghead')
        await P.screenshot(path=shot('rp0_family_empty.png'), full_page=True)
        await P.click('#classView button:has-text("มอบหมายฉากหรือชุดคำ")'); await P.wait_for_timeout(300)
        await P.locator('#mbox .asrow', has_text='Afternoon tea').click(); await P.wait_for_timeout(2500)
        # child: own phone, opens the invite link, joins (anonymous student account)
        C=await newpage(b, errs, 390, 820, True, SEED); await C.goto(BASE+'/c/'+code); await C.wait_for_timeout(1500)
        out['c_modal']=await C.inner_text('#mbox')
        await C.screenshot(path=shot('rp1_join.png'))
        await C.fill('#mbox input[aria-label="ชื่อเล่น"]','มิ้นท์'); await C.click('#mbox button.primary')
        await C.wait_for_selector('#classView h2', timeout=20000); await C.wait_for_timeout(500)
        out['c_view']=await C.inner_text('#classView')
        await C.screenshot(path=shot('rp2_child.png'), full_page=True)
        # child practises one word now (quiz) → today counts too
        await C.locator('.clitem', has_text='Afternoon tea').locator('button').click(); await C.wait_for_timeout(800)
        await C.click('#modes >> text=ทบทวน'); await C.wait_for_timeout(300)
        await C.click('#sub .listbtn'); await C.wait_for_timeout(300); await C.locator('.wlist .wrow').first.click(); await C.wait_for_timeout(400)
        await C.fill('#qin','3-tier cake stand'); await C.press('#qin','Enter')
        for i in range(80):                                     # the report goes ~8s after an answer (much slower on a busy machine)
            await C.wait_for_timeout(500)
            if state()['db']['learner_reports'] and len(state()['db']['learner_reports'][0]['data'].get('days',[]))>=15 and any(d[0]==__import__('datetime').date.today().isoformat() for d in state()['db']['learner_reports'][0]['data']['days']): break
        st=state()['db']; out['reports_db']=len(st['learner_reports']); rep=(st['learner_reports'] or [{}])[0].get('data',{})
        out['rep_s']=rep.get('s'); out['rep_weak']=[w[0] for w in rep.get('weak',[])]; out['rep_days']=len(rep.get('days',[])); out['rep_stage']=rep.get('stage')
        # parent: summary row, then the report
        await P.click('#classView .ghead button.ghost'); await P.wait_for_timeout(1500)
        out['p_row']=await P.inner_text('.rmembers .lrow')
        await P.screenshot(path=shot('rp3_family.png'), full_page=True)
        await P.click('.rmembers button:has-text("ดูรายงาน")')
        try: await P.wait_for_selector('.rtiles', timeout=30000)
        except Exception:   # say why: what the parent sees, what reached the server, what the child's device has
            st=state()['db']; dbg={'parent_sees': (await P.inner_text('#classView'))[:600], 'reports': [(r.get('user_id'), sorted((r.get('data') or {}).keys()), len((r.get('data') or {}).get('days',[]))) for r in st['learner_reports']],
              'child_days': await C.evaluate("Object.keys(JSON.parse(localStorage.getItem('pv-days')||'{}')).slice(-3)"), 'child_share': await C.evaluate("localStorage.getItem('pv-report-on')"), 'today': __import__('datetime').date.today().isoformat()}
            print('REPORT DEBUG', json.dumps(dbg, ensure_ascii=False)); raise
        await P.wait_for_timeout(400)
        out['tiles_txt']=await P.locator('.rtile').all_inner_texts()
        out['cols']=await P.locator('.rchart .rcol').count(); out['cols_on']=await P.locator('.rchart .rcol.on').count()
        out['games']=await P.locator('.rbars').first.inner_text()
        out['weak']=await P.locator('.rw.weak b').all_inner_texts()
        out['learned']=await P.locator('.rw:not(.weak) b').all_inner_texts()
        out['report_txt']=await P.inner_text('#classView')
        await P.screenshot(path=shot('rp4_report.png'), full_page=True)
        await P.set_viewport_size({'width':390,'height':844}); await P.wait_for_timeout(300)
        await P.screenshot(path=shot('rp5_report_phone.png'), full_page=True)
        await P.set_viewport_size({'width':1200,'height':900})
        # admin turns on Pro for the parent
        A=await newpage(b, errs); await A.goto(BASE+'/app'); await A.wait_for_timeout(500); await login(A,'boss@piccab.th')
        await A.click('#acctBtn'); await A.wait_for_timeout(300); await A.click('#mbox button:has-text("ดูแลระบบ")'); await A.wait_for_timeout(1200)
        await A.click('.admtabs button:has-text("Pro")'); await A.wait_for_timeout(800)
        await A.fill('.proform input[type=email]','Parent@Home.th'); await A.fill('.proform input[aria-label="บันทึก"]','ทดลอง'); await A.click('.proform button.primary'); await A.wait_for_timeout(1200)
        out['admin_pro']=await A.locator('.admcard').all_inner_texts()
        await A.screenshot(path=shot('rp6_admin_pro.png'), full_page=True)
        await P.click('#classView .clback button'); await P.wait_for_timeout(300); await P.click('#classView .ghead button.ghost'); await P.wait_for_timeout(1500)
        out['p_badge']=await P.inner_text('#classView .hsec .propill')
        # a class: the student turns sharing off when joining, then on in the class page
        await P.click('#classView button:has-text("ห้องเรียนทั้งหมด")'); await P.wait_for_timeout(800)
        await P.click('#classView button:has-text("สร้างห้องเรียน")'); await P.fill('#mbox input','ป.4/2'); await P.press('#mbox input','Enter'); await P.wait_for_timeout(1500)
        code2=await P.inner_text('.clcode')
        S=await newpage(b, errs, 390, 820, True); await S.goto(BASE+'/c/'+code2); await S.wait_for_timeout(1500)
        await S.fill('#mbox input[aria-label="ชื่อเล่น"]','พลอย'); await S.uncheck('#mbox .rchk input'); await S.click('#mbox button.primary')
        await S.wait_for_selector('#classView h2', timeout=20000); await S.wait_for_timeout(500)
        out['s_toggle0']=await S.inner_text('#classView .cllb')
        await P.click('#classView .ghead button.ghost'); await P.wait_for_timeout(1500)
        out['class_row0']=await P.inner_text('.rmembers .lrow')
        await S.click('#classView .cllb button'); await S.wait_for_timeout(1500)
        out['s_toggle1']=await S.inner_text('#classView .cllb')
        await P.click('#classView .ghead button.ghost'); await P.wait_for_timeout(1500)
        out['class_row1']=await P.inner_text('.rmembers .lrow')
        out['members']=[(m['nickname'], m.get('report')) for m in state()['db']['class_members']]
        await b.close()
    check(out['tiles'][2]=='สร้างกลุ่มครอบครัว', 'family group tile', out['tiles'])
    check(len(out['code'])==6 and '🏠 บ้านมิ้นท์' in out['p_head'] and 'ลูก 0 คน' in out['p_head'], 'parent makes a family group', (out['code'], out['p_head']))
    check('แชร์รายงานการเรียน' in out['c_modal'], 'join dialog asks about sharing the report', out['c_modal'])
    check('ผู้ปกครองเห็นรายงานการเรียนของคุณ' in out['c_view'] and 'ออกจากกลุ่มครอบครัว' in out['c_view'], 'child sees that the parent sees the report', out['c_view'])
    check(out['reports_db']==1 and out['rep_s']['streak']>=1 and out['rep_s']['total']==9 and out['rep_days']>=15 and out['rep_stage']=='p34', 'child device sends the report', (out['reports_db'], out['rep_s'], out['rep_days'], out['rep_stage']))
    check(out['rep_weak']==['teapot','sugar bowl','jam'], 'words that needed help, most first', out['rep_weak'])
    check('มิ้นท์' in out['p_row'] and 'วันติดกัน' in out['p_row'] and 'ผ่านแล้ว 9 คำ' in out['p_row'], 'parent sees the summary row', out['p_row'])
    check(len(out['tiles_txt'])==7 and any('9/24' in t for t in out['tiles_txt']), 'report tiles', out['tiles_txt'])
    check(out['cols']==30 and out['cols_on']>=13, '30-day chart', (out['cols'], out['cols_on']))
    check('ทบทวน (พิมพ์)' in out['games'] and 'ฟังแล้วหา' in out['games'] and 'แต่งประโยค' in out['games'], 'games played', out['games'])
    check(out['weak'][:2]==['teapot','sugar bowl'] and '3-tier cake stand' in out['learned'], 'weak and newly learned words', (out['weak'], out['learned']))
    check('ป.3–4' in out['report_txt'] and 'Pro · ช่วงทดลองใช้ฟรี' in out['report_txt'], 'school year and Pro badge (free trial)', out['report_txt'][:400])
    check(any('parent@home.th' in t for t in out['admin_pro']) and out['p_badge']=='⭐ Pro', 'admin turns on Pro', (out['admin_pro'], out['p_badge']))
    check('ปิด' in out['s_toggle0'] and 'ยังไม่ได้แชร์รายงาน' in out['class_row0'], 'class student can join without sharing', (out['s_toggle0'], out['class_row0']))
    check('เปิด' in out['s_toggle1'] and 'ดูรายงาน' in out['class_row1'], 'then turn sharing on', (out['s_toggle1'], out['class_row1']))
    finish('reports', out, errs)
asyncio.run(main())
