import asyncio, json, re
from playwright.async_api import async_playwright
from common import *
IMG=PORTRAIT
TR=[]
async def route(r):
    u=r.request.url
    if u.endswith('/vendor/supabase-2.119.0.js'): return await r.fulfill(status=200, content_type='application/javascript', body=SBJS)
    if u.endswith('/api/health'): return await r.fulfill(status=200, content_type='application/json', body='{"ai":true,"needCode":true,"credits":false}')
    if u.endswith('/api/translate'):
        b=json.loads(r.request.post_data); TR.append(b)
        out=[{'k':w['k'],'w':{'chair':'Stuhl','lamp':'Lampe'}.get(w['en'],'Ding'),'a':{'chair':'der','lamp':'die'}.get(w['en'],'das'),'alts':[]} for w in b['words']]
        return await r.fulfill(status=200, content_type='application/json', body=json.dumps({'items':out,'provider':'gemini'}))
    if 'supabase.co' in u: return await r.fulfill(status=404, body='{}')
    return await page_or_built(r)
async def main():
    out={}; errs=[]
    async with async_playwright() as p:
        b=await launch(p)
        ctx=await b.new_context(locale='th-TH', viewport={'width':1200,'height':900}, service_workers='block')
        await ctx.add_init_script("window.__said=[]; if(window.speechSynthesis){ const o=speechSynthesis.speak.bind(speechSynthesis); speechSynthesis.speak=u=>{ __said.push([u.text,u.lang]); }; }")
        pg=await ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.route('**/*', route); await pg.goto('https://piccab.test/app'); await pg.wait_for_timeout(500)
        out['pill']=await pg.locator('#galleryBar .langpill').inner_text()
        await pg.click('#galleryBar .langpill'); await pg.wait_for_timeout(200)
        out['picker']=await pg.locator('.langlist').inner_text()
        await pg.click('.langopt:has-text("เยอรมัน")'); await pg.wait_for_timeout(300)
        out['pill_de']=await pg.locator('#galleryBar .langpill').inner_text()
        out['accent']=await pg.locator('#accent option').all_inner_texts()
        # home card labels in German
        out['card']=await pg.locator('.cont .cimg').inner_text()
        # learn: tap teapot
        await pg.click('.cont .primary.big'); await pg.wait_for_timeout(500)
        out['chips']=(await pg.locator('#chips .chip').all_inner_texts())[:5]
        await pg.click('#chips .chip:has-text("Teekanne")'); await pg.wait_for_timeout(300)
        out['tag']=await pg.locator('#tag').inner_text()
        out['art_class']=await pg.locator('#tag .art').get_attribute('class')
        await pg.click('#tag .say'); await pg.wait_for_timeout(100)
        out['said']=await pg.evaluate("__said.slice(-1)")
        # quiz
        await pg.click('#modes button[data-mode=quiz]'); await pg.wait_for_timeout(300)
        async def answer(word_chip, text, again=False):
            if not again: await pg.locator('#chips .chip').nth(word_chip).click(); await pg.wait_for_timeout(200)
            await pg.fill('#qin', text); await pg.press('#qin','Enter'); await pg.wait_for_timeout(250)
            return await pg.locator('#qmsg').inner_text()
        # find chip indexes by the scene's order: ask app which word each chip is via the learn list: use known order of TEA_ITEMS
        order=['cake-stand','macaron','sponge-cake','shortbread','lemon-drizzle-cake','cocktail-umbrella','fruit-scone','scone','jam','clotted-cream','savoury-croissant','wholemeal-roll','tea-sandwich','teapot','tea-cosy','sugar-bowl','milk-jug','teacup','saucer','teaspoon','side-plate','napkin','table-bell','vase']
        i=order.index
        out['q_wrong_art']=await answer(i('teapot'),'der Teekanne')
        out['q_no_art']=await answer(i('teapot'),'teekanne',True)
        await pg.wait_for_timeout(1200)
        out['q_umlaut']=await answer(i('teaspoon'),'die teeloeffel')
        out['q_umlaut_ok']=await answer(i('teaspoon'),'der Teeloffel',True)
        await pg.wait_for_timeout(1200)
        out['q_ss']=await answer(i('milk-jug'),'das Milchkännchen')
        await pg.wait_for_timeout(1200)
        out['q_alt']=await answer(i('teacup'),'Tasse')
        await pg.wait_for_timeout(1200)
        out['q_english']=await answer(i('vase'),'teapot')
        out['hint']=None
        await pg.click('#qhint'); await pg.wait_for_timeout(150); out['hint']=await pg.locator('#qclue').inner_text()
        prog=await pg.evaluate("JSON.parse(localStorage.getItem('pv-progress')).tea")
        out['prog_keys']=sorted(prog['done'].keys()); out['stars']=sorted(prog['star'].keys())
        # English progress untouched; switch back to English: quiz shows 0 done
        await pg.click('#playBar .langpill'); await pg.click('.langopt:has-text("อังกฤษ")'); await pg.wait_for_timeout(300)
        out['en_pill']=await pg.locator('#playBar .langpill').inner_text()
        out['en_sub']=await pg.locator('#sub .pill').inner_text()
        out['en_tagword']=(await pg.locator('#chips .chip').all_inner_texts())[:2]
        # own scene in German: no German words yet → translate with AI
        await pg.click('#playBar .langpill'); await pg.click('.langopt:has-text("เยอรมัน")'); await pg.wait_for_timeout(200)
        await pg.evaluate("""()=>{ const sc={id:'s1x',name:'Room',w:900,h:1200,img:'data:image/png;base64,iVBORw0KGgo=',items:{a1:{word:'chair',th:'เก้าอี้',alts:[],x:10,y:10,w:100,h:100},a2:{word:'lamp',th:'โคมไฟ',alts:[],x:200,y:10,w:100,h:100}}}; const a=JSON.parse(localStorage.getItem('pv-scenes2')||'[]'); a.push(sc); localStorage.setItem('pv-scenes2',JSON.stringify(a)); localStorage.setItem('pv-scene','s1x'); localStorage.setItem('pv-ai-code',JSON.stringify('x')); }""")
        await pg.reload(); await pg.wait_for_timeout(700)
        await pg.evaluate("document.querySelector('.mainnav button[data-view=library]').click()"); await pg.wait_for_timeout(300)
        await pg.locator('#libList .lcard:has-text("Room")').first.click(); await pg.wait_for_timeout(400)
        btn=pg.locator('.mbox button.primary').first
        if await btn.count(): await btn.click(); await pg.wait_for_timeout(500)
        if await pg.evaluate("document.body.classList.contains('editing')"):
            await pg.click('#sub button.primary:has-text("เสร็จแล้ว")'); await pg.wait_for_timeout(300)
        await pg.wait_for_timeout(900)
        out['auto_sub']=await pg.locator('#sub').inner_text()
        out['translate_req']=TR[-1] if TR else None
        out['chips_after']=await pg.locator('#chips .chip').all_inner_texts()
        sc=await pg.evaluate("JSON.parse(localStorage.getItem('pv-scenes2')).find(s=>s.id==='s1x').items")
        out['stored']={k:v.get('l') for k,v in sc.items()}
        # edit form in German: add article via typing "das Bett"
        await pg.click('#editBtn'); await pg.wait_for_timeout(300)
        await pg.locator('#chips .chip').first.click(); await pg.wait_for_timeout(200)
        await pg.click('.selbar button.primary'); await pg.wait_for_timeout(200)
        out['form_title']=await pg.locator('.mbox h3').inner_text()
        out['form_art_on']=await pg.locator('.artseg button.on').inner_text()
        await pg.fill('.mbox input.word','das Bett'); await pg.wait_for_timeout(100)
        out['form_after_type']=(await pg.input_value('.mbox input.word'), await pg.locator('.artseg button.on').inner_text())
        await pg.click('.mbox button.primary'); await pg.wait_for_timeout(300)
        sc=await pg.evaluate("JSON.parse(localStorage.getItem('pv-scenes2')).find(s=>s.id==='s1x').items.a1")
        out['edited']=sc
        await pg.screenshot(path=shot('de_edit.png'))
        await b.close()
    check(out['pill_de']=='🇩🇪 เยอรมัน', 'language button shows German', out['pill_de'])
    check('das Macaron' in out['card'] and 'มาการง' in out['card'], 'home card labels in German with Thai meaning', out['card'])
    check(out['chips'][:2]==['die Etagere','das Macaron'], 'word chips in German', out['chips'])
    check(out['art_class']=='art art-die', 'die is coloured', out['art_class'])
    check(out['said']==[['die Teekanne','de-DE']], 'reads German aloud with a German voice', out['said'])
    check('der' in out['q_wrong_art'] and '★' not in out['q_wrong_art'], 'wrong article is pointed out', out['q_wrong_art'])
    check('✓' in out['q_no_art'], 'noun without article counts', out['q_no_art'])
    check('ถูกต้อง' not in out['q_umlaut'], 'die Teeloeffel (wrong article) not accepted', out['q_umlaut'])
    check('✓' in out['q_umlaut_ok'], 'Teeloffel without umlaut accepted', out['q_umlaut_ok'])
    check('★' in out['q_ss'], 'article + noun earns a star', out['q_ss'])
    check('✓' in out['q_alt'], 'alternative word accepted', out['q_alt'])
    check('ถูกต้อง' not in out['q_english'], 'English word is not German', out['q_english'])
    check(out['prog_keys']==['milk-jug@de','teacup@de','teapot@de','teaspoon@de'], 'German progress kept under @de', out['prog_keys'])
    check(out['stars']==['milk-jug@de'], 'German stars', out['stars'])
    check(out['en_tagword']==['คำที่ 1','คำที่ 2'], 'English progress untouched', out['en_tagword'])
    check(out['translate_req'] and out['translate_req']['lang']=='de' and len(out['translate_req']['words'])==2, 'own scene sent for translation', out['translate_req'])
    check(out['chips_after']==['der Stuhl','die Lampe'], 'translated words appear', out['chips_after'])
    check(out['form_after_type']==('Bett','das'), 'typing "das Bett" sets the article', out['form_after_type'])
    check(out['edited']['l']['de']=={'w':'Bett','a':'das','alts':[]} and out['edited']['word']=='chair', 'German edit saved, English kept', out['edited'])
    finish('german', out, errs)
asyncio.run(main())
