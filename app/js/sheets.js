// Piccab — Word sheets: a teacher's word list for a spelling test.
import { G, $, cleanLang, el, ic, LOC, progress, S, scene, store, tally, toast, tx } from './core.js';
import { dayNo, forgetSceneLocal, imgSaved, saveProg, saveScenes } from './progress.js';
import { ask, closeModal, fullRender, openModal, openScene } from './scene.js';
import { renderGallery } from './home.js';
import { loadImg } from './cards.js';
import { aiCredits, aiErr, aiMonthly, aiNeedCode, aiNotice, aiWait, askCode, createSceneFromFile, onPickImage } from './editor.js';
import { askLoginForAI, creditText, openLogin, user } from './account.js';
import { myShares, shareApi } from './share.js';
import { accessToken, metaFrom, saveSyncMem, syncDeleted, syncMem } from './sync.js';

// ---------- word sheets: a teacher's list of words for a dictation (spelling) test ----------
// A sheet is an ordinary scene whose picture is drawn here: one card per word showing its Thai meaning.
// So every mode, the review round, spaced review, sync, sharing and classes work just like for photo scenes.
// sc.meta = {kind:'list', exam:'YYYY-MM-DD' or '', style:'listen'}: the app reads each word aloud, like the teacher's dictation.
// (Sheets saved with the old style:'meaning' are practised the same way: one way of testing keeps it simple.)
const isList=sc=>!!(sc && sc.meta && sc.meta.kind==='list');
const listStyle=sc=>isList(sc) ? 'listen' : null;
function examIn(sc){ if(!isList(sc) || !sc.meta.exam) return null; const t=Date.parse(sc.meta.exam+'T12:00:00'); return isNaN(t) ? null : dayNo(t)-dayNo(); }
const examLabel=n=> n===0 ? 'สอบวันนี้' : n===1 ? 'สอบพรุ่งนี้' : `สอบอีก ${n} วัน`;
// "1. apple แอปเปิล", "apple = แอปเปิล", "apple (n.) - แอปเปิล", "apple" … one word per line
function parseWordList(text){
  const out=[], seen=new Set();
  for(let line of String(text||'').split(/\r?\n|;/)){
    line=line.replace(/^\s*(?:\d+\s*[.)]|[-•*·])\s*/,'').replace(/\((?:n|v|adj|adv|prep|conj|pron|int|phr)\.?\)/gi,' ').trim();
    if(!line) continue;
    const i=line.search(/[\u0E00-\u0E7F]/);
    let w=i<0 ? line.split(/\t|\s[=:–—-]\s|\s*=\s*/)[0] : line.slice(0,i);
    let th=i<0 ? '' : line.slice(i);
    w=w.replace(/[^\p{L}\p{N} '\-.]/gu,' ').replace(/[\s.\-]+$/,'').replace(/\s+/g,' ').trim().slice(0,60);
    th=th.replace(/^[\s=:–—\-]+/,'').replace(/\s+/g,' ').trim().slice(0,60);
    if(!w || !/[A-Za-z]/.test(w) || seen.has(w.toLowerCase())) continue;
    seen.add(w.toLowerCase()); out.push({w, th});
    if(out.length>=60) break;
  }
  return out;
}
function rrect(x,X,Y,W,H,R){ x.beginPath(); x.moveTo(X+R,Y); x.arcTo(X+W,Y,X+W,Y+H,R); x.arcTo(X+W,Y+H,X,Y+H,R); x.arcTo(X,Y+H,X,Y,R); x.arcTo(X,Y,X+W,Y,R); x.closePath(); }
// The picture: numbered cards with the Thai meaning (or a speaker when there is none), on dotted paper.
// 🎨 a word's line picture (SVG text, cleaned by the server) as an image
const svgUrl=svg=>'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
async function drawSheet(words){
  try{ await Promise.all([document.fonts.load('600 32px Sarabun',String.fromCharCode(3585,3586,97)), document.fonts.load('600 20px Fredoka','123')]); }catch(e){}
  const pics=await Promise.all(words.map(wd=>wd.pic ? loadImg(svgUrl(wd.pic)) : null));
  const W=1000, pad=28, gap=18, ch=150, cols=2;   // two big cards a row: readable on a phone
  const cw=(W-pad*2-gap*(cols-1))/cols, rows=Math.max(1,Math.ceil(words.length/cols));
  const H=Math.max(pad*2+rows*ch+(rows-1)*gap, 360);
  const c=document.createElement('canvas'); c.width=W; c.height=H; const x=c.getContext('2d');
  x.fillStyle='#fdf9f3'; x.fillRect(0,0,W,H);
  x.fillStyle='#ece3d6'; for(let yy=14;yy<H;yy+=28) for(let xx=14;xx<W;xx+=28){ x.beginPath(); x.arc(xx,yy,1.5,0,7); x.fill(); }
  const SOFT=['#efeaf7','#ffe4ea','#e5f5eb','#fff3cf'], DEEP=['#5b4fc4','#d83a5c','#24a164','#b07800'], boxes=[];
  words.forEach((wd,i)=>{
    const bx=pad+(i%cols)*(cw+gap), by=pad+Math.floor(i/cols)*(ch+gap), k=i%4;
    x.fillStyle='rgba(45,42,90,.07)'; rrect(x,bx,by+3,cw,ch,20); x.fill();
    x.fillStyle='#fff'; rrect(x,bx,by,cw,ch,20); x.fill(); x.strokeStyle='#efe6da'; x.lineWidth=2; x.stroke();
    x.fillStyle=SOFT[k]; x.beginPath(); x.arc(bx+44,by+ch/2,28,0,7); x.fill();
    x.fillStyle=DEEP[k]; x.font='600 27px Fredoka, Sarabun, sans-serif'; x.textAlign='center'; x.textBaseline='middle'; x.fillText(String(i+1),bx+44,by+ch/2+1);
    const pic=pics[i], ps=ch-28;                                 // the picture sits on the right of the card
    if(pic){ x.fillStyle='#fbf8f2'; rrect(x,bx+cw-14-ps,by+14,ps,ps,16); x.fill(); x.drawImage(pic,bx+cw-14-ps+8,by+22,ps-16,ps-16); }
    const cx=pic ? bx+84+(cw-84-ps-30)/2 : bx+84+(cw-84-16)/2, room=pic ? cw-84-ps-40 : cw-84-28, th=(wd.th||'').trim();
    x.fillStyle='#2d2a5a';
    if(th){
      let fs=50; const setF=()=>{ x.font=`600 ${fs}px Sarabun, sans-serif`; }; setF();
      while(x.measureText(th).width>room && fs>26){ fs-=2; setF(); }
      let t=th; while(x.measureText(t).width>room && t.length>2) t=t.slice(0,-2)+'…';
      x.fillText(t,cx,by+ch/2+3);
    } else {   // no meaning: a speaker (listen to the word)
      x.fillStyle='#8f84e8'; const sx=cx-30, sy=by+ch/2;
      x.beginPath(); x.moveTo(sx,sy-12); x.lineTo(sx+14,sy-12); x.lineTo(sx+30,sy-27); x.lineTo(sx+30,sy+27); x.lineTo(sx+14,sy+12); x.lineTo(sx,sy+12); x.closePath(); x.fill();
      x.strokeStyle='#8f84e8'; x.lineWidth=6; x.lineCap='round';
      [18,34].forEach(r=>{ x.beginPath(); x.arc(sx+32,sy,r,-0.8,0.8); x.stroke(); });
    }
    boxes.push({x:Math.round(bx),y:Math.round(by),w:Math.round(cw),h:ch});
  });
  return {img:c.toDataURL('image/jpeg',0.86), w:W, h:H, boxes};
}
function markImgChanged(id){
  imgSaved.delete(id);
  if(user && typeof syncMem==='function'){ const mem=syncMem(user.id); if(mem.img) delete mem.img[id]; saveSyncMem(); }
}
// Make (or update) a sheet scene. Words that stay keep their id, so their progress stays.
async function saveWordSheet(sc, name, words, meta){
  const pic=await drawSheet(words), old=(sc && sc.items) || {}, byWord={};
  Object.entries(old).forEach(([id,it])=>{ if(it && it.word) byWord[it.word.toLowerCase()]=id; });
  const items={}; let n=0;
  words.forEach((wd,i)=>{
    let id=byWord[wd.w.toLowerCase()];
    if(!id || items[id]){ do{ id='w'+(++n); }while(old[id] || items[id]); }
    const prev=old[id] && old[id].word && old[id].word.toLowerCase()===wd.w.toLowerCase() ? old[id] : {};
    const b=pic.boxes[i];
    items[id]={ word:wd.w, th:wd.th||'', alts:prev.alts||[], ...(prev.l?{l:prev.l}:{}), ...(wd.pic?{pic:wd.pic}:{}), x:b.x, y:b.y, w:b.w, h:b.h };
  });
  if(sc){ Object.assign(sc,{ name, img:pic.img, w:pic.w, h:pic.h, items, meta }); markImgChanged(sc.id); }
  else { sc={ id:'s'+Date.now().toString(36), name, img:pic.img, w:pic.w, h:pic.h, items, meta }; G.customs.push(sc); tally('sheet_new'); }
  saveScenes();
  return sc;
}
// Sign-in / access code for AI, the same way as for scanning a photo. Returns {tok, code} or null.
async function aiAuth(){
  if(!G.aiReady){ toast('ตอนนี้ใช้ AI ไม่ได้ — พิมพ์หรือวางรายการคำเองได้'); return null; }
  if(navigator.onLine===false){ toast('ต้องต่ออินเทอร์เน็ตก่อนใช้ AI', 4000); return null; }
  const tok=(aiCredits && user) ? await accessToken() : null;
  let code=tok ? '' : store.get('pv-ai-code','');
  if(!tok){
    if(aiCredits && !(aiNeedCode && code)){
      const how=await askLoginForAI(); if(!how) return null;
      if(how==='login'){ openLogin(); return null; }
      code=how;
    } else if(aiNeedCode && !code){ code=await askCode(false); if(!code) return null; }
    if(code) store.set('pv-ai-code',code);
  }
  if(tok && G.aiLeft===0){ toast(`เครดิต AI เดือนนี้หมดแล้ว (${aiMonthly} ครั้ง/เดือน) — พิมพ์หรือวางรายการคำเองได้`, 6000); return null; }
  return {tok, code};
}
// Photo of the sheet (the part chosen in the box, as a JPEG data URL) → [{w, th}] (one AI credit)
async function readSheetPhoto(src){
  const auth=await aiAuth(); if(!auth) return null;
  let r, data={};
  try{
    r=await fetch('/api/wordlist',{method:'POST', headers:{'content-type':'application/json', ...(auth.tok?{authorization:'Bearer '+auth.tok}:{}), ...(auth.code?{'x-piccab-code':auth.code}:{})}, body:JSON.stringify({image:src})});
    data=await r.json().catch(()=>({}));
  }catch(e){ toast(aiErr('offline')); return null; }
  if(typeof data.credits_left==='number'){ G.aiLeft=data.credits_left; const n=$('#creditNote'); if(n) n.textContent=creditText(); }
  if(!r.ok){ if(data.error==='bad_code') store.set('pv-ai-code',''); toast(aiErr(data.error), 5000); return null; }
  const items=(data.items||[]).filter(x=>x && x.w);
  if(!items.length) toast('ไม่พบรายการคำศัพท์ในรูปนี้ ลองถ่ายให้ชัดและตรงขึ้น หรือพิมพ์เอง', 5000);
  return items;
}
// Choose the part of the photo to read: a box over the photo (drag to draw a new one, drag inside to move it,
// drag a corner to resize). Only what is in the box goes to the AI, so a photo with too much on it still works.
function sheetCropper(file, onDone, onCancel){
  const url=URL.createObjectURL(file), img=el('img',{alt:'',draggable:'false'});
  let r={ x:.04, y:.04, w:.92, h:.92 }, drag=null, fresh=true;   // fresh: the first drag draws the box, wherever it starts
  const box=el('div',{class:'cropbox'}, ...['nw','ne','sw','se'].map(k=>el('span',{class:'ch '+k,'data-c':k})));
  const stage=el('div',{class:'cropstage'}, img, box);
  const show=()=>{ Object.assign(box.style,{ left:r.x*100+'%', top:r.y*100+'%', width:r.w*100+'%', height:r.h*100+'%' }); };
  const at=e=>{ const b=img.getBoundingClientRect(); return { x:Math.max(0,Math.min(1,(e.clientX-b.left)/b.width)), y:Math.max(0,Math.min(1,(e.clientY-b.top)/b.height)) }; };
  const MIN=.06;
  stage.addEventListener('pointerdown',e=>{
    if(e.button>0) return; e.preventDefault(); stage.setPointerCapture(e.pointerId);
    const p=at(e), c=e.target.dataset && e.target.dataset.c;
    if(c) drag={ kind:'corner', c, r0:{...r} };
    else if(!fresh && p.x>=r.x && p.x<=r.x+r.w && p.y>=r.y && p.y<=r.y+r.h) drag={ kind:'move', p0:p, r0:{...r} };
    else { drag={ kind:'draw', p0:p }; r={ x:p.x, y:p.y, w:0, h:0 }; show(); }
  });
  stage.addEventListener('pointermove',e=>{
    if(!drag) return; const p=at(e);
    if(drag.kind==='draw'){ const a=drag.p0; r={ x:Math.min(a.x,p.x), y:Math.min(a.y,p.y), w:Math.abs(p.x-a.x), h:Math.abs(p.y-a.y) }; }
    else if(drag.kind==='move'){ const o=drag.r0; r={ ...o, x:Math.max(0,Math.min(1-o.w, o.x+p.x-drag.p0.x)), y:Math.max(0,Math.min(1-o.h, o.y+p.y-drag.p0.y)) }; }
    else {
      const o=drag.r0, c=drag.c; let x0=o.x, y0=o.y, x1=o.x+o.w, y1=o.y+o.h;
      if(c.includes('w')) x0=Math.min(p.x, x1-MIN); if(c.includes('e')) x1=Math.max(p.x, x0+MIN);
      if(c.includes('n')) y0=Math.min(p.y, y1-MIN); if(c.includes('s')) y1=Math.max(p.y, y0+MIN);
      r={ x:x0, y:y0, w:x1-x0, h:y1-y0 };
    }
    show();
  });
  const end=()=>{ if(!drag) return; if(drag.kind==='draw' && (r.w<MIN || r.h<MIN)) r={ x:.04, y:.04, w:.92, h:.92 }; else fresh=false; drag=null; show(); };
  stage.addEventListener('pointerup',end); stage.addEventListener('pointercancel',end);
  // the chosen part, from the full-size photo, at most 1600 px on its longer side
  const crop=part=>{
    const W=img.naturalWidth, H=img.naturalHeight, sx=Math.round(part.x*W), sy=Math.round(part.y*H), sw=Math.max(1,Math.round(part.w*W)), sh=Math.max(1,Math.round(part.h*H));
    const k=Math.min(1, 1600/Math.max(sw,sh)), c=document.createElement('canvas'); c.width=Math.round(sw*k); c.height=Math.round(sh*k);
    const x=c.getContext('2d'); x.fillStyle='#fff'; x.fillRect(0,0,c.width,c.height); x.imageSmoothingQuality='high'; x.drawImage(img,sx,sy,sw,sh,0,0,c.width,c.height);
    return c.toDataURL('image/jpeg',0.86);
  };
  const close=()=>{ URL.revokeObjectURL(url); panel.remove(); };
  const panel=el('div',{class:'croppanel'},
    el('p',{class:'note',text:'ลากกรอบรอบคำที่ต้องการ AI จะอ่านเฉพาะในกรอบ (ลากในกรอบเพื่อย้าย ลากมุมเพื่อย่อขยาย)'}),
    el('div',{class:'cropwrap'}, stage),
    el('div',{class:'row'},
      el('button',{type:'button',text:'ยกเลิก',onclick:()=>{ close(); onCancel(); }}),
      el('span',{class:'sp'}),
      el('button',{type:'button',text:'ใช้ทั้งรูป',onclick:()=>{ const src=crop({ x:0, y:0, w:1, h:1 }); close(); onDone(src); }}),
      el('button',{type:'button',class:'primary',text:'✓ ให้ AI อ่านในกรอบ',onclick:()=>{ const src=crop(r); close(); onDone(src); }})));
  img.onload=show;
  img.onerror=()=>{ close(); onCancel(); toast('เปิดรูปนี้ไม่ได้ ลองไฟล์ .jpg หรือ .png'); };
  img.src=url;
  return panel;
}
// ---------- 🎨 line pictures: from the shared bank (free), the rest drawn by AI (1 credit a sheet) ----------
async function picsApi(words, draw, redraw, auth, retry){
  const r=await fetch('/api/wordpics',{method:'POST', headers:{'content-type':'application/json', ...(auth && auth.tok?{authorization:'Bearer '+auth.tok}:{}), ...(auth && auth.code?{'x-piccab-code':auth.code}:{})},
    body:JSON.stringify({ words, draw:!!draw, redraw:!!redraw, ...(retry?{retry}:{}) })});
  const data=await r.json().catch(()=>({}));
  if(typeof data.credits_left==='number'){ G.aiLeft=data.credits_left; const n=$('#creditNote'); if(n) n.textContent=creditText(); }
  return { ok:r.ok, data };
}
const picKeyOf=w=>String(w||'').toLowerCase().replace(/[^a-z0-9' -]/g,' ').replace(/\s+/g,' ').trim().slice(0,60);
// fills wd.pic for the words without one; busy: an element to show the AI wait in.
// retry: the note from an earlier drawing that left words out — those are drawn again free.
// Returns {left: how many still have none, retry: a new note for them (or keeps the old one)}.
async function fillPics(words, busy, retry){
  const need=words.filter(wd=>!wd.pic); if(!need.length) return { left:0, retry:null };
  const put=pics=>need.forEach(wd=>{ const p=pics && pics[picKeyOf(wd.w)]; if(p && !wd.pic) wd.pic=p; });
  try{ const r=await picsApi(need.map(wd=>wd.w), false); if(r.ok) put(r.data.pics); }catch(e){ return { left:need.length, retry }; }
  const left=need.filter(wd=>!wd.pic); if(!left.length) return { left:0, retry:null };
  if(!G.aiReady) return { left:left.length, retry };
  const auth=await aiAuth(); if(!auth) return { left:left.length, retry };
  if(busy){ busy.replaceChildren(aiWait(`🎨 AI กำลังวาดลายเส้น ${left.length} คำ…`,'10–30')); busy.hidden=false; }
  let next=retry;
  try{
    const r=await picsApi(left.map(wd=>wd.w), true, false, auth, retry);
    if(!r.ok){ if(r.data.error==='bad_code') store.set('pv-ai-code',''); toast(aiErr(r.data.error), 5000); }
    else { put(r.data.pics); next=r.data.retry||null; tally(retry ? 'sheet_pics_retry' : 'sheet_pics'); }
  }catch(e){ toast(aiErr('offline')); }
  finally{ if(busy) busy.hidden=true; }
  const n=left.filter(wd=>!wd.pic).length;
  return { left:n, retry: n ? next : null };
}
const picsToast=(words, f)=> f.left ? toast(`ใส่รูปแล้ว ${words.length-f.left} คำ · ยังไม่มีรูป ${f.left} คำ`+(f.retry ? ' — กด 🎨 ใส่รูปที่ขาด ในหน้าตัวอย่างชีทได้ฟรี' : ''), 6000) : null;
const withRetry=(meta, f)=>{ const m={ ...meta }; if(f.retry) m.picRetry=f.retry; else delete m.picRetry; return m; };
const sheetWords=sc=>Object.values(sc.items||{}).filter(it=>it && it.word).map(it=>({ w:it.word, th:it.th||'', ...(it.pic?{pic:it.pic}:{}) }));
// from the preview: give an existing sheet its pictures
async function addSheetPics(sc){
  const words=sheetWords(sc), busy=el('div',{class:'wsbusy'});
  openModal(m=>m.append(el('h3',{text:'🎨 ใส่รูปลายเส้น'}), busy));
  const f=await fillPics(words, busy, sc.meta.picRetry);
  await saveWordSheet(sc, sc.name, words, withRetry(sc.meta, f));
  closeModal(); if(S.view==='play') fullRender(); else renderGallery();
  if(f.left) picsToast(words, f); else toast('ใส่รูปลายเส้นครบทุกคำแล้ว 🎨', 4000);
}
// a new drawing for one word (free, up to 3 a sheet); a word with no picture yet: the bank first
async function redrawPic(id){
  const sc=scene(), it=sc.items[id]; if(!isList(sc) || !it) return;
  if(!it.pic){
    try{ const r=await picsApi([it.word], false); const p=r.ok && r.data.pics && r.data.pics[picKeyOf(it.word)];
      if(p){ await saveWordSheet(sc, sc.name, sheetWords(sc).map(wd=>wd.w===it.word ? { ...wd, pic:p } : wd), sc.meta); fullRender(); toast('ใส่รูปแล้ว 🎨'); return; } }catch(e){}
  }
  const n=(sc.meta.redraws||0); if(n>=3){ toast(it.pic ? 'วาดใหม่ได้ 3 ครั้งต่อชีท' : 'วาดฟรีครบ 3 ครั้งแล้ว — กด 🎨 ใส่รูปลายเส้น ในหน้าตัวอย่างชีท'); return; }
  const auth=await aiAuth(); if(!auth) return;
  toast('🎨 กำลังวาดใหม่…', 8000);
  try{
    const r=await picsApi([it.word], true, true, auth);
    const p=r.ok && r.data.pics && r.data.pics[picKeyOf(it.word)];
    if(!p){ toast(r.ok ? 'วาดไม่สำเร็จ ลองอีกครั้ง' : aiErr(r.data.error), 4000); return; }
    const words=sheetWords(sc).map(wd=>wd.w===it.word ? { ...wd, pic:p } : wd);
    await saveWordSheet(sc, sc.name, words, { ...sc.meta, redraws:n+1 });
    fullRender(); toast(`วาดใหม่แล้ว (เหลือ ${2-n} ครั้งสำหรับชีทนี้)`, 3000); tally('sheet_pic_redraw');
  }catch(e){ toast(aiErr('offline')); }
}
function openSheetMaker(sc){
  const meta=(sc && sc.meta) || {kind:'list', exam:''};
  openModal(m=>{
    m.classList.add('wsbox');
    const ta=el('textarea',{rows:'8',spellcheck:'false','aria-label':'รายการคำศัพท์',placeholder:'apple แอปเปิล\nbanana กล้วย\nelephant ช้าง'});
    ta.value=sc ? Object.values(sc.items).filter(it=>it && it.word).map(it=>it.word+(it.th?' '+it.th:'')).join('\n') : '';
    const count=el('span',{class:'wscount'});
    const name=el('input',{maxlength:'40','aria-label':'ชื่อชุดคำ',value: sc ? sc.name : 'Dictation '+new Date().toLocaleDateString(LOC,{day:'numeric',month:'short'})});
    const date=el('input',{type:'date','aria-label':'วันสอบ',value:meta.exam||''});
    const ok=el('button',{class:'primary'}, sc ? 'บันทึก' : 'สร้างชุดคำ');
    const pics=el('input',{type:'checkbox'}); pics.checked=store.get('pv-sheetpics',true)!==false;
    pics.addEventListener('change',()=>store.set('pv-sheetpics',pics.checked));
    const oldPics={}; if(sc) Object.values(sc.items||{}).forEach(it=>{ if(it && it.word && it.pic) oldPics[it.word.toLowerCase()]=it.pic; });
    const upd=()=>{ const n=parseWordList(ta.value).length; count.textContent=n ? `${n} คำ` : ''; ok.disabled=!n; };
    ta.addEventListener('input',upd);
    // a photo of the sheet: take one with the camera or choose one, then box the part to read
    const cam=el('input',{type:'file',accept:'image/*',capture:'environment',hidden:'',class:'wscam'});
    const file=el('input',{type:'file',accept:'image/*',hidden:'',class:'wsfile'});
    const busy=el('div',{class:'wsbusy',hidden:''});
    const photo=el('div',{class:'wsphotos'},
      el('button',{type:'button',class:'cbtn wsphoto',onclick:()=>cam.click()}, ic('photo_camera'), 'ถ่ายรูปชีท'),
      el('button',{type:'button',class:'cbtn wsphoto',onclick:()=>file.click()}, ic('imagesmode'), 'เลือกรูป'));
    const picked=inp=>{
      const f=inp.files[0]; inp.value=''; if(!f) return;
      photo.hidden=true;
      const panel=sheetCropper(f, async src=>{
        busy.replaceChildren(aiWait('🤖 AI กำลังอ่านชีท…','10–30')); busy.hidden=false;
        const got=await readSheetPhoto(src);
        busy.hidden=true; photo.hidden=false;
        if(got && got.length){
          const lines=got.map(x=>x.w+(x.th?' '+x.th:'')).join('\n');
          ta.value=ta.value.trim() ? ta.value.trim()+'\n'+lines : lines; upd();
          toast(`AI อ่านได้ ${got.length} คำ — ตรวจและแก้ได้ก่อนบันทึก`, 4000);
        }
      }, ()=>{ photo.hidden=false; });
      photo.after(panel);
    };
    cam.addEventListener('change',()=>picked(cam)); file.addEventListener('change',()=>picked(file));
    ok.addEventListener('click',async()=>{
      const words=parseWordList(ta.value); if(!words.length){ ta.focus(); return; }
      ok.disabled=true;
      words.forEach(wd=>{ const p=oldPics[wd.w.toLowerCase()]; if(p) wd.pic=p; });
      const f=pics.checked ? await fillPics(words, busy, sc && sc.meta.picRetry) : { left:0, retry:sc && sc.meta.picRetry };
      const nm=(name.value.trim()||'Dictation').slice(0,40);
      const s2=await saveWordSheet(sc, nm, words, withRetry({kind:'list', exam:date.value||'', style:'listen', ...(sc && sc.meta.redraws ? { redraws:sc.meta.redraws } : {})}, f));
      if(f.left) setTimeout(()=>picsToast(words, f), 4200);
      closeModal();
      if(sc){ if(S.view==='play') fullRender(); else renderGallery(); toast('บันทึกชุดคำแล้ว'); }
      else { openScene(s2.id,'learn'); toast(`สร้างชุดคำ ${words.length} คำแล้ว — แตะการ์ดเพื่อฟังคำ`, 4000); }
    });
    m.append(
      el('div',{class:'shhead'}, el('h3',{}, ic('edit_note'), sc?'แก้ไขชีทคำศัพท์':'ชีทคำศัพท์จากครู'), el('button',{class:'x','aria-label':'ปิด',text:'✕',onclick:closeModal})),
      el('p',{class:'note',text:'ถ่ายรูปชีทให้ AI อ่าน หรือพิมพ์/วางคำทีละบรรทัด ตามด้วยความหมาย'}),
      G.aiReady ? photo : null, G.aiReady ? aiNotice('sheet') : null, busy, cam, file,
      ta, el('div',{class:'wsrow'}, count, el('span',{class:'note small',text:'เช่น apple แอปเปิล'})),
      el('label',{class:'wslabel'}, el('span',{text:'ชื่อชุด'}), name),
      el('label',{class:'wslabel'}, el('span',{},ic('event'),'วันสอบ (ถ้ามี)'), date),
      el('label',{class:'chk wspics'}, pics, el('span',{}, el('b',{text:'🎨 ใส่รูปลายเส้นให้แต่ละคำ'}), el('small',{text:'คำที่มีรูปในคลังแล้วไม่ใช้เครดิต · คำที่ยังไม่มีรูปให้ AI วาด ใช้ 1 เครดิตต่อชีท'}))),
      el('div',{class:'row'}, el('span',{class:'sp'}), el('button',{text:'ยกเลิก',onclick:closeModal}), ok));
    upd();
  });
}
$('#fileImg').addEventListener('change', onPickImage);
$('#fileCam').addEventListener('change', onPickImage);
function deleteScene(){
  const sc=scene(); if(sc.builtin) return;
  ask(`ลบฉาก “${sc.name}” ใช่ไหม? ลบแล้วกู้คืนไม่ได้`,'ลบฉาก').then(ok=>{
    if(!ok) return;
    G.customs=G.customs.filter(s=>s!==sc); delete progress[sc.id]; forgetSceneLocal(sc.id);
    if(typeof syncDeleted==='function') syncDeleted(sc);
    { const sh=myShares['scene:'+sc.id]; if(sh && user){ shareApi('DELETE','/api/share/'+sh.id).catch(()=>{}); delete myShares['scene:'+sc.id]; store.set('pv-shares',myShares); } }
    saveScenes(); saveProg();
    S.sceneId='tea'; store.set('pv-scene','tea'); S.editing=false; S.view='home'; fullRender(); toast('ลบฉากแล้ว');
  });
}
// Save the scene (picture + boxes) as a .piccab file to send to a friend.
// Phones open the share menu (LINE, Messenger…) when the browser allows it; otherwise the file downloads.
function sceneFile(sc){
  const data=JSON.stringify({app:'piccab',v:1,name:sc.name,img:sc.img,w:sc.w,h:sc.h,items:sc.items,...(sc.meta?{meta:sc.meta}:{})});
  const base=String(sc.name||'').replace(/[\\/:*?"<>|\u0000-\u001f]+/g,' ').replace(/\s+/g,' ').trim().slice(0,50)||tx('ฉาก');
  return new File([data], base+'.piccab', {type:'application/json'});
}
async function shareScene(){
  const sc=scene();
  if(!sc.img){ toast('รูปของฉากนี้ยังโหลดไม่เสร็จ ลองใหม่อีกครั้ง'); return; }
  const file=sceneFile(sc);
  if(matchMedia('(pointer:coarse)').matches && navigator.share && navigator.canShare && navigator.canShare({files:[file]})){
    try{ await navigator.share({files:[file], title:sc.name}); return; }
    catch(e){ if(e && e.name==='AbortError') return; }
  }
  const url=URL.createObjectURL(file), a=el('a',{href:url,download:file.name,hidden:''});
  document.body.append(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),30000);
  toast('บันทึกไฟล์ “'+file.name+'” แล้ว — ส่งไฟล์นี้ให้เพื่อน แล้วให้เพื่อนกด 📥 นำเข้า → นำเข้าไฟล์ฉาก', 6000);
}
function importData(text){
  let o; try{ o=JSON.parse(text); }catch(e){ toast('ข้อมูลไม่ถูกต้อง'); return false; }
  if(!o || typeof o.img!=='string' || !o.img.startsWith('data:image/') || !(o.w>0) || !(o.h>0) || typeof o.items!=='object'){ toast('ข้อมูลไม่ใช่ฉากของแอปนี้'); return false; }
  const its={};
  for(const [k,v] of Object.entries(o.items)){
    if(!v || typeof v.word!=='string') continue;
    const n=x=>Number.isFinite(+x)?+x:0;
    const nk='h'+Math.random().toString(36).slice(2,9);
    its[nk]={word:v.word.slice(0,80), th:String(v.th||'').slice(0,120), alts:Array.isArray(v.alts)?v.alts.filter(a=>typeof a==='string').slice(0,4).map(a=>a.slice(0,60)):[], x:n(v.x), y:n(v.y), w:n(v.w), h:n(v.h)};
    const lw=cleanLang(v.l); if(lw) its[nk].l=lw;
  }
  const sc={id:'s'+Date.now().toString(36), name:String(o.name||tx('ฉากที่นำเข้า')).slice(0,50), img:o.img, w:+o.w, h:+o.h, items:its, ...metaFrom(o)};
  G.customs.push(sc); saveScenes(); S.sceneId=sc.id; store.set('pv-scene',sc.id); G.help={}; G.used={};
  S.view='library'; fullRender(); toast('นำเข้าฉาก “'+sc.name+'” แล้ว ✓'); return true;
}
const isImageFile=f=>!!f && (/^image\//.test(f.type) || /\.(jpe?g|png|gif|webp|heic|heif|bmp)$/i.test(f.name||''));
function importFile(f){
  if(!f) return;
  if(isImageFile(f)){ closeModal(); createSceneFromFile(f); return; }
  const fr=new FileReader(); fr.onload=()=>{ if(importData(fr.result)) closeModal(); }; fr.readAsText(f);
}
function openImport(){
  openModal(m=>{
    m.append(el('h3',{text:'เพิ่มฉากใหม่'}),
      el('p',{text: G.aiReady ? 'ใส่รูปแล้ว AI จะหาคำศัพท์ให้อัตโนมัติ' : 'ใส่รูปแล้วลากกรอบรอบสิ่งของเพื่อใส่คำศัพท์'}),
      el('div',{class:'createrow'},
        el('button',{class:'cbtn',onclick:()=>{ closeModal(); $('#fileCam').click(); }},'📷 ถ่ายรูป'),
        el('button',{class:'cbtn',onclick:()=>{ closeModal(); $('#fileImg').click(); }},'🖼️ เลือกรูป')),
      el('button',{class:'cbtn wide wsimp',onclick:()=>{ closeModal(); openSheetMaker(); }}, ic('edit_note'), 'ชีทคำศัพท์จากครู (สำหรับสอบ Dictation)'));
    if(G.aiReady) m.append(aiNotice());
    if(matchMedia('(pointer:fine)').matches) m.append(el('p',{class:'imphint',text:'หรือลากรูปมาวางที่นี่ / กด Ctrl+V เพื่อวางรูป'}));
    m.append(el('div',{class:'impfoot'},
        el('button',{class:'linkbtn',onclick:()=>$('#fileJson').click()},'📄 มีไฟล์ฉากจากเพื่อน? ',el('u',{text:'นำเข้าไฟล์ฉาก'})),
        el('span',{class:'sp'}),
        el('button',{text:'ยกเลิก',onclick:closeModal})));
  });
}
const importOpen=()=>!$('#modal').hidden && !!$('#mbox .impfoot');
// paste a picture (e.g. a screenshot) — or old copied scene text — while the dialog is open
document.addEventListener('paste',e=>{
  if(!importOpen()) return;
  const cd=e.clipboardData; if(!cd) return;
  const f=[...(cd.files||[])].find(isImageFile);
  if(f){ e.preventDefault(); importFile(f); return; }
  const t=(cd.getData('text')||'').trim();
  if(t.startsWith('{')){ e.preventDefault(); if(importData(t)) closeModal(); }
});
// drag & drop an image or scene file onto the import box
const mbox=$('#mbox');
mbox.addEventListener('dragover',e=>{ if(importOpen() && e.dataTransfer && [...e.dataTransfer.types].includes('Files')){ e.preventDefault(); mbox.classList.add('drop'); } });
mbox.addEventListener('dragleave',e=>{ if(!mbox.contains(e.relatedTarget)) mbox.classList.remove('drop'); });
mbox.addEventListener('drop',e=>{
  mbox.classList.remove('drop');
  if(!importOpen()) return;
  const f=e.dataTransfer && e.dataTransfer.files[0]; if(!f) return;
  e.preventDefault(); importFile(f);
});
$('#fileJson').addEventListener('change', e=>{
  const f=e.target.files[0]; e.target.value=''; importFile(f);
});

export { addSheetPics, aiAuth, deleteScene, examIn, examLabel, isList, listStyle, openImport, openSheetMaker, redrawPic, shareScene, svgUrl };
