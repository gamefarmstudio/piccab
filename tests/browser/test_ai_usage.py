import asyncio, json, urllib.request, random, time, re
from playwright.async_api import async_playwright
from common import *
BASE=SERVER
def seed(rows):
    r=urllib.request.Request(FAKE+'/rest/v1/ai_usage', data=json.dumps(rows).encode(), method='POST', headers={'content-type':'application/json','apikey':'sb_secret_test'})
    urllib.request.urlopen(r)
async def fwd(r):
    resp=await r.fetch(url=r.request.url.replace('https://oftzpfyydnmahkntucnj.supabase.co', FAKE)); await r.fulfill(response=resp)
async def main():
    random.seed(3); rows=[]; now=time.time()
    iso=lambda t: time.strftime('%Y-%m-%dT%H:%M:%S.000Z', time.gmtime(t))
    for d in range(1,24):
        for i in range(random.randint(5,60)):
            t=now-d*86400+random.randint(0,80000)
            rows.append({'kind':'scan','provider':'gemini','model':random.choice(['gemini-3.8-flash']*2+['gemini-3.5-flash-lite']*5),'outcome':'ok','ms':30000,'tok_in':1800,'tok_out':random.randint(1500,5000),'created_at':iso(t)})
        if d%3==0: rows.append({'kind':'translate','provider':'gemini','model':'gemini-3.5-flash-lite','outcome':'ok','ms':4000,'tok_in':600,'tok_out':500,'created_at':iso(now-d*86400)})
    # today (the last hour): 3.8 used up, the rest on Lite
    for i in range(20): rows.append({'kind':'scan','provider':'gemini','model':'gemini-3.8-flash','outcome':'ok','ms':25000,'tok_in':1900,'tok_out':4200,'created_at':iso(now-3000+i)})
    for i in range(6): rows.append({'kind':'scan','provider':'gemini','model':'gemini-3.8-flash','outcome':'quota_day','ms':300,'tok_in':None,'tok_out':None,'created_at':iso(now-1500+i)})
    for i in range(6): rows.append({'kind':'scan','provider':'gemini','model':'gemini-3.6-flash','outcome':'ok' if i<4 else 'quota_minute','ms':22000,'tok_in':1900 if i<4 else None,'tok_out':3000 if i<4 else None,'created_at':iso(now-1400+i)})
    for i in range(35): rows.append({'kind':'scan','provider':'gemini','model':'gemini-3.5-flash-lite','outcome':'ok','ms':12000,'tok_in':1800,'tok_out':2600,'created_at':iso(now-1200+i)})
    rows.append({'kind':'scan','provider':'gemini','model':'gemini-3.5-flash-lite','outcome':'invalid_json','ms':9000,'tok_in':None,'tok_out':None,'created_at':iso(now-100)})
    rows.append({'kind':'translate','provider':'gemini','model':'gemini-3.5-flash-lite','outcome':'ok','ms':4000,'tok_in':700,'tok_out':600,'created_at':iso(now-50)})
    seed(rows)
    async with async_playwright() as p:
        b=await launch(p); errs=[]; out={}
        for (w,h,mob,name) in [(1200,900,False,'d'),(390,844,True,'m')]:
            ctx=await b.new_context(locale='th-TH', viewport={'width':w,'height':h}, is_mobile=mob, has_touch=mob, service_workers='block')
            A=await ctx.new_page(); A.on('pageerror', lambda e: errs.append(str(e))); await A.route('https://oftzpfyydnmahkntucnj.supabase.co/**', fwd)
            await A.goto(BASE+'/app'); await A.wait_for_timeout(500)
            await A.click('#acctBtn'); await A.fill('.mbox input[type=email]','boss@piccab.th'); await A.click('.mbox button.primary'); await A.wait_for_timeout(400)
            await A.type('.mbox input.code','123456'); await A.press('.mbox input.code','Enter'); await A.wait_for_timeout(2500)
            await A.goto(BASE+'/admin'); await A.wait_for_timeout(2500)
            await A.click('.admtabs button:has-text("การใช้ AI")'); await A.wait_for_timeout(1500)
            out[name+'_verdict']=await A.inner_text('.aiverdict')
            out[name+'_cards']=await A.inner_text('.aicards')
            out[name+'_quota']=await A.inner_text('.aicard.wide')
            out[name+'_cols']=await A.locator('.aicol').count()
            await A.screenshot(path=shot(f'aiu_{name}.png'), full_page=True)
            await ctx.close()
        await b.close()
    for n in ['d','m']:
        check('ℹ️' in out[n+'_verdict'], f'{n}: verdict — better models ran out, nobody blocked', out[n+'_verdict'])
        today=re.search(r'วันนี้\n(\d+) รูป', out[n+'_cards'])
        check(today and int(today.group(1))>=59 and 'โควตาหมด 8 ครั้ง' in out[n+'_cards'], f'{n}: today counts (59 seeded in the last hour)', out[n+'_cards'])
        check('ถ้าจ่ายเงิน' in out[n+'_cards'], f'{n}: paid estimate shown', out[n+'_cards'])
        q=re.search(r'gemini-3.8-flash\n(\d+) / 20', out[n+'_quota'])
        check(q and int(q.group(1))>=20 and '/ 500' in out[n+'_quota'], f'{n}: free quota bars', out[n+'_quota'])
        check(out[n+'_cols']==30, f'{n}: 30-day chart', out[n+'_cols'])
    finish('AI usage', out, errs)
asyncio.run(main())
