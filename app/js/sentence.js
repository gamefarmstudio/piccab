// Piccab — ✍️ Sentence game about the picture: level 1 (เรียงคำ) put the words in order;
// level 2 (เติมคำ) a scene word is missing — pick it from the choices, or tap it in the picture.
// The sentences are made for picture-library scenes (gallery_scenes.sentences), so only those scenes have the game.
// A scene knows its library scene by sc.meta.gal (older copies: the pv-gal list), and the sentences are fetched
// from /api/gallery/<id> and kept on this device, so fixes made in the library reach everyone's copy.
import { G, el, ids, items, S, scene, shuffle, speak, store, tally, toast, UI } from './core.js';
import { saveScenes } from './progress.js';
import { ask, doFlash, refresh, renderSub, setHL } from './scene.js';
import { markActive } from './home.js';
import { aiErr, aiNotice, aiWait } from './editor.js';
import { aiAuth, isList } from './sheets.js';
import { galAdded } from './gallery.js';
import { cefrKey } from './path.js';

// (var: the scene screen may ask about sentences before this part of the script has run)
var SENT={ cache:store.get('pv-gsent',{})||{}, busy:{} };   // library scene id → { at, list:[{en, th, words}] }
var sg=null;                                                  // the round being played
var sentBest=store.get('pv-sentbest',{})||{};                 // my scene id (+ ':2' for level 2) → most ★ in a round
var sentLv=store.get('pv-sentlv',1)===2 ? 2 : 1;              // the level last played

function galIdOf(sc){
  if(!sc || sc.builtin) return null;
  if(sc.meta && sc.meta.gal) return sc.meta.gal;
  const e=Object.entries(galAdded||{}).find(([,sid])=>sid===sc.id);
  return e ? e[0] : null;
}
// A scene's own sentences (made by AI for a scene or word sheet of yours) come first, then the picture library's.
function sentencesOf(sc){
  if(sc && Array.isArray(sc.sentences) && sc.sentences.length) return sc.sentences.filter(s=>s && s.en);
  const g=galIdOf(sc), c=g && SENT && SENT.cache[g]; return c && Array.isArray(c.list) ? c.list.filter(s=>s && s.en) : [];
}
// English only: the sentences are English, whatever language the scene is practised in.
function hasSentences(sc){ return S.lang==='en' && sentencesOf(sc).length>0; }
// Your own scene or word sheet (3+ words) without sentences: the mode shows, to make them with AI.
function canMakeSentences(sc){ return S.lang==='en' && !!sc && !sc.builtin && G.customs.includes(sc) && !!G.aiReady && ids().length>=3 && !sentencesOf(sc).length; }
function sentModeShown(sc){ return hasSentences(sc) || canMakeSentences(sc); }
// How a word's last part can appear in a sentence: plurals (cups, boxes, knives) and verb forms
// (brushes, running, riding, washed, cried), so action words count as well as things.
function wordForms(x){
  const c=x.slice(-1), stem=x.replace(/e$/,''), dbl=/[^aeiou][aeiou][bdgmnprt]$/.test(x) ? x+c : x;
  return [...new Set([x, x+'s', x+'es', x.replace(/y$/,'ies'), x.replace(/(f|fe)$/,'ves'),
    stem+'ing', x+'ing', dbl+'ing', stem+'ed', x+'d', x.replace(/y$/,'ied'), dbl+'ed'])];
}
// The scene's words used in a sentence (the word, an other name for it, a plural or a verb form); given = what the AI said it used.
function sceneWordsIn(en, its, given){
  const t=' '+String(en||'').toLowerCase().replace(/[^a-z'-]+/g,' ').trim()+' ', out=new Set(), all=Object.values(its||{});
  const has=f=>{ if(!f) return false; const p=f.split(/\s+/), last=p.pop(), head=p.length ? p.join(' ')+' ' : ''; return wordForms(last).some(x=>t.includes(' '+head+x+' ')); };
  for(const it of all){ const w=String(it.word||'').toLowerCase().trim(); if(w && [w, ...(it.alts||[]).map(a=>String(a).toLowerCase().trim())].some(has)) out.add(w); }
  const mine=new Set(all.map(it=>String(it.word||'').toLowerCase().trim()));
  (Array.isArray(given)?given:[]).forEach(w=>{ w=String(w||'').toLowerCase().trim(); if(mine.has(w)) out.add(w); });   // e.g. knife → knives
  return [...out];
}
async function loadSentences(sc){
  const g=galIdOf(sc); if(!g || !SENT || SENT.busy[g]) return;
  const c=SENT.cache[g]; if(c && Date.now()-c.at < 6*3600e3) return;
  SENT.busy[g]=true;
  const r=await fetch('/api/gallery/'+g).then(x=>x.ok ? x.json() : x.status===404 ? {} : null).catch(()=>null);
  SENT.busy[g]=false;
  if(!r) return;                                   // offline: keep what we had
  sentTakeCefr(sc, r.items);
  const before=JSON.stringify((c && c.list) || []);
  SENT.cache[g]={ at:Date.now(), list:Array.isArray(r.sentences) ? r.sentences : [] };
  store.set('pv-gsent', SENT.cache);
  if(before!==JSON.stringify(SENT.cache[g].list) && S.view==='play' && scene()===sc){
    if(S.mode==='sent') sg=null;
    refresh();
  }
}

// ---------- the round ----------
const sentWords=en=>String(en).trim().split(/\s+/).filter(Boolean);
function sentReset(){ sg=null; }
// Level 2: where the scene's words are in a sentence (the word, an other name for it, or a plural) → [{id, i, n}]
function sentSpots(s){
  const toks=sentWords(s.en), bare=t=>t.toLowerCase().replace(/[^a-z'-]/g,''), its=items(), want=new Set((s.words||[]).map(w=>String(w).toLowerCase()));
  const out=[];
  for(const id of ids()){
    const it=its[id], w=String(it.word||'').toLowerCase(); if(!w || !want.has(w) || out.some(o=>its[o.id].word.toLowerCase()===w)) continue;
    for(const f of [w, ...(it.alts||[]).map(a=>String(a).toLowerCase())].map(f=>f.split(/\s+/).filter(Boolean))){
      const end=f.length-1, forms=wordForms;
      const i=toks.findIndex((_,i)=>i+f.length<=toks.length && f.every((x,j)=>j<end ? bare(toks[i+j])===x : forms(x).includes(bare(toks[i+j]))));
      if(i>=0){ out.push({ id, i, n:f.length }); break; }
    }
  }
  return out;
}
function sentInit(){
  const sc=scene(), all=sentencesOf(sc);
  const list=sentLv===2 ? all.filter(s=>sentSpots(s).length) : all;
  sg={ sid:sc.id, lv:sentLv, list, order:shuffle(list.map((_,i)=>i)), i:0, stars:0, cur:null };
  if(list.length) sentNew();
}
function sentNew(){
  const s=sg.list[sg.order[sg.i]];
  if(sg.lv===2){
    const its=items(), spot=shuffle(sentSpots(s))[0], toks=sentWords(s.en), word=its[spot.id].word;
    const last=toks[spot.i+spot.n-1], punct=(last.match(/[^A-Za-z'-]+$/)||[''])[0];
    const used=new Set((s.words||[]).map(w=>String(w).toLowerCase()));
    const others=[...new Set(ids().map(id=>its[id].word).filter(w=>w && !used.has(w.toLowerCase())))];
    sg.cur={ s, lv:2, id:spot.id, word, before:toks.slice(0,spot.i).join(' '), fill:toks.slice(spot.i,spot.i+spot.n).join(' ').slice(0, punct ? -punct.length : undefined),
      after:punct+(spot.i+spot.n<toks.length ? ' '+toks.slice(spot.i+spot.n).join(' ') : ''), opts:shuffle([word, ...shuffle(others).slice(0,3)]), wrong:[], tries:0, state:'' };
    return;
  }
  const words=sentWords(s.en);
  let pool=shuffle(words.map((t,k)=>({ t, k })));
  if(words.length>1 && pool.every((x,j)=>x.t===words[j])) pool.push(pool.shift());   // never already in order
  sg.cur={ s, words, pool, line:[], tries:0, state:'' };
}
// The boxes in the picture the sentence is about (its scene words), lit up as a hint.
function sentIds(){
  if(S.mode!=='sent' || S.editing || !sg || !sg.cur || sg.sid!==scene().id) return [];
  if(sg.cur.lv===2) return sg.cur.state ? [sg.cur.id] : [];   // the picture is where the answer is: no hint before
  const want=new Set((sg.cur.s.words||[]).map(w=>String(w).toLowerCase()));
  const its=items();
  return ids().filter(id=>want.has(String(its[id].word||'').toLowerCase()));
}
function sentSay(){ if(sg && sg.cur) speak(sg.cur.s.en); }
function sentMove(from, to, k){
  const c=sg.cur; if(!c || c.state) return;
  const j=from.findIndex(x=>x.k===k); if(j<0) return;
  to.push(from.splice(j,1)[0]);
  if(!c.pool.length) sentCheck(); else renderSub();
}
function sentCheck(){
  const c=sg.cur;
  if(c.line.map(x=>x.t).join(' ')===c.words.join(' ')){
    c.state='good'; if(!c.tries) sg.stars++;
    renderSub(); speak(c.s.en);
    setTimeout(()=>{ if(sg && sg.cur===c) sentNext(); }, 2200);
    return;
  }
  c.tries++; c.state='bad'; renderSub();
  setTimeout(()=>{
    if(!sg || sg.cur!==c) return;
    if(c.tries>=3){ c.line=c.words.map((t,k)=>({ t, k })); c.pool=[]; c.state='shown'; renderSub(); speak(c.s.en); return; }
    let j=0; while(j<c.line.length && c.line[j].t===c.words[j]) j++;   // the right start stays, the rest goes back
    c.pool.push(...c.line.splice(j)); c.state=''; renderSub();
  }, 1000);
}
function sentNext(){
  sg.i++;
  if(sg.i<sg.order.length) sentNew();
  else {
    sg.cur=null; tally('sent_round'); markActive(0,'sent');
    const k=sg.sid+(sg.lv===2?':2':''), b=sentBest[k]; if(!b || sg.stars>b.stars){ sentBest[k]={ stars:sg.stars, n:sg.order.length }; store.set('pv-sentbest', sentBest); }
  }
  renderSub(); setHL();
}
function sentSkip(){ const c=sg && sg.cur; if(!c || c.state==='good') return; if(c.lv!==2){ c.line=c.words.map((t,k)=>({ t, k })); c.pool=[]; } c.state='shown'; renderSub(); setHL(); speak(c.s.en); }
// Level 2: an answer, from the choices or a tap on the picture. Two wrong tries, then the answer shows.
function sentAnswer(w, id){
  const c=sg && sg.cur; if(!c || c.lv!==2 || c.state) return false;
  if(String(w).toLowerCase()===c.word.toLowerCase()){
    c.state='good'; if(!c.tries) sg.stars++;
    renderSub(); setHL(); speak(c.s.en);
    setTimeout(()=>{ if(sg && sg.cur===c) sentNext(); }, 2400);
  } else {
    c.tries++; if(!c.wrong.includes(w)) c.wrong.push(w);
    if(id) doFlash(id,'bad',900);
    if(c.tries>=2){ c.state='shown'; renderSub(); setHL(); speak(c.s.en); }
    else renderSub();
  }
  return true;
}
// a tap on the picture while playing level 2
function sentTap(id){ const it=items()[id]; return !!(it && sg && sg.cur && sg.cur.lv===2 && sentAnswer(it.word, id)); }
function sentSetLv(lv){ if(lv===sentLv && sg && sg.lv===lv) return; sentLv=lv; store.set('pv-sentlv', lv); sentInit(); renderSub(); setHL(); }

// ---------- what shows under the picture ----------
function sentLevels(){
  return el('div',{class:'seg slv',role:'group','aria-label':'ด่าน'},
    el('button',{type:'button',class:sentLv===1?'on':'',text:'1 เรียงคำ',onclick:()=>sentSetLv(1)}),
    el('button',{type:'button',class:sentLv===2?'on':'',text:'2 เติมคำ',onclick:()=>sentSetLv(2)}));
}
function renderSentSub(put){
  if(!sg || sg.sid!==scene().id) sentInit();
  if(!sentencesOf(scene()).length){ put(renderMake()); return; }
  if(!sg.list.length){ put(sentLevels(), el('span',{class:'hint',text:'ฉากนี้ยังไม่มีประโยคสำหรับด่านนี้'})); return; }
  const n=sg.order.length;
  if(!sg.cur){
    const best=sentBest[sg.sid+(sg.lv===2?':2':'')];
    put(el('div',{class:'sentgame done'}, sentLevels(),
      el('div',{class:'sdone'}, el('b',{text: sg.lv===2 ? `🎉 เติมครบ ${n} ประโยคแล้ว!` : `🎉 เรียงครบ ${n} ประโยคแล้ว!`}),
        el('div',{class:'sstars',text:'★'.repeat(sg.stars)+'☆'.repeat(n-sg.stars)}),
        el('p',{class:'note',text:`ถูกตั้งแต่ครั้งแรก ${sg.stars}/${n} ประโยค`+(best && best.stars>sg.stars ? ` · ดีที่สุด ★ ${best.stars}` : '')})),
      el('div',{class:'srow'}, ownSentences() ? el('button',{text:'✨ สร้างประโยคใหม่',title:'ให้ AI เขียนประโยคชุดใหม่ (ใช้ 1 เครดิต)',onclick:()=>makeSentences(true)}) : null,
        el('span',{class:'grow'}), el('button',{class:'primary',text:'เล่นอีกรอบ',onclick:()=>{ sentInit(); renderSub(); setHL(); }}))));
    return;
  }
  const c=sg.cur;
  if(c.lv===2){ renderFill(put, c, n); return; }
  const tile=(x, from, to, where)=>el('button',{type:'button',class:'stile','data-noi18n':'',text:x.t,disabled:c.state?'':null,
    onpointerdown:e=>sentDragStart(e, x, where), onclick:e=>{ if(e.currentTarget===sentDragged) return; sentMove(from, to, x.k); }});
  const line=el('div',{class:'sline'+(c.state?' '+c.state:'')},
    ...(c.line.length ? c.line.map(x=>tile(x, c.line, c.pool, 'line')) : [el('span',{class:'sph',text:'แตะหรือลากคำด้านล่าง มาเรียงเป็นประโยค'})]));
  const th=UI==='en' ? '' : (c.s.th||'');
  put(el('div',{class:'sentgame'}, sentLevels(),
    el('div',{class:'shead'},
      el('button',{class:'say',text:'🔊','aria-label':'ฟังประโยค',title:'ฟังประโยค',onclick:sentSay}),
      el('span',{class:'sth','data-noi18n':'',text:th}),
      el('span',{class:'grow'}),
      el('span',{class:'pill',text:`${sg.i+1}/${n} · ★ ${sg.stars}`})),
    line,
    el('div',{class:'spool'}, ...c.pool.map(x=>tile(x, c.pool, c.line, 'pool'))),
    el('div',{class:'srow'},
      el('span',{class:'note small smsg',text: c.state==='good' ? (c.tries ? '✓ ถูกต้อง' : '✓ ถูกต้อง ได้ ★') : c.state==='bad' ? '✗ ยังไม่ถูก ลองอีกครั้ง' :
        c.state==='shown' ? 'ประโยคที่ถูกคือแบบนี้' : c.tries ? 'คำที่อยู่ถูกที่แล้วจะอยู่ต่อ' : ''}),
      el('span',{class:'grow'}),
      ownSentences() ? el('button',{class:'sflag',text:'🚩','aria-label':'ประโยคนี้แปลกหรือผิด เอาออก',title:'ประโยคนี้แปลกหรือผิด เอาออก',onclick:sentDrop}) : null,
      c.state==='shown' ? el('button',{class:'primary',text:'ต่อไป ›',onclick:sentNext})
        : el('button',{text:'ข้าม ⏭',disabled:c.state?'':null,onclick:sentSkip})),
    sentSource()));
}


// ---------- dragging a word (tapping still works) ----------
// From the pool into the line at any place, to another place in the line, or back to the pool.
var sDrag=null, sentDragged=null;   // sentDragged: the tile just dragged (its click is not a tap)
function sentDragStart(e, x, from){
  const c=sg && sg.cur; if(!c || c.state || e.button>0 || sDrag) return;
  const t=e.currentTarget, r=t.getBoundingClientRect();
  sDrag={ x, from, t, pid:e.pointerId, sx:e.clientX, sy:e.clientY, dx:e.clientX-r.left, dy:e.clientY-r.top, on:false, ghost:null, caret:null, to:null };
  document.addEventListener('pointermove', sentDragMove, { passive:false });
  document.addEventListener('pointerup', sentDragEnd); document.addEventListener('pointercancel', sentDragEnd);
}
function sentDragMove(e){
  const d=sDrag; if(!d || e.pointerId!==d.pid) return;
  if(!d.on){
    if(Math.hypot(e.clientX-d.sx, e.clientY-d.sy)<6) return;
    d.on=true; d.ghost=d.t.cloneNode(true); d.ghost.classList.add('sghost'); document.body.append(d.ghost); d.t.classList.add('sdragging');
  }
  e.preventDefault();
  d.ghost.style.left=(e.clientX-d.dx)+'px'; d.ghost.style.top=(e.clientY-d.dy)+'px';
  const line=document.querySelector('.sentgame .sline'), pool=document.querySelector('.sentgame .spool');
  if(d.caret){ d.caret.remove(); d.caret=null; }
  const near=(box,pad)=>{ const r=box.getBoundingClientRect(); return e.clientX>=r.left-pad && e.clientX<=r.right+pad && e.clientY>=r.top-pad && e.clientY<=r.bottom+pad; };
  d.to=null;
  if(line && near(line,18)){
    const tiles=[...line.querySelectorAll('.stile')].filter(t=>t!==d.t);
    let i=tiles.findIndex(t=>{ const r=t.getBoundingClientRect(); return e.clientY<r.top || (e.clientY<r.bottom && e.clientX<r.left+r.width/2); });
    if(i<0) i=tiles.length;
    d.to={ where:'line', i };
    d.caret=el('span',{class:'scaret'});
    if(i<tiles.length) line.insertBefore(d.caret, tiles[i]); else line.append(d.caret);
  } else if(pool && near(pool,18)) d.to={ where:'pool' };
  if(line) line.classList.toggle('sover', !!d.to && d.to.where==='line');
  if(pool) pool.classList.toggle('sover', !!d.to && d.to.where==='pool');
}
function sentDragEnd(e){
  const d=sDrag; if(!d || e.pointerId!==d.pid) return;
  sDrag=null;
  document.removeEventListener('pointermove', sentDragMove); document.removeEventListener('pointerup', sentDragEnd); document.removeEventListener('pointercancel', sentDragEnd);
  if(!d.on) return;                                  // a tap: its click moves the word
  sentDragged=d.t;
  d.ghost.remove(); if(d.caret) d.caret.remove(); d.t.classList.remove('sdragging');
  const c=sg && sg.cur;
  if(!c || c.state || !d.to || e.type==='pointercancel'){ renderSub(); return; }
  const src=d.from==='line' ? c.line : c.pool, j=src.findIndex(y=>y.k===d.x.k);
  if(j<0){ renderSub(); return; }
  const [it]=src.splice(j,1);
  if(d.to.where==='line') c.line.splice(Math.min(d.to.i, c.line.length), 0, it); else c.pool.push(it);
  if(!c.pool.length) sentCheck(); else renderSub();
}


// ---------- level 2: fill in the missing scene word ----------
function renderFill(put, c, n){
  const th=UI==='en' ? '' : (c.s.th||''), done=!!c.state;
  const blank=el('span',{class:'sblank'+(done?' '+c.state:''),'data-noi18n':'',text: done ? c.fill : '?'});
  put(el('div',{class:'sentgame fill'}, sentLevels(),
    el('div',{class:'shead'},
      // hearing the sentence would give the word away: 🔊 comes once it is answered
      done ? el('button',{class:'say',text:'🔊','aria-label':'ฟังประโยค',title:'ฟังประโยค',onclick:sentSay}) : null,
      el('span',{class:'sth','data-noi18n':'',text:th}),
      el('span',{class:'grow'}),
      el('span',{class:'pill',text:`${sg.i+1}/${n} · ★ ${sg.stars}`})),
    el('p',{class:'sfill','data-noi18n':''}, c.before ? c.before+' ' : '', blank, c.after),
    el('div',{class:'spool sopts'}, ...c.opts.map(w=>el('button',{type:'button','data-noi18n':'',text:w,
      class:'stile'+(c.wrong.includes(w)?' bad':'')+(done && w===c.word?' good':''),
      disabled: done || c.wrong.includes(w) ? '' : null, onclick:()=>sentAnswer(w)}))),
    el('div',{class:'srow'},
      el('span',{class:'note small smsg',text: c.state==='good' ? (c.tries ? '✓ ถูกต้อง' : '✓ ถูกต้อง ได้ ★') : c.state==='shown' ? `คำที่หายไปคือ “${c.word}”` :
        c.tries ? '✗ ยังไม่ใช่ ลองอีกครั้ง' : 'เลือกคำที่หายไป หรือแตะของชิ้นนั้นในภาพ'}),
      el('span',{class:'grow'}),
      ownSentences() ? el('button',{class:'sflag',text:'🚩','aria-label':'ประโยคนี้แปลกหรือผิด เอาออก',title:'ประโยคนี้แปลกหรือผิด เอาออก',onclick:sentDrop}) : null,
      c.state==='shown' ? el('button',{class:'primary',text:'ต่อไป ›',onclick:sentNext})
        : el('button',{text:'ข้าม ⏭',disabled:done?'':null,onclick:sentSkip})),
    sentSource()));
}


// ---------- sentences made by AI for a scene or word sheet of yours ----------
const ownSentences=()=>{ const sc=scene(); return !!(sc && Array.isArray(sc.sentences) && sc.sentences.length && G.customs.includes(sc)); };
var sentMaking=0;   // when the AI started writing (0: not now)
function renderMake(){
  const sc=scene(), list=isList(sc);
  if(!canMakeSentences(sc)) return el('span',{class:'hint',text:'ฉากนี้ยังไม่มีประโยค'});
  return el('div',{class:'sentgame make'},
    el('b',{text:'✍️ เกมแต่งประโยค'}),
    el('p',{class:'note',text: list ? 'ให้ AI เขียนประโยคตัวอย่างจากคำในชีทนี้ แล้วฝึกเรียงคำและเติมคำ' : 'ให้ AI ดูภาพแล้วเขียนประโยคสั้น ๆ จากคำในฉากนี้ แล้วฝึกเรียงคำและเติมคำ'}),
    sentMaking ? aiWait('🤖 AI กำลังเขียนประโยค…', list ? '5–20' : '10–30', sentMaking) : aiNotice('sent'),
    sentMaking ? null : el('div',{class:'srow'},
      el('span',{class:'note small',text: G.aiLeft!=null ? `ใช้ 1 เครดิต AI · เหลือ ${G.aiLeft}` : 'ใช้ 1 เครดิต AI'}),
      el('span',{class:'grow'}),
      el('button',{class:'primary',text:'✨ สร้างประโยคด้วย AI',onclick:()=>makeSentences(false)})));
}
// a small copy of the picture for the AI (sentences don't need a big one)
function sentPicture(sc){
  return new Promise(res=>{
    if(!sc.img || isList(sc)) return res(null);
    const im=new Image(); im.crossOrigin='anonymous';
    im.onload=()=>{ try{ const k=Math.min(1, 1024/Math.max(im.naturalWidth, im.naturalHeight)), c=document.createElement('canvas');
      c.width=Math.round(im.naturalWidth*k); c.height=Math.round(im.naturalHeight*k);
      const x=c.getContext('2d'); x.fillStyle='#fff'; x.fillRect(0,0,c.width,c.height); x.drawImage(im,0,0,c.width,c.height); res(c.toDataURL('image/jpeg',0.82)); }catch(e){ res(null); } };
    im.onerror=()=>res(null); im.src=sc.img;
  });
}
async function makeSentences(again){
  const sc=scene(); if(sentMaking || !sc || !G.customs.includes(sc)) return;
  if(again && !(await ask('ให้ AI เขียนประโยคชุดใหม่แทนชุดนี้ใช่ไหม? ใช้ 1 เครดิต AI','สร้างใหม่'))) return;
  const auth=await aiAuth(); if(!auth) return;
  sentMaking=Date.now(); renderSub();
  const its=items(), words=ids().map(id=>its[id]).filter(it=>it && it.word).map(it=>({ w:it.word, th:it.th||'' }));
  const image=await sentPicture(sc);
  let r, data={};
  try{
    r=await fetch('/api/sentences',{method:'POST', headers:{'content-type':'application/json', ...(auth.tok?{authorization:'Bearer '+auth.tok}:{}), ...(auth.code?{'x-piccab-code':auth.code}:{})},
      body:JSON.stringify({ words, kind:isList(sc)?'list':'scene', ...(image?{ image }:{}) })});
    data=await r.json().catch(()=>({}));
  }catch(e){ r=null; }
  sentMaking=0;
  if(typeof data.credits_left==='number') G.aiLeft=data.credits_left;
  if(!r){ toast(aiErr('offline')); renderSub(); return; }
  if(!r.ok){ if(data.error==='bad_code') store.set('pv-ai-code',''); toast(aiErr(data.error), 5000); renderSub(); return; }
  const list=(data.items||[]).map(x=>({ en:x.en, th:x.th||'', words:sceneWordsIn(x.en, its, x.words) })).filter(x=>x.words.length).slice(0,12);
  if(!list.length){ toast('AI เขียนประโยคจากคำในฉากนี้ไม่ได้ ลองใหม่อีกครั้ง', 5000); renderSub(); return; }
  sc.sentences=list; saveScenes(); tally('sent_ai');
  toast(`ได้ ${list.length} ประโยค — เริ่มเล่นได้เลย`, 3500);
  sg=null; refresh();
}
// 🚩 a strange sentence made by AI: take it out of this scene
async function sentDrop(){
  const sc=scene(), c=sg && sg.cur; if(!c || !ownSentences()) return;
  if(!(await ask('เอาประโยคนี้ออกจากฉากนี้ใช่ไหม?','เอาออก'))) return;
  sc.sentences=sc.sentences.filter(x=>x.en!==c.s.en); saveScenes();
  toast('เอาประโยคนี้ออกแล้ว ขอบคุณที่บอก');
  if(!sc.sentences.length){ delete sc.sentences; saveScenes(); sg=null; refresh(); return; }
  const rest=sg.order.slice(sg.i+1).map(k=>sg.list[k]).filter(x=>x.en!==c.s.en);   // carry on with the ones not played yet
  sg.list=rest; sg.order=rest.map((_,i)=>i); sg.i=0;
  if(sg.order.length) sentNew(); else sg.cur=null;
  renderSub(); setHL();
}

// where the sentences come from: always said, since they are written by AI
function sentSource(){
  return el('p',{class:'note small saisrc',text: ownSentences() ? '🤖 ประโยคเขียนโดยระบบ AI ไม่ใช่คน อาจผิดได้ · กด 🚩 เพื่อเอาประโยคที่แปลกออก' : '🤖 ประโยคเขียนโดยระบบ AI และตรวจโดยทีม Piccab'});
}


// A copy of a library scene takes the words' CEFR levels from the library (copies made before they were set).
function sentTakeCefr(sc, its){
  if(!sc || !its || !G.customs.includes(sc)) return;
  const by={}; Object.values(its).forEach(it=>{ const c=it && cefrKey(it.cefr); if(c) by[String(it.word).toLowerCase()]=c; });
  let n=0; Object.values(sc.items||{}).forEach(it=>{ const c=it && by[String(it.word).toLowerCase()]; if(c && it.cefr!==c){ it.cefr=c; n++; } });
  if(n) saveScenes();
}

export { loadSentences, renderSentSub, sceneWordsIn, sentIds, sentModeShown, sentReset, sentTap };
