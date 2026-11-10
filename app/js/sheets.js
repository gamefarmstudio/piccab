// Piccab — Word sheets: a teacher's word list for a spelling test.
import { G, $, cleanLang, el, ic, LOC, progress, S, scene, store, tally, toast, tx } from './core.js';
import { dayNo, forgetSceneLocal, imgSaved, saveProg, saveScenes } from './progress.js';
import { ask, closeModal, fullRender, openModal, openScene } from './scene.js';
import { renderGallery } from './home.js';
import { aiCredits, aiErr, aiMonthly, aiNeedCode, aiNotice, askCode, createSceneFromFile, loadImageFile, onPickImage } from './editor.js';
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
async function drawSheet(words){
  try{ await Promise.all([document.fonts.load('600 32px Sarabun',String.fromCharCode(3585,3586,97)), document.fonts.load('600 20px Fredoka','123')]); }catch(e){}
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
    const cx=bx+84+(cw-84-16)/2, room=cw-84-28, th=(wd.th||'').trim();
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
    items[id]={ word:wd.w, th:wd.th||'', alts:prev.alts||[], ...(prev.l?{l:prev.l}:{}), x:b.x, y:b.y, w:b.w, h:b.h };
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
// Photo of the sheet → [{w, th}] (one AI credit)
async function readSheetPhoto(file){
  let im; try{ im=await loadImageFile(file); }catch(e){ toast('เปิดรูปนี้ไม่ได้ ลองไฟล์ .jpg หรือ .png'); return null; }
  const auth=await aiAuth(); if(!auth) return null;
  let r, data={};
  try{
    r=await fetch('/api/wordlist',{method:'POST', headers:{'content-type':'application/json', ...(auth.tok?{authorization:'Bearer '+auth.tok}:{}), ...(auth.code?{'x-piccab-code':auth.code}:{})}, body:JSON.stringify({image:im.src})});
    data=await r.json().catch(()=>({}));
  }catch(e){ toast(aiErr('offline')); return null; }
  if(typeof data.credits_left==='number'){ G.aiLeft=data.credits_left; const n=$('#creditNote'); if(n) n.textContent=creditText(); }
  if(!r.ok){ if(data.error==='bad_code') store.set('pv-ai-code',''); toast(aiErr(data.error), 5000); return null; }
  const items=(data.items||[]).filter(x=>x && x.w);
  if(!items.length) toast('ไม่พบรายการคำศัพท์ในรูปนี้ ลองถ่ายให้ชัดและตรงขึ้น หรือพิมพ์เอง', 5000);
  return items;
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
    const upd=()=>{ const n=parseWordList(ta.value).length; count.textContent=n ? `${n} คำ` : ''; ok.disabled=!n; };
    ta.addEventListener('input',upd);
    const file=el('input',{type:'file',accept:'image/*',hidden:''});
    const photo=el('button',{type:'button',class:'cbtn wsphoto',onclick:()=>file.click()}, ic('photo_camera'), 'ถ่ายรูปชีท ให้ AI อ่าน');
    file.addEventListener('change',async()=>{
      const f=file.files[0]; file.value=''; if(!f) return;
      photo.disabled=true; photo.classList.add('busyline'); photo.lastChild.textContent='AI กำลังอ่านชีท…';
      const got=await readSheetPhoto(f);
      photo.disabled=false; photo.classList.remove('busyline'); photo.lastChild.textContent='ถ่ายรูปชีท ให้ AI อ่าน';
      if(got && got.length){
        const lines=got.map(x=>x.w+(x.th?' '+x.th:'')).join('\n');
        ta.value=ta.value.trim() ? ta.value.trim()+'\n'+lines : lines; upd();
        toast(`AI อ่านได้ ${got.length} คำ — ตรวจและแก้ได้ก่อนบันทึก`, 4000);
      }
    });
    ok.addEventListener('click',async()=>{
      const words=parseWordList(ta.value); if(!words.length){ ta.focus(); return; }
      ok.disabled=true;
      const nm=(name.value.trim()||'Dictation').slice(0,40);
      const s2=await saveWordSheet(sc, nm, words, {kind:'list', exam:date.value||'', style:'listen'});
      closeModal();
      if(sc){ if(S.view==='play') fullRender(); else renderGallery(); toast('บันทึกชุดคำแล้ว'); }
      else { openScene(s2.id,'learn'); toast(`สร้างชุดคำ ${words.length} คำแล้ว — แตะการ์ดเพื่อฟังคำ`, 4000); }
    });
    m.append(
      el('div',{class:'shhead'}, el('h3',{}, ic('edit_note'), sc?'แก้ไขชีทคำศัพท์':'ชีทคำศัพท์จากครู'), el('button',{class:'x','aria-label':'ปิด',text:'✕',onclick:closeModal})),
      el('p',{class:'note',text:'ถ่ายรูปชีทให้ AI อ่าน หรือพิมพ์/วางคำทีละบรรทัด ตามด้วยความหมาย'}),
      G.aiReady ? photo : null, file,
      ta, el('div',{class:'wsrow'}, count, el('span',{class:'note small',text:'เช่น apple แอปเปิล'})),
      el('label',{class:'wslabel'}, el('span',{text:'ชื่อชุด'}), name),
      el('label',{class:'wslabel'}, el('span',{},ic('event'),'วันสอบ (ถ้ามี)'), date),
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

export { deleteScene, examIn, examLabel, isList, listStyle, openImport, openSheetMaker, shareScene };
