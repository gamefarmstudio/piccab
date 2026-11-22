# 📝 Paper tests in a class: the teacher prints one sheet per student (name + QR), photographs the finished sheets,
# the app reads the QR (whose sheet), AI reads the answers (faked here), the teacher checks and saves; a photo without
# a QR is assigned by hand. The class shows scores and the most missed words; each student gets their missed words
# as a word set to practise, and sees the score in their class.
import asyncio, json, urllib.request, re, os
from playwright.async_api import async_playwright
from common import *
BASE = SERVER
state = lambda: json.loads(urllib.request.urlopen(FAKE + '/__state').read())['db']
async def fwd(r):
    resp = await r.fetch(url=r.request.url.replace(SUPA, FAKE)); await r.fulfill(response=resp)
async def newpage(b, errs, vw=1100, vh=900, mobile=False, scale=1):
    ctx = await b.new_context(locale='th-TH', viewport={'width': vw, 'height': vh}, is_mobile=mobile, has_touch=mobile, device_scale_factor=scale, service_workers='block')
    await ctx.add_init_script("window.print=()=>{ window.__printed=(window.__printed||0)+1; };")
    pg = await ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.route(SUPA + '/**', fwd); return pg
async def join(b, errs, code, nick):
    S = await newpage(b, errs, 390, 820, True); await S.goto(BASE + '/c/' + code); await S.wait_for_timeout(1500)
    await S.fill('#mbox input[aria-label="ชื่อเล่น"]', nick); await S.click('#mbox button.primary'); await S.wait_for_timeout(2500)
    return S
async def close_modals(pg):
    for _ in range(4):
        if await pg.locator('#modal:not([hidden])').count(): await pg.keyboard.press('Escape'); await pg.wait_for_timeout(200)

async def main():
    out = {}; errs = []; reads = []
    async with async_playwright() as p:
        b = await launch(p)
        T = await newpage(b, errs, scale=2); await T.goto(BASE + '/app'); await T.wait_for_timeout(800)
        await T.click('#acctBtn'); await T.fill('.mbox input[type=email]', 'teacher@school.th'); await T.click('.mbox button.primary'); await T.wait_for_timeout(400)
        await T.type('.mbox input.code', '123456'); await T.press('.mbox input.code', 'Enter'); await T.wait_for_timeout(3000)
        # a word set: cat, dog, ice cream (no pictures → the Thai meaning is the question)
        await open_set_maker(T)
        await paste_words(T, 'cat แมว\ndog หมา\nice cream ไอศกรีม', replace=True)
        await T.click('.wsbox .row .primary'); await T.wait_for_timeout(1500); await close_modals(T)
        set_name = await T.evaluate("JSON.parse(localStorage.getItem('pv-scenes2')).find(s=>s.meta&&s.meta.kind==='list').name")
        # a class with two students
        await T.evaluate("document.querySelector('.mainnav button[data-view=class]').click()"); await T.wait_for_timeout(500)
        await T.click('.socialtabs button:has-text("ห้องเรียน")'); await T.wait_for_timeout(400)
        await T.click('#classView button:has-text("สร้างห้องเรียน")'); await T.fill('#mbox input', 'ป.5/1'); await T.press('#mbox input', 'Enter'); await T.wait_for_timeout(1500)
        code = await T.inner_text('.clcode')
        S1 = await join(b, errs, code, 'มิ้นท์'); S2 = await join(b, errs, code, 'บีม')
        await T.click('#classView button[title="โหลดใหม่"]'); await T.wait_for_timeout(1500)
        out['empty'] = await T.inner_text('.ctsec')
        # ➕ print a test for this class: one sheet per student, with name and QR
        await T.click('.ctsec .hsec .linkbtn'); await T.wait_for_timeout(300)
        out['pick'] = await T.locator('#mbox .ctpick .lrow').all_inner_texts()
        await T.locator('#mbox .ctpick .lrow').first.click(); await T.wait_for_timeout(1500)
        out['for'] = await T.evaluate("(()=>{ const s=document.querySelector('.tsfor'); return [s.value, s.options[s.selectedIndex].text]; })()")
        out['sample_qr'] = await T.locator('.tsprev .tsqr.sample').count()
        out['info'] = await T.inner_text('.tsinfo')
        await T.uncheck('.tschk input >> nth=0'); await T.click('.tsseg button[data-v=count]'); await T.wait_for_timeout(200)
        await T.screenshot(path=shot('ct_print_opts.png'))
        await T.click('.tsbox .tsprint'); await T.wait_for_timeout(2500)
        out['printed'] = await T.evaluate('window.__printed||0')
        out['pages'] = await T.locator('#printSheet .tspage').count()
        out['names'] = await T.locator('#printSheet .tspage:not(.key) .tsf.wide i').all_inner_texts()
        out['qrs'] = await T.locator('#printSheet .tsqr img').count()
        st = state(); out['db_test'] = [(t['name'], len(t['words']), [r['n'] for r in t['roster']]) for t in st['class_tests']]
        tid = st['class_tests'][0]['id']; out['db_tid'] = tid; roster = [r['n'] for r in st['class_tests'][0]['roster']]
        mint = roster.index('มิ้นท์'); beam = roster.index('บีม'); fake_k = {'mint': mint}
        # the "photo" of มิ้นท์'s sheet: her printed page, as an image
        await T.evaluate("""(k)=>{ const pg=document.querySelectorAll('#printSheet .tspage:not(.key)')[k].cloneNode(true); pg.id='photoPage';
            Object.assign(pg.style,{position:'fixed',left:'0',top:'0',zIndex:'99999',background:'#fff'}); document.body.append(pg); }""", mint)
        await T.locator('#photoPage').screenshot(path=shot('ct_photo_mint.png'))
        await T.evaluate("document.getElementById('photoPage').remove(); document.getElementById('printSheet')?.remove(); document.body.classList.remove('printing')")
        await close_modals(T)
        # the AI read (faked): what the request asked for, and an answer with a box for the first question
        async def fake_read(r):
            body = json.loads(r.request.post_data); reads.append({ 'k': body['k'], 'first': body['first'], 'last': body['last'], 'jpeg': body['image'].startswith('data:image/jpeg') })
            items = [{'n': 1, 'a': 'kat', 'box': [60, 300, 600, 340]}, {'n': 2, 'a': 'dog'}, {'n': 3, 'a': 'ice cream'}] if body['k'] == fake_k['mint'] else [{'n': 1, 'a': 'cat'}, {'n': 2, 'a': ''}, {'n': 3, 'a': 'icecream'}]
            await r.fulfill(status=200, content_type='application/json', body=json.dumps({'items': items, 'provider': 'claude'}))
        await T.route('**/api/tests/*/read', fake_read)
        await T.click('#classView button[title="โหลดใหม่"]'); await T.wait_for_timeout(1500)
        out['list'] = await T.inner_text('.ctsec .cttest')
        await T.locator('.ctsec').screenshot(path=shot('ct_list.png'))
        # 🖨️ on the right: print again, the same test (same QR), for one student
        printed0 = await T.evaluate('window.__printed||0')
        await T.click('.ctsec .cttest .ctprint'); await T.wait_for_timeout(1200)
        out['rp_names'] = await T.locator('#mbox .wholist .chk').all_inner_texts()
        await T.locator('#mbox .wholist .chk', has_text='บีม').locator('input').uncheck()
        out['rp_count'] = await T.inner_text('#mbox .whohead .note')
        await T.click('#mbox .row button.primary'); await T.wait_for_timeout(2500)
        out['rp'] = [await T.evaluate('window.__printed||0') - printed0, await T.locator('#printSheet .tspage:not(.key) .tsf.wide i').all_inner_texts(),
                     await T.locator('#printSheet .tsqr small').first.inner_text(), len(state()['class_tests'])]
        await T.evaluate("document.getElementById('printSheet')?.remove(); document.body.classList.remove('printing')")
        await T.click('.ctsec .cttest'); await T.wait_for_timeout(1200)
        out['view'] = await T.inner_text('#classView .ghead')
        out['todo'] = await T.locator('.ctst.todo').count()
        # 📷 two photos: มิ้นท์'s sheet (QR) and a photo without a QR (บีม's, chosen by hand)
        await T.set_input_files('.ctfile', [shot('ct_photo_mint.png'), PHOTO]); await T.wait_for_timeout(500)
        await T.wait_for_selector('.ctreview', timeout=20000)
        out['rv1_head'] = await T.inner_text('.ctrhead')
        out['rv1_marks'] = await T.locator('.ctreview .ctmark').all_inner_texts()
        out['rv1_vals'] = await T.evaluate("[...document.querySelectorAll('.ctreview .ctans input')].map(i=>i.value)")
        out['rv1_hand'] = await T.locator('.ctreview img.cthand').count()
        await T.screenshot(path=shot('ct_review.png'))
        # AI misread "ice cream"? the teacher marks it wrong by tapping ✗; fixing "kat" → "cat" makes it right, back again
        await T.locator('.ctreview .ctans input').first.fill('cat'); out['fix_mark'] = await T.locator('.ctreview .ctmark').first.inner_text()
        await T.locator('.ctreview .ctans input').first.fill('kat')
        await T.locator('.ctreview .ctmark').nth(2).click(); out['sum'] = await T.inner_text('.ctsum')
        await T.click('.ctreview button.primary'); await T.wait_for_timeout(1200)
        # no QR on the second photo: whose sheet is it?
        await T.wait_for_selector('.ctwho select', timeout=20000)
        out['ask'] = await T.inner_text('#mbox')
        await T.select_option('.ctwho select', str(beam)); await T.click('#mbox .row button.primary'); await T.wait_for_timeout(800)
        await T.wait_for_selector('.ctreview', timeout=20000)
        out['rv2_marks'] = await T.locator('.ctreview .ctmark').all_inner_texts()
        await T.click('.ctreview button.primary'); await T.wait_for_timeout(1500)
        out['reads'] = list(reads)
        out['scores'] = await T.locator('.ctst').all_inner_texts()
        out['miss'] = await T.locator('.rwords .rw').all_inner_texts()
        await T.screenshot(path=shot('ct_scores.png'), full_page=True)
        st = state(); out['db_results'] = sorted((r['score'], r['total']) for r in st['class_test_results'])
        # ✍️ check by hand (no photo): บีม gets question 2 right after all
        await T.locator('.ctst', has_text='บีม').locator('button').click(); await T.wait_for_timeout(300)
        out['manual_rows'] = await T.locator('.ctreview .ctrow').count(); out['manual_hand'] = await T.locator('.ctreview .cthand').count()
        await T.locator('.ctreview .ctans input').nth(1).fill('dog'); await T.click('.ctreview button.primary'); await T.wait_for_timeout(1200)
        out['scores2'] = await T.locator('.ctst').all_inner_texts()
        # the student: the missed words become a word set to practise; the score shows in their class
        await S1.reload(); await S1.wait_for_timeout(3500)
        await S1.evaluate("document.querySelector('#bnav [data-view=class]').click()"); await S1.wait_for_timeout(1500)
        await S1.click('.socialtabs button:has-text("ห้องเรียน")'); await S1.wait_for_timeout(800)
        await S1.locator('#classView .lrow').first.click(); await S1.wait_for_timeout(2000)
        out['s1_tests'] = await S1.locator('#classView .lrow:has-text("คะแนน")').all_inner_texts()
        out['s1_set'] = await S1.evaluate("(()=>{ const sc=JSON.parse(localStorage.getItem('pv-scenes2')||'[]').find(s=>s.name.startsWith('📝')); return sc ? [sc.name, Object.values(sc.items).map(i=>i.word)] : null; })()")
        out['s1_mytests'] = await S1.evaluate("Object.values(JSON.parse(localStorage.getItem('pv-mytests')||'{}')).map(t=>[t.score,t.total,t.n])")
        await S1.screenshot(path=shot('ct_student.png'))
        await S1.locator('#classView .lrow:has-text("คะแนน") button').click(); await S1.wait_for_timeout(600)
        out['s1_practice'] = await S1.inner_text('#mbox h3')
        # บีม: one word still wrong (ice cream) → a set with it
        await S2.reload(); await S2.wait_for_timeout(3500)
        out['s2_set'] = await S2.evaluate("JSON.parse(localStorage.getItem('pv-scenes2')||'[]').filter(s=>s.name.startsWith('📝')).length")
        out['s2_mytests'] = await S2.evaluate("Object.values(JSON.parse(localStorage.getItem('pv-mytests')||'{}')).map(t=>[t.score,t.total,t.n])")
        # 📝 a typed list of names (people without the app), from the classes page
        await T.click('.clback button'); await T.wait_for_timeout(300)
        if await T.locator('.clback button').count(): await T.click('.clback button'); await T.wait_for_timeout(800)
        out['names_sec'] = await T.inner_text('.ctsec.names')
        await T.click('.ctsec.names .hsec .linkbtn'); await T.wait_for_timeout(300)
        await T.locator('#mbox .ctpick .lrow', has_text=set_name).click(); await T.wait_for_timeout(1500)
        out['n_for'] = await T.input_value('.tsfor'); out['n_box'] = await T.locator('.tsnamesrow:not([hidden]) textarea').count()
        await T.fill('.tsnames', '1 สมชาย\n\n2 สมหญิง\n'); await T.wait_for_timeout(200)
        out['n_info'] = await T.inner_text('.tsinfo'); out['n_sample'] = await T.locator('.tsprev .tsf.wide i').first.inner_text()
        await T.uncheck('.tschk input >> nth=0'); await T.click('.tsbox .tsprint'); await T.wait_for_timeout(2500)
        out['n_names'] = await T.locator('#printSheet .tspage:not(.key) .tsf.wide i').all_inner_texts()
        out['n_qrs'] = await T.locator('#printSheet .tsqr img').count()
        await T.evaluate("""()=>{ const pg=document.querySelectorAll('#printSheet .tspage:not(.key)')[1].cloneNode(true); pg.id='photoPage';
            Object.assign(pg.style,{position:'fixed',left:'0',top:'0',zIndex:'99999',background:'#fff'}); document.body.append(pg); }""")
        await T.locator('#photoPage').screenshot(path=shot('ct_photo_names.png'))
        await T.evaluate("document.getElementById('photoPage').remove(); document.getElementById('printSheet')?.remove(); document.body.classList.remove('printing')")
        await close_modals(T)
        st = state(); nt = [t for t in st['class_tests'] if not t.get('class_id')]
        out['n_db'] = [(t['owner'] is not None, [r['n'] for r in t['roster']], any('u' in r for r in t['roster'])) for t in nt]
        reads.clear(); fake_k['mint'] = -1   # the typed-names sheets get the other answers
        await T.evaluate("document.querySelector('.mainnav button[data-view=home]').click()"); await T.wait_for_timeout(300)
        await T.evaluate("document.querySelector('.mainnav button[data-view=class]').click()"); await T.wait_for_timeout(1200)
        await T.click('.ctsec.names .cttest'); await T.wait_for_timeout(1200)
        out['n_view'] = await T.inner_text('#classView')
        await T.set_input_files('.ctfile', [shot('ct_photo_names.png')]); await T.wait_for_selector('.ctreview', timeout=20000)
        out['n_rv'] = await T.inner_text('.ctrhead')
        await T.click('.ctreview button.primary'); await T.wait_for_timeout(1500)
        out['n_reads'] = list(reads)
        out['n_scores'] = await T.locator('.ctst').all_inner_texts()
        await T.screenshot(path=shot('ct_names.png'), full_page=True)
        st = state(); out['n_res'] = [(r['k'], r.get('user_id'), r['score']) for r in st['class_test_results'] if r['test_id'] == nt[0]['id']]
        await b.close()
    check('ยังไม่มี' not in out['empty'] and 'พิมพ์แผ่นสอบ' in out['empty'], 'the class has a 📝 tests section', out['empty'])
    check(any(set_name in x for x in out['pick']), 'choose the word set to test', out['pick'])
    check(out['for'][0] != '' and 'ป.5/1' in out['for'][1] and out['sample_qr'] >= 1 and '2 คน' in out['info'], 'the class is chosen: a sample with a QR, 2 students', (out['for'], out['sample_qr'], out['info']))
    check(out['printed'] == 1 and out['pages'] == 3 and sorted(out['names']) == ['บีม', 'มิ้นท์'] and out['qrs'] == 2, 'one sheet per student with the name and a QR, + the answers', (out['printed'], out['pages'], out['names'], out['qrs']))
    check(out['db_test'] and out['db_test'][0][1] == 3 and sorted(out['db_test'][0][2]) == ['บีม', 'มิ้นท์'], 'the test is saved with the class list', out['db_test'])
    check('ตรวจแล้ว 0/2' in out['list'] and out['todo'] == 2 and '👥' in out['list'] and 'มิ้นท์' in out['list'] and 'บีม' in out['list'] and 'พิมพ์' in out['list'], 'the test in the class: none marked yet; who it went to; 🖨️', (out['list'], out['todo']))
    tid_ = out['db_tid']
    check(sorted(out['rp_names']) == ['บีม', 'มิ้นท์'] and out['rp_count'] == '1/2 คน' and out['rp'][0] == 1 and out['rp'][1] == ['มิ้นท์'] and out['rp'][2].startswith(tid_) and out['rp'][3] == 1, 'print again: one student, the same test and QR, no new test', (out['rp_names'], out['rp_count'], out['rp']))
    check(len(out['reads']) == 2 and out['reads'][0] == {'k': mint, 'first': 1, 'last': 3, 'jpeg': True} and out['reads'][1]['k'] == beam, 'the QR says whose sheet it is; the other one was chosen by hand', out['reads'])
    check('มิ้นท์' in out['rv1_head'] and out['rv1_vals'] == ['kat', 'dog', 'ice cream'] and out['rv1_marks'] == ['✗', '✓', '✓'] and out['rv1_hand'] == 1, 'review: what AI read, marked against the key, the handwriting of question 1', (out['rv1_head'], out['rv1_vals'], out['rv1_marks'], out['rv1_hand']))
    check(out['fix_mark'] == '✓' and out['sum'] == 'ถูก 1/3', 'fixing a misread word re-marks it; ✓/✗ can be tapped', (out['fix_mark'], out['sum']))
    check('หา QR ไม่เจอ' in out['ask'] and out['rv2_marks'] == ['✓', '✗', '✗'], 'no QR: the teacher picks the student', (out['ask'], out['rv2_marks']))
    check(out['db_results'] == [(1, 3), (1, 3)] and any('มิ้นท์' in s and '1/3' in s for s in out['scores']), 'scores saved and shown', (out['db_results'], out['scores']))
    check(any('ice cream' in m and '2 คน' in m for m in out['miss']) and any('cat' in m and '1 คน' in m for m in out['miss']), 'the most missed words of the class', out['miss'])
    check(out['manual_rows'] == 3 and out['manual_hand'] == 0 and any('บีม' in s and '2/3' in s for s in out['scores2']), 'checking by hand works too', (out['manual_rows'], out['manual_hand'], out['scores2']))
    check(out['s1_set'] and out['s1_set'][1] == ['cat', 'ice cream'] and out['s1_mytests'] == [[1, 3, 2]], 'the student gets her missed words as a set to practise', (out['s1_set'], out['s1_mytests']))
    check(out['s1_tests'] and 'คะแนน 1/3 · ผิด 2 คำ' in out['s1_tests'][0] and '📝' in out['s1_practice'], 'her score in the class, and ▶ practise', (out['s1_tests'], out['s1_practice']))
    check(out['s2_set'] == 1 and out['s2_mytests'] == [[2, 3, 1]], 'one missed word left for บีม (ice cream) — a set for it', (out['s2_set'], out['s2_mytests']))
    check('แผ่นสอบรายชื่อเอง' in out['names_sec'], 'the classes page has 📝 tests with typed names', out['names_sec'])
    check(out['n_for'] == '__names' and out['n_box'] == 1 and '2 คน' in out['n_info'] and out['n_sample'] == '1 สมชาย', 'for: typed names — a box for them, a sample with the first name', (out['n_for'], out['n_box'], out['n_info'], out['n_sample']))
    check(out['n_names'] == ['1 สมชาย', '2 สมหญิง'] and out['n_qrs'] == 2, 'one sheet per typed name, with a QR', (out['n_names'], out['n_qrs']))
    check(out['n_db'] == [(True, ['1 สมชาย', '2 สมหญิง'], False)], 'saved for the teacher, no class, no accounts', out['n_db'])
    check('รายชื่อนี้ไม่ได้ผูกกับบัญชี' in out['n_view'] and 'ห้องเรียนทั้งหมด' in out['n_view'], 'opened from the classes page; scores for the teacher only', out['n_view'])
    check(out['n_reads'] and out['n_reads'][0]['k'] == 1 and '2 สมหญิง' in out['n_rv'], "the QR on สมหญิง's sheet finds her", (out['n_reads'], out['n_rv']))
    check(out['n_res'] == [(1, None, 1)] and any('สมหญิง' in x and '1/3' in x for x in out['n_scores']), 'her score is saved without an account', (out['n_res'], out['n_scores']))
    finish('test_class_tests', out, errs)

asyncio.run(main())
