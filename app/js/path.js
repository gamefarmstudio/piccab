// Piccab — 🧭 เส้นทางคำศัพท์: the picture library by school years (ป.1–ม.6, then university and work), each with
// its CEFR level (OBEC targets: A1 by the end of ป.6, A2 by ม.3, B1 by ม.6), how much of the level you know, and
// its topics. Your level is kept on this device (pv-stage).
import { $, el, ic, S, scenes, store, tally, toast, UI } from './core.js';
import { goHome, progOf } from './scene.js';
import { allWords, renderHome } from './home.js';
import { startReview } from './decks.js';
import { catName, GAL, galCard, galMine, loadGallery } from './gallery.js';

// (var + function declarations: the home screen may ask for the path card before this part of the script has run)
var STAGES=[
  { id:'p12',   th:'ป.1–2',               en:'Grades 1–2',          cefr:'Pre-A1', e:'🌱' },
  { id:'p34',   th:'ป.3–4',               en:'Grades 3–4',          cefr:'A1',     e:'🌿' },
  { id:'p56',   th:'ป.5–6',               en:'Grades 5–6',          cefr:'A1',     e:'🌳' },
  { id:'m13',   th:'ม.1–3',               en:'Grades 7–9',          cefr:'A2',     e:'⭐' },
  { id:'m46',   th:'ม.4–6',               en:'Grades 10–12',        cefr:'B1',     e:'🌟' },
  { id:'adult', th:'มหาวิทยาลัย/ทำงาน',   en:'University and work', cefr:'B2+',    e:'🏆' }];
var CEFR_NAME={ preA1:'Pre-A1', A1:'A1', A2:'A2', B1:'B1', B2:'B2', C1:'C1', C2:'C2' };
var PATH={ cat:'all' };

// A word's CEFR level ("pre-A1", "a1" … → preA1, A1 … C2), or '' when unknown; a school year's level as a key.
function cefrKey(v){ const t=String(v==null?'':v).replace(/[\s_-]+/g,'').toLowerCase(); return t==='prea1' ? 'preA1' : /^[abc][12]$/.test(t) ? t.toUpperCase() : ''; }
function stageCefr(st){ return st ? cefrKey(String(st.cefr).replace('+','')) : ''; }
function stageOf(g){ return (g && g.stage) || { beginner:'p12', intermediate:'p56', advanced:'m13' }[g && g.level] || 'p12'; }
function stageById(id){ return (STAGES||[]).find(x=>x.id===id) || null; }
function cefrOf(g){ return CEFR_NAME[g && g.cefr] || (stageById(stageOf(g))||{}).cefr || ''; }
function stageName(st){ return st ? (UI==='en' ? st.en : st.th) : ''; }
function stageLabel(g){ const st=stageById(stageOf(g)); return st ? `${stageName(st)} · ${cefrOf(g)}` : ''; }
function myStage(){ const s=store.get('pv-stage',''); return stageById(s) ? s : ''; }
function setMyStage(id){ store.set('pv-stage', id); PATH.cat='all'; tally('stage:'+id); }

// How much of a library scene you know: the words done in your copy of it.
function galKnown(g){
  const sid=galMine(g.id), sc=sid && scenes().find(x=>x.id===sid); if(!sc) return 0;
  return Math.min(progOf(sc).d, g.word_count||0);
}
function galStars(g){ const k=galKnown(g), n=g.word_count||1; return k>=n ? 3 : k>=n*2/3 ? 2 : k>=n/3 ? 1 : 0; }
function levelSum(id){
  const list=((GAL && GAL.data && GAL.data.scenes)||[]).filter(g=>stageOf(g)===id);
  return { list, words:list.reduce((a,g)=>a+(g.word_count||0),0), known:list.reduce((a,g)=>a+galKnown(g),0) };
}

function renderPath(){
  const v=$('#pathView'); if(!v) return; v.innerHTML='';
  v.append(el('div',{class:'ghead lh'}, el('div',{}, el('h2',{}, ic('auto_stories'), 'เส้นทางคำศัพท์'),
    el('p',{text:'เลือกระดับชั้น แล้วเรียนคำศัพท์ทีละหัวข้อจากคลังภาพ Piccab'}))));
  const me=myStage();
  if(!me){ v.append(pathPicker()); return; }
  if(!GAL.data){ v.append(el('p',{class:'libempty',text:'กำลังโหลด…'})); loadGallery(); return; }
  const st=stageById(me), { list, words, known }=levelSum(me), pct=words ? Math.round(known/words*100) : 0;
  v.append(
    el('div',{class:'fchips pstages',role:'group','aria-label':'ระดับชั้น'}, ...STAGES.map(x=>el('button',{type:'button',class:x.id===me?'on':'',
      onclick:()=>{ setMyStage(x.id); renderPath(); }}, el('span',{'data-noi18n':'',text:`${x.e} ${stageName(x)}`})))),
    el('div',{class:'plevel'},
      el('div',{class:'prow'}, el('b',{'data-noi18n':'',text:`${st.e} ${stageName(st)}`}), el('span',{class:'cefr','data-noi18n':'',text:'CEFR '+st.cefr})),
      el('p',{class:'note',text: list.length ? `รู้แล้ว ${known} / ${words} คำ · ${list.length} ฉาก` : 'ระดับนี้ยังไม่มีฉาก กำลังเพิ่ม'}),
      el('div',{class:'pbar',role:'progressbar','aria-valuemin':'0','aria-valuemax':'100','aria-valuenow':String(pct)}, el('i',{style:`width:${pct}%`}))),
    cefrBlock(stageCefr(st)));
  if(list.length){
    const cats=(GAL.data.categories||[]).filter(c=>list.some(g=>g.category===c.id));
    if(PATH.cat!=='all' && !cats.some(c=>c.id===PATH.cat)) PATH.cat='all';
    const vis=list.filter(g=>PATH.cat==='all' || g.category===PATH.cat);
    v.append(el('h3',{class:'psub',text:'หัวข้อในระดับนี้'}),
      el('div',{class:'ptopics'}, ...cats.map(c=>{
        const gs=list.filter(g=>g.category===c.id), s=gs.reduce((a,g)=>a+galStars(g),0), full=s===gs.length*3;
        return el('button',{type:'button',class:'ptopic'+(PATH.cat===c.id?' on':''),'aria-pressed':PATH.cat===c.id?'true':'false',
            onclick:()=>{ PATH.cat=PATH.cat===c.id ? 'all' : c.id; renderPath(); }},
          el('b',{'data-noi18n':'',text:`${c.emoji} ${catName(c)}`}),
          el('small',{text:`${gs.length} ฉาก · ${gs.reduce((a,g)=>a+(g.word_count||0),0)} คำ`}),
          el('span',{class:'pst'+(full?' full':''),text: full ? '✓ ครบแล้ว' : `★ ${s}/${gs.length*3}`}));
      })),
      el('h3',{class:'psub',text: PATH.cat==='all' ? 'ฉากในระดับนี้' : 'ฉากในหัวข้อนี้'}),
      el('div',{class:'libgrid galgrid'}, ...vis.map(galCard)));
  }
  v.append(el('div',{class:'tile pexam'}, el('span',{class:'ic'}, ic('school')),
    el('span',{}, el('b',{text:'ชุดเตรียมสอบ'}), el('small',{text:'สอบเข้า ม.1, O-NET และอื่น ๆ · เร็ว ๆ นี้'}))));
}
function pathPicker(){
  return el('div',{class:'ppick'}, el('b',{text:'เรียนอยู่ชั้นไหน?'}),
    el('p',{class:'note',text:'เลือกเพื่อดูคำศัพท์ที่เหมาะกับระดับ เปลี่ยนได้ทุกเมื่อ'}),
    el('div',{class:'ppickgrid'}, ...STAGES.map(x=>el('button',{type:'button',onclick:()=>{ setMyStage(x.id); if(S.view==='path') renderPath(); else renderHome(); }},
      el('span',{class:'e','aria-hidden':'true',text:x.e}), el('b',{'data-noi18n':'',text:stageName(x)}), el('small',{'data-noi18n':'',text:'CEFR '+x.cefr})))));
}
// Home: your level and how far you are, opening the path.
function pathTile(){
  const me=myStage(), st=stageById(me);
  const gd=GAL && GAL.data;                 // (GAL: the picture library, set up a little later on first load)
  if(me && GAL && !gd) setTimeout(loadGallery, 0);
  const sum=me && gd ? levelSum(me) : null;
  return el('button',{type:'button',class:'tile ptile',onclick:()=>goHome('path')},
    el('span',{class:'ic'}, ic('auto_stories')),
    el('span',{class:'grow'}, el('b',{text:'เส้นทางคำศัพท์'}),
      el('small',{text: !st ? 'เลือกระดับชั้น ป.1–ม.6 แล้วเรียนทีละหัวข้อ' : sum && sum.words ? `${st.e} ${stageName(st)} · CEFR ${st.cefr} · รู้แล้ว ${sum.known}/${sum.words} คำ` : `${st.e} ${stageName(st)} · CEFR ${st.cefr}`})),
    ic('chevron_right'));
}


// Words by CEFR level: how many of each level you know, out of the level's words in the picture library and your
// own scenes, with a review of that level's words in your scenes (not yet known first).
function cefrRows(){
  const all={}, mine={}, known={};
  const add=(o,c,k)=>{ (o[c]=o[c]||new Set()).add(k); };
  for(const g of (GAL && GAL.data && GAL.data.scenes)||[]) for(const [w,c] of g.wl||[]){ const k=cefrKey(c); if(k) add(all, k, String(w).toLowerCase()); }
  for(const w of allWords()){
    const src=(w.sc.items||{})[w.id], c=src && cefrKey(src.cefr); if(!c) continue;
    const k=String(src.word).toLowerCase(); add(all, c, k);
    (mine[c]=mine[c]||[]).push(w); if(w.st!=='todo') add(known, c, k);
  }
  return Object.keys(CEFR_NAME).filter(c=>all[c] && all[c].size).map(c=>({ c, total:all[c].size, known:known[c] ? known[c].size : 0, words:mine[c]||[] }));
}
function cefrBlock(cur){
  const rows=cefrRows(); if(!rows.length) return null;
  return el('div',{class:'pcefr'}, el('h3',{class:'psub',text:'คำศัพท์ตามระดับ CEFR'}),
    ...rows.map(r=>{ const pct=Math.round(r.known/r.total*100);
      return el('div',{class:'pcrow'+(r.c===cur?' cur':'')},
        el('b',{class:'pcl','data-noi18n':'',text:CEFR_NAME[r.c]}),
        el('div',{class:'pbar'}, el('i',{style:`width:${pct}%`})),
        el('span',{class:'pcn',text:`${r.known}/${r.total}`}),
        el('button',{type:'button',class:'pcgo',text:'ทบทวน',title:`ทบทวนคำระดับ ${CEFR_NAME[r.c]} ในคลังของคุณ`,
          onclick:()=>{ if(!r.words.length){ toast('เก็บฉากระดับนี้เข้าคลังก่อน แล้วค่อยทบทวน'); return; } startReview(r.words); }})); }),
    el('p',{class:'note small',text:'นับคำในคลังภาพ Piccab และฉากของคุณที่มีระดับ CEFR · รู้แล้ว = ผ่านแล้วอย่างน้อยครั้งหนึ่ง'}));
}

export { CEFR_NAME, cefrKey, cefrOf, cefrRows, myStage, pathTile, renderPath, stageById, stageCefr, stageLabel, stageName, stageOf, STAGES };
