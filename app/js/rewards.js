// Piccab — 🎁 rewards: a treasure chest after each round, the 📒 sticker book, ✨ golden words (double XP)
// and 📋 three quests a day. All kept on this device. Nothing here can be bought: chests come only from playing.
import { G, el, ic, S, store, tally } from './core.js';
import { dayNo } from './progress.js';
import { closeModal, goHome, openModal } from './scene.js';
import { days, dkey, renderHome } from './home.js';
import { SR } from './games.js';
import { ACH, achCheckSoon, renderJourney, showAchPop } from './journey.js';
import { confetti, fxCalm, sfx } from './fx.js';

// (var + function declarations: other parts may call these before this part of the script has run)
// id, emoji, Thai name, rarity (c = ธรรมดา, r = หายาก ✨, l = ตำนาน 🌈)
var STICKERS=[
  ['puppy','🐶','ลูกหมา','c'],['kitten','🐱','ลูกแมว','c'],['bunny','🐰','กระต่าย','c'],['bear','🐻','หมี','c'],['panda','🐼','แพนด้า','c'],
  ['koala','🐨','โคอาลา','c'],['tiger','🐯','เสือ','c'],['lion','🦁','สิงโต','c'],['cow','🐮','วัว','c'],['pig','🐷','หมู','c'],
  ['frog','🐸','กบ','c'],['monkey','🐵','ลิง','c'],['chick','🐔','ไก่','c'],['penguin','🐧','เพนกวิน','c'],['turtle','🐢','เต่า','c'],
  ['fish','🐟','ปลา','c'],['octopus','🐙','ปลาหมึก','c'],['crab','🦀','ปู','c'],['bee','🐝','ผึ้ง','c'],['butterfly','🦋','ผีเสื้อ','c'],
  ['apple','🍎','แอปเปิล','c'],['banana','🍌','กล้วย','c'],['melon','🍉','แตงโม','c'],['berry','🍓','สตรอว์เบอร์รี','c'],['donut','🍩','โดนัท','c'],
  ['icecream','🍦','ไอศกรีม','c'],['pizza','🍕','พิซซ่า','c'],['sunflower','🌻','ทานตะวัน','c'],['ball','⚽','ลูกบอล','c'],['balloon','🎈','ลูกโป่ง','c'],
  ['fox','🦊','จิ้งจอก','r'],['owl','🦉','นกฮูก','r'],['giraffe','🦒','ยีราฟ','r'],['elephant','🐘','ช้าง','r'],['flamingo','🦩','นกฟลามิงโก','r'],
  ['dolphin','🐬','โลมา','r'],['whale','🐳','วาฬ','r'],['trex','🦖','ทีเร็กซ์','r'],['rocket','🚀','จรวด','r'],['guitar','🎸','กีตาร์','r'],
  ['castle','🏰','ปราสาท','r'],['cupcake','🧁','คัพเค้ก','r'],
  ['unicorn','🦄','ยูนิคอร์น','l'],['dragon','🐉','มังกร','l'],['rainbow','🌈','สายรุ้ง','l'],['crown','👑','มงกุฎ','l'],['diamond','💎','เพชร','l'],['fairy','🧚','นางฟ้า','l']];
var RARITY={ c:'ธรรมดา', r:'หายาก ✨', l:'ตำนาน 🌈' };
// chance of a rare / legendary sticker by chest: wood (1★), silver (2★), gold (3★ or all quests done)
var CHESTS={ wood:{ e:'🎁', name:'หีบไม้', r:.13, l:.02 }, silver:{ e:'🎁', name:'หีบเงิน', r:.25, l:.05 }, gold:{ e:'🎁', name:'หีบทอง', r:.38, l:.12 } };
var RW={ stk:store.get('pv-stk',{})||{}, chests:store.get('pv-chests',[])||[] };
// Chests as counts per kind — got and opened (pv-chestc) — so two devices can add them up without opening one twice;
// the waiting chests (pv-chests) are got − opened.
var CHC=(()=>{ let c=store.get('pv-chestc',null);
  if(!c || typeof c!=='object'){ c={ got:{}, open:{} }; for(const ch of RW.chests){ const t=CHESTS[ch && ch.t] ? ch.t : 'wood'; c.got[t]=(c.got[t]||0)+1; } store.set('pv-chestc', c); }
  c.got=c.got||{}; c.open=c.open||{}; return c; })();
function chestsFromCounts(){
  const L=[]; for(const t of ['wood','silver','gold']) for(let i=Math.max(0,(+CHC.got[t]||0)-(+CHC.open[t]||0)); i>0; i--) L.push({ t, d:0 });
  return L;
}
function reloadRewards(){                                     // after 🎮 game sync
  RW.stk=store.get('pv-stk',{})||{};
  const c=store.get('pv-chestc',null); if(c && typeof c==='object'){ CHC.got=c.got||{}; CHC.open=c.open||{}; }
  RW.chests=chestsFromCounts(); store.set('pv-chests', RW.chests);
}

const stickerName=s=>s[2];
const ownedCount=()=>STICKERS.filter(s=>RW.stk[s[0]]).length;
function bonusXp(){ return Math.max(0, +store.get('pv-bonusxp',0)||0); }
function addBonusXp(n){ store.set('pv-bonusxp', bonusXp()+n); }
function addChest(tier){ const t=CHESTS[tier]?tier:'wood'; RW.chests.push({ t, d:dayNo() }); store.set('pv-chests', RW.chests);
  CHC.got[t]=(+CHC.got[t]||0)+1; store.set('pv-chestc', CHC); }
const tierFor=stars=>stars>=3 ? 'gold' : stars===2 ? 'silver' : 'wood';
function drawSticker(tier){
  const c=CHESTS[tier]||CHESTS.wood, x=Math.random(), rar= x<c.l ? 'l' : x<c.l+c.r ? 'r' : 'c';
  const pool=STICKERS.filter(s=>s[3]===rar), fresh=pool.filter(s=>!RW.stk[s[0]]);
  const list= fresh.length && Math.random()<.7 ? fresh : pool;
  return list[Math.floor(Math.random()*list.length)];
}
// open the next waiting chest inside box (a modal or a section); onDone after the sticker shows
function chestEl(onDone){
  const ch=RW.chests[RW.chests.length-1]; if(!ch) return null;
  const C=CHESTS[ch.t]||CHESTS.wood;
  const wrap=el('div',{class:'chestbox'});
  const btn=el('button',{type:'button',class:'chest '+ch.t,'aria-label':`แตะเพื่อเปิด${C.name}`},
    el('span',{class:'che','aria-hidden':'true',text:C.e}), el('b',{text:C.name}), el('small',{text:'แตะเพื่อเปิด!'}));
  btn.onclick=()=>{
    if(btn.disabled) return; btn.disabled=true; btn.classList.add('opening'); sfx('good',3);
    setTimeout(()=>{
      RW.chests.pop(); store.set('pv-chests', RW.chests);
      CHC.open[ch.t]=(+CHC.open[ch.t]||0)+1; store.set('pv-chestc', CHC);
      const s=drawSticker(ch.t), had=RW.stk[s[0]]||0; RW.stk[s[0]]=had+1; store.set('pv-stk', RW.stk);
      if(had) addBonusXp(20);
      dqAdd('chests',1); tally('chest_'+s[3]);
      const card=el('div',{class:'stkreveal '+s[3]},
        el('span',{class:'stke','aria-hidden':'true',text:s[1]}),
        el('span',{class:'stkr',text:RARITY[s[3]]}),
        el('b',{text:stickerName(s)}),
        el('small',{text: had ? `มีแล้ว ${had+1} ใบ — ได้ +20 XP` : '✨ ใหม่! เก็บลงสมุดสติกเกอร์แล้ว'}));
      wrap.replaceChildren(card);
      sfx(s[3]==='c' ? 'good' : 'combo', 6);
      if(!fxCalm()){ const r=card.getBoundingClientRect(); confetti({ x:r.left+r.width/2, y:r.top+r.height/3 }, s[3]==='c' ? 18 : 50); }
      achCheckSoon(); if(onDone) onDone(s);
    }, 750);
  };
  wrap.append(btn);
  return wrap;
}

// ---------- ✨ golden word: one word in a round of listen & find / speak gives double XP ----------
function pickGold(list){ return list.length>=4 ? list[Math.floor(Math.random()*list.length)] : null; }
const goldPill=()=>el('span',{class:'goldpill',title:'ตอบถูกตั้งแต่ครั้งแรกได้ XP สองเท่า',text:'✨ คำทอง! XP x2'});

// ---------- 📋 three quests a day ----------
// id, what to do, goal, how far (from today's practice and pv-dq)
var QUESTS=[
  ['ans','ตอบถูก 15 คำ',15,(d,q)=>d.n||0],
  ['combo','ทำคอมโบ 🔥 x5',5,(d,q)=>q.combo||0],
  ['rounds','เล่นจบ 2 รอบ',2,(d,q)=>q.rounds||0],
  ['s3','ได้ 3 ดาวในรอบไหนก็ได้',1,(d,q)=>q.s3||0],
  ['sent','แต่งประโยคถูก 3 ประโยค',3,(d,q)=>(d.m||{}).sent||0],
  ['speak','ฝึกพูดผ่าน 5 คำ',5,(d,q)=>(d.m||{}).speak||0],
  ['find','ฟังแล้วหาถูก 8 ครั้ง',8,(d,q)=>(d.m||{}).find||0],
  ['quiz','พิมพ์คำศัพท์ถูก 10 ครั้ง',10,(d,q)=>(d.m||{}).quiz||0],
  ['chest','เปิดหีบสมบัติ 1 ใบ',1,(d,q)=>q.chests||0]];
function dqState(){
  const t=dayNo(); let q=store.get('pv-dq',null);
  if(!q || q.day!==t){
    // the day's three: one "answer" quest and two more, the same all day (picked from the date)
    const pool=QUESTS.filter(x=>x[0]!=='ans' && (x[0]!=='speak' || SR)).map(x=>x[0]);
    let h=t*2654435761>>>0; const pick=[];
    while(pick.length<2 && pool.length){ h=(h*1103515245+12345)>>>0; pick.push(pool.splice(h%pool.length,1)[0]); }
    q={ day:t, ids:['ans',...pick], combo:0, rounds:0, s3:0, chests:0, done:{}, claimed:false };
    store.set('pv-dq', q);
  }
  return q;
}
function dqAdd(k, n){ const q=dqState(); q[k]=(q[k]||0)+n; store.set('pv-dq', q); questCheck(); }
function dqMax(k, n){ const q=dqState(); if(n>(q[k]||0)){ q[k]=n; store.set('pv-dq', q); questCheck(); } }
function questList(){
  const q=dqState(), d=days[dkey(new Date())]||{};
  return q.ids.map(id=>QUESTS.find(x=>x[0]===id)).filter(Boolean).map(([id,text,goal,f])=>({ id, text, goal, have:Math.min(goal, f(d,q)), done:!!q.done[id] }));
}
// a quest just done: +50 XP and a note; all three: a gold chest
function questCheck(){
  const q=dqState(); let changed=false;
  questList().forEach(x=>{ if(!x.done && x.have>=x.goal){ q.done[x.id]=true; changed=true; addBonusXp(50); tally('quest');
    if(typeof ACH!=='undefined'){ ACH.queue.push({ kind:'note', e:'📋', s:'ภารกิจสำเร็จ! +50 XP', b:x.text }); } } });
  if(q.ids.every(id=>q.done[id]) && !q.claimed){ q.claimed=true; changed=true; addChest('gold'); tally('quest_all');
    if(typeof ACH!=='undefined') ACH.queue.push({ kind:'note', e:'🎁', s:'ครบทั้ง 3 ภารกิจ!', b:'ได้หีบทอง — เปิดได้ที่ 📋 ภารกิจวันนี้' }); }
  if(changed){ store.set('pv-dq', q); if(typeof showAchPop==='function') showAchPop(); if(S.view==='home') renderHome(); }
}
function questTile(){
  const L=questList(), n=L.filter(x=>x.done).length, waiting=RW.chests.length;
  return el('button',{type:'button',class:'tile qtile'+(n===L.length?' done':''),onclick:openQuests},
    el('span',{class:'ic qic','aria-hidden':'true',text: waiting ? '🎁' : '📋'}),
    el('span',{class:'grow'}, el('b',{text:'ภารกิจวันนี้'}),
      el('small',{text: waiting ? `🎁 หีบรอเปิด ${waiting} ใบ` : n===L.length ? 'ครบแล้ว! พรุ่งนี้มีใหม่' : `ทำแล้ว ${n}/${L.length}`}),
      el('span',{class:'qdots'}, ...L.map(x=>el('i',{class:x.done?'on':''})))),
    ic('chevron_right'));
}
function openQuests(){
  openModal(m=>{
    m.classList.add('qbox');
    const draw=()=>{
      const L=questList();
      m.replaceChildren(el('h3',{text:'📋 ภารกิจวันนี้'}),
        el('p',{class:'note small',text:'ครบ 3 ภารกิจ ได้หีบทอง 🎁 · ภารกิจละ +50 XP'}),
        el('div',{class:'qlist'}, ...L.map(x=>el('div',{class:'dqrow'+(x.done?' done':'')},
          el('span',{class:'qck','aria-hidden':'true',text:x.done?'✅':'⬜'}),
          el('span',{class:'grow'}, el('b',{text:x.text}), el('span',{class:'pbar'}, el('i',{style:`width:${Math.round(x.have/x.goal*100)}%`}))),
          el('small',{text:`${x.have}/${x.goal}`})))),
        RW.chests.length ? el('div',{class:'qchest'}, el('p',{class:'note',text:`มีหีบรอเปิด ${RW.chests.length} ใบ`}), chestEl(()=>setTimeout(()=>{ if(m.isConnected) draw(); }, 1800))) : null,
        el('div',{class:'row'}, el('button',{class:'linkbtn',text:'📒 สมุดสติกเกอร์',onclick:()=>{ closeModal(); goHome('journey'); setTimeout(()=>{ const e=document.getElementById('stkBook'); if(e) e.scrollIntoView({block:'start'}); }, 80); }}),
          el('span',{class:'sp'}), el('button',{text:'ปิด',onclick:closeModal})));
    };
    draw();
  });
  G.modalClose=()=>{ if(S.view==='home') renderHome(); };
}
// 📒 the sticker book (on the journey page)
function stickerBook(){
  const box=el('div',{id:'stkBook'});
  const n=ownedCount();
  box.append(el('h3',{class:'psub',text:`📒 สมุดสติกเกอร์ ${n}/${STICKERS.length}`}),
    el('p',{class:'note small',text:'จบรอบได้หีบ · ดาวยิ่งมาก หีบยิ่งดี · ได้ซ้ำ +20 XP'}));
  if(RW.chests.length) box.append(el('div',{class:'qchest'}, el('p',{class:'note',text:`มีหีบรอเปิด ${RW.chests.length} ใบ`}), chestEl(()=>setTimeout(()=>{ if(S.view==='journey') renderJourney(); }, 1800))));
  ['l','r','c'].forEach(r=>{
    const list=STICKERS.filter(s=>s[3]===r);
    box.append(el('h4',{class:'stkh '+r,text:`${RARITY[r]} · ${list.filter(s=>RW.stk[s[0]]).length}/${list.length}`}),
      el('div',{class:'stkgrid'}, ...list.map(s=>{ const k=RW.stk[s[0]]||0;
        return el('div',{class:'stk '+r+(k?' got':''),title:k?stickerName(s):'ยังไม่ได้'},
          el('span',{class:'stke','aria-hidden':'true',text:k?s[1]:'?'}), el('small',{text:k?stickerName(s):'???'}), k>1 ? el('em',{text:'x'+k}) : null); })));
  });
  return box;
}

export { addBonusXp, addChest, bonusXp, chestEl, dqAdd, dqMax, goldPill, ownedCount, pickGold, questCheck, questTile, reloadRewards, stickerBook, tierFor };
