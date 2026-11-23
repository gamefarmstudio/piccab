# 👥 An assignment for some students only: when assigning, "everyone" (as before) or tick the students; later the
# 👥 button in the progress table changes who gets it. Students who don't get it: an empty (striped) cell, blank in
# the export, and they don't see it in their class. Someone who joins later gets the "everyone" work only.
import asyncio, json, urllib.request
from playwright.async_api import async_playwright
from common import *
BASE = SERVER
state = lambda: json.loads(urllib.request.urlopen(FAKE + '/__state').read())['db']
async def fwd(r):
    resp = await r.fetch(url=r.request.url.replace(SUPA, FAKE)); await r.fulfill(response=resp)
async def newpage(b, errs, vw=1200, vh=900, mobile=False):
    ctx = await b.new_context(locale='th-TH', viewport={'width': vw, 'height': vh}, is_mobile=mobile, has_touch=mobile, service_workers='block', accept_downloads=True)
    pg = await ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.route(SUPA + '/**', fwd); return pg
async def join(b, errs, code, nick):
    S = await newpage(b, errs, 390, 820, True); await S.goto(BASE + '/c/' + code); await S.wait_for_timeout(1500)
    await S.fill('#mbox input[aria-label="ชื่อเล่น"]', nick); await S.click('#mbox button.primary'); await S.wait_for_timeout(2500)
    return S
async def items_of(S):
    await S.reload(); await S.wait_for_timeout(1500)
    await S.evaluate("document.querySelector('#bnav [data-view=class]').click()"); await S.wait_for_timeout(1000)
    await S.click('.socialtabs button:has-text("ห้องเรียน")'); await S.wait_for_timeout(600)
    await S.locator('#classView .lrow').first.click(); await S.wait_for_timeout(1500)
    return [x.replace(' ☕', '') for x in await S.locator('.clitem b').all_inner_texts()]
async def reload_class(T):
    await T.click('#classView button[title="โหลดใหม่"]'); await T.wait_for_timeout(1500)

async def main():
    out = {}; errs = []
    async with async_playwright() as p:
        b = await launch(p)
        T = await newpage(b, errs); await T.goto(BASE + '/app'); await T.wait_for_timeout(800)
        await T.click('#acctBtn'); await T.fill('.mbox input[type=email]', 'teacher@school.th'); await T.click('.mbox button.primary'); await T.wait_for_timeout(400)
        await T.type('.mbox input.code', '123456'); await T.press('.mbox input.code', 'Enter'); await T.wait_for_timeout(3000)
        await open_set_maker(T)
        await paste_words(T, 'cat แมว\ndog หมา\nbird นก', replace=True)
        await T.click('.wsbox .row .primary'); await T.wait_for_timeout(1500)
        for _ in range(3):
            if await T.locator('#modal:not([hidden])').count(): await T.keyboard.press('Escape'); await T.wait_for_timeout(200)
        set_name = await T.evaluate("JSON.parse(localStorage.getItem('pv-scenes2')).find(s=>s.meta&&s.meta.kind==='list').name")
        await T.evaluate("document.querySelector('.mainnav button[data-view=class]').click()"); await T.wait_for_timeout(500)
        await T.click('.socialtabs button:has-text("ห้องเรียน")'); await T.wait_for_timeout(400)
        await T.click('#classView button:has-text("สร้างห้องเรียน")'); await T.fill('#mbox input', 'ป.4/2'); await T.press('#mbox input', 'Enter'); await T.wait_for_timeout(1500)
        code = await T.inner_text('.clcode')
        A = await join(b, errs, code, 'เอ'); B = await join(b, errs, code, 'บี')
        await reload_class(T)
        # everyone (the default, as before)
        await T.click('#classView button:has-text("มอบหมายฉากหรือชุดคำ")'); await T.wait_for_timeout(400)
        out['who_default'] = await T.inner_text('#mbox .whobox')
        out['list_hidden'] = await T.locator('#mbox .wholist').is_hidden()
        await T.locator('#mbox .asrow', has_text='Afternoon tea').click(); await T.wait_for_timeout(2500)
        # the word set for เอ only — nobody ticked: asks to choose
        await T.click('#classView button:has-text("มอบหมายฉากหรือชุดคำ")'); await T.wait_for_timeout(400)
        await T.click('#mbox .whoseg button >> nth=1'); await T.wait_for_timeout(100)
        out['names'] = await T.locator('#mbox .wholist .chk').all_inner_texts()
        await T.locator('#mbox .asrow', has_text=set_name).click(); await T.wait_for_timeout(300)
        out['nobody'] = await T.inner_text('#mbox .err')
        await T.locator('#mbox .wholist .chk', has_text='เอ').locator('input').check()
        out['count'] = await T.inner_text('#mbox .whocount')
        # ⏰ due in a week
        out['due_default'] = await T.inner_text('#mbox .duehint')
        await T.click('#mbox .dueseg button:has-text("1 สัปดาห์")'); out['due_hint'] = await T.inner_text('#mbox .duehint')
        await T.screenshot(path=shot('as_pick.png'))
        await T.locator('#mbox .asrow', has_text=set_name).click(); await T.wait_for_timeout(2500)
        st = state(); out['db_only'] = sorted((i['share_id'] != '' , len(i.get('students') or [])) for i in st['class_items'])
        out['who_btns'] = await T.locator('.cltable .whobtn:not(.duebtn)').all_inner_texts()
        out['na_rows'] = [await T.locator('.cltable tr', has_text=n).locator('td.na').count() for n in ('เอ', 'บี')]
        await T.screenshot(path=shot('as_table.png'), full_page=True)
        # CSV: บี's cells for the set are blank, and not counted in บี's totals
        async with T.expect_download() as dl:
            await T.click('.clexport button:has-text("CSV")')
        csv = open(await (await dl.value).path(), encoding='utf-8-sig').read().splitlines()
        out['csv'] = [l for l in csv if l.split(',')[1] in ('เอ', 'บี')]
        # the students: each sees their own work
        out['a_items'] = await items_of(A); out['b_items'] = await items_of(B)
        out['a_due'] = await A.locator('.clitem .duelbl').all_inner_texts()
        out['due_btns'] = await T.locator('.cltable .duebtn').all_inner_texts()
        # closed (the date passed): the table says so, and the student sees it
        sid_due = [i['share_id'] for i in state()['class_items'] if i.get('due')][0]
        req = urllib.request.Request(FAKE + '/rest/v1/class_items?share_id=eq.' + sid_due, data=json.dumps({'due': '2026-01-01T16:59:59.999Z'}).encode(), method='PATCH', headers={'content-type': 'application/json', 'apikey': 'sb_secret_test', 'authorization': 'Bearer sb_secret_test'})
        urllib.request.urlopen(req).read()
        await reload_class(T); out['due_closed'] = [await T.locator('.cltable .duebtn.closed').count(), await T.locator('.cltable .duebtn.closed').inner_text()]
        await items_of(A); out['a_closed'] = await A.locator('.clitem .duelbl.closed').count()
        # ⏰ in the table: pick a day → saved; then no due date
        await T.click('.cltable .duebtn.closed'); await T.wait_for_timeout(300)
        out['due_edit'] = await T.get_attribute('#mbox .dueseg button.on', 'aria-checked')
        await T.fill('#mbox input.duedate', '2099-01-01'); out['due_far'] = await T.inner_text('#mbox .duehint')
        await T.click('#mbox .dueseg button:has-text("ไม่กำหนด")'); await T.click('#mbox .row button.primary'); await T.wait_for_timeout(1500)
        out['due_none'] = await T.locator('.cltable .duebtn').all_inner_texts()
        out['db_due'] = [i.get('due') for i in state()['class_items']]
        # 👥 in the table: give it to บี too
        await T.locator('.cltable .whobtn:not(.duebtn)').nth(1).click(); await T.wait_for_timeout(300)
        out['edit_checked'] = await T.evaluate("[...document.querySelectorAll('#mbox .wholist input')].map(i=>i.checked)")
        await T.locator('#mbox .wholist .chk', has_text='บี').locator('input').check()
        await T.click('#mbox .row button.primary'); await T.wait_for_timeout(1500)
        out['who_btns2'] = await T.locator('.cltable .whobtn:not(.duebtn)').all_inner_texts()
        out['b_items2'] = await items_of(B)
        # back to everyone; a new student gets it too
        await T.locator('.cltable .whobtn:not(.duebtn)').nth(1).click(); await T.wait_for_timeout(300)
        await T.click('#mbox .whoseg button >> nth=0'); await T.click('#mbox .row button.primary'); await T.wait_for_timeout(1500)
        out['who_btns3'] = await T.locator('.cltable .whobtn:not(.duebtn)').all_inner_texts()
        # then เอ only again: a student who joins later doesn't get it
        await T.locator('.cltable .whobtn:not(.duebtn)').nth(1).click(); await T.wait_for_timeout(300)
        await T.click('#mbox .whoseg button >> nth=1')
        await T.locator('#mbox .wholist .chk', has_text='เอ').locator('input').check(); await T.click('#mbox .row button.primary'); await T.wait_for_timeout(1500)
        C = await join(b, errs, code, 'ซี')
        out['c_items'] = await items_of(C)
        await reload_class(T)
        out['who_btns4'] = await T.locator('.cltable .whobtn:not(.duebtn)').all_inner_texts()
        out['na_c'] = await T.locator('.cltable tr', has_text='ซี').locator('td.na').count()
        await b.close()
    check('ทุกคน' in out['who_default'] and 'รวมถึงคนที่เข้าห้องทีหลัง' in out['who_default'] and out['list_hidden'], 'assigning: everyone by default, the list hidden', (out['who_default'], out['list_hidden']))
    check(out['due_default'] == 'ทำได้ไม่มีกำหนด' and 'หมดเวลา' in out['due_hint'] and '23:59' in out['due_hint'], '⏰ no due date by default; 1 week shows when it closes', (out['due_default'], out['due_hint']))
    check(out['due_btns'].count('⏰ ไม่กำหนด') == 1 and any(b.startswith('⏰ ถึง') for b in out['due_btns']) and out['a_due'] and 'อีก 7 วัน' in out['a_due'][0], 'the table shows the due date; the student sees 7 days left', (out['due_btns'], out['a_due']))
    check(out['due_closed'][0] == 1 and 'หมดเวลา' in out['due_closed'][1] and out['a_closed'] == 1, 'past the date: closed in the table and for the student', (out['due_closed'], out['a_closed']))
    check(out['due_edit'] == 'true' and out['due_none'] == ['⏰ ไม่กำหนด', '⏰ ไม่กำหนด'] and out['db_due'] == [None, None], 'change it from the table: no due date', (out['due_edit'], out['due_none'], out['db_due']))
    check(sorted(out['names']) == ['บี', 'เอ'] and out['nobody'] == 'เลือกอย่างน้อย 1 คน' and out['count'] == 'เลือก 1/2 คน', 'choose students: nobody ticked → asks; 1/2 chosen', (out['names'], out['nobody'], out['count']))
    check(out['db_only'] == [(True, 0), (True, 1)] and out['who_btns'] == ['👥 ทุกคน', '👥 1/2 คน'], 'saved: one for everyone, one for 1 student; shown in the table', (out['db_only'], out['who_btns']))
    check(out['na_rows'] == [0, 1], "บี's cell for the set is empty", out['na_rows'])
    a_csv = [l for l in out['csv'] if ',เอ,' in l][0].split(','); b_csv = [l for l in out['csv'] if ',บี,' in l][0].split(',')
    check(b_csv[5:7] == ['', ''] and a_csv[5:7] == ['0', '0'] and int(a_csv[-3]) - int(b_csv[-3]) == 3, "CSV: บี's cells blank; the set's 3 words not in บี's total", out['csv'])
    check(out['a_items'] == ['Afternoon tea', set_name] and out['b_items'] == ['Afternoon tea'], 'each student sees only their work', (out['a_items'], out['b_items']))
    check(out['edit_checked'] in ([True, False], [False, True]) and out['who_btns2'][1] == '👥 2/2 คน' and out['b_items2'] == ['Afternoon tea', set_name], 'change who gets it from the table', (out['edit_checked'], out['who_btns2'], out['b_items2']))
    check(out['who_btns3'][1] == '👥 ทุกคน', 'back to everyone', out['who_btns3'])
    check(out['c_items'] == ['Afternoon tea'] and out['who_btns4'][1] == '👥 1/3 คน' and out['na_c'] == 1, 'joining later: the everyone work only', (out['c_items'], out['who_btns4'], out['na_c']))
    finish('test_assign_some', out, errs)

asyncio.run(main())
