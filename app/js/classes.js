// Piccab — Classrooms and the teacher's progress export (.xlsx / CSV).
import { G, $, BUILTIN, el, HL, ic, langOk, LANGS, LOC, pk, progress, S, scenes, store, tally, toast, tx, UI } from './core.js';
import { ask, closeModal, goHome, openModal, setLang } from './scene.js';
import { deckCount, deckList, deckName, deckNameDialog, getDeck, liveKeys, wkey } from './decks.js';
import { autoLangState, autoTranslate, missingIn } from './editor.js';
import { authErr, capErr, humanCheck, openDeleteAccount, openLogin, sb, user } from './account.js';
import { badgeEl, FR, renderFriends } from './friends.js';
import { copyLink, importShare, myShares, openImported, picturesUploaded, shareApi, shareErr, shareKey, shareLinkNative, sharePayload } from './share.js';
import { accessToken, syncText } from './sync.js';

// ---------- 🎓 classrooms ----------
// Teachers (accounts with an e-mail) make a class and assign scenes / word decks (share links).
// Students join with the room code + a nickname: if not signed in they get an anonymous "student account".
// Each student's device works out their progress on the assignments and reports it to the class.
// (function / var: the account code above may ask before this part of the script has run)
function isStudent(){ return !!(user && user.is_anonymous); }
function studentNick(){ return String((user && user.user_metadata && user.user_metadata.nickname) || 'นักเรียน').slice(0,30); }
var CL={ list:null, openId:null, detail:null, busy:false };
const classItemsMap=()=>store.get('pv-class-items',{})||{};       // { classId: [shareId…] } for progress reports
async function classApi(method, path, body){
  const tok=await accessToken();
  const r=await fetch('/api/classes'+path,{ method, headers:{ 'content-type':'application/json', ...(tok?{authorization:'Bearer '+tok}:{}) }, body: body?JSON.stringify(body):undefined });
  const j=await r.json().catch(()=>({}));
  return { ok:r.ok, status:r.status, j };
}
const classErr=(r)=>({ bad_code:'ไม่พบห้องเรียนนี้ ตรวจรหัส 6 ตัวอีกครั้ง', bad_nickname:'ใส่ชื่อเล่นก่อนนะ', own_class:'นี่คือห้องที่คุณสอนอยู่แล้ว',
  class_full:'ห้องนี้เต็มแล้ว (200 คน)', rate_limited:'ลองถี่เกินไป รอสักครู่แล้วลองใหม่', student_account:'บัญชีนักเรียนสร้างห้องเรียนไม่ได้ — ครูต้องเข้าสู่ระบบด้วยอีเมลหรือ Google',
  too_many_classes:'สร้างห้องเรียนครบ 50 ห้องแล้ว', too_many_items:'มอบหมายงานครบ 100 รายการแล้ว', other_lang:'งานนี้มอบหมายเป็นภาษาอื่นอยู่แล้ว — เลิกมอบหมายก่อนถ้าจะเปลี่ยนภาษา', needs_update:'ต้องรัน SQL 2026-11-class-lang.sql ใน Supabase ก่อน จึงจะมอบหมายภาษาอื่นได้', not_configured:'ระบบห้องเรียนยังไม่พร้อม', bad_share:'สร้างลิงก์งานไม่สำเร็จ' }[r.j && r.j.error]
  || (r.status===401 ? 'กรุณาเข้าสู่ระบบใหม่อีกครั้ง' : 'เชื่อมต่อไม่สำเร็จ ลองใหม่อีกครั้ง'));
async function loadClasses(){
  if(!user){ CL.list={teaching:[],learning:[]}; return; }
  const r=await classApi('GET','').catch(()=>({ok:false}));
  CL.list = r.ok ? r.j : (CL.list||null);
  if(!r.ok) CL.err=classErr(r); else CL.err=null;
}
function socialTabs(v){
  const t=FR.tab;
  v.append(el('div',{class:'seg socialtabs',role:'tablist'},
    el('button',{class:t==='class'?'on':'',role:'tab',onclick:()=>{ FR.tab='class'; store.set('pv-social-tab','class'); renderClass(); }}, ic('school'), 'ห้องเรียน'),
    el('button',{class:t==='friends'?'on':'',role:'tab',onclick:()=>{ FR.tab='friends'; FR.data=null; store.set('pv-social-tab','friends'); renderClass(); }}, ic('group'), 'เพื่อน', badgeEl(FR.badge))));
}
function renderClass(){
  const v=$('#classView'); if(!v) return;
  if(FR.tab==='friends'){ renderFriends(); return; }
  if(CL.openId){ renderClassDetail(); return; }
  v.innerHTML='';
  socialTabs(v);
  v.append(el('div',{class:'tiles cltiles'},
    el('button',{class:'tile cljoin',onclick:()=>openJoinClass()}, el('span',{class:'ic'},ic('key')),
      el('span',{class:'tt'}, el('b',{text:'เข้าห้องด้วยรหัส'}), el('small',{text:'นักเรียน · ใช้รหัสจากครู ไม่ต้องมีอีเมล'})), el('span',{class:'arrow'},ic('arrow_forward'))),
    el('button',{class:'tile clnew',onclick:createClassDialog}, el('span',{class:'ic'},ic('add')),
      el('span',{class:'tt'}, el('b',{text:'สร้างห้องเรียน'}), el('small',{text:'ครู · มอบหมายฉากและชุดคำ'})), el('span',{class:'arrow'},ic('arrow_forward')))));
  if(!user) return;
  if(!CL.list){ v.append(el('p',{class:'libempty',text:'กำลังโหลด…'})); loadClasses().then(()=>{ if(S.view==='class' && !CL.openId) renderClass(); }); return; }
  if(CL.err) v.append(el('p',{class:'err',text:CL.err}));
  const sec=(icon, title, arr, mk)=>{ v.append(el('div',{class:'hsec'}, el('h3',{}, ic(icon), title))); const box=el('div',{class:'liblist'}); arr.forEach(c=>box.append(mk(c))); v.append(box); };
  if(CL.list.learning.length) sec('backpack', 'ห้องที่ฉันเรียน', CL.list.learning, c=>el('button',{class:'lrow',onclick:()=>openClass(c.id)},
    el('span',{class:'clic'},ic('backpack')), el('span',{class:'lb'}, el('b',{text:c.name}), el('span',{class:'lm'}, ic('person'), c.nickname||'')), ic('chevron_right','chev')));
  if(CL.list.teaching.length) sec('co_present', 'ห้องที่ฉันสอน', CL.list.teaching, c=>el('button',{class:'lrow',onclick:()=>openClass(c.id)},
    el('span',{class:'clic t'},ic('co_present')), el('span',{class:'lb'}, el('b',{text:c.name}),
      el('span',{class:'lm'}, el('span',{class:'clcode',title:'รหัสห้อง'}, ic('key'), c.code), el('span',{title:'นักเรียน'}, ic('group'), String(c.members)))), ic('chevron_right','chev')));
  if(!CL.list.learning.length && !CL.list.teaching.length) v.append(el('p',{class:'libempty',text:'ยังไม่มีห้องเรียน'}));
}
function openClass(id){ CL.openId=id; CL.detail=null; renderClass(); window.scrollTo(0,0); }
function backToClasses(){ CL.openId=null; CL.detail=null; CL.list=null; renderClass(); }
async function loadClassDetail(){
  const id=CL.openId, r=await classApi('GET','/'+id).catch(()=>({ok:false}));
  if(CL.openId!==id) return;
  if(!r.ok){ CL.detail={ error: r.status===404 ? 'ไม่พบห้องนี้ (อาจถูกลบหรือคุณออกจากห้องแล้ว)' : classErr(r) }; }
  else {
    CL.detail=r.j;
    if(r.j.role==='student'){ const mp=classItemsMap(); mp[id]=r.j.items.map(i=>i.share_id); store.set('pv-class-items',mp);
      const lg=classLangs(); r.j.items.forEach(i=>{ const k=id+'/'+i.share_id; if(i.lang && i.lang!=='en') lg[k]=i.lang; else delete lg[k]; }); store.set('pv-class-langs',lg); }
  }
  if(S.view==='class') renderClassDetail();
}
// assignment language per class/share (English unless the teacher chose another)
function classLangs(){ const v=store.get('pv-class-langs',{}); return v && typeof v==='object' ? v : {}; }
// progress of an assignment on this device (null if not started here), in the assignment's language
function localAssignmentProgress(shareId, lang){
  lang=langOk(lang)?lang:'en';
  const rec=(store.get('pv-imported',{})||{})[shareId]; if(!rec) return null;
  let keys=[];
  if(rec.kind==='deck' || rec.deck){ const d=getDeck(rec.deck); if(!d) return null; keys=d.words; }
  else { const sc=scenes().find(x=>x.id===(rec.scenes||[])[0]); if(!sc) return null; keys=Object.keys(sc.items).map(k=>wkey(sc.id,k)); }
  if(lang!=='en') keys=keys.filter(k=>{ const j=k.indexOf('|'), sc=scenes().find(x=>x.id===k.slice(0,j)), it=sc && sc.items[k.slice(j+1)]; return !!(it && it.l && it.l[lang] && it.l[lang].w); });
  let done=0, star=0;
  for(const k of keys){ const j=k.indexOf('|'), p=progress[k.slice(0,j)], id=pk(k.slice(j+1),lang); if(p && p.done && p.done[id]){ done++; if(p.star && p.star[id]) star++; } }
  return { total:keys.length, done, star };
}
let classReportT=null;
function reportClassProgressSoon(){ clearTimeout(classReportT); classReportT=setTimeout(reportClassProgress, 4000); }
async function reportClassProgress(){
  if(!user || navigator.onLine===false) return;
  const mp=classItemsMap(), sent=store.get('pv-class-sent',{})||{}, rows=[];
  for(const [cid, shares] of Object.entries(mp)) for(const sid of shares||[]){
    const key=cid+'/'+sid, pr=localAssignmentProgress(sid, classLangs()[key]); if(!pr) continue;
    const sig=[pr.total,pr.done,pr.star].join(',');
    if(sent[key]===sig) continue;
    rows.push({ class_id:cid, share_id:sid, ...pr, _k:key, _s:sig });
  }
  if(!rows.length) return;
  const r=await classApi('POST','/progress',{ rows:rows.map(({_k,_s,...x})=>x) }).catch(()=>({ok:false}));
  if(r.ok){ rows.forEach(x=>sent[x._k]=x._s); store.set('pv-class-sent',sent); }
}
function pctBar(done,total){ const b=el('span',{class:'bar'+(total&&done===total?' full':'')},el('i')); b.firstChild.style.width=(total?done/total*100:0)+'%'; return b; }
function renderClassDetail(){
  const v=$('#classView'); v.innerHTML=''; socialTabs(v);
  const d=CL.detail;
  v.append(el('div',{class:'clback'}, el('button',{class:'linkbtn',onclick:backToClasses}, ic('arrow_back'), 'ห้องเรียนทั้งหมด')));
  if(!d){ v.append(el('p',{class:'libempty',text:'กำลังโหลด…'})); loadClassDetail(); return; }
  if(d.error){ v.append(el('p',{class:'libempty',text:d.error})); return; }
  if(d.role==='teacher') renderTeacher(v,d); else renderStudent(v,d);
}
// 🏆 leaderboard (rows: {rank, nickname, done, star, me})
function boardEl(rows){
  const medal=r=>r===1?'🥇':r===2?'🥈':r===3?'🥉':String(r);
  const box=el('div',{class:'board'});
  if(!rows.length) box.append(el('p',{class:'note',text:'ยังไม่มีนักเรียนในห้อง'}));
  rows.forEach(r=>box.append(el('div',{class:'brow'+(r.me?' me':'')+(r.rank<=3&&r.done?' top':'')},
    el('span',{class:'brank',text:r.done?medal(r.rank):'·'}),
    el('span',{class:'bname',text:r.nickname+(r.me?' (ฉัน)':'')}),
    el('span',{class:'bscore'}, el('b',{text:'✓ '+r.done}), r.star?el('small',{text:' ★'+r.star}):null))));
  return box;
}
function boardRows(members, progress, items, me){
  const ids=new Set(items.map(i=>i.share_id)), sum=new Map(members.map(m=>[m.user_id,{nickname:m.nickname,done:0,star:0,me:m.user_id===me}]));
  progress.forEach(p=>{ const r=sum.get(p.user_id); if(r && ids.has(p.share_id)){ r.done+=p.done||0; r.star+=p.star||0; } });
  const rows=[...sum.values()].sort((a,b)=>b.done-a.done||b.star-a.star||a.nickname.localeCompare(b.nickname,'th'));
  let rank=0, prev=null; rows.forEach((r,i)=>{ const k=r.done+'/'+r.star; if(k!==prev){ rank=i+1; prev=k; } r.rank=rank; });
  return rows;
}
function renderStudent(v,d){
  v.append(el('div',{class:'ghead'}, el('h2',{text:'🎒 '+d.name}), el('p',{text:'ชื่อในห้อง: '+d.nickname})));
  const srv=new Map(d.progress.map(p=>[p.share_id,p]));
  if(!d.items.length){ v.append(el('p',{class:'libempty',text:'ครูยังไม่ได้มอบหมายงาน'})); }
  else {
    v.append(el('div',{class:'hsec'}, el('h3',{text:'งานที่ได้รับมอบหมาย'})));
    const box=el('div',{class:'liblist'});
    d.items.forEach(it=>{
      const pr=localAssignmentProgress(it.share_id, it.lang) || srv.get(it.share_id) || { total:it.total, done:0, star:0 };
      const started=!!(store.get('pv-imported',{})||{})[it.share_id];
      box.append(el('div',{class:'lrow clitem'},
        el('span',{class:'clic',text:it.kind==='deck'?'📚':'🖼️'}),
        el('span',{class:'lb'}, el('b',{text:it.name}),
          el('span',{class:'lm'+(pr.total&&pr.done===pr.total?' okc':'')}, `${it.kind==='deck'?'ชุดคำ':'ฉาก'}${assignLang(it)} · ทบทวนแล้ว ${pr.done}/${pr.total||it.total} คำ`+(pr.star?` · ★ ${pr.star}`:'')),
          pctBar(pr.done, pr.total||it.total)),
        el('button',{class:started?'':'primary',text:started?'▶ ทำต่อ':'▶ เริ่ม',onclick:e=>startAssignment(it, e.currentTarget)})));
    });
    v.append(box);
    v.append(el('p',{class:'note small',text:'ฝึกด้วยโหมด ✍️ ทบทวน (พิมพ์) เพื่อให้ครูเห็นความคืบหน้า · ความคืบหน้าจะส่งให้ครูอัตโนมัติ'}));
  }
  if(Array.isArray(d.leaderboard)){
    v.append(el('div',{class:'hsec'}, el('h3',{text:'🏆 อันดับในห้อง'}), el('span',{class:'hint',style:'color:var(--muted);font-size:13px',text:'นับคำที่พิมพ์ตอบถูกในงานที่ครูมอบหมาย'})));
    v.append(boardEl(d.leaderboard));
  }
  v.append(el('div',{class:'clfoot'}, el('button',{class:'linkbtn small danger-link',text:'ออกจากห้องนี้',onclick:async()=>{
    if(!(await ask(`ออกจากห้อง “${d.name}”? ครูจะไม่เห็นความคืบหน้าของคุณอีก (ฉากที่เก็บไว้ยังอยู่)`,'ออกจากห้อง'))) return;
    const r=await classApi('DELETE',`/${d.id}/members/me`).catch(()=>({ok:false}));
    if(!r.ok){ toast(classErr(r)); return; }
    const mp=classItemsMap(); delete mp[d.id]; store.set('pv-class-items',mp); toast('ออกจากห้องแล้ว'); backToClasses();
  }})));
  reportClassProgress();
}
// " · 🇩🇪 เยอรมัน" for an assignment in a language other than English
const assignLang=it=> it && it.lang && it.lang!=='en' && LANGS[it.lang] ? ` · ${LANGS[it.lang].flag} ${LANGS[it.lang].name}` : '';
async function startAssignment(it, btn){
  const lang=langOk(it.lang)?it.lang:'en';
  const done=(store.get('pv-imported',{})||{})[it.share_id];
  if(done && (done.scenes||[]).every(id=>scenes().some(x=>x.id===id)) && (!done.deck || getDeck(done.deck))){ setLang(lang); openImported(done); return; }
  if(btn){ btn.disabled=true; btn.textContent='กำลังโหลด…'; }
  try{
    const r=await fetch('/api/share/'+it.share_id,{cache:'no-store'}).then(x=>x.ok?x.json():null);
    if(!r) throw new Error('share');
    const rec=await importShare(it.share_id, r, (i,k)=>{ if(btn) btn.textContent=`กำลังโหลด ${i}/${k}`; });
    reportClassProgressSoon(); setLang(lang); openImported(rec);
  }catch(e){ if(btn){ btn.disabled=false; btn.textContent='▶ ลองอีกครั้ง'; } toast('โหลดงานไม่สำเร็จ ตรวจอินเทอร์เน็ตแล้วลองใหม่'); }
}
function renderTeacher(v,d){
  const link=location.origin+'/c/'+d.code+HL;
  v.append(el('div',{class:'ghead lh'}, el('div',{}, el('h2',{text:'🧑‍🏫 '+d.name}), el('p',{text:`นักเรียน ${d.members.length} คน · งาน ${d.items.length} รายการ`})),
    el('button',{class:'ghost',text:'🔄',title:'โหลดใหม่',onclick:()=>{ CL.detail=null; renderClassDetail(); }})));
  v.append(el('div',{class:'clinvite'},
    el('div',{}, el('small',{text:'รหัสห้อง'}), el('div',{class:'clcode',text:d.code})),
    el('div',{class:'clinv-r'},
      el('p',{text:'ให้นักเรียนเปิด piccab.com → 🎓 ห้องเรียน → เข้าห้องด้วยรหัส หรือส่งลิงก์เชิญ'}),
      el('div',{class:'row'}, el('button',{class:'primary',text:'📋 คัดลอกลิงก์เชิญ',onclick:()=>copyLink(link)}), el('button',{text:'📲 ส่งต่อ…',onclick:()=>shareLinkNative(link,'เข้าห้องเรียน '+d.name)})))));
  // leaderboard switch + preview
  const lbBtn=el('button',{class:'toggle'+(d.leaderboard?' on':''),text:d.leaderboard?'🏆 ตารางอันดับ: เปิด':'🏆 ตารางอันดับ: ปิด',onclick:async()=>{
    lbBtn.disabled=true;
    const r=await classApi('PATCH','/'+d.id,{ leaderboard:!d.leaderboard }).catch(()=>({ok:false}));
    if(!r.ok){ lbBtn.disabled=false; toast(r.j && r.j.error==='needs_update' ? 'ต้องรัน SQL 2026-11-leaderboard.sql ใน Supabase ก่อน' : classErr(r), 4500); return; }
    toast(!d.leaderboard?'เปิดตารางอันดับแล้ว นักเรียนจะเห็นอันดับในห้อง':'ปิดตารางอันดับแล้ว'); CL.detail=null; renderClassDetail(); }});
  v.append(el('div',{class:'cllb'}, lbBtn, el('span',{class:'note small',text: d.leaderboard ? 'นักเรียนเห็นชื่อเล่นและจำนวนคำของเพื่อนในห้องนี้' : 'เปิดเพื่อให้นักเรียนเห็นอันดับของเพื่อนในห้อง (เฉพาะชื่อเล่นและจำนวนคำ)'})));
  if(d.leaderboard && d.members.length) v.append(boardEl(boardRows(d.members, d.progress, d.items, null)));
  // assignments
  v.append(el('div',{class:'hsec'}, el('h3',{text:'งานที่มอบหมาย'}), el('button',{class:'linkbtn',text:'➕ มอบหมายฉากหรือชุดคำ',onclick:()=>openAssignPicker(d)})));
  if(!d.items.length) v.append(el('p',{class:'libempty',text:'ยังไม่มีงาน — กด “มอบหมายฉากหรือชุดคำ” เลือกจากคลังของคุณ'}));
  // progress table
  if(d.items.length){
    const wrap=el('div',{class:'cltablewrap'}), tb=el('table',{class:'cltable'});
    const head=el('tr',{}, el('th',{text:'นักเรียน'}));
    d.items.forEach(it=>head.append(el('th',{}, el('span',{text:(it.kind==='deck'?'📚 ':'🖼️ ')+it.name}), el('small',{text:(it.lang&&it.lang!=='en'&&LANGS[it.lang]?LANGS[it.lang].flag+' ':'')+it.total+' คำ'}),
      el('button',{class:'x',title:'เลิกมอบหมายงานนี้','aria-label':'เลิกมอบหมาย '+it.name,text:'✕',onclick:async()=>{
        if(!(await ask(`เลิกมอบหมาย “${it.name}”? ความคืบหน้าของงานนี้จะถูกลบ`,'เลิกมอบหมาย'))) return;
        const r=await classApi('DELETE',`/${d.id}/items/${it.share_id}`); if(!r.ok) toast(classErr(r)); CL.detail=null; renderClassDetail(); }}))));
    head.append(el('th',{}));
    tb.append(head);
    const pr=new Map(d.progress.map(p=>[p.user_id+'/'+p.share_id,p]));
    if(!d.members.length) tb.append(el('tr',{}, el('td',{colspan:String(d.items.length+2),class:'muted',text:'ยังไม่มีนักเรียนเข้าห้อง — ส่งรหัสหรือลิงก์เชิญให้นักเรียน'})));
    d.members.forEach(mb=>{
      const tr=el('tr',{}, el('td',{class:'nick',text:mb.nickname}));
      d.items.forEach(it=>{
        const p=pr.get(mb.user_id+'/'+it.share_id);
        if(!p){ tr.append(el('td',{class:'muted',text:'—'})); return; }
        const pct=p.total?Math.round(p.done/p.total*100):0;
        tr.append(el('td',{class:'cell'+(pct===100?' full':pct>=50?' half':''),title:'อัปเดต '+new Date(p.updated_at).toLocaleString(LOC)},
          el('b',{text:`${p.done}/${p.total}`}), p.star?el('small',{text:` ★${p.star}`}):null));
      });
      tr.append(el('td',{}, el('button',{class:'x',title:'นำออกจากห้อง','aria-label':'นำ '+mb.nickname+' ออกจากห้อง',text:'✕',onclick:async()=>{
        if(!(await ask(`นำ “${mb.nickname}” ออกจากห้อง?`,'นำออก'))) return;
        const r=await classApi('DELETE',`/${d.id}/members/${mb.user_id}`); if(!r.ok) toast(classErr(r)); CL.detail=null; renderClassDetail(); }})));
      tb.append(tr);
    });
    wrap.append(tb); v.append(wrap);
    v.append(el('p',{class:'note small',text:'ตัวเลข = คำที่นักเรียนพิมพ์ตอบถูกแล้ว / คำทั้งหมด · ★ = ตอบถูกเองโดยไม่ใช้ตัวช่วย · อัปเดตเมื่อนักเรียนเปิดแอปและออนไลน์'}));
    if(d.members.length) v.append(el('div',{class:'clexport'},
      el('span',{class:'lbl',text:'⬇️ ส่งออกความคืบหน้า'}),
      el('button',{class:'primary',text:'📊 Excel (.xlsx)',onclick:()=>{ try{ exportClassXlsx(d); toast('ดาวน์โหลดไฟล์ Excel แล้ว'); }catch(e){ console.warn(e); toast('ส่งออกไม่สำเร็จ ลองใหม่อีกครั้ง'); } }}),
      el('button',{text:'📄 CSV',onclick:()=>{ try{ exportClassCsv(d); toast('ดาวน์โหลดไฟล์ CSV แล้ว'); }catch(e){ console.warn(e); toast('ส่งออกไม่สำเร็จ ลองใหม่อีกครั้ง'); } }}),
      el('span',{class:'note small',text:'ใช้กับ Excel, Google Sheets หรือ Numbers ได้ · กด 🔄 ก่อนเพื่อให้ได้ข้อมูลล่าสุด'})));
  } else if(d.members.length){
    v.append(el('p',{class:'note',text:'นักเรียนในห้อง: '+d.members.map(m=>m.nickname).join(', ')}));
  }
  v.append(el('div',{class:'clfoot'},
    el('button',{class:'linkbtn small',text:'✏️ เปลี่ยนชื่อห้อง',onclick:()=>deckNameDialog('เปลี่ยนชื่อห้องเรียน', d.name, 'บันทึก', async nm=>{ const r=await classApi('PATCH','/'+d.id,{name:nm}); if(!r.ok) toast(classErr(r)); CL.detail=null; renderClassDetail(); }, 'ชื่อห้องเรียน', 60)}),
    el('button',{class:'linkbtn small danger-link',text:'🗑 ลบห้องเรียน',onclick:async()=>{
      if(!(await ask(`ลบห้อง “${d.name}”? นักเรียนจะออกจากห้องทั้งหมด และความคืบหน้าในห้องนี้จะถูกลบ`,'ลบห้องเรียน'))) return;
      const r=await classApi('DELETE','/'+d.id); if(!r.ok){ toast(classErr(r)); return; } toast('ลบห้องเรียนแล้ว'); backToClasses(); }})));
}
// ---------- teacher: export progress (Excel .xlsx built here, or CSV) ----------
// Rows: one per student; per assignment the words passed and ★; then totals. A second sheet has one row per
// student × assignment (easy to filter or pivot), a third explains the columns.
function classExportData(d){
  const pr=new Map(d.progress.map(p=>[p.user_id+'/'+p.share_id,p]));
  const students=d.members.slice().sort((a,b)=>a.nickname.localeCompare(b.nickname,'th'));
  const items=d.items.map(it=>({...it, title:tx(it.kind==='deck'?'ชุดคำ: ':'ฉาก: ')+it.name+(it.lang&&it.lang!=='en'&&LANGS[it.lang]?` (${tx(LANGS[it.lang].name)})`:'')}));
  const rows=students.map((mb,i)=>{
    let done=0, star=0, total=0, last=0; const cells=[], long=[];
    items.forEach(it=>{
      const p=pr.get(mb.user_id+'/'+it.share_id), t=(p&&p.total)||it.total||0, dn=p?Math.min(p.done||0,t||p.done||0):0, st=p?(p.star||0):0;
      const at=p && p.updated_at ? Date.parse(p.updated_at) : 0; if(at>last) last=at;
      done+=dn; star+=st; total+=t; cells.push(dn, st);
      long.push([mb.nickname, it.title, t, dn, st, t?dn/t:0, tx(!p?'ยังไม่เริ่ม':(t&&dn>=t)?'ครบแล้ว':'กำลังทำ'), at?new Date(at):null]);
    });
    return { no:i+1, nick:mb.nickname, joined:mb.joined_at?new Date(mb.joined_at):null, cells, done, star, total, pct:total?done/total:0, last:last?new Date(last):null, long };
  });
  const head=['ลำดับ','ชื่อเล่น','เข้าห้องเมื่อ'].map(tx);
  items.forEach(it=>head.push(UI==='en' ? `${it.title} — passed (of ${it.total} words)` : `${it.title} — ผ่าน (จาก ${it.total} คำ)`, `${it.title} — ★`));
  head.push(...['ผ่านรวม (คำ)','★ รวม','คำทั้งหมด','ผ่าน (%)','อัปเดตล่าสุด'].map(tx));
  return { items, rows, head,
    longHead:['ชื่อเล่น','งาน','คำทั้งหมด','ผ่าน (คำ)','★','ผ่าน (%)','สถานะ','อัปเดตล่าสุด'].map(tx) };
}
const exportName=(d,ext)=>{ const t=new Date(), z=n=>String(n).padStart(2,'0');
  return `Piccab-${String(d.name).replace(/[\\/:*?"<>|\s]+/g,'-').replace(/^-+|-+$/g,'').slice(0,40)||'class'}-${t.getFullYear()}-${z(t.getMonth()+1)}-${z(t.getDate())}.${ext}`; };
function downloadBlob(blob, name){
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; document.body.appendChild(a); a.click();
  setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 4000);
}
const fmtDate=dt=>dt?dt.getFullYear()+'-'+String(dt.getMonth()+1).padStart(2,'0')+'-'+String(dt.getDate()).padStart(2,'0')+' '+String(dt.getHours()).padStart(2,'0')+':'+String(dt.getMinutes()).padStart(2,'0'):'';
function exportClassCsv(d){
  const X=classExportData(d);
  // nicknames are typed by students: never let a cell start like a formula
  const cell=v=>{ if(v==null) return ''; if(typeof v==='number') return String(Math.round(v*100)/100);
    let t=String(v); if(/^[=+\-@\t\r]/.test(t)) t="'"+t; return /[",\n\r]/.test(t)?'"'+t.replace(/"/g,'""')+'"':t; };
  const lines=[X.head.map(cell).join(',')];
  X.rows.forEach(r=>lines.push([r.no, r.nick, fmtDate(r.joined), ...r.cells, r.done, r.star, r.total, Math.round(r.pct*100), fmtDate(r.last)].map(cell).join(',')));
  downloadBlob(new Blob(['﻿'+lines.join('\r\n')+'\r\n'],{type:'text/csv;charset=utf-8'}), exportName(d,'csv'));   // BOM: Excel reads Thai correctly
}
// --- minimal .xlsx writer: inline strings, 3 styles, stored (uncompressed) zip ---
const CRC_T=(()=>{ const t=new Uint32Array(256); for(let n=0;n<256;n++){ let c=n; for(let k=0;k<8;k++) c=c&1?0xEDB88320^(c>>>1):c>>>1; t[n]=c>>>0; } return t; })();
function crc32(b){ let c=0xFFFFFFFF; for(let i=0;i<b.length;i++) c=CRC_T[(c^b[i])&255]^(c>>>8); return (c^0xFFFFFFFF)>>>0; }
function zipStore(files){
  const enc=new TextEncoder(), parts=[], central=[]; let off=0;
  const now=new Date(), dt=((now.getHours()<<11)|(now.getMinutes()<<5)|(now.getSeconds()>>1)), dd=(((now.getFullYear()-1980)<<9)|((now.getMonth()+1)<<5)|now.getDate());
  for(const f of files){
    const name=enc.encode(f.name), data=typeof f.data==='string'?enc.encode(f.data):f.data, crc=crc32(data);
    const h=new DataView(new ArrayBuffer(30)); h.setUint32(0,0x04034b50,true); h.setUint16(4,20,true); h.setUint16(6,0x0800,true); h.setUint16(8,0,true);
    h.setUint16(10,dt,true); h.setUint16(12,dd,true); h.setUint32(14,crc,true); h.setUint32(18,data.length,true); h.setUint32(22,data.length,true); h.setUint16(26,name.length,true); h.setUint16(28,0,true);
    parts.push(h.buffer,name,data);
    const c=new DataView(new ArrayBuffer(46)); c.setUint32(0,0x02014b50,true); c.setUint16(4,20,true); c.setUint16(6,20,true); c.setUint16(8,0x0800,true); c.setUint16(10,0,true);
    c.setUint16(12,dt,true); c.setUint16(14,dd,true); c.setUint32(16,crc,true); c.setUint32(20,data.length,true); c.setUint32(24,data.length,true); c.setUint16(28,name.length,true);
    c.setUint32(42,off,true); central.push(c.buffer,name);
    off+=30+name.length+data.length;
  }
  const csize=central.reduce((a,b)=>a+(b.byteLength!=null?b.byteLength:b.length),0);
  const e=new DataView(new ArrayBuffer(22)); e.setUint32(0,0x06054b50,true); e.setUint16(8,files.length,true); e.setUint16(10,files.length,true); e.setUint32(12,csize,true); e.setUint32(16,off,true);
  return new Blob([...parts,...central,e.buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}
const xesc=t=>String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'');
function xlCol(n){ let s=''; n++; while(n){ const m=(n-1)%26; s=String.fromCharCode(65+m)+s; n=Math.floor((n-1)/26); } return s; }
const xlSerial=dt=>(dt.getTime()-dt.getTimezoneOffset()*60000)/86400000+25569;       // Excel date number (local time)
// rows: arrays of values; kinds per column: 's' text, 'n' number, 'p' percent, 'd' date
function xlSheet(head, rows, kinds, widths){
  const out=['<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:'+xlCol(head.length-1)+(rows.length+1)+'"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>'];
  widths.forEach((w,i)=>out.push(`<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`));
  out.push('</cols><sheetData>');
  const row=(r,vals,hdr)=>{ out.push(`<row r="${r}">`); vals.forEach((v,i)=>{ const ref=xlCol(i)+r, k=hdr?'s':kinds[i];
    if(v==null||v==='') return;
    if(k==='s') out.push(`<c r="${ref}" t="inlineStr"${hdr?' s="1"':''}><is><t xml:space="preserve">${xesc(v)}</t></is></c>`);
    else if(k==='p') out.push(`<c r="${ref}" s="2"><v>${+v}</v></c>`);
    else if(k==='d') out.push(`<c r="${ref}" s="3"><v>${xlSerial(v)}</v></c>`);
    else out.push(`<c r="${ref}"><v>${+v}</v></c>`); }); out.push('</row>'); };
  row(1,head,true); rows.forEach((v,i)=>row(i+2,v,false));
  out.push(`</sheetData><autoFilter ref="A1:${xlCol(head.length-1)}${Math.max(1,rows.length+1)}"/></worksheet>`);
  return out.join('');
}
function exportClassXlsx(d){
  const X=classExportData(d), n=X.items.length;
  const kinds=['n','s','d', ...Array(n*2).fill('n'), 'n','n','n','p','d'];
  const widths=[7,18,17, ...X.items.flatMap(()=>[16,8]), 13,9,11,10,17];
  const sum=xlSheet(X.head, X.rows.map(r=>[r.no, r.nick, r.joined, ...r.cells, r.done, r.star, r.total, r.pct, r.last]), kinds, widths);
  const long=xlSheet(X.longHead, X.rows.flatMap(r=>r.long), ['s','s','n','n','n','p','s','d'], [18,34,11,10,7,10,12,17]);
  const info=xlSheet(['หัวข้อ','รายละเอียด'].map(tx), [
    [UI==='en'?'Class':'ห้องเรียน', d.name], [tx('รหัสห้อง'), d.code], ...[['นักเรียน', d.members.length+' คน'], ['งานที่มอบหมาย', n+' รายการ'], ['ส่งออกเมื่อ', fmtDate(new Date())],
    ['ผ่าน', 'จำนวนคำที่นักเรียนพิมพ์ตอบถูกแล้ว (ในโหมดทบทวน)'], ['★', 'คำที่ตอบถูกเองโดยไม่ใช้คำใบ้ ฟังเสียง หรือดูเฉลย'],
    ['ผ่าน (%)', 'ผ่านรวม ÷ คำทั้งหมดของทุกงาน'], ['อัปเดตล่าสุด', 'ครั้งล่าสุดที่แอปของนักเรียนส่งความคืบหน้า (เมื่อเปิดแอปและออนไลน์)'],
    ['หมายเหตุ', 'ข้อมูลนี้มีชื่อเล่นของนักเรียน โปรดเก็บรักษาตามนโยบายของโรงเรียน']].map(r=>r.map(tx))], ['s','s'], [16,70]);
  const sheets=[[tx('สรุปรายคน'),sum],[tx('รายงาน-รายคน'),long],[tx('คำอธิบาย'),info]];
  const files=[
    {name:'[Content_Types].xml', data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'+sheets.map((s,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')+'</Types>'},
    {name:'_rels/.rels', data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'},
    {name:'xl/workbook.xml', data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'+sheets.map((s,i)=>`<sheet name="${xesc(s[0])}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')+`</sheets><definedNames>${[0,1].map(i=>`<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${xesc(sheets[i][0])}'!$A$1:$${xlCol((i?X.longHead:X.head).length-1)}$${Math.max(1,(i?X.rows.reduce((a,r)=>a+r.long.length,0):X.rows.length)+1)}</definedName>`).join('')}</definedNames></workbook>`},
    {name:'xl/_rels/workbook.xml.rels', data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+sheets.map((s,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')+`<Relationship Id="rId${sheets.length+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`},
    {name:'xl/styles.xml', data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy-mm-dd hh:mm"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Tahoma"/><family val="2"/></font><font><b/><sz val="11"/><name val="Tahoma"/><family val="2"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEFEAF7"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="9" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'},
    ...sheets.map((s,i)=>({name:`xl/worksheets/sheet${i+1}.xml`, data:s[1]})),
  ];
  downloadBlob(zipStore(files), exportName(d,'xlsx'));
}
// teacher: choose a scene or deck → (make / refresh its share link) → assign
function openAssignPicker(d){
  const mine=G.customs.filter(sc=>Object.keys(sc.items).length);
  const live=liveKeys(), dks=deckList().filter(x=>!x.virtual && deckCount(x,live));
  let alang=S.lang;   // the language students will practise it in
  // scenes behind a scene / word set, and how many of its words have the language
  const scenesOf=t=>t.kind==='scene' ? [t.sc] : [...new Set(t.deck.words.filter(k=>live.has(k)).map(k=>k.slice(0,k.indexOf('|'))))].map(id=>scenes().find(x=>x.id===id)).filter(Boolean);
  const wordsIn=(t,lang)=>{
    const keys=t.kind==='scene' ? Object.keys(t.sc.items).map(k=>wkey(t.sc.id,k)) : t.deck.words.filter(k=>live.has(k));
    if(lang==='en') return [keys.length, keys.length];
    const have=keys.filter(k=>{ const j=k.indexOf('|'), sc=scenes().find(x=>x.id===k.slice(0,j)), it=sc&&sc.items[k.slice(j+1)]; return !!(it && it.l && it.l[lang] && it.l[lang].w); });
    return [have.length, keys.length];
  };
  openModal(m=>{
    m.classList.add('dkbox');
    m.append(el('h3',{text:'มอบหมายงานให้ห้อง “'+d.name+'”'}), el('p',{class:'note',text:'เลือกฉากหรือชุดคำ ระบบจะสร้างลิงก์ (สำเนา ณ ตอนนี้) ให้นักเรียน'}));
    const langSeg=el('div',{class:'aslang'}), segIn=el('div',{class:'seg',role:'group','aria-label':'ภาษาที่ให้นักเรียนฝึก'});
    const list=el('div',{class:'dk-list tall'});
    const targets=[{kind:'scene',sc:BUILTIN[0],icon:'🖼️',meta:'ฉากตัวอย่าง · '}].concat(mine.map(sc=>({kind:'scene',sc,icon:'🖼️',meta:'ฉาก · '})), dks.map(dk=>({kind:'deck',deck:dk,icon:'📚',meta:'ชุดคำ · '})));
    const draw=()=>{
      langSeg.innerHTML=''; segIn.innerHTML=''; langSeg.append(el('span',{class:'lbl',text:'นักเรียนฝึกเป็นภาษา'}), segIn);
      Object.entries(LANGS).forEach(([k,L])=>segIn.append(el('button',{type:'button',class:k===alang?'on':'',text:L.flag+' '+L.name,onclick:()=>{ alang=k; draw(); }})));
      list.innerHTML='';
      targets.forEach(t=>{
        const [n,all]=wordsIn(t,alang), name=t.kind==='scene'?t.sc.name:deckName(t.deck);
        // separate pieces of text, so each one translates on its own
        const meta=el('small',{}, t.meta, n===all ? `${all} คำ` : `มีคำภาษา${LANGS[alang].name} ${n}/${all} คำ`, n===all ? '' : ' · ที่เหลือจะแปลให้ตอนมอบหมาย');
        list.append(el('button',{class:'dk-row asrow',onclick:e=>assign(t,e.currentTarget)}, el('span',{class:'dk-name'}, el('b',{text:t.icon+' '+name}), meta), el('span',{class:'dk-n',text:'มอบหมาย ›'})));
      });
    };
    const err=el('p',{class:'err'});
    if(Object.keys(LANGS).length>1) m.append(langSeg);
    m.append(list, err, el('div',{class:'row'}, el('span',{class:'sp'}), el('button',{text:'ปิด',onclick:closeModal})));
    draw();
    const assign=async(t,btn)=>{
      const lang=alang, all=m.querySelectorAll('.dk-list button, .aslang button'), lab=btn.querySelector('.dk-n');
      all.forEach(b=>b.disabled=true); lab.textContent='กำลังสร้าง…'; err.textContent='';
      const fail=msg=>{ err.textContent=msg; all.forEach(b=>b.disabled=false); lab.textContent='มอบหมาย ›'; };
      if(lang!=='en'){
        // students can't use AI: the words must be in the link already
        const need=scenesOf(t).filter(sc=>!sc.builtin && missingIn(sc,lang).length);
        if(need.length && autoLangState(need[0])==='ok'){ lab.textContent=`กำลังเตรียมคำภาษา${LANGS[lang].name}…`; for(const sc of need) await autoTranslate(sc,lang); }
        if(!wordsIn(t,lang)[0]) return fail(`ยังไม่มีคำภาษา${LANGS[lang].name}ในงานนี้ — เปิดฉากในโหมดภาษา${LANGS[lang].name}แล้วใส่คำก่อน`);
        lab.textContent='กำลังสร้าง…';
      }
      const key=shareKey(t), body=sharePayload(t), cur=myShares[key]; if(cur) body.id=cur.id;
      if(!(await picturesUploaded(body))) return fail(shareErr(0,{error:'picture_missing'}));
      const r=await shareApi('POST','/api/share',body).catch(()=>({ok:false,status:0,j:{}}));
      if(!r.ok) return fail(shareErr(r.status,r.j));
      myShares[key]={ id:r.j.id, at:Date.now() }; store.set('pv-shares',myShares);
      const a=await classApi('POST',`/${d.id}/items`,{ share_id:r.j.id, ...(lang!=='en'?{lang}:{}) });
      if(!a.ok) return fail(classErr(a));
      closeModal(); toast('มอบหมายงานแล้ว ✓'); CL.detail=null; renderClassDetail();
    };
  });
}
function openJoinClass(code){
  openModal(m=>{
    const ci=el('input',{class:'code clcodein',maxlength:'7',placeholder:'รหัส 6 ตัว',autocomplete:'off',autocapitalize:'characters',spellcheck:'false',value:code||'','aria-label':'รหัสห้องเรียน'});
    const ni=el('input',{maxlength:'30',placeholder:'ชื่อเล่น เช่น มิ้นท์ ป.4/2',autocomplete:'nickname','aria-label':'ชื่อเล่น',value:isStudent()?studentNick():''});
    const err=el('p',{class:'err'}), go=el('button',{class:'primary',text:'เข้าห้อง'});
    const tsbox=el('div',{class:'tsbox'}); let hc=null;
    G.modalClose=()=>{ if(hc) hc.remove(); };
    ci.addEventListener('input',()=>{ ci.value=ci.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6); });
    const submit=async()=>{
      const c=ci.value.trim(), nick=ni.value.trim();
      if(c.length!==6){ err.textContent='ใส่รหัสห้อง 6 ตัวจากครู'; ci.focus(); return; }
      if(!nick){ err.textContent='ใส่ชื่อเล่นที่ครูจะเห็น'; ni.focus(); return; }
      go.disabled=true; go.textContent='กำลังเข้าห้อง…'; err.textContent='';
      if(!user){
        let captchaToken;
        try{ captchaToken= hc ? await hc.token() : undefined; }catch(e){ go.disabled=false; go.textContent='เข้าห้อง'; err.textContent=capErr(e); return; }
        const { error } = await sb.auth.signInAnonymously({ options:{ data:{ nickname:nick }, captchaToken } });
        if(error){ go.disabled=false; go.textContent='เข้าห้อง';
          err.textContent=/anonymous.*(disabled|not enabled)|provider.*disabled/i.test(error.message||'') ? 'ยังเปิดให้นักเรียนเข้าห้องแบบไม่ใช้อีเมลไม่ได้ ลองเข้าสู่ระบบด้วยอีเมลแทน' : authErr(error); return; }
        for(let i=0;i<30 && !user;i++) await new Promise(r=>setTimeout(r,100));
      }
      const r=await classApi('POST','/join',{ code:c, nickname:nick }).catch(()=>({ok:false}));
      if(!r.ok){ go.disabled=false; go.textContent='เข้าห้อง'; err.textContent=classErr(r); return; }
      closeModal(); toast('เข้าห้อง “'+r.j.name+'” แล้ว 🎉', 3500); tally('class_join');
      CL.list=null; if(S.view!=='class') goHome('class'); openClass(r.j.id);
    };
    go.addEventListener('click',submit);
    [ci,ni].forEach(x=>x.addEventListener('keydown',e=>{ if(e.key==='Enter') submit(); }));
    m.append(el('h3',{text:'🔑 เข้าห้องเรียน'}),
      el('label',{},'รหัสห้องจากครู', ci), el('label',{},'ชื่อเล่น (ครูจะเห็นชื่อนี้)', ni), tsbox, err,
      el('div',{class:'row'}, el('span',{class:'sp'}), el('button',{text:'ยกเลิก',onclick:closeModal}), go),
      el('p',{class:'note small'}, user ? (isStudent() ? 'เข้าด้วยบัญชีนักเรียนในเครื่องนี้' : 'เข้าด้วยบัญชี '+(user.email||'')) : 'ไม่ต้องมีอีเมล — ระบบจะสร้างบัญชีนักเรียนในเครื่องนี้ให้ · ใช้ชื่อเล่น ไม่ต้องใส่ชื่อจริงหรือนามสกุล',
        ' · ', el('a',{href:'/privacy#class',target:'_blank',text:'ความเป็นส่วนตัว'})));
    if(!user) hc=humanCheck(tsbox);       // only a new student account needs the check
  });
}
function createClassDialog(){
  if(!user || isStudent()){ openModal(m=>m.append(el('h3',{text:'➕ สร้างห้องเรียน'}),
    el('p',{text: isStudent() ? 'บัญชีนักเรียนสร้างห้องเรียนไม่ได้ ครูต้องเข้าสู่ระบบด้วยอีเมลหรือ Google ในเครื่องของครู' : 'ครูต้องเข้าสู่ระบบด้วยอีเมลหรือ Google ก่อน เพื่อเก็บห้องเรียนไว้ในบัญชี'}),
    el('div',{class:'row'}, el('span',{class:'sp'}), el('button',{text:'ปิด',onclick:closeModal}), isStudent()?null:el('button',{class:'primary',text:'👤 เข้าสู่ระบบ',onclick:()=>openLogin()})))); return; }
  deckNameDialog('สร้างห้องเรียน', '', 'สร้าง', async name=>{
    const r=await classApi('POST','',{ name }).catch(()=>({ok:false}));
    if(!r.ok){ toast(classErr(r), 4000); return; }
    toast('สร้างห้อง “'+name+'” แล้ว — รหัส '+r.j.code, 4000); CL.list=null; openClass(r.j.id);
  }, 'เช่น ป.4/2 ภาษาอังกฤษ', 60);
}
function openStudentAccount(){
  openModal(m=>m.append(el('h3',{text:'🎓 บัญชีนักเรียน'}),
    el('p',{}, 'ชื่อเล่น: ', el('b',{text:studentNick()})),
    el('p',{class:'note warn',text:'บัญชีนี้ไม่มีอีเมล ข้อมูลอยู่ในเบราว์เซอร์นี้เท่านั้น ถ้าออกจากระบบ ล้างข้อมูลเบราว์เซอร์ หรือเปลี่ยนเครื่อง จะกลับมาใช้บัญชีนี้ไม่ได้'}),
    el('p',{class:'note',id:'syncNote',text:syncText()}),
    el('div',{class:'row'}, el('button',{text:'🎓 ห้องเรียนของฉัน',onclick:()=>{ closeModal(); goHome('class'); }}), el('span',{class:'sp'}), el('button',{class:'primary',text:'ปิด',onclick:closeModal})),
    el('div',{class:'acctlinks'},
      el('button',{class:'linkbtn small',text:'ออกจากระบบ',onclick:async()=>{
        if(!(await ask('ออกจากบัญชีนักเรียน? จะกลับมาใช้บัญชีนี้ไม่ได้อีก ความคืบหน้าในห้องเรียนจะหายจากเครื่องนี้','ออกจากระบบ'))) return;
        await sb.auth.signOut(); toast('ออกจากระบบแล้ว'); }}), ' · ',
      el('a',{href:'/privacy',target:'_blank',text:'นโยบายความเป็นส่วนตัว'}), ' · ',
      el('button',{class:'linkbtn small danger-link',text:'ลบบัญชีและข้อมูล',onclick:openDeleteAccount}))));
}
const classLinkCode=((/^\/c\/([A-Za-z2-9]{6})\/?$/.exec(location.pathname)||[])[1]||'').toUpperCase()||null;

export { CL, classLinkCode, isStudent, openJoinClass, openStudentAccount, renderClass, reportClassProgress, reportClassProgressSoon, socialTabs, studentNick };
