// Piccab — 📝 paper spelling tests, checked from photos — for a class or family group, or for a typed list of names
// (people who don't use the app: they get a score, nothing goes to any account).
// 1. The teacher prints one sheet per student (📝 แผ่นสอบ → choose the class): the student's name is printed on it, and
//    each page has a QR code "PCB1.<test>.<student>.<page>", so the app knows whose sheet a photo is, and its order.
// 2. The teacher photographs the sheets; the app reads the QR on the phone, and AI copies what the child wrote.
//    📷 The photo of each checked page is kept as evidence (only the teacher sees it; Free 300 sheets for 6 months,
//    Pro 5,000 for a year — supabase/2026-11-test-photos.sql), unless the teacher turns that off.
// 3. The teacher checks each answer next to a picture of the handwriting, changes what AI misread, and saves.
// 4. The class gets scores per student and the words most students got wrong.
// 5. Each student gets the words they got wrong as a word set to practise; their score goes in their learning report.
import { G, el, ic, LOC, S, scenes, store, tally, toast } from './core.js';
import { ask, closeModal, openModal } from './scene.js';
import { allWords, renderGallery, sceneTime } from './home.js';
import { openPreview } from './decks.js';
import { loadImg, makeCards, printNow } from './cards.js';
import { openTestSheet, pageRanges, testPages, TS } from './testsheet.js';
import { isList, openSheetMaker, saveWordSheet } from './sheets.js';
import { user } from './account.js';
import { CL, classApi, classErr, downloadBlob, renderClass, zipStore } from './classes.js';
import { sendReportSoon } from './report.js';
import { accessToken } from './sync.js';

var CT={ checking:false, lists:{}, fullSaid:false };   // lists: the tests shown per class ('_names': typed names), shown at once while they reload
const QR_PREFIX='PCB1';
const normAns=s=>String(s||'').toLowerCase().replace(/[’‘`´]/g,"'").replace(/[^\p{L}\p{N}' -]/gu,'').replace(/\s+/g,' ').trim();
const isRight=(a, w)=>!!normAns(a) && normAns(a)===normAns(w);
const TEST_ERR={ needs_tests_sql:'ต้องรัน SQL 2026-11-class-tests.sql และ 2026-11-test-names.sql ใน Supabase ก่อน', no_students:'ยังไม่มีนักเรียนในห้องนี้', too_many_tests:'มีแผ่นสอบในห้องนี้ครบ 200 ชุดแล้ว — ลบชุดเก่าก่อน',
  too_many_reads:'อ่านรูปของแผ่นสอบนี้ครบจำนวนแล้ว — ตรวจที่เหลือด้วยมือได้', rate_limited:'ส่งรูปถี่เกินไป รอสักครู่แล้วลองใหม่', not_configured:'ตอนนี้ใช้ AI ไม่ได้ — ตรวจด้วยมือได้',
  needs_photos_sql:'ต้องรัน SQL 2026-11-test-photos.sql ใน Supabase ก่อน จึงจะเก็บรูปได้', busy:'AI ไม่ว่าง ลองใหม่อีกครั้ง', invalid_json:'AI อ่านแผ่นนี้ไม่ได้ ลองถ่ายใหม่ให้ชัดขึ้น', refused:'AI อ่านแผ่นนี้ไม่ได้ ลองถ่ายใหม่ให้ชัดขึ้น', image_too_large:'รูปใหญ่เกินไป' };
const testErr=r=>TEST_ERR[r && r.j && r.j.error] || classErr(r);
// /api/tests: the teacher's paper tests
async function testApi(method, path, body){
  const tok=await accessToken();
  const r=await fetch('/api/tests'+path,{ method, headers:{ 'content-type':'application/json', ...(tok?{authorization:'Bearer '+tok}:{}) }, body: body?JSON.stringify(body):undefined });
  return { ok:r.ok, status:r.status, j:await r.json().catch(()=>({})) };
}
// the names a teacher types for a test without a class: one per line
const namesFrom=text=>String(text||'').split(/\r?\n/).map(x=>x.replace(/\s+/g,' ').trim().slice(0,40)).filter(Boolean).slice(0,200);

// ---------- 1. printing: one sheet per student ----------
// the QR code of one page, as an image
async function qrUrl(text){
  const { default: qrcode }=await import('qrcode-generator');
  const qr=qrcode(0,'M'); qr.addData(text); qr.make();
  return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(qr.createSvgTag({ cellSize:4, margin:8, scalable:true }));
}
// Make the test (for a class the server takes the class list; or the typed names) — each person gets their order —
// then the pages: each person's sheet, then one answer page in the word set's order.
// target: {class_id} or {names: [...]}
async function classTestPages(target, sc, cards, o, print=true){
  const seen=new Set(), words=cards.filter(c=>{ const k=c.word.trim().toLowerCase(); if(seen.has(k)) return false; seen.add(k); return true; }).slice(0,60);
  const r=await testApi('POST','',{ ...target, name:sc.name, sc:sc.id, words:words.map(c=>({ w:c.word, th:c.mean||'' })), q:o.q, hint:o.hint, mix:!!o.mix }).catch(()=>({ok:false}));
  if(!r.ok){ toast(testErr(r), 5000); return null; }
  const T=r.j;
  tally('class_test');
  const lk=target.class_id || '_names';   // into the list at once, before it reloads
  CT.lists[lk]=[{ id:T.id, name:T.name, created_at:new Date().toISOString(), total:T.words.length, students:T.roster.length, checked:0, avg:null, names:T.roster.slice(0,30).map(x=>x.n) },
    ...(CT.lists[lk]||[]).filter(x=>x.id!==T.id)];
  return { pages: print ? await sheetPages(T, sc, keyCards(T, words), o) : [], test:T };
}
// the answer key as cards (pictures from the word set when it is on this device; the meaning when not)
const keyCards=(T, cards)=>{ const by=new Map(cards.map(c=>[c.word.trim().toLowerCase(), c])); return T.words.map(w=>by.get(w.w.trim().toLowerCase()) || { word:w.w, mean:w.th, pic:'' }); };
// One sheet for each person on a test (or only places ks), each in their own order with their QR codes, then the answers.
async function sheetPages(T, sc, key, o, ks=null){
  const pages=[], ranges=pageRanges(key.length, o.q), mixed=T.roster.some(st=>st.o.some((v,i)=>v!==i));
  for(const [k, st] of T.roster.entries()){
    if(ks && !ks.includes(k)) continue;
    const qrs=await Promise.all(ranges.map((_,p)=>qrUrl(`${QR_PREFIX}.${T.id}.${k}.${p}`)));
    pages.push(...testPages(sc, st.o.map(i=>key[i]), { ...o, key:false }, { name:st.n, qrs, code:`${T.id} · ${k+1}` }));
  }
  if(o.key) pages.push(...testPages(sc, key, { ...o, key:true }, { keyOnly:true, mixed }));
  return pages;
}
// ✏️ The names on the sheets, as a list the teacher edits before printing: tick who gets a sheet, change the name printed
// (a student with an account stays linked to it — 📱), add people who don't use the app (several lines at once).
// rows: [{n, u?: account id, app?: true, k?: place on a test already made}]
// → {el, people(): the ticked ones [{u?, n, k?}] (text still in the add box is added first), rows()}
function rosterEditor(rows, onChange){
  const R=rows.map(r=>({ ...r, orig:r.n, on:r.on!==false }));
  const box=el('div',{class:'rted'}), list=el('div',{class:'rtlist'}), count=el('span',{class:'note small rtcount'});
  const allChk=el('input',{type:'checkbox','aria-label':'เลือกทั้งหมด'});
  const changed=()=>{ count.textContent=`พิมพ์ ${R.filter(r=>r.on).length}/${R.length} คน`; allChk.checked=R.length>0 && R.every(r=>r.on); if(onChange) onChange(); };
  const draw=()=>{
    list.replaceChildren(...R.map((r,i)=>{
      const c=el('input',{type:'checkbox','aria-label':'พิมพ์ให้คนนี้'}); c.checked=r.on;
      const row=el('div',{class:'rtrow'+(r.on?'':' off')});
      c.addEventListener('change',()=>{ r.on=c.checked; row.classList.toggle('off',!r.on); changed(); });
      const inp=el('input',{class:'rtname',value:r.n,maxlength:'40','aria-label':'ชื่อบนแผ่นสอบ'});
      inp.addEventListener('input',()=>{ r.n=inp.value; changed(); });
      row.append(c, el('span',{class:'rtno',text:String(i+1)}), inp,
        r.app ? el('span',{class:'rtapp',title:'ใช้แอป: ได้คะแนนและคำที่ผิดไปฝึกในแอป',text:'📱'}) : el('span',{class:'rtapp'}),
        r.k==null && !r.u ? el('button',{type:'button',class:'rtdel','aria-label':'เอาชื่อนี้ออก',text:'✕',onclick:()=>{ R.splice(i,1); draw(); changed(); }}) : el('span',{class:'rtdel'}));
      return row;
    }));
    changed();
  };
  allChk.addEventListener('change',()=>{ R.forEach(r=>{ r.on=allChk.checked; }); draw(); });
  const add=el('textarea',{class:'rtadd',rows:'2','aria-label':'เพิ่มชื่อ',placeholder:'เพิ่มชื่อนักเรียนที่ไม่ได้ใช้แอป — บรรทัดละคน (วางทั้งคอลัมน์จาก Excel ได้)'});
  const flush=()=>{ const ns=namesFrom(add.value); if(!ns.length) return false; ns.forEach(n=>R.push({ n, orig:n, on:true })); add.value=''; draw(); return true; };
  box.append(el('div',{class:'rthead'}, el('label',{class:'chk'}, allChk, el('b',{text:'รายชื่อบนแผ่นสอบ'})), count,
      el('span',{class:'note small rtlegend',text:'✏️ แตะชื่อเพื่อแก้ · 📱 = ใช้แอป'})),
    list, el('div',{class:'rtaddrow'}, add, el('button',{type:'button',class:'linkbtn',text:'➕ เพิ่มชื่อ',onclick:()=>{ flush(); }})));
  draw();
  const name=r=>String(r.n||'').replace(/\s+/g,' ').trim().slice(0,40) || r.orig;
  return { el:box, rows:()=>R, flush,
    people:()=>{ flush(); return R.filter(r=>r.on && name(r)).map(r=>({ ...(r.u?{u:r.u}:{}), ...(r.k!=null?{k:r.k}:{}), n:name(r) })); },
    names:()=>R.map(name) };
}
// 🖨️ print a test again — the same QR codes and orders, so the photos still check against it. All, or some people.
// 👥 The names of a test: change them or add people and 💾 save — print later — or 🖨️ print now (all, or the ones ticked).
// The same QR codes and word order, so photos still check against it; places never move.
async function openTestRoster(id){
  const r=await testApi('GET',`/${id}`).catch(()=>({ok:false}));
  if(!r.ok){ toast(testErr(r)); return; }
  const T=r.j, opts=T.opts||{}, q=opts.q||'pic';
  const sc=scenes().find(x=>x.id===opts.sc) || scenes().find(x=>x.name===T.name) || null;
  const cards=sc ? await makeCards(sc, allWords().filter(w=>w.sc===sc)) : [];
  const key=keyCards(T, cards), noPics=(q==='pic' || q==='both') && !key.some(c=>c.pic);
  openModal(m=>{
    m.classList.add('wide');
    const go=el('button',{class:'primary',text:'🖨️ พิมพ์'}), save=el('button',{class:'ctsave',text:'💾 บันทึกรายชื่อ'}), err=el('p',{class:'err'});
    const ros=rosterEditor(T.roster.map((st,k)=>({ k, n:st.n, app:!!st.account })), ()=>{ go.disabled=false; save.disabled=false; });
    const keyChk=el('input',{type:'checkbox'}); keyChk.checked=!!TS.key;
    const busy=(on, b, label)=>{ go.disabled=save.disabled=on; b.textContent=on ? 'กำลังบันทึก…' : label; };
    // names changed or people added → saved to the test (places don't move); new rows get their place
    const store_=async()=>{
      ros.flush();
      const rows=ros.rows(), before=T.roster.length, names=rows.filter(r=>r.k!=null).sort((a,b)=>a.k-b.k).map(r=>String(r.n||'').trim() || r.orig);
      const added=rows.filter(r=>r.k==null && String(r.n||'').trim());
      if(!added.length && !names.some((n,k)=>n!==T.roster[k].n)) return true;
      const x=await testApi('PATCH',`/${T.id}`,{ names, add:added.map(r=>r.n.trim()).join('\n') }).catch(()=>({ok:false}));
      if(!x.ok){ err.textContent=testErr(x); return false; }
      T.roster=x.j.roster; added.forEach((r,i)=>{ r.k=before+i; r.orig=r.n; });
      for(const lk in CT.lists) CT.lists[lk]=CT.lists[lk].map(t=>t.id===T.id ? { ...t, students:T.roster.length, names:T.roster.slice(0,30).map(x=>x.n) } : t);
      return true;
    };
    const after=()=>{ if(CL.test && CL.test.id===T.id) loadClassTest(); else if(S.view==='class') renderClass(); };
    save.addEventListener('click',async()=>{
      err.textContent=''; busy(true, save);
      if(!(await store_())){ busy(false, save, '💾 บันทึกรายชื่อ'); return; }
      closeModal(); toast('บันทึกรายชื่อแล้ว ✓'); after();
    });
    go.addEventListener('click',async()=>{
      err.textContent='';
      if(!ros.people().length && !keyChk.checked){ err.textContent='เลือกอย่างน้อย 1 คน'; return; }
      busy(true, go);
      if(!(await store_())){ busy(false, go, '🖨️ พิมพ์'); return; }
      go.textContent='กำลังเตรียม…';
      const ks=ros.rows().filter(r=>r.on && r.k!=null).map(r=>r.k);
      const pages=await sheetPages(T, sc || { name:T.name }, key, { q, hint:opts.hint||'none', key:keyChk.checked }, ks);
      await printNow(el('div',{id:'printSheet',class:'tsprint'}, ...pages));
      closeModal(); tally('test_sheet'); after();
    });
    m.append(el('h3',{}, '👥 ', el('span',{'data-noi18n':'',text:T.name})),
      el('p',{class:'note small',text:'เพิ่มหรือแก้ชื่อ แล้วบันทึกไว้พิมพ์ทีหลัง หรือพิมพ์เลย — QR และลำดับคำของแต่ละคนเหมือนเดิม ถ่ายรูปตรวจได้ตามปกติ'}),
      noPics ? el('p',{class:'note small warn',text:'ไม่พบชุดคำนี้ในเครื่องนี้ — จะพิมพ์คำแปลแทนรูป'}) : null,
      ros.el, el('label',{class:'chk tskeychk'}, keyChk, el('span',{text:'พิมพ์หน้าเฉลย'})),
      err, el('div',{class:'row'}, el('span',{class:'sp'}), el('button',{text:'ยกเลิก',onclick:closeModal}), save, go));
  });
}

// ---------- the tests of a class (teacher) ----------
// d: the class shown, or null for the tests with typed names (on the classes page)
function testsSection(d){
  const box=el('div',{class:'ctsec'+(d?'':' names')});
  const head=el('div',{class:'hsec'}, el('h3',{text: d ? '📝 แผ่นสอบ' : '📝 แผ่นสอบรายชื่อเอง'}),
    el('button',{class:'linkbtn',text:'➕ เพิ่มแผ่นสอบ',onclick:()=>pickTestSet(d)}));
  const lk=d ? d.id : '_names', body=el('div',{});
  box.append(head, body);
  const show=tests=>{
    body.replaceChildren();
    if(!tests.length){ body.append(el('p',{class:'note small',text: d ? 'พิมพ์แผ่นสอบที่มีชื่อนักเรียนแต่ละคน แล้วถ่ายรูปให้ AI ช่วยตรวจ' : 'สำหรับนักเรียนที่ไม่ได้ใช้แอป: พิมพ์รายชื่อเอง แล้วถ่ายรูปให้ AI ช่วยตรวจ'})); return; }
    const list=el('div',{class:'liblist'});
    tests.forEach(t=>{
      const when=new Date(t.created_at).toLocaleString(LOC,{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
      const row=el('div',{class:'lrow cttest',role:'button',tabindex:'0','aria-label':t.name,onclick:()=>openClassTest(t.id),onkeydown:e=>{ if(e.key==='Enter' || e.key===' '){ e.preventDefault(); openClassTest(t.id); } }},
        el('span',{class:'clic',text:'📝'}),
        el('span',{class:'lb'}, el('b',{'data-noi18n':'',text:t.name}),
          el('span',{class:'lm',text: t.avg!=null ? `${when} · ${t.total} ข้อ · ตรวจแล้ว ${t.checked}/${t.students} คน · เฉลี่ย ${t.avg}%`
            : `${when} · ${t.total} ข้อ · ตรวจแล้ว ${t.checked}/${t.students} คน`}),
          ),   // who it went to: in 👥 Names (a list of 50 would crowd this)
        el('button',{class:'ctprint',title:'รายชื่อบนแผ่นสอบ: เพิ่ม แก้ แล้วบันทึกหรือพิมพ์',onclick:e=>{ e.stopPropagation(); openTestRoster(t.id); }}, '👥 ', el('span',{text:'รายชื่อ'})),
        ic('chevron_right','chev'));
      list.append(row);
    });
    body.append(list);
  };
  if(CT.lists[lk]) show(CT.lists[lk]); else body.append(el('p',{class:'note small',text:'กำลังโหลด…'}));
  testApi('GET', d ? `?class=${d.id}` : '').catch(()=>({ok:false})).then(r=>{
    if(!r.ok){ if(!CT.lists[lk]) body.replaceChildren(el('p',{class:'note small',text: r.j && r.j.error==='needs_tests_sql' ? TEST_ERR.needs_tests_sql : 'โหลดแผ่นสอบไม่สำเร็จ'})); return; }
    CT.lists[lk]=r.j.tests;
    show(r.j.tests);
  });
  return box;
}
// ➕ choose the word set (or scene) to test, then the usual 📝 test sheet screen with this class chosen
// ➕ choose the word set to test (the word sets made in 🎓 ชุดคำศัพท์), then the usual 📝 test sheet screen with this
// class chosen. Another set: make one here (typed or scanned) and carry on with it — or use a picture scene.
function pickTestSet(d){
  const cls={ cls: d ? d.id : NAMES }, go=sc=>{ closeModal(); openTestSheet(sc, cls); };
  const words=sc=>Object.values(sc.items||{}).filter(it=>it && it.word).length;
  const sets=scenes().filter(sc=>isList(sc) && words(sc)).sort((a,b)=>sceneTime(b)-sceneTime(a));
  const pics=scenes().filter(sc=>!isList(sc) && words(sc)).sort((a,b)=>sceneTime(b)-sceneTime(a));
  const row=(sc, icon)=>el('button',{class:'lrow',onclick:()=>go(sc)},
    el('span',{class:'clic',text:icon}), el('span',{class:'lb'}, el('b',{'data-noi18n':'',text:sc.name}), el('span',{class:'lm',text:`${words(sc)} คำ`})));
  const make=o=>{ closeModal(); openSheetMaker(null, { ...o, onSaved:sc=>openTestSheet(sc, cls) }); };
  openModal(m=>{
    m.append(el('h3',{text:'📝 เลือกชุดคำที่จะสอบ'}));
    const box=el('div',{class:'liblist ctpick'});
    if(sets.length) sets.slice(0,80).forEach(sc=>box.append(row(sc,'📚')));
    else box.append(el('p',{class:'libempty',text:'ยังไม่มีชุดคำศัพท์ — สร้างใหม่ได้ด้านล่าง'}));
    // 🖼️ a picture scene instead (shown on request, so the list stays the word sets)
    const sceneBox=el('div',{class:'liblist ctpick ctscenes',hidden:''});
    pics.slice(0,80).forEach(sc=>sceneBox.append(row(sc,'🖼️')));
    const more=el('div',{class:'ctmore'},
      el('span',{class:'note small',text:'ต้องการชุดอื่น?'}),
      el('button',{class:'ctnewset',onclick:()=>make({})}, '✏️ ', el('span',{text:'สร้างชุดคำใหม่'})),
      el('button',{class:'ctscanset',onclick:()=>make({ scan:true })}, '📷 ', el('span',{text:'สแกนชีทคำศัพท์'})),
      pics.length ? el('button',{class:'ctpicscenes',onclick:e=>{ sceneBox.hidden=!sceneBox.hidden; e.currentTarget.classList.toggle('on',!sceneBox.hidden); }}, '🖼️ ', el('span',{text:'ใช้ฉากรูปภาพ'})) : null);
    m.append(box, more, sceneBox, el('div',{class:'row'}, el('span',{class:'sp'}), el('button',{text:'ปิด',onclick:closeModal})));
  });
}
const NAMES='__names';   // "for": a typed list of names
function openClassTest(id){ CL.test={ id, data:null }; renderClass(); window.scrollTo(0,0); loadClassTest(); }
async function loadClassTest(){
  const T=CL.test; if(!T) return;
  const r=await testApi('GET',`/${T.id}`).catch(()=>({ok:false}));
  if(CL.test!==T) return;
  T.data = r.ok ? r.j : { error:testErr(r) };
  if(S.view==='class') renderClass();
}
const qCount=t=>t.words.length;
function missRanking(t){
  const n=new Map();
  t.roster.forEach(st=>{ const a=st.result && st.result.answers; if(a) a.forEach((x,i)=>{ if(x && !x.ok) n.set(i,(n.get(i)||0)+1); }); });
  return [...n.entries()].sort((a,b)=>b[1]-a[1]).map(([i,c])=>({ w:t.words[i], n:c }));
}
// d: the class it is in, or null (a test with typed names, opened from the classes page)
function renderClassTest(v, d){
  const T=CL.test;
  v.append(el('div',{class:'clback'}, el('button',{class:'linkbtn',onclick:()=>{ CL.test=null; renderClass(); }}, ic('arrow_back'),
    !d ? 'ห้องเรียนทั้งหมด' : d.kind==='family' ? 'กลับไปที่กลุ่มครอบครัว' : 'กลับไปที่ห้องเรียน')));
  const t=T.data;
  if(!t){ v.append(el('p',{class:'libempty',text:'กำลังโหลด…'})); return; }
  if(t.error){ v.append(el('p',{class:'libempty',text:t.error})); return; }
  const done=t.roster.filter(st=>st.result), avg=done.length ? Math.round(done.reduce((a,st)=>a+st.result.score/st.result.total,0)/done.length*100) : null;
  v.append(el('div',{class:'ghead'}, el('h2',{}, '📝 ', el('span',{'data-noi18n':'',text:t.name})),
    el('p',{text: avg!=null ? `${new Date(t.created_at).toLocaleDateString(LOC,{dateStyle:'medium'})} · ${qCount(t)} ข้อ · ตรวจแล้ว ${done.length}/${t.roster.length} คน · เฉลี่ย ${avg}%`
      : `${new Date(t.created_at).toLocaleDateString(LOC,{dateStyle:'medium'})} · ${qCount(t)} ข้อ · ตรวจแล้ว ${done.length}/${t.roster.length} คน`})));
  const file=el('input',{type:'file',accept:'image/*',multiple:'',hidden:'',class:'ctfile'});
  file.addEventListener('change',()=>{ const fs=[...file.files]; file.value=''; if(fs.length) checkPhotos(t, fs); });
  v.append(file, el('div',{class:'ctact'},
    el('button',{class:'primary ctphoto',onclick:()=>file.click()}, ic('photo_camera'), 'ตรวจจากรูปถ่าย'),
    el('button',{class:'ctprint',onclick:()=>openTestRoster(t.id)}, '👥 ', el('span',{text:'รายชื่อ / พิมพ์'})),
    el('button',{class:'danger ctdel',text:'🗑 ลบ',onclick:async()=>{
      if(!(await ask(`ลบแผ่นสอบ “${t.name}” และคะแนนทั้งหมด?`,'ลบ'))) return;
      const r=await testApi('DELETE',`/${t.id}`).catch(()=>({ok:false})); if(!r.ok){ toast(testErr(r)); return; }
      for(const lk in CT.lists) CT.lists[lk]=CT.lists[lk].filter(x=>x.id!==t.id);
      CL.test=null; toast('ลบแล้ว'); renderClass(); }})),
    el('p',{class:'note small',text: t.photos ? 'ถ่ายทีละแผ่นให้เห็นทั้งหน้าและ QR ที่มุมขวาบน เลือกหลายรูปพร้อมกันได้ · AI อ่านคำตอบ แล้วคุณตรวจทานก่อนบันทึก'
      : 'ถ่ายทีละแผ่นให้เห็นทั้งหน้าและ QR ที่มุมขวาบน เลือกหลายรูปพร้อมกันได้ · AI อ่านคำตอบ แล้วคุณตรวจทานก่อนบันทึก · รูปไม่ถูกเก็บไว้'}));
  if(t.photos) v.append(photosBox(t));
  // scores
  v.append(el('h3',{class:'psub',text:'คะแนน'}));
  const list=el('div',{class:'ctlist'});
  t.roster.forEach((st,k)=>{ const r=st.result;
    list.append(el('div',{class:'ctst'+(r?'':' todo')},
      el('span',{class:'ctnick','data-noi18n':'',text:st.n}),
      r ? el('span',{class:'ctscore'}, el('b',{text:`${r.score}/${r.total}`}), el('span',{class:'pbar'}, el('i',{style:`width:${Math.round(r.score/r.total*100)}%`}))) : el('span',{class:'ctscore muted',text:'ยังไม่ตรวจ'}),
      (st.pics||[]).length ? el('button',{class:'linkbtn ctpicbtn','aria-label':'ดูรูปแผ่นสอบ',title:'ดูรูปแผ่นสอบ',text:st.pics.length>1?`📷 ${st.pics.length}`:'📷',onclick:()=>viewPhotos(t, k)}) : null,
      el('button',{class:'linkbtn',text:r?'✏️ แก้':'✍️ ตรวจเอง',onclick:()=>reviewSheet(t, k, [1, qCount(t)], null, null).then(ok=>{ if(ok) renderClass(); })})));
  });
  v.append(list);
  // the words most students got wrong
  const miss=missRanking(t);
  if(miss.length) v.append(el('h3',{class:'psub',text:'คำที่ผิดบ่อย'}),
    el('div',{class:'rwords'}, ...miss.slice(0,20).map(x=>el('span',{class:'rw weak'}, el('b',{'data-noi18n':'',text:x.w.w}), x.w.th ? el('small',{'data-noi18n':'',text:x.w.th}) : null, el('em',{text:`${x.n} คน`})))));
  if(miss.length || !t.class_id) v.append(el('p',{class:'note small',text: t.class_id ? 'นักเรียนแต่ละคนได้คำที่ตัวเองผิดไปฝึกต่อในแอปโดยอัตโนมัติ' : 'รายชื่อนี้ไม่ได้ผูกกับบัญชีในแอป — เก็บไว้เป็นคะแนนสำหรับครูเท่านั้น'}));
}

// ---------- 2. photos: whose sheet (QR), then AI reads it ----------
function photoCanvas(img, max, crop){
  const W=img.naturalWidth, H=img.naturalHeight, [cx,cy,cw,ch]=crop || [0,0,1,1];
  const sw=W*cw, sh=H*ch, k=Math.min(1, max/Math.max(sw,sh));
  const c=document.createElement('canvas'); c.width=Math.max(1,Math.round(sw*k)); c.height=Math.max(1,Math.round(sh*k));
  c.getContext('2d').drawImage(img, W*cx, H*cy, sw, sh, 0, 0, c.width, c.height);
  return c;
}
const parseQr=v=>{ const m=/^PCB1\.([A-Za-z0-9]{8,16})\.(\d{1,3})\.(\d{1,2})$/.exec(String(v||'').trim()); return m ? { tid:m[1], k:+m[2], p:+m[3] } : null; };
// the sheet's QR code: the top right corner first (where it is printed), then the whole photo
async function findQr(img){
  const tries=[[1400,[0.45,0,0.55,0.45]], [1200,null], [2000,null]];
  let jsQR=null;
  for(const [max, crop] of tries){
    const c=photoCanvas(img, max, crop);
    if('BarcodeDetector' in window){ try{ const r=await new window.BarcodeDetector({ formats:['qr_code'] }).detect(c); const hit=r.map(x=>parseQr(x.rawValue)).find(Boolean); if(hit) return hit; }catch(e){} }
    try{
      jsQR=jsQR || (await import('jsqr')).default;
      const d=c.getContext('2d').getImageData(0,0,c.width,c.height), r=jsQR(d.data, c.width, c.height, { inversionAttempts:'attemptBoth' });
      const hit=r && parseQr(r.data); if(hit) return hit;
    }catch(e){ console.warn('qr', e); }
  }
  return null;
}
async function checkPhotos(t, files){
  if(CT.checking) return; CT.checking=true;
  const ranges=pageRanges(qCount(t), (t.opts||{}).q);
  try{
    for(const [i, f] of files.entries()){
      const where=`รูปที่ ${i+1}/${files.length}`;
      openModal(m=>m.append(el('h3',{text:'📷 '+where}), el('p',{class:'note ctwait',text:'กำลังหา QR ของแผ่นนี้…'})));
      const url=URL.createObjectURL(f), img=await loadImg(url);
      if(!img){ URL.revokeObjectURL(url); toast('เปิดรูปนี้ไม่ได้'); continue; }
      let hit=await findQr(img);
      if(hit && hit.tid!==t.id){ toast('รูปนี้เป็นแผ่นของการสอบอื่น', 4000); hit=null; }
      if(hit && (!t.roster[hit.k] || !ranges[hit.p])) hit=null;
      if(!hit) hit=await askWhose(t, ranges, url, where);
      if(!hit){ URL.revokeObjectURL(url); continue; }
      const range=ranges[hit.p], photo=photoCanvas(img, 1600);
      openModal(m=>m.append(el('h3',{text:'📷 '+where}), el('p',{class:'note ctwait'}, '✨ AI กำลังอ่านแผ่นของ', ' ', el('b',{'data-noi18n':'',text:t.roster[hit.k].n}), '…')));
      const r=await testApi('POST',`/${t.id}/read`,{ image:photo.toDataURL('image/jpeg',0.85), k:hit.k, first:range[0], last:range[1] }).catch(()=>({ok:false}));
      if(!r.ok) toast(testErr(r), 5000);
      const go=await reviewSheet(t, hit.k, range, photo, r.ok ? r.j.items || [] : null, where);
      URL.revokeObjectURL(url);
      if(go==='stop') break;
    }
  } finally {
    CT.checking=false; closeModal();
    if(CL.test && CL.test.data===t) renderClass();
  }
}
// no QR found: the teacher says whose sheet it is (and which page)
function askWhose(t, ranges, url, where){
  return new Promise(res=>{
    let out=null; G.modalClose=()=>res(out);
    openModal(m=>{
      const who=el('select',{'aria-label':'นักเรียน'}, el('option',{value:'',text:'— เลือกนักเรียน —'}), ...t.roster.map((st,k)=>el('option',{value:String(k),text:st.n+(st.result?' ✓':'')})));
      const page=ranges.length>1 ? el('select',{'aria-label':'หน้า'}, ...ranges.map((r,p)=>el('option',{value:String(p),text:`หน้า ${p+1} (ข้อ ${r[0]}–${r[1]})`}))) : null;
      m.append(el('h3',{text:'📷 '+where}), el('p',{class:'note',text:'หา QR ไม่เจอ — แผ่นนี้เป็นของใคร?'}),
        el('img',{class:'ctthumb',src:url,alt:''}), el('div',{class:'ctwho'}, who, page),
        el('div',{class:'row'}, el('span',{class:'sp'}), el('button',{text:'ข้ามรูปนี้',onclick:closeModal}),
          el('button',{class:'primary',text:'ต่อไป',onclick:()=>{ if(who.value===''){ who.focus(); return; } out={ tid:t.id, k:+who.value, p:page ? +page.value : 0 }; closeModal(); }})));
    });
  });
}

// ---------- 3. the teacher checks: the handwriting, what AI read, right or wrong ----------
// range: question numbers [first, last]; photo + read: the page and what AI read ([{n, a, box}]), or none (checking by hand)
// → true when saved, 'stop' to stop checking the other photos
function reviewSheet(t, k, range, photo, read, where){
  const st=t.roster[k], o=st.o, n=qCount(t);
  const prev=(st.result && st.result.answers) || Array(n).fill(null);
  const got=new Map((read||[]).map(x=>[x.n, x]));
  const rows=[];
  for(let q=range[0]; q<=range[1]; q++){
    const i=o[q-1], w=t.words[i], ai=got.get(q), old=prev[i];
    const a= ai ? ai.a : old ? old.a : '';
    rows.push({ q, i, w, a, ok: ai ? isRight(ai.a, w.w) : old ? old.ok : isRight(a, w.w), box: ai && ai.box, set:false });
  }
  return new Promise(res=>{
    let out=false; G.modalClose=()=>res(out);
    openModal(m=>{
      m.classList.add('wide','ctreview');
      const score=el('b',{class:'ctsum'});
      const upd=()=>{ score.textContent=`ถูก ${rows.filter(r=>r.ok).length}/${rows.length}`; };
      const list=el('div',{class:'ctrows'});
      for(const r of rows){
        const inp=el('input',{value:r.a,maxlength:'60',autocomplete:'off',autocapitalize:'none',spellcheck:'false','aria-label':`คำตอบข้อ ${r.q}`});
        const mark=el('button',{type:'button',class:'ctmark'});
        const show=()=>{ mark.classList.toggle('ok',r.ok); mark.classList.toggle('bad',!r.ok); mark.textContent=r.ok?'✓':'✗'; mark.setAttribute('aria-label',r.ok?'ถูก — แตะเพื่อเปลี่ยนเป็นผิด':'ผิด — แตะเพื่อเปลี่ยนเป็นถูก'); upd(); };
        inp.addEventListener('input',()=>{ r.a=inp.value; if(!r.set) r.ok=isRight(r.a, r.w.w); show(); });
        mark.addEventListener('click',()=>{ r.ok=!r.ok; r.set=true; show(); });
        list.append(el('div',{class:'ctrow'+(r.ok?'':' wrong')},
          el('span',{class:'ctq',text:String(r.q)}),
          photo && r.box ? el('img',{class:'cthand',alt:'',src:handCrop(photo, r.box)}) : photo ? el('span',{class:'cthand none',text:'—'}) : null,
          el('span',{class:'ctans'}, inp, el('small',{'data-noi18n':''}, 'เฉลย: ', el('b',{text:r.w.w}), r.w.th ? ' · '+r.w.th : '')),
          mark));
        show();
      }
      const save=el('button',{class:'primary',text:'✓ บันทึก'});
      save.addEventListener('click',async()=>{
        save.disabled=true; save.textContent='กำลังบันทึก…';
        const answers=prev.slice(); rows.forEach(r=>{ answers[r.i]={ a:normAns(r.a), ok:r.ok }; });
        const x=await testApi('PUT',`/${t.id}/results/${k}`,{ answers }).catch(()=>({ok:false}));
        if(!x.ok){ save.disabled=false; save.textContent='✓ บันทึก'; toast(testErr(x)); return; }
        st.result=x.j.result; out=true;
        if(photo && t.photos && keepOn()){ save.textContent='กำลังเก็บรูป…'; await keepPhoto(t, k, Math.max(0, pg), photo); }
        toast(`บันทึกคะแนน ${st.n} แล้ว`); closeModal();
      });
      const pages=pageRanges(n, (t.opts||{}).q), pg=pages.findIndex(p=>p[0]===range[0]);
      m.append(el('div',{class:'ctrhead'},
          el('div',{}, el('h3',{}, '📝 ', el('span',{'data-noi18n':'',text:st.n})),
            el('p',{class:'note small',text:(where ? where+' · ' : '')+(pages.length>1 && pg>=0 && range[1]-range[0]+1<n ? `หน้า ${pg+1}/${pages.length} · ` : '')+`ข้อ ${range[0]}–${range[1]}`})),
          score),
        read===null && photo ? el('p',{class:'note small ctnoai',text:'AI อ่านแผ่นนี้ไม่ได้ — พิมพ์คำตอบหรือแตะ ✓/✗ เองได้'}) : null,
        photo ? el('p',{class:'note small',text:'ตรวจทานสิ่งที่ AI อ่าน: แก้คำได้ หรือแตะ ✓/✗ เพื่อเปลี่ยน'}) : null,
        list,
        el('div',{class:'row'}, photo ? el('button',{class:'linkbtn',text:'หยุดตรวจ',onclick:()=>{ out='stop'; closeModal(); }}) : null, el('span',{class:'sp'}),
          el('button',{text: photo ? 'ข้าม' : 'ยกเลิก',onclick:closeModal}), save));
      upd();
    });
  });
}
// ---------- 📷 the photos kept as evidence ----------
const keepOn=()=>store.get('pv-ctkeep', true)!==false;
const dayText=d=>new Date(d).toLocaleDateString(LOC,{ day:'numeric', month:'short', year:'numeric' });
const SOON=30*86400000;
// the teacher's switch, how many sheets are kept, and what goes soon
function photosBox(t){
  const P=t.photos, all=t.roster.flatMap(st=>st.pics||[]);
  const keep=el('input',{type:'checkbox',class:'ctkeep'}); keep.checked=keepOn();
  keep.addEventListener('change',()=>store.set('pv-ctkeep', keep.checked));
  const soon=all.filter(x=>Date.parse(x.until)-Date.now()<SOON).sort((a,b)=>String(a.until).localeCompare(String(b.until)));
  const zip=all.length ? el('button',{class:'linkbtn ctzip',text:'⬇️ ดาวน์โหลดรูปทั้งหมด (ZIP)'}) : null;
  if(zip) zip.addEventListener('click',()=>downloadPhotos(t, zip));
  return el('div',{class:'ctphotos'+(P.used>=P.max?' full':'')},
    el('label',{class:'chk'}, keep, el('span',{text:'📷 เก็บรูปแผ่นที่ตรวจแล้วไว้เป็นหลักฐาน'})),
    el('p',{class:'note small ctquota',text: P.days>300 ? `ใช้ไป ${P.used}/${P.max} แผ่น · เก็บไว้ 1 ปี แล้วลบเอง · เห็นได้เฉพาะคุณ` : `ใช้ไป ${P.used}/${P.max} แผ่น · เก็บไว้ 6 เดือน แล้วลบเอง · เห็นได้เฉพาะคุณ`}),
    P.used>=P.max ? el('p',{class:'note small ctfull',text: P.pro ? 'ที่เก็บรูปเต็มแล้ว — ลบแผ่นสอบเก่าเพื่อเก็บรูปใหม่ได้ (คะแนนยังบันทึกได้ตามปกติ)' : 'ที่เก็บรูปเต็มแล้ว — ลบแผ่นสอบเก่า หรืออัปเกรดเป็น 💎 Pro เพื่อเก็บได้ 5,000 แผ่น นาน 1 ปี (คะแนนยังบันทึกได้ตามปกติ)'})
      : !P.pro ? el('p',{class:'note small',text:'💎 Pro เก็บได้ 5,000 แผ่น นาน 1 ปี'}) : null,
    soon.length ? el('p',{class:'note small ctsoon',text:`⚠️ รูป ${soon.length} แผ่นจะถูกลบตั้งแต่ ${dayText(soon[0].until)} — ดาวน์โหลดเก็บไว้ได้`}) : null,
    zip);
}
// the page as it is kept: WebP where the browser makes it (Safari: JPEG)
function photoData(c){ const u=c.toDataURL('image/webp',0.6); return u.startsWith('data:image/webp') ? u : c.toDataURL('image/jpeg',0.65); }
async function keepPhoto(t, k, p, photo){
  const st=t.roster[k], r=await testApi('PUT',`/${t.id}/photos/${k}/${p}`,{ image:photoData(photo) }).catch(()=>({ok:false}));
  if(r.ok){ st.pics=(st.pics||[]).filter(x=>x.p!==p).concat({ p, until:r.j.until }).sort((a,b)=>a.p-b.p); t.photos.used=r.j.used; t.photos.max=r.j.max; return; }
  if(r.j && r.j.error==='photo_quota'){ t.photos.used=r.j.used; if(!CT.fullSaid){ CT.fullSaid=true; toast(`ที่เก็บรูปเต็มแล้ว (${r.j.max} แผ่น) — บันทึกคะแนนแล้ว แต่ไม่ได้เก็บรูป`, 6000); } return; }
  toast('เก็บรูปไม่สำเร็จ — บันทึกคะแนนแล้ว', 4000);
}
async function photoBlob(t, k, p){
  const tok=await accessToken();
  const r=await fetch(`/api/tests/${t.id}/photos/${k}/${p}`,{ headers: tok ? { authorization:'Bearer '+tok } : {} }).catch(()=>null);
  return r && r.ok ? r.blob() : null;
}
const safeName=s=>String(s||'').replace(/[\\/:*?"<>|\s]+/g,'-').replace(/^-+|-+$/g,'').slice(0,40);
const photoName=(t, k, p, type)=>{ const st=t.roster[k]; return `${String(k+1).padStart(2,'0')}-${safeName(st.n)||'sheet'}${(st.pics||[]).length>1 || p ? `-p${p+1}` : ''}.${/webp/.test(type) ? 'webp' : 'jpg'}`; };
// one person's photos: look, download, remove
function viewPhotos(t, k){
  const st=t.roster[k], urls=[]; let changed=false;
  G.modalClose=()=>{ urls.forEach(u=>URL.revokeObjectURL(u)); if(changed) renderClass(); };
  openModal(m=>{
    m.classList.add('wide','ctview');
    const box=el('div',{class:'ctpics'});
    m.append(el('h3',{}, '📷 ', el('span',{'data-noi18n':'',text:st.n})),
      el('p',{class:'note small',text:'รูปแผ่นสอบที่ตรวจแล้ว — เห็นได้เฉพาะคุณ'}), box,
      el('div',{class:'row'}, el('span',{class:'sp'}), el('button',{text:'ปิด',onclick:closeModal})));
    for(const x of (st.pics||[]).slice()){
      const fig=el('figure',{class:'ctpic'}, el('p',{class:'note small',text:'กำลังโหลด…'})); box.append(fig);
      photoBlob(t, k, x.p).then(b=>{
        fig.textContent='';
        if(!b){ fig.append(el('p',{class:'note small',text:'เปิดรูปนี้ไม่ได้'})); return; }
        const u=URL.createObjectURL(b); urls.push(u);
        const del=el('button',{class:'linkbtn danger ctpicdel',text:'🗑 ลบรูป'});
        del.addEventListener('click',async()=>{
          if(!del.classList.contains('sure')){ del.classList.add('sure'); del.textContent='แตะอีกครั้งเพื่อลบ'; return; }
          del.disabled=true;
          const r=await testApi('DELETE',`/${t.id}/photos/${k}/${x.p}`).catch(()=>({ok:false}));
          if(!r.ok){ del.disabled=false; toast(testErr(r)); return; }
          st.pics=st.pics.filter(y=>y.p!==x.p); t.photos.used=Math.max(0, t.photos.used-1); changed=true; fig.remove(); toast('ลบรูปแล้ว');
          if(!st.pics.length) closeModal();
        });
        fig.append(el('figcaption',{}, el('span',{text: st.pics.length>1 ? `หน้า ${x.p+1} · เก็บถึง ${dayText(x.until)}` : `เก็บถึง ${dayText(x.until)}`}), el('span',{class:'sp'}),
            el('a',{class:'linkbtn',href:u,download:photoName(t, k, x.p, b.type),text:'⬇️ ดาวน์โหลด'}), del),
          el('img',{src:u,alt:''}));
      });
    }
  });
}
// every photo of the test in one .zip
async function downloadPhotos(t, btn){
  const all=t.roster.flatMap((st,k)=>(st.pics||[]).map(x=>[k, x.p])), files=[], label=btn.textContent;
  btn.disabled=true;
  for(const [i,[k,p]] of all.entries()){
    btn.textContent=`กำลังรวบรวม ${i+1}/${all.length}…`;
    const b=await photoBlob(t, k, p);
    if(b) files.push({ name:photoName(t, k, p, b.type), data:new Uint8Array(await b.arrayBuffer()) });
  }
  btn.disabled=false; btn.textContent=label;
  if(!files.length){ toast('เปิดรูปไม่ได้ ลองใหม่อีกครั้ง'); return; }
  downloadBlob(zipStore(files, 'application/zip'), `Piccab-${safeName(t.name)||'test'}-photos.zip`);
}

// the handwriting of one answer, cut from the page (a little wider than AI's box)
function handCrop(photo, box){
  const [x0,y0,x1,y1]=box.map(v=>v/1000), W=photo.width, H=photo.height;
  const bw=(x1-x0)*W, bh=(y1-y0)*H, px=bw*0.12+8, py=bh*0.45+8;
  const sx=Math.max(0,x0*W-px), sy=Math.max(0,y0*H-py), sw=Math.min(W-sx, bw+2*px), sh=Math.min(H-sy, bh+2*py);
  if(sw<4 || sh<4) return '';
  const k=Math.min(1, 520/sw), c=document.createElement('canvas'); c.width=Math.round(sw*k); c.height=Math.round(sh*k);
  c.getContext('2d').drawImage(photo, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.8);
}

// ---------- 5. students: the words they got wrong, to practise; scores for their report ----------
// Each test with wrong words becomes a word set "📝 <test>" (once; updated if the teacher changes the marking).
var MT_AT=0;
async function checkMyTests(force){
  if(!user || navigator.onLine===false) return;
  if(!force && Date.now()-MT_AT < 10*60000) return;
  MT_AT=Date.now();
  const r=await classApi('GET','/tests').catch(()=>({ok:false}));
  if(!r.ok || !Array.isArray(r.j.tests)) return;
  const recs=store.get('pv-mytests',{}) || {}, mine=[];
  for(const t of r.j.tests){
    const rec=recs[t.id] || {}, sig=t.wrong.map(w=>w.w).join('|');
    Object.assign(rec, { name:t.name, cls:t.class_name, cid:t.class_id, score:t.score, total:t.total, at:t.at, n:t.wrong.length });
    let sc=rec.sc && scenes().find(x=>x.id===rec.sc);
    if(t.wrong.length && rec.sig!==sig && (sc || !rec.sc)){
      const words=t.wrong.map(w=>({ w:w.w, th:w.th||'' }));
      sc=await saveWordSheet(sc||null, ('📝 '+t.name).slice(0,60), words, sc ? sc.meta : { kind:'list', exam:'' });
      if(!rec.sc) toast(`📝 ครูตรวจ “${t.name}” แล้ว: ${t.score}/${t.total} · มีคำที่ต้องฝึก ${t.wrong.length} คำ`, 6000);
      rec.sc=sc.id; rec.sig=sig;
    }
    recs[t.id]=rec; mine.push(t.id);
  }
  for(const id of Object.keys(recs)) if(!mine.includes(id)) delete recs[id];   // the teacher deleted the test
  store.set('pv-mytests', recs);
  if(S.view==='class') renderClass(); else if(S.view==='home') renderGallery();
  sendReportSoon();
}
const myTests=()=>Object.entries(store.get('pv-mytests',{})||{}).map(([id,r])=>({ id, ...r })).sort((a,b)=>String(b.at).localeCompare(String(a.at)));
// in a student's class view: their tests in this class
function myTestsEl(classId){
  const list=myTests().filter(t=>t.cid===classId);
  if(!list.length) return null;
  const box=el('div',{class:'liblist'});
  list.forEach(t=>{ const sc=t.sc && scenes().find(x=>x.id===t.sc);
    box.append(el('div',{class:'lrow clitem'}, el('span',{class:'clic',text:'📝'}),
      el('span',{class:'lb'}, el('b',{'data-noi18n':'',text:t.name}), el('span',{class:'lm',text: t.n ? `คะแนน ${t.score}/${t.total} · ผิด ${t.n} คำ` : `คะแนน ${t.score}/${t.total} · ถูกหมด 🎉`})),
      sc ? el('button',{class:'primary',text:'▶ ฝึกคำที่ผิด',onclick:()=>openPreview(sc.id)}) : null)); });
  return el('div',{}, el('div',{class:'hsec'}, el('h3',{text:'📝 ผลสอบ'})), box);
}
// for the learning report: [name, class, score, total, day]
const testsForReport=()=>myTests().slice(0,10).map(t=>[t.name||'', t.cls||'', t.score|0, t.total|0, String(t.at||'').slice(0,10)]);

export { checkMyTests, classTestPages, myTestsEl, NAMES, namesFrom, renderClassTest, rosterEditor, testsForReport, testsSection };
