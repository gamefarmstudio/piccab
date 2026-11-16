// Piccab — ✍️ Sentence game, level 1 (เรียงคำ): put the words of a sentence about the picture in the right order.
// The sentences are made for picture-library scenes (gallery_scenes.sentences), so only those scenes have the game.
// A scene knows its library scene by sc.meta.gal (older copies: the pv-gal list), and the sentences are fetched
// from /api/gallery/<id> and kept on this device, so fixes made in the library reach everyone's copy.
import { el, ids, items, S, scene, shuffle, speak, store, tally, UI } from './core.js';
import { refresh, renderSub, setHL } from './scene.js';
import { galAdded } from './gallery.js';

// (var: the scene screen may ask about sentences before this part of the script has run)
var SENT={ cache:store.get('pv-gsent',{})||{}, busy:{} };   // library scene id → { at, list:[{en, th, words}] }
var sg=null;                                                  // the round being played
var sentBest=store.get('pv-sentbest',{})||{};                 // my scene id → most ★ in a round

function galIdOf(sc){
  if(!sc || sc.builtin) return null;
  if(sc.meta && sc.meta.gal) return sc.meta.gal;
  const e=Object.entries(galAdded||{}).find(([,sid])=>sid===sc.id);
  return e ? e[0] : null;
}
function sentencesOf(sc){ const g=galIdOf(sc), c=g && SENT && SENT.cache[g]; return c && Array.isArray(c.list) ? c.list.filter(s=>s && s.en) : []; }
// English only: the sentences are English, whatever language the scene is practised in.
function hasSentences(sc){ return S.lang==='en' && sentencesOf(sc).length>0; }
async function loadSentences(sc){
  const g=galIdOf(sc); if(!g || !SENT || SENT.busy[g]) return;
  const c=SENT.cache[g]; if(c && Date.now()-c.at < 6*3600e3) return;
  SENT.busy[g]=true;
  const r=await fetch('/api/gallery/'+g).then(x=>x.ok ? x.json() : x.status===404 ? {} : null).catch(()=>null);
  SENT.busy[g]=false;
  if(!r) return;                                   // offline: keep what we had
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
function sentInit(){
  const sc=scene(), list=sentencesOf(sc);
  sg={ sid:sc.id, list, order:shuffle(list.map((_,i)=>i)), i:0, stars:0, cur:null };
  if(list.length) sentNew();
}
function sentNew(){
  const s=sg.list[sg.order[sg.i]], words=sentWords(s.en);
  let pool=shuffle(words.map((t,k)=>({ t, k })));
  if(words.length>1 && pool.every((x,j)=>x.t===words[j])) pool.push(pool.shift());   // never already in order
  sg.cur={ s, words, pool, line:[], tries:0, state:'' };
}
// The boxes in the picture the sentence is about (its scene words), lit up as a hint.
function sentIds(){
  if(S.mode!=='sent' || S.editing || !sg || !sg.cur || sg.sid!==scene().id) return [];
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
    sg.cur=null; tally('sent_round');
    const b=sentBest[sg.sid]; if(!b || sg.stars>b.stars){ sentBest[sg.sid]={ stars:sg.stars, n:sg.order.length }; store.set('pv-sentbest', sentBest); }
  }
  renderSub(); setHL();
}
function sentSkip(){ const c=sg && sg.cur; if(!c || c.state==='good') return; c.line=c.words.map((t,k)=>({ t, k })); c.pool=[]; c.state='shown'; renderSub(); speak(c.s.en); }

// ---------- what shows under the picture ----------
function renderSentSub(put){
  if(!sg || sg.sid!==scene().id) sentInit();
  if(!sg.list.length){ put(el('span',{class:'hint',text:'ฉากนี้ยังไม่มีประโยค'})); return; }
  const n=sg.order.length;
  if(!sg.cur){
    const best=sentBest[sg.sid];
    put(el('div',{class:'sentgame done'},
      el('div',{class:'sdone'}, el('b',{text:`🎉 เรียงครบ ${n} ประโยคแล้ว!`}),
        el('div',{class:'sstars',text:'★'.repeat(sg.stars)+'☆'.repeat(n-sg.stars)}),
        el('p',{class:'note',text:`ถูกตั้งแต่ครั้งแรก ${sg.stars}/${n} ประโยค`+(best && best.stars>sg.stars ? ` · ดีที่สุด ★ ${best.stars}` : '')})),
      el('div',{class:'srow'}, el('span',{class:'grow'}), el('button',{class:'primary',text:'เล่นอีกรอบ',onclick:()=>{ sentInit(); renderSub(); setHL(); }}))));
    return;
  }
  const c=sg.cur;
  const tile=(x, from, to, where)=>el('button',{type:'button',class:'stile','data-noi18n':'',text:x.t,disabled:c.state?'':null,
    onpointerdown:e=>sentDragStart(e, x, where), onclick:e=>{ if(e.currentTarget===sentDragged) return; sentMove(from, to, x.k); }});
  const line=el('div',{class:'sline'+(c.state?' '+c.state:'')},
    ...(c.line.length ? c.line.map(x=>tile(x, c.line, c.pool, 'line')) : [el('span',{class:'sph',text:'แตะหรือลากคำด้านล่าง มาเรียงเป็นประโยค'})]));
  const th=UI==='en' ? '' : (c.s.th||'');
  put(el('div',{class:'sentgame'},
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
      c.state==='shown' ? el('button',{class:'primary',text:'ต่อไป ›',onclick:sentNext})
        : el('button',{text:'ข้าม ⏭',disabled:c.state?'':null,onclick:sentSkip}))));
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

export { hasSentences, loadSentences, renderSentSub, sentIds, sentReset };
