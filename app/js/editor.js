// Piccab — Editing a scene: boxes, AI auto-labelling (/api/scan), words in another language.
import { G, $, cleanLang, el, ids, itemIn, items, labelOf, LANGS, LOC, norm, NS, progress, S, scene, scenes, speak, store, svg, tally, toast, tx, UI, wrap } from './core.js';
import { saveProg, saveScenes } from './progress.js';
import { closeModal, fullRender, layoutHs, openModal, practised, refresh, renderScene, selectBox, updateOverlay } from './scene.js';
import { markActive, recent, renderGallery } from './home.js';
import { startFind } from './games.js';
import { askLoginForAI, loadCredits, openLogin, sb, user } from './account.js';
import { isStudent } from './classes.js';
import { accessToken } from './sync.js';

// ---------- editor ----------
let drawing=null, drag=null, drewAt=0;
// ➕ ตีกรอบคำใหม่: the next drag draws a new box anywhere, even on top of other boxes (they can't be moved meanwhile).
G.drawMode=false;
function setDrawMode(on){
  G.drawMode=!!on && S.editing && !scene().builtin; if(G.drawMode) G.selId=null; refresh();
  // The button sits under the picture: on phones bring the picture (and the hint on it) back into view.
  if(G.drawMode && wrap.getBoundingClientRect().top<0) wrap.scrollIntoView({behavior:'smooth', block:'start'});
}
function dragMove(e){
  if(!drag.moved && Math.hypot(e.clientX-drag.sx, e.clientY-drag.sy)<5) return;
  drag.moved=true;
  const sc=scene(), it=sc.items[drag.id]; if(!it) return;
  const p=toSvg(e), dx=p.x-drag.p0.x, dy=p.y-drag.p0.y, o=drag.o, min=Math.max(sc.w,sc.h)*0.015;
  if(drag.mode==='resize'){
    it.w=Math.max(min, Math.min(sc.w-o.x, o.w+dx)); it.h=Math.max(min, Math.min(sc.h-o.y, o.h+dy));
  } else {
    it.x=Math.max(0, Math.min(sc.w-o.w, o.x+dx)); it.y=Math.max(0, Math.min(sc.h-o.h, o.y+dy));
  }
  layoutHs(drag.id); updateOverlay();
}
function toSvg(e){ const p=svg.createSVGPoint(); p.x=e.clientX; p.y=e.clientY; return p.matrixTransform(svg.getScreenCTM().inverse()); }
function updDraft(p){
  if(!drawing) return; const sc=scene();
  const x2=Math.max(0,Math.min(sc.w,p.x)), y2=Math.max(0,Math.min(sc.h,p.y));
  const x=Math.min(drawing.x0,x2), y=Math.min(drawing.y0,y2), w=Math.abs(x2-drawing.x0), h=Math.abs(y2-drawing.y0);
  Object.assign(drawing,{x,y,w,h});
  drawing.r.setAttribute('x',x); drawing.r.setAttribute('y',y); drawing.r.setAttribute('width',w); drawing.r.setAttribute('height',h);
}
svg.addEventListener('pointerdown', e=>{
  if(!S.editing || e.button>0) return;
  e.preventDefault();
  const p=toSvg(e), sc=scene();
  // Hit-test ourselves instead of trusting the topmost element, so overlapping boxes behave:
  //  1) the resize handle of the selected box wins, 2) the selected box wins for dragging,
  //  3) otherwise the smallest box under the pointer is picked.
  const under=G.drawMode ? [] : boxesAt(p);
  let id=null, mode='move';
  if(G.drawMode){}
  else if(e.target.classList && e.target.classList.contains('handle') && G.selId){ id=G.selId; mode='resize'; }
  else if(G.selId && under.includes(G.selId)) id=G.selId;
  else if(under.length) id=under[0];
  if(id){
    const it=sc.items[id]; if(!it) return;
    drag={id, mode, under, p0:p, o:{x:it.x,y:it.y,w:it.w,h:it.h}, moved:false, sx:e.clientX, sy:e.clientY};
    try{ svg.setPointerCapture(e.pointerId); }catch(_){}
    return;
  }
  const r=document.createElementNS(NS,'rect'); r.setAttribute('class','draft'); svg.appendChild(r);
  drawing={x0:Math.max(0,Math.min(sc.w,p.x)), y0:Math.max(0,Math.min(sc.h,p.y)), r, x:0,y:0,w:0,h:0};
  try{ svg.setPointerCapture(e.pointerId); }catch(_){}
});
function boxesAt(p){
  // ids of boxes containing point p, smallest first
  const live=S.editing ? null : new Set(ids());          // while playing: only words in this language
  return Object.entries(scene().items)
    .filter(([id,it])=>(!live || live.has(id)) && p.x>=it.x && p.x<=it.x+it.w && p.y>=it.y && p.y<=it.y+it.h)
    .sort((a,b)=>a[1].w*a[1].h-b[1].w*b[1].h).map(([id])=>id);
}
function orderHs(){
  // Stack order: big boxes underneath, small ones on top, the selected one above all.
  const its=items();
  const gs=[...svg.querySelectorAll('.hs')];
  gs.sort((a,b)=>{
    if(a.dataset.id===G.selId) return 1; if(b.dataset.id===G.selId) return -1;
    const A=its[a.dataset.id], B=its[b.dataset.id];
    return (B?B.w*B.h:0)-(A?A.w*A.h:0);
  });
  gs.forEach(g=>svg.appendChild(g));
}
function endDraw(){
  if(!drawing) return;
  const d=drawing; drawing=null; drewAt=Date.now();
  const sc=scene(), min=Math.max(sc.w,sc.h)*0.015;
  if(d.w<min || d.h<min){ d.r.remove(); if(G.selId) selectBox(null); else toast(G.drawMode?'กดค้างแล้วลากให้เป็นกรอบล้อมรอบสิ่งของ':'ลากให้เป็นกรอบล้อมรอบสิ่งของนะ'); return; }
  if(G.drawMode){ G.drawMode=false; refresh(); }
  openItemForm(null, {x:Math.round(d.x),y:Math.round(d.y),w:Math.round(d.w),h:Math.round(d.h)}, d.r);
}
svg.addEventListener('pointerup', ()=>{
  if(drag){
    const d=drag; drag=null; drewAt=Date.now();
    const it=scene().items[d.id];
    if(d.moved && it){ ['x','y','w','h'].forEach(k=>it[k]=Math.round(it[k])); saveScenes(); selectBox(d.id); }
    else if(d.id!==G.selId) selectBox(d.id);       // first tap → just select & show this box only
    else if(d.mode==='move' && d.under.length>1){
      // Tapping the selected box where several boxes overlap → cycle to the next one underneath.
      const i=d.under.indexOf(G.selId), next=d.under[(i+1)%d.under.length];
      selectBox(next); toast('สลับไปกรอบ “'+labelOf(itemIn(scene().items[next],S.lang))+'” — แตะซ้ำเพื่อสลับต่อ', 1800);
    }
    else if(d.mode==='move') openItemForm(d.id); // second tap on a lone selected box → edit
    return;
  }
  endDraw();
});
svg.addEventListener('pointercancel', ()=>{
  if(drawing){ drawing.r.remove(); drawing=null; }
  if(drag){ const it=scene().items[drag.id]; if(it) Object.assign(it, drag.o); layoutHs(drag.id); drag=null; updateOverlay(); }
});

// ---------- AI auto-labelling (server: POST /api/scan → Gemini or Claude) ----------
let aiNeedCode=false, aiCredits=false, aiMonthly=30, aiCtl=null, aiTimer=null; G.aiReady=false; G.aiLeft=null;
function checkAI(){
  return (location.protocol.startsWith('http') ? fetch('/api/health',{cache:'no-store'}).then(r=>r.ok?r.json():null).catch(()=>null) : Promise.resolve(null))
  .then(h=>{
    if(G.capKey===null) G.capKey=(h && h.captcha) || '';
    if(!h || !h.ai || G.aiReady || (user && isStudent())) return;
    G.aiReady=true; aiNeedCode=!!h.needCode; aiCredits=!!h.credits && !!sb; aiMonthly=h.monthly||30;
    if(aiCredits && user) loadCredits();
    refresh(); if(S.view!=='play') renderGallery();
  });
}
checkAI();
const LEVELS={
  easy:{th:'ง่าย (คำพื้นฐาน)', en:'beginner (CEFR A1–A2): very common everyday nouns'},
  mid:{th:'ปานกลาง', en:'intermediate (CEFR B1): everyday nouns plus some more specific names'},
  hard:{th:'ยาก (คำเฉพาะเจาะจง)', en:'upper-intermediate (CEFR B2–C1): precise, specific names of objects and their parts'}
};
function aiErr(code){
  return ({
    bad_code:'รหัสใช้ AI ไม่ถูกต้อง ลองใหม่อีกครั้ง',
    login_required:'เข้าสู่ระบบเพื่อใช้ AI',
    student_account:'บัญชีนักเรียนใช้ AI ไม่ได้ — ลากกรอบใส่คำเองได้ หรือให้ครู/ผู้ปกครองสร้างฉากด้วย AI แล้วแชร์ให้',
    no_credits:'เครดิต AI เดือนนี้หมดแล้ว',
    rate_limited:'ใช้ AI ถี่เกินไป รอสักครู่แล้วลองใหม่',
    busy:'ตอนนี้ AI มีผู้ใช้งานมาก ลองใหม่ในอีกสักครู่',
    out_of_credit:'เครดิต AI ของระบบหมดชั่วคราว — วาดกรอบเองได้ตามปกติ',
    not_configured:'ระบบ AI ยังไม่พร้อมใช้งาน — วาดกรอบเองได้ตามปกติ',
    bad_image:'ไฟล์รูปนี้ส่งให้ AI ไม่ได้ ลองใช้รูปอื่น',
    image_too_large:'รูปใหญ่เกินไป ลองใช้รูปที่เล็กลง',
    image_rejected:'รูปนี้ส่งให้ AI ไม่ได้ ลองใช้รูปอื่น',
    refused:'AI วิเคราะห์รูปนี้ไม่ได้ ลองใช้รูปอื่น',
    invalid_json:'AI ตอบกลับมาไม่ครบ ลองกด ✨ ใหม่อีกครั้ง',
    offline:'เชื่อมต่ออินเทอร์เน็ตไม่ได้ ลองใหม่อีกครั้ง'
  })[code] || 'เกิดข้อผิดพลาด ลองกด ✨ ใหม่อีกครั้ง';
}
// Ask once for the beta access code (stored on this device).
function askCode(again){
  return new Promise(res=>{
    let ans=null;
    G.modalClose=()=>res(ans);
    const inp=el('input',{placeholder:'รหัสใช้ AI',autocapitalize:'none',spellcheck:'false',autocomplete:'off'});
    const ok=()=>{ const v=inp.value.trim(); if(!v) return inp.focus(); ans=v; closeModal(); };
    inp.addEventListener('keydown',e=>{ if(e.key==='Enter') ok(); });
    openModal(m=>m.append(
      el('h3',{text:'🔑 รหัสใช้ AI'}),
      el('p',{text: again ? 'รหัสไม่ถูกต้อง ลองพิมพ์อีกครั้ง' : 'ช่วงทดลอง ระบบ AI เปิดให้เฉพาะผู้ที่มีรหัส ใส่ครั้งเดียว เครื่องนี้จะจำไว้'}),
      inp,
      el('div',{class:'row'}, el('span',{class:'sp'}),
        el('button',{text:'ยกเลิก',onclick:closeModal}),
        el('button',{class:'primary',text:'ตกลง',onclick:ok}))));
  });
}
// Shown wherever a picture may go to the AI: say it is AI, and keep people / personal info out of the pictures.
function aiNotice(){
  return el('p',{class:'note ainote'}, '🤖 รูปจะถูกส่งให้ AI (Google Gemini) และคำศัพท์สร้างโดย AI อาจผิดได้ · ถ่ายเฉพาะสิ่งของ ไม่ถ่ายคนหรือข้อมูลส่วนตัว · ', el('a',{href:'/privacy#ai',target:'_blank',text:'อ่านเพิ่ม'}));
}
function openAI(){
  const sc=scene(); if(sc.builtin) return;
  const has=Object.keys(sc.items).length;
  openModal(m0=>{
    const m={append:(...k)=>m0.append(...k.filter(x=>x!=null))};
    const cnt=el('select',{}); [10,15,20,25,30].forEach(n=>cnt.add(new Option(n+' คำ', n))); cnt.value=String(store.get('pv-ai-count',20));
    const lv=el('select',{}); Object.entries(LEVELS).forEach(([k,v])=>lv.add(new Option(v.th,k))); lv.value=store.get('pv-ai-level','mid');
    const add=el('input',{type:'radio',name:'aimode',value:'add'}), rep=el('input',{type:'radio',name:'aimode',value:'replace'});
    (has?add:rep).checked=true;
    m.append(
      el('h3',{text:'✨ ให้ AI หาคำศัพท์ในรูป'}),
      el('p',{text:'AI จะดูรูป ตีกรอบรอบสิ่งของ และใส่คำศัพท์พร้อมคำแปลให้ จากนั้นคุณแก้ไขหรือย้ายกรอบได้'}),
      aiNotice(),
      (aiCredits && user && typeof G.aiLeft==='number') ? el('p',{class:'note',text:`✨ เครดิต AI เดือนนี้เหลือ ${G.aiLeft} / ${aiMonthly} ครั้ง (ใช้ 1 ครั้งต่อรูป)`}) : null,
      el('label',{},'จำนวนคำสูงสุด', cnt),
      el('label',{},'ระดับคำศัพท์', lv),
      has ? el('div',{}, el('label',{class:'opt'}, add, 'เพิ่มต่อจากคำที่มีอยู่ ('+has+' คำ)'), el('label',{class:'opt'}, rep, 'ลบคำเดิมทั้งหมดแล้วสร้างใหม่')) : null,
      el('div',{class:'row'}, el('span',{class:'sp'}),
        el('button',{text:'ยกเลิก',onclick:closeModal}),
        el('button',{class:'primary',text:'✨ เริ่มเลย',onclick:()=>{
          const opts={count:+cnt.value, level:lv.value, replace:!has||rep.checked};
          store.set('pv-ai-count',opts.count); store.set('pv-ai-level',opts.level);
          closeModal(); runAI(opts);
        }}))
    );
  });
}
function showBusy(on){
  $('#busy').hidden=!on; clearInterval(aiTimer);
  if(on){
    const t0=Date.now(); $('#busyTime').textContent='ปกติใช้เวลาประมาณ 20–60 วินาที';
    aiTimer=setInterval(()=>{ $('#busyTime').textContent=`ผ่านไป ${Math.round((Date.now()-t0)/1000)} วินาที (ปกติ 20–60 วินาที)`; },1000);
  }
}
$('#aiStop').addEventListener('click',()=>{ if(aiCtl) aiCtl.abort(); });
async function runAI({count=20, level='mid', replace=true}={}){
  const sc=scene();
  if(!G.aiReady){ toast('ตอนนี้ใช้ AI ไม่ได้ — ลากกรอบบนรูปเพื่อใส่คำศัพท์เองได้'); return; }
  if(sc.builtin || aiCtl) return;
  if(navigator.onLine===false){ toast('ต้องต่ออินเทอร์เน็ตก่อนใช้ AI — ระหว่างนี้ลากกรอบใส่คำศัพท์เองได้', 4000); return; }
  // Signed-in users use their monthly credits; otherwise sign in (or a tester's access code).
  const tok = (aiCredits && user) ? await accessToken() : null;
  let code = tok ? '' : store.get('pv-ai-code','');
  if(!tok){
    if(aiCredits && !(aiNeedCode && code)){
      const how = await askLoginForAI(); if(!how) return;
      if(how==='login'){ openLogin(); return; }
      code = how;
    } else if(aiNeedCode && !code){ code=await askCode(false); if(!code) return; }
    if(code) store.set('pv-ai-code',code);
  }
  if(tok && G.aiLeft===0){ toast(`เครดิต AI เดือนนี้หมดแล้ว (${aiMonthly} ครั้ง/เดือน) — เริ่มใหม่วันที่ 1 ของเดือนหน้า ระหว่างนี้ลากกรอบใส่คำเองได้`, 6000); return; }
  const existing = replace ? [] : Object.values(sc.items).map(i=>i.word);
  aiCtl=new AbortController(); showBusy(true);
  let retryCode=false;
  try{
    let r;
    try{
      r=await fetch('/api/scan',{method:'POST', signal:aiCtl.signal,
        headers:{'content-type':'application/json', ...(tok?{authorization:'Bearer '+tok}:{}), ...(code?{'x-piccab-code':code}:{})},
        body:JSON.stringify({image:sc.img, count, level, existing, langs:practised})});
    }catch(e){ throw {code: e && e.name==='AbortError' ? 'cancelled' : 'offline'}; }
    const data=await r.json().catch(()=>({}));
    if(typeof data.credits_left==='number') G.aiLeft=data.credits_left;
    if(!r.ok) throw {code:data.error||'error'};
    tally('ai_scene');
    const arr=Array.isArray(data.items)?data.items:[];
    if(replace) sc.items={};
    const seen=new Set(Object.values(sc.items).map(i=>norm(i.word)));
    let added=0;
    for(const r of arr){
      if(!r || typeof r.word!=='string' || !Array.isArray(r.box) || r.box.length<4) continue;
      const word=r.word.trim().replace(/\s+/g,' ').slice(0,60); const key=norm(word);
      if(!key || seen.has(key)) continue;
      const b=r.box.slice(0,4).map(v=>Math.max(0,Math.min(1000,Number(v))));
      if(b.some(v=>!Number.isFinite(v))) continue;
      const x0=Math.min(b[0],b[2]), x1=Math.max(b[0],b[2]), y0=Math.min(b[1],b[3]), y1=Math.max(b[1],b[3]);
      if(x1-x0<8 || y1-y0<8) continue;
      seen.add(key);
      sc.items['h'+Date.now().toString(36)+Math.random().toString(36).slice(2,6)]={
        word, th:String(r.th||'').trim().slice(0,120),
        alts:Array.isArray(r.alts)?r.alts.filter(a=>typeof a==='string'&&a.trim()).slice(0,4).map(a=>a.trim().slice(0,60)):[],
        x:Math.round(x0/1000*sc.w), y:Math.round(y0/1000*sc.h), w:Math.round((x1-x0)/1000*sc.w), h:Math.round((y1-y0)/1000*sc.h)
      };
      { const lw=cleanLang(r.l), keys=Object.keys(sc.items); if(lw) sc.items[keys[keys.length-1]].l=lw; }
      added++;
    }
    saveScenes(); G.help={}; G.used={}; if(replace){ progress[sc.id]={done:{},star:{}}; saveProg(); }
    if(scene()===sc){ renderScene(); refresh(); }
    toast((added ? `✨ ได้คำศัพท์ ${added} คำ — ตรวจดูกรอบ ลากย้าย/ปรับขนาด หรือแตะเพื่อแก้คำได้ แล้วกด ✓ เสร็จแล้ว` : 'AI ไม่พบสิ่งของใหม่ในรูปนี้')+(data.model?` · AI: ${data.model}`:'')+(typeof data.credits_left==='number'?` · เครดิต AI เหลือ ${data.credits_left}`:''), 6000);
  }catch(e){
    const c=e && e.code;
    if(c==='bad_code'){ store.set('pv-ai-code',''); aiNeedCode=true; retryCode=true; }
    else if(c==='login_required'){ store.set('pv-ai-code',''); openLogin(); toast('เข้าสู่ระบบเพื่อใช้ AI', 4000); }
    else if(c==='no_credits'){ G.aiLeft=0; toast(`เครดิต AI เดือนนี้หมดแล้ว (${aiMonthly} ครั้ง/เดือน) — เริ่มใหม่วันที่ 1 ของเดือนหน้า ระหว่างนี้ลากกรอบใส่คำเองได้`, 6000); }
    else if(c!=='cancelled') toast(aiErr(c), 5000);
    if(c==='not_configured'){ G.aiReady=false; refresh(); }
  }finally{ aiCtl=null; showBusy(false); }
  if(retryCode){
    const c2=await askCode(true);
    if(c2){ store.set('pv-ai-code',c2); runAI({count, level, replace}); }
  }
}

// ---------- words in another language, prepared by the app itself ----------
// A scene that has English words but none (or only some) in the language being practised is translated in the
// background: words only, no picture, no AI credit. Runs when you switch language, open such a scene, or add
// English words while also practising another language. Students and signed-out users type them (or ask the teacher).
const TL={}, TLfail={};
const missingIn=(sc,lang)=>Object.entries((sc&&sc.items)||{}).filter(([k,it])=>it && it.word && !(it.l && it.l[lang] && it.l[lang].w));
function autoLangState(sc){
  if(!sc || sc.builtin) return 'no';
  if(!G.aiReady) return 'noai';
  if(isStudent()) return 'student';
  const code=store.get('pv-ai-code','');
  if(aiCredits) return (user || code) ? 'ok' : 'login';
  if(aiNeedCode) return code ? 'ok' : 'login';
  return 'ok';
}
const translating=(sc,lang)=>!!(sc && TL[sc.id+'@'+(lang||S.lang)]);
function autoTranslate(sc, lang){
  const key=sc.id+'@'+lang;
  if(TL[key]) return TL[key];
  if(TLfail[key] && Date.now()-TLfail[key]<10*60e3) return Promise.resolve(-1);
  const miss=missingIn(sc,lang);
  if(!miss.length || autoLangState(sc)!=='ok' || navigator.onLine===false) return Promise.resolve(0);
  TL[key]=(async()=>{
    let n=0;
    try{
      const tok=(aiCredits && user) ? await accessToken() : null, code=tok ? '' : store.get('pv-ai-code','');
      for(let i=0;i<miss.length;i+=80){
        const words=miss.slice(i,i+80).map(([k,it])=>({k, en:it.word, th:it.th||''}));
        const r=await fetch('/api/translate',{method:'POST', headers:{'content-type':'application/json', ...(tok?{authorization:'Bearer '+tok}:{}), ...(code?{'x-piccab-code':code}:{})}, body:JSON.stringify({lang, words})});
        const data=await r.json().catch(()=>({}));
        if(!r.ok) throw new Error(data.error||'error');
        for(const t of (Array.isArray(data.items)?data.items:[])){
          const it=sc.items[t.k], lw=cleanLang({[lang]:t});
          if(!it || !lw || (it.l && it.l[lang] && it.l[lang].w)) continue;    // never overwrite a word someone typed
          it.l={...(it.l||{}), ...lw}; n++;
        }
      }
      if(n) saveScenes();
      delete TLfail[key];
    }catch(e){ console.warn('translate', e); TLfail[key]=Date.now(); n=n||-1; }
    finally{
      delete TL[key];
      if(S.view==='play' && scene()===sc && S.lang===lang){ renderScene(); refresh(); if(S.mode==='find' && ids().length && !(G.find && G.find.target)) startFind(); }
      else if(S.view!=='play') renderGallery();
    }
    return n;
  })();
  if(S.view==='play' && scene()===sc) refresh();       // shows "กำลังเตรียมคำ…"
  return TL[key];
}
// all your own scenes, one after another (after switching language, or on the home page)
let tlAllRun=null;
function translateAll(lang){
  if(tlAllRun) return tlAllRun;
  const list=scenes().filter(sc=>!sc.builtin && missingIn(sc,lang).length);
  if(!list.length || autoLangState(list[0])!=='ok') return Promise.resolve(0);
  tlAllRun=(async()=>{ let done=0; for(const sc of list){ const n=await autoTranslate(sc,lang); if(n>0) done++; } return done; })()
    .then(done=>{ tlAllRun=null; if(done) toast(`✨ เตรียมคำภาษา${LANGS[lang].name}ให้ ${done} ฉากแล้ว`, 3500); return done; });
  return tlAllRun;
}
// kept for the manual "try again" button
function translateScene(sc, lang){ delete TLfail[sc.id+'@'+lang]; return autoTranslate(sc, lang).then(n=>{ if(n<0) toast('แปลไม่สำเร็จ ลองใหม่อีกครั้ง หรือใส่คำเองด้วย ✏️', 4000); }); }
function openItemForm(id, rect, draftEl){
  if(S.lang!=='en') return openItemFormLang(id, rect, draftEl, S.lang);
  const sc=scene(); if(sc.builtin) return;
  const it=id?sc.items[id]:null;
  G.modalClose=()=>{ if(draftEl) draftEl.remove(); };
  openModal(m=>{
    const w=el('input',{class:'word',value:it?it.word:'',placeholder:'เช่น teapot',autocapitalize:'none',spellcheck:'false'});
    const th=el('input',{value:it?(it.th||''):'',placeholder:'เช่น กาน้ำชา'});
    const al=el('input',{value:it&&it.alts?it.alts.join(', '):'',placeholder:'เช่น tea pot (คั่นด้วย ,)',autocapitalize:'none',spellcheck:'false'});
    const save=()=>{
      const word=w.value.trim().replace(/\s+/g,' ');
      if(!word){ w.focus(); toast('พิมพ์คำศัพท์ภาษาอังกฤษก่อนนะ'); return; }
      const alts=al.value.split(',').map(s=>s.trim()).filter(Boolean).slice(0,6);
      if(it){ it.word=word; it.th=th.value.trim(); it.alts=alts; }
      else{ const nid='h'+Date.now().toString(36)+Math.random().toString(36).slice(2,5); sc.items[nid]=Object.assign({word, th:th.value.trim(), alts}, rect); G.selId=nid; }
      saveScenes(); closeModal(); renderScene(); refresh();
      practised.forEach(l=>setTimeout(()=>autoTranslate(sc,l), 400));
    };
    [w,th,al].forEach(i=>i.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); save(); } }));
    m.append(
      el('h3',{text:it?'แก้ไขคำศัพท์':'เพิ่มคำศัพท์'}),
      el('label',{},'คำภาษาอังกฤษ', w),
      ...(UI==='th' ? [el('label',{},'ความหมายภาษาไทย (ไม่บังคับ)', th)] : []),   // English speakers: the Thai meaning stays as it is
      el('label',{},'คำตอบอื่นที่ให้ถือว่าถูก (ไม่บังคับ)', al),
      el('div',{class:'row'},
        el('button',{text:'🔊 ลองฟัง',onclick:()=>speak(w.value.trim())}),
        el('span',{class:'sp'}),
        it?el('button',{class:'danger',text:'ลบ',onclick:()=>{ delete sc.items[id]; if(G.selId===id) G.selId=null; saveScenes(); closeModal(); renderScene(); refresh(); }}):null,
        el('button',{text:'ยกเลิก',onclick:closeModal}),
        el('button',{class:'primary',text:'บันทึก',onclick:save})
      )
    );
  });
}
function openItemFormLang(id, rect, draftEl, lang){
  const sc=scene(); if(sc.builtin) return;
  const it=id?sc.items[id]:null, cur=(it && it.l && it.l[lang]) || {}, L=LANGS[lang];
  G.modalClose=()=>{ if(draftEl) draftEl.remove(); };
  openModal(m=>{
    const w=el('input',{class:'word',value:cur.w||'',placeholder:L.ph,autocapitalize:'none',spellcheck:'false'});
    let art=cur.a||'';
    const arts=L.articles ? el('div',{class:'seg artseg',role:'group','aria-label':'คำนำหน้านาม'}) : null;
    const drawArts=()=>{ if(!arts) return; arts.innerHTML=''; ['der','die','das',''].forEach(a=>arts.append(el('button',{type:'button',class:(a===art?'on ':'')+(a?'art-'+a:''),text:a||'ไม่มี',onclick:()=>{ art=a; drawArts(); }}))); };
    drawArts();
    w.addEventListener('input',()=>{ const mm=/^(der|die|das)\s+(.+)$/i.exec(w.value); if(mm && L.articles){ art=mm[1].toLowerCase(); w.value=mm[2]; drawArts(); } });
    const th=el('input',{value:it?(it.th||''):'',placeholder:'เช่น กาน้ำชา'});
    const en=el('input',{value:it?(it.word||''):'',placeholder:'เช่น teapot',autocapitalize:'none',spellcheck:'false'});
    const al=el('input',{value:(cur.alts||[]).join(', '),placeholder:'คั่นด้วย ,',autocapitalize:'none',spellcheck:'false'});
    const save=()=>{
      const word=w.value.trim().replace(/\s+/g,' ');
      if(!word){ w.focus(); toast(`พิมพ์คำภาษา${L.name}ก่อนนะ`); return; }
      const lw={w:word, a:art, alts:al.value.split(',').map(x=>x.trim()).filter(Boolean).slice(0,4)};
      if(it){ it.l={...(it.l||{}), [lang]:lw}; it.th=th.value.trim(); it.word=en.value.trim().replace(/\s+/g,' '); }
      else{ const nid='h'+Date.now().toString(36)+Math.random().toString(36).slice(2,5); sc.items[nid]=Object.assign({word:en.value.trim().replace(/\s+/g,' '), th:th.value.trim(), alts:[], l:{[lang]:lw}}, rect); G.selId=nid; }
      saveScenes(); closeModal(); renderScene(); refresh();
    };
    [w,th,en,al].forEach(i=>i.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); save(); } }));
    m.append(
      el('h3',{text:(it && cur.w ? 'แก้ไขคำศัพท์' : 'เพิ่มคำศัพท์')+' · '+L.flag+' '+L.name}),
      el('label',{},`คำภาษา${L.name}`, w),
      arts ? el('div',{class:'artrow'}, el('span',{class:'lbl',text:'คำนำหน้านาม'}), arts) : null,
      ...(UI==='th' ? [el('label',{},'ความหมายภาษาไทย (ไม่บังคับ)', th)] : []),
      el('label',{},UI==='en' ? 'ความหมาย / คำภาษาอังกฤษ (ไม่บังคับ)' : 'คำภาษาอังกฤษ (ไม่บังคับ)', en),
      el('label',{},'คำตอบอื่นที่ให้ถือว่าถูก (ไม่บังคับ)', al),
      el('div',{class:'row'},
        el('button',{text:'🔊 ลองฟัง',onclick:()=>speak((art?art+' ':'')+w.value.trim())}),
        el('span',{class:'sp'}),
        it?el('button',{class:'danger',text:'ลบกรอบ',onclick:()=>{ delete sc.items[id]; if(G.selId===id) G.selId=null; saveScenes(); closeModal(); renderScene(); refresh(); }}):null,
        el('button',{text:'ยกเลิก',onclick:closeModal}),
        el('button',{class:'primary',text:'บันทึก',onclick:save})));
    setTimeout(()=>w.focus(),40);
  });
}
function loadImageFile(file){
  return new Promise((res,rej)=>{
    const fr=new FileReader();
    fr.onload=()=>{
      const img=new Image();
      img.onload=()=>{
        const max=1400; let w=img.naturalWidth, h=img.naturalHeight; const s=Math.min(1,max/Math.max(w,h));
        w=Math.round(w*s); h=Math.round(h*s);
        const c=document.createElement('canvas'); c.width=w; c.height=h;
        const ctx=c.getContext('2d'); ctx.fillStyle='#fff'; ctx.fillRect(0,0,w,h); ctx.drawImage(img,0,0,w,h);
        res({src:c.toDataURL('image/jpeg',0.82), w, h});
      };
      img.onerror=rej; img.src=fr.result;
    };
    fr.onerror=rej; fr.readAsDataURL(file);
  });
}
async function onPickImage(e){
  const f=e.target.files[0]; e.target.value=''; if(!f) return;
  createSceneFromFile(f);
}
async function createSceneFromFile(f){
  try{
    const im=await loadImageFile(f);
    const nm=f.name.replace(/\.[^.]+$/,''); const sc={id:'s'+Date.now().toString(36), name:(/^(image|img|photo|IMG|DSC|PXL)[-_ ]?\d*/i.test(nm)||!nm ? tx('ฉากใหม่ ')+new Date().toLocaleDateString(LOC,{day:'numeric',month:'short'}) : nm).slice(0,40), img:im.src, w:im.w, h:im.h, items:{}};
    G.customs.push(sc); saveScenes(); tally('scene_new');
    S.sceneId=sc.id; store.set('pv-scene',sc.id); S.editing=true; S.view='play'; G.help={}; G.used={}; recent[sc.id]=Date.now(); store.set('pv-recent',recent); markActive(0);
    fullRender(); window.scrollTo(0,0);
    if(G.aiReady) runAI({count:store.get('pv-ai-count',20), level:store.get('pv-ai-level','mid'), replace:true});
    else toast('ลากกรอบรอบสิ่งของในรูป แล้วพิมพ์คำศัพท์', 4000);
  }catch(err){ toast('เปิดรูปนี้ไม่ได้ ลองไฟล์ .jpg หรือ .png'); }
}

export { aiCredits, aiCtl, aiErr, aiMonthly, aiNeedCode, aiNotice, askCode, autoLangState, autoTranslate, checkAI, createSceneFromFile, drag, dragMove, drawing, drewAt, loadImageFile, missingIn, onPickImage, openAI, openItemForm, orderHs, setDrawMode, TLfail, toSvg, translateAll, translateScene, translating, updDraft };
