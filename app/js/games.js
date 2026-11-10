// Piccab — Practice games: quiz (typing), find (listen & tap), speaking.
import { G, $, artNote, box, check, el, foldDe, ids, items, LANGS, lev, mean, normFor, pk, progress, qcard, S, scene, shuffle, speak, store, toast } from './core.js';
import { prog, progRaw, saveProg, srsAnswer } from './progress.js';
import { accentKey, ask, closeModal, doFlash, openModal, refresh, renderChips, renderSub, sayOf, setHL, updateOverlay } from './scene.js';
import { markActive, wordEl } from './home.js';
import { deckList, savedHas, toggleWord, wkey } from './decks.js';
import { listStyle } from './sheets.js';

// ---------- quiz ----------
function openQuiz(id){
  G.quizId=id; G.pinnedId=null; qcard.hidden=false;
  if(listStyle(scene())==='listen') setTimeout(()=>{ if(G.quizId===id) speak(sayOf(id)); }, 200);
  $('#qin').value=''; setMsg('',''); renderClue(); qKeepBtn();
  setHL(); renderChips(); positionQ();
  setTimeout(()=>{ try{ $('#qin').focus({preventScroll:true}); }catch(e){ $('#qin').focus(); } }, 30);
}
function closeQuiz(silent){ G.quizId=null; qcard.hidden=true; if(!silent){ setHL(); renderChips(); } }
function positionQ(){
  if(!G.quizId || window.innerWidth<=640) return;
  const b=box(G.quizId); if(!b) return;
  const cw=qcard.offsetWidth, ch=qcard.offsetHeight, W=b.W, H=b.H;
  let x=b.r+14, y=b.cy-ch/2;
  if(x+cw>W-6){ x=b.l-14-cw; }
  if(x<6){ x=Math.max(6,Math.min(W-cw-6,b.cx-cw/2)); y = b.t-ch-12 > 6 ? b.t-ch-12 : b.b+12; }
  y=Math.max(6, Math.min(H-ch-6, y));
  qcard.style.left=x+'px'; qcard.style.top=y+'px';
}
function pattern(word,n){ let k=0; return [...word].map(c=>/[\p{L}\p{N}]/u.test(c)?(k++<n?c:'_'):(c===' '?' ':c)).join(' '); }
function renderClue(){
  const c=$('#qclue'); c.innerHTML='';
  const it=items()[G.quizId], lvl=G.help[G.quizId]||0;
  if(lvl<1){ c.hidden=true; return; }
  c.hidden=false;
  if(mean(it)) c.append(el('div',{class:'th',text:'ความหมาย: '+mean(it)}));
  c.append(el('div',{class:'pat',text:pattern(it.word, lvl-1)}));
}
function setMsg(kind,text){ const m=$('#qmsg'); m.className='msg'+(kind?' '+kind:''); m.textContent=text; }
function shakeCard(){ qcard.classList.remove('shake'); void qcard.offsetWidth; qcard.classList.add('shake'); }
$('#qform').addEventListener('submit', e=>{
  e.preventDefault();
  const id=G.quizId; if(!id) return;
  const v=$('#qin').value; if(!v.trim()) return;
  const it=items()[id], res=check(v,it);
  if(res.ok){
    const rp=progRaw(), key=pk(id), clean=!G.used[id] && !G.qMiss[id] && res.art!=='missing';
    srsAnswer(rp, scene().id, key, clean); if(clean) rp.star[key]=true; saveProg(); markActive(1);
    setMsg('ok', (clean?'ถูกต้อง! เก่งมาก ★ ':'ถูกต้อง! ✓ ')+it.word+artNote(res));
    speak(sayOf(id));
    updateOverlay(); renderSub();
    setTimeout(()=>{ if(G.quizId===id){ closeQuiz(); } const pp=prog(); if(ids().every(i=>pp.done[i])) toast('🎉 ทบทวนครบทุกคำแล้ว เก่งมาก!'); }, 1100);
    return;
  }
  G.qMiss[id]=true;
  if(res.art==='wrong'){ setMsg('bad',`คำถูกแล้ว แต่ไม่ใช่ “${res.said}” — ลองเปลี่ยน der/die/das หรือพิมพ์แค่คำนาม`); shakeCard(); return; }
  const other=ids().find(o=>o!==id && check(v,items()[o]).ok);
  const goal=it.base||it.word, d=lev(normFor(v.replace(/^(der|die|das)\s+/i,''),it), normFor(goal,it));
  if(other) setMsg('bad','คำนี้มีในภาพ แต่เป็นของอีกชิ้นนะ ลองดูใหม่');
  else if(d<=2 && normFor(goal,it).length>3) setMsg('bad','เกือบถูกแล้ว! ลองเช็คตัวสะกดอีกนิด');
  else setMsg('bad','ยังไม่ใช่ ลองอีกครั้ง หรือกด 💡 คำใบ้');
  shakeCard();
});
$('#qhint').addEventListener('click',()=>{
  const id=G.quizId; if(!id) return;
  const max=normFor(items()[id].word, items()[id]).length;
  const lvl=G.help[id]||0;
  if(lvl>=max){ setMsg('info','เปิดคำใบ้หมดแล้ว ลองพิมพ์ดูนะ'); return; }
  G.help[id]=lvl+1; G.used[id]=true; renderClue(); setMsg('',''); positionQ(); $('#qin').focus();
});
$('#qsay').addEventListener('click',()=>{ if(!G.quizId) return; if(listStyle(scene())!=='listen') G.used[G.quizId]=true; speak(sayOf(G.quizId)); $('#qin').focus(); });
$('#qshow').addEventListener('click',()=>{
  if(!G.quizId) return; G.used[G.quizId]=true;
  setMsg('info','เฉลย: '+items()[G.quizId].word+' — ลองพิมพ์ตามเพื่อจำนะ'); speak(sayOf(G.quizId)); $('#qin').value=''; $('#qin').focus();
});
$('#qclose').addEventListener('click',()=>closeQuiz());
// 🔖 in the quiz card: keep the word in "🔖 เก็บไว้" without showing the answer
function qKeepBtn(){ const b=$('#qkeep'); if(!b || !G.quizId) return; const on=savedHas(scene().id,G.quizId); b.classList.toggle('on',on); b.textContent=on?'🔖 เก็บแล้ว':'🔖 เก็บ'; }
$('#qkeep').addEventListener('click',()=>{
  if(!G.quizId) return;
  const k=wkey(scene().id,G.quizId), on=!savedHas(scene().id,G.quizId);
  toggleWord(deckList()[0],k,on); qKeepBtn();
  toast(on?'เก็บคำนี้ไว้ใน 🔖 เก็บไว้ แล้ว — ดูได้ที่หน้าคำของฉัน':'เอาคำนี้ออกจาก 🔖 เก็บไว้ แล้ว');
  $('#qin').focus();
});
function resetQuiz(){
  ask('เริ่มทบทวนฉากนี้ใหม่ทั้งหมด? (ล้างเครื่องหมาย ✓ และ ★)','เริ่มใหม่').then(ok=>{
    if(!ok) return; progress[scene().id]={done:{},star:{}}; G.help={}; G.used={}; saveProg(); closeQuiz(); refresh();
  });
}

// ---------- find (listen & tap) ----------
function startFind(){
  G.find={queue:shuffle(ids()),target:null,score:0,total:ids().length,missed:false,showWord:G.find.showWord,lock:false};
  nextFind();
}
function nextFind(){
  if(G.find.target) G.find.last=G.find.target;
  G.find.target=G.find.queue.shift()||null; G.find.missed=false; G.find.lock=false;
  renderSub();
  if(G.find.target) setTimeout(()=>speak(sayOf(G.find.target)), 250);
  else speak('Well done!');
}
function lockNext(ms){ G.find.lock=true; setTimeout(nextFind, ms); }
function findTap(id){
  if(!G.find.target || G.find.lock) return;
  if(id===G.find.target){ if(!G.find.missed) G.find.score++; markActive(1); doFlash(id,'good',1000); renderSub(); lockNext(1000); }
  else { G.find.missed=true; doFlash(id,'bad',1500); }
}

// ---------- 🎤 speaking: say the word, the browser's speech recognition checks it (no AI credits) ----------
// Chrome / Edge send the sound to their own speech service (Google / Microsoft), Safari to Apple's; Piccab never gets it.
var SR=window.SpeechRecognition||window.webkitSpeechRecognition||null;
var spk={queue:[],target:null,score:0,total:0,tries:0,heard:'',state:'idle',result:'',showWord:true,rec:null,last:null};
function spkTarget(){ return spk && S.mode==='speak' && !S.editing ? spk.target : null; }   // (var/function: setHL may run before this part of the script)
function startSpeak(){
  spkStop();
  spk={...spk,queue:shuffle(ids()),target:null,score:0,total:ids().length,tries:0,heard:'',state:'idle',result:''};
  spkNext();
}
function spkNext(){
  if(spk.target) spk.last=spk.target;
  spk.target=spk.queue.shift()||null; spk.tries=0; spk.heard=''; spk.result=''; spk.state='idle';
  if(S.view==='play' && S.mode==='speak'){ renderSub(); renderChips(); setHL(); }
  if(!spk.target) speak('Well done!');
}
function spkPick(id){   // tap a thing in the picture: practise that one now
  if(!items()[id] || spk.state==='listening') return;
  if(spk.target && spk.target!==id) spk.queue=[spk.target, ...spk.queue.filter(x=>x!==id)]; else spk.queue=spk.queue.filter(x=>x!==id);
  spk.target=id; spk.tries=0; spk.heard=''; spk.result=''; spk.state='idle';
  if(!spk.total) spk.total=ids().length;
  renderSub(); renderChips(); setHL(); speak(sayOf(id));
}
function spkStop(){ const r=spk.rec; spk.rec=null; if(r){ try{ r.onresult=r.onerror=r.onend=null; r.abort(); }catch(e){} } if(spk.state==='listening') spk.state='idle'; }
// words to compare: lower case, no punctuation, German letters folded, no leading article
function spkNorm(t){
  let s=String(t||'').toLowerCase().replace(/[.,!?;:"“”'’()]/g,' ').replace(/\s+/g,' ').trim();
  if(S.lang==='de') s=foldDe(s);
  return s;
}
const SPK_ART={ en:/^(a|an|the) /, de:/^(der|die|das|ein|eine|einen|den|dem) / };
// {ok, art:'right'|'wrong'|'missing', said} for the best of the recogniser's guesses
function spkCheck(alts, it){
  const art=it.art||'', targets=[it.base||it.word, ...(it.alts||[])].map(spkNorm).filter(Boolean);
  const bare=x=>x.replace(SPK_ART[S.lang]||/^$/,'');
  const glue=x=>x.replace(/ /g,'');
  let best=null;
  for(const a of alts){
    const said=spkNorm(a);
    for(const t of targets){
      const hit = said===t || bare(said)===t || glue(bare(said))===glue(t) || (' '+said+' ').includes(' '+t+' ');
      if(!hit) continue;
      let ar='missing';
      if(S.lang==='de' && art){ const m=/^(der|die|das)\s/.exec(said); ar = m ? (m[1]===art ? 'right' : 'wrong') : 'missing'; }
      const r={ok:true, art:ar, said:a};
      if(!best || (ar==='right' && best.art!=='right')) best=r;
    }
  }
  return best || {ok:false, said:alts[0]||''};
}
function spkLang(){ return S.lang==='en' ? (store.get(accentKey(), 'en-GB')||'en-GB') : (LANGS[S.lang].voices[0][0]); }
function spkListen(){
  if(!SR || !spk.target) return;
  if(spk.state==='listening'){ try{ spk.rec && spk.rec.stop(); }catch(e){} return; }
  if(!store.get('pv-mic-ok',false)){ spkIntro(); return; }
  try{ speechSynthesis.cancel(); }catch(e){}
  const it=items()[spk.target]; if(!it) return;
  const rec=new SR(); spk.rec=rec;
  rec.lang=spkLang(); rec.interimResults=true; rec.maxAlternatives=5; rec.continuous=false;
  let finalAlts=null, gotAny=false;
  rec.onresult=e=>{
    const r=e.results[e.results.length-1]; gotAny=true;
    spk.heard=r[0] ? r[0].transcript : '';
    if(r.isFinal){ finalAlts=[...r].map(x=>x.transcript); }
    renderSub();
  };
  rec.onerror=e=>{
    spk.rec=null; spk.state='idle';
    const msg={ 'not-allowed':'อนุญาตให้ใช้ไมโครโฟนก่อน (กดที่ไอคอนข้างช่องที่อยู่เว็บ)', 'service-not-allowed':'อนุญาตให้ใช้ไมโครโฟนก่อน (กดที่ไอคอนข้างช่องที่อยู่เว็บ)',
      'no-speech':'ไม่ได้ยินเสียง ลองพูดใกล้ไมค์อีกครั้ง', 'audio-capture':'ไม่พบไมโครโฟนในเครื่องนี้', 'network':'ต้องต่ออินเทอร์เน็ตเพื่อฟังเสียง',
      'language-not-supported':`เบราว์เซอร์นี้ยังฟังภาษา${LANGS[S.lang].name}ไม่ได้` }[e.error];
    if(msg) toast(msg, 4000);
    renderSub();
  };
  rec.onend=()=>{
    if(spk.rec!==rec) return;
    spk.rec=null;
    const alts=finalAlts || (spk.heard ? [spk.heard] : null);
    if(!alts){ spk.state='idle'; if(!gotAny) spk.result='nothing'; renderSub(); return; }
    spkJudge(alts);
  };
  spk.state='listening'; spk.heard=''; spk.result=''; renderSub();
  try{ rec.start(); }catch(e){ spk.rec=null; spk.state='idle'; renderSub(); }
}
function spkJudge(alts){
  const id=spk.target, it=items()[id]; if(!it) return;
  const r=spkCheck(alts, it);
  spk.heard=r.said; spk.tries++;
  if(r.ok){
    if(spk.tries===1) spk.score++;
    const clean=spkSave(id, it, r);
    spk.result = r.art==='wrong' ? 'okart' : !clean ? 'ok' : (S.lang==='de' && it.art) ? 'okstar' : 'okclean';
    spk.state='done'; markActive(1); doFlash(id,'good',1400); updateOverlay(); renderChips(); renderSub();
    setTimeout(()=>{ if(spk.target===id && S.mode==='speak') spkNext(); }, r.art==='wrong' ? 2600 : 1500);
  } else {
    spk.result='no'; spk.state='idle'; renderSub();
    if(spk.tries>=2) speak(sayOf(id));     // second miss: say it for them to copy
  }
}
// Saying a word right counts like typing it in ✍️ Review: the word is passed and comes back for spaced review.
// Clean (★, next review further away) = word hidden, right on the first try, and in German with the right der/die/das.
// With the word showing it is reading aloud: a new word still counts as passed, a passed word keeps its review plan.
function spkSave(id, it, r){
  const rp=progRaw(), key=pk(id), had=!!rp.done[key];
  const clean=!spk.showWord && spk.tries===1 && r.art!=='wrong' && !(S.lang==='de' && it.art && r.art!=='right');
  if(spk.showWord){ if(had) return false; srsAnswer(rp, scene().id, key, false); }
  else { srsAnswer(rp, scene().id, key, clean); if(clean) rp.star[key]=true; }
  saveProg();
  const pp=prog(); if(ids().every(i=>pp.done[i])) setTimeout(()=>toast('🎉 ผ่านครบทุกคำในฉากนี้แล้ว!'), 900);
  return clean;
}
function spkIntro(){
  openModal(m=>{
    m.append(el('h3',{text:'🎤 ฝึกพูด'}),
      el('p',{text:'แตะ 🎤 แล้วพูดคำศัพท์ของสิ่งที่ไฮไลต์ไว้ แอปจะฟังแล้วบอกว่าตรงกับคำไหม'}),
      el('p',{class:'note'}, 'เสียงของคุณจะถูกส่งไปให้ระบบฟังเสียงของเบราว์เซอร์แปลงเป็นข้อความ (เช่น Google ใน Chrome หรือ Apple ใน Safari) — Piccab ไม่ได้รับและไม่เก็บเสียงของคุณ · ไม่ใช้เครดิต AI', ' · ', el('a',{href:'/privacy#speak',target:'_blank',rel:'noopener',text:'อ่านเพิ่ม'})),
      el('p',{class:'note small',text:'ครั้งแรกเบราว์เซอร์จะถามสิทธิ์ใช้ไมโครโฟน ให้กด “อนุญาต”'}),
      el('div',{class:'row'}, el('span',{class:'sp'}), el('button',{text:'ยกเลิก',onclick:closeModal}),
        el('button',{class:'primary',text:'🎤 เริ่มพูด',onclick:()=>{ store.set('pv-mic-ok',true); closeModal(); spkListen(); }})));
  });
}
function renderSpeakSub(put){
  if(!SR){
    put(el('span',{class:'hint',text:'🎤 เบราว์เซอร์นี้ยังฟังเสียงไม่ได้ — ลองเปิดด้วย Chrome (Android / คอมพิวเตอร์) หรือ Safari (iPhone / iPad)'}));
    return;
  }
  if(!spk.target){
    if(!spk.total){ put(el('span',{class:'hint',text:'ฉากนี้ยังไม่มีคำศัพท์'})); return; }
    put(el('span',{class:'hint',text:`🎉 จบรอบแล้ว! พูดถูกตั้งแต่ครั้งแรก ${spk.score}/${spk.total} คำ`}), el('span',{class:'grow'}),
      el('button',{class:'primary',text:'เล่นอีกรอบ',onclick:startSpeak}));
    return;
  }
  const it=items()[spk.target], listening=spk.state==='listening';
  const mic=el('button',{class:'primary big mic'+(listening?' on':''),text:listening?'🔴 กำลังฟัง… (แตะเพื่อหยุด)':'🎤 พูด',onclick:spkListen,disabled:spk.state==='done'?'':null});
  const word = spk.showWord ? el('span',{class:'target'}, wordEl(it)) : el('span',{class:'target hidden',text:'?'});
  let msg=null;
  if(listening) msg=el('span',{class:'spkheard',text: spk.heard ? `“${spk.heard}”` : 'พูดได้เลย…'});
  else if(spk.result==='ok') msg=el('span',{class:'spkres ok',text:`✓ ถูกต้อง! ได้ยินว่า “${spk.heard}”`});
  else if(spk.result==='okclean') msg=el('span',{class:'spkres ok',text:`★ ถูกต้อง! ได้ยินว่า “${spk.heard}”`});
  else if(spk.result==='okstar') msg=el('span',{class:'spkres ok',text:`★ ถูกต้อง พร้อม ${it.art}! ได้ยินว่า “${spk.heard}”`});
  else if(spk.result==='okart') msg=el('span',{class:'spkres ok',text:`✓ คำถูก แต่คำนำหน้าคือ “${it.art}” — ${it.word}`});
  else if(spk.result==='no') msg=el('span',{class:'spkres no',text: spk.tries>=2 ? `ได้ยินว่า “${spk.heard}” — ฟังแล้วลองพูดตามอีกครั้ง` : `ได้ยินว่า “${spk.heard}” — ลองอีกครั้ง หรือกด 🔊 ฟังก่อน`});
  else if(spk.result==='nothing') msg=el('span',{class:'spkres no',text:'ไม่ได้ยินเสียง ลองพูดใกล้ไมค์อีกครั้ง'});
  else msg=el('span',{class:'hint tip',text: spk.showWord ? 'พูดคำของสิ่งที่ไฮไลต์ไว้ · ซ่อนคำแล้วพูดถูกจะได้ ★' : S.lang==='de' ? 'พูดคำของสิ่งที่ไฮไลต์ไว้ (พูด der/die/das ด้วยจะได้ ★)' : 'พูดคำของสิ่งที่ไฮไลต์ไว้'});
  put(mic,
    el('button',{text:'🔊','aria-label':'ฟังคำ',title:'ฟังคำ',onclick:()=>speak(sayOf(spk.target))}),
    word, msg, el('span',{class:'grow'}),
    el('button',{class:'toggle'+(spk.showWord?' on':''),text:spk.showWord?'🙈 ซ่อนคำ':'👁 แสดงคำ',onclick:()=>{ spk.showWord=!spk.showWord; renderSub(); }}),
    el('button',{text:'ข้าม ⏭',onclick:()=>{ spkStop(); spkNext(); }}),
    el('span',{class:'pill',text:`ถูก ${spk.score} • เหลือ ${spk.queue.length+1}/${spk.total}`}));
}

export { closeQuiz, findTap, lockNext, openQuiz, pattern, positionQ, renderSpeakSub, resetQuiz, spk, spkPick, spkStop, spkTarget, startFind, startSpeak };
