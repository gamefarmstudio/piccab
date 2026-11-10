// Piccab — Home + library (the scene list) and "my words".
import { G, $, el, errPage, ic, itemsOf, LOC, mean, NS, pk, progress, S, scenes, store, tally, toast, UI } from './core.js';
import { dayNo, dueOn, dueWords } from './progress.js';
import { closeModal, goHome, IMG_PENDING, openModal, openScene, progOf, rrPath, sceneImg } from './scene.js';
import { openPreview, renderWords, startDueReview, startReview } from './decks.js';
import { aiCredits, aiMonthly, translateAll } from './editor.js';
import { examIn, examLabel, isList, openSheetMaker } from './sheets.js';
import { user } from './account.js';
import { isStudent, renderClass } from './classes.js';
import { renderAdmin } from './admin.js';
import { renderPicLib } from './gallery.js';
import { installApp, installAvailable } from './pwa.js';
import { accessToken } from './sync.js';

// ---------- home + library ----------
let recent=store.get('pv-recent',{}); if(typeof recent!=='object'||!recent) recent={};
let lastMode=store.get('pv-lastmode',{}); if(typeof lastMode!=='object'||!lastMode) lastMode={};
let days=store.get('pv-days',{}); if(typeof days!=='object'||!days) days={};
const MODE_NAMES={learn:'ดูคำศัพท์', quiz:'ทบทวน (พิมพ์)', find:'ฟังแล้วหา', speak:'ฝึกพูด'};
const dkey=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
function markActive(words){ const k=dkey(new Date()); if(!days[k]) days[k]={n:0}; days[k].n+=words||0; store.set('pv-days',days); }
function streak(){ const d=new Date(); if(!days[dkey(d)]) d.setDate(d.getDate()-1); let n=0; while(days[dkey(d)]){ n++; d.setDate(d.getDate()-1); } return n; }
function sceneTime(sc){ return recent[sc.id] || (sc.builtin?0:(parseInt(sc.id.slice(1),36)||0)); }
function byRecent(a,b){ return sceneTime(b)-sceneTime(a); }
function greet(){ const h=new Date().getHours(); return h<11?'อรุณสวัสดิ์':h<16?'สวัสดีตอนบ่าย':'สวัสดีตอนเย็น'; }
function renderGallery(){ if(S.view==='library') renderLibrary(); else if(S.view==='words') renderWords(); else if(S.view==='class') renderClass(); else if(S.view==='admin') renderAdmin(); else renderHome(); }

function ago(ts){
  if(!ts) return 'ยังไม่เคยเปิด';
  const sec=(Date.now()-ts)/1000;
  if(sec<90) return 'เมื่อครู่';
  if(sec<3600) return Math.round(sec/60)+' นาทีที่แล้ว';
  if(sec<86400) return Math.round(sec/3600)+' ชั่วโมงที่แล้ว';
  const d=Math.floor(sec/86400);
  if(d===1) return 'เมื่อวานนี้';
  if(d<7) return d+' วันก่อน';
  if(d<14) return 'สัปดาห์ที่แล้ว';
  if(d<60) return Math.floor(d/7)+' สัปดาห์ก่อน';
  return new Date(ts).toLocaleDateString(LOC,{day:'numeric',month:'short'});
}
function progBar(n,d,cls){ const b=el('span',{class:'bar'+(n&&d===n?' full':'')+(cls?' '+cls:'')},el('i')); b.firstChild.style.width=(n?d/n*100:0)+'%'; return b; }
function anchorOf(it){ return it.at ? {x:it.at[0], y:it.at[1]} : (it.w!=null ? {x:it.x+it.w/2, y:it.y+it.h*0.2} : null); }
// Scene image cropped to a frame (like object-fit: cover) with up to 4 word labels that stay on their objects.
function labeledImg(sc, ar){
  const sv=document.createElementNS(NS,'svg');
  sv.setAttribute('viewBox',`0 0 ${sc.w} ${sc.h}`); sv.setAttribute('preserveAspectRatio','xMidYMid slice');
  const im=document.createElementNS(NS,'image');
  im.setAttribute('href',sceneImg(sc)); im.setAttribute('width',sc.w); im.setAttribute('height',sc.h); im.setAttribute('preserveAspectRatio','none');
  sv.appendChild(im);
  const ia=sc.w/sc.h; let vx0=0,vx1=sc.w,vy0=0,vy1=sc.h;
  if(ia>ar){ const vw=sc.h*ar; vx0=(sc.w-vw)/2; vx1=vx0+vw; } else { const vh=sc.w/ar; vy0=(sc.h-vh)/2; vy1=vy0+vh; }
  const VW=vx1-vx0, fs=VW*0.036, picks=[];
  for(const it of (isList(sc) ? [] : Object.values(itemsOf(sc)))){ if(!it.word) continue;   // a word sheet: no labels, they would give the answers away
    const a=anchorOf(it); if(!a) continue;
    if(a.x<vx0+VW*0.1||a.x>vx1-VW*0.1||a.y<vy0+fs*2.2||a.y>vy1-fs*2.2) continue;
    if(picks.some(p=>Math.abs(p.x-a.x)<VW*0.3 && Math.abs(p.y-a.y)<fs*3.6)) continue;
    picks.push({x:a.x,y:a.y,it}); if(picks.length>=4) break;
  }
  // one-line pills "word · meaning" centred on their objects; widths are measured once the picture is on screen
  const hh=fs*1.75, pad=fs*0.6, pills=[];
  for(const {x,y,it} of picks){   // it: in the language being practised
    const th=mean(it).split(' (')[0].slice(0,16);
    const g=document.createElementNS(NS,'g');
    const r=document.createElementNS(NS,'rect');
    Object.entries({height:hh,rx:hh/2,fill:'#fff','fill-opacity':.95,stroke:'#e4dacd','stroke-width':fs*0.04}).forEach(([k,v])=>r.setAttribute(k,v));
    const t=document.createElementNS(NS,'text');
    Object.entries({'font-size':fs,'font-weight':600,fill:'#2d2a5a','font-family':'Fredoka, Sarabun, sans-serif'}).forEach(([k,v])=>t.setAttribute(k,v));
    t.append(it.word);
    if(th){ const s2=document.createElementNS(NS,'tspan');
      Object.entries({'font-size':fs*0.78,'font-weight':400,fill:'#77728c','font-family':'Sarabun, sans-serif',dx:fs*0.45}).forEach(([k,v])=>s2.setAttribute(k,v));
      s2.textContent=th; t.append(s2); }
    g.append(r,t); sv.appendChild(g);
    const guess=it.word.length*0.56*fs + th.length*0.42*fs + (th?fs*0.45:0);
    pills.push({x,y,r,t,guess});
  }
  const place=measure=>pills.forEach(p=>{
    let tw=p.guess; if(measure){ try{ const m=p.t.getComputedTextLength(); if(m>0) tw=m; }catch(e){} }
    const w=tw+pad*2, x0=Math.max(vx0+fs*0.3,Math.min(vx1-w-fs*0.3,p.x-w/2)), y0=Math.max(vy0+fs*0.3,Math.min(vy1-hh-fs*0.3,p.y-hh/2));
    p.r.setAttribute('x',x0); p.r.setAttribute('y',y0); p.r.setAttribute('width',w);
    p.t.setAttribute('x',x0+pad); p.t.setAttribute('y',y0+hh*0.68);
  });
  place(false);
  if(pills.length){ const go=()=>{ if(sv.isConnected) place(true); }; requestAnimationFrame(go); if(document.fonts && document.fonts.ready) document.fonts.ready.then(()=>requestAnimationFrame(go)); }
  return sv;
}
function sceneCard(sc, lib){   // lib: {hit} in the library — adds who made it, when it was opened and a search hit
  const {n,d}=progOf(sc), full=n&&d===n, own=sc.builtin?'ตัวอย่าง':'ของฉัน';
  return el('button',{class:'card'+(lib?' lcard':''),onclick:()=>openPreview(sc.id),'aria-label':'ดูตัวอย่างฉาก '+sc.name},
    el('div',{class:'thumb'}, el('img',{alt:'',loading:'lazy',src:sceneImg(sc)}),
      lib ? el('span',{class:'own '+(sc.builtin?'smp':'mine'),title:own}, ic(sc.builtin?'auto_stories':'person')) : null,
      n?el('span',{class:'cnt'+(full?' full':''),title:`${n} คำ`}, ic(full?'check_circle-fill':'sell-fill'), String(n)):null),
    el('div',{class:'cbody'},
      el('b',{text:sc.name}),
      n ? el('div',{class:'meta2'+(full?' okt':'')}, el('span',{text:`${d}/${n}`}), full ? ic('check_circle') : el('span',{text:Math.round(d/n*100)+'%'}))
        : el('div',{class:'meta2'}, el('span',{text:'ยังไม่มีคำศัพท์'})),
      progBar(n,d),
      lib ? el('span',{class:'ago'}, ic('schedule'), ago(recent[sc.id] || (sc.builtin?0:sceneTime(sc)))) : null,
      lib && lib.hit ? el('span',{class:'hit'}, ic('search'), lib.hit) : null));
}

function reviewTile(){
  const all=allWords(), learned=all.filter(w=>w.st!=='todo').length;
  if(!learned) return el('div',{class:'tile srs idle'},
    el('span',{class:'ic'},ic('autorenew')),
    el('span',{class:'tt'}, el('b',{text:'ทบทวนตามรอบ'}), el('small',{text:'พิมพ์คำให้ผ่าน แล้วคำจะกลับมาตอนใกล้ลืม'})));
  const due=dueWords(all).length;
  if(!due){
    const t=dayNo(); let nd=0, nn=0;
    for(let k=1;k<=120 && !nn;k++){ nn=dueOn(t+k, all); nd=k; }
    return el('div',{class:'tile srs done'},
      el('span',{class:'ic'},ic('task_alt')),
      el('span',{class:'tt'}, el('b',{text:'ทบทวนครบแล้ว'}),
        el('small',{text: nn ? (nd===1?`พรุ่งนี้มี ${nn} คำ`:`อีก ${nd} วันมี ${nn} คำ`) : `จำได้แล้ว ${learned} คำ`})));
  }
  const keep=!days[dkey(new Date())] && streak()>0;
  return el('button',{class:'tile srs due',onclick:startDueReview,'aria-label':`คำที่ต้องทบทวนวันนี้ ${due} คำ`},
    el('span',{class:'ic'},ic('bolt-fill')),
    el('span',{class:'tt'}, el('b',{}, 'ทบทวนด่วน', el('span',{class:'num',text:String(due)})),
      el('small',{text: keep ? `รักษา 🔥 ${streak()} วันติดกัน` : 'คำที่ใกล้ลืม · ครั้งละ 10 คำ'})),
    el('span',{class:'arrow'},ic('arrow_forward')));
}
const MODE_IC={learn:'visibility', quiz:'keyboard', find:'hearing', speak:'mic'};
const MODE_DESC={learn:'แตะภาพ ดูคำ ฟังเสียง', quiz:'พิมพ์ชื่อสิ่งของ', find:'ฟังแล้วแตะให้ถูก', speak:'พูดใส่ไมค์'};
function modeSheet(sc){
  const md=lastMode[sc.id]||'learn';
  openModal(m=>{
    m.classList.add('sheet','modesheet'); $('#modal').classList.add('sheetmode');
    m.append(
      el('div',{class:'shhead'}, el('h3',{text:sc.name}), el('button',{class:'x','aria-label':'ปิด',text:'✕',onclick:closeModal})),
      el('div',{class:'mgrid'}, ['learn','quiz','find','speak'].map(k=>
        el('button',{class:'mopt m-'+k+(k===md?' on':''),'data-mode':k,onclick:()=>{ closeModal(); openScene(sc.id,k); }},
          el('span',{class:'mi'},ic(MODE_IC[k])), el('b',{text:MODE_NAMES[k]}), el('small',{text:MODE_DESC[k]})))),
      el('button',{class:'linkbtn small more',onclick:()=>{ closeModal(); openPreview(sc.id); }}, 'ดูภาพทั้งฉาก', ic('arrow_forward')));
  });
}
const homeCredit=()=> !G.aiReady ? 'อัปโหลดแล้วตีกรอบใส่คำศัพท์เอง'
  : (aiCredits && user && typeof G.aiLeft==='number') ? `✨ AI เหลือ ${G.aiLeft}/${aiMonthly} ครั้งเดือนนี้` : '✨ AI หาคำศัพท์ให้อัตโนมัติ';
function welcomeCard(){
  const step=(icon,text)=>el('li',{}, el('span',{class:'si'},ic(icon)), el('span',{text}));
  return el('div',{class:'welcome'},
    el('button',{class:'x','aria-label':'ไว้ทีหลัง',title:'ไว้ทีหลัง',text:'✕',onclick:()=>{ store.set('pv-welcome-hide',true); renderHome(); }}),
    el('span',{class:'wl-art','aria-hidden':'true'}, ic('photo_camera-fill')),
    el('h3',{text:'สร้างฉากแรกของคุณ'}),
    el('p',{text:'ถ่ายรูปของรอบตัว แล้วฝึกคำศัพท์จากของจริง'}),
    el('ol',{class:'wl-steps'},
      step('photo_camera','ถ่ายรูป'),
      step('sell-fill', G.aiReady?'AI ใส่ป้ายคำ':'ตีกรอบใส่คำ'),
      step('mic','ดู ฟัง พูด')),
    el('div',{class:'wl-acts'},
      el('button',{class:'primary big',onclick:()=>$('#fileCam').click()}, ic('photo_camera'), 'ถ่ายรูป'),
      el('button',{class:'cbtn',onclick:()=>$('#fileImg').click()}, ic('imagesmode'), 'เลือกรูป')),
    el('p',{class:'capt',id:'homeCredit',text:homeCredit()}),
    el('button',{class:'linkbtn wslink',onclick:()=>openSheetMaker()}, ic('edit_note'), 'มีชีทคำศัพท์จากครู? ทำชุดคำไว้ฝึกก่อนสอบ'));
}
// "Dictation in 3 days": practise the sheet's words (the ones not passed yet first)
function examTile(sc){
  const d=examIn(sc), {n,d:ok}=progOf(sc), words=allWords().filter(w=>w.sc===sc);
  return el('button',{class:'tile exam'+(d<=1?' soon':''),onclick:()=>startReview(words),'aria-label':`${examLabel(d)}: ${sc.name}`},
    el('span',{class:'ic'},ic('event')),
    el('span',{class:'tt'}, el('b',{}, sc.name, el('span',{class:'num when',text:examLabel(d)})),
      el('small',{text: ok>=n && n ? `ผ่านครบ ${n} คำแล้ว · ลองสอบจำลองอีกรอบ` : `ผ่านแล้ว ${ok}/${n} คำ · ฝึกเขียนตามคำบอก`})),
    el('span',{class:'arrow'},ic('arrow_forward')));
}
function statChip(icon, cls, n, label){ return el('span',{class:'stat chip '+cls,role:'img',title:label,'aria-label':label}, ic(icon), el('b',{text:String(n)})); }
function streakPill(){ const p=$('#streakPill'), n=streak(); p.replaceChildren(ic('local_fire_department-fill','fire'), String(n)); p.setAttribute('aria-label',`${n} วันติดกัน`); p.classList.toggle('zero',!n); }
function renderHome(){
  streakPill();
  if(S.lang!=='en') setTimeout(()=>translateAll(S.lang), 300);
  const h=$('#homeView'); h.innerHTML='';
  const all=scenes(), words=allWords();
  const stars=Object.values(progress).reduce((a,p)=>a+Object.keys((p&&p.star)||{}).length,0);
  const today=(days[dkey(new Date())]||{}).n||0, passed=words.filter(w=>w.st!=='todo').length;
  h.append(el('div',{class:'hello'},
    el('h2',{}, el('span',{class:'spark','aria-hidden':'true',text:'✨'}), greet()),
    el('div',{class:'stats'},
      statChip('menu_book','today',today,`วันนี้ฝึก ${today} คำ`),
      statChip('check_circle-fill','ok',passed,`ผ่านแล้ว ${passed} คำ`),
      statChip('star-fill','gold',stars,`จำได้ ${stars} ดาว`))));
  if(installAvailable() && !store.get('pv-install-hide',false)){
    h.append(el('div',{class:'tile install'},
      el('span',{class:'ic'},ic('download')),
      el('span',{}, el('b',{text:'ติดตั้งเป็นแอป'}), el('small',{text:'เปิดจากหน้าจอโฮม ฝึกได้แม้ไม่มีเน็ต'})),
      el('button',{class:'primary',text:'ติดตั้ง',onclick:installApp}),
      el('button',{class:'x','aria-label':'ไม่ต้องแสดงอีก',title:'ไม่ต้องแสดงอีก',text:'✕',onclick:()=>{ store.set('pv-install-hide',true); renderHome(); }})));
  }
  // first visit: nothing of their own yet → invite them to make a scene from a photo
  const firstRun=!all.some(sc=>!sc.builtin) && !store.get('pv-welcome-hide',false);
  if(firstRun) h.append(welcomeCard());
  // continue
  const started=all.filter(sc=>recent[sc.id]).sort(byRecent);
  const cur=started[0]||all.find(sc=>Object.keys(sc.items).length)||all[0];
  if(cur){
    const {n,d}=progOf(cur), md=lastMode[cur.id]||'learn', full=n&&d===n;
    h.append(el('div',{class:'hsec'}, el('h3',{}, ic('play_circle'), started.length?'เรียนต่อ':firstRun?'ลองฉากตัวอย่าง':'เริ่มเรียน'),
      n ? el('span',{class:'hcount'+(full?' full':''),title:`ทบทวนแล้ว ${d}/${n} คำ`}, el('i',{class:'dot'}), `${d}/${n}`) : null));
    const cimg=el('div',{class:'cimg',onclick:()=>openPreview(cur.id),title:'ดูตัวอย่างฉาก'});
    cimg.append(labeledImg(cur, window.innerWidth>=900 ? 1.7 : 3/2));
    h.append(el('div',{class:'cont'}, cimg,
      el('div',{class:'cb'},
        el('div',{class:'row1'}, el('h4',{text:cur.name}),
          n ? el('span',{class:'pct'+(full?' full':''),title:`ทบทวนแล้ว ${d}/${n} คำ`}, ic('check_circle'), Math.round(d/n*100)+'%') : el('span',{text:'ยังไม่มีคำศัพท์'})),
        progBar(n,d,'cbar'),
        el('div',{class:'acts'},
          n ? el('button',{class:'primary big',title:MODE_NAMES[md],onclick:()=>openScene(cur.id,md)},
                ic('play_arrow-fill'), el('span',{text:started.length?'ฝึกต่อ':'เริ่มฝึก'}), el('span',{class:'mtag',title:MODE_NAMES[md]},ic(MODE_IC[md])))
            : el('button',{class:'primary big',onclick:()=>openScene(cur.id,'learn',true)}, ic('edit'), el('span',{text:'ใส่คำศัพท์'})),
          el('button',{class:'icbtn',title:'เลือกโหมด','aria-label':'เลือกโหมด',onclick:()=> n ? modeSheet(cur) : openPreview(cur.id)}, ic('tune'))))));
  }
  // what to practise
  const pend=all.map(sc=>{ const {n,d}=progOf(sc); return {sc, left:n-d, started:!!recent[sc.id]}; }).filter(x=>x.left>0);
  const totalLeft=pend.reduce((a,x)=>a+x.left,0), nScenes=pend.length;
  const exams=all.filter(sc=>{ const d=examIn(sc); return d!==null && d>=0; }).sort((a,b)=>examIn(a)-examIn(b)).slice(0,2);
  if(exams.length) h.append(el('div',{class:'tiles exams'}, exams.map(examTile)));
  h.append(el('div',{class:'tiles'}, reviewTile(),
    totalLeft
      ? el('button',{class:'tile fresh',onclick:()=>startReview(allWords()),'aria-label':`ฝึกคำใหม่ ${totalLeft} คำ`},
          el('span',{class:'ic'},ic('edit_note')),
          el('span',{class:'tt'}, el('b',{}, 'คำใหม่', el('span',{class:'num',text:String(totalLeft)})), el('small',{text:`จาก ${nScenes} ฉาก · ครั้งละ ${Math.min(10,totalLeft)} คำ`})),
          el('span',{class:'arrow'},ic('arrow_forward')))
      : el('div',{class:'tile fresh'}, el('span',{class:'ic'},ic('celebration')), el('span',{class:'tt'}, el('b',{text:'ผ่านครบทุกคำแล้ว'}), el('small',{text:'ลองสร้างฉากใหม่จากรูปรอบตัว'})))));
  if(firstRun){ h.append(feedbackStrip()); return; }   // the welcome card already has the photo buttons, and there are no other scenes yet
  // add a scene
  h.append(el('div',{class:'createrow'},
    el('button',{class:'cbtn',onclick:()=>$('#fileCam').click()}, ic('photo_camera'), 'ถ่ายรูป'),
    el('button',{class:'cbtn',onclick:()=>$('#fileImg').click()}, ic('imagesmode'), 'เลือกรูป'),
    el('button',{class:'cbtn wide',onclick:()=>openSheetMaker()}, ic('edit_note'), 'ชีทคำศัพท์จากครู')));
  h.append(el('p',{class:'capt',id:'homeCredit',text:homeCredit()}));
  // recent
  const list=all.filter(sc=>sc!==cur).sort(byRecent).slice(0,4);
  h.append(el('div',{class:'hsec'}, el('h3',{}, ic('grid_view'), 'ฉากล่าสุด'),
    el('button',{class:'linkbtn more','aria-label':`ดูทั้งหมด ${all.length} ฉาก`,title:`ดูทั้งหมด ${all.length} ฉาก`,onclick:()=>goHome('library')}, String(all.length), ic('arrow_forward'))));
  if(list.length){ const grid=el('div',{class:'grid two'}); list.forEach(sc=>grid.append(sceneCard(sc))); h.append(grid); }
  else h.append(el('p',{class:'empty',text:'ยังไม่มีฉากอื่น ลองถ่ายรูปหรือเลือกรูปเพื่อสร้างฉากแรกของคุณ'}));
  h.append(feedbackStrip());
}
function feedbackStrip(){
  return el('button',{type:'button',class:'fbstrip',onclick:()=>openFeedback()}, el('span',{class:'ic'},ic('chat')),
    el('span',{class:'tt'}, el('b',{text:'ใช้แล้วเป็นอย่างไรบ้าง?'}), el('small',{text:'แจ้งปัญหา หรือบอกไอเดียให้เราได้เลย'})), el('span',{class:'arrow'},ic('arrow_forward')));
}
// 💬 Feedback: a few lines, optionally an e-mail to reply to. Sent with where in the app it came from (and the browser, by the server).
function openFeedback(kind){
  const page=errPage();
  let k=kind||'problem';
  openModal(m=>{
    m.classList.add('fbbox');
    const kinds=[['problem','🐞 แจ้งปัญหา','เกิดอะไรขึ้น? กดอะไรอยู่ตอนนั้น'],['idea','💡 ไอเดีย','อยากให้มีอะไร หรืออยากให้ทำแบบไหน'],['other','💬 อื่นๆ','บอกเราได้เลย']];
    const seg=el('div',{class:'fchips fbkind',role:'group','aria-label':'ประเภท'});
    const ta=el('textarea',{rows:'5',maxlength:'2000','aria-label':'ข้อความ'});
    const drawSeg=()=>{ seg.replaceChildren(...kinds.map(([v,t])=>el('button',{type:'button',class:v===k?'on':'',onclick:()=>{ k=v; drawSeg(); }}, t))); ta.placeholder=kinds.find(x=>x[0]===k)[2]; };
    drawSeg();
    const mail=el('input',{type:'email',maxlength:'200',autocomplete:'email','aria-label':'อีเมลสำหรับตอบกลับ',placeholder:'name@example.com',value:(user && !isStudent() && user.email)||''});
    const err=el('p',{class:'err'});
    const go=el('button',{class:'primary',text:'ส่ง'});
    go.addEventListener('click',async()=>{
      const message=ta.value.trim(); if(!message){ ta.focus(); return; }
      if(navigator.onLine===false){ err.textContent='ต้องต่ออินเทอร์เน็ตก่อนส่ง'; return; }
      go.disabled=true; go.textContent='กำลังส่ง…'; err.textContent='';
      const tok=user ? await accessToken().catch(()=>null) : null;
      const r=await fetch('/api/feedback',{ method:'POST', headers:{ 'content-type':'application/json', ...(tok?{authorization:'Bearer '+tok}:{}) },
        body:JSON.stringify({ kind:k, message, contact:mail.value.trim(), page, ui:UI }) }).catch(()=>null);
      const j=r ? await r.json().catch(()=>({})) : {};
      if(r && r.ok){ tally('feedback'); closeModal(); toast('ส่งแล้ว ขอบคุณมากครับ 🙏', 3500); return; }
      go.disabled=false; go.textContent='ส่ง';
      err.textContent = !r ? 'เชื่อมต่อไม่ได้ ลองใหม่อีกครั้ง'
        : j.error==='rate_limited' ? 'ส่งถี่เกินไป รอสักครู่แล้วลองใหม่'
        : 'ตอนนี้ส่งในแอปไม่ได้ ส่งอีเมลถึง contact@piccab.com แทนได้เลย';
    });
    m.append(el('h3',{}, ic('chat'), 'ส่งความเห็น'),
      el('p',{class:'note',text:'ทุกข้อความมีคนอ่านจริง ช่วยให้ Piccab ดีขึ้นมาก'}),
      seg, ta, el('label',{class:'fbmail'}, el('span',{text:'อีเมลของคุณ สำหรับให้เราตอบกลับ (ไม่บังคับ)'}), mail),
      el('p',{class:'note small',text:'ระบบจะแนบหน้าที่คุณใช้อยู่และรุ่นเบราว์เซอร์ไปด้วย เพื่อช่วยหาสาเหตุ ไม่แนบรูปหรือคำศัพท์ของคุณ'}),
      err, el('div',{class:'row'}, el('span',{class:'sp'}), el('button',{text:'ยกเลิก',onclick:closeModal}), go));
    setTimeout(()=>ta.focus(),50);
  });
}

const LIB={q:'',f:'all',sort:'recent'};
const LIB_LABELS={all:'ทั้งหมด',mine:'ของฉัน',sample:'ตัวอย่าง'}, LIB_IC={all:'apps',mine:'person',sample:'auto_stories'};
function renderLibrary(){
  const q=LIB.q.trim().toLowerCase(), all=scenes();
  const counts={all:all.length, mine:all.filter(sc=>!sc.builtin).length, sample:all.filter(sc=>sc.builtin).length};
  document.querySelectorAll('#libFilters button').forEach(b=>{ b.replaceChildren(ic(LIB_IC[b.dataset.f]), el('span',{class:'fl',text:LIB_LABELS[b.dataset.f]}), el('span',{class:'n',text:String(counts[b.dataset.f])})); b.title=LIB_LABELS[b.dataset.f]; b.classList.toggle('on',b.dataset.f===LIB.f); });
  let list=all.filter(sc=> LIB.f==='mine'?!sc.builtin : LIB.f==='sample'?sc.builtin : true);
  const hits={};
  if(q){
    list=list.filter(sc=>{
      if(sc.name.toLowerCase().includes(q)) return true;
      const w=Object.values(sc.items).find(it=>it.word.toLowerCase().includes(q)||(it.th||'').toLowerCase().includes(q)||(it.alts||[]).some(a=>a.toLowerCase().includes(q)));
      if(w){ hits[sc.id]=w.word; return true; }
      return false;
    });
  }
  if(LIB.sort==='name') list.sort((a,b)=>a.name.localeCompare(b.name));
  else if(LIB.sort==='todo') list.sort((a,b)=>{ const A=progOf(a), B=progOf(b); return (B.n-B.d)-(A.n-A.d); });
  else list.sort(byRecent);
  $('#libCount').textContent = q ? `พบ ${list.length} ฉาก` : `${list.length} ฉาก`;
  const box=$('#libList'); box.innerHTML='';
  if(!list.length){ box.append(el('div',{class:'libempty',text: q?`ไม่พบฉากหรือคำศัพท์ที่ตรงกับ “${LIB.q.trim()}”`:'ยังไม่มีฉากในหมวดนี้'})); return; }
  list.forEach(sc=>box.append(sceneCard(sc,{hit:hits[sc.id]})));
  renderPicLib();
}
// ---------- my words: every word from every scene + a mixed review ----------
// Scene pictures as short blob: URLs, so many small crops can share one decoded image.
const blobImg=new Map();
function imgUrl(sc){
  const src=sceneImg(sc);
  if(!src.startsWith('data:') || src===IMG_PENDING) return src;
  const c=blobImg.get(sc.id); if(c && c.src===src) return c.url;
  if(c) URL.revokeObjectURL(c.url);
  let url=src;
  try{
    const i=src.indexOf(','), head=src.slice(5,i), body=src.slice(i+1), mime=head.split(';')[0]||'image/png';
    let blob;
    if(/;base64$/i.test(head)){ const bin=atob(body), a=new Uint8Array(bin.length); for(let k=0;k<bin.length;k++) a[k]=bin.charCodeAt(k); blob=new Blob([a],{type:mime}); }
    else blob=new Blob([decodeURIComponent(body)],{type:mime});
    url=URL.createObjectURL(blob);
  }catch(e){ url=src; }
  blobImg.set(sc.id,{src,url}); return url;
}
// A square around the object (kept inside the picture when it fits).
function cropBox(sc,it){
  const M=Math.max(sc.w,sc.h);
  let cx,cy,s;
  if(it.w!=null){ cx=it.x+it.w/2; cy=it.y+it.h/2; s=Math.max(it.w,it.h)*1.15; }
  else { const a=anchorOf(it)||{x:sc.w/2,y:sc.h/2}; cx=a.x; cy=a.y; s=M*0.2; }
  s=Math.max(s, M*0.05);
  let x=cx-s/2, y=cy-s/2;
  if(s<=sc.w) x=Math.min(Math.max(x,0), sc.w-s);
  if(s<=sc.h) y=Math.min(Math.max(y,0), sc.h-s);
  return [x,y,s,s];
}
function wordThumb(sc,it,cls,outline){
  const sv=document.createElementNS(NS,'svg'), [x,y,w,h]=cropBox(sc,it);
  sv.setAttribute('viewBox',`${x} ${y} ${w} ${h}`); sv.setAttribute('preserveAspectRatio','xMidYMid meet');
  sv.setAttribute('class',cls||'wd-thumb'); sv.setAttribute('aria-hidden','true');
  const im=document.createElementNS(NS,'image');
  im.setAttribute('href',imgUrl(sc)); im.setAttribute('width',sc.w); im.setAttribute('height',sc.h); im.setAttribute('preserveAspectRatio','none');
  sv.append(im);
  if(outline && it.w!=null){
    // mark which object is meant (neighbours often share the crop)
    const p=w*0.02, sw=w*0.012, g={x:it.x-p, y:it.y-p, w:it.w+2*p, h:it.h+2*p}; g.r=Math.min(Math.min(g.w,g.h)*0.2, w*0.06);
    [['#fff',sw*2.6],['#ef5a78',sw]].forEach(([c,wd])=>{ const r=document.createElementNS(NS,'path'); r.setAttribute('d',rrPath(g)); r.setAttribute('fill','none'); r.setAttribute('stroke',c); r.setAttribute('stroke-width',wd); sv.append(r); });
  }
  return sv;
}
function allWords(lang){
  lang=lang||S.lang; const out=[];
  scenes().slice().sort(byRecent).forEach(sc=>{
    const p=progress[sc.id]||{};
    Object.entries(itemsOf(sc,lang)).forEach(([id,it],k)=>{
      if(!it || !it.word) return;
      const pid=pk(id,lang), st=(p.done&&p.done[pid]) ? ((p.star&&p.star[pid])?'star':'done') : 'todo';
      out.push({sc,id,pid,it,st,k});
    });
  });
  return out;
}
const WD={q:'',f:'all',sort:'scene',limit:120,deck:String(store.get('pv-wdeck','')||'')};
const WD_LABELS={all:'ทั้งหมด',due:'ถึงรอบ',todo:'ยังไม่ผ่าน',done:'ผ่าน',star:'จำได้'};
const WD_IC={all:'apps',due:'autorenew',todo:'radio_button_unchecked',done:'check_circle-fill',star:'star-fill'};
const WD_ST={todo:'ยังไม่ผ่าน',done:'ผ่าน',star:'จำได้'};
const sayWord=it=>it.say||it.word;
// the word as shown: German articles coloured (der blue, die red, das green — the usual classroom colours)
function wordEl(it, tag, prefix){
  const b=el(tag||'b',{}); if(prefix) b.append(prefix);
  if(it && it.art){ b.append(el('span',{class:'art art-'+it.art,text:it.art}),' ',it.base); }
  else b.append(it ? it.word : '');
  return b;
}

export { LIB, WD, WD_IC, WD_LABELS, WD_ST, allWords, days, dkey, homeCredit, lastMode, markActive, openFeedback, recent, renderGallery, renderHome, renderLibrary, sayWord, statChip, streak, streakPill, wordEl, wordThumb };
