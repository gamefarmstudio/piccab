// Piccab Worker: serves the static app from ./public and adds a small AI API.
//
//   GET  /api/health  -> { ai: boolean, needCode: boolean }
//   POST /api/scan    -> { items: [{ word, th, alts, box:[x0,y0,x1,y1] }] }
//
// Secrets / variables (Cloudflare → Workers & Pages → piccab → Settings → Variables and Secrets).
// Set the key for at least one AI provider:
//   GEMINI_API_KEY     (secret)  key from aistudio.google.com (has a free tier)
//   ANTHROPIC_API_KEY  (secret)  key from console.anthropic.com
//   AI_PROVIDER        (text, optional)  "gemini" or "claude"; needed only when both keys are set (default: claude)
//   GEMINI_MODEL       (text, optional)  defaults to gemini-3.8-flash
//   CLAUDE_MODEL       (text, optional)  defaults to claude-sonnet-5-5
//   SCAN_CODE          (secret, optional) access code users must enter before using AI
//
// The prompt is built here on the server from a few validated options, so this
// endpoint cannot be used as a general-purpose proxy to an AI API.

const DEFAULT_MODEL = 'claude-sonnet-5-5';
const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';

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
    if (url.pathname === '/api/health') {
      return json({ ai: !!pickProvider(env), needCode: !!env.SCAN_CODE });
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
  const provider = pickProvider(env);
  if (!provider) return error('not_configured', 503);

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

  return provider === 'gemini'
    ? scanGemini(env, m[1], m[2], buildPrompt(count, level, existing, 'gemini'))
    : scanClaude(env, m[1], m[2], buildPrompt(count, level, existing, 'claude'));
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
  return json({ items, provider: 'claude', usage: data.usage ? { in: data.usage.input_tokens, out: data.usage.output_tokens } : undefined });
}

async function scanGemini(env, mime, data64, prompt) {
  const model = String(env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL).replace(/[^a-z0-9.\-]/gi, '');
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
    return error('upstream_unreachable', 502);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    console.log('Gemini API error', res.status, detail.slice(0, 500));
    // 429 with "limit: 0" means this model has no free quota for the project; otherwise it's a rate limit.
    if (res.status === 429) return /limit: ?0\b/.test(detail) ? error('not_configured', 503) : error('rate_limited', 429);
    if (res.status === 503 || res.status === 500) return error('busy', 503);
    if (res.status === 400 && /api key/i.test(detail)) return error('not_configured', 503);
    if (res.status === 401 || res.status === 403 || res.status === 404) return error('not_configured', 503);
    if (res.status === 400 && /image|inline_data|mime/i.test(detail)) return error('image_rejected', 400);
    return error('upstream_error', 502);
  }

  const data = await res.json();
  if (data.promptFeedback && data.promptFeedback.blockReason) return error('refused', 422);
  const cand = (data.candidates || [])[0];
  if (!cand) return error('empty_completion', 502);
  if (/SAFETY|PROHIBITED|BLOCKLIST|RECITATION/.test(cand.finishReason || '')) return error('refused', 422);
  const text = ((cand.content && cand.content.parts) || []).filter(p => typeof p.text === 'string' && !p.thought).map(p => p.text).join('');
  const items = parseItems(text);
  if (!items) return error('invalid_json', 502);
  const u = data.usageMetadata;
  return json({ items, provider: 'gemini', usage: u ? { in: u.promptTokenCount, out: u.candidatesTokenCount } : undefined });
}

function buildPrompt(count, level, existing, provider) {
  // Gemini is trained on its own box format ("box_2d": [ymin, xmin, ymax, xmax], 0-1000) and is much
  // less accurate with any other order, so it gets that format and parseItems() converts it.
  const gem = provider === 'gemini';
  return `You are building a picture-vocabulary game for Thai learners of English. Look at the attached image.

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
