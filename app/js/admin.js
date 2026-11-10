// Piccab — Reporting a share link + the admin page (/admin; accounts in ADMIN_EMAILS).
import { G, $, el, S, toast } from './core.js';
import { closeModal, goHome, openModal } from './scene.js';
import { user } from './account.js';
import { ago2 } from './friends.js';
import { adminDeleteShare, adminEvidence, adminResolve, adminSuspend, renderAiUsage, renderGalleryAdmin, renderStatsAdmin } from './gallery.js';
import { accessToken } from './sync.js';

// ---------- reporting a share link + 🛡️ admin (accounts listed in ADMIN_EMAILS on the server) ----------
function openReportShare(id){
  openModal(m=>{
    const reasons=['รูปไม่เหมาะสม','คำศัพท์หรือคำแปลไม่เหมาะสม','มีข้อมูลส่วนตัวของคนอื่น','สแปมหรือโฆษณา','อื่น ๆ'];
    const sel=el('select',{'aria-label':'เหตุผล'}); reasons.forEach(r=>sel.add(new Option(r,r)));
    m.append(el('h3',{text:'⚠️ รายงานลิงก์นี้'}), el('label',{},'เหตุผล', sel),
      el('p',{class:'note small',text:'ทีม Piccab จะตรวจสอบ และลบเนื้อหาที่ไม่เหมาะสม เด็ก ๆ ควรบอกครูหรือผู้ปกครองด้วยนะ'}),
      el('div',{class:'row'}, el('span',{class:'sp'}), el('button',{text:'ยกเลิก',onclick:closeModal}), el('button',{class:'danger',text:'ส่งรายงาน',onclick:async e=>{
        e.currentTarget.disabled=true;
        const tok=user?await accessToken():null;
        const r=await fetch('/api/report/share',{ method:'POST', headers:{ 'content-type':'application/json', ...(tok?{authorization:'Bearer '+tok}:{}) }, body:JSON.stringify({ share_id:id, reason:sel.value }) }).catch(()=>null);
        closeModal(); toast(r && r.ok ? 'ส่งรายงานแล้ว ขอบคุณที่ช่วยดูแลความปลอดภัย' : 'ส่งรายงานไม่สำเร็จ ลองใหม่อีกครั้ง', 4000); }})));
  });
}
var ADM={ ok:false, all:false, data:null, open:{}, tab:'reports', ai:null, fb:null, fbAll:false, errs:null, stats:null, gal:null };
async function adminApi(method, path, body){
  const tok=await accessToken();
  const r=await fetch('/api/admin'+path,{ method, headers:{ 'content-type':'application/json', ...(tok?{authorization:'Bearer '+tok}:{}) }, body: body?JSON.stringify(body):undefined });
  const j=await r.json().catch(()=>({}));
  return { ok:r.ok, status:r.status, j };
}
async function checkAdmin(){
  const r=await adminApi('GET','/me').catch(()=>({ok:false}));
  ADM.ok=!!r.ok;
  if(ADM.ok && G.adminLinkWanted){ G.adminLinkWanted=false; goHome('admin'); }
}
async function loadAdmin(){ const r=await adminApi('GET','/reports'+(ADM.all?'?all=1':'')).catch(()=>({ok:false})); ADM.data = r.ok ? r.j : { error: r.status===404 ? 'หน้านี้สำหรับผู้ดูแลระบบเท่านั้น' : 'โหลดไม่สำเร็จ' }; }
function renderAdmin(){
  const v=$('#adminView'); v.innerHTML='';
  v.append(el('div',{class:'ghead lh'}, el('div',{}, el('h2',{text:'🛡️ ดูแลระบบ'}), el('p',{text:'รายงานจากผู้ใช้ · ระงับบัญชี · ลบลิงก์แชร์'})),
    el('button',{class:'ghost',text:'🔄',title:'โหลดใหม่',onclick:()=>{ ADM.data=ADM.ai=ADM.fb=ADM.errs=ADM.stats=ADM.gal=null; renderAdmin(); }})));
  if(!user || !ADM.ok){ v.append(el('p',{class:'libempty',text: user ? 'หน้านี้สำหรับผู้ดูแลระบบเท่านั้น' : 'เข้าสู่ระบบด้วยบัญชีผู้ดูแลก่อน'})); return; }
  const tabs=[['reports','🚩 รายงาน'],['feedback','💬 ความเห็น'],['gallery','🖼️ คลังภาพ'],['stats','📊 การใช้งาน'],['errors','🐞 ข้อผิดพลาด'],['ai','✨ การใช้ AI']];
  v.append(el('div',{class:'seg admtabs'}, ...tabs.map(([k,t])=>el('button',{class:ADM.tab===k?'on':'',text:t,onclick:()=>{ ADM.tab=k; if(k==='ai') ADM.ai=null; renderAdmin(); }}))));
  if(ADM.tab==='ai'){ renderAiUsage(v); return; }
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
// /admin opens the admin page after sign-in; /admin?tab=… picks the tab
G.adminLinkWanted=/^\/admin\/?$/.test(location.pathname);
if(G.adminLinkWanted){ const t=new URLSearchParams(location.search).get('tab'); if(['reports','feedback','gallery','stats','errors','ai'].includes(t)) ADM.tab=t; }   // /admin?tab=feedback (link in the feedback e-mail)

export { ADM, adminApi, adminLoad, checkAdmin, openReportShare, renderAdmin, trialSetup };
