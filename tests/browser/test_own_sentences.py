# ✍️ Sentences for your own scenes and word sheets: made by AI on request (1 credit), then played like the library's.
import asyncio, json, base64
from playwright.async_api import async_playwright
from common import *
SENT=[]
REPLY={'scene':[{'en':'The cat is sleeping on the sofa.','th':'แมวกำลังนอนบนโซฟา','words':['cat','sofa']},
                {'en':'A lamp is next to the sofa.','th':'มีโคมไฟอยู่ข้างโซฟา','words':['lamp','sofa']},
                {'en':'The sun is very hot.','th':'ดวงอาทิตย์ร้อนมาก','words':[]}],   # no word from the scene: left out
       'list':[{'en':'I eat an apple every day.','th':'ฉันกินแอปเปิลทุกวัน','words':['apple']},
               {'en':'Monkeys like bananas.','th':'ลิงชอบกล้วย','words':['banana']},
               {'en':'The elephant is very big.','th':'ช้างตัวใหญ่มาก','words':['elephant']}]}
async def extra(r):
    if r.request.url.endswith('/api/sentences'):
        b=json.loads(r.request.post_data or '{}'); SENT.append(b); await asyncio.sleep(1.6)   # the AI takes a while
        return await r.fulfill(status=200, content_type='application/json', body=json.dumps({'items':REPLY[b.get('kind')], 'credits_left':7}))
    return False
async def main():
    out={}; errs=[]
    img='data:image/png;base64,'+base64.b64encode(open(PHOTO,'rb').read()).decode()
    async with async_playwright() as p:
        b=await launch(p)
        ctx=await b.new_context(locale='th-TH', viewport={'width':390,'height':844}, is_mobile=True, has_touch=True, service_workers='block')
        await ctx.add_init_script("window.speechSynthesis && (speechSynthesis.speak=()=>{});")
        pg=await ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.route('**/*', lambda r: app_route(r, health='{"ai":true}', extra=extra)); await pg.goto('https://piccab.test/app'); await pg.wait_for_timeout(600)
        # a scene of your own, with a picture
        await pg.evaluate("""(img)=>{ const sc={id:'s1own',name:'My room',w:1200,h:900,img,items:{a1:{word:'cat',th:'แมว',alts:[],x:100,y:500,w:250,h:200},a2:{word:'sofa',th:'โซฟา',alts:['couch'],x:400,y:450,w:500,h:300},a3:{word:'lamp',th:'โคมไฟ',alts:[],x:950,y:100,w:150,h:400}}};
          const a=JSON.parse(localStorage.getItem('pv-scenes2')||'[]'); a.push(sc); localStorage.setItem('pv-scenes2',JSON.stringify(a)); localStorage.setItem('pv-scene','s1own'); localStorage.setItem('pv-ai-code',JSON.stringify('x')); }""", img)
        await pg.reload(); await pg.wait_for_timeout(700)
        await pg.click('#bnav [data-view=library]'); await pg.wait_for_timeout(300)
        await pg.locator('#libList .lcard:has-text("My room")').click(); await pg.wait_for_timeout(300); await pg.click('#mbox .modebtn.primary'); await pg.wait_for_timeout(600)
        sb=pg.locator('#modes button[data-mode="sent"]')
        out['btn']=await sb.is_visible(); await sb.click(); await pg.wait_for_timeout(300)
        out['make']=await pg.inner_text('.sentgame.make')
        await pg.screenshot(path=shot('own1_make.png'))
        await pg.click('.sentgame.make button.primary'); await pg.wait_for_timeout(1300)
        out['wait']=await pg.inner_text('.sentgame.make .aiwait')
        await pg.screenshot(path=shot('own1b_wait.png'))
        await pg.wait_for_timeout(1200)
        out['source']=await pg.inner_text('.sentgame .saisrc')
        out['req']=(SENT[-1].get('kind'), [w['w'] for w in SENT[-1]['words']], str(SENT[-1].get('image',''))[:22])
        out['game']=await pg.locator('.sentgame .spool .stile').count()
        out['saved']=await pg.evaluate("JSON.parse(localStorage.getItem('pv-scenes2')).find(s=>s.id==='s1own').sentences")
        await pg.screenshot(path=shot('own2_game.png'))
        # 🚩 takes an odd sentence out
        pg.once('dialog', lambda d: d.accept())
        await pg.click('.sentgame .sflag'); await pg.wait_for_timeout(300)
        if await pg.locator('#mbox button.primary').count(): await pg.click('#mbox button.primary'); await pg.wait_for_timeout(400)
        out['after_flag']=len(await pg.evaluate("JSON.parse(localStorage.getItem('pv-scenes2')).find(s=>s.id==='s1own').sentences"))
        # a word sheet: example sentences, no picture sent
        await pg.click('#homeBtn'); await pg.wait_for_timeout(300)
        await pg.click('#bnav [data-view=library]'); await pg.wait_for_timeout(300); await pg.click('#importBtn'); await pg.wait_for_timeout(200); await pg.click('.wsimp'); await pg.wait_for_timeout(200)
        await pg.fill('.wsbox textarea','apple แอปเปิล\nbanana กล้วย\nelephant ช้าง'); await pg.click('.wsbox .row .primary'); await pg.wait_for_timeout(1200)
        await pg.click('#modes button[data-mode="sent"]'); await pg.wait_for_timeout(300)
        out['make_list']=await pg.inner_text('.sentgame.make')
        await pg.click('.sentgame.make button.primary'); await pg.wait_for_timeout(2600)
        out['req_list']=(SENT[-1].get('kind'), 'image' in SENT[-1])
        out['game_list']=await pg.locator('.sentgame .spool .stile').count()
        # German practice: no sentence game
        await b.close()
    print(json.dumps(out, ensure_ascii=False, indent=1)[:2500], errs)
    ok=True
    def check(c, what, got):
        nonlocal ok
        print(('  ✓ ' if c else '  ✗ ')+what+('' if c else f' — got {got!r}')); ok = ok and c
    check(out['btn'] and 'สร้างประโยคด้วย AI' in out['make'] and 'ดูภาพ' in out['make'], 'own scene: the mode shows, with a button to make sentences', out['make'])
    check('ไม่ใช่คน' in out['make'] and 'Anthropic Claude' in out['make'], 'before: says it is AI, not a person, and where the words go', out['make'])
    check('AI กำลังเขียนประโยค' in out['wait'] and 'ปกติ 10–30 วินาที' in out['wait'] and 'ไม่ใช่คน' in out['wait'], 'while waiting: what the AI is doing, usual time, AI not a person', out['wait'])
    check('เขียนโดยระบบ AI' in out['source'] and '🚩' in out['source'], 'the sentences say they are written by AI', out['source'])
    check(out['req']==('scene',['cat','sofa','lamp'],'data:image/jpeg;base64') , 'its words and a small picture go to the AI', out['req'])
    check(out['game']>0 and [s['en'] for s in out['saved']]==['The cat is sleeping on the sofa.','A lamp is next to the sofa.'] and out['saved'][1]['words']==['sofa','lamp'], 'sentences kept with the scene (those without its words left out); the game starts', out['saved'])
    check(out['after_flag']==1, '🚩 takes a sentence out', out['after_flag'])
    check('ชีทนี้' in out['make_list'] and out['req_list']==('list',False) and out['game_list']>0, 'word sheet: example sentences, no picture', (out['make_list'], out['req_list']))
    check(not errs, 'no page errors', errs)
    print('PASS' if ok else 'FAIL'); assert ok
asyncio.run(main())
