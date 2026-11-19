# 🗺️ การเดินทาง: level pill, home tile, the map and badges; old progress is remembered quietly, a new badge is celebrated.
import asyncio, json
from playwright.async_api import async_playwright
from common import *
SEED = """(()=>{ if(localStorage.getItem('pv-seeded')) return; localStorage.setItem('pv-seeded','1');
  const dk=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  const days={}; [1,2,5,6,8,9,11,13,14,16,19,20].forEach((ago,i)=>{ const d=new Date(); d.setDate(d.getDate()-ago); days[dk(d)]={n:12+i, t:8, m:{quiz:10+i, find:3, learn:1, ...(i%2?{sent:2}:{})}}; });
  localStorage.setItem('pv-days', JSON.stringify(days));
  const T=Math.floor((Date.now()-new Date().getTimezoneOffset()*60000)/86400000), done={}, star={};
  ['teapot','sugar-bowl','milk-jug','jam','scone','teacup','saucer','napkin','vase','sponge-cake','shortbread'].forEach((k,i)=>{ done[k]={b:2,d:T+3}; if(i%2) star[k]=true; });
  done.macaron={b:2,d:T};
  localStorage.setItem('pv-progress', JSON.stringify({tea:{done, star, updatedAt:Date.now()}}));
  localStorage.setItem('pv-scene','tea');
})();"""
async def main():
    out={}; errs=[]
    async with async_playwright() as p:
        b=await launch(p)
        ctx=await b.new_context(locale='th-TH', viewport={'width':1200,'height':900}, service_workers='block', timezone_id='Asia/Bangkok')
        await ctx.add_init_script(SEED)
        pg=await ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.route('**/*', lambda r: app_route(r)); await pg.goto('https://piccab.test/app'); await pg.wait_for_timeout(2500)
        out['pill']=await pg.inner_text('#lvPill')
        out['tile']=await pg.inner_text('.tile.jtile')
        out['pop0']=await pg.locator('.achpop').count()                                      # old progress: no pop-ups
        out['ach0']=sorted(json.loads(await pg.evaluate("localStorage.getItem('pv-ach')"))['earned'].keys())
        # practise today → 3 days in a row → 🔥 badge
        await pg.click('.tile.srs.due'); await pg.wait_for_timeout(300)
        await pg.fill('#rvIn','macaron'); await pg.press('#rvIn','Enter')
        pops=[]
        for i in range(24):
            await pg.wait_for_timeout(250)
            if await pg.locator('.achpop.show').count():
                t=await pg.inner_text('.achpop.show')
                if t not in pops: pops.append(t)
                if len(pops)==1: await pg.screenshot(path=shot('jy0_pop.png'))
        out['pops']=pops
        await pg.click('.rv-end button:has-text("ปิด")'); await pg.wait_for_timeout(300)
        await pg.click('#lvPill'); await pg.wait_for_timeout(500)
        out['head']=await pg.inner_text('.jhead')
        out['nodes']=await pg.locator('.jnode').count(); out['here']=await pg.locator('.jnode.here').count(); out['done_n']=await pg.locator('.jnode.done').count()
        out['badges']=await pg.locator('.jbadge').count(); out['got']=await pg.locator('.jbadge.got b').all_inner_texts()
        await pg.screenshot(path=shot('jy1_journey.png'), full_page=True)
        await pg.set_viewport_size({'width':390,'height':844}); await pg.wait_for_timeout(300)
        await pg.screenshot(path=shot('jy2_journey_phone.png'), full_page=True)
        await b.close()
    check(out['pill'].startswith('⭐') and 'Lv.' in out['pill'], 'level pill', out['pill'])
    check('การเดินทางของฉัน' in out['tile'] and 'ตรา' in out['tile'], 'home tile', out['tile'])
    check(out['pop0']==0 and 'w10' in out['ach0'] and 'k3' not in out['ach0'], 'old progress remembered quietly', (out['pop0'], out['ach0']))
    check(any('ได้ตราใหม่' in t and 'จุดไฟ' in t for t in out['pops']), 'new badge celebrated', out['pops'])
    check('XP' in out['head'] and out['nodes']==10 and out['here']==1, 'map with 10 places, one "here"', (out['head'], out['nodes'], out['here']))
    check(out['badges']==36 and 'จุดไฟ' in out['got'] and 'คำแรก ๆ' in out['got'], 'badges', (out['badges'], out['got']))
    finish('journey', out, errs)
asyncio.run(main())
