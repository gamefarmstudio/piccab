// Piccab — Friends (codes in person, no search, no chat).
import { G, $, el, HL, progress, S, store, toast } from './core.js';
import { ask, closeModal, goHome, openModal } from './scene.js';
import { days, dkey, streak } from './home.js';
import { deckCount, deckList, deckName, deckNameDialog, liveKeys } from './decks.js';
import { openLogin, user } from './account.js';
import { isStudent, openJoinClass, socialTabs, studentNick } from './classes.js';
import { copyLink, importShare, myShares, openImported, picturesUploaded, shareApi, shareErr, shareKey, shareLinkNative, sharePayload } from './share.js';
import { accessToken } from './sync.js';

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
  const mine=G.customs.filter(sc=>Object.keys(sc.items).length), live=liveKeys(), dks=deckList().filter(x=>!x.virtual && deckCount(x,live));
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

export { CHEER_TEXT, FR, ago2, badgeEl, friendLinkCode, loadFriends, openFriendLink, renderFriends, reportFriendStatsSoon, setSocialBadge };
