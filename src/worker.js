// Piccab Worker: serves the static app from ./dist (built from app/ + public/) and adds a small AI API.
//
//   GET  /api/health  -> { ai: boolean, needCode: boolean }
//   POST /api/scan    -> { items: [{ word, th, alts, box:[x0,y0,x1,y1] }] }
//   GET|PUT|DELETE /api/img/<sceneId>  -> the signed-in user's scene picture in R2 (binding IMAGES)
//                      requires "Authorization: Bearer <Supabase access token>"; stored at u/<user id>/<sceneId>
//   POST   /api/share            -> (signed in) make or update a share link for a scene or a word deck: a snapshot
//                                   of the words + copies of the pictures at s/<share id>/<scene id> in R2
//   GET    /api/share/<id>       -> (anyone with the link) the shared scene(s) / deck — never the owner's e-mail
//   GET    /api/share/<id>/img/<sceneId> -> (anyone with the link) a shared picture
//   DELETE /api/share/<id>       -> (owner) remove the link and its picture copies
//   GET    /api/shares           -> (signed in) the user's own links
//   GET    /s/<id>               -> the app page, with link-preview tags (LINE, Facebook…) for that share
//                      The shares table has no public access: only this Worker (secret key) reads it, by id.
//   DELETE /api/account -> deletes the signed-in user's pictures (R2) and account (Supabase Auth admin;
//                      their rows in profiles/scenes/progress/decks go with it via "on delete cascade").
//                      Needs SUPABASE_SECRET_KEY.
//
// Secrets / variables (Cloudflare → Workers & Pages → piccab → Settings → Variables and Secrets).
// Set the key for at least one AI provider:
//   GEMINI_API_KEY     (secret)  key from aistudio.google.com (has a free tier)
//   ANTHROPIC_API_KEY  (secret)  key from console.anthropic.com
//   AI_PROVIDER        (text, optional)  "gemini" or "claude"; needed only when both keys are set (default: claude)
//                                        💎 Pro accounts always get Claude first when ANTHROPIC_API_KEY is set
//   GEMINI_MODEL       (text, optional)  one model or a comma-separated list tried in order when one is
//                      out of quota / busy; default gemini-3.6-flash,gemini-3.5-flash-lite
//   CLAUDE_MODEL       (text, optional)  defaults to claude-haiku-5-5 (cheapest); claude-sonnet-5-5 for harder pictures
//   CLAUDE_EFFORT      (text, optional)  low | medium | high | xhigh | max; unset = the model's default (medium on Haiku 5.5)
//   SCAN_CODE          (secret, optional) access code for using AI without signing in (testers)
//   SUPABASE_SECRET_KEY (secret, optional) Supabase secret key → signed-in users get monthly AI credits
//   AI_MONTHLY_CREDITS (text, optional)  credits per user per month (default 30)
//
// Who may scan:  signed in + SUPABASE_SECRET_KEY set → uses 1 credit (refunded if the scan fails);
//                otherwise SCAN_CODE (if set) is required; with neither set, AI is open to everyone.
//
// The prompt is built here on the server from a few validated options, so this
// endpoint cannot be used as a general-purpose proxy to an AI API.

import { pageHeaders } from './csp.js';
const DEFAULT_MODEL = 'claude-haiku-5-5';

// Supabase project (public values: the publishable key is meant for browsers; data is protected by RLS).
const SUPABASE_URL = 'https://oftzpfyydnmahkntucnj.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_R8bX28KY2kU5997XFqHelw_fqUvywBh';
const MAX_UPLOAD = 3 * 1024 * 1024;
const DEFAULT_MONTHLY_CREDITS = 30;
const monthlyCredits = env => clampInt(env.AI_MONTHLY_CREDITS, 0, 1000000, DEFAULT_MONTHLY_CREDITS);
const UPLOAD_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
// Tried in order; each model has its own free daily quota (20 and 500). gemini-3.8-flash is left out: in the
// November 2026 comparisons it took 90–110 s a picture (or timed out), too long for a child to wait.
const DEFAULT_GEMINI_MODELS = 'gemini-3.6-flash,gemini-3.5-flash-lite';
// Models that just ran out of quota are skipped for a while (per Worker instance; best effort).
const skipUntil = new Map();

// Which providers to use, in order. AI_PROVIDER can be one ("claude") or a list ("gemini,claude": Gemini's models first,
// Claude when all of them are out of quota or busy). Without a usable AI_PROVIDER: Claude if its key is set, otherwise Gemini.
export function pickProviders(env) {
  const has = p => (p === 'gemini' && !!env.GEMINI_API_KEY) || (p === 'claude' && !!env.ANTHROPIC_API_KEY);
  const want = [...new Set(String(env.AI_PROVIDER || '').toLowerCase().split(',').map(x => x.trim()))].filter(has);
  return want.length ? want : ['claude', 'gemini'].filter(has).slice(0, 1);
}
// 💎 Pro accounts: Claude first (the others after it, in case it's busy); everyone else keeps AI_PROVIDER's order
// (e.g. Gemini's free quota first, Claude when it runs out).
export function proProviders(env, providers) {
  if (!env.ANTHROPIC_API_KEY) return providers;
  return ['claude', ...providers.filter(p => p !== 'claude')];
}
// The first provider, or null when no key is set.
export function pickProvider(env) { return pickProviders(env)[0] || null; }
// One AI job on each provider in turn. The next one is tried only when this one is out of quota, busy or unavailable
// (429 / 5xx) — not when it answered but refused, or couldn't take the picture.
// schema: the shape of the answer, for Gemini's structured output (it then always answers in that shape).
async function runAI(env, providers, mime, data64, promptFor, parse, log, schema = null) {
  let res = error('not_configured', 503);
  for (const p of providers) {
    res = p === 'gemini' ? await scanGemini(env, mime, data64, promptFor(p), parse, log, schema) : await scanClaude(env, mime, data64, promptFor(p), parse, log);
    if (!(res.status === 429 || res.status >= 500)) return res;
  }
  return res;
}
const MAX_IMAGE_BYTES = 3_000_000; // base64 length limit (~2.2 MB image)
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

const LEVELS = {
  easy: 'beginner (CEFR A1–A2): very common everyday nouns',
  mid: 'intermediate (CEFR B1): everyday nouns plus some more specific names',
  hard: 'upper-intermediate (CEFR B2–C1): precise, specific names of objects and their parts',
};

export default {
  // 📧 the weekly summary to parents (cron in wrangler.jsonc)
  async scheduled(event, env, ctx) {
    ctx.waitUntil(weeklyDigest(env).then(r => console.log('weekly digest', JSON.stringify(r))).catch(e => console.log('weekly digest failed', e && e.message)));
  },
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/api/auth-email') return authEmail(request, env);
    if (url.pathname === '/api/health') {
      return json({ ai: !!pickProvider(env), needCode: !!env.SCAN_CODE, credits: !!env.SUPABASE_SECRET_KEY, monthly: monthlyCredits(env), captcha: String(env.TURNSTILE_SITE_KEY || '').trim() });
    }
    if (url.pathname === '/api/scan') {
      if (request.method !== 'POST') return error('method_not_allowed', 405);
      return scan(request, env);
    }
    if (url.pathname === '/api/wordlist') {
      if (request.method !== 'POST') return error('method_not_allowed', 405);
      return wordlist(request, env);
    }
    if (url.pathname === '/api/wordpics') {
      if (request.method !== 'POST') return error('method_not_allowed', 405);
      return wordpics(request, env);
    }
    if (url.pathname === '/api/sentences') {
      if (request.method !== 'POST') return error('method_not_allowed', 405);
      return sentences(request, env);
    }
    if (url.pathname === '/api/translate') {
      if (request.method !== 'POST') return error('method_not_allowed', 405);
      return translate(request, env);
    }
    if (url.pathname.startsWith('/api/img/')) return image(request, env, url);
    if (url.pathname === '/api/account') return deleteAccount(request, env);
    if (url.pathname === '/api/shares') return listShares(request, env);
    if (url.pathname === '/api/classes' || url.pathname.startsWith('/api/classes/')) return classes(request, env, url, ctx);
    if (url.pathname === '/api/friends' || url.pathname.startsWith('/api/friends/')) return friends(request, env, url, ctx);
    if (url.pathname === '/api/report/share') return reportShare(request, env, ctx);
    if (url.pathname === '/api/feedback') return feedback(request, env, ctx);
    if (url.pathname.startsWith('/api/email/')) return emailRoutes(request, env, url, ctx);
    if (url.pathname === '/api/gallery' || url.pathname.startsWith('/api/gallery/')) return galleryPublic(request, env, url);
    if (url.pathname.startsWith('/g/')) return galleryImage(request, env, url);
    if (url.pathname === '/api/log') return clientError(request, env);
    if (url.pathname === '/api/usage') return usage(request, env);
    if (url.pathname.startsWith('/api/admin/')) return admin(request, env, url);
    if (url.pathname === '/api/share' || url.pathname.startsWith('/api/share/')) return share(request, env, url);
    if (url.pathname.startsWith('/api/')) return error('not_found', 404);
    if (/^\/s\/[A-Za-z0-9]{8,16}\/?$/.test(url.pathname)) return sharePage(request, env, url);
    if (/^\/c\/[A-Za-z2-9]{6}\/?$/.test(url.pathname)) return classPage(request, env, url);
    if (url.pathname === '/admin' || url.pathname === '/admin/') return appPageWith(request, env, url, 'Piccab — ดูแลระบบ', 'Piccab');
    if (/^\/f\/[A-Za-z2-9]{8}\/?$/.test(url.pathname)) return pageLang(url) === 'en'
      ? appPageWith(request, env, url, 'Add a friend on Piccab', 'Someone invited you to be vocabulary practice friends on Piccab — tap to open')
      : appPageWith(request, env, url, 'เพิ่มเพื่อนบน Piccab', 'มีคนชวนคุณเป็นเพื่อนฝึกคำศัพท์อังกฤษบน Piccab — กดเพื่อเปิดแล้วยืนยัน');
    return env.ASSETS.fetch(request);
  },
};

// Who may use AI: a signed-in user with credits, a tester with the access code, or (if neither is set up) anyone.
// Returns { provider, uid, useCredits } or an error Response.
async function aiAccess(request, env) {
  let providers = pickProviders(env);
  if (!providers[0]) return error('not_configured', 503);
  const useCredits = !!env.SUPABASE_SECRET_KEY;
  const who = request.headers.get('authorization') ? await userInfo(request, env) : null;
  if (who && who.anon) return error('student_account', 403);       // students (no e-mail) don't use AI
  const uid = who ? who.uid : null;
  const pro = !!(who && useCredits && env.ANTHROPIC_API_KEY && (await proOf(env, who)).pro);
  if (pro) providers = proProviders(env, providers);
  if (!(uid && useCredits)) {
    const code = (request.headers.get('x-piccab-code') || '').trim();
    if (env.SCAN_CODE) {
      if (!code && useCredits) return error('login_required', 401);
      if (!safeEqual(code, String(env.SCAN_CODE).trim())) return error('bad_code', 401);
    } else if (useCredits) return error('login_required', 401);
  }
  if (env.SCAN_LIMITER) {
    const ip = request.headers.get('cf-connecting-ip') || 'unknown';
    try {
      const { success } = await env.SCAN_LIMITER.limit({ key: ip });
      if (!success) return error('rate_limited', 429);
    } catch (e) { /* limiter unavailable: continue */ }
  }
  return { provider: providers[0], providers, uid, useCredits, pro };
}
// Takes one credit, runs the AI call, gives the credit back if it didn't work.
async function withCredit(env, acc, run) {
  let left = null;
  if (acc.uid && acc.useCredits) {
    try { left = await creditRpc(env, 'use_ai_credit', { p_user: acc.uid, p_monthly: monthlyCredits(env) }); }
    catch (e) { console.log('credit check failed', String(e)); return error('busy', 503); }
    if (typeof left !== 'number' || left < 0) return error('no_credits', 402);
  }
  const res = await run();
  if (left === null) return res;
  if (res.status !== 200) {
    try { left = await creditRpc(env, 'refund_ai_credit', { p_user: acc.uid }); } catch (e) { console.log('refund failed', String(e)); }
    return withField(res, 'credits_left', typeof left === 'number' ? left : undefined);
  }
  return withField(res, 'credits_left', left);
}

async function scan(request, env) {
  const acc = await aiAccess(request, env);
  if (acc instanceof Response) return acc;

  let body;
  try { body = await request.json(); } catch (e) { return error('bad_request', 400); }

  const m = /^data:([a-z/+-]+);base64,([A-Za-z0-9+/=]+)$/.exec(String(body.image || ''));
  if (!m || !IMAGE_TYPES.includes(m[1])) return error('bad_image', 400);
  if (m[2].length > MAX_IMAGE_BYTES) return error('image_too_large', 413);

  const count = clampInt(body.count, 5, 30, 20);
  const level = LEVELS[body.level] ? body.level : 'mid';
  const existing = (Array.isArray(body.existing) ? body.existing : [])
    .filter(w => typeof w === 'string')
    .map(w => w.replace(/[^\p{L}\p{N} '\-]/gu, '').trim().slice(0, 40))
    .filter(Boolean)
    .slice(0, 80);

  // also give the words in the other languages this learner practises (e.g. German), at no extra cost
  const langs = [...new Set([].concat(Array.isArray(body.langs) ? body.langs : [], body.lang || []))].filter(l => AI_LANGS[l]).slice(0, 3);
  // Take one credit now; give it back if the scan doesn't produce a result.
  const log = [];
  return withCredit(env, acc, async () => {
    const res = await runAI(env, acc.providers, m[1], m[2], p => buildPrompt(count, level, existing, p, langs), parseItems, log, itemsSchema(langs));
    await saveUsage(env, 'scan', log);
    return res;
  });
}

// POST /api/wordlist {image} -> {items:[{w, th}]}: reads a teacher's vocabulary sheet (dictation list) from a photo.
// One AI credit, like a scan; the photo is only read, not kept.
async function wordlist(request, env) {
  const acc = await aiAccess(request, env);
  if (acc instanceof Response) return acc;
  let body;
  try { body = await request.json(); } catch (e) { return error('bad_request', 400); }
  const m = /^data:([a-z/+-]+);base64,([A-Za-z0-9+/=]+)$/.exec(String(body.image || ''));
  if (!m || !IMAGE_TYPES.includes(m[1])) return error('bad_image', 400);
  if (m[2].length > MAX_IMAGE_BYTES) return error('image_too_large', 413);
  const log = [];
  return withCredit(env, acc, async () => {
    const res = await runAI(env, acc.providers, m[1], m[2], () => buildWordlistPrompt(), parseWordlist, log);
    await saveUsage(env, 'wordlist', log);
    return res;
  });
}
// POST /api/sentences {words:[{w, th}], image?, kind:'scene'|'list'} -> {items:[{en, th, words}]}:
// sentences for the ✍️ sentence game, for a scene of your own (about its picture) or a word sheet (example sentences).
// One AI credit, like a scan; nothing is kept here.
async function sentences(request, env) {
  const acc = await aiAccess(request, env);
  if (acc instanceof Response) return acc;
  let body;
  try { body = await request.json(); } catch (e) { return error('bad_request', 400); }
  const words = [], seen = new Set();
  for (const r of Array.isArray(body.words) ? body.words : []) {
    const w = String((r && r.w) || '').replace(/[^\p{L}\p{N} '\-.]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
    if (!w || w.replace(/[^A-Za-z]/g, '').length < 2 || seen.has(w.toLowerCase())) continue;
    seen.add(w.toLowerCase());
    words.push({ w, th: String((r && r.th) || '').replace(/[\u0000-\u001f"\\]/g, '').trim().slice(0, 60) });
    if (words.length >= 60) break;
  }
  if (words.length < 2) return error('too_few_words', 400);
  let mime = null, data64 = null;
  if (body.image) {
    const m = /^data:([a-z/+-]+);base64,([A-Za-z0-9+/=]+)$/.exec(String(body.image));
    if (!m || !IMAGE_TYPES.includes(m[1])) return error('bad_image', 400);
    if (m[2].length > MAX_IMAGE_BYTES) return error('image_too_large', 413);
    mime = m[1]; data64 = m[2];
  }
  const log = [];
  return withCredit(env, acc, async () => {
    const res = await runAI(env, acc.providers, mime, data64, () => buildSentencesPrompt(words, !!mime), parseSentences, log);
    await saveUsage(env, 'sentences', log);
    return res;
  });
}
export function buildCefrPrompt(words) {
  return `For each English word or phrase below, give its CEFR level for learners of English, as in learner's dictionaries:
"preA1" for the very first words young children learn (colours, numbers, family, toys, pets, everyday food, body parts, simple actions like run and jump), otherwise "A1", "A2", "B1", "B2", "C1" or "C2". For a phrase, give the level of the whole phrase.
Reply with only a JSON object from each word exactly as given to its level, like {"cat":"preA1","library":"A1","get dressed":"A1"}.
Words: ${words.join(', ')}`;
}
// The AI's levels: {"cat":"A1"}, or a list like [{"word":"cat","level":"A1"}], or either wrapped in one more object.
export function parseCefr(text) {
  const s = String(text || '');
  let o = null;
  for (const [x, y] of [['{', '}'], ['[', ']']]) {
    const a = s.indexOf(x), b = s.lastIndexOf(y);
    if (o == null && a >= 0 && b > a) { try { o = JSON.parse(s.slice(a, b + 1)); } catch (e) { o = null; } }
  }
  const out = {};
  const take = v => {
    if (Array.isArray(v)) { for (const r of v) if (r && typeof r === 'object') { const w = r.word || r.w || r.term, c = cleanCefr(r.cefr || r.level || r.cefr_level); if (w && c) out[String(w).trim().toLowerCase()] = c; } return; }
    if (!v || typeof v !== 'object') return;
    for (const [k, x] of Object.entries(v)) {
      const c = cleanCefr(typeof x === 'object' && x ? (x.cefr || x.level) : x);
      if (c) out[String(k).trim().toLowerCase()] = c; else if (x && typeof x === 'object') take(x);
    }
  };
  take(o);
  return Object.keys(out).length ? out : null;
}
export function buildSentencesPrompt(words, picture) {
  const list = words.map(x => x.w + (x.th ? ` (${x.th})` : '')).join(', ');
  const rules = `For Thai children learning English (A1-A2 level): present simple or present continuous, 4 to 10 words each, correct and natural.
Vary the sentence patterns; do not start more than two sentences the same way, and do not use "We can see".
Keep everything friendly and suitable for children: everyday life, family, school, play and food. Nothing scary, violent or sad, no real people's names, no brands.
"th" is the natural everyday Thai meaning, not word-for-word. "words" lists the words from the list that are used in the sentence.
Reply with a JSON array only, no other text, like [{"en":"The boy is eating a banana.","th":"เด็กผู้ชายกำลังกินกล้วย","words":["banana"]}].`;
  return picture
    ? `This picture is used in a vocabulary app; these are the words for things in it: ${list}.
Write 6 to 8 short sentences about what is happening in the picture. Each sentence uses at least one word from the list, and only describes what can really be seen.
${rules}`
    : `These are English words a child has to learn: ${list}.
Write 8 short example sentences (fewer if there are fewer words) that show how the words are used. Each sentence uses at least one word from the list, exactly as written or as its plural; use as many different words as you can.
${rules}`;
}
export function parseSentences(text) {
  const s = String(text || ''), a = s.indexOf('['), b = s.lastIndexOf(']');
  if (a < 0 || b <= a) return null;
  let arr;
  try { arr = JSON.parse(s.slice(a, b + 1)); } catch (e) { return null; }
  const out = cleanGallerySentences(arr).filter(r => { const n = r.en.split(/\s+/).length; return n >= 3 && n <= 14 && /[A-Za-z]/.test(r.en); });
  return out.length ? out : null;
}
// ---------- 🎨 line pictures for word sheets ----------
// A small line drawing (SVG, viewBox 0 0 100 100) for each word, written by the text AI (no image model).
// Kept in a shared bank (word_pics) so each word is drawn once for everyone; only words not in the bank use AI.
// Everything the AI writes is rebuilt from a short allow-list below — no scripts, links, styles or text other than digits.
const SVG_TAGS = new Set(['g', 'path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon', 'text', 'tspan']);
const svgNum = (lo, hi) => v => /^-?\d{1,4}(\.\d{1,3})?$/.test(v) && +v >= lo && +v <= hi;
const svgColor = v => /^(none|#[0-9a-fA-F]{3}|#[0-9a-fA-F]{6})$/.test(v);
const SVG_ATTRS = {
  d: v => /^[MmLlHhVvCcSsQqTtAaZz0-9.,\s-]{1,1600}$/.test(v), points: v => /^[0-9.,\s-]{1,600}$/.test(v),
  cx: svgNum(-50, 150), cy: svgNum(-50, 150), r: svgNum(0, 100), rx: svgNum(0, 100), ry: svgNum(0, 100), x: svgNum(-50, 150), y: svgNum(-50, 150),
  width: svgNum(0, 150), height: svgNum(0, 150), dx: svgNum(-100, 100), dy: svgNum(-100, 100), x1: svgNum(-50, 150), y1: svgNum(-50, 150), x2: svgNum(-50, 150), y2: svgNum(-50, 150),
  'stroke-width': svgNum(0, 20), fill: svgColor, stroke: svgColor, opacity: svgNum(0, 1), 'fill-opacity': svgNum(0, 1), 'stroke-opacity': svgNum(0, 1),
  'stroke-linecap': v => /^(round|butt|square)$/.test(v), 'stroke-linejoin': v => /^(round|miter|bevel)$/.test(v),
  'stroke-dasharray': v => /^[\d.\s,]{1,30}$/.test(v), 'text-anchor': v => /^(start|middle|end)$/.test(v),
  'font-size': svgNum(4, 70), 'font-family': v => /^(sans-serif|Arial, sans-serif)$/.test(v), 'font-weight': v => /^(400|500|600|700|bold|normal)$/.test(v),
  transform: v => /^((translate|rotate|scale)\(\s*-?[\d.]+(\s*[\s,]\s*-?[\d.]+){0,2}\s*\)\s*){1,3}$/.test(v),
};
export function cleanSvg(src) {
  const s = String(src || '').slice(0, 8000), out = [], open = [];
  let skip = 0, n = 0, inText = false;
  const re = /<!--[\s\S]*?-->|<\s*(\/?)\s*([a-zA-Z][\w:-]*)([^<>]*?)(\/?)\s*>|([^<>]+)/g;
  let m;
  while ((m = re.exec(s))) {
    if (m[0].startsWith('<!--')) continue;
    if (m[5] !== undefined) {                                   // text between tags: only digits and maths signs, inside <text>
      const t = m[5].trim();
      if (!skip && inText && t && /^[0-9+\-×÷=.,%½¼¾ ]{1,13}$/.test(t)) out.push(t);
      continue;
    }
    const close = m[1] === '/', tag = m[2].toLowerCase(), selfClose = m[4] === '/';
    if (tag === 'svg') continue;
    if (!SVG_TAGS.has(tag)) { if (!selfClose) skip += close ? -1 : 1; if (skip < 0) skip = 0; continue; }
    if (skip) continue;
    if (close) { const i = open.lastIndexOf(tag); if (i >= 0) { while (open.length > i) { const t = open.pop(); out.push(`</${t}>`); if (t === 'text') inText = false; } } continue; }
    if (++n > 40) break;
    const attrs = [];
    for (const a of m[3].matchAll(/([a-zA-Z][a-zA-Z0-9-]*)\s*=\s*("([^"]*)"|'([^']*)')/g)) {
      const k = a[1].toLowerCase(), v = (a[3] ?? a[4] ?? '').trim();
      if (SVG_ATTRS[k] && SVG_ATTRS[k](v)) attrs.push(`${k}="${v}"`);
    }
    if (tag === 'text') { if (!attrs.some(x => x.startsWith('fill='))) attrs.push('fill="#2d2a5a"'); if (!attrs.some(x => x.startsWith('stroke='))) attrs.push('stroke="none"'); if (!attrs.some(x => x.startsWith('font-size='))) attrs.push('font-size="30"'); if (!attrs.some(x => x.startsWith('text-anchor='))) attrs.push('text-anchor="middle"'); if (!attrs.some(x => x.startsWith('font-family='))) attrs.push('font-family="Arial, sans-serif"'); }
    out.push(`<${tag}${attrs.length ? ' ' + attrs.join(' ') : ''}${selfClose ? '/>' : '>'}`);
    if (!selfClose) { open.push(tag); if (tag === 'text') inText = true; }
  }
  while (open.length) out.push(`</${open.pop()}>`);
  const body = out.join('');
  if (!/<(path|circle|ellipse|rect|line|polyline|polygon)\b/.test(body) && !/>[0-9+\-×÷=.,%½¼¾ ]+<\/(text|tspan)>/.test(body)) return '';   // a drawing, or digits (e.g. "100")
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none" stroke="#2d2a5a" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
  return svg.length <= 4000 ? svg : '';
}
// "one hundred" → 100, "twenty-five" → 25, "one million" → 1000000 (null if it isn't a number word)
const NUM_W = { zero:0, one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9, ten:10, eleven:11, twelve:12, thirteen:13, fourteen:14, fifteen:15,
  sixteen:16, seventeen:17, eighteen:18, nineteen:19, twenty:20, thirty:30, forty:40, fifty:50, sixty:60, seventy:70, eighty:80, ninety:90 };
export function numberOf(w) {
  const ws = String(w || '').toLowerCase().replace(/-/g, ' ').replace(/\band\b/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (!ws.length || ws.length > 8) return null;
  let total = 0, cur = 0, any = false;
  for (const x of ws) {
    if (x === 'a' && !any) { cur = 1; continue; }
    if (x in NUM_W) { cur += NUM_W[x]; any = true; }
    else if (x === 'hundred') { cur = (cur || 1) * 100; any = true; }
    else if (x === 'thousand' || x === 'million' || x === 'billion') { total += (cur || 1) * { thousand:1e3, million:1e6, billion:1e9 }[x]; cur = 0; any = true; }
    else return null;
  }
  return any ? total + cur : null;
}
export function numberPic(w) {
  const n = numberOf(w); if (n === null) return '';
  const t = n.toLocaleString('en-US'), fs = t.length <= 3 ? 42 : t.length <= 5 ? 28 : t.length <= 7 ? 22 : 16;
  return cleanSvg(`<svg viewBox="0 0 100 100"><rect x="8" y="22" width="84" height="56" rx="12"/><text x="50" y="${50 + Math.round(fs * 0.36)}" font-size="${fs}" font-weight="600">${t}</text></svg>`);
}
export const picKey = w => String(w || '').toLowerCase().replace(/[^a-z0-9' -]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
export function buildPicsPrompt(words) {
  return `You draw tiny, very simple line icons for a vocabulary app for Thai children (6–12 years old).
For each English word or phrase below, draw ONE clear picture a child would recognise, as an SVG.

Rules for every SVG:
- viewBox="0 0 100 100"; keep the drawing inside 8..92
- line art only: stroke="#2d2a5a" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none"
- you may fill at most 2 small shapes with ONE accent colour from: #f2683a #23915a #ffc928 #5b4fc4 #ef5a78 #3fa7f5
- only these elements: g, path, circle, ellipse, rect, line, polyline, polygon (and <text> only for digits or maths signs, e.g. "100", "+", "½")
- integers only, at most 14 elements, under 700 characters, no comments
- never write letters or words in the picture
- abstract words: use a familiar symbol or a tiny scene (e.g. "past": a clock with an arrow going back; "minus": a big minus sign; "equals": two lines)
- verbs: a simple stick figure doing the action
- nothing scary, violent or unsuitable for children

Words:
${words.map((w, i) => `${i + 1}. ${w}`).join('\n')}

Reply with a JSON array only, in the same order, like [{"w":"apple","svg":"<svg viewBox=\"0 0 100 100\">…</svg>"}].`;
}
export function parsePics(text) {
  const s = String(text || ''), a = s.indexOf('['), b = s.lastIndexOf(']');
  if (a < 0 || b <= a) return null;
  let arr; try { arr = JSON.parse(s.slice(a, b + 1)); } catch (e) { return null; }
  if (!Array.isArray(arr)) return null;
  const out = arr.map(r => r && typeof r === 'object' ? { w: picKey(r.w), svg: cleanSvg(r.svg) } : null).filter(r => r && r.w && r.svg);
  return out.length ? out : null;
}
const PICS_PER_CALL = 12;
async function picBank(env, keys) {
  if (!keys.length) return {};
  const r = await q(env, `word_pics?word=in.(${keys.map(k => `"${k.replace(/"/g, '')}"`).join(',')})&select=word,svg`) || [];
  return Object.fromEntries(r.map(x => [x.word, x.svg]));
}
// POST /api/wordpics {words:[...], draw, redraw}
//   draw false: what the bank already has (no sign-in, no credit)
//   draw true: AI draws the words not in the bank — 1 credit for the whole sheet; 0 if the bank has them all
//   redraw true (one word): a new drawing for that word, free (rate-limited); the bank keeps its first one
// A free second try: when a paid drawing leaves words without a picture, the answer carries a signed note
// (who, which words, which day). Sending it back within 7 days draws those words again without a credit.
async function picRetrySig(env, who, words, day) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('piccab-pics:' + (env.SUPABASE_SECRET_KEY || env.SCAN_CODE || 'dev')), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${who}|${day}|${[...words].sort().join(',')}`));
  return [...new Uint8Array(mac)].slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join('');
}
export async function picRetryToken(env, who, words) {
  const day = Math.floor(Date.now() / 86400000);
  return `${day}.${[...words].sort().join(',')}.${await picRetrySig(env, who, words, day)}`;
}
export async function picRetryOk(env, who, token, keys) {
  const m = /^(\d{5})\.(.{1,4000})\.([0-9a-f]{32})$/.exec(String(token || ''));
  if (!m) return false;
  const day = +m[1], words = m[2].split(','), now = Math.floor(Date.now() / 86400000);
  if (now - day > 7 || day > now) return false;
  if (!keys.every(k => words.includes(k))) return false;
  return m[3] === await picRetrySig(env, who, words, day);
}
async function wordpics(request, env) {
  let body; try { body = await request.json(); } catch (e) { return error('bad_request', 400); }
  const keys = [...new Set((Array.isArray(body.words) ? body.words : []).map(picKey).filter(k => k && /[a-z]/.test(k)))].slice(0, 60);
  if (!keys.length) return error('bad_request', 400);
  let pics = {};
  if (env.SUPABASE_SECRET_KEY) { try { pics = await picBank(env, keys); } catch (e) { if (e.status !== 404) throw e; } }
  const redraw = body.redraw === true && keys.length === 1;
  for (const k of keys) if (!pics[k] && !redraw) { const p = numberPic(k); if (p) pics[k] = p; }   // number words: drawn here, free
  const missing = redraw ? keys : keys.filter(k => !pics[k]);
  if (body.draw !== true || !missing.length) return json({ pics, missing });
  const acc = await aiAccess(request, env); if (acc instanceof Response) return acc;
  const who = acc.uid || 'code';
  const free = redraw || (body.retry && await picRetryOk(env, who, body.retry, missing));
  const draw = async () => {
    const log = [], got = {};
    const parts = []; for (let i = 0; i < missing.length; i += PICS_PER_CALL) parts.push(missing.slice(i, i + PICS_PER_CALL));
    const rs = await Promise.all(parts.map(ws => runAI(env, acc.providers, null, null, () => buildPicsPrompt(ws), parsePics, log).then(r => r.status === 200 ? r.json() : null).catch(() => null)));
    rs.forEach((r, i) => (r && r.items || []).forEach(x => { if (parts[i].includes(x.w)) got[x.w] = x.svg; }));
    const again = missing.filter(k => !got[k]);                  // one more try for the ones that didn't come back (same credit)
    if (again.length && again.length < missing.length) {
      const r = await runAI(env, acc.providers, null, null, () => buildPicsPrompt(again), parsePics, log).then(r => r.status === 200 ? r.json() : null).catch(() => null);
      (r && r.items || []).forEach(x => { if (again.includes(x.w)) got[x.w] = x.svg; });
    }
    await saveUsage(env, 'pics', log);
    if (!Object.keys(got).length) return error('ai_failed', 502);
    if (env.SUPABASE_SECRET_KEY) {
      const rows = Object.entries(got).filter(([k]) => !pics[k]).map(([word, svg]) => ({ word, svg }));   // (number words are drawn here each time; not kept)
      if (rows.length) await q(env, 'word_pics?on_conflict=word', { method: 'POST', headers: { prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify(rows) }).catch(e => console.log('word_pics save', String(e)));
    }
    const left = missing.filter(k => !got[k]);
    return json({ pics: { ...pics, ...got }, missing: left, drawn: Object.keys(got).length, ...(left.length && !redraw ? { retry: await picRetryToken(env, who, left) } : {}) });
  };
  return free ? draw() : withCredit(env, acc, draw);
}
export function buildWordlistPrompt() {
  return `This is a photo of a vocabulary list that a teacher in Thailand gave to students to learn for a spelling / dictation test (a worksheet, a page in a notebook, a whiteboard or a screen). It may be printed or handwritten.

List the English vocabulary items to learn, in the order they appear. For each give:
- "w": the English word or short phrase exactly as the teacher wrote it (keep their spelling; only fix letters that were clearly misread), lower case unless it is a name, without numbering, word class tags like (n.) or (v.), or example sentences
- "th": the Thai meaning written next to it on the sheet; if there is none, give a short, common Thai meaning a dictionary would give

Leave out headings, instructions, dates, page numbers, scores, and any names of students, teachers or schools. At most 60 items. If you cannot find a vocabulary list, reply with [].
Reply with a JSON array only, no other text, like [{"w":"apple","th":"แอปเปิล"}].`;
}
export function parseWordlist(text) {
  const s = String(text || '');
  const a = s.indexOf('['), b = s.lastIndexOf(']');
  if (a < 0) return null;
  let arr;
  try { if (b <= a) throw 0; arr = JSON.parse(s.slice(a, b + 1)); } catch (e) { return null; }
  if (!Array.isArray(arr)) return null;
  const seen = new Set(), out = [];
  for (const r of arr) {
    if (!r || typeof r.w !== 'string') continue;
    const w = r.w.replace(/^\s*\d+\s*[.)]\s*/, '').replace(/\((?:n|v|adj|adv|prep|conj|pron|int|phr)\.?\)/gi, ' ').replace(/[^\p{L}\p{N} '\-.]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
    if (!w || !/[A-Za-z]/.test(w) || seen.has(w.toLowerCase())) continue;
    seen.add(w.toLowerCase());
    out.push({ w, th: String(r.th || '').replace(/[\u0000-\u001f"\\]/g, '').trim().slice(0, 80) });
    if (out.length >= 60) break;
  }
  return out;
}

// Languages the AI can add next to English. German nouns come with their article.
const AI_LANGS = { de: 'German' };
// POST /api/translate {lang, words:[{k, en, th}]} -> {items:[{k, w, a, alts}]}
// Words only (no picture) and small, so it uses no AI credit: the app calls it by itself when a scene lacks a language.
// Same gate as scans (signed in, or the access code; students can't) and the same per-IP rate limit.
async function translate(request, env) {
  const acc = await aiAccess(request, env);
  if (acc instanceof Response) return acc;
  let body;
  try { body = await request.json(); } catch (e) { return error('bad_request', 400); }
  const lang = AI_LANGS[body.lang] ? body.lang : null;
  if (!lang) return error('bad_request', 400);
  const words = (Array.isArray(body.words) ? body.words : [])
    .filter(w => w && typeof w.k === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(w.k) && typeof w.en === 'string' && w.en.trim())
    .slice(0, 80)
    .map(w => ({ k: w.k, en: w.en.replace(/[^\p{L}\p{N} '\-]/gu, '').trim().slice(0, 60), th: String(w.th || '').replace(/[\u0000-\u001f"\\]/g, '').slice(0, 80) }))
    .filter(w => w.en);
  if (!words.length) return error('bad_request', 400);
  const prompt = buildTranslatePrompt(lang, words);
  const log = [];
  const res = await runAI(env, acc.providers, null, null, () => prompt, parseTranslations, log);
  await saveUsage(env, 'translate', log);
  return res;
}

// ---------- AI usage counter (🛡️ admin → ✨ AI usage) ----------
// One row per model call in public.ai_usage (supabase/2026-11-ai-usage.sql). No user, picture or words.
// Never holds up or breaks the answer: without the table (or on any error) nothing is saved.
async function saveUsage(env, kind, log) {
  if (!env.SUPABASE_SECRET_KEY || !log || !log.length) return;
  const rows = log.map(x => ({ kind, provider: x.provider, model: String(x.model).slice(0, 60), outcome: String(x.outcome || 'error').slice(0, 30),
    ms: Number.isFinite(x.ms) ? Math.round(x.ms) : null, tok_in: Number.isFinite(x.tok_in) ? x.tok_in : null, tok_out: Number.isFinite(x.tok_out) ? x.tok_out : null }));
  try {
    await Promise.race([
      sbRest(env, 'ai_usage', { method: 'POST', headers: { prefer: 'return=minimal' }, body: JSON.stringify(rows) }).then(r => { if (!r.ok) console.log('ai_usage insert', r.status); }),
      new Promise(r => setTimeout(r, 2000)),
    ]);
  } catch (e) { console.log('ai_usage insert failed', String(e)); }
}
// Free daily requests per model on the Gemini API (Google's free tier, November 2026; Google changes these).
// Override with GEMINI_FREE_RPD, e.g. "gemini-3.8-flash:20,gemini-3.5-flash-lite:500".
const FREE_RPD = { 'gemini-3.8-flash': 20, 'gemini-3.6-flash': 20, 'gemini-3.5-flash-lite': 500, 'gemini-3.1-flash-lite': 500 };
export function freeRpd(env) {
  const out = { ...FREE_RPD };
  for (const part of String(env.GEMINI_FREE_RPD || '').split(',')) {
    const m = /^\s*([a-z0-9.\-]+)\s*:\s*(\d+)\s*$/i.exec(part); if (m) out[m[1]] = +m[2];
  }
  return out;
}
// Paid prices per 1M tokens (USD), used only to estimate "what would this have cost on the paid tier".
const PAID_PRICE = { 'gemini-3.8-flash': [0.75, 3.75], 'gemini-3.6-flash': [0.75, 3.75], 'gemini-3.5-flash-lite': [0.30, 2.50], 'claude-haiku-5-5': [0.10, 0.50], 'claude-sonnet-5-5': [2.00, 10.00] };
// Midnight in a time zone, as a Date: Thai days for the counts, Pacific days for Google's daily quota.
export function zoneMidnight(now, timeZone) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .formatToParts(now).map(x => [x.type, x.value]));
  const secs = (Number(p.hour) % 24) * 3600 + Number(p.minute) * 60 + Number(p.second);
  return new Date(Math.floor(now.getTime() / 1000) * 1000 - secs * 1000);
}
export async function aiUsageReport(env, now = new Date()) {
  const rpc = async (fn, args) => {
    const r = await sbRest(env, `rpc/${fn}`, { method: 'POST', body: JSON.stringify(args || {}) });
    if (r.status === 404) { const e = new Error('missing'); e.missing = true; throw e; }
    if (!r.ok) throw new Error(`${fn} ${r.status}`);
    return r.json().catch(() => null);
  };
  const today = zoneMidnight(now, 'Asia/Bangkok');
  const month = new Date(Date.UTC(new Date(now.getTime() + 7 * 3600e3).getUTCFullYear(), new Date(now.getTime() + 7 * 3600e3).getUTCMonth(), 1) - 7 * 3600e3);
  const quotaStart = zoneMidnight(now, 'America/Los_Angeles');
  const since30 = new Date(today.getTime() - 29 * 86400e3);
  try {
    const [t, mo, qd, daily] = await Promise.all([
      rpc('ai_usage_summary', { p_since: today.toISOString() }), rpc('ai_usage_summary', { p_since: month.toISOString() }),
      rpc('ai_usage_summary', { p_since: quotaStart.toISOString() }), rpc('ai_usage_daily', { p_since: since30.toISOString() }),
    ]);
    if (Math.random() < 0.1) rpc('ai_usage_cleanup').catch(() => {});
    return {
      provider: pickProvider(env), providers: pickProviders(env),
      gemini_models: geminiModels(env), claude_model: env.CLAUDE_MODEL || DEFAULT_MODEL,
      free_rpd: freeRpd(env), paid_price: PAID_PRICE, monthly_credits: monthlyCredits(env),
      today: { since: today.toISOString(), rows: t || [] }, month: { since: month.toISOString(), rows: mo || [] },
      quota_day: { since: quotaStart.toISOString(), resets: new Date(quotaStart.getTime() + 86400e3).toISOString(), rows: qd || [] },
      daily: daily || [],
    };
  } catch (e) {
    if (e.missing) return { setup: true };
    throw e;
  }
}
export function buildTranslatePrompt(lang, words) {
  return `You help Thai children and adults learn ${AI_LANGS[lang]} vocabulary from pictures. Each item below is an object in a picture, given by its usual English name ("en") and Thai meaning ("th").

For each item give:
- "k": the same k as in the input
- "w": the usual ${AI_LANGS[lang]} word a learner's dictionary would use for that object — singular, WITHOUT the article, with normal ${AI_LANGS[lang]} spelling and capitalisation (e.g. "Teekanne"), 1-3 words
- "a": its definite article: "der", "die" or "das" (use "" only if it is not a noun)
- "alts": up to 3 other acceptable ${AI_LANGS[lang]} answers for the same object, without article, or []

Keep every word suitable for all ages. Reply with a JSON array only, no other text, in the same order as the input.

Items: ${JSON.stringify(words)}`;
}
export function parseTranslations(text) {
  const s = String(text || '');
  const a = s.indexOf('['), b = s.lastIndexOf(']');
  if (a < 0) return null;
  let arr;
  try { if (b <= a) throw 0; arr = JSON.parse(s.slice(a, b + 1)); } catch (e) {
    // Cut off part-way (the answer ran out of room): keep the things that came complete.
    const c = s.lastIndexOf('}');
    try { arr = c > a ? JSON.parse(s.slice(a, c + 1) + ']') : null; } catch (e2) { return null; }
    if (Array.isArray(arr)) { const seen = new Set(); arr = arr.filter(r => { const k = r && typeof r.word === 'string' ? r.word.toLowerCase() : ''; if (!k || seen.has(k)) return false; seen.add(k); return true; }); }
  }
  if (!Array.isArray(arr)) return null;
  return arr.map(r => {
    if (!r || typeof r.k !== 'string' || !/^[A-Za-z0-9_-]{1,40}$/.test(r.k) || typeof r.w !== 'string' || !r.w.trim()) return null;
    return { k: r.k, ...cleanLangWord({ w: r.w, a: r.a, alts: r.alts }) };
  }).filter(Boolean).slice(0, 80);
}
// {w, a, alts} for a language other than English: trimmed, article only der/die/das
export function cleanLangWord(v) {
  const w = String(v && v.w || '').trim().replace(/\s+/g, ' ').slice(0, 60);
  const a = ['der', 'die', 'das'].includes(String(v && v.a || '').toLowerCase()) ? String(v.a).toLowerCase() : '';
  const alts = (Array.isArray(v && v.alts) ? v.alts : []).filter(x => typeof x === 'string' && x.trim()).slice(0, 4).map(x => x.trim().slice(0, 60));
  return { w, a, alts };
}

// Calls a server-only database function (use/refund AI credit) with the Supabase secret key.
async function creditRpc(env, fn, args) {
  const key = String(env.SUPABASE_SECRET_KEY);
  const headers = { apikey: key, 'content-type': 'application/json' };
  if (!key.startsWith('sb_secret_')) headers.authorization = `Bearer ${key}`;   // legacy service_role JWT
  const r = await fetch(`${env.SUPABASE_URL || SUPABASE_URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers, body: JSON.stringify(args) });
  if (!r.ok) throw new Error(`${fn} ${r.status} ${(await r.text().catch(() => '')).slice(0, 200)}`);
  const v = await r.json();
  return typeof v === 'number' ? v : (v == null ? -1 : Number(v));
}

async function withField(res, k, v) {
  if (v === undefined) return res;
  const body = await res.clone().json().catch(() => null);
  if (!body || typeof body !== 'object') return res;
  body[k] = v;
  return json(body, res.status);
}

// CLAUDE_EFFORT: low | medium | high | xhigh | max — how much the model may think (more = slower and dearer).
// Unset: the model's own default (medium for Claude Haiku 5.5).
const EFFORTS = new Set(['low', 'medium', 'high', 'xhigh', 'max']);
export const claudeEffort = env => { const e = String(env.CLAUDE_EFFORT || '').trim().toLowerCase(); return EFFORTS.has(e) ? e : null; };
async function scanClaude(env, mime, data64, prompt, parse = parseItems, log = null) {
  const t0 = Date.now(), model = env.CLAUDE_MODEL || DEFAULT_MODEL;
  const out = await claudeOnce(env, model, mime, data64, prompt, parse);
  if (log) { const b = await out.clone().json().catch(() => ({})); log.push({ provider: 'claude', model, outcome: out.status === 200 ? 'ok' : (b.error || 'error'), ms: Date.now() - t0, tok_in: b.usage ? b.usage.in : null, tok_out: b.usage ? b.usage.out : null }); }
  return out;
}
async function claudeOnce(env, model, mime, data64, prompt, parse) {
  let res;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        // Room for thinking as well as the answer (newer models think before answering; billed as used, not as set)
        max_tokens: 16000,
        ...(claudeEffort(env) ? { output_config: { effort: claudeEffort(env) } } : {}),
        messages: [{
          role: 'user',
          content: [
            ...(mime ? [{ type: 'image', source: { type: 'base64', media_type: mime, data: data64 } }] : []),
            { type: 'text', text: prompt },
          ],
        }],
      }),
    });
  } catch (e) {
    return error('upstream_unreachable', 502);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    console.log('Claude API error', res.status, detail.slice(0, 500));
    if (res.status === 429 || res.status === 529) return error('busy', 503);
    if (res.status === 400 && /image/i.test(detail)) return error('image_rejected', 400);
    if (res.status === 401 || res.status === 403) return error('not_configured', 503);
    if (/credit|billing|balance/i.test(detail)) return error('out_of_credit', 503);
    return error('upstream_error', 502);
  }

  const data = await res.json();
  if (data.stop_reason === 'refusal') return error('refused', 422);
  if (data.stop_reason === 'max_tokens') console.log('Claude hit max_tokens', JSON.stringify(data.usage || {}));
  const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  const items = parse(text);
  if (!items) return error('invalid_json', 502);
  return json({ items, provider: 'claude', model, usage: data.usage ? { in: data.usage.input_tokens, out: data.usage.output_tokens } : undefined });
}

export function geminiModels(env) {
  return String(env.GEMINI_MODEL || DEFAULT_GEMINI_MODELS).split(',')
    .map(m => m.trim().replace(/[^a-z0-9.\-]/gi, '')).filter(Boolean).slice(0, 5);
}

async function scanGemini(env, mime, data64, prompt, parse = parseItems, log = null, schema = null) {
  const models = geminiModels(env);
  const now = Date.now();
  const order = [...models.filter(m => !(skipUntil.get(m) > now)), ...models.filter(m => skipUntil.get(m) > now)];
  let last = error('not_configured', 503);
  for (const model of order) {
    const t0 = Date.now();
    const r = await callGemini(env, model, mime, data64, prompt, parse, schema);
    if (log) log.push({ provider: 'gemini', model, outcome: r.ok ? 'ok' : (r.why || r.code), ms: Date.now() - t0, tok_in: r.usage ? r.usage.in : null, tok_out: r.usage ? r.usage.out : null,
      ...(r.sample != null ? { finish: r.finish, sample: r.sample } : {}) });
    if (r.ok) return json({ items: r.items, provider: 'gemini', model, usage: r.usage });
    last = error(r.code, r.status);
    // Out of quota, model not available to this key, Google busy, or an answer that couldn't be read: try the next model.
    if (r.next) { if (r.skipMs) skipUntil.set(model, Date.now() + r.skipMs); continue; }
    return last;
  }
  return last;
}

// Models that turned down structured output (a 400 about the schema): asked without it from then on.
const noSchema = new Set();
async function callGemini(env, model, mime, data64, prompt, parse = parseItems, schema = null) {
  if (schema && noSchema.has(model)) schema = null;
  let res;
  try {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [
          ...(mime ? [{ inline_data: { mime_type: mime, data: data64 } }] : []),
          { text: prompt },
        ] }],
        generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 8192, ...(schema ? { responseSchema: schema } : {}) },
      }),
    });
  } catch (e) {
    return { code: 'upstream_unreachable', status: 502, next: true, why: 'unreachable', finish: '', sample: String(e && e.message || e).slice(0, 300) };
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    // Google's own message (never the user's picture or words) goes to the 🧪 compare, for the admin
    const info = { finish: 'HTTP ' + res.status, sample: detail.slice(0, 400) };
    // this model doesn't take the schema → ask again without it (the prompt still asks for the same JSON)
    if (schema && res.status === 400 && /schema|response_?schema|Unknown name/i.test(detail)) {
      noSchema.add(model);
      return callGemini(env, model, mime, data64, prompt, parse, null);
    }
    console.log('Gemini API error', model, res.status, detail.slice(0, 500));
    if (res.status === 429) {
      // "limit: 0" = no free quota for this model; "per day" = daily quota used up; otherwise per-minute.
      const none = /limit: ?0\b/.test(detail), daily = /per ?day|PerDay/i.test(detail);
      return { code: none ? 'not_configured' : 'rate_limited', status: none ? 503 : 429, next: true,
               skipMs: none || daily ? 60 * 60 * 1000 : 60 * 1000, why: none ? 'no_quota' : daily ? 'quota_day' : 'quota_minute' };
    }
    if (res.status === 503 || res.status === 500) return { code: 'busy', status: 503, next: true, skipMs: 30 * 1000, ...info };
    // 504 / 408: the model took too long (DEADLINE_EXCEEDED) — another model may answer in time
    // (524: Cloudflare gave up waiting for Google after ~100 s)
    if (res.status === 504 || res.status === 408 || res.status === 524) return { code: 'busy', status: 503, next: true, skipMs: 5 * 60 * 1000, why: 'timeout', ...info };
    if (res.status === 404) return { code: 'not_configured', status: 503, next: true, skipMs: 60 * 60 * 1000 };
    if (res.status === 400 && /api key/i.test(detail)) return { code: 'not_configured', status: 503 };
    if (res.status === 401 || res.status === 403) return { code: 'not_configured', status: 503 };
    if (res.status === 400 && /image|inline_data|mime/i.test(detail)) return { code: 'image_rejected', status: 400 };
    return { code: 'upstream_error', status: 502, why: 'http_' + res.status, ...info };
  }

  const data = await res.json();
  if (data.promptFeedback && data.promptFeedback.blockReason) return { code: 'refused', status: 422 };
  const cand = (data.candidates || [])[0];
  if (!cand) return { code: 'empty_completion', status: 502 };
  if (/SAFETY|PROHIBITED|BLOCKLIST|RECITATION/.test(cand.finishReason || '')) return { code: 'refused', status: 422 };
  const text = ((cand.content && cand.content.parts) || []).filter(p => typeof p.text === 'string' && !p.thought).map(p => p.text).join('');
  const items = parse(text);
  const u = data.usageMetadata;
  // thinking tokens are billed as output too
  const usage = u ? { in: u.promptTokenCount, out: (u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0) } : undefined;
  if (!items) {
    // An answer we can't read: the next model may do better (not a reason to go to a paid provider yet).
    // Why, and the start and end of the answer, go to the log (shown in the admin's 🧪 compare, never saved).
    const finish = String(cand.finishReason || ''), cut = finish === 'MAX_TOKENS';
    console.log('Gemini answer not readable', model, finish, usage ? usage.out : '', text.slice(0, 200));
    return { code: 'invalid_json', status: 502, next: true, why: cut ? 'cut_off' : text.trim() ? 'bad_json' : 'empty_answer', usage, finish,
      sample: text.length > 400 ? text.slice(0, 200) + ' … ' + text.slice(-200) : text };
  }
  return { ok: true, items, usage };
}

// ---------- 🧪 admin: one picture through several models (Gemini and Claude), side by side ----------
// No credits and nothing saved (not in ai_usage either): it's for choosing a provider, not for making scenes.
export const COMPARE_MODELS = { gemini: ['gemini-3.5-flash-lite', 'gemini-3.8-flash', 'gemini-3.6-flash'], claude: ['claude-haiku-5-5'] };
async function compareAI(env, body) {
  const m = /^data:([a-z/+-]+);base64,([A-Za-z0-9+/=]+)$/.exec(String(body.image || ''));
  if (!m || !IMAGE_TYPES.includes(m[1])) return error('bad_image', 400);
  if (m[2].length > MAX_IMAGE_BYTES) return error('image_too_large', 413);
  const count = clampInt(body.count, 5, 30, 20);
  const level = LEVELS[body.level] ? body.level : 'mid';
  const langs = (Array.isArray(body.langs) ? body.langs : []).filter(l => AI_LANGS[l]).slice(0, 3);
  const pick = (p, want) => COMPARE_MODELS[p].includes(want) ? want : COMPARE_MODELS[p][0];
  // models: any of the list, up to 5, all at once (e.g. the three free Gemini models and Claude);
  // older pages send one Gemini and one Claude model instead
  const known = [...COMPARE_MODELS.gemini, ...COMPARE_MODELS.claude];
  let models = Array.isArray(body.models) ? [...new Set(body.models.filter(x => known.includes(x)))].slice(0, 5) : [];
  if (!models.length) models = [pick('gemini', body.gemini), pick('claude', body.claude)];
  const run = async model => {
    const provider = COMPARE_MODELS.gemini.includes(model) ? 'gemini' : 'claude';
    if (!(provider === 'gemini' ? env.GEMINI_API_KEY : env.ANTHROPIC_API_KEY)) return { provider, model, ok: false, error: 'not_configured', items: [] };
    const e = provider === 'gemini' ? { ...env, GEMINI_MODEL: model } : { ...env, CLAUDE_MODEL: model };
    const log = [], t0 = Date.now(), prompt = buildPrompt(count, level, [], provider, langs);
    const res = provider === 'gemini' ? await scanGemini(e, m[1], m[2], prompt, parseItems, log, itemsSchema(langs)) : await scanClaude(e, m[1], m[2], prompt, parseItems, log);
    const b = await res.json().catch(() => ({}));
    const tin = log.reduce((t, x) => t + (x.tok_in || 0), 0), tout = log.reduce((t, x) => t + (x.tok_out || 0), 0);
    const price = PAID_PRICE[model];
    return { provider, model, ok: res.status === 200, error: res.status === 200 ? undefined : (b.error || 'error'), items: Array.isArray(b.items) ? b.items : [],
      ms: Date.now() - t0, tok_in: tin, tok_out: tout, cost_usd: price ? (tin * price[0] + tout * price[1]) / 1e6 : null,
      free_rpd: provider === 'gemini' ? (freeRpd(env)[model] || null) : null,
      why: res.status === 200 ? undefined : (log.length ? log[log.length - 1].outcome : undefined),   // e.g. quota_day, no_quota, cut_off
      ...(res.status !== 200 && log.length && log[log.length - 1].sample != null ? { finish: log[log.length - 1].finish, sample: log[log.length - 1].sample,
        tok_in: log[log.length - 1].tok_in, tok_out: log[log.length - 1].tok_out } : {}) };
  };
  return json({ results: await Promise.all(models.map(run)) });
}

// ---------- scene pictures in R2 ----------
// Who is calling? Asks Supabase Auth to check the access token (also catches signed-out / revoked sessions).
const userCache = new Map(); // token -> { uid, anon, until }
export async function userFromRequest(request, env) {
  const u = await userInfo(request, env);
  return u ? u.uid : null;
}
// { uid, anon } — anon: a student account made from a room code + nickname (no e-mail)
export async function userInfo(request, env) {
  const m = /^Bearer\s+(\S+)$/i.exec(request.headers.get('authorization') || '');
  if (!m) return null;
  const token = m[1], now = Date.now(), hit = userCache.get(token);
  if (hit && hit.until > now) return { uid: hit.uid, anon: hit.anon, email: hit.email };
  let res;
  try {
    res = await fetch(`${env.SUPABASE_URL || SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY || SUPABASE_PUBLISHABLE_KEY, authorization: `Bearer ${token}` },
    });
  } catch (e) { return null; }
  if (!res.ok) return null;
  const u = await res.json().catch(() => null);
  const uid = u && typeof u.id === 'string' && /^[0-9a-f-]{36}$/i.test(u.id) ? u.id : null;
  if (!uid) return null;
  const anon = u.is_anonymous === true, email = typeof u.email === 'string' ? u.email.toLowerCase() : '';
  if (userCache.size > 500) userCache.clear();
  userCache.set(token, { uid, anon, email, until: now + 5 * 60 * 1000 });
  return { uid, anon, email };
}

// Delete everything the signed-in user has with us: pictures first, then the account
// (the database rows go with the account through "on delete cascade").
async function deleteAccount(request, env) {
  if (request.method !== 'DELETE') return error('method_not_allowed', 405);
  const key = env.SUPABASE_SECRET_KEY;
  if (!key) return error('not_configured', 503);
  const uid = await userFromRequest(request, env);
  if (!uid) return error('unauthorized', 401);
  let removed = 0;
  if (env.IMAGES) {
    const mine = await sbRest(env, `shares?owner=eq.${uid}&select=id`).then(r => r.ok ? r.json() : []).catch(() => []);
    for (const row of Array.isArray(mine) ? mine : []) removed += await deletePrefix(env, `s/${row.id}/`);
    let cursor;
    do {
      const page = await env.IMAGES.list({ prefix: `u/${uid}/`, cursor });
      const keys = (page.objects || []).map(o => o.key);
      if (keys.length) { await env.IMAGES.delete(keys); removed += keys.length; }
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
  }
  let res;
  try {
    // A secret key may go in Authorization only when it equals the apikey header.
    res = await fetch(`${env.SUPABASE_URL || SUPABASE_URL}/auth/v1/admin/users/${uid}`, {
      method: 'DELETE', headers: { apikey: key, authorization: `Bearer ${key}` },
    });
  } catch (e) { return error('upstream_unreachable', 502); }
  if (!res.ok && res.status !== 404) {
    console.log('delete user failed', res.status, (await res.text().catch(() => '')).slice(0, 300));
    return error('delete_failed', 502);
  }
  for (const [t, v] of userCache) if (v.uid === uid) userCache.delete(t);
  return json({ ok: true, pictures: removed });
}

async function image(request, env, url) {
  if (!env.IMAGES) return error('not_configured', 503);
  const id = decodeURIComponent(url.pathname.slice('/api/img/'.length));
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(id)) return error('bad_id', 400);
  const uid = await userFromRequest(request, env);
  if (!uid) return error('unauthorized', 401);
  const key = `u/${uid}/${id}`;

  if (request.method === 'GET') {
    const obj = await env.IMAGES.get(key);
    if (!obj) return error('not_found', 404);
    return new Response(obj.body, { headers: {
      'content-type': (obj.httpMetadata && obj.httpMetadata.contentType) || 'image/jpeg',
      // A scene's picture can change under the same address (a word sheet redrawn with pictures or new words),
      // so the browser must not keep an old copy.
      'cache-control': 'private, no-store',
    } });
  }
  if (request.method === 'PUT') {
    const type = (request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!UPLOAD_TYPES.includes(type)) return error('bad_image', 400);
    const len = Number(request.headers.get('content-length') || 0);
    if (len > MAX_UPLOAD) return error('image_too_large', 413);
    const body = await request.arrayBuffer();
    if (!body.byteLength) return error('bad_image', 400);
    if (body.byteLength > MAX_UPLOAD) return error('image_too_large', 413);
    await env.IMAGES.put(key, body, { httpMetadata: { contentType: type } });
    return json({ ok: true, key, size: body.byteLength });
  }
  if (request.method === 'DELETE') {
    await env.IMAGES.delete(key);
    return json({ ok: true });
  }
  return error('method_not_allowed', 405);
}

function buildPrompt(count, level, existing, provider, langs) {
  langs = [].concat(langs || []).filter(l => AI_LANGS[l]);
  // Gemini is trained on its own box format ("box_2d": [ymin, xmin, ymax, xmax], 0-1000) and is much
  // less accurate with any other order, so it gets that format and parseItems() converts it.
  const gem = provider === 'gemini';
  return `You are building a picture-vocabulary game for Thai learners of English. Look at the attached image.

Learners may be children, so keep every word suitable for all ages. If the image shows nudity, sexual content, graphic violence, weapons in use or drugs, reply with [] and nothing else.

Find up to ${count} different things that are clearly visible in the image and worth learning, at ${LEVELS[level]} level. Prefer concrete things a learner can point at: objects, food, furniture, tools, clothing, animals, plants, vehicles, parts of the room or scene. Do not include people's names, brands, logos, or text printed in the image. If the image contains text labels or captions, ignore them: each box must surround the object itself, never a label.${existing.length ? '\nThese words are already in the game, so do not repeat them: ' + existing.join(', ') + '.' : ''}

For each thing give:
- "word": the usual English name a learner's dictionary would use (British spelling, singular, lowercase), 1-4 words
- "th": a short Thai meaning (a few words)
- "alts": up to 3 other acceptable English answers (US spelling, close synonyms), or []
- "cefr": the word's CEFR level for learners of English: "preA1" for the very first words young children learn (colours, numbers, family, toys, pets, food, body), otherwise "A1", "A2", "B1", "B2", "C1" or "C2"
${langs.map(lang => `- "${lang}": the usual ${AI_LANGS[lang]} word for it — singular, WITHOUT the article, normal ${AI_LANGS[lang]} spelling and capitalisation
- "${lang}_art": its definite article: "der", "die" or "das" ("" if not a noun)
- "${lang}_alts": up to 3 other acceptable ${AI_LANGS[lang]} answers without article, or []
`).join('')}${gem
  ? '- "box_2d": [ymin, xmin, ymax, xmax], a tight 2D bounding box around that thing, normalised to 0-1000'
  : '- "box": [x0, y0, x1, y1], a tight bounding box around that thing, in coordinates normalised to 0-1000, where [0,0] is the top-left corner and [1000,1000] is the bottom-right corner of the image'}

Use each word once. If the same kind of thing appears several times, box the clearest single one. Boxes of different things may overlap.

Reply with only a JSON array, for example:
${gem
  ? '[{"word":"teapot","th":"กาน้ำชา","alts":["tea pot"],"box_2d":[380,512,560,690]}]'
  : '[{"word":"teapot","th":"กาน้ำชา","alts":["tea pot"],"box":[512,380,690,560]}]'}`;
}

// The shape of a picture scan's answer for Gemini's structured output (same fields as buildPrompt asks for),
// so a small model like flash-lite can't answer in some other shape.
export function itemsSchema(langs = []) {
  const S = { type: 'STRING' }, list = { type: 'ARRAY', items: S };
  const props = { word: S, th: S, alts: list, cefr: { type: 'STRING', enum: ['preA1', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'] } };
  for (const l of [].concat(langs || []).filter(l => AI_LANGS[l])) {
    props[l] = S; props[l + '_art'] = S; props[l + '_alts'] = list;
  }
  props.box_2d = { type: 'ARRAY', items: { type: 'INTEGER' }, minItems: 4, maxItems: 4 };
  return { type: 'ARRAY', items: { type: 'OBJECT', properties: props, required: ['word', 'th', 'box_2d'], propertyOrdering: Object.keys(props) } };
}

// Pull the JSON array out of the model's reply (tolerates code fences or stray text).
export function parseItems(text) {
  const s = String(text || '');
  const a = s.indexOf('['), b = s.lastIndexOf(']');
  if (a < 0) return null;
  let arr;
  try { if (b <= a) throw 0; arr = JSON.parse(s.slice(a, b + 1)); } catch (e) {
    // Cut off part-way (the answer ran out of room): keep the things that came complete.
    const c = s.lastIndexOf('}');
    try { arr = c > a ? JSON.parse(s.slice(a, c + 1) + ']') : null; } catch (e2) { return null; }
    if (Array.isArray(arr)) { const seen = new Set(); arr = arr.filter(r => { const k = r && typeof r.word === 'string' ? r.word.toLowerCase() : ''; if (!k || seen.has(k)) return false; seen.add(k); return true; }); }
  }
  if (!Array.isArray(arr)) return null;
  return arr
    .map(r => {
      if (!r || typeof r.word !== 'string') return null;
      let box = null;
      if (Array.isArray(r.box) && r.box.length >= 4) box = r.box.slice(0, 4).map(Number);
      else if (Array.isArray(r.box_2d) && r.box_2d.length >= 4) {
        const [ymin, xmin, ymax, xmax] = r.box_2d.slice(0, 4).map(Number);
        box = [xmin, ymin, xmax, ymax];
      }
      if (!box) return null;
      const out = {
        word: r.word.slice(0, 60),
        th: typeof r.th === 'string' ? r.th.slice(0, 120) : '',
        alts: Array.isArray(r.alts) ? r.alts.filter(x => typeof x === 'string').slice(0, 4) : [],
        box,
      };
      if (cleanCefr(r.cefr)) out.cefr = cleanCefr(r.cefr);
      for (const lg of Object.keys(AI_LANGS)) {
        if (typeof r[lg] === 'string' && r[lg].trim()) {
          const v = cleanLangWord({ w: r[lg], a: r[lg + '_art'], alts: r[lg + '_alts'] });
          if (v.w) out.l = { ...(out.l || {}), [lg]: v };
        }
      }
      return out;
    })
    .filter(Boolean)
    .filter(dropCutWords)
    .slice(0, 40);
}
// A word the AI cut short or repeated, next to the real one (flash-lite gave "teapo" beside "teapot"): drop it,
// so a child is never taught a misspelling. Only one letter apart and 4+ letters, so real pairs stay
// (cup/cupboard, pen/pencil, plant/planter); of "sock" and "socks" the singular stays. Exact repeats go too.
function dropCutWords(it, i, all) {
  const w = it.word.trim().toLowerCase();
  return !all.some((o, j) => {
    if (j === i) return false;
    const v = o.word.trim().toLowerCase();
    if (v === w) return j < i;                                         // the same word again: keep the first
    if (w.length < 4 || v.length !== w.length + 1 || !v.startsWith(w)) return false;
    return !(v === w + 's');                                           // w is v cut short (but "sock" beside "socks" stays)
  }) && !(w.endsWith('s') && w.length >= 5 && all.some(o => o !== it && o.word.trim().toLowerCase() === w.slice(0, -1)));   // the plural of a word already there
}

function clampInt(v, lo, hi, dflt) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : dflt;
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function error(code, status) {
  return json({ error: code }, status);
}

// ---------- share links ----------
const SHARE_ID = /^[A-Za-z0-9]{8,16}$/;
const SCENE_ID = /^[A-Za-z0-9_-]{1,40}$/;
const MAX_SHARES = 200;           // per user
const MAX_SHARE_SCENES = 30;      // per deck
const MAX_SHARE_JSON = 300000;    // characters of words/boxes data

function sbRest(env, path, init = {}) {
  const key = env.SUPABASE_SECRET_KEY;
  return fetch(`${env.SUPABASE_URL || SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json', ...(init.headers || {}) },
  });
}
async function getShare(env, id) {
  if (!SHARE_ID.test(id)) return null;
  const r = await sbRest(env, `shares?id=eq.${id}&select=id,owner,kind,name,data,created_at,updated_at`);
  if (!r.ok) throw new Error('db ' + r.status);
  const rows = await r.json();
  return rows && rows[0] || null;
}
async function deletePrefix(env, prefix) {
  let n = 0, cursor;
  do {
    const page = await env.IMAGES.list({ prefix, cursor });
    const keys = (page.objects || []).map(o => o.key);
    if (keys.length) { await env.IMAGES.delete(keys); n += keys.length; }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return n;
}
export function newShareId() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789', b = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(b, x => abc[x % abc.length]).join('');
}
const cleanStr = (v, n) => String(v == null ? '' : v).slice(0, n);
const num = v => (Number.isFinite(+v) ? Math.round(+v * 10) / 10 : 0);
// Keep only the fields the app needs, with sane sizes.
export function cleanShareBody(b) {
  if (!b || (b.kind !== 'scene' && b.kind !== 'deck')) return null;
  const scenes = Array.isArray(b.scenes) ? b.scenes.slice(0, b.kind === 'scene' ? 1 : MAX_SHARE_SCENES) : [];
  if (!scenes.length) return null;
  const out = { kind: b.kind, name: cleanStr(b.name, 60).trim() || (b.kind === 'deck' ? 'ชุดคำ' : 'ฉาก'), scenes: [] };
  for (const sc of scenes) {
    if (!sc || !SCENE_ID.test(String(sc.id))) return null;
    const builtin = sc.id === 'tea' && sc.builtin === true;
    const items = {};
    if (!builtin) {
      for (const [k, it] of Object.entries(sc.items || {}).slice(0, 80)) {
        if (!it || typeof it.word !== 'string' || !SCENE_ID.test(k)) continue;
        items[k] = { word: cleanStr(it.word, 80), th: cleanStr(it.th, 120), alts: Array.isArray(it.alts) ? it.alts.filter(a => typeof a === 'string').slice(0, 4).map(a => a.slice(0, 60)) : [],
          ...(it.say ? { say: cleanStr(it.say, 80) } : {}), x: num(it.x), y: num(it.y), w: num(it.w), h: num(it.h) };
        if (typeof it.pic === 'string') { const pic = cleanSvg(it.pic); if (pic) items[k].pic = pic; }   // 🎨 a word sheet's line picture
        // the same box in other languages (e.g. German with its article)
        if (it.l && typeof it.l === 'object') for (const lg of Object.keys(AI_LANGS)) {
          const v = it.l[lg] && cleanLangWord(it.l[lg]);
          if (v && v.w) items[k].l = { ...(items[k].l || {}), [lg]: v };
        }
        if (!items[k].word && !items[k].l) delete items[k];
      }
    }
    const w = Math.round(+sc.w), h = Math.round(+sc.h);
    if (!builtin && !(w > 0 && w <= 4000 && h > 0 && h <= 4000)) return null;
    out.scenes.push(builtin ? { id: 'tea', builtin: true, n: clampInt(sc.n, 0, 500, 0) } : { id: sc.id, name: cleanStr(sc.name, 60), w, h, items });
  }
  if (b.kind === 'deck') {
    const ids = new Set(out.scenes.map(s => s.id));
    out.words = (Array.isArray(b.words) ? b.words : []).filter(k => typeof k === 'string' && k.length <= 90 && ids.has(k.split('|')[0])).slice(0, 2000);
    if (!out.words.length) return null;
  }
  if (JSON.stringify(out).length > MAX_SHARE_JSON) return null;
  return out;
}
async function share(request, env, url) {
  if (!env.SUPABASE_SECRET_KEY || !env.IMAGES) return error('not_configured', 503);
  const parts = url.pathname.split('/').filter(Boolean);       // api, share, <id>, img, <sceneId>
  const id = parts[2];
  try {
    // public: read a share / one of its pictures
    if (request.method === 'GET' && id) {
      const row = await getShare(env, id);
      if (!row) return error('not_found', 404);
      if (parts[3] === 'img' && parts.length === 5) {
        const sid = parts[4];
        if (!row.data.scenes.some(s => s.id === sid && !s.builtin)) return error('not_found', 404);
        const obj = await env.IMAGES.get(`s/${id}/${sid}`);
        if (!obj) return error('not_found', 404);
        return new Response(obj.body, { headers: {
          'content-type': (obj.httpMetadata && obj.httpMetadata.contentType) || 'image/jpeg',
          'cache-control': 'public, max-age=3600',
        } });
      }
      if (parts.length !== 3) return error('not_found', 404);
      return json({ id: row.id, kind: row.kind, name: row.name, scenes: row.data.scenes, words: row.data.words, updated_at: row.updated_at });
    }
    const uid = await userFromRequest(request, env);
    if (!uid) return error('unauthorized', 401);
    if (request.method === 'DELETE' && id && parts.length === 3) {
      const row = await getShare(env, id);
      if (!row || row.owner !== uid) return error('not_found', 404);
      await deletePrefix(env, `s/${id}/`);
      const r = await sbRest(env, `shares?id=eq.${id}&owner=eq.${uid}`, { method: 'DELETE' });
      if (!r.ok) return error('db_error', 502);
      return json({ ok: true });
    }
    if (request.method === 'POST' && !id) {
      const raw = await request.json().catch(() => null);
      const body = cleanShareBody(raw);
      if (!body) return error('bad_request', 400);
      let shareId = typeof raw.id === 'string' && SHARE_ID.test(raw.id) ? raw.id : null;
      if (shareId) {
        const row = await getShare(env, shareId);
        if (!row || row.owner !== uid) shareId = null;              // not theirs → make a new link
      }
      if (!shareId) {
        const cnt = await sbRest(env, `shares?owner=eq.${uid}&select=id`, { headers: { prefer: 'count=exact', range: '0-0' } });
        const total = +(String(cnt.headers.get('content-range') || '').split('/')[1] || 0);
        if (total >= MAX_SHARES) return error('too_many_shares', 429);
        shareId = newShareId();
      }
      // copy the pictures (a snapshot: later edits or deleting the scene don't change the link)
      for (const sc of body.scenes) {
        if (sc.builtin) continue;
        const obj = await env.IMAGES.get(`u/${uid}/${sc.id}`);
        if (!obj) return json({ error: 'picture_missing', scene: sc.id }, 409);
        await env.IMAGES.put(`s/${shareId}/${sc.id}`, await obj.arrayBuffer(), { httpMetadata: { contentType: (obj.httpMetadata && obj.httpMetadata.contentType) || 'image/jpeg' } });
      }
      const now = new Date().toISOString();
      const r = await sbRest(env, 'shares?on_conflict=id', {
        method: 'POST', headers: { prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ id: shareId, owner: uid, kind: body.kind, name: body.name, data: { scenes: body.scenes, words: body.words }, updated_at: now }),
      });
      if (!r.ok) { console.log('share insert failed', r.status, (await r.text().catch(() => '')).slice(0, 300)); return error('db_error', 502); }
      // pictures of scenes no longer in an updated deck
      const keep = new Set(body.scenes.map(s => `s/${shareId}/${s.id}`));
      const old = await env.IMAGES.list({ prefix: `s/${shareId}/` });
      const drop = (old.objects || []).map(o => o.key).filter(k => !keep.has(k));
      if (drop.length) await env.IMAGES.delete(drop);
      return json({ id: shareId, url: `${url.origin}/s/${shareId}`, updated_at: now });
    }
    return error('method_not_allowed', 405);
  } catch (e) {
    console.log('share error', e && e.message);
    return error('db_error', 502);
  }
}
async function listShares(request, env) {
  if (request.method !== 'GET') return error('method_not_allowed', 405);
  if (!env.SUPABASE_SECRET_KEY) return error('not_configured', 503);
  const uid = await userFromRequest(request, env);
  if (!uid) return error('unauthorized', 401);
  const r = await sbRest(env, `shares?owner=eq.${uid}&select=id,kind,name,updated_at&order=updated_at.desc`).catch(() => null);
  if (!r || !r.ok) return error('db_error', 502);
  return json({ shares: await r.json() });
}
// /s/<id>: the normal app page, plus title / preview tags so chat apps show the scene.
async function sharePage(request, env, url) {
  const id = url.pathname.split('/')[2];
  const page = await env.ASSETS.fetch(new Request(`${url.origin}/app`, { headers: request.headers }));
  let html = await page.text();
  let row = null;
  if (env.SUPABASE_SECRET_KEY) row = await getShare(env, id).catch(() => null);
  if (row) {
    const scenes = row.data.scenes || [];
    const n = row.kind === 'deck' ? (row.data.words || []).length : Object.keys((scenes[0] && scenes[0].items) || {}).length;
    const en = pageLang(url) === 'en';
    const title = en
      ? (row.kind === 'deck' ? `Word set “${row.name}” · ${n} ${n === 1 ? 'word' : 'words'} — Piccab` : `Scene “${row.name}” · ${n} ${n === 1 ? 'word' : 'words'} — Piccab`)
      : (row.kind === 'deck' ? `ชุดคำ “${row.name}” · ${n} คำ — Piccab` : `ฉาก “${row.name}” · ${n} คำ — Piccab`);
    const pic = scenes.find(s => !s.builtin);
    const img = pic ? `${url.origin}/api/share/${id}/img/${pic.id}` : `${url.origin}/og-image.png`;
    const desc = en ? 'Learn words from a picture — tap to open it in Piccab and save it to practise' : 'ฝึกคำศัพท์ภาษาอังกฤษจากภาพ — กดเพื่อเปิดใน Piccab แล้วเก็บไว้ฝึกได้เลย';
    const tags = `<title>${esc(title)}</title>
<meta property="og:type" content="website"><meta property="og:site_name" content="Piccab">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(img)}"><meta property="og:url" content="${esc(url.origin + '/s/' + id)}">
<meta name="twitter:card" content="summary_large_image">`;
    html = html.replace(/<title>[\s\S]*?<\/title>/, tags);
  }
  return new Response(html, { status: 200, headers: await pageHeaders(html, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' }) });
}

// ---------- classrooms ----------
//   GET    /api/classes                         -> { teaching:[…], learning:[…] }
//   POST   /api/classes            {name}       -> new class (teachers: accounts with an e-mail)
//   POST   /api/classes/join       {code, nickname}
//   POST   /api/classes/progress   {rows:[{class_id, share_id, total, done, star}]}  (a student's own progress)
//   GET    /api/classes/<id>                    -> teacher: items + members + everyone's progress; student: items + own progress
//   PATCH  /api/classes/<id>       {name?, leaderboard?}  (teacher)
//   DELETE /api/classes/<id>                    (teacher)
//   POST   /api/classes/<id>/items {share_id}   (teacher; a share link of theirs)
//   DELETE /api/classes/<id>/items/<share_id>   (teacher)
//   DELETE /api/classes/<id>/members/<user id|me>  (teacher removes / student leaves)
//   PATCH  /api/classes/<id>/members/me {report}   (a member shares their learning report, or stops)
//   POST   /api/classes/report     {data}       (a learner's own report; kept only while shared with a group)
//   GET    /api/classes/<id>/report/<user id>   (owner: the report of a member who shares it; Pro)
// A family group is a class with kind 'family' (supabase/2026-11-reports.sql): members always share their report.
const CLASS_CODE = /^[A-Z2-9]{6}$/;
const MAX_CLASSES = 50, MAX_MEMBERS = 200, MAX_ITEMS = 100;
const CODE_ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function newClassCode() { return Array.from(crypto.getRandomValues(new Uint8Array(6)), x => CODE_ABC[x % 32]).join(''); }
const inList = ids => `in.(${ids.map(x => `"${x}"`).join(',')})`;
async function q(env, path, init) {
  const r = await sbRest(env, path, init);
  if (!r.ok) { const t = await r.text().catch(() => ''); const e = new Error(`db ${r.status} ${t.slice(0, 200)}`); e.status = r.status; e.body = t; throw e; }
  return r.status === 204 || r.headers.get('content-length') === '0' ? null : r.json().catch(() => null);
}
// Words in a shared scene / word set — for another language, only the words that have it
// (the sample scene has every language built in).
export function shareTotal(sh, lang = 'en') {
  if (!sh || !sh.data) return 0;
  const scenes = sh.data.scenes || [];
  const has = (sc, k) => { if (!sc) return false; if (sc.builtin) return true; const it = (sc.items || {})[k]; return !!(it && (lang === 'en' ? it.word !== '' : it.l && it.l[lang] && it.l[lang].w)); };
  if (sh.kind === 'deck') {
    const words = sh.data.words || [];
    if (lang === 'en') return words.length;
    const by = new Map(scenes.map(x => [x.id, x]));
    return words.filter(w => { const j = String(w).indexOf('|'); return has(by.get(String(w).slice(0, j)), String(w).slice(j + 1)); }).length;
  }
  const sc = scenes[0]; if (!sc) return 0;
  if (sc.builtin) return sc.n || 0;
  return lang === 'en' ? Object.keys(sc.items || {}).length : Object.keys(sc.items || {}).filter(k => has(sc, k)).length;
}
// Languages a class assignment can be practised in (English + those the AI can add)
const CLASS_LANGS = new Set(['en', ...Object.keys(AI_LANGS)]);
async function classItems(env, cid) {
  const items = await q(env, `class_items?class_id=eq.${cid}&select=*&order=added_at.asc`) || [];   // * : works before the lang column exists
  if (!items.length) return [];
  const shares = await q(env, `shares?id=${inList(items.map(i => i.share_id))}&select=id,kind,name,data`) || [];
  const by = new Map(shares.map(x => [x.id, x]));
  return items.filter(i => by.has(i.share_id)).map(i => { const sh = by.get(i.share_id), lang = CLASS_LANGS.has(i.lang) ? i.lang : 'en';
    return { share_id: i.share_id, kind: sh.kind, name: sh.name, lang, total: shareTotal(sh, lang), added_at: i.added_at }; });
}
// Ranks by words passed (then ★), ties share a rank; only nicknames and scores, plus which row is "me".
export function leaderboard(members, progress, itemIds, me) {
  const sum = new Map(members.map(m => [m.user_id, { nickname: m.nickname, done: 0, star: 0, me: m.user_id === me }]));
  for (const p of progress) { const r = sum.get(p.user_id); if (r && itemIds.has(p.share_id)) { r.done += p.done || 0; r.star += p.star || 0; } }
  const rows = [...sum.values()].sort((a, b) => b.done - a.done || b.star - a.star || a.nickname.localeCompare(b.nickname, 'th'));
  let rank = 0, prev = null;
  rows.forEach((r, i) => { const k = r.done + '/' + r.star; if (k !== prev) { rank = i + 1; prev = k; } r.rank = rank; });
  return rows;
}
const cleanNick = v => String(v == null ? '' : v).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 30);
// ---------- 📈 learning reports ----------
// Worked out on the learner's device (see app/js/report.js); kept here only in this shape, with limits.
const REPORT_MODES = ['learn', 'quiz', 'find', 'speak', 'sent', 'review', 'match'];
export function cleanReport(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return null;
  const int = (v, max = 100000) => Math.max(0, Math.min(max, Math.round(+v || 0)));
  const txt = (v, n = 60) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, '').trim().slice(0, n);
  const day = v => /^20\d\d-[01]\d-[0-3]\d$/.test(String(v)) ? String(v) : null;
  const arr = (v, n) => (Array.isArray(v) ? v : []).filter(Array.isArray).slice(0, n);
  const s = d.s && typeof d.s === 'object' ? d.s : {}, w = d.words && typeof d.words === 'object' ? d.words : {};
  const days = arr(d.days, 62).map(x => {
    const modes = {}, m = x[4] && typeof x[4] === 'object' ? x[4] : {};
    for (const k of REPORT_MODES) if (m[k]) modes[k] = int(m[k], 5000);
    return [day(x[0]), int(x[1], 5000), int(x[2], 1440), int(x[3], 1000), modes];
  }).filter(x => x[0]);
  return {
    v: 1,
    s: { streak: int(s.streak, 3650), week: int(s.week), total: int(s.total), star: int(s.star), min7: int(s.min7, 10080), last: day(s.last) },
    stage: GALLERY_STAGES.includes(d.stage) ? d.stage : '',
    lang: AI_LANGS[d.lang] ? d.lang : 'en',
    words: { total: int(w.total), done: int(w.done), star: int(w.star), due: int(w.due) },
    days,
    weak: arr(d.weak, 20).map(x => [txt(x[0]), txt(x[1]), int(x[2], 1000)]).filter(x => x[0]),
    learned: arr(d.learned, 20).map(x => [txt(x[0]), txt(x[1]), day(x[2])]).filter(x => x[0]),
    cefr: arr(d.cefr, 7).map(x => [String(x[0]), int(x[1]), int(x[2])]).filter(x => GALLERY_CEFR.includes(x[0])),
    scenes: arr(d.scenes, 15).map(x => [txt(x[0]), int(x[1], 10000), int(x[2], 10000)]).filter(x => x[0]),
    ach: d.ach && typeof d.ach === 'object' ? { lv: int(d.ach.lv, 999), xp: int(d.ach.xp, 100000000), place: int(d.ach.place, 50), n: int(d.ach.n, 500), total: int(d.ach.total, 500),
      recent: arr(d.ach.recent, 8).filter(x => /^[a-zA-Z0-9_]{1,24}$/.test(String(x[0]))).map(x => [String(x[0]), int(x[1], 1000000)]) } : null,
  };
}
// Pro plan: given per e-mail by an admin (plans table). PRO_REQUIRED=1 turns the lock on.
const proRequired = env => String(env.PRO_REQUIRED || '').trim() === '1';
async function proOf(env, me) {
  if (!me || me.anon || !me.email) return { pro: false };
  try {
    const r = (await q(env, `plans?email=eq.${encodeURIComponent(me.email)}&select=plan,until`) || [])[0];
    if (r && (!r.until || Date.parse(r.until) > Date.now())) return { pro: true, until: r.until || null };
  } catch (e) {}                                                                 // table not made yet
  return { pro: false };
}
// The report is kept only while the learner shares it with a group.
async function sharesReport(env, uid) {
  try { return !!(await q(env, `class_members?user_id=eq.${uid}&report=is.true&select=class_id&limit=1`) || []).length; }
  catch (e) { return false; }
}
async function dropReportIfUnshared(env, uid) {
  if (await sharesReport(env, uid)) return;
  await q(env, `learner_reports?user_id=eq.${uid}`, { method: 'DELETE' }).catch(() => {});
}
async function classes(request, env, url, ctx) {
  if (!env.SUPABASE_SECRET_KEY) return error('not_configured', 503);
  const me = await userInfo(request, env);
  if (!me) return error('unauthorized', 401);
  const uid = me.uid, parts = url.pathname.split('/').filter(Boolean);   // api, classes, <id|join|progress>, …
  const m = request.method, id = parts[2];
  try {
    if (!id && m === 'GET') {
      const teaching = await q(env, `classes?owner=eq.${uid}&select=*&order=created_at.desc`) || [];     // * : works before the kind column exists
      const mem = await q(env, `class_members?user_id=eq.${uid}&select=*`) || [];
      const learn = mem.length ? await q(env, `classes?id=${inList(mem.map(x => x.class_id))}&select=*`) || [] : [];
      const counts = {};
      if (teaching.length) for (const r of await q(env, `class_members?class_id=${inList(teaching.map(c => c.id))}&select=class_id`) || []) counts[r.class_id] = (counts[r.class_id] || 0) + 1;
      const mine = new Map(mem.map(x => [x.class_id, x]));
      const plan = me.anon ? undefined : { ...(await proOf(env, me)), required: proRequired(env) };
      return json({ teaching: teaching.map(c => ({ id: c.id, code: c.code, name: c.name, created_at: c.created_at, kind: c.kind || 'class', members: counts[c.id] || 0 })),
        learning: learn.map(c => ({ id: c.id, name: c.name, kind: c.kind || 'class', nickname: (mine.get(c.id) || {}).nickname, report: !!(mine.get(c.id) || {}).report })), plan });
    }
    if (!id && m === 'POST') {
      if (me.anon) return error('student_account', 403);
      const body = await request.json().catch(() => ({}));
      const name = String(body.name || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 60);
      if (!name) return error('bad_request', 400);
      const kind = body.kind === 'family' ? 'family' : 'class';
      const mine = await q(env, `classes?owner=eq.${uid}&select=id`) || [];
      if (mine.length >= MAX_CLASSES) return error('too_many_classes', 429);
      for (let tries = 0; tries < 6; tries++) {
        const row = { id: newShareId(), code: newClassCode(), owner: uid, name, ...(kind === 'family' ? { kind } : {}) };
        try { await q(env, 'classes', { method: 'POST', headers: { prefer: 'return=minimal' }, body: JSON.stringify(row) }); return json({ id: row.id, code: row.code, name, kind }); }
        catch (e) { if (e.status === 409) continue; if (kind === 'family' && e.status === 400) return error('needs_update', 503); throw e; }   // code taken → try another; kind column not added yet
      }
      return error('db_error', 502);
    }
    if (id === 'join' && m === 'POST') {
      if (env.SCAN_LIMITER) { try { const { success } = await env.SCAN_LIMITER.limit({ key: 'join:' + uid }); if (!success) return error('rate_limited', 429); } catch (e) {} }
      const body = await request.json().catch(() => ({}));
      const code = String(body.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      const nickname = cleanNick(body.nickname);
      if (!CLASS_CODE.test(code)) return error('bad_code', 400);
      if (!nickname) return error('bad_nickname', 400);
      const c = (await q(env, `classes?code=eq.${code}&select=*`) || [])[0];
      if (!c) return error('bad_code', 404);
      if (c.owner === uid) return error('own_class', 400);
      const members = await q(env, `class_members?class_id=eq.${c.id}&select=user_id`) || [];
      if (!members.some(x => x.user_id === uid) && members.length >= MAX_MEMBERS) return error('class_full', 429);
      const kind = c.kind || 'class', report = kind === 'family' || body.report === true;
      const row = { class_id: c.id, user_id: uid, nickname };
      const put = r => q(env, 'class_members?on_conflict=class_id,user_id', { method: 'POST', headers: { prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(r) });
      let shared = report;
      try { await put({ ...row, report }); }
      catch (e) { if (e.status !== 400) throw e; await put(row); shared = false; }   // report column not added yet
      return json({ id: c.id, name: c.name, nickname, kind, report: shared });
    }
    if (id === 'report' && m === 'POST') {
      const body = await request.json().catch(() => ({}));
      if (!(await sharesReport(env, uid))) { await q(env, `learner_reports?user_id=eq.${uid}`, { method: 'DELETE' }).catch(() => {}); return json({ ok: true, shared: false }); }
      const data = cleanReport(body.data);
      if (!data) return error('bad_request', 400);
      if (JSON.stringify(data).length > 38000) return error('too_big', 413);
      try { await q(env, 'learner_reports?on_conflict=user_id', { method: 'POST', headers: { prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ user_id: uid, data, updated_at: new Date().toISOString() }) }); }
      catch (e) { if (e.status === 404) return error('needs_update', 503); throw e; }
      return json({ ok: true, shared: true });
    }
    if (id === 'progress' && m === 'POST') {
      const body = await request.json().catch(() => ({}));
      const rows = (Array.isArray(body.rows) ? body.rows : []).slice(0, 300).filter(r => r && SHARE_ID.test(String(r.class_id)) && SHARE_ID.test(String(r.share_id)));
      if (!rows.length) return json({ ok: true, saved: 0 });
      const cids = [...new Set(rows.map(r => r.class_id))];
      const mem = new Set((await q(env, `class_members?user_id=eq.${uid}&class_id=${inList(cids)}&select=class_id`) || []).map(x => x.class_id));
      const items = new Set((await q(env, `class_items?class_id=${inList(cids)}&select=class_id,share_id`) || []).map(x => x.class_id + '/' + x.share_id));
      const n = v => Math.max(0, Math.min(10000, Math.round(+v || 0)));
      const ok = rows.filter(r => mem.has(r.class_id) && items.has(r.class_id + '/' + r.share_id))
        .map(r => { const total = n(r.total); return { class_id: r.class_id, share_id: r.share_id, user_id: uid, total, done: Math.min(n(r.done), total), star: Math.min(n(r.star), total), updated_at: new Date().toISOString() }; });
      if (ok.length) await q(env, 'class_progress?on_conflict=class_id,share_id,user_id', { method: 'POST', headers: { prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(ok) });
      return json({ ok: true, saved: ok.length });
    }
    if (!SHARE_ID.test(id)) return error('not_found', 404);
    const c = (await q(env, `classes?id=eq.${id}&select=*`) || [])[0];          // * : works before the leaderboard column exists
    if (!c) return error('not_found', 404);
    const teacher = c.owner === uid;
    const membership = teacher ? null : (await q(env, `class_members?class_id=eq.${id}&user_id=eq.${uid}&select=*`) || [])[0];
    if (!teacher && !membership) return error('not_found', 404);
    const sub = parts[3];
    if (!sub && m === 'GET') {
      const items = await classItems(env, id);
      if (teacher) {
        const members = (await q(env, `class_members?class_id=eq.${id}&select=*&order=nickname.asc`) || [])
          .map(x => ({ user_id: x.user_id, nickname: x.nickname, joined_at: x.joined_at, report: !!x.report }));
        const progress = await q(env, `class_progress?class_id=eq.${id}&select=share_id,user_id,total,done,star,updated_at`) || [];
        const shared = members.filter(x => x.report).map(x => x.user_id);
        let reports = [];
        if (shared.length) {
          try { reports = (await q(env, `learner_reports?user_id=${inList(shared)}&select=user_id,updated_at,s:data->s`) || [])
            .map(r => ({ user_id: r.user_id, updated_at: r.updated_at, s: r.s || (r.data && r.data.s) || {} })); }
          catch (e) {}                                                         // table not made yet
        }
        const plan = { ...(await proOf(env, me)), required: proRequired(env) };
        return json({ role: 'teacher', id: c.id, code: c.code, name: c.name, kind: c.kind || 'class', leaderboard: !!c.leaderboard, items, members, progress, reports, plan });
      }
      const progress = await q(env, `class_progress?class_id=eq.${id}&user_id=eq.${uid}&select=share_id,total,done,star,updated_at`) || [];
      let board = null;
      if (c.leaderboard) {
        const members = await q(env, `class_members?class_id=eq.${id}&select=user_id,nickname`) || [];
        const all = await q(env, `class_progress?class_id=eq.${id}&select=share_id,user_id,done,star`) || [];
        board = leaderboard(members, all, new Set(items.map(i => i.share_id)), uid);
      }
      return json({ role: 'student', id: c.id, name: c.name, kind: c.kind || 'class', nickname: membership.nickname, report: !!membership.report, items, progress, leaderboard: board });
    }
    if (sub === 'members' && m === 'DELETE' && parts[4]) {
      const who = parts[4] === 'me' ? uid : parts[4];
      if (!teacher && who !== uid) return error('forbidden', 403);
      if (!/^[0-9a-f-]{36}$/i.test(who)) return error('bad_request', 400);
      await q(env, `class_members?class_id=eq.${id}&user_id=eq.${who}`, { method: 'DELETE' });
      await dropReportIfUnshared(env, who);
      return json({ ok: true });
    }
    if (sub === 'members' && m === 'PATCH' && parts[4] === 'me') {
      if (teacher) return error('forbidden', 403);
      const body = await request.json().catch(() => ({}));
      if ((c.kind || 'class') === 'family' && body.report === false) return error('family_report', 400);   // a family group is for the report
      const on = body.report === true;
      try { await q(env, `class_members?class_id=eq.${id}&user_id=eq.${uid}`, { method: 'PATCH', body: JSON.stringify({ report: on }) }); }
      catch (e) { if (e.status === 400) return error('needs_update', 503); throw e; }
      if (!on) await dropReportIfUnshared(env, uid);
      return json({ ok: true, report: on });
    }
    if (sub === 'report' && m === 'GET' && teacher) {
      const who = parts[4];
      if (!UUID.test(who || '')) return error('bad_request', 400);
      const mb = (await q(env, `class_members?class_id=eq.${id}&user_id=eq.${who}&select=*`) || [])[0];
      if (!mb) return error('not_found', 404);
      if (!mb.report) return error('not_shared', 403);
      const plan = await proOf(env, me);
      if (proRequired(env) && !plan.pro) return error('pro_required', 402);
      let r = null;
      try { r = (await q(env, `learner_reports?user_id=eq.${who}&select=data,updated_at`) || [])[0]; }
      catch (e) { if (e.status === 404) return error('needs_update', 503); throw e; }
      return json({ nickname: mb.nickname, joined_at: mb.joined_at, updated_at: r ? r.updated_at : null, data: r ? r.data : null });
    }
    if (!teacher) return error('forbidden', 403);
    if (!sub && m === 'DELETE') { await q(env, `classes?id=eq.${id}`, { method: 'DELETE' }); return json({ ok: true }); }
    if (!sub && m === 'PATCH') {
      const body = await request.json().catch(() => ({}));
      const patch = {};
      if (body.name !== undefined) {
        const name = String(body.name || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 60);
        if (!name) return error('bad_request', 400);
        patch.name = name;
      }
      if (body.leaderboard !== undefined) patch.leaderboard = body.leaderboard === true;
      if (!Object.keys(patch).length) return error('bad_request', 400);
      try { await q(env, `classes?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify(patch) }); }
      catch (e) { if ('leaderboard' in patch && e.status === 400) return error('needs_update', 503); throw e; }   // column not added yet
      return json({ ok: true, ...patch });
    }
    if (sub === 'items' && m === 'POST') {
      const body = await request.json().catch(() => ({}));
      const sid = String(body.share_id || '');
      const sh = SHARE_ID.test(sid) ? await getShare(env, sid) : null;
      if (!sh || sh.owner !== uid) return error('bad_share', 400);
      const lang = body.lang === undefined ? 'en' : String(body.lang);
      if (!CLASS_LANGS.has(lang)) return error('bad_request', 400);
      const have = await q(env, `class_items?class_id=eq.${id}&select=*`) || [];
      const same = have.find(x => x.share_id === sid);
      if (same && (same.lang || 'en') !== lang) return error('other_lang', 409);           // already assigned in another language
      if (!same && have.length >= MAX_ITEMS) return error('too_many_items', 429);
      try { await q(env, 'class_items?on_conflict=class_id,share_id', { method: 'POST', headers: { prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify({ class_id: id, share_id: sid, ...(lang !== 'en' ? { lang } : {}) }) }); }
      catch (e) { if (lang !== 'en' && e.status === 400) return error('needs_update', 503); throw e; }   // lang column not added yet
      return json({ ok: true, lang });
    }
    if (sub === 'items' && m === 'DELETE' && parts[4]) {
      await q(env, `class_items?class_id=eq.${id}&share_id=eq.${parts[4]}`, { method: 'DELETE' });
      return json({ ok: true });
    }
    return error('method_not_allowed', 405);
  } catch (e) {
    console.log('classes error', e && e.message);
    return error('db_error', 502);
  }
}
// ---------- trial tools: feedback, errors on people's devices, usage counts (supabase/2026-11-trial.sql) ----------
const FEEDBACK_KINDS = ['problem', 'idea', 'other'];
export function cleanFeedback(b) {
  const kind = FEEDBACK_KINDS.includes(b && b.kind) ? b.kind : 'other';
  const message = String((b && b.message) || '').replace(/\r/g, '').trim().slice(0, 2000);
  const contact = String((b && b.contact) || '').trim().slice(0, 200);
  return { kind, message, contact: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact) ? contact : '',
    page: String((b && b.page) || '').slice(0, 80), ui: (b && b.ui) === 'en' ? 'en' : 'th' };
}
async function feedback(request, env, ctx) {
  if (request.method !== 'POST') return error('method_not_allowed', 405);
  if (!env.SUPABASE_SECRET_KEY) return error('not_configured', 503);
  if (env.SCAN_LIMITER) { try { const { success } = await env.SCAN_LIMITER.limit({ key: 'fb:' + (request.headers.get('cf-connecting-ip') || 'x') }); if (!success) return error('rate_limited', 429); } catch (e) {} }
  const f = cleanFeedback(await request.json().catch(() => ({})));
  if (!f.message) return error('empty', 400);
  const who = request.headers.get('authorization') ? await userInfo(request, env) : null;
  const ua = String(request.headers.get('user-agent') || '').slice(0, 300);
  try {
    await q(env, 'feedback', { method: 'POST', headers: { prefer: 'return=minimal' },
      body: JSON.stringify({ ...f, contact: f.contact || null, user_id: who ? who.uid : null, ua }) });
  } catch (e) { console.log('feedback failed', e && e.message); return error(e.status === 404 ? 'not_configured' : 'db_error', e.status === 404 ? 503 : 502); }
  const origin = new URL(request.url).origin;
  const mail = feedbackMail(f, who, ua, origin);
  notifyAdmin(env, ctx, mail.title, [], origin, '', { to: env.FEEDBACK_EMAIL, replyTo: f.contact || undefined, html: mail.html, text: mail.text });   // FEEDBACK_EMAIL (if set) instead of ADMIN_NOTIFY_EMAIL
  return json({ ok: true });
}
// Thai calendar day, as YYYY-MM-DD
const thaiDay = (now = new Date()) => new Date(now.getTime() + 7 * 3600e3).toISOString().slice(0, 10);
async function sha16(text) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(d)].slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
}
// A JavaScript error on someone's device. Best effort: always answers 204, never says why.
async function clientError(request, env) {
  if (request.method !== 'POST') return error('method_not_allowed', 405);
  if (!env.SUPABASE_SECRET_KEY) return new Response(null, { status: 204 });
  if (env.SCAN_LIMITER) { try { const { success } = await env.SCAN_LIMITER.limit({ key: 'log:' + (request.headers.get('cf-connecting-ip') || 'x') }); if (!success) return new Response(null, { status: 204 }); } catch (e) {} }
  const b = await request.json().catch(() => null);
  const msg = String((b && b.msg) || '').slice(0, 300);
  if (!msg) return new Response(null, { status: 204 });
  // only our own files (not browser extensions); keep the path, not the query
  const src = String((b && b.src) || '').replace(/^https?:\/\/[^/]+/, '').replace(/[?#].*$/, '').slice(0, 200);
  if (/^(chrome|moz|safari)-extension:/.test(String(b.src || ''))) return new Response(null, { status: 204 });
  const line = Number.isFinite(b.line) ? b.line : 0;
  const stack = String(b.stack || '').replace(/https?:\/\/[^/\s)]+/g, '').slice(0, 1500);
  console.log('client error', msg, src + ':' + line);
  try {
    await sbRest(env, 'rpc/client_error_add', { method: 'POST', body: JSON.stringify({ p_day: thaiDay(), p_sig: await sha16(msg + '|' + src + '|' + line),
      p_msg: msg, p_src: src ? `${src}:${line}` : '', p_stack: stack, p_page: String(b.page || '').slice(0, 80), p_ua: String(request.headers.get('user-agent') || '').slice(0, 300) }) });
  } catch (e) {}
  return new Response(null, { status: 204 });
}
// Usage counts: only names from this list, small numbers, no ids.
export const USAGE_EVENTS = ['open', 'open_signed', 'update_reload', 'mail_on', 'mail_off', 'mail_preview', 'new_device', 'age:0', 'age:1-6', 'age:7-29', 'age:30+', 'ui:en', 'lang:de', 'installed',
  'mode:learn', 'mode:quiz', 'mode:find', 'mode:speak', 'mode:sent', 'review', 'mock', 'scene_new', 'ai_scene', 'sheet_new', 'share', 'class_join', 'family_new', 'report_view', 'report_share', 'feedback', 'gallery_add',
  'sent_round', 'sent_ai', 'path', 'stage:p12', 'stage:p34', 'stage:p56', 'stage:m13', 'stage:m46', 'stage:adult', 'print_cards', 'journey', 'badge', 'find_reveal', 'combo', 'round_end', 'round_3stars', 'chest_c', 'chest_r', 'chest_l', 'quest', 'quest_all', 'challenge_normal', 'challenge_time', 'challenge_hearts', 'hearts_out', 'boss', 'boss_win', 'sheet_pics', 'sheet_pics_retry', 'sheet_pic_redraw', 'match', 'test_sheet'];
export function cleanUsage(b) {
  const out = {};
  const ev = (b && typeof b.events === 'object' && b.events) || {};
  for (const k of USAGE_EVENTS) { const n = Math.floor(Number(ev[k])); if (n > 0) out[k] = Math.min(n, 50); }
  const day = /^\d{4}-\d{2}-\d{2}$/.test(String(b && b.day)) ? b.day : null;
  return { day, events: out };
}
async function usage(request, env) {
  if (request.method !== 'POST') return error('method_not_allowed', 405);
  if (!env.SUPABASE_SECRET_KEY) return new Response(null, { status: 204 });
  const u = cleanUsage(await request.json().catch(() => null));
  const today = thaiDay(), yesterday = thaiDay(new Date(Date.now() - 86400e3));
  const day = u.day === today || u.day === yesterday ? u.day : today;          // counts kept offline overnight still land on their day
  if (!Object.keys(u.events).length) return new Response(null, { status: 204 });
  try { await sbRest(env, 'rpc/usage_add', { method: 'POST', body: JSON.stringify({ p_day: day, p_events: u.events }) }); } catch (e) {}
  return new Response(null, { status: 204 });
}

// ---------- picture library (คลังภาพ): ready-made scenes in categories (supabase/2026-11-gallery.sql) ----------
export const GALLERY_LEVELS = ['beginner', 'intermediate', 'advanced'];
const GAL_ID = /^[a-z0-9]{6,24}$/;
// Clean the items of a library scene (the shape scenes use: {id: {word, th, alts, x, y, w, h, l}}); boxes kept inside the picture.
export function cleanGalleryItems(items, w, h) {
  const out = {}; let n = 0;
  for (const [k, it] of Object.entries(items && typeof items === 'object' ? items : {})) {
    if (n >= 60 || !/^[A-Za-z0-9_-]{1,24}$/.test(k) || !it || typeof it.word !== 'string') continue;
    const word = it.word.trim().replace(/\s+/g, ' ').slice(0, 60); if (!word) continue;
    const num = v => Math.round(Number(v));
    let x = num(it.x), y = num(it.y), bw = num(it.w), bh = num(it.h);
    if (![x, y, bw, bh].every(Number.isFinite)) continue;
    x = Math.max(0, Math.min(w - 4, x)); y = Math.max(0, Math.min(h - 4, y));
    bw = Math.max(4, Math.min(w - x, bw)); bh = Math.max(4, Math.min(h - y, bh));
    const o = { word, th: String(it.th || '').trim().slice(0, 120),
      alts: (Array.isArray(it.alts) ? it.alts : []).filter(a => typeof a === 'string' && a.trim()).slice(0, 4).map(a => a.trim().slice(0, 60)), x, y, w: bw, h: bh };
    if (cleanCefr(it.cefr)) o.cefr = cleanCefr(it.cefr);
    if (it.l && typeof it.l === 'object') {
      const l = {};
      for (const lg of Object.keys(AI_LANGS)) { const v = it.l[lg]; if (v && typeof v === 'object') { const c = cleanLangWord({ w: v.w, a: v.a, alts: v.alts }); if (c.w) l[lg] = c; } }
      if (Object.keys(l).length) o.l = l;
    }
    out[k] = o; n++;
  }
  return out;
}
// Sentences about a library scene, for the sentence game: [{en, th, words}] (words = the scene's words used in it).
export function cleanGallerySentences(list) {
  const str = (v, n) => String(v == null ? '' : v).trim().replace(/\s+/g, ' ').slice(0, n);
  const out = [], seen = new Set();
  for (const r of Array.isArray(list) ? list : []) {
    if (out.length >= 12) break;
    const en = str(r && r.en, 160); if (!en || seen.has(en.toLowerCase())) continue;
    seen.add(en.toLowerCase());
    const words = [...new Set((Array.isArray(r.words) ? r.words : []).map(w => str(w, 60).toLowerCase()).filter(Boolean))].slice(0, 8);
    out.push({ en, th: str(r.th, 240), words });
  }
  return out;
}
export const GALLERY_STAGES = ['p12', 'p34', 'p56', 'm13', 'm46', 'adult'];
// A word's CEFR level for learners of English ("pre-A1", "PreA1", "a1" … → preA1, A1 … C2), or '' when unknown.
export function cleanCefr(v) {
  const t = String(v == null ? '' : v).replace(/[\s_-]+/g, '').toLowerCase();
  if (t === 'prea1') return 'preA1';
  return /^[abc][12]$/.test(t) ? t.toUpperCase() : '';
}
export const GALLERY_CEFR = ['preA1', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const GALLERY_STAGE_OF = { beginner: 'p12', intermediate: 'p56', advanced: 'm13' };
const GALLERY_CEFR_OF = { p12: 'preA1', p34: 'A1', p56: 'A1', m13: 'A2', m46: 'B1', adult: 'B2' };
export function cleanGalleryScene(b, partial) {
  const o = {};
  const str = (v, n) => String(v == null ? '' : v).trim().replace(/\s+/g, ' ').slice(0, n);
  if (!partial || 'category' in b) o.category = str(b.category, 31);
  if (!partial || 'title' in b) o.title = str(b.title, 60);
  if (!partial || 'title_th' in b) o.title_th = str(b.title_th, 60);
  if (!partial || 'level' in b) o.level = GALLERY_LEVELS.includes(b.level) ? b.level : 'beginner';
  if ('published' in b) o.published = !!b.published;
  if ('sort' in b) o.sort = Math.max(-100000, Math.min(100000, Math.round(Number(b.sort)) || 0));
  if ('sentences' in b) o.sentences = cleanGallerySentences(b.sentences);
  // which school years and CEFR level it suits (the learning path); without them, worked out from level
  if (!partial || 'stage' in b) o.stage = GALLERY_STAGES.includes(b.stage) ? b.stage : GALLERY_STAGE_OF[o.level || b.level] || 'p12';
  if (!partial || 'cefr' in b) o.cefr = GALLERY_CEFR.includes(b.cefr) ? b.cefr : GALLERY_CEFR_OF[o.stage || b.stage] || 'preA1';
  if (!partial || 'items' in b) {
    const w = Math.round(Number(b.w)), h = Math.round(Number(b.h));
    if (!(w >= 50 && w <= 4000 && h >= 50 && h <= 4000)) return { error: 'bad_size' };
    o.w = w; o.h = h; o.items = cleanGalleryItems(b.items, w, h); o.word_count = Object.keys(o.items).length;
  }
  if ('category' in o && !/^[a-z][a-z0-9-]{1,30}$/.test(o.category)) return { error: 'bad_category' };
  if ('title' in o && !o.title) return { error: 'no_title' };
  return o;
}
const GAL_LIST = 'id,category,title,title_th,level,w,h,word_count,img_ver,sort';
// Columns added by later SQL files (sentences, stage, cefr): asked for, and left out when that file has not been run yet.
async function galSelect(env, mk, extra) {
  let cols = [...extra];
  for (;;) {
    try { return { rows: await q(env, mk(cols.length ? ',' + cols.join(',') : '')), cols }; }
    catch (e) {
      const m = e.status === 400 && /column [a-z_]+\.([a-z_]+) does not exist/.exec(String(e.body || ''));
      if (!m || !cols.includes(m[1])) throw e;
      cols = cols.filter(c => c !== m[1]);
    }
  }
}
async function galleryPublic(request, env, url) {
  if (request.method !== 'GET') return error('method_not_allowed', 405);
  if (!env.SUPABASE_SECRET_KEY) return json({ categories: [], scenes: [] });
  const id = url.pathname.slice('/api/gallery/'.length);
  try {
    if (id) {
      if (!GAL_ID.test(id)) return error('not_found', 404);
      const { rows: r } = await galSelect(env, c => `gallery_scenes?select=${GAL_LIST},items${c}&id=eq.${id}&published=is.true&img_ver=gt.0`, ['sentences', 'stage', 'cefr']);
      if (!r || !r[0]) return error('not_found', 404);
      return json(r[0]);
    }
    const [categories, scenes] = await Promise.all([
      q(env, 'gallery_categories?select=id,name_th,name_en,emoji,sort&order=sort.asc'),
      // how many sentences each has (for the 💬 badge), and its school years / CEFR level
      // and its words with their CEFR levels (wl: [[word, cefr]]), for counting words by level; not the boxes
      galSelect(env, c => `gallery_scenes?select=${GAL_LIST},items${c}&published=is.true&img_ver=gt.0&order=sort.asc,created_at.asc&limit=1000`, ['sentences', 'stage', 'cefr'])
        .then(({ rows }) => (rows || []).map(({ sentences, items, ...g }) => ({ ...g, sentence_count: Array.isArray(sentences) ? sentences.length : 0,
          wl: Object.values(items || {}).filter(it => it && it.word).map(it => [it.word, cleanCefr(it.cefr)]) }))),
    ]);
    const res = json({ categories: categories || [], scenes: scenes || [] });
    res.headers.set('cache-control', 'public, max-age=60');
    return res;
  } catch (e) {
    if (e.status === 404) return json({ categories: [], scenes: [] });   // tables not made yet
    console.log('gallery failed', e && e.message); return error('db_error', 502);
  }
}
// /g/<id>.webp (picture) and /g/<id>-t.webp (thumbnail). The app adds ?v=<img_ver>, so they can be cached for good.
async function galleryImage(request, env, url) {
  const m = url.pathname.match(/^\/g\/([a-z0-9]{6,24})(-t)?\.(webp|jpg)$/);
  if (!m || !env.IMAGES) return error('not_found', 404);
  const obj = await env.IMAGES.get(`gallery/${m[1]}${m[2] || ''}`);
  if (!obj) return error('not_found', 404);
  return new Response(obj.body, { headers: {
    'content-type': (obj.httpMetadata && obj.httpMetadata.contentType) || 'image/webp',
    'cache-control': 'public, max-age=31536000, immutable',
  } });
}
// Saves a library scene; until supabase/2026-11-gallery-sentences.sql is run the sentences column is missing,
// so it saves the rest and says the sentences were not kept.
// Saves a library scene; a column from a SQL file not run yet (sentences, stage, cefr) is left out, and the reply says so.
async function galSaveSentences(o, save) {
  let x = { ...o };
  const out = {};
  for (;;) {
    try { await save(x); break; }
    catch (e) {
      const m = e.status === 400 && /'([a-z_]+)' column|column [a-z_]+\.([a-z_]+)/.exec(String(e.body || ''));
      const c = m && (m[1] || m[2]);
      if (!c || !(c in x) || !['sentences', 'stage', 'cefr'].includes(c)) throw e;
      delete x[c]; out[c + '_not_saved'] = true;
    }
  }
  if ('sentences' in x) out.sentences = x.sentences.length;
  return out;
}
async function galleryAdmin(request, env, m, id, act, body) {
  if (!id && m === 'GET') {
    try {
      const [categories, sel] = await Promise.all([
        q(env, 'gallery_categories?select=id,name_th,name_en,emoji,sort&order=sort.asc'),
        galSelect(env, c => `gallery_scenes?select=${GAL_LIST},items,published,created_at,updated_at${c}&order=sort.asc,created_at.asc&limit=2000`, ['sentences', 'stage', 'cefr']),
      ]);
      // a SQL file not run yet: the admin page says which
      return json({ categories: categories || [], scenes: sel.rows || [], ...(!sel.cols.includes('sentences') ? { no_sentences: true } : {}),
        ...(!sel.cols.includes('stage') ? { no_stage: true } : {}) });
    } catch (e) { if (e.status === 404) return json({ setup: true }); throw e; }
  }
  if (!id && m === 'POST') {
    const o = cleanGalleryScene(body, false);
    if (o.error) return error(o.error, 400);
    const nid = [...crypto.getRandomValues(new Uint8Array(8))].map(b => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join('') + Date.now().toString(36).slice(-4);
    const save = x => q(env, 'gallery_scenes', { method: 'POST', headers: { prefer: 'return=minimal' }, body: JSON.stringify({ ...x, id: nid, published: false }) });
    const r = await galSaveSentences(o, save);
    return json({ id: nid, ...r });
  }
  if (!GAL_ID.test(id || '')) return error('bad_id', 400);
  // CEFR levels for a scene's words from AI (the words only, no picture): the words without one, or all with ?all=1
  if (act === 'cefr' && m === 'POST') {
    const r = await q(env, `gallery_scenes?select=items&id=eq.${id}`);
    if (!r || !r[0]) return error('not_found', 404);
    const items = r[0].items || {}, all = new URL(request.url).searchParams.get('all') === '1';
    const want = [...new Set(Object.values(items).filter(it => it && it.word && (all || !cleanCefr(it.cefr))).map(it => it.word))];
    if (!want.length) return json({ ok: true, set: 0 });
    const providers = pickProviders(env);
    if (!providers.length) return error('not_configured', 503);
    const log = [];
    const res = await runAI(env, providers, null, null, () => buildCefrPrompt(want), parseCefr, log);
    await saveUsage(env, 'translate', log);
    if (!res.ok) return res;
    const got = (await res.json()).items || {};
    let set = 0;
    for (const it of Object.values(items)) {
      const c = it && cleanCefr(got[String(it.word).toLowerCase()]);
      if (c && (all || !cleanCefr(it.cefr))) { it.cefr = c; set++; }
    }
    if (set) await q(env, `gallery_scenes?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ items, updated_at: new Date().toISOString() }) });
    return json({ ok: true, set });
  }
  if (act === 'img' && m === 'PUT') {
    const thumb = new URL(request.url).searchParams.get('thumb') === '1';
    const type = (request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!['image/webp', 'image/jpeg'].includes(type)) return error('bad_image', 400);
    const data = await request.arrayBuffer();
    if (!data.byteLength || data.byteLength > 4 * 1024 * 1024) return error('image_too_large', 413);
    const r = await q(env, `gallery_scenes?select=img_ver&id=eq.${id}`);
    if (!r || !r[0]) return error('not_found', 404);
    await env.IMAGES.put(`gallery/${id}${thumb ? '-t' : ''}`, data, { httpMetadata: { contentType: type } });
    if (thumb) return json({ ok: true });
    const v = (r[0].img_ver || 0) + 1;
    await q(env, `gallery_scenes?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ img_ver: v, updated_at: new Date().toISOString() }) });
    return json({ ok: true, img_ver: v });
  }
  if (!act && m === 'PATCH') {
    const o = cleanGalleryScene(body, true);
    if (o.error) return error(o.error, 400);
    const r = await galSaveSentences(o, x => q(env, `gallery_scenes?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ ...x, updated_at: new Date().toISOString() }) }));
    return json({ ok: true, ...r });
  }
  if (!act && m === 'DELETE') {
    await q(env, `gallery_scenes?id=eq.${id}`, { method: 'DELETE' });
    await env.IMAGES.delete([`gallery/${id}`, `gallery/${id}-t`]).catch(() => {});
    return json({ ok: true });
  }
  return error('not_found', 404);
}

// ---------- reports → e-mail, and the admin API ----------
// E-mail to the people who look after Piccab (ADMIN_NOTIFY_EMAIL, default contact@piccab.com) through Resend.
export function adminMailHtml(title, rows, link, foot = 'ส่งอัตโนมัติจาก Piccab เมื่อมีผู้ใช้กดรายงาน') {
  const tr = rows.map(([k, v]) => `<tr><td style="padding:6px 12px 6px 0;color:#77728c;white-space:nowrap;vertical-align:top">${esc(k)}</td><td style="padding:6px 0">${esc(v)}</td></tr>`).join('');
  return `<div style="font-family:Sarabun,system-ui,sans-serif;color:#2d2a5a;max-width:560px"><h2 style="margin:0 0 12px">⚠️ ${esc(title)}</h2><table style="border-collapse:collapse;font-size:15px">${tr}</table>`
    + `<p style="margin:18px 0"><a href="${esc(link)}" style="background:#2d2a5a;color:#fff;padding:10px 16px;border-radius:10px;text-decoration:none">เปิดหน้าดูแลระบบ</a></p>`
    + `<p style="color:#77728c;font-size:13px">${esc(foot)}</p></div>`;
}
// The feedback e-mail: pressing Reply quotes it to the person who wrote, so their message comes first,
// the details (device, page) small under it, and only a small link to the admin page.
const FB_KIND_TH = { problem: 'แจ้งปัญหา', idea: 'ไอเดีย / อยากให้มี', other: 'อื่นๆ' };
export function feedbackMail(f, who, ua, origin) {
  const kind = FB_KIND_TH[f.kind] || FB_KIND_TH.other;
  const short = f.message.replace(/\s+/g, ' ').slice(0, 50) + (f.message.length > 50 ? '…' : '');
  const by = who ? (who.anon ? 'บัญชีนักเรียน' : who.email || 'ผู้ใช้ที่เข้าสู่ระบบ') : 'ไม่ได้เข้าสู่ระบบ';
  const details = [['ตอบกลับที่', f.contact || '- (ไม่ได้ใส่อีเมล ตอบกลับไม่ได้)'], ['บัญชี', by], ['หน้า', f.page || '-'], ['อุปกรณ์', ua || '-']];
  const link = origin + '/admin?tab=feedback';
  const html = `<div style="font-family:Sarabun,system-ui,sans-serif;color:#2d2a5a;max-width:560px">`
    + `<p style="margin:0 0 8px;font-size:13px;color:#77728c">💬 ความเห็นจากผู้ใช้ Piccab · ${esc(kind)}</p>`
    + `<div style="font-size:16px;line-height:1.6;white-space:pre-wrap;border-left:3px solid #e4dacd;padding:2px 0 2px 12px;margin:0 0 16px">${esc(f.message)}</div>`
    + `<p style="margin:0;font-size:12px;line-height:1.6;color:#9a94ad">${details.map(([k, v]) => `${esc(k)}: ${esc(v)}`).join('<br>')}</p>`
    + `<p style="margin:10px 0 0;font-size:12px"><a href="${esc(link)}" style="color:#9a94ad">ดูในหน้าดูแลระบบ</a></p></div>`;
  const text = `${f.message}\n\n— ความเห็นจากผู้ใช้ Piccab · ${kind}\n${details.map(([k, v]) => `${k}: ${v}`).join('\n')}\n${link}`;
  return { title: `ความเห็น (${kind}): ${short}`, html, text };
}
// opts: { to: other addresses (comma-separated), replyTo: the person to answer, html/text: a ready-made e-mail }
export function notifyTo(env, opts) {
  return String((opts && opts.to) || env.ADMIN_NOTIFY_EMAIL || 'contact@piccab.com').split(',').map(x => x.trim()).filter(Boolean);
}
function notifyAdmin(env, ctx, title, rows, origin, foot, opts) {
  if (!env.RESEND_API_KEY) return;
  const to = notifyTo(env, opts);
  const text = (opts && opts.text) || rows.map(([k, v]) => `${k}: ${v}`).join('\n') + `\n\n${origin}/admin`;
  const send = fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: env.MAIL_FROM || 'Piccab <no-reply@piccab.com>', to, subject: `[Piccab] ${title}`, html: (opts && opts.html) || adminMailHtml(title, rows, origin + '/admin', foot), text,
      ...(opts && opts.replyTo ? { reply_to: opts.replyTo } : {}) }),
  }).then(r => { if (!r.ok) console.log('report mail failed', r.status); }).catch(e => console.log('report mail error', e && e.message));
  if (ctx && ctx.waitUntil) ctx.waitUntil(send);
}
// Anyone who opened a share link can report it (signed in or not); rate-limited per IP.
async function reportShare(request, env, ctx) {
  if (request.method !== 'POST') return error('method_not_allowed', 405);
  if (!env.SUPABASE_SECRET_KEY) return error('not_configured', 503);
  if (env.SCAN_LIMITER) { try { const { success } = await env.SCAN_LIMITER.limit({ key: 'report:' + (request.headers.get('cf-connecting-ip') || 'x') }); if (!success) return error('rate_limited', 429); } catch (e) {} }
  const body = await request.json().catch(() => ({}));
  const sid = String(body.share_id || ''), reason = String(body.reason || '').slice(0, 300);
  const sh = SHARE_ID.test(sid) ? await getShare(env, sid).catch(() => null) : null;
  if (!sh) return error('not_found', 404);
  const who = request.headers.get('authorization') ? await userInfo(request, env) : null;
  try {
    await q(env, 'friend_reports', { method: 'POST', headers: { prefer: 'return=minimal' }, body: JSON.stringify({ reporter: who ? who.uid : null, reported: sh.owner, share_id: sid, reason }) });
  } catch (e) { console.log('report share failed', e && e.message); return error('db_error', 502); }
  const origin = new URL(request.url).origin;
  notifyAdmin(env, ctx, `รายงานลิงก์แชร์: ${sh.name}`, [['ประเภท', 'รายงานลิงก์แชร์ (' + (sh.kind === 'deck' ? 'ชุดคำ' : 'ฉาก') + ')'], ['ลิงก์', `${origin}/s/${sid}`], ['เหตุผล', reason || '-'],
    ['ผู้รายงาน', who ? (who.anon ? 'บัญชีนักเรียน' : 'ผู้ใช้ที่เข้าสู่ระบบ') : 'ไม่ได้เข้าสู่ระบบ']], origin);
  return json({ ok: true });
}
// Admins: signed-in accounts whose e-mail is in ADMIN_EMAILS (comma-separated, a Worker variable).
const isAdmin = (env, who) => !!(who && !who.anon && who.email && String(env.ADMIN_EMAILS || '').toLowerCase().split(',').map(x => x.trim()).filter(Boolean).includes(who.email));
async function authAdmin(env, path, init = {}) {
  const key = env.SUPABASE_SECRET_KEY;
  return fetch(`${env.SUPABASE_URL || SUPABASE_URL}/auth/v1/admin/${path}`, { ...init, headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json', ...(init.headers || {}) } });
}
async function banStatus(env, uid) {
  const r = await authAdmin(env, `users/${uid}`).catch(() => null);
  if (!r || !r.ok) return { exists: !!(r && r.status !== 404), banned: false };
  const u = await r.json().catch(() => ({}));
  return { exists: true, banned: !!(u.banned_until && Date.parse(u.banned_until) > Date.now()), anon: u.is_anonymous === true, email: u.email || '' };
}
async function admin(request, env, url) {
  if (!env.SUPABASE_SECRET_KEY) return error('not_configured', 503);
  const who = await userInfo(request, env);
  if (!isAdmin(env, who)) return error('not_found', 404);                       // look like nothing is here
  const parts = url.pathname.split('/').filter(Boolean);                         // api, admin, …
  const m = request.method, what = parts[2], id = parts[3], act = parts[4];
  const body = m === 'POST' || m === 'PATCH' ? await request.json().catch(() => ({})) : {};
  try {
    if (what === 'me' && m === 'GET') return json({ admin: true });
    if (what === 'ai-usage' && m === 'GET') return json(await aiUsageReport(env));
    if (what === 'compare' && m === 'POST') return await compareAI(env, body);
    if (what === 'gallery') return await galleryAdmin(request, env, m, id, act, body);
    if (what === 'feedback' && !id && m === 'GET') {
      const all = url.searchParams.get('all') === '1';
      try {
        const rows = await q(env, `feedback?select=id,created_at,kind,message,contact,page,ui,ua,resolved_at,note,user_id&order=created_at.desc&limit=200${all ? '' : '&resolved_at=is.null'}`) || [];
        const open = all ? (await q(env, 'feedback?select=id&resolved_at=is.null&limit=1000') || []).length : rows.length;
        return json({ feedback: rows.map(r => ({ ...r, user_id: undefined, signed_in: !!r.user_id })), open });
      } catch (e) { if (e.status === 404) return json({ setup: true }); throw e; }
    }
    if (what === 'feedback' && /^\d+$/.test(id || '') && act === 'resolve' && m === 'POST') {
      await q(env, `feedback?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ resolved_at: body.reopen ? null : new Date().toISOString(), note: String(body.note || '').slice(0, 300) || null }) });
      return json({ ok: true });
    }
    if (what === 'errors' && m === 'GET') {
      try {
        const since = thaiDay(new Date(Date.now() - 13 * 86400e3));
        const rows = await q(env, `client_errors?select=day,msg,src,stack,page,ua,n,last_at&day=gte.${since}&order=last_at.desc&limit=300`) || [];
        return json({ errors: rows });
      } catch (e) { if (e.status === 404) return json({ setup: true }); throw e; }
    }
    if (what === 'stats' && m === 'GET') {
      const since = thaiDay(new Date(Date.now() - 29 * 86400e3));
      const st = await sbRest(env, 'rpc/trial_stats', { method: 'POST', body: '{}' });
      if (st.status === 404) return json({ setup: true });
      if (!st.ok) throw new Error('trial_stats ' + st.status);
      const days = await q(env, `usage_daily?select=day,event,n&day=gte.${since}&order=day.asc`) || [];
      if (Math.random() < 0.05) sbRest(env, 'rpc/trial_cleanup', { method: 'POST', body: '{}' }).catch(() => {});
      return json({ totals: await st.json(), days, today: thaiDay() });
    }
    if (what === 'reports' && !id && m === 'GET') {
      const all = url.searchParams.get('all') === '1';
      const reps = await q(env, `friend_reports?select=*&order=created_at.desc&limit=200${all ? '' : '&resolved_at=is.null'}`) || [];
      const ids = [...new Set(reps.flatMap(r => [r.reporter, r.reported]).filter(Boolean))];
      const profs = ids.length ? await q(env, `friend_profiles?user_id=${inList(ids)}&select=user_id,nickname,code,student`) || [] : [];
      const P = new Map(profs.map(p => [p.user_id, p]));
      const counts = {};
      for (const r of await q(env, 'friend_reports?select=reported') || []) if (r.reported) counts[r.reported] = (counts[r.reported] || 0) + 1;
      const reported = [...new Set(reps.map(r => r.reported).filter(Boolean))].slice(0, 60);
      const bans = Object.fromEntries(await Promise.all(reported.map(async u => [u, await banStatus(env, u)])));
      const card = u => u ? { id: u, nickname: (P.get(u) || {}).nickname || null, code: (P.get(u) || {}).code || null, student: !!(P.get(u) || {}).student } : null;
      return json({ reports: reps.map(r => ({ id: r.id, created_at: r.created_at, reason: r.reason, share_id: r.share_id || null, resolved_at: r.resolved_at || null, note: r.note || null,
        reporter: card(r.reporter), reported: r.reported ? { ...card(r.reported), email: (bans[r.reported] && bans[r.reported].email) || null, anon: !!(bans[r.reported] && bans[r.reported].anon), reports: counts[r.reported] || 0, banned: !!(bans[r.reported] && bans[r.reported].banned), gone: !!(bans[r.reported] && !bans[r.reported].exists) } : null })) });
    }
    if (what === 'reports' && /^\d+$/.test(id || '') && !act && m === 'GET') {
      const r = (await q(env, `friend_reports?id=eq.${id}&select=*`) || [])[0];
      if (!r) return error('not_found', 404);
      const since = new Date(Date.now() - 30 * 86400000).toISOString();
      const sent = r.reported && r.reporter ? await q(env, `friend_events?from_user=eq.${r.reported}&to_user=eq.${r.reporter}&created_at=gte.${since}&select=kind,data,created_at&order=created_at.desc&limit=50`) || [] : [];
      const shares = r.reported ? await q(env, `shares?owner=eq.${r.reported}&select=id,kind,name,updated_at&order=updated_at.desc&limit=30`) || [] : [];
      const classes = r.reported ? await q(env, `class_members?user_id=eq.${r.reported}&select=class_id,nickname`) || [] : [];
      return json({ sent, shares, classes });
    }
    if (what === 'reports' && /^\d+$/.test(id || '') && act === 'resolve' && m === 'POST') {
      await q(env, `friend_reports?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ resolved_at: body.reopen ? null : new Date().toISOString(), note: String(body.note || '').slice(0, 300) || null }) });
      return json({ ok: true });
    }
    if (what === 'users' && UUID.test(id || '') && act === 'suspend' && m === 'POST') {
      const on = body.on !== false;
      const r = await authAdmin(env, `users/${id}`, { method: 'PUT', body: JSON.stringify({ ban_duration: on ? '876000h' : 'none' }) });
      if (!r.ok) { console.log('ban failed', r.status); return error('ban_failed', 502); }
      if (on) {                                                                   // out of friends right away
        await q(env, `friendships?or=(a.eq.${id},b.eq.${id})`, { method: 'DELETE' });
        await q(env, `friend_events?from_user=eq.${id}`, { method: 'DELETE' });   // (profile kept so reports still show the nickname)
        for (const [t, v] of userCache) if (v.uid === id) userCache.delete(t);
      }
      return json({ ok: true, banned: on });
    }
    // ⭐ Pro plan per e-mail (supabase/2026-11-reports.sql)
    if (what === 'plans' && !id && m === 'GET') {
      try { return json({ plans: await q(env, 'plans?select=email,plan,until,note,created_at&order=created_at.desc&limit=500') || [], required: proRequired(env) }); }
      catch (e) { if (e.status === 404) return json({ setup: true, required: proRequired(env) }); throw e; }
    }
    if (what === 'plans' && !id && m === 'POST') {
      const email = String(body.email || '').trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) return error('bad_email', 400);
      const until = body.until ? new Date(body.until) : null;
      if (until && isNaN(until)) return error('bad_request', 400);
      await q(env, 'plans?on_conflict=email', { method: 'POST', headers: { prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ email, plan: 'pro', until: until ? until.toISOString() : null, note: String(body.note || '').slice(0, 200) || null }) });
      return json({ ok: true });
    }
    if (what === 'plans' && id && m === 'DELETE') {
      await q(env, `plans?email=eq.${encodeURIComponent(decodeURIComponent(id).toLowerCase())}`, { method: 'DELETE' });
      return json({ ok: true });
    }
    if (what === 'shares' && SHARE_ID.test(id || '') && m === 'DELETE') {
      if (env.IMAGES) await deletePrefix(env, `s/${id}/`);
      await q(env, `shares?id=eq.${id}`, { method: 'DELETE' });
      return json({ ok: true });
    }
    return error('not_found', 404);
  } catch (e) {
    console.log('admin error', e && e.message);
    return error('db_error', 502);
  }
}

// The app page with a generic preview (no personal details).
// Link previews (Line, Facebook…) follow the sharer's menu language: the app adds ?hl=en to links made in English.
// No hl → Thai, as links always were.
export const pageLang = url => url.searchParams.get('hl') === 'en' ? 'en' : 'th';

async function appPageWith(request, env, url, title, desc) {
  const page = await env.ASSETS.fetch(new Request(`${url.origin}/app`, { headers: request.headers }));
  let html = await page.text();
  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>
<meta property="og:type" content="website"><meta property="og:site_name" content="Piccab"><meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}"><meta property="og:image" content="${esc(url.origin + '/og-image.png')}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">`);
  return new Response(html, { status: 200, headers: await pageHeaders(html, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' }) });
}

// ---------- 📧 weekly summary e-mail to parents (family groups) ----------
//   GET  /api/email/prefs                   -> { weekly, lang, last_sent, email }
//   POST /api/email/prefs {weekly, lang}
//   POST /api/email/preview                 (this week's summary to my own address, now)
//   GET  /api/email/unsub?u=<uid>&t=<sig>   (the link at the bottom of each e-mail: turns it off, no sign-in needed)
// Cron (wrangler.jsonc "triggers"): Sundays, every 30 minutes from 18:00 Thai time; each run sends to up to DIGEST_BATCH
// owners of a family group with at least one child in it. One a week per owner (last_sent). On unless switched off
// (email_prefs.weekly = false). With PRO_REQUIRED=1, only for Pro accounts. Built from the reports the children's
// devices already send (learner_reports) — nothing new is collected.
const DIGEST_BATCH = 20;
const dayTH = ms => new Date(ms + 7 * 3600e3).toISOString().slice(0, 10);   // a Thai date from a time in ms
async function unsubSig(env, uid) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('piccab-unsub:' + (env.SUPABASE_SECRET_KEY || env.SCAN_CODE || 'dev')), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(String(uid)));
  return [...new Uint8Array(mac)].slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join('');
}
export async function unsubLink(env, origin, uid) { return `${origin}/api/email/unsub?u=${uid}&t=${await unsubSig(env, uid)}`; }

// One child's week from their report: practice days, minutes, answers, new words, words still hard, streak, level.
export function weekSummary(rep, now = Date.now()) {
  const week = new Set(Array.from({ length: 7 }, (_, i) => dayTH(now - i * 86400000)));
  const d = (rep && Array.isArray(rep.days) ? rep.days : []).filter(x => week.has(x[0]));
  const s = (rep && rep.s) || {}, ach = rep && rep.ach;
  const recent = s.last && (s.last === dayTH(now) || s.last === dayTH(now - 86400000));
  return {
    days: d.length, mins: d.reduce((a, x) => a + (x[2] || 0), 0), answers: d.reduce((a, x) => a + (x[1] || 0), 0),
    learned: ((rep && rep.learned) || []).filter(x => week.has(x[2])).slice(0, 8).map(x => [x[0], x[1]]),
    weak: ((rep && rep.weak) || []).slice(0, 5).map(x => [x[0], x[1]]),
    streak: recent ? (s.streak || 0) : 0, total: (rep && rep.words && rep.words.done) || 0,
    lv: ach && ach.lv ? ach.lv : 0, badges: ach ? [ach.n || 0, ach.total || 0] : null,
  };
}
const DIGEST_TEXT = {
  th: { subject: n => n ? `สรุปการเรียนสัปดาห์นี้ของ ${n} — Piccab` : 'สรุปการเรียนสัปดาห์นี้ — Piccab', hi: 'สรุปการฝึกคำศัพท์ 7 วันที่ผ่านมา',
    days: (n) => `ฝึก ${n} จาก 7 วัน`, mins: n => `ประมาณ ${n} นาที`, ans: n => `ตอบ ${n} คำ`, streak: n => `🔥 ฝึกติดกัน ${n} วัน`, lv: n => `⭐ Lv.${n}`,
    badges: (a, b) => `🏅 ตรา ${a}/${b}`, total: n => `รู้แล้วทั้งหมด ${n} คำ`, learned: 'คำที่จำได้ใหม่', weak: 'คำที่ยังพลาดบ่อย — ลองฝึกด้วยกัน',
    none: 'สัปดาห์นี้ยังไม่ได้ฝึก ลองชวนฝึกสัก 5 นาทีด้วยกันนะ 🙂', noreport: 'ยังไม่มีข้อมูลการฝึก (ลูกต้องเปิด Piccab ในเครื่องของตัวเองก่อน)',
    open: 'ดูรายงานเต็มใน Piccab', why: 'คุณได้รับอีเมลนี้เพราะเป็นผู้ปกครองในกลุ่มครอบครัวบน Piccab', off: 'เลิกรับอีเมลนี้', group: 'กลุ่ม' },
  en: { subject: n => n ? `${n}'s week of practice — Piccab` : 'This week of practice — Piccab', hi: 'Vocabulary practice over the last 7 days',
    days: (n) => `practised ${n} of 7 days`, mins: n => `about ${n} min`, ans: n => `${n} answers`, streak: n => `🔥 ${n}-day streak`, lv: n => `⭐ Lv.${n}`,
    badges: (a, b) => `🏅 badges ${a}/${b}`, total: n => `${n} words known in all`, learned: 'New words learned', weak: 'Words still tricky — practise them together',
    none: 'No practice this week yet — how about 5 minutes together? 🙂', noreport: 'No practice data yet (your child needs to open Piccab on their own device first)',
    open: 'See the full report in Piccab', why: "You're getting this because you're a parent in a family group on Piccab", off: 'Stop these e-mails', group: 'Group' },
};
// kids: [{ nick, group, rep|null }]
export function digestMail({ lang = 'th', kids, origin, unsub, now = Date.now() }) {
  const T = DIGEST_TEXT[lang === 'en' ? 'en' : 'th'];
  const one = kids.length === 1 ? kids[0].nick : '';
  const chip = t => `<span style="display:inline-block;margin:2px 6px 2px 0;padding:3px 10px;border-radius:999px;background:#f1eefc;color:#2d2a5a;font-size:13px">${esc(t)}</span>`;
  const words = list => list.map(([w, th]) => `<b>${esc(w)}</b>${th ? ` <span style="color:#6b6585">${esc(th)}</span>` : ''}`).join(' · ');
  const text = [T.hi, ''];
  const cards = kids.map(k => {
    const w = k.rep ? weekSummary(k.rep, now) : null;
    text.push(`${k.nick}${kids.some(o => o.group !== k.group) ? ` (${T.group} ${k.group})` : ''}`);
    if (!w) { text.push('  ' + T.noreport, ''); return `<div style="border:1px solid #ece4d8;border-radius:14px;padding:14px 16px;margin:12px 0"><h3 style="margin:0 0 6px;font-size:17px;color:#2d2a5a">${esc(k.nick)}</h3><p style="margin:0;color:#6b6585">${esc(T.noreport)}</p></div>`; }
    const chips = [T.days(w.days), w.mins ? T.mins(w.mins) : '', w.answers ? T.ans(w.answers) : '', w.streak ? T.streak(w.streak) : '', w.lv ? T.lv(w.lv) : '', w.badges ? T.badges(...w.badges) : '', T.total(w.total)].filter(Boolean);
    text.push('  ' + chips.join(' · '));
    if (!w.days) text.push('  ' + T.none);
    if (w.learned.length) text.push(`  ${T.learned}: ${w.learned.map(x => x[0]).join(', ')}`);
    if (w.weak.length) text.push(`  ${T.weak}: ${w.weak.map(x => x[0]).join(', ')}`);
    text.push('');
    return `<div style="border:1px solid #ece4d8;border-radius:14px;padding:14px 16px;margin:12px 0">
<h3 style="margin:0 0 8px;font-size:17px;color:#2d2a5a">${esc(k.nick)}</h3>
<div>${chips.map(chip).join('')}</div>
${w.days ? '' : `<p style="margin:8px 0 0;color:#b4532a">${esc(T.none)}</p>`}
${w.learned.length ? `<p style="margin:10px 0 2px;font-size:13px;color:#1d7a4c;font-weight:600">✅ ${esc(T.learned)}</p><p style="margin:0">${words(w.learned)}</p>` : ''}
${w.weak.length ? `<p style="margin:10px 0 2px;font-size:13px;color:#b4532a;font-weight:600">💪 ${esc(T.weak)}</p><p style="margin:0">${words(w.weak)}</p>` : ''}
</div>`;
  }).join('');
  const app = `${origin}/app${lang === 'en' ? '?hl=en' : ''}`;
  text.push(`${T.open}: ${app}`, '', `${T.why}. ${T.off}: ${unsub}`);
  const html = `<div style="font-family:Sarabun,Arial,sans-serif;max-width:560px;margin:0 auto;padding:8px 4px;color:#2d2a5a;font-size:15px;line-height:1.55">
<p style="margin:0 0 4px;font-size:20px;font-weight:700">Piccab</p>
<p style="margin:0 0 6px;color:#6b6585">${esc(T.hi)}</p>
${cards}
<p style="margin:16px 0"><a href="${esc(app)}" style="display:inline-block;background:#2d2a5a;color:#fff;text-decoration:none;padding:10px 18px;border-radius:12px;font-weight:600">${esc(T.open)}</a></p>
<p style="margin:18px 0 0;font-size:12px;color:#9a94ad">${esc(T.why)} · <a href="${esc(unsub)}" style="color:#9a94ad">${esc(T.off)}</a></p>
</div>`;
  return { subject: T.subject(one), html, text: text.join('\n') };
}
async function mailOne(env, to, mail, unsub) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: env.MAIL_FROM || 'Piccab <no-reply@piccab.com>', to: [to], subject: mail.subject, html: mail.html, text: mail.text,
      headers: { 'List-Unsubscribe': `<${unsub}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } }),
  }).catch(() => null);
  if (!r || !r.ok) console.log('digest mail failed', r && r.status);
  return !!(r && r.ok);
}
// The children in these owners' family groups, with their reports: owner id -> [{ nick, group, rep }]
async function familyKids(env, groups) {
  const out = new Map(); if (!groups.length) return out;
  const mem = await q(env, `class_members?class_id=${inList(groups.map(g => g.id))}&select=class_id,user_id,nickname,joined_at&order=joined_at.asc`) || [];
  const reps = mem.length ? await q(env, `learner_reports?user_id=${inList([...new Set(mem.map(m => m.user_id))])}&select=user_id,data`) || [] : [];
  const rep = new Map(reps.map(r => [r.user_id, r.data])), byId = new Map(groups.map(g => [g.id, g]));
  for (const m of mem) { const g = byId.get(m.class_id); if (!g) continue; if (!out.has(g.owner)) out.set(g.owner, []); out.get(g.owner).push({ nick: m.nickname, group: g.name, rep: rep.get(m.user_id) || null }); }
  return out;
}
async function ownerEmail(env, uid) {
  const r = await fetch(`${env.SUPABASE_URL || SUPABASE_URL}/auth/v1/admin/users/${uid}`, { headers: { apikey: env.SUPABASE_SECRET_KEY, authorization: `Bearer ${env.SUPABASE_SECRET_KEY}` } }).catch(() => null);
  const u = r && r.ok ? await r.json().catch(() => null) : null;
  return u && typeof u.email === 'string' && u.email.includes('@') && !u.is_anonymous ? u.email.toLowerCase() : '';
}
// The weekly run (cron). Returns what it did, for the log and the tests.
export async function weeklyDigest(env, now = Date.now(), origin = 'https://piccab.com') {
  if (!env.SUPABASE_SECRET_KEY || !env.RESEND_API_KEY) return { sent: 0, why: 'not_configured' };
  let groups, prefs;
  try { groups = await q(env, 'classes?kind=eq.family&select=id,name,owner') || []; } catch (e) { return { sent: 0, why: 'no_families' }; }
  try { prefs = new Map((await q(env, 'email_prefs?select=user_id,weekly,lang,last_sent') || []).map(r => [r.user_id, r])); }
  catch (e) { return { sent: 0, why: 'needs_update' }; }                     // supabase/2026-11-email-prefs.sql not run yet
  const weekAgo = dayTH(now - 6 * 86400000);
  const owners = [...new Set(groups.map(g => g.owner))].filter(o => { const p = prefs.get(o); return !p || (p.weekly !== false && !(p.last_sent && p.last_sent >= weekAgo)); }).slice(0, DIGEST_BATCH);
  if (!owners.length) return { sent: 0, why: 'done' };
  const kids = await familyKids(env, groups.filter(g => owners.includes(g.owner)));
  const plans = proRequired(env) ? new Map((await q(env, 'plans?select=email,until').catch(() => []) || []).map(r => [r.email, r])) : null;
  const done = []; let sent = 0;
  for (const o of owners) {
    const list = kids.get(o) || [];
    const p = prefs.get(o) || {};
    if (!list.length) { done.push({ user_id: o, weekly: p.weekly !== false, lang: p.lang || 'th', last_sent: dayTH(now) }); continue; }   // no child yet: look again next week
    const email = await ownerEmail(env, o);
    if (!email) continue;
    if (plans) { const pl = plans.get(email); if (!pl || (pl.until && Date.parse(pl.until) <= now)) { done.push({ user_id: o, weekly: p.weekly !== false, lang: p.lang || 'th', last_sent: dayTH(now) }); continue; } }
    const unsub = await unsubLink(env, origin, o);
    if (await mailOne(env, email, digestMail({ lang: p.lang || 'th', kids: list, origin, unsub, now }), unsub)) { sent++; done.push({ user_id: o, weekly: true, lang: p.lang || 'th', last_sent: dayTH(now) }); }
  }
  if (done.length) await q(env, 'email_prefs?on_conflict=user_id', { method: 'POST', headers: { prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(done) }).catch(e => console.log('email_prefs', e.message));
  return { sent, owners: owners.length };
}
async function emailRoutes(request, env, url, ctx) {
  const path = url.pathname.split('/')[3] || '';
  if (path === 'unsub' && request.method === 'GET') {
    const uid = url.searchParams.get('u') || '', t = url.searchParams.get('t') || '';
    const ok = UUID.test(uid) && env.SUPABASE_SECRET_KEY && t === await unsubSig(env, uid);
    if (ok) await q(env, 'email_prefs?on_conflict=user_id', { method: 'POST', headers: { prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ user_id: uid, weekly: false, updated_at: new Date().toISOString() }) }).catch(() => {});
    const en = url.searchParams.get('hl') === 'en';
    const msg = ok ? (en ? "You won't get the weekly summary any more. You can switch it back on in Piccab → 🎓 Classes → your family group." : 'เลิกส่งอีเมลสรุปรายสัปดาห์แล้ว เปิดกลับได้ใน Piccab → 🎓 ห้องเรียน → กลุ่มครอบครัวของคุณ')
      : (en ? 'This link is not valid.' : 'ลิงก์นี้ใช้ไม่ได้');
    const html = `<!DOCTYPE html><html lang="${en ? 'en' : 'th'}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Piccab</title><link rel="stylesheet" href="/legal.css"><main style="max-width:520px;margin:60px auto;padding:0 20px;font-family:Sarabun,Arial,sans-serif"><h1>Piccab</h1><p>${esc(msg)}</p><p><a href="/app">${en ? 'Open Piccab' : 'เปิด Piccab'}</a></p></main></html>`;
    return new Response(html, { status: ok ? 200 : 400, headers: await pageHeaders(html, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }) });
  }
  if (!env.SUPABASE_SECRET_KEY) return error('not_configured', 503);
  const me = await userInfo(request, env);
  if (!me) return error('unauthorized', 401);
  if (me.anon || !me.email) return error('student_account', 403);
  if (path === 'prefs') {
    let row;
    try { row = (await q(env, `email_prefs?user_id=eq.${me.uid}&select=weekly,lang,last_sent`) || [])[0]; } catch (e) { return error('needs_update', 409); }
    if (request.method === 'GET') return json({ weekly: !row || row.weekly !== false, lang: (row && row.lang) || 'th', last_sent: (row && row.last_sent) || null, email: me.email });
    if (request.method === 'POST') {
      const b = await request.json().catch(() => ({}));
      const out = { user_id: me.uid, weekly: b.weekly !== false, lang: b.lang === 'en' ? 'en' : 'th', updated_at: new Date().toISOString() };
      await q(env, 'email_prefs?on_conflict=user_id', { method: 'POST', headers: { prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(out) });
      return json({ weekly: out.weekly, lang: out.lang });
    }
  }
  if (path === 'preview' && request.method === 'POST') {
    if (env.SCAN_LIMITER) { try { const { success } = await env.SCAN_LIMITER.limit({ key: 'mailpv:' + me.uid }); if (!success) return error('rate_limited', 429); } catch (e) {} }
    if (proRequired(env) && !(await proOf(env, me)).pro) return error('pro_required', 402);
    const groups = await q(env, `classes?owner=eq.${me.uid}&kind=eq.family&select=id,name,owner`).catch(() => []) || [];
    const list = (await familyKids(env, groups)).get(me.uid) || [];
    if (!list.length) return error('no_children', 404);
    if (!env.RESEND_API_KEY) return error('mail_not_configured', 503);
    const b = await request.json().catch(() => ({}));
    const unsub = await unsubLink(env, url.origin, me.uid);
    const ok = await mailOne(env, me.email, digestMail({ lang: b.lang === 'en' ? 'en' : 'th', kids: list, origin: url.origin, unsub }), unsub);
    return ok ? json({ sent: true, to: me.email, kids: list.length }) : error('mail_failed', 502);
  }
  return error('not_found', 404);
}

// ---------- friends (👫) ----------
// No search and no chat: friends are added with a code (in person / QR) and must accept; messages are
// a fixed set of cheers; a scene sent by a friend is only opened if the receiver accepts it.
// Student accounts (no e-mail) can only be friends with classmates.
//   GET    /api/friends                     -> { me, friends, incoming, outgoing, blocked, events }
//   POST   /api/friends/me      {nickname?, stats?, regenerate?}   (joining = making a profile)
//   DELETE /api/friends/me                  (leave friends: profile, friendships, events)
//   POST   /api/friends/request {code}
//   POST   /api/friends/<id>/accept   DELETE /api/friends/<id>   (accept / decline / cancel / remove)
//   POST   /api/friends/<id>/block    DELETE /api/friends/<id>/block
//   POST   /api/friends/<id>/report {reason}
//   POST   /api/friends/<id>/cheer  {kind}       POST /api/friends/<id>/send {share_id}
//   POST   /api/friends/events/seen {ids}   POST /api/friends/events/<id>/decline
const CHEERS = { clap: '👏 เก่งมาก!', fire: '🔥 มาทบทวนกันเถอะ', strong: '💪 สู้ๆ นะ', star: '⭐ ได้ดาวเยอะเลย' };
const FRIEND_CODE = /^[A-Z2-9]{8}$/, UUID = /^[0-9a-f-]{36}$/i;
const MAX_FRIENDS = 200, MAX_OUTGOING = 50, CHEERS_PER_DAY = 5, SENDS_PER_DAY = 20;
const newFriendCode = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), x => CODE_ABC[x % 32]).join('');
const pair = (x, y) => (x < y ? [x, y] : [y, x]);
async function friendProfile(env, uid) { return (await q(env, `friend_profiles?user_id=eq.${uid}&select=*`) || [])[0] || null; }
async function blockedEither(env, x, y) {
  const r = await q(env, `friend_blocks?or=(and(user_id.eq.${x},blocked.eq.${y}),and(user_id.eq.${y},blocked.eq.${x}))&select=user_id`) || [];
  return r.length > 0;
}
async function classmates(env, x, y) {
  const mx = (await q(env, `class_members?user_id=eq.${x}&select=class_id`) || []).map(r => r.class_id);
  if (!mx.length) return false;
  const my = await q(env, `class_members?user_id=eq.${y}&class_id=${inList(mx)}&select=class_id`) || [];
  return my.length > 0;
}
async function friendship(env, x, y) { const [a, b] = pair(x, y); return (await q(env, `friendships?a=eq.${a}&b=eq.${b}&select=*`) || [])[0] || null; }
const dayStart = () => new Date(Date.now() - 24 * 3600 * 1000).toISOString();
async function friends(request, env, url, ctx) {
  if (!env.SUPABASE_SECRET_KEY) return error('not_configured', 503);
  const who = await userInfo(request, env);
  if (!who) return error('unauthorized', 401);
  const uid = who.uid, parts = url.pathname.split('/').filter(Boolean);   // api, friends, <x>, <action>
  const m = request.method, x = parts[2], act = parts[3];
  const body = (m === 'POST' || m === 'PATCH') ? await request.json().catch(() => ({})) : {};
  try {
    if (!x && m === 'GET') {
      const me = await friendProfile(env, uid);
      if (!me) return json({ me: null });
      const rows = await q(env, `friendships?or=(a.eq.${uid},b.eq.${uid})&select=*`) || [];
      const blocks = await q(env, `friend_blocks?user_id=eq.${uid}&select=blocked`) || [];
      const ids = [...new Set(rows.map(r => (r.a === uid ? r.b : r.a)).concat(blocks.map(b => b.blocked)))];
      const evs = await q(env, `friend_events?to_user=eq.${uid}&created_at=gte.${new Date(Date.now() - 30 * 86400000).toISOString()}&select=id,from_user,kind,data,seen,created_at&order=created_at.desc&limit=60`) || [];
      const evIds = [...new Set(evs.map(e => e.from_user))];
      const all = [...new Set(ids.concat(evIds))];
      const profs = all.length ? await q(env, `friend_profiles?user_id=${inList(all)}&select=*`) || [] : [];       // * : works before the level column exists
      const P = new Map(profs.map(p => [p.user_id, p]));
      const card = id => { const p = P.get(id) || {}; return { id, nickname: p.nickname || '(ไม่มีชื่อ)' }; };
      const stats = id => { const p = P.get(id) || {}; return { ...card(id), streak: p.streak || 0, week_words: p.week_words || 0, total_words: p.total_words || 0, level: p.level || 0, badges: p.badges || 0, updated_at: p.updated_at || null }; };
      const blockedSet = new Set(blocks.map(b => b.blocked));
      const friendSet = new Set(rows.filter(r => r.status === 'accepted').map(r => (r.a === uid ? r.b : r.a)));
      return json({
        me: { code: me.code, nickname: me.nickname, student: !!me.student },
        friends: rows.filter(r => r.status === 'accepted').map(r => stats(r.a === uid ? r.b : r.a)).sort((p, q2) => q2.week_words - p.week_words),
        incoming: rows.filter(r => r.status === 'pending' && r.requested_by !== uid).map(r => card(r.a === uid ? r.b : r.a)),
        outgoing: rows.filter(r => r.status === 'pending' && r.requested_by === uid).map(r => card(r.a === uid ? r.b : r.a)),
        blocked: blocks.map(b => card(b.blocked)),
        events: evs.filter(e => !blockedSet.has(e.from_user) && friendSet.has(e.from_user)).map(e => ({ id: e.id, from: card(e.from_user), kind: e.kind, data: e.data, seen: e.seen, created_at: e.created_at })),
      });
    }
    if (x === 'me' && m === 'POST') {
      const cur = await friendProfile(env, uid);
      const nickname = body.nickname !== undefined ? cleanNick(body.nickname) : (cur && cur.nickname);
      if (!nickname) return error('bad_nickname', 400);
      const n = (v, hi) => Math.max(0, Math.min(hi, Math.round(+v || 0)));
      const st = body.stats || {};
      const row = { user_id: uid, nickname, student: !!who.anon, updated_at: new Date().toISOString(),
        ...(body.stats ? { streak: n(st.streak, 100000), week_words: n(st.week_words, 1000000), total_words: n(st.total_words, 1000000) } : {}) };
      const lv = body.stats && st.level !== undefined ? { level: n(st.level, 999), badges: n(st.badges, 500) } : {};   // 🗺️ (supabase/2026-11-journey.sql)
      for (let tries = 0; tries < 6; tries++) {
        const code = (!cur || body.regenerate === true) ? newFriendCode() : cur.code;
        const put = extra => q(env, 'friend_profiles?on_conflict=user_id', { method: 'POST', headers: { prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ ...row, ...extra, code }) });
        try {
          try { await put(lv); } catch (e) { if (e.status !== 400 || !Object.keys(lv).length) throw e; await put({}); }   // level column not added yet
          return json({ ok: true, code, nickname });
        } catch (e) { if (e.status !== 409 || (cur && body.regenerate !== true)) throw e; }
      }
      return error('db_error', 502);
    }
    if (x === 'me' && m === 'DELETE') {
      await q(env, `friendships?or=(a.eq.${uid},b.eq.${uid})`, { method: 'DELETE' });
      await q(env, `friend_events?or=(to_user.eq.${uid},from_user.eq.${uid})`, { method: 'DELETE' });
      await q(env, `friend_profiles?user_id=eq.${uid}`, { method: 'DELETE' });
      return json({ ok: true });
    }
    const me = await friendProfile(env, uid);
    if (!me) return error('no_profile', 400);
    if (x === 'request' && m === 'POST') {
      if (env.SCAN_LIMITER) { try { const { success } = await env.SCAN_LIMITER.limit({ key: 'friend:' + uid }); if (!success) return error('rate_limited', 429); } catch (e) {} }
      const code = String(body.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (!FRIEND_CODE.test(code)) return error('bad_code', 400);
      const them = (await q(env, `friend_profiles?code=eq.${code}&select=user_id,nickname,student`) || [])[0];
      if (!them || them.user_id === uid) return error(them ? 'self' : 'bad_code', them ? 400 : 404);
      if (await blockedEither(env, uid, them.user_id)) return error('bad_code', 404);   // don't reveal blocks
      if ((who.anon || them.student) && !(await classmates(env, uid, them.user_id))) return error('classmates_only', 403);
      const fr = await friendship(env, uid, them.user_id);
      if (fr && fr.status === 'accepted') return json({ ok: true, status: 'friends', nickname: them.nickname });
      if (fr && fr.requested_by === uid) return json({ ok: true, status: 'requested', nickname: them.nickname });
      const [a, b] = pair(uid, them.user_id);
      if (fr) {                                                                   // they already asked me → friends
        await q(env, `friendships?a=eq.${a}&b=eq.${b}`, { method: 'PATCH', body: JSON.stringify({ status: 'accepted' }) });
        return json({ ok: true, status: 'friends', nickname: them.nickname });
      }
      const mine = await q(env, `friendships?or=(a.eq.${uid},b.eq.${uid})&select=status,requested_by`) || [];
      if (mine.length >= MAX_FRIENDS) return error('too_many_friends', 429);
      if (mine.filter(r => r.status === 'pending' && r.requested_by === uid).length >= MAX_OUTGOING) return error('too_many_requests', 429);
      await q(env, 'friendships', { method: 'POST', headers: { prefer: 'return=minimal' }, body: JSON.stringify({ a, b, status: 'pending', requested_by: uid }) });
      return json({ ok: true, status: 'requested', nickname: them.nickname });
    }
    if (x === 'events') {
      if (act === 'seen' && m === 'POST') {
        const ids = (Array.isArray(body.ids) ? body.ids : []).map(Number).filter(Number.isInteger).slice(0, 100);
        if (ids.length) await q(env, `friend_events?to_user=eq.${uid}&id=in.(${ids.join(',')})`, { method: 'PATCH', body: JSON.stringify({ seen: true }) });
        return json({ ok: true });
      }
      if (/^\d+$/.test(act || '') && parts[4] === 'decline' && m === 'POST') {
        await q(env, `friend_events?to_user=eq.${uid}&id=eq.${act}`, { method: 'DELETE' });
        return json({ ok: true });
      }
      return error('not_found', 404);
    }
    if (!UUID.test(x || '') || x === uid) return error('not_found', 404);
    const other = x, [a, b] = pair(uid, other);
    if (!act && m === 'DELETE') { await q(env, `friendships?a=eq.${a}&b=eq.${b}`, { method: 'DELETE' }); return json({ ok: true }); }
    if (act === 'accept' && m === 'POST') {
      const fr = await friendship(env, uid, other);
      if (!fr || fr.status !== 'pending' || fr.requested_by === uid) return error('not_found', 404);
      await q(env, `friendships?a=eq.${a}&b=eq.${b}`, { method: 'PATCH', body: JSON.stringify({ status: 'accepted' }) });
      return json({ ok: true });
    }
    if (act === 'block' && m === 'POST') {
      await q(env, `friendships?a=eq.${a}&b=eq.${b}`, { method: 'DELETE' });
      await q(env, `friend_events?to_user=eq.${uid}&from_user=eq.${other}`, { method: 'DELETE' });
      await q(env, 'friend_blocks?on_conflict=user_id,blocked', { method: 'POST', headers: { prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify({ user_id: uid, blocked: other }) });
      return json({ ok: true });
    }
    if (act === 'block' && m === 'DELETE') { await q(env, `friend_blocks?user_id=eq.${uid}&blocked=eq.${other}`, { method: 'DELETE' }); return json({ ok: true }); }
    if (act === 'report' && m === 'POST') {
      const reason = String(body.reason || '').slice(0, 300);
      await q(env, 'friend_reports', { method: 'POST', headers: { prefer: 'return=minimal' }, body: JSON.stringify({ reporter: uid, reported: other, reason }) });
      const them = await friendProfile(env, other);
      notifyAdmin(env, ctx, `รายงานผู้ใช้: ${them ? them.nickname : other.slice(0, 8)}`, [
        ['ประเภท', 'รายงานเพื่อน'], ['ผู้ถูกรายงาน', them ? `${them.nickname} (รหัส ${them.code}${them.student ? ', บัญชีนักเรียน' : ''})` : other],
        ['ผู้รายงาน', me.nickname + (who.anon ? ' (บัญชีนักเรียน)' : '')], ['เหตุผล', reason || '-']], url.origin);
      return json({ ok: true });
    }
    // cheers and sending need an accepted friendship (and no block)
    const fr = await friendship(env, uid, other);
    if (!fr || fr.status !== 'accepted' || await blockedEither(env, uid, other)) return error('not_friends', 403);
    if (act === 'cheer' && m === 'POST') {
      if (!CHEERS[body.kind]) return error('bad_request', 400);
      const today = await q(env, `friend_events?from_user=eq.${uid}&to_user=eq.${other}&kind=eq.cheer&created_at=gte.${dayStart()}&select=id`) || [];
      if (today.length >= CHEERS_PER_DAY) return error('too_many_cheers', 429);
      await q(env, 'friend_events', { method: 'POST', headers: { prefer: 'return=minimal' }, body: JSON.stringify({ to_user: other, from_user: uid, kind: 'cheer', data: { cheer: body.kind } }) });
      return json({ ok: true });
    }
    if (act === 'send' && m === 'POST') {
      const sid = String(body.share_id || '');
      const sh = SHARE_ID.test(sid) ? await getShare(env, sid) : null;
      if (!sh || sh.owner !== uid) return error('bad_share', 400);
      const today = await q(env, `friend_events?from_user=eq.${uid}&kind=eq.share&created_at=gte.${dayStart()}&select=id`) || [];
      if (today.length >= SENDS_PER_DAY) return error('too_many_sends', 429);
      await q(env, 'friend_events', { method: 'POST', headers: { prefer: 'return=minimal' }, body: JSON.stringify({ to_user: other, from_user: uid, kind: 'share', data: { share_id: sid, name: sh.name, kind: sh.kind, total: shareTotal(sh) } }) });
      return json({ ok: true });
    }
    return error('method_not_allowed', 405);
  } catch (e) {
    console.log('friends error', e && e.message);
    return error('db_error', 502);
  }
}

// /c/<code>: the app page, with a preview that names the class (a join link)
async function classPage(request, env, url) {
  const code = url.pathname.split('/')[2].toUpperCase();
  const page = await env.ASSETS.fetch(new Request(`${url.origin}/app`, { headers: request.headers }));
  let html = await page.text();
  const c = env.SUPABASE_SECRET_KEY && CLASS_CODE.test(code) ? (await q(env, `classes?code=eq.${code}&select=name`).catch(() => null) || [])[0] : null;
  if (c) {
    const en = pageLang(url) === 'en';
    const title = en ? `Join the class “${c.name}” — Piccab` : `เข้าห้องเรียน “${c.name}” — Piccab`;
    const tags = `<title>${esc(title)}</title>
<meta property="og:type" content="website"><meta property="og:site_name" content="Piccab">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(en ? 'Tap the link, enter a nickname and start practising the words your teacher assigned' : 'กดลิงก์ ใส่ชื่อเล่น แล้วเริ่มฝึกคำศัพท์ที่ครูมอบหมายได้เลย')}">
<meta property="og:image" content="${esc(url.origin + '/og-image.png')}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:url" content="${esc(url.origin + '/c/' + code)}">`;
    html = html.replace(/<title>[\s\S]*?<\/title>/, tags);
  }
  return new Response(html, { status: 200, headers: await pageHeaders(html, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' }) });
}

// ---------- sign-in e-mails (Supabase "Send Email" auth hook → Resend) ----------
// Supabase calls POST /api/auth-email for every auth e-mail; we send our own e-mail (Thai or English) through Resend.
// Secrets: SEND_EMAIL_HOOK_SECRET ("v1,whsec_…" from the hook settings), RESEND_API_KEY ("re_…").
// The request is signed with Standard Webhooks (headers webhook-id / webhook-timestamp / webhook-signature).
const b64ToBytes = b => Uint8Array.from(atob(b), c => c.charCodeAt(0));
const bytesToB64 = u => btoa(String.fromCharCode(...new Uint8Array(u)));
export async function verifyWebhook(secret, headers, body, nowSec = Math.floor(Date.now() / 1000)) {
  const id = headers.get('webhook-id'), ts = headers.get('webhook-timestamp'), sigs = headers.get('webhook-signature');
  if (!id || !ts || !sigs || !secret) return false;
  if (Math.abs(nowSec - Number(ts)) > 5 * 60) return false;            // replay protection
  const raw = String(secret).replace(/^v1,/, '').replace(/^whsec_/, '');
  const key = await crypto.subtle.importKey('raw', b64ToBytes(raw), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = bytesToB64(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${ts}.${body}`)));
  return sigs.split(' ').some(p => { const [v, sig] = p.split(','); return v === 'v1' && sig && safeEqual(sig, mac); });
}

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MAIL_TEXT = {
  signup:           { subject: 'ยืนยันอีเมลสมัคร Piccab', title: 'ยินดีต้อนรับสู่ Piccab 👋', lead: 'ใส่รหัสนี้ในแอปเพื่อยืนยันอีเมลและเข้าสู่ระบบ', button: 'ยืนยันและเข้าสู่ระบบ' },
  magiclink:        { subject: 'รหัสเข้าสู่ระบบ Piccab', title: 'รหัสเข้าสู่ระบบ Piccab', lead: 'ใส่รหัสนี้ในแอปเพื่อเข้าสู่ระบบ', button: 'เข้าสู่ระบบ Piccab' },
  email:            { subject: 'รหัสเข้าสู่ระบบ Piccab', title: 'รหัสเข้าสู่ระบบ Piccab', lead: 'ใส่รหัสนี้ในแอปเพื่อเข้าสู่ระบบ', button: 'เข้าสู่ระบบ Piccab' },
  recovery:         { subject: 'รหัสตั้งค่าบัญชี Piccab ใหม่', title: 'ตั้งค่าบัญชีใหม่', lead: 'ใส่รหัสนี้ในแอปเพื่อดำเนินการต่อ', button: 'ดำเนินการต่อ' },
  invite:           { subject: 'คุณได้รับเชิญให้ใช้ Piccab', title: 'คุณได้รับเชิญให้ใช้ Piccab', lead: 'กดปุ่มด้านล่างเพื่อเริ่มใช้งาน', button: 'เริ่มใช้งาน' },
  email_change:     { subject: 'ยืนยันอีเมลใหม่ของ Piccab', title: 'ยืนยันอีเมลใหม่', lead: 'ใส่รหัสนี้ในแอปเพื่อยืนยันอีเมลใหม่', button: 'ยืนยันอีเมลใหม่' },
  reauthentication: { subject: 'รหัสยืนยันตัวตน Piccab', title: 'ยืนยันตัวตน', lead: 'ใส่รหัสนี้ในแอปเพื่อยืนยันว่าเป็นคุณ', button: '' },
};
const MAIL_TEXT_EN = {
  signup:           { subject: 'Confirm your Piccab email', title: 'Welcome to Piccab 👋', lead: 'Enter this code in the app to confirm your email and sign in', button: 'Confirm and sign in' },
  magiclink:        { subject: 'Your Piccab sign-in code', title: 'Your Piccab sign-in code', lead: 'Enter this code in the app to sign in', button: 'Sign in to Piccab' },
  email:            { subject: 'Your Piccab sign-in code', title: 'Your Piccab sign-in code', lead: 'Enter this code in the app to sign in', button: 'Sign in to Piccab' },
  recovery:         { subject: 'Your Piccab account reset code', title: 'Reset your account', lead: 'Enter this code in the app to continue', button: 'Continue' },
  invite:           { subject: "You're invited to Piccab", title: "You're invited to Piccab", lead: 'Tap the button below to get started', button: 'Get started' },
  email_change:     { subject: 'Confirm your new Piccab email', title: 'Confirm your new email', lead: 'Enter this code in the app to confirm your new email', button: 'Confirm new email' },
  reauthentication: { subject: 'Your Piccab verification code', title: 'Verify it\'s you', lead: 'Enter this code in the app to confirm it\'s you', button: '' },
};
const MAIL_MORE = {
  th: { or: 'หรือกดปุ่มนี้ (เปิดในเบราว์เซอร์เดียวกับที่ใช้ Piccab)', once: 'รหัสนี้ใช้ได้ครั้งเดียวและจะหมดอายุในไม่ช้า · ถ้าคุณไม่ได้ขอ ไม่ต้องทำอะไร', onceText: 'รหัสนี้ใช้ได้ครั้งเดียว · ถ้าคุณไม่ได้ขอ ไม่ต้องทำอะไร' },
  en: { or: 'Or tap this button (open it in the same browser you use Piccab in)', once: "This code works once and expires soon · If you didn't ask for it, you can ignore this email", onceText: "This code works once · If you didn't ask for it, you can ignore this email" },
};
// The e-mail's language: the app asks with emailRedirectTo …/app?hl=en and saves lang in a new account's metadata.
export function mailLang(p) {
  const d = (p && p.email_data) || {}, meta = (p && p.user && p.user.user_metadata) || {};
  if (/[?&]hl=en\b/.test(String(d.redirect_to || ''))) return 'en';
  if (/[?&]hl=th\b/.test(String(d.redirect_to || ''))) return 'th';
  return meta.lang === 'en' ? 'en' : 'th';
}
export function buildAuthEmail(p, supabaseUrl) {
  const lang = mailLang(p), M = MAIL_MORE[lang], TXT = lang === 'en' ? MAIL_TEXT_EN : MAIL_TEXT;
  const d = p.email_data || {}, type = d.email_action_type || 'magiclink', t = TXT[type] || TXT.magiclink;
  const code = d.token || '';
  const redirect = d.redirect_to || d.site_url || 'https://piccab.com/';
  const link = d.token_hash && t.button
    ? `${supabaseUrl}/auth/v1/verify?token=${encodeURIComponent(d.token_hash)}&type=${encodeURIComponent(type === 'email' ? 'magiclink' : type)}&redirect_to=${encodeURIComponent(redirect)}`
    : '';
  const subject = code ? `${t.subject}: ${code}` : t.subject;
  const html = `<!doctype html><html lang="${lang}"><body style="margin:0;background:#fdf9f3;font-family:Sarabun,Tahoma,Arial,sans-serif;color:#2d2a5a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#fff;border-radius:18px;padding:28px">
<tr><td style="padding-bottom:6px"><img src="https://piccab.com/icon-192.png" width="40" height="40" alt="" style="vertical-align:middle;border:0;border-radius:10px"> <span style="font-size:22px;font-weight:700;vertical-align:middle">Pic<span style="color:#fe5e7a">cab</span></span></td></tr>
<tr><td style="font-size:20px;font-weight:700;padding:10px 0 6px">${esc(t.title)}</td></tr>
${code ? `<tr><td style="font-size:15px;color:#77728c">${esc(t.lead)}</td></tr>
<tr><td style="padding:16px 0"><div style="font-size:34px;font-weight:700;letter-spacing:8px;text-align:center;background:#efeaf7;border-radius:12px;padding:14px 0">${esc(code)}</div></td></tr>` : ''}
${link ? `<tr><td style="font-size:14px;color:#77728c;padding-bottom:10px">${code ? M.or : ''}</td></tr>
<tr><td><a href="${esc(link)}" style="display:inline-block;background:#2d2a5a;color:#fff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:12px">${esc(t.button)}</a></td></tr>` : ''}
<tr><td style="font-size:13px;color:#77728c;padding-top:22px">${esc(M.once)}</td></tr>
</table></td></tr></table></body></html>`;
  const text = [t.title, code ? `${t.lead}: ${code}` : '', link ? `${t.button}: ${link}` : '', M.onceText].filter(Boolean).join('\n\n');
  return { subject, html, text };
}

async function authEmail(request, env) {
  const hookErr = (msg, status) => json({ error: { http_code: status, message: msg } }, status);
  if (request.method !== 'POST') return hookErr('method not allowed', 405);
  if (!env.SEND_EMAIL_HOOK_SECRET || !env.RESEND_API_KEY) return hookErr('email hook not configured', 500);
  const body = await request.text();
  if (!(await verifyWebhook(env.SEND_EMAIL_HOOK_SECRET, request.headers, body))) return hookErr('invalid signature', 401);
  let p;
  try { p = JSON.parse(body); } catch (e) { return hookErr('bad payload', 400); }
  const to = p.user && (p.user.new_email && p.email_data && p.email_data.email_action_type === 'email_change' ? p.user.new_email : p.user.email);
  if (!to) return hookErr('no recipient', 400);
  const mail = buildAuthEmail(p, env.SUPABASE_URL || SUPABASE_URL);
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: env.MAIL_FROM || 'Piccab <no-reply@piccab.com>', to: [to], subject: mail.subject, html: mail.html, text: mail.text }),
  });
  if (!r.ok) {
    const detail = await r.text().catch(() => '');
    console.log('Resend error', r.status, detail.slice(0, 300));
    return hookErr('could not send e-mail', 500);
  }
  return json({});
}

