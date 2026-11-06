// Piccab Worker: serves the static app from ./public and adds a small AI API.
//
//   GET  /api/health  -> { ai: boolean, needCode: boolean }
//   POST /api/scan    -> { items: [{ word, th, alts, box:[x0,y0,x1,y1] }] }
//
// Secrets / variables (Cloudflare → Workers & Pages → piccab → Settings → Variables and Secrets):
//   ANTHROPIC_API_KEY  (secret, required)  key from console.anthropic.com
//   SCAN_CODE          (secret, optional)  access code users must enter before using AI
//   CLAUDE_MODEL       (text,   optional)  defaults to claude-sonnet-5-5
//
// The prompt is built here on the server from a few validated options, so this
// endpoint cannot be used as a general-purpose proxy to the Claude API.

const DEFAULT_MODEL = 'claude-sonnet-5-5';
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
    if (url.pathname === '/api/health') {
      return json({ ai: !!env.ANTHROPIC_API_KEY, needCode: !!env.SCAN_CODE });
    }
    if (url.pathname === '/api/scan') {
      if (request.method !== 'POST') return error('method_not_allowed', 405);
      return scan(request, env);
    }
    if (url.pathname.startsWith('/api/')) return error('not_found', 404);
    return env.ASSETS.fetch(request);
  },
};

async function scan(request, env) {
  if (!env.ANTHROPIC_API_KEY) return error('not_configured', 503);

  if (env.SCAN_CODE) {
    const code = (request.headers.get('x-piccab-code') || '').trim();
    if (!safeEqual(code, String(env.SCAN_CODE).trim())) return error('bad_code', 401);
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
            { type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } },
            { type: 'text', text: buildPrompt(count, level, existing) },
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
  return json({ items, usage: data.usage ? { in: data.usage.input_tokens, out: data.usage.output_tokens } : undefined });
}

function buildPrompt(count, level, existing) {
  return `You are building a picture-vocabulary game for Thai learners of English. Look at the attached image.

Find up to ${count} different things that are clearly visible in the image and worth learning, at ${LEVELS[level]} level. Prefer concrete things a learner can point at: objects, food, furniture, tools, clothing, animals, plants, vehicles, parts of the room or scene. Do not include people's names, brands, logos, or text printed in the image. If the image contains text labels or captions, ignore them: each box must surround the object itself, never a label.${existing.length ? '\nThese words are already in the game, so do not repeat them: ' + existing.join(', ') + '.' : ''}

For each thing give:
- "word": the usual English name a learner's dictionary would use (British spelling, singular, lowercase), 1-4 words
- "th": a short Thai meaning (a few words)
- "alts": up to 3 other acceptable English answers (US spelling, close synonyms), or []
- "box": [x0, y0, x1, y1], a tight bounding box around that thing, in coordinates normalised to 0-1000, where [0,0] is the top-left corner and [1000,1000] is the bottom-right corner of the image

Use each word once. If the same kind of thing appears several times, box the clearest single one. Boxes of different things may overlap.

Reply with only a JSON array, for example:
[{"word":"teapot","th":"กาน้ำชา","alts":["tea pot"],"box":[512,380,690,560]}]`;
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
    .filter(r => r && typeof r.word === 'string' && Array.isArray(r.box) && r.box.length >= 4)
    .slice(0, 40)
    .map(r => ({
      word: r.word.slice(0, 60),
      th: typeof r.th === 'string' ? r.th.slice(0, 120) : '',
      alts: Array.isArray(r.alts) ? r.alts.filter(x => typeof x === 'string').slice(0, 4) : [],
      box: r.box.slice(0, 4).map(Number),
    }));
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
