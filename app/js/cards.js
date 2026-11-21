// Piccab — 🖨️ printable flashcards from a scene or word sheet: the thing's picture (cut from the scene) with its word,
// and the meaning under the word or on the back (for two-sided printing). Printed with the browser, so
// "Save as PDF" gives the PDF; nothing to install and Thai text prints with the app's own fonts.
import { el, mean, store, tally, toast } from './core.js';
import { closeModal, openModal, sceneImg } from './scene.js';
import { allWords } from './home.js';
import { isList, svgUrl } from './sheets.js';

var PC={ size:store.get('pv-pc-size',8)===12 ? 12 : 8, back:store.get('pv-pc-back','back'), todo:false };

function openPrintCards(sc){
  const list=allWords().filter(w=>w.sc===sc);
  if(!list.length){ toast('ฉากนี้ยังไม่มีคำศัพท์'); return; }
  openModal(m=>{
    const opt=(name, val, cur, label)=>{ const i=el('input',{type:'radio',name,value:String(val)}); i.checked=String(cur)===String(val); return el('label',{class:'opt'}, i, label); };
    const todo=el('input',{type:'checkbox'}); todo.checked=PC.todo;
    const count=el('p',{class:'note small'});
    const upd=()=>{ const n=list.filter(w=>!todo.checked || w.st==='todo').length, per=+(m.querySelector('input[name=pcsize]:checked')||{}).value||8;
      const pages=Math.max(1,Math.ceil(n/per)), two=(m.querySelector('input[name=pcback]:checked')||{}).value==='back';
      count.textContent= two ? `${n} ใบ · ${pages} หน้า (และด้านหลังอีก ${pages} หน้า)` : `${n} ใบ · ${pages} หน้า`; };
    m.append(el('h3',{text:'🖨️ พิมพ์แฟลชการ์ด'}),
      el('p',{class:'note',text: isList(sc) ? 'การ์ดคำศัพท์จากชีทนี้ ตัดตามเส้นประ' : 'การ์ดมีรูปของแต่ละคำจากฉากนี้ ตัดตามเส้นประ'}),
      el('div',{class:'pcopts'},
        el('b',{text:'ขนาด'}), opt('pcsize',8,PC.size,'ใหญ่ · 8 ใบต่อหน้า'), opt('pcsize',12,PC.size,'เล็ก · 12 ใบต่อหน้า'),
        el('b',{text:'คำแปล'}), opt('pcback','back',PC.back,'อยู่หลังการ์ด (พิมพ์ 2 หน้า พลิกด้านยาว)'), opt('pcback','below',PC.back,'อยู่ใต้คำ (หน้าเดียว)'), opt('pcback','none',PC.back,'ไม่มีคำแปล'),
        el('label',{class:'opt'}, todo, 'เฉพาะคำที่ยังไม่ผ่าน')),
      count,
      el('div',{class:'row'}, el('span',{class:'sp'}), el('button',{text:'ยกเลิก',onclick:closeModal}),
        el('button',{class:'primary',text:'👀 ดูตัวอย่าง',onclick:async e=>{
          const btn=e.currentTarget;
          PC.size=+m.querySelector('input[name=pcsize]:checked').value; PC.back=m.querySelector('input[name=pcback]:checked').value; PC.todo=todo.checked;
          store.set('pv-pc-size',PC.size); store.set('pv-pc-back',PC.back);
          const words=list.filter(w=>!PC.todo || w.st==='todo');
          if(!words.length){ toast('ไม่มีคำที่ยังไม่ผ่าน'); return; }
          btn.disabled=true; btn.textContent='กำลังเตรียม…';
          const cards=await makeCards(sc, words);
          previewCards(sc, cards);
        }})));
    m.addEventListener('change',upd); upd();
  });
}
// The cards to print: word, meaning and picture (cut from the scene, or the sheet's line drawing), each one on.
async function makeCards(sc, words){
  const img=isList(sc) ? null : await loadImg(sceneImg(sc));
  return words.map(w=>{ const src=(sc.items||{})[w.id]||w.it;
    const pic=src.pic ? svgUrl(src.pic) : img && src.w ? cardPicture(img, sc, src) : '';
    return { id:w.id, word:w.it.word, mean:mean(w.it)||'', pic, usePic:!!pic, on:true }; });
}
// 👀 The pages as they will print: take a card out (and back), change its word or meaning, or leave out its picture —
// only for this printout; the scene's own words don't change.
function previewCards(sc, cards){
  let side='front', editing=null, undo=null;
  const per=PC.size, cols=per===12 ? 3 : 2, rows=4;
  openModal(m=>{
    m.classList.add('wide','pcprevbox');
    const body=el('div',{class:'pcprev pc'+per});
    const info=el('p',{class:'note small pcinfo'});
    const printBtn=el('button',{class:'primary'});
    const sideSeg=PC.back==='back' ? el('div',{class:'seg pcside'},
      el('button',{type:'button','data-side':'front',text:'ด้านหน้า',onclick:()=>{ side='front'; editing=null; draw(); }}),
      el('button',{type:'button','data-side':'back',text:'ด้านหลัง',onclick:()=>{ side='back'; editing=null; draw(); }})) : null;
    const restore=el('button',{type:'button',class:'linkbtn pcrestore',onclick:()=>{ cards.forEach(c=>c.on=true); undo=null; draw(); }});
    const face=(c, s)=>{
      if(s==='back') return [el('div',{class:'pm big',text:c.mean})];
      const pic=c.usePic && c.pic;
      return [pic ? el('img',{src:c.pic,alt:''}) : null, el('div',{class:'pw'+(pic?'':' big'),text:c.word}),
        PC.back==='below' && c.mean ? el('div',{class:'pm',text:c.mean}) : null];
    };
    const editor=c=>{
      const w=el('input',{value:c.word,maxlength:'60','aria-label':'คำศัพท์'}), mn=el('input',{value:c.mean,maxlength:'80','aria-label':'คำแปล',placeholder:'คำแปล'});
      const usePic=el('input',{type:'checkbox'}); usePic.checked=c.usePic;
      const save=()=>{ const v=w.value.trim(); if(!v){ w.focus(); return; } c.word=v; c.mean=mn.value.trim(); c.usePic=usePic.checked; editing=null; draw(); };
      const keys=e=>{ if(e.key==='Enter'){ e.preventDefault(); save(); } if(e.key==='Escape'){ e.stopPropagation(); editing=null; draw(); } };
      w.addEventListener('keydown',keys); mn.addEventListener('keydown',keys);
      setTimeout(()=>w.focus(),0);
      return el('div',{class:'pcedit'}, w, PC.back!=='none' ? mn : null,
        c.pic ? el('label',{class:'chk'}, usePic, 'ใช้รูป') : null,
        el('div',{class:'row'}, el('button',{type:'button',text:'ยกเลิก',onclick:()=>{ editing=null; draw(); }}), el('button',{type:'button',class:'primary',text:'✓ บันทึก',onclick:save})));
    };
    const cardEl=(c, s)=>{
      if(!c) return el('div',{class:'pcard blank'});
      if(s==='front' && editing===c) return el('div',{class:'pcard editing','data-noi18n':''}, editor(c));
      return el('div',{class:'pcard'+(s==='back'?' back':''),'data-noi18n':''}, ...face(c, s),
        s==='front' ? el('div',{class:'pctools'},
          el('button',{type:'button',class:'pced',title:'แก้ไข','aria-label':'แก้ไข '+c.word,text:'✏️',onclick:()=>{ editing=c; draw(); }}),
          el('button',{type:'button',class:'pcx',title:'เอาออก','aria-label':'เอาออก '+c.word,text:'✕',onclick:()=>{
            c.on=false; undo=c; if(editing===c) editing=null; draw();
            toast(`เอา “${c.word}” ออกแล้ว`, 2500); }})) : null);
    };
    const draw=()=>{
      const on=cards.filter(c=>c.on), pages=Math.max(1,Math.ceil(on.length/per)), off=cards.length-on.length;
      body.replaceChildren();
      if(!on.length) body.append(el('p',{class:'libempty',text:'ไม่มีการ์ดเหลือแล้ว'}));
      for(let p=0;p<on.length;p+=per){
        const page=on.slice(p,p+per); while(page.length<per) page.push(null);
        let show=page;
        if(side==='back'){ show=[]; for(let r=0;r<rows;r++) show.push(...page.slice(r*cols,(r+1)*cols).reverse()); }
        body.append(el('div',{class:'pcpagewrap'}, el('span',{class:'pcpn',text:`หน้า ${p/per+1}${side==='back'?' · ด้านหลัง':''}`}),
          el('div',{class:'ppage'}, ...show.map(c=>cardEl(c, side)))));
      }
      info.textContent = `${on.length} ใบ · ${pages} หน้า` + (PC.back==='back' ? ` (และด้านหลังอีก ${pages} หน้า)` : '');
      restore.hidden=!off; restore.textContent=`↩️ เอาการ์ดที่ลบกลับ (${off})`;
      printBtn.disabled=!on.length; printBtn.textContent='🖨️ พิมพ์ / บันทึก PDF';
      if(sideSeg) [...sideSeg.children].forEach(b=>b.classList.toggle('on', b.dataset.side===side));
    };
    printBtn.addEventListener('click',async()=>{
      const on=cards.filter(c=>c.on); if(!on.length) return;
      printBtn.disabled=true; printBtn.textContent='กำลังเตรียม…';
      await printCards(on);
      closeModal(); tally('print_cards');
    });
    m.append(el('div',{class:'pchead'}, el('h3',{text:'👀 ตัวอย่างแฟลชการ์ด'}), sideSeg),
      el('p',{class:'note small',text:'แตะ ✏️ เพื่อแก้คำ หรือ ✕ เพื่อเอาการ์ดออก · แก้เฉพาะการ์ดที่จะพิมพ์ ไม่เปลี่ยนคำในฉาก'}),
      body,
      el('div',{class:'row pcfoot'}, info, restore, el('span',{class:'sp'}),
        el('button',{text:'← ตัวเลือก',onclick:()=>openPrintCards(sc)}), printBtn),
      el('p',{class:'note small',text:'ในหน้าพิมพ์ เลือก “บันทึกเป็น PDF” ถ้าต้องการไฟล์ PDF'}));
    draw();
  });
}
// The part of the scene's picture around a word's box, a little wider, as a JPEG (4:3, at most 640 px wide).
function cardPicture(img, sc, it){
  const k=img.naturalWidth/(sc.w||img.naturalWidth), W=img.naturalWidth, H=img.naturalHeight;
  let x=it.x*k, y=it.y*k, w=Math.max(8,it.w*k), h=Math.max(8,it.h*k);
  const pad=Math.max(w,h)*0.08; x-=pad; y-=pad; w+=pad*2; h+=pad*2;
  if(w/h>4/3){ const nh=w*3/4; y-=(nh-h)/2; h=nh; } else { const nw=h*4/3; x-=(nw-w)/2; w=nw; }
  if(w>W){ w=W; } if(h>H){ h=H; }
  x=Math.max(0,Math.min(W-w,x)); y=Math.max(0,Math.min(H-h,y));
  const cw=Math.round(Math.min(640,w)), ch=Math.round(cw*h/w), c=document.createElement('canvas'); c.width=cw; c.height=ch;
  const g=c.getContext('2d'); g.fillStyle='#fff'; g.fillRect(0,0,cw,ch); g.drawImage(img,x,y,w,h,0,0,cw,ch);
  try{ return c.toDataURL('image/jpeg',0.86); }catch(e){ return ''; }
}
function loadImg(src){ return new Promise(res=>{ const i=new Image(); i.onload=()=>res(i); i.onerror=()=>res(null); i.src=src; }); }
async function printCards(cards){
  const per=PC.size, cols=per===12 ? 3 : 2, rows=4;
  cards=cards.map(c=>({ ...c, pic: c.usePic===false ? '' : c.pic }));
  const sheet=el('div',{id:'printSheet',class:'pc'+per});
  const card=(c, side)=>{
    const kids=!c ? [] : side==='back' ? [el('div',{class:'pm big',text:c.mean})]
      : [c.pic ? el('img',{src:c.pic,alt:''}) : null, el('div',{class:'pw'+(c.pic?'':' big'),text:c.word}), PC.back==='below' && c.mean ? el('div',{class:'pm',text:c.mean}) : null];
    return el('div',{class:'pcard'+(side==='back'?' back':'')+(c?'':' blank'),'data-noi18n':''}, ...kids);
  };
  for(let p=0;p<cards.length;p+=per){
    const page=cards.slice(p,p+per); while(page.length<per) page.push(null);
    sheet.append(el('div',{class:'ppage'}, ...page.map(c=>card(c,'front'))));
    if(PC.back==='back'){   // the back: each row in the opposite order, so a long-edge two-sided print lines up
      const back=[]; for(let r=0;r<rows;r++) back.push(...page.slice(r*cols,(r+1)*cols).reverse());
      sheet.append(el('div',{class:'ppage'}, ...back.map(c=>card(c,'back'))));
    }
  }
  await printNow(sheet);
}
// Print a #printSheet element with the browser (everything else on the page is hidden while printing).
async function printNow(sheet){
  document.getElementById('printSheet')?.remove();
  document.body.append(sheet); document.body.classList.add('printing');
  await Promise.all([...sheet.querySelectorAll('img')].map(i=>i.decode ? i.decode().catch(()=>{}) : null));
  const done=()=>{ document.body.classList.remove('printing'); sheet.remove(); window.removeEventListener('afterprint',done); };
  window.addEventListener('afterprint',done);
  window.print();
  setTimeout(()=>{ if(document.body.classList.contains('printing') && !window.matchMedia('print').matches) done(); }, 60000);
}

export { cardPicture, loadImg, makeCards, openPrintCards, printNow };
