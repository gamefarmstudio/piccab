// Piccab — 🗺️ การเดินทาง: XP, levels, a map of places to reach, and badges (🏅) to collect.
// Everything is worked out from what is already on this device (words passed, ★, days practised, games played),
// so nothing new has to be counted or synced; earned badges are remembered (pv-ach) so they never go away
// and a new one is celebrated once.
import { G, $, el, ic, LOC, NS, progress, scenes, store, tally, UI } from './core.js';
import { dayNo } from './progress.js';
import { goHome, progOf } from './scene.js';
import { days } from './home.js';
import { galAdded } from './gallery.js';
import { cefrRows } from './path.js';
import { bonusXp, ownedCount, questCheck, stickerBook } from './rewards.js';

// (var + function declarations: other parts may ask for these before this part of the script has run)
var ACH_PLACES=[
  { lv:1,  e:'🏝️', th:'เกาะเริ่มต้น', en:'Starter Island' },
  { lv:3,  e:'🌳', th:'ป่าคำศัพท์', en:'Word Forest' },
  { lv:5,  e:'🏖️', th:'หาดเสียงคลื่น', en:'Echo Beach' },
  { lv:7,  e:'🏔️', th:'ภูเขาประโยค', en:'Sentence Mountain' },
  { lv:10, e:'🏜️', th:'ทะเลทรายดวงดาว', en:'Star Desert' },
  { lv:13, e:'🌋', th:'ภูเขาไฟแห่งความเพียร', en:'Volcano of Grit' },
  { lv:16, e:'❄️', th:'ดินแดนหิมะ', en:'Snow Land' },
  { lv:20, e:'🏙️', th:'เมืองแห่งภาษา', en:'City of Languages' },
  { lv:25, e:'🚀', th:'สถานีอวกาศ', en:'Space Station' },
  { lv:30, e:'🏰', th:'ปราสาทนักภาษา', en:'Linguist Castle' }];
// id, emoji, name, what to do, the number it counts (from achStats), goal
var ACH_BADGES=[
  ['w10','🌱','คำแรก ๆ','ผ่าน 10 คำ','passed',10], ['w50','📗','นักอ่านตัวน้อย','ผ่าน 50 คำ','passed',50], ['w100','📚','ร้อยคำ','ผ่าน 100 คำ','passed',100],
  ['w250','🎒','นักเดินทางคำศัพท์','ผ่าน 250 คำ','passed',250], ['w500','🧠','สมองคลังคำ','ผ่าน 500 คำ','passed',500], ['w1000','👑','ราชาพันคำ','ผ่าน 1,000 คำ','passed',1000],
  ['s10','⭐','ดาวดวงแรก','ได้ ★ 10 คำ (ตอบถูกเองโดยไม่ใช้ตัวช่วย)','stars',10], ['s50','🌟','ดาวเต็มฟ้า','ได้ ★ 50 คำ','stars',50], ['s200','💫','ทางช้างเผือก','ได้ ★ 200 คำ','stars',200],
  ['k3','🔥','จุดไฟ','ฝึก 3 วันติดกัน','best',3], ['k7','🔥','ไฟลุก','ฝึก 7 วันติดกัน','best',7], ['k14','☄️','ไฟไม่มอด','ฝึก 14 วันติดกัน','best',14],
  ['k30','🌞','หนึ่งเดือนเต็ม','ฝึก 30 วันติดกัน','best',30], ['k100','🏆','ร้อยวันไม่หยุด','ฝึก 100 วันติดกัน','best',100],
  ['d10','📅','มาเรียนสม่ำเสมอ','ฝึกรวม 10 วัน','active',10], ['d50','🗓️','ขยันตัวจริง','ฝึกรวม 50 วัน','active',50], ['d100','🎖️','ร้อยวันแห่งการเรียน','ฝึกรวม 100 วัน','active',100],
  ['q100','✍️','นักพิมพ์','ตอบในโหมดทบทวน (พิมพ์) 100 ครั้ง','quiz',100], ['q500','⌨️','นิ้วสายฟ้า','ตอบในโหมดทบทวน (พิมพ์) 500 ครั้ง','quiz',500],
  ['f50','🎧','หูไว','ตอบในเกมฟังแล้วหา 50 ครั้ง','find',50], ['p20','🗣️','กล้าพูด','ฝึกพูดผ่าน 20 คำ','speak',20], ['p100','🎤','นักพูดตัวยง','ฝึกพูดผ่าน 100 คำ','speak',100],
  ['t10','🧩','ช่างเรียงประโยค','แต่งประโยคถูก 10 ประโยค','sent',10], ['t50','🏗️','สถาปนิกประโยค','แต่งประโยคถูก 50 ประโยค','sent',50],
  ['r50','🔁','ทบทวนไม่ลืม','ตอบในการทบทวนชุดคำ 50 ครั้ง','review',50],
  ['c1','🖼️','ฉากแรกครบ','ผ่านทุกคำในฉากหนึ่ง','scenes',1], ['c5','🏞️','นักสำรวจ','ผ่านทุกคำครบ 5 ฉาก','scenes',5], ['c20','🗺️','นักผจญภัย','ผ่านทุกคำครบ 20 ฉาก','scenes',20],
  ['m1','📷','นักสร้างฉาก','สร้างฉากจากรูปของตัวเอง','made',1], ['m5','🎨','ศิลปินคำศัพท์','สร้างฉากของตัวเอง 5 ฉาก','made',5],
  ['st10','📒','นักสะสมสติกเกอร์','สะสมสติกเกอร์ 10 แบบ','stickers',10], ['st30','🗂️','นักสะสมตัวยง','สะสมสติกเกอร์ 30 แบบ','stickers',30], ['st48','🌟','ครบทั้งเล่ม','สะสมสติกเกอร์ครบ 48 แบบ','stickers',48],
  ['boss1','👾','ปราบบอส','ปราบบอสได้ครั้งแรก','boss',1], ['boss10','🗡️','นักล่าบอส','ปราบบอส 10 ครั้ง','boss',10], ['time15','⚡','สายฟ้าแลบ','แข่งกับเวลา หาได้ 15 คำใน 60 วินาที','time',15],
  ['lpreA1','🏅','ผ่าน Pre-A1','รู้คำระดับ Pre-A1 ในคลังภาพ 80%','preA1',80], ['lA1','🥉','ผ่าน A1','รู้คำระดับ A1 ในคลังภาพ 80%','A1',80], ['lA2','🥈','ผ่าน A2','รู้คำระดับ A2 ในคลังภาพ 80%','A2',80]];
var ACH={ t:null, queue:[], showing:false };

// XP needed to reach a level: 0, 100, 300, 600, 1000, … (50·L·(L−1))
const lvXp=L=>50*L*(L-1);
function levelOf(xp){ let L=1; while(lvXp(L+1)<=xp) L++; return L; }
function placeOf(lv){ let i=0; ACH_PLACES.forEach((p,k)=>{ if(lv>=p.lv) i=k; }); return i; }
const placeName=p=>UI==='en' ? p.en : p.th;
function bestStreak(){
  const ks=Object.keys(days).filter(k=>days[k]).sort(); let best=0, run=0, prev=null;
  for(const k of ks){ const t=Date.parse(k+'T00:00:00Z')/86400000; run = prev!==null && t-prev===1 ? run+1 : 1; prev=t; if(run>best) best=run; }
  return best;
}
function achStats(){
  const s={ passed:0, stars:0, answers:0, active:0, quiz:0, find:0, speak:0, sent:0, review:0, scenes:0, made:0, best:bestStreak(), stickers:ownedCount(), boss:+store.get('pv-boss',0)||0, time:+store.get('pv-timebest',0)||0 };
  for(const d of Object.values(days)){ if(!d) continue; s.active++; s.answers+=d.n||0; const m=d.m||{}; ['quiz','find','speak','sent','review'].forEach(k=>s[k]+=m[k]||0); }
  for(const p of Object.values(progress)){ if(!p) continue; s.passed+=Object.keys(p.done||{}).length; s.stars+=Object.values(p.star||{}).filter(Boolean).length; }
  for(const sc of scenes()){ const r=progOf(sc); if(r.n && r.d===r.n) s.scenes++; }
  const fromLib=new Set(Object.values(galAdded||{})), imported=new Set(Object.values(store.get('pv-imported',{})||{}).flatMap(r=>(r&&r.scenes)||[]));
  s.made=G.customs.filter(sc=>!sc.builtin && !fromLib.has(sc.id) && !imported.has(sc.id)).length;
  try{ cefrRows().forEach(r=>{ if(r.total>=10) s[r.c]=Math.round(r.known/r.total*100); }); }catch(e){}
  return s;
}
function achState(){ const v=store.get('pv-ach',null); return v && typeof v==='object' && v.earned ? v : null; }
// Where you are: XP, level, place, badges (earned ones stay earned)
function journey(){
  const s=achStats(), st=achState()||{ earned:{} }, earned={...st.earned}, today=dayNo();
  ACH_BADGES.forEach(([id,,,,k,goal])=>{ if(!earned[id] && (s[k]||0)>=goal) earned[id]=today; });
  const nb=Object.keys(earned).filter(id=>ACH_BADGES.some(b=>b[0]===id)).length;
  const xp=s.passed*10 + s.stars*5 + s.answers*2 + s.sent*15 + s.active*20 + nb*50 + bonusXp();   // bonus: quests, ✨ golden words, repeated stickers
  const lv=levelOf(xp);
  return { s, xp, lv, place:placeOf(lv), earned, nb, next:lvXp(lv+1), cur:lvXp(lv) };
}
// After practising: remember new badges / level and celebrate them (the first time quietly, so old progress doesn't pop up all at once)
function achCheckSoon(){ clearTimeout(ACH.t); ACH.t=setTimeout(achCheck, 1200); }
function achCheck(){
  try{ questCheck(); }catch(e){}
  let J; try{ J=journey(); }catch(e){ return; }
  const old=achState();
  store.set('pv-ach',{ earned:J.earned, lv:J.lv });
  lvPill(J);
  if(!old) return;
  const fresh=Object.keys(J.earned).filter(id=>!old.earned[id]);
  if(J.lv>(old.lv||1)) ACH.queue.push({ kind:'lv', lv:J.lv, place:placeOf(J.lv)>placeOf(old.lv||1) ? ACH_PLACES[placeOf(J.lv)] : null });
  fresh.forEach(id=>{ const b=ACH_BADGES.find(x=>x[0]===id); if(b) ACH.queue.push({ kind:'badge', b }); });
  if(fresh.length) tally('badge');
  showAchPop();
}
function showAchPop(){
  if(ACH.showing || !ACH.queue.length) return;
  const x=ACH.queue.shift(); ACH.showing=true;
  const pop=el('button',{type:'button',class:'achpop',onclick:()=>{ done(); goHome('journey'); }},
    el('span',{class:'achbig','aria-hidden':'true',text: x.kind==='note' ? x.e : x.kind==='lv' ? (x.place ? x.place.e : '🎉') : x.b[1]}),
    el('span',{class:'achtxt'},
      el('small',{text: x.kind==='note' ? x.s : x.kind==='lv' ? 'ขึ้นเลเวลแล้ว!' : 'ได้ตราใหม่!'}),
      el('b',{text: x.kind==='note' ? x.b : x.kind==='lv' ? `Lv.${x.lv}`+(x.place ? ` · มาถึง${placeName(x.place)}` : '') : x.b[2]}),
      x.kind==='badge' ? el('span',{class:'achd',text:x.b[3]}) : null));
  document.body.append(pop);
  requestAnimationFrame(()=>pop.classList.add('show'));
  let t=setTimeout(done, 4200);
  function done(){ clearTimeout(t); pop.classList.remove('show'); setTimeout(()=>{ pop.remove(); ACH.showing=false; showAchPop(); }, 350); }
}
// the level pill at the top, next to 🔥
function lvPill(J){
  const p=$('#lvPill'); if(!p) return;
  J=J||journey(); p.replaceChildren(el('span',{class:'lvst','aria-hidden':'true',text:'⭐'}), 'Lv.'+J.lv);
  p.setAttribute('aria-label',`เลเวล ${J.lv} · การเดินทางของฉัน`);
}
// Home tile
function journeyTile(){
  const J=journey(), P=ACH_PLACES[J.place], pct=Math.round((J.xp-J.cur)/(J.next-J.cur)*100);
  return el('button',{type:'button',class:'tile jtile',onclick:()=>goHome('journey')},
    el('span',{class:'ic jic','aria-hidden':'true',text:P.e}),
    el('span',{class:'grow'}, el('b',{text:'การเดินทางของฉัน'}),
      el('small',{text:`Lv.${J.lv} · ตรา ${J.nb}/${ACH_BADGES.length}`,title:placeName(P)}),
      el('span',{class:'pbar jbar'}, el('i',{style:`width:${pct}%`}))),
    ic('chevron_right'));
}
function renderJourney(){
  const v=$('#journeyView'); if(!v) return; v.innerHTML='';
  achCheck();
  const J=journey(), P=ACH_PLACES[J.place], need=J.next-J.xp, pct=Math.round((J.xp-J.cur)/(J.next-J.cur)*100);
  v.append(el('div',{class:'ghead'}, el('h2',{text:'🗺️ การเดินทางของฉัน'}), el('p',{text:'ฝึกคำ เก็บ XP เดินทาง สะสมตรา'})));
  v.append(el('div',{class:'jhead'},
    el('div',{class:'jlv'}, el('small',{text:'เลเวล'}), el('b',{text:String(J.lv)})),
    el('div',{class:'grow'},
      el('div',{class:'jxp'}, el('b',{text:`⭐ ${J.xp.toLocaleString()} XP`}), el('span',{text:`อีก ${need.toLocaleString()} XP ถึง Lv.${J.lv+1}`})),
      el('div',{class:'pbar jbar',role:'progressbar','aria-valuemin':'0','aria-valuemax':'100','aria-valuenow':String(pct)}, el('i',{style:`width:${pct}%`})),
      el('small',{class:'note',text:`ตอนนี้อยู่ที่ ${P.e} ${placeName(P)}`}))));
  // the map: places in a winding path; reached ✓, here 🧒, ahead 🔒
  const n=ACH_PLACES.length, rowH=96, xs=[50,24,70,32,76,28,68,26,72,50], H=n*rowH;
  const map=el('div',{class:'jmap',style:`height:${H}px`});
  const sv=document.createElementNS(NS,'svg'); sv.setAttribute('viewBox',`0 0 100 ${H}`); sv.setAttribute('preserveAspectRatio','none'); sv.setAttribute('class','jroad');
  const pts=ACH_PLACES.map((p,i)=>[xs[i%xs.length], i*rowH+rowH/2]);
  const d=pts.map((q,i)=>i ? `C ${pts[i-1][0]} ${pts[i-1][1]+rowH/2}, ${q[0]} ${q[1]-rowH/2}, ${q[0]} ${q[1]}` : `M ${q[0]} ${q[1]}`).join(' ');
  const done=pts.slice(0,J.place+1), d2=done.map((q,i)=>i ? `C ${done[i-1][0]} ${done[i-1][1]+rowH/2}, ${q[0]} ${q[1]-rowH/2}, ${q[0]} ${q[1]}` : `M ${q[0]} ${q[1]}`).join(' ');
  [['jr0',d],['jr1',d2]].forEach(([c,dd])=>{ if(!dd.includes('C') && c==='jr1') return; const pa=document.createElementNS(NS,'path'); pa.setAttribute('d',dd); pa.setAttribute('class',c); pa.setAttribute('vector-effect','non-scaling-stroke'); sv.append(pa); });
  map.append(sv);
  ACH_PLACES.forEach((p,i)=>{
    const st= i<J.place ? 'done' : i===J.place ? 'here' : 'lock';
    map.append(el('div',{class:'jnode '+st,style:`left:${pts[i][0]}%;top:${pts[i][1]}px`},
      el('span',{class:'jdot','aria-hidden':'true',text: st==='lock' ? '🔒' : p.e}),
      st==='here' ? el('span',{class:'jme','aria-hidden':'true',text:'🧒'}) : null,
      el('span',{class:'jname'}, el('b',{text:placeName(p)}), el('small',{text: st==='done' ? `✓ Lv.${p.lv}` : st==='here' ? 'อยู่ตรงนี้' : `Lv.${p.lv}`}))));
  });
  v.append(el('h3',{class:'psub',text:'แผนที่การเดินทาง'}), map);
  // badges
  v.append(el('h3',{class:'psub',text:`🏅 ตราที่ได้ ${J.nb}/${ACH_BADGES.length}`}));
  const grid=el('div',{class:'jbadges'});
  const fmt=dn=>{ const t=new Date(dn*86400000); return new Date(t.getUTCFullYear(),t.getUTCMonth(),t.getUTCDate()).toLocaleDateString(LOC,{ day:'numeric', month:'short' }); };
  ACH_BADGES.forEach(([id,e,name,desc,k,goal])=>{
    const got=J.earned[id], have=Math.min(J.s[k]||0, goal);
    grid.append(el('div',{class:'jbadge'+(got?' got':''),title:desc},
      el('span',{class:'jbe','aria-hidden':'true',text:e}), el('b',{text:name}), el('small',{text:desc}),
      got ? el('em',{text:'ได้เมื่อ '+fmt(got)}) : el('span',{class:'jprog'}, el('span',{class:'pbar'}, el('i',{style:`width:${Math.round(have/goal*100)}%`})), el('small',{text:`${have.toLocaleString()}/${goal.toLocaleString()}`}))));
  });
  v.append(grid);
  v.append(stickerBook());
  v.append(el('details',{class:'jhow'}, el('summary',{text:'ได้ XP จากอะไรบ้าง'}),
    el('ul',{}, ...['ผ่านคำใหม่ +10 XP','ได้ ★ (ตอบถูกเองโดยไม่ใช้ตัวช่วย) +5 XP','ตอบในเกมต่าง ๆ +2 XP','แต่งประโยคถูก +15 XP','วันที่มาฝึก +20 XP','ได้ตราใหม่ +50 XP','ทำภารกิจวันนี้สำเร็จ +50 XP','✨ คำทอง: XP สองเท่า','ได้สติกเกอร์ซ้ำ +20 XP'].map(t=>el('li',{text:t})))));
}
// Short summary for the learning report (teacher / parent)
function achSummary(){
  const J=journey();
  const recent=Object.entries(J.earned).filter(([id])=>ACH_BADGES.some(b=>b[0]===id)).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([id,dn])=>[id, dn]);
  return { lv:J.lv, xp:J.xp, place:J.place, n:J.nb, total:ACH_BADGES.length, recent };
}
const badgeById=id=>ACH_BADGES.find(b=>b[0]===id)||null;
{ const b=document.getElementById('lvPill'); if(b) b.addEventListener('click',()=>goHome('journey')); }

setTimeout(()=>{ try{ achCheck(); }catch(e){} }, 1500);      // first time on this device: remember what is already earned, quietly

export { ACH, ACH_BADGES, ACH_PLACES, achCheck, achCheckSoon, achSummary, badgeById, journey, journeyTile, lvPill, placeName, renderJourney, showAchPop };
