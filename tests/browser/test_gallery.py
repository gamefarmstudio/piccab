"""Picture library (คลังภาพ): the admin imports a Gemini picture + JSON, sees the counts, fixes boxes and publishes;
a visitor finds the scene in the library by category and adds it to their own library (no AI)."""
import asyncio, json, os, tempfile, urllib.request
from PIL import Image, ImageDraw
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
def files():
    d=tempfile.mkdtemp()
    im=Image.new('RGB',(1200,900),'#f4ead8'); g=ImageDraw.Draw(im)
    g.rectangle((100,100,400,400),fill='#c0392b'); g.ellipse((600,150,800,350),fill='#f1c40f'); g.rectangle((300,550,900,800),fill='#2c7be5')
    im.save(os.path.join(d,'Kitchen.png'))
    gem={"piccab":1,"category":"home","title":"Kitchen","title_th":"ห้องครัว","level":"beginner","items":[
        {"word":"red box","th":"กล่องสีแดง","alts":[],"de":"Kiste","de_art":"die","de_alts":[],"box_2d":[111,83,444,333]},
        {"word":"sun","th":"ดวงอาทิตย์","alts":[],"box_2d":[167,500,389,667]},
        {"word":"Table","th":"","alts":["desk"],"box_2d":[611,250,889,750]},
        {"word":"sun","th":"ซ้ำ","box_2d":[0,0,100,100]}]}
    open(os.path.join(d,'Kitchen.json'),'w').write('Here you go:\n```json\n'+json.dumps(gem, ensure_ascii=False)+'\n```')
    open(os.path.join(d,'lonely.json'),'w').write('{}')
    return [os.path.join(d,f) for f in ('Kitchen.png','Kitchen.json','lonely.json')]
async def main():
    out={}; errs=[]
    async with async_playwright() as p:
        b=await launch(p)
        A=await newpage(b, errs); await A.goto(BASE+'/app'); await A.wait_for_timeout(500); await login(A,'boss@piccab.th')
        await A.click('#acctBtn'); await A.wait_for_timeout(300); await A.click('#mbox button:has-text("ดูแลระบบ")'); await A.wait_for_timeout(1000)
        await A.click('.admtabs button:has-text("คลังภาพ")'); await A.wait_for_timeout(1200)
        out['empty']=await A.inner_text('#adminView .aicards')
        await A.select_option('.galimp select.galcat', 'food')                    # the admin's choice wins over the JSON's "home"
        await A.set_input_files('.galfiles', files()); await A.wait_for_selector('#mbox h3:has-text("นำเข้าคลังภาพ")', timeout=30000)
        out['result']=await A.inner_text('#mbox'); await A.click('#mbox button.primary'); await A.wait_for_timeout(1500)
        out['cards']=await A.inner_text('#adminView .aicards')
        out['table']=await A.inner_text('#adminView table')
        out['row']=await A.inner_text('#adminView .galrow')
        await A.screenshot(path=shot('gal1_admin.png'), full_page=True)
        g=fake('/rest/v1/gallery_scenes')[0]
        out['db']=(g['category'], g['title'], g['title_th'], g['w'], g['h'], g['word_count'], g['img_ver'], g['published'])
        it=sorted(g['items'].values(), key=lambda x:x['word'])
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
        await b.close()
    check('หมวด\n4' in out['empty'] and 'ฉาก\n0' in out['empty'], 'admin: counts before import', out['empty'])
    check('นำเข้าแล้ว 1 ฉาก' in out['result'] and 'Kitchen: 3 คำ' in out['result'] and 'lonely (ไม่มีรูป)' in out['result'], 'import result: 1 scene, 3 words, a file without its pair', out['result'])
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
    finish('picture library', out, errs)
asyncio.run(main())
