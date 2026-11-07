import asyncio, json
from playwright.async_api import async_playwright
from common import *
ROOT=str(PUB)
LAND=(PUB/'index.html').read_text(encoding='utf-8')
LAND_EN=(PUB/'en'/'index.html').read_text(encoding='utf-8')
APP=HTML
async def route(r):
    u=r.request.url
    if 'piccab.test' not in u: return await r.abort()
    path=u.split('piccab.test')[1].split('#')[0]; pth=path.split('?')[0]
    if pth.endswith('.js') and 'supabase' in pth: return await r.fulfill(status=200, content_type='application/javascript', body=SBJS)
    if pth=='/api/health': return await r.fulfill(status=200, content_type='application/json', body='{"ai":false}')
    if 'supabase.co' in u: return await r.fulfill(status=404, body='{}')
    if pth=='/': return await r.fulfill(status=200, content_type='text/html', body=LAND)
    if pth=='/en/': return await r.fulfill(status=200, content_type='text/html', body=LAND_EN)
    if pth=='/app': return await r.fulfill(status=200, content_type='text/html', body=APP)
    try: return await r.fulfill(status=200, path=ROOT+pth)
    except Exception as e:
        print('ROUTE ERR', pth, e); return await r.fulfill(status=404, body='nf')
async def main():
    out={}; errs=[]; failed=[]
    async with async_playwright() as p:
        b=await launch(p)
        for name,vp,mob in [('desk',(1280,860),False),('phone',(390,844),True)]:
            ctx=await b.new_context(locale='th-TH', viewport={'width':vp[0],'height':vp[1]}, is_mobile=mob, has_touch=mob, device_scale_factor=1 if not mob else 2, service_workers='block')
            await ctx.add_init_script("window.__said=[]; if(window.speechSynthesis){ speechSynthesis.speak=u=>__said.push(u.text); }")
            pg=await ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: m.type=='error' and errs.append(m.text))
            pg.on('requestfailed', lambda r: failed.append(r.url))
            pg.on('response', lambda r: r.status>=400 and failed.append((r.status,r.url)))
            await pg.route('**/*', route); await pg.goto('https://piccab.test/'); await pg.wait_for_timeout(900)
            out[name+'_url']=pg.url
            pins=pg.locator('.pin:visible'); out[name+'_pins']=await pins.count()
            await pins.nth(1).click(); await pg.wait_for_timeout(200)
            out[name+'_said']=await pg.evaluate("__said"); out[name+'_heard']=await pg.locator('#heard').inner_text()
            out[name+'_overflowX']=await pg.evaluate("document.documentElement.scrollWidth>innerWidth+1")
            # reveal all for full-page shot
            await pg.evaluate("document.querySelectorAll('.reveal').forEach(e=>e.classList.add('in'))")
            await pg.screenshot(path=shot(f'ld_{name}.png'), full_page=True)
            await pg.screenshot(path=shot(f'ld_{name}_top.png'))
            # faq toggles
            await pg.locator('.faq summary').first.click(); out[name+'_faq']=await pg.locator('.faq details').first.get_attribute('open')
            # CTA → /app
            await pg.click('.hero .btn.primary'); await pg.wait_for_timeout(900)
            out[name+'_cta']=pg.url
            # now a returning visitor: / redirects to /app; /?home stays
            await pg.goto('https://piccab.test/'); await pg.wait_for_timeout(700); out[name+'_return']=pg.url
            await pg.goto('https://piccab.test/?home'); await pg.wait_for_timeout(500); out[name+'_home']=pg.url
            await ctx.close()
        # sign-in return lands on / with tokens → passed to /app with the hash
        ctx=await b.new_context(locale='th-TH', service_workers='block'); pg=await ctx.new_page(); await pg.route('**/*', route)
        await pg.goto('https://piccab.test/#access_token=abc&refresh_token=x&type=magiclink'); await pg.wait_for_timeout(600)
        out['auth_forward']=pg.url.split('piccab.test')[1][:40]
        await pg.goto('https://piccab.test/app?login'); await pg.wait_for_timeout(1500)
        out['login_param']=(pg.url.split('piccab.test')[1], await pg.locator('.mbox h3').first.inner_text() if await pg.locator('.mbox h3').count() else None)
        await pg.goto('https://piccab.test/app?install'); await pg.wait_for_timeout(1500)
        out['install_param']=(pg.url.split('piccab.test')[1], await pg.locator('.mbox h3').first.inner_text() if await pg.locator('.mbox h3').count() else None)
        await ctx.close()
        # an English browser gets the English page, which has no Thai except the "ไทย" switch
        ctx=await b.new_context(locale='en-US', service_workers='block'); pg=await ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e))); await pg.route('**/*', route)
        await pg.goto('https://piccab.test/'); await pg.wait_for_timeout(900)
        out['en_url']=pg.url; out['en_thai']=await pg.evaluate(THAI_LEFT); out['en_cta']=await pg.locator('.hero .btn.primary').get_attribute('href')
        await ctx.close(); await b.close()
    bad=[f for f in failed if 'google' not in str(f) and 'supabase' not in str(f)]
    for name in ['desk','phone']:
        check(out[name+'_url']=='https://piccab.test/', f'{name}: first visit shows the landing page', out[name+'_url'])
        check(out[name+'_faq'] is not None, f'{name}: FAQ opens', out[name+'_faq'])
        check(out[name+'_cta']=='https://piccab.test/app', f'{name}: start button opens the app', out[name+'_cta'])
        check(out[name+'_return']=='https://piccab.test/app', f'{name}: returning visitors go straight to the app', out[name+'_return'])
        check(out[name+'_home']=='https://piccab.test/?home', f'{name}: ?home stays on the landing page', out[name+'_home'])
    check(out['auth_forward'].startswith('/app#access_token=abc'), 'sign-in links are passed to the app', out['auth_forward'])
    check(out['login_param'][1] and 'เข้าสู่ระบบ' in out['login_param'][1], '/app?login opens sign-in', out['login_param'])
    check(out['install_param'][1] and 'ติดตั้ง' in out['install_param'][1], '/app?install opens install help', out['install_param'])
    check(out['en_url']=='https://piccab.test/en/' and out['en_thai']==[] and out['en_cta']=='/app?hl=en', 'English browsers get the English page', (out['en_url'], out['en_thai'], out['en_cta']))
    check(not bad, 'every file on the landing page loads', bad[:5])
    finish('landing pages', out, errs)
asyncio.run(main())
