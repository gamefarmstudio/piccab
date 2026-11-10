// Piccab — Picture library (คลังภาพ): ready-made scenes, and their admin tab.
import { G, $, el, ic, progress, S, scenes, store, tally, toast, UI } from './core.js';
import { forgetSceneLocal, saveProg, saveScenes } from './progress.js';
import { ask, closeModal, goHome, openModal, openScene } from './scene.js';
import { LIB } from './home.js';
import { ADM, adminApi } from './admin.js';
import { blobToDataUrl } from './share.js';
import { syncDeleted } from './sync.js';

// ---------- picture library (คลังภาพ): ready-made scenes made by the Piccab team, free to add (no AI credits) ----------
var GAL={ data:null, busy:false, cat:'all' };   // var + function declarations: renderLibrary() may run before this part of the script
var GAL_LV={ beginner:'เริ่มต้น', intermediate:'กลาง', advanced:'สูง' };
var galAdded=store.get('pv-gal',{})||{};        // library scene id → my scene id
var galEdits=store.get('pv-gal-edit',{})||{};   // (admin) my scene id → library scene id it is an editing copy of
function galImg(g, thumb){ return `/g/${g.id}${thumb?'-t':''}.webp?v=${g.img_ver}`; }
function catName(c){ return UI==='en' ? c.name_en : c.name_th; }
function galMine(gid){ const sid=galAdded[gid]; return sid && scenes().some(x=>x.id===sid) ? sid : null; }
function galEditOf(sid){ return galEdits[sid] && scenes().some(x=>x.id===sid) ? galEdits[sid] : null; }
async function loadGallery(force){
  if(GAL.busy || (GAL.data && !force)) return;
  GAL.busy=true;
  const r=await fetch('/api/gallery').then(x=>x.ok?x.json():null).catch(()=>null);
  GAL.busy=false; GAL.data=r && Array.isArray(r.scenes) ? r : { categories:[], scenes:[], offline:!r };
  if(S.view==='library') renderPicLib();
}
function renderPicLib(){
  const box=$('#galBox'); if(!box) return;
  box.innerHTML='';
  if(LIB.f!=='all') return;
  if(!GAL.data){ loadGallery(); return; }
  const cats=GAL.data.categories||[], list=GAL.data.scenes||[];
  if(!list.length) return;                         // nothing published yet (or offline)
  const q=LIB.q.trim().toLowerCase(), n={};
  list.forEach(g=>{ n[g.category]=(n[g.category]||0)+1; });
  if(GAL.cat!=='all' && !n[GAL.cat]) GAL.cat='all';
  const vis=list.filter(g=>(GAL.cat==='all' || g.category===GAL.cat) && (!q || g.title.toLowerCase().includes(q) || String(g.title_th||'').toLowerCase().includes(q)));
  const chip=(id,label,k)=>el('button',{type:'button',class:GAL.cat===id?'on':'',onclick:()=>{ GAL.cat=id; renderPicLib(); }}, label, el('span',{class:'n',text:String(k)}));
  box.append(
    el('div',{class:'ghead lh galhead'}, el('div',{}, el('h2',{}, ic('photo_library'), 'คลังภาพ Piccab'), el('p',{text:`ฉากพร้อมคำศัพท์ ${list.length} ฉาก · เก็บเข้าคลังของคุณได้ฟรี ไม่ใช้เครดิต AI`}))),
    el('div',{class:'fchips galcats',role:'group','aria-label':'หมวด'}, chip('all', el('span',{text:'ทั้งหมด'}), list.length),
      ...cats.filter(c=>n[c.id]).map(c=>chip(c.id, el('span',{'data-noi18n':'',text:`${c.emoji} ${catName(c)}`}), n[c.id]))),
    vis.length ? el('div',{class:'libgrid galgrid'}, ...vis.map(galCard)) : el('p',{class:'libempty',text:'ไม่พบฉากในคลังภาพที่ตรงกับคำค้น'}));
}
function galCard(g){
  const mine=galMine(g.id);
  return el('button',{class:'card lcard galcard',onclick:()=>openGalleryScene(g),'aria-label':'ดูฉาก '+g.title},
    el('div',{class:'thumb'}, el('img',{alt:'',loading:'lazy',src:galImg(g,true)}),
      mine ? el('span',{class:'own mine',title:'เก็บแล้ว'}, ic('check_circle-fill')) : null,
      el('span',{class:'cnt',title:`${g.word_count} คำ`}, ic('sell-fill'), String(g.word_count))),
    el('div',{class:'cbody'}, el('b',{text:g.title}),
      el('div',{class:'meta2'}, UI==='en' ? null : el('span',{'data-noi18n':'',text:g.title_th||''}), el('span',{class:'lv',text:GAL_LV[g.level]||''}))));
}
function openGalleryScene(g){
  const mine=galMine(g.id), cat=((GAL.data&&GAL.data.categories)||[]).find(c=>c.id===g.category);
  let full=null;
  openModal(m=>{
    m.classList.add('wide');
    const go=el('button',{class:'primary',text: mine ? '▶ เปิด' : '➕ เก็บเข้าคลังแล้วเริ่มเรียน'});
    const words=el('div',{class:'galwords'}, el('span',{class:'note small',text:'กำลังโหลดคำศัพท์…'}));
    fetch('/api/gallery/'+g.id).then(x=>x.ok?x.json():null).catch(()=>null).then(r=>{
      full=r; words.replaceChildren(...(r ? Object.values(r.items||{}).map(it=>el('span',{class:'pill','data-noi18n':'',text:it.word})) : [el('span',{class:'note small',text:'โหลดคำศัพท์ไม่สำเร็จ'})]));
    });
    go.addEventListener('click',async()=>{
      if(mine){ closeModal(); openScene(mine,'learn'); return; }
      go.disabled=true; go.textContent='กำลังเก็บ…';
      try{ const sid=await addGalleryScene(g, full); closeModal(); toast('เก็บฉากเข้าคลังแล้ว ✓'); openScene(sid,'learn'); }
      catch(e){ go.disabled=false; go.textContent='➕ ลองอีกครั้ง'; toast('เก็บไม่สำเร็จ ตรวจอินเทอร์เน็ตแล้วลองใหม่'); }
    });
    m.append(el('div',{class:'pv-head'},
        el('div',{}, el('h3',{'data-noi18n':'',text:g.title+(g.title_th && UI!=='en' ? ' · '+g.title_th : '')}),
          el('div',{class:'meta'}, cat ? el('span',{'data-noi18n':'',text:`${cat.emoji} ${catName(cat)} · `}) : null, el('span',{text:`${g.word_count} คำศัพท์ · ระดับ${GAL_LV[g.level]||''}`}))),
        el('button',{class:'x','aria-label':'ปิด',text:'✕',onclick:closeModal})),
      el('div',{class:'pv-fig sharefig'}, el('img',{alt:'',src:galImg(g)})),
      words,
      el('div',{class:'row'}, el('span',{class:'sp'}), el('button',{text:'ไว้ทีหลัง',onclick:closeModal}), go),
      el('p',{class:'note small',text:'ภาพในคลังสร้างด้วย AI · ฉากจะถูกเก็บในเครื่องนี้ (และในบัญชี ถ้าเข้าสู่ระบบ) แก้ไขในคลังของคุณได้ ไม่กระทบคนอื่น'}));
  });
}
async function galCopy(g, full, name){
  if(!full) full=await fetch('/api/gallery/'+g.id).then(x=>x.ok?x.json():null).catch(()=>null);
  if(!full) throw new Error('scene');
  const res=await fetch(galImg(g)); if(!res.ok) throw new Error('picture');
  const img=await blobToDataUrl(await res.blob());
  const sc={ id:'s'+Date.now().toString(36)+Math.random().toString(36).slice(2,5), name:String(name||full.title).slice(0,50), w:full.w, h:full.h, items:JSON.parse(JSON.stringify(full.items||{})), img };
  G.customs.push(sc); saveScenes();
  return sc.id;
}
async function addGalleryScene(g, full){
  const sid=await galCopy(g, full);
  galAdded[g.id]=sid; store.set('pv-gal',galAdded); tally('gallery_add');
  return sid;
}

// The editing copy is only a tool: once its boxes are sent (or dropped) it is removed and the admin page comes back.
function galDropCopy(sid){
  const i=G.customs.findIndex(x=>x.id===sid); if(i<0) return;
  const sc=G.customs[i]; G.customs.splice(i,1); delete progress[sid]; forgetSceneLocal(sid);
  if(typeof syncDeleted==='function') syncDeleted(sc);
  delete galEdits[sid]; store.set('pv-gal-edit',galEdits); saveScenes(); saveProg();
}
function galBackToAdmin(){ ADM.tab='gallery'; ADM.gal=null; GAL.data=null; S.editing=false; G.selId=null; goHome('admin'); }
async function galPushEdit(sid, back){
  const sc=scenes().find(x=>x.id===sid), gid=galEdits[sid]; if(!sc || !gid) return false;
  if(S.editing) saveScenes();
  const r=await adminApi('PATCH','/gallery/'+gid,{ items:sc.items, w:sc.w, h:sc.h }).catch(()=>({ok:false}));
  toast(r.ok ? 'บันทึกเข้าคลังภาพแล้ว ✓' : 'บันทึกไม่สำเร็จ ลองอีกครั้ง');
  if(!r.ok) return false;
  galDropCopy(sid);
  if(back || S.view==='admin') galBackToAdmin(); else { ADM.gal=null; GAL.data=null; }
  return true;
}
function galEditBar(){
  const bar=$('#galEditBar'); if(!bar) return;
  const gid=S.view==='play' ? galEditOf(S.sceneId) : null;
  bar.hidden=!gid; if(!gid) return;
  const g=ADM.gal && ADM.gal.scenes && ADM.gal.scenes.find(x=>x.id===gid);
  const save=el('button',{class:'primary',text:'⬆️ บันทึกเข้าคลังภาพ แล้วกลับ'});
  save.addEventListener('click',async()=>{ save.disabled=true; if(!await galPushEdit(S.sceneId, true)) save.disabled=false; });
  bar.replaceChildren(el('span',{class:'tt'}, ic('photo_library'), el('b',{text:'กำลังแก้ฉากในคลังภาพ'}), g ? el('span',{'data-noi18n':'',text:' · '+g.title}) : null),
    el('span',{class:'sp'}),
    el('button',{text:'ยกเลิก กลับหน้าดูแลระบบ',onclick:async()=>{ if(!await ask('ทิ้งการแก้ไขนี้แล้วกลับหน้าดูแลระบบ?','ทิ้งการแก้ไข')) return; galDropCopy(S.sceneId); galBackToAdmin(); }}),
    save);
}

export { catName, GAL, GAL_LV, galCopy, galEditBar, galEditOf, galEdits, galImg, galPushEdit, renderPicLib };
