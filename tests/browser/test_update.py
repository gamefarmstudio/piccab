# ✨ A new version is out: an app left open shows a bar to reload (when it comes back on screen, at most every
# 10 minutes); the reload is the user's tap. The same version → no bar; ✕ hides it.
import asyncio
from playwright.async_api import async_playwright
from common import *
async def main():
    out={}; errs=[]
    async with async_playwright() as p:
        b=await launch(p)
        ctx=await b.new_context(locale='th-TH', viewport={'width':390,'height':844}, is_mobile=True, has_touch=True, service_workers='block')
        pg=await ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
        state={'new':False, 'checks':0, 'navs':0}
        async def extra(r):
            # the app's own check fetches /app; a navigation (the reload) gets the page as usual
            if r.request.url.split('?')[0].endswith('/app') and r.request.resource_type=='fetch':
                state['checks']+=1
                html=open(PUB/'app.html').read()
                if state['new']: html=html.replace('/assets/app-', '/assets/app-NEWBUILD')
                return await r.fulfill(status=200, content_type='text/html', body=html)
            if r.request.url.split('?')[0].endswith('/app') and r.request.is_navigation_request(): state['navs']+=1
            return False
        await pg.clock.install()
        await pg.route('**/*', lambda r: app_route(r, extra=extra)); await pg.goto('https://piccab.test/app'); await pg.wait_for_timeout(700)
        show=lambda: pg.evaluate("document.dispatchEvent(new Event('visibilitychange'))")
        # back on screen after 2 minutes: too soon to look
        await pg.clock.fast_forward(2*60*1000); await show(); await pg.wait_for_timeout(300)
        out['early']=state['checks']
        # 11 minutes, same version: looked, no bar
        await pg.clock.fast_forward(9*60*1000); await show(); await pg.wait_for_timeout(500)
        out['same']=(state['checks'], await pg.locator('.updbar').count())
        # a new version is deployed; 11 minutes later the app comes back on screen → the bar
        state['new']=True
        await pg.clock.fast_forward(11*60*1000); await show(); await pg.wait_for_timeout(500)
        out['bar']=(await pg.locator('.updbar').count(), await pg.locator('.updbar').inner_text() if await pg.locator('.updbar').count() else '')
        await pg.screenshot(path=shot('update_bar.png'))
        # ✕: gone, and not shown again in this visit
        await pg.click('.updbar button.icon'); await pg.wait_for_timeout(200)
        await pg.clock.fast_forward(11*60*1000); await show(); await pg.wait_for_timeout(500)
        out['closed']=await pg.locator('.updbar').count()
        # a fresh visit with the old page still open somewhere else → bar → อัปเดต reloads the page
        state['new']=False; await pg.reload(); await pg.wait_for_timeout(700); state['new']=True; n0=state['navs']
        await pg.clock.fast_forward(11*60*1000); await show(); await pg.wait_for_timeout(500)
        await pg.click('.updbar button.primary'); await pg.wait_for_timeout(1200)
        out['reloaded']=state['navs']-n0
        await b.close()
    check(out['early']==0, 'no check within 10 minutes', out['early'])
    check(out['same']==(1,0), 'same version: checked, no bar', out['same'])
    check(out['bar'][0]==1 and 'เวอร์ชันใหม่' in out['bar'][1], 'new version: the bar shows', out['bar'])
    check(out['closed']==0, '✕ hides it', out['closed'])
    check(out['reloaded']==1, 'อัปเดต reloads the app', out['reloaded'])
    finish('update bar', out, errs)
asyncio.run(main())
