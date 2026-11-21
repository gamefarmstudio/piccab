// Piccab — 🧩 Match: tap a word, then its picture (or its meaning); a matched pair disappears. Clear the board as fast
// as you can — a wrong pair adds 1 second. Up to 6 pairs a round, picked at random from the scene or word set,
// so every round is a little different. The best time per set stays (and goes with the account, see gamesync.js).
import { G, el, ic, S, shuffle, speak, store, tally, toast } from './core.js';
import { closeModal, openModal } from './scene.js';
import { allWords, markActive, sayWord } from './home.js';
import { makeCards } from './cards.js';
import { fxBad, fxGood, fxSoft } from './fx.js';
import { RD, roundEnd, roundMiss, roundStart } from './rounds.js';

// (var + function declarations: other parts may call these before this part of the script has run)
var MT=null;
var matchBest=store.get('pv-matchbest',{})||{};
function reloadMatchBest(){ matchBest=store.get('pv-matchbest',{})||{}; if(typeof matchBest!=='object') matchBest={}; }   // after 🎮 game sync
const MT_PAIRS=6, MT_PENALTY=1000;
const mtKey=(sc, kind)=>`${sc.id}|${kind}|${S.lang}`;
const secText=ms=>(Math.round(ms/100)/10).toFixed(1);
var MT_KIND=store.get('pv-match-kind','pic');

// the start: choose word ↔ picture or word ↔ meaning, see the best time, play
async function openMatch(sc){
  const words=allWords().filter(w=>w.sc===sc);
  if(words.length<3){ toast('ต้องมีอย่างน้อย 3 คำ'); return; }
  openModal(m=>m.append(el('p',{class:'note',text:'กำลังเตรียม…'})));   // cutting the pictures out of a scene takes a moment
  const cards=await makeCards(sc, words);
  const byId=Object.fromEntries(words.map(w=>[w.id, w]));
  const pool={ pic:uniq(cards.filter(c=>c.pic), c=>c.pic), mean:uniq(cards.filter(c=>c.mean), c=>c.mean.trim().toLowerCase()) };
  const can=k=>pool[k].length>=3;
  if(!can('pic') && !can('mean')){ toast('ต้องมีรูปหรือคำแปลอย่างน้อย 3 คำ'); return; }
  let kind=can(MT_KIND) ? MT_KIND : can('pic') ? 'pic' : 'mean';
  openModal(m=>{
    m.classList.add('mtbox');
    const best=el('p',{class:'mtbest'});
    const seg=el('div',{class:'seg mtkind',role:'radiogroup'});
    const showBest=()=>{ const b=+matchBest[mtKey(sc,kind)]||0; best.textContent= b ? `🏆 เร็วที่สุด ${secText(b)} วินาที` : 'ยังไม่เคยเล่นชุดนี้'; };
    const opt=(k, icon, label)=>{ const b=el('button',{type:'button',role:'radio','data-k':k,disabled: can(k) ? null : '',onclick:()=>{ kind=k; draw(); }}, ic(icon), label); return b; };
    seg.append(opt('pic','imagesmode','คำ ↔ รูป'), opt('mean','translate','คำ ↔ คำแปล'));
    const draw=()=>{ [...seg.children].forEach(b=>{ const on=b.dataset.k===kind; b.classList.toggle('on',on); b.setAttribute('aria-checked',String(on)); }); showBest(); };
    m.append(
      el('div',{class:'mthead'}, el('h3',{text:'🧩 จับคู่'}), el('button',{class:'x','aria-label':'ปิด',text:'✕',onclick:closeModal})),
      el('p',{class:'note',text:'แตะคำ แล้วแตะคู่ของมัน ให้หมดเร็วที่สุด'}),
      seg, best,
      el('div',{class:'row'}, el('span',{class:'sp'}),
        el('button',{class:'primary mtgo',onclick:()=>{ MT_KIND=kind; store.set('pv-match-kind',kind); matchRound(sc, kind, pool[kind], byId); }}, ic('play_arrow-fill'), 'เริ่มเลย')));
    draw();
  });
}
const uniq=(arr, f)=>{ const seen=new Set(); return arr.filter(x=>{ const k=f(x), w=x.word.trim().toLowerCase(); if(seen.has(k) || seen.has('w:'+w)) return false; seen.add(k); seen.add('w:'+w); return true; }); };

// one round: the board, the clock, tapping pairs
function matchRound(sc, kind, pool, byId){
  const pick=shuffle(pool.slice()).slice(0, MT_PAIRS);
  const tiles=shuffle(pick.flatMap((c,i)=>[{ id:c.id, side:'w', c, i }, { id:c.id, side:kind, c, i }]));
  stopMatch();
  MT={ sc, kind, pool, byId, pairs:pick.length, left:pick.length, sel:null, pen:0, t0:performance.now(), missed:new Set(), timer:null, done:false };
  roundStart('match', sc.id);
  tally('match');
  openModal(m=>{
    m.classList.add('mtbox','playing');
    const clock=el('b',{class:'mtclock',text:'0.0'}), left=el('span',{class:'mtleft'});
    const grid=el('div',{class:'mtgrid n'+tiles.length});
    const upd=()=>{ left.textContent=`เหลือ ${MT.left} คู่`; };
    for(const t of tiles){
      const kids= t.side==='pic' ? [el('img',{src:t.c.pic,alt:''})]
        : [el('span',{class:'mtt'+lenCls(t.side==='w' ? t.c.word : t.c.mean),text: t.side==='w' ? t.c.word : t.c.mean})];
      t.el=el('button',{type:'button',class:'mttile '+t.side,'data-noi18n':'','data-p':String(t.i),'aria-label': t.side==='pic' ? 'รูป' : (t.side==='w' ? t.c.word : t.c.mean),onclick:()=>tapTile(t, grid)}, ...kids);
      grid.append(t.el);
    }
    m.append(el('div',{class:'mthead'}, el('span',{class:'mtclockwrap'}, ic('schedule'), clock, el('small',{text:' วินาที'})), left,
      el('button',{class:'x','aria-label':'ปิด',text:'✕',onclick:closeModal})), grid);
    upd(); MT.upd=upd;
    MT.timer=setInterval(()=>{ if(MT && !MT.done) clock.textContent=secText(performance.now()-MT.t0+MT.pen); }, 100);
    MT.clock=clock;
  });
  G.modalClose=stopMatch;
}
const lenCls=s=>{ const n=String(s||'').length; return n>16 ? ' xl' : n>10 ? ' l' : ''; };
function stopMatch(){ if(MT){ clearInterval(MT.timer); MT.done=true; } }
function tapTile(t, grid){
  if(!MT || MT.done || t.gone) return;
  const a=MT.sel;
  if(!a){ MT.sel=t; t.el.classList.add('on'); if(t.side==='w') speak(sayWord(wordOf(t))); return; }
  a.el.classList.remove('on'); MT.sel=null;
  if(a===t) return;                                   // tapped again: let go
  if(a.side===t.side){ MT.sel=t; t.el.classList.add('on'); if(t.side==='w') speak(sayWord(wordOf(t))); return; }   // the same kind: choose this one instead
  if(a.id===t.id){
    a.gone=t.gone=true;
    for(const x of [a,t]){ x.el.classList.add('ok'); x.el.disabled=true; setTimeout(()=>x.el.classList.add('gone'), 380); }
    if(a.side!=='w') speak(sayWord(wordOf(t)));
    if(MT.missed.has(t.id)) fxSoft(2); else fxGood(t.el, 2);
    markActive(1,'match');
    MT.left--; MT.upd();
    if(!MT.left) setTimeout(matchDone, 450);
  } else {
    MT.pen+=MT_PENALTY; MT.missed.add(a.id); MT.missed.add(t.id); roundMiss(a.id); roundMiss(t.id);
    fxBad(t.el);
    for(const x of [a,t]){ x.el.classList.remove('bad'); void x.el.offsetWidth; x.el.classList.add('bad'); setTimeout(()=>x.el.classList.remove('bad'), 500); }
    const p=el('span',{class:'mtpen',text:'+1'}); MT.clock.parentNode.append(p); setTimeout(()=>p.remove(), 900);
  }
}
const wordOf=t=>(MT.byId[t.id] && MT.byId[t.id].it) || { word:t.c.word };
function matchDone(){
  if(!MT || MT.done) return;
  const ms=Math.round(performance.now()-MT.t0+MT.pen), { sc, kind, pool, byId }=MT, key=mtKey(sc, kind), old=+matchBest[key]||0;
  stopMatch(); G.modalClose=null;
  const better=!old || ms<old;
  if(better){ matchBest[key]=ms; store.set('pv-matchbest', matchBest); }
  RD.t0=Date.now()-ms;   // the round's time with the penalty seconds in it
  const right=Math.max(0, MT.pairs-MT.missed.size);
  roundEnd({ right, total:MT.pairs, game:'match', rightLabel:'จับถูกตั้งแต่ครั้งแรก',
    title: better && old ? `⚡ เร็วขึ้น! ${secText(ms)} วินาที` : `เสร็จแล้ว! ${secText(ms)} วินาที`,
    note: !better ? `เร็วที่สุด ${secText(old)} วินาที` : old ? `ครั้งก่อนเร็วที่สุด ${secText(old)} วินาที` : '',
    again:()=>matchRound(sc, kind, pool, byId) });
}

export { openMatch, reloadMatchBest };
