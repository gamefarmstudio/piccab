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
    check(out['printed']==1 and out['pages']==4 and not out['onscreen'], 'prints 2 front + 2 back pages; nothing shown on screen', (out['printed'], out['pages'], out['onscreen']))
    check(out['front']==['cat','sofa','lamp','rug','clock','plant','book','cup'] and out['imgs']==8, 'front: the word with its picture', out['front'])
    check(out['back']==['โซฟา','แมว','พรม','โคมไฟ','ต้นไม้','นาฬิกา','ถ้วย','หนังสือ'], 'back: the meaning, each row reversed for two-sided printing', out['back'])
    check(out['pages12']==1 and 'แมว' in out['below'] and 'cat' in out['below'] and '10 ใบ · 1 หน้า' in out['count12'], '12 a page, meaning under the word', (out['pages12'], out['below'], out['count12']))
    check(not errs, 'no page errors', errs)
    print('PASS' if ok else 'FAIL'); assert ok
asyncio.run(main())
