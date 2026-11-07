import asyncio, json, re
from playwright.async_api import async_playwright
from common import *
B=SERVER
THAI_LEFT="""() => { const out=new Set(); const w=document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT|NodeFilter.SHOW_ELEMENT);
  let n; while((n=w.nextNode())){ if(n.nodeType===3){ const p=n.parentElement; if(!p || /SCRIPT|STYLE/.test(p.nodeName) || p.closest('[lang=th],[data-noi18n]')) continue;
      if(/[\\u0E00-\\u0E7F]/.test(n.nodeValue)) out.add(n.nodeValue.trim().slice(0,90)); }
    else if(!n.closest('[lang=th]')) for(const a of ['placeholder','title','aria-label','alt']){ const v=n.getAttribute(a); if(v && /[\\u0E00-\\u0E7F]/.test(v)) out.add('@'+a+': '+v.slice(0,90)); } }
  return [...out]; }"""
async def main():
    out={}; errs=[]
    async with async_playwright() as p:
        b=await launch(p)
        async def page(locale, w=1280, h=900, mob=False):
            ctx=await b.new_context(locale=locale, viewport={'width':w,'height':h}, is_mobile=mob, has_touch=mob, service_workers='block')
            await ctx.route(SUPA+'/**', lambda r: r.fulfill(status=404, body='{}'))
            pg=await ctx.new_page(); pg.on('pageerror', lambda e: errs.append(locale+': '+str(e))); return ctx, pg
        # English browser opens piccab.com → /en/
        ctx,pg=await page('en-US'); await pg.goto(B+'/'); await pg.wait_for_timeout(800)
        out['en_url']=pg.url; out['en_title']=await pg.title(); out['en_thai']=await pg.evaluate(THAI_LEFT)
        await pg.screenshot(path=shot('we1_landing.png'), full_page=False)
        await pg.click('.dlang button[data-l=de]'); await pg.wait_for_timeout(200)
        out['demo_de']=await pg.locator('.pin .w').first.inner_text()
        await pg.screenshot(path=shot('we2_demo_de.png'))
        # start → app in English with welcome
        await pg.click('.hero .btn.primary'); await pg.wait_for_timeout(1500)
        out['app_url']=pg.url; out['app_lang']=await pg.evaluate('document.documentElement.lang'); out['welcome']=await pg.locator('#mbox h3').first.inner_text()
        await pg.click('#mbox button.primary'); await pg.wait_for_timeout(500)
        out['privacy_href']=await pg.locator('nav.legal a').first.get_attribute('href')
        await pg.goto(B+'/'); await pg.wait_for_timeout(800); out['returning']=pg.url
        await ctx.close()
        # Thai browser stays on Thai landing; EN switch goes to /en/
        ctx,pg=await page('th-TH'); await pg.goto(B+'/'); await pg.wait_for_timeout(700)
        out['th_url']=pg.url; out['th_app_link']=await pg.locator('.hero .btn.primary').get_attribute('href')
        await pg.click('.langsw'); await pg.wait_for_timeout(700); out['th_to_en']=pg.url
        await ctx.close()
        # English browser chooses ไทย on /en/ → Thai landing stays, Thai app
        ctx,pg=await page('en-GB'); await pg.goto(B+'/en/'); await pg.wait_for_timeout(600)
        await pg.click('.langsw'); await pg.wait_for_timeout(700); out['en_to_th']=pg.url
        await pg.click('.hero .btn.primary'); await pg.wait_for_timeout(1500)
        out['en_to_th_app_lang']=await pg.evaluate('document.documentElement.lang'); out['en_to_th_url']=pg.url
        await ctx.close()
        # legal pages in English
        ctx,pg=await page('en-US',390,844,True)
        for u in ['/en/privacy','/en/terms']:
            await pg.goto(B+u); await pg.wait_for_timeout(400); out[u]=[await pg.title(), await pg.evaluate(THAI_LEFT)]
        await pg.screenshot(path=shot('we3_privacy_m.png'))
        await pg.goto(B+'/en/'); await pg.wait_for_timeout(700); out['en_mobile_thai']=await pg.evaluate(THAI_LEFT)
        await pg.screenshot(path=shot('we4_landing_m.png'))
        await pg.evaluate("window.scrollTo(0, document.querySelector('#review').offsetTop)"); await pg.wait_for_timeout(600)
        await pg.screenshot(path=shot('we5_review_m.png'))
        await ctx.close()
        await b.close()
    check(out['en_url'].endswith('/en/') and out['en_thai']==[], 'English browser → English landing page without Thai', (out['en_url'], out['en_thai']))
    check(out['demo_de']=='das Macaron', 'sample switches to German', out['demo_de'])
    check(out['app_url'].endswith('/app') and out['app_lang']=='en' and out['welcome']=='👋 Welcome to Piccab', 'Start → English app with the welcome', (out['app_url'], out['app_lang']))
    check(out['privacy_href']=='/en/privacy', 'policy links go to the English pages', out['privacy_href'])
    check(out['returning'].endswith('/app'), 'returning visitors go to the app', out['returning'])
    check(out['th_url'].endswith(':8788/') or out['th_url'].rstrip('/').endswith(SERVER.split('//')[1]), 'Thai browser stays on the Thai page', out['th_url'])
    check(out['th_app_link']=='/app?hl=th' and out['th_to_en'].endswith('/en/'), 'Thai page links', (out['th_app_link'], out['th_to_en']))
    check(out['en_to_th'].endswith('/?hl=th') and out['en_to_th_app_lang']=='th', 'choosing ไทย on the English page', (out['en_to_th'], out['en_to_th_app_lang']))
    for u in ['/en/privacy','/en/terms']:
        check(out[u][1]==[], f'{u} has no Thai left', out[u])
    check(out['en_mobile_thai']==[], 'English landing on a phone', out['en_mobile_thai'])
    finish('English website', out, errs)
asyncio.run(main())
