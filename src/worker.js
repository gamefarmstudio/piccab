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
export const SUPABASE_URL = 'https://oftzpfyydnmahkntucnj.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_R8bX28KY2kU5997XFqHelw_fqUvywBh';
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
      return json({ ai: !!pickProvider(env), needCode: !!env.SCAN_CODE, credits: !!env.SUPABASE_SECRET_KEY, monthly: monthlyCredits(env) });
    }
    if (url.pathname === '/api/scan') {
      if (request.method !== 'POST') return error('method_not_allowed', 405);
      return scan(request, env);
    }
    if (url.pathname.startsWith('/api/img/')) return image(request, env, url);
    if (url.pathname === '/api/account') return deleteAccount(request, env);
    if (url.pathname === '/api/shares') return listShares(request, env);
    if (url.pathname === '/api/share' || url.pathname.startsWith('/api/share/')) return share(request, env, url);
    if (url.pathname.startsWith('/api/')) return error('not_found', 404);
    if (/^\/s\/[A-Za-z0-9]{8,16}\/?$/.test(url.pathname)) return sharePage(request, env, url);
    return env.ASSETS.fetch(request);
  },
};

async function scan(request, env) {
  const provider = pickProvider(env);
  if (!provider) return error('not_configured', 503);

  // Who is asking: a signed-in user with credits, a tester with the access code, or (if neither is set up) anyone.
  const useCredits = !!env.SUPABASE_SECRET_KEY;
  const uid = request.headers.get('authorization') ? await userFromRequest(request, env) : null;
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
const userCache = new Map(); // token -> { uid, until }
export async function userFromRequest(request, env) {
  const m = /^Bearer\s+(\S+)$/i.exec(request.headers.get('authorization') || '');
  if (!m) return null;
  const token = m[1], now = Date.now(), hit = userCache.get(token);
  if (hit && hit.until > now) return hit.uid;
  let res;
  try {
    res = await fetch(`${env.SUPABASE_URL || SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY || SUPABASE_PUBLISHABLE_KEY, authorization: `Bearer ${token}` },
    });
  } catch (e) { return null; }
  if (!res.ok) return null;
  const u = await res.json().catch(() => null);
  const uid = u && typeof u.id === 'string' && /^[0-9a-f-]{36}$/i.test(u.id) ? u.id : null;
  if (uid) {
    if (userCache.size > 500) userCache.clear();
    userCache.set(token, { uid, until: now + 5 * 60 * 1000 });
  }
  return uid;
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
    out.scenes.push(builtin ? { id: 'tea', builtin: true } : { id: sc.id, name: cleanStr(sc.name, 60), w, h, items });
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
  const page = await env.ASSETS.fetch(new Request(`${url.origin}/`, { headers: request.headers }));
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

