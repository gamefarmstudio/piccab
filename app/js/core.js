// Piccab — Basics every other part uses: error reports, the sample scene, helpers ($, el, svg, store…), usage counts, languages, app state (S, G), speech, geometry. Imports nothing.

// Values that several parts change (one object, so any part can set them): scene focus, quiz state, decks, the open dialog, AI state…
export const G = {};

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
G.customs=store.get('pv-scenes2', null) || store.get('pv-scenes', []); if(!Array.isArray(G.customs)) G.customs=[];
let progress = store.get('pv-progress', {}); if(typeof progress!=='object'||!progress) progress={};
const S = { lang: langOk(store.get('pv-lang','en')) ? store.get('pv-lang','en') : 'en', view:'home', sceneId: store.get('pv-scene','tea'), mode:'learn', editing:false, showAll:false, allBoxes: !!store.get('pv-allboxes', false) };
G.hoverId=null; G.pinnedId=null; G.quizId=null; G.flash=null; G.flashT=null;
G.help={}; G.used={}; G.qMiss={};
G.find={queue:[],target:null,score:0,total:0,missed:false,showWord:false,lock:false};

const scenes=()=>BUILTIN.concat(G.customs);
const scene=()=>scenes().find(s=>s.id===S.sceneId)||BUILTIN[0];
const items=()=>itemsOf(scene());
// words that exist in the language being practised (all boxes while editing)
const ids=()=>{ const its=items(); return Object.keys(its).filter(k=>its[k] && (S.editing || its[k].word)); };
const normFor=(s,it)=> it && it.lang==='de' ? normDe(s) : norm(s);
// label while editing: a box without a word in this language shows "＋ (English word)"
const labelOf=it=> it.word || ('＋ '+((it.en!==undefined ? it.en : '') || (it.l && Object.values(it.l).map(x=>x&&x.w).find(Boolean)) || 'ใส่คำ'));
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

export { $, BUILTIN, HL, LANGS, LOC, MQ, NS, S, UI, anchor, artNote, box, check, chips, clampX, cleanLang, countOpen, el, errPage, foldDe, ic, ids, isMobile, itemIn, items, itemsOf, labelOf, langMap, langOk, lev, mean, norm, normFor, overlay, pk, progress, qcard, scene, scenes, shuffle, speak, store, sub, svg, tag, tally, thaiToday, toast, tx, usageFlush, wrap };
