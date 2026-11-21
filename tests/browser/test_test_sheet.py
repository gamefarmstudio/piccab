# 📝 A spelling test to print (from a scene's or word set's preview): questions with the word's picture, its Thai meaning,
# both, or only a number (the teacher reads the words out); a line or a box per letter (the first letter given if asked);
# name / class / score at the top; the answers on a page of their own. Printed by the browser (Save as PDF).
import asyncio, json, base64, re
from playwright.async_api import async_playwright
from common import *

W = ['cat','sofa','lamp','rug','clock','plant','book','cup','vase','fan','ice cream','t-shirt','pen','bag','door','bed','desk','chair','window','toy','ball','car','hat','shoe','sock']
T = ['แมว','โซฟา','โคมไฟ','พรม','นาฬิกา','ต้นไม้','หนังสือ','ถ้วย','แจกัน','พัดลม','ไอศกรีม','เสื้อยืด','ปากกา','กระเป๋า','ประตู','เตียง','โต๊ะ','เก้าอี้','หน้าต่าง','ของเล่น','ลูกบอล','รถ','หมวก','รองเท้า','ถุงเท้า']
SEED = """([img, W, T])=>{ const it={}; W.forEach((w,i)=>{ it['a'+i]={word:w,th:T[i],alts:[],x:20+(i%5)*230,y:20+Math.floor(i/5)*170,w:200,h:150}; });
  localStorage.setItem('pv-scenes2',JSON.stringify([{id:'s1ts',name:'My room',w:1200,h:900,img,items:it}])); localStorage.setItem('pv-scene','s1ts'); }"""
FITS = "[...document.querySelectorAll('.tsprev .tspage:not(.key)')].every(p=>p.scrollHeight<=p.clientHeight+1)"

async def main():
    out = {}; errs = []
    img = 'data:image/jpeg;base64,' + base64.b64encode(open(PHOTO, 'rb').read()).decode()
    async with async_playwright() as p:
        b = await launch(p)
        ctx = await b.new_context(locale='th-TH', viewport={'width': 1100, 'height': 900}, service_workers='block')
        await ctx.add_init_script("window.print=()=>{ window.__printed=(window.__printed||0)+1; };")
        pg = await ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.route('**/*', lambda r: app_route(r)); await pg.goto('https://piccab.test/app'); await pg.wait_for_timeout(500)
        await pg.evaluate(SEED, [img, W, T]); await pg.reload(); await pg.wait_for_timeout(700)
        await pg.click('.mainnav [data-view=library]'); await pg.wait_for_timeout(300)
        await pg.locator('#libList .lcard:has-text("My room")').click(); await pg.wait_for_timeout(400)
        await pg.click('#mbox .tsbtn'); await pg.wait_for_timeout(1500)
        out['title'] = await pg.inner_text('#mbox h3')
        out['q_on'] = await pg.get_attribute('.tsseg button.on', 'data-v')
        # pictures: 12 a page (3 pages for 25 words) + the answers
        out['pages'] = await pg.locator('.tsprev .tspage').count(); out['keys'] = await pg.locator('.tsprev .tspage.key').count()
        out['qs'] = await pg.locator('.tsprev .tsq').count(); out['imgs'] = await pg.locator('.tsprev .tsq img').count()
        out['info'] = await pg.inner_text('.tsinfo')
        out['head'] = await pg.inner_text('.tsprev .tspage >> nth=0 >> .tshead')
        out['lines'] = await pg.locator('.tsprev .tsq .tsline').count()
        out['fits_pic'] = await pg.evaluate(FITS)
        out['zoom'] = await pg.evaluate("+getComputedStyle(document.querySelector('.tsprev')).zoom")
        out['scrolls'] = await pg.evaluate("(()=>{ const p=document.querySelector('.tsprev'); p.scrollTop=1e6; const k=document.querySelector('.tsprev .tspage.key').getBoundingClientRect(), b=p.getBoundingClientRect(); return p.scrollTop>0 && k.top<b.bottom; })()")
        await pg.screenshot(path=shot('ts_pic.png'))
        # in order, first letter given: boxes, one per letter; "ice cream" has a gap, "t-shirt" its hyphen
        await pg.uncheck('.tschk input >> nth=0'); await pg.click('.tsseg button[data-v=first]'); await pg.wait_for_timeout(200)
        out['first_q'] = await pg.locator('.tsprev .tsq').first.inner_text()
        out['boxes_cat'] = await pg.locator('.tsprev .tsq >> nth=0 >> .bx').all_inner_texts()
        out['ice'] = await pg.evaluate("(()=>{ const q=document.querySelectorAll('.tsprev .tsq')[10]; return [q.querySelectorAll('.bx').length, q.querySelectorAll('.gap').length]; })()")
        out['tshirt'] = await pg.evaluate("(()=>{ const q=document.querySelectorAll('.tsprev .tsq')[11]; return [q.querySelectorAll('.bx').length, [...q.querySelectorAll('.sym')].map(s=>s.textContent)]; })()")
        await pg.screenshot(path=shot('ts_first.png'))
        # the Thai meaning: rows, 17 on the first page, 19 after
        await pg.click('.tsseg button[data-v=th]'); await pg.click('.tsseg button[data-v=count]'); await pg.wait_for_timeout(200)
        out['th_pages'] = await pg.locator('.tsprev .tspage:not(.key)').count()
        out['th_rows'] = [await pg.locator('.tsprev .tspage').nth(i).locator('.tsrow').count() for i in range(2)]
        out['th_first'] = await pg.locator('.tsprev .tsrow').first.inner_text()
        out['th_empty_boxes'] = await pg.evaluate("[...document.querySelectorAll('.tsprev .tsrow .bx')].every(b=>!b.textContent)")
        out['th_imgs'] = await pg.locator('.tsprev .tspage img').count()
        out['how_th'] = await pg.inner_text('.tsprev .tshow')
        out['fits_th'] = await pg.evaluate(FITS)
        out['key_th'] = await pg.locator('.tsprev .tspage.key li').nth(0).inner_text()
        await pg.screenshot(path=shot('ts_th.png'))
        # the teacher reads: numbers and lines only
        await pg.click('.tsseg button[data-v=listen]'); await pg.click('.tsseg button[data-v=none]'); await pg.wait_for_timeout(200)
        out['listen_means'] = await pg.locator('.tsprev .tspage:not(.key) .tsmean').count()
        out['listen_lines'] = await pg.locator('.tsprev .tsrow .tsline').count()
        out['key_listen'] = await pg.locator('.tsprev .tspage.key li').nth(0).inner_text()
        # picture + meaning, no answer page
        await pg.click('.tsseg button[data-v=both]'); await pg.uncheck('.tschk input >> nth=1'); await pg.wait_for_timeout(200)
        out['both_means'] = await pg.locator('.tsprev .tsq .tsmean').count(); out['both_keys'] = await pg.locator('.tsprev .tspage.key').count()
        out['fits_both'] = await pg.evaluate(FITS)
        out['saved'] = await pg.evaluate("[localStorage.getItem('pv-ts-q'), localStorage.getItem('pv-ts-hint'), localStorage.getItem('pv-ts-mix'), localStorage.getItem('pv-ts-key')]")
        await pg.check('.tschk input >> nth=1')
        await pg.click('.tsbox .tsprint'); await pg.wait_for_timeout(1500)
        out['printed'] = await pg.evaluate('window.__printed||0')
        out['p_pages'] = await pg.locator('#printSheet .tspage').count()
        out['onscreen'] = await pg.locator('#printSheet').is_visible()
        await pg.emulate_media(media='print'); pdf = await pg.pdf(path=shot('ts_both.pdf'), format='A4', print_background=True)
        out['pdf_pages'] = len(re.findall(rb'/Type\s*/Page[^s]', pdf))
        await pg.emulate_media(media='screen')
        # a phone: the page shrinks to fit
        await pg.evaluate("document.getElementById('printSheet')?.remove(); document.body.classList.remove('printing')")
        await pg.set_viewport_size({'width': 390, 'height': 800}); await pg.wait_for_timeout(200)
        await pg.evaluate("document.querySelector('#modal').hidden=true")
        await pg.locator('#libList .lcard:has-text("My room")').click(); await pg.wait_for_timeout(400)
        await pg.click('#mbox .tsbtn'); await pg.wait_for_timeout(1500)
        out['phone_zoom'] = await pg.evaluate("+getComputedStyle(document.querySelector('.tsprev')).zoom")
        out['phone_overflow'] = await pg.evaluate("document.querySelector('#mbox').scrollWidth<=document.querySelector('#mbox').clientWidth+1")
        await pg.screenshot(path=shot('ts_phone.png'))
        await b.close()
    check(out['title'] == '📝 แผ่นสอบเขียนคำศัพท์' and out['q_on'] == 'pic', 'opens from the preview, pictures first', (out['title'], out['q_on']))
    check(out['pages'] == 4 and out['keys'] == 1 and out['qs'] == 25 and out['imgs'] == 25 and '25 ข้อ · 3 หน้า + เฉลย 1 หน้า' in out['info'], '25 picture questions on 3 pages + the answers', (out['pages'], out['keys'], out['qs'], out['imgs'], out['info']))
    check(all(w in out['head'] for w in ['My room', 'ชื่อ', 'เลขที่', 'ชั้น', 'วันที่', 'คะแนน', '/ 25', 'ดูรูป แล้วเขียนคำศัพท์ภาษาอังกฤษ']) and out['lines'] == 25, 'the top: title, name, no., class, date, score / 25, what to do; a line to write on', out['head'])
    check(out['fits_pic'] and 0.3 < out['zoom'] <= 1 and out['scrolls'], 'the picture pages fit; the preview zooms to fit and scrolls to the last page', (out['fits_pic'], out['zoom'], out['scrolls']))
    check(out['first_q'].startswith('1') and out['boxes_cat'] == ['c', '', ''], 'first letter given: c _ _ for cat, in order', (out['first_q'], out['boxes_cat']))
    check(out['ice'] == [8, 1] and out['tshirt'] == [6, ['-']], 'a gap for a space, the hyphen printed', (out['ice'], out['tshirt']))
    check(out['th_pages'] == 2 and out['th_rows'] == [17, 8] and out['th_first'].replace('\n', ' ').startswith('1. แมว') and out['th_empty_boxes'] and out['th_imgs'] == 0, 'Thai meanings: rows (17 + 8), empty boxes, no pictures', (out['th_pages'], out['th_rows'], out['th_first'], out['th_empty_boxes'], out['th_imgs']))
    check(out['how_th'] == 'อ่านคำแปล แล้วเขียนคำศัพท์ภาษาอังกฤษ' and out['fits_th'] and out['key_th'].startswith('cat'), 'says what to do; fits; the answers', (out['how_th'], out['fits_th'], out['key_th']))
    check(out['listen_means'] == 0 and out['listen_lines'] == 25 and 'แมว' in out['key_listen'], 'teacher reads: only numbers and lines; the answers show the meaning', (out['listen_means'], out['listen_lines'], out['key_listen']))
    check(out['both_means'] == 25 and out['both_keys'] == 0 and out['fits_both'], 'picture + meaning; no answer page when unticked', (out['both_means'], out['both_keys'], out['fits_both']))
    check(out['saved'] == ['"both"', '"none"', 'false', 'false'], 'the choices are remembered', out['saved'])
    check(out['printed'] == 1 and out['p_pages'] == 4 and not out['onscreen'] and out['pdf_pages'] == 4, 'prints 3 pages + answers, one A4 page each', (out['printed'], out['p_pages'], out['onscreen'], out['pdf_pages']))
    check(out['phone_zoom'] < 0.6 and out['phone_overflow'], 'on a phone the page shrinks to fit', (out['phone_zoom'], out['phone_overflow']))
    finish('test_test_sheet', out, errs)

asyncio.run(main())
