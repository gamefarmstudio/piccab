// Piccab Worker: serves the static app from ./public and adds a small AI API.
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
//   GEMINI_MODEL       (text, optional)  one model or a comma-separated list tried in order when one is
//                      out of quota / busy; default gemini-3.8-flash,gemini-3.6-flash,gemini-3.5-flash-lite
//   CLAUDE_MODEL       (text, optional)  defaults to claude-haiku-5-5 (cheapest); claude-sonnet-5-5 for harder pictures
//   SCAN_CODE          (secret, optional) access code for using AI without signing in (testers)
//   SUPABASE_SECRET_KEY (secret, optional) Supabase secret key → signed-in users get monthly AI credits
//   AI_MONTHLY_CREDITS (text, optional)  credits per user per month (default 30)
//
// Who may scan:  signed in + SUPABASE_SECRET_KEY set → uses 1 credit (refunded if the scan fails);
//                otherwise SCAN_CODE (if set) is required; with neither set, AI is open to everyone.
//
// The prompt is built here on the server from a few validated options, so this
// endpoint cannot be used as a general-purpose proxy to an AI API.

const DEFAULT_MODEL = 'claude-haiku-5-5';

// Supabase project (public values: the publishable key is meant for browsers; data is protected by RLS).
const SUPABASE_URL = 'https://oftzpfyydnmahkntucnj.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_R8bX28KY2kU5997XFqHelw_fqUvywBh';
const MAX_UPLOAD = 3 * 1024 * 1024;
const DEFAULT_MONTHLY_CREDITS = 30;
const monthlyCredits = env => clampInt(env.AI_MONTHLY_CREDITS, 0, 1000000, DEFAULT_MONTHLY_CREDITS);
const UPLOAD_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
// Tried in order: the most accurate first; each model has its own free daily quota (20, 20 and 500).
const DEFAULT_GEMINI_MODELS = 'gemini-3.8-flash,gemini-3.6-flash,gemini-3.5-flash-lite';
// Models that just ran out of quota are skipped for a while (per Worker instance; best effort).
const skipUntil = new Map();

// Which provider to use, or null when no key is set.
export function pickProvider(env) {
  const want = String(env.AI_PROVIDER || '').trim().toLowerCase();
  if (want === 'gemini' && env.GEMINI_API_KEY) return 'gemini';
  if (want === 'claude' && env.ANTHROPIC_API_KEY) return 'claude';
  if (env.ANTHROPIC_API_KEY) return 'claude';
  if (env.GEMINI_API_KEY) return 'gemini';
  return null;
}
const MAX_IMAGE_BYTES = 3_000_000; // base64 length limit (~2.2 MB image)
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

const LEVELS = {
  easy: 'beginner (CEFR A1–A2): very common everyday nouns',
  mid: 'intermediate (CEFR B1): everyday nouns plus some more specific names',
  hard: 'upper-intermediate (CEFR B2–C1): precise, specific names of objects and their parts',
};

export default {
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
    if (url.pathname.startsWith('/api/img/')) return image(request, env, url);
    if (url.pathname === '/api/account') return deleteAccount(request, env);
    if (url.pathname === '/api/shares') return listShares(request, env);
    if (url.pathname === '/api/classes' || url.pathname.startsWith('/api/classes/')) return classes(request, env, url, ctx);
    if (url.pathname === '/api/friends' || url.pathname.startsWith('/api/friends/')) return friends(request, env, url, ctx);
    if (url.pathname === '/api/report/share') return reportShare(request, env, ctx);
    if (url.pathname.startsWith('/api/admin/')) return admin(request, env, url);
    if (url.pathname === '/api/share' || url.pathname.startsWith('/api/share/')) return share(request, env, url);
    if (url.pathname.startsWith('/api/')) return error('not_found', 404);
    if (/^\/s\/[A-Za-z0-9]{8,16}\/?$/.test(url.pathname)) return sharePage(request, env, url);
    if (/^\/c\/[A-Za-z2-9]{6}\/?$/.test(url.pathname)) return classPage(request, env, url);
    if (url.pathname === '/admin' || url.pathname === '/admin/') return appPageWith(request, env, url, 'Piccab — ดูแลระบบ', 'Piccab');
    if (/^\/f\/[A-Za-z2-9]{8}\/?$/.test(url.pathname)) return appPageWith(request, env, url, 'เพิ่มเพื่อนบน Piccab', 'มีคนชวนคุณเป็นเพื่อนฝึกคำศัพท์อังกฤษบน Piccab — กดเพื่อเปิดแล้วยืนยัน');
    return env.ASSETS.fetch(request);
  },
};

async function scan(request, env) {
  const provider = pickProvider(env);
  if (!provider) return error('not_configured', 503);

  // Who is asking: a signed-in user with credits, a tester with the access code, or (if neither is set up) anyone.
  const useCredits = !!env.SUPABASE_SECRET_KEY;
  const who = request.headers.get('authorization') ? await userInfo(request, env) : null;
  if (who && who.anon) return error('student_account', 403);       // students (no e-mail) don't use AI
  const uid = who ? who.uid : null;
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

  // Take one credit now; give it back if the scan doesn't produce a result.
  let left = null;
  if (uid && useCredits) {
    try { left = await creditRpc(env, 'use_ai_credit', { p_user: uid, p_monthly: monthlyCredits(env) }); }
    catch (e) { console.log('credit check failed', String(e)); return error('busy', 503); }
    if (typeof left !== 'number' || left < 0) return error('no_credits', 402);
  }
  const res = provider === 'gemini'
    ? await scanGemini(env, m[1], m[2], buildPrompt(count, level, existing, 'gemini'))
    : await scanClaude(env, m[1], m[2], buildPrompt(count, level, existing, 'claude'));
  if (left === null) return res;
  if (res.status !== 200) {
    try { left = await creditRpc(env, 'refund_ai_credit', { p_user: uid }); } catch (e) { console.log('refund failed', String(e)); }
    return withField(res, 'credits_left', typeof left === 'number' ? left : undefined);
  }
  return withField(res, 'credits_left', left);
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

async function scanClaude(env, mime, data64, prompt) {
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
        model: env.CLAUDE_MODEL || DEFAULT_MODEL,
        max_tokens: 4096,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mime, data: data64 } },
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
  const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  const items = parseItems(text);
  if (!items) return error('invalid_json', 502);
  return json({ items, provider: 'claude', model: env.CLAUDE_MODEL || DEFAULT_MODEL, usage: data.usage ? { in: data.usage.input_tokens, out: data.usage.output_tokens } : undefined });
}

export function geminiModels(env) {
  return String(env.GEMINI_MODEL || DEFAULT_GEMINI_MODELS).split(',')
    .map(m => m.trim().replace(/[^a-z0-9.\-]/gi, '')).filter(Boolean).slice(0, 5);
}

async function scanGemini(env, mime, data64, prompt) {
  const models = geminiModels(env);
  const now = Date.now();
  const order = [...models.filter(m => !(skipUntil.get(m) > now)), ...models.filter(m => skipUntil.get(m) > now)];
  let last = error('not_configured', 503);
  for (const model of order) {
    const r = await callGemini(env, model, mime, data64, prompt);
    if (r.ok) return json({ items: r.items, provider: 'gemini', model, usage: r.usage });
    last = error(r.code, r.status);
    // Out of quota, model not available to this key, or Google busy: try the next model.
    if (r.next) { if (r.skipMs) skipUntil.set(model, Date.now() + r.skipMs); continue; }
    return last;
  }
  return last;
}

async function callGemini(env, model, mime, data64, prompt) {
  let res;
  try {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [
          { inline_data: { mime_type: mime, data: data64 } },
          { text: prompt },
        ] }],
        generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 8192 },
      }),
    });
  } catch (e) {
    return { code: 'upstream_unreachable', status: 502, next: true };
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    console.log('Gemini API error', model, res.status, detail.slice(0, 500));
    if (res.status === 429) {
      // "limit: 0" = no free quota for this model; "per day" = daily quota used up; otherwise per-minute.
      const none = /limit: ?0\b/.test(detail), daily = /per ?day|PerDay/i.test(detail);
      return { code: none ? 'not_configured' : 'rate_limited', status: none ? 503 : 429, next: true,
               skipMs: none || daily ? 60 * 60 * 1000 : 60 * 1000 };
    }
    if (res.status === 503 || res.status === 500) return { code: 'busy', status: 503, next: true, skipMs: 30 * 1000 };
    if (res.status === 404) return { code: 'not_configured', status: 503, next: true, skipMs: 60 * 60 * 1000 };
    if (res.status === 400 && /api key/i.test(detail)) return { code: 'not_configured', status: 503 };
    if (res.status === 401 || res.status === 403) return { code: 'not_configured', status: 503 };
    if (res.status === 400 && /image|inline_data|mime/i.test(detail)) return { code: 'image_rejected', status: 400 };
    return { code: 'upstream_error', status: 502 };
  }

  const data = await res.json();
  if (data.promptFeedback && data.promptFeedback.blockReason) return { code: 'refused', status: 422 };
  const cand = (data.candidates || [])[0];
  if (!cand) return { code: 'empty_completion', status: 502 };
  if (/SAFETY|PROHIBITED|BLOCKLIST|RECITATION/.test(cand.finishReason || '')) return { code: 'refused', status: 422 };
  const text = ((cand.content && cand.content.parts) || []).filter(p => typeof p.text === 'string' && !p.thought).map(p => p.text).join('');
  const items = parseItems(text);
  if (!items) return { code: 'invalid_json', status: 502 };
  const u = data.usageMetadata;
  return { ok: true, items, usage: u ? { in: u.promptTokenCount, out: u.candidatesTokenCount } : undefined };
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
      'cache-control': 'private, max-age=31536000, immutable',
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

function buildPrompt(count, level, existing, provider) {
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
${gem
  ? '- "box_2d": [ymin, xmin, ymax, xmax], a tight 2D bounding box around that thing, normalised to 0-1000'
  : '- "box": [x0, y0, x1, y1], a tight bounding box around that thing, in coordinates normalised to 0-1000, where [0,0] is the top-left corner and [1000,1000] is the bottom-right corner of the image'}

Use each word once. If the same kind of thing appears several times, box the clearest single one. Boxes of different things may overlap.

Reply with only a JSON array, for example:
${gem
  ? '[{"word":"teapot","th":"กาน้ำชา","alts":["tea pot"],"box_2d":[380,512,560,690]}]'
  : '[{"word":"teapot","th":"กาน้ำชา","alts":["tea pot"],"box":[512,380,690,560]}]'}`;
}

// Pull the JSON array out of the model's reply (tolerates code fences or stray text).
export function parseItems(text) {
  const s = String(text || '');
  const a = s.indexOf('['), b = s.lastIndexOf(']');
  if (a < 0 || b <= a) return null;
  let arr;
  try { arr = JSON.parse(s.slice(a, b + 1)); } catch (e) { return null; }
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
      return {
        word: r.word.slice(0, 60),
        th: typeof r.th === 'string' ? r.th.slice(0, 120) : '',
        alts: Array.isArray(r.alts) ? r.alts.filter(x => typeof x === 'string').slice(0, 4) : [],
        box,
      };
    })
    .filter(Boolean)
    .slice(0, 40);
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
    const title = row.kind === 'deck' ? `ชุดคำ “${row.name}” · ${n} คำ — Piccab` : `ฉาก “${row.name}” · ${n} คำ — Piccab`;
    const pic = scenes.find(s => !s.builtin);
    const img = pic ? `${url.origin}/api/share/${id}/img/${pic.id}` : `${url.origin}/icon-512.png`;
    const desc = 'ฝึกคำศัพท์ภาษาอังกฤษจากภาพ — กดเพื่อเปิดใน Piccab แล้วเก็บไว้ฝึกได้เลย';
    const tags = `<title>${esc(title)}</title>
<meta property="og:type" content="website"><meta property="og:site_name" content="Piccab">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(img)}"><meta property="og:url" content="${esc(url.origin + '/s/' + id)}">
<meta name="twitter:card" content="summary_large_image">`;
    html = html.replace(/<title>[\s\S]*?<\/title>/, tags);
  }
  return new Response(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' } });
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
function shareTotal(sh) {
  if (!sh || !sh.data) return 0;
  if (sh.kind === 'deck') return (sh.data.words || []).length;
  const sc = (sh.data.scenes || [])[0]; return sc ? (sc.builtin ? (sc.n || 0) : Object.keys(sc.items || {}).length) : 0;
}
async function classItems(env, cid) {
  const items = await q(env, `class_items?class_id=eq.${cid}&select=share_id,added_at&order=added_at.asc`) || [];
  if (!items.length) return [];
  const shares = await q(env, `shares?id=${inList(items.map(i => i.share_id))}&select=id,kind,name,data`) || [];
  const by = new Map(shares.map(x => [x.id, x]));
  return items.filter(i => by.has(i.share_id)).map(i => { const sh = by.get(i.share_id); return { share_id: i.share_id, kind: sh.kind, name: sh.name, total: shareTotal(sh), added_at: i.added_at }; });
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
async function classes(request, env, url, ctx) {
  if (!env.SUPABASE_SECRET_KEY) return error('not_configured', 503);
  const me = await userInfo(request, env);
  if (!me) return error('unauthorized', 401);
  const uid = me.uid, parts = url.pathname.split('/').filter(Boolean);   // api, classes, <id|join|progress>, …
  const m = request.method, id = parts[2];
  try {
    if (!id && m === 'GET') {
      const teaching = await q(env, `classes?owner=eq.${uid}&select=id,code,name,created_at&order=created_at.desc`) || [];
      const mem = await q(env, `class_members?user_id=eq.${uid}&select=class_id,nickname,joined_at`) || [];
      const learn = mem.length ? await q(env, `classes?id=${inList(mem.map(x => x.class_id))}&select=id,name`) || [] : [];
      const counts = {};
      if (teaching.length) for (const r of await q(env, `class_members?class_id=${inList(teaching.map(c => c.id))}&select=class_id`) || []) counts[r.class_id] = (counts[r.class_id] || 0) + 1;
      const nick = new Map(mem.map(x => [x.class_id, x.nickname]));
      return json({ teaching: teaching.map(c => ({ ...c, members: counts[c.id] || 0 })), learning: learn.map(c => ({ id: c.id, name: c.name, nickname: nick.get(c.id) })) });
    }
    if (!id && m === 'POST') {
      if (me.anon) return error('student_account', 403);
      const body = await request.json().catch(() => ({}));
      const name = String(body.name || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 60);
      if (!name) return error('bad_request', 400);
      const mine = await q(env, `classes?owner=eq.${uid}&select=id`) || [];
      if (mine.length >= MAX_CLASSES) return error('too_many_classes', 429);
      for (let tries = 0; tries < 6; tries++) {
        const row = { id: newShareId(), code: newClassCode(), owner: uid, name };
        try { await q(env, 'classes', { method: 'POST', headers: { prefer: 'return=minimal' }, body: JSON.stringify(row) }); return json({ id: row.id, code: row.code, name }); }
        catch (e) { if (e.status !== 409) throw e; }                    // code taken → try another
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
      const c = (await q(env, `classes?code=eq.${code}&select=id,name,owner`) || [])[0];
      if (!c) return error('bad_code', 404);
      if (c.owner === uid) return error('own_class', 400);
      const members = await q(env, `class_members?class_id=eq.${c.id}&select=user_id`) || [];
      if (!members.some(x => x.user_id === uid) && members.length >= MAX_MEMBERS) return error('class_full', 429);
      await q(env, 'class_members?on_conflict=class_id,user_id', { method: 'POST', headers: { prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ class_id: c.id, user_id: uid, nickname }) });
      return json({ id: c.id, name: c.name, nickname });
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
    const membership = teacher ? null : (await q(env, `class_members?class_id=eq.${id}&user_id=eq.${uid}&select=nickname`) || [])[0];
    if (!teacher && !membership) return error('not_found', 404);
    const sub = parts[3];
    if (!sub && m === 'GET') {
      const items = await classItems(env, id);
      if (teacher) {
        const members = await q(env, `class_members?class_id=eq.${id}&select=user_id,nickname,joined_at&order=nickname.asc`) || [];
        const progress = await q(env, `class_progress?class_id=eq.${id}&select=share_id,user_id,total,done,star,updated_at`) || [];
        return json({ role: 'teacher', id: c.id, code: c.code, name: c.name, leaderboard: !!c.leaderboard, items, members, progress });
      }
      const progress = await q(env, `class_progress?class_id=eq.${id}&user_id=eq.${uid}&select=share_id,total,done,star,updated_at`) || [];
      let board = null;
      if (c.leaderboard) {
        const members = await q(env, `class_members?class_id=eq.${id}&select=user_id,nickname`) || [];
        const all = await q(env, `class_progress?class_id=eq.${id}&select=share_id,user_id,done,star`) || [];
        board = leaderboard(members, all, new Set(items.map(i => i.share_id)), uid);
      }
      return json({ role: 'student', id: c.id, name: c.name, nickname: membership.nickname, items, progress, leaderboard: board });
    }
    if (sub === 'members' && m === 'DELETE' && parts[4]) {
      const who = parts[4] === 'me' ? uid : parts[4];
      if (!teacher && who !== uid) return error('forbidden', 403);
      if (!/^[0-9a-f-]{36}$/i.test(who)) return error('bad_request', 400);
      await q(env, `class_members?class_id=eq.${id}&user_id=eq.${who}`, { method: 'DELETE' });
      return json({ ok: true });
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
      const have = await q(env, `class_items?class_id=eq.${id}&select=share_id`) || [];
      if (!have.some(x => x.share_id === sid) && have.length >= MAX_ITEMS) return error('too_many_items', 429);
      await q(env, 'class_items?on_conflict=class_id,share_id', { method: 'POST', headers: { prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify({ class_id: id, share_id: sid }) });
      return json({ ok: true });
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
// ---------- reports → e-mail, and the admin API ----------
// E-mail to the people who look after Piccab (ADMIN_NOTIFY_EMAIL, default contact@piccab.com) through Resend.
export function adminMailHtml(title, rows, link) {
  const tr = rows.map(([k, v]) => `<tr><td style="padding:6px 12px 6px 0;color:#77728c;white-space:nowrap;vertical-align:top">${esc(k)}</td><td style="padding:6px 0">${esc(v)}</td></tr>`).join('');
  return `<div style="font-family:Sarabun,system-ui,sans-serif;color:#2d2a5a;max-width:560px"><h2 style="margin:0 0 12px">⚠️ ${esc(title)}</h2><table style="border-collapse:collapse;font-size:15px">${tr}</table>`
    + `<p style="margin:18px 0"><a href="${esc(link)}" style="background:#2d2a5a;color:#fff;padding:10px 16px;border-radius:10px;text-decoration:none">เปิดหน้าดูแลระบบ</a></p>`
    + `<p style="color:#77728c;font-size:13px">ส่งอัตโนมัติจาก Piccab เมื่อมีผู้ใช้กดรายงาน</p></div>`;
}
function notifyAdmin(env, ctx, title, rows, origin) {
  if (!env.RESEND_API_KEY) return;
  const to = String(env.ADMIN_NOTIFY_EMAIL || 'contact@piccab.com').split(',').map(x => x.trim()).filter(Boolean);
  const text = rows.map(([k, v]) => `${k}: ${v}`).join('\n') + `\n\n${origin}/admin`;
  const send = fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: env.MAIL_FROM || 'Piccab <no-reply@piccab.com>', to, subject: `[Piccab] ${title}`, html: adminMailHtml(title, rows, origin + '/admin'), text }),
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
  const body = m === 'POST' ? await request.json().catch(() => ({})) : {};
  try {
    if (what === 'me' && m === 'GET') return json({ admin: true });
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
async function appPageWith(request, env, url, title, desc) {
  const page = await env.ASSETS.fetch(new Request(`${url.origin}/app`, { headers: request.headers }));
  let html = await page.text();
  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>
<meta property="og:type" content="website"><meta property="og:site_name" content="Piccab"><meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}"><meta property="og:image" content="${esc(url.origin + '/icon-512.png')}">`);
  return new Response(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' } });
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
      const profs = all.length ? await q(env, `friend_profiles?user_id=${inList(all)}&select=user_id,nickname,streak,week_words,total_words,updated_at`) || [] : [];
      const P = new Map(profs.map(p => [p.user_id, p]));
      const card = id => { const p = P.get(id) || {}; return { id, nickname: p.nickname || '(ไม่มีชื่อ)' }; };
      const stats = id => { const p = P.get(id) || {}; return { ...card(id), streak: p.streak || 0, week_words: p.week_words || 0, total_words: p.total_words || 0, updated_at: p.updated_at || null }; };
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
      for (let tries = 0; tries < 6; tries++) {
        const code = (!cur || body.regenerate === true) ? newFriendCode() : cur.code;
        try {
          await q(env, 'friend_profiles?on_conflict=user_id', { method: 'POST', headers: { prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ ...row, code }) });
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
    const title = `เข้าห้องเรียน “${c.name}” — Piccab`;
    const tags = `<title>${esc(title)}</title>
<meta property="og:type" content="website"><meta property="og:site_name" content="Piccab">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc('กดลิงก์ ใส่ชื่อเล่น แล้วเริ่มฝึกคำศัพท์ที่ครูมอบหมายได้เลย')}">
<meta property="og:image" content="${esc(url.origin + '/icon-512.png')}"><meta property="og:url" content="${esc(url.origin + '/c/' + code)}">`;
    html = html.replace(/<title>[\s\S]*?<\/title>/, tags);
  }
  return new Response(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' } });
}

// ---------- sign-in e-mails (Supabase "Send Email" auth hook → Resend) ----------
// Supabase calls POST /api/auth-email for every auth e-mail; we send our own Thai e-mail through Resend.
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
export function buildAuthEmail(p, supabaseUrl) {
  const d = p.email_data || {}, type = d.email_action_type || 'magiclink', t = MAIL_TEXT[type] || MAIL_TEXT.magiclink;
  const code = d.token || '';
  const redirect = d.redirect_to || d.site_url || 'https://piccab.com/';
  const link = d.token_hash && t.button
    ? `${supabaseUrl}/auth/v1/verify?token=${encodeURIComponent(d.token_hash)}&type=${encodeURIComponent(type === 'email' ? 'magiclink' : type)}&redirect_to=${encodeURIComponent(redirect)}`
    : '';
  const subject = code ? `${t.subject}: ${code}` : t.subject;
  const html = `<!doctype html><html lang="th"><body style="margin:0;background:#f6f0e8;font-family:Sarabun,Tahoma,Arial,sans-serif;color:#2d2a5a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#fff;border-radius:18px;padding:28px">
<tr><td style="font-size:22px;font-weight:700;padding-bottom:6px">Pic<span style="color:#c2405c">cab</span></td></tr>
<tr><td style="font-size:20px;font-weight:700;padding:10px 0 6px">${esc(t.title)}</td></tr>
${code ? `<tr><td style="font-size:15px;color:#77728c">${esc(t.lead)}</td></tr>
<tr><td style="padding:16px 0"><div style="font-size:34px;font-weight:700;letter-spacing:8px;text-align:center;background:#efeaf7;border-radius:12px;padding:14px 0">${esc(code)}</div></td></tr>` : ''}
${link ? `<tr><td style="font-size:14px;color:#77728c;padding-bottom:10px">${code ? 'หรือกดปุ่มนี้ (เปิดในเบราว์เซอร์เดียวกับที่ใช้ Piccab)' : ''}</td></tr>
<tr><td><a href="${esc(link)}" style="display:inline-block;background:#2d2a5a;color:#fff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:12px">${esc(t.button)}</a></td></tr>` : ''}
<tr><td style="font-size:13px;color:#77728c;padding-top:22px">รหัสนี้ใช้ได้ครั้งเดียวและจะหมดอายุในไม่ช้า · ถ้าคุณไม่ได้ขอ ไม่ต้องทำอะไร</td></tr>
</table></td></tr></table></body></html>`;
  const text = [t.title, code ? `${t.lead}: ${code}` : '', link ? `${t.button}: ${link}` : '', 'รหัสนี้ใช้ได้ครั้งเดียว · ถ้าคุณไม่ได้ขอ ไม่ต้องทำอะไร'].filter(Boolean).join('\n\n');
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

