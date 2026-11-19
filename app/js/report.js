// Piccab — 📈 learning reports for teachers and parents.
// The learner's own device works out a summary (days practised, minutes, games, words passed, words that needed
// help, CEFR levels, scenes) and sends it only while they share it with a class or family group
// (POST /api/classes/report). The owner of that group opens it from the group page (Pro).
import { el, ic, LANGS, LOC, S, store, tally } from './core.js';
import { dueWords, wordStats } from './progress.js';
import { closeModal, openModal } from './scene.js';
import { allWords, days, dkey, openFeedback, streak } from './home.js';
import { user } from './account.js';
import { CL, classApi, classErr, renderClass } from './classes.js';
import { CEFR_NAME, cefrRows, myStage, stageById, stageCefr, stageName } from './path.js';
import { accessToken } from './sync.js';

// (var + function declarations: other parts may call these before this part of the script has run)
var RPT={ t:null, sig:null, busy:false };
const MODE_LABEL={ learn:'ดูคำศัพท์', quiz:'ทบทวน (พิมพ์)', find:'ฟังแล้วหา', speak:'ฝึกพูด', sent:'แต่งประโยค', review:'ทบทวนชุดคำ' };
const MODE_UNIT={ learn:'ครั้ง', sent:'ประโยค' };

function reportOn(){ return !!(user && store.get('pv-report-on',false)); }
function setReportOn(on){ store.set('pv-report-on', !!on); if(on){ RPT.sig=null; sendReportSoon(1500); } }
function sendReportSoon(ms){ if(!reportOn()) return; clearTimeout(RPT.t); RPT.t=setTimeout(sendReport, ms||8000); }
async function sendReport(){
  if(!reportOn() || navigator.onLine===false || RPT.busy) return;
  let data; try{ data=buildReport(); }catch(e){ console.warn('report', e); return; }
  const sig=JSON.stringify(data); if(sig===RPT.sig) return;
  RPT.busy=true;
  try{
    const tok=await accessToken(); if(!tok) return;
    const r=await fetch('/api/classes/report',{ method:'POST', keepalive:true, headers:{ 'content-type':'application/json', authorization:'Bearer '+tok }, body:JSON.stringify({ data }) });
    if(r.ok){ RPT.sig=sig; const j=await r.json().catch(()=>({})); if(j.shared===false) store.set('pv-report-on',false); }
  }catch(e){}
  finally{ RPT.busy=false; }
}
document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='hidden' && RPT.t){ clearTimeout(RPT.t); RPT.t=null; sendReport(); } });

const dayKeyOf=n=>{ const d=new Date(n*86400000); return d.getUTCFullYear()+'-'+String(d.getUTCMonth()+1).padStart(2,'0')+'-'+String(d.getUTCDate()).padStart(2,'0'); };
// The summary sent to the teacher / parent. Words are those of the language being practised now.
function buildReport(){
  const list=[], d=new Date(); let week=0, min7=0;
  for(let i=0;i<60;i++){
    const k=dkey(d), x=days[k];
    if(x){ const m=x.m||{}; list.push([k, x.n||0, x.t||0, m.sent||0, m]); if(i<7){ week+=x.n||0; min7+=x.t||0; } }
    d.setDate(d.getDate()-1);
  }
  const W=allWords(S.lang), done=W.filter(w=>w.st!=='todo');
  const by=new Map(); Object.keys(LANGS).forEach(L=>(L===S.lang?W:allWords(L)).forEach(w=>by.set(w.sc.id+'|'+w.pid, w)));
  const ws=Object.entries(wordStats()).map(([k,r])=>[by.get(k), r]).filter(([w,r])=>w && Array.isArray(r));
  const lab=w=>[String(w.it.word||''), String(w.it.th||'')];
  const scs=[]; const seen=new Map();
  W.forEach(w=>{ let r=seen.get(w.sc.id); if(!r){ r=[w.sc.name||'', 0, 0]; seen.set(w.sc.id, r); scs.push(r); } r[2]++; if(w.st!=='todo') r[1]++; });
  return {
    v:1,
    s:{ streak:streak(), week, total:done.length, star:W.filter(w=>w.st==='star').length, min7, last:list.length ? list[0][0] : null },
    stage:myStage(), lang:S.lang,
    words:{ total:W.length, done:done.length, star:W.filter(w=>w.st==='star').length, due:dueWords(W).length },
    days:list,
    weak:ws.filter(([w,r])=>(r[0]|0)>=2).sort((a,b)=>b[1][0]-a[1][0]).slice(0,20).map(([w,r])=>[...lab(w), r[0]|0]),
    learned:ws.filter(([w,r])=>r[1]).sort((a,b)=>b[1][1]-a[1][1]).slice(0,20).map(([w,r])=>[...lab(w), dayKeyOf(r[1])]),
    cefr:cefrRows().map(r=>[r.c, r.known, r.total]),
    scenes:scs.filter(r=>r[1]).concat(scs.filter(r=>!r[1])).slice(0,15),
  };
}

// ---------- the owner's view ----------
function proBadge(plan){
  if(!plan) return null;
  if(plan.pro) return el('span',{class:'propill on',text:'⭐ Pro'});
  return el('span',{class:'propill',text: plan.required ? '🔒 Pro' : '⭐ Pro · ช่วงทดลองใช้ฟรี'});
}
const proLocked=plan=>!!(plan && plan.required && !plan.pro);
function openProInfo(){
  openModal(m=>m.append(el('h3',{text:'⭐ รายงานละเอียดเป็นฟีเจอร์ Pro'}),
    el('p',{text:'ดูได้ว่าลูกหรือนักเรียนฝึกวันไหน กี่นาที เล่นเกมอะไร คำไหนจำได้แล้ว คำไหนยังพลาดบ่อย และไปถึงระดับ CEFR ไหน'}),
    el('p',{class:'note',text:'บัญชีนี้ยังไม่ได้เปิด Pro — ส่งความเห็นบอกทีม Piccab เพื่อขอเปิดใช้'}),
    el('div',{class:'row'}, el('span',{class:'sp'}), el('button',{text:'ปิด',onclick:closeModal}),
      el('button',{class:'primary',text:'💬 ขอเปิด Pro',onclick:()=>{ closeModal(); openFeedback('other'); }}))));
}
const fmtDay=k=>{ if(!k) return ''; const [y,m,d]=k.split('-').map(Number); return new Date(y,m-1,d).toLocaleDateString(LOC,{ day:'numeric', month:'short' }); };
function sinceText(k){
  if(!k) return 'ยังไม่เคยฝึก';
  const [y,m,d]=k.split('-').map(Number), n=Math.round((new Date().setHours(0,0,0,0)-new Date(y,m-1,d).getTime())/86400000);
  return n<=0 ? 'วันนี้' : n===1 ? 'เมื่อวาน' : `${n} วันที่แล้ว`;
}
// one line under a member's name in the group page
function reportLine(s){
  return `🔥 ${s.streak||0} วันติดกัน · 7 วันล่าสุด ${s.week||0} คำ · ผ่านแล้ว ${s.total||0} คำ · ฝึกล่าสุด ${sinceText(s.last)}`;
}
function statTile(icon, value, label, cls){
  return el('div',{class:'rtile'+(cls?' '+cls:'')}, el('span',{class:'ri'}, typeof icon==='string' && icon.length<4 ? icon : ic(icon)), el('b',{text:String(value)}), el('small',{text:label}));
}
function barRow(label, n, max, right, cls){
  const b=el('span',{class:'bar'}, el('i')); b.firstChild.style.width=(max ? Math.max(2, n/max*100) : 0)+'%';
  return el('div',{class:'rbrow'+(cls?' '+cls:'')}, el('span',{class:'rbl',text:label}), b, el('span',{class:'rbn',text:right}));
}
// 30 days of practice: one bar per day (words answered), empty days shown as gaps
function activityChart(daysList){
  const by=new Map(daysList.map(x=>[x[0],x])), cols=[], d=new Date(); let max=1, active=0, mins=0;
  for(let i=29;i>=0;i--){ const t=new Date(d); t.setDate(d.getDate()-i); const k=dkey(t), x=by.get(k); if(x){ active++; mins+=x[2]||0; max=Math.max(max, x[1]||0, 1); } cols.push([k,x,t]); }
  const chart=el('div',{class:'rchart',role:'img','aria-label':`ฝึก ${active} วันใน 30 วัน`});
  cols.forEach(([k,x,t])=>{
    const n=x ? x[1]||0 : 0, h=x ? Math.max(8, n/max*100) : 0;
    chart.append(el('div',{class:'rcol'+(x?' on':'')+(t.getDay()===0?' sun':''),title:x?`${fmtDay(k)} · ${n} คำ · ${x[2]||0} นาที`:fmtDay(k)},
      el('i',{style:`height:${h}%`}), t.getDate()===1 || cols[0][0]===k || t.getDay()===1 ? el('small',{text:String(t.getDate())}) : el('small')));
  });
  return { chart, active, mins };
}
async function openMemberReport(d, mb){
  if(proLocked(d.plan)){ openProInfo(); return; }
  CL.report={ uid:mb.user_id, nickname:mb.nickname, data:null }; tally('report_view'); renderClass(); window.scrollTo(0,0);
  const r=await classApi('GET',`/${d.id}/report/${mb.user_id}`).catch(()=>({ok:false}));
  if(!CL.report || CL.report.uid!==mb.user_id) return;
  CL.report.data = r.ok ? r.j : { error: r.j && r.j.error==='pro_required' ? 'pro' : r.j && r.j.error==='not_shared' ? 'ยังไม่ได้แชร์รายงาน' : r.j && r.j.error==='needs_update' ? 'ต้องรัน SQL 2026-11-reports.sql ใน Supabase ก่อน' : classErr(r) };
  if(S.view==='class') renderClass();
}
function renderReport(v, d){
  const R=CL.report, fam=d.kind==='family';
  v.append(el('div',{class:'clback'}, el('button',{class:'linkbtn',onclick:()=>{ CL.report=null; renderClass(); }}, ic('arrow_back'), fam ? 'กลับไปที่กลุ่มครอบครัว' : 'กลับไปที่ห้องเรียน')));
  v.append(el('div',{class:'ghead lh'}, el('div',{}, el('h2',{text:'📈 '+R.nickname}), el('p',{text: R.data && R.data.updated_at ? 'อัปเดต '+new Date(R.data.updated_at).toLocaleString(LOC,{dateStyle:'medium',timeStyle:'short'}) : 'รายงานการเรียน'})),
    proBadge(d.plan)));
  const X=R.data;
  if(!X){ v.append(el('p',{class:'libempty',text:'กำลังโหลด…'})); return; }
  if(X.error==='pro'){ v.append(el('p',{class:'libempty',text:'รายงานละเอียดเป็นฟีเจอร์ Pro'})); openProInfo(); return; }
  if(X.error){ v.append(el('p',{class:'libempty',text:X.error})); return; }
  const D=X.data;
  if(!D){ v.append(el('p',{class:'libempty',text:`ยังไม่มีรายงาน — รายงานจะส่งมาเมื่อ ${R.nickname} เปิด Piccab และฝึกขณะออนไลน์`})); return; }
  const s=D.s||{}, w=D.words||{}, act=activityChart(D.days||[]);
  v.append(el('div',{class:'rtiles'},
    statTile('local_fire_department-fill', s.streak||0, 'วันติดกัน', 'fire'),
    statTile('event', `${act.active}/30`, 'วันที่ฝึก (30 วัน)'),
    statTile('schedule', s.min7||0, 'นาทีที่ฝึก (7 วัน)'),
    statTile('edit_note', s.week||0, 'คำที่ตอบ (7 วัน)'),
    statTile('task_alt', `${w.done||0}/${w.total||0}`, 'คำที่ผ่านแล้ว', 'ok'),
    statTile('star-fill', w.star||0, 'ตอบถูกเองโดยไม่ใช้ตัวช่วย', 'gold'),
    statTile('autorenew', w.due||0, 'คำที่ถึงรอบทบทวน')));
  v.append(el('p',{class:'note small',text:`ฝึกล่าสุด: ${sinceText(s.last)}`+(D.lang && D.lang!=='en' && LANGS[D.lang] ? ` · ฝึกภาษา${LANGS[D.lang].name}` : '')}));
  // activity
  v.append(el('h3',{class:'psub',text:'การฝึก 30 วันล่าสุด'}), act.chart,
    el('p',{class:'note small',text:`ฝึก ${act.active} วัน · ประมาณ ${act.mins} นาที · ความสูงของแท่ง = จำนวนคำที่ตอบในวันนั้น`}));
  // games
  const modes={}; (D.days||[]).forEach(x=>Object.entries(x[4]||{}).forEach(([k,n])=>modes[k]=(modes[k]||0)+n));
  const mlist=Object.keys(MODE_LABEL).filter(k=>modes[k]);
  if(mlist.length){ const mx=Math.max(...mlist.map(k=>modes[k]));
    v.append(el('h3',{class:'psub',text:'เกมที่เล่น (60 วัน)'}), el('div',{class:'rbars'}, ...mlist.map(k=>barRow(MODE_LABEL[k], modes[k], mx, `${modes[k]} ${MODE_UNIT[k]||'คำ'}`)))); }
  // level
  const st=stageById(D.stage);
  if(st || (D.cefr||[]).length){
    v.append(el('h3',{class:'psub',text:'ระดับ'}));
    if(st) v.append(el('p',{}, 'ระดับชั้นที่เลือก: ', el('b',{'data-noi18n':'',text:`${st.e} ${stageName(st)} · CEFR ${st.cefr}`})));
    if((D.cefr||[]).length) v.append(el('div',{class:'rbars'}, ...D.cefr.map(([c,k,t])=>barRow(CEFR_NAME[c]||c, k, t, `${k}/${t}`, st && stageCefr(st)===c ? 'cur' : ''))),
      el('p',{class:'note small',text:'คำที่ผ่านแล้วในแต่ละระดับ CEFR (นับจากคลังภาพ Piccab และฉากในเครื่องของผู้เรียน)'}));
  }
  // words
  const chips=(list, mk)=>el('div',{class:'rwords'}, ...list.map(mk));
  if((D.weak||[]).length) v.append(el('h3',{class:'psub',text:'คำที่ยังพลาดบ่อย'}),
    chips(D.weak, ([a,b,n])=>el('span',{class:'rw weak'}, el('b',{'data-noi18n':'',text:a}), b?el('small',{'data-noi18n':'',text:b}):null, el('em',{text:'×'+n}))),
    el('p',{class:'note small',text:'คำที่ต้องใช้ตัวช่วย ดูเฉลย หรือพิมพ์ผิดหลายครั้ง — ลองฝึกด้วยกัน หรือพิมพ์เป็นแฟลชการ์ด'}));
  if((D.learned||[]).length) v.append(el('h3',{class:'psub',text:'คำที่เพิ่งจำได้'}),
    chips(D.learned, ([a,b,k])=>el('span',{class:'rw'}, el('b',{'data-noi18n':'',text:a}), b?el('small',{'data-noi18n':'',text:b}):null, el('em',{text:fmtDay(k)}))));
  if((D.scenes||[]).length){ v.append(el('h3',{class:'psub',text:'ฉากที่ฝึก'}),
    el('div',{class:'rbars'}, ...D.scenes.map(([n,dn,t])=>barRow(n, dn, t, `${dn}/${t}`)))); }
  v.append(el('p',{class:'note small',text:'รายงานนี้คำนวณในเครื่องของผู้เรียน และส่งมาเมื่อผู้เรียนเปิดแอปขณะออนไลน์ ผู้เรียนเลิกแชร์ได้ทุกเมื่อ'}));
}

export { openMemberReport, proBadge, proLocked, renderReport, reportLine, sendReportSoon, setReportOn };
