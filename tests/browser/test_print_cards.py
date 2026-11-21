# 🖨️ Printable flashcards: from a scene's preview, cards with the word's picture, the meaning on the back
# (each row reversed for two-sided printing) or under the word, 8 or 12 a page; printed by the browser (Save as PDF).
import asyncio, json, base64
from playwright.async_api import async_playwright
from common import *
async def main():
    out={}; errs=[]
    img='data:image/png;base64,'+base64.b64encode(open(PHOTO,'rb').read()).decode()
    async with async_playwright() as p:
        b=await launch(p)
        ctx=await b.new_context(locale='th-TH', viewport={'width':1100,'height':900}, service_workers='block')
        await ctx.add_init_script("window.print=()=>{ window.__printed=(window.__printed||0)+1; };")
        pg=await ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.route('**/*', lambda r: app_route(r)); await pg.goto('https://piccab.test/app'); await pg.wait_for_timeout(500)
        await pg.evaluate("""(img)=>{ const it={}; const W=['cat','sofa','lamp','rug','clock','plant','book','cup','vase','fan'], T=['แมว','โซฟา','โคมไฟ','พรม','นาฬิกา','ต้นไม้','หนังสือ','ถ้วย','แจกัน','พัดลม'];
          W.forEach((w,i)=>{ it['a'+i]={word:w,th:T[i],alts:[],x:40+(i%5)*220,y:60+Math.floor(i/5)*400,w:180,h:300}; });
          const sc={id:'s1pc',name:'My room',w:1200,h:900,img,items:it};
          localStorage.setItem('pv-scenes2',JSON.stringify([sc])); localStorage.setItem('pv-scene','s1pc'); }""", img)
        await pg.reload(); await pg.wait_for_timeout(700)
        await pg.click('.mainnav [data-view=library]'); await pg.wait_for_timeout(300)
        await pg.locator('#libList .lcard:has-text("My room")').click(); await pg.wait_for_timeout(400)
        await pg.click('#mbox button:has-text("แฟลชการ์ด")'); await pg.wait_for_timeout(300)
        out['modal']=await pg.inner_text('#mbox')
        # 👀 the preview first: the pages as they will print
        await pg.click('#mbox button.primary'); await pg.wait_for_timeout(1200)
        out['pv_printed']=await pg.evaluate('window.__printed||0')
        out['pv_words']=await pg.locator('.pcprev .pcard .pw').all_inner_texts()
        out['pv_pages']=await pg.locator('.pcprev .ppage').count()
        out['pv_info']=await pg.inner_text('.pcinfo')
        await pg.screenshot(path=shot('pc_preview.png'))
        # take "sofa" out, bring it back, take it out again
        card=lambda w: pg.locator('.pcprev .pcard', has=pg.locator('.pw', has_text=w)).first
        await card('sofa').hover(); await card('sofa').locator('.pcx').click(); await pg.wait_for_timeout(200)
        out['rm_words']=await pg.locator('.pcprev .pcard .pw').all_inner_texts(); out['rm_info']=await pg.inner_text('.pcinfo')
        out['restore']=await pg.inner_text('.pcrestore')
        await pg.click('.pcrestore'); await pg.wait_for_timeout(200)
        out['back_words']=len(await pg.locator('.pcprev .pcard .pw').all_inner_texts())
        await card('sofa').hover(); await card('sofa').locator('.pcx').click(); await pg.wait_for_timeout(200)
        # change "cat" to "kitten" / ลูกแมว, without its picture
        await card('cat').hover(); await card('cat').locator('.pced').click(); await pg.wait_for_timeout(200)
        await pg.fill('.pcedit input[aria-label="คำศัพท์"]','kitten'); await pg.fill('.pcedit input[aria-label="คำแปล"]','ลูกแมว')
        await pg.uncheck('.pcedit input[type=checkbox]'); await pg.click('.pcedit button.primary'); await pg.wait_for_timeout(200)
        out['ed_first']=await pg.locator('.pcprev .pcard').first.inner_text(); out['ed_img']=await pg.locator('.pcprev .pcard').first.locator('img').count()
        # the back, as it will print (each row reversed)
        await pg.click('.pcside button[data-side=back]'); await pg.wait_for_timeout(200)
        out['pv_back']=await pg.locator('.pcprev .ppage').first.locator('.pcard .pm').all_inner_texts()
        await pg.screenshot(path=shot('pc_preview_back.png'))
        out['scene_word']=await pg.evaluate("JSON.parse(localStorage.getItem('pv-scenes2'))[0].items.a0.word")
        await pg.click('#mbox button.primary'); await pg.wait_for_timeout(1500)
        out['printed']=await pg.evaluate('window.__printed||0')
        out['pages']=await pg.locator('#printSheet .ppage').count()
        out['front']=await pg.locator('#printSheet .ppage').nth(0).locator('.pcard .pw').all_inner_texts()
        out['back']=await pg.locator('#printSheet .ppage').nth(1).locator('.pcard .pm').all_inner_texts()
        out['imgs']=await pg.locator('#printSheet .ppage').nth(0).locator('img').count()
        out['onscreen']=await pg.locator('#printSheet').is_visible()
        await pg.emulate_media(media='print'); await pg.pdf(path=shot('pc_cards.pdf'), format='A4', print_background=True)
        await pg.emulate_media(media='screen')
        # 12 a page, meaning under the word, only words not passed
        await pg.evaluate("document.getElementById('printSheet')?.remove(); document.body.classList.remove('printing')")
        await pg.locator('#libList .lcard:has-text("My room")').click(); await pg.wait_for_timeout(400)
        await pg.click('#mbox button:has-text("แฟลชการ์ด")'); await pg.wait_for_timeout(300)
        await pg.check('#mbox input[name=pcsize][value="12"]'); await pg.check('#mbox input[name=pcback][value="below"]'); await pg.wait_for_timeout(100)
        out['count12']=await pg.inner_text('#mbox .note.small')
        await pg.click('#mbox button.primary'); await pg.wait_for_timeout(1200)
        out['pv12_side']=await pg.locator('.pcside').count()
        await pg.click('#mbox button.primary'); await pg.wait_for_timeout(1200)
        out['pages12']=await pg.locator('#printSheet .ppage').count()
        out['below']=await pg.locator('#printSheet .pcard').first.inner_text()
        await pg.emulate_media(media='print'); await pg.pdf(path=shot('pc_cards12.pdf'), format='A4', print_background=True)
        await b.close()
    print(json.dumps(out, ensure_ascii=False, indent=1), errs)
    ok=True
    def check(c, what, got):
        nonlocal ok
        print(('  ✓ ' if c else '  ✗ ')+what+('' if c else f' — got {got!r}')); ok = ok and c
    check('พิมพ์แฟลชการ์ด' in out['modal'] and '10 ใบ · 2 หน้า (และด้านหลังอีก 2 หน้า)' in out['modal'], 'options with the card and page count', out['modal'])
    check(out['pv_printed']==0 and out['pv_pages']==2 and out['pv_words'][:3]==['cat','sofa','lamp'] and len(out['pv_words'])==10 and '10 ใบ · 2 หน้า' in out['pv_info'], 'a preview first: 10 cards on 2 pages, nothing printed yet', (out['pv_printed'], out['pv_pages'], out['pv_words'], out['pv_info']))
    check('sofa' not in out['rm_words'] and len(out['rm_words'])==9 and '9 ใบ' in out['rm_info'] and '(1)' in out['restore'] and out['back_words']==10, '✕ takes a card out; it can be brought back', (out['rm_words'], out['rm_info'], out['restore'], out['back_words']))
    check('kitten' in out['ed_first'] and out['ed_img']==0 and out['scene_word']=='cat', '✏️ changes the word, picture off — only on the card, not in the scene', (out['ed_first'], out['ed_img'], out['scene_word']))
    check(out['pv_back'][:2]==['โคมไฟ','ลูกแมว'], 'the back side in the preview, rows reversed', out['pv_back'])
    check(out['printed']==1 and out['pages']==4 and not out['onscreen'], 'prints 2 front + 2 back pages; nothing shown on screen', (out['printed'], out['pages'], out['onscreen']))
    check(out['front']==['kitten','lamp','rug','clock','plant','book','cup','vase'] and out['imgs']==7, 'front: as edited in the preview (no sofa; kitten without its picture)', (out['front'], out['imgs']))
    check(out['back']==['โคมไฟ','ลูกแมว','นาฬิกา','พรม','หนังสือ','ต้นไม้','แจกัน','ถ้วย'], 'back: the meanings, each row reversed for two-sided printing', out['back'])
    check(out['pv12_side']==0, 'meaning under the word: no back side to look at', out['pv12_side'])
    check(out['pages12']==1 and 'แมว' in out['below'] and 'cat' in out['below'] and '10 ใบ · 1 หน้า' in out['count12'], '12 a page, meaning under the word', (out['pages12'], out['below'], out['count12']))
    check(not errs, 'no page errors', errs)
    print('PASS' if ok else 'FAIL'); assert ok
asyncio.run(main())
