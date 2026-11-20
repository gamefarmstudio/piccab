// Piccab — Install as an app (PWA) + offline messages.
import { $, el, S, store, tally, toast } from './core.js';
import { closeModal, openModal } from './scene.js';
import { renderHome } from './home.js';
import { checkAI } from './editor.js';
import { oauthErr, user } from './account.js';
import { syncNow } from './sync.js';

// ---------- install as an app (PWA) + offline ----------
// (var + function declarations: renderHome() may ask before this part of the script has run)
var installEvt=null;
function isStandalone(){ return matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches || navigator.standalone===true; }
function isIOS(){ return /iphone|ipad|ipod/i.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints>1); }
function installAvailable(){ return !isStandalone() && (!!installEvt || isIOS()); }
function installUi(){ const l=$('#installLink'); if(l) l.hidden=!installAvailable(); if(S.view==='home') renderHome(); }
async function installApp(){
  if(installEvt){
    const ev=installEvt; installEvt=null;
    ev.prompt();
    const r=await ev.userChoice.catch(()=>null);
    if(r && r.outcome==='dismissed') installEvt=ev;                   // still offerable next time
    installUi(); return;
  }
  if(isIOS()) openModal(m=>m.append(el('h3',{text:'📲 ติดตั้ง Piccab บน iPhone / iPad'}),
    el('ol',{class:'iosteps'},
      el('li',{}, 'เปิดหน้านี้ใน ', el('b',{text:'Safari'})),
      el('li',{}, 'แตะปุ่ม ', el('b',{text:'แชร์'}), ' (สี่เหลี่ยมมีลูกศรชี้ขึ้น) ที่แถบด้านล่างหรือด้านบน'),
      el('li',{}, 'เลื่อนลงแล้วแตะ ', el('b',{text:'เพิ่มไปยังหน้าจอโฮม'}), ' (Add to Home Screen)'),
      el('li',{}, 'แตะ ', el('b',{text:'เพิ่ม'}), ' แล้วเปิด Piccab จากไอคอนบนหน้าจอโฮมได้เลย')),
    el('div',{class:'row'}, el('span',{class:'sp'}), el('button',{class:'primary',text:'เข้าใจแล้ว',onclick:closeModal}))));
}
window.addEventListener('beforeinstallprompt',e=>{ e.preventDefault(); installEvt=e; installUi(); });
window.addEventListener('appinstalled',()=>{ installEvt=null; installUi(); toast('ติดตั้ง Piccab แล้ว เปิดจากหน้าจอโฮมได้เลย 🎉', 4000); });
$('#installLink').addEventListener('click',installApp);
// From the landing page's "📲 ติดตั้งเป็นแอป" (/app?install): explain, and install with one more tap.
function openInstallHelp(){
  if(matchMedia('(display-mode: standalone)').matches){ toast('เปิด Piccab แบบแอปอยู่แล้ว 🎉'); return; }
  if(isIOS()){ installApp(); return; }
  openModal(m=>m.append(el('h3',{text:'📲 ติดตั้ง Piccab เป็นแอป'}),
    el('p',{text:'เปิดจากไอคอนบนหน้าจอโฮมได้เหมือนแอปทั่วไป และฝึกต่อได้แม้ไม่มีอินเทอร์เน็ต'}),
    installEvt ? null : el('p',{class:'note',text:'ถ้าไม่มีหน้าต่างติดตั้งขึ้นมา: เปิดเมนูของเบราว์เซอร์ (⋮ หรือ ⋯) แล้วเลือก “ติดตั้งแอป” หรือ “เพิ่มลงในหน้าจอหลัก”'}),
    el('div',{class:'row'}, el('span',{class:'sp'}), el('button',{text:'ไว้ทีหลัง',onclick:closeModal}),
      el('button',{class:'primary',text:'ติดตั้ง',onclick:()=>{ closeModal(); if(installEvt) installApp(); else toast('ใช้เมนูของเบราว์เซอร์ → “ติดตั้งแอป” ได้เลย', 4000); }}))));
}
window.addEventListener('offline',()=>toast('ออฟไลน์อยู่ — ฝึกต่อได้ตามปกติ ข้อมูลจะซิงค์เมื่อกลับมาออนไลน์', 4500));
window.addEventListener('online',()=>{ toast('กลับมาออนไลน์แล้ว', 2500); checkAI(); if(user) syncNow(true); });
if('serviceWorker' in navigator && (location.protocol==='https:' || location.hostname==='localhost')){
  window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(e=>console.warn('service worker', e)));
}
// ---------- a new version is out → offer to reload ----------
// An app left open (or kept in the background on a phone) keeps the version it opened with. Now and then, and when it
// comes back on screen, look at /app: if it now loads other built files, show a bar — the reload is the user's tap
// (never in the middle of a round).
var UPD={ at:Date.now(), shown:false };
const buildOf=html=>{ const m=String(html).match(/\/assets\/app-[\w-]+\.js/); return m ? m[0] : null; };
function myBuild(){ const s=document.querySelector('script[src*="/assets/app-"]'); return s ? new URL(s.src, location.href).pathname : null; }
async function updCheck(force){
  if(UPD.shown || navigator.onLine===false) return;
  const mine=myBuild(); if(!mine) return;                     // dev server: nothing to compare
  if(!force && Date.now()-UPD.at < 10*60*1000) return;       // at most every 10 minutes
  UPD.at=Date.now();
  try{
    const r=await fetch('/app', { cache:'no-store' });
    if(!r.ok) return;
    const b=buildOf(await r.text());
    if(b && b!==mine) updShow();
  }catch(e){}
}
function updShow(){
  if(UPD.shown) return; UPD.shown=true;
  const bar=el('div',{class:'updbar',role:'status'},
    el('span',{text:'✨ มี Piccab เวอร์ชันใหม่'}),
    el('button',{class:'primary',text:'อัปเดต',onclick:()=>{ tally('update_reload'); location.reload(); }}),
    el('button',{class:'icon','aria-label':'ไว้ทีหลัง',title:'ไว้ทีหลัง',text:'✕',onclick:()=>bar.remove()}));
  document.body.append(bar);
}
document.addEventListener('visibilitychange',()=>{ if(!document.hidden) updCheck(false); });
setInterval(()=>{ if(!document.hidden) updCheck(false); }, 30*60*1000);

if(oauthErr) setTimeout(()=>toast(/access_denied|cancel/i.test(oauthErr.code+' '+oauthErr.desc) ? 'ยกเลิกการเข้าสู่ระบบด้วย Google แล้ว' : 'เข้าสู่ระบบด้วย Google ไม่สำเร็จ: '+oauthErr.desc, 5000), 400);
{ const f=store.get('pv-flash',null); if(f){ try{ localStorage.removeItem('pv-flash'); }catch(e){} setTimeout(()=>toast(f,4000),300); } }

export { installApp, installAvailable, installUi, openInstallHelp };
