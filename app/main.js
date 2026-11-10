// Piccab app: the entry point (built by Vite, see vite.config.js). Loads every part in order, then starts.
// Parts live in ./js/ — each one imports what it uses from the others. Values several parts change are on G (js/core.js).
import { G, countOpen, el, LANGS, MQ, S, scenes, store, toast, UI, usageFlush } from './js/core.js';
import { boot } from './js/progress.js';
import { closeModal, fullRender, goHome, langLabel, openModal, refresh, renderScene, setLang, UI_LANGS, uiRow } from './js/scene.js';
import './js/home.js';
import './js/decks.js';
import './js/games.js';
import './js/editor.js';
import './js/sheets.js';
import { openLogin, user } from './js/account.js';
import { classLinkCode, openJoinClass } from './js/classes.js';
import { FR, friendLinkCode, openFriendLink } from './js/friends.js';
import './js/admin.js';
import './js/gallery.js';
import { openSharedLink, sharedLinkId } from './js/share.js';
import { installUi, openInstallHelp } from './js/pwa.js';
import { syncStart } from './js/sync.js';
import './js/layout.js';

// ---------- start ----------
installUi();   // the install link on the home screen (needs the home screen, so it runs here)
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
  if(G.adminLinkWanted){ try{ history.replaceState(null,'','/app'); }catch(e){} setTimeout(()=>{ if(G.adminLinkWanted && !user){ G.adminLinkWanted=false; openLogin(); toast('เข้าสู่ระบบด้วยบัญชีผู้ดูแลก่อน', 4000); } }, 2500); }
});
