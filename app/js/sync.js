// Piccab — Sync: scenes + progress in Supabase, pictures in R2 (/api/img).
import { G, $, LOC, progress, S, scenes, store } from './core.js';
import { forgetSceneLocal, imgSaved, persistScenesQuiet, sigOf } from './progress.js';
import { refresh, renderScene } from './scene.js';
import { renderGallery } from './home.js';
import { deckSig, dsig, getDeck, SAVED_DECK } from './decks.js';
import { isList } from './sheets.js';
import { sb, user } from './account.js';

// ---------- sync: scenes + progress in Supabase, pictures in R2 (via /api/img) ----------
// Each device remembers what it last synced ('pv-sync'), so only changes are sent.
// Conflicts: the newer edit of a scene (or of a scene's progress) wins.
const SYNC={ ready:false, busy:false, again:false, timer:null, state:'idle', at:0, lastPull:0,
  mem: store.get('pv-sync', null) || {}, del: store.get('pv-sync-del', []) || [], delDecks: store.get('pv-sync-del-decks', []) || [], noDecks:false };
const syncMem=uid=>{ if(SYNC.mem.uid!==uid) SYNC.mem={ uid, scenes:{}, img:{}, prog:{}, decks:{} }; if(!SYNC.mem.decks) SYNC.mem.decks={}; return SYNC.mem; };
const saveSyncMem=()=>{ store.set('pv-sync', SYNC.mem); store.set('pv-sync-del', SYNC.del); store.set('pv-sync-del-decks', SYNC.delDecks); };
// The decks table is added by supabase/2026-11-decks.sql — until it exists, decks just stay on this device.
const missingTable=e=>!!e && (e.status===404 || e.code==='42P01' || e.code==='PGRST205' || /does not exist|schema cache/i.test(e.message||''));
// Deck sync never blocks scenes/pictures/progress: on failure it just tries again next time.
function deckSyncFailed(e){ if(missingTable(e)){ SYNC.noDecks=true; console.warn('decks table missing — run supabase/2026-11-decks.sql'); } else console.warn('deck sync failed', e); }
const progSig=p=>JSON.stringify([p.done||{},p.star||{}]);
function syncText(){
  const n=G.customs.filter(sc=>user && sc.owner===user.id).length;
  if(SYNC.state==='busy') return '☁️ กำลังซิงค์…';
  if(SYNC.state==='error') return '⚠️ ซิงค์ไม่สำเร็จ (จะลองใหม่อัตโนมัติ) — ข้อมูลยังอยู่ในเครื่องนี้';
  if(!SYNC.at) return '☁️ ฉาก รูป และความคืบหน้าจะซิงค์กับบัญชีนี้อัตโนมัติ';
  return `☁️ ซิงค์แล้ว ${n} ฉาก · ล่าสุด ${new Date(SYNC.at).toLocaleTimeString(LOC,{hour:'2-digit',minute:'2-digit'})} น.`;
}
async function accessToken(){ const { data } = await sb.auth.getSession(); return data && data.session && data.session.access_token || null; }
function syncSoon(){ if(!sb || !user || !SYNC.ready) return; clearTimeout(SYNC.timer); SYNC.timer=setTimeout(()=>syncNow(false), 1500); }
function syncDeleted(sc){ if(sc.owner && user && sc.owner===user.id){ SYNC.del.push(sc.id); saveSyncMem(); } }
function syncStart(){
  SYNC.ready=true;
  if(user) syncNow(true);
  document.addEventListener('visibilitychange',()=>{ if(!document.hidden && user && Date.now()-SYNC.lastPull>30000) syncNow(true); });
}
async function syncNow(pull){
  if(!sb || !user || !SYNC.ready) return;
  if(SYNC.busy){ SYNC.again=true; return; }
  SYNC.busy=true; SYNC.state='busy'; { const n=$('#syncNote'); if(n) n.textContent=syncText(); }
  try{
    if(pull) await syncPull();
    await syncPush();
    SYNC.state='ok'; SYNC.at=Date.now();
  }catch(e){
    console.warn('sync failed', e); SYNC.state='error';
    clearTimeout(SYNC.timer); SYNC.timer=setTimeout(()=>syncNow(true), 30000);
  }finally{
    SYNC.busy=false;
    const n=$('#syncNote'); if(n) n.textContent=syncText();
    if(SYNC.again){ SYNC.again=false; syncSoon(); }
  }
}
function afterSyncChange(){
  // keep localStorage/IndexedDB in step without re-stamping edit times
  persistScenesQuiet(); store.set('pv-progress', progress); store.set('pv-decks', G.decks);
  if(!scenes().some(x=>x.id===S.sceneId)){ S.sceneId='tea'; if(S.view==='play'){ S.view='home'; S.editing=false; } }
  if(S.view==='play'){ if(!S.editing){ renderScene(); refresh(); } } else renderGallery();
}
const setSig=(o,g)=>Object.defineProperty(o,'_sig',{value:g,writable:true,configurable:true,enumerable:false});
// scenes.meta (word-sheet details) needs supabase/2026-11-scene-meta.sql; without it sync carries on without them
let sceneMetaCol=true;
const noMetaCol=e=>!!e && (e.code==='42703' || e.code==='PGRST204' || /\bmeta\b/.test(String(e.message||'')));
function metaFrom(r){ const m=r && r.meta; return (m && typeof m==='object' && m.kind==='list') ? { meta:{ kind:'list', exam:/^\d{4}-\d{2}-\d{2}$/.test(m.exam||'')?m.exam:'', style:m.style==='meaning'?'meaning':'listen' } } : {}; }
async function syncPull(){
  const uid=user.id, mem=syncMem(uid);
  let changed=false;
  // scenes that belong to another account leave this device (they are safe in that account)
  for(const sc of G.customs.slice()) if(sc.owner && sc.owner!==uid){ G.customs.splice(G.customs.indexOf(sc),1); forgetSceneLocal(sc.id); delete progress[sc.id]; changed=true; }
  let { data:rows, error } = await sb.from('scenes').select('id,name,w,h,items,deleted,updated_at'+(sceneMetaCol?',meta':''));
  if(error && sceneMetaCol && noMetaCol(error)){ sceneMetaCol=false; ({ data:rows, error } = await sb.from('scenes').select('id,name,w,h,items,deleted,updated_at')); }
  if(error) throw error;
  const need=[];
  for(const r of rows||[]){
    const t=Date.parse(r.updated_at)||0, loc=G.customs.find(sc=>sc.id===r.id);
    if(r.deleted){
      if(loc && (loc.updatedAt||0)<=t){ G.customs.splice(G.customs.indexOf(loc),1); forgetSceneLocal(loc.id); delete progress[loc.id]; changed=true; }
      delete mem.scenes[r.id]; delete mem.img[r.id]; continue;
    }
    mem.img[r.id]=true;                                   // a row exists → its picture was uploaded first
    if(!loc){
      const sc={ id:r.id, name:r.name, w:r.w, h:r.h, items:r.items||{}, updatedAt:t, owner:uid, img:null, ...metaFrom(r) };
      setSig(sc, sigOf(sc)); G.customs.push(sc); mem.scenes[r.id]=sc._sig; need.push(sc); changed=true;
    } else if(t>(loc.updatedAt||0)){
      Object.assign(loc,{ name:r.name, w:r.w, h:r.h, items:r.items||{}, updatedAt:t, owner:uid });
      if(sceneMetaCol){ const mt=metaFrom(r); if(mt.meta) loc.meta=mt.meta; else delete loc.meta; }
      setSig(loc, sigOf(loc)); mem.scenes[r.id]=loc._sig;
      if(!loc.img){ need.push(loc); } else if(isList(loc)){ need.push(loc); }   // a sheet's picture is redrawn when its words change
      changed=true;
    } else {
      if(loc.owner!==uid){ loc.owner=uid; changed=true; }
      if(t===(loc.updatedAt||0)) mem.scenes[r.id]=sigOf(loc);
      if(!loc.img) need.push(loc);
    }
  }
  const { data:prows, error:e2 } = await sb.from('progress').select('scene_id,done,star,updated_at');
  if(e2) throw e2;
  for(const r of prows||[]){
    const t=Date.parse(r.updated_at)||0, lp=progress[r.scene_id];
    if(!lp || t>(lp.updatedAt||0)){ const np={ done:r.done||{}, star:r.star||{}, updatedAt:t }; setSig(np, progSig(np)); progress[r.scene_id]=np; mem.prog[r.scene_id]=np._sig; changed=true; }
    else if(t===(lp.updatedAt||0)) mem.prog[r.scene_id]=progSig(lp);
  }
  if(!SYNC.noDecks){ try{ if(await pullDecks(uid, mem)) changed=true; }catch(e){ deckSyncFailed(e); } }
  saveSyncMem(); SYNC.lastPull=Date.now();
  if(changed) afterSyncChange();
  if(need.length) downloadPictures(need);
}
async function pullDecks(uid, mem){
  let changed=false;
  for(const d of G.decks.slice()) if(d.owner && d.owner!==uid){ G.decks.splice(G.decks.indexOf(d),1); changed=true; }
  const { data:rows, error, status } = await sb.from('decks').select('id,name,words,deleted,updated_at');
  if(error){ error.status=status; throw error; }
  for(const r of rows||[]){
    const t=Date.parse(r.updated_at)||0, loc=getDeck(r.id), words=Array.isArray(r.words)?r.words.filter(x=>typeof x==='string'):[];
    if(r.deleted){
      if(loc && (loc.owner || r.id!==SAVED_DECK) && (loc.updatedAt||0)<=t){ G.decks.splice(G.decks.indexOf(loc),1); changed=true; }
      delete mem.decks[r.id]; continue;
    }
    if(!loc){ const d={ id:r.id, name:r.name||'', words, updatedAt:t, owner:uid }; dsig(d, deckSig(d)); G.decks.push(d); mem.decks[r.id]=d._sig; changed=true; }
    else if(!loc.owner && r.id===SAVED_DECK){
      // first sign-in on this device: keep words saved before signing in as well as the account's
      loc.words=[...new Set(words.concat(loc.words))]; loc.owner=uid; loc.updatedAt=Math.max(t, loc.updatedAt||0)+1; dsig(loc, deckSig(loc)); changed=true;
    }
    else if(t>(loc.updatedAt||0)){ Object.assign(loc,{ name:r.name||'', words, updatedAt:t, owner:uid }); dsig(loc, deckSig(loc)); mem.decks[r.id]=loc._sig; changed=true; }
    else { if(loc.owner!==uid){ loc.owner=uid; changed=true; } if(t===(loc.updatedAt||0)) mem.decks[r.id]=deckSig(loc); }
  }
  return changed;
}
async function pushDecks(uid, mem){
  for(const id of SYNC.delDecks.slice()){
    const { error, status } = await sb.from('decks').upsert({ user_id:uid, id, name:'', words:[], deleted:true, updated_at:new Date().toISOString() }, { onConflict:'user_id,id' });
    if(error){ error.status=status; throw error; }
    SYNC.delDecks=SYNC.delDecks.filter(x=>x!==id); delete mem.decks[id]; saveSyncMem();
  }
  const rows=[];
  for(const d of G.decks){
    if(d.owner && d.owner!==uid) continue;
    if(mem.decks[d.id]===deckSig(d) && d.owner===uid) continue;
    d.owner=uid;
    rows.push({ user_id:uid, id:d.id, name:String(d.name||'').slice(0,60), words:d.words, deleted:false, updated_at:new Date(d.updatedAt||Date.now()).toISOString() });
  }
  if(rows.length){
    const { error, status } = await sb.from('decks').upsert(rows, { onConflict:'user_id,id' });
    if(error){ error.status=status; throw error; }
    rows.forEach(r=>{ const d=getDeck(r.id); if(d) mem.decks[r.id]=deckSig(d); });
    store.set('pv-decks', G.decks);
  }
}
async function downloadPictures(list){
  const tok=await accessToken(); if(!tok) return;
  let got=0;
  for(const sc of list){
    try{
      const r=await fetch('/api/img/'+encodeURIComponent(sc.id), { headers:{ authorization:'Bearer '+tok } });
      if(!r.ok) continue;
      const blob=await r.blob();
      imgSaved.delete(sc.id);
      sc.img=await new Promise((res,rej)=>{ const fr=new FileReader(); fr.onload=()=>res(fr.result); fr.onerror=rej; fr.readAsDataURL(blob); });
      got++;
    }catch(e){}
  }
  if(got) afterSyncChange();
}
function dataUrlBlob(u){
  const i=u.indexOf(','), type=(u.slice(5,i).split(';')[0])||'image/jpeg', bin=atob(u.slice(i+1)), a=new Uint8Array(bin.length);
  for(let k=0;k<bin.length;k++) a[k]=bin.charCodeAt(k);
  return new Blob([a],{type});
}
async function syncPush(){
  const uid=user.id, mem=syncMem(uid), tok=await accessToken();
  if(!tok) return;
  // deletions first
  for(const id of SYNC.del.slice()){
    const { error } = await sb.from('scenes').update({ deleted:true, items:{}, updated_at:new Date().toISOString() }).eq('user_id',uid).eq('id',id);
    if(error) throw error;
    await sb.from('progress').delete().eq('user_id',uid).eq('scene_id',id);
    await fetch('/api/img/'+encodeURIComponent(id), { method:'DELETE', headers:{ authorization:'Bearer '+tok } }).catch(()=>{});
    SYNC.del=SYNC.del.filter(x=>x!==id); delete mem.scenes[id]; delete mem.img[id]; saveSyncMem();
  }
  // new or changed scenes (picture first, then the row)
  const rows=[];
  for(const sc of G.customs){
    if(sc.owner && sc.owner!==uid) continue;
    const g=sigOf(sc);
    if(mem.scenes[sc.id]===g && sc.owner===uid) continue;
    if(!mem.img[sc.id]){
      if(!sc.img) continue;                                   // picture not on this device (yet)
      const blob=dataUrlBlob(sc.img);
      const r=await fetch('/api/img/'+encodeURIComponent(sc.id), { method:'PUT', headers:{ authorization:'Bearer '+tok, 'content-type':blob.type }, body:blob });
      if(r.status===400 || r.status===413){ console.warn('picture not accepted', sc.id, r.status); continue; }
      if(!r.ok) throw new Error('upload '+r.status);
      mem.img[sc.id]=true; saveSyncMem();
    }
    sc.owner=uid;
    rows.push({ user_id:uid, id:sc.id, name:sc.name, w:sc.w, h:sc.h, items:sc.items||{}, image_path:`u/${uid}/${sc.id}`, deleted:false,
      updated_at:new Date(sc.updatedAt||Date.now()).toISOString(), meta:sc.meta||{} });
  }
  if(rows.length){
    let { error } = await sb.from('scenes').upsert(sceneMetaCol ? rows : rows.map(({meta,...r})=>r), { onConflict:'user_id,id' });
    if(error && sceneMetaCol && noMetaCol(error)){ sceneMetaCol=false; ({ error } = await sb.from('scenes').upsert(rows.map(({meta,...r})=>r), { onConflict:'user_id,id' })); }
    if(error) throw error;
    rows.forEach(r=>{ const sc=G.customs.find(x=>x.id===r.id); if(sc) mem.scenes[r.id]=sigOf(sc); });
    persistScenesQuiet();
  }
  // progress (the sample scene "tea" too)
  const prows=[];
  for(const [id,p] of Object.entries(progress)){
    if(!p || (id!=='tea' && !G.customs.some(sc=>sc.id===id && sc.owner===uid))) continue;
    const g=progSig(p); if(mem.prog[id]===g) continue;
    if(!Object.keys(p.done||{}).length && !Object.keys(p.star||{}).length && mem.prog[id]===undefined) continue;
    prows.push({ user_id:uid, scene_id:id, done:p.done||{}, star:p.star||{}, updated_at:new Date(p.updatedAt||Date.now()).toISOString() });
  }
  if(prows.length){
    const { error } = await sb.from('progress').upsert(prows, { onConflict:'user_id,scene_id' });
    if(error) throw error;
    prows.forEach(r=>{ mem.prog[r.scene_id]=progSig(progress[r.scene_id]); });
  }
  if(!SYNC.noDecks){ try{ await pushDecks(uid, mem); }catch(e){ deckSyncFailed(e); } }
  saveSyncMem();
}
function syncSignedOut(){
  // Signed out: this account's scenes leave this device (they stay in the account); unsynced ones stay.
  const mem=SYNC.mem; let changed=false;
  for(const sc of G.customs.slice()) if(sc.owner){ G.customs.splice(G.customs.indexOf(sc),1); forgetSceneLocal(sc.id); delete progress[sc.id]; changed=true; }
  for(const id of Object.keys(mem.prog||{})) if(progress[id]){ delete progress[id]; changed=true; }
  if(G.decks.some(d=>d.owner)){ G.decks=G.decks.filter(d=>!d.owner); changed=true; }
  SYNC.mem={}; SYNC.del=[]; SYNC.delDecks=[]; SYNC.at=0; SYNC.state='idle'; saveSyncMem();
  if(changed) afterSyncChange();
}

export { SYNC, accessToken, metaFrom, saveSyncMem, syncDeleted, syncMem, syncNow, syncSignedOut, syncSoon, syncStart, syncText };
