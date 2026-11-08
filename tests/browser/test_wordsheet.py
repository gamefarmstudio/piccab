"""Word lists for dictation tests: paste or photograph the teacher's list → a scene of word cards with a test date,
a "test in N days" tile on home, dictation in the review round (the app reads the word), editing keeps progress."""
import asyncio, datetime, json, re
from playwright.async_api import async_playwright
from common import *
LIST = """1. elephant ช้าง
2. giraffe = ยีราฟ
3) butterfly (n.) - ผีเสื้อ
4. umbrella ร่ม
5. library ห้องสมุด
6. beautiful สวยงาม
7. Wednesday วันพุธ
8. vegetable ผัก
9. breakfast อาหารเช้า
10. dictionary"""
SPEAK = "window.__said=[]; if(window.speechSynthesis){ speechSynthesis.speak=u=>{ __said.push(u.text); }; }"
SHEET = "(()=>{ const a=JSON.parse(localStorage.getItem('pv-scenes2')||'[]'); return a.filter(s=>s.meta&&s.meta.kind==='list').map(s=>({name:s.name, meta:s.meta, items:s.items})); })()"
async def extra(r):
    if r.request.url.endswith('/api/wordlist'):
        body = json.loads(r.request.post_data or '{}')
        ok = str(body.get('image','')).startswith('data:image/jpeg;base64,')
        return await r.fulfill(status=200 if ok else 400, content_type='application/json',
            body=json.dumps({'items':[{'w':'kitchen','th':'ห้องครัว'},{'w':'kettle','th':'กาน้ำ'},{'w':'toaster','th':''}]} if ok else {'error':'bad_image'}))
    return False
async def main():
    out={}; errs=[]; left=set()
    in3=(datetime.date.today()+datetime.timedelta(days=3)).isoformat()
    async with async_playwright() as p:
        b=await launch(p)
        async def page(ui=None):
            ctx=await b.new_context(locale='th-TH', viewport={'width':390,'height':844}, is_mobile=True, has_touch=True, service_workers='block')
            await ctx.add_init_script(SPEAK)
            if ui: await ctx.add_init_script(f"localStorage.setItem('pv-ui', JSON.stringify('{ui}'))")
            pg=await ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
            await pg.route('**/*', lambda r: app_route(r, health='{"ai":true}', extra=extra)); await pg.goto('https://piccab.test/app'); await pg.wait_for_timeout(700)
            return pg
        pg=await page()
        # 1) paste the list from the first-visit card
        await pg.click('.welcome .wslink'); await pg.wait_for_timeout(200)
        await pg.fill('.wsbox textarea', LIST); out['count']=await pg.inner_text('.wscount')
        await pg.fill('.wsbox input[type=date]', in3)
        await pg.click('.wsbox .row .primary'); await pg.wait_for_timeout(1200)
        out['cards']=await pg.locator('#scene .item').count()
        # learning: the cards show the English word big with the meaning under it; the review modes hide it again
        out['learn_cards']=await pg.evaluate("[...document.querySelectorAll('#scene .lcards text')].map(t=>t.textContent).slice(0,4)")
        await pg.click('#modes button[data-mode=quiz]'); await pg.wait_for_timeout(400)
        out['quiz_cards']=await pg.locator('#scene .lcards').count()
        await pg.click('#modes button[data-mode=learn]'); await pg.wait_for_timeout(400)
        sh=(await pg.evaluate(SHEET))[0]
        out['words']=[it['word'] for it in sh['items'].values()]; out['th']=[it['th'] for it in sh['items'].values()]; out['meta']=sh['meta']
        out['img']=await pg.evaluate("(()=>{ const a=JSON.parse(localStorage.getItem('pv-scenes2')||'[]'); return a.length; })()")
        # 2) home: test countdown, no answer labels on the picture
        await pg.click('#homeBtn'); await pg.wait_for_timeout(400)
        out['tile']=await pg.inner_text('.tile.exam'); out['labels']=(await pg.locator('.cont .cimg').inner_text()).strip()
        await pg.screenshot(path=shot('ws1_home.png'), full_page=True)
        # 3) dictation: the app reads the word, the kid types it; listening isn't "help"
        await pg.click('.tile.exam'); await pg.wait_for_timeout(600)
        out['rv_title']=await pg.inner_text('#mbox h3'); out['rv_q']=await pg.inner_text('#mbox .rv-q')
        out['rv_listen_btn']=await pg.locator('#mbox .rv-tools button:has-text("ฟัง")').count()
        said=(await pg.evaluate('__said'))[-1]; out['said']=said
        await pg.click('#mbox .rv-play'); await pg.wait_for_timeout(100)
        await pg.fill('#rvIn', said); await pg.press('#rvIn','Enter'); await pg.wait_for_timeout(300)
        out['rv_msg']=await pg.inner_text('#rvMsg')
        await pg.screenshot(path=shot('ws2_dictation.png'))
        await pg.click('#mbox .x'); await pg.wait_for_timeout(300)
        prog=await pg.evaluate("JSON.parse(localStorage.getItem('pv-progress')||'{}')")
        sid=[k for k in prog if k!='tea'][0]; out['star']=list(prog[sid].get('star',{}).keys())
        idb=dict((it['word'],k) for k,it in sh['items'].items())
        # 4) edit the list (add a word): ids and progress stay
        await pg.click('.cont .primary.big'); await pg.wait_for_timeout(500)
        await pg.click('#editBtn'); await pg.wait_for_timeout(300)
        out['prefill']=(await pg.input_value('.wsbox textarea')).split('\n')[:2]
        await pg.fill('.wsbox textarea', (await pg.input_value('.wsbox textarea'))+'\nnotebook สมุด')
        await pg.click('.wsbox .row .primary'); await pg.wait_for_timeout(1000)
        sh2=(await pg.evaluate(SHEET))[0]; ida=dict((it['word'],k) for k,it in sh2['items'].items())
        out['ids_kept']=all(ida[w]==idb[w] for w in idb); out['n_after']=len(sh2['items'])
        out['star_after']=list((await pg.evaluate("JSON.parse(localStorage.getItem('pv-progress'))"))[sid].get('star',{}).keys())
        # 5) photo of a sheet → AI reads it; no 'how does the teacher test' choice: every sheet is listen-and-write
        await pg.click('#homeBtn'); await pg.wait_for_timeout(300)
        await pg.click('#bnav [data-view=library]'); await pg.wait_for_timeout(300); await pg.click('#importBtn'); await pg.wait_for_timeout(200)
        await pg.click('.wsimp'); await pg.wait_for_timeout(200)
        await pg.set_input_files('.wsbox input[type=file]', PHOTO); await pg.wait_for_timeout(1200)
        out['ai_lines']=(await pg.input_value('.wsbox textarea')).split('\n'); out['ai_count']=await pg.inner_text('.wscount')
        out['style_picker']=await pg.locator('.wsbox .wsstyle, .wsbox [aria-label="ครูสอบแบบไหน"]').count()
        await pg.fill('.wsbox input[aria-label="ชื่อชุดคำ"]','Kitchen words')
        await pg.screenshot(path=shot('ws3_photo.png'))
        await pg.click('.wsbox .row .primary'); await pg.wait_for_timeout(1000)
        await pg.click('#homeBtn'); await pg.wait_for_timeout(300); await pg.click('#bnav [data-view=library]'); await pg.wait_for_timeout(300)
        await pg.locator('#libList .lcard:has-text("Kitchen words")').click(); await pg.wait_for_timeout(300)
        out['pv']=await pg.inner_text('#mbox')
        await pg.click('#mbox .modebtn.primary'); await pg.wait_for_timeout(500)
        out['mock_title']=await pg.inner_text('#mbox h3'); out['mock_q']=await pg.inner_text('#mbox .rv-q'); out['mock_n']=await pg.inner_text('#mbox .rv-n')
        out['mock_listen_btn']=await pg.locator('#mbox .rv-tools button:has-text("ฟัง")').count()
        await pg.context.close()
        # 6) English menus: nothing Thai left in the dialog, tile and dictation
        pg=await page('en')
        await pg.click('.welcome .wslink'); await pg.wait_for_timeout(200); left.update(await pg.evaluate(THAI_LEFT))
        await pg.fill('.wsbox textarea', 'apple\nbanana'); await pg.fill('.wsbox input[type=date]', in3)
        await pg.click('.wsbox .row .primary'); await pg.wait_for_timeout(1000); await pg.click('#homeBtn'); await pg.wait_for_timeout(300)
        out['en_tile']=await pg.inner_text('.tile.exam'); left.update(await pg.evaluate(THAI_LEFT))
        await pg.click('.tile.exam'); await pg.wait_for_timeout(400); left.update(await pg.evaluate(THAI_LEFT))
        out['en_q']=await pg.inner_text('#mbox .rv-q')
        await b.close()
    out['thai_left']=sorted(left)
    check(out['count']=='10 คำ' and out['cards']==10, 'pasted list → 10 word cards', (out['count'], out['cards']))
    check(out['words']==['elephant','giraffe','butterfly','umbrella','library','beautiful','Wednesday','vegetable','breakfast','dictionary'], 'words read from numbered / = / (n.) - lines', out['words'])
    check(out['th'][:3]==['ช้าง','ยีราฟ','ผีเสื้อ'] and out['th'][-1]=='', 'Thai meanings kept', out['th'])
    check(out['meta']=={'kind':'list','exam':in3,'style':'listen'}, 'test date and style saved with the scene', out['meta'])
    check('สอบอีก 3 วัน' in out['tile'] and '0/10' in out['tile'], 'home shows the test countdown', out['tile'])
    check(out['learn_cards']==['elephant','ช้าง','giraffe','ยีราฟ'] and out['quiz_cards']==0, 'learning shows English + meaning on the cards; review hides the English', (out['learn_cards'], out['quiz_cards']))
    check(out['labels']=='', 'no answer labels on the sheet picture', out['labels'])
    check(out['rv_title']=='📝 เขียนตามคำบอก' and 'ฟังแล้วเขียน' in out['rv_q'] and out['rv_listen_btn']==0, 'dictation round: listen and write', (out['rv_title'], out['rv_q'], out['rv_listen_btn']))
    check(out['said'] in out['words'] and '★' in out['rv_msg'], 'the app reads the word; replaying it still earns a ★', (out['said'], out['rv_msg']))
    check(len(out['star'])==1, 'answer saved', out['star'])
    check(out['prefill']==['elephant ช้าง','giraffe ยีราฟ'] and out['ids_kept'] and out['n_after']==11 and out['star_after']==out['star'], 'editing the list keeps ids and progress', (out['prefill'], out['ids_kept'], out['n_after'], out['star_after']))
    check(out['ai_lines']==['kitchen ห้องครัว','kettle กาน้ำ','toaster'] and out['ai_count']=='3 คำ', 'photo of the list read by AI', (out['ai_lines'], out['ai_count']))
    check('สอบจำลองทั้งชุด (3 คำ)' in out['pv'] and out['mock_title']=='📝 สอบจำลอง' and out['mock_n']=='1/3', 'practice test of the whole list', (out['pv'][:200], out['mock_title'], out['mock_n']))
    check(out['style_picker']==0 and 'ฟังแล้วเขียน' in out['mock_q'] and out['mock_listen_btn']==0, 'no test-style choice: the practice test is listen-and-write too', (out['style_picker'], out['mock_q'], out['mock_listen_btn']))
    check('Test in 3 days' in out['en_tile'] and 'Listen and write' in out['en_q'], 'English menus', (out['en_tile'], out['en_q']))
    check(out['thai_left']==[], 'no Thai left in English', out['thai_left'])
    finish('word lists', out, errs)
asyncio.run(main())
