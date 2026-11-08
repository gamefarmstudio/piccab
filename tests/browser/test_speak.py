import asyncio, json
from playwright.async_api import async_playwright
from common import *
async def route(r):
    u=r.request.url
    if u.endswith('/vendor/supabase-2.119.0.js'): return await r.fulfill(status=200, content_type='application/javascript', body=SBJS)
    if u.endswith('/i18n/en.js'): return await r.fulfill(status=200, content_type='application/javascript', body=EN)
    if u.endswith('/api/health'): return await r.fulfill(status=200, content_type='application/json', body='{"ai":false}')
    if 'supabase.co' in u: return await r.fulfill(status=404, body='{}')
    if 'piccab.test' not in u: return await r.abort()
    return await r.fulfill(status=200, content_type='text/html', body=HTML)
FAKE="""window.__said=[]; if(window.speechSynthesis){ speechSynthesis.speak=u=>{ __said.push(u.text); }; }
class FakeSR{ start(){ window.__srLang=this.lang; window.__starts=(window.__starts||0)+1; setTimeout(()=>{ const t=window.__next;
  if(t==null){ this.onerror&&this.onerror({error:'no-speech'}); this.onend&&this.onend(); return; }
  const res=[].concat(t).map(x=>({transcript:x,confidence:.9})); res.isFinal=true; this.onresult&&this.onresult({results:[res]}); this.onend&&this.onend(); },120); }
  stop(){} abort(){} }
if(!window.__noSR){ window.SpeechRecognition=FakeSR; window.webkitSpeechRecognition=FakeSR; } else { delete window.SpeechRecognition; delete window.webkitSpeechRecognition; }"""
async def main():
    out={}; errs=[]
    async with async_playwright() as p:
        b=await launch(p)
        ctx=await b.new_context(locale='th-TH', viewport={'width':1200,'height':900}, service_workers='block')
        await ctx.add_init_script(FAKE)
        pg=await ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.route('**/*', route); await pg.goto('https://piccab.test/app'); await pg.wait_for_timeout(600)
        await pg.click('.cont .primary.big'); await pg.wait_for_timeout(500)
        await pg.click('#modes [data-mode=speak]'); await pg.wait_for_timeout(400)
        out['sub0']=await pg.inner_text('#sub')
        w=(await pg.inner_text('#sub .target')).strip(); out['target0']=w
        await pg.evaluate(f"window.__next='the {w}'")
        await pg.click('#sub .mic'); await pg.wait_for_timeout(300)
        out['intro']=await pg.inner_text('#mbox h3')
        await pg.click('#mbox button.primary'); await pg.wait_for_timeout(400)
        out['after_ok']=await pg.inner_text('#sub'); out['lang']=await pg.evaluate('window.__srLang')
        PROG="(()=>{ const p=JSON.parse(localStorage.getItem('pv-progress')||'{}').tea||{}; return [Object.keys(p.done||{}).sort(), Object.keys(p.star||{}).sort()]; })()"
        out['prog1']=await pg.evaluate(PROG)
        await pg.screenshot(path=shot('sp1_ok.png'))
        await pg.wait_for_timeout(1700)
        w2=(await pg.inner_text('#sub .target')).strip(); out['target1']=w2
        # wrong twice → app says the word
        await pg.evaluate("window.__next=['banana','bandana']"); await pg.click('#sub .mic'); await pg.wait_for_timeout(400)
        out['wrong1']=await pg.inner_text('#sub .spkres')
        n0=len(await pg.evaluate('__said')); await pg.click('#sub .mic'); await pg.wait_for_timeout(400)
        out['wrong2']=await pg.inner_text('#sub .spkres'); out['said_after_2']=(await pg.evaluate('__said'))[n0:]
        await pg.screenshot(path=shot('sp2_wrong.png'))
        # nothing heard
        await pg.evaluate("window.__next=null"); await pg.click('#sub .mic'); await pg.wait_for_timeout(400)
        out['nothing']=await pg.inner_text('#toast')
        # tap a thing in the picture → becomes the word to say
        await pg.locator('#scene .item[data-id="vase"]').click(force=True); await pg.wait_for_timeout(300)
        out['picked']=(await pg.inner_text('#sub .target')).strip()
        # compound spoken apart: "tea pot" for teapot
        await pg.locator('#scene .item[data-id="teacup"]').click(force=True); await pg.wait_for_timeout(300)
        out['picked2']=(await pg.inner_text('#sub .target')).strip()
        await pg.evaluate("window.__next=['tea cup']"); await pg.click('#sub .mic'); await pg.wait_for_timeout(400)
        out['teapot_apart']=await pg.inner_text('#sub .spkres')
        await pg.wait_for_timeout(1700)
        # German: article right → ★, wrong article → hint
        await pg.click('#playBar .langpill'); await pg.click('.langopt:has-text("เยอรมัน")'); await pg.wait_for_timeout(600)
        out['de_mode']=await pg.evaluate("document.querySelector('#modes [data-mode=speak]').classList.contains('on')")
        await pg.locator('#scene .item[data-id="vase"]').click(force=True); await pg.wait_for_timeout(300)
        out['de_target']=(await pg.inner_text('#sub .target')).strip()
        await pg.click('#sub .toggle'); await pg.wait_for_timeout(150)   # hide the word: now it counts as a real review
        await pg.evaluate("window.__next=['die Vase']"); await pg.click('#sub .mic'); await pg.wait_for_timeout(400)
        out['de_star']=await pg.inner_text('#sub .spkres'); out['de_lang']=await pg.evaluate('window.__srLang')
        out['prog_de']=await pg.evaluate(PROG)
        out['de_srs']=await pg.evaluate("(()=>{ const v=JSON.parse(localStorage.getItem('pv-progress')).tea.done['vase@de']; return v && v.b; })()")
        await pg.click('#sub .toggle'); await pg.wait_for_timeout(150)
        await pg.wait_for_timeout(1700)
        await pg.locator('#scene .item[data-id="teaspoon"]').click(force=True); await pg.wait_for_timeout(300)
        await pg.evaluate("window.__next=['die Teelöffel']"); await pg.click('#sub .mic'); await pg.wait_for_timeout(400)
        out['de_wrongart']=await pg.inner_text('#sub .spkres')
        await pg.screenshot(path=shot('sp3_de.png'))
        await ctx.close()
        # phone: four mode buttons, English menus
        ctx=await b.new_context(locale='en-GB', viewport={'width':390,'height':844}, is_mobile=True, has_touch=True, service_workers='block')
        await ctx.add_init_script(FAKE); await ctx.add_init_script("if(!sessionStorage.x){ sessionStorage.x=1; localStorage.setItem('pv-ui','\"en\"'); localStorage.setItem('pv-lang','\"en\"'); localStorage.setItem('pv-mic-ok','true'); }")
        pg=await ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e))); await pg.route('**/*', route); await pg.goto('https://piccab.test/app'); await pg.wait_for_timeout(700)
        await pg.click('.cont .primary.big'); await pg.wait_for_timeout(500); await pg.click('#modes [data-mode=speak]'); await pg.wait_for_timeout(400)
        out['m_modes']=await pg.locator('#modes [data-mode]').all_inner_texts(); out['m_sub']=await pg.inner_text('#sub')
        await pg.screenshot(path=shot('sp4_phone.png'))
        await ctx.close()
        # no speech recognition (e.g. Firefox)
        ctx=await b.new_context(locale='th-TH', viewport={'width':1200,'height':900}, service_workers='block')
        await ctx.add_init_script("window.__noSR=1;"); await ctx.add_init_script(FAKE)
        pg=await ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e))); await pg.route('**/*', route); await pg.goto('https://piccab.test/app'); await pg.wait_for_timeout(600)
        await pg.click('.cont .primary.big'); await pg.wait_for_timeout(400); await pg.click('#modes [data-mode=speak]'); await pg.wait_for_timeout(300)
        out['nosr']=await pg.inner_text('#sub')
        await b.close()
    check('ถูกต้อง' in out['after_ok'] and 'ถูก 1' in out['after_ok'], 'saying "the <word>" counts', out['after_ok'])
    check(len(out['prog1'][0])==1 and out['prog1'][1]==[], 'a word said right is saved as passed (word showing: no ★)', out['prog1'])
    check('vase@de' in out['prog_de'][0] and 'vase@de' in out['prog_de'][1] and out['de_srs']==1, 'word hidden + right article: passed with ★ and a review date', (out['prog_de'], out['de_srs']))
    check(out['intro']=='🎤 ฝึกพูด', 'first use explains where the voice goes', out['intro'])
    check(out['lang']=='en-GB', 'listens in the chosen English accent', out['lang'])
    check(out['target1']!=out['target0'], 'moves on to the next word', (out['target0'], out['target1']))
    check('ลองอีกครั้ง' in out['wrong1'] and 'ฟังแล้วลองพูดตาม' in out['wrong2'], 'wrong twice → listen and repeat', (out['wrong1'], out['wrong2']))
    check(out['said_after_2']==[out['target1']], 'second miss reads the word aloud', out['said_after_2'])
    check('ไม่ได้ยินเสียง' in out['nothing'], 'nothing heard → message', out['nothing'])
    check(out['picked']=='vase' and out['picked2']=='teacup', 'tapping a thing picks it', (out['picked'], out['picked2']))
    check('ถูกต้อง' in out['teapot_apart'], '"tea cup" counts for teacup', out['teapot_apart'])
    check(out['de_lang']=='de-DE' and '★' in out['de_star'], 'German with the right article earns a star', (out['de_lang'], out['de_star']))
    check('der' in out['de_wrongart'], 'wrong German article is corrected', out['de_wrongart'])
    check(out['m_modes'][-1]=='Speak', 'speak mode in English menus', out['m_modes'])
    check('Chrome' in out['nosr'], 'browsers without speech recognition get advice', out['nosr'])
    finish('speak', out, errs)
asyncio.run(main())
