// Piccab — 🎮 game progress across devices: XP and level, streak days, badges, stickers, chests, today's quests,
// best stars, boss wins, word stats for the learning report. One row per account (Supabase game_state, own row only).
//
// Merging never counts anything twice: each number takes the larger of the two sides (days, answers per game,
// stickers, chests got / opened, bonus XP …), badges are joined, a word's first day is the earlier one.
// A child who plays on the tablet, then on the phone, ends up with the same totals on both. (If two devices are
// played at the very same time, the one that syncs second may miss a few of the other's points until it plays on.)
import { S, store } from './core.js';
import { reloadWordStats } from './progress.js';
import { reloadDays, renderGallery, streakPill } from './home.js';
import { reloadMatchBest } from './match.js';
import { reloadSentBest } from './sentence.js';
import { sb, user } from './account.js';
import { achCheck, lvPill } from './journey.js';
import { reloadBest } from './rounds.js';
import { reloadRewards } from './rewards.js';
import { sendReportSoon } from './report.js';

// local key → field in the account's row
const GS_KEYS={ days:'pv-days', wstat:'pv-wstat', ach:'pv-ach', best:'pv-best', stk:'pv-stk', chestc:'pv-chestc', dq:'pv-dq',
  bonusxp:'pv-bonusxp', boss:'pv-boss', timebest:'pv-timebest', sentbest:'pv-sentbest', stage:'pv-stage', matchbest:'pv-matchbest' };
const GS_LOCAL=new Set(Object.values(GS_KEYS));
var GS={ off:false, busy:false, again:false, timer:null, applying:false, at:0 };

const obj=v=>v && typeof v==='object' && !Array.isArray(v) ? v : {};
const num=v=>{ const n=+v; return Number.isFinite(n) && n>0 ? n : 0; };
const maxN=(a,b)=>Math.max(num(a), num(b));
// a → b, key by key, with f(aValue, bValue)
function byKey(a, b, f){ a=obj(a); b=obj(b); const o={}; for(const k of new Set([...Object.keys(a), ...Object.keys(b)])) o[k]=f(a[k], b[k]); return o; }
const MERGE={
  // a practice day: words answered, answers per game, minutes
  days:(a,b)=>byKey(a,b,(x,y)=>{ x=obj(x); y=obj(y); const o={ n:maxN(x.n,y.n) };
    const m=byKey(x.m,y.m,maxN); if(Object.keys(m).length) o.m=m;
    if(x.t||y.t) o.t=maxN(x.t,y.t); if(x.lm||y.lm) o.lm=maxN(x.lm,y.lm); return o; }),
  // a word: [times it needed help, day first passed]
  wstat:(a,b)=>byKey(a,b,(x,y)=>{ x=Array.isArray(x)?x:[0,0]; y=Array.isArray(y)?y:[0,0];
    const d=[num(x[1]),num(y[1])].filter(Boolean); return [Math.min(999,maxN(x[0],y[0])), d.length?Math.min(...d):0]; }),
  // badges earned (the earlier day) and the level last celebrated
  ach:(a,b)=>{ a=obj(a); b=obj(b); if(!a.earned && !b.earned) return null;
    return { earned:byKey(a.earned,b.earned,(x,y)=>{ const d=[num(x),num(y)].filter(Boolean); return d.length?Math.min(...d):0; }), lv:Math.max(1,maxN(a.lv,b.lv)) }; },
  // a round's best: more stars, then a higher score
  best:(a,b)=>byKey(a,b,(x,y)=>{ if(!x) return y; if(!y) return x; const w=(num(y.s)>num(x.s) || (num(y.s)===num(x.s) && num(y.p)>num(x.p))) ? y : x;
    return { ...w, c:maxN(x.c,y.c) }; }),
  stk:(a,b)=>byKey(a,b,maxN),
  chestc:(a,b)=>({ got:byKey(obj(a).got,obj(b).got,maxN), open:byKey(obj(a).open,obj(b).open,maxN) }),
  // today's quests: the newer day; the same day → the larger counts, quests done on either
  dq:(a,b)=>{ if(!a || !a.day) return b||null; if(!b || !b.day) return a; if(a.day!==b.day) return a.day>b.day ? a : b;
    const o={ ...a, ...b, done:{ ...obj(a.done), ...obj(b.done) }, claimed:!!(a.claimed||b.claimed), ids:a.ids||b.ids };
    for(const k of ['combo','rounds','s3','chests']) o[k]=maxN(a[k],b[k]); return o; },
  bonusxp:maxN, boss:maxN, timebest:maxN,
  sentbest:(a,b)=>byKey(a,b,(x,y)=>!x ? y : !y ? x : num(y.stars)>num(x.stars) ? y : x),
  // 🧩 match: the fastest time per set (ms) — the smaller one
  matchbest:(a,b)=>byKey(a,b,(x,y)=>{ const t=[num(x),num(y)].filter(Boolean); return t.length ? Math.min(...t) : 0; }),
  // the school year chosen: this device's choice, or the account's if none here
  stage:(a,b)=>a||b||'',
};
const EMPTY={ days:{}, wstat:{}, ach:null, best:{}, stk:{}, chestc:{got:{},open:{}}, dq:null, bonusxp:0, boss:0, timebest:0, sentbest:{}, stage:'', matchbest:{} };
function gsLocal(){ const o={}; for(const [f,k] of Object.entries(GS_KEYS)) o[f]=store.get(k, EMPTY[f]); return o; }
function gsMerge(a, b){ a=obj(a); b=obj(b); const o={}; for(const f of Object.keys(GS_KEYS)) o[f]=MERGE[f](a[f] ?? EMPTY[f], b[f] ?? EMPTY[f]); return o; }
// the same content, whatever order the keys came in
const stable=v=>Array.isArray(v) ? '['+v.map(stable).join(',')+']' : v && typeof v==='object' ? '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}' : JSON.stringify(v===undefined?null:v);
const same=(a,b)=>stable(a)===stable(b);

// write the merged state on this device and refresh what's on screen
function gsApply(d){
  GS.applying=true;
  try{
    for(const [f,k] of Object.entries(GS_KEYS)){ const v=d[f]; if(v==null || v==='') continue; store.set(k, v); }
  }finally{ GS.applying=false; }
  try{ reloadDays(); reloadWordStats(); reloadBest(); reloadRewards(); reloadSentBest(); reloadMatchBest(); }catch(e){ console.warn('game sync reload', e); }
  try{ achCheck(); }catch(e){}
  try{ lvPill(); streakPill(); }catch(e){}
  if(S.view!=='play') try{ renderGallery(); }catch(e){}
  try{ sendReportSoon(); }catch(e){}
}
// another account was signed in on this device before → its game progress (kept in that account) leaves this device
function gsResetLocal(){
  GS.applying=true;
  try{ for(const k of GS_LOCAL) try{ localStorage.removeItem(k); }catch(e){} }finally{ GS.applying=false; }
}
const missingTable=e=>!!e && (e.code==='PGRST205' || e.code==='42P01' || /game_state/.test(String(e.message||'')) && /does not exist|not find|no table/i.test(String(e.message||'')));
async function gsSync(){
  if(GS.off || !sb || !user) return;
  if(GS.busy){ GS.again=true; return; }
  GS.busy=true;
  try{
    const owner=store.get('pv-gs-owner',null);
    if(owner && owner!==user.id){ gsResetLocal(); gsApply(gsMerge({}, {})); }
    const { data, error } = await sb.from('game_state').select('data,updated_at').eq('user_id', user.id).maybeSingle();
    if(error){ if(missingTable(error)){ GS.off=true; console.warn('game_state table missing — run supabase/2026-11-game-state.sql'); return; } throw error; }
    const remote=data && data.data || {}, local=gsLocal(), merged=gsMerge(local, remote);
    if(!same(merged, gsMerge(local, {}))) gsApply(merged);
    if(!same(merged, gsMerge({}, remote))){
      const { error:e2 } = await sb.from('game_state').upsert({ user_id:user.id, data:merged, updated_at:new Date().toISOString() });
      if(e2){ if(missingTable(e2)){ GS.off=true; return; } throw e2; }
    }
    store.set('pv-gs-owner', user.id); GS.at=Date.now();
  }catch(e){ console.warn('game sync failed', e); }
  finally{
    GS.busy=false;
    if(GS.again){ GS.again=false; gsSoon(); }
  }
}
// after playing: send it a little later (many answers in a row → one write)
function gsSoon(){ if(GS.off || !user) return; clearTimeout(GS.timer); GS.timer=setTimeout(gsSync, 4000); }
store.hook=k=>{ if(!GS.applying && GS_LOCAL.has(k)) gsSoon(); };

export { gsSync };
