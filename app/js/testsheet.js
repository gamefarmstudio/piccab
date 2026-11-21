// Piccab — 📝 a spelling test to print, from a word set or a scene. Each question shows the word's picture or its Thai
// meaning (or only a number, when the teacher reads the words out) and a line — or one box per letter — to write the
// word on. The child's name, class, date and score go at the top; the answers are on a page of their own for the teacher.
// Printed with the browser like the flashcards, so "Save as PDF" gives the PDF.
import { el, LANGS, S, shuffle, store, tally, toast } from './core.js';
import { closeModal, openModal } from './scene.js';
import { allWords } from './home.js';
import { makeCards, printNow } from './cards.js';

var TS={ q:store.get('pv-ts-q','pic'), hint:store.get('pv-ts-hint','none'), mix:store.get('pv-ts-mix',true)!==false, key:store.get('pv-ts-key',true)!==false };
const TS_PIC_PER=12, TS_ROW_FIRST=17, TS_ROW_PER=19;   // questions a page: 3 × 4 pictures, or rows of meanings
const LETTER=/[\p{L}\p{N}]/u;

async function openTestSheet(sc){
  const words=allWords().filter(w=>w.sc===sc);
  if(!words.length){ toast('ยังไม่มีคำศัพท์'); return; }
  openModal(m=>m.append(el('p',{class:'note',text:'กำลังเตรียม…'})));   // cutting the pictures out of a scene takes a moment
  const cards=await makeCards(sc, words);
  const has={ pic:cards.some(c=>c.pic), th:cards.some(c=>c.mean) };
  const can=q=> q==='listen' || (q==='pic' ? has.pic : q==='th' ? has.th : has.pic && has.th);
  if(!can(TS.q)) TS.q = has.pic ? 'pic' : has.th ? 'th' : 'listen';
  let order=TS.mix ? shuffle(cards.slice()) : cards.slice();
  openModal(m=>{
    m.classList.add('wide','tsbox');
    const prev=el('div',{class:'tsprev'}), info=el('p',{class:'note small tsinfo'});
    const seg=(opts, set)=>{ const g=el('div',{class:'seg tsseg',role:'radiogroup'});
      for(const [v,label] of opts) g.append(el('button',{type:'button',role:'radio','data-v':v,disabled: opts===QS && !can(v) ? '' : null,text:label,onclick:()=>{ set(v); draw(); }}));
      return g; };
    const qSeg=seg(QS, v=>{ TS.q=v; store.set('pv-ts-q',v); });
    const hSeg=seg(HINTS, v=>{ TS.hint=v; store.set('pv-ts-hint',v); });
    const chk=(on, label, f)=>{ const i=el('input',{type:'checkbox'}); i.checked=on; i.addEventListener('change',()=>{ f(i.checked); draw(); }); return el('label',{class:'chk'}, i, label); };
    const printBtn=el('button',{class:'primary tsprint',text:'🖨️ พิมพ์ / บันทึก PDF'});
    const fit=()=>{ const p=prev.querySelector('.tspage'); if(!p || !prev.clientWidth) return; prev.style.zoom='';
      prev.style.zoom=String(Math.min(1, (prev.clientWidth-4)/p.offsetWidth)); };
    const draw=()=>{
      for(const [g,cur] of [[qSeg,TS.q],[hSeg,TS.hint]]) [...g.children].forEach(b=>{ const on=b.dataset.v===cur; b.classList.toggle('on',on); b.setAttribute('aria-checked',String(on)); });
      const pages=testPages(sc, order, TS), qp=pages.filter(p=>!p.classList.contains('key')).length;
      prev.replaceChildren(...pages.map((p,i)=>el('div',{class:'tspagewrap'}, el('span',{class:'pcpn',text: p.classList.contains('key') ? 'เฉลย (สำหรับครู)' : `หน้า ${i+1}`}), p)));
      const noPic=(TS.q==='pic' || TS.q==='both') ? order.filter(c=>!c.pic).length : 0;
      info.textContent=TS.key ? `${order.length} ข้อ · ${qp} หน้า + เฉลย 1 หน้า` : `${order.length} ข้อ · ${qp} หน้า`;
      if(noPic) info.append(el('br'), `${noPic} คำไม่มีรูป จะแสดงคำแปลแทน`);
      fit();
    };
    printBtn.addEventListener('click',async()=>{
      printBtn.disabled=true; printBtn.textContent='กำลังเตรียม…';
      await printNow(el('div',{id:'printSheet',class:'tsprint'}, ...testPages(sc, order, TS)));
      closeModal(); tally('test_sheet');
    });
    m.append(el('div',{class:'pchead'}, el('h3',{text:'📝 แผ่นสอบเขียนคำศัพท์'}), el('button',{class:'x','aria-label':'ปิด',text:'✕',onclick:closeModal})),
      el('div',{class:'tsopts'},
        el('b',{text:'โจทย์'}), qSeg,
        el('b',{text:'ตัวช่วย'}), hSeg,
        el('div',{class:'tschk'},
          chk(TS.mix, 'สลับลำดับคำ', v=>{ TS.mix=v; store.set('pv-ts-mix',v); order=v ? shuffle(cards.slice()) : cards.slice(); }),
          chk(TS.key, 'พิมพ์หน้าเฉลย', v=>{ TS.key=v; store.set('pv-ts-key',v); }))),
      prev,
      el('div',{class:'row pcfoot'}, info, el('span',{class:'sp'}), el('button',{text:'ยกเลิก',onclick:closeModal}), printBtn),
      el('p',{class:'note small',text:'ในหน้าพิมพ์ เลือก “บันทึกเป็น PDF” ถ้าต้องการไฟล์ PDF'}));
    draw();
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
// The pages (the same ones for the preview and for printing): questions, then the answers if asked for.
function testPages(sc, cards, o){
  const pic=o.q==='pic' || o.q==='both', n=cards.length, pages=[];
  const field=(t, cls)=>el('span',{class:'tsf'+(cls?' '+cls:'')}, t, el('i'));
  const head=()=>el('div',{class:'tshead'},
    el('div',{class:'tstitle'}, el('b',{'data-noi18n':'',text:sc.name}), el('span',{text:'แบบทดสอบเขียนคำศัพท์'})),
    el('div',{class:'tsfields'}, field('ชื่อ','wide'), field('เลขที่'), field('ชั้น'), field('วันที่'),
      el('span',{class:'tsf score'}, 'คะแนน', el('i'), el('span',{'data-noi18n':'',text:`/ ${n}`}))),
    el('p',{class:'tshow',text:howText(o.q)}));
  for(let i=0, k=0; i<n; k++){
    const per=pic ? TS_PIC_PER : (k===0 ? TS_ROW_FIRST : TS_ROW_PER), part=cards.slice(i, i+per);
    const body=pic ? el('div',{class:'tsgrid'}, ...part.map((c,j)=>picQ(c, i+j+1, o)))
      : el('div',{class:'tslist'+(o.q==='listen'?' listen':'')}, ...part.map((c,j)=>rowQ(c, i+j+1, o)));
    pages.push(el('div',{class:'tspage'}, k===0 ? head() : el('div',{class:'tshead small'}, el('b',{'data-noi18n':'',text:sc.name}), el('span',{text:`หน้า ${k+1}`})), body));
    i+=per;
  }
  if(o.key) pages.push(el('div',{class:'tspage key'},
    el('div',{class:'tshead small'}, el('b',{}, 'เฉลย', ' · ', el('span',{'data-noi18n':'',text:sc.name})), el('span',{text:`${n} ข้อ`})),
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

export { openTestSheet };
