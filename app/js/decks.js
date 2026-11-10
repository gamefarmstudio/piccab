// Piccab — Word decks (ชุดคำ).
import { G, $, artNote, check, el, ic, items, itemsOf, LANGS, lev, LOC, mean, normFor, NS, progress, S, scene, scenes, shuffle, speak, store, tally, toast } from './core.js';
import { dayNo, dueOn, dueWords, nextReviewText, saveProg, srsAnswer, srsDue, srsOf } from './progress.js';
import { ask, closeModal, openModal, openScene, progOf, sceneImg, select } from './scene.js';
import { allWords, markActive, renderHome, sayWord, statChip, WD, WD_IC, WD_LABELS, WD_ST, wordEl, wordThumb } from './home.js';
import { pattern } from './games.js';
import { deleteScene, examIn, examLabel, isList, listStyle, openSheetMaker } from './sheets.js';
import { user } from './account.js';
import { ADM } from './admin.js';
import { galEditOf, galPushEdit } from './gallery.js';
import { openShare } from './share.js';
import { saveSyncMem, SYNC, syncSoon } from './sync.js';

// ---------- word decks ("ชุดคำ") ----------
// A deck is a list of "<scene id>|<item id>" keys. "saved" (🔖 เก็บไว้) always shows; it is stored once used.
const SAVED_DECK='saved';
G.decks=store.get('pv-decks',[]); if(!Array.isArray(G.decks)) G.decks=[];
G.decks=G.decks.filter(d=>d && d.id && Array.isArray(d.words));
const deckSig=d=>JSON.stringify([d.name,d.words]);
const dsig=(o,g)=>Object.defineProperty(o,'_sig',{value:g,writable:true,configurable:true,enumerable:false});
G.decks.forEach(d=>dsig(d,deckSig(d)));
const wkey=(scId,id)=>scId+'|'+id;
const deckName=d=>d.id===SAVED_DECK?'🔖 เก็บไว้':d.name;
const getDeck=id=>G.decks.find(d=>d.id===id);
function deckList(){ const sv=getDeck(SAVED_DECK)||{id:SAVED_DECK,name:'',words:[],virtual:true}; return [sv].concat(G.decks.filter(d=>d.id!==SAVED_DECK)); }
function realDeck(d){ if(!d.virtual) return d; let r=getDeck(SAVED_DECK); if(!r){ r={id:SAVED_DECK,name:'',words:[]}; G.decks.unshift(r); } return r; }
function saveDecks(){
  const now=Date.now();
  G.decks.forEach(d=>{ const g=deckSig(d); if(d._sig!==g){ if(d._sig!==undefined || !d.updatedAt) d.updatedAt=now; dsig(d,g); } });
  store.set('pv-decks',G.decks);
  if(typeof syncSoon==='function') syncSoon();
}
function toggleWord(d,k,on){ d=realDeck(d); const i=d.words.indexOf(k); if(on && i<0) d.words.push(k); if(!on && i>=0) d.words.splice(i,1); saveDecks(); return d; }
function newDeck(name){ const d={id:'d'+Date.now().toString(36)+Math.random().toString(36).slice(2,6), name:String(name).trim().slice(0,30), words:[]}; G.decks.push(d); saveDecks(); return d; }
function deleteDeck(d){
  const i=G.decks.indexOf(d); if(i<0) return;
  G.decks.splice(i,1); store.set('pv-decks',G.decks);
  if(d.owner && user && d.owner===user.id && typeof SYNC!=='undefined'){ SYNC.delDecks.push(d.id); saveSyncMem(); syncSoon(); }
}
const sceneWord=id=>({sc:scene(), id, it:items()[id]});
const isKept=(scId,id)=>{ const k=wkey(scId,id); return G.decks.some(d=>d.words.includes(k)); };
const savedHas=(scId,id)=>{ const d=getDeck(SAVED_DECK); return !!d && d.words.includes(wkey(scId,id)); };
const liveKeys=all=>new Set((all||allWords()).map(w=>wkey(w.sc.id,w.id)));
const deckCount=(d,keys)=>d.words.filter(k=>keys.has(k)).length;
function wordsFiltered(all){
  const q=WD.q.trim().toLowerCase();
  const today=dayNo();
  let list=all.filter(w=>WD.f==='all'||(WD.f==='due' ? (w.st!=='todo' && (srsOf(w.sc.id,w.pid)||{d:1e9}).d<=today) : w.st===WD.f));
  if(q) list=list.filter(w=>[w.it.word,w.it.th||''].concat(w.it.alts||[]).some(t=>String(t).toLowerCase().includes(q)));
  const ord={todo:0,done:1,star:2};
  if(WD.sort==='az') list=list.slice().sort((a,b)=>a.it.word.localeCompare(b.it.word,'en',{sensitivity:'base'}));
  else if(WD.sort==='todo') list=list.slice().sort((a,b)=>ord[a.st]-ord[b.st]);
  return list;
}
function renderWords(){
  const v=$('#wordsView'); v.innerHTML='';
  const all=allWords();
  v.append(el('div',{class:'ghead lh'}, el('h2',{text:'คำของฉัน'}), el('div',{class:'stats',id:'wdCount'})));
  if(!all.length){
    v.append(el('div',{class:'libempty'},'ยังไม่มีคำศัพท์ในฉากไหนเลย ลองถ่ายรูปหรือเลือกรูปเพื่อสร้างฉากแรก'),
      el('div',{class:'createrow'},
        el('button',{class:'cbtn',onclick:()=>$('#fileCam').click()}, ic('photo_camera'), 'ถ่ายรูป'),
        el('button',{class:'cbtn',onclick:()=>$('#fileImg').click()}, ic('imagesmode'), 'เลือกรูป')));
    return;
  }
  v.append(el('div',{class:'wd-decks',id:'wdDecks',role:'tablist','aria-label':'ชุดคำ'}), el('div',{class:'wd-dhead',id:'wdDeckHead'}), el('div',{id:'wdTile'}));
  const search=el('input',{type:'search',placeholder:'ค้นหาคำ เช่น teapot, กาน้ำชา',value:WD.q,'aria-label':'ค้นหาคำศัพท์'});
  search.addEventListener('input',()=>{ WD.q=search.value; WD.limit=120; updateWords(); });
  const seg=el('div',{class:'fchips',id:'wdFilters',role:'group','aria-label':'กรองคำ'});
  Object.keys(WD_LABELS).forEach(f=>seg.append(el('button',{'data-f':f,class:f==='all'?'':'ionly',title:WD_LABELS[f],onclick:()=>{ WD.f=f; WD.limit=120; updateWords(); }})));
  const sort=el('select',{'aria-label':'เรียงลำดับ'},
    el('option',{value:'scene',text:'ตามฉาก'}), el('option',{value:'az',text:'A→Z'}), el('option',{value:'todo',text:'ยังไม่ผ่านก่อน'}));
  sort.value=WD.sort; sort.addEventListener('change',()=>{ WD.sort=sort.value; updateWords(); });
  v.append(el('div',{class:'libbar'}, el('label',{class:'search'}, ic('search'), search), seg, el('label',{class:'sortsel',title:'เรียงลำดับ'}, ic('swap_vert'), sort)),
    el('div',{class:'wd-grid',id:'wdGrid'}), el('div',{id:'wdMore'}));
  updateWords(all);
}
function updateWords(all){
  if(!$('#wdGrid')) return;
  all=all||allWords();
  const keys=liveKeys(all);
  let deck=WD.deck ? deckList().find(d=>d.id===WD.deck) : null;
  if(WD.deck && !deck){ WD.deck=''; store.set('pv-wdeck',''); }
  // deck bar
  const bar=$('#wdDecks'); bar.innerHTML='';
  const chip=(id,label,n)=>el('button',{class:'dchip'+(WD.deck===id?' on':''),role:'tab','aria-selected':String(WD.deck===id),
    onclick:()=>{ WD.deck=id; WD.limit=120; store.set('pv-wdeck',id); updateWords(); }}, label, el('span',{class:'n',text:String(n)}));
  bar.append(chip('',[ic('apps'),'ทุกคำ'],all.length));
  deckList().forEach(d=>bar.append(chip(d.id, d.id===SAVED_DECK?[ic('bookmark-fill'),'เก็บไว้']:d.name, deckCount(d,keys))));
  bar.append(el('button',{class:'dchip new',onclick:createDeckDialog}, ic('add'), 'สร้างชุด'));
  const head=$('#wdDeckHead'); head.innerHTML='';
  if(deck){
    head.append(el('button',{class:'linkbtn small',onclick:()=>openDeckAdder(deck)}, ic('add'), 'เพิ่มคำเข้าชุดนี้'));
    if(deckCount(deck,keys)) head.append(el('button',{class:'linkbtn small',onclick:()=>openShare({kind:'deck',deck:realDeck(deck)})}, ic('share'), 'แชร์ชุดนี้'));
    if(deck.id!==SAVED_DECK) head.append(
      el('button',{class:'linkbtn small muted',onclick:()=>renameDeckDialog(deck)}, ic('edit'), 'เปลี่ยนชื่อ'),
      el('button',{class:'linkbtn small muted',onclick:()=>ask(`ลบชุดคำ “${deck.name}”? (คำศัพท์ในฉากยังอยู่เหมือนเดิม)`,'ลบชุดคำ').then(ok=>{ if(ok){ deleteDeck(deck); WD.deck=''; store.set('pv-wdeck',''); updateWords(); toast('ลบชุดคำแล้ว'); } })}, ic('delete'), 'ลบชุด'));
  }
  if(deck){ const ks=new Set(deck.words); all=all.filter(w=>ks.has(wkey(w.sc.id,w.id))); }
  const cnt={all:all.length,todo:0,done:0,star:0,due:dueWords(all).length}; all.forEach(w=>cnt[w.st]++);
  const nSc=new Set(all.map(w=>w.sc.id)).size;
  $('#wdCount').replaceChildren(
    statChip('menu_book','today',all.length,`${all.length} คำ จาก ${nSc} ฉาก`),
    statChip('check_circle-fill','ok',cnt.done+cnt.star,`ผ่านแล้ว ${cnt.done+cnt.star} คำ`),
    statChip('star-fill','gold',cnt.star,`จำได้ ${cnt.star} ดาว`));
  document.querySelectorAll('#wdFilters button').forEach(b=>{ const f=b.dataset.f; b.replaceChildren(ic(WD_IC[f]), el('span',{class:'fl',text:WD_LABELS[f]}), el('span',{class:'n',text:String(cnt[f])})); b.classList.toggle('on',f===WD.f); });
  const list=wordsFiltered(all), narrowed=WD.f!=='all'||!!WD.q.trim();
  const t=$('#wdTile'); t.innerHTML='';
  if(list.length){
    const n=Math.min(10,list.length), left=list.filter(w=>w.st==='todo').length;
    t.append(el('button',{class:'tile review wd-review',onclick:()=>startReview(list)},
      el('span',{class:'ic'},ic('keyboard')),
      el('span',{class:'tt'}, el('b',{text:`ทบทวน ${n} คำ`}),
        el('small',{text:(deck?'จากชุด “'+deckName(deck)+'” · ':'')+(narrowed?'จากคำที่กรองไว้ · ':'')+(left?'เริ่มจากคำที่ยังไม่ผ่าน':'สุ่มคำมาทายอีกรอบ')})),
      el('span',{class:'arrow'},ic('arrow_forward'))));
  }
  const g=$('#wdGrid'); g.innerHTML='';
  if(!list.length){
    if(deck && !all.length) g.append(el('div',{class:'libempty'}, 'ยังไม่มีคำในชุดนี้', el('br'),
      el('button',{class:'primary pillbtn',style:'margin-top:12px',onclick:()=>openDeckAdder(deck)}, ic('add'), 'เพิ่มคำเข้าชุดนี้'),
      el('div',{class:'note',style:'margin-top:8px;font-size:13.5px',text:'หรือกด ＋ บนการ์ดคำในหน้า “ทุกคำ”'})));
    else g.append(el('div',{class:'libempty',text: WD.q.trim()?`ไม่พบคำที่ตรงกับ “${WD.q.trim()}”`:'ยังไม่มีคำในหมวดนี้'}));
  }
  const inAny=new Set(G.decks.flatMap(d=>d.words));
  list.slice(0,WD.limit).forEach(w=>g.append(wordCard(w, inAny.has(wkey(w.sc.id,w.id)))));
  const more=$('#wdMore'); more.innerHTML='';
  if(list.length>WD.limit) more.append(el('button',{class:'wd-more',text:`แสดงเพิ่ม (${list.length-WD.limit} คำ)`,onclick:()=>{ WD.limit+=240; updateWords(); }}));
}
function wordCard(w, kept){
  const {sc,id,it,st}=w;
  return el('div',{class:'wd-card st-'+st},
    el('button',{class:'wd-add'+(kept?' on':''),title:kept?'อยู่ในชุดคำแล้ว — แก้ไขชุดคำ':'เพิ่มลงชุดคำ','aria-label':'เพิ่ม '+it.word+' ลงชุดคำ',onclick:()=>openDeckPicker(w)}, ic(kept?'bookmark-fill':'add')),
    el('button',{class:'wd-main',title:'ฟังเสียง','aria-label':'ฟังเสียง '+it.word,onclick:()=>speak(sayWord(it))},
      el('span',{class:'wd-pic'}, wordThumb(sc,it), el('span',{class:'wd-say'},ic('volume_up'))),
      wordEl(it),
      mean(it) ? el('span',{class:'wd-th',text:mean(it)}) : null),
    el('div',{class:'wd-foot'},
      el('span',{class:'wd-st'}, el('span',{class:'wd-sti',title:WD_ST[st]}, ic(WD_IC[st]), WD_ST[st]), st!=='todo' ? el('small',{class:'wd-next'+(srsDue(sc.id,w.pid)?' due':''),text:nextReviewText(sc.id,w.pid)}) : null),
      el('button',{class:'wd-go',title:'ดูในฉาก “'+sc.name+'”',onclick:()=>{ openScene(sc.id,'learn'); select(id); }}, ic('location_on'), el('span',{text:sc.name}))));
}
function deckWordHead(w){ return el('div',{class:'dk-word'}, wordThumb(w.sc,w.it,'dk-thumb'), el('span',{}, el('b',{text:w.it.word}), mean(w.it)?el('small',{text:mean(w.it)}):null)); }
// ＋ on a word card: tick the decks it belongs to, or make a new one.
function openDeckPicker(w, after){
  const k=wkey(w.sc.id,w.id);
  openModal(m=>{
    m.classList.add('dkbox');
    const list=el('div',{class:'dk-list'});
    const draw=()=>{
      list.innerHTML=''; const keys=liveKeys();
      deckList().forEach(d=>{
        const cb=el('input',{type:'checkbox'}); cb.checked=d.words.includes(k);
        cb.addEventListener('change',()=>{ toggleWord(d,k,cb.checked); draw(); });
        list.append(el('label',{class:'dk-row'}, cb, el('span',{class:'dk-name',text:deckName(d)}), el('span',{class:'dk-n',text:deckCount(d,keys)+' คำ'})));
      });
    };
    const name=el('input',{class:'dk-new',maxlength:'30',placeholder:'ชื่อชุดใหม่ เช่น เครื่องครัว','aria-label':'ชื่อชุดคำใหม่'});
    const add=()=>{ const v=name.value.trim(); if(!v){ name.focus(); return; } toggleWord(newDeck(v),k,true); name.value=''; draw(); toast('สร้างชุด “'+v+'” แล้ว'); };
    name.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); add(); } });
    m.append(el('h3',{text:'เพิ่มลงชุดคำ'}), deckWordHead(w), list,
      el('div',{class:'dk-add'}, name, el('button',{type:'button',text:'＋ สร้าง',onclick:add})),
      el('div',{class:'row'}, el('span',{class:'sp'}), el('button',{class:'primary',text:'เสร็จ',onclick:closeModal})));
    draw();
  });
  setTimeout(()=>{ const a=document.activeElement; if(a && a.type==='checkbox') a.blur(); },60);
  G.modalClose=()=>{ if(after) after(); else if(S.view==='words') updateWords(); };
}
// "＋ เพิ่มคำเข้าชุดนี้": pick many words at once.
function openDeckAdder(d){
  const all=allWords();
  openModal(m=>{
    m.classList.add('dkbox');
    const q=el('input',{type:'search',placeholder:'ค้นหาคำ เช่น cup, ถ้วย','aria-label':'ค้นหาคำ'});
    const list=el('div',{class:'dk-list tall'}), note=el('span',{class:'note'});
    const count=()=>{ const ks=liveKeys(all); note.textContent=`ในชุดนี้ ${deckCount(d,ks)} คำ`; };
    const draw=()=>{
      list.innerHTML=''; const t=q.value.trim().toLowerCase();
      const rows=all.filter(w=>!t || [w.it.word,w.it.th||''].concat(w.it.alts||[]).some(x=>String(x).toLowerCase().includes(t)));
      rows.slice(0,200).forEach(w=>{
        const k=wkey(w.sc.id,w.id), cb=el('input',{type:'checkbox'}); cb.checked=d.words.includes(k);
        cb.addEventListener('change',()=>{ d=toggleWord(d,k,cb.checked); count(); });
        list.append(el('label',{class:'dk-row w'}, cb, wordThumb(w.sc,w.it,'dk-thumb sm'),
          el('span',{class:'dk-name'}, el('b',{text:w.it.word}), mean(w.it)?el('small',{text:mean(w.it)}):null)));
      });
      if(!rows.length) list.append(el('div',{class:'libempty',text:'ไม่พบคำ'}));
      else if(rows.length>200) list.append(el('div',{class:'note',style:'padding:8px',text:`แสดง 200 จาก ${rows.length} คำ — พิมพ์ค้นหาเพื่อหาคำอื่น`}));
    };
    q.addEventListener('input',draw);
    m.append(el('h3',{text:'เพิ่มคำเข้า “'+deckName(d)+'”'}), q, list,
      el('div',{class:'row'}, note, el('span',{class:'sp'}), el('button',{class:'primary',text:'เสร็จ',onclick:closeModal})));
    draw(); count();
  });
  if(matchMedia('(pointer:coarse)').matches) setTimeout(()=>{ const a=document.activeElement; if(a && a.type==='search') a.blur(); },60);
  G.modalClose=()=>{ if(S.view==='words') updateWords(); };
}
function deckNameDialog(title, value, okText, onOk, ph, max){
  openModal(m=>{
    const inp=el('input',{maxlength:String(max||30),value:value||'',placeholder:ph||'เช่น เครื่องครัว, คำยาก, เตรียมสอบ','aria-label':title});
    const go=()=>{ const v=inp.value.trim(); if(!v && !String(title).includes('ไม่บังคับ')){ inp.focus(); return; } closeModal(); onOk(v); };
    inp.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); go(); } });
    m.append(el('h3',{text:title}), inp,
      el('div',{class:'row'}, el('span',{class:'sp'}), el('button',{text:'ยกเลิก',onclick:closeModal}), el('button',{class:'primary',text:okText,onclick:go})));
  });
}
function createDeckDialog(){
  deckNameDialog('สร้างชุดคำใหม่','', 'สร้าง', v=>{ const d=newDeck(v); WD.deck=d.id; store.set('pv-wdeck',d.id); updateWords(); openDeckAdder(d); });
}
function renameDeckDialog(d){
  deckNameDialog('เปลี่ยนชื่อชุดคำ', d.name, 'บันทึก', v=>{ d.name=v.slice(0,30); saveDecks(); updateWords(); });
}
// Mixed review: up to 10 words, words not yet passed first. Same rules as the scene quiz:
// typing it right marks ✓, and ★ if no hint / listen / answer was used.
let RV=null;
function startReview(list, all){
  tally(all ? 'mock' : 'review');
  const by=st=>shuffle(list.filter(w=>w.st===st));
  const pick=all ? shuffle(list.slice()) : shuffle(by('todo').concat(by('done'),by('star')).slice(0,10));
  if(!pick.length){ toast('ไม่มีคำให้ทบทวน'); return; }
  RV={list:pick, src:list.map(w=>w.sc.id+'\u0000'+w.id), i:0, ok:0, star:0, mock:!!all};
  markActive(0);
  rvQuestion();
}
// Today's spaced-repetition review: the most overdue / least known words first, 10 at a time.
function startDueReview(){
  const due=dueWords();
  if(!due.length){ toast('วันนี้ทบทวนครบแล้ว 🎉'); return; }
  const pick=due.map(w=>({w, r:srsOf(w.sc.id,w.pid)})).sort((a,b)=>a.r.d-b.r.d || a.r.b-b.r.b).slice(0,10).map(x=>x.w);
  RV={list:shuffle(pick), src:[], i:0, ok:0, star:0, due:true};
  markActive(0);
  rvQuestion();
}
function rvWord(){ return RV && RV.list[RV.i]; }
function rvQuestion(){
  const w=rvWord(); if(!w){ rvDone(); return; }
  RV.lvl=0; RV.used=false; RV.miss=false; RV.answered=false;
  const dict=listStyle(w.sc);   // word sheet: like the teacher's dictation
  openModal(m=>{
    m.classList.add('rvbox');
    const n=RV.list.length;
    const bar=el('span',{class:'bar'},el('i')); bar.firstChild.style.width=(RV.i/n*100)+'%';
    const inp=el('input',{id:'rvIn',autocomplete:'off',autocapitalize:'none',autocorrect:'off',spellcheck:'false',enterkeyhint:'done',placeholder:`พิมพ์เป็นภาษา${LANGS[S.lang].name}…`,'aria-label':'คำตอบ'});
    const form=el('form',{class:'rv-row',autocomplete:'off'}, inp, el('button',{class:'primary',type:'submit',text:'ตรวจ'}));
    form.addEventListener('submit',e=>{ e.preventDefault(); rvCheck(inp.value); });
    m.append(
      el('div',{class:'rv-top'}, el('h3',{text:RV.mock?'📝 สอบจำลอง':RV.due?'🔁 ทบทวนตามรอบ':dict?'📝 เขียนตามคำบอก':'ทบทวนคำศัพท์'}), el('span',{class:'rv-n',text:`${RV.i+1}/${n}`}),
        el('button',{class:'x',type:'button','aria-label':'ปิด',text:'✕',onclick:closeModal})),
      bar,
      el('div',{class:'rv-pic'}, wordThumb(w.sc,w.it,'rv-thumb',true)),
      dict==='listen' ? el('p',{class:'rv-q'}, el('b',{text:'ฟังแล้วเขียนคำที่ได้ยิน'}),' ',el('button',{type:'button',class:'rv-play','aria-label':'ฟังอีกครั้ง',onclick:()=>{ speak(sayWord(w.it)); $('#rvIn').focus(); }}, ic('volume_up')))
      : el('p',{class:'rv-q'}, el('b',{text:'นี่คืออะไร?'}),' ',el('span',{class:'en',text:'What is this?'})),
      el('div',{class:'clue',id:'rvClue',hidden:''}),
      form,
      el('div',{class:'rv-tools'},
        el('button',{type:'button',text:'💡 คำใบ้',onclick:rvHint}),
        dict==='listen' ? null : el('button',{type:'button',text:'🔊 ฟัง',onclick:()=>{ RV.used=true; speak(sayWord(w.it)); $('#rvIn').focus(); }}),
        el('button',{type:'button',text:'ดูเฉลย',onclick:rvShow}),
        el('button',{type:'button',class:'rv-skip',text:'ข้าม ›',onclick:rvNext})),
      el('div',{class:'msg',id:'rvMsg'}),
      el('p',{class:'rv-from',text:'จากฉาก: '+w.sc.name}));
  });
  if(dict==='listen') setTimeout(()=>{ if(rvWord()===w) speak(sayWord(w.it)); }, 350);
  G.modalClose=()=>{ RV=null; try{ speechSynthesis.cancel(); }catch(e){} if(S.view==='words') updateWords(); else if(S.view==='home') renderHome(); };
}
function rvMsg(kind,text){ const m=$('#rvMsg'); if(!m) return; m.className='msg'+(kind?' '+kind:''); m.textContent=text; }
function rvHint(){
  const w=rvWord(); if(!w || RV.answered) return;
  const max=normFor(w.it.word,w.it).length;
  if(RV.lvl>=max){ rvMsg('info','เปิดคำใบ้หมดแล้ว ลองพิมพ์ดูนะ'); return; }
  RV.lvl++; RV.used=true;
  const c=$('#rvClue'); c.innerHTML=''; c.hidden=false;
  if(mean(w.it)) c.append(el('div',{class:'th',text:'ความหมาย: '+mean(w.it)}));
  c.append(el('div',{class:'pat',text:pattern(w.it.word, RV.lvl-1)}));
  rvMsg('',''); $('#rvIn').focus();
}
function rvShow(){
  const w=rvWord(); if(!w || RV.answered) return;
  RV.used=true; rvMsg('info','เฉลย: '+w.it.word+' — ลองพิมพ์ตามเพื่อจำนะ'); speak(sayWord(w.it));
  const i=$('#rvIn'); i.value=''; i.focus();
}
function rvCheck(v){
  const w=rvWord(); if(!w || RV.answered || !String(v).trim()) return;
  const res=check(v,w.it);
  if(res.ok){
    RV.answered=true;
    if(!progress[w.sc.id]) progress[w.sc.id]={done:{},star:{}};
    const p=progress[w.sc.id]; p.done=p.done||{}; p.star=p.star||{};
    const clean=!RV.used && !RV.miss && res.art!=='missing';
    srsAnswer(p, w.sc.id, w.pid, clean); if(clean) p.star[w.pid]=true; saveProg(); markActive(1);
    RV.ok++; if(clean) RV.star++;
    rvMsg('ok',(clean?'ถูกต้อง! เก่งมาก ★ ':'ถูกต้อง! ✓ ')+w.it.word+artNote(res));
    speak(sayWord(w.it));
    const at=RV.i, run=RV; setTimeout(()=>{ if(RV===run && RV.i===at) rvNext(); }, 1300);
    return;
  }
  RV.miss=true;
  if(res.art==='wrong') rvMsg('bad',`คำถูกแล้ว แต่ไม่ใช่ “${res.said}” — ลองเปลี่ยน der/die/das หรือพิมพ์แค่คำนาม`);
  else {
    const goal=w.it.base||w.it.word, d=lev(normFor(String(v).replace(/^(der|die|das)\s+/i,''),w.it), normFor(goal,w.it));
    rvMsg('bad', d<=2 && normFor(goal,w.it).length>3 ? 'เกือบถูกแล้ว! ลองเช็คตัวสะกดอีกนิด' : 'ยังไม่ใช่ ลองอีกครั้ง หรือกด 💡 คำใบ้');
  }
  const box=$('#mbox'); box.classList.remove('shake'); void box.offsetWidth; box.classList.add('shake');
}
function rvNext(){ if(!RV) return; RV.i++; rvQuestion(); }
function rvDone(){
  const r=RV, n=r.list.length;
  if(r.due){
    const left=dueWords().length, tmr=dueOn(dayNo()+1);
    openModal(m=>{
      m.classList.add('rvbox');
      m.append(el('div',{class:'rv-end'},
        el('div',{class:'big',text: left ? (r.ok===n?'🎉':'👍') : '🏆'}),
        el('h3',{text: left ? 'ทบทวนชุดนี้เสร็จแล้ว' : 'ทบทวนครบสำหรับวันนี้แล้ว!'}),
        el('p',{text:`ตอบถูก ${r.ok}/${n} คำ`+(r.star?` · ★ ${r.star} คำไม่ใช้ตัวช่วย`:'')}),
        el('p',{class:'rv-next',text: left ? `ยังเหลือคำที่ถึงรอบวันนี้อีก ${left} คำ` : (tmr ? `พรุ่งนี้มีคำให้ทบทวน ${tmr} คำ — มาต่อ 🔥 กันนะ` : 'คำที่ตอบถูกจะกลับมาให้ทบทวนในอีกไม่กี่วัน')}),
        el('div',{class:'row'},
          el('button',{text:'ปิด',onclick:closeModal}),
          left ? el('button',{class:'primary',text:`🔁 ทบทวนต่อ (${Math.min(10,left)} คำ)`,onclick:startDueReview}) : null)));
    });
    G.modalClose=()=>{ RV=null; if(S.view==='words') updateWords(); else if(S.view==='home') renderHome(); };
    return;
  }
  openModal(m=>{
    m.classList.add('rvbox');
    m.append(el('div',{class:'rv-end'},
      el('div',{class:'big',text: r.ok===n ? '🎉' : r.ok ? '👍' : '💪'}),
      el('h3',{text:'ทบทวนเสร็จแล้ว'}),
      el('p',{text:`ตอบถูก ${r.ok}/${n} คำ`+(r.star?` · ★ ${r.star} คำไม่ใช้ตัวช่วย`:'')}),
      el('div',{class:'row'},
        el('button',{text:'ปิด',onclick:closeModal}),
        el('button',{class:'primary',text:'✍️ ทบทวนอีกชุด',onclick:()=>{
          const keys=new Set(r.src), list=allWords().filter(w=>keys.has(w.sc.id+'\u0000'+w.id));
          if(list.length) startReview(list); else closeModal();
        }}))));
  });
  G.modalClose=()=>{ RV=null; if(S.view==='words') updateWords(); else if(S.view==='home') renderHome(); };
}
// Word sheet while learning: each card shows the English word big with the Thai meaning under it.
// Drawn over the picture (which has only the Thai meaning), so tests and review rounds still hide the answer.
let cardMeasure=null;
function fitFont(text, weight, family, max, min, room){
  cardMeasure=cardMeasure || document.createElement('canvas').getContext('2d');
  let fs=max; for(;;){ cardMeasure.font=`${weight} ${fs}px ${family}`; if(cardMeasure.measureText(text).width<=room || fs<=min) break; fs-=2; }
  return {fs, fit:cardMeasure.measureText(text).width>room};
}
function listCards(sc, list){
  const g=document.createElementNS(NS,'g'); g.setAttribute('class','lcards'); g.setAttribute('pointer-events','none');
  const put=(tag,attrs,text)=>{ const e=document.createElementNS(NS,tag); Object.entries(attrs).forEach(([k,v])=>e.setAttribute(k,v)); if(text!=null) e.textContent=text; g.appendChild(e); return e; };
  for(const it of list){ if(!it || !it.word || it.w==null) continue;
    const x=it.x+76, y=it.y+5, w=it.w-82, h=it.h-10, cx=x+w/2, room=w-28, th=mean(it);
    put('rect',{x,y,width:w,height:h,rx:14,fill:'#fff'});
    const en=fitFont(it.word,600,'Fredoka',52,22,room);
    const t=put('text',{x:cx,y:th ? y+h*0.38 : y+h/2+2,'text-anchor':'middle','dominant-baseline':'central','font-family':'Fredoka, Sarabun, sans-serif','font-weight':600,'font-size':en.fs,fill:'#2d2a5a'},it.word);
    if(en.fit){ t.setAttribute('textLength',room); t.setAttribute('lengthAdjust','spacingAndGlyphs'); }
    if(th){
      const tf=fitFont(th,600,'Sarabun',32,20,room); let tt=th;
      if(tf.fit){ while(tt.length>2){ cardMeasure.font=`600 ${tf.fs}px Sarabun`; if(cardMeasure.measureText(tt+'…').width<=room) break; tt=tt.slice(0,-1); } tt+='…'; }
      put('text',{x:cx,y:y+h*0.77,'text-anchor':'middle','dominant-baseline':'central','font-family':'Sarabun, sans-serif','font-weight':600,'font-size':tf.fs,fill:'#8a84a3'},tt);
    }
  }
  return g;
}
function previewSvg(sc, showLabels){
  const s=document.createElementNS(NS,'svg');
  s.setAttribute('viewBox',`0 0 ${sc.w} ${sc.h}`);
  const im=document.createElementNS(NS,'image');
  im.setAttribute('href',sceneImg(sc)); im.setAttribute('width',sc.w); im.setAttribute('height',sc.h); im.setAttribute('preserveAspectRatio','none');
  s.appendChild(im);
  if(!showLabels) return s;
  if(isList(sc)){ s.appendChild(listCards(sc, Object.values(itemsOf(sc)))); return s; }
  const fs=Math.max(sc.w,sc.h)*(sc.w>=sc.h?0.016:0.025);
  for(const it of Object.values(itemsOf(sc))){ if(!it.word) continue;
    let x,y;
    if(it.at){ x=it.at[0]; y=it.at[1]; }
    else {
      x=it.x+it.w/2; y=it.y+fs*0.9;
      const r=document.createElementNS(NS,'rect');
      Object.entries({x:it.x,y:it.y,width:it.w,height:it.h,rx:Math.min(it.w,it.h)*0.08,fill:'none',stroke:'#ffc928','stroke-width':Math.max(2,fs*0.16)}).forEach(([k,v])=>r.setAttribute(k,v));
      s.appendChild(r);
    }
    const w=it.word.length*fs*0.56+fs*1.1, h=fs*1.55;
    x=Math.max(w/2+2, Math.min(sc.w-w/2-2, x)); y=Math.max(h/2+2, Math.min(sc.h-h/2-2, y));
    const bg=document.createElementNS(NS,'rect');
    Object.entries({x:x-w/2,y:y-h/2,width:w,height:h,rx:h*0.3,fill:'#fff','fill-opacity':.94,stroke:'#2d2a5a','stroke-opacity':.15}).forEach(([k,v])=>bg.setAttribute(k,v));
    const t=document.createElementNS(NS,'text');
    Object.entries({x,y,'text-anchor':'middle','dominant-baseline':'central','font-size':fs,fill:'#2d2a5a',class:'pvl'}).forEach(([k,v])=>t.setAttribute(k,v));
    t.textContent=it.word;
    s.append(bg,t);
  }
  return s;
}
function openPreview(id){
  const sc=scenes().find(x=>x.id===id); if(!sc) return;
  let showLabels=true;
  openModal(m=>{
    m.classList.add('wide');
    const {n,d}=progOf(sc);
    const fig=el('div',{class:'pv-fig'}); fig.append(previewSvg(sc,showLabels));
    const lbl=el('button',{class:'toggle on',text:'🏷 ซ่อนป้ายคำศัพท์'});
    lbl.addEventListener('click',()=>{ showLabels=!showLabels; fig.innerHTML=''; fig.append(previewSvg(sc,showLabels)); lbl.classList.toggle('on',showLabels); lbl.textContent=showLabels?'🏷 ซ่อนป้ายคำศัพท์':'🏷 แสดงป้ายคำศัพท์'; });
    const mode=(md,label)=>el('button',{class:'modebtn'+(md==='learn'?' primary':''),text:label,onclick:()=>{ closeModal(); openScene(sc.id, md); }});
    m.append(
      el('div',{class:'pv-head'},
        el('div',{}, el('h3',{text:sc.name}), el('div',{class:'meta',text: n ? `${n} คำศัพท์ • ทบทวนแล้ว ${d}/${n}` : 'ยังไม่มีคำศัพท์ในฉากนี้'}),
          isList(sc) && sc.meta.exam ? el('div',{class:'meta exam'}, ic('event'), new Date(sc.meta.exam+'T12:00:00').toLocaleDateString(LOC,{weekday:'short',day:'numeric',month:'short'}), examIn(sc)>=0 ? ' · '+examLabel(examIn(sc)) : '') : null),
        el('button',{class:'x','aria-label':'ปิด',text:'✕',onclick:closeModal})),
      fig,
      n && isList(sc) ? el('div',{class:'pv-row'}, el('button',{class:'modebtn primary',onclick:()=>{ closeModal(); startReview(allWords().filter(w=>w.sc===sc), true); }}, `📝 สอบจำลองทั้งชุด (${n} คำ)`)) : null,
      n ? el('div',{class:'pv-row'}, mode('learn','👀 ดูคำศัพท์'), mode('quiz','✍️ ทบทวน (พิมพ์)'), mode('find','👂 ฟังแล้วหา'), mode('speak','🎤 ฝึกพูด'))
        : el('div',{class:'pv-row'}, el('button',{class:'modebtn primary',text: G.aiReady?'✨ ให้ AI หาคำศัพท์ / ✏️ แก้ไขฉาก':'✏️ เริ่มใส่คำศัพท์',onclick:()=>{ closeModal(); openScene(sc.id,'learn',true); }})),
      el('div',{class:'pv-row'},
        n ? lbl : null,
        el('span',{class:'sp'}),
        (sc.builtin || !n) ? null : el('button',{text:'🔗 แชร์',onclick:()=>{ closeModal(); openShare({kind:'scene',sc}); }}),
        isList(sc) ? el('button',{text:'✏️ แก้ไขรายการคำ',onclick:()=>{ closeModal(); openSheetMaker(sc); }}) : null,
        ADM.ok && galEditOf(sc.id) ? el('button',{class:'primary',text:'⬆️ อัปเดตในคลังภาพ',onclick:()=>{ closeModal(); galPushEdit(sc.id, true); }}) : null,
        sc.builtin || isList(sc) ? null : el('button',{text:'✏️ แก้ไขฉาก',onclick:()=>{ closeModal(); openScene(sc.id,'learn',true); }}),
        sc.builtin || isList(sc) ? null : el('button',{text:'📝 เปลี่ยนชื่อ',onclick:()=>{ closeModal(); S.sceneId=sc.id; $('#renameBtn').click(); }}),
        sc.builtin ? null : el('button',{class:'danger',text:'🗑 ลบ',onclick:()=>{ closeModal(); S.sceneId=sc.id; deleteScene(); }}))
    );
  });
}

export { deckCount, deckList, deckName, deckNameDialog, deckSig, dsig, getDeck, isKept, listCards, liveKeys, newDeck, openDeckPicker, openPreview, renderWords, SAVED_DECK, saveDecks, savedHas, sceneWord, startDueReview, startReview, toggleWord, wkey };
