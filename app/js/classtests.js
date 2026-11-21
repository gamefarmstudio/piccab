// Piccab — 📝 paper spelling tests in a class or family group, checked from photos.
// 1. The teacher prints one sheet per student (📝 แผ่นสอบ → choose the class): the student's name is printed on it, and
//    each page has a QR code "PCB1.<test>.<student>.<page>", so the app knows whose sheet a photo is, and its order.
// 2. The teacher photographs the sheets; the app reads the QR on the phone, and AI copies what the child wrote
//    (the photo goes to the AI only — it is never stored).
// 3. The teacher checks each answer next to a picture of the handwriting, changes what AI misread, and saves.
// 4. The class gets scores per student and the words most students got wrong.
// 5. Each student gets the words they got wrong as a word set to practise; their score goes in their learning report.
import { G, el, ic, LOC, S, scenes, store, tally, toast } from './core.js';
import { ask, closeModal, openModal } from './scene.js';
import { renderGallery, sceneTime } from './home.js';
import { openPreview } from './decks.js';
import { loadImg } from './cards.js';
import { openTestSheet, pageRanges, testPages } from './testsheet.js';
import { isList, saveWordSheet } from './sheets.js';
import { user } from './account.js';
import { CL, classApi, classErr, renderClass } from './classes.js';
import { sendReportSoon } from './report.js';

var CT={ checking:false };
const QR_PREFIX='PCB1';
const normAns=s=>String(s||'').toLowerCase().replace(/[’‘`´]/g,"'").replace(/[^\p{L}\p{N}' -]/gu,'').replace(/\s+/g,' ').trim();
const isRight=(a, w)=>!!normAns(a) && normAns(a)===normAns(w);
const TEST_ERR={ needs_tests_sql:'ต้องรัน SQL 2026-11-class-tests.sql ใน Supabase ก่อน', no_students:'ยังไม่มีนักเรียนในห้องนี้', too_many_tests:'มีแผ่นสอบในห้องนี้ครบ 200 ชุดแล้ว — ลบชุดเก่าก่อน',
  too_many_reads:'อ่านรูปของแผ่นสอบนี้ครบจำนวนแล้ว — ตรวจที่เหลือด้วยมือได้', rate_limited:'ส่งรูปถี่เกินไป รอสักครู่แล้วลองใหม่', not_configured:'ตอนนี้ใช้ AI ไม่ได้ — ตรวจด้วยมือได้',
  busy:'AI ไม่ว่าง ลองใหม่อีกครั้ง', invalid_json:'AI อ่านแผ่นนี้ไม่ได้ ลองถ่ายใหม่ให้ชัดขึ้น', refused:'AI อ่านแผ่นนี้ไม่ได้ ลองถ่ายใหม่ให้ชัดขึ้น', image_too_large:'รูปใหญ่เกินไป' };
const testErr=r=>TEST_ERR[r && r.j && r.j.error] || classErr(r);

// ---------- 1. printing: one sheet per student ----------
// the QR code of one page, as an image
async function qrUrl(text){
  const { default: qrcode }=await import('qrcode-generator');
  const qr=qrcode(0,'M'); qr.addData(text); qr.make();
  return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(qr.createSvgTag({ cellSize:4, margin:8, scalable:true }));
}
// Make the test in the class (the server takes the class list and gives each student their order), then the pages:
// each student's sheet, then one answer page in the word set's order.
async function classTestPages(clsId, sc, cards, o){
  const seen=new Set(), words=cards.filter(c=>{ const k=c.word.trim().toLowerCase(); if(seen.has(k)) return false; seen.add(k); return true; }).slice(0,60);
  const r=await classApi('POST',`/${clsId}/tests`,{ name:sc.name, words:words.map(c=>({ w:c.word, th:c.mean||'' })), q:o.q, hint:o.hint, mix:!!o.mix }).catch(()=>({ok:false}));
  if(!r.ok){ toast(testErr(r), 5000); return null; }
  const T=r.j, byWord=new Map(words.map(c=>[c.word.trim().toLowerCase(), c]));
  const key=T.words.map(w=>byWord.get(w.w.trim().toLowerCase()) || { word:w.w, mean:w.th, pic:'' });
  const pages=[], ranges=pageRanges(key.length, o.q);
  for(const [k, st] of T.roster.entries()){
    const qrs=await Promise.all(ranges.map((_,p)=>qrUrl(`${QR_PREFIX}.${T.id}.${k}.${p}`)));
    pages.push(...testPages(sc, st.o.map(i=>key[i]), { ...o, key:false }, { name:st.n, qrs, code:`${T.id} · ${k+1}` }));
  }
  if(o.key) pages.push(...testPages(sc, key, { ...o, key:true }, { keyOnly:true, mixed:!!o.mix }));
  tally('class_test');
  return { pages, test:T };
}

// ---------- the tests of a class (teacher) ----------
function testsSection(d){
  const box=el('div',{class:'ctsec'});
  const head=el('div',{class:'hsec'}, el('h3',{text:'📝 แผ่นสอบ'}), el('button',{class:'linkbtn',text:'➕ พิมพ์แผ่นสอบให้ห้องนี้',onclick:()=>pickTestSet(d)}));
  const body=el('div',{}, el('p',{class:'note small',text:'กำลังโหลด…'}));
  box.append(head, body);
  classApi('GET',`/${d.id}/tests`).catch(()=>({ok:false})).then(r=>{
    body.replaceChildren();
    if(!r.ok){ body.append(el('p',{class:'note small',text: r.j && r.j.error==='needs_tests_sql' ? TEST_ERR.needs_tests_sql : 'โหลดแผ่นสอบไม่สำเร็จ'})); return; }
    if(!r.j.tests.length){ body.append(el('p',{class:'note small',text:'พิมพ์แผ่นสอบที่มีชื่อนักเรียนแต่ละคน แล้วถ่ายรูปให้ AI ช่วยตรวจ'})); return; }
    const list=el('div',{class:'liblist'});
    r.j.tests.forEach(t=>list.append(el('button',{class:'lrow cttest',onclick:()=>openClassTest(t.id)},
      el('span',{class:'clic',text:'📝'}),
      el('span',{class:'lb'}, el('b',{'data-noi18n':'',text:t.name}),
        el('span',{class:'lm',text: t.avg!=null ? `${new Date(t.created_at).toLocaleDateString(LOC,{day:'numeric',month:'short'})} · ${t.total} ข้อ · ตรวจแล้ว ${t.checked}/${t.students} คน · เฉลี่ย ${t.avg}%`
          : `${new Date(t.created_at).toLocaleDateString(LOC,{day:'numeric',month:'short'})} · ${t.total} ข้อ · ตรวจแล้ว ${t.checked}/${t.students} คน`})),
      ic('chevron_right','chev'))));
    body.append(list);
  });
  return box;
}
// ➕ choose the word set (or scene) to test, then the usual 📝 test sheet screen with this class chosen
function pickTestSet(d){
  const list=scenes().filter(sc=>Object.values(sc.items||{}).some(it=>it && it.word)).sort((a,b)=>(isList(b)-isList(a)) || sceneTime(b)-sceneTime(a));
  openModal(m=>{
    m.append(el('h3',{text:'📝 เลือกชุดคำที่จะสอบ'}));
    if(!list.length) m.append(el('p',{class:'libempty',text:'ยังไม่มีชุดคำ'}));
    const box=el('div',{class:'liblist ctpick'});
    list.slice(0,80).forEach(sc=>box.append(el('button',{class:'lrow',onclick:()=>{ closeModal(); openTestSheet(sc, { cls:d.id }); }},
      el('span',{class:'clic',text:isList(sc)?'📚':'🖼️'}), el('span',{class:'lb'}, el('b',{'data-noi18n':'',text:sc.name}),
        el('span',{class:'lm',text:`${Object.values(sc.items||{}).filter(it=>it && it.word).length} คำ`})))));
    m.append(box, el('div',{class:'row'}, el('span',{class:'sp'}), el('button',{text:'ปิด',onclick:closeModal})));
  });
}
function openClassTest(id){ CL.test={ id, data:null }; renderClass(); window.scrollTo(0,0); loadClassTest(); }
async function loadClassTest(){
  const T=CL.test; if(!T) return;
  const r=await classApi('GET',`/${CL.openId}/tests/${T.id}`).catch(()=>({ok:false}));
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
function renderClassTest(v, d){
  const T=CL.test;
  v.append(el('div',{class:'clback'}, el('button',{class:'linkbtn',onclick:()=>{ CL.test=null; renderClass(); }}, ic('arrow_back'), d.kind==='family' ? 'กลับไปที่กลุ่มครอบครัว' : 'กลับไปที่ห้องเรียน')));
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
    el('button',{class:'danger ctdel',text:'🗑 ลบ',onclick:async()=>{
      if(!(await ask(`ลบแผ่นสอบ “${t.name}” และคะแนนทั้งหมด?`,'ลบ'))) return;
      const r=await classApi('DELETE',`/${CL.openId}/tests/${t.id}`).catch(()=>({ok:false})); if(!r.ok){ toast(testErr(r)); return; }
      CL.test=null; toast('ลบแล้ว'); renderClass(); }})),
    el('p',{class:'note small',text:'ถ่ายทีละแผ่นให้เห็นทั้งหน้าและ QR ที่มุมขวาบน เลือกหลายรูปพร้อมกันได้ · AI อ่านคำตอบ แล้วคุณตรวจทานก่อนบันทึก · รูปไม่ถูกเก็บไว้'}));
  // scores
  v.append(el('h3',{class:'psub',text:'คะแนน'}));
  const list=el('div',{class:'ctlist'});
  t.roster.forEach((st,k)=>{ const r=st.result;
    list.append(el('div',{class:'ctst'+(r?'':' todo')},
      el('span',{class:'ctnick','data-noi18n':'',text:st.n}),
      r ? el('span',{class:'ctscore'}, el('b',{text:`${r.score}/${r.total}`}), el('span',{class:'pbar'}, el('i',{style:`width:${Math.round(r.score/r.total*100)}%`}))) : el('span',{class:'ctscore muted',text:'ยังไม่ตรวจ'}),
      el('button',{class:'linkbtn',text:r?'✏️ แก้':'✍️ ตรวจเอง',onclick:()=>reviewSheet(t, k, [1, qCount(t)], null, null).then(ok=>{ if(ok) renderClass(); })})));
  });
  v.append(list);
  // the words most students got wrong
  const miss=missRanking(t);
  if(miss.length) v.append(el('h3',{class:'psub',text:'คำที่ผิดบ่อย'}),
    el('div',{class:'rwords'}, ...miss.slice(0,20).map(x=>el('span',{class:'rw weak'}, el('b',{'data-noi18n':'',text:x.w.w}), x.w.th ? el('small',{'data-noi18n':'',text:x.w.th}) : null, el('em',{text:`${x.n} คน`})))),
    el('p',{class:'note small',text:'นักเรียนแต่ละคนได้คำที่ตัวเองผิดไปฝึกต่อในแอปโดยอัตโนมัติ'}));
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
      const r=await classApi('POST',`/${CL.openId}/tests/${t.id}/read`,{ image:photo.toDataURL('image/jpeg',0.85), k:hit.k, first:range[0], last:range[1] }).catch(()=>({ok:false}));
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
        const x=await classApi('PUT',`/${CL.openId}/tests/${t.id}/results/${k}`,{ answers }).catch(()=>({ok:false}));
        if(!x.ok){ save.disabled=false; save.textContent='✓ บันทึก'; toast(testErr(x)); return; }
        st.result=x.j.result; out=true; toast(`บันทึกคะแนน ${st.n} แล้ว`); closeModal();
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

export { checkMyTests, classTestPages, myTestsEl, renderClassTest, testsForReport, testsSection };
