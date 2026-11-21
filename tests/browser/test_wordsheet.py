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
SENT=[]; PICS=[]
async def extra(r):
    if r.request.url.endswith('/api/wordpics'):
        body=json.loads(r.request.post_data or '{}'); PICS.append([body.get('words'), body.get('draw'), body.get('redraw')])
        svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="30" fill="none" stroke="#333" stroke-width="4"/></svg>'
        return await r.fulfill(status=200, content_type='application/json', body=json.dumps({'pics': {w.lower(): svg for w in body.get('words',[])} if body.get('draw') else {}}))
    if r.request.url.endswith('/api/wordlist'):
        body = json.loads(r.request.post_data or '{}'); SENT.append(body.get('image',''))
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
        # 1) the first-visit card's link goes to 🎓 → 📚 word sets; paste the list into a new set
        await pg.click('.welcome .wslink'); await pg.wait_for_timeout(400)
        out['sets_tab']=(await pg.locator('#classView .socialtabs button.on').inner_text(), await pg.locator('#classView .tile.setnew').count(), await pg.locator('#classView .tile.setscan').count())
        await pg.click('.tile.setnew'); await pg.wait_for_timeout(250)
        out['rows0']=await pg.locator('.wsbox .wsr').count()
        await paste_words(pg, LIST); out['count']=await pg.inner_text('.wscount'); out['rows1']=await pg.locator('.wsbox .wsr').count()
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
        out['prefill']=(await set_words(pg))[:2]
        # Quizlet-style rows: + a word typed in a new row (Enter moves on), a word deleted and put back
        await pg.click('.wsbox .wsadd'); await pg.wait_for_timeout(100)
        await pg.locator('.wsbox .wst').last.fill('notebook'); await pg.locator('.wsbox .wst').last.press('Enter')
        out['enter_focus']=await pg.evaluate("document.activeElement.classList.contains('wsd')")
        await pg.keyboard.type('สมุด'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(100)
        out['enter_row']=await pg.locator('.wsbox .wsr').count()      # Enter on the last meaning adds a row
        await pg.locator('.wsbox .wsr').nth(1).locator('.wsdel').click(); await pg.wait_for_timeout(100)
        out['after_del']=(await set_words(pg))[:2]
        await paste_words(pg, 'giraffe ยีราฟ')                           # back again (at the end)
        await pg.click('.wsbox .row .primary'); await pg.wait_for_timeout(1000)
        sh2=(await pg.evaluate(SHEET))[0]; ida=dict((it['word'],k) for k,it in sh2['items'].items())
        out['ids_kept']=all(ida[w]==idb[w] for w in idb); out['n_after']=len(sh2['items'])
        out['star_after']=list((await pg.evaluate("JSON.parse(localStorage.getItem('pv-progress'))"))[sid].get('star',{}).keys())
        # 5) photo of a sheet → AI reads it; no 'how does the teacher test' choice: every sheet is listen-and-write
        await pg.click('#homeBtn'); await pg.wait_for_timeout(300)
        await pg.click('#bnav [data-view=library]'); await pg.wait_for_timeout(300); await pg.click('#importBtn'); await pg.wait_for_timeout(200)
        await pg.click('.wsimp'); await pg.wait_for_timeout(200)
        out['photo_btns']=await pg.locator('.wsbox .wstools .wsphoto').all_inner_texts()
        out['ws_notice']=await pg.inner_text('.wsbox .ainote')
        out['cam_capture']=await pg.get_attribute('.wsbox input.wscam','capture')
        await pg.set_input_files('.wsbox input.wsfile', PHOTO); await pg.wait_for_timeout(800)
        # box only part of the photo: drag from 25%,25% to 75%,60%
        st=await pg.locator('.wsbox .cropstage').bounding_box()
        await pg.mouse.move(st['x']+st['width']*.25, st['y']+st['height']*.25); await pg.mouse.down()
        for i in range(1,9): await pg.mouse.move(st['x']+st['width']*(.25+.5*i/8), st['y']+st['height']*(.25+.35*i/8)); await pg.wait_for_timeout(16)
        await pg.mouse.up(); await pg.wait_for_timeout(100)
        await pg.screenshot(path=shot('ws3_crop.png'))
        await pg.click('.wsbox .croppanel button.primary'); await pg.wait_for_timeout(1500)
        out['crop']=await pg.evaluate('''async ([sent, full])=>{ const sz=src=>new Promise(r=>{ const i=new Image(); i.onload=()=>r([i.naturalWidth,i.naturalHeight]); i.src=src; });
          return [await sz(sent), await sz(full)]; }''', [SENT[-1], 'data:image/jpeg;base64,'+__import__('base64').b64encode(open(PHOTO,'rb').read()).decode()])
        out['crop_gone']=await pg.locator('.wsbox .croppanel').count()==0 and await pg.locator('.wsbox .wstools').is_visible()
        out['ai_lines']=await set_words(pg); out['ai_count']=await pg.inner_text('.wscount')
        # 🎨 one word's picture from its row (the picture bank first — none here — then the AI, free 3 a set)
        await pg.locator('.wsbox .wsr').first.locator('.wspic.add').click(); await pg.wait_for_timeout(800)
        out['row_pic']=(await pg.locator('.wsbox .wsr').first.locator('.wspic img').count(), PICS[:])
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
        await pg.click('.welcome .wslink'); await pg.wait_for_timeout(300); left.update(await pg.evaluate(THAI_LEFT))
        await pg.click('.tile.setnew'); await pg.wait_for_timeout(250); left.update(await pg.evaluate(THAI_LEFT))
        await paste_words(pg, 'apple\nbanana'); await pg.fill('.wsbox input[type=date]', in3)
        await pg.click('.wsbox .row .primary'); await pg.wait_for_timeout(1000); await pg.click('#homeBtn'); await pg.wait_for_timeout(300)
        out['en_tile']=await pg.inner_text('.tile.exam'); left.update(await pg.evaluate(THAI_LEFT))
        await pg.click('.tile.exam'); await pg.wait_for_timeout(400); left.update(await pg.evaluate(THAI_LEFT))
        out['en_q']=await pg.inner_text('#mbox .rv-q')
        await b.close()
    out['thai_left']=sorted(left)
    check(out['sets_tab']==('ชุดคำศัพท์',1,1), 'the first-visit link opens 🎓 → 📚 word sets (make one / scan a sheet)', out['sets_tab'])
    check(out['rows0']==3 and out['rows1']==10, 'a new set starts with 3 empty rows; the pasted list fills one row per word', (out['rows0'], out['rows1']))
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
    check(out['enter_focus'] and out['enter_row']==12 and out['after_del']==['elephant ช้าง','butterfly ผีเสื้อ'], 'rows: Enter goes word → meaning → a new row; 🗑 deletes a row', (out['enter_focus'], out['enter_row'], out['after_del']))
    check(out['prefill']==['elephant ช้าง','giraffe ยีราฟ'] and out['ids_kept'] and out['n_after']==11 and out['star_after']==out['star'], 'editing the set keeps ids and progress', (out['prefill'], out['ids_kept'], out['n_after'], out['star_after']))
    (cw,ch),(fw,fh)=out['crop']
    check('ไม่ใช่คน' in out['ws_notice'] and 'ชื่อนักเรียน' in out['ws_notice'], 'word sheet photo: says it is AI, not a person, and to hide names', out['ws_notice'])
    check(out['photo_btns']==['สแกนชีท','รูปชีท'] and out['cam_capture']=='environment', 'camera or a saved photo', (out['photo_btns'], out['cam_capture']))
    check(out['row_pic'][0]==1 and out['row_pic'][1][-2:]==[[['kitchen'],False,False],[['kitchen'],True,True]], '🎨 on a row: the picture bank, then a free AI drawing of that word', out['row_pic'])
    check(abs(cw/fw-.5)<.04 and abs(ch/fh-.35)<.04 and out['crop_gone'], 'only the boxed part is sent to the AI', out['crop'])
    check(out['ai_lines']==['kitchen ห้องครัว','kettle กาน้ำ','toaster'] and out['ai_count']=='3 คำ', 'photo of the list read by AI', (out['ai_lines'], out['ai_count']))
    check('สอบจำลองทั้งชุด (3 คำ)' in out['pv'] and out['mock_title']=='📝 สอบจำลอง' and out['mock_n']=='1/3', 'practice test of the whole list', (out['pv'][:200], out['mock_title'], out['mock_n']))
    check(out['style_picker']==0 and 'ฟังแล้วเขียน' in out['mock_q'] and out['mock_listen_btn']==0, 'no test-style choice: the practice test is listen-and-write too', (out['style_picker'], out['mock_q'], out['mock_listen_btn']))
    check('Test in 3 days' in out['en_tile'] and 'Listen and write' in out['en_q'], 'English menus', (out['en_tile'], out['en_q']))
    check(out['thai_left']==[], 'no Thai left in English', out['thai_left'])
    finish('word lists', out, errs)
asyncio.run(main())
