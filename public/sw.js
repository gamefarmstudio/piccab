// Piccab service worker: lets the app open and run without a connection.
//  - Pages (the landing pages / and /en/, the app /app, /privacy, /terms and their English /en/… versions): network first, so updates show up straight away;
//    the saved copy is used when offline or when the network takes too long.
//  - Static files (fonts, icons, supabase-js, CSS): served from the cache, refreshed in the background.
//  - English menus (/i18n/*): network first, like pages, so new words show up straight away.
//  - /api/* (AI, pictures, account) and other sites (Supabase): never cached — they always go to the network.
// Scenes, pictures and progress already live in the browser (localStorage / IndexedDB), so
// practising works offline; sync and AI resume when the connection is back.
const VERSION = 'piccab-v3';
const PAGES = ['/', '/app', '/privacy', '/terms', '/en', '/en/privacy', '/en/terms'];
const PAGE_URL = { '/en': '/en/' };   // fetched at this address (no redirect), saved under the page's key
const ASSETS = [
  '/vendor/supabase-2.119.0.js', '/fonts/fonts.css', '/legal.css', '/manifest.webmanifest',
  '/favicon.svg', '/favicon.ico', '/icon-192.png', '/icon-512.png', '/icon-maskable-192.png', '/icon-maskable-512.png', '/apple-touch-icon.png',
  '/fonts/sarabun-thai-400-normal.woff2', '/fonts/sarabun-thai-600-normal.woff2', '/fonts/sarabun-thai-700-normal.woff2',
  '/fonts/sarabun-latin-400-normal.woff2', '/fonts/sarabun-latin-600-normal.woff2', '/fonts/sarabun-latin-700-normal.woff2',
  '/fonts/fredoka-latin-500-normal.woff2', '/fonts/fredoka-latin-600-normal.woff2',
  '/i18n/en.js',
];
const NET_TIMEOUT = 4000;

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    // one failed file must not stop the install
    await Promise.all(PAGES.map(u => fetch(new Request(PAGE_URL[u] || u, { cache: 'reload' }))
      .then(r => { if (r.ok && !r.redirected) return c.put(u, r); }).catch(() => {})));
    await Promise.all(ASSETS.map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});

// "/index.html", "/privacy.html", "/?x=1" … share one saved copy each
function pageKey(url) {
  let p = url.pathname.replace(/\.html$/, '').replace(/\/index$/, '/');
  if (p !== '/' && p.endsWith('/')) p = p.slice(0, -1);
  return PAGES.includes(p) ? p : null;
}

async function pageFirstNetwork(req, key) {
  const c = await caches.open(VERSION);
  const net = fetch(req).then(res => {
    if (res.ok && !res.redirected) c.put(key, res.clone());
    return res;
  });
  const timeout = new Promise(r => setTimeout(r, NET_TIMEOUT, null));
  try {
    const res = await Promise.race([net, timeout]);
    if (res) return res;
  } catch (e) { /* offline */ }
  const saved = await c.match(key);
  if (saved) return saved;
  return net.catch(() => c.match('/app').then(r => r || new Response('ออฟไลน์อยู่ — เปิด Piccab ครั้งแรกต้องต่ออินเทอร์เน็ต\nYou\'re offline — open Piccab once with internet first', { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } })));
}

async function netFirst(req) {
  const c = await caches.open(VERSION);
  try {
    const res = await Promise.race([fetch(req), new Promise((_, no) => setTimeout(no, NET_TIMEOUT))]);
    if (res.ok) c.put(req, res.clone());
    return res;
  } catch (e) {
    return (await c.match(req, { ignoreSearch: true })) || Response.error();
  }
}

async function assetFromCache(req, e) {
  const c = await caches.open(VERSION);
  const saved = await c.match(req, { ignoreSearch: true });
  const net = fetch(req).then(res => { if (res.ok) c.put(req, res.clone()); return res; });
  if (saved) { e.waitUntil(net.catch(() => {})); return saved; }
  return net;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;           // Supabase, Google, … : straight to the network
  if (url.pathname.startsWith('/api/')) return;               // AI, pictures, account: never cached
  if (url.pathname === '/sw.js') return;
  const key = pageKey(url);                                   // only the app and the policy pages
  if (key && (req.mode === 'navigate' || req.destination === 'document')) { e.respondWith(pageFirstNetwork(req, key)); return; }
  if (url.pathname.startsWith('/i18n/')) { e.respondWith(netFirst(req)); return; }
  if (ASSETS.includes(url.pathname) || url.pathname.startsWith('/fonts/') || url.pathname.startsWith('/vendor/')) {
    e.respondWith(assetFromCache(req, e));
  }
});
