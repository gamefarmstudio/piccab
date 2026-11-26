"""Make picture-library scenes from a word list (no photo needed): a picture of numbered cards that show the
Thai meaning, and a JSON file with each card's box and the example sentences.

    python3 tools/list-scenes/make.py tools/list-scenes/phrasal-verbs.json /tmp/out

Then 🛡️ admin → 🖼️ คลังภาพ → นำเข้า: choose all the .jpg and .json files together ("crop": false keeps the edges).
Needs Playwright with Chrome (as for the browser tests): CHROME=/path/to/chrome.
"""
import asyncio, base64, json, os, re, sys
from pathlib import Path
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[2]
FONTDIR = ROOT / 'public/fonts'
def font(name): return 'data:font/woff2;base64,' + base64.b64encode((FONTDIR / name).read_bytes()).decode()

PAGE = """<!doctype html><meta charset=utf-8><style>
@font-face{font-family:Sarabun;font-weight:600;src:url(F:sarabun-thai-600-normal.woff2) format('woff2');unicode-range:U+0E00-0E7F}
@font-face{font-family:Sarabun;font-weight:600;src:url(F:sarabun-latin-600-normal.woff2) format('woff2')}
@font-face{font-family:Sarabun;font-weight:700;src:url(F:sarabun-thai-700-normal.woff2) format('woff2');unicode-range:U+0E00-0E7F}
@font-face{font-family:Sarabun;font-weight:700;src:url(F:sarabun-latin-700-normal.woff2) format('woff2')}
@font-face{font-family:Fredoka;font-weight:600;src:url(F:fredoka-latin-600-normal.woff2) format('woff2')}
</style><body><script>
function rrect(x,X,Y,W,H,R){ x.beginPath(); x.moveTo(X+R,Y); x.arcTo(X+W,Y,X+W,Y+H,R); x.arcTo(X+W,Y+H,X,Y+H,R); x.arcTo(X,Y+H,X,Y,R); x.arcTo(X,Y,X+W,Y,R); x.closePath(); }
// Thai meaning on up to two lines: break at a space outside brackets, so the two lines are about even
function lines(x, t, room){
  if(x.measureText(t).width<=room) return [t];
  let depth=0, best=null;
  for(let i=0;i<t.length;i++){
    const c=t[i]; if(c==='(') depth++; else if(c===')') depth--;
    if(c!==' ' || depth) continue;
    const a=t.slice(0,i).trim(), z=t.slice(i+1).trim(); if(!a || !z || /[=+]$/.test(a)) continue;
    const w=Math.max(x.measureText(a).width, x.measureText(z).width) + (/^[/,]/.test(z) ? room : 0);   // not "/ …" at the start of a line
    if(!best || w<best.w) best={ w, ls:[a, z] };
  }
  return best ? best.ls : [t];
}
async function draw(g, sub){
  await Promise.all(['600 30px Sarabun','700 30px Sarabun','600 30px Fredoka'].map(f=>document.fonts.load(f,'กขa123')));
  const words=g.words, W=1000, pad=28, gap=18, ch=150, cols=2, top=128;
  const cw=(W-pad*2-gap*(cols-1))/cols, rows=Math.ceil(words.length/cols), H=top+rows*ch+(rows-1)*gap+pad;
  const c=document.createElement('canvas'); c.width=W; c.height=H; const x=c.getContext('2d');
  x.fillStyle='#fdf9f3'; x.fillRect(0,0,W,H);
  x.fillStyle='#ece3d6'; for(let yy=14;yy<H;yy+=28) for(let xx=14;xx<W;xx+=28){ x.beginPath(); x.arc(xx,yy,1.5,0,7); x.fill(); }
  // the verb these all start with
  x.textBaseline='middle'; x.textAlign='left';
  x.fillStyle='#2d2a5a'; x.font='600 64px Fredoka, sans-serif'; x.fillText(g.verb, pad+4, 62);
  const vw=x.measureText(g.verb).width;
  x.fillStyle='#8f84e8'; x.font='600 44px Fredoka, sans-serif'; x.fillText('+ …', pad+vw+22, 64);
  x.fillStyle='#8a8499'; x.font='600 26px Fredoka, Sarabun, sans-serif'; x.textAlign='right'; x.fillText(sub, W-pad-4, 64);
  const SOFT=['#efeaf7','#ffe4ea','#e5f5eb','#fff3cf'], DEEP=['#5b4fc4','#d83a5c','#24a164','#b07800'], boxes=[];
  words.forEach((wd,i)=>{
    const bx=pad+(i%cols)*(cw+gap), by=top+Math.floor(i/cols)*(ch+gap), k=i%4;
    x.fillStyle='rgba(45,42,90,.07)'; rrect(x,bx,by+3,cw,ch,20); x.fill();
    x.fillStyle='#fff'; rrect(x,bx,by,cw,ch,20); x.fill(); x.strokeStyle='#efe6da'; x.lineWidth=2; x.stroke();
    x.fillStyle=SOFT[k]; x.beginPath(); x.arc(bx+44,by+ch/2,28,0,7); x.fill();
    x.fillStyle=DEEP[k]; x.font='600 27px Fredoka, Sarabun, sans-serif'; x.textAlign='center'; x.textBaseline='middle'; x.fillText(String(i+1),bx+44,by+ch/2+1);
    if(wd.star){   // often in tests
      x.font='700 17px Sarabun, sans-serif'; const s='★ ออกบ่อย', sw=x.measureText(s).width+18;
      x.fillStyle='#fff3df'; rrect(x,bx+cw-sw-12,by+10,sw,26,13); x.fill();
      x.fillStyle='#b06a00'; x.fillText(s,bx+cw-12-sw/2,by+24);
    }
    const room=cw-84-28, cx=bx+84+room/2;
    let fs=36, ls; const setF=()=>{ x.font=`600 ${fs}px Sarabun, sans-serif`; };
    for(;;){ setF(); ls=lines(x, wd.th, room); if((ls.length===1 || x.measureText(ls[1]).width<=room) && ls.every(l=>x.measureText(l).width<=room) || fs<=22) break; fs-=2; }
    x.fillStyle='#2d2a5a';
    const y0=by+ch/2+(wd.star?8:3)-(ls.length-1)*fs*0.62;
    ls.forEach((l,j)=>x.fillText(l,cx,y0+j*fs*1.24));
    boxes.push([bx,by,bx+cw,by+ch].map((v,j)=>Math.round(v/(j%2?H:W)*1000)));
  });
  return { img:c.toDataURL('image/jpeg',0.9), w:W, h:H, boxes };
}
</script>"""
PAGE = re.sub(r'F:([a-z0-9-]+\.woff2)', lambda m: font(m.group(1)), PAGE)

slug = lambda s: re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')

async def main(src, out):
    d = json.loads(Path(src).read_text('utf8')); out = Path(out); out.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=os.environ.get('CHROME') or None)
        pg = await b.new_page(); await pg.set_content(PAGE); await pg.wait_for_timeout(300)
        for g in d['groups']:
            r = await pg.evaluate('([g,s])=>draw(g,s)', [g, d.get('subtitle', '')])
            name = slug(g['title'])
            (out / f'{name}.jpg').write_bytes(base64.b64decode(r['img'].split(',', 1)[1]))
            meta = { 'crop': False, 'title': g['title'], 'title_th': g.get('title_th', ''), 'category': d['category'], 'level': d.get('level', 'intermediate'),
                     'stage': g.get('stage', d.get('stage')), 'cefr': g.get('cefr', d.get('cefr')),
                     'items': [{ 'word': w['word'], 'th': w['th'], **({'alts': w['alts']} if w.get('alts') else {}), 'box': bx } for w, bx in zip(g['words'], r['boxes'])],
                     'sentences': [{ 'en': w['en'], 'th': w['en_th'], 'words': [w['word']] } for w in g['words'] if w.get('en')] }
            (out / f'{name}.json').write_text(json.dumps(meta, ensure_ascii=False, indent=1), 'utf8')
            print(f'{name}: {len(g["words"])} words, {r["w"]}x{r["h"]}')
        await b.close()

asyncio.run(main(sys.argv[1], sys.argv[2]))
