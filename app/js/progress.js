// Piccab — Spaced repetition (when each word is due) and saving scenes/progress in this browser (localStorage, IndexedDB).
import { G, langMap, progress, S, scene, store, toast } from './core.js';
import { allWords } from './home.js';
import { reportClassProgressSoon } from './classes.js';
import { reportFriendStatsSoon } from './friends.js';
import { syncSoon } from './sync.js';

// ---------- spaced repetition ----------
// A passed word is due again after 1, 3, 7, 14, 30, 60, 120 days. Typing it right with no help moves it up a step;
// needing help or a wrong try brings it back a step and asks again tomorrow. Kept inside progress.done (true or {b,d}),
// so it syncs with what already exists and older versions still see the word as passed.
const SRS_DAYS=[1,3,7,14,30,60,120];
const dayNo=(t)=>{ const d=t?new Date(t):new Date(); return Math.floor((d.getTime()-d.getTimezoneOffset()*60000)/86400000); };
function hashStr(x){ let h=2166136261; for(let i=0;i<x.length;i++){ h^=x.charCodeAt(i); h=Math.imul(h,16777619); } return h>>>0; }
// Words passed before this existed: start them at step 1, spread over a few days so nobody gets everything at once.
function srsOf(scId,id){
  const p=progress[scId], v=p && p.done && p.done[id];
  if(!v) return null;
  if(typeof v==='object' && v.d!=null) return {b:Math.max(1,Math.min(SRS_DAYS.length,v.b|0||1)), d:v.d|0};
  const base=p.updatedAt ? dayNo(p.updatedAt) : dayNo()-1;
  return {b:1, d:base+1+hashStr(scId+'|'+id)%4, legacy:true};
}
const srsDue=(scId,id)=>{ const r=srsOf(scId,id); return !!r && r.d<=dayNo(); };
// Called when a word is typed right. clean = no hint/listen/answer and no wrong try.
function srsAnswer(p, scId, id, clean){
  const t=dayNo(), cur=srsOf(scId,id);
  if(!cur){ p.done[id]={b:1, d:t+1}; return; }                         // just learned → see it again tomorrow
  if(cur.d>t){ if(cur.legacy) p.done[id]={b:cur.b, d:cur.d}; return; }  // not due yet: keep the plan
  if(clean){ const b=Math.min(cur.b+1, SRS_DAYS.length); p.done[id]={b, d:t+SRS_DAYS[b-1]}; }
  else p.done[id]={b:Math.max(1,cur.b-1), d:t+1};
}
function dueWords(all){ const t=dayNo(); return (all||allWords()).filter(w=>{ if(w.st==='todo') return false; const r=srsOf(w.sc.id,w.pid); return r && r.d<=t; }); }
function dueOn(day, all){ return (all||allWords()).filter(w=>{ if(w.st==='todo') return false; const r=srsOf(w.sc.id,w.pid); return r && r.d===day; }).length; }
function nextReviewText(scId,id){
  const r=srsOf(scId,id); if(!r) return '';
  const n=r.d-dayNo();
  return n<=0 ? '🔁 ถึงรอบทบทวน' : n===1 ? 'ทบทวนพรุ่งนี้' : n<7 ? `ทบทวนอีก ${n} วัน` : n<30 ? `ทบทวนอีก ${Math.round(n/7)} สัปดาห์` : `ทบทวนอีก ${Math.round(n/30)} เดือน`;
}
function progRaw(){ const id=scene().id; if(!progress[id]) progress[id]={done:{},star:{}}; const p=progress[id]; p.done=p.done||{}; p.star=p.star||{}; return p; }
// progress of the current scene in the language being practised (keys are item ids either way)
function prog(){ const p=progRaw(); return S.lang==='en' ? p : { done:langMap(p.done,S.lang), star:langMap(p.star,S.lang) }; }
function saveProg(){
  const now=Date.now();
  for(const [id,p] of Object.entries(progress)){ if(!p) continue; const g=JSON.stringify([p.done||{},p.star||{}]); if(p._sig!==g){ if(p._sig!==undefined || !p.updatedAt) p.updatedAt=now; Object.defineProperty(p,'_sig',{value:g,writable:true,configurable:true,enumerable:false}); } }
  store.set('pv-progress', progress);
  if(typeof syncSoon==='function') syncSoon();
  if(typeof reportClassProgressSoon==='function') reportClassProgressSoon();
  if(typeof reportFriendStatsSoon==='function') reportFriendStatsSoon();
}
Object.values(progress).forEach(p=>{ if(p) Object.defineProperty(p,'_sig',{value:JSON.stringify([p.done||{},p.star||{}]),writable:true,configurable:true,enumerable:false}); });
// ---------- local persistence ----------
const IDB=(()=>{
  let dbp=null;
  const open=()=>dbp||(dbp=new Promise((res,rej)=>{
    try{ const r=indexedDB.open('piccab',1); r.onupgradeneeded=()=>r.result.createObjectStore('img'); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); }catch(e){ rej(e); }
  }));
  const run=(mode,fn)=>open().then(db=>new Promise((res,rej)=>{ const t=db.transaction('img',mode), q=fn(t.objectStore('img')); t.oncomplete=()=>res(q&&q.result); t.onerror=()=>rej(t.error); t.onabort=()=>rej(t.error); }));
  return { ok: !!window.indexedDB, get:k=>run('readonly',st=>st.get(k)), set:(k,v)=>run('readwrite',st=>st.put(v,k)), del:k=>run('readwrite',st=>st.delete(k)) };
})();
let useIDB=false;                       // decided in boot()
const imgSaved=new Set();               // scene ids whose current picture is already in IndexedDB
const SCENE_FIELDS=['id','name','w','h','items','updatedAt','owner','meta'];
const metaOf=sc=>{ const o={}; SCENE_FIELDS.forEach(k=>{ if(sc[k]!==undefined) o[k]=sc[k]; }); return o; };
const sigOf=sc=>JSON.stringify(sc.meta ? [sc.name,sc.w,sc.h,sc.items,sc.meta] : [sc.name,sc.w,sc.h,sc.items]);
function saveScenes(){
  // Stamp scenes whose content changed, so sync knows what is newer.
  const now=Date.now();
  G.customs.forEach(sc=>{ const g=sigOf(sc); if(sc._sig!==g){ if(sc._sig!==undefined || !sc.updatedAt) sc.updatedAt=now; Object.defineProperty(sc,'_sig',{value:g,writable:true,configurable:true,enumerable:false}); } });
  let ok;
  if(useIDB){
    ok=store.set('pv-scenes2', G.customs.map(metaOf));
    G.customs.forEach(sc=>{ if(sc.img && !imgSaved.has(sc.id)){ imgSaved.add(sc.id); IDB.set(sc.id, sc.img).catch(()=>{ imgSaved.delete(sc.id); toast('บันทึกรูปในเบราว์เซอร์ไม่ได้ (พื้นที่ไม่พอ)', 5000); }); } });
  } else ok=store.set('pv-scenes', G.customs);
  if(!ok) toast('บันทึกฉากในเบราว์เซอร์ไม่ได้ (พื้นที่ไม่พอ) — กด “🔗 แชร์ฉาก → ส่งเป็นไฟล์” เก็บไว้ก่อนปิดหน้า', 5000);
  if(typeof syncSoon==='function') syncSoon();
}
// Save scenes as they are, without stamping edit times (used by sync).
function persistScenesQuiet(){
  if(!useIDB){ store.set('pv-scenes', G.customs); return; }
  store.set('pv-scenes2', G.customs.map(metaOf));
  G.customs.forEach(sc=>{ if(sc.img && !imgSaved.has(sc.id)){ imgSaved.add(sc.id); IDB.set(sc.id, sc.img).catch(()=>imgSaved.delete(sc.id)); } });
}
function forgetSceneLocal(id){ imgSaved.delete(id); if(useIDB) IDB.del(id).catch(()=>{}); }
async function boot(){
  if(!IDB.ok){ useIDB=false; return; }
  try{
    const legacy=store.get('pv-scenes', null);
    if(Array.isArray(legacy) && !store.get('pv-scenes2', null)){
      // one-time move of inline pictures into IndexedDB
      for(const sc of legacy){ if(sc && sc.img) await IDB.set(sc.id, sc.img); }
      store.set('pv-scenes2', legacy.map(metaOf));
      try{ localStorage.removeItem('pv-scenes'); }catch(e){}
    }
    useIDB=true;
    G.customs=(store.get('pv-scenes2', [])||[]).filter(sc=>sc && sc.id);
    await Promise.all(G.customs.map(async sc=>{ const im=await IDB.get(sc.id).catch(()=>null); if(im){ sc.img=im; imgSaved.add(sc.id); } }));
  }catch(e){ useIDB=false; G.customs=store.get('pv-scenes', [])||[]; }
  G.customs.forEach(sc=>Object.defineProperty(sc,'_sig',{value:sigOf(sc),writable:true,configurable:true,enumerable:false}));
}

export { boot, dayNo, dueOn, dueWords, forgetSceneLocal, imgSaved, nextReviewText, persistScenesQuiet, prog, progRaw, saveProg, saveScenes, sigOf, srsAnswer, srsDue, srsOf };
