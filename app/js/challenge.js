// Piccab — ⚔️ challenges in 👂 listen & find: ⏱️ 60 seconds (find as many as you can; a wrong tap costs 3 s),
// ❤️ three hearts (a wrong tap costs a heart), and 👾 the boss: after a round, type the word you miss most.
// All optional; the normal game stays the default.
import { G, $, check, el, ids, items, pk, S, scene, speak, store, tally } from './core.js';
import { wordStats } from './progress.js';
import { closeModal, openModal, renderSub, sayOf, sceneImg } from './scene.js';
import { cardPicture, loadImg } from './cards.js';
import { startFind } from './games.js';
import { achCheckSoon } from './journey.js';
import { confetti, fxCalm, fxNote, sfx } from './fx.js';
import { roundEnd } from './rounds.js';
import { addBonusXp, addChest, chestEl } from './rewards.js';

// (var + function declarations: other parts may call these before this part of the script has run)
var CH={ mode:store.get('pv-findch','normal'), timer:null };
const CH_SECS=60;
const chOn=()=>S.mode==='find' && G.find && G.find.ch && G.find.ch!=='normal';
function chPick(){
  openModal(m=>{
    m.classList.add('sheet'); $('#modal').classList.add('sheetmode');
    const opt=(id, e, name, desc)=>el('button',{type:'button',class:'chopt'+(CH.mode===id?' on':''),onclick:()=>{ CH.mode=id; store.set('pv-findch', id); closeModal(); tally('challenge_'+id); startFind(); }},
      el('span',{class:'che','aria-hidden':'true',text:e}), el('span',{class:'grow'}, el('b',{text:name}), el('small',{text:desc})));
    m.append(el('div',{class:'sheethead'}, el('b',{text:'⚔️ เลือกความท้าทาย'}), el('button',{text:'✕','aria-label':'ปิด',onclick:closeModal})),
      el('div',{class:'chopts'},
        opt('normal','👂','ปกติ','หาทีละคำจนครบ ไม่จำกัดเวลา'),
        opt('time','⏱️','แข่งกับเวลา','60 วินาที หาให้ได้มากที่สุด · แตะผิดเสีย 3 วินาที'),
        opt('hearts','❤️','3 หัวใจ','หาให้ครบทุกคำ · แตะผิดเสียหัวใจ หมด 3 ดวงจบเกม')),
      el('p',{class:'note small',text:'👾 จบรอบแล้วมีบอสให้สู้: พิมพ์คำที่พลาดบ่อยที่สุดให้ถูก'}));
  });
}
// what shows in the bar under the picture during a challenge
function chStatus(){
  const f=G.find;
  if(!f || !f.ch || f.ch==='normal') return el('button',{class:'chbtn',title:'เลือกความท้าทาย',onclick:chPick}, '⚔️ ', el('span',{text:'ท้าทาย'}));
  const quit=el('button',{class:'icon chx',title:'กลับเป็นแบบปกติ','aria-label':'กลับเป็นแบบปกติ',text:'✕',onclick:()=>{ CH.mode='normal'; store.set('pv-findch','normal'); startFind(); }});
  if(f.ch==='time'){
    const left=Math.max(0, f.t1-Date.now());
    return el('span',{class:'chtime',id:'chTime'}, el('span',{class:'chbar'}, el('i',{style:`width:${left/CH_SECS/10}%`})), el('b',{text:Math.ceil(left/1000)+' วิ'}), el('span',{class:'chn',text:`✓ ${f.score}`}), quit);
  }
  return el('span',{class:'chhearts','aria-label':`เหลือ ${f.hearts} หัวใจ`}, el('span',{'aria-hidden':'true',text:'❤️'.repeat(f.hearts)+'🤍'.repeat(Math.max(0,3-f.hearts))}), quit);
}
function chStart(f){
  clearInterval(CH.timer); CH.timer=null;
  if(f.ch==='hearts') f.hearts=3;
  if(f.ch==='time'){
    f.t1=Date.now()+CH_SECS*1000;
    CH.timer=setInterval(()=>{
      if(G.find!==f || S.mode!=='find' || S.view!=='play'){ clearInterval(CH.timer); CH.timer=null; return; }
      const left=f.t1-Date.now(), box=document.getElementById('chTime');
      if(box){ box.querySelector('i').style.width=Math.max(0,left/CH_SECS/10)+'%'; box.querySelector('b').textContent=Math.max(0,Math.ceil(left/1000))+' วิ'; box.classList.toggle('low', left<10000); }
      if(left<=0){ clearInterval(CH.timer); CH.timer=null; chTimeUp(f); }
    }, 200);
  }
}
// a wrong tap during a challenge
function chWrong(){
  const f=G.find;
  if(f.ch==='time'){ f.t1-=3000; fxNote('−3 วินาที', true); }
  if(f.ch==='hearts'){ f.hearts--; renderSub(); if(f.hearts<=0) chOver(); }
}
function chTimeUp(f){
  f.target=null; f.queue=[]; f.lock=true; renderSub(); speak('Time is up!');
  const best=+store.get('pv-timebest',0)||0; if(f.score>best) store.set('pv-timebest', f.score);
  roundEnd({ game:'time', right:f.score, total:f.total, title:`⏱️ หมดเวลา! หาได้ ${f.score} คำ`, rightLabel:'หาได้ใน 60 วินาที', rightText:`${f.score} คำ`, again:()=>startFind() });
}
function chOver(){
  const f=G.find; f.target=null; f.queue=[]; f.lock=true; renderSub(); sfx('bad'); tally('hearts_out');
  openModal(m=>m.append(el('div',{class:'rdend'},
    el('div',{class:'big',text:'💔'}), el('h3',{text:'หัวใจหมดแล้ว!'}),
    el('p',{text:`หาถูก ${f.score} คำ จาก ${f.total} คำ — ลองอีกครั้ง ฟังดี ๆ แล้วค่อยแตะนะ`}),
    el('div',{class:'row'}, el('button',{text:'ปิด',onclick:closeModal}), el('button',{class:'primary',text:'❤️ ลองใหม่',onclick:()=>{ closeModal(); startFind(); }})))));
}

// ---------- 👾 the boss: the word in this scene that needed help most ----------
function bossWord(missed){
  const sc=scene(), its=items(), W=wordStats();
  let best=null, n=0;
  ids().forEach(id=>{ const r=W[sc.id+'|'+pk(id)]; const m=(Array.isArray(r) ? r[0]|0 : 0) + (missed && missed.includes(id) ? 2 : 0); if(its[id] && m>n){ n=m; best=id; } });
  return best;
}
function bossBtn(missed){
  const id=bossWord(missed); if(!id) return null;
  return el('button',{class:'bossbtn',onclick:()=>{ closeModal(); bossFight(id); }}, '👾 ', el('span',{text:'สู้กับบอส!'}));
}
function bossFight(id){
  const sc=scene(), it=items()[id]; if(!it) return;
  tally('boss');
  let hearts=3, shown=1, over=false;
  const goal=String(it.base||it.word), hint=()=>goal.split('').map((c,i)=>i<shown || c===' ' || c==='-' ? c : '_').join(' ');
  openModal(m=>{
    m.classList.add('bossbox');
    const pic=el('div',{class:'bosspic'}, el('span',{class:'bossface','aria-hidden':'true',text:'👾'}));
    loadImg(sceneImg(sc)).then(img=>{ if(!img) return; const src=cardPicture(img, sc, it); if(src) pic.prepend(el('img',{src,alt:''})); });
    const hp=el('div',{class:'bosshp','aria-label':`เหลือ ${hearts} หัวใจ`,text:'❤️❤️❤️'});
    const hl=el('div',{class:'bosshint','data-noi18n':'',text:hint()}), msg=el('p',{class:'msg'});
    const inp=el('input',{type:'text',autocomplete:'off',autocapitalize:'off',spellcheck:'false',placeholder:'พิมพ์คำศัพท์','aria-label':'พิมพ์คำศัพท์'});
    const go=el('button',{class:'primary',text:'⚔️ โจมตี!'});
    const say=()=>speak(sayOf(id));
    const finish=win=>{
      over=true; inp.disabled=go.disabled=true;
      if(win){
        const n=(+store.get('pv-boss',0)||0)+1; store.set('pv-boss', n); addBonusXp(30); addChest('silver'); tally('boss_win');
        pic.classList.add('beaten'); sfx('combo'); if(!fxCalm()){ const r=pic.getBoundingClientRect(); confetti({ x:r.left+r.width/2, y:r.top+r.height/2 }, 60, true); }
        msg.className='msg ok'; msg.textContent=`💥 ปราบบอสสำเร็จ! “${goal}” +30 XP`; hl.textContent=goal.split('').join(' '); hp.hidden=true;
        m.querySelector('.bossact').replaceWith(el('div',{class:'bossact'}, chestEl(), el('div',{class:'row'}, el('span',{class:'sp'}), el('button',{class:'primary',text:'เก่งมาก! ปิด',onclick:closeModal}))));
        achCheckSoon();
      } else {
        msg.className='msg bad'; msg.textContent=`บอสหนีไปแล้ว! คำนี้คือ “${goal}” — คราวหน้าลองใหม่นะ`; hl.textContent=goal.split('').join(' '); say();
        m.querySelector('.bossact').replaceWith(el('div',{class:'row bossact'}, el('span',{class:'sp'}), el('button',{text:'ปิด',onclick:closeModal}), el('button',{class:'primary',text:'👾 สู้อีกครั้ง',onclick:()=>{ closeModal(); bossFight(id); }})));
      }
    };
    const attack=()=>{
      if(over || !inp.value.trim()) return;
      if(check(inp.value, it).ok){ finish(true); return; }
      hearts--; hp.textContent='❤️'.repeat(hearts)+'🤍'.repeat(3-hearts); hp.setAttribute('aria-label',`เหลือ ${hearts} หัวใจ`);
      sfx('bad'); m.classList.remove('shake'); void m.offsetWidth; m.classList.add('shake');
      if(hearts<=0){ finish(false); return; }
      shown=Math.min(goal.length-1, shown+1); hl.textContent=hint();
      msg.className='msg bad'; msg.textContent='ยังไม่ใช่! บอสยังไม่แพ้ — ดูตัวอักษรที่เพิ่มมาแล้วลองอีกครั้ง'; inp.select();
    };
    go.onclick=attack; inp.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); attack(); } });
    m.append(el('div',{class:'bossend'},
      el('h3',{text:'👾 บอสปรากฏตัว!'}),
      el('p',{class:'note small',text:'คำที่คุณพลาดบ่อยที่สุดในฉากนี้ — พิมพ์ให้ถูกเพื่อปราบบอส (มี 3 หัวใจ)'}),
      pic, hp, hl,
      el('div',{class:'bossact'}, el('div',{class:'row'}, el('button',{text:'🔊 ฟัง',onclick:say}), inp, go)), msg));
    setTimeout(()=>{ say(); inp.focus(); }, 300);
  });
}

export { bossBtn, CH, chStart, chStatus, chWrong };
