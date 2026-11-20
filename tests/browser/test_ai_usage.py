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
    # today (the last hour, but inside Google's free-quota day, which starts at midnight Pacific time): 3.8 used up, the rest on Lite
    import datetime, zoneinfo
    pt=datetime.datetime.now(zoneinfo.ZoneInfo('America/Los_Angeles')); day0=pt.replace(hour=0,minute=0,second=0,microsecond=0).timestamp()
    at=lambda ago: max(now-ago, min(now-1, day0+(3000-ago)/30+1))   # squeezed in after midnight when it is just past it
    for i in range(20): rows.append({'kind':'scan','provider':'gemini','model':'gemini-3.8-flash','outcome':'ok','ms':25000,'tok_in':1900,'tok_out':4200,'created_at':iso(at(3000-i))})
    for i in range(6): rows.append({'kind':'scan','provider':'gemini','model':'gemini-3.8-flash','outcome':'quota_day','ms':300,'tok_in':None,'tok_out':None,'created_at':iso(at(1500-i))})
    for i in range(6): rows.append({'kind':'scan','provider':'gemini','model':'gemini-3.6-flash','outcome':'ok' if i<4 else 'quota_minute','ms':22000,'tok_in':1900 if i<4 else None,'tok_out':3000 if i<4 else None,'created_at':iso(at(1400-i))})
    for i in range(35): rows.append({'kind':'scan','provider':'gemini','model':'gemini-3.5-flash-lite','outcome':'ok','ms':12000,'tok_in':1800,'tok_out':2600,'created_at':iso(at(1200-i))})
    rows.append({'kind':'scan','provider':'gemini','model':'gemini-3.5-flash-lite','outcome':'invalid_json','ms':9000,'tok_in':None,'tok_out':None,'created_at':iso(at(100))})
    rows.append({'kind':'translate','provider':'gemini','model':'gemini-3.5-flash-lite','outcome':'ok','ms':4000,'tok_in':700,'tok_out':600,'created_at':iso(at(50))})
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
            # 🧪 compare: the same picture from the three free Gemini models and Claude side by side
            # (the AI answers are faked here; the Worker is unit-tested)
            sent=[]
            async def fake_compare(r):
                body=json.loads(r.request.post_data); sent.append(body)
                one=lambda m,p,n,ms,ti,to,usd,free,ok=True: {'provider':p,'model':m,'ok':ok,'items':[{'word':w,'th':t,'box':bx} for w,t,bx in [('chair','เก้าอี้',[100,400,300,900]),('lamp','โคมไฟ',[600,50,800,400]),('rug','พรม',[200,800,900,990])][:n]],'ms':ms,'tok_in':ti,'tok_out':to,'cost_usd':usd,'free_rpd':free, **({} if ok else {'error':'rate_limited','why':'quota_day'})}
                res={'gemini-3.5-flash-lite':one('gemini-3.5-flash-lite','gemini',2,9100,1800,2600,0.00704,500),
                     'gemini-3.8-flash':one('gemini-3.8-flash','gemini',3,7000,1800,2000,0.0089,20),
                     'gemini-3.6-flash':one('gemini-3.6-flash','gemini',0,800,0,0,None,20,ok=False),
                     'claude-haiku-5-5':one('claude-haiku-5-5','claude',3,6200,2100,1300,0.00086,None),
                     'claude-sonnet-5-5':one('claude-sonnet-5-5','claude',3,8000,2100,1300,0.017,None)}
                await r.fulfill(status=200, content_type='application/json', body=json.dumps({'results':[res[m] for m in body['models']]}))
            await A.route('**/api/admin/compare', fake_compare)
            await A.click('.admtabs button:has-text("เทียบ AI")'); await A.wait_for_timeout(300)
            out[name+'_cmp_chips']=[(await c.inner_text(), await c.locator('input').is_checked()) for c in await A.locator('.cmpm').all()]
            out[name+'_cmp_disabled']=await A.locator('.cmpctl button.primary').is_disabled()
            await A.set_input_files('.cmpctl input[type=file]', PHOTO); await A.wait_for_timeout(800)
            out[name+'_cmp_btn']=await A.inner_text('.cmpctl button.primary')
            await A.click('.cmpctl button.primary'); await A.wait_for_timeout(800)
            out[name+'_cmp_sent']=bool(sent) and sent[0]['image'].startswith('data:image/jpeg') and sent[0]['models']==['gemini-3.5-flash-lite','gemini-3.8-flash','gemini-3.6-flash','claude-haiku-5-5']
            out[name+'_cmp_cols']=await A.locator('.cmpcol').count()
            out[name+'_cmp_boxes']=[await A.locator('.cmpcol').nth(i).locator('svg rect').count() for i in range(4)]
            out[name+'_cmp_cost']=await A.locator('.cmpcost').all_inner_texts()
            out[name+'_cmp_err']=await A.locator('.cmpcol .err').all_inner_texts()
            out[name+'_cmp_sum']=await A.inner_text('.cmptab')
            # untick one, tick Sonnet → the next comparison sends those (and it is remembered)
            await A.locator('.cmpm', has_text='gemini-3.6-flash').locator('input').uncheck(); await A.wait_for_timeout(200)
            await A.locator('.cmpm', has_text='claude-sonnet-5-5').locator('input').check(); await A.wait_for_timeout(200)
            await A.click('.cmpctl button.primary'); await A.wait_for_timeout(800)
            out[name+'_cmp_sent2']=sent[-1]['models']; out[name+'_cmp_kept']=await A.evaluate("JSON.parse(localStorage.getItem('pv-cmp-models'))")
            await A.locator('.cmpm', has_text='gemini-3.6-flash').locator('input').check(); await A.locator('.cmpm', has_text='claude-sonnet-5-5').locator('input').uncheck()
            await A.click('.cmpctl button.primary'); await A.wait_for_timeout(800)
            await A.screenshot(path=shot(f'aiu_cmp_{name}.png'), full_page=True)
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
        check([c for c,on in out[n+'_cmp_chips'] if on]==['gemini-3.5-flash-lite\nฟรี','gemini-3.8-flash\nฟรี','gemini-3.6-flash\nฟรี','claude-haiku-5-5'] and len(out[n+'_cmp_chips'])==5, f'{n}: the three free Gemini models and Claude ticked', out[n+'_cmp_chips'])
        check(out[n+'_cmp_disabled'] and out[n+'_cmp_sent'] and 'เทียบ 4 รุ่น' in out[n+'_cmp_btn'], f'{n}: compare sends the picture with the ticked models', (out[n+'_cmp_disabled'], out[n+'_cmp_sent'], out[n+'_cmp_btn']))
        check(out[n+'_cmp_cols']==4 and out[n+'_cmp_boxes']==[2,3,0,3], f'{n}: four columns with their boxes', (out[n+'_cmp_cols'], out[n+'_cmp_boxes']))
        check(out[n+'_cmp_cost']==['ฟรี (วันละ 500 ครั้ง) · ถ้าจ่าย ~0.24 บาท/รูป ($0.0070)','ฟรี (วันละ 20 ครั้ง) · ถ้าจ่าย ~0.30 บาท/รูป ($0.0089)','~0.03 บาท/รูป ($0.0009)'], f'{n}: free quota and cost per picture in baht', out[n+'_cmp_cost'])
        check(out[n+'_cmp_err']==['โควตาฟรีวันนี้ของรุ่นนี้หมดแล้ว (เริ่มใหม่ราวบ่ายสามโมง)'], f'{n}: a model out of quota says so', out[n+'_cmp_err'])
        check('gemini-3.8-flash (ฟรี)' in out[n+'_cmp_sum'] and 'claude-haiku-5-5' in out[n+'_cmp_sum'] and 'gemini-3.5-flash-lite (ฟรี)' in out[n+'_cmp_sum'], f'{n}: averages table', out[n+'_cmp_sum'])
        check(out[n+'_cmp_sent2']==['gemini-3.5-flash-lite','gemini-3.8-flash','claude-haiku-5-5','claude-sonnet-5-5'] and out[n+'_cmp_kept']==out[n+'_cmp_sent2'], f'{n}: ticks change what is compared, and are remembered', (out[n+'_cmp_sent2'], out[n+'_cmp_kept']))
    finish('AI usage', out, errs)
asyncio.run(main())
