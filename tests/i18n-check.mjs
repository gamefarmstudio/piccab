// Lists any Thai text in the app that would still show in Thai with English menus.
//   npm ci --prefix tests && node tests/i18n-check.mjs   (also runs on every pull request)
// Fix a line it prints by adding the Thai → English pair to public/i18n/en.js.
import fs from 'fs';
const root=new URL('..', import.meta.url).pathname;
let acorn, walk;
try{ acorn=await import('acorn'); walk=await import('acorn-walk'); }
catch(e){ console.error('Needs acorn: npm ci --prefix tests'); process.exit(2); }
const html=fs.readFileSync(root+'app/app.html','utf8');
const main=fs.readFileSync(root+'app/main.js','utf8');   // the app's code (a module, built by Vite)
const TH=/[฀-๿]/;
const found=new Set();
const codes=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>[m[1],'script']).concat([[main,'module']]);
for(const [code,sourceType] of codes){
  walk.full(acorn.parse(code,{ecmaVersion:'latest',sourceType}), n=>{
    if(n.type==='Literal' && typeof n.value==='string' && TH.test(n.value)) found.add(n.value);
    if(n.type==='TemplateLiteral'){ const k=n.quasis.map(q=>q.value.cooked).reduce((a,q,i)=>a+(i?'{'+(i-1)+'}':'')+q,''); if(TH.test(k)) found.add(k); }
  });
}
const body=html.replace(/<script[\s\S]*?<\/script>/g,'').replace(/<style[\s\S]*?<\/style>/g,'');
for(const m of body.matchAll(/>([^<>]+)</g)){ const t=m[1].replace(/\s+/g,' ').trim(); if(TH.test(t)) found.add(t); }
for(const m of body.matchAll(/(?:placeholder|title|aria-label|alt)="([^"]*)"/g)) if(TH.test(m[1])) found.add(m[1]);
// load the translator without a browser
globalThis.window={confirm(){},alert(){},prompt(){}};
globalThis.document={documentElement:{nodeType:9},addEventListener(){},createTreeWalker(){return{nextNode(){return null}}}};
globalThis.MutationObserver=class{observe(){}}; globalThis.NodeFilter={SHOW_ELEMENT:1,SHOW_TEXT:4};
(0,eval)(fs.readFileSync(root+'public/i18n/en.js','utf8'));
// Thai on purpose: the sample scene's Thai meanings (English speakers see English), the "ไทย" choice, loading pictures
const TEA=main.match(/const TEA_ITEMS\s*=\s*\{[\s\S]*?\n\};/);
const keep=s=> /^ไทย$|กำลังโหลดรูป/.test(s) || (TEA && TEA[0].includes(JSON.stringify(s).slice(1,-1)));
const bad=[...found].filter(s=>!keep(s)).filter(s=>TH.test(window.PV_T(s.replace(/\{(\d)\}/g,(_,n)=>String(+n+2)))));
console.log(found.size+' Thai strings, '+bad.length+' not translated');
bad.forEach(s=>console.log('  '+JSON.stringify(s)));
process.exit(bad.length?1:0);
