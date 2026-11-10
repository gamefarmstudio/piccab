// Piccab app. Built by Vite (npm run build) into dist/ with app.html and app.css.
// Still one big function, exactly as it was inside app.html; it gets split into modules next.
(function(){
'use strict';
// ---------- errors on this device → /api/log (the message and where it happened only; at most 5 per visit) ----------
const ERR={ sent:0, seen:new Set() };
function errPage(){ try{ return S.view+(S.view==='play'?'/'+S.mode:''); }catch(e){ return ''; } }
function reportError(msg, src, line, stack){
  try{
    msg=String(msg||'').slice(0,300);
    // the network going away and browser noise are not bugs
    if(!msg || ERR.sent>=5 || /Failed to fetch|Load failed|NetworkError|AbortError|aborted|ResizeObserver loop|Script error\.?$/i.test(msg)) return;
    const k=msg+'|'+src+'|'+line; if(ERR.seen.has(k)) return; ERR.seen.add(k); ERR.sent++;
    const body=JSON.stringify({ msg, src:String(src||''), line:+line||0, stack:String(stack||'').slice(0,1500), page:errPage() });
    if(!(navigator.sendBeacon && navigator.sendBeacon('/api/log', new Blob([body],{type:'application/json'}))))
      fetch('/api/log',{ method:'POST', headers:{'content-type':'application/json'}, body, keepalive:true }).catch(()=>{});
  }catch(e){}
}
window.addEventListener('error', e=>{ if(e && e.message) reportError(e.message, e.filename, e.lineno, e.error && e.error.stack); });   // pictures that fail to load have no message
window.addEventListener('unhandledrejection', e=>{ const r=e && e.reason; if(r && (r.code || r.status)) return;   // our own {code:…} errors are shown to the person already
  reportError(r && r.message || String(r), '', 0, r && r.stack); });
// ---------- Built-in scene vocabulary ----------
const TEA_ITEMS = {
  'cake-stand':        {word:'3-tier cake stand', say:'three-tier cake stand', th:'ชั้นวางขนม 3 ชั้น', alts:['three tier cake stand','cake stand','tiered cake stand','3 tier stand'], at:[430,56], x:244, y:71, w:372, h:495},
  'macaron':           {word:'macaron', th:'มาการง (ขนมอัลมอนด์ประกบไส้)', at:[350,134], x:346, y:140, w:50, h:38},
  'sponge-cake':       {word:'sponge cake', th:'เค้กสปันจ์ (เค้กเนื้อนุ่มฟู)', at:[360,238], x:328, y:176, w:86, h:74},
  'shortbread':        {word:'shortbread', th:'ชอร์ตเบรด (คุกกี้เนยแบบสกอต)', at:[440,200], x:414, y:194, w:36, h:60},
  'lemon-drizzle-cake':{word:'lemon drizzle cake', th:'เค้กเลมอนราดไอซิ่ง', at:[552,228], x:445, y:191, w:76, h:59},
  'cocktail-umbrella': {word:'cocktail umbrella', th:'ร่มค็อกเทล (ร่มจิ๋วไว้ตกแต่ง)', alts:['paper umbrella','drink umbrella'], at:[506,88], x:454, y:106, w:72, h:100},
  'fruit-scone':       {word:'fruit scone', th:'สโคนผลไม้ (ใส่ลูกเกด)', at:[394,326], x:351, y:336, w:86, h:57},
  'scone':             {word:'scone', th:'สโคน', alts:['plain scone'], at:[318,374], x:279, y:344, w:87, h:55},
  'jam':               {word:'jam', th:'แยม', alts:['jam jar','strawberry jam'], at:[467,372], x:443, y:340, w:48, h:52},
  'clotted-cream':     {word:'clotted cream', th:'คล็อตเท็ดครีม (ครีมข้น ทาคู่กับสโคน)', at:[537,309], x:500, y:320, w:74, h:74},
  'savoury-croissant': {word:'savoury croissant', th:'ครัวซองต์ไส้คาว', alts:['savory croissant','croissant'], at:[316,503], x:262, y:476, w:112, h:60},
  'wholemeal-roll':    {word:'wholemeal roll', th:'ขนมปังโฮลวีตก้อนกลม', alts:['whole meal roll','wholewheat roll','whole wheat roll','bread roll'], at:[418,466], x:384, y:482, w:72, h:55},
  'tea-sandwich':      {word:'tea sandwich', th:'แซนด์วิชชิ้นจิ๋วทานคู่ชา', alts:['finger sandwich','sandwich'], at:[540,470], x:472, y:484, w:114, h:53},
  'teapot':            {word:'teapot', th:'กาน้ำชา', alts:['tea pot'], at:[594,354], x:598, y:311, w:240, h:181},
  'tea-cosy':          {word:'tea cosy', th:'ผ้าคลุมกาน้ำชา (ช่วยเก็บความร้อน)', alts:['tea cozy'], at:[722,402], x:643, y:323, w:159, h:150},
  'sugar-bowl':        {word:'sugar bowl', th:'โถน้ำตาล', at:[115,452], x:65, y:387, w:100, h:102},
  'milk-jug':          {word:'milk jug', th:'เหยือกนม', alts:['creamer','milk pitcher'], at:[216,382], x:174, y:395, w:89, h:91},
  'teacup':            {word:'teacup', th:'ถ้วยชา', alts:['tea cup','cup'], at:[690,585], x:622, y:528, w:164, h:84},
  'saucer':            {word:'saucer', th:'จานรองถ้วย', at:[708,660], x:588, y:594, w:204, h:53},
  'teaspoon':          {word:'teaspoon', th:'ช้อนชา', alts:['tea spoon','spoon'], at:[570,662], x:548, y:616, w:120, h:28},
  'side-plate':        {word:'side plate', th:'จานเล็ก (จานส่วนตัววางขนม)', alts:['small plate'], at:[150,609], x:38, y:584, w:224, h:61},
  'napkin':            {word:'napkin', th:'ผ้าเช็ดปาก', alts:['serviette'], at:[948,646], x:822, y:570, w:172, h:92},
  'table-bell':        {word:'table bell', th:'กระดิ่งตั้งโต๊ะ', alts:['bell','tea bell'], at:[905,584], x:865, y:498, w:80, h:125},
  'vase':              {word:'vase', th:'แจกัน', alts:['flower vase'], at:[904,410], x:854, y:269, w:91, h:177}
};
// The sample scene in German (der/die/das + word; alts = other accepted answers).
const TEA_DE = {
  'cake-stand':['die','Etagere',['Kuchenetagere','Tortenständer']], 'macaron':['das','Macaron',[]], 'sponge-cake':['der','Biskuitkuchen',['Biskuit','Rührkuchen']],
  'shortbread':['das','Shortbread',['Mürbegebäck','Butterkeks']], 'lemon-drizzle-cake':['der','Zitronenkuchen',[]], 'cocktail-umbrella':['der','Cocktailschirm',['Cocktailschirmchen','Schirmchen']],
  'fruit-scone':['der','Rosinenscone',['Scone']], 'scone':['der','Scone',[]], 'jam':['die','Marmelade',['Konfitüre']], 'clotted-cream':['die','Clotted Cream',['Sahne','Rahm']],
  'savoury-croissant':['das','Croissant',['Schinkencroissant','Käsecroissant']], 'wholemeal-roll':['das','Vollkornbrötchen',['Brötchen']], 'tea-sandwich':['das','Sandwich',['Teesandwich']],
  'teapot':['die','Teekanne',['Kanne']], 'tea-cosy':['die','Teehaube',['Teewärmer']], 'sugar-bowl':['die','Zuckerdose',[]], 'milk-jug':['das','Milchkännchen',['Milchkanne','Kännchen']],
  'teacup':['die','Teetasse',['Tasse']], 'saucer':['die','Untertasse',[]], 'teaspoon':['der','Teelöffel',['Löffel']], 'side-plate':['der','Kuchenteller',['Teller','Dessertteller']],
  'napkin':['die','Serviette',[]], 'table-bell':['die','Tischglocke',['Glocke','Klingel']], 'vase':['die','Vase',[]],
};
for(const [k,[a,w,alts]] of Object.entries(TEA_DE)) if(TEA_ITEMS[k]) TEA_ITEMS[k].l={ de:{a, w, alts} };
// a word in another language as stored: {w, a, alts}; null when empty
function cleanLang(l){
  if(!l || typeof l!=='object') return null; const o={};
  for(const lg of Object.keys(LANGS)){ if(lg==='en' || !l[lg] || typeof l[lg]!=='object') continue;
    const w=String(l[lg].w||'').trim().replace(/\s+/g,' ').slice(0,60); if(!w) continue;
    const a=['der','die','das'].includes(String(l[lg].a||'').toLowerCase()) ? String(l[lg].a).toLowerCase() : '';
    o[lg]={w, a, alts:(Array.isArray(l[lg].alts)?l[lg].alts:[]).filter(x=>typeof x==='string'&&x.trim()).slice(0,4).map(x=>x.trim().slice(0,60))};
  }
  return Object.keys(o).length ? o : null;
}
const BUILTIN = [{id:'tea', name:'Afternoon tea ☕', builtin:true, w:1000, h:680, items:TEA_ITEMS}];

// ---------- helpers ----------
const $ = s => document.querySelector(s);
const NS = 'http://www.w3.org/2000/svg';
const svg=$('#scene'), wrap=$('#wrap'), overlay=$('#overlay'), tag=$('#tag'), qcard=$('#qcard'), sub=$('#sub'), chips=$('#chips');
// Phones get a tidier play screen: word card under the picture, one-row word strip, one-row controls.
const MQ=matchMedia('(max-width:640px)'), isMobile=()=>MQ.matches;
const store = {
  get(k,d){ try{ const v=localStorage.getItem(k); return v==null?d:JSON.parse(v); }catch(e){ return d; } },
  set(k,v){ try{ localStorage.setItem(k, JSON.stringify(v)); return true; }catch(e){ return false; } }
};
// ---------- usage counts (totals per day only: no id, scene or words) → /api/usage when the page is hidden ----------
const thaiToday=()=>new Date(Date.now()+7*3600e3).toISOString().slice(0,10);
function usageSend(u){
  const body=JSON.stringify(u);
  try{ if(!(navigator.sendBeacon && navigator.sendBeacon('/api/usage', new Blob([body],{type:'application/json'}))))
    fetch('/api/usage',{ method:'POST', headers:{'content-type':'application/json'}, body, keepalive:true }).catch(()=>{}); }catch(e){}
}
function usageFlush(){
  const u=store.get('pv-usage',null);
  if(!u || !u.events || !Object.keys(u.events).length) return;
  store.set('pv-usage',{ day:u.day, events:{} }); usageSend(u);
}
function tally(ev){
  try{
    let u=store.get('pv-usage',null); const d=thaiToday();
    if(u && u.day!==d){ usageFlush(); u=null; }
    u=u||{ day:d, events:{} }; u.events[ev]=(u.events[ev]||0)+1; store.set('pv-usage',u);
  }catch(e){}
}
document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='hidden') usageFlush(); });
window.addEventListener('pagehide', usageFlush);
// Once a day per device: opened, how long ago it was first opened, menus, installed
function countOpen(){
  const d=thaiToday();
  if(store.get('pv-usage-open','')===d) return;
  store.set('pv-usage-open',d); tally('open');
  let first=store.get('pv-first',null);
  if(first==null){ first=store.get('pv-seen',null) ? '' : d; store.set('pv-first',first); if(first) tally('new_device'); }   // '' = from before counting started
  if(first){ const age=Math.round((Date.parse(d)-Date.parse(first))/86400e3); tally(age<1?'age:0':age<7?'age:1-6':age<30?'age:7-29':'age:30+'); }
  if(window.PV_UI==='en') tally('ui:en');
  if(store.get('pv-lang','en')==='de') tally('lang:de');
  if(window.matchMedia && matchMedia('(display-mode: standalone)').matches) tally('installed');
}
// "My language" (set by the first <script>): menus + meanings. The app is written in Thai; /i18n/en.js swaps it on screen.
const UI = window.PV_UI==='en' ? 'en' : 'th';
const tx = s => window.PV_T ? window.PV_T(s) : s;   // for text that never reaches the screen: files, share text
const LOC = UI==='en' ? 'en-GB' : 'th-TH';
const HL = UI==='en' ? '?hl=en' : '';   // link previews (Line, Facebook…) in the sharer's language
function el(tagName, props, ...kids){
  const e=document.createElement(tagName);
  if(props) for(const k in props){
    if(props[k]==null) continue;                       // { disabled: cond ? '' : null } leaves it off
    if(k==='class') e.className=props[k];
    else if(k.startsWith('on')) e.addEventListener(k.slice(2), props[k]);
    else if(k==='text') e.textContent=props[k];
    else e.setAttribute(k, props[k]);
  }
  kids.flat().forEach(c=>{ if(c!=null) e.append(c.nodeType?c:document.createTextNode(c)); });
  return e;
}
// an icon from the sprite at the top of <body> (e.g. ic('mic'), ic('star-fill','gold'))
function ic(name, cls){
  const s=document.createElementNS('http://www.w3.org/2000/svg','svg'); s.setAttribute('class','ico'+(cls?' '+cls:'')); s.setAttribute('aria-hidden','true');
  const u=document.createElementNS('http://www.w3.org/2000/svg','use'); u.setAttribute('href','#i-'+name); s.append(u); return s;
}
let toastT;
function toast(m, ms){ const t=$('#toast'); t.textContent=m; t.classList.add('show'); clearTimeout(toastT); toastT=setTimeout(()=>t.classList.remove('show'), ms||2800); }
function shuffle(a){ a=a.slice(); for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
// ---------- languages ----------
// The picture and its boxes are the same in every language; each box keeps its words per language:
//   English: it.word / it.alts / it.say (as before)  ·  other languages: it.l[lang] = {w, a(article), alts, say}
//   meanings: it.th (Thai). Progress for a language other than English is kept under "<item>@<lang>".
const LANGS={
  en:{ name:'อังกฤษ', native:'English', flag:'🇬🇧', ph:'เช่น teapot', voices:[['en-GB','🇬🇧 British'],['en-US','🇺🇸 American']], hello:'Hello! Shall we have some tea?' },
  de:{ name:'เยอรมัน', native:'Deutsch', flag:'🇩🇪', ph:'เช่น Teekanne', voices:[['de-DE','🇩🇪 Deutsch (Deutschland)']], articles:['der','die','das'], hello:'Hallo! Trinken wir eine Tasse Tee?' },
};
const langOk=l=>Object.prototype.hasOwnProperty.call(LANGS,l);
// One view object per item and language: reads give that language's word; everything else (box, Thai) is the item itself.
const PXC=new WeakMap();
function itemIn(it, lang){
  if(!it || lang==='en') return it;
  let m=PXC.get(it); if(!m){ m={}; PXC.set(it,m); }
  if(m[lang]) return m[lang];
  const tr=()=>(it.l && it.l[lang]) || null;
  const p=new Proxy(it,{
    get(t,k){
      switch(k){
        case 'word': { const e=tr(); return e&&e.w ? (e.a ? e.a+' '+e.w : e.w) : ''; }
        case 'base': { const e=tr(); return (e&&e.w)||''; }
        case 'art': { const e=tr(); return (e&&e.a)||''; }
        case 'alts': { const e=tr(); return (e&&Array.isArray(e.alts)&&e.alts)||[]; }
        case 'say': { const e=tr(); return (e&&e.say) || (e&&e.w ? (e.a ? e.a+' '+e.w : e.w) : ''); }
        case 'en': return t.word||'';
        case 'th': return UI==='en' ? (t.word||'') : [t.th, t.word].filter(Boolean).join(' · ');      // meaning: Thai + English, or English for English speakers
        case 'lang': return lang;
        default: return t[k];
      }
    },
    set(t,k,v){ t[k]=v; return true; },
  });
  m[lang]=p; return p;
}
// The meaning shown under a word, in the user's own language (none when an English speaker practises English)
const mean=it=> !it ? '' : UI==='en' ? (it.lang ? (it.en||'') : '') : (it.th||'');
function itemsOf(sc, lang){
  lang=lang||S.lang; const src=(sc&&sc.items)||{};
  if(lang==='en') return src;
  const o={}; for(const k of Object.keys(src)) if(src[k]) o[k]=itemIn(src[k], lang); return o;
}
const pk=(id,lang)=>{ lang=lang||S.lang; return lang==='en' ? id : id+'@'+lang; };   // progress key
// German etc.: progress lives under "<id>@<lang>" in the same progress record
function langMap(obj, lang){
  return new Proxy(obj,{
    get:(t,k)=> typeof k==='string' ? t[k+'@'+lang] : t[k],
    set:(t,k,v)=>{ t[k+'@'+lang]=v; return true; },
    has:(t,k)=> typeof k==='string' && (k+'@'+lang) in t,
    deleteProperty:(t,k)=>{ delete t[k+'@'+lang]; return true; },
  });
}
// German letters: ä→ae etc., so a keyboard without umlauts still works (and "a" for "ä" too).
function foldDe(s, loose){ s=String(s).toLowerCase().replace(/ß/g,'ss'); return loose ? s.replace(/ä/g,'a').replace(/ö/g,'o').replace(/ü/g,'u') : s.replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue'); }
const normDe=(s,loose)=>foldDe(s,loose).trim().replace(/[^a-z0-9]/g,'');
// check(v,it) → {ok, art:'right'|'missing'|'wrong'|null}
function check(v, it){
  const lang=it && it.lang;
  if(!lang || lang==='en') return { ok:matches(v,it), art:null };
  if(lang==='de'){
    let t=String(v).trim().replace(/\s+/g,' '), said=null;
    const m=/^(der|die|das)\s+(.+)$/i.exec(t); if(m){ said=m[1].toLowerCase(); t=m[2]; }
    const cands=[it.base].concat(it.alts||[]).filter(Boolean);
    const hit=cands.some(w=>{ const a=normDe(t), b=normDe(w); return !!a && (a===b || normDe(t,true)===normDe(w,true)); });
    if(!hit) return { ok:false, art:null };
    if(!it.art) return { ok:true, art:null };
    if(!said) return { ok:true, art:'missing' };
    // an alternative word may have another article: only the main word's article is checked
    if(normDe(t)!==normDe(it.base) && normDe(t,true)!==normDe(it.base,true)) return { ok:true, art:'right' };
    return said===it.art ? { ok:true, art:'right' } : { ok:false, art:'wrong', said };
  }
  return { ok:false, art:null };
}
const artNote=r=> r.art==='missing' ? ' — ใส่ der/die/das ด้วยจะได้ ★' : '';
function norm(s){ return String(s).toLowerCase().trim().replace(/\bthree\b/g,'3').replace(/cozy/g,'cosy').replace(/savory/g,'savoury').replace(/[^a-z0-9]/g,''); }
function lev(a,b){ const m=a.length,n=b.length; if(!m) return n; if(!n) return m; let p=Array.from({length:n+1},(_,j)=>j); for(let i=1;i<=m;i++){ const c=[i]; for(let j=1;j<=n;j++) c[j]=Math.min(p[j]+1,c[j-1]+1,p[j-1]+(a[i-1]===b[j-1]?0:1)); p=c; } return p[n]; }
function matches(v,it){ const n=norm(v); if(!n) return false; return [it.word].concat(it.alts||[]).some(w=>{ const t=norm(w); return n===t||n===t+'s'||n===t+'es'; }); }

// ---------- state ----------
// Scene metadata lives in localStorage ('pv-scenes2'); pictures live in IndexedDB (much more room).
// Older versions kept pictures inline in 'pv-scenes' — migrated on start (see boot()).
let customs = store.get('pv-scenes2', null) || store.get('pv-scenes', []); if(!Array.isArray(customs)) customs=[];
let progress = store.get('pv-progress', {}); if(typeof progress!=='object'||!progress) progress={};
const S = { lang: langOk(store.get('pv-lang','en')) ? store.get('pv-lang','en') : 'en', view:'home', sceneId: store.get('pv-scene','tea'), mode:'learn', editing:false, showAll:false, allBoxes: !!store.get('pv-allboxes', false) };
let hoverId=null, pinnedId=null, quizId=null, flash=null, flashT=null;
let help={}, used={}, qMiss={};
let find={queue:[],target:null,score:0,total:0,missed:false,showWord:false,lock:false};

const scenes=()=>BUILTIN.concat(customs);
const scene=()=>scenes().find(s=>s.id===S.sceneId)||BUILTIN[0];
const items=()=>itemsOf(scene());
// words that exist in the language being practised (all boxes while editing)
const ids=()=>{ const its=items(); return Object.keys(its).filter(k=>its[k] && (S.editing || its[k].word)); };
const normFor=(s,it)=> it && it.lang==='de' ? normDe(s) : norm(s);
// label while editing: a box without a word in this language shows "＋ (English word)"
const labelOf=it=> it.word || ('＋ '+((it.en!==undefined ? it.en : '') || (it.l && Object.values(it.l).map(x=>x&&x.w).find(Boolean)) || 'ใส่คำ'));
// ---------- spaced repetition ----------
// A passed word is due again after 1, 3, 7, 14, 30, 60, 120 days. Typing it right with no help moves it up a step;
// needing help or a wrong try brings it back a step and asks again tomorrow. Kept inside progress.done (true or {b,d}),
// so it syncs with what already exists and older versions still see the word as passed.
const SRS_DAYS=[1,3,7,14,30,60,120];
const dayNo=(t)=>{ const d=t?new Date(t):new Date(); return Math.floor((d.getTime()-d.getTimezoneOffset()*60000)/86400000); };
function hashStr(x){ let h=2166136261; for(let i=0;i<x.length;i++){ h^=x.charCodeAt(i); h=Math.imul(h,16777619); } return h>>>0; }
// Words passed before this existed: start them at step 1, spread over a few days so nobody gets everything at once.
function srsOf(scId,id){
  const p=progress[scId], v=p && p.done && p.done[id];
  if(!v) return null;
  if(typeof v==='object' && v.d!=null) return {b:Math.max(1,Math.min(SRS_DAYS.length,v.b|0||1)), d:v.d|0};
  const base=p.updatedAt ? dayNo(p.updatedAt) : dayNo()-1;
  return {b:1, d:base+1+hashStr(scId+'|'+id)%4, legacy:true};
}
const srsDue=(scId,id)=>{ const r=srsOf(scId,id); return !!r && r.d<=dayNo(); };
// Called when a word is typed right. clean = no hint/listen/answer and no wrong try.
function srsAnswer(p, scId, id, clean){
  const t=dayNo(), cur=srsOf(scId,id);
  if(!cur){ p.done[id]={b:1, d:t+1}; return; }                         // just learned → see it again tomorrow
  if(cur.d>t){ if(cur.legacy) p.done[id]={b:cur.b, d:cur.d}; return; }  // not due yet: keep the plan
  if(clean){ const b=Math.min(cur.b+1, SRS_DAYS.length); p.done[id]={b, d:t+SRS_DAYS[b-1]}; }
  else p.done[id]={b:Math.max(1,cur.b-1), d:t+1};
}
function dueWords(all){ const t=dayNo(); return (all||allWords()).filter(w=>{ if(w.st==='todo') return false; const r=srsOf(w.sc.id,w.pid); return r && r.d<=t; }); }
function dueOn(day, all){ return (all||allWords()).filter(w=>{ if(w.st==='todo') return false; const r=srsOf(w.sc.id,w.pid); return r && r.d===day; }).length; }
function nextReviewText(scId,id){
  const r=srsOf(scId,id); if(!r) return '';
  const n=r.d-dayNo();
  return n<=0 ? '🔁 ถึงรอบทบทวน' : n===1 ? 'ทบทวนพรุ่งนี้' : n<7 ? `ทบทวนอีก ${n} วัน` : n<30 ? `ทบทวนอีก ${Math.round(n/7)} สัปดาห์` : `ทบทวนอีก ${Math.round(n/30)} เดือน`;
}
function progRaw(){ const id=scene().id; if(!progress[id]) progress[id]={done:{},star:{}}; const p=progress[id]; p.done=p.done||{}; p.star=p.star||{}; return p; }
// progress of the current scene in the language being practised (keys are item ids either way)
function prog(){ const p=progRaw(); return S.lang==='en' ? p : { done:langMap(p.done,S.lang), star:langMap(p.star,S.lang) }; }
function saveProg(){
  const now=Date.now();
  for(const [id,p] of Object.entries(progress)){ if(!p) continue; const g=JSON.stringify([p.done||{},p.star||{}]); if(p._sig!==g){ if(p._sig!==undefined || !p.updatedAt) p.updatedAt=now; Object.defineProperty(p,'_sig',{value:g,writable:true,configurable:true,enumerable:false}); } }
  store.set('pv-progress', progress);
  if(typeof syncSoon==='function') syncSoon();
  if(typeof reportClassProgressSoon==='function') reportClassProgressSoon();
  if(typeof reportFriendStatsSoon==='function') reportFriendStatsSoon();
}
Object.values(progress).forEach(p=>{ if(p) Object.defineProperty(p,'_sig',{value:JSON.stringify([p.done||{},p.star||{}]),writable:true,configurable:true,enumerable:false}); });
// ---------- local persistence ----------
const IDB=(()=>{
  let dbp=null;
  const open=()=>dbp||(dbp=new Promise((res,rej)=>{
    try{ const r=indexedDB.open('piccab',1); r.onupgradeneeded=()=>r.result.createObjectStore('img'); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); }catch(e){ rej(e); }
  }));
  const run=(mode,fn)=>open().then(db=>new Promise((res,rej)=>{ const t=db.transaction('img',mode), q=fn(t.objectStore('img')); t.oncomplete=()=>res(q&&q.result); t.onerror=()=>rej(t.error); t.onabort=()=>rej(t.error); }));
  return { ok: !!window.indexedDB, get:k=>run('readonly',st=>st.get(k)), set:(k,v)=>run('readwrite',st=>st.put(v,k)), del:k=>run('readwrite',st=>st.delete(k)) };
})();
let useIDB=false;                       // decided in boot()
const imgSaved=new Set();               // scene ids whose current picture is already in IndexedDB
const SCENE_FIELDS=['id','name','w','h','items','updatedAt','owner','meta'];
const metaOf=sc=>{ const o={}; SCENE_FIELDS.forEach(k=>{ if(sc[k]!==undefined) o[k]=sc[k]; }); return o; };
const sigOf=sc=>JSON.stringify(sc.meta ? [sc.name,sc.w,sc.h,sc.items,sc.meta] : [sc.name,sc.w,sc.h,sc.items]);
function saveScenes(){
  // Stamp scenes whose content changed, so sync knows what is newer.
  const now=Date.now();
  customs.forEach(sc=>{ const g=sigOf(sc); if(sc._sig!==g){ if(sc._sig!==undefined || !sc.updatedAt) sc.updatedAt=now; Object.defineProperty(sc,'_sig',{value:g,writable:true,configurable:true,enumerable:false}); } });
  let ok;
  if(useIDB){
    ok=store.set('pv-scenes2', customs.map(metaOf));
    customs.forEach(sc=>{ if(sc.img && !imgSaved.has(sc.id)){ imgSaved.add(sc.id); IDB.set(sc.id, sc.img).catch(()=>{ imgSaved.delete(sc.id); toast('บันทึกรูปในเบราว์เซอร์ไม่ได้ (พื้นที่ไม่พอ)', 5000); }); } });
  } else ok=store.set('pv-scenes', customs);
  if(!ok) toast('บันทึกฉากในเบราว์เซอร์ไม่ได้ (พื้นที่ไม่พอ) — กด “🔗 แชร์ฉาก → ส่งเป็นไฟล์” เก็บไว้ก่อนปิดหน้า', 5000);
  if(typeof syncSoon==='function') syncSoon();
}
// Save scenes as they are, without stamping edit times (used by sync).
function persistScenesQuiet(){
  if(!useIDB){ store.set('pv-scenes', customs); return; }
  store.set('pv-scenes2', customs.map(metaOf));
  customs.forEach(sc=>{ if(sc.img && !imgSaved.has(sc.id)){ imgSaved.add(sc.id); IDB.set(sc.id, sc.img).catch(()=>imgSaved.delete(sc.id)); } });
}
function forgetSceneLocal(id){ imgSaved.delete(id); if(useIDB) IDB.del(id).catch(()=>{}); }
async function boot(){
  if(!IDB.ok){ useIDB=false; return; }
  try{
    const legacy=store.get('pv-scenes', null);
    if(Array.isArray(legacy) && !store.get('pv-scenes2', null)){
      // one-time move of inline pictures into IndexedDB
      for(const sc of legacy){ if(sc && sc.img) await IDB.set(sc.id, sc.img); }
      store.set('pv-scenes2', legacy.map(metaOf));
      try{ localStorage.removeItem('pv-scenes'); }catch(e){}
    }
    useIDB=true;
    customs=(store.get('pv-scenes2', [])||[]).filter(sc=>sc && sc.id);
    await Promise.all(customs.map(async sc=>{ const im=await IDB.get(sc.id).catch(()=>null); if(im){ sc.img=im; imgSaved.add(sc.id); } }));
  }catch(e){ useIDB=false; customs=store.get('pv-scenes', [])||[]; }
  customs.forEach(sc=>Object.defineProperty(sc,'_sig',{value:sigOf(sc),writable:true,configurable:true,enumerable:false}));
}

// ---------- speech ----------
let voices=[];
function loadVoices(){ try{ voices = window.speechSynthesis ? speechSynthesis.getVoices() : []; }catch(e){} }
loadVoices();
try{ speechSynthesis.addEventListener('voiceschanged', loadVoices); }catch(e){}
function pickVoice(lang){
  const L=lang.toLowerCase();
  const c=voices.filter(v=>(v.lang||'').replace('_','-').toLowerCase().startsWith(L));
  const base=L.split('-')[0], c2=c.length?c:voices.filter(v=>(v.lang||'').toLowerCase().startsWith(base));
  return c2.find(v=>/google|natural|premium|enhanced|siri|daniel|samantha|serena|anna|helena|markus/i.test(v.name)) || c2[0] || null;
}
let noVoiceWarned=false; const noLangVoice={};
function speak(text, onDone){
  // onDone (optional) fires once when the word has been spoken — or after a safety timeout,
  // since some browsers never fire onend.
  let done=false, fb=null;
  const fin=()=>{ if(done) return; done=true; clearTimeout(fb); if(onDone) onDone(); };
  if(onDone){ const slow=$('#slow').checked; fb=setTimeout(fin, (slow?2600:1600)+String(text||'').length*(slow?260:160)); }
  if(!text){ fin(); return; }
  try{
    if(!window.speechSynthesis){ if(!noVoiceWarned){ noVoiceWarned=true; toast('เบราว์เซอร์นี้เล่นเสียงอ่านไม่ได้'); } return; }
    speechSynthesis.cancel();
    const u=new SpeechSynthesisUtterance(text);
    const lang=$('#accent').value; u.lang=lang;
    const v=pickVoice(lang); if(v) u.voice=v;
    else if(voices.length && !noLangVoice[lang]){ noLangVoice[lang]=true; toast(`เครื่องนี้ไม่มีเสียงอ่าน${(LANGS[S.lang]||{}).name||''} — เบราว์เซอร์อาจอ่านด้วยเสียงอื่น ลองติดตั้งเสียงภาษานี้ในการตั้งค่าเครื่อง`, 5000); }
    u.rate=$('#slow').checked?0.6:0.92;
    u.onend=fin; u.onerror=fin;
    speechSynthesis.speak(u);
  }catch(e){ if(!noVoiceWarned){ noVoiceWarned=true; toast('เล่นเสียงไม่ได้'); } }
}

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
function apShow(id){ pinnedId=id; hoverId=null; setHL(); updateTag(); renderChips(); apCounter(); }
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

// ---------- geometry ----------
function box(id){
  const e=svg.querySelector('.hs[data-id="'+CSS.escape(id)+'"] .box'); if(!e) return null;
  const w=wrap.getBoundingClientRect(), q=e.getBoundingClientRect();
  return {l:q.left-w.left, t:q.top-w.top, r:q.right-w.left, b:q.bottom-w.top, cx:(q.left+q.right)/2-w.left, cy:(q.top+q.bottom)/2-w.top, W:w.width, H:w.height};
}
function anchor(id){
  const it=items()[id]; if(!it) return null;
  let x,y;
  if(it.at){ x=it.at[0]; y=it.at[1]; } else if(it.w!=null){ x=it.x+it.w/2; y=it.y+it.h/2; } else { const b=box(id); return b?{x:b.cx,y:b.cy}:null; }
  const ctm=svg.getScreenCTM(); if(!ctm) return null;
  const p=svg.createSVGPoint(); p.x=x; p.y=y; const q=p.matrixTransform(ctm); const w=wrap.getBoundingClientRect();
  return {x:q.x-w.left, y:q.y-w.top};
}
function clampX(elm, x, W){ const half=elm.offsetWidth/2+4; return Math.max(half, Math.min(W-half, x)); }

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
  const id = S.editing || (S.mode==='learn' && S.showAll) ? null : (flash ? flash.id : (pinnedId || quizId || spkTarget()));
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
  if(S.editing){ S.editing=false; selId=null; saveScenes(); }
  if(aiCtl) aiCtl.abort();
  closeQuiz(true); spkStop(); pinnedId=hoverId=null; flash=null;
  try{ speechSynthesis.cancel(); }catch(e){}
  S.view=(view==='library'||view==='words'||view==='class'||view==='admin')?view:'home'; refresh(); renderGallery(); window.scrollTo(0,0);
}
function openScene(id, mode, edit){
  if(!edit) tally('mode:'+(mode||'learn'));
  apReset();
  recent[id]=Date.now(); lastMode[id]=mode||'learn'; store.set('pv-recent',recent); store.set('pv-lastmode',lastMode); markActive(0);
  S.sceneId=id; store.set('pv-scene',id); help={}; used={}; qMiss={};
  S.view='play'; S.mode=mode||'learn'; S.editing=!!edit; selId=null; S.showAll=false;
  fullRender();
  if(S.mode==='find' && ids().length){ startFind(); renderSub(); }
  if(S.mode==='speak'){ startSpeak(); }
  window.scrollTo(0,0);
}
// ---------- home + library ----------
let recent=store.get('pv-recent',{}); if(typeof recent!=='object'||!recent) recent={};
let lastMode=store.get('pv-lastmode',{}); if(typeof lastMode!=='object'||!lastMode) lastMode={};
let days=store.get('pv-days',{}); if(typeof days!=='object'||!days) days={};
const MODE_NAMES={learn:'ดูคำศัพท์', quiz:'ทบทวน (พิมพ์)', find:'ฟังแล้วหา', speak:'ฝึกพูด'};
const dkey=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
function markActive(words){ const k=dkey(new Date()); if(!days[k]) days[k]={n:0}; days[k].n+=words||0; store.set('pv-days',days); }
function streak(){ const d=new Date(); if(!days[dkey(d)]) d.setDate(d.getDate()-1); let n=0; while(days[dkey(d)]){ n++; d.setDate(d.getDate()-1); } return n; }
function sceneTime(sc){ return recent[sc.id] || (sc.builtin?0:(parseInt(sc.id.slice(1),36)||0)); }
function byRecent(a,b){ return sceneTime(b)-sceneTime(a); }
function greet(){ const h=new Date().getHours(); return h<11?'อรุณสวัสดิ์':h<16?'สวัสดีตอนบ่าย':'สวัสดีตอนเย็น'; }
function renderGallery(){ if(S.view==='library') renderLibrary(); else if(S.view==='words') renderWords(); else if(S.view==='class') renderClass(); else if(S.view==='admin') renderAdmin(); else renderHome(); }

function ago(ts){
  if(!ts) return 'ยังไม่เคยเปิด';
  const sec=(Date.now()-ts)/1000;
  if(sec<90) return 'เมื่อครู่';
  if(sec<3600) return Math.round(sec/60)+' นาทีที่แล้ว';
  if(sec<86400) return Math.round(sec/3600)+' ชั่วโมงที่แล้ว';
  const d=Math.floor(sec/86400);
  if(d===1) return 'เมื่อวานนี้';
  if(d<7) return d+' วันก่อน';
  if(d<14) return 'สัปดาห์ที่แล้ว';
  if(d<60) return Math.floor(d/7)+' สัปดาห์ก่อน';
  return new Date(ts).toLocaleDateString(LOC,{day:'numeric',month:'short'});
}
function progBar(n,d,cls){ const b=el('span',{class:'bar'+(n&&d===n?' full':'')+(cls?' '+cls:'')},el('i')); b.firstChild.style.width=(n?d/n*100:0)+'%'; return b; }
function anchorOf(it){ return it.at ? {x:it.at[0], y:it.at[1]} : (it.w!=null ? {x:it.x+it.w/2, y:it.y+it.h*0.2} : null); }
// Scene image cropped to a frame (like object-fit: cover) with up to 4 word labels that stay on their objects.
function labeledImg(sc, ar){
  const sv=document.createElementNS(NS,'svg');
  sv.setAttribute('viewBox',`0 0 ${sc.w} ${sc.h}`); sv.setAttribute('preserveAspectRatio','xMidYMid slice');
  const im=document.createElementNS(NS,'image');
  im.setAttribute('href',sceneImg(sc)); im.setAttribute('width',sc.w); im.setAttribute('height',sc.h); im.setAttribute('preserveAspectRatio','none');
  sv.appendChild(im);
  const ia=sc.w/sc.h; let vx0=0,vx1=sc.w,vy0=0,vy1=sc.h;
  if(ia>ar){ const vw=sc.h*ar; vx0=(sc.w-vw)/2; vx1=vx0+vw; } else { const vh=sc.w/ar; vy0=(sc.h-vh)/2; vy1=vy0+vh; }
  const VW=vx1-vx0, fs=VW*0.036, picks=[];
  for(const it of (isList(sc) ? [] : Object.values(itemsOf(sc)))){ if(!it.word) continue;   // a word sheet: no labels, they would give the answers away
    const a=anchorOf(it); if(!a) continue;
    if(a.x<vx0+VW*0.1||a.x>vx1-VW*0.1||a.y<vy0+fs*2.2||a.y>vy1-fs*2.2) continue;
    if(picks.some(p=>Math.abs(p.x-a.x)<VW*0.3 && Math.abs(p.y-a.y)<fs*3.6)) continue;
    picks.push({x:a.x,y:a.y,it}); if(picks.length>=4) break;
  }
  // one-line pills "word · meaning" centred on their objects; widths are measured once the picture is on screen
  const hh=fs*1.75, pad=fs*0.6, pills=[];
  for(const {x,y,it} of picks){   // it: in the language being practised
    const th=mean(it).split(' (')[0].slice(0,16);
    const g=document.createElementNS(NS,'g');
    const r=document.createElementNS(NS,'rect');
    Object.entries({height:hh,rx:hh/2,fill:'#fff','fill-opacity':.95,stroke:'#e4dacd','stroke-width':fs*0.04}).forEach(([k,v])=>r.setAttribute(k,v));
    const t=document.createElementNS(NS,'text');
    Object.entries({'font-size':fs,'font-weight':600,fill:'#2d2a5a','font-family':'Fredoka, Sarabun, sans-serif'}).forEach(([k,v])=>t.setAttribute(k,v));
    t.append(it.word);
    if(th){ const s2=document.createElementNS(NS,'tspan');
      Object.entries({'font-size':fs*0.78,'font-weight':400,fill:'#77728c','font-family':'Sarabun, sans-serif',dx:fs*0.45}).forEach(([k,v])=>s2.setAttribute(k,v));
      s2.textContent=th; t.append(s2); }
    g.append(r,t); sv.appendChild(g);
    const guess=it.word.length*0.56*fs + th.length*0.42*fs + (th?fs*0.45:0);
    pills.push({x,y,r,t,guess});
  }
  const place=measure=>pills.forEach(p=>{
    let tw=p.guess; if(measure){ try{ const m=p.t.getComputedTextLength(); if(m>0) tw=m; }catch(e){} }
    const w=tw+pad*2, x0=Math.max(vx0+fs*0.3,Math.min(vx1-w-fs*0.3,p.x-w/2)), y0=Math.max(vy0+fs*0.3,Math.min(vy1-hh-fs*0.3,p.y-hh/2));
    p.r.setAttribute('x',x0); p.r.setAttribute('y',y0); p.r.setAttribute('width',w);
    p.t.setAttribute('x',x0+pad); p.t.setAttribute('y',y0+hh*0.68);
  });
  place(false);
  if(pills.length){ const go=()=>{ if(sv.isConnected) place(true); }; requestAnimationFrame(go); if(document.fonts && document.fonts.ready) document.fonts.ready.then(()=>requestAnimationFrame(go)); }
  return sv;
}
function sceneCard(sc, lib){   // lib: {hit} in the library — adds who made it, when it was opened and a search hit
  const {n,d}=progOf(sc), full=n&&d===n, own=sc.builtin?'ตัวอย่าง':'ของฉัน';
  return el('button',{class:'card'+(lib?' lcard':''),onclick:()=>openPreview(sc.id),'aria-label':'ดูตัวอย่างฉาก '+sc.name},
    el('div',{class:'thumb'}, el('img',{alt:'',loading:'lazy',src:sceneImg(sc)}),
      lib ? el('span',{class:'own '+(sc.builtin?'smp':'mine'),title:own}, ic(sc.builtin?'auto_stories':'person')) : null,
      n?el('span',{class:'cnt'+(full?' full':''),title:`${n} คำ`}, ic(full?'check_circle-fill':'sell-fill'), String(n)):null),
    el('div',{class:'cbody'},
      el('b',{text:sc.name}),
      n ? el('div',{class:'meta2'+(full?' okt':'')}, el('span',{text:`${d}/${n}`}), full ? ic('check_circle') : el('span',{text:Math.round(d/n*100)+'%'}))
        : el('div',{class:'meta2'}, el('span',{text:'ยังไม่มีคำศัพท์'})),
      progBar(n,d),
      lib ? el('span',{class:'ago'}, ic('schedule'), ago(recent[sc.id] || (sc.builtin?0:sceneTime(sc)))) : null,
      lib && lib.hit ? el('span',{class:'hit'}, ic('search'), lib.hit) : null));
}

function reviewTile(){
  const all=allWords(), learned=all.filter(w=>w.st!=='todo').length;
  if(!learned) return el('div',{class:'tile srs idle'},
    el('span',{class:'ic'},ic('autorenew')),
    el('span',{class:'tt'}, el('b',{text:'ทบทวนตามรอบ'}), el('small',{text:'พิมพ์คำให้ผ่าน แล้วคำจะกลับมาตอนใกล้ลืม'})));
  const due=dueWords(all).length;
  if(!due){
    const t=dayNo(); let nd=0, nn=0;
    for(let k=1;k<=120 && !nn;k++){ nn=dueOn(t+k, all); nd=k; }
    return el('div',{class:'tile srs done'},
      el('span',{class:'ic'},ic('task_alt')),
      el('span',{class:'tt'}, el('b',{text:'ทบทวนครบแล้ว'}),
        el('small',{text: nn ? (nd===1?`พรุ่งนี้มี ${nn} คำ`:`อีก ${nd} วันมี ${nn} คำ`) : `จำได้แล้ว ${learned} คำ`})));
  }
  const keep=!days[dkey(new Date())] && streak()>0;
  return el('button',{class:'tile srs due',onclick:startDueReview,'aria-label':`คำที่ต้องทบทวนวันนี้ ${due} คำ`},
    el('span',{class:'ic'},ic('bolt-fill')),
    el('span',{class:'tt'}, el('b',{}, 'ทบทวนด่วน', el('span',{class:'num',text:String(due)})),
      el('small',{text: keep ? `รักษา 🔥 ${streak()} วันติดกัน` : 'คำที่ใกล้ลืม · ครั้งละ 10 คำ'})),
    el('span',{class:'arrow'},ic('arrow_forward')));
}
const MODE_IC={learn:'visibility', quiz:'keyboard', find:'hearing', speak:'mic'};
const MODE_DESC={learn:'แตะภาพ ดูคำ ฟังเสียง', quiz:'พิมพ์ชื่อสิ่งของ', find:'ฟังแล้วแตะให้ถูก', speak:'พูดใส่ไมค์'};
function modeSheet(sc){
  const md=lastMode[sc.id]||'learn';
  openModal(m=>{
    m.classList.add('sheet','modesheet'); $('#modal').classList.add('sheetmode');
    m.append(
      el('div',{class:'shhead'}, el('h3',{text:sc.name}), el('button',{class:'x','aria-label':'ปิด',text:'✕',onclick:closeModal})),
      el('div',{class:'mgrid'}, ['learn','quiz','find','speak'].map(k=>
        el('button',{class:'mopt m-'+k+(k===md?' on':''),'data-mode':k,onclick:()=>{ closeModal(); openScene(sc.id,k); }},
          el('span',{class:'mi'},ic(MODE_IC[k])), el('b',{text:MODE_NAMES[k]}), el('small',{text:MODE_DESC[k]})))),
      el('button',{class:'linkbtn small more',onclick:()=>{ closeModal(); openPreview(sc.id); }}, 'ดูภาพทั้งฉาก', ic('arrow_forward')));
  });
}
const homeCredit=()=> !aiReady ? 'อัปโหลดแล้วตีกรอบใส่คำศัพท์เอง'
  : (aiCredits && user && typeof aiLeft==='number') ? `✨ AI เหลือ ${aiLeft}/${aiMonthly} ครั้งเดือนนี้` : '✨ AI หาคำศัพท์ให้อัตโนมัติ';
function welcomeCard(){
  const step=(icon,text)=>el('li',{}, el('span',{class:'si'},ic(icon)), el('span',{text}));
  return el('div',{class:'welcome'},
    el('button',{class:'x','aria-label':'ไว้ทีหลัง',title:'ไว้ทีหลัง',text:'✕',onclick:()=>{ store.set('pv-welcome-hide',true); renderHome(); }}),
    el('span',{class:'wl-art','aria-hidden':'true'}, ic('photo_camera-fill')),
    el('h3',{text:'สร้างฉากแรกของคุณ'}),
    el('p',{text:'ถ่ายรูปของรอบตัว แล้วฝึกคำศัพท์จากของจริง'}),
    el('ol',{class:'wl-steps'},
      step('photo_camera','ถ่ายรูป'),
      step('sell-fill', aiReady?'AI ใส่ป้ายคำ':'ตีกรอบใส่คำ'),
      step('mic','ดู ฟัง พูด')),
    el('div',{class:'wl-acts'},
      el('button',{class:'primary big',onclick:()=>$('#fileCam').click()}, ic('photo_camera'), 'ถ่ายรูป'),
      el('button',{class:'cbtn',onclick:()=>$('#fileImg').click()}, ic('imagesmode'), 'เลือกรูป')),
    el('p',{class:'capt',id:'homeCredit',text:homeCredit()}),
    el('button',{class:'linkbtn wslink',onclick:()=>openSheetMaker()}, ic('edit_note'), 'มีชีทคำศัพท์จากครู? ทำชุดคำไว้ฝึกก่อนสอบ'));
}
// "Dictation in 3 days": practise the sheet's words (the ones not passed yet first)
function examTile(sc){
  const d=examIn(sc), {n,d:ok}=progOf(sc), words=allWords().filter(w=>w.sc===sc);
  return el('button',{class:'tile exam'+(d<=1?' soon':''),onclick:()=>startReview(words),'aria-label':`${examLabel(d)}: ${sc.name}`},
    el('span',{class:'ic'},ic('event')),
    el('span',{class:'tt'}, el('b',{}, sc.name, el('span',{class:'num when',text:examLabel(d)})),
      el('small',{text: ok>=n && n ? `ผ่านครบ ${n} คำแล้ว · ลองสอบจำลองอีกรอบ` : `ผ่านแล้ว ${ok}/${n} คำ · ฝึกเขียนตามคำบอก`})),
    el('span',{class:'arrow'},ic('arrow_forward')));
}
function statChip(icon, cls, n, label){ return el('span',{class:'stat chip '+cls,role:'img',title:label,'aria-label':label}, ic(icon), el('b',{text:String(n)})); }
function streakPill(){ const p=$('#streakPill'), n=streak(); p.replaceChildren(ic('local_fire_department-fill','fire'), String(n)); p.setAttribute('aria-label',`${n} วันติดกัน`); p.classList.toggle('zero',!n); }
function renderHome(){
  streakPill();
  if(S.lang!=='en') setTimeout(()=>translateAll(S.lang), 300);
  const h=$('#homeView'); h.innerHTML='';
  const all=scenes(), words=allWords();
  const stars=Object.values(progress).reduce((a,p)=>a+Object.keys((p&&p.star)||{}).length,0);
  const today=(days[dkey(new Date())]||{}).n||0, passed=words.filter(w=>w.st!=='todo').length;
  h.append(el('div',{class:'hello'},
    el('h2',{}, el('span',{class:'spark','aria-hidden':'true',text:'✨'}), greet()),
    el('div',{class:'stats'},
      statChip('menu_book','today',today,`วันนี้ฝึก ${today} คำ`),
      statChip('check_circle-fill','ok',passed,`ผ่านแล้ว ${passed} คำ`),
      statChip('star-fill','gold',stars,`จำได้ ${stars} ดาว`))));
  if(installAvailable() && !store.get('pv-install-hide',false)){
    h.append(el('div',{class:'tile install'},
      el('span',{class:'ic'},ic('download')),
      el('span',{}, el('b',{text:'ติดตั้งเป็นแอป'}), el('small',{text:'เปิดจากหน้าจอโฮม ฝึกได้แม้ไม่มีเน็ต'})),
      el('button',{class:'primary',text:'ติดตั้ง',onclick:installApp}),
      el('button',{class:'x','aria-label':'ไม่ต้องแสดงอีก',title:'ไม่ต้องแสดงอีก',text:'✕',onclick:()=>{ store.set('pv-install-hide',true); renderHome(); }})));
  }
  // first visit: nothing of their own yet → invite them to make a scene from a photo
  const firstRun=!all.some(sc=>!sc.builtin) && !store.get('pv-welcome-hide',false);
  if(firstRun) h.append(welcomeCard());
  // continue
  const started=all.filter(sc=>recent[sc.id]).sort(byRecent);
  const cur=started[0]||all.find(sc=>Object.keys(sc.items).length)||all[0];
  if(cur){
    const {n,d}=progOf(cur), md=lastMode[cur.id]||'learn', full=n&&d===n;
    h.append(el('div',{class:'hsec'}, el('h3',{}, ic('play_circle'), started.length?'เรียนต่อ':firstRun?'ลองฉากตัวอย่าง':'เริ่มเรียน'),
      n ? el('span',{class:'hcount'+(full?' full':''),title:`ทบทวนแล้ว ${d}/${n} คำ`}, el('i',{class:'dot'}), `${d}/${n}`) : null));
    const cimg=el('div',{class:'cimg',onclick:()=>openPreview(cur.id),title:'ดูตัวอย่างฉาก'});
    cimg.append(labeledImg(cur, window.innerWidth>=900 ? 1.7 : 3/2));
    h.append(el('div',{class:'cont'}, cimg,
      el('div',{class:'cb'},
        el('div',{class:'row1'}, el('h4',{text:cur.name}),
          n ? el('span',{class:'pct'+(full?' full':''),title:`ทบทวนแล้ว ${d}/${n} คำ`}, ic('check_circle'), Math.round(d/n*100)+'%') : el('span',{text:'ยังไม่มีคำศัพท์'})),
        progBar(n,d,'cbar'),
        el('div',{class:'acts'},
          n ? el('button',{class:'primary big',title:MODE_NAMES[md],onclick:()=>openScene(cur.id,md)},
                ic('play_arrow-fill'), el('span',{text:started.length?'ฝึกต่อ':'เริ่มฝึก'}), el('span',{class:'mtag',title:MODE_NAMES[md]},ic(MODE_IC[md])))
            : el('button',{class:'primary big',onclick:()=>openScene(cur.id,'learn',true)}, ic('edit'), el('span',{text:'ใส่คำศัพท์'})),
          el('button',{class:'icbtn',title:'เลือกโหมด','aria-label':'เลือกโหมด',onclick:()=> n ? modeSheet(cur) : openPreview(cur.id)}, ic('tune'))))));
  }
  // what to practise
  const pend=all.map(sc=>{ const {n,d}=progOf(sc); return {sc, left:n-d, started:!!recent[sc.id]}; }).filter(x=>x.left>0);
  const totalLeft=pend.reduce((a,x)=>a+x.left,0), nScenes=pend.length;
  const exams=all.filter(sc=>{ const d=examIn(sc); return d!==null && d>=0; }).sort((a,b)=>examIn(a)-examIn(b)).slice(0,2);
  if(exams.length) h.append(el('div',{class:'tiles exams'}, exams.map(examTile)));
  h.append(el('div',{class:'tiles'}, reviewTile(),
    totalLeft
      ? el('button',{class:'tile fresh',onclick:()=>startReview(allWords()),'aria-label':`ฝึกคำใหม่ ${totalLeft} คำ`},
          el('span',{class:'ic'},ic('edit_note')),
          el('span',{class:'tt'}, el('b',{}, 'คำใหม่', el('span',{class:'num',text:String(totalLeft)})), el('small',{text:`จาก ${nScenes} ฉาก · ครั้งละ ${Math.min(10,totalLeft)} คำ`})),
          el('span',{class:'arrow'},ic('arrow_forward')))
      : el('div',{class:'tile fresh'}, el('span',{class:'ic'},ic('celebration')), el('span',{class:'tt'}, el('b',{text:'ผ่านครบทุกคำแล้ว'}), el('small',{text:'ลองสร้างฉากใหม่จากรูปรอบตัว'})))));
  if(firstRun){ h.append(feedbackStrip()); return; }   // the welcome card already has the photo buttons, and there are no other scenes yet
  // add a scene
  h.append(el('div',{class:'createrow'},
    el('button',{class:'cbtn',onclick:()=>$('#fileCam').click()}, ic('photo_camera'), 'ถ่ายรูป'),
    el('button',{class:'cbtn',onclick:()=>$('#fileImg').click()}, ic('imagesmode'), 'เลือกรูป'),
    el('button',{class:'cbtn wide',onclick:()=>openSheetMaker()}, ic('edit_note'), 'ชีทคำศัพท์จากครู')));
  h.append(el('p',{class:'capt',id:'homeCredit',text:homeCredit()}));
  // recent
  const list=all.filter(sc=>sc!==cur).sort(byRecent).slice(0,4);
  h.append(el('div',{class:'hsec'}, el('h3',{}, ic('grid_view'), 'ฉากล่าสุด'),
    el('button',{class:'linkbtn more','aria-label':`ดูทั้งหมด ${all.length} ฉาก`,title:`ดูทั้งหมด ${all.length} ฉาก`,onclick:()=>goHome('library')}, String(all.length), ic('arrow_forward'))));
  if(list.length){ const grid=el('div',{class:'grid two'}); list.forEach(sc=>grid.append(sceneCard(sc))); h.append(grid); }
  else h.append(el('p',{class:'empty',text:'ยังไม่มีฉากอื่น ลองถ่ายรูปหรือเลือกรูปเพื่อสร้างฉากแรกของคุณ'}));
  h.append(feedbackStrip());
}
function feedbackStrip(){
  return el('button',{type:'button',class:'fbstrip',onclick:()=>openFeedback()}, el('span',{class:'ic'},ic('chat')),
    el('span',{class:'tt'}, el('b',{text:'ใช้แล้วเป็นอย่างไรบ้าง?'}), el('small',{text:'แจ้งปัญหา หรือบอกไอเดียให้เราได้เลย'})), el('span',{class:'arrow'},ic('arrow_forward')));
}
// 💬 Feedback: a few lines, optionally an e-mail to reply to. Sent with where in the app it came from (and the browser, by the server).
function openFeedback(kind){
  const page=errPage();
  let k=kind||'problem';
  openModal(m=>{
    m.classList.add('fbbox');
    const kinds=[['problem','🐞 แจ้งปัญหา','เกิดอะไรขึ้น? กดอะไรอยู่ตอนนั้น'],['idea','💡 ไอเดีย','อยากให้มีอะไร หรืออยากให้ทำแบบไหน'],['other','💬 อื่นๆ','บอกเราได้เลย']];
    const seg=el('div',{class:'fchips fbkind',role:'group','aria-label':'ประเภท'});
    const ta=el('textarea',{rows:'5',maxlength:'2000','aria-label':'ข้อความ'});
    const drawSeg=()=>{ seg.replaceChildren(...kinds.map(([v,t])=>el('button',{type:'button',class:v===k?'on':'',onclick:()=>{ k=v; drawSeg(); }}, t))); ta.placeholder=kinds.find(x=>x[0]===k)[2]; };
    drawSeg();
    const mail=el('input',{type:'email',maxlength:'200',autocomplete:'email','aria-label':'อีเมลสำหรับตอบกลับ',placeholder:'name@example.com',value:(user && !isStudent() && user.email)||''});
    const err=el('p',{class:'err'});
    const go=el('button',{class:'primary',text:'ส่ง'});
    go.addEventListener('click',async()=>{
      const message=ta.value.trim(); if(!message){ ta.focus(); return; }
      if(navigator.onLine===false){ err.textContent='ต้องต่ออินเทอร์เน็ตก่อนส่ง'; return; }
      go.disabled=true; go.textContent='กำลังส่ง…'; err.textContent='';
      const tok=user ? await accessToken().catch(()=>null) : null;
      const r=await fetch('/api/feedback',{ method:'POST', headers:{ 'content-type':'application/json', ...(tok?{authorization:'Bearer '+tok}:{}) },
        body:JSON.stringify({ kind:k, message, contact:mail.value.trim(), page, ui:UI }) }).catch(()=>null);
      const j=r ? await r.json().catch(()=>({})) : {};
      if(r && r.ok){ tally('feedback'); closeModal(); toast('ส่งแล้ว ขอบคุณมากครับ 🙏', 3500); return; }
      go.disabled=false; go.textContent='ส่ง';
      err.textContent = !r ? 'เชื่อมต่อไม่ได้ ลองใหม่อีกครั้ง'
        : j.error==='rate_limited' ? 'ส่งถี่เกินไป รอสักครู่แล้วลองใหม่'
        : 'ตอนนี้ส่งในแอปไม่ได้ ส่งอีเมลถึง contact@piccab.com แทนได้เลย';
    });
    m.append(el('h3',{}, ic('chat'), 'ส่งความเห็น'),
      el('p',{class:'note',text:'ทุกข้อความมีคนอ่านจริง ช่วยให้ Piccab ดีขึ้นมาก'}),
      seg, ta, el('label',{class:'fbmail'}, el('span',{text:'อีเมลของคุณ สำหรับให้เราตอบกลับ (ไม่บังคับ)'}), mail),
      el('p',{class:'note small',text:'ระบบจะแนบหน้าที่คุณใช้อยู่และรุ่นเบราว์เซอร์ไปด้วย เพื่อช่วยหาสาเหตุ ไม่แนบรูปหรือคำศัพท์ของคุณ'}),
      err, el('div',{class:'row'}, el('span',{class:'sp'}), el('button',{text:'ยกเลิก',onclick:closeModal}), go));
    setTimeout(()=>ta.focus(),50);
  });
}

const LIB={q:'',f:'all',sort:'recent'};
const LIB_LABELS={all:'ทั้งหมด',mine:'ของฉัน',sample:'ตัวอย่าง'}, LIB_IC={all:'apps',mine:'person',sample:'auto_stories'};
function renderLibrary(){
  const q=LIB.q.trim().toLowerCase(), all=scenes();
  const counts={all:all.length, mine:all.filter(sc=>!sc.builtin).length, sample:all.filter(sc=>sc.builtin).length};
  document.querySelectorAll('#libFilters button').forEach(b=>{ b.replaceChildren(ic(LIB_IC[b.dataset.f]), el('span',{class:'fl',text:LIB_LABELS[b.dataset.f]}), el('span',{class:'n',text:String(counts[b.dataset.f])})); b.title=LIB_LABELS[b.dataset.f]; b.classList.toggle('on',b.dataset.f===LIB.f); });
  let list=all.filter(sc=> LIB.f==='mine'?!sc.builtin : LIB.f==='sample'?sc.builtin : true);
  const hits={};
  if(q){
    list=list.filter(sc=>{
      if(sc.name.toLowerCase().includes(q)) return true;
      const w=Object.values(sc.items).find(it=>it.word.toLowerCase().includes(q)||(it.th||'').toLowerCase().includes(q)||(it.alts||[]).some(a=>a.toLowerCase().includes(q)));
      if(w){ hits[sc.id]=w.word; return true; }
      return false;
    });
  }
  if(LIB.sort==='name') list.sort((a,b)=>a.name.localeCompare(b.name));
  else if(LIB.sort==='todo') list.sort((a,b)=>{ const A=progOf(a), B=progOf(b); return (B.n-B.d)-(A.n-A.d); });
  else list.sort(byRecent);
  $('#libCount').textContent = q ? `พบ ${list.length} ฉาก` : `${list.length} ฉาก`;
  const box=$('#libList'); box.innerHTML='';
  if(!list.length){ box.append(el('div',{class:'libempty',text: q?`ไม่พบฉากหรือคำศัพท์ที่ตรงกับ “${LIB.q.trim()}”`:'ยังไม่มีฉากในหมวดนี้'})); return; }
  list.forEach(sc=>box.append(sceneCard(sc,{hit:hits[sc.id]})));
  renderPicLib();
}
// ---------- my words: every word from every scene + a mixed review ----------
// Scene pictures as short blob: URLs, so many small crops can share one decoded image.
const blobImg=new Map();
function imgUrl(sc){
  const src=sceneImg(sc);
  if(!src.startsWith('data:') || src===IMG_PENDING) return src;
  const c=blobImg.get(sc.id); if(c && c.src===src) return c.url;
  if(c) URL.revokeObjectURL(c.url);
  let url=src;
  try{
    const i=src.indexOf(','), head=src.slice(5,i), body=src.slice(i+1), mime=head.split(';')[0]||'image/png';
    let blob;
    if(/;base64$/i.test(head)){ const bin=atob(body), a=new Uint8Array(bin.length); for(let k=0;k<bin.length;k++) a[k]=bin.charCodeAt(k); blob=new Blob([a],{type:mime}); }
    else blob=new Blob([decodeURIComponent(body)],{type:mime});
    url=URL.createObjectURL(blob);
  }catch(e){ url=src; }
  blobImg.set(sc.id,{src,url}); return url;
}
// A square around the object (kept inside the picture when it fits).
function cropBox(sc,it){
  const M=Math.max(sc.w,sc.h);
  let cx,cy,s;
  if(it.w!=null){ cx=it.x+it.w/2; cy=it.y+it.h/2; s=Math.max(it.w,it.h)*1.15; }
  else { const a=anchorOf(it)||{x:sc.w/2,y:sc.h/2}; cx=a.x; cy=a.y; s=M*0.2; }
  s=Math.max(s, M*0.05);
  let x=cx-s/2, y=cy-s/2;
  if(s<=sc.w) x=Math.min(Math.max(x,0), sc.w-s);
  if(s<=sc.h) y=Math.min(Math.max(y,0), sc.h-s);
  return [x,y,s,s];
}
function wordThumb(sc,it,cls,outline){
  const sv=document.createElementNS(NS,'svg'), [x,y,w,h]=cropBox(sc,it);
  sv.setAttribute('viewBox',`${x} ${y} ${w} ${h}`); sv.setAttribute('preserveAspectRatio','xMidYMid meet');
  sv.setAttribute('class',cls||'wd-thumb'); sv.setAttribute('aria-hidden','true');
  const im=document.createElementNS(NS,'image');
  im.setAttribute('href',imgUrl(sc)); im.setAttribute('width',sc.w); im.setAttribute('height',sc.h); im.setAttribute('preserveAspectRatio','none');
  sv.append(im);
  if(outline && it.w!=null){
    // mark which object is meant (neighbours often share the crop)
    const p=w*0.02, sw=w*0.012, g={x:it.x-p, y:it.y-p, w:it.w+2*p, h:it.h+2*p}; g.r=Math.min(Math.min(g.w,g.h)*0.2, w*0.06);
    [['#fff',sw*2.6],['#ef5a78',sw]].forEach(([c,wd])=>{ const r=document.createElementNS(NS,'path'); r.setAttribute('d',rrPath(g)); r.setAttribute('fill','none'); r.setAttribute('stroke',c); r.setAttribute('stroke-width',wd); sv.append(r); });
  }
  return sv;
}
function allWords(lang){
  lang=lang||S.lang; const out=[];
  scenes().slice().sort(byRecent).forEach(sc=>{
    const p=progress[sc.id]||{};
    Object.entries(itemsOf(sc,lang)).forEach(([id,it],k)=>{
      if(!it || !it.word) return;
      const pid=pk(id,lang), st=(p.done&&p.done[pid]) ? ((p.star&&p.star[pid])?'star':'done') : 'todo';
      out.push({sc,id,pid,it,st,k});
    });
  });
  return out;
}
const WD={q:'',f:'all',sort:'scene',limit:120,deck:String(store.get('pv-wdeck','')||'')};
const WD_LABELS={all:'ทั้งหมด',due:'ถึงรอบ',todo:'ยังไม่ผ่าน',done:'ผ่าน',star:'จำได้'};
const WD_IC={all:'apps',due:'autorenew',todo:'radio_button_unchecked',done:'check_circle-fill',star:'star-fill'};
const WD_ST={todo:'ยังไม่ผ่าน',done:'ผ่าน',star:'จำได้'};
const sayWord=it=>it.say||it.word;
// the word as shown: German articles coloured (der blue, die red, das green — the usual classroom colours)
function wordEl(it, tag, prefix){
  const b=el(tag||'b',{}); if(prefix) b.append(prefix);
  if(it && it.art){ b.append(el('span',{class:'art art-'+it.art,text:it.art}),' ',it.base); }
  else b.append(it ? it.word : '');
  return b;
}
// ---------- word decks ("ชุดคำ") ----------
// A deck is a list of "<scene id>|<item id>" keys. "saved" (🔖 เก็บไว้) always shows; it is stored once used.
const SAVED_DECK='saved';
let decks=store.get('pv-decks',[]); if(!Array.isArray(decks)) decks=[];
decks=decks.filter(d=>d && d.id && Array.isArray(d.words));
const deckSig=d=>JSON.stringify([d.name,d.words]);
const dsig=(o,g)=>Object.defineProperty(o,'_sig',{value:g,writable:true,configurable:true,enumerable:false});
decks.forEach(d=>dsig(d,deckSig(d)));
const wkey=(scId,id)=>scId+'|'+id;
const deckName=d=>d.id===SAVED_DECK?'🔖 เก็บไว้':d.name;
const getDeck=id=>decks.find(d=>d.id===id);
function deckList(){ const sv=getDeck(SAVED_DECK)||{id:SAVED_DECK,name:'',words:[],virtual:true}; return [sv].concat(decks.filter(d=>d.id!==SAVED_DECK)); }
function realDeck(d){ if(!d.virtual) return d; let r=getDeck(SAVED_DECK); if(!r){ r={id:SAVED_DECK,name:'',words:[]}; decks.unshift(r); } return r; }
function saveDecks(){
  const now=Date.now();
  decks.forEach(d=>{ const g=deckSig(d); if(d._sig!==g){ if(d._sig!==undefined || !d.updatedAt) d.updatedAt=now; dsig(d,g); } });
  store.set('pv-decks',decks);
  if(typeof syncSoon==='function') syncSoon();
}
function toggleWord(d,k,on){ d=realDeck(d); const i=d.words.indexOf(k); if(on && i<0) d.words.push(k); if(!on && i>=0) d.words.splice(i,1); saveDecks(); return d; }
function newDeck(name){ const d={id:'d'+Date.now().toString(36)+Math.random().toString(36).slice(2,6), name:String(name).trim().slice(0,30), words:[]}; decks.push(d); saveDecks(); return d; }
function deleteDeck(d){
  const i=decks.indexOf(d); if(i<0) return;
  decks.splice(i,1); store.set('pv-decks',decks);
  if(d.owner && user && d.owner===user.id && typeof SYNC!=='undefined'){ SYNC.delDecks.push(d.id); saveSyncMem(); syncSoon(); }
}
const sceneWord=id=>({sc:scene(), id, it:items()[id]});
const isKept=(scId,id)=>{ const k=wkey(scId,id); return decks.some(d=>d.words.includes(k)); };
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
  const inAny=new Set(decks.flatMap(d=>d.words));
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
  modalClose=()=>{ if(after) after(); else if(S.view==='words') updateWords(); };
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
  modalClose=()=>{ if(S.view==='words') updateWords(); };
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
  modalClose=()=>{ RV=null; try{ speechSynthesis.cancel(); }catch(e){} if(S.view==='words') updateWords(); else if(S.view==='home') renderHome(); };
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
    modalClose=()=>{ RV=null; if(S.view==='words') updateWords(); else if(S.view==='home') renderHome(); };
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
  modalClose=()=>{ RV=null; if(S.view==='words') updateWords(); else if(S.view==='home') renderHome(); };
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
        : el('div',{class:'pv-row'}, el('button',{class:'modebtn primary',text: aiReady?'✨ ให้ AI หาคำศัพท์ / ✏️ แก้ไขฉาก':'✏️ เริ่มใส่คำศัพท์',onclick:()=>{ closeModal(); openScene(sc.id,'learn',true); }})),
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

// ---------- edit-mode selection ----------
let selId=null;
function applySel(){
  if(!S.editing || !items()[selId]) selId=null;
  document.body.classList.toggle('has-sel', !!selId && !S.allBoxes);
  document.body.classList.toggle('show-boxes', !S.editing && S.mode==='learn' && S.showAll);
  svg.querySelectorAll('.hs').forEach(g=>g.classList.toggle('sel', g.dataset.id===selId));
  orderHs();
}
function selectBox(id){ selId=id; applySel(); setHL(); updateOverlay(); renderChips(); }
function refresh(){
  galEditBar();
  if(!S.editing) drawMode=false;
  document.body.classList.toggle('editing', S.editing);
  document.body.classList.toggle('drawmode', S.editing && drawMode);
  applySel();
  document.querySelectorAll('#modes button[data-mode]').forEach(b=>{ b.classList.toggle('on', b.dataset.mode===S.mode && !S.editing); b.disabled=S.editing; });
  $('#editBtn').hidden = $('#renameBtn').hidden = scene().builtin || S.editing;
  renderView();
  renderSub(); renderChips(); if(isFs()) fitWrap(); setHL(); updateTag(); updateOverlay();
  if(quizId) positionQ();
}
let practised=store.get('pv-langs',[]); if(!Array.isArray(practised)) practised=[];
practised=practised.filter(l=>l!=='en' && langOk(l)); if(S.lang!=='en' && !practised.includes(S.lang)){ practised.push(S.lang); store.set('pv-langs',practised); }
function langPills(){ const q=$('#qin'); if(q) q.placeholder=`พิมพ์เป็นภาษา${LANGS[S.lang].name}…`; document.querySelectorAll('.langpill').forEach(b=>{ const L=LANGS[S.lang]; b.textContent=L.flag+' '; b.append(el('span',{class:'lname',text:L.name})); b.setAttribute('aria-label','ภาษาที่ฝึก: '+L.name+' — เปลี่ยน'); }); }
function setLang(l){
  if(!langOk(l) || l===S.lang) return;
  apReset(); closeQuiz(true); try{ speechSynthesis.cancel(); }catch(e){}
  S.lang=l; store.set('pv-lang',l); fillAccent(); langPills();
  if(l!=='en' && !practised.includes(l)){ practised.push(l); store.set('pv-langs',practised); }
  help={}; used={}; qMiss={}; selId=null;
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
  if(S.view==='play' && S.lang!=='en' && !S.editing){ const sc=scene(); if(missingIn(sc,S.lang).length) setTimeout(()=>autoTranslate(sc,S.lang),0); } closeQuiz(true); hoverId=pinnedId=null; flash=null; renderScene(); if(S.mode==='find' && find.target && !items()[find.target]) find={...find,queue:[],target:null,total:0,score:0}; renderSelect(); refresh(); }

function setHL(){
  // Only ONE item is highlighted at a time: the one under the pointer, otherwise the clicked/open one.
  const active = hoverId || pinnedId || quizId || spkTarget();
  svg.querySelectorAll('.item').forEach(e=>{
    const id=e.dataset.id;
    const f = flash && flash.id===id ? flash.kind : '';
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
  const id=pinnedId || quizId || spkTarget();
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
  if(id===hoverId) return;
  if(AP.playing && S.mode==='learn' && !S.editing){ hoverId=null; return; }
  hoverId=id;
  // Pointing at a different item releases the previously clicked one, so its frame/label don't linger.
  if(id && pinnedId && id!==pinnedId){ pinnedId=null; renderChips(); }
  setHL(); updateTag();
}
function updateTag(){
  let id=null, pinned=false, kind='';
  if(!S.editing){
    if(flash){ id=flash.id; kind=flash.kind; pinned=true; }
    else if(S.mode==='learn'){ id=hoverId||pinnedId; pinned=!!pinnedId && id===pinnedId; }
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
    if(drawMode){
      overlay.append(el('div',{class:'drawhint'}, el('span',{text:'✏️ ลากล้อมรอบสิ่งของ'}),
        el('button',{text:'ยกเลิก',onclick:e=>{ e.stopPropagation(); setDrawMode(false); }})));
      return;
    }
    const wr=wrap.getBoundingClientRect();
    const at=(x,y)=>{ const p=svg.createSVGPoint(); p.x=x; p.y=y; const q=p.matrixTransform(ctm); return {x:q.x-wr.left, y:q.y-wr.top}; };
    if(selId && sc.items[selId]){
      // Only the selected box: its word + a small action bar.
      const it=itemIn(sc.items[selId],S.lang), top=at(it.x+it.w/2, it.y), bot=at(it.x+it.w/2, it.y+it.h);
      const bar=el('div',{class:'selbar'},
        el('b',{text:labelOf(it)}),
        el('button',{class:'primary',text:'✏️ แก้ไขคำ',onclick:e=>{e.stopPropagation(); openItemForm(selId);}}),
        el('button',{class:'danger',text:'🗑 ลบ','aria-label':'ลบกรอบนี้',onclick:e=>{e.stopPropagation(); delete sc.items[selId]; selId=null; saveScenes(); renderScene(); refresh();}}),
        el('button',{text:'✕','aria-label':'ยกเลิกการเลือก',onclick:e=>{e.stopPropagation(); selectBox(null);}}));
      overlay.append(bar);
      const above = top.y - bar.offsetHeight - 8 > 0;
      bar.classList.toggle('below', !above);
      bar.style.top=(above? top.y-8 : bot.y+8)+'px';
      bar.style.left=clampX(bar, top.x, W)+'px';
      if(!S.allBoxes) return;
    }
    for(const [id,it] of Object.entries(itemsOf(sc))){
      if(id===selId) continue;
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
  flash={id,kind}; clearTimeout(flashT);
  setHL(); updateTag();
  flashT=setTimeout(()=>{ flash=null; setHL(); updateTag(); }, ms||1400);
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
      el('button',{class:'drawbtn'+(drawMode?' on':''),text:drawMode?'✕ ยกเลิกการตีกรอบ':'➕ ตีกรอบคำใหม่',
        title:'ลากกรอบรอบสิ่งของในรูป แล้วพิมพ์คำศัพท์ — ตีทับกรอบเดิมได้',onclick:()=>setDrawMode(!drawMode)}),
      aiReady ? el('button',{class:'ai',text:'✨ ให้ AI หาคำศัพท์',onclick:()=>openAI()}) : null,
      el('button',{class:'toggle'+(S.allBoxes?' on':''),title:'แสดงกรอบและชื่อของทุกชิ้น แม้ตอนเลือกกรอบอยู่',
        text:S.allBoxes?'👁 แสดงกรอบทั้งหมด: เปิด':'👁 แสดงกรอบทั้งหมด: ปิด',
        onclick:()=>{ S.allBoxes=!S.allBoxes; store.set('pv-allboxes',S.allBoxes); refresh(); }}),
      el('label',{class:'namefield'},'📝 ชื่อฉาก', name),
      el('span',{class:'grow'}),
      listBtn(),
      el('button',{text:'🔗 แชร์ฉาก',title:'สร้างลิงก์ หรือส่งเป็นไฟล์ .piccab ให้เพื่อน',onclick:()=>openShare({kind:'scene',sc})}),
      el('button',{class:'danger',text:'🗑 ลบฉาก',onclick:deleteScene}),
      el('button',{class:'primary',text:'✓ เสร็จแล้ว',onclick:()=>{ commitName(); S.editing=false; selId=null; saveScenes(); if(S.mode==='find' && ids().length) startFind(); refresh(); if(!ids().length) toast('ยังไม่มีคำศัพท์ในฉากนี้'); }}),
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
        (!sc.builtin && st!=='student') ? el('button',{text:'✏️ ใส่คำเอง',onclick:()=>{ S.editing=true; selId=null; renderScene(); refresh(); }}) : null,
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
    if(find.target){
      const word = find.showWord ? el('span',{class:'target',text:items()[find.target].word}) : null;
      put(
        el('button',{class:'primary big',text:'🔊 ฟังคำ',onclick:()=>speak(sayOf(find.target))}),
        word,
        el('span',{class:'hint tip',text:'แล้วแตะของชิ้นนั้นในภาพ'}),
        el('span',{class:'grow'}),
        findKeepBtn(),
        el('button',{class:'toggle'+(find.showWord?' on':''),text:find.showWord?'🙈 ซ่อนคำ':'👁 แสดงคำ',onclick:()=>{ find.showWord=!find.showWord; renderSub(); }}),
        el('button',{text:'ข้าม ⏭',onclick:()=>{ find.missed=true; doFlash(find.target,'good',1300); speak(sayOf(find.target)); lockNext(1300); }}),
        el('span',{class:'pill',text:`ถูก ${find.score} • เหลือ ${find.queue.length+1}/${find.total}`})
      );
    } else {
      put(
        el('span',{class:'hint',text:`🎉 จบรอบแล้ว! หาถูกตั้งแต่ครั้งแรก ${find.score}/${find.total} คำ`}),
        el('span',{class:'grow'}),
        findKeepBtn(),
        el('button',{class:'primary',text:'เล่นอีกรอบ',onclick:startFind})
      );
    }
  }
}
// find mode: keep the word just played (the current one is still a secret)
function findKeepBtn(){
  const id=find.last, it=id && items()[id]; if(!it) return null;
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
    if(S.editing){ b.textContent=labelOf(its[id]); if(!its[id].word) b.classList.add('unk'); if(id===selId) b.classList.add('on'); }
    else if(S.mode==='learn' || S.mode==='speak'){ b.textContent=its[id].word; if(id===(S.mode==='speak'?spk.target:pinnedId)) b.classList.add('on'); }
    else{
      if(p.done[id]){ b.textContent=(p.star[id]?'★ ':'✓ ')+its[id].word; b.classList.add('done'); }
      else { b.textContent='คำที่ '+(i+1); b.classList.add('unk'); }
      if(id===quizId) b.classList.add('on');
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
    const cur=S.editing?selId:(pinnedId||quizId);
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
  if(S.editing){ if(id===selId) openItemForm(id); else selectBox(id); return; }
  if(S.mode==='learn'){
    if(AP.on){ apPause(); const i=AP.queue.indexOf(id); if(i>=0) AP.idx=i; apCounter(); }
    pinnedId=id; speak(sayOf(id)); setHL(); updateTag(); renderChips();
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
svg.addEventListener('pointerleave', ()=>{ if(hoverId && !drawing && !drag){ hoverId=null; setHL(); updateTag(); } });
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
  if(!S.editing && !AP.playing){ pinnedId=null; closeQuiz(); setHL(); updateTag(); renderChips(); }
});

// ---------- quiz ----------
function openQuiz(id){
  quizId=id; pinnedId=null; qcard.hidden=false;
  if(listStyle(scene())==='listen') setTimeout(()=>{ if(quizId===id) speak(sayOf(id)); }, 200);
  $('#qin').value=''; setMsg('',''); renderClue(); qKeepBtn();
  setHL(); renderChips(); positionQ();
  setTimeout(()=>{ try{ $('#qin').focus({preventScroll:true}); }catch(e){ $('#qin').focus(); } }, 30);
}
function closeQuiz(silent){ quizId=null; qcard.hidden=true; if(!silent){ setHL(); renderChips(); } }
function positionQ(){
  if(!quizId || window.innerWidth<=640) return;
  const b=box(quizId); if(!b) return;
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
  const it=items()[quizId], lvl=help[quizId]||0;
  if(lvl<1){ c.hidden=true; return; }
  c.hidden=false;
  if(mean(it)) c.append(el('div',{class:'th',text:'ความหมาย: '+mean(it)}));
  c.append(el('div',{class:'pat',text:pattern(it.word, lvl-1)}));
}
function setMsg(kind,text){ const m=$('#qmsg'); m.className='msg'+(kind?' '+kind:''); m.textContent=text; }
function shakeCard(){ qcard.classList.remove('shake'); void qcard.offsetWidth; qcard.classList.add('shake'); }
$('#qform').addEventListener('submit', e=>{
  e.preventDefault();
  const id=quizId; if(!id) return;
  const v=$('#qin').value; if(!v.trim()) return;
  const it=items()[id], res=check(v,it);
  if(res.ok){
    const rp=progRaw(), key=pk(id), clean=!used[id] && !qMiss[id] && res.art!=='missing';
    srsAnswer(rp, scene().id, key, clean); if(clean) rp.star[key]=true; saveProg(); markActive(1);
    setMsg('ok', (clean?'ถูกต้อง! เก่งมาก ★ ':'ถูกต้อง! ✓ ')+it.word+artNote(res));
    speak(sayOf(id));
    updateOverlay(); renderSub();
    setTimeout(()=>{ if(quizId===id){ closeQuiz(); } const pp=prog(); if(ids().every(i=>pp.done[i])) toast('🎉 ทบทวนครบทุกคำแล้ว เก่งมาก!'); }, 1100);
    return;
  }
  qMiss[id]=true;
  if(res.art==='wrong'){ setMsg('bad',`คำถูกแล้ว แต่ไม่ใช่ “${res.said}” — ลองเปลี่ยน der/die/das หรือพิมพ์แค่คำนาม`); shakeCard(); return; }
  const other=ids().find(o=>o!==id && check(v,items()[o]).ok);
  const goal=it.base||it.word, d=lev(normFor(v.replace(/^(der|die|das)\s+/i,''),it), normFor(goal,it));
  if(other) setMsg('bad','คำนี้มีในภาพ แต่เป็นของอีกชิ้นนะ ลองดูใหม่');
  else if(d<=2 && normFor(goal,it).length>3) setMsg('bad','เกือบถูกแล้ว! ลองเช็คตัวสะกดอีกนิด');
  else setMsg('bad','ยังไม่ใช่ ลองอีกครั้ง หรือกด 💡 คำใบ้');
  shakeCard();
});
$('#qhint').addEventListener('click',()=>{
  const id=quizId; if(!id) return;
  const max=normFor(items()[id].word, items()[id]).length;
  const lvl=help[id]||0;
  if(lvl>=max){ setMsg('info','เปิดคำใบ้หมดแล้ว ลองพิมพ์ดูนะ'); return; }
  help[id]=lvl+1; used[id]=true; renderClue(); setMsg('',''); positionQ(); $('#qin').focus();
});
$('#qsay').addEventListener('click',()=>{ if(!quizId) return; if(listStyle(scene())!=='listen') used[quizId]=true; speak(sayOf(quizId)); $('#qin').focus(); });
$('#qshow').addEventListener('click',()=>{
  if(!quizId) return; used[quizId]=true;
  setMsg('info','เฉลย: '+items()[quizId].word+' — ลองพิมพ์ตามเพื่อจำนะ'); speak(sayOf(quizId)); $('#qin').value=''; $('#qin').focus();
});
$('#qclose').addEventListener('click',()=>closeQuiz());
// 🔖 in the quiz card: keep the word in "🔖 เก็บไว้" without showing the answer
function qKeepBtn(){ const b=$('#qkeep'); if(!b || !quizId) return; const on=savedHas(scene().id,quizId); b.classList.toggle('on',on); b.textContent=on?'🔖 เก็บแล้ว':'🔖 เก็บ'; }
$('#qkeep').addEventListener('click',()=>{
  if(!quizId) return;
  const k=wkey(scene().id,quizId), on=!savedHas(scene().id,quizId);
  toggleWord(deckList()[0],k,on); qKeepBtn();
  toast(on?'เก็บคำนี้ไว้ใน 🔖 เก็บไว้ แล้ว — ดูได้ที่หน้าคำของฉัน':'เอาคำนี้ออกจาก 🔖 เก็บไว้ แล้ว');
  $('#qin').focus();
});
function resetQuiz(){
  ask('เริ่มทบทวนฉากนี้ใหม่ทั้งหมด? (ล้างเครื่องหมาย ✓ และ ★)','เริ่มใหม่').then(ok=>{
    if(!ok) return; progress[scene().id]={done:{},star:{}}; help={}; used={}; saveProg(); closeQuiz(); refresh();
  });
}

// ---------- find (listen & tap) ----------
function startFind(){
  find={queue:shuffle(ids()),target:null,score:0,total:ids().length,missed:false,showWord:find.showWord,lock:false};
  nextFind();
}
function nextFind(){
  if(find.target) find.last=find.target;
  find.target=find.queue.shift()||null; find.missed=false; find.lock=false;
  renderSub();
  if(find.target) setTimeout(()=>speak(sayOf(find.target)), 250);
  else speak('Well done!');
}
function lockNext(ms){ find.lock=true; setTimeout(nextFind, ms); }
function findTap(id){
  if(!find.target || find.lock) return;
  if(id===find.target){ if(!find.missed) find.score++; markActive(1); doFlash(id,'good',1000); renderSub(); lockNext(1000); }
  else { find.missed=true; doFlash(id,'bad',1500); }
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

// ---------- modes / buttons ----------
document.querySelectorAll('#modes button[data-mode]').forEach(b=>b.addEventListener('click',()=>{
  apReset(); spkStop(); S.mode=b.dataset.mode; pinnedId=hoverId=null; flash=null; closeQuiz(true); tally('mode:'+S.mode);
  try{ speechSynthesis.cancel(); }catch(e){}
  if(isList(scene())) renderScene();   // a word sheet shows the English words only while learning
  if(S.mode==='find' && ids().length) startFind();
  if(S.mode==='speak') startSpeak();
  refresh();
}));
$('#homeBtn').addEventListener('click',()=>goHome('home'));
$('#brandBtn').addEventListener('click',()=>goHome('home'));
$('#editBtn').addEventListener('click',()=>{ if(scene().builtin) return; if(isList(scene())){ openSheetMaker(scene()); return; } apReset(); S.editing=true; selId=null; closeQuiz(true); pinnedId=hoverId=null; refresh(); });
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
document.addEventListener('keydown',e=>{ if(e.key==='Escape'){ if(AP.playing) apPause(); else if(!$('#modal').hidden) closeModal(); else if(drawMode) setDrawMode(false); else if(S.editing && selId) selectBox(null); else if(quizId) closeQuiz(); else if(isFs()) exitFs(); } });

// ---------- modal ----------
let modalClose=null;
function openModal(build){ const m=$('#mbox'); m.className='mbox'; $('#modal').classList.remove('sheetmode'); m.innerHTML=''; build(m); $('#modal').hidden=false; const f=m.querySelector('input,textarea,button.primary'); if(f) setTimeout(()=>f.focus(),30); }
function closeModal(){ $('#modal').hidden=true; const cb=modalClose; modalClose=null; if(cb) cb(); }
$('#modal').addEventListener('click',e=>{ if(e.target.id==='modal') closeModal(); });
function ask(msg, okText){
  return new Promise(res=>{
    let ans=false;
    modalClose=()=>res(ans);
    openModal(m=>m.append(el('p',{text:msg}), el('div',{class:'row'}, el('span',{class:'sp'}),
      el('button',{text:'ยกเลิก',onclick:closeModal}),
      el('button',{class:'primary',text:okText||'ตกลง',onclick:()=>{ ans=true; closeModal(); }}))));
  });
}

// ---------- editor ----------
let drawing=null, drag=null, drewAt=0;
// ➕ ตีกรอบคำใหม่: the next drag draws a new box anywhere, even on top of other boxes (they can't be moved meanwhile).
var drawMode=false;
function setDrawMode(on){
  drawMode=!!on && S.editing && !scene().builtin; if(drawMode) selId=null; refresh();
  // The button sits under the picture: on phones bring the picture (and the hint on it) back into view.
  if(drawMode && wrap.getBoundingClientRect().top<0) wrap.scrollIntoView({behavior:'smooth', block:'start'});
}
function dragMove(e){
  if(!drag.moved && Math.hypot(e.clientX-drag.sx, e.clientY-drag.sy)<5) return;
  drag.moved=true;
  const sc=scene(), it=sc.items[drag.id]; if(!it) return;
  const p=toSvg(e), dx=p.x-drag.p0.x, dy=p.y-drag.p0.y, o=drag.o, min=Math.max(sc.w,sc.h)*0.015;
  if(drag.mode==='resize'){
    it.w=Math.max(min, Math.min(sc.w-o.x, o.w+dx)); it.h=Math.max(min, Math.min(sc.h-o.y, o.h+dy));
  } else {
    it.x=Math.max(0, Math.min(sc.w-o.w, o.x+dx)); it.y=Math.max(0, Math.min(sc.h-o.h, o.y+dy));
  }
  layoutHs(drag.id); updateOverlay();
}
function toSvg(e){ const p=svg.createSVGPoint(); p.x=e.clientX; p.y=e.clientY; return p.matrixTransform(svg.getScreenCTM().inverse()); }
function updDraft(p){
  if(!drawing) return; const sc=scene();
  const x2=Math.max(0,Math.min(sc.w,p.x)), y2=Math.max(0,Math.min(sc.h,p.y));
  const x=Math.min(drawing.x0,x2), y=Math.min(drawing.y0,y2), w=Math.abs(x2-drawing.x0), h=Math.abs(y2-drawing.y0);
  Object.assign(drawing,{x,y,w,h});
  drawing.r.setAttribute('x',x); drawing.r.setAttribute('y',y); drawing.r.setAttribute('width',w); drawing.r.setAttribute('height',h);
}
svg.addEventListener('pointerdown', e=>{
  if(!S.editing || e.button>0) return;
  e.preventDefault();
  const p=toSvg(e), sc=scene();
  // Hit-test ourselves instead of trusting the topmost element, so overlapping boxes behave:
  //  1) the resize handle of the selected box wins, 2) the selected box wins for dragging,
  //  3) otherwise the smallest box under the pointer is picked.
  const under=drawMode ? [] : boxesAt(p);
  let id=null, mode='move';
  if(drawMode){}
  else if(e.target.classList && e.target.classList.contains('handle') && selId){ id=selId; mode='resize'; }
  else if(selId && under.includes(selId)) id=selId;
  else if(under.length) id=under[0];
  if(id){
    const it=sc.items[id]; if(!it) return;
    drag={id, mode, under, p0:p, o:{x:it.x,y:it.y,w:it.w,h:it.h}, moved:false, sx:e.clientX, sy:e.clientY};
    try{ svg.setPointerCapture(e.pointerId); }catch(_){}
    return;
  }
  const r=document.createElementNS(NS,'rect'); r.setAttribute('class','draft'); svg.appendChild(r);
  drawing={x0:Math.max(0,Math.min(sc.w,p.x)), y0:Math.max(0,Math.min(sc.h,p.y)), r, x:0,y:0,w:0,h:0};
  try{ svg.setPointerCapture(e.pointerId); }catch(_){}
});
function boxesAt(p){
  // ids of boxes containing point p, smallest first
  const live=S.editing ? null : new Set(ids());          // while playing: only words in this language
  return Object.entries(scene().items)
    .filter(([id,it])=>(!live || live.has(id)) && p.x>=it.x && p.x<=it.x+it.w && p.y>=it.y && p.y<=it.y+it.h)
    .sort((a,b)=>a[1].w*a[1].h-b[1].w*b[1].h).map(([id])=>id);
}
function orderHs(){
  // Stack order: big boxes underneath, small ones on top, the selected one above all.
  const its=items();
  const gs=[...svg.querySelectorAll('.hs')];
  gs.sort((a,b)=>{
    if(a.dataset.id===selId) return 1; if(b.dataset.id===selId) return -1;
    const A=its[a.dataset.id], B=its[b.dataset.id];
    return (B?B.w*B.h:0)-(A?A.w*A.h:0);
  });
  gs.forEach(g=>svg.appendChild(g));
}
function endDraw(){
  if(!drawing) return;
  const d=drawing; drawing=null; drewAt=Date.now();
  const sc=scene(), min=Math.max(sc.w,sc.h)*0.015;
  if(d.w<min || d.h<min){ d.r.remove(); if(selId) selectBox(null); else toast(drawMode?'กดค้างแล้วลากให้เป็นกรอบล้อมรอบสิ่งของ':'ลากให้เป็นกรอบล้อมรอบสิ่งของนะ'); return; }
  if(drawMode){ drawMode=false; refresh(); }
  openItemForm(null, {x:Math.round(d.x),y:Math.round(d.y),w:Math.round(d.w),h:Math.round(d.h)}, d.r);
}
svg.addEventListener('pointerup', ()=>{
  if(drag){
    const d=drag; drag=null; drewAt=Date.now();
    const it=scene().items[d.id];
    if(d.moved && it){ ['x','y','w','h'].forEach(k=>it[k]=Math.round(it[k])); saveScenes(); selectBox(d.id); }
    else if(d.id!==selId) selectBox(d.id);       // first tap → just select & show this box only
    else if(d.mode==='move' && d.under.length>1){
      // Tapping the selected box where several boxes overlap → cycle to the next one underneath.
      const i=d.under.indexOf(selId), next=d.under[(i+1)%d.under.length];
      selectBox(next); toast('สลับไปกรอบ “'+labelOf(itemIn(scene().items[next],S.lang))+'” — แตะซ้ำเพื่อสลับต่อ', 1800);
    }
    else if(d.mode==='move') openItemForm(d.id); // second tap on a lone selected box → edit
    return;
  }
  endDraw();
});
svg.addEventListener('pointercancel', ()=>{
  if(drawing){ drawing.r.remove(); drawing=null; }
  if(drag){ const it=scene().items[drag.id]; if(it) Object.assign(it, drag.o); layoutHs(drag.id); drag=null; updateOverlay(); }
});

// ---------- AI auto-labelling (server: POST /api/scan → Gemini or Claude) ----------
let aiReady=false, aiNeedCode=false, aiCredits=false, aiMonthly=30, aiLeft=null, aiCtl=null, aiTimer=null;
function checkAI(){
  return (location.protocol.startsWith('http') ? fetch('/api/health',{cache:'no-store'}).then(r=>r.ok?r.json():null).catch(()=>null) : Promise.resolve(null))
  .then(h=>{
    if(capKey===null) capKey=(h && h.captcha) || '';
    if(!h || !h.ai || aiReady || (user && isStudent())) return;
    aiReady=true; aiNeedCode=!!h.needCode; aiCredits=!!h.credits && !!sb; aiMonthly=h.monthly||30;
    if(aiCredits && user) loadCredits();
    refresh(); if(S.view!=='play') renderGallery();
  });
}
checkAI();
const LEVELS={
  easy:{th:'ง่าย (คำพื้นฐาน)', en:'beginner (CEFR A1–A2): very common everyday nouns'},
  mid:{th:'ปานกลาง', en:'intermediate (CEFR B1): everyday nouns plus some more specific names'},
  hard:{th:'ยาก (คำเฉพาะเจาะจง)', en:'upper-intermediate (CEFR B2–C1): precise, specific names of objects and their parts'}
};
function aiErr(code){
  return ({
    bad_code:'รหัสใช้ AI ไม่ถูกต้อง ลองใหม่อีกครั้ง',
    login_required:'เข้าสู่ระบบเพื่อใช้ AI',
    student_account:'บัญชีนักเรียนใช้ AI ไม่ได้ — ลากกรอบใส่คำเองได้ หรือให้ครู/ผู้ปกครองสร้างฉากด้วย AI แล้วแชร์ให้',
    no_credits:'เครดิต AI เดือนนี้หมดแล้ว',
    rate_limited:'ใช้ AI ถี่เกินไป รอสักครู่แล้วลองใหม่',
    busy:'ตอนนี้ AI มีผู้ใช้งานมาก ลองใหม่ในอีกสักครู่',
    out_of_credit:'เครดิต AI ของระบบหมดชั่วคราว — วาดกรอบเองได้ตามปกติ',
    not_configured:'ระบบ AI ยังไม่พร้อมใช้งาน — วาดกรอบเองได้ตามปกติ',
    bad_image:'ไฟล์รูปนี้ส่งให้ AI ไม่ได้ ลองใช้รูปอื่น',
    image_too_large:'รูปใหญ่เกินไป ลองใช้รูปที่เล็กลง',
    image_rejected:'รูปนี้ส่งให้ AI ไม่ได้ ลองใช้รูปอื่น',
    refused:'AI วิเคราะห์รูปนี้ไม่ได้ ลองใช้รูปอื่น',
    invalid_json:'AI ตอบกลับมาไม่ครบ ลองกด ✨ ใหม่อีกครั้ง',
    offline:'เชื่อมต่ออินเทอร์เน็ตไม่ได้ ลองใหม่อีกครั้ง'
  })[code] || 'เกิดข้อผิดพลาด ลองกด ✨ ใหม่อีกครั้ง';
}
// Ask once for the beta access code (stored on this device).
function askCode(again){
  return new Promise(res=>{
    let ans=null;
    modalClose=()=>res(ans);
    const inp=el('input',{placeholder:'รหัสใช้ AI',autocapitalize:'none',spellcheck:'false',autocomplete:'off'});
    const ok=()=>{ const v=inp.value.trim(); if(!v) return inp.focus(); ans=v; closeModal(); };
    inp.addEventListener('keydown',e=>{ if(e.key==='Enter') ok(); });
    openModal(m=>m.append(
      el('h3',{text:'🔑 รหัสใช้ AI'}),
      el('p',{text: again ? 'รหัสไม่ถูกต้อง ลองพิมพ์อีกครั้ง' : 'ช่วงทดลอง ระบบ AI เปิดให้เฉพาะผู้ที่มีรหัส ใส่ครั้งเดียว เครื่องนี้จะจำไว้'}),
      inp,
      el('div',{class:'row'}, el('span',{class:'sp'}),
        el('button',{text:'ยกเลิก',onclick:closeModal}),
        el('button',{class:'primary',text:'ตกลง',onclick:ok}))));
  });
}
// Shown wherever a picture may go to the AI: say it is AI, and keep people / personal info out of the pictures.
function aiNotice(){
  return el('p',{class:'note ainote'}, '🤖 รูปจะถูกส่งให้ AI (Google Gemini) และคำศัพท์สร้างโดย AI อาจผิดได้ · ถ่ายเฉพาะสิ่งของ ไม่ถ่ายคนหรือข้อมูลส่วนตัว · ', el('a',{href:'/privacy#ai',target:'_blank',text:'อ่านเพิ่ม'}));
}
function openAI(){
  const sc=scene(); if(sc.builtin) return;
  const has=Object.keys(sc.items).length;
  openModal(m0=>{
    const m={append:(...k)=>m0.append(...k.filter(x=>x!=null))};
    const cnt=el('select',{}); [10,15,20,25,30].forEach(n=>cnt.add(new Option(n+' คำ', n))); cnt.value=String(store.get('pv-ai-count',20));
    const lv=el('select',{}); Object.entries(LEVELS).forEach(([k,v])=>lv.add(new Option(v.th,k))); lv.value=store.get('pv-ai-level','mid');
    const add=el('input',{type:'radio',name:'aimode',value:'add'}), rep=el('input',{type:'radio',name:'aimode',value:'replace'});
    (has?add:rep).checked=true;
    m.append(
      el('h3',{text:'✨ ให้ AI หาคำศัพท์ในรูป'}),
      el('p',{text:'AI จะดูรูป ตีกรอบรอบสิ่งของ และใส่คำศัพท์พร้อมคำแปลให้ จากนั้นคุณแก้ไขหรือย้ายกรอบได้'}),
      aiNotice(),
      (aiCredits && user && typeof aiLeft==='number') ? el('p',{class:'note',text:`✨ เครดิต AI เดือนนี้เหลือ ${aiLeft} / ${aiMonthly} ครั้ง (ใช้ 1 ครั้งต่อรูป)`}) : null,
      el('label',{},'จำนวนคำสูงสุด', cnt),
      el('label',{},'ระดับคำศัพท์', lv),
      has ? el('div',{}, el('label',{class:'opt'}, add, 'เพิ่มต่อจากคำที่มีอยู่ ('+has+' คำ)'), el('label',{class:'opt'}, rep, 'ลบคำเดิมทั้งหมดแล้วสร้างใหม่')) : null,
      el('div',{class:'row'}, el('span',{class:'sp'}),
        el('button',{text:'ยกเลิก',onclick:closeModal}),
        el('button',{class:'primary',text:'✨ เริ่มเลย',onclick:()=>{
          const opts={count:+cnt.value, level:lv.value, replace:!has||rep.checked};
          store.set('pv-ai-count',opts.count); store.set('pv-ai-level',opts.level);
          closeModal(); runAI(opts);
        }}))
    );
  });
}
function showBusy(on){
  $('#busy').hidden=!on; clearInterval(aiTimer);
  if(on){
    const t0=Date.now(); $('#busyTime').textContent='ปกติใช้เวลาประมาณ 20–60 วินาที';
    aiTimer=setInterval(()=>{ $('#busyTime').textContent=`ผ่านไป ${Math.round((Date.now()-t0)/1000)} วินาที (ปกติ 20–60 วินาที)`; },1000);
  }
}
$('#aiStop').addEventListener('click',()=>{ if(aiCtl) aiCtl.abort(); });
async function runAI({count=20, level='mid', replace=true}={}){
  const sc=scene();
  if(!aiReady){ toast('ตอนนี้ใช้ AI ไม่ได้ — ลากกรอบบนรูปเพื่อใส่คำศัพท์เองได้'); return; }
  if(sc.builtin || aiCtl) return;
  if(navigator.onLine===false){ toast('ต้องต่ออินเทอร์เน็ตก่อนใช้ AI — ระหว่างนี้ลากกรอบใส่คำศัพท์เองได้', 4000); return; }
  // Signed-in users use their monthly credits; otherwise sign in (or a tester's access code).
  const tok = (aiCredits && user) ? await accessToken() : null;
  let code = tok ? '' : store.get('pv-ai-code','');
  if(!tok){
    if(aiCredits && !(aiNeedCode && code)){
      const how = await askLoginForAI(); if(!how) return;
      if(how==='login'){ openLogin(); return; }
      code = how;
    } else if(aiNeedCode && !code){ code=await askCode(false); if(!code) return; }
    if(code) store.set('pv-ai-code',code);
  }
  if(tok && aiLeft===0){ toast(`เครดิต AI เดือนนี้หมดแล้ว (${aiMonthly} ครั้ง/เดือน) — เริ่มใหม่วันที่ 1 ของเดือนหน้า ระหว่างนี้ลากกรอบใส่คำเองได้`, 6000); return; }
  const existing = replace ? [] : Object.values(sc.items).map(i=>i.word);
  aiCtl=new AbortController(); showBusy(true);
  let retryCode=false;
  try{
    let r;
    try{
      r=await fetch('/api/scan',{method:'POST', signal:aiCtl.signal,
        headers:{'content-type':'application/json', ...(tok?{authorization:'Bearer '+tok}:{}), ...(code?{'x-piccab-code':code}:{})},
        body:JSON.stringify({image:sc.img, count, level, existing, langs:practised})});
    }catch(e){ throw {code: e && e.name==='AbortError' ? 'cancelled' : 'offline'}; }
    const data=await r.json().catch(()=>({}));
    if(typeof data.credits_left==='number') aiLeft=data.credits_left;
    if(!r.ok) throw {code:data.error||'error'};
    tally('ai_scene');
    const arr=Array.isArray(data.items)?data.items:[];
    if(replace) sc.items={};
    const seen=new Set(Object.values(sc.items).map(i=>norm(i.word)));
    let added=0;
    for(const r of arr){
      if(!r || typeof r.word!=='string' || !Array.isArray(r.box) || r.box.length<4) continue;
      const word=r.word.trim().replace(/\s+/g,' ').slice(0,60); const key=norm(word);
      if(!key || seen.has(key)) continue;
      const b=r.box.slice(0,4).map(v=>Math.max(0,Math.min(1000,Number(v))));
      if(b.some(v=>!Number.isFinite(v))) continue;
      const x0=Math.min(b[0],b[2]), x1=Math.max(b[0],b[2]), y0=Math.min(b[1],b[3]), y1=Math.max(b[1],b[3]);
      if(x1-x0<8 || y1-y0<8) continue;
      seen.add(key);
      sc.items['h'+Date.now().toString(36)+Math.random().toString(36).slice(2,6)]={
        word, th:String(r.th||'').trim().slice(0,120),
        alts:Array.isArray(r.alts)?r.alts.filter(a=>typeof a==='string'&&a.trim()).slice(0,4).map(a=>a.trim().slice(0,60)):[],
        x:Math.round(x0/1000*sc.w), y:Math.round(y0/1000*sc.h), w:Math.round((x1-x0)/1000*sc.w), h:Math.round((y1-y0)/1000*sc.h)
      };
      { const lw=cleanLang(r.l), keys=Object.keys(sc.items); if(lw) sc.items[keys[keys.length-1]].l=lw; }
      added++;
    }
    saveScenes(); help={}; used={}; if(replace){ progress[sc.id]={done:{},star:{}}; saveProg(); }
    if(scene()===sc){ renderScene(); refresh(); }
    toast((added ? `✨ ได้คำศัพท์ ${added} คำ — ตรวจดูกรอบ ลากย้าย/ปรับขนาด หรือแตะเพื่อแก้คำได้ แล้วกด ✓ เสร็จแล้ว` : 'AI ไม่พบสิ่งของใหม่ในรูปนี้')+(data.model?` · AI: ${data.model}`:'')+(typeof data.credits_left==='number'?` · เครดิต AI เหลือ ${data.credits_left}`:''), 6000);
  }catch(e){
    const c=e && e.code;
    if(c==='bad_code'){ store.set('pv-ai-code',''); aiNeedCode=true; retryCode=true; }
    else if(c==='login_required'){ store.set('pv-ai-code',''); openLogin(); toast('เข้าสู่ระบบเพื่อใช้ AI', 4000); }
    else if(c==='no_credits'){ aiLeft=0; toast(`เครดิต AI เดือนนี้หมดแล้ว (${aiMonthly} ครั้ง/เดือน) — เริ่มใหม่วันที่ 1 ของเดือนหน้า ระหว่างนี้ลากกรอบใส่คำเองได้`, 6000); }
    else if(c!=='cancelled') toast(aiErr(c), 5000);
    if(c==='not_configured'){ aiReady=false; refresh(); }
  }finally{ aiCtl=null; showBusy(false); }
  if(retryCode){
    const c2=await askCode(true);
    if(c2){ store.set('pv-ai-code',c2); runAI({count, level, replace}); }
  }
}

// ---------- words in another language, prepared by the app itself ----------
// A scene that has English words but none (or only some) in the language being practised is translated in the
// background: words only, no picture, no AI credit. Runs when you switch language, open such a scene, or add
// English words while also practising another language. Students and signed-out users type them (or ask the teacher).
const TL={}, TLfail={};
const missingIn=(sc,lang)=>Object.entries((sc&&sc.items)||{}).filter(([k,it])=>it && it.word && !(it.l && it.l[lang] && it.l[lang].w));
function autoLangState(sc){
  if(!sc || sc.builtin) return 'no';
  if(!aiReady) return 'noai';
  if(isStudent()) return 'student';
  const code=store.get('pv-ai-code','');
  if(aiCredits) return (user || code) ? 'ok' : 'login';
  if(aiNeedCode) return code ? 'ok' : 'login';
  return 'ok';
}
const translating=(sc,lang)=>!!(sc && TL[sc.id+'@'+(lang||S.lang)]);
function autoTranslate(sc, lang){
  const key=sc.id+'@'+lang;
  if(TL[key]) return TL[key];
  if(TLfail[key] && Date.now()-TLfail[key]<10*60e3) return Promise.resolve(-1);
  const miss=missingIn(sc,lang);
  if(!miss.length || autoLangState(sc)!=='ok' || navigator.onLine===false) return Promise.resolve(0);
  TL[key]=(async()=>{
    let n=0;
    try{
      const tok=(aiCredits && user) ? await accessToken() : null, code=tok ? '' : store.get('pv-ai-code','');
      for(let i=0;i<miss.length;i+=80){
        const words=miss.slice(i,i+80).map(([k,it])=>({k, en:it.word, th:it.th||''}));
        const r=await fetch('/api/translate',{method:'POST', headers:{'content-type':'application/json', ...(tok?{authorization:'Bearer '+tok}:{}), ...(code?{'x-piccab-code':code}:{})}, body:JSON.stringify({lang, words})});
        const data=await r.json().catch(()=>({}));
        if(!r.ok) throw new Error(data.error||'error');
        for(const t of (Array.isArray(data.items)?data.items:[])){
          const it=sc.items[t.k], lw=cleanLang({[lang]:t});
          if(!it || !lw || (it.l && it.l[lang] && it.l[lang].w)) continue;    // never overwrite a word someone typed
          it.l={...(it.l||{}), ...lw}; n++;
        }
      }
      if(n) saveScenes();
      delete TLfail[key];
    }catch(e){ console.warn('translate', e); TLfail[key]=Date.now(); n=n||-1; }
    finally{
      delete TL[key];
      if(S.view==='play' && scene()===sc && S.lang===lang){ renderScene(); refresh(); if(S.mode==='find' && ids().length && !(find && find.target)) startFind(); }
      else if(S.view!=='play') renderGallery();
    }
    return n;
  })();
  if(S.view==='play' && scene()===sc) refresh();       // shows "กำลังเตรียมคำ…"
  return TL[key];
}
// all your own scenes, one after another (after switching language, or on the home page)
let tlAllRun=null;
function translateAll(lang){
  if(tlAllRun) return tlAllRun;
  const list=scenes().filter(sc=>!sc.builtin && missingIn(sc,lang).length);
  if(!list.length || autoLangState(list[0])!=='ok') return Promise.resolve(0);
  tlAllRun=(async()=>{ let done=0; for(const sc of list){ const n=await autoTranslate(sc,lang); if(n>0) done++; } return done; })()
    .then(done=>{ tlAllRun=null; if(done) toast(`✨ เตรียมคำภาษา${LANGS[lang].name}ให้ ${done} ฉากแล้ว`, 3500); return done; });
  return tlAllRun;
}
// kept for the manual "try again" button
function translateScene(sc, lang){ delete TLfail[sc.id+'@'+lang]; return autoTranslate(sc, lang).then(n=>{ if(n<0) toast('แปลไม่สำเร็จ ลองใหม่อีกครั้ง หรือใส่คำเองด้วย ✏️', 4000); }); }
function openItemForm(id, rect, draftEl){
  if(S.lang!=='en') return openItemFormLang(id, rect, draftEl, S.lang);
  const sc=scene(); if(sc.builtin) return;
  const it=id?sc.items[id]:null;
  modalClose=()=>{ if(draftEl) draftEl.remove(); };
  openModal(m=>{
    const w=el('input',{class:'word',value:it?it.word:'',placeholder:'เช่น teapot',autocapitalize:'none',spellcheck:'false'});
    const th=el('input',{value:it?(it.th||''):'',placeholder:'เช่น กาน้ำชา'});
    const al=el('input',{value:it&&it.alts?it.alts.join(', '):'',placeholder:'เช่น tea pot (คั่นด้วย ,)',autocapitalize:'none',spellcheck:'false'});
    const save=()=>{
      const word=w.value.trim().replace(/\s+/g,' ');
      if(!word){ w.focus(); toast('พิมพ์คำศัพท์ภาษาอังกฤษก่อนนะ'); return; }
      const alts=al.value.split(',').map(s=>s.trim()).filter(Boolean).slice(0,6);
      if(it){ it.word=word; it.th=th.value.trim(); it.alts=alts; }
      else{ const nid='h'+Date.now().toString(36)+Math.random().toString(36).slice(2,5); sc.items[nid]=Object.assign({word, th:th.value.trim(), alts}, rect); selId=nid; }
      saveScenes(); closeModal(); renderScene(); refresh();
      practised.forEach(l=>setTimeout(()=>autoTranslate(sc,l), 400));
    };
    [w,th,al].forEach(i=>i.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); save(); } }));
    m.append(
      el('h3',{text:it?'แก้ไขคำศัพท์':'เพิ่มคำศัพท์'}),
      el('label',{},'คำภาษาอังกฤษ', w),
      ...(UI==='th' ? [el('label',{},'ความหมายภาษาไทย (ไม่บังคับ)', th)] : []),   // English speakers: the Thai meaning stays as it is
      el('label',{},'คำตอบอื่นที่ให้ถือว่าถูก (ไม่บังคับ)', al),
      el('div',{class:'row'},
        el('button',{text:'🔊 ลองฟัง',onclick:()=>speak(w.value.trim())}),
        el('span',{class:'sp'}),
        it?el('button',{class:'danger',text:'ลบ',onclick:()=>{ delete sc.items[id]; if(selId===id) selId=null; saveScenes(); closeModal(); renderScene(); refresh(); }}):null,
        el('button',{text:'ยกเลิก',onclick:closeModal}),
        el('button',{class:'primary',text:'บันทึก',onclick:save})
      )
    );
  });
}
function openItemFormLang(id, rect, draftEl, lang){
  const sc=scene(); if(sc.builtin) return;
  const it=id?sc.items[id]:null, cur=(it && it.l && it.l[lang]) || {}, L=LANGS[lang];
  modalClose=()=>{ if(draftEl) draftEl.remove(); };
  openModal(m=>{
    const w=el('input',{class:'word',value:cur.w||'',placeholder:L.ph,autocapitalize:'none',spellcheck:'false'});
    let art=cur.a||'';
    const arts=L.articles ? el('div',{class:'seg artseg',role:'group','aria-label':'คำนำหน้านาม'}) : null;
    const drawArts=()=>{ if(!arts) return; arts.innerHTML=''; ['der','die','das',''].forEach(a=>arts.append(el('button',{type:'button',class:(a===art?'on ':'')+(a?'art-'+a:''),text:a||'ไม่มี',onclick:()=>{ art=a; drawArts(); }}))); };
    drawArts();
    w.addEventListener('input',()=>{ const mm=/^(der|die|das)\s+(.+)$/i.exec(w.value); if(mm && L.articles){ art=mm[1].toLowerCase(); w.value=mm[2]; drawArts(); } });
    const th=el('input',{value:it?(it.th||''):'',placeholder:'เช่น กาน้ำชา'});
    const en=el('input',{value:it?(it.word||''):'',placeholder:'เช่น teapot',autocapitalize:'none',spellcheck:'false'});
    const al=el('input',{value:(cur.alts||[]).join(', '),placeholder:'คั่นด้วย ,',autocapitalize:'none',spellcheck:'false'});
    const save=()=>{
      const word=w.value.trim().replace(/\s+/g,' ');
      if(!word){ w.focus(); toast(`พิมพ์คำภาษา${L.name}ก่อนนะ`); return; }
      const lw={w:word, a:art, alts:al.value.split(',').map(x=>x.trim()).filter(Boolean).slice(0,4)};
      if(it){ it.l={...(it.l||{}), [lang]:lw}; it.th=th.value.trim(); it.word=en.value.trim().replace(/\s+/g,' '); }
      else{ const nid='h'+Date.now().toString(36)+Math.random().toString(36).slice(2,5); sc.items[nid]=Object.assign({word:en.value.trim().replace(/\s+/g,' '), th:th.value.trim(), alts:[], l:{[lang]:lw}}, rect); selId=nid; }
      saveScenes(); closeModal(); renderScene(); refresh();
    };
    [w,th,en,al].forEach(i=>i.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); save(); } }));
    m.append(
      el('h3',{text:(it && cur.w ? 'แก้ไขคำศัพท์' : 'เพิ่มคำศัพท์')+' · '+L.flag+' '+L.name}),
      el('label',{},`คำภาษา${L.name}`, w),
      arts ? el('div',{class:'artrow'}, el('span',{class:'lbl',text:'คำนำหน้านาม'}), arts) : null,
      ...(UI==='th' ? [el('label',{},'ความหมายภาษาไทย (ไม่บังคับ)', th)] : []),
      el('label',{},UI==='en' ? 'ความหมาย / คำภาษาอังกฤษ (ไม่บังคับ)' : 'คำภาษาอังกฤษ (ไม่บังคับ)', en),
      el('label',{},'คำตอบอื่นที่ให้ถือว่าถูก (ไม่บังคับ)', al),
      el('div',{class:'row'},
        el('button',{text:'🔊 ลองฟัง',onclick:()=>speak((art?art+' ':'')+w.value.trim())}),
        el('span',{class:'sp'}),
        it?el('button',{class:'danger',text:'ลบกรอบ',onclick:()=>{ delete sc.items[id]; if(selId===id) selId=null; saveScenes(); closeModal(); renderScene(); refresh(); }}):null,
        el('button',{text:'ยกเลิก',onclick:closeModal}),
        el('button',{class:'primary',text:'บันทึก',onclick:save})));
    setTimeout(()=>w.focus(),40);
  });
}
function loadImageFile(file){
  return new Promise((res,rej)=>{
    const fr=new FileReader();
    fr.onload=()=>{
      const img=new Image();
      img.onload=()=>{
        const max=1400; let w=img.naturalWidth, h=img.naturalHeight; const s=Math.min(1,max/Math.max(w,h));
        w=Math.round(w*s); h=Math.round(h*s);
        const c=document.createElement('canvas'); c.width=w; c.height=h;
        const ctx=c.getContext('2d'); ctx.fillStyle='#fff'; ctx.fillRect(0,0,w,h); ctx.drawImage(img,0,0,w,h);
        res({src:c.toDataURL('image/jpeg',0.82), w, h});
      };
      img.onerror=rej; img.src=fr.result;
    };
    fr.onerror=rej; fr.readAsDataURL(file);
  });
}
async function onPickImage(e){
  const f=e.target.files[0]; e.target.value=''; if(!f) return;
  createSceneFromFile(f);
}
async function createSceneFromFile(f){
  try{
    const im=await loadImageFile(f);
    const nm=f.name.replace(/\.[^.]+$/,''); const sc={id:'s'+Date.now().toString(36), name:(/^(image|img|photo|IMG|DSC|PXL)[-_ ]?\d*/i.test(nm)||!nm ? tx('ฉากใหม่ ')+new Date().toLocaleDateString(LOC,{day:'numeric',month:'short'}) : nm).slice(0,40), img:im.src, w:im.w, h:im.h, items:{}};
    customs.push(sc); saveScenes(); tally('scene_new');
    S.sceneId=sc.id; store.set('pv-scene',sc.id); S.editing=true; S.view='play'; help={}; used={}; recent[sc.id]=Date.now(); store.set('pv-recent',recent); markActive(0);
    fullRender(); window.scrollTo(0,0);
    if(aiReady) runAI({count:store.get('pv-ai-count',20), level:store.get('pv-ai-level','mid'), replace:true});
    else toast('ลากกรอบรอบสิ่งของในรูป แล้วพิมพ์คำศัพท์', 4000);
  }catch(err){ toast('เปิดรูปนี้ไม่ได้ ลองไฟล์ .jpg หรือ .png'); }
}
// ---------- word sheets: a teacher's list of words for a dictation (spelling) test ----------
// A sheet is an ordinary scene whose picture is drawn here: one card per word showing its Thai meaning.
// So every mode, the review round, spaced review, sync, sharing and classes work just like for photo scenes.
// sc.meta = {kind:'list', exam:'YYYY-MM-DD' or '', style:'listen'}: the app reads each word aloud, like the teacher's dictation.
// (Sheets saved with the old style:'meaning' are practised the same way: one way of testing keeps it simple.)
const isList=sc=>!!(sc && sc.meta && sc.meta.kind==='list');
const listStyle=sc=>isList(sc) ? 'listen' : null;
function examIn(sc){ if(!isList(sc) || !sc.meta.exam) return null; const t=Date.parse(sc.meta.exam+'T12:00:00'); return isNaN(t) ? null : dayNo(t)-dayNo(); }
const examLabel=n=> n===0 ? 'สอบวันนี้' : n===1 ? 'สอบพรุ่งนี้' : `สอบอีก ${n} วัน`;
// "1. apple แอปเปิล", "apple = แอปเปิล", "apple (n.) - แอปเปิล", "apple" … one word per line
function parseWordList(text){
  const out=[], seen=new Set();
  for(let line of String(text||'').split(/\r?\n|;/)){
    line=line.replace(/^\s*(?:\d+\s*[.)]|[-•*·])\s*/,'').replace(/\((?:n|v|adj|adv|prep|conj|pron|int|phr)\.?\)/gi,' ').trim();
    if(!line) continue;
    const i=line.search(/[\u0E00-\u0E7F]/);
    let w=i<0 ? line.split(/\t|\s[=:–—-]\s|\s*=\s*/)[0] : line.slice(0,i);
    let th=i<0 ? '' : line.slice(i);
    w=w.replace(/[^\p{L}\p{N} '\-.]/gu,' ').replace(/[\s.\-]+$/,'').replace(/\s+/g,' ').trim().slice(0,60);
    th=th.replace(/^[\s=:–—\-]+/,'').replace(/\s+/g,' ').trim().slice(0,60);
    if(!w || !/[A-Za-z]/.test(w) || seen.has(w.toLowerCase())) continue;
    seen.add(w.toLowerCase()); out.push({w, th});
    if(out.length>=60) break;
  }
  return out;
}
function rrect(x,X,Y,W,H,R){ x.beginPath(); x.moveTo(X+R,Y); x.arcTo(X+W,Y,X+W,Y+H,R); x.arcTo(X+W,Y+H,X,Y+H,R); x.arcTo(X,Y+H,X,Y,R); x.arcTo(X,Y,X+W,Y,R); x.closePath(); }
// The picture: numbered cards with the Thai meaning (or a speaker when there is none), on dotted paper.
async function drawSheet(words){
  try{ await Promise.all([document.fonts.load('600 32px Sarabun',String.fromCharCode(3585,3586,97)), document.fonts.load('600 20px Fredoka','123')]); }catch(e){}
  const W=1000, pad=28, gap=18, ch=150, cols=2;   // two big cards a row: readable on a phone
  const cw=(W-pad*2-gap*(cols-1))/cols, rows=Math.max(1,Math.ceil(words.length/cols));
  const H=Math.max(pad*2+rows*ch+(rows-1)*gap, 360);
  const c=document.createElement('canvas'); c.width=W; c.height=H; const x=c.getContext('2d');
  x.fillStyle='#fdf9f3'; x.fillRect(0,0,W,H);
  x.fillStyle='#ece3d6'; for(let yy=14;yy<H;yy+=28) for(let xx=14;xx<W;xx+=28){ x.beginPath(); x.arc(xx,yy,1.5,0,7); x.fill(); }
  const SOFT=['#efeaf7','#ffe4ea','#e5f5eb','#fff3cf'], DEEP=['#5b4fc4','#d83a5c','#24a164','#b07800'], boxes=[];
  words.forEach((wd,i)=>{
    const bx=pad+(i%cols)*(cw+gap), by=pad+Math.floor(i/cols)*(ch+gap), k=i%4;
    x.fillStyle='rgba(45,42,90,.07)'; rrect(x,bx,by+3,cw,ch,20); x.fill();
    x.fillStyle='#fff'; rrect(x,bx,by,cw,ch,20); x.fill(); x.strokeStyle='#efe6da'; x.lineWidth=2; x.stroke();
    x.fillStyle=SOFT[k]; x.beginPath(); x.arc(bx+44,by+ch/2,28,0,7); x.fill();
    x.fillStyle=DEEP[k]; x.font='600 27px Fredoka, Sarabun, sans-serif'; x.textAlign='center'; x.textBaseline='middle'; x.fillText(String(i+1),bx+44,by+ch/2+1);
    const cx=bx+84+(cw-84-16)/2, room=cw-84-28, th=(wd.th||'').trim();
    x.fillStyle='#2d2a5a';
    if(th){
      let fs=50; const setF=()=>{ x.font=`600 ${fs}px Sarabun, sans-serif`; }; setF();
      while(x.measureText(th).width>room && fs>26){ fs-=2; setF(); }
      let t=th; while(x.measureText(t).width>room && t.length>2) t=t.slice(0,-2)+'…';
      x.fillText(t,cx,by+ch/2+3);
    } else {   // no meaning: a speaker (listen to the word)
      x.fillStyle='#8f84e8'; const sx=cx-30, sy=by+ch/2;
      x.beginPath(); x.moveTo(sx,sy-12); x.lineTo(sx+14,sy-12); x.lineTo(sx+30,sy-27); x.lineTo(sx+30,sy+27); x.lineTo(sx+14,sy+12); x.lineTo(sx,sy+12); x.closePath(); x.fill();
      x.strokeStyle='#8f84e8'; x.lineWidth=6; x.lineCap='round';
      [18,34].forEach(r=>{ x.beginPath(); x.arc(sx+32,sy,r,-0.8,0.8); x.stroke(); });
    }
    boxes.push({x:Math.round(bx),y:Math.round(by),w:Math.round(cw),h:ch});
  });
  return {img:c.toDataURL('image/jpeg',0.86), w:W, h:H, boxes};
}
function markImgChanged(id){
  imgSaved.delete(id);
  if(user && typeof syncMem==='function'){ const mem=syncMem(user.id); if(mem.img) delete mem.img[id]; saveSyncMem(); }
}
// Make (or update) a sheet scene. Words that stay keep their id, so their progress stays.
async function saveWordSheet(sc, name, words, meta){
  const pic=await drawSheet(words), old=(sc && sc.items) || {}, byWord={};
  Object.entries(old).forEach(([id,it])=>{ if(it && it.word) byWord[it.word.toLowerCase()]=id; });
  const items={}; let n=0;
  words.forEach((wd,i)=>{
    let id=byWord[wd.w.toLowerCase()];
    if(!id || items[id]){ do{ id='w'+(++n); }while(old[id] || items[id]); }
    const prev=old[id] && old[id].word && old[id].word.toLowerCase()===wd.w.toLowerCase() ? old[id] : {};
    const b=pic.boxes[i];
    items[id]={ word:wd.w, th:wd.th||'', alts:prev.alts||[], ...(prev.l?{l:prev.l}:{}), x:b.x, y:b.y, w:b.w, h:b.h };
  });
  if(sc){ Object.assign(sc,{ name, img:pic.img, w:pic.w, h:pic.h, items, meta }); markImgChanged(sc.id); }
  else { sc={ id:'s'+Date.now().toString(36), name, img:pic.img, w:pic.w, h:pic.h, items, meta }; customs.push(sc); tally('sheet_new'); }
  saveScenes();
  return sc;
}
// Sign-in / access code for AI, the same way as for scanning a photo. Returns {tok, code} or null.
async function aiAuth(){
  if(!aiReady){ toast('ตอนนี้ใช้ AI ไม่ได้ — พิมพ์หรือวางรายการคำเองได้'); return null; }
  if(navigator.onLine===false){ toast('ต้องต่ออินเทอร์เน็ตก่อนใช้ AI', 4000); return null; }
  const tok=(aiCredits && user) ? await accessToken() : null;
  let code=tok ? '' : store.get('pv-ai-code','');
  if(!tok){
    if(aiCredits && !(aiNeedCode && code)){
      const how=await askLoginForAI(); if(!how) return null;
      if(how==='login'){ openLogin(); return null; }
      code=how;
    } else if(aiNeedCode && !code){ code=await askCode(false); if(!code) return null; }
    if(code) store.set('pv-ai-code',code);
  }
  if(tok && aiLeft===0){ toast(`เครดิต AI เดือนนี้หมดแล้ว (${aiMonthly} ครั้ง/เดือน) — พิมพ์หรือวางรายการคำเองได้`, 6000); return null; }
  return {tok, code};
}
// Photo of the sheet → [{w, th}] (one AI credit)
async function readSheetPhoto(file){
  let im; try{ im=await loadImageFile(file); }catch(e){ toast('เปิดรูปนี้ไม่ได้ ลองไฟล์ .jpg หรือ .png'); return null; }
  const auth=await aiAuth(); if(!auth) return null;
  let r, data={};
  try{
    r=await fetch('/api/wordlist',{method:'POST', headers:{'content-type':'application/json', ...(auth.tok?{authorization:'Bearer '+auth.tok}:{}), ...(auth.code?{'x-piccab-code':auth.code}:{})}, body:JSON.stringify({image:im.src})});
    data=await r.json().catch(()=>({}));
  }catch(e){ toast(aiErr('offline')); return null; }
  if(typeof data.credits_left==='number'){ aiLeft=data.credits_left; const n=$('#creditNote'); if(n) n.textContent=creditText(); }
  if(!r.ok){ if(data.error==='bad_code') store.set('pv-ai-code',''); toast(aiErr(data.error), 5000); return null; }
  const items=(data.items||[]).filter(x=>x && x.w);
  if(!items.length) toast('ไม่พบรายการคำศัพท์ในรูปนี้ ลองถ่ายให้ชัดและตรงขึ้น หรือพิมพ์เอง', 5000);
  return items;
}
function openSheetMaker(sc){
  const meta=(sc && sc.meta) || {kind:'list', exam:''};
  openModal(m=>{
    m.classList.add('wsbox');
    const ta=el('textarea',{rows:'8',spellcheck:'false','aria-label':'รายการคำศัพท์',placeholder:'apple แอปเปิล\nbanana กล้วย\nelephant ช้าง'});
    ta.value=sc ? Object.values(sc.items).filter(it=>it && it.word).map(it=>it.word+(it.th?' '+it.th:'')).join('\n') : '';
    const count=el('span',{class:'wscount'});
    const name=el('input',{maxlength:'40','aria-label':'ชื่อชุดคำ',value: sc ? sc.name : 'Dictation '+new Date().toLocaleDateString(LOC,{day:'numeric',month:'short'})});
    const date=el('input',{type:'date','aria-label':'วันสอบ',value:meta.exam||''});
    const ok=el('button',{class:'primary'}, sc ? 'บันทึก' : 'สร้างชุดคำ');
    const upd=()=>{ const n=parseWordList(ta.value).length; count.textContent=n ? `${n} คำ` : ''; ok.disabled=!n; };
    ta.addEventListener('input',upd);
    const file=el('input',{type:'file',accept:'image/*',hidden:''});
    const photo=el('button',{type:'button',class:'cbtn wsphoto',onclick:()=>file.click()}, ic('photo_camera'), 'ถ่ายรูปชีท ให้ AI อ่าน');
    file.addEventListener('change',async()=>{
      const f=file.files[0]; file.value=''; if(!f) return;
      photo.disabled=true; photo.classList.add('busyline'); photo.lastChild.textContent='AI กำลังอ่านชีท…';
      const got=await readSheetPhoto(f);
      photo.disabled=false; photo.classList.remove('busyline'); photo.lastChild.textContent='ถ่ายรูปชีท ให้ AI อ่าน';
      if(got && got.length){
        const lines=got.map(x=>x.w+(x.th?' '+x.th:'')).join('\n');
        ta.value=ta.value.trim() ? ta.value.trim()+'\n'+lines : lines; upd();
        toast(`AI อ่านได้ ${got.length} คำ — ตรวจและแก้ได้ก่อนบันทึก`, 4000);
      }
    });
    ok.addEventListener('click',async()=>{
      const words=parseWordList(ta.value); if(!words.length){ ta.focus(); return; }
      ok.disabled=true;
      const nm=(name.value.trim()||'Dictation').slice(0,40);
      const s2=await saveWordSheet(sc, nm, words, {kind:'list', exam:date.value||'', style:'listen'});
      closeModal();
      if(sc){ if(S.view==='play') fullRender(); else renderGallery(); toast('บันทึกชุดคำแล้ว'); }
      else { openScene(s2.id,'learn'); toast(`สร้างชุดคำ ${words.length} คำแล้ว — แตะการ์ดเพื่อฟังคำ`, 4000); }
    });
    m.append(
      el('div',{class:'shhead'}, el('h3',{}, ic('edit_note'), sc?'แก้ไขชีทคำศัพท์':'ชีทคำศัพท์จากครู'), el('button',{class:'x','aria-label':'ปิด',text:'✕',onclick:closeModal})),
      el('p',{class:'note',text:'ถ่ายรูปชีทให้ AI อ่าน หรือพิมพ์/วางคำทีละบรรทัด ตามด้วยความหมาย'}),
      aiReady ? photo : null, file,
      ta, el('div',{class:'wsrow'}, count, el('span',{class:'note small',text:'เช่น apple แอปเปิล'})),
      el('label',{class:'wslabel'}, el('span',{text:'ชื่อชุด'}), name),
      el('label',{class:'wslabel'}, el('span',{},ic('event'),'วันสอบ (ถ้ามี)'), date),
      el('div',{class:'row'}, el('span',{class:'sp'}), el('button',{text:'ยกเลิก',onclick:closeModal}), ok));
    upd();
  });
}
$('#fileImg').addEventListener('change', onPickImage);
$('#fileCam').addEventListener('change', onPickImage);
function deleteScene(){
  const sc=scene(); if(sc.builtin) return;
  ask(`ลบฉาก “${sc.name}” ใช่ไหม? ลบแล้วกู้คืนไม่ได้`,'ลบฉาก').then(ok=>{
    if(!ok) return;
    customs=customs.filter(s=>s!==sc); delete progress[sc.id]; forgetSceneLocal(sc.id);
    if(typeof syncDeleted==='function') syncDeleted(sc);
    { const sh=myShares['scene:'+sc.id]; if(sh && user){ shareApi('DELETE','/api/share/'+sh.id).catch(()=>{}); delete myShares['scene:'+sc.id]; store.set('pv-shares',myShares); } }
    saveScenes(); saveProg();
    S.sceneId='tea'; store.set('pv-scene','tea'); S.editing=false; S.view='home'; fullRender(); toast('ลบฉากแล้ว');
  });
}
// Save the scene (picture + boxes) as a .piccab file to send to a friend.
// Phones open the share menu (LINE, Messenger…) when the browser allows it; otherwise the file downloads.
function sceneFile(sc){
  const data=JSON.stringify({app:'piccab',v:1,name:sc.name,img:sc.img,w:sc.w,h:sc.h,items:sc.items,...(sc.meta?{meta:sc.meta}:{})});
  const base=String(sc.name||'').replace(/[\\/:*?"<>|\u0000-\u001f]+/g,' ').replace(/\s+/g,' ').trim().slice(0,50)||tx('ฉาก');
  return new File([data], base+'.piccab', {type:'application/json'});
}
async function shareScene(){
  const sc=scene();
  if(!sc.img){ toast('รูปของฉากนี้ยังโหลดไม่เสร็จ ลองใหม่อีกครั้ง'); return; }
  const file=sceneFile(sc);
  if(matchMedia('(pointer:coarse)').matches && navigator.share && navigator.canShare && navigator.canShare({files:[file]})){
    try{ await navigator.share({files:[file], title:sc.name}); return; }
    catch(e){ if(e && e.name==='AbortError') return; }
  }
  const url=URL.createObjectURL(file), a=el('a',{href:url,download:file.name,hidden:''});
  document.body.append(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),30000);
  toast('บันทึกไฟล์ “'+file.name+'” แล้ว — ส่งไฟล์นี้ให้เพื่อน แล้วให้เพื่อนกด 📥 นำเข้า → นำเข้าไฟล์ฉาก', 6000);
}
function importData(text){
  let o; try{ o=JSON.parse(text); }catch(e){ toast('ข้อมูลไม่ถูกต้อง'); return false; }
  if(!o || typeof o.img!=='string' || !o.img.startsWith('data:image/') || !(o.w>0) || !(o.h>0) || typeof o.items!=='object'){ toast('ข้อมูลไม่ใช่ฉากของแอปนี้'); return false; }
  const its={};
  for(const [k,v] of Object.entries(o.items)){
    if(!v || typeof v.word!=='string') continue;
    const n=x=>Number.isFinite(+x)?+x:0;
    const nk='h'+Math.random().toString(36).slice(2,9);
    its[nk]={word:v.word.slice(0,80), th:String(v.th||'').slice(0,120), alts:Array.isArray(v.alts)?v.alts.filter(a=>typeof a==='string').slice(0,4).map(a=>a.slice(0,60)):[], x:n(v.x), y:n(v.y), w:n(v.w), h:n(v.h)};
    const lw=cleanLang(v.l); if(lw) its[nk].l=lw;
  }
  const sc={id:'s'+Date.now().toString(36), name:String(o.name||tx('ฉากที่นำเข้า')).slice(0,50), img:o.img, w:+o.w, h:+o.h, items:its, ...metaFrom(o)};
  customs.push(sc); saveScenes(); S.sceneId=sc.id; store.set('pv-scene',sc.id); help={}; used={};
  S.view='library'; fullRender(); toast('นำเข้าฉาก “'+sc.name+'” แล้ว ✓'); return true;
}
const isImageFile=f=>!!f && (/^image\//.test(f.type) || /\.(jpe?g|png|gif|webp|heic|heif|bmp)$/i.test(f.name||''));
function importFile(f){
  if(!f) return;
  if(isImageFile(f)){ closeModal(); createSceneFromFile(f); return; }
  const fr=new FileReader(); fr.onload=()=>{ if(importData(fr.result)) closeModal(); }; fr.readAsText(f);
}
function openImport(){
  openModal(m=>{
    m.append(el('h3',{text:'เพิ่มฉากใหม่'}),
      el('p',{text: aiReady ? 'ใส่รูปแล้ว AI จะหาคำศัพท์ให้อัตโนมัติ' : 'ใส่รูปแล้วลากกรอบรอบสิ่งของเพื่อใส่คำศัพท์'}),
      el('div',{class:'createrow'},
        el('button',{class:'cbtn',onclick:()=>{ closeModal(); $('#fileCam').click(); }},'📷 ถ่ายรูป'),
        el('button',{class:'cbtn',onclick:()=>{ closeModal(); $('#fileImg').click(); }},'🖼️ เลือกรูป')),
      el('button',{class:'cbtn wide wsimp',onclick:()=>{ closeModal(); openSheetMaker(); }}, ic('edit_note'), 'ชีทคำศัพท์จากครู (สำหรับสอบ Dictation)'));
    if(aiReady) m.append(aiNotice());
    if(matchMedia('(pointer:fine)').matches) m.append(el('p',{class:'imphint',text:'หรือลากรูปมาวางที่นี่ / กด Ctrl+V เพื่อวางรูป'}));
    m.append(el('div',{class:'impfoot'},
        el('button',{class:'linkbtn',onclick:()=>$('#fileJson').click()},'📄 มีไฟล์ฉากจากเพื่อน? ',el('u',{text:'นำเข้าไฟล์ฉาก'})),
        el('span',{class:'sp'}),
        el('button',{text:'ยกเลิก',onclick:closeModal})));
  });
}
const importOpen=()=>!$('#modal').hidden && !!$('#mbox .impfoot');
// paste a picture (e.g. a screenshot) — or old copied scene text — while the dialog is open
document.addEventListener('paste',e=>{
  if(!importOpen()) return;
  const cd=e.clipboardData; if(!cd) return;
  const f=[...(cd.files||[])].find(isImageFile);
  if(f){ e.preventDefault(); importFile(f); return; }
  const t=(cd.getData('text')||'').trim();
  if(t.startsWith('{')){ e.preventDefault(); if(importData(t)) closeModal(); }
});
// drag & drop an image or scene file onto the import box
const mbox=$('#mbox');
mbox.addEventListener('dragover',e=>{ if(importOpen() && e.dataTransfer && [...e.dataTransfer.types].includes('Files')){ e.preventDefault(); mbox.classList.add('drop'); } });
mbox.addEventListener('dragleave',e=>{ if(!mbox.contains(e.relatedTarget)) mbox.classList.remove('drop'); });
mbox.addEventListener('drop',e=>{
  mbox.classList.remove('drop');
  if(!importOpen()) return;
  const f=e.dataTransfer && e.dataTransfer.files[0]; if(!f) return;
  e.preventDefault(); importFile(f);
});
$('#fileJson').addEventListener('change', e=>{
  const f=e.target.files[0]; e.target.value=''; importFile(f);
});

// ---------- account (Supabase Auth: email one-time code) ----------
const SB_URL='https://oftzpfyydnmahkntucnj.supabase.co';
const SB_KEY='sb_publishable_R8bX28KY2kU5997XFqHelw_fqUvywBh';   // publishable key: safe in the browser (data is protected by row-level security)
// Coming back from Google with an error (e.g. sign-in cancelled): keep the message, tidy the address bar.
const oauthErr=(()=>{
  const q=new URLSearchParams(location.search), h=new URLSearchParams(location.hash.slice(1));
  const code=h.get('error')||q.get('error'); if(!code || h.get('access_token')) return null;
  const desc=h.get('error_description')||q.get('error_description')||code;
  try{ history.replaceState(null,'',location.pathname); }catch(e){}
  return { code, desc };
})();
const sb = (window.supabase && location.protocol.startsWith('http'))
  ? window.supabase.createClient(SB_URL, SB_KEY, { auth:{ persistSession:true, autoRefreshToken:true, detectSessionInUrl:true, flowType:'implicit' } })
  : null;
let user=null;
// Google sign-in shows only when it is switched on in Supabase (Authentication → Sign In / Providers → Google).
let googleOn=false;
if(sb && navigator.onLine!==false) fetch(SB_URL+'/auth/v1/settings',{ headers:{ apikey:SB_KEY } }).then(r=>r.ok?r.json():null)
  .then(j=>{ googleOn=!!(j && j.external && j.external.google); }).catch(()=>{});
async function signInGoogle(btn){
  if(btn){ btn.disabled=true; btn.textContent='กำลังไปที่ Google…'; }
  const { error } = await sb.auth.signInWithOAuth({ provider:'google', options:{ redirectTo: location.origin+'/app', queryParams:{ prompt:'select_account' } } });
  if(error){ if(btn){ btn.disabled=false; btn.textContent='เข้าสู่ระบบด้วย Google'; } toast(authErr(error), 4000); }
}
function renderAcct(){
  const b=$('#acctBtn'); if(!b) return;
  b.hidden=!sb; b.innerHTML='';
  if(user && isStudent()){
    const nick=studentNick();
    b.classList.add('in'); b.title='บัญชีนักเรียน: '+nick;
    b.append(el('span',{class:'av',text:'🎓'}), el('span',{class:'lbl',text:nick}));
  } else if(user){
    const em=user.email||'';
    b.classList.add('in'); b.title=em;
    b.append(el('span',{class:'av',text:(em[0]||'?')}), el('span',{class:'lbl',text:'บัญชีของฉัน'}));
  } else {
    b.classList.remove('in'); b.title='เข้าสู่ระบบ';
    b.append(el('span',{class:'av out'},ic('person')), el('span',{class:'lbl',text:'เข้าสู่ระบบ'}));
  }
}
function authErr(e){
  const c=(e && (e.code||'')) + ' ' + (e && e.message || '');
  if(/captcha/i.test(c)) return 'ตรวจสอบว่าไม่ใช่บอตไม่สำเร็จ ลองกดอีกครั้ง';
  if(/rate|too many|security purposes/i.test(c)) return 'ส่งถี่เกินไป รอสักครู่ (ประมาณ 1 นาที) แล้วลองใหม่';
  if(/expired|invalid.*(otp|token)|otp_expired|token has expired/i.test(c)) return 'รหัสไม่ถูกต้องหรือหมดอายุ ลองขอรหัสใหม่';
  if(/email.*invalid|invalid.*email|email_address_invalid/i.test(c)) return 'รูปแบบอีเมลไม่ถูกต้อง';
  if(/signups? not allowed|signup_disabled/i.test(c)) return 'ยังไม่เปิดรับสมัครสมาชิกใหม่';
  if(/fetch|network|Failed to/i.test(c)) return 'เชื่อมต่ออินเทอร์เน็ตไม่ได้ ลองใหม่อีกครั้ง';
  return 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง'+(e && e.message ? ` (${e.message})` : '');
}
// ---------- "not a robot" check (Cloudflare Turnstile) before Supabase creates or e-mails an account ----------
// Only when the Worker has TURNSTILE_SITE_KEY. Usually invisible: a box shows only when Cloudflare is unsure.
// Supabase checks the token itself (Authentication → Attack Protection → CAPTCHA), so bots can't skip it.
var capKey=null;                         // null = not known yet, '' = switched off
function captchaKey(){
  if(capKey!==null || !location.protocol.startsWith('http')) return Promise.resolve(capKey||'');
  return fetch('/api/health',{cache:'no-store'}).then(r=>r.ok?r.json():null).catch(()=>null).then(h=>{ capKey=(h && h.captcha) || ''; return capKey; });
}
var tsLoad=null;
function loadTurnstile(){
  if(window.turnstile) return Promise.resolve(window.turnstile);
  if(!tsLoad) tsLoad=new Promise((res,rej)=>{
    const s=document.createElement('script');
    s.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'; s.async=true;
    s.onload=()=> window.turnstile ? res(window.turnstile) : rej(new Error('captcha_load'));
    s.onerror=()=>{ tsLoad=null; rej(new Error('captcha_load')); };
    document.head.appendChild(s);
  });
  return tsLoad;
}
// humanCheck(box) → { token(): a fresh one-use token (undefined when switched off), remove() }
function humanCheck(box){
  let id=null, tok=null, failed=false, waiters=[];
  const ready=captchaKey().then(key=>{
    if(!key) return null;
    return loadTurnstile().then(ts=>{
      if(!box.isConnected) return null;
      id=ts.render(box,{ sitekey:key, appearance:'interaction-only', language:'auto', size:'flexible', action:'auth',
        callback:t=>{ tok=t; failed=false; waiters.splice(0).forEach(w=>w.res(t)); },
        'expired-callback':()=>{ tok=null; },
        'error-callback':()=>{ failed=true; waiters.splice(0).forEach(w=>w.rej(new Error('captcha_failed'))); } });
      return ts;
    });
  });
  ready.catch(()=>{});
  return {
    async token(){
      const ts=await ready;
      if(!ts) return undefined;
      let t=tok;
      if(!t && failed){ failed=false; try{ ts.reset(id); }catch(e){} }      // it gave up earlier: try again now
      if(!t) t=await new Promise((res,rej)=>{ const w={res,rej}; waiters.push(w);
        setTimeout(()=>{ const i=waiters.indexOf(w); if(i>=0){ waiters.splice(i,1); rej(new Error('captcha_timeout')); } },90000); });
      tok=null; try{ ts.reset(id); }catch(e){}            // one use only: start on the next one
      return t;
    },
    remove(){ ready.then(ts=>{ if(ts && id!==null) try{ ts.remove(id); }catch(e){} }).catch(()=>{}); },
  };
}
const capErr=e=> /captcha_load/.test(e && e.message||'')
  ? 'โหลดระบบตรวจสอบความปลอดภัยไม่ได้ ลองรีเฟรชหน้า หรือปิดตัวบล็อกโฆษณาสำหรับเว็บนี้'
  : 'ตรวจสอบว่าไม่ใช่บอตไม่สำเร็จ ลองกดอีกครั้ง';
function openLogin(prefill){
  openModal(m=>{
    const inp=el('input',{type:'email',placeholder:'you@example.com',autocomplete:'email',autocapitalize:'none',spellcheck:'false',value:prefill||''});
    const err=el('p',{class:'err'});
    const go=el('button',{class:'primary',text:'ส่งรหัสเข้าอีเมล'});
    const tsbox=el('div',{class:'tsbox'}); let hc=null;
    modalClose=()=>{ if(hc) hc.remove(); };
    const send=async()=>{
      const email=inp.value.trim().toLowerCase();
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ err.textContent='กรุณาใส่อีเมลให้ถูกต้อง'; inp.focus(); return; }
      go.disabled=true; go.textContent='กำลังส่ง…'; err.textContent='';
      let captchaToken;
      try{ captchaToken=await hc.token(); }catch(e){ go.disabled=false; go.textContent='ส่งรหัสเข้าอีเมล'; err.textContent=capErr(e); return; }
      const { error } = await sb.auth.signInWithOtp({ email, options:{ shouldCreateUser:true, emailRedirectTo: location.origin+'/app?hl='+UI, data:{ lang:UI }, captchaToken } });
      if(error){ go.disabled=false; go.textContent='ส่งรหัสเข้าอีเมล'; err.textContent=authErr(error); return; }
      hc.remove(); openCode(email);
    };
    go.addEventListener('click',send);
    inp.addEventListener('keydown',e=>{ if(e.key==='Enter') send(); });
    const gbtn = googleOn ? el('button',{class:'gbtn',type:'button',onclick:e=>signInGoogle(e.currentTarget)},'เข้าสู่ระบบด้วย Google') : null;
    if(gbtn) m.append(el('h3',{text:'👤 เข้าสู่ระบบ / สมัครสมาชิก'}), gbtn, el('div',{class:'orline',text:'หรือใช้อีเมล'}));
    else m.append(el('h3',{text:'👤 เข้าสู่ระบบ / สมัครสมาชิก'}));
    m.append(
      el('p',{text:'ใส่อีเมลของคุณ เราจะส่งรหัสตัวเลขไปให้ ไม่ต้องตั้งรหัสผ่าน (ครั้งแรกจะสมัครให้อัตโนมัติ)'}),
      inp, tsbox, err,
      el('div',{class:'row'}, el('span',{class:'sp'}), el('button',{text:'ยกเลิก',onclick:closeModal}), go),
      el('p',{class:'note consent'}, 'การเข้าสู่ระบบถือว่าคุณยอมรับ', el('a',{href:'/terms',target:'_blank',text:'ข้อตกลงการใช้งาน'}), 'และ', el('a',{href:'/privacy',target:'_blank',text:'นโยบายความเป็นส่วนตัว'}), ' · อายุต่ำกว่า 20 ปีควรขออนุญาตพ่อแม่หรือผู้ปกครองก่อน'),
      el('p',{class:'note',text:'☁️ เมื่อเข้าสู่ระบบ ฉาก รูป และความคืบหน้าจะถูกเก็บในบัญชี ใช้ได้ทุกเครื่องที่เข้าสู่ระบบด้วยอีเมลเดียวกัน'}));
    hc=humanCheck(tsbox);
  });
}
function openCode(email){
  let wait=60, timer=null;
  openModal(m=>{
    const inp=el('input',{class:'code',inputmode:'numeric',autocomplete:'one-time-code',maxlength:'10',placeholder:'รหัสจากอีเมล'});
    const err=el('p',{class:'err'});
    const ok=el('button',{class:'primary',text:'ยืนยัน'});
    const again=el('button',{class:'linkbtn small'});
    const tick=()=>{ again.disabled=wait>0; again.textContent= wait>0 ? `ส่งรหัสใหม่ได้ใน ${wait} วินาที` : 'ส่งรหัสใหม่'; };
    timer=setInterval(()=>{ if(wait>0){ wait--; tick(); } else clearInterval(timer); },1000); tick();
    const tsbox=el('div',{class:'tsbox'}); let hc=null;
    modalClose=()=>{ clearInterval(timer); if(hc) hc.remove(); };
    const verify=async()=>{
      const token=inp.value.replace(/\D/g,'');
      if(token.length<6){ err.textContent='ใส่รหัสจากอีเมลให้ครบทุกหลัก'; inp.focus(); return; }
      ok.disabled=true; ok.textContent='กำลังตรวจ…'; err.textContent='';
      const { error } = await sb.auth.verifyOtp({ email, token, type:'email' });
      if(error){ ok.disabled=false; ok.textContent='ยืนยัน'; err.textContent=authErr(error); inp.select(); return; }
      closeModal(); toast('✓ เข้าสู่ระบบแล้ว', 3000);
    };
    ok.addEventListener('click',verify);
    inp.addEventListener('input',e=>{
      const d=inp.value.replace(/\D/g,''); if(d!==inp.value) inp.value=d;
      const whole = e.inputType==='insertFromPaste' || e.inputType==='insertReplacementText' || e.inputType===undefined;
      if(whole && d.length>=6) verify();          // pasted or auto-filled → submit; typing → press ยืนยัน / Enter
      else if(d.length>=6) ok.classList.add('ready');
    });
    inp.addEventListener('keydown',e=>{ if(e.key==='Enter') verify(); });
    again.addEventListener('click',async()=>{
      wait=60; tick(); clearInterval(timer); timer=setInterval(()=>{ if(wait>0){ wait--; tick(); } else clearInterval(timer); },1000);
      let captchaToken;
      try{ captchaToken=await hc.token(); }catch(e){ err.textContent=capErr(e); wait=0; tick(); return; }
      const { error } = await sb.auth.signInWithOtp({ email, options:{ shouldCreateUser:true, emailRedirectTo: location.origin+'/app?hl='+UI, data:{ lang:UI }, captchaToken } });
      err.textContent = error ? authErr(error) : ''; if(!error) toast('ส่งรหัสใหม่แล้ว');
    });
    m.append(el('h3',{text:'📩 ใส่รหัสจากอีเมล'}),
      el('p',{}, 'ส่งรหัสไปที่ ', el('b',{text:email}), ' แล้ว (ถ้าไม่เห็น ลองดูในจดหมายขยะ/Spam) หรือกดลิงก์ในอีเมลก็ได้'),
      inp, err,
      el('div',{class:'row'}, el('button',{text:'← เปลี่ยนอีเมล',onclick:()=>{ clearInterval(timer); if(hc) hc.remove(); openLogin(email); }}), el('span',{class:'sp'}), ok),
      again, tsbox);
    hc=humanCheck(tsbox);
  });
}
// Credits left this month (a new month refills to the monthly allowance on the next scan).
async function loadCredits(){
  if(!sb || !user) return;
  const { data, error } = await sb.from('profiles').select('ai_credits,ai_credits_month').maybeSingle();
  if(error || !data) return;
  const m=new Date(), thisMonth=`${m.getFullYear()}-${String(m.getMonth()+1).padStart(2,'0')}-01`;
  aiLeft = (String(data.ai_credits_month) < thisMonth) ? Math.max(data.ai_credits, aiMonthly) : data.ai_credits;
  const n=$('#creditNote'); if(n) n.textContent=creditText();
  const hc=$('#homeCredit'); if(hc) hc.textContent=homeCredit();
}
const creditText=()=> typeof aiLeft==='number' ? `✨ เครดิต AI เดือนนี้: เหลือ ${aiLeft} / ${aiMonthly} ครั้ง` : '✨ เครดิต AI: กำลังโหลด…';
function askLoginForAI(){
  return new Promise(res=>{
    let ans=null; modalClose=()=>res(ans);
    const codeIn=el('input',{placeholder:'รหัสทดสอบ (ถ้ามี)',autocapitalize:'none',spellcheck:'false',autocomplete:'off'});
    openModal(m=>m.append(
      el('h3',{text:'✨ เข้าสู่ระบบเพื่อใช้ AI'}),
      el('p',{text:`สมาชิกใช้ AI หาคำศัพท์ได้ฟรี ${aiMonthly} รูปต่อเดือน และฉากจะเก็บในบัญชี ใช้ได้ทุกเครื่อง`}),
      el('div',{class:'row'}, el('span',{class:'sp'}), el('button',{text:'ยกเลิก',onclick:closeModal}),
        el('button',{class:'primary',text:'👤 เข้าสู่ระบบ / สมัคร',onclick:()=>{ ans='login'; closeModal(); }})),
      aiNeedCode ? el('div',{class:'orline',text:'หรือใช้รหัสทดสอบ'}) : null,
      aiNeedCode ? el('div',{class:'row'}, codeIn, el('button',{text:'ใช้รหัส',onclick:()=>{ const v=codeIn.value.trim(); if(!v) return codeIn.focus(); ans=v; closeModal(); }})) : null));
  });
}
function openAccount(){
  if(isStudent()){ openStudentAccount(); return; }
  if(aiCredits) loadCredits();
  openModal(m0=>{
    const m={append:(...k)=>m0.append(...k.filter(x=>x!=null))};
    m.append(el('h3',{text:'บัญชีของฉัน'}),
      el('p',{}, 'เข้าสู่ระบบด้วย ', el('b',{text:user.email||''})),
      el('p',{class:'note',id:'syncNote',text:syncText()}),
      aiCredits ? el('p',{class:'note',id:'creditNote',text:creditText()}) : null,
      el('div',{class:'row'},
        el('button',{text:'🔗 ลิงก์ที่แชร์',onclick:openMyShares}),
        ADM.ok ? el('button',{text:'🛡️ ดูแลระบบ',onclick:()=>{ closeModal(); goHome('admin'); }}) : null,
        el('button',{text:'🔄 ซิงค์ตอนนี้',onclick:async e=>{ e.target.disabled=true; await syncNow(true); const n=$('#syncNote'); if(n) n.textContent=syncText(); e.target.disabled=false; }}),
        el('button',{class:'danger',text:'ออกจากระบบ',onclick:async e=>{
          e.target.disabled=true; e.target.textContent='กำลังบันทึก…';
          await syncNow(false);
          if(SYNC.state==='error' && !(await ask('ยังซิงค์ข้อมูลล่าสุดขึ้นบัญชีไม่สำเร็จ ถ้าออกจากระบบตอนนี้ การเปลี่ยนแปลงล่าสุดในเครื่องนี้อาจหาย ออกจากระบบเลยไหม?','ออกจากระบบ'))) return;
          await sb.auth.signOut(); closeModal(); toast('ออกจากระบบแล้ว'); }}),
        el('span',{class:'sp'}), el('button',{class:'primary',text:'ปิด',onclick:closeModal})),
      el('div',{class:'acctlinks'},
        el('button',{type:'button',class:'linkbtn small',text:'💬 ส่งความเห็น',onclick:()=>{ closeModal(); openFeedback(); }}), ' · ',
        el('a',{href:'/?home',text:'เกี่ยวกับ Piccab'}), ' · ',
        el('a',{href:'/privacy',target:'_blank',text:'นโยบายความเป็นส่วนตัว'}), ' · ', el('a',{href:'/terms',target:'_blank',text:'ข้อตกลงการใช้งาน'}), ' · ',
        el('button',{class:'linkbtn small danger-link',text:'ลบบัญชีและข้อมูลทั้งหมด',onclick:openDeleteAccount})));
  });
}
// Delete the account: pictures, scenes, progress, decks and the login itself — then clear this browser's Piccab data.
function openDeleteAccount(){
  openModal(m=>{
    const inp=el('input',{placeholder:'พิมพ์คำว่า ลบ','aria-label':'พิมพ์คำว่า ลบ เพื่อยืนยัน',autocomplete:'off'});
    const err=el('p',{class:'err'});
    const go=el('button',{class:'danger',text:'ลบบัญชีถาวร',disabled:''});
    inp.addEventListener('input',()=>{ const v=inp.value.trim(); go.disabled=!(v==='ลบ' || (UI==='en' && v.toUpperCase()==='DELETE')); });
    go.addEventListener('click',async()=>{
      go.disabled=true; go.textContent='กำลังลบ…'; err.textContent='';
      SYNC.ready=false; clearTimeout(SYNC.timer);                      // nothing more may be uploaded
      let ok=false, code='';
      try{
        const tok=await accessToken();
        const r=await fetch('/api/account',{ method:'DELETE', headers:{ authorization:'Bearer '+tok } });
        ok=r.ok; if(!ok) code=((await r.json().catch(()=>({}))).error||'');
      }catch(e){ code='network'; }
      if(!ok){
        SYNC.ready=true;
        go.disabled=false; go.textContent='ลบบัญชีถาวร';
        err.textContent = code==='not_configured' ? 'ตอนนี้ยังลบบัญชีอัตโนมัติไม่ได้ กรุณาส่งอีเมลถึง contact@piccab.com แล้วเราจะลบให้'
          : code==='network' ? 'เชื่อมต่อไม่ได้ ลองใหม่อีกครั้ง' : 'ลบไม่สำเร็จ ลองใหม่อีกครั้ง หรือติดต่อ contact@piccab.com';
        return;
      }
      await wipeLocal();
      try{ await sb.auth.signOut({ scope:'local' }); }catch(e){}
      store.set('pv-flash','ลบบัญชีและข้อมูลทั้งหมดแล้ว');
      location.replace('/app');
    });
    m.append(el('h3',{text:'ลบบัญชีและข้อมูลทั้งหมด'}),
      el('p',{text:'สิ่งที่จะถูกลบถาวร และกู้คืนไม่ได้:'}),
      el('ul',{class:'dellist'},
        el('li',{text:'บัญชี '+(user&&user.email||'')}),
        el('li',{text:'ฉากและรูปทั้งหมดในบัญชี'}),
        el('li',{text:'ความคืบหน้า ชุดคำ และเครดิต AI'}),
        el('li',{text:'ข้อมูล Piccab ที่เก็บในเบราว์เซอร์นี้'})),
      el('p',{class:'note',text:'อยากเก็บฉากไว้ก่อน? กด 🔗 แชร์ฉาก → ส่งเป็นไฟล์ ในโหมดแก้ไขฉาก'}),
      inp, err,
      el('div',{class:'row'}, el('span',{class:'sp'}), el('button',{text:'ยกเลิก',onclick:closeModal}), go));
  });
}
async function wipeLocal(){
  try{ Object.keys(localStorage).filter(k=>k.startsWith('pv-')).forEach(k=>localStorage.removeItem(k)); }catch(e){}
  await new Promise(res=>{ try{ const r=indexedDB.deleteDatabase('piccab'); r.onsuccess=r.onerror=r.onblocked=()=>res(); }catch(e){ res(); } });
}
$('#fbLink').addEventListener('click',()=>openFeedback());
$('#acctBtn').addEventListener('click',()=>{ if(!sb) return; user ? openAccount() : openLogin(); });
if(sb){
  sb.auth.onAuthStateChange((event, session)=>{
    const before = user && user.id;
    user = session && session.user || null;
    renderAcct();
    if(location.href.endsWith('#')){ try{ history.replaceState(null,'',location.pathname+location.search); }catch(e){} }   // left over from the Google sign-in return
    if(user && user.id!==before){ setTimeout(()=>syncNow(true),0); if(aiCredits && !isStudent()) loadCredits(); setTimeout(reportClassProgress, 4000); if(store.get('pv-friends-on',false)) setTimeout(()=>loadFriends().then(()=>{ if(S.view==='class' && FR.tab==='friends') renderFriends(); }), 2500); }
    if(!user && before){ FR.data=null; setSocialBadge(0); ADM.ok=false; }
    if(user && user.id!==before && !isStudent()) checkAdmin();   // signed in (or first load with a session)
    if(user && store.get('pv-usage-signed','')!==thaiToday()){ store.set('pv-usage-signed',thaiToday()); tally('open_signed'); }
    if(!user && before){ aiLeft=null; CL.list=null; setTimeout(()=>syncSignedOut(),0); }
    // student accounts (room code + nickname) don't use AI; switch it back on after they sign out
    if(user && isStudent()){ if(aiReady){ aiReady=false; refresh(); if(S.view!=='play') renderGallery(); } }
    else if(!aiReady && typeof checkAI==='function') checkAI();
    if(S.view==='class') renderClass();
    if(event==='SIGNED_IN' && !$('#modal').hidden && $('#mbox .code')){ closeModal(); toast('✓ เข้าสู่ระบบแล้ว', 3000); }  // signed in via the e-mail link in another tab
  });
}
renderAcct();
// ---------- 🎓 classrooms ----------
// Teachers (accounts with an e-mail) make a class and assign scenes / word decks (share links).
// Students join with the room code + a nickname: if not signed in they get an anonymous "student account".
// Each student's device works out their progress on the assignments and reports it to the class.
// (function / var: the account code above may ask before this part of the script has run)
function isStudent(){ return !!(user && user.is_anonymous); }
function studentNick(){ return String((user && user.user_metadata && user.user_metadata.nickname) || 'นักเรียน').slice(0,30); }
var CL={ list:null, openId:null, detail:null, busy:false };
const classItemsMap=()=>store.get('pv-class-items',{})||{};       // { classId: [shareId…] } for progress reports
async function classApi(method, path, body){
  const tok=await accessToken();
  const r=await fetch('/api/classes'+path,{ method, headers:{ 'content-type':'application/json', ...(tok?{authorization:'Bearer '+tok}:{}) }, body: body?JSON.stringify(body):undefined });
  const j=await r.json().catch(()=>({}));
  return { ok:r.ok, status:r.status, j };
}
const classErr=(r)=>({ bad_code:'ไม่พบห้องเรียนนี้ ตรวจรหัส 6 ตัวอีกครั้ง', bad_nickname:'ใส่ชื่อเล่นก่อนนะ', own_class:'นี่คือห้องที่คุณสอนอยู่แล้ว',
  class_full:'ห้องนี้เต็มแล้ว (200 คน)', rate_limited:'ลองถี่เกินไป รอสักครู่แล้วลองใหม่', student_account:'บัญชีนักเรียนสร้างห้องเรียนไม่ได้ — ครูต้องเข้าสู่ระบบด้วยอีเมลหรือ Google',
  too_many_classes:'สร้างห้องเรียนครบ 50 ห้องแล้ว', too_many_items:'มอบหมายงานครบ 100 รายการแล้ว', other_lang:'งานนี้มอบหมายเป็นภาษาอื่นอยู่แล้ว — เลิกมอบหมายก่อนถ้าจะเปลี่ยนภาษา', needs_update:'ต้องรัน SQL 2026-11-class-lang.sql ใน Supabase ก่อน จึงจะมอบหมายภาษาอื่นได้', not_configured:'ระบบห้องเรียนยังไม่พร้อม', bad_share:'สร้างลิงก์งานไม่สำเร็จ' }[r.j && r.j.error]
  || (r.status===401 ? 'กรุณาเข้าสู่ระบบใหม่อีกครั้ง' : 'เชื่อมต่อไม่สำเร็จ ลองใหม่อีกครั้ง'));
async function loadClasses(){
  if(!user){ CL.list={teaching:[],learning:[]}; return; }
  const r=await classApi('GET','').catch(()=>({ok:false}));
  CL.list = r.ok ? r.j : (CL.list||null);
  if(!r.ok) CL.err=classErr(r); else CL.err=null;
}
function socialTabs(v){
  const t=FR.tab;
  v.append(el('div',{class:'seg socialtabs',role:'tablist'},
    el('button',{class:t==='class'?'on':'',role:'tab',onclick:()=>{ FR.tab='class'; store.set('pv-social-tab','class'); renderClass(); }}, ic('school'), 'ห้องเรียน'),
    el('button',{class:t==='friends'?'on':'',role:'tab',onclick:()=>{ FR.tab='friends'; FR.data=null; store.set('pv-social-tab','friends'); renderClass(); }}, ic('group'), 'เพื่อน', badgeEl(FR.badge))));
}
function renderClass(){
  const v=$('#classView'); if(!v) return;
  if(FR.tab==='friends'){ renderFriends(); return; }
  if(CL.openId){ renderClassDetail(); return; }
  v.innerHTML='';
  socialTabs(v);
  v.append(el('div',{class:'tiles cltiles'},
    el('button',{class:'tile cljoin',onclick:()=>openJoinClass()}, el('span',{class:'ic'},ic('key')),
      el('span',{class:'tt'}, el('b',{text:'เข้าห้องด้วยรหัส'}), el('small',{text:'นักเรียน · ใช้รหัสจากครู ไม่ต้องมีอีเมล'})), el('span',{class:'arrow'},ic('arrow_forward'))),
    el('button',{class:'tile clnew',onclick:createClassDialog}, el('span',{class:'ic'},ic('add')),
      el('span',{class:'tt'}, el('b',{text:'สร้างห้องเรียน'}), el('small',{text:'ครู · มอบหมายฉากและชุดคำ'})), el('span',{class:'arrow'},ic('arrow_forward')))));
  if(!user) return;
  if(!CL.list){ v.append(el('p',{class:'libempty',text:'กำลังโหลด…'})); loadClasses().then(()=>{ if(S.view==='class' && !CL.openId) renderClass(); }); return; }
  if(CL.err) v.append(el('p',{class:'err',text:CL.err}));
  const sec=(icon, title, arr, mk)=>{ v.append(el('div',{class:'hsec'}, el('h3',{}, ic(icon), title))); const box=el('div',{class:'liblist'}); arr.forEach(c=>box.append(mk(c))); v.append(box); };
  if(CL.list.learning.length) sec('backpack', 'ห้องที่ฉันเรียน', CL.list.learning, c=>el('button',{class:'lrow',onclick:()=>openClass(c.id)},
    el('span',{class:'clic'},ic('backpack')), el('span',{class:'lb'}, el('b',{text:c.name}), el('span',{class:'lm'}, ic('person'), c.nickname||'')), ic('chevron_right','chev')));
  if(CL.list.teaching.length) sec('co_present', 'ห้องที่ฉันสอน', CL.list.teaching, c=>el('button',{class:'lrow',onclick:()=>openClass(c.id)},
    el('span',{class:'clic t'},ic('co_present')), el('span',{class:'lb'}, el('b',{text:c.name}),
      el('span',{class:'lm'}, el('span',{class:'clcode',title:'รหัสห้อง'}, ic('key'), c.code), el('span',{title:'นักเรียน'}, ic('group'), String(c.members)))), ic('chevron_right','chev')));
  if(!CL.list.learning.length && !CL.list.teaching.length) v.append(el('p',{class:'libempty',text:'ยังไม่มีห้องเรียน'}));
}
function openClass(id){ CL.openId=id; CL.detail=null; renderClass(); window.scrollTo(0,0); }
function backToClasses(){ CL.openId=null; CL.detail=null; CL.list=null; renderClass(); }
async function loadClassDetail(){
  const id=CL.openId, r=await classApi('GET','/'+id).catch(()=>({ok:false}));
  if(CL.openId!==id) return;
  if(!r.ok){ CL.detail={ error: r.status===404 ? 'ไม่พบห้องนี้ (อาจถูกลบหรือคุณออกจากห้องแล้ว)' : classErr(r) }; }
  else {
    CL.detail=r.j;
    if(r.j.role==='student'){ const mp=classItemsMap(); mp[id]=r.j.items.map(i=>i.share_id); store.set('pv-class-items',mp);
      const lg=classLangs(); r.j.items.forEach(i=>{ const k=id+'/'+i.share_id; if(i.lang && i.lang!=='en') lg[k]=i.lang; else delete lg[k]; }); store.set('pv-class-langs',lg); }
  }
  if(S.view==='class') renderClassDetail();
}
// assignment language per class/share (English unless the teacher chose another)
function classLangs(){ const v=store.get('pv-class-langs',{}); return v && typeof v==='object' ? v : {}; }
// progress of an assignment on this device (null if not started here), in the assignment's language
function localAssignmentProgress(shareId, lang){
  lang=langOk(lang)?lang:'en';
  const rec=(store.get('pv-imported',{})||{})[shareId]; if(!rec) return null;
  let keys=[];
  if(rec.kind==='deck' || rec.deck){ const d=getDeck(rec.deck); if(!d) return null; keys=d.words; }
  else { const sc=scenes().find(x=>x.id===(rec.scenes||[])[0]); if(!sc) return null; keys=Object.keys(sc.items).map(k=>wkey(sc.id,k)); }
  if(lang!=='en') keys=keys.filter(k=>{ const j=k.indexOf('|'), sc=scenes().find(x=>x.id===k.slice(0,j)), it=sc && sc.items[k.slice(j+1)]; return !!(it && it.l && it.l[lang] && it.l[lang].w); });
  let done=0, star=0;
  for(const k of keys){ const j=k.indexOf('|'), p=progress[k.slice(0,j)], id=pk(k.slice(j+1),lang); if(p && p.done && p.done[id]){ done++; if(p.star && p.star[id]) star++; } }
  return { total:keys.length, done, star };
}
let classReportT=null;
function reportClassProgressSoon(){ clearTimeout(classReportT); classReportT=setTimeout(reportClassProgress, 4000); }
async function reportClassProgress(){
  if(!user || navigator.onLine===false) return;
  const mp=classItemsMap(), sent=store.get('pv-class-sent',{})||{}, rows=[];
  for(const [cid, shares] of Object.entries(mp)) for(const sid of shares||[]){
    const key=cid+'/'+sid, pr=localAssignmentProgress(sid, classLangs()[key]); if(!pr) continue;
    const sig=[pr.total,pr.done,pr.star].join(',');
    if(sent[key]===sig) continue;
    rows.push({ class_id:cid, share_id:sid, ...pr, _k:key, _s:sig });
  }
  if(!rows.length) return;
  const r=await classApi('POST','/progress',{ rows:rows.map(({_k,_s,...x})=>x) }).catch(()=>({ok:false}));
  if(r.ok){ rows.forEach(x=>sent[x._k]=x._s); store.set('pv-class-sent',sent); }
}
function pctBar(done,total){ const b=el('span',{class:'bar'+(total&&done===total?' full':'')},el('i')); b.firstChild.style.width=(total?done/total*100:0)+'%'; return b; }
function renderClassDetail(){
  const v=$('#classView'); v.innerHTML=''; socialTabs(v);
  const d=CL.detail;
  v.append(el('div',{class:'clback'}, el('button',{class:'linkbtn',onclick:backToClasses}, ic('arrow_back'), 'ห้องเรียนทั้งหมด')));
  if(!d){ v.append(el('p',{class:'libempty',text:'กำลังโหลด…'})); loadClassDetail(); return; }
  if(d.error){ v.append(el('p',{class:'libempty',text:d.error})); return; }
  if(d.role==='teacher') renderTeacher(v,d); else renderStudent(v,d);
}
// 🏆 leaderboard (rows: {rank, nickname, done, star, me})
function boardEl(rows){
  const medal=r=>r===1?'🥇':r===2?'🥈':r===3?'🥉':String(r);
  const box=el('div',{class:'board'});
  if(!rows.length) box.append(el('p',{class:'note',text:'ยังไม่มีนักเรียนในห้อง'}));
  rows.forEach(r=>box.append(el('div',{class:'brow'+(r.me?' me':'')+(r.rank<=3&&r.done?' top':'')},
    el('span',{class:'brank',text:r.done?medal(r.rank):'·'}),
    el('span',{class:'bname',text:r.nickname+(r.me?' (ฉัน)':'')}),
    el('span',{class:'bscore'}, el('b',{text:'✓ '+r.done}), r.star?el('small',{text:' ★'+r.star}):null))));
  return box;
}
function boardRows(members, progress, items, me){
  const ids=new Set(items.map(i=>i.share_id)), sum=new Map(members.map(m=>[m.user_id,{nickname:m.nickname,done:0,star:0,me:m.user_id===me}]));
  progress.forEach(p=>{ const r=sum.get(p.user_id); if(r && ids.has(p.share_id)){ r.done+=p.done||0; r.star+=p.star||0; } });
  const rows=[...sum.values()].sort((a,b)=>b.done-a.done||b.star-a.star||a.nickname.localeCompare(b.nickname,'th'));
  let rank=0, prev=null; rows.forEach((r,i)=>{ const k=r.done+'/'+r.star; if(k!==prev){ rank=i+1; prev=k; } r.rank=rank; });
  return rows;
}
function renderStudent(v,d){
  v.append(el('div',{class:'ghead'}, el('h2',{text:'🎒 '+d.name}), el('p',{text:'ชื่อในห้อง: '+d.nickname})));
  const srv=new Map(d.progress.map(p=>[p.share_id,p]));
  if(!d.items.length){ v.append(el('p',{class:'libempty',text:'ครูยังไม่ได้มอบหมายงาน'})); }
  else {
    v.append(el('div',{class:'hsec'}, el('h3',{text:'งานที่ได้รับมอบหมาย'})));
    const box=el('div',{class:'liblist'});
    d.items.forEach(it=>{
      const pr=localAssignmentProgress(it.share_id, it.lang) || srv.get(it.share_id) || { total:it.total, done:0, star:0 };
      const started=!!(store.get('pv-imported',{})||{})[it.share_id];
      box.append(el('div',{class:'lrow clitem'},
        el('span',{class:'clic',text:it.kind==='deck'?'📚':'🖼️'}),
        el('span',{class:'lb'}, el('b',{text:it.name}),
          el('span',{class:'lm'+(pr.total&&pr.done===pr.total?' okc':'')}, `${it.kind==='deck'?'ชุดคำ':'ฉาก'}${assignLang(it)} · ทบทวนแล้ว ${pr.done}/${pr.total||it.total} คำ`+(pr.star?` · ★ ${pr.star}`:'')),
          pctBar(pr.done, pr.total||it.total)),
        el('button',{class:started?'':'primary',text:started?'▶ ทำต่อ':'▶ เริ่ม',onclick:e=>startAssignment(it, e.currentTarget)})));
    });
    v.append(box);
    v.append(el('p',{class:'note small',text:'ฝึกด้วยโหมด ✍️ ทบทวน (พิมพ์) เพื่อให้ครูเห็นความคืบหน้า · ความคืบหน้าจะส่งให้ครูอัตโนมัติ'}));
  }
  if(Array.isArray(d.leaderboard)){
    v.append(el('div',{class:'hsec'}, el('h3',{text:'🏆 อันดับในห้อง'}), el('span',{class:'hint',style:'color:var(--muted);font-size:13px',text:'นับคำที่พิมพ์ตอบถูกในงานที่ครูมอบหมาย'})));
    v.append(boardEl(d.leaderboard));
  }
  v.append(el('div',{class:'clfoot'}, el('button',{class:'linkbtn small danger-link',text:'ออกจากห้องนี้',onclick:async()=>{
    if(!(await ask(`ออกจากห้อง “${d.name}”? ครูจะไม่เห็นความคืบหน้าของคุณอีก (ฉากที่เก็บไว้ยังอยู่)`,'ออกจากห้อง'))) return;
    const r=await classApi('DELETE',`/${d.id}/members/me`).catch(()=>({ok:false}));
    if(!r.ok){ toast(classErr(r)); return; }
    const mp=classItemsMap(); delete mp[d.id]; store.set('pv-class-items',mp); toast('ออกจากห้องแล้ว'); backToClasses();
  }})));
  reportClassProgress();
}
// " · 🇩🇪 เยอรมัน" for an assignment in a language other than English
const assignLang=it=> it && it.lang && it.lang!=='en' && LANGS[it.lang] ? ` · ${LANGS[it.lang].flag} ${LANGS[it.lang].name}` : '';
async function startAssignment(it, btn){
  const lang=langOk(it.lang)?it.lang:'en';
  const done=(store.get('pv-imported',{})||{})[it.share_id];
  if(done && (done.scenes||[]).every(id=>scenes().some(x=>x.id===id)) && (!done.deck || getDeck(done.deck))){ setLang(lang); openImported(done); return; }
  if(btn){ btn.disabled=true; btn.textContent='กำลังโหลด…'; }
  try{
    const r=await fetch('/api/share/'+it.share_id,{cache:'no-store'}).then(x=>x.ok?x.json():null);
    if(!r) throw new Error('share');
    const rec=await importShare(it.share_id, r, (i,k)=>{ if(btn) btn.textContent=`กำลังโหลด ${i}/${k}`; });
    reportClassProgressSoon(); setLang(lang); openImported(rec);
  }catch(e){ if(btn){ btn.disabled=false; btn.textContent='▶ ลองอีกครั้ง'; } toast('โหลดงานไม่สำเร็จ ตรวจอินเทอร์เน็ตแล้วลองใหม่'); }
}
function renderTeacher(v,d){
  const link=location.origin+'/c/'+d.code+HL;
  v.append(el('div',{class:'ghead lh'}, el('div',{}, el('h2',{text:'🧑‍🏫 '+d.name}), el('p',{text:`นักเรียน ${d.members.length} คน · งาน ${d.items.length} รายการ`})),
    el('button',{class:'ghost',text:'🔄',title:'โหลดใหม่',onclick:()=>{ CL.detail=null; renderClassDetail(); }})));
  v.append(el('div',{class:'clinvite'},
    el('div',{}, el('small',{text:'รหัสห้อง'}), el('div',{class:'clcode',text:d.code})),
    el('div',{class:'clinv-r'},
      el('p',{text:'ให้นักเรียนเปิด piccab.com → 🎓 ห้องเรียน → เข้าห้องด้วยรหัส หรือส่งลิงก์เชิญ'}),
      el('div',{class:'row'}, el('button',{class:'primary',text:'📋 คัดลอกลิงก์เชิญ',onclick:()=>copyLink(link)}), el('button',{text:'📲 ส่งต่อ…',onclick:()=>shareLinkNative(link,'เข้าห้องเรียน '+d.name)})))));
  // leaderboard switch + preview
  const lbBtn=el('button',{class:'toggle'+(d.leaderboard?' on':''),text:d.leaderboard?'🏆 ตารางอันดับ: เปิด':'🏆 ตารางอันดับ: ปิด',onclick:async()=>{
    lbBtn.disabled=true;
    const r=await classApi('PATCH','/'+d.id,{ leaderboard:!d.leaderboard }).catch(()=>({ok:false}));
    if(!r.ok){ lbBtn.disabled=false; toast(r.j && r.j.error==='needs_update' ? 'ต้องรัน SQL 2026-11-leaderboard.sql ใน Supabase ก่อน' : classErr(r), 4500); return; }
    toast(!d.leaderboard?'เปิดตารางอันดับแล้ว นักเรียนจะเห็นอันดับในห้อง':'ปิดตารางอันดับแล้ว'); CL.detail=null; renderClassDetail(); }});
  v.append(el('div',{class:'cllb'}, lbBtn, el('span',{class:'note small',text: d.leaderboard ? 'นักเรียนเห็นชื่อเล่นและจำนวนคำของเพื่อนในห้องนี้' : 'เปิดเพื่อให้นักเรียนเห็นอันดับของเพื่อนในห้อง (เฉพาะชื่อเล่นและจำนวนคำ)'})));
  if(d.leaderboard && d.members.length) v.append(boardEl(boardRows(d.members, d.progress, d.items, null)));
  // assignments
  v.append(el('div',{class:'hsec'}, el('h3',{text:'งานที่มอบหมาย'}), el('button',{class:'linkbtn',text:'➕ มอบหมายฉากหรือชุดคำ',onclick:()=>openAssignPicker(d)})));
  if(!d.items.length) v.append(el('p',{class:'libempty',text:'ยังไม่มีงาน — กด “มอบหมายฉากหรือชุดคำ” เลือกจากคลังของคุณ'}));
  // progress table
  if(d.items.length){
    const wrap=el('div',{class:'cltablewrap'}), tb=el('table',{class:'cltable'});
    const head=el('tr',{}, el('th',{text:'นักเรียน'}));
    d.items.forEach(it=>head.append(el('th',{}, el('span',{text:(it.kind==='deck'?'📚 ':'🖼️ ')+it.name}), el('small',{text:(it.lang&&it.lang!=='en'&&LANGS[it.lang]?LANGS[it.lang].flag+' ':'')+it.total+' คำ'}),
      el('button',{class:'x',title:'เลิกมอบหมายงานนี้','aria-label':'เลิกมอบหมาย '+it.name,text:'✕',onclick:async()=>{
        if(!(await ask(`เลิกมอบหมาย “${it.name}”? ความคืบหน้าของงานนี้จะถูกลบ`,'เลิกมอบหมาย'))) return;
        const r=await classApi('DELETE',`/${d.id}/items/${it.share_id}`); if(!r.ok) toast(classErr(r)); CL.detail=null; renderClassDetail(); }}))));
    head.append(el('th',{}));
    tb.append(head);
    const pr=new Map(d.progress.map(p=>[p.user_id+'/'+p.share_id,p]));
    if(!d.members.length) tb.append(el('tr',{}, el('td',{colspan:String(d.items.length+2),class:'muted',text:'ยังไม่มีนักเรียนเข้าห้อง — ส่งรหัสหรือลิงก์เชิญให้นักเรียน'})));
    d.members.forEach(mb=>{
      const tr=el('tr',{}, el('td',{class:'nick',text:mb.nickname}));
      d.items.forEach(it=>{
        const p=pr.get(mb.user_id+'/'+it.share_id);
        if(!p){ tr.append(el('td',{class:'muted',text:'—'})); return; }
        const pct=p.total?Math.round(p.done/p.total*100):0;
        tr.append(el('td',{class:'cell'+(pct===100?' full':pct>=50?' half':''),title:'อัปเดต '+new Date(p.updated_at).toLocaleString(LOC)},
          el('b',{text:`${p.done}/${p.total}`}), p.star?el('small',{text:` ★${p.star}`}):null));
      });
      tr.append(el('td',{}, el('button',{class:'x',title:'นำออกจากห้อง','aria-label':'นำ '+mb.nickname+' ออกจากห้อง',text:'✕',onclick:async()=>{
        if(!(await ask(`นำ “${mb.nickname}” ออกจากห้อง?`,'นำออก'))) return;
        const r=await classApi('DELETE',`/${d.id}/members/${mb.user_id}`); if(!r.ok) toast(classErr(r)); CL.detail=null; renderClassDetail(); }})));
      tb.append(tr);
    });
    wrap.append(tb); v.append(wrap);
    v.append(el('p',{class:'note small',text:'ตัวเลข = คำที่นักเรียนพิมพ์ตอบถูกแล้ว / คำทั้งหมด · ★ = ตอบถูกเองโดยไม่ใช้ตัวช่วย · อัปเดตเมื่อนักเรียนเปิดแอปและออนไลน์'}));
    if(d.members.length) v.append(el('div',{class:'clexport'},
      el('span',{class:'lbl',text:'⬇️ ส่งออกความคืบหน้า'}),
      el('button',{class:'primary',text:'📊 Excel (.xlsx)',onclick:()=>{ try{ exportClassXlsx(d); toast('ดาวน์โหลดไฟล์ Excel แล้ว'); }catch(e){ console.warn(e); toast('ส่งออกไม่สำเร็จ ลองใหม่อีกครั้ง'); } }}),
      el('button',{text:'📄 CSV',onclick:()=>{ try{ exportClassCsv(d); toast('ดาวน์โหลดไฟล์ CSV แล้ว'); }catch(e){ console.warn(e); toast('ส่งออกไม่สำเร็จ ลองใหม่อีกครั้ง'); } }}),
      el('span',{class:'note small',text:'ใช้กับ Excel, Google Sheets หรือ Numbers ได้ · กด 🔄 ก่อนเพื่อให้ได้ข้อมูลล่าสุด'})));
  } else if(d.members.length){
    v.append(el('p',{class:'note',text:'นักเรียนในห้อง: '+d.members.map(m=>m.nickname).join(', ')}));
  }
  v.append(el('div',{class:'clfoot'},
    el('button',{class:'linkbtn small',text:'✏️ เปลี่ยนชื่อห้อง',onclick:()=>deckNameDialog('เปลี่ยนชื่อห้องเรียน', d.name, 'บันทึก', async nm=>{ const r=await classApi('PATCH','/'+d.id,{name:nm}); if(!r.ok) toast(classErr(r)); CL.detail=null; renderClassDetail(); }, 'ชื่อห้องเรียน', 60)}),
    el('button',{class:'linkbtn small danger-link',text:'🗑 ลบห้องเรียน',onclick:async()=>{
      if(!(await ask(`ลบห้อง “${d.name}”? นักเรียนจะออกจากห้องทั้งหมด และความคืบหน้าในห้องนี้จะถูกลบ`,'ลบห้องเรียน'))) return;
      const r=await classApi('DELETE','/'+d.id); if(!r.ok){ toast(classErr(r)); return; } toast('ลบห้องเรียนแล้ว'); backToClasses(); }})));
}
// ---------- teacher: export progress (Excel .xlsx built here, or CSV) ----------
// Rows: one per student; per assignment the words passed and ★; then totals. A second sheet has one row per
// student × assignment (easy to filter or pivot), a third explains the columns.
function classExportData(d){
  const pr=new Map(d.progress.map(p=>[p.user_id+'/'+p.share_id,p]));
  const students=d.members.slice().sort((a,b)=>a.nickname.localeCompare(b.nickname,'th'));
  const items=d.items.map(it=>({...it, title:tx(it.kind==='deck'?'ชุดคำ: ':'ฉาก: ')+it.name+(it.lang&&it.lang!=='en'&&LANGS[it.lang]?` (${tx(LANGS[it.lang].name)})`:'')}));
  const rows=students.map((mb,i)=>{
    let done=0, star=0, total=0, last=0; const cells=[], long=[];
    items.forEach(it=>{
      const p=pr.get(mb.user_id+'/'+it.share_id), t=(p&&p.total)||it.total||0, dn=p?Math.min(p.done||0,t||p.done||0):0, st=p?(p.star||0):0;
      const at=p && p.updated_at ? Date.parse(p.updated_at) : 0; if(at>last) last=at;
      done+=dn; star+=st; total+=t; cells.push(dn, st);
      long.push([mb.nickname, it.title, t, dn, st, t?dn/t:0, tx(!p?'ยังไม่เริ่ม':(t&&dn>=t)?'ครบแล้ว':'กำลังทำ'), at?new Date(at):null]);
    });
    return { no:i+1, nick:mb.nickname, joined:mb.joined_at?new Date(mb.joined_at):null, cells, done, star, total, pct:total?done/total:0, last:last?new Date(last):null, long };
  });
  const head=['ลำดับ','ชื่อเล่น','เข้าห้องเมื่อ'].map(tx);
  items.forEach(it=>head.push(UI==='en' ? `${it.title} — passed (of ${it.total} words)` : `${it.title} — ผ่าน (จาก ${it.total} คำ)`, `${it.title} — ★`));
  head.push(...['ผ่านรวม (คำ)','★ รวม','คำทั้งหมด','ผ่าน (%)','อัปเดตล่าสุด'].map(tx));
  return { items, rows, head,
    longHead:['ชื่อเล่น','งาน','คำทั้งหมด','ผ่าน (คำ)','★','ผ่าน (%)','สถานะ','อัปเดตล่าสุด'].map(tx) };
}
const exportName=(d,ext)=>{ const t=new Date(), z=n=>String(n).padStart(2,'0');
  return `Piccab-${String(d.name).replace(/[\\/:*?"<>|\s]+/g,'-').replace(/^-+|-+$/g,'').slice(0,40)||'class'}-${t.getFullYear()}-${z(t.getMonth()+1)}-${z(t.getDate())}.${ext}`; };
function downloadBlob(blob, name){
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; document.body.appendChild(a); a.click();
  setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 4000);
}
const fmtDate=dt=>dt?dt.getFullYear()+'-'+String(dt.getMonth()+1).padStart(2,'0')+'-'+String(dt.getDate()).padStart(2,'0')+' '+String(dt.getHours()).padStart(2,'0')+':'+String(dt.getMinutes()).padStart(2,'0'):'';
function exportClassCsv(d){
  const X=classExportData(d);
  // nicknames are typed by students: never let a cell start like a formula
  const cell=v=>{ if(v==null) return ''; if(typeof v==='number') return String(Math.round(v*100)/100);
    let t=String(v); if(/^[=+\-@\t\r]/.test(t)) t="'"+t; return /[",\n\r]/.test(t)?'"'+t.replace(/"/g,'""')+'"':t; };
  const lines=[X.head.map(cell).join(',')];
  X.rows.forEach(r=>lines.push([r.no, r.nick, fmtDate(r.joined), ...r.cells, r.done, r.star, r.total, Math.round(r.pct*100), fmtDate(r.last)].map(cell).join(',')));
  downloadBlob(new Blob(['﻿'+lines.join('\r\n')+'\r\n'],{type:'text/csv;charset=utf-8'}), exportName(d,'csv'));   // BOM: Excel reads Thai correctly
}
// --- minimal .xlsx writer: inline strings, 3 styles, stored (uncompressed) zip ---
const CRC_T=(()=>{ const t=new Uint32Array(256); for(let n=0;n<256;n++){ let c=n; for(let k=0;k<8;k++) c=c&1?0xEDB88320^(c>>>1):c>>>1; t[n]=c>>>0; } return t; })();
function crc32(b){ let c=0xFFFFFFFF; for(let i=0;i<b.length;i++) c=CRC_T[(c^b[i])&255]^(c>>>8); return (c^0xFFFFFFFF)>>>0; }
function zipStore(files){
  const enc=new TextEncoder(), parts=[], central=[]; let off=0;
  const now=new Date(), dt=((now.getHours()<<11)|(now.getMinutes()<<5)|(now.getSeconds()>>1)), dd=(((now.getFullYear()-1980)<<9)|((now.getMonth()+1)<<5)|now.getDate());
  for(const f of files){
    const name=enc.encode(f.name), data=typeof f.data==='string'?enc.encode(f.data):f.data, crc=crc32(data);
    const h=new DataView(new ArrayBuffer(30)); h.setUint32(0,0x04034b50,true); h.setUint16(4,20,true); h.setUint16(6,0x0800,true); h.setUint16(8,0,true);
    h.setUint16(10,dt,true); h.setUint16(12,dd,true); h.setUint32(14,crc,true); h.setUint32(18,data.length,true); h.setUint32(22,data.length,true); h.setUint16(26,name.length,true); h.setUint16(28,0,true);
    parts.push(h.buffer,name,data);
    const c=new DataView(new ArrayBuffer(46)); c.setUint32(0,0x02014b50,true); c.setUint16(4,20,true); c.setUint16(6,20,true); c.setUint16(8,0x0800,true); c.setUint16(10,0,true);
    c.setUint16(12,dt,true); c.setUint16(14,dd,true); c.setUint32(16,crc,true); c.setUint32(20,data.length,true); c.setUint32(24,data.length,true); c.setUint16(28,name.length,true);
    c.setUint32(42,off,true); central.push(c.buffer,name);
    off+=30+name.length+data.length;
  }
  const csize=central.reduce((a,b)=>a+(b.byteLength!=null?b.byteLength:b.length),0);
  const e=new DataView(new ArrayBuffer(22)); e.setUint32(0,0x06054b50,true); e.setUint16(8,files.length,true); e.setUint16(10,files.length,true); e.setUint32(12,csize,true); e.setUint32(16,off,true);
  return new Blob([...parts,...central,e.buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}
const xesc=t=>String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'');
function xlCol(n){ let s=''; n++; while(n){ const m=(n-1)%26; s=String.fromCharCode(65+m)+s; n=Math.floor((n-1)/26); } return s; }
const xlSerial=dt=>(dt.getTime()-dt.getTimezoneOffset()*60000)/86400000+25569;       // Excel date number (local time)
// rows: arrays of values; kinds per column: 's' text, 'n' number, 'p' percent, 'd' date
function xlSheet(head, rows, kinds, widths){
  const out=['<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:'+xlCol(head.length-1)+(rows.length+1)+'"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>'];
  widths.forEach((w,i)=>out.push(`<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`));
  out.push('</cols><sheetData>');
  const row=(r,vals,hdr)=>{ out.push(`<row r="${r}">`); vals.forEach((v,i)=>{ const ref=xlCol(i)+r, k=hdr?'s':kinds[i];
    if(v==null||v==='') return;
    if(k==='s') out.push(`<c r="${ref}" t="inlineStr"${hdr?' s="1"':''}><is><t xml:space="preserve">${xesc(v)}</t></is></c>`);
    else if(k==='p') out.push(`<c r="${ref}" s="2"><v>${+v}</v></c>`);
    else if(k==='d') out.push(`<c r="${ref}" s="3"><v>${xlSerial(v)}</v></c>`);
    else out.push(`<c r="${ref}"><v>${+v}</v></c>`); }); out.push('</row>'); };
  row(1,head,true); rows.forEach((v,i)=>row(i+2,v,false));
  out.push(`</sheetData><autoFilter ref="A1:${xlCol(head.length-1)}${Math.max(1,rows.length+1)}"/></worksheet>`);
  return out.join('');
}
function exportClassXlsx(d){
  const X=classExportData(d), n=X.items.length;
  const kinds=['n','s','d', ...Array(n*2).fill('n'), 'n','n','n','p','d'];
  const widths=[7,18,17, ...X.items.flatMap(()=>[16,8]), 13,9,11,10,17];
  const sum=xlSheet(X.head, X.rows.map(r=>[r.no, r.nick, r.joined, ...r.cells, r.done, r.star, r.total, r.pct, r.last]), kinds, widths);
  const long=xlSheet(X.longHead, X.rows.flatMap(r=>r.long), ['s','s','n','n','n','p','s','d'], [18,34,11,10,7,10,12,17]);
  const info=xlSheet(['หัวข้อ','รายละเอียด'].map(tx), [
    [UI==='en'?'Class':'ห้องเรียน', d.name], [tx('รหัสห้อง'), d.code], ...[['นักเรียน', d.members.length+' คน'], ['งานที่มอบหมาย', n+' รายการ'], ['ส่งออกเมื่อ', fmtDate(new Date())],
    ['ผ่าน', 'จำนวนคำที่นักเรียนพิมพ์ตอบถูกแล้ว (ในโหมดทบทวน)'], ['★', 'คำที่ตอบถูกเองโดยไม่ใช้คำใบ้ ฟังเสียง หรือดูเฉลย'],
    ['ผ่าน (%)', 'ผ่านรวม ÷ คำทั้งหมดของทุกงาน'], ['อัปเดตล่าสุด', 'ครั้งล่าสุดที่แอปของนักเรียนส่งความคืบหน้า (เมื่อเปิดแอปและออนไลน์)'],
    ['หมายเหตุ', 'ข้อมูลนี้มีชื่อเล่นของนักเรียน โปรดเก็บรักษาตามนโยบายของโรงเรียน']].map(r=>r.map(tx))], ['s','s'], [16,70]);
  const sheets=[[tx('สรุปรายคน'),sum],[tx('รายงาน-รายคน'),long],[tx('คำอธิบาย'),info]];
  const files=[
    {name:'[Content_Types].xml', data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'+sheets.map((s,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')+'</Types>'},
    {name:'_rels/.rels', data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'},
    {name:'xl/workbook.xml', data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'+sheets.map((s,i)=>`<sheet name="${xesc(s[0])}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')+`</sheets><definedNames>${[0,1].map(i=>`<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${xesc(sheets[i][0])}'!$A$1:$${xlCol((i?X.longHead:X.head).length-1)}$${Math.max(1,(i?X.rows.reduce((a,r)=>a+r.long.length,0):X.rows.length)+1)}</definedName>`).join('')}</definedNames></workbook>`},
    {name:'xl/_rels/workbook.xml.rels', data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+sheets.map((s,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')+`<Relationship Id="rId${sheets.length+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`},
    {name:'xl/styles.xml', data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy-mm-dd hh:mm"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Tahoma"/><family val="2"/></font><font><b/><sz val="11"/><name val="Tahoma"/><family val="2"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEFEAF7"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="9" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'},
    ...sheets.map((s,i)=>({name:`xl/worksheets/sheet${i+1}.xml`, data:s[1]})),
  ];
  downloadBlob(zipStore(files), exportName(d,'xlsx'));
}
// teacher: choose a scene or deck → (make / refresh its share link) → assign
function openAssignPicker(d){
  const mine=customs.filter(sc=>Object.keys(sc.items).length);
  const live=liveKeys(), dks=deckList().filter(x=>!x.virtual && deckCount(x,live));
  let alang=S.lang;   // the language students will practise it in
  // scenes behind a scene / word set, and how many of its words have the language
  const scenesOf=t=>t.kind==='scene' ? [t.sc] : [...new Set(t.deck.words.filter(k=>live.has(k)).map(k=>k.slice(0,k.indexOf('|'))))].map(id=>scenes().find(x=>x.id===id)).filter(Boolean);
  const wordsIn=(t,lang)=>{
    const keys=t.kind==='scene' ? Object.keys(t.sc.items).map(k=>wkey(t.sc.id,k)) : t.deck.words.filter(k=>live.has(k));
    if(lang==='en') return [keys.length, keys.length];
    const have=keys.filter(k=>{ const j=k.indexOf('|'), sc=scenes().find(x=>x.id===k.slice(0,j)), it=sc&&sc.items[k.slice(j+1)]; return !!(it && it.l && it.l[lang] && it.l[lang].w); });
    return [have.length, keys.length];
  };
  openModal(m=>{
    m.classList.add('dkbox');
    m.append(el('h3',{text:'มอบหมายงานให้ห้อง “'+d.name+'”'}), el('p',{class:'note',text:'เลือกฉากหรือชุดคำ ระบบจะสร้างลิงก์ (สำเนา ณ ตอนนี้) ให้นักเรียน'}));
    const langSeg=el('div',{class:'aslang'}), segIn=el('div',{class:'seg',role:'group','aria-label':'ภาษาที่ให้นักเรียนฝึก'});
    const list=el('div',{class:'dk-list tall'});
    const targets=[{kind:'scene',sc:BUILTIN[0],icon:'🖼️',meta:'ฉากตัวอย่าง · '}].concat(mine.map(sc=>({kind:'scene',sc,icon:'🖼️',meta:'ฉาก · '})), dks.map(dk=>({kind:'deck',deck:dk,icon:'📚',meta:'ชุดคำ · '})));
    const draw=()=>{
      langSeg.innerHTML=''; segIn.innerHTML=''; langSeg.append(el('span',{class:'lbl',text:'นักเรียนฝึกเป็นภาษา'}), segIn);
      Object.entries(LANGS).forEach(([k,L])=>segIn.append(el('button',{type:'button',class:k===alang?'on':'',text:L.flag+' '+L.name,onclick:()=>{ alang=k; draw(); }})));
      list.innerHTML='';
      targets.forEach(t=>{
        const [n,all]=wordsIn(t,alang), name=t.kind==='scene'?t.sc.name:deckName(t.deck);
        // separate pieces of text, so each one translates on its own
        const meta=el('small',{}, t.meta, n===all ? `${all} คำ` : `มีคำภาษา${LANGS[alang].name} ${n}/${all} คำ`, n===all ? '' : ' · ที่เหลือจะแปลให้ตอนมอบหมาย');
        list.append(el('button',{class:'dk-row asrow',onclick:e=>assign(t,e.currentTarget)}, el('span',{class:'dk-name'}, el('b',{text:t.icon+' '+name}), meta), el('span',{class:'dk-n',text:'มอบหมาย ›'})));
      });
    };
    const err=el('p',{class:'err'});
    if(Object.keys(LANGS).length>1) m.append(langSeg);
    m.append(list, err, el('div',{class:'row'}, el('span',{class:'sp'}), el('button',{text:'ปิด',onclick:closeModal})));
    draw();
    const assign=async(t,btn)=>{
      const lang=alang, all=m.querySelectorAll('.dk-list button, .aslang button'), lab=btn.querySelector('.dk-n');
      all.forEach(b=>b.disabled=true); lab.textContent='กำลังสร้าง…'; err.textContent='';
      const fail=msg=>{ err.textContent=msg; all.forEach(b=>b.disabled=false); lab.textContent='มอบหมาย ›'; };
      if(lang!=='en'){
        // students can't use AI: the words must be in the link already
        const need=scenesOf(t).filter(sc=>!sc.builtin && missingIn(sc,lang).length);
        if(need.length && autoLangState(need[0])==='ok'){ lab.textContent=`กำลังเตรียมคำภาษา${LANGS[lang].name}…`; for(const sc of need) await autoTranslate(sc,lang); }
        if(!wordsIn(t,lang)[0]) return fail(`ยังไม่มีคำภาษา${LANGS[lang].name}ในงานนี้ — เปิดฉากในโหมดภาษา${LANGS[lang].name}แล้วใส่คำก่อน`);
        lab.textContent='กำลังสร้าง…';
      }
      const key=shareKey(t), body=sharePayload(t), cur=myShares[key]; if(cur) body.id=cur.id;
      if(!(await picturesUploaded(body))) return fail(shareErr(0,{error:'picture_missing'}));
      const r=await shareApi('POST','/api/share',body).catch(()=>({ok:false,status:0,j:{}}));
      if(!r.ok) return fail(shareErr(r.status,r.j));
      myShares[key]={ id:r.j.id, at:Date.now() }; store.set('pv-shares',myShares);
      const a=await classApi('POST',`/${d.id}/items`,{ share_id:r.j.id, ...(lang!=='en'?{lang}:{}) });
      if(!a.ok) return fail(classErr(a));
      closeModal(); toast('มอบหมายงานแล้ว ✓'); CL.detail=null; renderClassDetail();
    };
  });
}
function openJoinClass(code){
  openModal(m=>{
    const ci=el('input',{class:'code clcodein',maxlength:'7',placeholder:'รหัส 6 ตัว',autocomplete:'off',autocapitalize:'characters',spellcheck:'false',value:code||'','aria-label':'รหัสห้องเรียน'});
    const ni=el('input',{maxlength:'30',placeholder:'ชื่อเล่น เช่น มิ้นท์ ป.4/2',autocomplete:'nickname','aria-label':'ชื่อเล่น',value:isStudent()?studentNick():''});
    const err=el('p',{class:'err'}), go=el('button',{class:'primary',text:'เข้าห้อง'});
    const tsbox=el('div',{class:'tsbox'}); let hc=null;
    modalClose=()=>{ if(hc) hc.remove(); };
    ci.addEventListener('input',()=>{ ci.value=ci.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6); });
    const submit=async()=>{
      const c=ci.value.trim(), nick=ni.value.trim();
      if(c.length!==6){ err.textContent='ใส่รหัสห้อง 6 ตัวจากครู'; ci.focus(); return; }
      if(!nick){ err.textContent='ใส่ชื่อเล่นที่ครูจะเห็น'; ni.focus(); return; }
      go.disabled=true; go.textContent='กำลังเข้าห้อง…'; err.textContent='';
      if(!user){
        let captchaToken;
        try{ captchaToken= hc ? await hc.token() : undefined; }catch(e){ go.disabled=false; go.textContent='เข้าห้อง'; err.textContent=capErr(e); return; }
        const { error } = await sb.auth.signInAnonymously({ options:{ data:{ nickname:nick }, captchaToken } });
        if(error){ go.disabled=false; go.textContent='เข้าห้อง';
          err.textContent=/anonymous.*(disabled|not enabled)|provider.*disabled/i.test(error.message||'') ? 'ยังเปิดให้นักเรียนเข้าห้องแบบไม่ใช้อีเมลไม่ได้ ลองเข้าสู่ระบบด้วยอีเมลแทน' : authErr(error); return; }
        for(let i=0;i<30 && !user;i++) await new Promise(r=>setTimeout(r,100));
      }
      const r=await classApi('POST','/join',{ code:c, nickname:nick }).catch(()=>({ok:false}));
      if(!r.ok){ go.disabled=false; go.textContent='เข้าห้อง'; err.textContent=classErr(r); return; }
      closeModal(); toast('เข้าห้อง “'+r.j.name+'” แล้ว 🎉', 3500); tally('class_join');
      CL.list=null; if(S.view!=='class') goHome('class'); openClass(r.j.id);
    };
    go.addEventListener('click',submit);
    [ci,ni].forEach(x=>x.addEventListener('keydown',e=>{ if(e.key==='Enter') submit(); }));
    m.append(el('h3',{text:'🔑 เข้าห้องเรียน'}),
      el('label',{},'รหัสห้องจากครู', ci), el('label',{},'ชื่อเล่น (ครูจะเห็นชื่อนี้)', ni), tsbox, err,
      el('div',{class:'row'}, el('span',{class:'sp'}), el('button',{text:'ยกเลิก',onclick:closeModal}), go),
      el('p',{class:'note small'}, user ? (isStudent() ? 'เข้าด้วยบัญชีนักเรียนในเครื่องนี้' : 'เข้าด้วยบัญชี '+(user.email||'')) : 'ไม่ต้องมีอีเมล — ระบบจะสร้างบัญชีนักเรียนในเครื่องนี้ให้ · ใช้ชื่อเล่น ไม่ต้องใส่ชื่อจริงหรือนามสกุล',
        ' · ', el('a',{href:'/privacy#class',target:'_blank',text:'ความเป็นส่วนตัว'})));
    if(!user) hc=humanCheck(tsbox);       // only a new student account needs the check
  });
}
function createClassDialog(){
  if(!user || isStudent()){ openModal(m=>m.append(el('h3',{text:'➕ สร้างห้องเรียน'}),
    el('p',{text: isStudent() ? 'บัญชีนักเรียนสร้างห้องเรียนไม่ได้ ครูต้องเข้าสู่ระบบด้วยอีเมลหรือ Google ในเครื่องของครู' : 'ครูต้องเข้าสู่ระบบด้วยอีเมลหรือ Google ก่อน เพื่อเก็บห้องเรียนไว้ในบัญชี'}),
    el('div',{class:'row'}, el('span',{class:'sp'}), el('button',{text:'ปิด',onclick:closeModal}), isStudent()?null:el('button',{class:'primary',text:'👤 เข้าสู่ระบบ',onclick:()=>openLogin()})))); return; }
  deckNameDialog('สร้างห้องเรียน', '', 'สร้าง', async name=>{
    const r=await classApi('POST','',{ name }).catch(()=>({ok:false}));
    if(!r.ok){ toast(classErr(r), 4000); return; }
    toast('สร้างห้อง “'+name+'” แล้ว — รหัส '+r.j.code, 4000); CL.list=null; openClass(r.j.id);
  }, 'เช่น ป.4/2 ภาษาอังกฤษ', 60);
}
function openStudentAccount(){
  openModal(m=>m.append(el('h3',{text:'🎓 บัญชีนักเรียน'}),
    el('p',{}, 'ชื่อเล่น: ', el('b',{text:studentNick()})),
    el('p',{class:'note warn',text:'บัญชีนี้ไม่มีอีเมล ข้อมูลอยู่ในเบราว์เซอร์นี้เท่านั้น ถ้าออกจากระบบ ล้างข้อมูลเบราว์เซอร์ หรือเปลี่ยนเครื่อง จะกลับมาใช้บัญชีนี้ไม่ได้'}),
    el('p',{class:'note',id:'syncNote',text:syncText()}),
    el('div',{class:'row'}, el('button',{text:'🎓 ห้องเรียนของฉัน',onclick:()=>{ closeModal(); goHome('class'); }}), el('span',{class:'sp'}), el('button',{class:'primary',text:'ปิด',onclick:closeModal})),
    el('div',{class:'acctlinks'},
      el('button',{class:'linkbtn small',text:'ออกจากระบบ',onclick:async()=>{
        if(!(await ask('ออกจากบัญชีนักเรียน? จะกลับมาใช้บัญชีนี้ไม่ได้อีก ความคืบหน้าในห้องเรียนจะหายจากเครื่องนี้','ออกจากระบบ'))) return;
        await sb.auth.signOut(); toast('ออกจากระบบแล้ว'); }}), ' · ',
      el('a',{href:'/privacy',target:'_blank',text:'นโยบายความเป็นส่วนตัว'}), ' · ',
      el('button',{class:'linkbtn small danger-link',text:'ลบบัญชีและข้อมูล',onclick:openDeleteAccount}))));
}
const classLinkCode=((/^\/c\/([A-Za-z2-9]{6})\/?$/.exec(location.pathname)||[])[1]||'').toUpperCase()||null;
// ---------- 👫 friends (safe by design: codes in person, no search, no chat) ----------
var FR={ tab: store.get('pv-social-tab','class')==='friends'?'friends':'class', data:null, loading:false, badge:0 };
const CHEER_TEXT={ clap:'👏 เก่งมาก!', fire:'🔥 มาทบทวนกันเถอะ', strong:'💪 สู้ๆ นะ', star:'⭐ ได้ดาวเยอะเลย' };
function badgeEl(n){ return n ? el('span',{class:'nbadge',text:n>9?'9+':String(n)}) : null; }
function setSocialBadge(n){
  FR.badge=n;
  document.querySelectorAll('.mainnav button[data-view=class], .bnav button[data-view=class]').forEach(b=>{ const old=b.querySelector('.nbadge'); if(old) old.remove(); const e=badgeEl(n); if(e) b.append(e); });
}
async function friendsApi(method, path, body){
  const tok=await accessToken();
  const r=await fetch('/api/friends'+path,{ method, headers:{ 'content-type':'application/json', ...(tok?{authorization:'Bearer '+tok}:{}) }, body: body?JSON.stringify(body):undefined });
  const j=await r.json().catch(()=>({}));
  return { ok:r.ok, status:r.status, j };
}
const friendErr=r=>({ bad_code:'ไม่พบรหัสนี้ ตรวจรหัส 8 ตัวอีกครั้ง', self:'นี่คือรหัสของคุณเอง', classmates_only:'บัญชีนักเรียนเป็นเพื่อนได้เฉพาะกับเพื่อนในห้องเรียนเดียวกัน',
  too_many_friends:'มีเพื่อนครบ 200 คนแล้ว', too_many_requests:'ส่งคำขอค้างไว้เยอะแล้ว รอเพื่อนยืนยันก่อน', rate_limited:'ลองถี่เกินไป รอสักครู่',
  too_many_cheers:'ส่งกำลังใจให้เพื่อนคนนี้ครบ 5 ครั้งวันนี้แล้ว', too_many_sends:'ส่งฉากครบ 20 ครั้งวันนี้แล้ว', not_friends:'ยังไม่ได้เป็นเพื่อนกัน', bad_nickname:'ใส่ชื่อเล่นก่อนนะ',
  not_configured:'ระบบเพื่อนยังไม่พร้อม', no_profile:'เปิดใช้เพื่อนก่อน' }[r.j && r.j.error] || (r.status===401?'กรุณาเข้าสู่ระบบใหม่อีกครั้ง':'เชื่อมต่อไม่สำเร็จ ลองใหม่อีกครั้ง'));
function friendStats(){
  let week=0; const d=new Date(); for(let i=0;i<7;i++){ week+=((days[dkey(d)]||{}).n||0); d.setDate(d.getDate()-1); }
  let total=0; for(const p of Object.values(progress)) total+=Object.keys((p&&p.done)||{}).length;
  return { streak:streak(), week_words:week, total_words:total };
}
let frStatsT=null;
function reportFriendStatsSoon(){ if(!user || !store.get('pv-friends-on',false)) return; clearTimeout(frStatsT); frStatsT=setTimeout(()=>friendsApi('POST','/me',{ stats:friendStats() }).catch(()=>{}), 6000); }
async function loadFriends(){
  if(!user){ FR.data=null; return; }
  FR.loading=true;
  const r=await friendsApi('GET','').catch(()=>({ok:false}));
  FR.loading=false;
  if(r.ok){ FR.data=r.j; FR.err=null; store.set('pv-friends-on', !!r.j.me); setSocialBadge(r.j.me ? (r.j.incoming.length + r.j.events.filter(e=>!e.seen).length) : 0); }
  else FR.err=friendErr(r);
}
function ago2(ts){ const s=(Date.now()-Date.parse(ts))/1000; return s<3600?Math.max(1,Math.round(s/60))+' นาทีที่แล้ว':s<86400?Math.round(s/3600)+' ชม.ที่แล้ว':Math.round(s/86400)+' วันที่แล้ว'; }
function renderFriends(){
  const v=$('#classView'); v.innerHTML=''; socialTabs(v);
  v.append(el('div',{class:'ghead'}, el('h2',{text:'เพื่อน'}), el('p',{text:'แลกรหัสกับเพื่อนที่รู้จัก ดูว่าใครฝึกกี่คำ ส่งกำลังใจ และส่งฉากให้กัน'})));
  if(!user){
    v.append(el('div',{class:'frintro'},
      el('p',{text:'ต้องมีบัญชีก่อน: ผู้ใหญ่เข้าสู่ระบบด้วยอีเมลหรือ Google ส่วนนักเรียนเข้าห้องเรียนด้วยรหัสจากครู (เป็นเพื่อนได้กับเพื่อนในห้องเดียวกัน)'}),
      el('div',{class:'row'}, el('button',{class:'primary',text:'👤 เข้าสู่ระบบ',onclick:()=>openLogin()}), el('button',{text:'🔑 เข้าห้องเรียน',onclick:()=>{ FR.tab='class'; openJoinClass(); }}))));
    return;
  }
  if(!FR.data){ v.append(el('p',{class:'libempty',text: FR.err || 'กำลังโหลด…'})); if(!FR.loading && !FR.err) loadFriends().then(()=>{ if(S.view==='class' && FR.tab==='friends') renderFriends(); }); return; }
  const d=FR.data;
  if(!d.me){
    const ni=el('input',{maxlength:'30',placeholder:'ชื่อเล่นที่เพื่อนจะเห็น',value:isStudent()?studentNick():'','aria-label':'ชื่อเล่น'});
    const go=el('button',{class:'primary',text:'เริ่มใช้เพื่อน'});
    go.addEventListener('click',async()=>{ if(!ni.value.trim()){ ni.focus(); return; } go.disabled=true;
      const r=await friendsApi('POST','/me',{ nickname:ni.value, stats:friendStats() }); if(!r.ok){ go.disabled=false; toast(friendErr(r)); return; }
      store.set('pv-friends-on',true); FR.data=null; renderFriends(); });
    v.append(el('div',{class:'frintro'},
      el('ul',{class:'frsafe'},
        el('li',{text:'เป็นเพื่อนกันได้ด้วยการแลกรหัสหรือสแกน QR เท่านั้น — ไม่มีใครค้นหาคุณได้'}),
        el('li',{text:'ไม่มีแชต ส่งได้แค่คำให้กำลังใจสำเร็จรูป และฉากหรือชุดคำ (ต้องกดรับก่อน)'}),
        el('li',{text:'เพื่อนเห็นแค่ชื่อเล่น 🔥 วันติดกัน และจำนวนคำที่ฝึก ไม่เห็นอีเมล'}),
        isStudent() ? el('li',{text:'บัญชีนักเรียนเป็นเพื่อนได้เฉพาะกับเพื่อนในห้องเรียนเดียวกัน'}) : null,
        el('li',{text:'ลบเพื่อน บล็อก หรือรายงานได้ทุกเมื่อ'})),
      el('label',{class:'frlabel'},'ชื่อเล่นที่เพื่อนจะเห็น (ไม่ใช้ชื่อจริงก็ได้)', ni),
      el('div',{class:'row'}, go)));
    return;
  }
  const link=location.origin+'/f/'+d.me.code+HL;
  // my card
  const qrBox=el('div',{class:'frqr'});
  v.append(el('div',{class:'clinvite frme'},
    qrBox,
    el('div',{class:'clinv-r'},
      el('small',{text:'รหัสเพื่อนของ '+d.me.nickname}), el('div',{class:'clcode',text:d.me.code}),
      el('p',{text:'ให้เพื่อนสแกน QR หรือใส่รหัสนี้ — ให้เฉพาะเพื่อนที่รู้จักเท่านั้น'}),
      el('div',{class:'row'},
        el('button',{class:'primary',text:'📋 คัดลอกลิงก์',onclick:()=>copyLink(link)}),
        el('button',{text:'📲 ส่งต่อ…',onclick:()=>shareLinkNative(link,'มาเป็นเพื่อนฝึกคำศัพท์กันบน Piccab')}),
        el('button',{class:'linkbtn small',text:'✏️ ชื่อเล่น',onclick:()=>deckNameDialog('ชื่อเล่นที่เพื่อนเห็น', d.me.nickname, 'บันทึก', async nm=>{ const r=await friendsApi('POST','/me',{nickname:nm}); if(!r.ok) toast(friendErr(r)); FR.data=null; renderFriends(); }, 'ชื่อเล่น')}),
        el('button',{class:'linkbtn small',text:'🔄 ขอรหัสใหม่',title:'รหัสเดิมจะใช้ไม่ได้',onclick:async()=>{ if(!(await ask('ขอรหัสเพื่อนใหม่? รหัสและ QR เดิมจะใช้ไม่ได้ (เพื่อนเดิมยังอยู่)','ขอรหัสใหม่'))) return; const r=await friendsApi('POST','/me',{regenerate:true}); if(!r.ok) toast(friendErr(r)); FR.data=null; renderFriends(); }})))));
  drawQr(qrBox, link);
  // add a friend
  const ci=el('input',{class:'frcodein',maxlength:'9',placeholder:'รหัสเพื่อน 8 ตัว',autocapitalize:'characters',autocomplete:'off',spellcheck:'false','aria-label':'รหัสเพื่อน'});
  ci.addEventListener('input',()=>{ ci.value=ci.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8); });
  const addBtn=el('button',{class:'primary',text:'➕ ขอเป็นเพื่อน',onclick:()=>requestFriend(ci.value, addBtn)});
  ci.addEventListener('keydown',e=>{ if(e.key==='Enter') requestFriend(ci.value, addBtn); });
  v.append(el('div',{class:'fradd'}, ci, addBtn));
  if(d.me.student) v.append(el('p',{class:'note small',text:'บัญชีนักเรียนเป็นเพื่อนได้เฉพาะกับเพื่อนในห้องเรียนเดียวกัน'}));
  // inbox
  const unseen=d.events.filter(e=>!e.seen);
  if(d.incoming.length || d.events.length){
    v.append(el('div',{class:'hsec'}, el('h3',{text:'📬 กล่องจดหมาย'})));
    const box=el('div',{class:'liblist'});
    d.incoming.forEach(f=>box.append(el('div',{class:'lrow frrow new'},
      el('span',{class:'clic',text:'🤝'}), el('span',{class:'lb'}, el('b',{text:f.nickname}), el('span',{class:'lm',text:'ขอเป็นเพื่อนกับคุณ'})),
      el('button',{class:'primary',text:'ยอมรับ',onclick:async()=>{ const r=await friendsApi('POST',`/${f.id}/accept`); if(!r.ok) toast(friendErr(r)); else toast('เป็นเพื่อนกับ '+f.nickname+' แล้ว 🎉'); FR.data=null; renderFriends(); }}),
      el('button',{text:'ไม่รับ',onclick:async()=>{ await friendsApi('DELETE',`/${f.id}`); FR.data=null; renderFriends(); }}))));
    d.events.slice(0,30).forEach(e=>{
      if(e.kind==='cheer') box.append(el('div',{class:'lrow frrow'+(e.seen?'':' new')},
        el('span',{class:'clic',text:(CHEER_TEXT[e.data.cheer]||'👏').slice(0,2)}), el('span',{class:'lb'}, el('b',{text:CHEER_TEXT[e.data.cheer]||''}), el('span',{class:'lm',text:'จาก '+e.from.nickname+' · '+ago2(e.created_at)}))));
      else box.append(el('div',{class:'lrow frrow'+(e.seen?'':' new')},
        el('span',{class:'clic',text:e.data.kind==='deck'?'📚':'🖼️'}),
        el('span',{class:'lb'}, el('b',{text:`${e.from.nickname} ส่ง${e.data.kind==='deck'?'ชุดคำ':'ฉาก'} “${e.data.name}” ให้คุณ`}), el('span',{class:'lm',text:`${e.data.total||0} คำ · ${ago2(e.created_at)}`})),
        (store.get('pv-imported',{})||{})[e.data.share_id] ? el('button',{text:'▶ เปิด',onclick:()=>openImported(store.get('pv-imported',{})[e.data.share_id])})
          : el('button',{class:'primary',text:'รับ',onclick:ev=>acceptSharedFromFriend(e, ev.currentTarget)}),
        el('button',{text:'ลบ',title:'ลบออกจากกล่องจดหมาย',onclick:async()=>{ await friendsApi('POST',`/events/${e.id}/decline`); FR.data=null; renderFriends(); }})));
    });
    v.append(box);
  }
  // friends
  v.append(el('div',{class:'hsec'}, el('h3',{text:`เพื่อนของฉัน (${d.friends.length})`})));
  if(!d.friends.length) v.append(el('p',{class:'libempty',text:'ยังไม่มีเพื่อน — แลกรหัสหรือสแกน QR กับเพื่อนที่รู้จัก'}));
  else {
    const box=el('div',{class:'liblist'});
    d.friends.forEach(f=>box.append(el('div',{class:'lrow frrow'},
      el('span',{class:'clic',text:'🙂'}),
      el('span',{class:'lb'}, el('b',{text:f.nickname}), el('span',{class:'lm',text:`🔥 ${f.streak} วันติดกัน · สัปดาห์นี้ ${f.week_words} คำ · รวม ${f.total_words} คำ`})),
      el('button',{title:'ส่งกำลังใจ','aria-label':'ส่งกำลังใจให้ '+f.nickname,text:'👏',onclick:()=>openCheer(f)}),
      el('button',{title:'ส่งฉากหรือชุดคำ','aria-label':'ส่งฉากให้ '+f.nickname,text:'📤',onclick:()=>openSendToFriend(f)}),
      el('button',{title:'เพิ่มเติม','aria-label':'ตัวเลือกสำหรับ '+f.nickname,text:'⋯',onclick:()=>openFriendMenu(f)}))));
    v.append(box);
  }
  if(d.outgoing.length) v.append(el('p',{class:'note'}, 'รอยืนยัน: ', ...d.outgoing.map((f,i)=>el('span',{}, i?', ':'', f.nickname, ' ', el('button',{class:'linkbtn small',text:'(ยกเลิก)',onclick:async()=>{ await friendsApi('DELETE',`/${f.id}`); FR.data=null; renderFriends(); }})))));
  if(d.blocked.length) v.append(el('p',{class:'note'}, 'บล็อกไว้: ', ...d.blocked.map((f,i)=>el('span',{}, i?', ':'', f.nickname, ' ', el('button',{class:'linkbtn small',text:'(เลิกบล็อก)',onclick:async()=>{ await friendsApi('DELETE',`/${f.id}/block`); FR.data=null; renderFriends(); }})))));
  v.append(el('div',{class:'clfoot'}, el('button',{class:'linkbtn small danger-link',text:'ปิดใช้ระบบเพื่อน',onclick:async()=>{
    if(!(await ask('ปิดใช้ระบบเพื่อน? เพื่อนทั้งหมด คำขอ และกล่องจดหมายจะถูกลบ และรหัสเพื่อนจะใช้ไม่ได้','ปิดใช้'))) return;
    const r=await friendsApi('DELETE','/me'); if(!r.ok){ toast(friendErr(r)); return; } store.set('pv-friends-on',false); setSocialBadge(0); FR.data=null; renderFriends(); }})));
  // what's on screen now counts as seen (shares stay until accepted or removed)
  const ids=unseen.filter(e=>e.kind==='cheer').map(e=>e.id);
  if(ids.length) friendsApi('POST','/events/seen',{ids}).then(()=>{ ids.forEach(id=>{ const e=d.events.find(x=>x.id===id); if(e) e.seen=true; }); setSocialBadge(d.incoming.length + d.events.filter(e=>!e.seen).length); });
  else setSocialBadge(d.incoming.length + unseen.length);
  reportFriendStatsSoon();
}
async function drawQr(box, text){
  try{
    if(!window.qrcode) await new Promise((res,rej)=>{ const sc=document.createElement('script'); sc.src='/vendor/qrcode-generator-2.0.4.js'; sc.onload=res; sc.onerror=rej; document.head.append(sc); });
    const qr=window.qrcode(0,'M'); qr.addData(text); qr.make();
    box.innerHTML=qr.createSvgTag({ cellSize:4, margin:2, scalable:true });
    const svg=box.querySelector('svg'); if(svg){ svg.setAttribute('role','img'); svg.setAttribute('aria-label','QR สำหรับเพิ่มเพื่อน'); }
  }catch(e){ box.remove(); }
}
async function requestFriend(code, btn){
  code=String(code||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  if(code.length!==8){ toast('ใส่รหัสเพื่อน 8 ตัว'); return; }
  if(btn) btn.disabled=true;
  const r=await friendsApi('POST','/request',{ code }).catch(()=>({ok:false}));
  if(btn) btn.disabled=false;
  if(!r.ok){ toast(friendErr(r), 4000); return; }
  toast(r.j.status==='friends' ? 'เป็นเพื่อนกับ '+r.j.nickname+' แล้ว 🎉' : 'ส่งคำขอถึง '+r.j.nickname+' แล้ว รอเพื่อนกดยอมรับ', 4000);
  FR.data=null; renderFriends();
}
function openCheer(f){
  openModal(m=>{
    m.append(el('h3',{text:'ส่งกำลังใจให้ '+f.nickname}));
    const box=el('div',{class:'cheers'});
    Object.entries(CHEER_TEXT).forEach(([k,t])=>box.append(el('button',{class:'cbtn',text:t,onclick:async e=>{
      e.currentTarget.disabled=true; const r=await friendsApi('POST',`/${f.id}/cheer`,{kind:k}); closeModal(); toast(r.ok?'ส่งแล้ว '+t:friendErr(r), 3500); }})));
    m.append(box, el('div',{class:'row'}, el('span',{class:'sp'}), el('button',{text:'ปิด',onclick:closeModal})));
  });
}
function openSendToFriend(f){
  const mine=customs.filter(sc=>Object.keys(sc.items).length), live=liveKeys(), dks=deckList().filter(x=>!x.virtual && deckCount(x,live));
  openModal(m=>{
    m.classList.add('dkbox');
    m.append(el('h3',{text:'ส่งให้ '+f.nickname}), el('p',{class:'note',text:'เลือกฉากหรือชุดคำ เพื่อนต้องกด “รับ” ก่อนจึงจะเห็น'}));
    const list=el('div',{class:'dk-list tall'}), err=el('p',{class:'err'});
    if(!mine.length && !dks.length) list.append(el('div',{class:'libempty',text:'ยังไม่มีฉากหรือชุดคำของคุณที่มีคำศัพท์'}));
    const row=(icon,name,meta,t)=>el('button',{class:'dk-row asrow',onclick:e=>send(t,e.currentTarget)}, el('span',{class:'dk-name'}, el('b',{text:icon+' '+name}), el('small',{text:meta})), el('span',{class:'dk-n',text:'ส่ง ›'}));
    mine.forEach(sc=>list.append(row('🖼️',sc.name,'ฉาก · '+Object.keys(sc.items).length+' คำ',{kind:'scene',sc})));
    dks.forEach(dk=>list.append(row('📚',deckName(dk),'ชุดคำ · '+deckCount(dk,live)+' คำ',{kind:'deck',deck:dk})));
    m.append(list, err, el('div',{class:'row'}, el('span',{class:'sp'}), el('button',{text:'ปิด',onclick:closeModal})));
    const send=async(t,btn)=>{
      list.querySelectorAll('button').forEach(b=>b.disabled=true); btn.querySelector('.dk-n').textContent='กำลังส่ง…'; err.textContent='';
      const fail=msg=>{ err.textContent=msg; list.querySelectorAll('button').forEach(b=>b.disabled=false); btn.querySelector('.dk-n').textContent='ส่ง ›'; };
      const key=shareKey(t), body=sharePayload(t), cur=myShares[key]; if(cur) body.id=cur.id;
      if(!(await picturesUploaded(body))) return fail(shareErr(0,{error:'picture_missing'}));
      const r=await shareApi('POST','/api/share',body).catch(()=>({ok:false,status:0,j:{}}));
      if(!r.ok) return fail(shareErr(r.status,r.j));
      myShares[key]={ id:r.j.id, at:Date.now() }; store.set('pv-shares',myShares);
      const s2=await friendsApi('POST',`/${f.id}/send`,{ share_id:r.j.id });
      if(!s2.ok) return fail(friendErr(s2));
      closeModal(); toast('ส่งให้ '+f.nickname+' แล้ว ✓');
    };
  });
}
async function acceptSharedFromFriend(e, btn){
  btn.disabled=true; btn.textContent='กำลังรับ…';
  try{
    const r=await fetch('/api/share/'+e.data.share_id,{cache:'no-store'}).then(x=>x.ok?x.json():null);
    if(!r){ toast('ฉากนี้ถูกยกเลิกไปแล้ว'); await friendsApi('POST',`/events/${e.id}/decline`); FR.data=null; renderFriends(); return; }
    const rec=await importShare(e.data.share_id, r, (i,k)=>{ btn.textContent=`กำลังรับ ${i}/${k}`; });
    friendsApi('POST','/events/seen',{ids:[e.id]}).catch(()=>{});
    toast('รับแล้ว ✓'); openImported(rec);
  }catch(err){ btn.disabled=false; btn.textContent='รับ'; toast('รับไม่สำเร็จ ลองใหม่อีกครั้ง'); }
}
function openFriendMenu(f){
  openModal(m=>m.append(el('h3',{text:f.nickname}),
    el('div',{class:'frmenu'},
      el('button',{text:'ลบเพื่อน',onclick:async()=>{ closeModal(); if(!(await ask(`ลบ ${f.nickname} ออกจากเพื่อน?`,'ลบเพื่อน'))) return; await friendsApi('DELETE',`/${f.id}`); FR.data=null; renderFriends(); }}),
      el('button',{class:'danger',text:'🚫 บล็อก',onclick:async()=>{ closeModal(); if(!(await ask(`บล็อก ${f.nickname}? จะเลิกเป็นเพื่อน และเขาจะขอเป็นเพื่อนหรือส่งอะไรให้คุณไม่ได้อีก`,'บล็อก'))) return; await friendsApi('POST',`/${f.id}/block`); toast('บล็อกแล้ว'); FR.data=null; renderFriends(); }}),
      el('button',{class:'danger',text:'⚠️ รายงาน',onclick:()=>openReport(f)})),
    el('div',{class:'row'}, el('span',{class:'sp'}), el('button',{text:'ปิด',onclick:closeModal}))));
}
function openReport(f){
  openModal(m=>{
    const reasons=['ส่งฉากหรือรูปที่ไม่เหมาะสม','ชื่อเล่นไม่เหมาะสม','กลั่นแกล้งหรือรบกวน','ไม่รู้จักคนนี้','อื่น ๆ'];
    const sel=el('select',{'aria-label':'เหตุผล'}); reasons.forEach(r=>sel.add(new Option(r,r)));
    const blk=el('input',{type:'checkbox'}); blk.checked=true;
    m.append(el('h3',{text:'⚠️ รายงาน '+f.nickname}), el('label',{},'เหตุผล', sel),
      el('label',{class:'opt'}, blk, ' บล็อกคนนี้ด้วย'),
      el('p',{class:'note small',text:'ทีม Piccab จะตรวจสอบ เด็ก ๆ ควรบอกครูหรือผู้ปกครองด้วยนะ'}),
      el('div',{class:'row'}, el('span',{class:'sp'}), el('button',{text:'ยกเลิก',onclick:closeModal}), el('button',{class:'danger',text:'ส่งรายงาน',onclick:async()=>{
        await friendsApi('POST',`/${f.id}/report`,{ reason:sel.value });
        if(blk.checked) await friendsApi('POST',`/${f.id}/block`);
        closeModal(); toast('ส่งรายงานแล้ว ขอบคุณที่ช่วยดูแลความปลอดภัย'); FR.data=null; renderFriends(); }})));
  });
}
const friendLinkCode=((/^\/f\/([A-Za-z2-9]{8})\/?$/.exec(location.pathname)||[])[1]||'').toUpperCase()||null;
async function openFriendLink(code){
  try{ history.replaceState(null,'','/app'); }catch(e){}
  FR.tab='friends'; store.set('pv-social-tab','friends'); goHome('class');
  if(!user){ toast('เข้าสู่ระบบ (หรือเข้าห้องเรียน) ก่อน แล้วเปิดลิงก์อีกครั้ง', 5000); return; }
  await loadFriends();
  if(!FR.data || !FR.data.me){ renderFriends(); toast('ตั้งชื่อเล่นแล้วกด “เริ่มใช้เพื่อน” ก่อน แล้วเปิดลิงก์อีกครั้ง', 5000); return; }
  if(await ask('ขอเป็นเพื่อนกับเจ้าของรหัส '+code+'?','ขอเป็นเพื่อน')) requestFriend(code);
  else renderFriends();
}
// ---------- reporting a share link + 🛡️ admin (accounts listed in ADMIN_EMAILS on the server) ----------
function openReportShare(id){
  openModal(m=>{
    const reasons=['รูปไม่เหมาะสม','คำศัพท์หรือคำแปลไม่เหมาะสม','มีข้อมูลส่วนตัวของคนอื่น','สแปมหรือโฆษณา','อื่น ๆ'];
    const sel=el('select',{'aria-label':'เหตุผล'}); reasons.forEach(r=>sel.add(new Option(r,r)));
    m.append(el('h3',{text:'⚠️ รายงานลิงก์นี้'}), el('label',{},'เหตุผล', sel),
      el('p',{class:'note small',text:'ทีม Piccab จะตรวจสอบ และลบเนื้อหาที่ไม่เหมาะสม เด็ก ๆ ควรบอกครูหรือผู้ปกครองด้วยนะ'}),
      el('div',{class:'row'}, el('span',{class:'sp'}), el('button',{text:'ยกเลิก',onclick:closeModal}), el('button',{class:'danger',text:'ส่งรายงาน',onclick:async e=>{
        e.currentTarget.disabled=true;
        const tok=user?await accessToken():null;
        const r=await fetch('/api/report/share',{ method:'POST', headers:{ 'content-type':'application/json', ...(tok?{authorization:'Bearer '+tok}:{}) }, body:JSON.stringify({ share_id:id, reason:sel.value }) }).catch(()=>null);
        closeModal(); toast(r && r.ok ? 'ส่งรายงานแล้ว ขอบคุณที่ช่วยดูแลความปลอดภัย' : 'ส่งรายงานไม่สำเร็จ ลองใหม่อีกครั้ง', 4000); }})));
  });
}
var ADM={ ok:false, all:false, data:null, open:{}, tab:'reports', ai:null, fb:null, fbAll:false, errs:null, stats:null, gal:null };
async function adminApi(method, path, body){
  const tok=await accessToken();
  const r=await fetch('/api/admin'+path,{ method, headers:{ 'content-type':'application/json', ...(tok?{authorization:'Bearer '+tok}:{}) }, body: body?JSON.stringify(body):undefined });
  const j=await r.json().catch(()=>({}));
  return { ok:r.ok, status:r.status, j };
}
async function checkAdmin(){
  const r=await adminApi('GET','/me').catch(()=>({ok:false}));
  ADM.ok=!!r.ok;
  if(ADM.ok && adminLinkWanted){ adminLinkWanted=false; goHome('admin'); }
}
async function loadAdmin(){ const r=await adminApi('GET','/reports'+(ADM.all?'?all=1':'')).catch(()=>({ok:false})); ADM.data = r.ok ? r.j : { error: r.status===404 ? 'หน้านี้สำหรับผู้ดูแลระบบเท่านั้น' : 'โหลดไม่สำเร็จ' }; }
function renderAdmin(){
  const v=$('#adminView'); v.innerHTML='';
  v.append(el('div',{class:'ghead lh'}, el('div',{}, el('h2',{text:'🛡️ ดูแลระบบ'}), el('p',{text:'รายงานจากผู้ใช้ · ระงับบัญชี · ลบลิงก์แชร์'})),
    el('button',{class:'ghost',text:'🔄',title:'โหลดใหม่',onclick:()=>{ ADM.data=ADM.ai=ADM.fb=ADM.errs=ADM.stats=ADM.gal=null; renderAdmin(); }})));
  if(!user || !ADM.ok){ v.append(el('p',{class:'libempty',text: user ? 'หน้านี้สำหรับผู้ดูแลระบบเท่านั้น' : 'เข้าสู่ระบบด้วยบัญชีผู้ดูแลก่อน'})); return; }
  const tabs=[['reports','🚩 รายงาน'],['feedback','💬 ความเห็น'],['gallery','🖼️ คลังภาพ'],['stats','📊 การใช้งาน'],['errors','🐞 ข้อผิดพลาด'],['ai','✨ การใช้ AI']];
  v.append(el('div',{class:'seg admtabs'}, ...tabs.map(([k,t])=>el('button',{class:ADM.tab===k?'on':'',text:t,onclick:()=>{ ADM.tab=k; if(k==='ai') ADM.ai=null; renderAdmin(); }}))));
  if(ADM.tab==='ai'){ renderAiUsage(v); return; }
  if(ADM.tab==='feedback'){ renderFeedbackAdmin(v); return; }
  if(ADM.tab==='stats'){ renderStatsAdmin(v); return; }
  if(ADM.tab==='errors'){ renderErrorsAdmin(v); return; }
  if(ADM.tab==='gallery'){ renderGalleryAdmin(v); return; }
  v.append(el('div',{class:'seg'},
    el('button',{class:ADM.all?'':'on',text:'ยังไม่จัดการ',onclick:()=>{ ADM.all=false; ADM.data=null; renderAdmin(); }}),
    el('button',{class:ADM.all?'on':'',text:'ทั้งหมด',onclick:()=>{ ADM.all=true; ADM.data=null; renderAdmin(); }})));
  if(!ADM.data){ v.append(el('p',{class:'libempty',text:'กำลังโหลด…'})); loadAdmin().then(()=>{ if(S.view==='admin') renderAdmin(); }); return; }
  if(ADM.data.error){ v.append(el('p',{class:'err',text:ADM.data.error})); return; }
  const reps=ADM.data.reports;
  if(!reps.length){ v.append(el('p',{class:'libempty',text: ADM.all ? 'ยังไม่มีรายงาน' : '🎉 ไม่มีรายงานที่ต้องจัดการ'})); return; }
  const who=p=>p ? (p.nickname || '(ไม่มีชื่อเล่น)')+(p.code?` · รหัส ${p.code}`:'')+((p.student||p.anon)?' · บัญชีนักเรียน':'')+(p.email?` · ${p.email}`:'')+(p.gone?' · (ลบบัญชีแล้ว)':'')+` · id ${String(p.id).slice(0,8)}` : 'ไม่ได้เข้าสู่ระบบ';
  reps.forEach(r=>{
    const rd=r.reported;
    const card=el('div',{class:'admcard'+(r.resolved_at?' done':'')},
      el('div',{class:'admtop'}, el('span',{class:'pill',text:r.share_id?'🔗 ลิงก์แชร์':'👫 เพื่อน'}), el('span',{class:'note small',text:ago2(r.created_at)}),
        r.resolved_at ? el('span',{class:'pill ok',text:'✓ ปิดเรื่องแล้ว'}) : null, rd && rd.banned ? el('span',{class:'pill bad',text:'🚫 ระงับแล้ว'}) : null),
      el('p',{}, el('b',{text:'ผู้ถูกรายงาน: '}), who(rd), rd ? el('span',{class:'note small',text:` (ถูกรายงานทั้งหมด ${rd.reports} ครั้ง)`}) : null),
      el('p',{}, el('b',{text:'ผู้รายงาน: '}), who(r.reporter)),
      el('p',{}, el('b',{text:'เหตุผล: '}), r.reason||'-'),
      r.note ? el('p',{class:'note small',text:'บันทึก: '+r.note}) : null);
    if(r.share_id) card.append(el('p',{}, el('a',{href:'/s/'+r.share_id,target:'_blank',rel:'noopener',text:'เปิดลิงก์ที่ถูกรายงาน ↗'}), ' · ',
      el('button',{class:'linkbtn small danger-link',text:'🗑 ลบลิงก์นี้',onclick:()=>adminDeleteShare(r.share_id)})));
    const ev=el('div',{class:'admev'});
    const acts=el('div',{class:'row'},
      el('button',{text:'🔍 ดูหลักฐาน',onclick:async e=>{ const b=e.currentTarget; b.disabled=true; await adminEvidence(r, ev); b.disabled=false; }}),
      rd ? el('button',{class:rd.banned?'':'danger',text:rd.banned?'ยกเลิกระงับ':'🚫 ระงับบัญชี',onclick:()=>adminSuspend(rd, !rd.banned)}) : null,
      el('span',{class:'sp'}),
      el('button',{class:r.resolved_at?'':'primary',text:r.resolved_at?'เปิดเรื่องใหม่':'✓ ปิดเรื่อง',onclick:()=>adminResolve(r)}));
    card.append(ev, acts); v.append(card);
  });
}
// Tools for the trial (supabase/2026-11-trial.sql): 💬 feedback, 📊 usage, 🐞 errors on people's devices
function trialSetup(v){ v.append(el('div',{class:'admcard'}, el('p',{}, el('b',{text:'ยังไม่ได้เปิดใช้'})),
  el('p',{text:'รันไฟล์ supabase/2026-11-trial.sql ใน Supabase → SQL Editor ครั้งเดียว แล้วข้อมูลจะเริ่มเข้ามา'}))); }
const admBusy={};
function adminLoad(key, path, tab){
  if(ADM[key]) return false;
  if(admBusy[key]===path) return true;   // already on its way
  admBusy[key]=path;
  adminApi('GET',path).catch(()=>({ok:false})).then(r=>{ if(admBusy[key]!==path) return; admBusy[key]=null;
    ADM[key]= r.ok ? r.j : { error:'โหลดไม่สำเร็จ' }; if(S.view==='admin' && ADM.tab===tab) renderAdmin(); });
  return true;
}
const FB_KIND={ problem:'🐞 ปัญหา', idea:'💡 ไอเดีย', other:'💬 อื่นๆ' };
function renderFeedbackAdmin(v){
  v.append(el('div',{class:'seg'},
    el('button',{class:ADM.fbAll?'':'on',text:'ยังไม่จัดการ',onclick:()=>{ ADM.fbAll=false; ADM.fb=null; renderAdmin(); }}),
    el('button',{class:ADM.fbAll?'on':'',text:'ทั้งหมด',onclick:()=>{ ADM.fbAll=true; ADM.fb=null; renderAdmin(); }})));
  if(adminLoad('fb','/feedback'+(ADM.fbAll?'?all=1':''),'feedback')){ v.append(el('p',{class:'libempty',text:'กำลังโหลด…'})); return; }
  const F=ADM.fb;
  if(F.error){ v.append(el('p',{class:'err',text:F.error})); return; }
  if(F.setup){ trialSetup(v); return; }
  if(!F.feedback.length){ v.append(el('p',{class:'libempty',text: ADM.fbAll ? 'ยังไม่มีความเห็น' : '🎉 ไม่มีความเห็นที่ต้องจัดการ'})); return; }
  F.feedback.forEach(f=>{
    v.append(el('div',{class:'admcard'+(f.resolved_at?' done':'')},
      el('div',{class:'admtop'}, el('span',{class:'pill',text:FB_KIND[f.kind]||f.kind}), el('span',{class:'note small',text:ago2(f.created_at)}),
        f.resolved_at ? el('span',{class:'pill ok',text:'✓ ปิดเรื่องแล้ว'}) : null),
      el('p',{class:'fbmsg',text:f.message}),
      el('p',{class:'note small'}, 'ตอบกลับที่: ', f.contact ? el('a',{href:'mailto:'+f.contact,text:f.contact}) : 'ไม่ได้ให้อีเมล',
        ` · ${f.signed_in?'เข้าสู่ระบบ':'ไม่ได้เข้าสู่ระบบ'} · หน้า ${f.page||'-'} · เมนู${f.ui==='en'?'อังกฤษ':'ไทย'}`),
      el('p',{class:'note small',text:f.ua||''}),
      f.note ? el('p',{class:'note small',text:'บันทึก: '+f.note}) : null,
      el('div',{class:'row'}, el('span',{class:'sp'}),
        el('button',{class:f.resolved_at?'':'primary',text:f.resolved_at?'เปิดเรื่องใหม่':'✓ ปิดเรื่อง',onclick:async e=>{
          e.currentTarget.disabled=true;
          const note=f.resolved_at ? '' : (prompt('บันทึกสั้นๆ (ไม่ใส่ก็ได้)', f.note||'')||'');
          const r=await adminApi('POST',`/feedback/${f.id}/resolve`,{ reopen:!!f.resolved_at, note }).catch(()=>({ok:false}));
          if(!r.ok) toast('บันทึกไม่สำเร็จ'); ADM.fb=null; renderAdmin(); }}))));
  });
}
function renderErrorsAdmin(v){
  if(adminLoad('errs','/errors','errors')){ v.append(el('p',{class:'libempty',text:'กำลังโหลด…'})); return; }
  const E=ADM.errs;
  if(E.error){ v.append(el('p',{class:'err',text:E.error})); return; }
  if(E.setup){ trialSetup(v); return; }
  v.append(el('p',{class:'note',text:'ข้อผิดพลาดของแอปบนเครื่องผู้ใช้ 14 วันล่าสุด (ข้อความเดียวกันจากที่เดียวกันรวมเป็นแถวเดียว) ไม่มีข้อมูลว่าเป็นใคร'}));
  const g={};
  E.errors.forEach(x=>{ const k=x.msg+'|'+(x.src||''); const o=g[k]||(g[k]={ msg:x.msg, src:x.src, n:0, days:new Set(), last:x.last_at, page:x.page, ua:x.ua, stack:x.stack });
    o.n+=Number(x.n)||0; o.days.add(x.day); if(x.last_at>o.last){ o.last=x.last_at; o.page=x.page; o.ua=x.ua; o.stack=x.stack||o.stack; } });
  const list=Object.values(g).sort((a,b)=>b.last.localeCompare(a.last));
  if(!list.length){ v.append(el('p',{class:'libempty',text:'🎉 ยังไม่มีข้อผิดพลาด'})); return; }
  list.forEach(o=>v.append(el('div',{class:'admcard'},
    el('div',{class:'admtop'}, el('span',{class:'pill bad',text:`${o.n} ครั้ง`}), el('span',{class:'note small',text:`${o.days.size} วัน · ล่าสุด ${ago2(o.last)}`})),
    el('p',{}, el('b',{class:'errmsg',text:o.msg})),
    el('p',{class:'note small',text:`ที่ ${o.src||'-'} · หน้า ${o.page||'-'}`}),
    el('p',{class:'note small',text:o.ua||''}),
    o.stack ? el('details',{}, el('summary',{text:'stack'}), el('pre',{class:'errstack',text:o.stack})) : null)));
}
// ---------- picture library (คลังภาพ): ready-made scenes made by the Piccab team, free to add (no AI credits) ----------
var GAL={ data:null, busy:false, cat:'all' };   // var + function declarations: renderLibrary() may run before this part of the script
var GAL_LV={ beginner:'เริ่มต้น', intermediate:'กลาง', advanced:'สูง' };
var galAdded=store.get('pv-gal',{})||{};        // library scene id → my scene id
var galEdits=store.get('pv-gal-edit',{})||{};   // (admin) my scene id → library scene id it is an editing copy of
function galImg(g, thumb){ return `/g/${g.id}${thumb?'-t':''}.webp?v=${g.img_ver}`; }
function catName(c){ return UI==='en' ? c.name_en : c.name_th; }
function galMine(gid){ const sid=galAdded[gid]; return sid && scenes().some(x=>x.id===sid) ? sid : null; }
function galEditOf(sid){ return galEdits[sid] && scenes().some(x=>x.id===sid) ? galEdits[sid] : null; }
async function loadGallery(force){
  if(GAL.busy || (GAL.data && !force)) return;
  GAL.busy=true;
  const r=await fetch('/api/gallery').then(x=>x.ok?x.json():null).catch(()=>null);
  GAL.busy=false; GAL.data=r && Array.isArray(r.scenes) ? r : { categories:[], scenes:[], offline:!r };
  if(S.view==='library') renderPicLib();
}
function renderPicLib(){
  const box=$('#galBox'); if(!box) return;
  box.innerHTML='';
  if(LIB.f!=='all') return;
  if(!GAL.data){ loadGallery(); return; }
  const cats=GAL.data.categories||[], list=GAL.data.scenes||[];
  if(!list.length) return;                         // nothing published yet (or offline)
  const q=LIB.q.trim().toLowerCase(), n={};
  list.forEach(g=>{ n[g.category]=(n[g.category]||0)+1; });
  if(GAL.cat!=='all' && !n[GAL.cat]) GAL.cat='all';
  const vis=list.filter(g=>(GAL.cat==='all' || g.category===GAL.cat) && (!q || g.title.toLowerCase().includes(q) || String(g.title_th||'').toLowerCase().includes(q)));
  const chip=(id,label,k)=>el('button',{type:'button',class:GAL.cat===id?'on':'',onclick:()=>{ GAL.cat=id; renderPicLib(); }}, label, el('span',{class:'n',text:String(k)}));
  box.append(
    el('div',{class:'ghead lh galhead'}, el('div',{}, el('h2',{}, ic('photo_library'), 'คลังภาพ Piccab'), el('p',{text:`ฉากพร้อมคำศัพท์ ${list.length} ฉาก · เก็บเข้าคลังของคุณได้ฟรี ไม่ใช้เครดิต AI`}))),
    el('div',{class:'fchips galcats',role:'group','aria-label':'หมวด'}, chip('all', el('span',{text:'ทั้งหมด'}), list.length),
      ...cats.filter(c=>n[c.id]).map(c=>chip(c.id, el('span',{'data-noi18n':'',text:`${c.emoji} ${catName(c)}`}), n[c.id]))),
    vis.length ? el('div',{class:'libgrid galgrid'}, ...vis.map(galCard)) : el('p',{class:'libempty',text:'ไม่พบฉากในคลังภาพที่ตรงกับคำค้น'}));
}
function galCard(g){
  const mine=galMine(g.id);
  return el('button',{class:'card lcard galcard',onclick:()=>openGalleryScene(g),'aria-label':'ดูฉาก '+g.title},
    el('div',{class:'thumb'}, el('img',{alt:'',loading:'lazy',src:galImg(g,true)}),
      mine ? el('span',{class:'own mine',title:'เก็บแล้ว'}, ic('check_circle-fill')) : null,
      el('span',{class:'cnt',title:`${g.word_count} คำ`}, ic('sell-fill'), String(g.word_count))),
    el('div',{class:'cbody'}, el('b',{text:g.title}),
      el('div',{class:'meta2'}, UI==='en' ? null : el('span',{'data-noi18n':'',text:g.title_th||''}), el('span',{class:'lv',text:GAL_LV[g.level]||''}))));
}
function openGalleryScene(g){
  const mine=galMine(g.id), cat=((GAL.data&&GAL.data.categories)||[]).find(c=>c.id===g.category);
  let full=null;
  openModal(m=>{
    m.classList.add('wide');
    const go=el('button',{class:'primary',text: mine ? '▶ เปิด' : '➕ เก็บเข้าคลังแล้วเริ่มเรียน'});
    const words=el('div',{class:'galwords'}, el('span',{class:'note small',text:'กำลังโหลดคำศัพท์…'}));
    fetch('/api/gallery/'+g.id).then(x=>x.ok?x.json():null).catch(()=>null).then(r=>{
      full=r; words.replaceChildren(...(r ? Object.values(r.items||{}).map(it=>el('span',{class:'pill','data-noi18n':'',text:it.word})) : [el('span',{class:'note small',text:'โหลดคำศัพท์ไม่สำเร็จ'})]));
    });
    go.addEventListener('click',async()=>{
      if(mine){ closeModal(); openScene(mine,'learn'); return; }
      go.disabled=true; go.textContent='กำลังเก็บ…';
      try{ const sid=await addGalleryScene(g, full); closeModal(); toast('เก็บฉากเข้าคลังแล้ว ✓'); openScene(sid,'learn'); }
      catch(e){ go.disabled=false; go.textContent='➕ ลองอีกครั้ง'; toast('เก็บไม่สำเร็จ ตรวจอินเทอร์เน็ตแล้วลองใหม่'); }
    });
    m.append(el('div',{class:'pv-head'},
        el('div',{}, el('h3',{'data-noi18n':'',text:g.title+(g.title_th && UI!=='en' ? ' · '+g.title_th : '')}),
          el('div',{class:'meta'}, cat ? el('span',{'data-noi18n':'',text:`${cat.emoji} ${catName(cat)} · `}) : null, el('span',{text:`${g.word_count} คำศัพท์ · ระดับ${GAL_LV[g.level]||''}`}))),
        el('button',{class:'x','aria-label':'ปิด',text:'✕',onclick:closeModal})),
      el('div',{class:'pv-fig sharefig'}, el('img',{alt:'',src:galImg(g)})),
      words,
      el('div',{class:'row'}, el('span',{class:'sp'}), el('button',{text:'ไว้ทีหลัง',onclick:closeModal}), go),
      el('p',{class:'note small',text:'ภาพในคลังสร้างด้วย AI · ฉากจะถูกเก็บในเครื่องนี้ (และในบัญชี ถ้าเข้าสู่ระบบ) แก้ไขในคลังของคุณได้ ไม่กระทบคนอื่น'}));
  });
}
async function galCopy(g, full, name){
  if(!full) full=await fetch('/api/gallery/'+g.id).then(x=>x.ok?x.json():null).catch(()=>null);
  if(!full) throw new Error('scene');
  const res=await fetch(galImg(g)); if(!res.ok) throw new Error('picture');
  const img=await blobToDataUrl(await res.blob());
  const sc={ id:'s'+Date.now().toString(36)+Math.random().toString(36).slice(2,5), name:String(name||full.title).slice(0,50), w:full.w, h:full.h, items:JSON.parse(JSON.stringify(full.items||{})), img };
  customs.push(sc); saveScenes();
  return sc.id;
}
async function addGalleryScene(g, full){
  const sid=await galCopy(g, full);
  galAdded[g.id]=sid; store.set('pv-gal',galAdded); tally('gallery_add');
  return sid;
}

// 🖼️ Admin: what the library holds, import from Gemini (picture + JSON), publish, fix boxes
function galStats(D){
  const per={}, all=new Set(); let words=0, noTh=0, noDe=0;
  const P=id=>per[id]||(per[id]={ pub:0, draft:0, words:0, uniq:new Set() });
  D.categories.forEach(c=>P(c.id));
  D.scenes.forEach(g=>{ const p=P(g.category); (g.published && g.img_ver) ? p.pub++ : p.draft++;
    Object.values(g.items||{}).forEach(it=>{ const k=String(it.word||'').toLowerCase(); words++; p.words++; p.uniq.add(k); all.add(k); if(!it.th) noTh++; if(!(it.l && it.l.de)) noDe++; }); });
  return { per, words, uniq:all.size, noTh, noDe, used:D.categories.filter(c=>per[c.id].pub+per[c.id].draft).length };
}
function renderGalleryAdmin(v){
  if(adminLoad('gal','/gallery','gallery')){ v.append(el('p',{class:'libempty',text:'กำลังโหลด…'})); return; }
  const D=ADM.gal;
  if(D.error){ v.append(el('p',{class:'err',text:D.error})); return; }
  if(D.setup){ v.append(el('div',{class:'admcard'}, el('p',{}, el('b',{text:'ยังไม่ได้เปิดใช้'})),
    el('p',{text:'รันไฟล์ supabase/2026-11-gallery.sql ใน Supabase → SQL Editor ครั้งเดียว แล้วหมวดทั้ง 12 หมวดจะพร้อมใช้'}))); return; }
  const st=galStats(D), pub=D.scenes.filter(g=>g.published && g.img_ver).length;
  const card=(title,big,sub)=>el('div',{class:'aicard'}, el('h4',{text:title}), el('div',{class:'aibig'}, el('b',{text:String(big)})), sub?el('p',{class:'note small',text:sub}):null);
  v.append(el('div',{class:'aicards'},
    card('หมวด', D.categories.length, `มีฉากแล้ว ${st.used} หมวด`),
    card('ฉาก', D.scenes.length, `เผยแพร่ ${pub} · ฉบับร่าง ${D.scenes.length-pub}`),
    card('คำศัพท์ทั้งหมด', st.words, `คำไม่ซ้ำ ${st.uniq} คำ`),
    card('ต้องตรวจ', st.noTh, `คำที่ยังไม่มีคำแปลไทย · ไม่มีภาษาเยอรมัน ${st.noDe} คำ`)));
  const tb=el('table',{class:'aitable stat'}, el('tr',{}, ...['หมวด','เผยแพร่','ฉบับร่าง','คำ','คำไม่ซ้ำ'].map(h=>el('th',{text:h}))));
  D.categories.forEach(c=>{ const p=st.per[c.id]; tb.append(el('tr',{}, el('td',{'data-noi18n':'',text:`${c.emoji} ${catName(c)}`}), ...[p.pub,p.draft,p.words,p.uniq.size].map(x=>el('td',{text:String(x)})))); });
  tb.append(el('tr',{class:'tot'}, el('td',{text:'รวม'}), ...[pub, D.scenes.length-pub, st.words, st.uniq].map(x=>el('td',{text:String(x)}))));
  v.append(el('h4',{class:'aih',text:'แต่ละหมวด'}), el('div',{class:'aitablewrap'}, tb));
  // import
  const inp=el('input',{type:'file',multiple:'',accept:'image/png,image/jpeg,image/webp,.json,.txt',hidden:'',class:'galfiles'});
  inp.addEventListener('change',()=>{ const f=[...inp.files]; inp.value=''; if(f.length) galImport(f); });
  const crop=el('input',{type:'checkbox',class:'galcrop'}); crop.checked=GA.crop; crop.addEventListener('change',()=>{ GA.crop=crop.checked; });
  const cat=el('select',{class:'galcat','aria-label':'หมวดที่จะใส่'}, el('option',{value:'',text:'ตามที่เขียนในไฟล์ JSON'}), ...D.categories.map(c=>el('option',{value:c.id,text:`${c.emoji} ${catName(c)}`})));
  cat.value=GA.cat||''; cat.addEventListener('change',()=>{ GA.cat=cat.value; });
  v.append(el('div',{class:'admcard galimp'},
    el('h4',{text:'📥 นำเข้าจาก Gemini'}),
    el('p',{class:'note',text:'เลือกรูปกับไฟล์ JSON ที่ชื่อเดียวกัน เช่น kitchen.png + kitchen.json เลือกหลายฉากพร้อมกันได้ ฉากที่นำเข้าจะเป็นฉบับร่าง ตรวจกรอบก่อนแล้วค่อยกดเผยแพร่'}),
    el('label',{class:'galcatrow'}, el('span',{text:'ใส่ในหมวด'}), cat),
    el('label',{class:'chk'}, crop, el('span',{text:'ตัดขอบขวาและล่าง 4% (ลบลายน้ำ Gemini ที่มุมขวาล่าง)'})),
    el('div',{class:'row'}, el('button',{class:'primary',text:'เลือกไฟล์…',onclick:()=>inp.click()})), inp));
  // scenes by category
  D.categories.forEach(c=>{
    const list=D.scenes.filter(g=>g.category===c.id); if(!list.length) return;
    v.append(el('h4',{class:'aih','data-noi18n':'',text:`${c.emoji} ${catName(c)} (${list.length})`}));
    list.forEach(g=>v.append(galAdminRow(g, D)));
  });
  const orphan=D.scenes.filter(g=>!D.categories.some(c=>c.id===g.category));
  orphan.forEach(g=>v.append(galAdminRow(g, D)));
}
function galAdminRow(g, D){
  const items=Object.values(g.items||{}), live=g.published && g.img_ver;
  const edit=Object.keys(galEdits).find(sid=>galEdits[sid]===g.id && scenes().some(x=>x.id===sid));
  const patch=async(body, okMsg)=>{ const r=await adminApi('PATCH','/gallery/'+g.id, body).catch(()=>({ok:false})); toast(r.ok ? okMsg : 'บันทึกไม่สำเร็จ'); ADM.gal=null; GAL.data=null; renderAdmin(); };
  const sel=el('select',{'aria-label':'หมวด'}, ...D.categories.map(c=>el('option',{value:c.id,text:`${c.emoji} ${catName(c)}`})));
  sel.value=g.category; sel.addEventListener('change',()=>patch({ category:sel.value }, 'ย้ายหมวดแล้ว'));
  return el('div',{class:'admcard galrow'},
    g.img_ver ? el('img',{class:'galthumb',alt:'',loading:'lazy',src:galImg(g,true)}) : el('div',{class:'galthumb none',text:'ไม่มีรูป'}),
    el('div',{class:'galinfo'},
      el('div',{class:'admtop'}, el('b',{'data-noi18n':'',text:g.title+(g.title_th?' · '+g.title_th:'')}),
        el('span',{class:'pill'+(live?' ok':''),text: live ? 'เผยแพร่แล้ว' : 'ฉบับร่าง'})),
      el('p',{class:'note small',text:`${items.length} คำ · ระดับ${GAL_LV[g.level]||''} · ${g.w}×${g.h}`}),
      el('p',{class:'note small galwl','data-noi18n':'',text:items.map(it=>it.word+(it.th?'':' (?)')).join(', ')}),
      el('div',{class:'row'}, el('label',{class:'galcatrow'}, el('span',{text:'หมวด'}), sel), el('span',{class:'sp'}),
        el('button',{class:live?'':'primary',text: live ? 'ซ่อน' : 'เผยแพร่',...(g.img_ver?{}:{disabled:''}),onclick:()=>patch({ published:!g.published }, g.published ? 'ซ่อนแล้ว' : 'เผยแพร่แล้ว ✓')}),
        edit ? el('button',{class:'primary',text:'⬆️ อัปเดตจากฉบับแก้ไข',onclick:()=>galPushEdit(edit, true)}) : null,
        el('button',{text:'✏️ แก้กรอบ',onclick:()=>galEditLocal(g, edit)}),
        el('button',{text:'📝 ชื่อ',onclick:()=>{ const t=prompt('ชื่อฉาก (อังกฤษ)', g.title); if(t==null || !t.trim()) return; const th=prompt('ชื่อฉาก (ไทย)', g.title_th||''); patch({ title:t, title_th:th==null?g.title_th:th }, 'เปลี่ยนชื่อแล้ว'); }}),
        el('button',{class:'danger',text:'🗑',title:'ลบ',onclick:async()=>{ if(!confirm(`ลบ “${g.title}” ออกจากคลังภาพ? คนที่เก็บไปแล้วยังมีฉากนี้อยู่`)) return;
          const r=await adminApi('DELETE','/gallery/'+g.id).catch(()=>({ok:false})); toast(r.ok?'ลบแล้ว':'ลบไม่สำเร็จ'); ADM.gal=null; GAL.data=null; renderAdmin(); }}))));
}
// Fix boxes with the normal editor: copy the library scene into my library, edit it, then send the boxes back.
async function galEditLocal(g, existing){
  if(existing){ openScene(existing,'learn',true); return; }
  toast('กำลังเปิด…', 8000);
  try{
    const sid=await galCopy(g, g, '✏️ '+g.title);
    galEdits[sid]=g.id; store.set('pv-gal-edit',galEdits);
    openScene(sid,'learn',true);
    toast('แก้กรอบหรือคำได้เลย เสร็จแล้วกด ⬆️ บันทึกเข้าคลังภาพ ด้านบน', 5000);
  }catch(e){ toast('เปิดไม่สำเร็จ'); }
}
// The editing copy is only a tool: once its boxes are sent (or dropped) it is removed and the admin page comes back.
function galDropCopy(sid){
  const i=customs.findIndex(x=>x.id===sid); if(i<0) return;
  const sc=customs[i]; customs.splice(i,1); delete progress[sid]; forgetSceneLocal(sid);
  if(typeof syncDeleted==='function') syncDeleted(sc);
  delete galEdits[sid]; store.set('pv-gal-edit',galEdits); saveScenes(); saveProg();
}
function galBackToAdmin(){ ADM.tab='gallery'; ADM.gal=null; GAL.data=null; S.editing=false; selId=null; goHome('admin'); }
async function galPushEdit(sid, back){
  const sc=scenes().find(x=>x.id===sid), gid=galEdits[sid]; if(!sc || !gid) return false;
  if(S.editing) saveScenes();
  const r=await adminApi('PATCH','/gallery/'+gid,{ items:sc.items, w:sc.w, h:sc.h }).catch(()=>({ok:false}));
  toast(r.ok ? 'บันทึกเข้าคลังภาพแล้ว ✓' : 'บันทึกไม่สำเร็จ ลองอีกครั้ง');
  if(!r.ok) return false;
  galDropCopy(sid);
  if(back || S.view==='admin') galBackToAdmin(); else { ADM.gal=null; GAL.data=null; }
  return true;
}
function galEditBar(){
  const bar=$('#galEditBar'); if(!bar) return;
  const gid=S.view==='play' ? galEditOf(S.sceneId) : null;
  bar.hidden=!gid; if(!gid) return;
  const g=ADM.gal && ADM.gal.scenes && ADM.gal.scenes.find(x=>x.id===gid);
  const save=el('button',{class:'primary',text:'⬆️ บันทึกเข้าคลังภาพ แล้วกลับ'});
  save.addEventListener('click',async()=>{ save.disabled=true; if(!await galPushEdit(S.sceneId, true)) save.disabled=false; });
  bar.replaceChildren(el('span',{class:'tt'}, ic('photo_library'), el('b',{text:'กำลังแก้ฉากในคลังภาพ'}), g ? el('span',{'data-noi18n':'',text:' · '+g.title}) : null),
    el('span',{class:'sp'}),
    el('button',{text:'ยกเลิก กลับหน้าดูแลระบบ',onclick:async()=>{ if(!await ask('ทิ้งการแก้ไขนี้แล้วกลับหน้าดูแลระบบ?','ทิ้งการแก้ไข')) return; galDropCopy(S.sceneId); galBackToAdmin(); }}),
    save);
}
var GA={ crop:true, cat:'' };
// Gemini's answer: {"category","title","title_th","level","items":[{word, th, alts, de, de_art, de_alts, box_2d}]} (or just the items array)
function galParse(text){
  const s=String(text||''), a=s.indexOf('{'), b=s.lastIndexOf('}'), a2=s.indexOf('['), b2=s.lastIndexOf(']');
  let o=null;
  try{
    if(a>=0 && b>a && (a2<0 || a<a2)) o=JSON.parse(s.slice(a,b+1));
    else if(a2>=0 && b2>a2) o={ items:JSON.parse(s.slice(a2,b2+1)) };
  }catch(e){ o=null; }
  if(!o || !Array.isArray(o.items)) throw new Error('อ่าน JSON ไม่ได้');
  return o;
}
// box_2d is 0-1000 of the picture Gemini made; the saved picture may be cropped (watermark) and smaller.
function galItems(list, W0, H0, W1, H1, k){
  const items={}, seen=new Set();
  for(const r of list){
    if(!r || typeof r.word!=='string') continue;
    const word=r.word.trim().replace(/\s+/g,' ').slice(0,60), key=word.toLowerCase();
    if(!word || seen.has(key)) continue;
    let bx=null;
    if(Array.isArray(r.box_2d) && r.box_2d.length>=4){ const [y0,x0,y1,x1]=r.box_2d.slice(0,4).map(Number); bx=[x0,y0,x1,y1]; }
    else if(Array.isArray(r.box) && r.box.length>=4) bx=r.box.slice(0,4).map(Number);
    if(!bx || bx.some(v=>!Number.isFinite(v))) continue;
    const x0=Math.max(0,Math.min(bx[0],bx[2])/1000*W0), x1=Math.min(W1,Math.max(bx[0],bx[2])/1000*W0);
    const y0=Math.max(0,Math.min(bx[1],bx[3])/1000*H0), y1=Math.min(H1,Math.max(bx[1],bx[3])/1000*H0);
    if(x1-x0<8 || y1-y0<8) continue;
    seen.add(key);
    const it={ word, th:String(r.th||'').trim().slice(0,120),
      alts:(Array.isArray(r.alts)?r.alts:[]).filter(a=>typeof a==='string' && a.trim()).slice(0,4).map(a=>a.trim().slice(0,60)),
      x:Math.round(x0*k), y:Math.round(y0*k), w:Math.round((x1-x0)*k), h:Math.round((y1-y0)*k) };
    const l=typeof r.de==='string' && r.de.trim() ? cleanLang({ de:{ w:r.de, a:r.de_art, alts:r.de_alts } }) : null;
    if(l) it.l=l;
    items['g'+Object.keys(items).length.toString(36)+Math.random().toString(36).slice(2,6)]=it;
  }
  return items;
}
async function galEncode(src, sw, sh, w, h, q){
  const c=document.createElement('canvas'); c.width=w; c.height=h;
  const x=c.getContext('2d'); x.imageSmoothingQuality='high'; x.drawImage(src,0,0,sw,sh,0,0,w,h);
  let b=await new Promise(r=>c.toBlob(r,'image/webp',q));
  if(!b || b.type!=='image/webp') b=await new Promise(r=>c.toBlob(r,'image/jpeg',q));   // Safari cannot make WebP
  return b;
}
async function galPutImg(id, blob, thumb){
  const tok=await accessToken();
  const r=await fetch(`/api/admin/gallery/${id}/img${thumb?'?thumb=1':''}`,{ method:'PUT', headers:{ 'content-type':blob.type, ...(tok?{authorization:'Bearer '+tok}:{}) }, body:blob });
  if(!r.ok) throw new Error('อัปโหลดรูปไม่สำเร็จ ('+r.status+')');
}
async function galImportOne(p, cats){
  const meta=galParse(await p.json.text());
  const bmp=await createImageBitmap(p.img);
  const W0=bmp.width, H0=bmp.height, cut=GA.crop ? 0.04 : 0;
  const W1=Math.round(W0*(1-cut)), H1=Math.round(H0*(1-cut)), k=Math.min(1, 1600/Math.max(W1,H1));
  const W=Math.round(W1*k), H=Math.round(H1*k);
  const items=galItems(meta.items, W0, H0, W1, H1, k);
  if(!Object.keys(items).length) throw new Error('ไม่มีคำที่ใช้ได้');
  const cat=GA.cat || String(meta.category||'').trim().toLowerCase();
  const r=await adminApi('POST','/gallery',{ category: cats.includes(cat) ? cat : cats[0], title:String(meta.title||p.name).slice(0,60),
    title_th:String(meta.title_th||'').slice(0,60), level:meta.level, w:W, h:H, items }).catch(()=>({ok:false,j:{}}));
  if(!r.ok) throw new Error((r.j && r.j.error) || 'บันทึกไม่สำเร็จ');
  await galPutImg(r.j.id, await galEncode(bmp, W1, H1, 480, Math.round(H*480/W), 0.8), true);
  await galPutImg(r.j.id, await galEncode(bmp, W1, H1, W, H, 0.86), false);
  return { n:Object.keys(items).length, catOk:cats.includes(cat) };
}
async function galImport(files){
  const by={};
  for(const f of files){
    const name=f.name.replace(/\.[^.]+$/,''), key=name.toLowerCase(), o=by[key]||(by[key]={ name });
    if(/^image\//.test(f.type)) o.img=f; else o.json=f;
  }
  const pairs=Object.values(by), cats=(ADM.gal && ADM.gal.categories || []).map(c=>c.id);
  const done=[], fail=[], half=pairs.filter(p=>!p.img || !p.json).map(p=>p.name+(p.img?' (ไม่มี JSON)':' (ไม่มีรูป)'));
  let i=0;
  for(const p of pairs.filter(p=>p.img && p.json)){
    toast(`กำลังนำเข้า ${++i}: ${p.name}…`, 60000);
    try{ const r=await galImportOne(p, cats); done.push(`${p.name}: ${r.n} คำ`+(r.catOk?'':' (ไม่รู้จักหมวด ใส่ไว้หมวดแรก)')); }
    catch(e){ fail.push(`${p.name}: ${e && e.message || e}`); }
  }
  toast('นำเข้าเสร็จแล้ว', 1500);
  ADM.gal=null; renderAdmin();
  openModal(m=>m.append(el('h3',{text:'📥 นำเข้าคลังภาพ'}),
    el('p',{}, el('b',{text:`นำเข้าแล้ว ${done.length} ฉาก`})), ...done.map(t=>el('p',{class:'note small','data-noi18n':'',text:'✓ '+t})),
    fail.length ? el('p',{}, el('b',{text:'ไม่สำเร็จ'})) : null, ...fail.map(t=>el('p',{class:'note small err','data-noi18n':'',text:'✗ '+t})),
    half.length ? el('p',{}, el('b',{text:'ไฟล์ไม่ครบคู่'})) : null, ...half.map(t=>el('p',{class:'note small','data-noi18n':'',text:t})),
    done.length ? el('p',{class:'note',text:'ฉากที่นำเข้าเป็นฉบับร่าง ตรวจกรอบ (✏️ แก้กรอบ) แล้วกด “เผยแพร่”'}) : null,
    el('div',{class:'row'}, el('span',{class:'sp'}), el('button',{class:'primary',text:'ตกลง',onclick:closeModal}))));
}
function renderStatsAdmin(v){
  if(adminLoad('stats','/stats','stats')){ v.append(el('p',{class:'libempty',text:'กำลังโหลด…'})); return; }
  const A=ADM.stats;
  if(A.error){ v.append(el('p',{class:'err',text:A.error})); return; }
  if(A.setup){ trialSetup(v); return; }
  const T=A.totals||{}, N=x=>Number(x)||0;
  const days=[]; for(let i=29;i>=0;i--) days.push(new Date(Date.parse(A.today+'T00:00:00Z')-i*86400e3).toISOString().slice(0,10));
  const on=(d,e)=>N((A.days||[]).find(x=>x.day===d && x.event===e)?.n);
  const sum=(e,n)=>days.slice(-n).reduce((a,d)=>a+on(d,e),0);
  const card=(title,big,sub)=>el('div',{class:'aicard'}, el('h4',{text:title}), el('div',{class:'aibig'}, el('b',{text:String(big)})), sub?el('p',{class:'note small',text:sub}):null);
  const back7=sum('age:1-6',7)+sum('age:7-29',7)+sum('age:30+',7), open7=sum('open',7);
  v.append(el('div',{class:'aicards'},
    card('เปิดแอปวันนี้ (เครื่อง)', on(A.today,'open'), `เมื่อวาน ${on(days[28],'open')} · 7 วัน รวม ${open7} เครื่อง-วัน`),
    card('เครื่องใหม่ 7 วัน', sum('new_device',7), `30 วัน ${sum('new_device',30)} · กลับมาใช้ซ้ำ ${open7?Math.round(back7/open7*100):0}% ของการเปิดใน 7 วัน`),
    card('บัญชี', N(T.accounts), `ใหม่ 7 วัน ${N(T.accounts_7d)} · บัญชีนักเรียน ${N(T.students)} · เข้าสู่ระบบใน 7 วัน ${N(T.signed_in_7d)}`),
    card('ฝึกแล้วซิงค์ (บัญชี)', N(T.active_7d), `ใน 7 วัน · 30 วัน ${N(T.active_30d)}`),
    card('ฉากในบัญชี', N(T.scenes), `ใหม่ 7 วัน ${N(T.scenes_7d)} · จาก ${N(T.scene_users)} บัญชี`),
    card('แชร์และห้องเรียน', `${N(T.shares)} ลิงก์`, `ห้องเรียน ${N(T.classes)} ห้อง · สมาชิก ${N(T.class_members)} คน`)));
  // opens per day
  const vals=days.map(d=>({ n:on(d,'open'), nw:on(d,'new_device') })), mx=Math.max(1,...vals.map(x=>x.n));
  const chart=el('div',{class:'aichart'});
  days.forEach((d,i)=>{ const x=vals[i]; chart.append(el('div',{class:'aicol',title:`${d.slice(8)}/${d.slice(5,7)}: เปิด ${x.n} เครื่อง · ใหม่ ${x.nw}`},
    el('i',{class:'t',style:`height:${x.nw/mx*100}%`}), el('i',{class:'s',style:`height:${(x.n-Math.min(x.n,x.nw))/mx*100}%`}),
    el('small',{text:i%5===4||i===29?d.slice(8):''}))); });
  v.append(el('h4',{class:'aih',text:'เครื่องที่เปิดแอป 30 วันล่าสุด'}), chart,
    el('p',{class:'note small aileg'}, el('span',{class:'k t'}),' เครื่องใหม่ ', el('span',{class:'k s'}),' เครื่องที่เคยเปิดแล้ว'));
  // what people did (30 days)
  const acts=[['mode:learn','👀 ดูคำศัพท์'],['mode:quiz','⌨️ ทบทวน (พิมพ์)'],['mode:find','👂 ฟังแล้วหา'],['mode:speak','🎤 ฝึกพูด'],['review','🔁 รอบทบทวน'],['mock','📝 สอบจำลอง'],
    ['scene_new','📷 สร้างฉากจากรูป'],['ai_scene','✨ AI หาคำ'],['sheet_new','📝 ชีทคำศัพท์'],['gallery_add','🖼️ เก็บฉากจากคลังภาพ'],['share','🔗 สร้างลิงก์แชร์'],['class_join','🎓 เข้าห้องเรียน'],['feedback','💬 ส่งความเห็น'],
    ['ui:en','🇬🇧 ใช้เมนูอังกฤษ (เครื่อง-วัน)'],['lang:de','🇩🇪 ฝึกเยอรมัน (เครื่อง-วัน)'],['installed','📲 เปิดจากแอปที่ติดตั้ง (เครื่อง-วัน)']];
  const tb=el('table',{class:'aitable stat'}, el('tr',{}, ...['สิ่งที่ทำ','7 วัน','30 วัน'].map(h=>el('th',{text:h}))));
  acts.forEach(([k,t])=>tb.append(el('tr',{}, el('td',{text:t}), el('td',{text:String(sum(k,7))}), el('td',{text:String(sum(k,30))}))));
  v.append(el('h4',{class:'aih',text:'ใช้อะไรบ้าง (จำนวนครั้ง)'}), el('div',{class:'aitablewrap'}, tb),
    el('p',{class:'note small',text:'นับจากทุกเครื่อง รวมคนที่ไม่ได้เข้าสู่ระบบ เก็บแค่ยอดรวมต่อวัน ไม่รู้ว่าเป็นใคร · ตัวเลขบัญชีและฉากนับจากข้อมูลที่ซิงค์ขึ้นบัญชีเท่านั้น'}));
}
// ✨ AI usage: pictures and translations today / this month, Google's free daily quota, and what the paid tier would cost.
const THB=34;   // baht per US dollar, for rough estimates only
async function loadAiUsage(){ const r=await adminApi('GET','/ai-usage').catch(()=>({ok:false})); ADM.ai = r.ok ? r.j : { error:'โหลดไม่สำเร็จ' }; }
function aiTotals(rows){
  const t={ scans:0, trans:0, quota:0, quotaLast:0, errors:0, tin:0, tout:0, cost:0, byModel:{} };
  const last=(ADM.ai.gemini_models||[]).slice(-1)[0];
  rows.forEach(r=>{ const n=Number(r.n)||0, q=/^(quota_|no_quota)/.test(r.outcome);
    const m=t.byModel[r.model]||(t.byModel[r.model]={ ok:0, quota:0, errors:0, tin:0, tout:0, provider:r.provider });
    if(r.outcome==='ok'){ if(r.kind==='scan') t.scans+=n; else t.trans+=n; m.ok+=n; }
    else if(q){ t.quota+=n; m.quota+=n; if(r.model===last) t.quotaLast+=n; }
    else { t.errors+=n; m.errors+=n; }
    const ti=Number(r.tok_in)||0, to=Number(r.tok_out)||0; t.tin+=ti; t.tout+=to; m.tin+=ti; m.tout+=to;
    const pr=(ADM.ai.paid_price||{})[r.model]; if(pr) t.cost+=(ti*pr[0]+to*pr[1])/1e6; });
  return t;
}
const money=usd=>usd<0.01 ? 'น้อยกว่า 1 บาท' : `~${Math.round(usd*THB).toLocaleString('th-TH')} บาท ($${usd.toFixed(2)})`;
function renderAiUsage(v){
  if(!ADM.ai){ v.append(el('p',{class:'libempty',text:'กำลังโหลด…'})); loadAiUsage().then(()=>{ if(S.view==='admin' && ADM.tab==='ai') renderAdmin(); }); return; }
  const A=ADM.ai;
  if(A.error){ v.append(el('p',{class:'err',text:A.error})); return; }
  if(A.setup){ v.append(el('div',{class:'admcard'}, el('p',{}, el('b',{text:'ยังไม่ได้เปิดตัวนับการใช้ AI'})),
    el('p',{text:'รันไฟล์ supabase/2026-11-ai-usage.sql ใน Supabase → SQL Editor ครั้งเดียว แล้วระบบจะเริ่มนับตั้งแต่การใช้ AI ครั้งถัดไป'}))); return; }
  const T=aiTotals(A.today.rows), M=aiTotals(A.month.rows);
  const hm=d=>new Date(d).toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'});
  const now=new Date(), dim=new Date(now.getFullYear(), now.getMonth()+1, 0).getDate(), dayNo=Math.max(1, (Date.now()-Date.parse(A.month.since))/86400e3);
  // the verdict first
  const lim=A.free_rpd||{}, models=A.gemini_models||[], gem=A.provider==='gemini';
  const qRows=A.quota_day.rows.filter(r=>r.provider==='gemini' && !/^(quota_|no_quota)/.test(r.outcome));
  const used=m=>qRows.filter(r=>r.model===m).reduce((a,r)=>a+Number(r.n),0);
  const totalLim=models.reduce((a,m)=>a+(lim[m]||0),0), usedAll=models.reduce((a,m)=>a+used(m),0);
  const peak=Math.max(0, ...Object.values((A.daily||[]).reduce((o,r)=>{ o[r.day]=(o[r.day]||0)+Number(r.n); return o; },{})));
  let verdict, vcls='ok';
  if(!A.provider){ verdict='ยังไม่ได้ตั้งค่า AI (ไม่มี GEMINI_API_KEY หรือ ANTHROPIC_API_KEY)'; vcls='warn'; }
  else if(!gem) verdict='ใช้ Claude ('+A.claude_model+') แบบจ่ายตามใช้ ไม่มีโควตาฟรีรายวัน — ดูค่าใช้จ่ายด้านล่าง';
  else if(M.quotaLast>0){ verdict=`⚠️ เดือนนี้โควตาฟรีหมดทุกรุ่น ${M.quotaLast} ครั้ง — ผู้ใช้เจอข้อความ “AI มีผู้ใช้งานมาก” ถึงเวลาพิจารณาแบบเสียเงิน`; vcls='bad'; }
  else if(totalLim && peak>=totalLim*0.8){ verdict=`⚠️ วันที่ใช้มากที่สุดใช้ไป ${peak} จาก ${totalLim} ครั้ง ใกล้เต็มโควตาฟรีแล้ว`; vcls='warn'; }
  else if(M.quota>0) verdict=`ℹ️ รุ่นที่แม่นกว่าหมดโควตาบ้าง (${M.quota} ครั้ง) ระบบสลับไปรุ่นถัดไปให้เอง ผู้ใช้ยังใช้ได้ — ยังไม่จำเป็นต้องจ่าย`;
  else verdict='✅ โควตาฟรียังพอ ยังไม่ต้องเปลี่ยนเป็นแบบเสียเงิน';
  v.append(el('div',{class:'aiverdict '+vcls,text:verdict}));
  const card=(title,t,extra)=>el('div',{class:'aicard'}, el('h4',{text:title}),
    el('div',{class:'aibig'}, el('b',{text:String(t.scans)}), el('span',{text:' รูปที่ AI หาคำให้'})),
    el('p',{text:`แปลคำ ${t.trans} ฉาก · โควตาหมด ${t.quota} ครั้ง · ผิดพลาดอื่น ${t.errors} ครั้ง`}),
    el('p',{class:'note small',text:`token เข้า ${t.tin.toLocaleString('th-TH')} · ออก ${t.tout.toLocaleString('th-TH')}`}), extra||null);
  v.append(el('div',{class:'aicards'},
    card('วันนี้',T),
    card('เดือนนี้',M, el('div',{},
      el('p',{class:'note small',text:`ถ้าจ่ายเงินตามราคาของรุ่นที่ใช้จริง: เดือนนี้ ${money(M.cost)} · ทั้งเดือนน่าจะ ${money(M.cost/dayNo*dim)}`}),
      gem && (A.paid_price||{})['gemini-3.8-flash'] ? el('p',{class:'note small',text:(()=>{ const pr=A.paid_price['gemini-3.8-flash'], c=(M.tin*pr[0]+M.tout*pr[1])/1e6; return `ถ้าจ่ายเงินและใช้ gemini-3.8-flash ทุกครั้ง: เดือนนี้ ${money(c)} · ทั้งเดือนน่าจะ ${money(c/dayNo*dim)}`; })()}) : null))));
  if(gem && models.length){
    const box=el('div',{class:'aicard wide'}, el('h4',{text:'โควตาฟรีของ Google รอบนี้'}),
      el('p',{class:'note small',text:`นับตั้งแต่ ${hm(A.quota_day.since)} น. · รีเซ็ตครั้งถัดไป ${hm(A.quota_day.resets)} น. (เที่ยงคืนเวลาแปซิฟิก) · ระบบลองรุ่นตามลำดับนี้`}));
    models.forEach(m=>{ const u=used(m), l=lim[m]||0, pct=l?Math.min(100,Math.round(u/l*100)):0;
      box.append(el('div',{class:'aiq'}, el('span',{class:'aiqm',text:m}),
        el('span',{class:'aibar'}, el('i',{style:`width:${pct}%`,class:pct>=100?'full':pct>=80?'hi':''})),
        el('span',{class:'aiqn',text: l ? `${u} / ${l}` : `${u} (ไม่ทราบโควตา)`}))); });
    v.append(box);
  }
  // per model this month
  const bm=Object.entries(M.byModel);
  if(bm.length){
    const tb=el('table',{class:'aitable'}, el('tr',{}, ...['รุ่น','สำเร็จ','โควตาหมด','ผิดพลาด','token เฉลี่ย (เข้า/ออก)'].map(h=>el('th',{text:h}))));
    bm.sort((a,b)=>b[1].ok-a[1].ok).forEach(([m,x])=>{ const k=x.ok||1; tb.append(el('tr',{}, el('td',{text:m}), el('td',{text:String(x.ok)}), el('td',{text:String(x.quota)}), el('td',{text:String(x.errors)}),
      el('td',{text: x.ok ? `${Math.round(x.tin/k).toLocaleString('th-TH')} / ${Math.round(x.tout/k).toLocaleString('th-TH')}` : '-'}))); });
    v.append(el('h4',{class:'aih',text:'แยกตามรุ่น (เดือนนี้)'}), el('div',{class:'aitablewrap'}, tb));
  }
  // 30 days
  const days=[]; for(let i=29;i>=0;i--){ const d=new Date(Date.now()+7*3600e3-i*86400e3); days.push(d.toISOString().slice(0,10)); }
  const per=d=>{ const r=(A.daily||[]).filter(x=>x.day===d); return { scan:r.filter(x=>x.kind==='scan'&&x.ok).reduce((a,x)=>a+Number(x.n),0), tr:r.filter(x=>x.kind==='translate'&&x.ok).reduce((a,x)=>a+Number(x.n),0), bad:r.filter(x=>!x.ok).reduce((a,x)=>a+Number(x.n),0) }; };
  const vals=days.map(per), mx=Math.max(1,...vals.map(x=>x.scan+x.tr+x.bad));
  const chart=el('div',{class:'aichart'});
  days.forEach((d,i)=>{ const x=vals[i]; chart.append(el('div',{class:'aicol',title:`${d.slice(8)}/${d.slice(5,7)}: รูป ${x.scan} · แปล ${x.tr} · ไม่สำเร็จ ${x.bad}`},
    el('i',{class:'s',style:`height:${x.scan/mx*100}%`}), el('i',{class:'t',style:`height:${x.tr/mx*100}%`}), el('i',{class:'b',style:`height:${x.bad/mx*100}%`}),
    el('small',{text:i%5===4||i===29?d.slice(8):''}))); });
  v.append(el('h4',{class:'aih',text:'30 วันล่าสุด'}), chart,
    el('p',{class:'note small aileg'}, el('span',{class:'k s'}),' รูป ', el('span',{class:'k t'}),' แปลคำ ', el('span',{class:'k b'}),' ไม่สำเร็จ (รวมโควตาหมด)'),
    el('p',{class:'note small',text:`ราคาประมาณจากราคาแบบเสียเงิน ณ พ.ย. 2026 (1 ดอลลาร์ ≈ ${THB} บาท) · Gemini 3.8 Flash ขึ้นราคา 2 เท่าตั้งแต่ ม.ค. 2027 · เก็บแค่จำนวนครั้งและ token ไม่เก็บรูป คำ หรือผู้ใช้`}));
}
async function adminEvidence(r, box){
  box.innerHTML=''; box.append(el('p',{class:'note small',text:'กำลังโหลด…'}));
  const x=await adminApi('GET','/reports/'+r.id).catch(()=>({ok:false}));
  box.innerHTML='';
  if(!x.ok){ box.append(el('p',{class:'err',text:'โหลดหลักฐานไม่สำเร็จ'})); return; }
  const d=x.j;
  box.append(el('p',{}, el('b',{text:'สิ่งที่ส่งถึงผู้รายงาน (30 วัน): '}), d.sent.length ? '' : 'ไม่มี'));
  if(d.sent.length) box.append(el('ul',{}, ...d.sent.map(e=>el('li',{}, e.kind==='cheer' ? (CHEER_TEXT[e.data.cheer]||e.data.cheer) : el('span',{}, `${e.data.kind==='deck'?'ชุดคำ':'ฉาก'} “${e.data.name}” `, el('a',{href:'/s/'+e.data.share_id,target:'_blank',rel:'noopener',text:'เปิด ↗'})), el('span',{class:'note small',text:' · '+ago2(e.created_at)})))));
  box.append(el('p',{}, el('b',{text:`ลิงก์แชร์ของผู้ใช้นี้ (${d.shares.length}): `}), d.shares.length ? '' : 'ไม่มี'));
  if(d.shares.length) box.append(el('ul',{}, ...d.shares.map(sh=>el('li',{}, `${sh.kind==='deck'?'📚':'🖼️'} ${sh.name} `, el('a',{href:'/s/'+sh.id,target:'_blank',rel:'noopener',text:'เปิด ↗'}), ' ',
    el('button',{class:'linkbtn small danger-link',text:'ลบ',onclick:()=>adminDeleteShare(sh.id)})))));
  box.append(el('p',{class:'note small',text:`อยู่ในห้องเรียน ${d.classes.length} ห้อง`+(d.classes.length?' (ชื่อในห้อง: '+d.classes.map(c=>c.nickname).join(', ')+')':'')}));
}
async function adminSuspend(rd, on){
  if(!(await ask(on ? `ระงับบัญชี “${rd.nickname||rd.id.slice(0,8)}”? จะเข้าสู่ระบบไม่ได้ และถูกนำออกจากเพื่อนทั้งหมด` : `ยกเลิกการระงับบัญชี “${rd.nickname||''}”?`, on?'ระงับบัญชี':'ยกเลิกระงับ'))) return;
  const r=await adminApi('POST',`/users/${rd.id}/suspend`,{ on }); toast(r.ok ? (on?'ระงับบัญชีแล้ว':'ยกเลิกระงับแล้ว') : 'ทำไม่สำเร็จ ลองใหม่'); ADM.data=null; renderAdmin();
}
async function adminDeleteShare(id){
  if(!(await ask('ลบลิงก์แชร์นี้? คนที่มีลิงก์จะเปิดไม่ได้อีก','ลบลิงก์'))) return;
  const r=await adminApi('DELETE','/shares/'+id); toast(r.ok?'ลบลิงก์แล้ว':'ลบไม่สำเร็จ'); ADM.data=null; renderAdmin();
}
function adminResolve(r){
  if(r.resolved_at){ adminApi('POST',`/reports/${r.id}/resolve`,{ reopen:true }).then(()=>{ ADM.data=null; renderAdmin(); }); return; }
  deckNameDialog('ปิดเรื่อง (บันทึกสั้น ๆ ไม่บังคับ)', '', 'ปิดเรื่อง', async note=>{ await adminApi('POST',`/reports/${r.id}/resolve`,{ note }); ADM.data=null; renderAdmin(); }, 'เช่น ระงับบัญชีแล้ว / ไม่พบปัญหา', 300);
}
var adminLinkWanted=/^\/admin\/?$/.test(location.pathname);
if(adminLinkWanted){ const t=new URLSearchParams(location.search).get('tab'); if(['reports','feedback','gallery','stats','errors','ai'].includes(t)) ADM.tab=t; }   // /admin?tab=feedback (link in the feedback e-mail)
// ---------- share links (piccab.com/s/<id>) ----------
// A link is a snapshot: the server copies the words and pictures when you share (or update) it.
let myShares=store.get('pv-shares',{}); if(typeof myShares!=='object'||!myShares) myShares={};
const shareKey=t=>t.kind+':'+(t.kind==='scene'?t.sc.id:t.deck.id);
const shareUrl=id=>location.origin+'/s/'+id+HL;
function sceneForShare(sc){
  if(sc.builtin) return { id:sc.id, builtin:true, n:Object.keys(sc.items).length };
  return { id:sc.id, name:sc.name, w:sc.w, h:sc.h, items:sc.items };
}
function sharePayload(t){
  if(t.kind==='scene') return { kind:'scene', name:t.sc.name, scenes:[sceneForShare(t.sc)] };
  const live=liveKeys(), words=t.deck.words.filter(k=>live.has(k));
  const ids=[...new Set(words.map(k=>k.slice(0,k.indexOf('|'))))];
  return { kind:'deck', name:t.deck.id===SAVED_DECK?tx('คำที่เก็บไว้'):t.deck.name, words, scenes:ids.map(id=>scenes().find(x=>x.id===id)).filter(Boolean).map(sceneForShare) };
}
// Pictures must be in the account (R2) before the server can copy them.
async function picturesUploaded(payload){
  for(let i=0;i<100 && SYNC.busy;i++) await new Promise(r=>setTimeout(r,200));
  await syncNow(false);
  const mem=syncMem(user.id);
  return payload.scenes.every(x=>x.builtin || (mem.img && mem.img[x.id]));
}
async function shareApi(method, path, body){
  const tok=await accessToken();
  const r=await fetch(path,{ method, headers:{ 'content-type':'application/json', ...(tok?{authorization:'Bearer '+tok}:{}) }, body: body?JSON.stringify(body):undefined });
  const j=await r.json().catch(()=>({}));
  return { ok:r.ok, status:r.status, j };
}
const shareErr=(st,j)=> j.error==='not_configured' ? 'ตอนนี้ยังสร้างลิงก์ไม่ได้ (ระบบยังไม่พร้อม)'
  : j.error==='picture_missing' ? 'รูปยังอัปโหลดขึ้นบัญชีไม่เสร็จ รอสักครู่แล้วลองใหม่'
  : j.error==='too_many_shares' ? 'สร้างลิงก์ครบจำนวนแล้ว ลองยกเลิกลิงก์เก่าในหน้า 👤 บัญชีของฉัน'
  : st===401 ? 'กรุณาเข้าสู่ระบบใหม่อีกครั้ง' : 'สร้างลิงก์ไม่สำเร็จ ตรวจอินเทอร์เน็ตแล้วลองใหม่';
async function copyLink(url){
  try{ await navigator.clipboard.writeText(url); toast('คัดลอกลิงก์แล้ว ส่งให้เพื่อนได้เลย'); }
  catch(e){ prompt('คัดลอกลิงก์นี้', url); }
}
async function shareLinkNative(url, title){
  if(navigator.share){ try{ title=tx(title); await navigator.share({ title, text:title+tx(' — ฝึกคำศัพท์อังกฤษบน Piccab'), url }); return; }catch(e){ if(e && e.name==='AbortError') return; } }
  copyLink(url);
}
function openShare(t){
  const key=shareKey(t), isScene=t.kind==='scene', name=isScene?t.sc.name:deckName(t.deck);
  const stamp=isScene?(t.sc.updatedAt||0):(t.deck.updatedAt||0);
  const draw=(m, busy, err)=>{
    m.innerHTML='';
    const cur=myShares[key];
    m.append(el('h3',{text:(isScene?'🔗 แชร์ฉาก “':'🔗 แชร์ชุดคำ “')+name+'”'}),
      el('p',{class:'note',text:'ส่งลิงก์ให้เพื่อนหรือนักเรียน เปิดแล้วกดเก็บเข้าคลังของตัวเองได้เลย ไม่ต้องสมัครสมาชิก'}));
    if(cur){
      const inp=el('input',{class:'sharelink',readonly:'',value:shareUrl(cur.id),'aria-label':'ลิงก์แชร์'});
      inp.addEventListener('focus',()=>inp.select());
      m.append(inp, el('div',{class:'row'},
        el('button',{class:'primary',text:'📋 คัดลอกลิงก์',onclick:()=>copyLink(shareUrl(cur.id))}),
        el('button',{text:'📲 ส่งต่อ…',onclick:()=>shareLinkNative(shareUrl(cur.id), name)})));
      if(stamp>cur.at) m.append(el('p',{class:'note warn'}, 'มีการแก้ไขหลังสร้างลิงก์ · ',
        el('button',{class:'linkbtn small',text:busy?'กำลังอัปเดต…':'อัปเดตลิงก์เป็นเวอร์ชันล่าสุด',disabled:busy?'':null,onclick:()=>make(m, cur.id)})));
    } else if(!user){
      m.append(el('p',{class:'err',text:'ต้องเข้าสู่ระบบก่อนจึงจะสร้างลิงก์ได้'}),
        el('div',{class:'row'}, el('button',{class:'primary',text:'👤 เข้าสู่ระบบ',onclick:()=>openLogin()})));
    } else {
      m.append(el('div',{class:'row'}, el('button',{class:'primary',text:busy?'กำลังสร้างลิงก์…':'🔗 สร้างลิงก์',disabled:busy?'':null,onclick:()=>make(m)})));
    }
    if(err) m.append(el('p',{class:'err',text:err}));
    m.append(el('p',{class:'note small'},'ผู้ที่มีลิงก์จะเห็นรูปและคำศัพท์ (ไม่เห็นอีเมลหรือชื่อของคุณ) · ลิงก์เป็นสำเนา ณ ตอนแชร์ · ยกเลิกลิงก์ได้ทุกเมื่อ'));
    const foot=el('div',{class:'row'});
    if(isScene) foot.append(el('button',{class:'linkbtn small',text:'📄 ส่งเป็นไฟล์แทน',onclick:()=>{ closeModal(); shareScene(); }}));
    if(cur) foot.append(el('button',{class:'linkbtn small danger-link',text:'ยกเลิกลิงก์',onclick:()=>revokeShare(key, cur.id).then(()=>draw(m))}));
    foot.append(el('span',{class:'sp'}), el('button',{text:'ปิด',onclick:closeModal}));
    m.append(foot);
  };
  const make=async(m, id)=>{
    if(navigator.onLine===false){ draw(m,false,'ต้องต่ออินเทอร์เน็ตก่อนสร้างลิงก์'); return; }
    draw(m,true);
    const body=sharePayload(t); if(id) body.id=id;
    if(!body.scenes.length){ draw(m,false,'ยังไม่มีคำศัพท์ให้แชร์'); return; }
    if(!(await picturesUploaded(body))){ draw(m,false,shareErr(0,{error:'picture_missing'})); return; }
    const r=await shareApi('POST','/api/share',body).catch(()=>({ok:false,status:0,j:{}}));
    if(!r.ok){ draw(m,false,shareErr(r.status,r.j)); return; }
    myShares[key]={ id:r.j.id, at:Date.now() }; store.set('pv-shares',myShares); if(!id) tally('share');
    draw(m,false); if(!id) copyLink(shareUrl(r.j.id)); else toast('อัปเดตลิงก์แล้ว');
  };
  openModal(m=>draw(m));
}
async function revokeShare(key, id){
  if(!(await ask('ยกเลิกลิงก์นี้? คนที่มีลิงก์จะเปิดไม่ได้อีก (ฉากที่เขาเก็บไว้แล้วยังอยู่ในเครื่องของเขา)','ยกเลิกลิงก์'))) return false;
  const r=await shareApi('DELETE','/api/share/'+id).catch(()=>({ok:false}));
  if(!r.ok && r.status!==404){ toast('ยกเลิกลิงก์ไม่สำเร็จ ลองใหม่อีกครั้ง'); return false; }
  for(const k of Object.keys(myShares)) if(myShares[k].id===id) delete myShares[k];
  store.set('pv-shares',myShares); toast('ยกเลิกลิงก์แล้ว'); return true;
}
// 👤 → ลิงก์ที่แชร์ไว้
async function openMyShares(){
  openModal(m=>m.append(el('h3',{text:'🔗 ลิงก์ที่แชร์ไว้'}), el('p',{class:'note',text:'กำลังโหลด…'})));
  const r=await shareApi('GET','/api/shares').catch(()=>({ok:false}));
  openModal(m=>{
    m.append(el('h3',{text:'🔗 ลิงก์ที่แชร์ไว้'}));
    const list=(r.ok && r.j.shares)||[];
    if(!r.ok) m.append(el('p',{class:'err',text:'โหลดรายการไม่สำเร็จ ลองใหม่อีกครั้ง'}));
    else if(!list.length) m.append(el('p',{class:'note',text:'ยังไม่มีลิงก์ที่แชร์ไว้ — กด 🔗 แชร์ ที่ฉากหรือชุดคำ'}));
    else {
      const box=el('div',{class:'dk-list'});
      list.forEach(x=>box.append(el('div',{class:'dk-row shrow'},
        el('span',{class:'dk-name'}, el('b',{text:(x.kind==='deck'?'📚 ':'🖼️ ')+x.name}), el('small',{text:'อัปเดต '+new Date(x.updated_at).toLocaleDateString(LOC,{day:'numeric',month:'short',year:'numeric'})})),
        el('button',{class:'linkbtn small',text:'คัดลอก',onclick:()=>copyLink(shareUrl(x.id))}),
        el('button',{class:'linkbtn small danger-link',text:'ยกเลิก',onclick:async()=>{ if(await revokeShare(null,x.id)) openMyShares(); else openMyShares(); }}))));
      m.append(box);
    }
    m.append(el('div',{class:'row'}, el('span',{class:'sp'}), el('button',{class:'primary',text:'ปิด',onclick:closeModal})));
  });
}
// Someone opened piccab.com/s/<id>
const sharedLinkId=(/^\/s\/([A-Za-z0-9]{8,16})\/?$/.exec(location.pathname)||[])[1]||null;
async function openSharedLink(id){
  try{ history.replaceState(null,'','/app'); }catch(e){}
  const r=await fetch('/api/share/'+id,{cache:'no-store'}).then(x=>x.ok?x.json():(x.status===404?{missing:true}:null)).catch(()=>null);
  if(!r || r.missing){
    openModal(m=>m.append(el('h3',{text:'🔗 เปิดลิงก์ไม่ได้'}),
      el('p',{text: r ? 'ลิงก์นี้ถูกยกเลิกแล้ว หรือพิมพ์ลิงก์ไม่ครบ ลองขอลิงก์ใหม่จากคนที่แชร์' : 'ต้องต่ออินเทอร์เน็ตเพื่อเปิดลิงก์แชร์'}),
      el('div',{class:'row'}, el('span',{class:'sp'}), el('button',{class:'primary',text:'ตกลง',onclick:closeModal}))));
    return;
  }
  const done=(store.get('pv-imported',{})||{})[id];
  const already = done && done.scenes && done.scenes.every(sid=>scenes().some(x=>x.id===sid)) && (!done.deck || getDeck(done.deck));
  const isDeck=r.kind==='deck', n=isDeck ? r.words.length : Object.keys(r.scenes[0].items||{}).length;
  const pic=r.scenes.find(x=>!x.builtin);
  openModal(m=>{
    m.classList.add('wide');
    const go=el('button',{class:'primary',text: already ? '▶ เปิด' : '➕ เก็บเข้าคลังแล้วเริ่มเรียน'});
    go.addEventListener('click',async()=>{
      if(already){ closeModal(); openImported(done); return; }
      go.disabled=true;
      try{ const res=await importShare(id, r, (i,k)=>{ go.textContent=`กำลังเก็บ… ${i}/${k}`; }); closeModal(); openImported(res); toast(isDeck?'เก็บชุดคำแล้ว ✓':'เก็บฉากเข้าคลังแล้ว ✓'); }
      catch(e){ go.disabled=false; go.textContent='➕ ลองอีกครั้ง'; toast('เก็บไม่สำเร็จ ตรวจอินเทอร์เน็ตแล้วลองใหม่'); }
    });
    m.append(el('div',{class:'pv-head'},
        el('div',{}, el('h3',{text:(isDeck?'📚 ชุดคำ “':'🖼️ ฉาก “')+r.name+'”'}),
          el('div',{class:'meta',text: isDeck ? `${n} คำ จาก ${r.scenes.length} ฉาก · มีคนแชร์ให้คุณ` : `${n} คำศัพท์ · มีคนแชร์ให้คุณ`})),
        el('button',{class:'x','aria-label':'ปิด',text:'✕',onclick:closeModal})),
      el('div',{class:'pv-fig sharefig'}, el('img',{alt:'',src: pic ? `/api/share/${id}/img/${pic.id}` : sceneImg(BUILTIN[0])})),
      el('div',{class:'row'}, el('span',{class:'sp'}), el('button',{text:'ไว้ทีหลัง',onclick:closeModal}), go),
      el('p',{class:'note small',text: already ? 'คุณเก็บลิงก์นี้ไว้แล้ว' : 'ฉากจะถูกเก็บในเครื่องนี้ (และในบัญชี ถ้าเข้าสู่ระบบ) ลบได้ทุกเมื่อ'}),
      el('p',{class:'note small'}, el('button',{class:'linkbtn small danger-link',text:'⚠️ รายงานเนื้อหาไม่เหมาะสม',onclick:()=>openReportShare(id)})));
  });
}
const blobToDataUrl=b=>new Promise((res,rej)=>{ const fr=new FileReader(); fr.onload=()=>res(fr.result); fr.onerror=rej; fr.readAsDataURL(b); });
async function importShare(id, r, progress){
  const map={}, made=[], todo=r.scenes.filter(x=>!x.builtin);
  let i=0;
  for(const x of r.scenes){
    if(x.builtin){ map[x.id]=x.id; continue; }
    progress && progress(++i, todo.length);
    const res=await fetch(`/api/share/${id}/img/${x.id}`); if(!res.ok) throw new Error('picture');
    const img=await blobToDataUrl(await res.blob());
    const nid='s'+Date.now().toString(36)+Math.random().toString(36).slice(2,5);
    const sc={ id:nid, name:String(x.name||r.name).slice(0,50), w:x.w, h:x.h, items:JSON.parse(JSON.stringify(x.items||{})), img };
    customs.push(sc); made.push(sc); map[x.id]=nid;
  }
  if(made.length) saveScenes();
  let deckId=null;
  if(r.kind==='deck'){
    let nm=r.name.slice(0,30), k=2; while(decks.some(d=>d.name===nm)) nm=(r.name.slice(0,26)+' ('+(k++)+')');
    const d=newDeck(nm);
    d.words=r.words.map(w=>{ const j=w.indexOf('|'); const sid=map[w.slice(0,j)]; return sid ? sid+w.slice(j) : null; }).filter(Boolean);
    saveDecks(); deckId=d.id;
  }
  const rec={ kind:r.kind, scenes:r.scenes.map(x=>map[x.id]).filter(Boolean), deck:deckId, at:Date.now() };
  const all=store.get('pv-imported',{})||{}; all[id]=rec; store.set('pv-imported',all);
  return rec;
}
function openImported(rec){
  if(rec.deck){ WD.deck=rec.deck; store.set('pv-wdeck',rec.deck); WD.f='all'; WD.q=''; goHome('words'); return; }
  if(rec.scenes && rec.scenes[0]) openScene(rec.scenes[0],'learn');
}
// ---------- install as an app (PWA) + offline ----------
// (var + function declarations: renderHome() may ask before this part of the script has run)
var installEvt=null;
function isStandalone(){ return matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches || navigator.standalone===true; }
function isIOS(){ return /iphone|ipad|ipod/i.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints>1); }
function installAvailable(){ return !isStandalone() && (!!installEvt || isIOS()); }
function installUi(){ const l=$('#installLink'); if(l) l.hidden=!installAvailable(); if(S.view==='home') renderHome(); }
async function installApp(){
  if(installEvt){
    const ev=installEvt; installEvt=null;
    ev.prompt();
    const r=await ev.userChoice.catch(()=>null);
    if(r && r.outcome==='dismissed') installEvt=ev;                   // still offerable next time
    installUi(); return;
  }
  if(isIOS()) openModal(m=>m.append(el('h3',{text:'📲 ติดตั้ง Piccab บน iPhone / iPad'}),
    el('ol',{class:'iosteps'},
      el('li',{}, 'เปิดหน้านี้ใน ', el('b',{text:'Safari'})),
      el('li',{}, 'แตะปุ่ม ', el('b',{text:'แชร์'}), ' (สี่เหลี่ยมมีลูกศรชี้ขึ้น) ที่แถบด้านล่างหรือด้านบน'),
      el('li',{}, 'เลื่อนลงแล้วแตะ ', el('b',{text:'เพิ่มไปยังหน้าจอโฮม'}), ' (Add to Home Screen)'),
      el('li',{}, 'แตะ ', el('b',{text:'เพิ่ม'}), ' แล้วเปิด Piccab จากไอคอนบนหน้าจอโฮมได้เลย')),
    el('div',{class:'row'}, el('span',{class:'sp'}), el('button',{class:'primary',text:'เข้าใจแล้ว',onclick:closeModal}))));
}
window.addEventListener('beforeinstallprompt',e=>{ e.preventDefault(); installEvt=e; installUi(); });
window.addEventListener('appinstalled',()=>{ installEvt=null; installUi(); toast('ติดตั้ง Piccab แล้ว เปิดจากหน้าจอโฮมได้เลย 🎉', 4000); });
$('#installLink').addEventListener('click',installApp);
// From the landing page's "📲 ติดตั้งเป็นแอป" (/app?install): explain, and install with one more tap.
function openInstallHelp(){
  if(matchMedia('(display-mode: standalone)').matches){ toast('เปิด Piccab แบบแอปอยู่แล้ว 🎉'); return; }
  if(isIOS()){ installApp(); return; }
  openModal(m=>m.append(el('h3',{text:'📲 ติดตั้ง Piccab เป็นแอป'}),
    el('p',{text:'เปิดจากไอคอนบนหน้าจอโฮมได้เหมือนแอปทั่วไป และฝึกต่อได้แม้ไม่มีอินเทอร์เน็ต'}),
    installEvt ? null : el('p',{class:'note',text:'ถ้าไม่มีหน้าต่างติดตั้งขึ้นมา: เปิดเมนูของเบราว์เซอร์ (⋮ หรือ ⋯) แล้วเลือก “ติดตั้งแอป” หรือ “เพิ่มลงในหน้าจอหลัก”'}),
    el('div',{class:'row'}, el('span',{class:'sp'}), el('button',{text:'ไว้ทีหลัง',onclick:closeModal}),
      el('button',{class:'primary',text:'ติดตั้ง',onclick:()=>{ closeModal(); if(installEvt) installApp(); else toast('ใช้เมนูของเบราว์เซอร์ → “ติดตั้งแอป” ได้เลย', 4000); }}))));
}
installUi();
window.addEventListener('offline',()=>toast('ออฟไลน์อยู่ — ฝึกต่อได้ตามปกติ ข้อมูลจะซิงค์เมื่อกลับมาออนไลน์', 4500));
window.addEventListener('online',()=>{ toast('กลับมาออนไลน์แล้ว', 2500); checkAI(); if(user) syncNow(true); });
if('serviceWorker' in navigator && (location.protocol==='https:' || location.hostname==='localhost')){
  window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(e=>console.warn('service worker', e)));
}
if(oauthErr) setTimeout(()=>toast(/access_denied|cancel/i.test(oauthErr.code+' '+oauthErr.desc) ? 'ยกเลิกการเข้าสู่ระบบด้วย Google แล้ว' : 'เข้าสู่ระบบด้วย Google ไม่สำเร็จ: '+oauthErr.desc, 5000), 400);
{ const f=store.get('pv-flash',null); if(f){ try{ localStorage.removeItem('pv-flash'); }catch(e){} setTimeout(()=>toast(f,4000),300); } }

// ---------- sync: scenes + progress in Supabase, pictures in R2 (via /api/img) ----------
// Each device remembers what it last synced ('pv-sync'), so only changes are sent.
// Conflicts: the newer edit of a scene (or of a scene's progress) wins.
const SYNC={ ready:false, busy:false, again:false, timer:null, state:'idle', at:0, lastPull:0,
  mem: store.get('pv-sync', null) || {}, del: store.get('pv-sync-del', []) || [], delDecks: store.get('pv-sync-del-decks', []) || [], noDecks:false };
const syncMem=uid=>{ if(SYNC.mem.uid!==uid) SYNC.mem={ uid, scenes:{}, img:{}, prog:{}, decks:{} }; if(!SYNC.mem.decks) SYNC.mem.decks={}; return SYNC.mem; };
const saveSyncMem=()=>{ store.set('pv-sync', SYNC.mem); store.set('pv-sync-del', SYNC.del); store.set('pv-sync-del-decks', SYNC.delDecks); };
// The decks table is added by supabase/2026-11-decks.sql — until it exists, decks just stay on this device.
const missingTable=e=>!!e && (e.status===404 || e.code==='42P01' || e.code==='PGRST205' || /does not exist|schema cache/i.test(e.message||''));
// Deck sync never blocks scenes/pictures/progress: on failure it just tries again next time.
function deckSyncFailed(e){ if(missingTable(e)){ SYNC.noDecks=true; console.warn('decks table missing — run supabase/2026-11-decks.sql'); } else console.warn('deck sync failed', e); }
const progSig=p=>JSON.stringify([p.done||{},p.star||{}]);
function syncText(){
  const n=customs.filter(sc=>user && sc.owner===user.id).length;
  if(SYNC.state==='busy') return '☁️ กำลังซิงค์…';
  if(SYNC.state==='error') return '⚠️ ซิงค์ไม่สำเร็จ (จะลองใหม่อัตโนมัติ) — ข้อมูลยังอยู่ในเครื่องนี้';
  if(!SYNC.at) return '☁️ ฉาก รูป และความคืบหน้าจะซิงค์กับบัญชีนี้อัตโนมัติ';
  return `☁️ ซิงค์แล้ว ${n} ฉาก · ล่าสุด ${new Date(SYNC.at).toLocaleTimeString(LOC,{hour:'2-digit',minute:'2-digit'})} น.`;
}
async function accessToken(){ const { data } = await sb.auth.getSession(); return data && data.session && data.session.access_token || null; }
function syncSoon(){ if(!sb || !user || !SYNC.ready) return; clearTimeout(SYNC.timer); SYNC.timer=setTimeout(()=>syncNow(false), 1500); }
function syncDeleted(sc){ if(sc.owner && user && sc.owner===user.id){ SYNC.del.push(sc.id); saveSyncMem(); } }
function syncStart(){
  SYNC.ready=true;
  if(user) syncNow(true);
  document.addEventListener('visibilitychange',()=>{ if(!document.hidden && user && Date.now()-SYNC.lastPull>30000) syncNow(true); });
}
async function syncNow(pull){
  if(!sb || !user || !SYNC.ready) return;
  if(SYNC.busy){ SYNC.again=true; return; }
  SYNC.busy=true; SYNC.state='busy'; { const n=$('#syncNote'); if(n) n.textContent=syncText(); }
  try{
    if(pull) await syncPull();
    await syncPush();
    SYNC.state='ok'; SYNC.at=Date.now();
  }catch(e){
    console.warn('sync failed', e); SYNC.state='error';
    clearTimeout(SYNC.timer); SYNC.timer=setTimeout(()=>syncNow(true), 30000);
  }finally{
    SYNC.busy=false;
    const n=$('#syncNote'); if(n) n.textContent=syncText();
    if(SYNC.again){ SYNC.again=false; syncSoon(); }
  }
}
function afterSyncChange(){
  // keep localStorage/IndexedDB in step without re-stamping edit times
  persistScenesQuiet(); store.set('pv-progress', progress); store.set('pv-decks', decks);
  if(!scenes().some(x=>x.id===S.sceneId)){ S.sceneId='tea'; if(S.view==='play'){ S.view='home'; S.editing=false; } }
  if(S.view==='play'){ if(!S.editing){ renderScene(); refresh(); } } else renderGallery();
}
const setSig=(o,g)=>Object.defineProperty(o,'_sig',{value:g,writable:true,configurable:true,enumerable:false});
// scenes.meta (word-sheet details) needs supabase/2026-11-scene-meta.sql; without it sync carries on without them
let sceneMetaCol=true;
const noMetaCol=e=>!!e && (e.code==='42703' || e.code==='PGRST204' || /\bmeta\b/.test(String(e.message||'')));
function metaFrom(r){ const m=r && r.meta; return (m && typeof m==='object' && m.kind==='list') ? { meta:{ kind:'list', exam:/^\d{4}-\d{2}-\d{2}$/.test(m.exam||'')?m.exam:'', style:m.style==='meaning'?'meaning':'listen' } } : {}; }
async function syncPull(){
  const uid=user.id, mem=syncMem(uid);
  let changed=false;
  // scenes that belong to another account leave this device (they are safe in that account)
  for(const sc of customs.slice()) if(sc.owner && sc.owner!==uid){ customs.splice(customs.indexOf(sc),1); forgetSceneLocal(sc.id); delete progress[sc.id]; changed=true; }
  let { data:rows, error } = await sb.from('scenes').select('id,name,w,h,items,deleted,updated_at'+(sceneMetaCol?',meta':''));
  if(error && sceneMetaCol && noMetaCol(error)){ sceneMetaCol=false; ({ data:rows, error } = await sb.from('scenes').select('id,name,w,h,items,deleted,updated_at')); }
  if(error) throw error;
  const need=[];
  for(const r of rows||[]){
    const t=Date.parse(r.updated_at)||0, loc=customs.find(sc=>sc.id===r.id);
    if(r.deleted){
      if(loc && (loc.updatedAt||0)<=t){ customs.splice(customs.indexOf(loc),1); forgetSceneLocal(loc.id); delete progress[loc.id]; changed=true; }
      delete mem.scenes[r.id]; delete mem.img[r.id]; continue;
    }
    mem.img[r.id]=true;                                   // a row exists → its picture was uploaded first
    if(!loc){
      const sc={ id:r.id, name:r.name, w:r.w, h:r.h, items:r.items||{}, updatedAt:t, owner:uid, img:null, ...metaFrom(r) };
      setSig(sc, sigOf(sc)); customs.push(sc); mem.scenes[r.id]=sc._sig; need.push(sc); changed=true;
    } else if(t>(loc.updatedAt||0)){
      Object.assign(loc,{ name:r.name, w:r.w, h:r.h, items:r.items||{}, updatedAt:t, owner:uid });
      if(sceneMetaCol){ const mt=metaFrom(r); if(mt.meta) loc.meta=mt.meta; else delete loc.meta; }
      setSig(loc, sigOf(loc)); mem.scenes[r.id]=loc._sig;
      if(!loc.img){ need.push(loc); } else if(isList(loc)){ need.push(loc); }   // a sheet's picture is redrawn when its words change
      changed=true;
    } else {
      if(loc.owner!==uid){ loc.owner=uid; changed=true; }
      if(t===(loc.updatedAt||0)) mem.scenes[r.id]=sigOf(loc);
      if(!loc.img) need.push(loc);
    }
  }
  const { data:prows, error:e2 } = await sb.from('progress').select('scene_id,done,star,updated_at');
  if(e2) throw e2;
  for(const r of prows||[]){
    const t=Date.parse(r.updated_at)||0, lp=progress[r.scene_id];
    if(!lp || t>(lp.updatedAt||0)){ const np={ done:r.done||{}, star:r.star||{}, updatedAt:t }; setSig(np, progSig(np)); progress[r.scene_id]=np; mem.prog[r.scene_id]=np._sig; changed=true; }
    else if(t===(lp.updatedAt||0)) mem.prog[r.scene_id]=progSig(lp);
  }
  if(!SYNC.noDecks){ try{ if(await pullDecks(uid, mem)) changed=true; }catch(e){ deckSyncFailed(e); } }
  saveSyncMem(); SYNC.lastPull=Date.now();
  if(changed) afterSyncChange();
  if(need.length) downloadPictures(need);
}
async function pullDecks(uid, mem){
  let changed=false;
  for(const d of decks.slice()) if(d.owner && d.owner!==uid){ decks.splice(decks.indexOf(d),1); changed=true; }
  const { data:rows, error, status } = await sb.from('decks').select('id,name,words,deleted,updated_at');
  if(error){ error.status=status; throw error; }
  for(const r of rows||[]){
    const t=Date.parse(r.updated_at)||0, loc=getDeck(r.id), words=Array.isArray(r.words)?r.words.filter(x=>typeof x==='string'):[];
    if(r.deleted){
      if(loc && (loc.owner || r.id!==SAVED_DECK) && (loc.updatedAt||0)<=t){ decks.splice(decks.indexOf(loc),1); changed=true; }
      delete mem.decks[r.id]; continue;
    }
    if(!loc){ const d={ id:r.id, name:r.name||'', words, updatedAt:t, owner:uid }; dsig(d, deckSig(d)); decks.push(d); mem.decks[r.id]=d._sig; changed=true; }
    else if(!loc.owner && r.id===SAVED_DECK){
      // first sign-in on this device: keep words saved before signing in as well as the account's
      loc.words=[...new Set(words.concat(loc.words))]; loc.owner=uid; loc.updatedAt=Math.max(t, loc.updatedAt||0)+1; dsig(loc, deckSig(loc)); changed=true;
    }
    else if(t>(loc.updatedAt||0)){ Object.assign(loc,{ name:r.name||'', words, updatedAt:t, owner:uid }); dsig(loc, deckSig(loc)); mem.decks[r.id]=loc._sig; changed=true; }
    else { if(loc.owner!==uid){ loc.owner=uid; changed=true; } if(t===(loc.updatedAt||0)) mem.decks[r.id]=deckSig(loc); }
  }
  return changed;
}
async function pushDecks(uid, mem){
  for(const id of SYNC.delDecks.slice()){
    const { error, status } = await sb.from('decks').upsert({ user_id:uid, id, name:'', words:[], deleted:true, updated_at:new Date().toISOString() }, { onConflict:'user_id,id' });
    if(error){ error.status=status; throw error; }
    SYNC.delDecks=SYNC.delDecks.filter(x=>x!==id); delete mem.decks[id]; saveSyncMem();
  }
  const rows=[];
  for(const d of decks){
    if(d.owner && d.owner!==uid) continue;
    if(mem.decks[d.id]===deckSig(d) && d.owner===uid) continue;
    d.owner=uid;
    rows.push({ user_id:uid, id:d.id, name:String(d.name||'').slice(0,60), words:d.words, deleted:false, updated_at:new Date(d.updatedAt||Date.now()).toISOString() });
  }
  if(rows.length){
    const { error, status } = await sb.from('decks').upsert(rows, { onConflict:'user_id,id' });
    if(error){ error.status=status; throw error; }
    rows.forEach(r=>{ const d=getDeck(r.id); if(d) mem.decks[r.id]=deckSig(d); });
    store.set('pv-decks', decks);
  }
}
async function downloadPictures(list){
  const tok=await accessToken(); if(!tok) return;
  let got=0;
  for(const sc of list){
    try{
      const r=await fetch('/api/img/'+encodeURIComponent(sc.id), { headers:{ authorization:'Bearer '+tok } });
      if(!r.ok) continue;
      const blob=await r.blob();
      imgSaved.delete(sc.id);
      sc.img=await new Promise((res,rej)=>{ const fr=new FileReader(); fr.onload=()=>res(fr.result); fr.onerror=rej; fr.readAsDataURL(blob); });
      got++;
    }catch(e){}
  }
  if(got) afterSyncChange();
}
function dataUrlBlob(u){
  const i=u.indexOf(','), type=(u.slice(5,i).split(';')[0])||'image/jpeg', bin=atob(u.slice(i+1)), a=new Uint8Array(bin.length);
  for(let k=0;k<bin.length;k++) a[k]=bin.charCodeAt(k);
  return new Blob([a],{type});
}
async function syncPush(){
  const uid=user.id, mem=syncMem(uid), tok=await accessToken();
  if(!tok) return;
  // deletions first
  for(const id of SYNC.del.slice()){
    const { error } = await sb.from('scenes').update({ deleted:true, items:{}, updated_at:new Date().toISOString() }).eq('user_id',uid).eq('id',id);
    if(error) throw error;
    await sb.from('progress').delete().eq('user_id',uid).eq('scene_id',id);
    await fetch('/api/img/'+encodeURIComponent(id), { method:'DELETE', headers:{ authorization:'Bearer '+tok } }).catch(()=>{});
    SYNC.del=SYNC.del.filter(x=>x!==id); delete mem.scenes[id]; delete mem.img[id]; saveSyncMem();
  }
  // new or changed scenes (picture first, then the row)
  const rows=[];
  for(const sc of customs){
    if(sc.owner && sc.owner!==uid) continue;
    const g=sigOf(sc);
    if(mem.scenes[sc.id]===g && sc.owner===uid) continue;
    if(!mem.img[sc.id]){
      if(!sc.img) continue;                                   // picture not on this device (yet)
      const blob=dataUrlBlob(sc.img);
      const r=await fetch('/api/img/'+encodeURIComponent(sc.id), { method:'PUT', headers:{ authorization:'Bearer '+tok, 'content-type':blob.type }, body:blob });
      if(r.status===400 || r.status===413){ console.warn('picture not accepted', sc.id, r.status); continue; }
      if(!r.ok) throw new Error('upload '+r.status);
      mem.img[sc.id]=true; saveSyncMem();
    }
    sc.owner=uid;
    rows.push({ user_id:uid, id:sc.id, name:sc.name, w:sc.w, h:sc.h, items:sc.items||{}, image_path:`u/${uid}/${sc.id}`, deleted:false,
      updated_at:new Date(sc.updatedAt||Date.now()).toISOString(), meta:sc.meta||{} });
  }
  if(rows.length){
    let { error } = await sb.from('scenes').upsert(sceneMetaCol ? rows : rows.map(({meta,...r})=>r), { onConflict:'user_id,id' });
    if(error && sceneMetaCol && noMetaCol(error)){ sceneMetaCol=false; ({ error } = await sb.from('scenes').upsert(rows.map(({meta,...r})=>r), { onConflict:'user_id,id' })); }
    if(error) throw error;
    rows.forEach(r=>{ const sc=customs.find(x=>x.id===r.id); if(sc) mem.scenes[r.id]=sigOf(sc); });
    persistScenesQuiet();
  }
  // progress (the sample scene "tea" too)
  const prows=[];
  for(const [id,p] of Object.entries(progress)){
    if(!p || (id!=='tea' && !customs.some(sc=>sc.id===id && sc.owner===uid))) continue;
    const g=progSig(p); if(mem.prog[id]===g) continue;
    if(!Object.keys(p.done||{}).length && !Object.keys(p.star||{}).length && mem.prog[id]===undefined) continue;
    prows.push({ user_id:uid, scene_id:id, done:p.done||{}, star:p.star||{}, updated_at:new Date(p.updatedAt||Date.now()).toISOString() });
  }
  if(prows.length){
    const { error } = await sb.from('progress').upsert(prows, { onConflict:'user_id,scene_id' });
    if(error) throw error;
    prows.forEach(r=>{ mem.prog[r.scene_id]=progSig(progress[r.scene_id]); });
  }
  if(!SYNC.noDecks){ try{ await pushDecks(uid, mem); }catch(e){ deckSyncFailed(e); } }
  saveSyncMem();
}
function syncSignedOut(){
  // Signed out: this account's scenes leave this device (they stay in the account); unsynced ones stay.
  const mem=SYNC.mem; let changed=false;
  for(const sc of customs.slice()) if(sc.owner){ customs.splice(customs.indexOf(sc),1); forgetSceneLocal(sc.id); delete progress[sc.id]; changed=true; }
  for(const id of Object.keys(mem.prog||{})) if(progress[id]){ delete progress[id]; changed=true; }
  if(decks.some(d=>d.owner)){ decks=decks.filter(d=>!d.owner); changed=true; }
  SYNC.mem={}; SYNC.del=[]; SYNC.delDecks=[]; SYNC.at=0; SYNC.state='idle'; saveSyncMem();
  if(changed) afterSyncChange();
}

// ---------- layout updates ----------
const relayout=()=>{ updateTag(); updateOverlay(); positionQ(); };
// ---------- full screen (the scene fills the screen; tabs and controls stay) ----------
const FS_IN='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>', FS_OUT='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>';
const isFs=()=>document.body.classList.contains('fs');
function fitWrap(){
  const sc=scene(), r=sc.w/sc.h;
  if(!isFs()){ wrap.style.maxWidth=`calc(${isMobile()?56:86}vh * ${r})`; return; }
  const pv=$('#playView'), short=window.innerHeight<560 && window.innerWidth>window.innerHeight;
  if(document.body.classList.contains('fsside')!==short){ document.body.classList.toggle('fsside', short); renderSub(); renderChips(); }
  let availH, availW;
  const main=pv.querySelector('main');
  if(short){                                                   // landscape phone: picture left, controls in a side column
    const cs=getComputedStyle(pv);
    availH=window.innerHeight-parseFloat(cs.paddingTop)-parseFloat(cs.paddingBottom)-2;
    availW=main.clientWidth;
    // A tall picture leaves empty sides: offer "fill the width" (scroll up/down) — on by default — or "whole picture".
    const narrow=availH*r < availW*0.9;
    document.body.classList.toggle('fsnarrow', narrow);
    document.body.classList.toggle('fsfill', narrow && fsFill);
    const fb=$('#fillBtn'); fb.textContent = fsFill ? '🔲 ดูทั้งภาพ' : '↔️ ขยายเต็มจอ';
    fb.title = fsFill ? 'ย่อให้เห็นทั้งภาพในจอเดียว' : 'ขยายภาพให้เต็มความกว้าง แล้วเลื่อนขึ้นลงดู';
    requestAnimationFrame(fsCues);
    if(narrow && fsFill){
      if(!store.get('pv-fsfill-tip', false)){ store.set('pv-fsfill-tip', true); setTimeout(()=>toast('↕️ เลื่อนขึ้น-ลงเพื่อดูส่วนอื่นของภาพ · กด 🔲 ดูทั้งภาพ เพื่อย่อ', 4000), 600); }
      main.style.height=availH+'px';
      wrap.style.maxWidth=availW+'px';
      return;
    }
    main.style.height='';
  } else {
    main.style.height=''; document.body.classList.remove('fsnarrow','fsfill');
    // Height of everything except the picture (tabs, controls, word chips), measured from the boxes themselves:
    // #playView fills the screen, so its scrollHeight would include the picture's current size and it could never grow.
    const cs=getComputedStyle(pv); let other=0;
    for(const c of pv.children){
      const b=c.getBoundingClientRect(); if(!b.height) continue;
      if(c.contains(wrap)){ other+=b.height-wrap.getBoundingClientRect().height+8; continue; }   // e.g. word chips under the picture
      const m=getComputedStyle(c); other+=b.height+parseFloat(m.marginTop)+parseFloat(m.marginBottom);
    }
    availH=window.innerHeight-parseFloat(cs.paddingTop)-parseFloat(cs.paddingBottom)-other-6;
    availW=pv.clientWidth-parseFloat(cs.paddingLeft)-parseFloat(cs.paddingRight);
  }
  wrap.style.maxWidth=Math.max(120, Math.min(availW, Math.max(160,availH)*r))+'px';
}
var fsFill=store.get('pv-fsfill', true);
{ const m=$('#playView>main');
  const cue=dir=>{ const b=el('button',{type:'button',class:'fscue '+dir,'aria-label':dir==='up'?'เลื่อนขึ้น':'เลื่อนลง',title:dir==='up'?'เลื่อนขึ้น':'เลื่อนลง'}, dir==='up'?'▲':'▼');
    b.addEventListener('click',e=>{ e.stopPropagation(); m.scrollBy({ top:(dir==='up'?-1:1)*m.clientHeight*0.6, behavior:'smooth' }); }); return b; };
  m.prepend(cue('up')); m.append(cue('down'));
  m.addEventListener('scroll', fsCues, { passive:true });
}
$('#fillBtn').addEventListener('click', e=>{
  e.stopPropagation(); fsFill=!fsFill; store.set('pv-fsfill', fsFill);
  fitWrap(); requestAnimationFrame(()=>{ relayout(); const m=$('#playView>main'); m.scrollTop=Math.max(0,(m.scrollHeight-m.clientHeight)/2); });
});
// In full screen, also draw into the camera-notch strip (otherwise Android leaves a black bar); the padding keeps controls clear of it.
const vpMeta=document.querySelector('meta[name=viewport]'), vpBase=vpMeta ? vpMeta.content : '';
function setFsUi(on){
  document.body.classList.toggle('fs', on); if(!on){ document.body.classList.remove('fsside','fsnarrow','fsfill'); $('#playView>main').style.height=''; }
  if(vpMeta) vpMeta.content = on ? vpBase+', viewport-fit=cover' : vpBase;
  const b=$('#fsBtn'); b.innerHTML=on?FS_OUT:FS_IN; b.setAttribute('aria-label', on?'ออกจากเต็มจอ':'เต็มจอ'); b.title=b.getAttribute('aria-label');
  fitWrap(); requestAnimationFrame(()=>{ fitWrap(); relayout(); });
}
async function enterFs(){
  setFsUi(true);
  // Real full screen where the browser allows it (hides the address bar); otherwise the page-level layout above still applies (e.g. iPhone).
  const de=document.documentElement, req=de.requestFullscreen||de.webkitRequestFullscreen;
  if(req && !(document.fullscreenElement||document.webkitFullscreenElement)){
    try{ await req.call(de,{navigationUI:'hide'}); }catch(e){}
    // Phones: follow the phone when it is turned, even if auto-rotate is off in the phone's settings (Android Chrome).
    if(isMobile() && screen.orientation && screen.orientation.lock){ screen.orientation.lock('any').catch(()=>{}); }
  }
  const sc=scene();
  if(isMobile() && sc.w>sc.h*1.15 && window.innerHeight>window.innerWidth) toast('📱↻ หมุนโทรศัพท์เป็นแนวนอน ภาพจะใหญ่ขึ้น', 3000);
}
function exitFs(){
  if(document.fullscreenElement||document.webkitFullscreenElement){
    try{ (document.exitFullscreen||document.webkitExitFullscreen).call(document); }catch(e){}
  }
  try{ screen.orientation && screen.orientation.unlock && screen.orientation.unlock(); }catch(e){}
  setFsUi(false);
}
$('#fsBtn').addEventListener('click', e=>{ e.stopPropagation(); isFs()?exitFs():enterFs(); });
$('#fsExit').addEventListener('click', e=>{ e.stopPropagation(); exitFs(); });
['fullscreenchange','webkitfullscreenchange'].forEach(t=>document.addEventListener(t,()=>{
  // Leaving the browser's full screen (Esc, back gesture) also leaves our layout.
  if(!(document.fullscreenElement||document.webkitFullscreenElement) && isFs()) setFsUi(false);
}));
window.addEventListener('resize',()=>{ if(isFs()) fitWrap(); });
$('#fsBtn').innerHTML=FS_IN;
if(window.ResizeObserver) new ResizeObserver(relayout).observe(wrap); else window.addEventListener('resize',relayout);
if(document.fonts && document.fonts.ready) document.fonts.ready.then(relayout);

// ---------- start ----------
countOpen(); usageFlush();   // yesterday's counts (or the last visit's) go out now
store.set('pv-seen', 1);   // the landing page (/) sends people who have opened the app straight here
function openWelcome(){
  const first=String((navigator.languages&&navigator.languages[0])||navigator.language||'').toLowerCase();
  let ui=UI, target=/^en/.test(first) && LANGS.de ? 'de' : 'en';   // English speakers → German; everyone else → English
  openModal(m=>{
    const tl=el('div',{class:'langlist'});
    const drawT=()=>{ tl.innerHTML=''; Object.entries(LANGS).forEach(([k,L])=>tl.append(el('button',{type:'button',class:'langopt'+(k===target?' on':''),onclick:()=>{ target=k; drawT(); }},
      el('span',{class:'fl',text:L.flag}), el('span',{}, el('b',{text:langLabel(L)})), k===target ? el('span',{class:'ok',text:'✓'}) : null))); };
    drawT();
    const urw=uiRow(k=>{ ui=k; urw.querySelectorAll('.uiopt').forEach((b,i)=>b.classList.toggle('on', UI_LANGS[i][0]===ui)); });
    m.append(el('h3',{text:'👋 ยินดีต้อนรับสู่ Piccab'}),
      el('p',{class:'note',text:'ฝึกคำศัพท์จากภาพ: แตะสิ่งของในรูปเพื่อฟังและจำคำ'}),
      el('div',{class:'lbl',text:'ภาษาของฉัน'}), urw,
      el('div',{class:'lbl',text:'อยากฝึกภาษา'}), tl,
      el('p',{class:'note small',text:'เปลี่ยนได้ทุกเมื่อที่ปุ่มภาษาด้านบน'}),
      el('div',{class:'row'}, el('span',{class:'sp'}), el('button',{class:'primary',text:'เริ่มเลย ›',onclick:()=>{
        closeModal(); store.set('pv-lang', target);
        if(ui!==UI){ store.set('pv-ui',ui); location.reload(); return; }
        setLang(target);
      }})));
  });
}
MQ.addEventListener('change',()=>{ if(S.view==='play'){ renderScene(); refresh(); } });
boot().finally(()=>{
  if(!scenes().some(s=>s.id===S.sceneId)) S.sceneId='tea';
  fullRender();
  if(typeof syncStart==='function') syncStart();
  if(sharedLinkId) setTimeout(()=>openSharedLink(sharedLinkId), 150);
  else if(window.PV_UI_NEW && !location.search && !location.hash && !classLinkCode) setTimeout(openWelcome, 200);
  if(classLinkCode){ try{ history.replaceState(null,'','/app'); }catch(e){} setTimeout(()=>{ FR.tab='class'; goHome('class'); openJoinClass(classLinkCode); }, 400); }
  if(friendLinkCode) setTimeout(()=>openFriendLink(friendLinkCode), 1500);
  // Links from the landing page: /app?login, /app?install
  const lp=new URLSearchParams(location.search);
  if(lp.has('login') || lp.has('install')){
    try{ history.replaceState(null,'','/app'+location.hash); }catch(e){}
    if(lp.has('login')) setTimeout(()=>{ if(!user) openLogin(); }, 900);
    if(lp.has('install')) setTimeout(openInstallHelp, 900);
  }
  if(adminLinkWanted){ try{ history.replaceState(null,'','/app'); }catch(e){} setTimeout(()=>{ if(adminLinkWanted && !user){ adminLinkWanted=false; openLogin(); toast('เข้าสู่ระบบด้วยบัญชีผู้ดูแลก่อน', 4000); } }, 2500); }
});
})();
