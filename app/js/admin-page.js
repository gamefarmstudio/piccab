// Piccab — the admin page (/admin): reports, feedback, picture library, usage, errors, AI usage.
// Loaded with import() only when an admin opens it (see renderAdmin in admin.js), so other people never download it.
import { $, cleanLang, el, S, scenes, store, toast } from './core.js';
import { ask, closeModal, openModal, openScene } from './scene.js';
import { deckNameDialog } from './decks.js';
import { loadImageFile } from './editor.js';
import { user } from './account.js';
import { ago2, CHEER_TEXT } from './friends.js';
import { ADM, adminApi } from './admin.js';
import { catName, GAL, GAL_LV, galCopy, galEdits, galImg, galPushEdit } from './gallery.js';
import { accessToken } from './sync.js';

async function loadAdmin(){ const r=await adminApi('GET','/reports'+(ADM.all?'?all=1':'')).catch(()=>({ok:false})); ADM.data = r.ok ? r.j : { error: r.status===404 ? 'หน้านี้สำหรับผู้ดูแลระบบเท่านั้น' : 'โหลดไม่สำเร็จ' }; }
function renderAdmin(){
  const v=$('#adminView'); v.innerHTML='';
  v.append(el('div',{class:'ghead lh'}, el('div',{}, el('h2',{text:'🛡️ ดูแลระบบ'}), el('p',{text:'รายงานจากผู้ใช้ · ระงับบัญชี · ลบลิงก์แชร์'})),
    el('button',{class:'ghost',text:'🔄',title:'โหลดใหม่',onclick:()=>{ ADM.data=ADM.ai=ADM.fb=ADM.errs=ADM.stats=ADM.gal=null; renderAdmin(); }})));
  if(!user || !ADM.ok){ v.append(el('p',{class:'libempty',text: user ? 'หน้านี้สำหรับผู้ดูแลระบบเท่านั้น' : 'เข้าสู่ระบบด้วยบัญชีผู้ดูแลก่อน'})); return; }
  const tabs=[['reports','🚩 รายงาน'],['feedback','💬 ความเห็น'],['gallery','🖼️ คลังภาพ'],['stats','📊 การใช้งาน'],['errors','🐞 ข้อผิดพลาด'],['ai','✨ การใช้ AI'],['compare','🧪 เทียบ AI']];
  v.append(el('div',{class:'seg admtabs'}, ...tabs.map(([k,t])=>el('button',{class:ADM.tab===k?'on':'',text:t,onclick:()=>{ ADM.tab=k; if(k==='ai') ADM.ai=null; renderAdmin(); }}))));
  if(ADM.tab==='ai'){ renderAiUsage(v); return; }
  if(ADM.tab==='compare'){ renderCompare(v); return; }
  if(ADM.tab==='feedback'){ renderFeedbackAdmin(v); return; }
  if(ADM.tab==='stats'){ renderStatsAdmin(v); return; }
  if(ADM.tab==='errors'){ renderErrorsAdmin(v); return; }
  if(ADM.tab==='gallery'){ renderGalleryAdmin(v); return; }
  v.append(el('div',{class:'seg'},
    el('button',{class:ADM.all?'':'on',text:'ยังไม่จัดการ',onclick:()=>{ ADM.all=false; ADM.data=null; renderAdmin(); }}),
    el('button',{class:ADM.all?'on':'',text:'ทั้งหมด',onclick:()=>{ ADM.all=true; ADM.data=null; renderAdmin(); }})));
  if(!ADM.data){ v.append(el('p',{class:'libempty',text:'กำลังโหลด…'})); loadAdmin().then(()=>{ if(S.view==='admin') renderAdmin(); }); return; }
  if(ADM.data.error){ v.append(el('p',{class:'err',text:ADM.data.error})); return; }
  const reps=ADM.data.reports;
  if(!reps.length){ v.append(el('p',{class:'libempty',text: ADM.all ? 'ยังไม่มีรายงาน' : '🎉 ไม่มีรายงานที่ต้องจัดการ'})); return; }
  const who=p=>p ? (p.nickname || '(ไม่มีชื่อเล่น)')+(p.code?` · รหัส ${p.code}`:'')+((p.student||p.anon)?' · บัญชีนักเรียน':'')+(p.email?` · ${p.email}`:'')+(p.gone?' · (ลบบัญชีแล้ว)':'')+` · id ${String(p.id).slice(0,8)}` : 'ไม่ได้เข้าสู่ระบบ';
  reps.forEach(r=>{
    const rd=r.reported;
    const card=el('div',{class:'admcard'+(r.resolved_at?' done':'')},
      el('div',{class:'admtop'}, el('span',{class:'pill',text:r.share_id?'🔗 ลิงก์แชร์':'👫 เพื่อน'}), el('span',{class:'note small',text:ago2(r.created_at)}),
        r.resolved_at ? el('span',{class:'pill ok',text:'✓ ปิดเรื่องแล้ว'}) : null, rd && rd.banned ? el('span',{class:'pill bad',text:'🚫 ระงับแล้ว'}) : null),
      el('p',{}, el('b',{text:'ผู้ถูกรายงาน: '}), who(rd), rd ? el('span',{class:'note small',text:` (ถูกรายงานทั้งหมด ${rd.reports} ครั้ง)`}) : null),
      el('p',{}, el('b',{text:'ผู้รายงาน: '}), who(r.reporter)),
      el('p',{}, el('b',{text:'เหตุผล: '}), r.reason||'-'),
      r.note ? el('p',{class:'note small',text:'บันทึก: '+r.note}) : null);
    if(r.share_id) card.append(el('p',{}, el('a',{href:'/s/'+r.share_id,target:'_blank',rel:'noopener',text:'เปิดลิงก์ที่ถูกรายงาน ↗'}), ' · ',
      el('button',{class:'linkbtn small danger-link',text:'🗑 ลบลิงก์นี้',onclick:()=>adminDeleteShare(r.share_id)})));
    const ev=el('div',{class:'admev'});
    const acts=el('div',{class:'row'},
      el('button',{text:'🔍 ดูหลักฐาน',onclick:async e=>{ const b=e.currentTarget; b.disabled=true; await adminEvidence(r, ev); b.disabled=false; }}),
      rd ? el('button',{class:rd.banned?'':'danger',text:rd.banned?'ยกเลิกระงับ':'🚫 ระงับบัญชี',onclick:()=>adminSuspend(rd, !rd.banned)}) : null,
      el('span',{class:'sp'}),
      el('button',{class:r.resolved_at?'':'primary',text:r.resolved_at?'เปิดเรื่องใหม่':'✓ ปิดเรื่อง',onclick:()=>adminResolve(r)}));
    card.append(ev, acts); v.append(card);
  });
}
// Tools for the trial (supabase/2026-11-trial.sql): 💬 feedback, 📊 usage, 🐞 errors on people's devices
function trialSetup(v){ v.append(el('div',{class:'admcard'}, el('p',{}, el('b',{text:'ยังไม่ได้เปิดใช้'})),
  el('p',{text:'รันไฟล์ supabase/2026-11-trial.sql ใน Supabase → SQL Editor ครั้งเดียว แล้วข้อมูลจะเริ่มเข้ามา'}))); }
const admBusy={};
function adminLoad(key, path, tab){
  if(ADM[key]) return false;
  if(admBusy[key]===path) return true;   // already on its way
  admBusy[key]=path;
  adminApi('GET',path).catch(()=>({ok:false})).then(r=>{ if(admBusy[key]!==path) return; admBusy[key]=null;
    ADM[key]= r.ok ? r.j : { error:'โหลดไม่สำเร็จ' }; if(S.view==='admin' && ADM.tab===tab) renderAdmin(); });
  return true;
}
const FB_KIND={ problem:'🐞 ปัญหา', idea:'💡 ไอเดีย', other:'💬 อื่นๆ' };
function renderFeedbackAdmin(v){
  v.append(el('div',{class:'seg'},
    el('button',{class:ADM.fbAll?'':'on',text:'ยังไม่จัดการ',onclick:()=>{ ADM.fbAll=false; ADM.fb=null; renderAdmin(); }}),
    el('button',{class:ADM.fbAll?'on':'',text:'ทั้งหมด',onclick:()=>{ ADM.fbAll=true; ADM.fb=null; renderAdmin(); }})));
  if(adminLoad('fb','/feedback'+(ADM.fbAll?'?all=1':''),'feedback')){ v.append(el('p',{class:'libempty',text:'กำลังโหลด…'})); return; }
  const F=ADM.fb;
  if(F.error){ v.append(el('p',{class:'err',text:F.error})); return; }
  if(F.setup){ trialSetup(v); return; }
  if(!F.feedback.length){ v.append(el('p',{class:'libempty',text: ADM.fbAll ? 'ยังไม่มีความเห็น' : '🎉 ไม่มีความเห็นที่ต้องจัดการ'})); return; }
  F.feedback.forEach(f=>{
    v.append(el('div',{class:'admcard'+(f.resolved_at?' done':'')},
      el('div',{class:'admtop'}, el('span',{class:'pill',text:FB_KIND[f.kind]||f.kind}), el('span',{class:'note small',text:ago2(f.created_at)}),
        f.resolved_at ? el('span',{class:'pill ok',text:'✓ ปิดเรื่องแล้ว'}) : null),
      el('p',{class:'fbmsg',text:f.message}),
      el('p',{class:'note small'}, 'ตอบกลับที่: ', f.contact ? el('a',{href:'mailto:'+f.contact,text:f.contact}) : 'ไม่ได้ให้อีเมล',
        ` · ${f.signed_in?'เข้าสู่ระบบ':'ไม่ได้เข้าสู่ระบบ'} · หน้า ${f.page||'-'} · เมนู${f.ui==='en'?'อังกฤษ':'ไทย'}`),
      el('p',{class:'note small',text:f.ua||''}),
      f.note ? el('p',{class:'note small',text:'บันทึก: '+f.note}) : null,
      el('div',{class:'row'}, el('span',{class:'sp'}),
        el('button',{class:f.resolved_at?'':'primary',text:f.resolved_at?'เปิดเรื่องใหม่':'✓ ปิดเรื่อง',onclick:async e=>{
          e.currentTarget.disabled=true;
          const note=f.resolved_at ? '' : (prompt('บันทึกสั้นๆ (ไม่ใส่ก็ได้)', f.note||'')||'');
          const r=await adminApi('POST',`/feedback/${f.id}/resolve`,{ reopen:!!f.resolved_at, note }).catch(()=>({ok:false}));
          if(!r.ok) toast('บันทึกไม่สำเร็จ'); ADM.fb=null; renderAdmin(); }}))));
  });
}
function renderErrorsAdmin(v){
  if(adminLoad('errs','/errors','errors')){ v.append(el('p',{class:'libempty',text:'กำลังโหลด…'})); return; }
  const E=ADM.errs;
  if(E.error){ v.append(el('p',{class:'err',text:E.error})); return; }
  if(E.setup){ trialSetup(v); return; }
  v.append(el('p',{class:'note',text:'ข้อผิดพลาดของแอปบนเครื่องผู้ใช้ 14 วันล่าสุด (ข้อความเดียวกันจากที่เดียวกันรวมเป็นแถวเดียว) ไม่มีข้อมูลว่าเป็นใคร'}));
  const g={};
  E.errors.forEach(x=>{ const k=x.msg+'|'+(x.src||''); const o=g[k]||(g[k]={ msg:x.msg, src:x.src, n:0, days:new Set(), last:x.last_at, page:x.page, ua:x.ua, stack:x.stack });
    o.n+=Number(x.n)||0; o.days.add(x.day); if(x.last_at>o.last){ o.last=x.last_at; o.page=x.page; o.ua=x.ua; o.stack=x.stack||o.stack; } });
  const list=Object.values(g).sort((a,b)=>b.last.localeCompare(a.last));
  if(!list.length){ v.append(el('p',{class:'libempty',text:'🎉 ยังไม่มีข้อผิดพลาด'})); return; }
  list.forEach(o=>v.append(el('div',{class:'admcard'},
    el('div',{class:'admtop'}, el('span',{class:'pill bad',text:`${o.n} ครั้ง`}), el('span',{class:'note small',text:`${o.days.size} วัน · ล่าสุด ${ago2(o.last)}`})),
    el('p',{}, el('b',{class:'errmsg',text:o.msg})),
    el('p',{class:'note small',text:`ที่ ${o.src||'-'} · หน้า ${o.page||'-'}`}),
    el('p',{class:'note small',text:o.ua||''}),
    o.stack ? el('details',{}, el('summary',{text:'stack'}), el('pre',{class:'errstack',text:o.stack})) : null)));
}
// 🖼️ Admin: what the library holds, import from Gemini (picture + JSON), publish, fix boxes
function galStats(D){
  const per={}, all=new Set(); let words=0, noTh=0, noDe=0;
  const P=id=>per[id]||(per[id]={ pub:0, draft:0, words:0, uniq:new Set() });
  D.categories.forEach(c=>P(c.id));
  D.scenes.forEach(g=>{ const p=P(g.category); (g.published && g.img_ver) ? p.pub++ : p.draft++;
    Object.values(g.items||{}).forEach(it=>{ const k=String(it.word||'').toLowerCase(); words++; p.words++; p.uniq.add(k); all.add(k); if(!it.th) noTh++; if(!(it.l && it.l.de)) noDe++; }); });
  return { per, words, uniq:all.size, noTh, noDe, used:D.categories.filter(c=>per[c.id].pub+per[c.id].draft).length };
}
function renderGalleryAdmin(v){
  if(adminLoad('gal','/gallery','gallery')){ v.append(el('p',{class:'libempty',text:'กำลังโหลด…'})); return; }
  const D=ADM.gal;
  if(D.error){ v.append(el('p',{class:'err',text:D.error})); return; }
  if(D.setup){ v.append(el('div',{class:'admcard'}, el('p',{}, el('b',{text:'ยังไม่ได้เปิดใช้'})),
    el('p',{text:'รันไฟล์ supabase/2026-11-gallery.sql ใน Supabase → SQL Editor ครั้งเดียว แล้วหมวดทั้ง 12 หมวดจะพร้อมใช้'}))); return; }
  const st=galStats(D), pub=D.scenes.filter(g=>g.published && g.img_ver).length;
  const card=(title,big,sub)=>el('div',{class:'aicard'}, el('h4',{text:title}), el('div',{class:'aibig'}, el('b',{text:String(big)})), sub?el('p',{class:'note small',text:sub}):null);
  v.append(el('div',{class:'aicards'},
    card('หมวด', D.categories.length, `มีฉากแล้ว ${st.used} หมวด`),
    card('ฉาก', D.scenes.length, `เผยแพร่ ${pub} · ฉบับร่าง ${D.scenes.length-pub}`),
    card('คำศัพท์ทั้งหมด', st.words, `คำไม่ซ้ำ ${st.uniq} คำ`),
    card('ต้องตรวจ', st.noTh, `คำที่ยังไม่มีคำแปลไทย · ไม่มีภาษาเยอรมัน ${st.noDe} คำ`)));
  const tb=el('table',{class:'aitable stat'}, el('tr',{}, ...['หมวด','เผยแพร่','ฉบับร่าง','คำ','คำไม่ซ้ำ'].map(h=>el('th',{text:h}))));
  D.categories.forEach(c=>{ const p=st.per[c.id]; tb.append(el('tr',{}, el('td',{'data-noi18n':'',text:`${c.emoji} ${catName(c)}`}), ...[p.pub,p.draft,p.words,p.uniq.size].map(x=>el('td',{text:String(x)})))); });
  tb.append(el('tr',{class:'tot'}, el('td',{text:'รวม'}), ...[pub, D.scenes.length-pub, st.words, st.uniq].map(x=>el('td',{text:String(x)}))));
  v.append(el('h4',{class:'aih',text:'แต่ละหมวด'}), el('div',{class:'aitablewrap'}, tb));
  // import
  const inp=el('input',{type:'file',multiple:'',accept:'image/png,image/jpeg,image/webp,.json,.txt',hidden:'',class:'galfiles'});
  inp.addEventListener('change',()=>{ const f=[...inp.files]; inp.value=''; if(f.length) galImport(f); });
  const crop=el('input',{type:'checkbox',class:'galcrop'}); crop.checked=GA.crop; crop.addEventListener('change',()=>{ GA.crop=crop.checked; });
  const cat=el('select',{class:'galcat','aria-label':'หมวดที่จะใส่'}, el('option',{value:'',text:'ตามที่เขียนในไฟล์ JSON'}), ...D.categories.map(c=>el('option',{value:c.id,text:`${c.emoji} ${catName(c)}`})));
  cat.value=GA.cat||''; cat.addEventListener('change',()=>{ GA.cat=cat.value; });
  v.append(el('div',{class:'admcard galimp'},
    el('h4',{text:'📥 นำเข้าจาก Gemini'}),
    el('p',{class:'note',text:'เลือกรูปกับไฟล์ JSON ที่ชื่อเดียวกัน เช่น kitchen.png + kitchen.json เลือกหลายฉากพร้อมกันได้ ฉากที่นำเข้าจะเป็นฉบับร่าง ตรวจกรอบก่อนแล้วค่อยกดเผยแพร่'}),
    el('label',{class:'galcatrow'}, el('span',{text:'ใส่ในหมวด'}), cat),
    el('label',{class:'chk'}, crop, el('span',{text:'ตัดขอบขวาและล่าง 4% (ลบลายน้ำ Gemini ที่มุมขวาล่าง)'})),
    el('div',{class:'row'}, el('button',{class:'primary',text:'เลือกไฟล์…',onclick:()=>inp.click()})), inp));
  // scenes by category
  D.categories.forEach(c=>{
    const list=D.scenes.filter(g=>g.category===c.id); if(!list.length) return;
    v.append(el('h4',{class:'aih','data-noi18n':'',text:`${c.emoji} ${catName(c)} (${list.length})`}));
    list.forEach(g=>v.append(galAdminRow(g, D)));
  });
  const orphan=D.scenes.filter(g=>!D.categories.some(c=>c.id===g.category));
  orphan.forEach(g=>v.append(galAdminRow(g, D)));
}
function galAdminRow(g, D){
  const items=Object.values(g.items||{}), live=g.published && g.img_ver;
  const edit=Object.keys(galEdits).find(sid=>galEdits[sid]===g.id && scenes().some(x=>x.id===sid));
  const patch=async(body, okMsg)=>{ const r=await adminApi('PATCH','/gallery/'+g.id, body).catch(()=>({ok:false})); toast(r.ok ? okMsg : 'บันทึกไม่สำเร็จ'); ADM.gal=null; GAL.data=null; renderAdmin(); };
  const sel=el('select',{'aria-label':'หมวด'}, ...D.categories.map(c=>el('option',{value:c.id,text:`${c.emoji} ${catName(c)}`})));
  sel.value=g.category; sel.addEventListener('change',()=>patch({ category:sel.value }, 'ย้ายหมวดแล้ว'));
  return el('div',{class:'admcard galrow'},
    g.img_ver ? el('img',{class:'galthumb',alt:'',loading:'lazy',src:galImg(g,true)}) : el('div',{class:'galthumb none',text:'ไม่มีรูป'}),
    el('div',{class:'galinfo'},
      el('div',{class:'admtop'}, el('b',{'data-noi18n':'',text:g.title+(g.title_th?' · '+g.title_th:'')}),
        el('span',{class:'pill'+(live?' ok':''),text: live ? 'เผยแพร่แล้ว' : 'ฉบับร่าง'})),
      el('p',{class:'note small',text:`${items.length} คำ · ระดับ${GAL_LV[g.level]||''} · ${g.w}×${g.h}`}),
      el('p',{class:'note small galwl','data-noi18n':'',text:items.map(it=>it.word+(it.th?'':' (?)')).join(', ')}),
      el('div',{class:'row'}, el('label',{class:'galcatrow'}, el('span',{text:'หมวด'}), sel), el('span',{class:'sp'}),
        el('button',{class:live?'':'primary',text: live ? 'ซ่อน' : 'เผยแพร่',...(g.img_ver?{}:{disabled:''}),onclick:()=>patch({ published:!g.published }, g.published ? 'ซ่อนแล้ว' : 'เผยแพร่แล้ว ✓')}),
        edit ? el('button',{class:'primary',text:'⬆️ อัปเดตจากฉบับแก้ไข',onclick:()=>galPushEdit(edit, true)}) : null,
        el('button',{text:'✏️ แก้กรอบ',onclick:()=>galEditLocal(g, edit)}),
        el('button',{text:'📝 ชื่อ',onclick:()=>{ const t=prompt('ชื่อฉาก (อังกฤษ)', g.title); if(t==null || !t.trim()) return; const th=prompt('ชื่อฉาก (ไทย)', g.title_th||''); patch({ title:t, title_th:th==null?g.title_th:th }, 'เปลี่ยนชื่อแล้ว'); }}),
        el('button',{class:'danger',text:'🗑',title:'ลบ',onclick:async()=>{ if(!confirm(`ลบ “${g.title}” ออกจากคลังภาพ? คนที่เก็บไปแล้วยังมีฉากนี้อยู่`)) return;
          const r=await adminApi('DELETE','/gallery/'+g.id).catch(()=>({ok:false})); toast(r.ok?'ลบแล้ว':'ลบไม่สำเร็จ'); ADM.gal=null; GAL.data=null; renderAdmin(); }}))));
}
// Fix boxes with the normal editor: copy the library scene into my library, edit it, then send the boxes back.
async function galEditLocal(g, existing){
  if(existing){ openScene(existing,'learn',true); return; }
  toast('กำลังเปิด…', 8000);
  try{
    const sid=await galCopy(g, g, '✏️ '+g.title);
    galEdits[sid]=g.id; store.set('pv-gal-edit',galEdits);
    openScene(sid,'learn',true);
    toast('แก้กรอบหรือคำได้เลย เสร็จแล้วกด ⬆️ บันทึกเข้าคลังภาพ ด้านบน', 5000);
  }catch(e){ toast('เปิดไม่สำเร็จ'); }
}
var GA={ crop:true, cat:'' };
// Gemini's answer: {"category","title","title_th","level","items":[{word, th, alts, de, de_art, de_alts, box_2d}]} (or just the items array)
function galParse(text){
  const s=String(text||''), a=s.indexOf('{'), b=s.lastIndexOf('}'), a2=s.indexOf('['), b2=s.lastIndexOf(']');
  let o=null;
  try{
    if(a>=0 && b>a && (a2<0 || a<a2)) o=JSON.parse(s.slice(a,b+1));
    else if(a2>=0 && b2>a2) o={ items:JSON.parse(s.slice(a2,b2+1)) };
  }catch(e){ o=null; }
  if(!o || !Array.isArray(o.items)) throw new Error('อ่าน JSON ไม่ได้');
  return o;
}
// box_2d is 0-1000 of the picture Gemini made; the saved picture may be cropped (watermark) and smaller.
function galItems(list, W0, H0, W1, H1, k){
  const items={}, seen=new Set();
  for(const r of list){
    if(!r || typeof r.word!=='string') continue;
    const word=r.word.trim().replace(/\s+/g,' ').slice(0,60), key=word.toLowerCase();
    if(!word || seen.has(key)) continue;
    let bx=null;
    if(Array.isArray(r.box_2d) && r.box_2d.length>=4){ const [y0,x0,y1,x1]=r.box_2d.slice(0,4).map(Number); bx=[x0,y0,x1,y1]; }
    else if(Array.isArray(r.box) && r.box.length>=4) bx=r.box.slice(0,4).map(Number);
    if(!bx || bx.some(v=>!Number.isFinite(v))) continue;
    const x0=Math.max(0,Math.min(bx[0],bx[2])/1000*W0), x1=Math.min(W1,Math.max(bx[0],bx[2])/1000*W0);
    const y0=Math.max(0,Math.min(bx[1],bx[3])/1000*H0), y1=Math.min(H1,Math.max(bx[1],bx[3])/1000*H0);
    if(x1-x0<8 || y1-y0<8) continue;
    seen.add(key);
    const it={ word, th:String(r.th||'').trim().slice(0,120),
      alts:(Array.isArray(r.alts)?r.alts:[]).filter(a=>typeof a==='string' && a.trim()).slice(0,4).map(a=>a.trim().slice(0,60)),
      x:Math.round(x0*k), y:Math.round(y0*k), w:Math.round((x1-x0)*k), h:Math.round((y1-y0)*k) };
    const l=typeof r.de==='string' && r.de.trim() ? cleanLang({ de:{ w:r.de, a:r.de_art, alts:r.de_alts } }) : null;
    if(l) it.l=l;
    items['g'+Object.keys(items).length.toString(36)+Math.random().toString(36).slice(2,6)]=it;
  }
  return items;
}
async function galEncode(src, sw, sh, w, h, q){
  const c=document.createElement('canvas'); c.width=w; c.height=h;
  const x=c.getContext('2d'); x.imageSmoothingQuality='high'; x.drawImage(src,0,0,sw,sh,0,0,w,h);
  let b=await new Promise(r=>c.toBlob(r,'image/webp',q));
  if(!b || b.type!=='image/webp') b=await new Promise(r=>c.toBlob(r,'image/jpeg',q));   // Safari cannot make WebP
  return b;
}
async function galPutImg(id, blob, thumb){
  const tok=await accessToken();
  const r=await fetch(`/api/admin/gallery/${id}/img${thumb?'?thumb=1':''}`,{ method:'PUT', headers:{ 'content-type':blob.type, ...(tok?{authorization:'Bearer '+tok}:{}) }, body:blob });
  if(!r.ok) throw new Error('อัปโหลดรูปไม่สำเร็จ ('+r.status+')');
}
async function galImportOne(p, cats){
  const meta=galParse(await p.json.text());
  const bmp=await createImageBitmap(p.img);
  const W0=bmp.width, H0=bmp.height, cut=GA.crop ? 0.04 : 0;
  const W1=Math.round(W0*(1-cut)), H1=Math.round(H0*(1-cut)), k=Math.min(1, 1600/Math.max(W1,H1));
  const W=Math.round(W1*k), H=Math.round(H1*k);
  const items=galItems(meta.items, W0, H0, W1, H1, k);
  if(!Object.keys(items).length) throw new Error('ไม่มีคำที่ใช้ได้');
  const cat=GA.cat || String(meta.category||'').trim().toLowerCase();
  const r=await adminApi('POST','/gallery',{ category: cats.includes(cat) ? cat : cats[0], title:String(meta.title||p.name).slice(0,60),
    title_th:String(meta.title_th||'').slice(0,60), level:meta.level, w:W, h:H, items }).catch(()=>({ok:false,j:{}}));
  if(!r.ok) throw new Error((r.j && r.j.error) || 'บันทึกไม่สำเร็จ');
  await galPutImg(r.j.id, await galEncode(bmp, W1, H1, 480, Math.round(H*480/W), 0.8), true);
  await galPutImg(r.j.id, await galEncode(bmp, W1, H1, W, H, 0.86), false);
  return { n:Object.keys(items).length, catOk:cats.includes(cat) };
}
async function galImport(files){
  const by={};
  for(const f of files){
    const name=f.name.replace(/\.[^.]+$/,''), key=name.toLowerCase(), o=by[key]||(by[key]={ name });
    if(/^image\//.test(f.type)) o.img=f; else o.json=f;
  }
  const pairs=Object.values(by), cats=(ADM.gal && ADM.gal.categories || []).map(c=>c.id);
  const done=[], fail=[], half=pairs.filter(p=>!p.img || !p.json).map(p=>p.name+(p.img?' (ไม่มี JSON)':' (ไม่มีรูป)'));
  let i=0;
  for(const p of pairs.filter(p=>p.img && p.json)){
    toast(`กำลังนำเข้า ${++i}: ${p.name}…`, 60000);
    try{ const r=await galImportOne(p, cats); done.push(`${p.name}: ${r.n} คำ`+(r.catOk?'':' (ไม่รู้จักหมวด ใส่ไว้หมวดแรก)')); }
    catch(e){ fail.push(`${p.name}: ${e && e.message || e}`); }
  }
  toast('นำเข้าเสร็จแล้ว', 1500);
  ADM.gal=null; renderAdmin();
  openModal(m=>m.append(el('h3',{text:'📥 นำเข้าคลังภาพ'}),
    el('p',{}, el('b',{text:`นำเข้าแล้ว ${done.length} ฉาก`})), ...done.map(t=>el('p',{class:'note small','data-noi18n':'',text:'✓ '+t})),
    fail.length ? el('p',{}, el('b',{text:'ไม่สำเร็จ'})) : null, ...fail.map(t=>el('p',{class:'note small err','data-noi18n':'',text:'✗ '+t})),
    half.length ? el('p',{}, el('b',{text:'ไฟล์ไม่ครบคู่'})) : null, ...half.map(t=>el('p',{class:'note small','data-noi18n':'',text:t})),
    done.length ? el('p',{class:'note',text:'ฉากที่นำเข้าเป็นฉบับร่าง ตรวจกรอบ (✏️ แก้กรอบ) แล้วกด “เผยแพร่”'}) : null,
    el('div',{class:'row'}, el('span',{class:'sp'}), el('button',{class:'primary',text:'ตกลง',onclick:closeModal}))));
}
function renderStatsAdmin(v){
  if(adminLoad('stats','/stats','stats')){ v.append(el('p',{class:'libempty',text:'กำลังโหลด…'})); return; }
  const A=ADM.stats;
  if(A.error){ v.append(el('p',{class:'err',text:A.error})); return; }
  if(A.setup){ trialSetup(v); return; }
  const T=A.totals||{}, N=x=>Number(x)||0;
  const days=[]; for(let i=29;i>=0;i--) days.push(new Date(Date.parse(A.today+'T00:00:00Z')-i*86400e3).toISOString().slice(0,10));
  const on=(d,e)=>N((A.days||[]).find(x=>x.day===d && x.event===e)?.n);
  const sum=(e,n)=>days.slice(-n).reduce((a,d)=>a+on(d,e),0);
  const card=(title,big,sub)=>el('div',{class:'aicard'}, el('h4',{text:title}), el('div',{class:'aibig'}, el('b',{text:String(big)})), sub?el('p',{class:'note small',text:sub}):null);
  const back7=sum('age:1-6',7)+sum('age:7-29',7)+sum('age:30+',7), open7=sum('open',7);
  v.append(el('div',{class:'aicards'},
    card('เปิดแอปวันนี้ (เครื่อง)', on(A.today,'open'), `เมื่อวาน ${on(days[28],'open')} · 7 วัน รวม ${open7} เครื่อง-วัน`),
    card('เครื่องใหม่ 7 วัน', sum('new_device',7), `30 วัน ${sum('new_device',30)} · กลับมาใช้ซ้ำ ${open7?Math.round(back7/open7*100):0}% ของการเปิดใน 7 วัน`),
    card('บัญชี', N(T.accounts), `ใหม่ 7 วัน ${N(T.accounts_7d)} · บัญชีนักเรียน ${N(T.students)} · เข้าสู่ระบบใน 7 วัน ${N(T.signed_in_7d)}`),
    card('ฝึกแล้วซิงค์ (บัญชี)', N(T.active_7d), `ใน 7 วัน · 30 วัน ${N(T.active_30d)}`),
    card('ฉากในบัญชี', N(T.scenes), `ใหม่ 7 วัน ${N(T.scenes_7d)} · จาก ${N(T.scene_users)} บัญชี`),
    card('แชร์และห้องเรียน', `${N(T.shares)} ลิงก์`, `ห้องเรียน ${N(T.classes)} ห้อง · สมาชิก ${N(T.class_members)} คน`)));
  // opens per day
  const vals=days.map(d=>({ n:on(d,'open'), nw:on(d,'new_device') })), mx=Math.max(1,...vals.map(x=>x.n));
  const chart=el('div',{class:'aichart'});
  days.forEach((d,i)=>{ const x=vals[i]; chart.append(el('div',{class:'aicol',title:`${d.slice(8)}/${d.slice(5,7)}: เปิด ${x.n} เครื่อง · ใหม่ ${x.nw}`},
    el('i',{class:'t',style:`height:${x.nw/mx*100}%`}), el('i',{class:'s',style:`height:${(x.n-Math.min(x.n,x.nw))/mx*100}%`}),
    el('small',{text:i%5===4||i===29?d.slice(8):''}))); });
  v.append(el('h4',{class:'aih',text:'เครื่องที่เปิดแอป 30 วันล่าสุด'}), chart,
    el('p',{class:'note small aileg'}, el('span',{class:'k t'}),' เครื่องใหม่ ', el('span',{class:'k s'}),' เครื่องที่เคยเปิดแล้ว'));
  // what people did (30 days)
  const acts=[['mode:learn','👀 ดูคำศัพท์'],['mode:quiz','⌨️ ทบทวน (พิมพ์)'],['mode:find','👂 ฟังแล้วหา'],['mode:speak','🎤 ฝึกพูด'],['review','🔁 รอบทบทวน'],['mock','📝 สอบจำลอง'],
    ['scene_new','📷 สร้างฉากจากรูป'],['ai_scene','✨ AI หาคำ'],['sheet_new','📝 ชีทคำศัพท์'],['gallery_add','🖼️ เก็บฉากจากคลังภาพ'],['share','🔗 สร้างลิงก์แชร์'],['class_join','🎓 เข้าห้องเรียน'],['feedback','💬 ส่งความเห็น'],
    ['ui:en','🇬🇧 ใช้เมนูอังกฤษ (เครื่อง-วัน)'],['lang:de','🇩🇪 ฝึกเยอรมัน (เครื่อง-วัน)'],['installed','📲 เปิดจากแอปที่ติดตั้ง (เครื่อง-วัน)']];
  const tb=el('table',{class:'aitable stat'}, el('tr',{}, ...['สิ่งที่ทำ','7 วัน','30 วัน'].map(h=>el('th',{text:h}))));
  acts.forEach(([k,t])=>tb.append(el('tr',{}, el('td',{text:t}), el('td',{text:String(sum(k,7))}), el('td',{text:String(sum(k,30))}))));
  v.append(el('h4',{class:'aih',text:'ใช้อะไรบ้าง (จำนวนครั้ง)'}), el('div',{class:'aitablewrap'}, tb),
    el('p',{class:'note small',text:'นับจากทุกเครื่อง รวมคนที่ไม่ได้เข้าสู่ระบบ เก็บแค่ยอดรวมต่อวัน ไม่รู้ว่าเป็นใคร · ตัวเลขบัญชีและฉากนับจากข้อมูลที่ซิงค์ขึ้นบัญชีเท่านั้น'}));
}
// ✨ AI usage: pictures and translations today / this month, Google's free daily quota, and what the paid tier would cost.
const THB=34;   // baht per US dollar, for rough estimates only
async function loadAiUsage(){ const r=await adminApi('GET','/ai-usage').catch(()=>({ok:false})); ADM.ai = r.ok ? r.j : { error:'โหลดไม่สำเร็จ' }; }
function aiTotals(rows){
  const t={ scans:0, trans:0, quota:0, quotaLast:0, errors:0, tin:0, tout:0, cost:0, byModel:{} };
  const last=(ADM.ai.gemini_models||[]).slice(-1)[0];
  rows.forEach(r=>{ const n=Number(r.n)||0, q=/^(quota_|no_quota)/.test(r.outcome);
    const m=t.byModel[r.model]||(t.byModel[r.model]={ ok:0, quota:0, errors:0, tin:0, tout:0, provider:r.provider });
    if(r.outcome==='ok'){ if(r.kind==='scan') t.scans+=n; else t.trans+=n; m.ok+=n; }
    else if(q){ t.quota+=n; m.quota+=n; if(r.model===last) t.quotaLast+=n; }
    else { t.errors+=n; m.errors+=n; }
    const ti=Number(r.tok_in)||0, to=Number(r.tok_out)||0; t.tin+=ti; t.tout+=to; m.tin+=ti; m.tout+=to;
    const pr=(ADM.ai.paid_price||{})[r.model]; if(pr) t.cost+=(ti*pr[0]+to*pr[1])/1e6; });
  return t;
}
const money=usd=>usd<0.01 ? 'น้อยกว่า 1 บาท' : `~${Math.round(usd*THB).toLocaleString('th-TH')} บาท ($${usd.toFixed(2)})`;
function renderAiUsage(v){
  if(!ADM.ai){ v.append(el('p',{class:'libempty',text:'กำลังโหลด…'})); loadAiUsage().then(()=>{ if(S.view==='admin' && ADM.tab==='ai') renderAdmin(); }); return; }
  const A=ADM.ai;
  if(A.error){ v.append(el('p',{class:'err',text:A.error})); return; }
  if(A.setup){ v.append(el('div',{class:'admcard'}, el('p',{}, el('b',{text:'ยังไม่ได้เปิดตัวนับการใช้ AI'})),
    el('p',{text:'รันไฟล์ supabase/2026-11-ai-usage.sql ใน Supabase → SQL Editor ครั้งเดียว แล้วระบบจะเริ่มนับตั้งแต่การใช้ AI ครั้งถัดไป'}))); return; }
  const T=aiTotals(A.today.rows), M=aiTotals(A.month.rows);
  const hm=d=>new Date(d).toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'});
  const now=new Date(), dim=new Date(now.getFullYear(), now.getMonth()+1, 0).getDate(), dayNo=Math.max(1, (Date.now()-Date.parse(A.month.since))/86400e3);
  // the verdict first
  const lim=A.free_rpd||{}, models=A.gemini_models||[], gem=A.provider==='gemini';
  const qRows=A.quota_day.rows.filter(r=>r.provider==='gemini' && !/^(quota_|no_quota)/.test(r.outcome));
  const used=m=>qRows.filter(r=>r.model===m).reduce((a,r)=>a+Number(r.n),0);
  const totalLim=models.reduce((a,m)=>a+(lim[m]||0),0), usedAll=models.reduce((a,m)=>a+used(m),0);
  const peak=Math.max(0, ...Object.values((A.daily||[]).reduce((o,r)=>{ o[r.day]=(o[r.day]||0)+Number(r.n); return o; },{})));
  let verdict, vcls='ok';
  if(!A.provider){ verdict='ยังไม่ได้ตั้งค่า AI (ไม่มี GEMINI_API_KEY หรือ ANTHROPIC_API_KEY)'; vcls='warn'; }
  else if(!gem) verdict='ใช้ Claude ('+A.claude_model+') แบบจ่ายตามใช้ ไม่มีโควตาฟรีรายวัน — ดูค่าใช้จ่ายด้านล่าง';
  else if(M.quotaLast>0){ verdict=`⚠️ เดือนนี้โควตาฟรีหมดทุกรุ่น ${M.quotaLast} ครั้ง — ผู้ใช้เจอข้อความ “AI มีผู้ใช้งานมาก” ถึงเวลาพิจารณาแบบเสียเงิน`; vcls='bad'; }
  else if(totalLim && peak>=totalLim*0.8){ verdict=`⚠️ วันที่ใช้มากที่สุดใช้ไป ${peak} จาก ${totalLim} ครั้ง ใกล้เต็มโควตาฟรีแล้ว`; vcls='warn'; }
  else if(M.quota>0) verdict=`ℹ️ รุ่นที่แม่นกว่าหมดโควตาบ้าง (${M.quota} ครั้ง) ระบบสลับไปรุ่นถัดไปให้เอง ผู้ใช้ยังใช้ได้ — ยังไม่จำเป็นต้องจ่าย`;
  else verdict='✅ โควตาฟรียังพอ ยังไม่ต้องเปลี่ยนเป็นแบบเสียเงิน';
  v.append(el('div',{class:'aiverdict '+vcls,text:verdict}));
  const card=(title,t,extra)=>el('div',{class:'aicard'}, el('h4',{text:title}),
    el('div',{class:'aibig'}, el('b',{text:String(t.scans)}), el('span',{text:' รูปที่ AI หาคำให้'})),
    el('p',{text:`แปลคำ ${t.trans} ฉาก · โควตาหมด ${t.quota} ครั้ง · ผิดพลาดอื่น ${t.errors} ครั้ง`}),
    el('p',{class:'note small',text:`token เข้า ${t.tin.toLocaleString('th-TH')} · ออก ${t.tout.toLocaleString('th-TH')}`}), extra||null);
  v.append(el('div',{class:'aicards'},
    card('วันนี้',T),
    card('เดือนนี้',M, el('div',{},
      el('p',{class:'note small',text:`ถ้าจ่ายเงินตามราคาของรุ่นที่ใช้จริง: เดือนนี้ ${money(M.cost)} · ทั้งเดือนน่าจะ ${money(M.cost/dayNo*dim)}`}),
      gem && (A.paid_price||{})['gemini-3.8-flash'] ? el('p',{class:'note small',text:(()=>{ const pr=A.paid_price['gemini-3.8-flash'], c=(M.tin*pr[0]+M.tout*pr[1])/1e6; return `ถ้าจ่ายเงินและใช้ gemini-3.8-flash ทุกครั้ง: เดือนนี้ ${money(c)} · ทั้งเดือนน่าจะ ${money(c/dayNo*dim)}`; })()}) : null))));
  if(gem && models.length){
    const box=el('div',{class:'aicard wide'}, el('h4',{text:'โควตาฟรีของ Google รอบนี้'}),
      el('p',{class:'note small',text:`นับตั้งแต่ ${hm(A.quota_day.since)} น. · รีเซ็ตครั้งถัดไป ${hm(A.quota_day.resets)} น. (เที่ยงคืนเวลาแปซิฟิก) · ระบบลองรุ่นตามลำดับนี้`}));
    models.forEach(m=>{ const u=used(m), l=lim[m]||0, pct=l?Math.min(100,Math.round(u/l*100)):0;
      box.append(el('div',{class:'aiq'}, el('span',{class:'aiqm',text:m}),
        el('span',{class:'aibar'}, el('i',{style:`width:${pct}%`,class:pct>=100?'full':pct>=80?'hi':''})),
        el('span',{class:'aiqn',text: l ? `${u} / ${l}` : `${u} (ไม่ทราบโควตา)`}))); });
    v.append(box);
  }
  // per model this month
  const bm=Object.entries(M.byModel);
  if(bm.length){
    const tb=el('table',{class:'aitable'}, el('tr',{}, ...['รุ่น','สำเร็จ','โควตาหมด','ผิดพลาด','token เฉลี่ย (เข้า/ออก)'].map(h=>el('th',{text:h}))));
    bm.sort((a,b)=>b[1].ok-a[1].ok).forEach(([m,x])=>{ const k=x.ok||1; tb.append(el('tr',{}, el('td',{text:m}), el('td',{text:String(x.ok)}), el('td',{text:String(x.quota)}), el('td',{text:String(x.errors)}),
      el('td',{text: x.ok ? `${Math.round(x.tin/k).toLocaleString('th-TH')} / ${Math.round(x.tout/k).toLocaleString('th-TH')}` : '-'}))); });
    v.append(el('h4',{class:'aih',text:'แยกตามรุ่น (เดือนนี้)'}), el('div',{class:'aitablewrap'}, tb));
  }
  // 30 days
  const days=[]; for(let i=29;i>=0;i--){ const d=new Date(Date.now()+7*3600e3-i*86400e3); days.push(d.toISOString().slice(0,10)); }
  const per=d=>{ const r=(A.daily||[]).filter(x=>x.day===d); return { scan:r.filter(x=>x.kind==='scan'&&x.ok).reduce((a,x)=>a+Number(x.n),0), tr:r.filter(x=>x.kind==='translate'&&x.ok).reduce((a,x)=>a+Number(x.n),0), bad:r.filter(x=>!x.ok).reduce((a,x)=>a+Number(x.n),0) }; };
  const vals=days.map(per), mx=Math.max(1,...vals.map(x=>x.scan+x.tr+x.bad));
  const chart=el('div',{class:'aichart'});
  days.forEach((d,i)=>{ const x=vals[i]; chart.append(el('div',{class:'aicol',title:`${d.slice(8)}/${d.slice(5,7)}: รูป ${x.scan} · แปล ${x.tr} · ไม่สำเร็จ ${x.bad}`},
    el('i',{class:'s',style:`height:${x.scan/mx*100}%`}), el('i',{class:'t',style:`height:${x.tr/mx*100}%`}), el('i',{class:'b',style:`height:${x.bad/mx*100}%`}),
    el('small',{text:i%5===4||i===29?d.slice(8):''}))); });
  v.append(el('h4',{class:'aih',text:'30 วันล่าสุด'}), chart,
    el('p',{class:'note small aileg'}, el('span',{class:'k s'}),' รูป ', el('span',{class:'k t'}),' แปลคำ ', el('span',{class:'k b'}),' ไม่สำเร็จ (รวมโควตาหมด)'),
    el('p',{class:'note small',text:`ราคาประมาณจากราคาแบบเสียเงิน ณ พ.ย. 2026 (1 ดอลลาร์ ≈ ${THB} บาท) · Gemini 3.8 Flash ขึ้นราคา 2 เท่าตั้งแต่ ม.ค. 2027 · เก็บแค่จำนวนครั้งและ token ไม่เก็บรูป คำ หรือผู้ใช้`}));
}
async function adminEvidence(r, box){
  box.innerHTML=''; box.append(el('p',{class:'note small',text:'กำลังโหลด…'}));
  const x=await adminApi('GET','/reports/'+r.id).catch(()=>({ok:false}));
  box.innerHTML='';
  if(!x.ok){ box.append(el('p',{class:'err',text:'โหลดหลักฐานไม่สำเร็จ'})); return; }
  const d=x.j;
  box.append(el('p',{}, el('b',{text:'สิ่งที่ส่งถึงผู้รายงาน (30 วัน): '}), d.sent.length ? '' : 'ไม่มี'));
  if(d.sent.length) box.append(el('ul',{}, ...d.sent.map(e=>el('li',{}, e.kind==='cheer' ? (CHEER_TEXT[e.data.cheer]||e.data.cheer) : el('span',{}, `${e.data.kind==='deck'?'ชุดคำ':'ฉาก'} “${e.data.name}” `, el('a',{href:'/s/'+e.data.share_id,target:'_blank',rel:'noopener',text:'เปิด ↗'})), el('span',{class:'note small',text:' · '+ago2(e.created_at)})))));
  box.append(el('p',{}, el('b',{text:`ลิงก์แชร์ของผู้ใช้นี้ (${d.shares.length}): `}), d.shares.length ? '' : 'ไม่มี'));
  if(d.shares.length) box.append(el('ul',{}, ...d.shares.map(sh=>el('li',{}, `${sh.kind==='deck'?'📚':'🖼️'} ${sh.name} `, el('a',{href:'/s/'+sh.id,target:'_blank',rel:'noopener',text:'เปิด ↗'}), ' ',
    el('button',{class:'linkbtn small danger-link',text:'ลบ',onclick:()=>adminDeleteShare(sh.id)})))));
  box.append(el('p',{class:'note small',text:`อยู่ในห้องเรียน ${d.classes.length} ห้อง`+(d.classes.length?' (ชื่อในห้อง: '+d.classes.map(c=>c.nickname).join(', ')+')':'')}));
}
async function adminSuspend(rd, on){
  if(!(await ask(on ? `ระงับบัญชี “${rd.nickname||rd.id.slice(0,8)}”? จะเข้าสู่ระบบไม่ได้ และถูกนำออกจากเพื่อนทั้งหมด` : `ยกเลิกการระงับบัญชี “${rd.nickname||''}”?`, on?'ระงับบัญชี':'ยกเลิกระงับ'))) return;
  const r=await adminApi('POST',`/users/${rd.id}/suspend`,{ on }); toast(r.ok ? (on?'ระงับบัญชีแล้ว':'ยกเลิกระงับแล้ว') : 'ทำไม่สำเร็จ ลองใหม่'); ADM.data=null; renderAdmin();
}
async function adminDeleteShare(id){
  if(!(await ask('ลบลิงก์แชร์นี้? คนที่มีลิงก์จะเปิดไม่ได้อีก','ลบลิงก์'))) return;
  const r=await adminApi('DELETE','/shares/'+id); toast(r.ok?'ลบลิงก์แล้ว':'ลบไม่สำเร็จ'); ADM.data=null; renderAdmin();
}
function adminResolve(r){
  if(r.resolved_at){ adminApi('POST',`/reports/${r.id}/resolve`,{ reopen:true }).then(()=>{ ADM.data=null; renderAdmin(); }); return; }
  deckNameDialog('ปิดเรื่อง (บันทึกสั้น ๆ ไม่บังคับ)', '', 'ปิดเรื่อง', async note=>{ await adminApi('POST',`/reports/${r.id}/resolve`,{ note }); ADM.data=null; renderAdmin(); }, 'เช่น ระงับบัญชีแล้ว / ไม่พบปัญหา', 300);
}


// ---------- 🧪 เทียบ AI: one picture through Gemini and Claude, side by side (no credits, nothing saved on the server) ----------
const CMP_MODELS={ gemini:['gemini-3.5-flash-lite','gemini-3.8-flash','gemini-3.6-flash'], claude:['claude-haiku-5-5','claude-sonnet-5-5'] };
const CMP_COLORS=['#fe5e7a','#2563b8','#23915a','#f2683a','#7b4bd1','#0f8a9d'];
const CMP_ERR={ not_configured:'ยังไม่ได้ใส่คีย์ของเจ้านี้ใน Cloudflare', refused:'AI ปฏิเสธรูปนี้', busy:'AI ไม่ว่าง ลองใหม่อีกครั้ง', rate_limited:'ใช้เกินโควตา ลองใหม่ทีหลัง', invalid_json:'คำตอบของ AI อ่านไม่ได้', image_rejected:'AI รับรูปนี้ไม่ได้' };
function cmpState(){
  if(!ADM.cmp) ADM.cmp={ img:null, res:null, busy:false, gemini:store.get('pv-cmp-g',CMP_MODELS.gemini[0]), claude:store.get('pv-cmp-c',CMP_MODELS.claude[0]), log:store.get('pv-cmp-log',[]) };
  return ADM.cmp;
}
function renderCompare(v){
  const C=cmpState();
  const sel=p=>{ const x=el('select',{'aria-label':p,onchange:e=>{ C[p]=e.target.value; store.set(p==='gemini'?'pv-cmp-g':'pv-cmp-c',C[p]); }}, ...CMP_MODELS[p].map(m=>el('option',{value:m,text:m}))); x.value=C[p]; return x; };
  const file=el('input',{type:'file',accept:'image/*',hidden:'',onchange:async e=>{ const f=e.target.files[0]; if(!f) return;
    try{ C.img=await loadImageFile(f); C.res=null; renderAdmin(); }catch(err){ toast('เปิดรูปนี้ไม่ได้'); } }});
  v.append(el('div',{class:'admcard'},
    el('p',{class:'note small',text:'สแกนรูปเดียวกันด้วย Gemini และ Claude แล้ววางผลเทียบกัน · ไม่ใช้เครดิต และไม่บันทึกรูปหรือผลไว้ที่เซิร์ฟเวอร์'}),
    el('div',{class:'row cmpctl'}, file,
      el('button',{text:C.img?'🖼️ เปลี่ยนรูป':'🖼️ เลือกรูป',onclick:()=>file.click()}), sel('gemini'), sel('claude'),
      el('button',{class:'primary',text:C.busy?'กำลังเทียบ…':'🧪 เทียบ',disabled:C.img&&!C.busy?null:'',onclick:runCompare}))));
  if(C.res) v.append(el('div',{class:'cmpgrid'}, ...C.res.map(r=>cmpCol(r,C.img))));
  else if(C.img) v.append(el('div',{class:'cmpimg one'}, el('img',{src:C.img.src,alt:''})));
  if(C.log.length) v.append(cmpSummary(C.log));
}
async function runCompare(){
  const C=cmpState(); if(!C.img || C.busy) return;
  C.busy=true; renderAdmin();
  const r=await adminApi('POST','/compare',{ image:C.img.src, gemini:C.gemini, claude:C.claude, langs:S.lang==='de'?['de']:[] }).catch(()=>({ok:false}));
  C.busy=false;
  if(!r.ok){ toast('เทียบไม่สำเร็จ ลองใหม่อีกครั้ง'); if(S.view==='admin') renderAdmin(); return; }
  C.res=r.j.results;
  for(const x of C.res) if(x.ok) C.log.push({ m:x.model, n:x.items.length, ms:x.ms, usd:x.cost_usd });
  C.log=C.log.slice(-200); store.set('pv-cmp-log',C.log);
  if(S.view==='admin' && ADM.tab==='compare') renderAdmin();
}
function cmpCol(r,img){
  const NS='http://www.w3.org/2000/svg', svg=document.createElementNS(NS,'svg');
  svg.setAttribute('viewBox','0 0 1000 1000'); svg.setAttribute('preserveAspectRatio','none');
  const boxes=r.items.map(it=>{ const [a,b,c,d]=it.box.map(n=>Math.max(0,Math.min(1000,+n||0))); return [Math.min(a,c),Math.min(b,d),Math.abs(c-a),Math.abs(d-b)]; });
  boxes.forEach(([x,y,w,h],i)=>{ const rect=document.createElementNS(NS,'rect');
    for(const [k,val] of Object.entries({x,y,width:w,height:h,fill:'none',stroke:CMP_COLORS[i%CMP_COLORS.length],'stroke-width':3,'vector-effect':'non-scaling-stroke'})) rect.setAttribute(k,val);
    svg.append(rect); });
  // the numbers are HTML on top (text inside a stretched SVG would be squashed)
  const nos=boxes.map(([x,y],i)=>el('span',{class:'cmpno',style:`left:${x/10}%;top:${y/10}%;background:${CMP_COLORS[i%CMP_COLORS.length]}`,text:String(i+1)}));
  const meta=`${r.items.length} คำ · ${(r.ms/1000).toFixed(1)} วินาที · token ${(r.tok_in||0).toLocaleString()} / ${(r.tok_out||0).toLocaleString()}`;
  return el('div',{class:'aicard cmpcol'},
    el('h4',{text:(r.provider==='gemini'?'Gemini · ':'Claude · ')+r.model}),
    r.ok ? el('p',{class:'note small',text:meta}) : el('p',{class:'err',text:CMP_ERR[r.error]||`สแกนไม่สำเร็จ (${r.error})`}),
    r.ok ? el('p',{class:'cmpcost',text:r.cost_usd==null ? 'ไม่มีราคาของรุ่นนี้' : `~${(r.cost_usd*THB).toFixed(2)} บาท/รูป ($${r.cost_usd.toFixed(4)})`}) : null,
    el('div',{class:'cmpimg'}, el('img',{src:img.src,alt:''}), svg, ...nos),
    r.ok ? el('ol',{class:'cmplist'}, ...r.items.map(it=>el('li',{}, el('b',{text:it.word}), it.th?el('span',{lang:'th',text:' — '+it.th}):null,
      it.l&&it.l.de ? el('span',{class:'note',text:` · ${it.l.de.a?it.l.de.a+' ':''}${it.l.de.w}`}) : null))) : null);
}
function cmpSummary(log){
  const by={};
  for(const x of log){ const b=by[x.m]=by[x.m]||{n:0,w:0,ms:0,usd:0,priced:0}; b.n++; b.w+=x.n; b.ms+=x.ms; if(x.usd!=null){ b.usd+=x.usd; b.priced++; } }
  return el('div',{class:'aicard wide'}, el('h4',{text:'ค่าเฉลี่ยจากที่เทียบมาแล้ว (เก็บในเครื่องนี้)'}),
    el('table',{class:'cmptab'},
      el('tr',{}, ...['รุ่น','รูป','คำ/รูป','วินาที','บาท/รูป'].map(t=>el('th',{text:t}))),
      ...Object.entries(by).map(([m,b])=>el('tr',{}, el('td',{text:m}), el('td',{text:String(b.n)}), el('td',{text:(b.w/b.n).toFixed(1)}),
        el('td',{text:(b.ms/b.n/1000).toFixed(1)}), el('td',{text:b.priced?(b.usd/b.priced*THB).toFixed(2):'–'})))),
    el('button',{class:'linkbtn small',text:'ล้างค่าเฉลี่ย',onclick:()=>{ ADM.cmp.log=[]; store.set('pv-cmp-log',[]); renderAdmin(); }}));
}

export { renderAdmin };
