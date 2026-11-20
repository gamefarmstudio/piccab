# 🎮 Game progress follows the account: XP / level, streak days, stickers, chests, bonus XP and boss wins are the same
# on every device signed in to it — nothing counted twice, a chest opened on one device is gone on the other, and
# another account signing in on the same device doesn't get the first one's progress.
import asyncio, json, urllib.request, datetime
from playwright.async_api import async_playwright
from common import *
BASE=SERVER
async def fwd(r):
    resp=await r.fetch(url=r.request.url.replace('https://oftzpfyydnmahkntucnj.supabase.co', FAKE)); await r.fulfill(response=resp)
async def newpage(b, errs, vw=1200, vh=900, mobile=False):
    ctx=await b.new_context(locale='th-TH', viewport={'width':vw,'height':vh}, is_mobile=mobile, has_touch=mobile, service_workers='block')
    pg=await ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e))); await pg.route('https://oftzpfyydnmahkntucnj.supabase.co/**', fwd); return pg
async def login(pg, em):
    await pg.click('#acctBtn'); await pg.fill('.mbox input[type=email]',em); await pg.click('.mbox button.primary'); await pg.wait_for_timeout(400)
    await pg.type('.mbox input.code','123456'); await pg.press('.mbox input.code','Enter'); await pg.wait_for_timeout(2500)
async def logout(pg):
    await pg.click('#acctBtn'); await pg.wait_for_timeout(300)
    await pg.click('.mbox button:has-text("ออกจากระบบ")'); await pg.wait_for_timeout(1500)
    for _ in range(3):
        if not await pg.locator('#modal:not([hidden])').count(): break
        await pg.evaluate("document.querySelector('#modal').click()"); await pg.wait_for_timeout(300)
def day(n):   # n days ago, as the app writes it
    d=datetime.date.today()-datetime.timedelta(days=n); return d.isoformat()
STATE="""(()=>{ const g=k=>JSON.parse(localStorage.getItem(k)||'null');
  return { days:Object.keys(g('pv-days')||{}).sort(), stk:g('pv-stk')||{}, chests:(g('pv-chests')||[]).length, chestc:g('pv-chestc'), bonus:g('pv-bonusxp')||0,
    boss:g('pv-boss')||0, lv:(document.querySelector('#lvPill')||{}).textContent||'', streak:(document.querySelector('#streakPill')||{}).textContent||'' }; })()"""
def seed(days, stk, chests, bonus, boss):
    return "(()=>{ const s=(k,v)=>localStorage.setItem(k, JSON.stringify(v));" + \
      f"s('pv-days', {json.dumps({d:{'n':12,'m':{'quiz':12},'t':5} for d in days})}); s('pv-stk', {json.dumps(stk)});" + \
      f"s('pv-chests', {json.dumps([{'t':'wood','d':1}]*chests)}); s('pv-bonusxp', {bonus}); s('pv-boss', {boss});" + \
      " localStorage.removeItem('pv-chestc'); })()"
def db_rows():
    return json.loads(urllib.request.urlopen(FAKE+'/__state').read())['db'].get('game_state',[])
async def until(pg, f, tries=40):
    v=None
    for _ in range(tries):
        v=await pg.evaluate(STATE)
        if f(v): return v
        await pg.wait_for_timeout(500)
    return v
async def main():
    async with async_playwright() as p:
        b=await launch(p); errs=[]; out={}
        # the tablet: three days in a row (up to today), two stickers, two chests waiting, 120 bonus XP, 2 bosses
        A=await newpage(b, errs); await A.goto(BASE+'/app'); await A.wait_for_timeout(600)
        await A.evaluate(seed([day(0),day(1),day(2)], {'cat':1,'dog':2}, 2, 120, 2)); await A.reload(); await A.wait_for_timeout(900)
        out['a0']=await A.evaluate(STATE)
        await login(A,'kid@home.th')
        for _ in range(30):
            if db_rows(): break
            await A.wait_for_timeout(500)
        out['row']=db_rows()
        # the phone (same account) had its own: an older day, another sticker, 50 bonus XP
        P=await newpage(b, errs, 390, 820, True); await P.goto(BASE+'/app'); await P.wait_for_timeout(600)
        await P.evaluate(seed([day(5)], {'fox':1}, 0, 50, 0)); await P.reload(); await P.wait_for_timeout(900)
        await login(P,'kid@home.th')
        out['p1']=await until(P, lambda v: v['bonus']==120 and v['chests']==2)
        # the phone opens a chest → the tablet has one left
        await P.click('.qtile'); await P.wait_for_timeout(500)
        await P.click('.chest'); await P.wait_for_timeout(2600)
        out['p2']=await P.evaluate(STATE)
        await P.keyboard.press('Escape'); await P.wait_for_timeout(5500)       # synced a few seconds after
        await A.reload(); await A.wait_for_timeout(1000)
        out['a2']=await until(A, lambda v: v['chests']==1)
        out['p2b']=await P.evaluate(STATE)
        # another account on the phone: the first one's progress leaves the phone (it stays in that account)
        await logout(P); await login(P,'other@home.th')
        out['p3']=await until(P, lambda v: v['bonus']==0 and not v['stk'])
        out['rows']=sorted(len(r['data'].get('days',{})) for r in db_rows())
        await P.screenshot(path=shot('gs_phone.png'))
        await b.close()
    a0,r=out['a0'],out['row']
    check(a0['streak'].strip()=='3', 'tablet: a 3-day streak before signing in', a0)
    check(len(r)==1 and sorted(r[0]['data']['days'])==sorted([day(0),day(1),day(2)]) and r[0]['data']['bonusxp']==120 and r[0]['data']['chestc']['got']=={'wood':2},
          'signing in sends the tablet\'s game progress to the account', r)
    p1=out['p1']
    check(p1['days']==sorted([day(0),day(1),day(2),day(5)]) and p1['stk']=={'cat':1,'dog':2,'fox':1}, 'phone: days and stickers from both devices', p1)
    check(p1['bonus']==120 and p1['chests']==2 and p1['boss']==2, 'phone: the larger bonus XP, the tablet\'s chests and bosses (not counted twice)', p1)
    check(p1['streak'].strip()=='3', 'phone: the same streak as the tablet', p1)
    p2,a2=out['p2'],out['a2']
    check(p2['chests']==1 and p2['chestc']['open'].get('wood')==1 and sum(p2['stk'].values())==5, 'phone: one chest opened, a sticker more', p2)
    check(a2['chests']==1 and a2['stk']==out['p2b']['stk'] and a2['bonus']==out['p2b']['bonus'], 'tablet: the chest is gone there too, same stickers and bonus XP', (a2, out['p2b']))
    check(a2['lv']==out['p2b']['lv'] and a2['lv'], 'the same level on both devices', (a2['lv'], out['p2b']['lv']))
    check(out['p3']['bonus']==0 and not out['p3']['stk'] and out['p3']['chests']==0 and out['p3']['days']==[], 'another account on the phone starts from its own progress', out['p3'])
    check(out['rows']==[0,4] or out['rows']==[4], 'the first account keeps its progress', out['rows'])
    finish('game progress sync', out, errs)
asyncio.run(main())
