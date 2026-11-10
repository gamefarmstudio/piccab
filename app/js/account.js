// Piccab — Account (Supabase Auth, e-mail code) and the "not a robot" check (Turnstile).
import { G, $, el, ic, S, store, tally, thaiToday, toast, UI } from './core.js';
import { ask, closeModal, goHome, openModal, refresh } from './scene.js';
import { homeCredit, openFeedback, renderGallery } from './home.js';
import { aiCredits, aiMonthly, aiNeedCode, checkAI } from './editor.js';
import { CL, isStudent, openStudentAccount, renderClass, reportClassProgress, studentNick } from './classes.js';
import { FR, loadFriends, renderFriends, setSocialBadge } from './friends.js';
import { ADM, checkAdmin } from './admin.js';
import { openMyShares } from './share.js';
import { accessToken, SYNC, syncNow, syncSignedOut, syncText } from './sync.js';

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
G.capKey=null;                         // null = not known yet, '' = switched off
function captchaKey(){
  if(G.capKey!==null || !location.protocol.startsWith('http')) return Promise.resolve(G.capKey||'');
  return fetch('/api/health',{cache:'no-store'}).then(r=>r.ok?r.json():null).catch(()=>null).then(h=>{ G.capKey=(h && h.captcha) || ''; return G.capKey; });
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
    G.modalClose=()=>{ if(hc) hc.remove(); };
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
    G.modalClose=()=>{ clearInterval(timer); if(hc) hc.remove(); };
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
  G.aiLeft = (String(data.ai_credits_month) < thisMonth) ? Math.max(data.ai_credits, aiMonthly) : data.ai_credits;
  const n=$('#creditNote'); if(n) n.textContent=creditText();
  const hc=$('#homeCredit'); if(hc) hc.textContent=homeCredit();
}
const creditText=()=> typeof G.aiLeft==='number' ? `✨ เครดิต AI เดือนนี้: เหลือ ${G.aiLeft} / ${aiMonthly} ครั้ง` : '✨ เครดิต AI: กำลังโหลด…';
function askLoginForAI(){
  return new Promise(res=>{
    let ans=null; G.modalClose=()=>res(ans);
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
    if(!user && before){ G.aiLeft=null; CL.list=null; setTimeout(()=>syncSignedOut(),0); }
    // student accounts (room code + nickname) don't use AI; switch it back on after they sign out
    if(user && isStudent()){ if(G.aiReady){ G.aiReady=false; refresh(); if(S.view!=='play') renderGallery(); } }
    else if(!G.aiReady && typeof checkAI==='function') checkAI();
    if(S.view==='class') renderClass();
    if(event==='SIGNED_IN' && !$('#modal').hidden && $('#mbox .code')){ closeModal(); toast('✓ เข้าสู่ระบบแล้ว', 3000); }  // signed in via the e-mail link in another tab
  });
}
renderAcct();

export { askLoginForAI, authErr, capErr, creditText, humanCheck, loadCredits, oauthErr, openDeleteAccount, openLogin, sb, user };
