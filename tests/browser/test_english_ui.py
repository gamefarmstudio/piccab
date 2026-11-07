import asyncio, json, re
from playwright.async_api import async_playwright
from common import *
TH=re.compile('[฀-๿]')
async def route(r):
    u=r.request.url
    if u.endswith('/vendor/supabase-2.119.0.js'): return await r.fulfill(status=200, content_type='application/javascript', body=SBJS)
    if u.endswith('/i18n/en.js'): return await r.fulfill(status=200, content_type='application/javascript', body=EN)
    if u.endswith('/api/health'): return await r.fulfill(status=200, content_type='application/json', body='{"ai":true,"needCode":true,"credits":false}')
    if u.endswith('/api/translate'):
        b=json.loads(r.request.post_data)
        out=[{'k':w['k'],'w':'Ding','a':'das','alts':[]} for w in b['words']]
        return await r.fulfill(status=200, content_type='application/json', body=json.dumps({'items':out}))
    if 'supabase.co' in u: return await r.fulfill(status=404, body='{}')
    if 'piccab.test' not in u: return await r.abort()
    return await r.fulfill(status=200, content_type='text/html', body=HTML)
THAI_LEFT="""() => { const out=new Set(); const w=document.createTreeWalker(document.documentElement, NodeFilter.SHOW_TEXT|NodeFilter.SHOW_ELEMENT);
  let n; while((n=w.nextNode())){ if(n.nodeType===3){ const p=n.parentElement; if(!p || /SCRIPT|STYLE/.test(p.nodeName)) continue; if(p.closest('[data-noi18n]')) continue;
      if(/[\\u0E00-\\u0E7F]/.test(n.nodeValue)) out.add(n.nodeValue.trim().slice(0,90)); }
    else for(const a of ['placeholder','title','aria-label','alt']){ const v=n.getAttribute(a); if(v && /[\\u0E00-\\u0E7F]/.test(v)) out.add('@'+a+': '+v.slice(0,90)); } }
  return [...out]; }"""
async def main():
    out={}; errs=[]; left=set()
    async with async_playwright() as p:
        b=await launch(p)
        # 1) a new visitor with an English browser
        ctx=await b.new_context(locale='en-US', viewport={'width':1200,'height':900}, service_workers='block')
        pg=await ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.route('**/*', route); await pg.goto('https://piccab.test/app'); await pg.wait_for_timeout(800)
        out['lang']=await pg.evaluate("document.documentElement.lang")
        out['title']=await pg.title()
        out['welcome']=await pg.locator('#mbox').inner_text()
        await pg.screenshot(path=shot('en1_welcome.png'))
        left.update(await pg.evaluate(THAI_LEFT))
        await pg.click('#mbox button.primary'); await pg.wait_for_timeout(500)
        out['pill']=await pg.locator('#galleryBar .langpill').inner_text()
        out['home']=(await pg.locator('#home').inner_text())[:600] if await pg.locator('#home').count() else (await pg.locator('body').inner_text())[:600]
        await pg.screenshot(path=shot('en2_home.png'))
        left.update(await pg.evaluate(THAI_LEFT))
        # learn the sample scene in German with English meanings
        await pg.click('.cont .primary.big'); await pg.wait_for_timeout(600)
        await pg.click('#chips .chip:has-text("Teekanne")'); await pg.wait_for_timeout(300)
        out['tag']=await pg.locator('#tag').inner_text()
        await pg.screenshot(path=shot('en3_learn.png'))
        left.update(await pg.evaluate(THAI_LEFT))
        # every mode + menus
        for m in ['quiz','find']:
            await pg.click(f'#modes [data-mode="{m}"]'); await pg.wait_for_timeout(500); left.update(await pg.evaluate(THAI_LEFT))
            if m=='quiz':
                await pg.locator('#scene .item').first.click(); await pg.wait_for_timeout(300); left.update(await pg.evaluate(THAI_LEFT))
                await pg.screenshot(path=shot('en4_quiz.png'))
                await pg.fill('#qin','die Teekanne'); await pg.press('#qin','Enter'); await pg.wait_for_timeout(300)
                out['qmsg']=await pg.locator('#qmsg').inner_text()
        await pg.screenshot(path=shot('en4_mode.png'))
        # language picker: My language
        await pg.click('#playBar .langpill'); await pg.wait_for_timeout(200)
        out['picker']=await pg.locator('#mbox').inner_text()
        left.update(await pg.evaluate(THAI_LEFT))
        await pg.screenshot(path=shot('en5_picker.png'))
        await pg.mouse.click(5,5); await pg.wait_for_timeout(200)
        await pg.click('#homeBtn'); await pg.wait_for_timeout(400)
        for v in ['words','library','class','home']:
            await pg.locator(f'[data-view="{v}"]').first.click(); await pg.wait_for_timeout(500); left.update(await pg.evaluate(THAI_LEFT))
            await pg.screenshot(path=shot(f'en6_{v}.png'))
        await pg.click('#acctBtn'); await pg.wait_for_timeout(400); left.update(await pg.evaluate(THAI_LEFT)); await pg.screenshot(path=shot('en8_login.png')); await pg.mouse.click(5,5); await pg.wait_for_timeout(200)
        await pg.locator('[data-view="library"]').first.click(); await pg.wait_for_timeout(300); await pg.click('#importBtn'); await pg.wait_for_timeout(400); left.update(await pg.evaluate(THAI_LEFT)); await pg.screenshot(path=shot('en9_add.png')); await pg.mouse.click(5,5); await pg.wait_for_timeout(200)
        # switch to Thai from the picker → reload, all Thai again
        await pg.click('#galleryBar .langpill'); await pg.wait_for_timeout(200)
        await pg.click('.uiopt:has-text("ไทย")'); await pg.wait_for_timeout(1000)
        out['after_th_lang']=await pg.evaluate("document.documentElement.lang")
        out['after_th_pill']=await pg.locator('#galleryBar .langpill').inner_text()
        await ctx.close()
        # 2) an existing Thai user (has data, English browser): nothing changes, no welcome
        ctx=await b.new_context(locale='en-US', viewport={'width':1200,'height':900}, service_workers='block')
        await ctx.add_init_script("if(!sessionStorage.x){ sessionStorage.x=1; localStorage.setItem('pv-seen','1'); }")
        pg=await ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.route('**/*', route); await pg.goto('https://piccab.test/app'); await pg.wait_for_timeout(700)
        out['old_lang']=await pg.evaluate("document.documentElement.lang"); out['old_modal']=await pg.evaluate("!document.querySelector('#modal').hidden")
        out['old_ui']=await pg.evaluate("localStorage.getItem('pv-ui')")
        out['old_en_loaded']=await pg.evaluate("!!window.PV_T")
        await ctx.close()
        # 3) a new visitor with a Thai browser: Thai, no welcome
        ctx=await b.new_context(locale='th-TH', viewport={'width':1200,'height':900}, service_workers='block')
        pg=await ctx.new_page(); await pg.route('**/*', route); await pg.goto('https://piccab.test/app'); await pg.wait_for_timeout(700)
        out['th_lang']=await pg.evaluate("document.documentElement.lang"); out['th_modal']=await pg.evaluate("!document.querySelector('#modal').hidden")
        await ctx.close()
        # 4) Spanish browser → English menus, welcome suggests English to practise; no meaning shown under English words
        ctx=await b.new_context(locale='es-ES', viewport={'width':400,'height':800}, service_workers='block', is_mobile=True, has_touch=True)
        pg=await ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e))); await pg.route('**/*', route); await pg.goto('https://piccab.test/app'); await pg.wait_for_timeout(800)
        out['es_welcome_on']=await pg.locator('#mbox .langopt.on').inner_text()
        await pg.click('#mbox button.primary'); await pg.wait_for_timeout(400)
        await pg.click('.cont .primary.big'); await pg.wait_for_timeout(600)
        await pg.locator('#scene .item').first.click(); await pg.wait_for_timeout(400)
        out['es_tag']=await pg.locator('#tag').inner_text()
        await pg.screenshot(path=shot('en7_mobile.png'))
        left.update(await pg.evaluate(THAI_LEFT))
        await b.close()
    out['thai_left']=sorted(left)
    check(out['lang']=='en' and 'Learn words from pictures' in out['title'], 'English browser gets English menus', (out['lang'], out['title']))
    check('Welcome to Piccab' in out['welcome'] and 'German · Deutsch' in out['welcome'], 'welcome asks for my language and the language to practise', out['welcome'])
    check(out['pill']=='🇩🇪 German', 'English speakers are offered German', out['pill'])
    check(out['tag'].startswith('die Teekanne\nteapot'), 'meaning in English under the German word', out['tag'])
    check('My language' in out['picker'], 'language picker has My language', out['picker'])
    check(out['thai_left']==[], 'no Thai left on any screen visited', out['thai_left'])
    check(out['after_th_lang']=='th' and 'เยอรมัน' in out['after_th_pill'], 'switching to Thai works', (out['after_th_lang'], out['after_th_pill']))
    check(out['old_lang']=='th' and not out['old_modal'] and not out['old_en_loaded'], 'existing users stay Thai, no welcome, no English file', (out['old_lang'], out['old_modal'], out['old_en_loaded']))
    check(out['th_lang']=='th' and not out['th_modal'], 'new Thai browser: Thai, no welcome', (out['th_lang'], out['th_modal']))
    check('English' in out['es_welcome_on'], 'Spanish browser is offered English', out['es_welcome_on'])
    check(not re.search('[\u0E00-\u0E7F]', out['es_tag']), 'English learners see no Thai meaning', out['es_tag'])
    finish('english menus', out, errs)
asyncio.run(main())
