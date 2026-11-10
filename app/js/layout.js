// Piccab — Layout updates and full screen.
import { $, el, isMobile, scene, store, toast, wrap } from './core.js';
import { fsCues, renderChips, renderSub, updateOverlay, updateTag } from './scene.js';
import { positionQ } from './games.js';

// ---------- layout updates ----------
const relayout=()=>{ updateTag(); updateOverlay(); positionQ(); };
// ---------- full screen (the scene fills the screen; tabs and controls stay) ----------
const FS_IN='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>', FS_OUT='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>';
const isFs=()=>document.body.classList.contains('fs');
function fitWrap(){
  const sc=scene(), r=sc.w/sc.h;
  if(!isFs()){ wrap.style.maxWidth=`calc(${isMobile()?56:86}vh * ${r})`; return; }
  const pv=$('#playView'), short=window.innerHeight<560 && window.innerWidth>window.innerHeight;
  if(document.body.classList.contains('fsside')!==short){ document.body.classList.toggle('fsside', short); renderSub(); renderChips(); }
  let availH, availW;
  const main=pv.querySelector('main');
  if(short){                                                   // landscape phone: picture left, controls in a side column
    const cs=getComputedStyle(pv);
    availH=window.innerHeight-parseFloat(cs.paddingTop)-parseFloat(cs.paddingBottom)-2;
    availW=main.clientWidth;
    // A tall picture leaves empty sides: offer "fill the width" (scroll up/down) — on by default — or "whole picture".
    const narrow=availH*r < availW*0.9;
    document.body.classList.toggle('fsnarrow', narrow);
    document.body.classList.toggle('fsfill', narrow && fsFill);
    const fb=$('#fillBtn'); fb.textContent = fsFill ? '🔲 ดูทั้งภาพ' : '↔️ ขยายเต็มจอ';
    fb.title = fsFill ? 'ย่อให้เห็นทั้งภาพในจอเดียว' : 'ขยายภาพให้เต็มความกว้าง แล้วเลื่อนขึ้นลงดู';
    requestAnimationFrame(fsCues);
    if(narrow && fsFill){
      if(!store.get('pv-fsfill-tip', false)){ store.set('pv-fsfill-tip', true); setTimeout(()=>toast('↕️ เลื่อนขึ้น-ลงเพื่อดูส่วนอื่นของภาพ · กด 🔲 ดูทั้งภาพ เพื่อย่อ', 4000), 600); }
      main.style.height=availH+'px';
      wrap.style.maxWidth=availW+'px';
      return;
    }
    main.style.height='';
  } else {
    main.style.height=''; document.body.classList.remove('fsnarrow','fsfill');
    // Height of everything except the picture (tabs, controls, word chips), measured from the boxes themselves:
    // #playView fills the screen, so its scrollHeight would include the picture's current size and it could never grow.
    const cs=getComputedStyle(pv); let other=0;
    for(const c of pv.children){
      const b=c.getBoundingClientRect(); if(!b.height) continue;
      if(c.contains(wrap)){ other+=b.height-wrap.getBoundingClientRect().height+8; continue; }   // e.g. word chips under the picture
      const m=getComputedStyle(c); other+=b.height+parseFloat(m.marginTop)+parseFloat(m.marginBottom);
    }
    availH=window.innerHeight-parseFloat(cs.paddingTop)-parseFloat(cs.paddingBottom)-other-6;
    availW=pv.clientWidth-parseFloat(cs.paddingLeft)-parseFloat(cs.paddingRight);
  }
  wrap.style.maxWidth=Math.max(120, Math.min(availW, Math.max(160,availH)*r))+'px';
}
var fsFill=store.get('pv-fsfill', true);
{ const m=$('#playView>main');
  const cue=dir=>{ const b=el('button',{type:'button',class:'fscue '+dir,'aria-label':dir==='up'?'เลื่อนขึ้น':'เลื่อนลง',title:dir==='up'?'เลื่อนขึ้น':'เลื่อนลง'}, dir==='up'?'▲':'▼');
    b.addEventListener('click',e=>{ e.stopPropagation(); m.scrollBy({ top:(dir==='up'?-1:1)*m.clientHeight*0.6, behavior:'smooth' }); }); return b; };
  m.prepend(cue('up')); m.append(cue('down'));
  m.addEventListener('scroll', fsCues, { passive:true });
}
$('#fillBtn').addEventListener('click', e=>{
  e.stopPropagation(); fsFill=!fsFill; store.set('pv-fsfill', fsFill);
  fitWrap(); requestAnimationFrame(()=>{ relayout(); const m=$('#playView>main'); m.scrollTop=Math.max(0,(m.scrollHeight-m.clientHeight)/2); });
});
// In full screen, also draw into the camera-notch strip (otherwise Android leaves a black bar); the padding keeps controls clear of it.
const vpMeta=document.querySelector('meta[name=viewport]'), vpBase=vpMeta ? vpMeta.content : '';
function setFsUi(on){
  document.body.classList.toggle('fs', on); if(!on){ document.body.classList.remove('fsside','fsnarrow','fsfill'); $('#playView>main').style.height=''; }
  if(vpMeta) vpMeta.content = on ? vpBase+', viewport-fit=cover' : vpBase;
  const b=$('#fsBtn'); b.innerHTML=on?FS_OUT:FS_IN; b.setAttribute('aria-label', on?'ออกจากเต็มจอ':'เต็มจอ'); b.title=b.getAttribute('aria-label');
  fitWrap(); requestAnimationFrame(()=>{ fitWrap(); relayout(); });
}
async function enterFs(){
  setFsUi(true);
  // Real full screen where the browser allows it (hides the address bar); otherwise the page-level layout above still applies (e.g. iPhone).
  const de=document.documentElement, req=de.requestFullscreen||de.webkitRequestFullscreen;
  if(req && !(document.fullscreenElement||document.webkitFullscreenElement)){
    try{ await req.call(de,{navigationUI:'hide'}); }catch(e){}
    // Phones: follow the phone when it is turned, even if auto-rotate is off in the phone's settings (Android Chrome).
    if(isMobile() && screen.orientation && screen.orientation.lock){ screen.orientation.lock('any').catch(()=>{}); }
  }
  const sc=scene();
  if(isMobile() && sc.w>sc.h*1.15 && window.innerHeight>window.innerWidth) toast('📱↻ หมุนโทรศัพท์เป็นแนวนอน ภาพจะใหญ่ขึ้น', 3000);
}
function exitFs(){
  if(document.fullscreenElement||document.webkitFullscreenElement){
    try{ (document.exitFullscreen||document.webkitExitFullscreen).call(document); }catch(e){}
  }
  try{ screen.orientation && screen.orientation.unlock && screen.orientation.unlock(); }catch(e){}
  setFsUi(false);
}
$('#fsBtn').addEventListener('click', e=>{ e.stopPropagation(); isFs()?exitFs():enterFs(); });
$('#fsExit').addEventListener('click', e=>{ e.stopPropagation(); exitFs(); });
['fullscreenchange','webkitfullscreenchange'].forEach(t=>document.addEventListener(t,()=>{
  // Leaving the browser's full screen (Esc, back gesture) also leaves our layout.
  if(!(document.fullscreenElement||document.webkitFullscreenElement) && isFs()) setFsUi(false);
}));
window.addEventListener('resize',()=>{ if(isFs()) fitWrap(); });
$('#fsBtn').innerHTML=FS_IN;
if(window.ResizeObserver) new ResizeObserver(relayout).observe(wrap); else window.addEventListener('resize',relayout);
if(document.fonts && document.fonts.ready) document.fonts.ready.then(relayout);

export { exitFs, fitWrap, isFs };
