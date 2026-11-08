import asyncio, json
from playwright.async_api import async_playwright
from common import *
BASE=SERVER.replace('127.0.0.1','localhost')   # the app registers its service worker on https or localhost only
IMG=PHOTO
async def no_supabase(r): await r.fulfill(status=404, body='{}')
async def main():
    async with async_playwright() as p:
        b=await launch(p)
        out={}; errs=[]
        ctx=await b.new_context(locale='th-TH', viewport={'width':1200,'height':860}); await ctx.route(SUPA+'/**', no_supabase); pg=await ctx.new_page()
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(BASE+'/app'); await pg.wait_for_timeout(500)
        await pg.evaluate("navigator.serviceWorker.ready"); await pg.reload(); await pg.wait_for_timeout(800)
        out['controlled']=await pg.evaluate("!!navigator.serviceWorker.controller")
        cdp=await ctx.new_cdp_session(pg)
        out['install_errors']=(await cdp.send('Page.getInstallabilityErrors'))['installabilityErrors']
        man=await cdp.send('Page.getAppManifest'); out['manifest_errors']=man.get('errors')
        out['cached']=sorted(await pg.evaluate("caches.open('piccab-v4').then(c=>c.keys()).then(k=>k.map(r=>new URL(r.url).pathname))"))
        # make a scene, then go offline
        await pg.set_input_files('#fileImg', IMG); await pg.wait_for_timeout(800); await skip_ai_offer(pg)
        out['ai_btn_online']=await pg.locator('#sub .ai').count()
        await pg.click('#homeBtn'); await pg.wait_for_timeout(200)
        # fake install prompt
        await pg.evaluate("""()=>{ const e=new Event('beforeinstallprompt'); window._prompted=0; e.prompt=()=>{window._prompted++;}; e.userChoice=Promise.resolve({outcome:'accepted'}); window.dispatchEvent(e); }""")
        await pg.wait_for_timeout(200)
        out['tile']=await pg.locator('.tile.install').count(); out['footer_link']=await pg.locator('#installLink').is_visible()
        await pg.screenshot(path=shot('pw1_tile.png'))
        await pg.click('.tile.install .primary'); await pg.wait_for_timeout(200)
        out['prompted']=await pg.evaluate('window._prompted')
        await ctx.set_offline(True); await pg.wait_for_timeout(300)
        out['offline_toast']=await pg.inner_text('#toast')
        await pg.reload(); await pg.wait_for_timeout(1200)
        out['offline_title']=await pg.title()
        out['offline_scenes']=await pg.evaluate("JSON.parse(localStorage.getItem('pv-scenes2')||'[]').length")
        out['offline_font']=await pg.evaluate("document.fonts.check('16px Sarabun','ก')")
        await pg.click('.mainnav button[data-view=library]'); await pg.wait_for_timeout(300)
        out['offline_lib_rows']=await pg.locator('#libList .lcard').count()
        await pg.screenshot(path=shot('pw2_offline.png'))
        p2=await ctx.new_page(); await p2.goto(BASE+'/privacy'); await p2.wait_for_timeout(500); out['offline_privacy']=await p2.inner_text('h1')
        await ctx.set_offline(False); await pg.wait_for_timeout(500)
        out['online_toast']=await pg.inner_text('#toast')
        out['api_cached']=await pg.evaluate("caches.open('piccab-v4').then(c=>c.keys()).then(k=>k.some(r=>r.url.includes('/api/')))")
        # standalone → no tile
        await cdp.send('Emulation.setEmulatedMedia', {'features':[{'name':'display-mode','value':'standalone'}]})
        await pg.click('.mainnav button[data-view=home]'); await pg.wait_for_timeout(300)
        out['standalone_tile']=await pg.locator('.tile.install').count()
        # iPhone Safari → guide
        ios=await b.new_context(locale='th-TH', viewport={'width':390,'height':844}, is_mobile=True, has_touch=True, user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1')
        await ios.route(SUPA+'/**', no_supabase); ip=await ios.new_page(); ip.on('pageerror', lambda e: errs.append(str(e)))
        await ip.goto(BASE+'/app'); await ip.wait_for_timeout(700)
        out['ios_tile']=await ip.locator('.tile.install').count()
        await ip.screenshot(path=shot('pw3_ios_tile.png'))
        await ip.click('.tile.install .primary'); await ip.wait_for_timeout(200)
        out['ios_steps']=await ip.locator('.iosteps li').count()
        await ip.screenshot(path=shot('pw4_ios_guide.png'))
        await ip.click('#mbox >> text=เข้าใจแล้ว'); await ip.click('.tile.install .x'); await ip.wait_for_timeout(200)
        out['ios_dismissed']=await ip.locator('.tile.install').count()
        await b.close()
    check(out['controlled'], 'service worker controls the app')
    check(not out['manifest_errors'], 'manifest has no errors', out['manifest_errors'])
    for u in ['/', '/app', '/privacy', '/terms', '/en', '/en/privacy', '/en/terms', '/i18n/en.js', '/fonts/fonts.css', '/vendor/supabase-2.119.0.js']:
        check(u in out['cached'], f'{u} is kept for offline', out['cached'])
    check(out['tile']==1 and out['footer_link'] and out['prompted']==1, 'install tile and prompt', (out['tile'], out['footer_link'], out['prompted']))
    check('ออฟไลน์' in out['offline_toast'], 'going offline is announced', out['offline_toast'])
    check(out['offline_scenes']==1 and out['offline_lib_rows']>=2 and out['offline_font'], 'the app works offline with its scenes and fonts', (out['offline_scenes'], out['offline_lib_rows']))
    check(out['offline_privacy']=='นโยบายความเป็นส่วนตัว', 'policy page offline', out['offline_privacy'])
    check(not out['api_cached'], 'API answers are never cached')
    check(out['standalone_tile']==0, 'no install tile inside the installed app', out['standalone_tile'])
    check(out['ios_tile']==1 and out['ios_steps']==4 and out['ios_dismissed']==0, 'iPhone install guide', (out['ios_tile'], out['ios_steps'], out['ios_dismissed']))
    finish('app install + offline', out, errs)
asyncio.run(main())
