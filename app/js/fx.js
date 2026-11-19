// Piccab — 🎉 game effects: a chime that climbs with each right answer in a row, confetti from the word,
// "+XP" that floats up, 🔥 combos (x3, x5, x10 …) and a soft sound + shake on a miss.
// Sounds are made in the browser (Web Audio, no files); 🔔 in the settings turns them off.
// "Reduce motion" on the device turns off confetti and shaking.
import { el, store, tally } from './core.js';

// (var + function declarations: other parts may call these before this part of the script has run)
var FX={ ctx:null, combo:0, best:0, rx:0, rbest:0, on:store.get('pv-sfx', true)!==false };   // rx / rbest: XP and best combo this round
const COMBO_AT=[3,5,10,15,20,30,40,50];
const fxCalm=()=>{ try{ return matchMedia('(prefers-reduced-motion: reduce)').matches; }catch(e){ return false; } };

function fxAudio(){
  if(!FX.on) return null;
  try{
    if(!FX.ctx){ const A=window.AudioContext||window.webkitAudioContext; if(!A) return null; FX.ctx=new A(); }
    if(FX.ctx.state==='suspended') FX.ctx.resume();
    return FX.ctx;
  }catch(e){ return null; }
}
function fxTone(f, at, dur, type, vol){
  const a=fxAudio(); if(!a) return;
  const t=a.currentTime+at, o=a.createOscillator(), g=a.createGain();
  o.type=type||'sine'; o.frequency.setValueAtTime(f, t);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol||.15, t+.015); g.gain.exponentialRampToValueAtTime(0.0001, t+dur);
  o.connect(g); g.connect(a.destination); o.start(t); o.stop(t+dur+.05);
}
function sfx(kind, n){
  if(kind==='good'){ const f=660*Math.pow(2, Math.min((n||1)-1, 12)/12); fxTone(f,0,.16,'triangle',.18); fxTone(f*1.5,.07,.22,'sine',.1); }
  else if(kind==='combo'){ [0,4,7,12,16].forEach((s,i)=>fxTone(523*Math.pow(2,s/12), i*.07, .25, 'triangle', .14)); }
  else if(kind==='bad'){ fxTone(196,0,.16,'sine',.12); fxTone(165,.07,.2,'sine',.09); }
}
// where on the screen: a word in the picture (its id), an element, or the middle
function fxPoint(t){
  let e=null;
  if(typeof t==='string'){ e=document.querySelector(`#scene .item[data-id="${CSS.escape(t)}"] .box`) || document.querySelector(`#scene .item[data-id="${CSS.escape(t)}"]`); }
  else if(t && t.getBoundingClientRect) e=t;
  const r=e && e.getBoundingClientRect();
  if(r && r.width) return { x:r.left+r.width/2, y:r.top+r.height/2 };
  return { x:innerWidth/2, y:innerHeight/2 };
}
function fxLayer(){ let L=document.getElementById('fxLayer'); if(!L){ L=el('div',{id:'fxLayer','aria-hidden':'true'}); document.body.append(L); } return L; }
function confetti(p, n){
  const L=fxLayer(), cols=['#ffc928','#f2683a','#534ab7','#23915a','#ef5a78','#3fa7f5'];
  for(let i=0;i<n;i++){
    const c=el('i',{class:'fxbit'}), a=Math.random()*Math.PI*2, v=60+Math.random()*120, dx=Math.cos(a)*v, dy=Math.sin(a)*v-80;
    c.style.cssText=`left:${p.x}px;top:${p.y}px;background:${cols[i%cols.length]};${i%3?'':'border-radius:50%;'}`;
    L.append(c);
    const an=c.animate([{ transform:'translate(-50%,-50%) rotate(0) scale(1)', opacity:1 },
      { transform:`translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) rotate(${Math.random()*540}deg) scale(1)`, opacity:1, offset:.55 },
      { transform:`translate(calc(-50% + ${dx*1.2}px), calc(-50% + ${dy+140}px)) rotate(${Math.random()*720}deg) scale(.6)`, opacity:0 }],
      { duration:900+Math.random()*400, easing:'cubic-bezier(.2,.7,.4,1)' });
    an.onfinish=()=>c.remove();
  }
}
function floatXp(p, xp, combo){
  const L=fxLayer(), t=el('div',{class:'fxxp'}, el('b',{text:`+${xp} XP`}), combo>=2 ? el('span',{text:`🔥 x${combo}`}) : null);
  t.style.left=p.x+'px'; t.style.top=p.y+'px'; L.append(t);
  const an=t.animate([{ transform:'translate(-50%,-30%) scale(.6)', opacity:0 }, { transform:'translate(-50%,-110%) scale(1.1)', opacity:1, offset:.25 },
    { transform:'translate(-50%,-190%) scale(1)', opacity:1, offset:.7 }, { transform:'translate(-50%,-240%) scale(.9)', opacity:0 }], { duration:1300, easing:'ease-out' });
  an.onfinish=()=>t.remove();
}
function comboPop(n){
  const words={3:'คอมโบ!',5:'สุดยอด!',10:'ไม่มีใครหยุดได้!',15:'เทพมาก!',20:'ตำนาน!'};
  const L=fxLayer(), b=el('div',{class:'fxcombo'}, el('b',{text:`🔥 x${n}`}), el('span',{text:words[n]||'ไฟลุก!'}));
  L.append(b);
  const an=b.animate([{ transform:'translate(-50%,-50%) scale(.3) rotate(-8deg)', opacity:0 }, { transform:'translate(-50%,-50%) scale(1.15) rotate(3deg)', opacity:1, offset:.25 },
    { transform:'translate(-50%,-50%) scale(1) rotate(0)', opacity:1, offset:.75 }, { transform:'translate(-50%,-60%) scale(.9)', opacity:0 }], { duration:1500, easing:'ease-out' });
  an.onfinish=()=>b.remove();
}
// A right answer: where (word id / element), how much XP it was worth
function fxGood(target, xp){
  FX.combo++; if(FX.combo>FX.best) FX.best=FX.combo; if(FX.combo>FX.rbest) FX.rbest=FX.combo;
  FX.rx+=xp||2;
  const p=fxPoint(target), big=COMBO_AT.includes(FX.combo) || (FX.combo>50 && FX.combo%10===0);
  sfx(big ? 'combo' : 'good', FX.combo);
  if(!fxCalm()) confetti(p, big ? 40 : 16);
  floatXp(p, xp||2, FX.combo);
  if(big){ comboPop(FX.combo); if(FX.combo>=5) tally('combo'); }
  try{ if(navigator.vibrate) navigator.vibrate(big ? [20,40,20] : 12); }catch(e){}
}
// A miss: the combo starts again
function fxBad(target){
  const lost=FX.combo>=3; FX.combo=0; sfx('bad');
  if(lost) fxNote('คอมโบหลุด — เริ่มใหม่ได้!');
  const e=target && target.getBoundingClientRect ? target : (typeof target==='string' ? document.getElementById('wrap') : null);
  if(e && !fxCalm()){ e.classList.remove('fxshake'); void e.offsetWidth; e.classList.add('fxshake'); }
}
function fxNote(text){ const L=fxLayer(), n=el('div',{class:'fxnote',text}); L.append(n); n.animate([{opacity:0},{opacity:1,offset:.15},{opacity:1,offset:.8},{opacity:0}],{duration:1600}).onfinish=()=>n.remove(); }
// right, but not the first time: XP, a plain chime, no combo
function fxSoft(xp){ FX.combo=0; FX.rx+=xp||2; sfx('good',1); }
// a new game / scene / word shown without answering: the combo starts again (quietly)
function fxReset(){ FX.combo=0; }
// XP for a right answer (as 🗺️ การเดินทาง counts it): +2, +10 for a new word, +5 for a new ★
const answerXp=(isNew, newStar)=>2+(isNew?10:0)+(newStar?5:0);
{ const c=document.getElementById('sfx'); if(c){ c.checked=FX.on; c.addEventListener('change',()=>{ FX.on=c.checked; store.set('pv-sfx', FX.on); if(FX.on) sfx('good',1); }); } }

export { answerXp, confetti, FX, fxBad, fxCalm, fxGood, fxReset, fxSoft, sfx };
