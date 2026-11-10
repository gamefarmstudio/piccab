// Piccab — Share links (piccab.com/s/<id>).
import { G, BUILTIN, el, HL, LOC, scenes, store, tally, toast, tx } from './core.js';
import { saveScenes } from './progress.js';
import { ask, closeModal, goHome, openModal, openScene, sceneImg } from './scene.js';
import { WD } from './home.js';
import { deckName, getDeck, liveKeys, newDeck, SAVED_DECK, saveDecks } from './decks.js';
import { shareScene } from './sheets.js';
import { openLogin, user } from './account.js';
import { openReportShare } from './admin.js';
import { accessToken, SYNC, syncMem, syncNow } from './sync.js';

// ---------- share links (piccab.com/s/<id>) ----------
// A link is a snapshot: the server copies the words and pictures when you share (or update) it.
let myShares=store.get('pv-shares',{}); if(typeof myShares!=='object'||!myShares) myShares={};
const shareKey=t=>t.kind+':'+(t.kind==='scene'?t.sc.id:t.deck.id);
const shareUrl=id=>location.origin+'/s/'+id+HL;
function sceneForShare(sc){
  if(sc.builtin) return { id:sc.id, builtin:true, n:Object.keys(sc.items).length };
  return { id:sc.id, name:sc.name, w:sc.w, h:sc.h, items:sc.items };
}
function sharePayload(t){
  if(t.kind==='scene') return { kind:'scene', name:t.sc.name, scenes:[sceneForShare(t.sc)] };
  const live=liveKeys(), words=t.deck.words.filter(k=>live.has(k));
  const ids=[...new Set(words.map(k=>k.slice(0,k.indexOf('|'))))];
  return { kind:'deck', name:t.deck.id===SAVED_DECK?tx('คำที่เก็บไว้'):t.deck.name, words, scenes:ids.map(id=>scenes().find(x=>x.id===id)).filter(Boolean).map(sceneForShare) };
}
// Pictures must be in the account (R2) before the server can copy them.
async function picturesUploaded(payload){
  for(let i=0;i<100 && SYNC.busy;i++) await new Promise(r=>setTimeout(r,200));
  await syncNow(false);
  const mem=syncMem(user.id);
  return payload.scenes.every(x=>x.builtin || (mem.img && mem.img[x.id]));
}
async function shareApi(method, path, body){
  const tok=await accessToken();
  const r=await fetch(path,{ method, headers:{ 'content-type':'application/json', ...(tok?{authorization:'Bearer '+tok}:{}) }, body: body?JSON.stringify(body):undefined });
  const j=await r.json().catch(()=>({}));
  return { ok:r.ok, status:r.status, j };
}
const shareErr=(st,j)=> j.error==='not_configured' ? 'ตอนนี้ยังสร้างลิงก์ไม่ได้ (ระบบยังไม่พร้อม)'
  : j.error==='picture_missing' ? 'รูปยังอัปโหลดขึ้นบัญชีไม่เสร็จ รอสักครู่แล้วลองใหม่'
  : j.error==='too_many_shares' ? 'สร้างลิงก์ครบจำนวนแล้ว ลองยกเลิกลิงก์เก่าในหน้า 👤 บัญชีของฉัน'
  : st===401 ? 'กรุณาเข้าสู่ระบบใหม่อีกครั้ง' : 'สร้างลิงก์ไม่สำเร็จ ตรวจอินเทอร์เน็ตแล้วลองใหม่';
async function copyLink(url){
  try{ await navigator.clipboard.writeText(url); toast('คัดลอกลิงก์แล้ว ส่งให้เพื่อนได้เลย'); }
  catch(e){ prompt('คัดลอกลิงก์นี้', url); }
}
async function shareLinkNative(url, title){
  if(navigator.share){ try{ title=tx(title); await navigator.share({ title, text:title+tx(' — ฝึกคำศัพท์อังกฤษบน Piccab'), url }); return; }catch(e){ if(e && e.name==='AbortError') return; } }
  copyLink(url);
}
function openShare(t){
  const key=shareKey(t), isScene=t.kind==='scene', name=isScene?t.sc.name:deckName(t.deck);
  const stamp=isScene?(t.sc.updatedAt||0):(t.deck.updatedAt||0);
  const draw=(m, busy, err)=>{
    m.innerHTML='';
    const cur=myShares[key];
    m.append(el('h3',{text:(isScene?'🔗 แชร์ฉาก “':'🔗 แชร์ชุดคำ “')+name+'”'}),
      el('p',{class:'note',text:'ส่งลิงก์ให้เพื่อนหรือนักเรียน เปิดแล้วกดเก็บเข้าคลังของตัวเองได้เลย ไม่ต้องสมัครสมาชิก'}));
    if(cur){
      const inp=el('input',{class:'sharelink',readonly:'',value:shareUrl(cur.id),'aria-label':'ลิงก์แชร์'});
      inp.addEventListener('focus',()=>inp.select());
      m.append(inp, el('div',{class:'row'},
        el('button',{class:'primary',text:'📋 คัดลอกลิงก์',onclick:()=>copyLink(shareUrl(cur.id))}),
        el('button',{text:'📲 ส่งต่อ…',onclick:()=>shareLinkNative(shareUrl(cur.id), name)})));
      if(stamp>cur.at) m.append(el('p',{class:'note warn'}, 'มีการแก้ไขหลังสร้างลิงก์ · ',
        el('button',{class:'linkbtn small',text:busy?'กำลังอัปเดต…':'อัปเดตลิงก์เป็นเวอร์ชันล่าสุด',disabled:busy?'':null,onclick:()=>make(m, cur.id)})));
    } else if(!user){
      m.append(el('p',{class:'err',text:'ต้องเข้าสู่ระบบก่อนจึงจะสร้างลิงก์ได้'}),
        el('div',{class:'row'}, el('button',{class:'primary',text:'👤 เข้าสู่ระบบ',onclick:()=>openLogin()})));
    } else {
      m.append(el('div',{class:'row'}, el('button',{class:'primary',text:busy?'กำลังสร้างลิงก์…':'🔗 สร้างลิงก์',disabled:busy?'':null,onclick:()=>make(m)})));
    }
    if(err) m.append(el('p',{class:'err',text:err}));
    m.append(el('p',{class:'note small'},'ผู้ที่มีลิงก์จะเห็นรูปและคำศัพท์ (ไม่เห็นอีเมลหรือชื่อของคุณ) · ลิงก์เป็นสำเนา ณ ตอนแชร์ · ยกเลิกลิงก์ได้ทุกเมื่อ'));
    const foot=el('div',{class:'row'});
    if(isScene) foot.append(el('button',{class:'linkbtn small',text:'📄 ส่งเป็นไฟล์แทน',onclick:()=>{ closeModal(); shareScene(); }}));
    if(cur) foot.append(el('button',{class:'linkbtn small danger-link',text:'ยกเลิกลิงก์',onclick:()=>revokeShare(key, cur.id).then(()=>draw(m))}));
    foot.append(el('span',{class:'sp'}), el('button',{text:'ปิด',onclick:closeModal}));
    m.append(foot);
  };
  const make=async(m, id)=>{
    if(navigator.onLine===false){ draw(m,false,'ต้องต่ออินเทอร์เน็ตก่อนสร้างลิงก์'); return; }
    draw(m,true);
    const body=sharePayload(t); if(id) body.id=id;
    if(!body.scenes.length){ draw(m,false,'ยังไม่มีคำศัพท์ให้แชร์'); return; }
    if(!(await picturesUploaded(body))){ draw(m,false,shareErr(0,{error:'picture_missing'})); return; }
    const r=await shareApi('POST','/api/share',body).catch(()=>({ok:false,status:0,j:{}}));
    if(!r.ok){ draw(m,false,shareErr(r.status,r.j)); return; }
    myShares[key]={ id:r.j.id, at:Date.now() }; store.set('pv-shares',myShares); if(!id) tally('share');
    draw(m,false); if(!id) copyLink(shareUrl(r.j.id)); else toast('อัปเดตลิงก์แล้ว');
  };
  openModal(m=>draw(m));
}
async function revokeShare(key, id){
  if(!(await ask('ยกเลิกลิงก์นี้? คนที่มีลิงก์จะเปิดไม่ได้อีก (ฉากที่เขาเก็บไว้แล้วยังอยู่ในเครื่องของเขา)','ยกเลิกลิงก์'))) return false;
  const r=await shareApi('DELETE','/api/share/'+id).catch(()=>({ok:false}));
  if(!r.ok && r.status!==404){ toast('ยกเลิกลิงก์ไม่สำเร็จ ลองใหม่อีกครั้ง'); return false; }
  for(const k of Object.keys(myShares)) if(myShares[k].id===id) delete myShares[k];
  store.set('pv-shares',myShares); toast('ยกเลิกลิงก์แล้ว'); return true;
}
// 👤 → ลิงก์ที่แชร์ไว้
async function openMyShares(){
  openModal(m=>m.append(el('h3',{text:'🔗 ลิงก์ที่แชร์ไว้'}), el('p',{class:'note',text:'กำลังโหลด…'})));
  const r=await shareApi('GET','/api/shares').catch(()=>({ok:false}));
  openModal(m=>{
    m.append(el('h3',{text:'🔗 ลิงก์ที่แชร์ไว้'}));
    const list=(r.ok && r.j.shares)||[];
    if(!r.ok) m.append(el('p',{class:'err',text:'โหลดรายการไม่สำเร็จ ลองใหม่อีกครั้ง'}));
    else if(!list.length) m.append(el('p',{class:'note',text:'ยังไม่มีลิงก์ที่แชร์ไว้ — กด 🔗 แชร์ ที่ฉากหรือชุดคำ'}));
    else {
      const box=el('div',{class:'dk-list'});
      list.forEach(x=>box.append(el('div',{class:'dk-row shrow'},
        el('span',{class:'dk-name'}, el('b',{text:(x.kind==='deck'?'📚 ':'🖼️ ')+x.name}), el('small',{text:'อัปเดต '+new Date(x.updated_at).toLocaleDateString(LOC,{day:'numeric',month:'short',year:'numeric'})})),
        el('button',{class:'linkbtn small',text:'คัดลอก',onclick:()=>copyLink(shareUrl(x.id))}),
        el('button',{class:'linkbtn small danger-link',text:'ยกเลิก',onclick:async()=>{ if(await revokeShare(null,x.id)) openMyShares(); else openMyShares(); }}))));
      m.append(box);
    }
    m.append(el('div',{class:'row'}, el('span',{class:'sp'}), el('button',{class:'primary',text:'ปิด',onclick:closeModal})));
  });
}
// Someone opened piccab.com/s/<id>
const sharedLinkId=(/^\/s\/([A-Za-z0-9]{8,16})\/?$/.exec(location.pathname)||[])[1]||null;
async function openSharedLink(id){
  try{ history.replaceState(null,'','/app'); }catch(e){}
  const r=await fetch('/api/share/'+id,{cache:'no-store'}).then(x=>x.ok?x.json():(x.status===404?{missing:true}:null)).catch(()=>null);
  if(!r || r.missing){
    openModal(m=>m.append(el('h3',{text:'🔗 เปิดลิงก์ไม่ได้'}),
      el('p',{text: r ? 'ลิงก์นี้ถูกยกเลิกแล้ว หรือพิมพ์ลิงก์ไม่ครบ ลองขอลิงก์ใหม่จากคนที่แชร์' : 'ต้องต่ออินเทอร์เน็ตเพื่อเปิดลิงก์แชร์'}),
      el('div',{class:'row'}, el('span',{class:'sp'}), el('button',{class:'primary',text:'ตกลง',onclick:closeModal}))));
    return;
  }
  const done=(store.get('pv-imported',{})||{})[id];
  const already = done && done.scenes && done.scenes.every(sid=>scenes().some(x=>x.id===sid)) && (!done.deck || getDeck(done.deck));
  const isDeck=r.kind==='deck', n=isDeck ? r.words.length : Object.keys(r.scenes[0].items||{}).length;
  const pic=r.scenes.find(x=>!x.builtin);
  openModal(m=>{
    m.classList.add('wide');
    const go=el('button',{class:'primary',text: already ? '▶ เปิด' : '➕ เก็บเข้าคลังแล้วเริ่มเรียน'});
    go.addEventListener('click',async()=>{
      if(already){ closeModal(); openImported(done); return; }
      go.disabled=true;
      try{ const res=await importShare(id, r, (i,k)=>{ go.textContent=`กำลังเก็บ… ${i}/${k}`; }); closeModal(); openImported(res); toast(isDeck?'เก็บชุดคำแล้ว ✓':'เก็บฉากเข้าคลังแล้ว ✓'); }
      catch(e){ go.disabled=false; go.textContent='➕ ลองอีกครั้ง'; toast('เก็บไม่สำเร็จ ตรวจอินเทอร์เน็ตแล้วลองใหม่'); }
    });
    m.append(el('div',{class:'pv-head'},
        el('div',{}, el('h3',{text:(isDeck?'📚 ชุดคำ “':'🖼️ ฉาก “')+r.name+'”'}),
          el('div',{class:'meta',text: isDeck ? `${n} คำ จาก ${r.scenes.length} ฉาก · มีคนแชร์ให้คุณ` : `${n} คำศัพท์ · มีคนแชร์ให้คุณ`})),
        el('button',{class:'x','aria-label':'ปิด',text:'✕',onclick:closeModal})),
      el('div',{class:'pv-fig sharefig'}, el('img',{alt:'',src: pic ? `/api/share/${id}/img/${pic.id}` : sceneImg(BUILTIN[0])})),
      el('div',{class:'row'}, el('span',{class:'sp'}), el('button',{text:'ไว้ทีหลัง',onclick:closeModal}), go),
      el('p',{class:'note small',text: already ? 'คุณเก็บลิงก์นี้ไว้แล้ว' : 'ฉากจะถูกเก็บในเครื่องนี้ (และในบัญชี ถ้าเข้าสู่ระบบ) ลบได้ทุกเมื่อ'}),
      el('p',{class:'note small'}, el('button',{class:'linkbtn small danger-link',text:'⚠️ รายงานเนื้อหาไม่เหมาะสม',onclick:()=>openReportShare(id)})));
  });
}
const blobToDataUrl=b=>new Promise((res,rej)=>{ const fr=new FileReader(); fr.onload=()=>res(fr.result); fr.onerror=rej; fr.readAsDataURL(b); });
async function importShare(id, r, progress){
  const map={}, made=[], todo=r.scenes.filter(x=>!x.builtin);
  let i=0;
  for(const x of r.scenes){
    if(x.builtin){ map[x.id]=x.id; continue; }
    progress && progress(++i, todo.length);
    const res=await fetch(`/api/share/${id}/img/${x.id}`); if(!res.ok) throw new Error('picture');
    const img=await blobToDataUrl(await res.blob());
    const nid='s'+Date.now().toString(36)+Math.random().toString(36).slice(2,5);
    const sc={ id:nid, name:String(x.name||r.name).slice(0,50), w:x.w, h:x.h, items:JSON.parse(JSON.stringify(x.items||{})), img };
    G.customs.push(sc); made.push(sc); map[x.id]=nid;
  }
  if(made.length) saveScenes();
  let deckId=null;
  if(r.kind==='deck'){
    let nm=r.name.slice(0,30), k=2; while(G.decks.some(d=>d.name===nm)) nm=(r.name.slice(0,26)+' ('+(k++)+')');
    const d=newDeck(nm);
    d.words=r.words.map(w=>{ const j=w.indexOf('|'); const sid=map[w.slice(0,j)]; return sid ? sid+w.slice(j) : null; }).filter(Boolean);
    saveDecks(); deckId=d.id;
  }
  const rec={ kind:r.kind, scenes:r.scenes.map(x=>map[x.id]).filter(Boolean), deck:deckId, at:Date.now() };
  const all=store.get('pv-imported',{})||{}; all[id]=rec; store.set('pv-imported',all);
  return rec;
}
function openImported(rec){
  if(rec.deck){ WD.deck=rec.deck; store.set('pv-wdeck',rec.deck); WD.f='all'; WD.q=''; goHome('words'); return; }
  if(rec.scenes && rec.scenes[0]) openScene(rec.scenes[0],'learn');
}

export { blobToDataUrl, copyLink, importShare, myShares, openImported, openMyShares, openShare, openSharedLink, picturesUploaded, shareApi, shareErr, shareKey, shareLinkNative, sharePayload, sharedLinkId };
