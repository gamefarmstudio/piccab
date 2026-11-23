// Piccab — 📝 a spelling test to print, from a word set or a scene. Each question shows the word's picture or its Thai
// meaning (or only a number, when the teacher reads the words out) and a line — or one box per letter — to write the
// word on. The child's name, class, date and score go at the top; the answers are on a page of their own for the teacher.
// Printed with the browser like the flashcards, so "Save as PDF" gives the PDF.
import { el, LANGS, LOC, S, shuffle, store, tally, toast } from './core.js';
import { closeModal, openModal } from './scene.js';
import { allWords } from './home.js';
import { makeCards, printNow } from './cards.js';
import { classTestPages, NAMES, namesFrom, rosterEditor } from './classtests.js';
import { user } from './account.js';
import { CL, classApi, loadClasses, renderClass } from './classes.js';
import { examIn } from './sheets.js';

var TS={ q:store.get('pv-ts-q','pic'), hint:store.get('pv-ts-hint','none'), mix:store.get('pv-ts-mix',true)!==false, key:store.get('pv-ts-key',true)!==false };
const TS_PIC_PER=12, TS_ROW_FIRST=17, TS_ROW_PER=19;   // questions a page: 3 × 4 pictures, or rows of meanings
const LETTER=/[\p{L}\p{N}]/u;

// opts.cls: a class or family group to print for (one sheet per student, with name and QR; see classtests.js),
// or NAMES: a list of names the teacher types (people without the app)
async function openTestSheet(sc, opts={}){
  const words=allWords().filter(w=>w.sc===sc);
  if(!words.length){ toast('ยังไม่มีคำศัพท์'); return; }
  openModal(m=>m.append(el('p',{class:'note',text:'กำลังเตรียม…'})));   // cutting the pictures out of a scene takes a moment
  const cards=await makeCards(sc, words);
  const has={ pic:cards.some(c=>c.pic), th:cards.some(c=>c.mean) };
  const can=q=> q==='listen' || (q==='pic' ? has.pic : q==='th' ? has.th : has.pic && has.th);
  if(!can(TS.q)) TS.q = has.pic ? 'pic' : has.th ? 'th' : 'listen';
  let order=TS.mix ? shuffle(cards.slice()) : cards.slice(), cls=opts.cls||'';
  openModal(m=>{
    m.classList.add('wide','tsbox');
    const prev=el('div',{class:'tsprev'}), info=el('p',{class:'note small tsinfo'});
    const seg=(opts, set)=>{ const g=el('div',{class:'seg tsseg',role:'radiogroup'});
      for(const [v,label] of opts) g.append(el('button',{type:'button',role:'radio','data-v':v,disabled: opts===QS && !can(v) ? '' : null,text:label,onclick:()=>{ set(v); draw(); }}));
      return g; };
    const qSeg=seg(QS, v=>{ TS.q=v; store.set('pv-ts-q',v); });
    const hSeg=seg(HINTS, v=>{ TS.hint=v; store.set('pv-ts-hint',v); });
    const chk=(on, label, f)=>{ const i=el('input',{type:'checkbox'}); i.checked=on; i.addEventListener('change',()=>{ f(i.checked); draw(); }); return el('label',{class:'chk'}, i, label); };
    // 🎓 for: the same sheet for everyone, or one sheet per student of a class (signed-in teachers)
    const forSel=el('select',{class:'tsfor','aria-label':'สำหรับ'});
    const classes=()=>((CL.list && CL.list.teaching) || []);
    const known=v=>v==='' || v===NAMES || classes().some(c=>c.id===v);
    const fillFor=()=>{ forSel.replaceChildren(el('option',{value:'',text:'ทุกคนใช้แผ่นเดียวกัน (เขียนชื่อเอง)'}),
      ...classes().map(c=>el('option',{value:c.id,text:`${c.kind==='family'?'🏠':'🎓'} ${c.name} · ${c.members} คน (พิมพ์ชื่อและ QR ให้แต่ละคน)`})),
      el('option',{value:NAMES,text:'📝 พิมพ์รายชื่อเอง (ไม่ต้องมีบัญชีในแอป)'}));
      if(CL.list && !known(cls)) cls=''; forSel.value=known(cls) ? cls : ''; };
    // ✏️ the names on the sheets (classtests.js rosterEditor): a class's students (📱), with names changed / left out /
    // people without the app added — or a typed list (kept for next time)
    const namesRow=el('div',{class:'tsnamesrow'});
    let ros=null, rosFor=null;
    const members=new Map();   // class id → its students
    const setRoster=async()=>{
      if(rosFor===cls) return; rosFor=cls; ros=null; namesRow.replaceChildren();
      if(cls===NAMES){
        ros=rosterEditor(namesFrom(store.get('pv-ts-names','')||'').map(n=>({ n })), ()=>{ if(!ros) return; store.set('pv-ts-names', ros.names().join('\n').slice(0,6000)); draw(); });
        namesRow.append(ros.el, el('p',{class:'note small',text:'ไม่ต้องมีบัญชีในแอป · เก็บแค่คะแนนไว้ให้ครู'}));
        if(!ros.rows().length) setTimeout(()=>{ const a=namesRow.querySelector('.rtadd'); if(a) a.focus(); },0);
      } else if(cls){
        const want=cls; namesRow.append(el('p',{class:'note small',text:'กำลังโหลดรายชื่อ…'}));
        if(!members.has(want)){ const r=await classApi('GET',`/${want}`).catch(()=>({ok:false})); members.set(want, r.ok ? (r.j.members||[]) : []); }
        if(rosFor!==want) return;
        ros=rosterEditor(members.get(want).map(mb=>({ u:mb.user_id, n:mb.nickname, app:true })), draw);
        namesRow.replaceChildren(ros.el, el('p',{class:'note small',text:'📱 ได้คะแนนและคำที่ผิดไปฝึกในแอป · คนที่เพิ่มเองเก็บแค่คะแนน'}));
      }
      draw();
    };
    forSel.addEventListener('change',()=>{ cls=forSel.value; setRoster(); draw(); });
    if(user){ fillFor(); if(!CL.list) loadClasses().then(()=>{ if(forSel.isConnected){ fillFor(); setRoster(); draw(); } }); }
    // 📅 the day of the test: from the word set's exam day (if it is still ahead); printed in the date box, shown in the class
    const examSel=el('input',{type:'date',class:'tsexam','aria-label':'วันสอบ',value: examIn(sc)!=null && examIn(sc)>=0 ? sc.meta.exam : ''});
    examSel.addEventListener('change',()=>draw());
    const opt=()=>({ ...TS, exam:examSel.value||'' });
    const printBtn=el('button',{class:'primary tsprint',text:'🖨️ พิมพ์ / บันทึก PDF'});
    const saveBtn=el('button',{class:'tssave',text:'💾 บันทึกไว้ก่อน'});
    const fit=()=>{ const p=prev.querySelector('.tspage'); if(!p || !prev.clientWidth) return; prev.style.zoom='';
      prev.style.zoom=String(Math.min(1, (prev.clientWidth-4)/p.offsetWidth)); };
    const draw=()=>{
      for(const [g,cur] of [[qSeg,TS.q],[hSeg,TS.hint]]) [...g.children].forEach(b=>{ const on=b.dataset.v===cur; b.classList.toggle('on',on); b.setAttribute('aria-checked',String(on)); });
      const c=classes().find(x=>x.id===cls), names=(c || cls===NAMES) && ros ? ros.rows().filter(r=>r.on).map(r=>String(r.n||'').trim()||r.orig) : (c || cls===NAMES) ? [] : null;
      namesRow.hidden=!c && cls!==NAMES; saveBtn.hidden=namesRow.hidden;
      const who=names ? { name: names[0] || '(ชื่อนักเรียน)', sample:true } : {};
      const pages=testPages(sc, order, opt(), who), qp=pages.filter(p=>!p.classList.contains('key')).length;
      prev.replaceChildren(...pages.map((p,i)=>el('div',{class:'tspagewrap'}, el('span',{class:'pcpn',text: p.classList.contains('key') ? 'เฉลย (สำหรับครู)' : c ? `ตัวอย่าง หน้า ${i+1}` : `หน้า ${i+1}`}), p)));
      const noPic=(TS.q==='pic' || TS.q==='both') ? order.filter(c=>!c.pic).length : 0;
      const n=names ? names.length : 0;
      info.textContent= names ? `${order.length} ข้อ · ${n} คน คนละ ${qp} หน้า` : TS.key ? `${order.length} ข้อ · ${qp} หน้า + เฉลย 1 หน้า` : `${order.length} ข้อ · ${qp} หน้า`;
      if(names) info.append(el('br'), 'ถ่ายรูปแผ่นที่ทำแล้วใน 🎓 ห้องเรียน ให้ AI ช่วยตรวจ');
      if(noPic) info.append(el('br'), `${noPic} คำไม่มีรูป จะแสดงคำแปลแทน`);
      fit();
    };
    // 💾 save the test (for a class or typed names) to print later from 👥 Names — or 🖨️ save and print now
    const makeTest=async(print)=>{
      const btn=print ? printBtn : saveBtn, label=btn.textContent;
      const people=ros ? ros.people() : [];
      if(!people.length){ toast('เลือกอย่างน้อย 1 คน'); return; }
      printBtn.disabled=saveBtn.disabled=true; btn.textContent= print ? 'กำลังเตรียม…' : 'กำลังบันทึก…';
      const names=cls===NAMES;
      const got=await classTestPages(names ? { people } : { class_id:cls, people }, sc, cards, opt(), print);
      if(!got){ printBtn.disabled=saveBtn.disabled=false; btn.textContent=label; return; }
      if(print){ await printNow(el('div',{id:'printSheet',class:'tsprint'}, ...got.pages)); tally('test_sheet'); }
      closeModal();
      if(S.view==='class') renderClass();   // the new test shows in the list straight away
      toast(!print ? 'บันทึกแผ่นสอบแล้ว — กด 👥 รายชื่อ ที่แผ่นสอบเพื่อพิมพ์ทีหลัง'
        : names ? 'บันทึกแผ่นสอบแล้ว — เมื่อทำเสร็จ ถ่ายรูปที่ 🎓 ห้องเรียน → 📝 แผ่นสอบรายชื่อเอง' : 'บันทึกแผ่นสอบไว้ในห้องเรียนแล้ว — เมื่อนักเรียนทำเสร็จ ถ่ายรูปที่ 🎓 ห้องเรียน → 📝 แผ่นสอบ', 7000);
    };
    saveBtn.addEventListener('click',()=>makeTest(false));
    printBtn.addEventListener('click',async()=>{
      if(cls) return makeTest(true);
      printBtn.disabled=true; printBtn.textContent='กำลังเตรียม…';
      await printNow(el('div',{id:'printSheet',class:'tsprint'}, ...testPages(sc, order, opt())));
      closeModal(); tally('test_sheet');
    });
    m.append(el('div',{class:'pchead'}, el('h3',{text:'📝 แผ่นสอบเขียนคำศัพท์'}), el('button',{class:'x','aria-label':'ปิด',text:'✕',onclick:closeModal})),
      el('div',{class:'tsopts'},
        user ? el('b',{text:'สำหรับ'}) : null, user ? forSel : null,
        el('b',{text:'โจทย์'}), qSeg,
        el('b',{text:'ตัวช่วย'}), hSeg,
        el('b',{text:'📅 วันสอบ'}), el('div',{class:'tsexamrow'}, examSel, el('span',{class:'note small',text:'ไม่ใส่ก็ได้ · พิมพ์ลงช่องวันที่'})),
        el('div',{class:'tschk'},
          chk(TS.mix, 'สลับลำดับคำ', v=>{ TS.mix=v; store.set('pv-ts-mix',v); order=v ? shuffle(cards.slice()) : cards.slice(); }),
          chk(TS.key, 'พิมพ์หน้าเฉลย', v=>{ TS.key=v; store.set('pv-ts-key',v); }))),
      user ? namesRow : null,
      prev,
      el('div',{class:'row pcfoot'}, info, el('span',{class:'sp'}), el('button',{text:'ยกเลิก',onclick:closeModal}), saveBtn, printBtn),
      el('p',{class:'note small',text:'ในหน้าพิมพ์ เลือก “บันทึกเป็น PDF” ถ้าต้องการไฟล์ PDF'}));
    setRoster(); draw();
    requestAnimationFrame(fit);
  });
}
const QS=[['pic','🖼️ รูป'],['th','🇹🇭 คำแปล'],['both','รูป + คำแปล'],['listen','🗣️ ครูอ่านให้ฟัง']];
const HINTS=[['none','ไม่มี'],['count','ช่องตามจำนวนตัวอักษร'],['first','บอกตัวแรก']];
function howText(q){
  const L=LANGS[S.lang].name;
  return q==='pic' ? `ดูรูป แล้วเขียนคำศัพท์ภาษา${L}` : q==='th' ? `อ่านคำแปล แล้วเขียนคำศัพท์ภาษา${L}`
    : q==='both' ? `ดูรูปและคำแปล แล้วเขียนคำศัพท์ภาษา${L}` : 'ฟังครูอ่าน แล้วเขียนคำที่ได้ยิน';
}
// Question numbers on each printed page: 12 pictures a page, or 17 rows on the first page and 19 after.
function pageRanges(n, q){
  const pic=q==='pic' || q==='both', out=[];
  for(let i=0, k=0; i<n; k++){ const per=pic ? TS_PIC_PER : (k===0 ? TS_ROW_FIRST : TS_ROW_PER); out.push([i+1, Math.min(n, i+per)]); i+=per; }
  return out;
}
// The pages (the same ones for the preview and for printing): questions, then the answers if asked for.
// who (one student's sheet): {name, qrs: a QR image per page, code} — or {sample} for the preview, {keyOnly} for the answers alone.
function testPages(sc, cards, o, who={}){
  const pic=o.q==='pic' || o.q==='both', n=cards.length, pages=[];
  const field=(t, cls, v)=>el('span',{class:'tsf'+(cls?' '+cls:'')}, t, el('i',{'data-noi18n':'',text:v||''}));
  const qr=p=> who.qrs ? el('span',{class:'tsqr'}, el('img',{src:who.qrs[p],alt:''}), el('small',{'data-noi18n':'',text:who.code||''}))
    : who.sample ? el('span',{class:'tsqr sample'}, el('span',{text:'QR'})) : null;
  const tagged=!!(who.qrs || who.sample);
  const head=()=>el('div',{class:'tshead'+(tagged?' hasqr':'')}, qr(0),
    el('div',{class:'tstitle'}, el('b',{'data-noi18n':'',text:sc.name}), el('span',{text:'แบบทดสอบเขียนคำศัพท์'})),
    el('div',{class:'tsfields'}, field('ชื่อ','wide',who.name), field('เลขที่'), field('ชั้น'), field('วันที่',o.exam ? 'date' : '',o.exam ? new Date(o.exam+'T12:00:00').toLocaleDateString(LOC,{ day:'numeric', month:'short', year:'2-digit' }) : ''),
      el('span',{class:'tsf score'}, 'คะแนน', el('i'), el('span',{'data-noi18n':'',text:`/ ${n}`}))),
    el('p',{class:'tshow',text:howText(o.q)}));
  if(!who.keyOnly) pageRanges(n, o.q).forEach(([a,b],k)=>{
    const part=cards.slice(a-1, b);
    const body=pic ? el('div',{class:'tsgrid'}, ...part.map((c,j)=>picQ(c, a+j, o)))
      : el('div',{class:'tslist'+(o.q==='listen'?' listen':'')}, ...part.map((c,j)=>rowQ(c, a+j, o)));
    pages.push(el('div',{class:'tspage'}, k===0 ? head() : el('div',{class:'tshead small'+(tagged?' hasqr':'')}, qr(k),
      el('b',{'data-noi18n':'',text: who.name ? `${sc.name} · ${who.name}` : sc.name}), el('span',{text:`หน้า ${k+1}`})), body));
  });
  if(o.key) pages.push(el('div',{class:'tspage key'},
    el('div',{class:'tshead small'}, el('b',{}, 'เฉลย', ' · ', el('span',{'data-noi18n':'',text:sc.name})), el('span',{text:`${n} ข้อ`})),
    who.mixed ? el('p',{class:'tshow',text:'เรียงตามชุดคำ — ลำดับข้อในแผ่นของแต่ละคนต่างกัน (ตรวจในแอปได้)'}) : null,
    el('ol',{class:'tskey'}, ...cards.map(c=>el('li',{'data-noi18n':''}, el('b',{text:c.word}), c.mean && o.q!=='th' ? el('span',{text:c.mean}) : null)))));
  return pages;
}
// a picture question: number, the picture (its meaning when it has none), the meaning too if asked, and where to write
function picQ(c, num, o){
  const th=c.mean && (o.q==='both' || !c.pic);
  return el('div',{class:'tsq'},
    el('span',{class:'tsn',text:String(num)}),
    el('div',{class:'tspic'}, c.pic ? el('img',{src:c.pic,alt:''}) : el('span',{class:'tsmean big','data-noi18n':'',text:c.mean||'?'})),
    th && c.pic ? el('div',{class:'tsmean','data-noi18n':'',text:c.mean}) : null,
    answerEl(c.word, o.hint));
}
// a row question: number, the meaning (nothing when the teacher reads the word), where to write
function rowQ(c, num, o){
  return el('div',{class:'tsrow'}, el('span',{class:'tsn',text:num+'.'}),
    o.q==='listen' ? null : el('span',{class:'tsmean','data-noi18n':'',text:c.mean||'—'}),
    answerEl(c.word, o.hint));
}
// a line to write on, or a box for each letter (spaces stay gaps, a hyphen or apostrophe is printed), the first letter in if asked
function answerEl(word, hint){
  if(hint==='none') return el('span',{class:'tsline'});
  const chars=[...String(word)], box=el('span',{class:'tsboxes','data-noi18n':'',style:`--n:${Math.max(4, chars.length)}`});
  let first=true;
  for(const ch of chars){
    if(ch===' '){ box.append(el('span',{class:'gap'})); continue; }
    if(!LETTER.test(ch)){ box.append(el('span',{class:'sym',text:ch})); continue; }
    box.append(el('span',{class:'bx',text: hint==='first' && first ? ch : ''})); first=false;
  }
  return box;
}

export { openTestSheet, pageRanges, testPages, TS };
