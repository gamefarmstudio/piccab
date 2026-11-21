// Piccab — ⭐ the end of a round: 1–3 stars, XP and the best combo counted up, time, 🏆 a new best,
// and "play again" / "practise the ones I missed". The best per scene + game shows as stars on the scene's card.
import { el, items, S, scene, store, tally } from './core.js';
import { dayNo } from './progress.js';
import { closeModal, openModal } from './scene.js';
import { confetti, FX, fxCalm, sfx } from './fx.js';
import { addChest, chestEl, dqAdd, tierFor } from './rewards.js';
import { bossBtn } from './challenge.js';

// (var + function declarations: other parts may call these before this part of the script has run)
var RD={ key:'', t0:0, missed:new Set(), practice:false };
var roundBest=store.get('pv-best',{})||{};
function reloadBest(){ roundBest=store.get('pv-best',{})||{}; }   // after 🎮 game sync
// 3 stars: 90%+ right the first time, 2: 60%+, 1: finished
const starsFor=(right,total)=>{ const p=total ? right/total : 0; return p>=0.9 ? 3 : p>=0.6 ? 2 : 1; };
function roundKey(game, sid){ return `${sid||scene().id}|${game}|${S.lang}`; }
// practice: a round of only the missed words (or a word-set review) — its stars don't become the scene's best
function roundStart(game, sid, practice){ RD={ key:roundKey(game, sid), t0:Date.now(), missed:new Set(), practice:!!practice }; FX.rx=0; FX.rbest=0; FX.combo=0; }
function roundMiss(id){ if(id) RD.missed.add(id); }
// best stars of a scene over all its games (for its card)
function sceneStars(sid){ let b=0; for(const [k,v] of Object.entries(roundBest)) if(k.startsWith(sid+'|') && v && v.s>b) b=v.s; return b; }
function starsEl(n, cls){ return n ? el('span',{class:'cstars'+(cls?' '+cls:''),title:`ดาวดีที่สุด ${n}/3`,'aria-label':`ดาวดีที่สุด ${n} จาก 3`}, '★'.repeat(n), el('i',{text:'★'.repeat(3-n)})) : null; }
const fmtTime=ms=>{ const s=Math.max(1,Math.round(ms/1000)); return s<60 ? `${s} วินาที` : `${Math.floor(s/60)} นาที ${s%60} วินาที`; };
// o: {right, total, title, again(), missed(list), note — optional}
function roundEnd(o){
  const total=o.total||0; if(!total) return;
  const stars=starsFor(o.right, total), pct=Math.round(o.right/total*100), ms=Date.now()-(RD.t0||Date.now()), xp=FX.rx||0, combo=FX.rbest||0;
  const key=RD.key || roundKey(o.game||'x'), old=roundBest[key];
  const better=!RD.practice && (!old || stars>old.s || (stars===old.s && pct>old.p));
  if(RD.practice){}
  else if(better){ roundBest[key]={ s:stars, p:pct, c:Math.max(combo, old?old.c:0), at:dayNo() }; store.set('pv-best', roundBest); }
  else if(old && combo>(old.c||0)){ old.c=combo; store.set('pv-best', roundBest); }
  tally('round_end'); if(stars===3) tally('round_3stars');
  dqAdd('rounds',1); if(stars===3) dqAdd('s3',1);
  const chest=!RD.practice && total>=3; if(chest) addChest(tierFor(stars));
  const missed=[...RD.missed].filter(id=>items()[id]);
  openModal(m=>{
    m.classList.add('rdbox');
    const xpN=el('b',{text:'0'}), row=el('div',{class:'rdstars','aria-label':`ได้ ${stars} ดาว จาก 3`});
    for(let i=0;i<3;i++) row.append(el('span',{class:'rdstar'+(i<stars?' on':''),style:`animation-delay:${.25+i*.35}s`,text:'★'}));
    m.append(el('div',{class:'rdend'},
      el('h3',{text:o.title||'จบรอบแล้ว!'}), row,
      el('p',{class:'rdline',text: stars===3 ? 'เยี่ยมมาก! ได้ 3 ดาวเต็ม' : stars===2 ? 'เก่งมาก! อีกนิดเดียวจะได้ 3 ดาว' : 'จบรอบแล้ว! ลองอีกรอบเพื่อเก็บดาวเพิ่ม'}),
      better && old ? el('div',{class:'rdbest'},'🏆 สถิติใหม่!') : null,
      el('div',{class:'rdstats'},
        el('div',{}, el('small',{text:o.rightLabel||'ถูกตั้งแต่ครั้งแรก'}), el('b',{text:o.rightText||`${o.right}/${total}`})),
        el('div',{class:'xp'}, el('small',{text:'XP ที่ได้'}), xpN),
        el('div',{}, el('small',{text:'คอมโบสูงสุด'}), el('b',{text: combo>=2 ? `🔥 x${combo}` : '–'})),
        el('div',{}, el('small',{text:'เวลา'}), el('b',{text:fmtTime(ms)}))),
      old && !better ? el('p',{class:'note small',text:`ดีที่สุดของฉากนี้: ${'★'.repeat(old.s)} (${old.p}%)`}) : null,
      o.note ? el('p',{class:'note small rdnote',text:o.note}) : null,
      chest ? chestEl() : null,
      el('div',{class:'row'},
        el('button',{text:'ปิด',onclick:closeModal}),
        o.missed && missed.length ? el('button',{text:`🎯 ฝึกคำที่พลาด (${missed.length})`,onclick:()=>{ closeModal(); o.missed(missed); }}) : null,
        o.boss && !RD.practice ? bossBtn(missed) : null,
        o.again ? el('button',{class:'primary',text:'🔁 เล่นอีกรอบ',onclick:()=>{ closeModal(); o.again(); }}) : null)));
    // count the XP up, a chime per star, confetti for 3 stars
    const t0=performance.now(), dur=900;
    const step=t=>{ const k=Math.min(1,(t-t0)/dur); xpN.textContent='+'+Math.round(xp*k); if(k<1 && xpN.isConnected) requestAnimationFrame(step); };
    requestAnimationFrame(step);
    for(let i=0;i<stars;i++) setTimeout(()=>sfx('good', 4+i*3), 250+i*350);
    if(stars===3) setTimeout(()=>{ sfx('combo'); if(!fxCalm()){ const r=row.getBoundingClientRect(); confetti({ x:r.left+r.width/2, y:r.top+r.height/2 }, 50); } }, 250+3*350);
  });
}
// small version for the word-set review's own end screen
function roundMini(right, total){
  const stars=starsFor(right, total), row=el('div',{class:'rdstars sm','aria-label':`ได้ ${stars} ดาว จาก 3`});
  for(let i=0;i<3;i++) row.append(el('span',{class:'rdstar'+(i<stars?' on':''),style:`animation-delay:${.2+i*.3}s`,text:'★'}));
  for(let i=0;i<stars;i++) setTimeout(()=>sfx('good', 4+i*3), 200+i*300);
  return el('div',{class:'rdmini'}, row, el('p',{class:'note small',text:`+${FX.rx||0} XP`+((FX.rbest||0)>=2 ? ` · คอมโบสูงสุด 🔥 x${FX.rbest}` : '')}));
}

export { RD, reloadBest, roundEnd, roundKey, roundMini, roundMiss, roundStart, sceneStars, starsEl };
