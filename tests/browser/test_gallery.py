"""Picture library (คลังภาพ): the admin imports a Gemini picture + JSON, sees the counts, fixes boxes and publishes;
a visitor finds the scene in the library by category and adds it to their own library (no AI)."""
import asyncio, json, os, struct, tempfile, urllib.request, zlib
from playwright.async_api import async_playwright
from common import *
BASE=SERVER
async def fwd(r):
    resp=await r.fetch(url=r.request.url.replace('https://oftzpfyydnmahkntucnj.supabase.co', FAKE)); await r.fulfill(response=resp)
async def newpage(b, errs, vw=1200, vh=900, mobile=False):
    ctx=await b.new_context(locale='th-TH', viewport={'width':vw,'height':vh}, is_mobile=mobile, has_touch=mobile, service_workers='block')
    pg=await ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e))); await pg.route('https://oftzpfyydnmahkntucnj.supabase.co/**', fwd); return pg
async def login(pg, em):
    await pg.click('#acctBtn'); await pg.fill('.mbox input[type=email]',em); await pg.click('.mbox button.primary'); await pg.wait_for_timeout(400)
    await pg.type('.mbox input.code','123456'); await pg.press('.mbox input.code','Enter'); await pg.wait_for_timeout(2500)
def fake(path):
    with urllib.request.urlopen(urllib.request.Request(FAKE+path, headers={'apikey':'sb_secret_test','authorization':'Bearer sb_secret_test'})) as x: return json.loads(x.read() or b'null')
def png(path, w, h, shapes, bg):
    # a small PNG writer (no Pillow on CI): shapes = [(x0, y0, x1, y1, (r,g,b))], drawn as rectangles
    rows=[]
    for y in range(h):
        row=bytearray(bg*w)
        for x0,y0,x1,y1,c in shapes:
            if y0<=y<y1: row[x0*3:x1*3]=bytes(c)*(x1-x0)
        rows.append(b'\x00'+bytes(row))
    chunk=lambda t,d: struct.pack('>I',len(d))+t+d+struct.pack('>I',zlib.crc32(t+d)&0xffffffff)
    open(path,'wb').write(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',w,h,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(b''.join(rows)))+chunk(b'IEND',b''))
def files():
    d=tempfile.mkdtemp()
    png(os.path.join(d,'Kitchen.png'), 1200, 900, [(100,100,400,400,(192,57,43)),(600,150,800,350,(241,196,15)),(300,550,900,800,(44,123,229))], (244,234,216))
    gem={"piccab":1,"category":"home","title":"Kitchen","title_th":"ห้องครัว","level":"beginner","items":[
        {"word":"red box","th":"กล่องสีแดง","alts":[],"de":"Kiste","de_art":"die","de_alts":[],"cefr":"A1","box_2d":[111,83,444,333]},
        {"word":"sun","th":"ดวงอาทิตย์","alts":[],"cefr":"pre-A1","box_2d":[167,500,389,667]},
        {"word":"Table","th":"","alts":["desk"],"box_2d":[611,250,889,750]},
        {"word":"sun","th":"ซ้ำ","box_2d":[0,0,100,100]}],
        "sentences":[{"en":"The red box is on the table.","th":"กล่องสีแดงอยู่บนโต๊ะ","words":["red box"]},
                     {"en":"There are two suns.","th":"มีดวงอาทิตย์สองดวง","words":[]},
                     {"en":"It is a nice day.","th":"วันนี้อากาศดี","words":["day"]}]}
    open(os.path.join(d,'Kitchen.json'),'w').write('Here you go:\n```json\n'+json.dumps(gem, ensure_ascii=False)+'\n```')
    open(os.path.join(d,'lonely.json'),'w').write('{}')
    open(os.path.join(d,'kitchen-sentences.json'),'w').write(json.dumps({"title":"kitchen","sentences":[{"en":"The desk is big.","th":"โต๊ะใหญ่","words":["desk"]},{"en":"The sun is hot.","th":"ดวงอาทิตย์ร้อน"}]}, ensure_ascii=False))
    return [os.path.join(d,f) for f in ('Kitchen.png','Kitchen.json','lonely.json','kitchen-sentences.json')]
async def main():
    out={}; errs=[]
    async with async_playwright() as p:
        b=await launch(p)
        A=await newpage(b, errs); await A.goto(BASE+'/app'); await A.wait_for_timeout(500); await login(A,'boss@piccab.th')
        await A.click('#acctBtn'); await A.wait_for_timeout(300); await A.click('#mbox button:has-text("ดูแลระบบ")'); await A.wait_for_timeout(1000)
        await A.click('.admtabs button:has-text("คลังภาพ")'); await A.wait_for_timeout(1200)
        out['empty']=await A.inner_text('#adminView .aicards')
        await A.select_option('.galimp select.galcat', 'food')                    # the admin's choice wins over the JSON's "home"
        F=files()
        await A.set_input_files('.galfiles', F[:3]); await A.wait_for_selector('#mbox h3:has-text("นำเข้าคลังภาพ")', timeout=30000)
        out['result']=await A.inner_text('#mbox'); await A.click('#mbox button.primary'); await A.wait_for_timeout(1500)
        out['sent_db']=fake('/rest/v1/gallery_scenes')[0].get('sentences')
        out['cards']=await A.inner_text('#adminView .aicards')
        out['table']=await A.inner_text('#adminView table')
        out['row']=await A.inner_text('#adminView .galrow')
        out['cefr_btn']=await A.locator('#adminView button:has-text("ใส่ระดับ CEFR")').count()
        # after an import the list shows that category's drafts; other filters
        out['chip_on']=await A.inner_text('.galchips button.on'); out['st_on']=await A.inner_text('.galst button.on')
        await A.click('.galst button:has-text("เผยแพร่แล้ว")'); await A.wait_for_timeout(300); out['pub_rows']=await A.locator('.galrow').count()
        await A.locator('table .galnum.draft').last.click(); await A.wait_for_timeout(300)
        out['via_num']=[await A.inner_text('.galchips button.on'), await A.inner_text('.galst button.on'), await A.locator('.galrow').count()]
        out['banner']=await A.inner_text('.galdrafts')
        await A.screenshot(path=shot('gal1_admin.png'), full_page=True)
        g=fake('/rest/v1/gallery_scenes')[0]
        out['db']=(g['category'], g['title'], g['title_th'], g['w'], g['h'], g['word_count'], g['img_ver'], g['published'])
        it=sorted(g['items'].values(), key=lambda x:x['word'])
        # a JSON file alone adds sentences to the scene with that title
        await A.set_input_files('.galfiles', F[3:]); await A.wait_for_selector('#mbox h3:has-text("นำเข้าคลังภาพ")', timeout=30000)
        out['result2']=await A.inner_text('#mbox'); await A.click('#mbox button.primary'); await A.wait_for_timeout(1500)
        out['sent_db2']=[(x['en'],x['words']) for x in fake('/rest/v1/gallery_scenes')[0].get('sentences')]
        # 💬 see and fix them
        await A.click('.galrow button:has-text("ประโยค")'); await A.wait_for_timeout(500)
        out['sent_modal']=await A.inner_text('#mbox')+'|'+'|'.join(await A.locator('#mbox .galsent textarea').evaluate_all("a=>a.map(i=>i.value)"))
        await A.screenshot(path=shot('gal4_sentences.png'))
        await A.fill('#mbox .galsent:nth-child(1) textarea.en','The desk and the red box.'); await A.wait_for_timeout(100)
        out['sent_words_live']=await A.inner_text('#mbox .galsent:nth-child(1) .galsw')
        await A.click('#mbox .galsent:nth-child(2) button.danger'); await A.wait_for_timeout(100)
        await A.click('#mbox button:has-text("เพิ่มประโยค")'); await A.fill('#mbox .galsent:nth-child(2) textarea.en','A sunny table.'); await A.fill('#mbox .galsent:nth-child(2) textarea.th','โต๊ะกลางแดด')
        await A.click('#mbox button:has-text("บันทึก")'); await A.wait_for_timeout(1500)
        out['sent_db3']=[(x['en'],x['th'],x['words']) for x in fake('/rest/v1/gallery_scenes')[0].get('sentences')]
        out['row_sent']=await A.inner_text('#adminView .galrow')
        out['items']=[(x['word'], x['x'], x['y'], x['w'], x['h'], x.get('l')) for x in it]
        # fix boxes with the normal editor, then send them back
        await A.click('.galrow button:has-text("แก้กรอบ")'); await A.wait_for_timeout(1500)
        out['editing']=await A.evaluate("!!document.querySelector('#scene') && document.body.classList.contains('editing')")
        out['bar']=await A.inner_text('#galEditBar') if await A.locator('#galEditBar').is_visible() else ''
        out['copies']=await A.evaluate("Object.keys(JSON.parse(localStorage.getItem('pv-gal-edit')||'{}')).length")
        await A.screenshot(path=shot('gal3_edit.png'))
        await A.click('#galEditBar button.primary'); await A.wait_for_timeout(2000)
        out['back']=[await A.locator('#adminView').is_visible(), await A.inner_text('.admtabs button.on')]
        out['copies_after']=await A.evaluate("Object.keys(JSON.parse(localStorage.getItem('pv-gal-edit')||'{}')).length")
        out['upd_btn']=await A.locator('.galrow button:has-text("อัปเดตจากฉบับแก้ไข")').count()
        await A.click('.galrow button:has-text("เผยแพร่")'); await A.wait_for_timeout(1500)
        out['after_pub']=await A.inner_text('#adminView .libempty')                  # gone from the drafts
        await A.click('.galst button:has-text("เผยแพร่แล้ว")'); await A.wait_for_timeout(300)
        out['pill']=await A.inner_text('.galrow .pill')
        await A.context.close()
        # a visitor finds it in the library and adds it
        V=await newpage(b, errs, 390, 844, True); await V.goto(BASE+'/app'); await V.wait_for_timeout(1500)
        await V.click('#bnav [data-view=library]'); await V.wait_for_timeout(1500)
        out['lib']=await V.inner_text('#galBox')
        out['thumb']=await V.evaluate("(()=>{ const i=document.querySelector('#galBox .galcard img'); return i && i.complete && i.naturalWidth; })()")
        await V.screenshot(path=shot('gal2_library.png'), full_page=True)
        await V.click('#galBox .galcard'); await V.wait_for_timeout(1200)
        out['modal']=await V.inner_text('#mbox')
        await V.click('#mbox button.primary'); await V.wait_for_timeout(2500)
        out['opened']=await V.evaluate("[...document.querySelectorAll('#scene .item')].length")
        out['saved']=await V.evaluate("Object.keys(JSON.parse(localStorage.getItem('pv-gal')||'{}')).length")
        await V.click('#bnav [data-view=library]') if await V.locator('#bnav [data-view=library]').is_visible() else (await V.click('#homeBtn'), await V.click('#bnav [data-view=library]'))
        await V.wait_for_timeout(800)
        out['check']=await V.locator('#galBox .galcard .own').count()
        # ✍️ sentence game: the library scene's sentences, words put in order
        await V.click('#galBox .galcard'); await V.wait_for_timeout(800); await V.click('#mbox button.primary'); await V.wait_for_timeout(1500)
        sb=V.locator('#modes button[data-mode="sent"]')
        out['sent_btn']=await sb.is_visible()
        await sb.click(); await V.wait_for_timeout(500)
        EN={'โต๊ะใหญ่':'The desk and the red box.','โต๊ะกลางแดด':'A sunny table.'}
        out['sent_play']=[]
        async def tap(t):
            await V.locator('.sentgame .spool .stile').filter(has_text=t).filter(has=V.locator(f'text="{t}"')).first.click(); await V.wait_for_timeout(120)
        for rnd in range(2):
            th=await V.inner_text('.sentgame .sth'); words=EN[th].split()
            lit=await V.locator('#scene .hs.sw').count()
            if rnd==0:
                pool=await V.locator('.sentgame .spool .stile').all_inner_texts()
                for t in pool: await tap(t)
                bad=await V.locator('.sentgame .sline.bad').count()
                await V.screenshot(path=shot('gal5_sent_bad.png'))
                await V.wait_for_timeout(1300)
                kept=await V.locator('.sentgame .sline .stile').all_inner_texts()
                for t in words[len(kept):]: await tap(t)
                out['sent_play'].append((th, lit>0, bad, kept==words[:len(kept)], await V.inner_text('.sentgame .smsg')))
            else:
                # drag: the 2nd word into the line, then the 1st word in front of it, the rest by tapping
                cdp=await V.context.new_cdp_session(V)
                async def drag(t, to, touch=False):   # with the mouse, or a finger
                    b=await V.locator('.sentgame .spool .stile').filter(has=V.locator(f'text="{t}"')).first.bounding_box()
                    x0,y0=b['x']+b['width']/2, b['y']+b['height']/2; x1,y1=await to()
                    if touch: await cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x0,'y':y0}]})
                    else: await V.mouse.move(x0,y0); await V.mouse.down()
                    for i in range(1,11):
                        x,y=x0+(x1-x0)*i/10, y0+(y1-y0)*i/10
                        if touch: await cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':x,'y':y}]})
                        else: await V.mouse.move(x,y)
                        await V.wait_for_timeout(16)
                    out['sent_caret']=out.get('sent_caret',0)+await V.locator('.sentgame .scaret').count()
                    if touch: await cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
                    else: await V.mouse.up()
                    await V.wait_for_timeout(200)
                async def line_mid():
                    b=await V.locator('.sentgame .sline').bounding_box(); return b['x']+b['width']/2, b['y']+b['height']/2
                async def before_first():
                    b=await V.locator('.sentgame .sline .stile').first.bounding_box(); return b['x']+4, b['y']+b['height']/2
                await drag(words[1], line_mid); await drag(words[0], before_first, True)
                out['sent_dragged']=await V.locator('.sentgame .sline .stile').all_inner_texts()
                for t in words[2:]: await tap(t)
                await V.screenshot(path=shot('gal6_sent_good.png'))
                out['sent_play'].append((th, lit>0, await V.inner_text('.sentgame .smsg'), await V.inner_text('.sentgame .pill')))
            await V.wait_for_timeout(2500)
        out['sent_done']=await V.inner_text('.sentgame')
        out['sent_round']=await V.inner_text('.rdend')                               # ⭐ end-of-round card
        await V.screenshot(path=shot('gal7_sent_done.png'))
        await V.click('.rdend button:has-text("ปิด")'); await V.wait_for_timeout(300)
        # level 2: the missing word, from the choices or by tapping it in the picture
        await V.click('.sentgame .slv button:has-text("เติมคำ")'); await V.wait_for_timeout(300)
        its=await V.evaluate("(()=>{ const a=JSON.parse(localStorage.getItem('pv-scenes2')||'[]'); const sc=a[a.length-1]; return Object.fromEntries(Object.entries(sc.items).map(([k,v])=>[v.word,k])); })()")
        out['fill']=[]
        for rnd in range(2):
            txt=await V.inner_text('.sentgame .sfill'); opts=await V.locator('.sentgame .sopts .stile').all_inner_texts()
            ans='red box' if txt.strip().endswith('the ?.') else 'Table'   # 'The desk and the ?.' / 'The ? and the red box.' / 'A sunny ?.'
            lit_before=await V.locator('#scene .hs.sw').count()
            if rnd==0:
                await V.locator('.sentgame .sopts .stile').filter(has_not_text=ans).first.click(); await V.wait_for_timeout(200)
                wrong=(await V.locator('.sentgame .sopts .stile.bad').count(), await V.inner_text('.sentgame .smsg'))
                bb=await V.locator(f'#scene .hs[data-id="{its[ans]}"]').bounding_box()
                await V.mouse.click(bb['x']+bb['width']/2, bb['y']+bb['height']/2); await V.wait_for_timeout(300)
                out['fill'].append((txt, lit_before, wrong, await V.inner_text('.sentgame .smsg'), await V.inner_text('.sentgame .sblank'), await V.locator('#scene .hs.sw').count()))
                await V.screenshot(path=shot('gal8_fill.png'))
            else:
                await V.locator('.sentgame .sopts .stile', has_text=ans).first.click(); await V.wait_for_timeout(300)
                out['fill'].append((txt, lit_before, await V.inner_text('.sentgame .smsg'), await V.inner_text('.sentgame .pill')))
            await V.wait_for_timeout(2600)
        out['fill_done']=await V.inner_text('.sentgame')
        await V.click('.rdend button:has-text("ปิด")'); await V.wait_for_timeout(300)
        # 🧭 learning path: choose a school year on the home card, then that level's topics and scenes
        await V.click('#homeBtn'); await V.wait_for_timeout(300)
        if await V.locator('#bnav [data-view=home]').is_visible(): await V.click('#bnav [data-view=home]')
        await V.wait_for_timeout(600)
        out['ptile']=await V.inner_text('#homeView .ptile')
        await V.click('#homeView .ptile'); await V.wait_for_timeout(500)
        out['ppick']=await V.inner_text('#pathView .ppick')
        await V.locator('#pathView .ppickgrid button', has_text='ป.1–2').click(); await V.wait_for_timeout(600)
        out['plevel']=await V.inner_text('#pathView .plevel')
        out['ptopics']=await V.locator('#pathView .ptopic').all_inner_texts()
        out['pcefr']=await V.locator('#pathView .pcrow').all_inner_texts()
        out['pcards']=await V.locator('#pathView .galcard').count()
        await V.screenshot(path=shot('gal9_path.png'), full_page=True)
        await V.locator('#pathView .pstages button', has_text='ม.1–3').click(); await V.wait_for_timeout(300)
        out['pempty']=await V.inner_text('#pathView .plevel')
        out['pstore']=await V.evaluate("localStorage.getItem('pv-stage')")
        await V.click('#bnav [data-view=home]'); await V.wait_for_timeout(300)
        out['ptile2']=await V.inner_text('#homeView .ptile')
        out['sent_meta']=await V.evaluate("(()=>{ const a=JSON.parse(localStorage.getItem('pv-scenes2')||'[]'); return a.map(x=>x.meta&&x.meta.gal).filter(Boolean).length; })()")
        await b.close()
    check('หมวด\n4' in out['empty'] and 'ฉาก\n0' in out['empty'], 'admin: counts before import', out['empty'])
    check('นำเข้าแล้ว 1 ฉาก' in out['result'] and 'Kitchen: 3 คำ · ประโยค 3' in out['result'] and 'lonely (ไม่มีรูป)' in out['result'], 'import result: 1 scene, 3 words, 3 sentences, a file without its pair', out['result'])
    check('null' not in out['result'], 'no stray null in the import result', out['result'])
    check('อาหาร' in out['chip_on'] and 'ร่าง 1' in out['chip_on'] and 'ฉบับร่าง (1)' in out['st_on'] and out['pub_rows']==0, 'after import: that category, drafts shown', (out['chip_on'], out['st_on'], out['pub_rows']))
    check('ทุกหมวด' in out['via_num'][0] and 'ฉบับร่าง' in out['via_num'][1] and out['via_num'][2]==1 and 'ฉบับร่าง 1 ฉาก' in out['banner'], 'draft number in the table goes to the drafts', (out['via_num'], out['banner']))
    check('ไม่มีฉบับร่าง' in out['after_pub'], 'a published scene leaves the drafts list', out['after_pub'])
    check(out['sent_db']==[{'en':'The red box is on the table.','th':'กล่องสีแดงอยู่บนโต๊ะ','words':['red box','table']},{'en':'There are two suns.','th':'มีดวงอาทิตย์สองดวง','words':['sun']},{'en':'It is a nice day.','th':'วันนี้อากาศดี','words':[]}], 'sentences saved; their words found in the scene (plural too)', out['sent_db'])
    check('เติมประโยคแล้ว 1 ฉาก' in out['result2'] and 'kitchen-sentences → Kitchen · ห้องครัว: 2 ประโยค' in out['result2'], 'a JSON alone adds sentences to the scene by title', out['result2'])
    check(out['sent_db2']==[('The desk is big.',['table']),('The sun is hot.',['sun'])], 'sentences replaced; an other name (desk) counts as the word', out['sent_db2'])
    check('The desk is big.' in out['sent_modal'] and '4 คำ · คำจากฉาก: table' in out['sent_modal'], 'sentence editor lists them with their scene words', out['sent_modal'])
    check(out['sent_words_live']=='6 คำ · คำจากฉาก: red box, table', 'scene words update while typing', out['sent_words_live'])
    check(out['sent_db3']==[('The desk and the red box.','โต๊ะใหญ่',['red box','table']),('A sunny table.','โต๊ะกลางแดด',['table'])], 'edited sentences saved', out['sent_db3'])
    check('ประโยค 2' in out['row_sent'], 'row shows the sentence count', out['row_sent'])
    check(out['db']==('food','Kitchen','ห้องครัว',1152,864,3,1,False), 'saved as a draft: cropped 4%, picture uploaded', out['db'])
    check(out['items'][0][0]=='Table' and out['items'][1]==('red box',100,100,300,300,{'de':{'w':'Kiste','a':'die','alts':[]}}), 'boxes from box_2d in pixels, German kept', out['items'])
    check('คำศัพท์ทั้งหมด\n3' in out['cards'] and 'คำไม่ซ้ำ 3 คำ' in out['cards'] and 'ต้องตรวจ\n1' in out['cards'] and 'เผยแพร่ 0 · ฉบับร่าง 1' in out['cards'], 'counts after import', out['cards'])
    check('อาหารและผลไม้\t0\t1\t3\t3' in out['table'] and 'รวม\t0\t1\t3\t3' in out['table'], 'per-category table', out['table'])
    check('ฉบับร่าง' in out['row'] and 'Table (?)' in out['row'], 'draft row lists words, flags the missing Thai', out['row'])
    check(out['editing'] and 'กำลังแก้ฉากในคลังภาพ' in out['bar'] and out['copies']==1, 'fix boxes in the editor with a bar on top', (out['editing'], out['bar'], out['copies']))
    check(out['back']==[True,'🖼️ คลังภาพ'] and out['copies_after']==0 and out['upd_btn']==0, 'save → back on the admin library tab, editing copy removed', (out['back'], out['copies_after'], out['upd_btn']))
    check(out['pill']=='เผยแพร่แล้ว', 'published', out['pill'])
    check('คลังภาพ Piccab' in out['lib'] and 'อาหารและผลไม้' in out['lib'] and 'Kitchen' in out['lib'] and out['thumb'], 'visitor sees the library by category with a thumbnail', (out['lib'], out['thumb']))
    check('red box' in out['modal'] and 'เก็บเข้าคลัง' in out['modal'], 'preview lists the words', out['modal'])
    check(out['opened']==3 and out['saved']==1 and out['check']==1, 'added to my library and opened; marked as added', (out['opened'], out['saved'], out['check']))
    check('💬 2' in out['lib'], 'library card shows how many sentences', out['lib'])
    check(out['sent_btn'], 'sentence game shows for a library scene with sentences', out['sent_btn'])
    p=out['sent_play']
    check(len(p)==2 and p[0][1] and p[0][2]==1 and p[0][3] and p[0][4]=='✓ ถูกต้อง' and p[1][2]=='✓ ถูกต้อง ได้ ★' and p[1][3].endswith('★ 1'),
          'play: wrong order shakes and keeps the right start; right first time earns ★; scene words lit', p)
    check(out['sent_dragged']==[w for w in ({'โต๊ะใหญ่':'The desk and the red box.','โต๊ะกลางแดด':'A sunny table.'}[p[1][0]]).split()][:2] and out['sent_caret']==2, 'drag words into the line, and in front of another', (out['sent_dragged'], out.get('sent_caret')))
    check('เรียงครบ 2 ประโยคแล้ว' in out['sent_done'] and '★☆' in out['sent_done'] and 'ถูกตั้งแต่ครั้งแรก 1/2' in out['sent_done'], 'round summary with stars', out['sent_done'])
    f=out['fill']
    check(len(f)==2 and '?' in f[0][0] and f[0][1]==0 and f[0][2][0]==1 and 'ยังไม่ใช่' in f[0][2][1] and f[0][3]=='✓ ถูกต้อง' and f[0][4]!='?' and f[0][5]==1
          and f[1][2]=='✓ ถูกต้อง ได้ ★' and f[1][3].endswith('★ 1'), 'level 2: a wrong choice is crossed out, tapping the thing in the picture answers; no picture hint before', f)
    check('เรียงประโยคครบแล้ว' in out['sent_round'] and '1/2' in out['sent_round'], 'end-of-round card after the sentences', out['sent_round'])
    check('เติมครบ 2 ประโยคแล้ว' in out['fill_done'] and '★☆' in out['fill_done'], 'level 2 summary', out['fill_done'])
    check('CEFR 2/3' in out['row'] and out['cefr_btn']==1, 'admin: CEFR levels imported (2 of 3 words), a button to fill the rest', (out['row'], out['cefr_btn']))
    check(len(out['pcefr'])==2 and out['pcefr'][0].startswith('Pre-A1') and '/1' in out['pcefr'][0] and out['pcefr'][1].startswith('A1'), 'path: words by CEFR level', out['pcefr'])
    check('เลือกระดับชั้น' in out['ptile'] and 'เรียนอยู่ชั้นไหน' in out['ppick'], 'home card opens the path; first it asks the school year', (out['ptile'], out['ppick']))
    check('ป.1–2' in out['plevel'] and 'CEFR Pre-A1' in out['plevel'] and '/ 3 คำ · 1 ฉาก' in out['plevel'] and len(out['ptopics'])==1 and '1 ฉาก · 3 คำ' in out['ptopics'][0] and out['pcards']==1,
          'level card (CEFR, words known), its topics and scenes', (out['plevel'], out['ptopics'], out['pcards']))
    check('ยังไม่มีฉาก' in out['pempty'] and out['pstore']=='"m13"' and 'ม.1–3' in out['ptile2'] and 'CEFR A2' in out['ptile2'], 'another school year: kept, and shown on the home card', (out['pempty'], out['pstore'], out['ptile2']))
    check(out['sent_meta']>=1, 'the copy remembers its library scene (meta.gal)', out['sent_meta'])
    finish('picture library', out, errs)
asyncio.run(main())
