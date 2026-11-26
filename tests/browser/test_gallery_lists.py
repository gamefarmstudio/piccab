"""Picture library from a word list (tools/list-scenes/make.py): word cards with the Thai meaning, no photo.
The admin imports the 10 Phrasal Verbs scenes (picture + JSON) in one go: right category, words on their cards,
the example sentences linked to the phrasal verb (gave up → give up), and the edges kept ("crop": false)."""
import asyncio, glob, json, os, subprocess, sys, tempfile, urllib.request
from playwright.async_api import async_playwright
from common import *
BASE=SERVER
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
async def fwd(r):
    resp=await r.fetch(url=r.request.url.replace('https://oftzpfyydnmahkntucnj.supabase.co', FAKE)); await r.fulfill(response=resp)
async def login(pg, em):
    await pg.click('#acctBtn'); await pg.fill('.mbox input[type=email]',em); await pg.click('.mbox button.primary'); await pg.wait_for_timeout(400)
    await pg.type('.mbox input.code','123456'); await pg.press('.mbox input.code','Enter'); await pg.wait_for_timeout(2500)
def fake(path, body=None):
    rq=urllib.request.Request(FAKE+path, data=json.dumps(body).encode() if body is not None else None, method='POST' if body is not None else 'GET',
        headers={'apikey':'sb_secret_test','authorization':'Bearer sb_secret_test','content-type':'application/json'})
    with urllib.request.urlopen(rq) as x: return json.loads(x.read() or b'null')
async def main():
    out={}; errs=[]
    d=tempfile.mkdtemp()
    subprocess.run([sys.executable, os.path.join(ROOT,'tools/list-scenes/make.py'), os.path.join(ROOT,'tools/list-scenes/phrasal-verbs.json'), d], check=True, capture_output=True)
    files=sorted(glob.glob(d+'/*.jpg')+glob.glob(d+'/*.json')); out['files']=len(files)
    fake('/rest/v1/gallery_categories', {'id':'phrasal-verbs','name_th':'กริยาวลี (Phrasal Verbs)','name_en':'Phrasal verbs','emoji':'🔗','sort':130})   # supabase/2026-11-gallery-phrasal.sql
    async with async_playwright() as p:
        b=await launch(p)
        ctx=await b.new_context(locale='th-TH', viewport={'width':1200,'height':900}, service_workers='block')
        A=await ctx.new_page(); A.on('pageerror', lambda e: errs.append(str(e))); await A.route('https://oftzpfyydnmahkntucnj.supabase.co/**', fwd)
        await A.goto(BASE+'/app'); await A.wait_for_timeout(500); await login(A,'boss@piccab.th')
        await A.click('#acctBtn'); await A.wait_for_timeout(300); await A.click('#mbox button:has-text("ดูแลระบบ")'); await A.wait_for_timeout(1000)
        await A.click('.admtabs button:has-text("คลังภาพ")'); await A.wait_for_timeout(1200)
        out['crop_on']=await A.is_checked('.galcrop')                                   # the default for Gemini pictures stays on
        await A.set_input_files('.galfiles', files); await A.wait_for_selector('#mbox h3:has-text("นำเข้าคลังภาพ")', timeout=90000)
        out['result']=await A.inner_text('#mbox'); await A.click('#mbox button.primary'); await A.wait_for_timeout(1000)
        await b.close()
    src=json.load(open(os.path.join(ROOT,'tools/list-scenes/phrasal-verbs.json')))
    gs=fake('/rest/v1/gallery_scenes')
    out['scenes']=sorted((g['category'], g['title'], g['word_count'], g.get('stage'), g.get('cefr'), g['level']) for g in gs)
    give=[g for g in gs if g['title']=='Phrasal verbs: give'][0]
    its=sorted(give['items'].values(), key=lambda x:(x['y'], x['x']))
    out['give_words']=[i['word'] for i in its]
    out['give_th']=its[0]['th']
    out['boxes']=[(i['x'], i['y'], i['w'], i['h']) for i in its]
    out['size']=(give['w'], give['h'])
    out['sent']=[(s['en'], s['words']) for s in give.get('sentences') or []][:2]
    cut=[g for g in gs if g['title']=='Phrasal verbs: cut'][0]
    out['cut_alts']=[i.get('alts') for i in cut['items'].values() if i['word']=='cut down on']
    exp=sorted(('phrasal-verbs', g['title'], len(g['words']), 'm13', 'B1', 'intermediate') for g in src['groups'])
    check(out['files']==20, '10 pictures and 10 JSON files made', out['files'])
    check('10' in out['result'] and 'ไม่รู้จักหมวด' not in out['result'], 'all 10 imported into the new category', out['result'])
    check(out['scenes']==exp, 'each scene: Phrasal Verbs, its words, ม.1–3 · B1', out['scenes'])
    check(out['give_words']==['give up','give in','give away','give back','give off','give out'] and out['give_th']=='ยอมแพ้, ล้มเลิก, เลิกทำ', 'the words in card order, with the Thai meaning', (out['give_words'], out['give_th']))
    check(out['crop_on'] and out['size']==(1000, 642) and out['boxes'][0]==(28, 128, 463, 150) and out['boxes'][-1][0]+out['boxes'][-1][2]==972, 'boxes are the cards (edges kept)', (out['crop_on'], out['size'], out['boxes']))
    check(out['sent'] and out['sent'][0]==('My dad gave up smoking last year.', ['give up']), 'example sentences linked to the phrasal verb', out['sent'])
    check(out['cut_alts']==[['cut down']], '"cut down (on)": cut down on, or cut down', out['cut_alts'])
    finish('picture library: word lists', out, errs)
asyncio.run(main())
