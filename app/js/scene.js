// Piccab — The scene screen: auto-play, drawing the picture and boxes, switching views, edit-mode selection, the sub bar, tapping words, modes, the modal dialog.
import { G, $, anchor, box, chips, clampX, el, ids, isMobile, itemIn, items, itemsOf, labelOf, langOk, LANGS, mean, NS, overlay, pk, progress, S, scene, shuffle, speak, store, sub, svg, tag, tally, toast, tx, UI, wrap } from './core.js';
import { prog, saveScenes } from './progress.js';
import { allWords, lastMode, LIB, markActive, recent, renderGallery, renderLibrary, streakPill, wordEl } from './home.js';
import { isKept, listCards, openDeckPicker, sceneWord } from './decks.js';
import { closeQuiz, findTap, lockNext, openQuiz, positionQ, renderSpeakSub, resetQuiz, spk, spkPick, spkStop, spkTarget, startFind, startSpeak } from './games.js';
import { aiCtl, autoLangState, autoTranslate, drag, dragMove, drawing, drewAt, missingIn, openAI, openItemForm, orderHs, setDrawMode, TLfail, toSvg, translateAll, translateScene, translating, updDraft } from './editor.js';
import { deleteScene, isList, openImport, openSheetMaker } from './sheets.js';
import { openLogin } from './account.js';
import { galEditBar } from './gallery.js';
import { openShare } from './share.js';
import { exitFs, fitWrap, isFs } from './layout.js';

// ---------- auto-play (learn mode): walk through items, show + speak each ----------
const AP={ on:false, playing:false, order:store.get('pv-ap-order','seq'), gap:store.get('pv-ap-gap',1800), queue:[], idx:0, token:0, timer:null };
const AP_ORDERS={seq:'ตามลำดับในฉาก', az:'เรียง A→Z', rand:'สุ่ม'};
const AP_GAPS={900:'เร็ว', 1800:'ปกติ', 3500:'ช้า'};
function apList(){
  let l=ids().slice();
  if(AP.order==='az') l.sort((a,b)=>items()[a].word.localeCompare(items()[b].word));
  else if(AP.order==='rand') l=shuffle(l);
  return l;
}
function apShow(id){ G.pinnedId=id; G.hoverId=null; setHL(); updateTag(); renderChips(); apCounter(); }
function apCounter(){ const c=$('#apCount'); if(c) c.textContent=(c.tagName==='BUTTON'?'📖 ':'')+(AP.queue.length?`${Math.min(AP.idx+1,AP.queue.length)}/${AP.queue.length}`:`${ids().length} คำ`); }
function apStep(){
  if(!AP.playing) return;
  if(!AP.queue.length || AP.idx>=AP.queue.length){ AP.queue=apList(); AP.idx=0; }   // loop (reshuffles when random)
  const id=AP.queue[AP.idx];
  if(!items()[id]){ AP.idx++; return apStep(); }
  apShow(id);
  const tk=++AP.token;
  speak(sayOf(id), ()=>{
    if(tk!==AP.token || !AP.playing) return;
    AP.timer=setTimeout(()=>{ if(tk!==AP.token || !AP.playing) return; AP.idx++; apStep(); }, AP.gap);
  });
}
function apPlay(){
  if(!ids().length) return;
  AP.playing=true;
  if(!AP.queue.length || AP.idx>=AP.queue.length){ AP.queue=apList(); AP.idx=0; }
  renderSub(); apStep();
}
function apPause(){
  if(!AP.playing) return;
  AP.playing=false; AP.token++; clearTimeout(AP.timer);
  try{ speechSynthesis.cancel(); }catch(e){}
  if(S.mode==='learn' && S.view==='play') renderSub();
}
function apReset(){ apPause(); AP.queue=[]; AP.idx=0; }
function apJump(d){
  if(!AP.queue.length){ AP.queue=apList(); AP.idx=0; }
  AP.token++; clearTimeout(AP.timer);
  AP.idx=(AP.idx+d+AP.queue.length)%AP.queue.length;
  if(AP.playing) apStep(); else { const id=AP.queue[AP.idx]; apShow(id); speak(sayOf(id)); }
}
document.addEventListener('visibilitychange',()=>{ if(document.hidden) apPause(); });
const sayOf=id=>{ const it=items()[id]; return it?(it.say||it.word):''; };

// ---------- rendering ----------
function renderScene(){
  const sc=scene();
  svg.setAttribute('viewBox', `0 0 ${sc.w} ${sc.h}`);
  fitWrap();
  if(sc.builtin){
    // The sample is drawn as vector art, but it behaves exactly like a photo scene:
    // the art is just the background and every word has an ordinary box.
    svg.innerHTML = $('#tea-svg').textContent;
    svg.querySelectorAll('[data-id]').forEach(e=>{ e.dataset.art=e.dataset.id; e.removeAttribute('data-id'); e.classList.remove('item'); });
  } else {
    svg.innerHTML='';
    const im=document.createElementNS(NS,'image');
    im.setAttribute('href', sceneImg(sc)); im.setAttribute('width', sc.w); im.setAttribute('height', sc.h); im.setAttribute('preserveAspectRatio','none');
    svg.appendChild(im);
    if(isList(sc) && S.mode==='learn' && !S.editing) svg.appendChild(listCards(sc, ids().map(id=>items()[id])));
  }
  const spot=document.createElementNS(NS,'path'); spot.setAttribute('class','spot'); spot.setAttribute('fill-rule','evenodd');
  svg.appendChild(spot);
  for(const id of (S.editing ? Object.keys(sc.items) : ids())){
    const g=document.createElementNS(NS,'g'); g.setAttribute('class','item hs'); g.setAttribute('data-id', id);
    const r=document.createElementNS(NS,'rect'); r.setAttribute('class','box');
    const h=document.createElementNS(NS,'rect'); h.setAttribute('class','handle');
    g.append(r,h); svg.appendChild(g); layoutHs(id);
  }
  orderHs();
}
// Box as drawn: a little breathing room around the object and rounded corners.
function boxGeom(it){
  const sc=scene(), m=Math.max(sc.w,sc.h), p=m*0.006;
  const x=it.x-p, y=it.y-p, w=it.w+2*p, h=it.h+2*p;
  return {x, y, w, h, r:Math.min(Math.min(w,h)*0.2, m*0.022)};
}
function rrPath(g){
  const {x,y,w,h,r}=g;
  return `M${x+r} ${y}H${x+w-r}A${r} ${r} 0 0 1 ${x+w} ${y+r}V${y+h-r}A${r} ${r} 0 0 1 ${x+w-r} ${y+h}H${x+r}A${r} ${r} 0 0 1 ${x} ${y+h-r}V${y+r}A${r} ${r} 0 0 1 ${x+r} ${y}Z`;
}
// Spotlight: dim everything except the chosen word's box.
function updateSpot(){
  const spot=svg.querySelector('.spot'); if(!spot) return;
  const id = S.editing || (S.mode==='learn' && S.showAll) ? null : (G.flash ? G.flash.id : (G.pinnedId || G.quizId || spkTarget()));
  const it = id && items()[id];
  if(!it){ spot.classList.remove('on'); return; }
  const sc=scene();
  spot.setAttribute('d', `M0 0H${sc.w}V${sc.h}H0Z`+rrPath(boxGeom(it)));
  spot.classList.add('on');
}
function layoutHs(id){
  const sc=scene(), it=sc.items[id], g=svg.querySelector('.hs[data-id="'+CSS.escape(id)+'"]'); if(!it||!g) return;
  const r=g.querySelector('.box'), h=g.querySelector('.handle'), s=Math.max(sc.w,sc.h)*0.022, b=boxGeom(it);
  r.setAttribute('x',b.x); r.setAttribute('y',b.y); r.setAttribute('width',b.w); r.setAttribute('height',b.h); r.setAttribute('rx', b.r);
  h.setAttribute('x',it.x+it.w-s*0.65); h.setAttribute('y',it.y+it.h-s*0.65); h.setAttribute('width',s); h.setAttribute('height',s); h.setAttribute('rx',s*0.25);
}
function renderSelect(){
  $('#curName').textContent=scene().name;
  if(S.view!=='play') renderGallery();
}

// ---------- views: scene gallery ⇄ play ----------
let TEA_URL='';
// Shown while a synced scene's picture is still downloading (or couldn't be loaded).
const IMG_PENDING='data:image/svg+xml;charset=utf-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect width="400" height="300" fill="#eee6dc"/><text x="200" y="158" font-family="sans-serif" font-size="22" fill="#9a8f80" text-anchor="middle">กำลังโหลดรูป…</text></svg>');
function sceneImg(sc){
  if(!sc.builtin) return sc.img || IMG_PENDING;
  if(!TEA_URL) TEA_URL='data:image/svg+xml;charset=utf-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 1000 680">'+$('#tea-svg').textContent+'</svg>');
  return TEA_URL;
}
function progOf(sc){ const p=progress[sc.id]||{done:{},star:{}}, its=itemsOf(sc), k=Object.keys(its).filter(i=>its[i]&&its[i].word); return {n:k.length, d:k.filter(i=>p.done&&p.done[pk(i)]).length}; }
function renderView(){
  const v=S.view, g=v!=='play';
  if(g && isFs()) exitFs();
  $('#homeView').hidden=v!=='home'; $('#libraryView').hidden=v!=='library'; $('#wordsView').hidden=v!=='words'; $('#classView').hidden=v!=='class'; $('#adminView').hidden=v!=='admin'; $('#playView').hidden=g;
  $('#galleryBar').hidden=!g; $('#playBar').hidden=g;
  document.querySelectorAll('.mainnav button, .bnav button[data-view]').forEach(b=>b.classList.toggle('on', b.dataset.view===v));
  document.body.classList.toggle('gview', g);
  streakPill();
  $('#curName').textContent=scene().name;
  $('#homeBtn').disabled=false;
}
function goHome(view){
  apReset();
  if(S.editing){ S.editing=false; G.selId=null; saveScenes(); }
  if(aiCtl) aiCtl.abort();
  closeQuiz(true); spkStop(); G.pinnedId=G.hoverId=null; G.flash=null;
  try{ speechSynthesis.cancel(); }catch(e){}
  S.view=(view==='library'||view==='words'||view==='class'||view==='admin')?view:'home'; refresh(); renderGallery(); window.scrollTo(0,0);
}
function openScene(id, mode, edit){
  if(!edit) tally('mode:'+(mode||'learn'));
  apReset();
  recent[id]=Date.now(); lastMode[id]=mode||'learn'; store.set('pv-recent',recent); store.set('pv-lastmode',lastMode); markActive(0);
  S.sceneId=id; store.set('pv-scene',id); G.help={}; G.used={}; G.qMiss={};
  S.view='play'; S.mode=mode||'learn'; S.editing=!!edit; G.selId=null; S.showAll=false;
  fullRender();
  if(S.mode==='find' && ids().length){ startFind(); renderSub(); }
  if(S.mode==='speak'){ startSpeak(); }
  window.scrollTo(0,0);
}
// ---------- edit-mode selection ----------
G.selId=null;
function applySel(){
  if(!S.editing || !items()[G.selId]) G.selId=null;
  document.body.classList.toggle('has-sel', !!G.selId && !S.allBoxes);
  document.body.classList.toggle('show-boxes', !S.editing && S.mode==='learn' && S.showAll);
  svg.querySelectorAll('.hs').forEach(g=>g.classList.toggle('sel', g.dataset.id===G.selId));
  orderHs();
}
function selectBox(id){ G.selId=id; applySel(); setHL(); updateOverlay(); renderChips(); }
function refresh(){
  galEditBar();
  if(!S.editing) G.drawMode=false;
  document.body.classList.toggle('editing', S.editing);
  document.body.classList.toggle('drawmode', S.editing && G.drawMode);
  applySel();
  document.querySelectorAll('#modes button[data-mode]').forEach(b=>{ b.classList.toggle('on', b.dataset.mode===S.mode && !S.editing); b.disabled=S.editing; });
  $('#editBtn').hidden = $('#renameBtn').hidden = scene().builtin || S.editing;
  renderView();
  renderSub(); renderChips(); if(isFs()) fitWrap(); setHL(); updateTag(); updateOverlay();
  if(G.quizId) positionQ();
}
let practised=store.get('pv-langs',[]); if(!Array.isArray(practised)) practised=[];
practised=practised.filter(l=>l!=='en' && langOk(l)); if(S.lang!=='en' && !practised.includes(S.lang)){ practised.push(S.lang); store.set('pv-langs',practised); }
function langPills(){ const q=$('#qin'); if(q) q.placeholder=`พิมพ์เป็นภาษา${LANGS[S.lang].name}…`; document.querySelectorAll('.langpill').forEach(b=>{ const L=LANGS[S.lang]; b.textContent=L.flag+' '; b.append(el('span',{class:'lname',text:L.name})); b.setAttribute('aria-label','ภาษาที่ฝึก: '+L.name+' — เปลี่ยน'); }); }
function setLang(l){
  if(!langOk(l) || l===S.lang) return;
  apReset(); closeQuiz(true); try{ speechSynthesis.cancel(); }catch(e){}
  S.lang=l; store.set('pv-lang',l); fillAccent(); langPills();
  if(l!=='en' && !practised.includes(l)){ practised.push(l); store.set('pv-langs',practised); }
  G.help={}; G.used={}; G.qMiss={}; G.selId=null;
  if(S.view==='play'){ fullRender(); if(S.mode==='find' && ids().length) startFind(); if(S.mode==='speak') startSpeak(); }
  else { refresh(); renderGallery(); }
  toast(`${LANGS[l].flag} ตอนนี้ฝึกภาษา${LANGS[l].name} — ความคืบหน้าและรอบทบทวนแยกกันในแต่ละภาษา`, 3500);
  if(l!=='en') translateAll(l);
}
// "My language": Thai or English menus (and meanings). Changing it reloads the page.
const langLabel=L=> tx(L.name)===L.native ? L.native : L.name+' · '+L.native;   // no "English · English"
const UI_LANGS=[['th','🇹🇭','ไทย'],['en','🇬🇧','English']];
function setUi(u){ if(u===UI) return; store.set('pv-ui',u); location.reload(); }
function uiRow(onPick){
  const row=el('div',{class:'uirow'});
  UI_LANGS.forEach(([k,fl,nm])=>row.append(el('button',{type:'button',class:'uiopt'+(k===UI?' on':''),'data-noi18n':'',onclick:()=>onPick(k)}, el('span',{class:'fl',text:fl}), el('b',{text:nm}))));
  return row;
}
function openLangPicker(){
  openModal(m=>{
    m.append(el('h3',{text:'🗣 ภาษาของฉัน'}),
      el('p',{class:'note',text:'เมนูและความหมายของคำจะแสดงเป็นภาษานี้'}),
      uiRow(k=>{ closeModal(); setUi(k); }),
      el('h3',{class:'h3b',text:'🌍 ภาษาที่ฝึก'}),
      el('p',{class:'note',text:'ฉากเดิมใช้ได้ทุกภาษา — กรอบในรูปเหมือนเดิม เปลี่ยนแค่คำศัพท์ ความคืบหน้าและรอบทบทวนแยกกันในแต่ละภาษา'}));
    const list=el('div',{class:'langlist'});
    Object.entries(LANGS).forEach(([k,L])=>{
      const n=allWords(k).length;
      list.append(el('button',{class:'langopt'+(k===S.lang?' on':''),onclick:()=>{ closeModal(); setLang(k); }},
        el('span',{class:'fl',text:L.flag}), el('span',{}, el('b',{text:langLabel(L)}), el('small',{text: n ? `มี ${n} คำในฉากของคุณ` : 'ยังไม่มีคำในภาษานี้'})),
        k===S.lang ? el('span',{class:'ok',text:'✓'}) : null));
    });
    m.append(list, el('div',{class:'row'}, el('span',{class:'sp'}), el('button',{text:'ปิด',onclick:closeModal})));
  });
}
document.querySelectorAll('.langpill').forEach(b=>b.addEventListener('click',openLangPicker));
langPills();
function fullRender(){
  if(S.view==='play' && S.lang!=='en' && !S.editing){ const sc=scene(); if(missingIn(sc,S.lang).length) setTimeout(()=>autoTranslate(sc,S.lang),0); } closeQuiz(true); G.hoverId=G.pinnedId=null; G.flash=null; renderScene(); if(S.mode==='find' && G.find.target && !items()[G.find.target]) G.find={...G.find,queue:[],target:null,total:0,score:0}; renderSelect(); refresh(); }

function setHL(){
  // Only ONE item is highlighted at a time: the one under the pointer, otherwise the clicked/open one.
  const active = G.hoverId || G.pinnedId || G.quizId || spkTarget();
  svg.querySelectorAll('.item').forEach(e=>{
    const id=e.dataset.id;
    const f = G.flash && G.flash.id===id ? G.flash.kind : '';
    e.classList.toggle('good', f==='good');
    e.classList.toggle('bad', f==='bad');
    e.classList.toggle('hl', !f && id===active);
  });
  updateSpot(); fsFollow();
}
// Full screen on a landscape phone with a tall picture ("fill the width"): only part of the picture shows,
// so bring the word being shown (Auto, a question, the word to say) into view, once each time it changes.
var fsFollowed=null;
function fsFollow(){
  const id=G.pinnedId || G.quizId || spkTarget();
  if(id===fsFollowed) return; fsFollowed=id;
  if(!id || !document.body.classList.contains('fsfill')) return;
  const m=$('#playView>main'), e=svg.querySelector(`.item[data-id="${CSS.escape(id)}"]`); if(!m || !e) return;
  const b=e.getBoundingClientRect(), mb=m.getBoundingClientRect();
  if(b.top>=mb.top+8 && b.bottom<=mb.bottom-8) return;
  m.scrollBy({ top:(b.top+b.height/2)-(mb.top+mb.height/2), behavior:'smooth' });
}
// ▲ / ▼ on the picture when there is more of it above or below
function fsCues(){
  const m=$('#playView>main'); if(!m) return;
  const on=document.body.classList.contains('fsfill');
  m.classList.toggle('more-up', on && m.scrollTop>4);
  m.classList.toggle('more-down', on && m.scrollTop+m.clientHeight<m.scrollHeight-4);
}
function setHover(id){
  if(id===G.hoverId) return;
  if(AP.playing && S.mode==='learn' && !S.editing){ G.hoverId=null; return; }
  G.hoverId=id;
  // Pointing at a different item releases the previously clicked one, so its frame/label don't linger.
  if(id && G.pinnedId && id!==G.pinnedId){ G.pinnedId=null; renderChips(); }
  setHL(); updateTag();
}
function updateTag(){
  let id=null, pinned=false, kind='';
  if(!S.editing){
    if(G.flash){ id=G.flash.id; kind=G.flash.kind; pinned=true; }
    else if(S.mode==='learn'){ id=G.hoverId||G.pinnedId; pinned=!!G.pinnedId && id===G.pinnedId; }
  }
  const it=id && items()[id];
  if(!it){ tag.hidden=true; return; }
  tag.innerHTML='';
  const txt=el('div');
  if(kind==='bad') txt.append(el('small',{class:'why',text:'ยังไม่ใช่ — อันนี้คือ'}));
  txt.append(wordEl(it));
  if(mean(it)) txt.append(el('small',{text:mean(it)}));
  const kept=isKept(scene().id,id);
  tag.append(txt, el('button',{class:'say','aria-label':'ฟังเสียง',text:'🔊',onclick:e=>{e.stopPropagation(); speak(sayOf(id));}}),
    el('button',{class:'say keep'+(kept?' on':''),'aria-label':'เพิ่ม '+it.word+' ลงชุดคำ',title:kept?'อยู่ในชุดคำแล้ว — แก้ไขชุดคำ':'เพิ่มลงชุดคำ',text:'🔖',
      onclick:e=>{ e.stopPropagation(); openDeckPicker(sceneWord(id), ()=>{ updateTag(); renderChips(); }); }}));
  tag.className='tag'+(pinned?' pinned':'')+(kind?' '+kind:'');
  tag.hidden=false;
  const b=box(id); if(!b) return;
  const th=tag.offsetHeight, above=b.t > th+10, below=!above && b.b+th+10 <= b.H;
  tag.classList.toggle('below', !above);
  tag.style.top=(above? b.t-8 : below? b.b+8 : Math.max(4, b.t+8))+'px';
  tag.style.left=clampX(tag, b.cx, b.W)+'px';
}
function updateOverlay(){
  overlay.innerHTML='';
  const W=wrap.getBoundingClientRect().width;
  if(S.editing){
    const sc=scene(), ctm=svg.getScreenCTM(); if(sc.builtin||!ctm) return;
    if(G.drawMode){
      overlay.append(el('div',{class:'drawhint'}, el('span',{text:'✏️ ลากล้อมรอบสิ่งของ'}),
        el('button',{text:'ยกเลิก',onclick:e=>{ e.stopPropagation(); setDrawMode(false); }})));
      return;
    }
    const wr=wrap.getBoundingClientRect();
    const at=(x,y)=>{ const p=svg.createSVGPoint(); p.x=x; p.y=y; const q=p.matrixTransform(ctm); return {x:q.x-wr.left, y:q.y-wr.top}; };
    if(G.selId && sc.items[G.selId]){
      // Only the selected box: its word + a small action bar.
      const it=itemIn(sc.items[G.selId],S.lang), top=at(it.x+it.w/2, it.y), bot=at(it.x+it.w/2, it.y+it.h);
      const bar=el('div',{class:'selbar'},
        el('b',{text:labelOf(it)}),
        el('button',{class:'primary',text:'✏️ แก้ไขคำ',onclick:e=>{e.stopPropagation(); openItemForm(G.selId);}}),
        el('button',{class:'danger',text:'🗑 ลบ','aria-label':'ลบกรอบนี้',onclick:e=>{e.stopPropagation(); delete sc.items[G.selId]; G.selId=null; saveScenes(); renderScene(); refresh();}}),
        el('button',{text:'✕','aria-label':'ยกเลิกการเลือก',onclick:e=>{e.stopPropagation(); selectBox(null);}}));
      overlay.append(bar);
      const above = top.y - bar.offsetHeight - 8 > 0;
      bar.classList.toggle('below', !above);
      bar.style.top=(above? top.y-8 : bot.y+8)+'px';
      bar.style.left=clampX(bar, top.x, W)+'px';
      if(!S.allBoxes) return;
    }
    for(const [id,it] of Object.entries(itemsOf(sc))){
      if(id===G.selId) continue;
      const q=at(it.x+it.w/2, it.y);
      const m=el('div',{class:'mini edit'+(it.word?'':' unk'),text:labelOf(it),onclick:e=>{e.stopPropagation(); selectBox(id);}});
      overlay.append(m); m.style.top=Math.max(m.offsetHeight+2, q.y-2)+'px'; m.style.left=clampX(m,q.x,W)+'px';
    }
    return;
  }
  if(S.mode==='learn' && S.showAll && !isList(scene())){
    ids().forEach(id=>{
      const a=anchor(id); if(!a) return;
      const m=el('div',{class:'mini',text:items()[id].word,onclick:e=>{e.stopPropagation(); select(id);}});
      overlay.append(m); m.style.top=a.y+'px'; m.style.left=clampX(m,a.x,W)+'px';
    });
  }
  if(S.mode==='quiz'){
    const p=prog();
    ids().forEach(id=>{
      if(!p.done[id]) return;
      const a=anchor(id); if(!a) return;
      const d=el('div',{class:'badge'+(p.star[id]?' star':''),text:p.star[id]?'★':'✓'});
      d.style.left=a.x+'px'; d.style.top=a.y+'px'; overlay.append(d);
    });
  }
}
function doFlash(id, kind, ms){
  G.flash={id,kind}; clearTimeout(G.flashT);
  setHL(); updateTag();
  G.flashT=setTimeout(()=>{ G.flash=null; setHL(); updateTag(); }, ms||1400);
}

// ---------- sub bar ----------
function renderSub(){
  sub.innerHTML='';
  const put=(...k)=>sub.append(...k.filter(x=>x!=null));
  const sc=scene(), n=ids().length;
  if(S.editing){
    const name=el('input',{class:'name',value:sc.name,'aria-label':'ชื่อฉาก',placeholder:'พิมพ์ชื่อฉาก',maxlength:'50'});
    const commitName=()=>{ sc.name=name.value.trim().slice(0,50)||'ฉากของฉัน'; saveScenes(); renderSelect(); };
    name.addEventListener('input',()=>{ clearTimeout(name._t); name._t=setTimeout(commitName,400); });
    name.addEventListener('change',commitName);
    name.addEventListener('keydown',e=>{ if(e.key==='Enter'){ name.blur(); } });
    put(
      el('button',{class:'drawbtn'+(G.drawMode?' on':''),text:G.drawMode?'✕ ยกเลิกการตีกรอบ':'➕ ตีกรอบคำใหม่',
        title:'ลากกรอบรอบสิ่งของในรูป แล้วพิมพ์คำศัพท์ — ตีทับกรอบเดิมได้',onclick:()=>setDrawMode(!G.drawMode)}),
      G.aiReady ? el('button',{class:'ai',text:'✨ ให้ AI หาคำศัพท์',onclick:()=>openAI()}) : null,
      el('button',{class:'toggle'+(S.allBoxes?' on':''),title:'แสดงกรอบและชื่อของทุกชิ้น แม้ตอนเลือกกรอบอยู่',
        text:S.allBoxes?'👁 แสดงกรอบทั้งหมด: เปิด':'👁 แสดงกรอบทั้งหมด: ปิด',
        onclick:()=>{ S.allBoxes=!S.allBoxes; store.set('pv-allboxes',S.allBoxes); refresh(); }}),
      el('label',{class:'namefield'},'📝 ชื่อฉาก', name),
      el('span',{class:'grow'}),
      listBtn(),
      el('button',{text:'🔗 แชร์ฉาก',title:'สร้างลิงก์ หรือส่งเป็นไฟล์ .piccab ให้เพื่อน',onclick:()=>openShare({kind:'scene',sc})}),
      el('button',{class:'danger',text:'🗑 ลบฉาก',onclick:deleteScene}),
      el('button',{class:'primary',text:'✓ เสร็จแล้ว',onclick:()=>{ commitName(); S.editing=false; G.selId=null; saveScenes(); if(S.mode==='find' && ids().length) startFind(); refresh(); if(!ids().length) toast('ยังไม่มีคำศัพท์ในฉากนี้'); }}),
      el('div',{class:'hint',style:'flex-basis:100%',text:'➕ ตีกรอบคำใหม่: ลากรอบสิ่งของได้ทุกที่ แม้ทับกรอบเดิม • แตะกรอบเพื่อเลือก แล้วกด ✏️ แก้ไขคำ หรือ 🗑 ลบ • ลากกรอบเพื่อย้าย • ลาก □ เพื่อปรับขนาด • จุดที่กรอบซ้อนกัน แตะซ้ำเพื่อสลับกรอบ • ลากบนที่ว่างก็เพิ่มกรอบใหม่ได้ • แตะที่ว่างหรือกด Esc เพื่อกลับไปดูทุกกรอบ'})
    );
    return;
  }
  if(!n){
    const sc=scene(), boxes=Object.keys(sc.items||{}).length;
    if(S.lang!=='en' && boxes){
      const L=LANGS[S.lang], st=autoLangState(sc);
      if(translating(sc)){ put(el('span',{class:'hint busyline',text:`✨ กำลังเตรียมคำภาษา${L.name}ให้ฉากนี้… (ไม่ใช้เครดิต)`})); return; }
      const failed=TLfail[sc.id+'@'+S.lang];
      put(el('span',{class:'hint',text: st==='student' ? `ฉากนี้ยังไม่มีคำภาษา${L.name} — ขอให้ครูเปิดฉากนี้ในโหมดภาษา${L.name} แล้วระบบจะเตรียมคำให้` :
                                         st==='login' ? `ฉากนี้ยังไม่มีคำภาษา${L.name} — เข้าสู่ระบบ แล้วแอปจะเตรียมคำให้อัตโนมัติ (ไม่ใช้เครดิต) หรือพิมพ์เอง` :
                                         failed ? `เตรียมคำภาษา${L.name}ไม่สำเร็จ` : `ฉากนี้ยังไม่มีคำภาษา${L.name}`}),
        st==='login' ? el('button',{class:'primary',text:'เข้าสู่ระบบ',onclick:()=>openLogin()}) : null,
        (st==='ok' && failed) ? el('button',{class:'ai',text:'✨ ลองอีกครั้ง',onclick:()=>translateScene(sc,S.lang)}) : null,
        (!sc.builtin && st!=='student') ? el('button',{text:'✏️ ใส่คำเอง',onclick:()=>{ S.editing=true; G.selId=null; renderScene(); refresh(); }}) : null,
        el('button',{text:'🇬🇧 ฝึกภาษาอังกฤษแทน',onclick:()=>setLang('en')}));
      return;
    }
    put(el('span',{class:'hint',text:'ฉากนี้ยังไม่มีคำศัพท์ — กด ✏️ แก้ไขฉาก แล้วลากกรอบรอบสิ่งของในรูป'}));
    return;
  }
  if(S.mode==='learn'){
    const seg=el('div',{class:'seg',role:'group','aria-label':'วิธีเล่น'},
      el('button',{class:AP.on?'':'on',text:'✋ Manual',onclick:()=>{ if(!AP.on) return; AP.on=false; apReset(); renderSub(); }}),
      el('button',{class:AP.on?'on':'',text:'▶ Auto',onclick:()=>{ if(AP.on) return; AP.on=true; AP.queue=[]; AP.idx=0; apPlay(); }}));
    const mob=isMobile();
    const allBtn=el('button',{class:'toggle'+(S.showAll?' on':'')+(mob?' icon':''),'aria-label':'แสดงป้ายและกรอบทั้งหมด',text:mob?'🏷':(S.showAll?'🏷 ซ่อน':'🏷 แสดง')+'ป้ายและกรอบทั้งหมด',onclick:()=>{ S.showAll=!S.showAll; refresh(); }});
    if(!AP.on){
      put(seg, el('span',{class:'hint tip',text:'ชี้เมาส์หรือแตะที่สิ่งของ เพื่อดูคำศัพท์และฟังเสียง'}), el('span',{class:'grow'}), listBtn(), allBtn);
    } else if(mob){
      put(el('button',{class:'icon',text:'✋','aria-label':'กลับไปเลือกเอง (Manual)',title:'Manual',onclick:()=>{ AP.on=false; apReset(); renderSub(); updateTag(); }}),
        el('button',{class:'icon',text:'⏮','aria-label':'คำก่อนหน้า',onclick:()=>apJump(-1)}),
        el('button',{class:'primary play',text:AP.playing?'⏸':'▶','aria-label':AP.playing?'หยุด':'เล่น',onclick:()=>{ AP.playing?apPause():apPlay(); }}),
        el('button',{class:'icon',text:'⏭','aria-label':'คำถัดไป',onclick:()=>apJump(1)}),
        el('button',{class:'listbtn',id:'apCount',text:'','aria-label':'รายการคำศัพท์ทั้งหมด',onclick:openWordSheet}),
        el('span',{class:'grow'}),
        el('button',{class:'icon',text:'⚙','aria-label':'ตั้งค่าการเล่น',onclick:openApSettings}));
      apCounter();
    } else {
      const ord=el('select',{'aria-label':'ลำดับการเล่น'}); Object.entries(AP_ORDERS).forEach(([k,v])=>ord.add(new Option('🔀 '+v,k))); ord.value=AP.order;
      ord.addEventListener('change',()=>{ AP.order=ord.value; store.set('pv-ap-order',AP.order); AP.token++; clearTimeout(AP.timer); AP.queue=apList(); AP.idx=0; if(AP.playing) apStep(); else apCounter(); });
      const gap=el('select',{'aria-label':'ความเร็ว'}); Object.entries(AP_GAPS).forEach(([k,v])=>gap.add(new Option('⏱ '+v,k))); gap.value=String(AP.gap);
      gap.addEventListener('change',()=>{ AP.gap=+gap.value; store.set('pv-ap-gap',AP.gap); });
      put(seg,
        el('button',{class:'primary big',text:AP.playing?'⏸ หยุด':'▶ เล่น',onclick:()=>{ AP.playing?apPause():apPlay(); }}),
        el('button',{text:'⏮','aria-label':'คำก่อนหน้า',onclick:()=>apJump(-1)}),
        el('button',{text:'⏭','aria-label':'คำถัดไป',onclick:()=>apJump(1)}),
        el('span',{class:'pill',id:'apCount',text:''}),
        ord, gap,
        el('span',{class:'grow'}), allBtn);
      apCounter();
    }
  } else if(S.mode==='quiz'){
    const p=prog(), d=ids().filter(i=>p.done[i]).length, st=ids().filter(i=>p.star[i]).length;
    const bar=el('span',{class:'bar'+(d===n?' full':'')},el('i')); bar.firstChild.style.width=(d/n*100)+'%';
    put(
      el('span',{class:'hint'+(d===n?'':' tip'),text: d===n ? '🎉 ทบทวนครบทุกคำแล้ว เก่งมาก!' : `แตะสิ่งของ แล้วพิมพ์ว่ามันคืออะไรเป็นภาษา${LANGS[S.lang].name}`+(S.lang==='de'?' (ใส่ der/die/das ด้วยจะได้ ★)':'')}),
      el('span',{class:'grow'}),
      el('span',{class:'pill'}, bar, `${d}/${n}`, el('span',{title:'ตอบถูกโดยไม่ใช้ตัวช่วย',text:`★ ${st}`})),
      listBtn(),
      el('button',{class:isMobile()?'icon':'',text:isMobile()?'↺':'↺ เริ่มใหม่','aria-label':'เริ่มใหม่',onclick:resetQuiz})
    );
  } else if(S.mode==='speak'){
    renderSpeakSub(put);
  } else if(S.mode==='find'){
    if(G.find.target){
      const word = G.find.showWord ? el('span',{class:'target',text:items()[G.find.target].word}) : null;
      put(
        el('button',{class:'primary big',text:'🔊 ฟังคำ',onclick:()=>speak(sayOf(G.find.target))}),
        word,
        el('span',{class:'hint tip',text:'แล้วแตะของชิ้นนั้นในภาพ'}),
        el('span',{class:'grow'}),
        findKeepBtn(),
        el('button',{class:'toggle'+(G.find.showWord?' on':''),text:G.find.showWord?'🙈 ซ่อนคำ':'👁 แสดงคำ',onclick:()=>{ G.find.showWord=!G.find.showWord; renderSub(); }}),
        el('button',{text:'ข้าม ⏭',onclick:()=>{ G.find.missed=true; doFlash(G.find.target,'good',1300); speak(sayOf(G.find.target)); lockNext(1300); }}),
        el('span',{class:'pill',text:`ถูก ${G.find.score} • เหลือ ${G.find.queue.length+1}/${G.find.total}`})
      );
    } else {
      put(
        el('span',{class:'hint',text:`🎉 จบรอบแล้ว! หาถูกตั้งแต่ครั้งแรก ${G.find.score}/${G.find.total} คำ`}),
        el('span',{class:'grow'}),
        findKeepBtn(),
        el('button',{class:'primary',text:'เล่นอีกรอบ',onclick:startFind})
      );
    }
  }
}
// find mode: keep the word just played (the current one is still a secret)
function findKeepBtn(){
  const id=G.find.last, it=id && items()[id]; if(!it) return null;
  const kept=isKept(scene().id,id);
  return el('button',{class:'keepbtn'+(kept?' on':''),title:'เพิ่มคำที่แล้ว “'+it.word+'” ลงชุดคำ','aria-label':'เพิ่มคำที่แล้ว '+it.word+' ลงชุดคำ',
    onclick:()=>openDeckPicker(sceneWord(id), ()=>renderSub())}, '🔖 ', el('span',{text:it.word}));
}
function renderChips(){
  chips.innerHTML='';
  const hide = !S.editing && S.mode==='find';
  chips.hidden = hide; if(hide) return;
  const its=items(), p=prog();
  ids().forEach((id,i)=>{
    const b=el('button',{class:'chip'});
    if(S.editing){ b.textContent=labelOf(its[id]); if(!its[id].word) b.classList.add('unk'); if(id===G.selId) b.classList.add('on'); }
    else if(S.mode==='learn' || S.mode==='speak'){ b.textContent=its[id].word; if(id===(S.mode==='speak'?spk.target:G.pinnedId)) b.classList.add('on'); }
    else{
      if(p.done[id]){ b.textContent=(p.star[id]?'★ ':'✓ ')+its[id].word; b.classList.add('done'); }
      else { b.textContent='คำที่ '+(i+1); b.classList.add('unk'); }
      if(id===G.quizId) b.classList.add('on');
    }
    b.addEventListener('click',()=>select(id));
    b.addEventListener('pointerenter',e=>{ if(e.pointerType==='mouse') setHover(id); });
    b.addEventListener('pointerleave',e=>{ if(e.pointerType==='mouse') setHover(null); });
    chips.append(b);
  });
}
const listBtn=()=>(isMobile()||document.body.classList.contains('fsside')) && ids().length ? el('button',{class:'listbtn',text:`📖 คำ (${ids().length})`,'aria-label':'รายการคำศัพท์ทั้งหมด',onclick:openWordSheet}) : null;
// Phones: the full word list (with Thai meanings in learn mode) in a sheet from the bottom.
function openWordSheet(){
  openModal(m=>{
    m.classList.add('sheet'); $('#modal').classList.add('sheetmode');
    const its=items(), p=prog(), learn=S.editing||S.mode==='learn';
    const cur=S.editing?G.selId:(G.pinnedId||G.quizId);
    m.append(el('div',{class:'sheethead'}, el('b',{text:`คำศัพท์ในฉากนี้ (${ids().length})`}), el('button',{text:'✕','aria-label':'ปิด',onclick:closeModal})));
    const list=el('div',{class:'wlist'});
    ids().forEach((id,i)=>{
      const it=its[id]; let main, sub2=null, cls='wrow';
      if(learn){ main=S.editing?labelOf(it):it.word; sub2=mean(it)||null; }
      else if(p.done[id]){ main=(p.star[id]?'★ ':'✓ ')+it.word; sub2=mean(it)||null; cls+=' done'; }
      else { main='คำที่ '+(i+1); cls+=' unk'; }
      list.append(el('button',{class:cls+(id===cur?' on':''),onclick:()=>{ closeModal(); select(id); }},
        el('b',{text:main}), sub2?el('small',{text:sub2}):null));
    });
    m.append(list);
    const on=list.querySelector('.on'); if(on) setTimeout(()=>on.scrollIntoView({block:'center'}),30);
  });
}
// Phones: auto-play settings (order, speed, labels) live behind ⚙ to keep one row of controls.
function openApSettings(){
  openModal(m=>{
    m.classList.add('sheet'); $('#modal').classList.add('sheetmode');
    const ord=el('select',{}); Object.entries(AP_ORDERS).forEach(([k,v])=>ord.add(new Option(v,k))); ord.value=AP.order;
    ord.addEventListener('change',()=>{ AP.order=ord.value; store.set('pv-ap-order',AP.order); AP.token++; clearTimeout(AP.timer); AP.queue=apList(); AP.idx=0; if(AP.playing) apStep(); else apCounter(); });
    const gap=el('select',{}); Object.entries(AP_GAPS).forEach(([k,v])=>gap.add(new Option(v,k))); gap.value=String(AP.gap);
    gap.addEventListener('change',()=>{ AP.gap=+gap.value; store.set('pv-ap-gap',AP.gap); });
    const lab=el('input',{type:'checkbox'}); lab.checked=S.showAll;
    lab.addEventListener('change',()=>{ S.showAll=lab.checked; refresh(); });
    m.append(el('div',{class:'sheethead'}, el('b',{text:'⚙ ตั้งค่าการเล่นอัตโนมัติ'}), el('button',{text:'✕','aria-label':'ปิด',onclick:closeModal})),
      el('label',{},'🔀 ลำดับ', ord), el('label',{},'⏱ ความเร็ว', gap),
      el('label',{class:'opt'}, lab, '🏷 แสดงป้ายและกรอบทั้งหมด'));
  });
}

// ---------- main interaction ----------
function select(id){
  if(!items()[id]) return;
  if(S.editing){ if(id===G.selId) openItemForm(id); else selectBox(id); return; }
  if(S.mode==='learn'){
    if(AP.on){ apPause(); const i=AP.queue.indexOf(id); if(i>=0) AP.idx=i; apCounter(); }
    G.pinnedId=id; speak(sayOf(id)); setHL(); updateTag(); renderChips();
  } else if(S.mode==='quiz'){
    if(prog().done[id]){ closeQuiz(); doFlash(id,'good',1800); speak(sayOf(id)); }
    else openQuiz(id);
  } else if(S.mode==='find'){ findTap(id); }
  else if(S.mode==='speak'){ spkPick(id); }
}
svg.addEventListener('pointermove', e=>{
  if(drawing){ updDraft(toSvg(e)); return; }
  if(drag){ dragMove(e); return; }
  if(e.pointerType!=='mouse') return;
  const it=e.target.closest && e.target.closest('.item');
  setHover(it?it.dataset.id:null);
});
svg.addEventListener('pointerleave', ()=>{ if(G.hoverId && !drawing && !drag){ G.hoverId=null; setHL(); updateTag(); } });
// Where the finger actually touched. Mobile browsers may "snap" a tap's click to a
// nearby larger box (touch adjustment), so taps are resolved from this point instead.
let lastDown=null;
svg.addEventListener('pointerdown', e=>{ lastDown={x:e.clientX, y:e.clientY, t:Date.now(), touch:e.pointerType!=='mouse'}; }, true);
function itemAtClick(e){
  if(lastDown && lastDown.touch && Date.now()-lastDown.t<1000){
    const t=document.elementFromPoint(lastDown.x, lastDown.y);
    return t && svg.contains(t) ? t.closest('.item') : null;
  }
  return e.target.closest('.item');
}
svg.addEventListener('click', e=>{
  if(Date.now()-drewAt<400) return;
  const it=itemAtClick(e);
  if(it){ select(it.dataset.id); return; }
  if(!S.editing && !AP.playing){ G.pinnedId=null; closeQuiz(); setHL(); updateTag(); renderChips(); }
});

// ---------- modes / buttons ----------
document.querySelectorAll('#modes button[data-mode]').forEach(b=>b.addEventListener('click',()=>{
  apReset(); spkStop(); S.mode=b.dataset.mode; G.pinnedId=G.hoverId=null; G.flash=null; closeQuiz(true); tally('mode:'+S.mode);
  try{ speechSynthesis.cancel(); }catch(e){}
  if(isList(scene())) renderScene();   // a word sheet shows the English words only while learning
  if(S.mode==='find' && ids().length) startFind();
  if(S.mode==='speak') startSpeak();
  refresh();
}));
$('#homeBtn').addEventListener('click',()=>goHome('home'));
$('#brandBtn').addEventListener('click',()=>goHome('home'));
$('#editBtn').addEventListener('click',()=>{ if(scene().builtin) return; if(isList(scene())){ openSheetMaker(scene()); return; } apReset(); S.editing=true; G.selId=null; closeQuiz(true); G.pinnedId=G.hoverId=null; refresh(); });
document.querySelectorAll('.mainnav button').forEach(b=>b.addEventListener('click',()=>goHome(b.dataset.view)));
$('#libSearch').addEventListener('input',e=>{ LIB.q=e.target.value; renderLibrary(); });
document.querySelectorAll('#libFilters button').forEach(b=>b.addEventListener('click',()=>{ LIB.f=b.dataset.f; renderLibrary(); }));
document.querySelectorAll('.bnav button[data-view]').forEach(b=>b.addEventListener('click',()=>goHome(b.dataset.view)));
$('#fabCam').addEventListener('click',()=>$('#fileCam').click());
document.querySelectorAll('.bnav button[data-soon]').forEach(b=>b.addEventListener('click',()=>toast(b.dataset.soon+' — เร็วๆ นี้')));
$('#libSort').addEventListener('change',e=>{ LIB.sort=e.target.value; renderLibrary(); });
$('#renameBtn').addEventListener('click',()=>{
  const sc=scene(); if(sc.builtin) return;
  openModal(m=>{
    const inp=el('input',{value:sc.name,maxlength:'50',placeholder:'ชื่อฉาก'});
    const save=()=>{ const v=inp.value.trim(); if(!v){ inp.focus(); return; } sc.name=v.slice(0,50); saveScenes(); renderSelect(); refresh(); closeModal(); toast('เปลี่ยนชื่อฉากแล้ว ✓'); };
    inp.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); save(); } });
    m.append(el('h3',{text:'📝 เปลี่ยนชื่อฉาก'}), el('label',{},'ชื่อฉาก', inp),
      el('div',{class:'row'}, el('span',{class:'sp'}), el('button',{text:'ยกเลิก',onclick:closeModal}), el('button',{class:'primary',text:'บันทึก',onclick:save})));
    setTimeout(()=>inp.select(),40);
  });
});
$('#importBtn').addEventListener('click',openImport);
// voice choices follow the language being practised (remembered per language)
const accentKey=()=>S.lang==='en' ? 'pv-accent' : 'pv-accent-'+S.lang;
function fillAccent(){
  const a=$('#accent'), L=LANGS[S.lang]; a.innerHTML='';
  L.voices.forEach(([v,label])=>a.append(el('option',{value:v,text:label})));
  const want=store.get(accentKey(), L.voices[0][0]); a.value=L.voices.some(x=>x[0]===want)?want:L.voices[0][0];
}
fillAccent();
$('#slow').checked=!!store.get('pv-slow',false);
$('#accent').addEventListener('change',e=>{ store.set(accentKey(),e.target.value); speak(LANGS[S.lang].hello); });
$('#slow').addEventListener('change',e=>store.set('pv-slow',e.target.checked));
document.addEventListener('keydown',e=>{ if(e.key==='Escape'){ if(AP.playing) apPause(); else if(!$('#modal').hidden) closeModal(); else if(G.drawMode) setDrawMode(false); else if(S.editing && G.selId) selectBox(null); else if(G.quizId) closeQuiz(); else if(isFs()) exitFs(); } });

// ---------- modal ----------
G.modalClose=null;
function openModal(build){ const m=$('#mbox'); m.className='mbox'; $('#modal').classList.remove('sheetmode'); m.innerHTML=''; build(m); $('#modal').hidden=false; const f=m.querySelector('input,textarea,button.primary'); if(f) setTimeout(()=>f.focus(),30); }
function closeModal(){ $('#modal').hidden=true; const cb=G.modalClose; G.modalClose=null; if(cb) cb(); }
$('#modal').addEventListener('click',e=>{ if(e.target.id==='modal') closeModal(); });
function ask(msg, okText){
  return new Promise(res=>{
    let ans=false;
    G.modalClose=()=>res(ans);
    openModal(m=>m.append(el('p',{text:msg}), el('div',{class:'row'}, el('span',{class:'sp'}),
      el('button',{text:'ยกเลิก',onclick:closeModal}),
      el('button',{class:'primary',text:okText||'ตกลง',onclick:()=>{ ans=true; closeModal(); }}))));
  });
}

export { IMG_PENDING, UI_LANGS, accentKey, ask, closeModal, doFlash, fsCues, fullRender, goHome, langLabel, layoutHs, openModal, openScene, practised, progOf, refresh, renderChips, renderScene, renderSub, rrPath, sayOf, sceneImg, select, selectBox, setHL, setLang, uiRow, updateOverlay, updateTag };
