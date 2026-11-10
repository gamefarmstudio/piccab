// Piccab — Reporting a share link + the admin page (/admin; accounts in ADMIN_EMAILS).
import { G, $, el, S, toast } from './core.js';
import { closeModal, goHome, openModal } from './scene.js';
import { user } from './account.js';
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
// The admin page itself is in admin-page.js and loads only when an admin opens it (people who aren't admins never download it).
let adminPage=null;
function renderAdmin(){
  if(adminPage) return adminPage.renderAdmin();
  const v=$('#adminView'); v.innerHTML=''; v.append(el('p',{class:'libempty',text:'กำลังโหลด…'}));
  import('./admin-page.js').then(m=>{ adminPage=m; if(S.view==='admin') m.renderAdmin(); }).catch(()=>{
    // usually: a new version went live since this page opened, and the old file is gone
    v.innerHTML=''; v.append(el('p',{class:'err',text:'โหลดหน้าดูแลระบบไม่สำเร็จ'}), el('button',{class:'primary',text:'โหลดใหม่',onclick:()=>location.reload()}));
  });
}
// /admin opens the admin page after sign-in; /admin?tab=… picks the tab
G.adminLinkWanted=/^\/admin\/?$/.test(location.pathname);
if(G.adminLinkWanted){ const t=new URLSearchParams(location.search).get('tab'); if(['reports','feedback','gallery','stats','errors','ai'].includes(t)) ADM.tab=t; }   // /admin?tab=feedback (link in the feedback e-mail)

export { ADM, adminApi, checkAdmin, openReportShare, renderAdmin };
