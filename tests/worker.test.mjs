import worker, { parseItems } from '../src/worker.js';
import assert from 'node:assert/strict';
const img = 'data:image/jpeg;base64,' + Buffer.from('fakejpeg').toString('base64');
let last;
globalThis.fetch = async (url, init) => {
  last = { url, body: JSON.parse(init.body), headers: init.headers };
  return new Response(JSON.stringify({ stop_reason:'end_turn', content:[{type:'text',text:'```json\n[{"word":"teapot","th":"กาน้ำชา","alts":["tea pot"],"box":[1,2,300,400]},{"bad":1}]\n```'}], usage:{input_tokens:2000,output_tokens:300} }), { status:200 });
};
const assets = { fetch: async () => new Response('ASSET') };
const call = (path, opts={}, env={}) => worker.fetch(new Request('https://piccab.com'+path, opts), { ASSETS: assets, ...env });
const post = (body, headers={}) => ({ method:'POST', headers:{'content-type':'application/json',...headers}, body: JSON.stringify(body) });
const KEY = { ANTHROPIC_API_KEY:'sk-test' };

// health
assert.deepEqual(await (await call('/api/health')).json(), { ai:false, needCode:false, credits:false, monthly:30, captcha:'' });
assert.deepEqual(await (await call('/api/health',{},{...KEY, SCAN_CODE:'tea'})).json(), { ai:true, needCode:true, credits:false, monthly:30, captcha:'' });
assert.equal((await (await call('/api/health',{},{TURNSTILE_SITE_KEY:' 0x4AAAA-site '})).json()).captcha, '0x4AAAA-site');
// assets passthrough
assert.equal(await (await call('/')).text(), 'ASSET');
// not configured
assert.equal((await call('/api/scan', post({image:img}))).status, 503);
// code required
let r = await call('/api/scan', post({image:img}), {...KEY, SCAN_CODE:'tea'});
assert.equal(r.status, 401); assert.equal((await r.json()).error, 'bad_code');
// bad image
r = await call('/api/scan', post({image:'data:text/html;base64,AAAA'}), KEY);
assert.equal((await r.json()).error, 'bad_image');
// success with code + rate limiter
let limited = false;
const LIM = { limit: async () => ({ success: !limited }) };
r = await call('/api/scan', post({image:img, count:99, level:'hard', existing:['cup','spoon<script>']}, {'x-piccab-code':'tea'}), {...KEY, SCAN_CODE:'tea', SCAN_LIMITER:LIM});
assert.equal(r.status, 200);
const j = await r.json();
assert.equal(j.items.length, 1); assert.equal(j.items[0].word, 'teapot'); assert.deepEqual(j.items[0].box, [1,2,300,400]);
assert.equal(last.body.model, 'claude-haiku-5-5');
assert.equal(last.headers['x-api-key'], 'sk-test');
const prompt = last.body.messages[0].content[1].text;
assert.match(prompt, /up to 30 different/); assert.match(prompt, /CEFR B2/); assert.match(prompt, /cup, spoonscript/);
assert.equal(last.body.messages[0].content[0].source.media_type, 'image/jpeg');
// model override
await call('/api/scan', post({image:img}), {...KEY, CLAUDE_MODEL:'claude-haiku-5-5'}); assert.equal(last.body.model, 'claude-haiku-5-5');
// rate limited
limited = true;
r = await call('/api/scan', post({image:img}), {...KEY, SCAN_LIMITER:LIM}); assert.equal(r.status, 429);
// upstream errors
globalThis.fetch = async () => new Response('{"error":{"message":"Your credit balance is too low"}}', {status:400});
r = await call('/api/scan', post({image:img}), KEY); assert.equal((await r.json()).error, 'out_of_credit');
globalThis.fetch = async () => new Response('overloaded', {status:529});
r = await call('/api/scan', post({image:img}), KEY); assert.equal((await r.json()).error, 'busy');
globalThis.fetch = async () => new Response(JSON.stringify({stop_reason:'refusal',content:[]}), {status:200});
r = await call('/api/scan', post({image:img}), KEY); assert.equal((await r.json()).error, 'refused');
// GET scan
assert.equal((await call('/api/scan', {}, KEY)).status, 405);
assert.equal(parseItems('no json'), null);
console.log('worker tests passed');

// ---------- Gemini ----------
import { pickProvider, geminiModels, COMPARE_MODELS } from '../src/worker.js';
{
  const G = { GEMINI_API_KEY: 'g-test' };
  assert.equal(pickProvider({}), null);
  assert.equal(pickProvider(G), 'gemini');
  assert.equal(pickProvider({ ...G, ANTHROPIC_API_KEY: 'a' }), 'claude');
  assert.equal(pickProvider({ ...G, ANTHROPIC_API_KEY: 'a', AI_PROVIDER: 'Gemini' }), 'gemini');
  assert.equal(pickProvider({ ANTHROPIC_API_KEY: 'a', AI_PROVIDER: 'gemini' }), 'claude'); // no gemini key -> fall back
  assert.deepEqual(await (await call('/api/health', {}, G)).json(), { ai: true, needCode: false, credits: false, monthly: 30, captcha: '' });

  let g;
  globalThis.fetch = async (url, init) => {
    g = { url, body: JSON.parse(init.body), headers: init.headers };
    return new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [
      { text: 'thinking...', thought: true },
      { text: '[{"word":"teapot","th":"กาน้ำชา","alts":[],"box_2d":[380,512,560,690]},{"word":"cup","box":[1,2,3,4]}]' } ] } }],
      usageMetadata: { promptTokenCount: 1500, candidatesTokenCount: 200 } }), { status: 200 });
  };
  let r = await call('/api/scan', post({ image: img, count: 10, level: 'easy' }), G);
  assert.equal(r.status, 200);
  const j2 = await r.json();
  assert.equal(j2.provider, 'gemini');
  assert.deepEqual(j2.items[0].box, [512, 380, 690, 560]);         // yxyx -> xyxy
  assert.deepEqual(j2.items[1].box, [1, 2, 3, 4]);                 // plain box still accepted
  assert.match(g.url, /models\/gemini-3\.6-flash:generateContent$/);
  assert.equal(g.headers['x-goog-api-key'], 'g-test');
  assert.equal(g.body.contents[0].parts[0].inline_data.mime_type, 'image/jpeg');
  assert.match(g.body.contents[0].parts[1].text, /box_2d.*ymin, xmin, ymax, xmax/);
  assert.equal(g.body.generationConfig.responseMimeType, 'application/json');
  // structured output: Gemini is told the exact shape of the answer
  const sch = g.body.generationConfig.responseSchema;
  assert.equal(sch.type, 'ARRAY'); assert.deepEqual(sch.items.required, ['word', 'th', 'box_2d']);
  assert.deepEqual(sch.items.propertyOrdering, ['word', 'th', 'alts', 'cefr', 'box_2d']);
  assert.equal(sch.items.properties.box_2d.maxItems, 4);
  await call('/api/scan', post({ image: img, langs: ['de'] }), G);
  assert.deepEqual(g.body.generationConfig.responseSchema.items.propertyOrdering, ['word', 'th', 'alts', 'cefr', 'de', 'de_art', 'de_alts', 'box_2d']);

  await call('/api/scan', post({ image: img }), { ...G, GEMINI_MODEL: 'gemini-3.5-flash-lite' });
  assert.match(g.url, /gemini-3\.5-flash-lite:generateContent$/);
  // a model that turns the schema down is asked again without it (and from then on)
  { const bodies = [];
    globalThis.fetch = async (url, init) => { const b = JSON.parse(init.body); bodies.push(!!b.generationConfig.responseSchema);
      return b.generationConfig.responseSchema ? new Response('{"error":{"code":400,"message":"Invalid JSON payload received. Unknown name \\"responseSchema\\" at \'generation_config\'"}}', { status: 400 })
        : new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '[{"word":"cup","box_2d":[1,2,3,4]}]' }] } }] }), { status: 200 }); };
    r = await call('/api/scan', post({ image: img }), { ...G, GEMINI_MODEL: 'old-1' });
    assert.equal(r.status, 200); assert.deepEqual(bodies, [true, false]);
    await call('/api/scan', post({ image: img }), { ...G, GEMINI_MODEL: 'old-1' }); assert.deepEqual(bodies, [true, false, false]); }
  // Claude prompt keeps xyxy
  globalThis.fetch = async (url, init) => { g = { body: JSON.parse(init.body) }; return new Response(JSON.stringify({ stop_reason:'end_turn', content:[{type:'text',text:'[]'}] }), { status: 200 }); };
  await call('/api/scan', post({ image: img }), KEY);
  assert.match(g.body.messages[0].content[1].text, /"box": \[x0, y0, x1, y1\]/);
  // errors
  const errWith = (status, body) => { globalThis.fetch = async () => new Response(body, { status }); };
  errWith(429, '{"error":{"message":"Quota exceeded ... limit: 0, model: x"}}');
  assert.equal((await (await call('/api/scan', post({ image: img }), G)).json()).error, 'not_configured');
  errWith(429, '{"error":{"message":"Resource has been exhausted (e.g. check quota)."}}');
  r = await call('/api/scan', post({ image: img }), G); assert.equal(r.status, 429); assert.equal((await r.json()).error, 'rate_limited');
  errWith(400, '{"error":{"message":"API key not valid. Please pass a valid API key."}}');
  assert.equal((await (await call('/api/scan', post({ image: img }), G)).json()).error, 'not_configured');
  errWith(503, 'overloaded');
  assert.equal((await (await call('/api/scan', post({ image: img }), G)).json()).error, 'busy');
  globalThis.fetch = async () => new Response(JSON.stringify({ promptFeedback: { blockReason: 'SAFETY' } }), { status: 200 });
  assert.equal((await (await call('/api/scan', post({ image: img }), G)).json()).error, 'refused');
  globalThis.fetch = async () => new Response(JSON.stringify({ candidates: [{ finishReason: 'SAFETY' }] }), { status: 200 });
  assert.equal((await (await call('/api/scan', post({ image: img }), G)).json()).error, 'refused');
  // ---- fallback chain ----
  assert.deepEqual(geminiModels(G), ['gemini-3.6-flash','gemini-3.5-flash-lite']);
  assert.deepEqual(geminiModels({ GEMINI_MODEL: ' a-1 , b.2 ' }), ['a-1','b.2']);
  const seen = [];
  const okBody = JSON.stringify({ candidates: [{ content: { parts: [{ text: '[{"word":"cup","box_2d":[1,2,3,4]}]' }] } }] });
  globalThis.fetch = async (url) => {
    const m = url.match(/models\/([^:]+):/)[1]; seen.push(m);
    if (m === 'm1') return new Response('{"error":{"message":"Quota exceeded for metric: generate_content_free_tier_requests, limit: 20 per day"}}', { status: 429 });
    if (m === 'm2') return new Response('busy', { status: 503 });
    return new Response(okBody, { status: 200 });
  };
  const F = { ...G, GEMINI_MODEL: 'm1,m2,m3' };
  r = await call('/api/scan', post({ image: img }), F);
  let jj = await r.json();
  assert.equal(r.status, 200); assert.equal(jj.model, 'm3'); assert.deepEqual(seen, ['m1','m2','m3']);
  // m1 (daily quota) and m2 (busy) are now skipped first
  seen.length = 0;
  r = await call('/api/scan', post({ image: img }), F); jj = await r.json();
  assert.equal(jj.model, 'm3'); assert.deepEqual(seen, ['m3']);
  // all exhausted -> last error returned
  globalThis.fetch = async () => new Response('{"error":{"message":"limit: 20 per day"}}', { status: 429 });
  r = await call('/api/scan', post({ image: img }), { ...G, GEMINI_MODEL: 'x1,x2' });
  assert.equal(r.status, 429); assert.equal((await r.json()).error, 'rate_limited');
  // a non-retryable error (bad image) stops immediately
  seen.length = 0;
  globalThis.fetch = async (url) => { seen.push(url); return new Response('{"error":{"message":"Invalid inline_data"}}', { status: 400 }); };
  r = await call('/api/scan', post({ image: img }), { ...G, GEMINI_MODEL: 'y1,y2' });
  assert.equal((await r.json()).error, 'image_rejected'); assert.equal(seen.length, 1);
  // an answer that can't be read → the next Gemini model (not straight to a paid provider)
  seen.length = 0;
  globalThis.fetch = async (url) => { const m = url.match(/models\/([^:]+):/)[1]; seen.push(m);
    if (m === 'z1') return new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'Here are the things I can see: a cup and a spoon.' }] } }] }), { status: 200 });
    return new Response(okBody, { status: 200 }); };
  r = await call('/api/scan', post({ image: img }), { ...G, GEMINI_MODEL: 'z1,z2' });
  jj = await r.json(); assert.equal(r.status, 200); assert.equal(jj.model, 'z2'); assert.deepEqual(seen, ['z1', 'z2']);
  // Google took too long (504 DEADLINE_EXCEEDED) → the next model, and that one is skipped for a while
  seen.length = 0;
  globalThis.fetch = async (url) => { const m = url.match(/models\/([^:]+):/)[1]; seen.push(m);
    return m === 't1' ? new Response('{"error":{"code":504,"status":"DEADLINE_EXCEEDED"}}', { status: 504 })
      : m === 'u1' ? new Response('error code: 524', { status: 524 }) : new Response(okBody, { status: 200 }); };
  r = await call('/api/scan', post({ image: img }), { ...G, GEMINI_MODEL: 't1,t2' });
  jj = await r.json(); assert.equal(jj.model, 't2'); assert.deepEqual(seen, ['t1', 't2']);
  seen.length = 0; await call('/api/scan', post({ image: img }), { ...G, GEMINI_MODEL: 't1,t2' }); assert.deepEqual(seen, ['t2']);
  seen.length = 0;   // 524: Cloudflare stopped waiting (~100 s) → the same
  r = await call('/api/scan', post({ image: img }), { ...G, GEMINI_MODEL: 'u1,u2' });
  assert.equal((await r.json()).model, 'u2'); assert.deepEqual(seen, ['u1', 'u2']);
  // an answer cut off part-way (ran out of room) → the things that came complete are kept
  const cut = '[{"word":"cup","th":"ถ้วย","alts":[],"cefr":"preA1","box_2d":[1,2,3,4]},{"word":"spoon","th":"ช้อน","alts":["teaspoon"],"box_2d":[5,6,7,8]},{"word":"cup","box_2d":[9,9,9,9]},{"word":"pla';
  assert.deepEqual(parseItems(cut).map(x => x.word), ['cup', 'spoon']);           // complete ones, no repeats
  assert.deepEqual(parseItems('[{"word":"cup","box_2d":[1,2,3,4]},{"word":"sp').map(x => x.word), ['cup']);
  assert.equal(parseItems('[{"word":"cu'), null);
  // a word cut short beside the real one ("teapo" / "teapot"), repeats and plurals go; real pairs stay
  const words = t => parseItems(JSON.stringify(t.split(',').map(word => ({ word, box_2d: [1, 2, 3, 4] })))).map(x => x.word);
  assert.deepEqual(words('cup,saucer,teapo,spoon,teapot'), ['cup', 'saucer', 'spoon', 'teapot']);
  assert.deepEqual(words('teapot,teapo'), ['teapot']);
  assert.deepEqual(words('cup,cupboard,pen,pencil,plant,planter,bus,bush,tap,tape'), ['cup', 'cupboard', 'pen', 'pencil', 'plant', 'planter', 'bus', 'bush', 'tap', 'tape']);
  assert.deepEqual(words('sock,socks,spoon,Spoon,chair'), ['sock', 'spoon', 'chair']);
  assert.deepEqual(words('socks,sock'), ['sock']);
  assert.deepEqual(words('glass,glasses,bus'), ['glass', 'glasses', 'bus']);
  seen.length = 0;
  globalThis.fetch = async (url) => { seen.push(url); return new Response(JSON.stringify({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: cut }] } }] }), { status: 200 }); };
  r = await call('/api/scan', post({ image: img }), { ...G, GEMINI_MODEL: 'c1,c2' });
  jj = await r.json(); assert.equal(r.status, 200); assert.equal(jj.model, 'c1'); assert.equal(jj.items.length, 2); assert.equal(seen.length, 1);
  console.log('gemini tests passed');
}

// ---------- R2 pictures ----------
{
  const store = new Map();
  const IMAGES = {
    async get(k) { const v = store.get(k); return v ? { body: v.body, httpMetadata: v.meta } : null; },
    async put(k, body, opt) { store.set(k, { body, meta: opt.httpMetadata }); },
    async delete(k) { store.delete(k); },
  };
  const UID = '11111111-2222-3333-4444-555555555555', UID2 = '99999999-2222-3333-4444-555555555555';
  let authCalls = 0;
  globalThis.fetch = async (url, init) => {
    authCalls++;
    assert.match(url, /\/auth\/v1\/user$/);
    assert.match(init.headers.apikey, /^sb_publishable_/);
    const t = init.headers.authorization;
    if (t === 'Bearer good') return new Response(JSON.stringify({ id: UID }), { status: 200 });
    if (t === 'Bearer other') return new Response(JSON.stringify({ id: UID2 }), { status: 200 });
    return new Response('{"msg":"invalid JWT"}', { status: 401 });
  };
  const E = { IMAGES };
  const jpg = new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]);
  const req = (method, id, token, body, type) => call('/api/img/' + id, { method, body, headers: { ...(token ? { authorization: 'Bearer ' + token } : {}), ...(type ? { 'content-type': type } : {}) } }, E);

  assert.equal((await req('GET', 's1')).status, 401);                          // no token
  assert.equal((await req('GET', 's1', 'bad')).status, 401);                   // invalid token
  assert.equal((await req('GET', 'a%2Fb', 'good')).status, 400);               // bad id (slash)
  assert.equal((await req('GET', '../x', 'good')).status, 404);                // path tricks never reach the bucket
  assert.equal((await req('PUT', 's1', 'good', jpg, 'text/html')).status, 400); // wrong type
  let r = await req('PUT', 's1', 'good', jpg, 'image/jpeg');
  assert.equal(r.status, 200); assert.equal((await r.json()).key, `u/${UID}/s1`);
  r = await req('GET', 's1', 'good');
  assert.equal(r.status, 200); assert.equal(r.headers.get('content-type'), 'image/jpeg');
  assert.equal(r.headers.get('cache-control'), 'private, no-store');           // a redrawn sheet must not come from an old copy
  assert.deepEqual(new Uint8Array(await r.arrayBuffer()), jpg);
  assert.equal((await req('GET', 's1', 'other')).status, 404);                 // another user can't see it
  const big = new Uint8Array(3 * 1024 * 1024 + 1);
  assert.equal((await req('PUT', 's2', 'good', big, 'image/jpeg')).status, 413);
  assert.equal((await req('POST', 's1', 'good')).status, 405);
  assert.equal((await req('DELETE', 's1', 'good')).status, 200);
  assert.equal((await req('GET', 's1', 'good')).status, 404);
  const before = authCalls; await req('GET', 's1', 'good'); assert.equal(authCalls, before); // token cached
  assert.equal((await call('/api/img/s1', { headers: { authorization: 'Bearer good' } }, {})).status, 503); // no bucket bound
  console.log('r2 image tests passed');
}

// ---------- AI credits ----------
{
  const UID = '11111111-2222-3333-4444-555555555555';
  let credits = 2, rpcLog = [], scanOk = true;
  globalThis.fetch = async (url, init) => {
    if (url.endsWith('/auth/v1/user')) return init.headers.authorization === 'Bearer good' ? new Response(JSON.stringify({ id: UID })) : new Response('{}', { status: 401 });
    if (url.includes('/rest/v1/rpc/')) {
      const fn = url.split('/rpc/')[1], args = JSON.parse(init.body);
      rpcLog.push([fn, args, init.headers.apikey, init.headers.authorization]);
      if (fn === 'use_ai_credit') { if (credits <= 0) return new Response('-1'); credits--; return new Response(String(credits)); }
      if (fn === 'refund_ai_credit') { credits++; return new Response(String(credits)); }
    }
    if (url.includes('generativelanguage')) return scanOk
      ? new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '[{"word":"cup","box_2d":[1,2,3,4]}]' }] } }] }))
      : new Response('{"error":{"message":"bad inline_data"}}', { status: 400 });
    throw new Error('unexpected ' + url);
  };
  const C = { GEMINI_API_KEY: 'g', GEMINI_MODEL: 'm-ok', SUPABASE_SECRET_KEY: 'sb_secret_xyz', AI_MONTHLY_CREDITS: '5' };
  const scanReq = (headers, env) => call('/api/scan', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify({ image: img }) }, env);

  assert.deepEqual(await (await call('/api/health', {}, C)).json(), { ai: true, needCode: false, credits: true, monthly: 5, captcha: '' });
  // not signed in, no code → login required
  let r = await scanReq({}, C); assert.equal(r.status, 401); assert.equal((await r.json()).error, 'login_required');
  // signed in → uses a credit, reports what is left
  r = await scanReq({ authorization: 'Bearer good' }, C);
  let j = await r.json(); assert.equal(r.status, 200); assert.equal(j.credits_left, 1); assert.equal(j.items[0].word, 'cup');
  assert.deepEqual(rpcLog[0].slice(0, 3), ['use_ai_credit', { p_user: UID, p_monthly: 5 }, 'sb_secret_xyz']);
  assert.equal(rpcLog[0][3], undefined);                      // new secret keys go only in the apikey header
  // a failed scan gives the credit back
  scanOk = false;
  r = await scanReq({ authorization: 'Bearer good' }, C); j = await r.json();
  assert.equal(r.status, 400); assert.equal(j.error, 'image_rejected'); assert.equal(j.credits_left, 1); assert.equal(credits, 1);
  scanOk = true;
  await scanReq({ authorization: 'Bearer good' }, C);        // uses the last credit
  r = await scanReq({ authorization: 'Bearer good' }, C);    // none left
  assert.equal(r.status, 402); assert.equal((await r.json()).error, 'no_credits');
  // testers with the access code still work without signing in (and use no credits)
  const before = rpcLog.length;
  r = await scanReq({ 'x-piccab-code': 'tea' }, { ...C, SCAN_CODE: 'tea' }); assert.equal(r.status, 200);
  assert.equal(rpcLog.length, before);
  r = await scanReq({}, { ...C, SCAN_CODE: 'tea' }); assert.equal((await r.json()).error, 'login_required');
  r = await scanReq({ 'x-piccab-code': 'nope' }, { ...C, SCAN_CODE: 'tea' }); assert.equal((await r.json()).error, 'bad_code');
  // invalid sign-in falls back to the code rule
  r = await scanReq({ authorization: 'Bearer bad' }, C); assert.equal((await r.json()).error, 'login_required');
  // legacy service_role JWT goes in both headers
  credits = 3; rpcLog = [];
  await scanReq({ authorization: 'Bearer good' }, { ...C, SUPABASE_SECRET_KEY: 'eyJhbGc.legacy.jwt' });
  assert.equal(rpcLog[0][3], 'Bearer eyJhbGc.legacy.jwt');
  // without the secret key, signed-in users follow the old rules (code if set, else open)
  r = await scanReq({ authorization: 'Bearer good' }, { GEMINI_API_KEY: 'g', GEMINI_MODEL: 'm-ok' }); assert.equal(r.status, 200);
  r = await scanReq({ authorization: 'Bearer good' }, { GEMINI_API_KEY: 'g', GEMINI_MODEL: 'm-ok', SCAN_CODE: 'tea' }); assert.equal((await r.json()).error, 'bad_code');
  console.log('credit tests passed');
}

// ---------- auth e-mail hook ----------
{
  const { verifyWebhook, buildAuthEmail } = await import('../src/worker.js');
  // official Standard Webhooks test vector
  const H = (o) => new Headers(o);
  const vec = { 'webhook-id': 'msg_p5jXN8AQM9LWM0D4loKWxJek', 'webhook-timestamp': '1614265330', 'webhook-signature': 'v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=' };
  // the public test key from the Standard Webhooks spec (not a real secret; split so secret scanners don't flag it)
  const KEY = ['wh', 'sec_', 'MfKQ9r8GKYqrTwjUPD8I', 'LPZIo2LaLaSw'].join(''), SECRET = 'v1,' + KEY;
  assert.equal(await verifyWebhook(SECRET, H(vec), '{"test": 2432232314}', 1614265330), true);
  assert.equal(await verifyWebhook(KEY, H(vec), '{"test": 2432232314}', 1614265330), true);
  assert.equal(await verifyWebhook(SECRET, H(vec), '{"test": 1}', 1614265330), false);                  // body changed
  assert.equal(await verifyWebhook(SECRET, H(vec), '{"test": 2432232314}', 1614265330 + 3600), false);  // too old
  assert.equal(await verifyWebhook(SECRET, H({ ...vec, 'webhook-signature': 'v1,AAAA v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=' }), '{"test": 2432232314}', 1614265330), true); // several signatures

  const mail = buildAuthEmail({ user: { email: 'a@x.com' }, email_data: { token: '123456', token_hash: 'abc', redirect_to: 'https://piccab.com/', email_action_type: 'magiclink', site_url: 'https://piccab.com' } }, 'https://p.supabase.co');
  assert.equal(mail.subject, 'รหัสเข้าสู่ระบบ Piccab: 123456');
  assert.match(mail.html, /123456/);
  assert.match(mail.html, /https:\/\/p\.supabase\.co\/auth\/v1\/verify\?token=abc&amp;type=magiclink&amp;redirect_to=https%3A%2F%2Fpiccab\.com%2F/);
  assert.match(mail.text, /123456/);
  const su = buildAuthEmail({ user: { email: 'a@x.com' }, email_data: { token: '654321', token_hash: 'h', email_action_type: 'signup' } }, 'https://p.supabase.co');
  assert.match(su.subject, /ยืนยันอีเมลสมัคร Piccab: 654321/); assert.match(su.html, /type=signup/);
  const xss = buildAuthEmail({ email_data: { token: '<b>', email_action_type: 'magiclink' } }, 'https://p');
  assert.ok(!xss.html.includes('<b>'));

  // endpoint: signs like Supabase does, sends through Resend
  const raw = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(24))));
  const env = { SEND_EMAIL_HOOK_SECRET: 'v1,whsec_' + raw, RESEND_API_KEY: 're_test' };
  const sign = async (body, ts = Math.floor(Date.now() / 1000)) => {
    const key = await crypto.subtle.importKey('raw', Uint8Array.from(atob(raw), c => c.charCodeAt(0)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`msg_1.${ts}.${body}`)))));
    return { 'webhook-id': 'msg_1', 'webhook-timestamp': String(ts), 'webhook-signature': 'v1,' + sig, 'content-type': 'application/json' };
  };
  let sent = null, resendStatus = 200;
  globalThis.fetch = async (url, init) => { sent = { url, init, body: JSON.parse(init.body) }; return new Response('{"id":"e1"}', { status: resendStatus }); };
  const payload = JSON.stringify({ user: { email: 'kid@school.th' }, email_data: { token: '111222', token_hash: 'th', email_action_type: 'magiclink', redirect_to: 'https://piccab.com/' } });
  let r = await call('/api/auth-email', { method: 'POST', headers: await sign(payload), body: payload }, env);
  assert.equal(r.status, 200);
  assert.equal(sent.url, 'https://api.resend.com/emails');
  assert.equal(sent.init.headers.authorization, 'Bearer re_test');
  assert.deepEqual(sent.body.to, ['kid@school.th']);
  assert.equal(sent.body.from, 'Piccab <no-reply@piccab.com>');
  assert.equal(sent.body.subject, 'รหัสเข้าสู่ระบบ Piccab: 111222');
  // forged / unsigned / not configured
  sent = null;
  r = await call('/api/auth-email', { method: 'POST', headers: { ...(await sign(payload)), 'webhook-signature': 'v1,Zm9yZ2Vk' }, body: payload }, env);
  assert.equal(r.status, 401); assert.equal(sent, null);
  r = await call('/api/auth-email', { method: 'POST', body: payload }, env); assert.equal(r.status, 401);
  r = await call('/api/auth-email', { method: 'POST', headers: await sign(payload), body: payload }, {}); assert.equal(r.status, 500);
  // Resend failure is reported back to Supabase
  resendStatus = 422;
  r = await call('/api/auth-email', { method: 'POST', headers: await sign(payload), body: payload }, env);
  assert.equal(r.status, 500); assert.equal((await r.json()).error.message, 'could not send e-mail');
  console.log('auth email hook tests passed');
}

// ---------- delete account ----------
{
  const store = new Map();
  const UID = 'aaaaaaaa-2222-3333-4444-555555555555', UID2 = 'bbbbbbbb-2222-3333-4444-555555555555';
  for (let i = 0; i < 1203; i++) store.set(`u/${UID}/s${i}`, 1);
  store.set(`u/${UID2}/keep`, 1);
  const IMAGES = {
    async list({ prefix, cursor }) {
      const all = [...store.keys()].filter(k => k.startsWith(prefix)).sort(), start = cursor ? +cursor : 0;
      const objects = all.slice(start, start + 500).map(key => ({ key }));
      return { objects, truncated: start + 500 < all.length, cursor: String(start + 500) };
    },
    async delete(keys) { (Array.isArray(keys) ? keys : [keys]).forEach(k => store.delete(k)); },
  };
  let adminCall = null, adminStatus = 200;
  globalThis.fetch = async (url, init) => {
    if (/\/auth\/v1\/user$/.test(url)) return init.headers.authorization === 'Bearer tok' ? new Response(JSON.stringify({ id: UID }), { status: 200 }) : new Response('{}', { status: 401 });
    adminCall = { url, init }; return new Response('{}', { status: adminStatus });
  };
  const del = (env, token = 'tok', method = 'DELETE') => call('/api/account', { method, headers: token ? { authorization: 'Bearer ' + token } : {} }, env);
  const E = { IMAGES, SUPABASE_SECRET_KEY: 'sb_secret_x' };
  assert.equal((await del(E, 'tok', 'POST')).status, 405);
  assert.equal((await del({ IMAGES })).status, 503);                           // no secret key
  assert.equal((await del(E, null)).status, 401);
  assert.equal((await del(E, 'bad')).status, 401);
  assert.equal(store.size, 1204);
  adminStatus = 500;
  let r = await del(E); assert.equal(r.status, 502);
  adminStatus = 200;
  r = await del(E); assert.equal(r.status, 200);
  const jj = await r.json();
  assert.equal(jj.ok, true);
  assert.deepEqual([...store.keys()], [`u/${UID2}/keep`]);                    // only the other user's picture is left
  assert.equal(adminCall.url, `https://oftzpfyydnmahkntucnj.supabase.co/auth/v1/admin/users/${UID}`);
  assert.equal(adminCall.init.method, 'DELETE');
  assert.equal(adminCall.init.headers.apikey, 'sb_secret_x');
  assert.equal(adminCall.init.headers.authorization, 'Bearer sb_secret_x');
  adminStatus = 404; r = await del(E); assert.equal(r.status, 200);           // already gone → fine
  console.log('delete account tests passed');
}

// ---------- share links ----------
{
  const { cleanShareBody } = await import('../src/worker.js');
  const store = new Map();
  const IMAGES = {
    async get(k) { const v = store.get(k); return v ? { body: v.body, httpMetadata: v.meta, arrayBuffer: async () => v.body } : null; },
    async put(k, body, opt) { store.set(k, { body, meta: opt && opt.httpMetadata }); },
    async delete(keys) { (Array.isArray(keys) ? keys : [keys]).forEach(k => store.delete(k)); },
    async list({ prefix }) { return { objects: [...store.keys()].filter(k => k.startsWith(prefix)).map(key => ({ key })), truncated: false }; },
  };
  const A = 'aaaaaaaa-1111-1111-1111-111111111111', B = 'bbbbbbbb-1111-1111-1111-111111111111';
  const rows = new Map();
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url);
    if (u.pathname === '/auth/v1/user') {
      const t = init.headers.authorization;
      return t === 'Bearer ta' ? new Response(JSON.stringify({ id: A })) : t === 'Bearer tb' ? new Response(JSON.stringify({ id: B })) : new Response('{}', { status: 401 });
    }
    if (u.pathname === '/rest/v1/shares') {
      assert.equal(init.headers.apikey, 'sb_secret_x');
      const q = Object.fromEntries(u.searchParams);
      const m = init.method || 'GET';
      const match = r => (!q.id || r.id === q.id.slice(3)) && (!q.owner || r.owner === q.owner.slice(3));
      if (m === 'GET') {
        const list = [...rows.values()].filter(match);
        return new Response(JSON.stringify(list), { headers: { 'content-range': `0-0/${list.length}` } });
      }
      if (m === 'POST') { const b = JSON.parse(init.body); rows.set(b.id, { ...rows.get(b.id), ...b }); return new Response(null, { status: 201 }); }
      if (m === 'DELETE') { for (const r of [...rows.values()]) if (match(r)) rows.delete(r.id); return new Response(null, { status: 204 }); }
    }
    throw new Error('unexpected fetch ' + url);
  };
  const E = { IMAGES, SUPABASE_SECRET_KEY: 'sb_secret_x', ASSETS: { fetch: async () => new Response('<html><head><title>Piccab</title></head><body>app</body></html>') } };
  const go = (path, method = 'GET', body, tok) => worker.fetch(new Request('https://piccab.com' + path, { method, headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}) }, body: body && JSON.stringify(body) }), E);
  const scene = { id: 's1', name: 'Kitchen <b>', w: 800, h: 600, items: { h1: { word: 'cup', th: 'ถ้วย', alts: ['mug'], x: 1, y: 2, w: 3, h: 4, evil: 'x' }, 'bad id!': { word: 'x' } } };
  store.set(`u/${A}/s1`, { body: new Uint8Array([1, 2, 3]), meta: { contentType: 'image/jpeg' } });

  // validation
  assert.equal(cleanShareBody({ kind: 'nope', scenes: [scene] }), null);
  assert.equal(cleanShareBody({ kind: 'scene', scenes: [] }), null);
  assert.equal(cleanShareBody({ kind: 'deck', scenes: [scene], words: ['zz|h1'] }), null);   // words must point at shared scenes
  const cleaned = cleanShareBody({ kind: 'scene', name: 'K', scenes: [scene] });
  assert.deepEqual(Object.keys(cleaned.scenes[0].items), ['h1']);
  assert.equal(cleaned.scenes[0].items.h1.evil, undefined);

  // create needs sign-in and a picture
  assert.equal((await go('/api/share', 'POST', { kind: 'scene', name: 'K', scenes: [scene] })).status, 401);
  let r = await go('/api/share', 'POST', { kind: 'scene', name: 'K', scenes: [{ ...scene, id: 's9' }] }, 'ta');
  assert.equal(r.status, 409); assert.equal((await r.json()).error, 'picture_missing');
  r = await go('/api/share', 'POST', { kind: 'scene', name: 'Kitchen', scenes: [scene] }, 'ta');
  assert.equal(r.status, 200);
  const made = await r.json();
  assert.match(made.id, /^[A-Za-z0-9]{10}$/); assert.equal(made.url, 'https://piccab.com/s/' + made.id);
  assert.ok(store.has(`s/${made.id}/s1`));                                    // picture copied

  // anyone can read it (no owner in the reply), and its picture
  r = await go('/api/share/' + made.id); assert.equal(r.status, 200);
  const pub = await r.json();
  assert.equal(pub.kind, 'scene'); assert.equal(pub.owner, undefined); assert.equal(pub.scenes[0].items.h1.word, 'cup');
  r = await go(`/api/share/${made.id}/img/s1`); assert.equal(r.status, 200); assert.match(r.headers.get('cache-control'), /public/);
  assert.equal((await go(`/api/share/${made.id}/img/s2`)).status, 404);
  assert.equal((await go('/api/share/NOPE')).status, 404);
  assert.equal((await go('/api/share/Abcdefgh12')).status, 404);

  // the original can change or disappear: the link keeps its copy
  store.delete(`u/${A}/s1`);
  assert.equal((await go(`/api/share/${made.id}/img/s1`)).status, 200);
  store.set(`u/${A}/s1`, { body: new Uint8Array([9]), meta: { contentType: 'image/png' } });

  // update keeps the id; someone else "updating" gets a new link instead
  r = await go('/api/share', 'POST', { id: made.id, kind: 'scene', name: 'Kitchen 2', scenes: [scene] }, 'ta');
  assert.equal((await r.json()).id, made.id); assert.equal(rows.get(made.id).name, 'Kitchen 2');
  store.set(`u/${B}/s1`, { body: new Uint8Array([7]), meta: { contentType: 'image/jpeg' } });
  r = await go('/api/share', 'POST', { id: made.id, kind: 'scene', name: 'Hijack', scenes: [scene] }, 'tb');
  const other = await r.json(); assert.notEqual(other.id, made.id); assert.equal(rows.get(made.id).name, 'Kitchen 2');

  // deck with the sample scene (no picture) + own scene
  r = await go('/api/share', 'POST', { kind: 'deck', name: 'Hard words', scenes: [{ id: 'tea', builtin: true }, scene], words: ['tea|teapot', 's1|h1', 'gone|x'] }, 'ta');
  const deck = await r.json(); assert.equal(r.status, 200);
  assert.deepEqual(rows.get(deck.id).data.words, ['tea|teapot', 's1|h1']);
  assert.ok(!store.has(`s/${deck.id}/tea`));

  // list own links
  r = await go('/api/shares', 'GET', null, 'ta'); const mine = (await r.json()).shares;
  assert.deepEqual(mine.map(x => x.id).sort(), [made.id, deck.id].sort());
  assert.equal((await go('/api/shares')).status, 401);

  // share page has link-preview tags
  r = await go('/s/' + made.id); const html = await r.text();
  assert.match(html, /<meta property="og:title" content="ฉาก “Kitchen 2” · 1 คำ — Piccab">/);
  assert.match(html, new RegExp(`og:image" content="https://piccab.com/api/share/${made.id}/img/s1"`));
  assert.ok(!html.includes('<title>Piccab</title>'));
  r = await go('/s/Zzzzzzzzzz'); assert.match(await r.text(), /<title>Piccab<\/title>/);   // unknown → plain app
  // made with English menus (?hl=en) → English preview
  r = await go('/s/' + made.id + '?hl=en'); { const h = await r.text();
    assert.match(h, /<meta property="og:title" content="Scene “Kitchen 2” · 1 word — Piccab">/); assert.match(h, /og:description" content="Learn words from a picture/); }

  // delete: only the owner
  assert.equal((await go('/api/share/' + made.id, 'DELETE', null, 'tb')).status, 404);
  assert.equal((await go('/api/share/' + made.id, 'DELETE', null, 'ta')).status, 200);
  assert.ok(!rows.has(made.id)); assert.ok(!store.has(`s/${made.id}/s1`));
  assert.equal((await go('/api/share/' + made.id)).status, 404);
  console.log('share link tests passed');
}

// ---------- classrooms ----------
{
  const T = 'aaaaaaaa-2222-2222-2222-222222222222', S1 = 'bbbbbbbb-2222-2222-2222-222222222222', S2 = 'cccccccc-2222-2222-2222-222222222222', X = 'dddddddd-2222-2222-2222-222222222222';
  const users = { tt: { id: T, email: 'teacher@school.th' }, s1: { id: S1, is_anonymous: true }, s2: { id: S2, is_anonymous: true }, xx: { id: X } };
  const db = { classes: [], class_members: [], class_items: [], class_progress: [], learner_reports: [], plans: [], shares: [
    { id: 'ShareScene1', owner: T, kind: 'scene', name: 'Kitchen', data: { scenes: [{ id: 's1', items: { a: {}, b: {}, c: {} } }] } },
    { id: 'ShareDeck01', owner: T, kind: 'deck', name: 'Hard', data: { scenes: [], words: ['tea|x', 'tea|y'] } },
    { id: 'ShareOther1', owner: X, kind: 'scene', name: 'Not mine', data: { scenes: [{ id: 'z', items: {} }] } } ] };
  const keyCols = { classes: ['id'], class_members: ['class_id', 'user_id'], class_items: ['class_id', 'share_id'], class_progress: ['class_id', 'share_id', 'user_id'], shares: ['id'], learner_reports: ['user_id'], plans: ['email'] };
  const parseVal = v => v === 'is.true' ? ['true'] : v.startsWith('eq.') ? [v.slice(3)] : v.startsWith('in.(') ? v.slice(4, -1).split(',').map(x => x.replace(/^"|"$/g, '')) : null;
  const cascade = (t, rows) => {
    for (const r of rows) {
      if (t === 'classes') ['class_members', 'class_items', 'class_progress'].forEach(tt => db[tt] = db[tt].filter(x => x.class_id !== r.id));
      if (t === 'class_members') db.class_progress = db.class_progress.filter(x => !(x.class_id === r.class_id && x.user_id === r.user_id));
      if (t === 'class_items') db.class_progress = db.class_progress.filter(x => !(x.class_id === r.class_id && x.share_id === r.share_id));
    }
  };
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url);
    if (u.pathname === '/auth/v1/user') { const t = (init.headers.authorization || '').slice(7); return users[t] ? new Response(JSON.stringify(users[t])) : new Response('{}', { status: 401 }); }
    const t = u.pathname.replace('/rest/v1/', ''); assert.ok(db[t], 'table ' + t);
    const filters = [...u.searchParams].filter(([k]) => !['select', 'order', 'on_conflict', 'limit'].includes(k)).map(([k, v]) => [k, parseVal(v)]);
    const match = r => filters.every(([k, vals]) => vals.includes(String(r[k])));
    const m = init.method || 'GET';
    if (m === 'GET') return new Response(JSON.stringify(db[t].filter(match)));
    if (m === 'DELETE') { const gone = db[t].filter(match); db[t] = db[t].filter(r => !match(r)); cascade(t, gone); return new Response(null, { status: 204 }); }
    if (m === 'PATCH') { db[t].filter(match).forEach(r => Object.assign(r, JSON.parse(init.body))); return new Response(null, { status: 204 }); }
    if (m === 'POST') {
      const rows = [].concat(JSON.parse(init.body)), pref = init.headers.prefer || '', keys = keyCols[t];
      for (const row of rows) {
        const same = db[t].find(r => keys.every(k => r[k] === row[k]));
        if (t === 'classes' && db.classes.some(r => r.code === row.code)) return new Response('{"code":"23505"}', { status: 409 });
        if (same) { if (pref.includes('merge-duplicates')) Object.assign(same, row); else if (!pref.includes('ignore-duplicates')) return new Response('{}', { status: 409 }); }
        else db[t].push({ ...row });
      }
      return new Response(null, { status: 201 });
    }
  };
  const E = { SUPABASE_SECRET_KEY: 'sb_secret_x', ASSETS: { fetch: async () => new Response('<html><head><title>Piccab</title></head></html>') } };
  const go = async (path, method = 'GET', body, tok) => { const r = await worker.fetch(new Request('https://piccab.com' + path, { method, headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}) }, body: body && JSON.stringify(body) }), E); return { status: r.status, j: await r.json().catch(() => null) }; };

  assert.equal((await go('/api/classes')).status, 401);
  assert.equal((await go('/api/classes', 'POST', { name: 'P.4/2' }, 's1')).j.error, 'student_account');   // students can't make classes
  let r = await go('/api/classes', 'POST', { name: 'ป.4/2 ภาษาอังกฤษ' }, 'tt'); assert.equal(r.status, 200);
  const cls = r.j; assert.match(cls.code, /^[A-Z2-9]{6}$/);
  // join with code (any case/spaces), nickname cleaned
  assert.equal((await go('/api/classes/join', 'POST', { code: 'ZZZZZZ', nickname: 'Mint' }, 's1')).status, 404);
  assert.equal((await go('/api/classes/join', 'POST', { code: cls.code, nickname: '  ' }, 's1')).j.error, 'bad_nickname');
  assert.equal((await go('/api/classes/join', 'POST', { code: cls.code, nickname: 'x' }, 'tt')).j.error, 'own_class');
  r = await go('/api/classes/join', 'POST', { code: ' ' + cls.code.toLowerCase().slice(0, 3) + ' ' + cls.code.slice(3), nickname: '<b>มิ้นท์</b>' }, 's1');
  assert.equal(r.status, 200); assert.equal(r.j.nickname, 'bมิ้นท์/b');
  await go('/api/classes/join', 'POST', { code: cls.code, nickname: 'Mint' }, 's1');                       // rejoin = rename, no duplicate
  await go('/api/classes/join', 'POST', { code: cls.code, nickname: 'Ploy' }, 's2');
  assert.equal(db.class_members.length, 2);
  // assignments: only the teacher, only own share links
  assert.equal((await go(`/api/classes/${cls.id}/items`, 'POST', { share_id: 'ShareScene1' }, 's1')).status, 403);
  assert.equal((await go(`/api/classes/${cls.id}/items`, 'POST', { share_id: 'ShareOther1' }, 'tt')).j.error, 'bad_share');
  assert.equal((await go(`/api/classes/${cls.id}/items`, 'POST', { share_id: 'ShareScene1' }, 'tt')).status, 200);
  assert.equal((await go(`/api/classes/${cls.id}/items`, 'POST', { share_id: 'ShareDeck01' }, 'tt')).status, 200);
  await go(`/api/classes/${cls.id}/items`, 'POST', { share_id: 'ShareDeck01' }, 'tt');
  assert.equal(db.class_items.length, 2);
  // progress: own rows only, clamped, only for real items/classes
  r = await go('/api/classes/progress', 'POST', { rows: [
    { class_id: cls.id, share_id: 'ShareScene1', total: 3, done: 9, star: 1 },
    { class_id: cls.id, share_id: 'ShareOther1', total: 1, done: 1, star: 1 },
    { class_id: 'NotAClass1', share_id: 'ShareScene1', total: 1, done: 1, star: 1 } ] }, 's1');
  assert.equal(r.j.saved, 1); assert.equal(db.class_progress[0].done, 3); assert.equal(db.class_progress[0].user_id, S1);
  await go('/api/classes/progress', 'POST', { rows: [{ class_id: cls.id, share_id: 'ShareDeck01', total: 2, done: 1, star: 0 }] }, 's2');
  assert.equal((await go('/api/classes/progress', 'POST', { rows: [{ class_id: cls.id, share_id: 'ShareScene1', total: 3, done: 3, star: 3 }] }, 'xx')).j.saved, 0);  // not a member
  // views
  r = await go(`/api/classes/${cls.id}`, 'GET', null, 'tt');
  assert.equal(r.j.role, 'teacher'); assert.deepEqual(r.j.items.map(i => [i.share_id, i.total]), [['ShareScene1', 3], ['ShareDeck01', 2]]);
  assert.equal(r.j.members.length, 2); assert.equal(r.j.progress.length, 2);
  r = await go(`/api/classes/${cls.id}`, 'GET', null, 's2');
  assert.equal(r.j.role, 'student'); assert.equal(r.j.code, undefined); assert.equal(r.j.members, undefined);
  assert.deepEqual(r.j.progress.map(p => p.share_id), ['ShareDeck01']);                                    // only their own
  assert.equal((await go(`/api/classes/${cls.id}`, 'GET', null, 'xx')).status, 404);                       // outsiders see nothing
  r = await go('/api/classes', 'GET', null, 'tt'); assert.equal(r.j.teaching[0].members, 2);
  r = await go('/api/classes', 'GET', null, 's1'); assert.deepEqual(r.j.learning, [{ id: cls.id, name: 'ป.4/2 ภาษาอังกฤษ', kind: 'class', nickname: 'Mint', report: false }]);
  // 📈 learning reports: kept only while shared; the teacher sees only those who share
  const rep = { s: { streak: 2, week: 9, total: 30, star: 4, min7: 12, last: '2026-11-19' }, days: [['2026-11-19', 5, 6, 1, { quiz: 4, evil: 1 }]], weak: [['cat', 'แมว', 3]], stage: 'p34', extra: 'x'.repeat(50), ach: { lv: 7, xp: 1240, place: 3, n: 12, total: 33, recent: [['w100', 20400], ['bad id!', 1]] } };
  assert.deepEqual((await go('/api/classes/report', 'POST', { data: rep }, 's1')).j, { ok: true, shared: false });
  assert.equal(db.learner_reports.length, 0);                                                            // not shared → not kept
  assert.equal((await go('/api/classes/join', 'POST', { code: cls.code, nickname: 'Mint', report: true }, 's1')).j.report, true);
  assert.deepEqual((await go('/api/classes/report', 'POST', { data: rep }, 's1')).j, { ok: true, shared: true });
  assert.equal(db.learner_reports.length, 1); assert.equal(db.learner_reports[0].data.extra, undefined); assert.deepEqual(db.learner_reports[0].data.days[0][4], { quiz: 4 }); assert.deepEqual(db.learner_reports[0].data.ach, { lv: 7, xp: 1240, place: 3, n: 12, total: 33, recent: [['w100', 20400]] });
  r = await go(`/api/classes/${cls.id}`, 'GET', null, 'tt');
  assert.deepEqual(r.j.members.map(x => [x.nickname, x.report]).sort(), [['Mint', true], ['Ploy', false]]);
  assert.deepEqual(r.j.reports.map(x => [x.user_id, x.s.streak]), [[S1, 2]]); assert.deepEqual(r.j.plan, { pro: false, required: false });
  r = await go(`/api/classes/${cls.id}/report/${S1}`, 'GET', null, 'tt'); assert.equal(r.j.nickname, 'Mint'); assert.equal(r.j.data.weak[0][0], 'cat');
  assert.equal((await go(`/api/classes/${cls.id}/report/${S2}`, 'GET', null, 'tt')).j.error, 'not_shared');
  assert.equal((await go(`/api/classes/${cls.id}/report/${S1}`, 'GET', null, 's2')).status, 403);        // students can't read others' reports
  // Pro lock (PRO_REQUIRED=1): only accounts with a plan
  const goPro = async (path, tok) => { const x = await worker.fetch(new Request('https://piccab.com' + path, { headers: { authorization: 'Bearer ' + tok } }), { ...E, PRO_REQUIRED: '1' }); return { status: x.status, j: await x.json() }; };
  assert.equal((await goPro(`/api/classes/${cls.id}/report/${S1}`, 'tt')).status, 402);
  db.plans.push({ email: 'teacher@school.th', plan: 'pro', until: null });
  assert.equal((await goPro(`/api/classes/${cls.id}/report/${S1}`, 'tt')).status, 200);
  assert.deepEqual((await goPro('/api/classes', 'tt')).j.plan, { pro: true, until: null, required: true });
  db.plans[0].until = '2020-01-01T00:00:00Z'; assert.equal((await goPro(`/api/classes/${cls.id}/report/${S1}`, 'tt')).status, 402);   // expired
  // stop sharing → report deleted
  assert.equal((await go(`/api/classes/${cls.id}/members/me`, 'PATCH', { report: false }, 's1')).j.report, false);
  assert.equal(db.learner_reports.length, 0);
  // family group: members always share
  const fam = (await go('/api/classes', 'POST', { name: 'บ้าน', kind: 'family' }, 'tt')).j; assert.equal(fam.kind, 'family');
  assert.deepEqual((await go('/api/classes/join', 'POST', { code: fam.code, nickname: 'Mint', report: false }, 's1')).j, { id: fam.id, name: 'บ้าน', nickname: 'Mint', kind: 'family', report: true });
  assert.equal((await go(`/api/classes/${fam.id}/members/me`, 'PATCH', { report: false }, 's1')).j.error, 'family_report');
  await go('/api/classes/report', 'POST', { data: rep }, 's1'); assert.equal(db.learner_reports.length, 1);
  await go(`/api/classes/${fam.id}/members/me`, 'DELETE', null, 's1'); assert.equal(db.learner_reports.length, 0);   // left → deleted
  await go(`/api/classes/${fam.id}`, 'DELETE', null, 'tt');
  // students can't change the class or remove others
  assert.equal((await go(`/api/classes/${cls.id}/members/${S2}`, 'DELETE', null, 's1')).status, 403);
  assert.equal((await go(`/api/classes/${cls.id}`, 'DELETE', null, 's1')).status, 403);
  // join page preview
  const page = await worker.fetch(new Request('https://piccab.com/c/' + cls.code), E);
  assert.match(await page.text(), /เข้าห้องเรียน “ป.4\/2 ภาษาอังกฤษ”/);
  // removing an item drops its progress; a student leaving drops theirs; teacher removes a student
  await go(`/api/classes/${cls.id}/items/ShareDeck01`, 'DELETE', null, 'tt');
  assert.equal(db.class_progress.length, 1);
  await go(`/api/classes/${cls.id}/members/me`, 'DELETE', null, 's1');
  assert.equal(db.class_progress.length, 0); assert.equal(db.class_members.length, 1);
  await go(`/api/classes/${cls.id}/members/${S2}`, 'DELETE', null, 'tt'); assert.equal(db.class_members.length, 0);
  assert.equal((await go(`/api/classes/${cls.id}`, 'PATCH', { name: 'ป.4/3' }, 'tt')).j.name, 'ป.4/3');
  assert.equal((await go(`/api/classes/${cls.id}`, 'DELETE', null, 'tt')).status, 200);
  assert.equal(db.classes.length + db.class_items.length, 0);
  // AI: student accounts are turned away
  const ai = await worker.fetch(new Request('https://piccab.com/api/scan', { method: 'POST', headers: { authorization: 'Bearer s1' }, body: '{}' }), { ...E, GEMINI_API_KEY: 'g' });
  assert.equal(ai.status, 403); assert.equal((await ai.json()).error, 'student_account');
  console.log('classroom tests passed');
}

// ---------- 📝 paper tests checked from a photo ----------
{
  const T = 'aaaaaaaa-3333-3333-3333-333333333333', S1 = 'bbbbbbbb-3333-3333-3333-333333333333', S2 = 'cccccccc-3333-3333-3333-333333333333', X = 'dddddddd-3333-3333-3333-333333333333';
  const users = { pt: { id: T, email: 't@school.th' }, p1: { id: S1, is_anonymous: true }, p2: { id: S2, is_anonymous: true }, px: { id: X, email: 'x@x.th' } };
  const db = { classes: [{ id: 'ClassTest01', code: 'ABCDEF', owner: T, name: 'ป.5/1', kind: 'class' }], class_members: [
      { class_id: 'ClassTest01', user_id: S2, nickname: 'Beam' }, { class_id: 'ClassTest01', user_id: S1, nickname: 'Mint' }],   // as the database sorts them
    class_items: [], class_progress: [], plans: [], class_tests: [], class_test_results: [], ai_usage: [] };
  const keyCols = { class_tests: ['id'], class_test_results: ['test_id', 'user_id'], ai_usage: ['id'] };
  const parseVal = v => v.startsWith('eq.') ? [v.slice(3)] : v.startsWith('in.(') ? v.slice(4, -1).split(',').map(x => x.replace(/^"|"$/g, '')) : null;
  let aiCalls = [], aiPrompt = '', missing = false;
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url);
    if (u.pathname === '/auth/v1/user') { const t = (init.headers.authorization || '').slice(7); return users[t] ? new Response(JSON.stringify(users[t])) : new Response('{}', { status: 401 }); }
    if (u.hostname === 'api.anthropic.com') { aiCalls.push('claude'); aiPrompt = JSON.parse(init.body).messages[0].content.find(c => c.type === 'text').text;
      return new Response(JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text: '[{"n":1,"a":"Kat","box":[100,200,400,260]},{"n":2,"a":"dog"},{"n":9,"a":"x"}]' }], usage: { input_tokens: 9, output_tokens: 9 } })); }
    if (u.hostname.includes('generativelanguage')) { aiCalls.push('gemini'); return new Response('{}', { status: 500 }); }
    const t = u.pathname.replace('/rest/v1/', '');
    if (missing && t.startsWith('class_test')) return new Response('{"code":"PGRST205","message":"Could not find the table public.class_tests"}', { status: 404 });
    assert.ok(db[t], 'table ' + t);
    const filters = [...u.searchParams].filter(([k]) => !['select', 'order', 'on_conflict', 'limit'].includes(k)).map(([k, v]) => [k, parseVal(v)]);
    const match = r => filters.every(([k, vals]) => vals.includes(String(r[k])));
    const m = init.method || 'GET';
    if (m === 'GET') return new Response(JSON.stringify(db[t].filter(match)));
    if (m === 'DELETE') { const gone = db[t].filter(match); db[t] = db[t].filter(r => !match(r)); if (t === 'class_tests') db.class_test_results = db.class_test_results.filter(r => !gone.some(g => g.id === r.test_id)); return new Response(null, { status: 204 }); }
    if (m === 'PATCH') { db[t].filter(match).forEach(r => Object.assign(r, JSON.parse(init.body))); return new Response(null, { status: 204 }); }
    if (m === 'POST') {
      for (const row of [].concat(JSON.parse(init.body))) {
        const keys = keyCols[t], same = keys && db[t].find(r => keys.every(k => r[k] === row[k]));
        if (same) Object.assign(same, row); else db[t].push({ reads: 0, created_at: '2026-11-21T05:00:00Z', ...row });
      }
      return new Response(null, { status: 201 });
    }
  };
  const E = { SUPABASE_SECRET_KEY: 'sb_secret_x', ANTHROPIC_API_KEY: 'a', GEMINI_API_KEY: 'g', AI_PROVIDER: 'gemini,claude', ASSETS: assets };
  const go = async (path, method = 'GET', body, tok, env = E) => { const r = await worker.fetch(new Request('https://piccab.com' + path, { method, headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}) }, body: body && JSON.stringify(body) }), env); return { status: r.status, j: await r.json().catch(() => null) }; };
  const base = '/api/classes/ClassTest01/tests';
  const words = [{ w: 'cat', th: 'แมว' }, { w: 'dog', th: 'หมา' }, { w: 'Cat', th: 'ซ้ำ' }, { w: 'ice cream', th: 'ไอศกรีม' }];
  // only the teacher makes a test; the class list becomes its roster, each with an order of the 3 (unique) words
  assert.equal((await go(base, 'POST', { name: 'Animals', words }, 'p1')).status, 403);
  assert.equal((await go(base, 'POST', { name: 'Animals', words }, 'px')).status, 404);
  let r = await go(base, 'POST', { name: ' Animals\n', words, q: 'th', hint: 'first', mix: true }, 'pt');
  assert.equal(r.status, 200); const tid = r.j.id;
  assert.deepEqual(r.j.words.map(w => w.w), ['cat', 'dog', 'ice cream']); assert.deepEqual(r.j.opts, { q: 'th', hint: 'first' });
  assert.deepEqual(r.j.roster.map(x => x.n), ['Beam', 'Mint']); assert.ok(r.j.roster.every(x => [...x.o].sort().join() === '0,1,2'));
  assert.ok(!JSON.stringify(r.j).includes(S1));                                                         // no user ids to the app
  r = await go(base, 'POST', { name: 'Same order', words, mix: false }, 'pt'); assert.deepEqual(r.j.roster[0].o, [0, 1, 2]);
  await go(`${base}/${r.j.id}`, 'DELETE', null, 'pt'); assert.equal(db.class_tests.length, 1);
  // ✨ read a photo: Claude only (children's handwriting), the key is not in the prompt, misspellings kept
  db.class_tests[0].roster[1].o = [1, 0, 2];                                                            // Mint's sheet: dog, cat, ice cream
  r = await go(`${base}/${tid}/read`, 'POST', { image: img, k: 1, first: 1, last: 3 }, 'pt');
  assert.equal(r.status, 200); assert.deepEqual(aiCalls, ['claude']);
  assert.deepEqual(r.j.items, [{ n: 1, a: 'kat', box: [100, 200, 400, 260] }, { n: 2, a: 'dog' }, { n: 9, a: 'x' }]);
  assert.match(aiPrompt, /from 1 to 3/); assert.match(aiPrompt, /Do NOT correct the spelling/); assert.doesNotMatch(aiPrompt, /ice cream|แมว/);
  assert.equal(db.class_tests[0].reads, 1);
  assert.equal((await go(`${base}/${tid}/read`, 'POST', { image: img, k: 5, first: 1, last: 3 }, 'pt')).status, 400);   // no such student
  assert.equal((await go(`${base}/${tid}/read`, 'POST', { image: img, k: 0, first: 1, last: 9 }, 'pt')).status, 400);   // no question 9
  assert.equal((await go(`${base}/${tid}/read`, 'POST', { image: img, k: 0, first: 1, last: 3 }, 'p1')).status, 403);
  db.class_tests[0].reads = 99; assert.equal((await go(`${base}/${tid}/read`, 'POST', { image: img, k: 0, first: 1, last: 3 }, 'pt')).j.error, 'too_many_reads');
  db.class_tests[0].reads = 1;
  aiCalls = []; await go(`${base}/${tid}/read`, 'POST', { image: img, k: 0, first: 1, last: 3 }, 'pt', { ...E, ANTHROPIC_API_KEY: '' }); assert.ok(aiCalls.length && aiCalls.every(x => x === 'gemini'));   // no Claude key: Gemini
  // ✓ save what the teacher checked (per word of the key); a student sees their score and the words to practise
  assert.equal((await go(`${base}/${tid}/results/1`, 'PUT', { answers: [{ a: 'kat', ok: false }] }, 'pt')).status, 400);   // one per word
  r = await go(`${base}/${tid}/results/1`, 'PUT', { answers: [{ a: 'kat', ok: false }, { a: 'dog', ok: true }, null] }, 'pt');
  assert.equal(r.j.result.score, 1); assert.equal(r.j.result.total, 3);
  r = await go(`${base}/${tid}/results/1`, 'PUT', { answers: [{ a: 'kat', ok: false }, { a: 'dog', ok: true }, { a: 'icecream', ok: true, extra: 1 }] }, 'pt');
  assert.equal(r.j.result.score, 2); assert.equal(db.class_test_results.length, 1); assert.deepEqual(db.class_test_results[0].answers[2], { a: 'icecream', ok: true });
  r = await go(`${base}/${tid}`, 'GET', null, 'pt');
  assert.deepEqual(r.j.roster.map(x => x.result && x.result.score), [null, 2]); assert.equal(r.j.words.length, 3);
  r = await go(base, 'GET', null, 'pt'); assert.deepEqual(r.j.tests.map(t => [t.name, t.total, t.students, t.checked, t.avg]), [['Animals', 3, 2, 1, 67]]);
  r = await go('/api/classes/tests', 'GET', null, 'p1');
  assert.deepEqual(r.j.tests.map(t => [t.name, t.class_id, t.class_name, t.score, t.total, t.wrong]), [['Animals', 'ClassTest01', 'ป.5/1', 2, 3, [{ w: 'cat', th: 'แมว' }]]]);
  assert.deepEqual((await go('/api/classes/tests', 'GET', null, 'p2')).j.tests, []);
  // learning report: the student's test scores
  const { cleanReport, weekSummary } = await import('../src/worker.js');
  const rep = cleanReport({ tests: [['Animals', 'ป.5/1', 2, 3, '2026-11-21'], ['bad', '', 9, 3, '2026-11-21'], ['', '', 1, 1, null]] });
  assert.deepEqual(rep.tests, [['Animals', 'ป.5/1', 2, 3, '2026-11-21']]);
  assert.deepEqual(weekSummary(rep, Date.parse('2026-11-22T10:00:00Z')).tests, [['Animals', 2, 3]]);
  // all answers taken away → no result; deleting the test deletes its results
  await go(`${base}/${tid}/results/1`, 'PUT', { answers: [null, null, null] }, 'pt'); assert.equal(db.class_test_results.length, 0);
  await go(`${base}/${tid}/results/0`, 'PUT', { answers: [{ a: 'cat', ok: true }, null, null] }, 'pt');
  await go(`${base}/${tid}`, 'DELETE', null, 'pt'); assert.equal(db.class_tests.length + db.class_test_results.length, 0);
  // no students / no table yet
  db.class_members = []; assert.equal((await go(base, 'POST', { name: 'x', words }, 'pt')).j.error, 'no_students');
  missing = true; assert.equal((await go(base, 'GET', null, 'pt')).j.error, 'needs_tests_sql'); assert.deepEqual((await go('/api/classes/tests', 'GET', null, 'p1')).j.tests, []);
  console.log('class test (paper) tests passed');
}

// ---------- class leaderboard ----------
{
  const { leaderboard } = await import('../src/worker.js');
  const members = [{ user_id: 'a', nickname: 'Mint' }, { user_id: 'b', nickname: 'Ploy' }, { user_id: 'c', nickname: 'Beam' }, { user_id: 'd', nickname: 'Air' }];
  const prog = [
    { user_id: 'a', share_id: 's1', done: 5, star: 2 }, { user_id: 'a', share_id: 's2', done: 3, star: 3 },
    { user_id: 'b', share_id: 's1', done: 8, star: 5 },
    { user_id: 'c', share_id: 's1', done: 8, star: 5 },
    { user_id: 'd', share_id: 'gone', done: 99, star: 99 } ];                       // removed assignment doesn't count
  const rows = leaderboard(members, prog, new Set(['s1', 's2']), 'a');
  assert.deepEqual(rows.map(r => [r.rank, r.nickname, r.done, r.star, r.me]),
    [[1, 'Beam', 8, 5, false], [1, 'Mint', 8, 5, true], [1, 'Ploy', 8, 5, false], [4, 'Air', 0, 0, false]]);
  assert.equal(rows[0].done, 8); assert.equal(rows.filter(r => r.rank === 1).length, 3); assert.equal(rows[3].rank, 4);
  assert.equal(rows.find(r => r.me).nickname, 'Mint');
  assert.ok(rows.every(r => !('user_id' in r)));                                     // no ids leak to students
  console.log('leaderboard tests passed');
}

// ---------- reports → e-mail, admin gate ----------
{
  const { adminMailHtml } = await import('../src/worker.js');
  assert.ok(!adminMailHtml('x <b>', [['a', '<script>']], 'https://p/admin').includes('<script>'));
  const sent = [], waits = [];
  const prof = { 'aaaaaaaa-3333-3333-3333-333333333333': { user_id: 'aaaaaaaa-3333-3333-3333-333333333333', nickname: 'Reporter', code: 'AAAAAAAA', student: false },
                 'bbbbbbbb-3333-3333-3333-333333333333': { user_id: 'bbbbbbbb-3333-3333-3333-333333333333', nickname: 'Bad <i>', code: 'BBBBBBBB', student: true } };
  const users = { r: { id: 'aaaaaaaa-3333-3333-3333-333333333333', email: 'r@x.th' }, adm: { id: 'cccccccc-3333-3333-3333-333333333333', email: 'Boss@X.th' } };
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url);
    if (u.host === 'api.resend.com') { sent.push(JSON.parse(init.body)); return new Response('{"id":"m"}'); }
    if (u.pathname === '/auth/v1/user') { const t = init.headers.authorization.slice(7); return users[t] ? new Response(JSON.stringify(users[t])) : new Response('{}', { status: 401 }); }
    if (u.pathname === '/rest/v1/friend_profiles') { const id = (u.searchParams.get('user_id') || '').slice(3); return new Response(JSON.stringify(prof[id] ? [prof[id]] : [])); }
    if (u.pathname === '/rest/v1/friend_reports') return new Response(null, { status: 201 });
    if (u.pathname === '/rest/v1/friendships') return new Response(JSON.stringify([{ a: 'aaaaaaaa-3333-3333-3333-333333333333', b: 'bbbbbbbb-3333-3333-3333-333333333333', status: 'accepted' }]));
    if (u.pathname === '/rest/v1/shares') return new Response(JSON.stringify([{ id: 'ShareBad001', owner: 'bbbbbbbb-3333-3333-3333-333333333333', kind: 'scene', name: 'Bad pic', data: { scenes: [] } }]));
    throw new Error('unexpected ' + url);
  };
  const ctx = { waitUntil: p => waits.push(p) };
  const E = { SUPABASE_SECRET_KEY: 'sb_secret_x', RESEND_API_KEY: 're_x', ADMIN_EMAILS: 'boss@x.th, other@x.th' };
  let r = await worker.fetch(new Request('https://piccab.com/api/friends/bbbbbbbb-3333-3333-3333-333333333333/report', { method: 'POST', headers: { authorization: 'Bearer r' }, body: JSON.stringify({ reason: 'ชื่อเล่นไม่เหมาะสม' }) }), E, ctx);
  assert.equal(r.status, 200); await Promise.all(waits);
  assert.equal(sent.length, 1); assert.deepEqual(sent[0].to, ['contact@piccab.com']);
  assert.match(sent[0].subject, /^\[Piccab\] รายงานผู้ใช้: Bad <i>$/); assert.ok(sent[0].html.includes('Bad &lt;i&gt;')); assert.match(sent[0].text, /BBBBBBBB, บัญชีนักเรียน/);
  // share report, not signed in, custom recipient
  r = await worker.fetch(new Request('https://piccab.com/api/report/share', { method: 'POST', body: JSON.stringify({ share_id: 'ShareBad001', reason: 'รูปไม่เหมาะสม' }) }), { ...E, ADMIN_NOTIFY_EMAIL: 'me@x.th' }, ctx);
  assert.equal(r.status, 200); await Promise.all(waits);
  assert.deepEqual(sent[1].to, ['me@x.th']); assert.match(sent[1].text, /https:\/\/piccab.com\/s\/ShareBad001/); assert.match(sent[1].text, /ไม่ได้เข้าสู่ระบบ/);
  assert.equal((await worker.fetch(new Request('https://piccab.com/api/report/share', { method: 'POST', body: JSON.stringify({ share_id: 'nope' }) }), E, ctx)).status, 404);
  // no e-mail key → still saved, no mail
  r = await worker.fetch(new Request('https://piccab.com/api/report/share', { method: 'POST', body: JSON.stringify({ share_id: 'ShareBad001' }) }), { SUPABASE_SECRET_KEY: 'sb_secret_x' }, ctx);
  assert.equal(r.status, 200); assert.equal(sent.length, 2);
  // admin gate: only listed e-mails (case-insensitive); others see 404
  assert.equal((await worker.fetch(new Request('https://piccab.com/api/admin/me', { headers: { authorization: 'Bearer r' } }), E)).status, 404);
  assert.equal((await worker.fetch(new Request('https://piccab.com/api/admin/me'), E)).status, 404);
  assert.equal((await worker.fetch(new Request('https://piccab.com/api/admin/me', { headers: { authorization: 'Bearer adm' } }), E)).status, 200);
  assert.equal((await worker.fetch(new Request('https://piccab.com/api/admin/me', { headers: { authorization: 'Bearer adm' } }), { ...E, ADMIN_EMAILS: '' })).status, 404);
  console.log('report e-mail + admin gate tests passed');
}

// ---------- other languages (German) ----------
{
  const W = await import('../src/worker.js');
  // scan results may carry German with its article
  const it = W.parseItems('[{"word":"teapot","th":"กาน้ำชา","alts":[],"box":[1,2,3,4],"de":" Teekanne ","de_art":"Die","de_alts":["Kanne",5]},{"word":"cup","box":[1,2,3,4],"de":"","de_art":"der"}]');
  assert.deepEqual(it[0].l, { de: { w: 'Teekanne', a: 'die', alts: ['Kanne'] } });
  assert.equal(it[1].l, undefined);
  assert.deepEqual(W.cleanLangWord({ w: 'x', a: 'den', alts: 'no' }), { w: 'x', a: '', alts: [] });
  // translations
  const tr = W.parseTranslations('```json\n[{"k":"a1","w":"Stuhl","a":"der","alts":["Sessel"]},{"k":"bad key!","w":"x"},{"k":"a2","w":""},{"k":"a3","w":"Lampe","a":"DIE"}]\n```');
  assert.deepEqual(tr, [{ k: 'a1', w: 'Stuhl', a: 'der', alts: ['Sessel'] }, { k: 'a3', w: 'Lampe', a: 'die', alts: [] }]);
  assert.equal(W.parseTranslations('nope'), null);
  // word lists (a teacher's dictation sheet)
  assert.deepEqual(W.parseWordlist('```json\n[{"w":"1. Apple","th":"แอปเปิล"},{"w":"apple"},{"w":"ก"},{"w":"12) run (v.)","th":"วิ่ง"},{"w":"ice-cream"},{"x":1}]\n```'),
    [{ w:'Apple', th:'แอปเปิล' }, { w:'run', th:'วิ่ง' }, { w:'ice-cream', th:'' }]);
  assert.equal(W.parseWordlist('no list'), null);
  assert.equal(W.parseWordlist(JSON.stringify(Array.from({length:80},(_,i)=>({w:'word'+i})))).length, 60);
  assert.match(W.buildWordlistPrompt(), /dictation[\s\S]*"w"[\s\S]*"th"[\s\S]*names of students[\s\S]*At most 60/);
  assert.match(W.buildTranslatePrompt('de', [{ k: 'a1', en: 'chair', th: 'เก้าอี้' }]), /German[\s\S]*"der", "die" or "das"[\s\S]*"k":"a1"/);
  // shares keep German words; items with no word at all are dropped
  const scene = { id: 's1', name: 'Room', w: 100, h: 100, items: {
    a1: { word: 'chair', th: 'เก้าอี้', alts: [], x: 1, y: 1, w: 5, h: 5, l: { de: { w: 'Stuhl', a: 'der', alts: [] }, xx: { w: 'zz' } } },
    a2: { word: '', th: '', alts: [], x: 1, y: 1, w: 5, h: 5, l: { de: { w: 'Lampe', a: 'die' } } },
    a3: { word: '', th: '', alts: [], x: 1, y: 1, w: 5, h: 5 } } };
  const out = W.cleanShareBody({ kind: 'scene', scenes: [scene] });
  assert.deepEqual(out.scenes[0].items.a1.l, { de: { w: 'Stuhl', a: 'der', alts: [] } });
  assert.deepEqual(out.scenes[0].items.a2.l, { de: { w: 'Lampe', a: 'die', alts: [] } });
  assert.equal(out.scenes[0].items.a3, undefined);
  // /api/translate: words only (no picture), German only, same gate as scans
  const g = { GEMINI_API_KEY: 'g', AI_PROVIDER: 'gemini' };
  globalThis.fetch = async (url, init) => { last = { url, body: JSON.parse(init.body) };
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '[{"k":"a1","w":"Stuhl","a":"der","alts":[]}]' }] } }] }), { status: 200 }); };
  let r = await call('/api/translate', post({ lang: 'fr', words: [{ k: 'a1', en: 'chair' }] }), g);
  assert.equal(r.status, 400);
  r = await call('/api/translate', post({ lang: 'de', words: [{ k: 'a1', en: 'chair', th: 'เก้าอี้' }] }), g);
  assert.equal(r.status, 200);
  assert.deepEqual((await r.json()).items, [{ k: 'a1', w: 'Stuhl', a: 'der', alts: [] }]);
  assert.equal(last.body.contents[0].parts.length, 1);                    // text only, no picture
  assert.match(last.body.contents[0].parts[0].text, /"en":"chair"/);
  r = await call('/api/translate', { method: 'GET' }, g); assert.equal(r.status, 405);
  r = await call('/api/translate', post({ lang: 'de', words: [] }), g); assert.equal(r.status, 400);
  r = await call('/api/translate', post({ lang: 'de', words: [{ k: 'a1', en: 'chair' }] }), { ...g, SUPABASE_SECRET_KEY: 'sb_secret_x' });
  assert.equal(r.status, 401);                                             // credits on → sign-in needed
  // scans ask for German when lang=de
  globalThis.fetch = async (url, init) => { last = { url, body: JSON.parse(init.body) };
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '[{"word":"teapot","box_2d":[1,2,3,4],"de":"Teekanne","de_art":"die"}]' }] } }] }), { status: 200 }); };
  r = await call('/api/scan', post({ image: img, lang: 'de' }), g);
  const j = await r.json();
  assert.deepEqual(j.items[0].l, { de: { w: 'Teekanne', a: 'die', alts: [] } });
  assert.match(last.body.contents[0].parts[1].text, /"de_art"/);
  r = await call('/api/scan', post({ image: img }), g);
  assert.doesNotMatch(last.body.contents[0].parts[1].text, /German/);
  r = await call('/api/scan', post({ image: img, langs: ['de', 'xx', 'de'] }), g);
  assert.equal((last.body.contents[0].parts[1].text.match(/"de_art"/g) || []).length, 1);
  console.log('german (scan, translate, share) tests passed');
}

{
  const { buildAuthEmail, mailLang, pageLang } = await import('../src/worker.js');
  const TH = /[\u0E00-\u0E7F]/;
  const en = buildAuthEmail({ user: { email: 'a@x.com' }, email_data: { token: '123456', token_hash: 'abc', redirect_to: 'https://piccab.com/app?hl=en', email_action_type: 'magiclink' } }, 'https://p.supabase.co');
  assert.equal(en.subject, 'Your Piccab sign-in code: 123456'); assert.ok(!TH.test(en.html) && !TH.test(en.text)); assert.match(en.html, /<html lang="en">/);
  const meta = buildAuthEmail({ user: { email: 'a@x.com', user_metadata: { lang: 'en' } }, email_data: { token: '1', email_action_type: 'signup' } }, 'https://p');
  assert.equal(meta.subject, 'Confirm your Piccab email: 1');
  const th = buildAuthEmail({ user: { email: 'a@x.com', user_metadata: { lang: 'en' } }, email_data: { token: '1', email_action_type: 'magiclink', redirect_to: 'https://piccab.com/app' } }, 'https://p');
  assert.equal(th.subject, 'Your Piccab sign-in code: 1');   // metadata says English, redirect has no hl → still English
  assert.equal(mailLang({ email_data: { redirect_to: 'https://piccab.com/app?hl=th' }, user: { user_metadata: { lang: 'en' } } }), 'th');   // the latest choice wins
  assert.equal(mailLang({ email_data: { redirect_to: 'https://piccab.com/app' }, user: {} }), 'th');
  assert.equal(pageLang(new URL('https://piccab.com/c/ABCDEF?hl=en')), 'en'); assert.equal(pageLang(new URL('https://piccab.com/c/ABCDEF')), 'th');
  console.log('english e-mail + previews tests passed');
}

{
  // AI usage counter: every model attempt is saved (no user / picture), the admin report sums them
  const { default: w, aiUsageReport, zoneMidnight } = await import('../src/worker.js');
  const rows = []; let tableMissing = false;
  const UID = '11111111-1111-1111-1111-111111111111';
  globalThis.fetch = async (url, init = {}) => {
    if (url.endsWith('/auth/v1/user')) return new Response(JSON.stringify({ id: UID, email: 'boss@piccab.th' }));
    if (url.includes('/rest/v1/rpc/use_ai_credit')) return new Response('3');
    if (url.endsWith('/rest/v1/ai_usage')) { if (tableMissing) return new Response('{}', { status: 404 }); for (const r of JSON.parse(init.body)) rows.push({ ...r, created_at: new Date().toISOString() }); return new Response(null, { status: 201 }); }
    if (url.includes('/rest/v1/rpc/ai_usage_')) {
      if (tableMissing) return new Response('{}', { status: 404 });
      const fn = url.split('/rpc/')[1], since = JSON.parse(init.body || '{}').p_since || '';
      const sel = rows.filter(r => r.created_at >= since);
      if (fn === 'ai_usage_summary') { const g = {}; for (const r of sel) { const k = [r.kind, r.provider, r.model, r.outcome].join('|'); g[k] = g[k] || { kind: r.kind, provider: r.provider, model: r.model, outcome: r.outcome, n: 0, tok_in: 0, tok_out: 0 }; g[k].n++; g[k].tok_in += r.tok_in || 0; g[k].tok_out += r.tok_out || 0; } return new Response(JSON.stringify(Object.values(g))); }
      if (fn === 'ai_usage_daily') return new Response(JSON.stringify(sel.map(r => ({ day: r.created_at.slice(0, 10), kind: r.kind, ok: r.outcome === 'ok', n: 1 }))));
      return new Response('null');
    }
    if (url.includes('generativelanguage')) {
      if (url.includes('u-fast')) return new Response('{"error":{"message":"Quota exceeded for metric: generate_content_free_tier_requests, limit: 20 per day"}}', { status: 429 });
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '[{"word":"cup","box_2d":[1,2,3,4]}]' }] } }], usageMetadata: { promptTokenCount: 1200, candidatesTokenCount: 300, thoughtsTokenCount: 500 } }));
    }
    throw new Error('unexpected ' + url);
  };
  const E = { GEMINI_API_KEY: 'g', GEMINI_MODEL: 'u-fast,u-lite', SUPABASE_SECRET_KEY: 'sb_secret_x', ADMIN_EMAILS: 'boss@piccab.th' };
  const img = 'data:image/jpeg;base64,' + Buffer.from('fakejpeg').toString('base64');
  let r = await w.fetch(new Request('https://piccab.com/api/scan', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer t' }, body: JSON.stringify({ image: img }) }), E);
  assert.equal(r.status, 200);
  assert.deepEqual(rows.map(x => [x.kind, x.model, x.outcome]), [['scan', 'u-fast', 'quota_day'], ['scan', 'u-lite', 'ok']]);
  assert.equal(rows[1].tok_in, 1200); assert.equal(rows[1].tok_out, 800);          // thinking counted as output
  assert.ok(!('user_id' in rows[0]) && !JSON.stringify(rows).includes('cup'));   // nothing about the user or the words
  r = await w.fetch(new Request('https://piccab.com/api/translate', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer t' }, body: JSON.stringify({ lang: 'de', words: [{ k: 'a', en: 'cup' }] }) }), E);
  assert.equal(rows.filter(x => x.kind === 'translate').length, 1);              // 3.8 is skipped for a while after its daily quota ran out
  // admin report
  r = await w.fetch(new Request('https://piccab.com/api/admin/ai-usage', { headers: { authorization: 'Bearer t' } }), E);
  const rep = await r.json(); assert.equal(r.status, 200);
  assert.equal(rep.provider, 'gemini'); assert.equal(rep.free_rpd['gemini-3.5-flash-lite'], 500);
  assert.equal(rep.today.rows.find(x => x.outcome === 'quota_day').n, 1);
  assert.ok(rep.quota_day.since < rep.quota_day.resets);
  // not an admin → nothing here
  r = await w.fetch(new Request('https://piccab.com/api/admin/ai-usage', { headers: { authorization: 'Bearer t' } }), { ...E, ADMIN_EMAILS: 'x@y.z' }); assert.equal(r.status, 404);
  // before the SQL is run: scans still work, report asks for setup
  tableMissing = true;
  r = await w.fetch(new Request('https://piccab.com/api/scan', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer t' }, body: JSON.stringify({ image: img }) }), E);
  assert.equal(r.status, 200);
  assert.deepEqual(await aiUsageReport(E), { setup: true });
  // quota day = midnight Pacific (15:00 in Thailand in winter)
  assert.equal(zoneMidnight(new Date('2026-11-07T12:46:00Z'), 'America/Los_Angeles').toISOString(), '2026-11-07T08:00:00.000Z');
  assert.equal(zoneMidnight(new Date('2026-11-07T12:46:00Z'), 'Asia/Bangkok').toISOString(), '2026-11-06T17:00:00.000Z');
  console.log('ai usage counter tests passed');
}

{
  // class assignments in German: language saved per assignment, totals count only words that have German
  const { default: w, shareTotal } = await import('../src/worker.js');
  const sceneDe = { kind: 'scene', data: { scenes: [{ id: 's1', items: { a: { word: 'cup', l: { de: { w: 'Tasse', a: 'die' } } }, b: { word: 'pot' }, c: { word: 'lamp', l: { de: { w: 'Lampe', a: 'die' } } } } }] } };
  assert.equal(shareTotal(sceneDe), 3); assert.equal(shareTotal(sceneDe, 'de'), 2);
  assert.equal(shareTotal({ kind: 'scene', data: { scenes: [{ id: 'tea', builtin: true, n: 24 }] } }, 'de'), 24);
  const deck = { kind: 'deck', data: { words: ['s1|a', 's1|b', 'tea|teapot'], scenes: [sceneDe.data.scenes[0], { id: 'tea', builtin: true, n: 24 }] } };
  assert.equal(shareTotal(deck), 3); assert.equal(shareTotal(deck, 'de'), 2);

  const T = 'aaaaaaaa-3333-3333-3333-333333333333', S = 'bbbbbbbb-3333-3333-3333-333333333333';
  const users = { tl: { id: T }, sl: { id: S, is_anonymous: true } };
  let langColumn = false;
  const db = { classes: [{ id: 'ClassLang01', code: 'DEUTS1', owner: T, name: 'Deutsch 4' }], class_members: [{ class_id: 'ClassLang01', user_id: S, nickname: 'Mia' }], class_items: [], class_progress: [],
    shares: [{ id: 'ShareDe0001', owner: T, ...sceneDe, name: 'Küche' }, { id: 'ShareEn0001', owner: T, ...sceneDe, name: 'Kitchen' }] };
  const keyCols = { class_items: ['class_id', 'share_id'], class_progress: ['class_id', 'share_id', 'user_id'] };
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url);
    if (u.pathname === '/auth/v1/user') { const t = (init.headers.authorization || '').slice(7); return users[t] ? new Response(JSON.stringify(users[t])) : new Response('{}', { status: 401 }); }
    const t = u.pathname.replace('/rest/v1/', '');
    const filters = [...u.searchParams].filter(([k]) => !['select', 'order', 'on_conflict'].includes(k)).map(([k, v]) => [k, v.startsWith('eq.') ? [v.slice(3)] : v.slice(4, -1).split(',').map(x => x.replace(/^"|"$/g, ''))]);
    const match = r => filters.every(([k, vals]) => vals.includes(String(r[k])));
    const m = init.method || 'GET';
    if (m === 'GET') return new Response(JSON.stringify(db[t].filter(match)));
    if (m === 'POST') {
      for (const row of [].concat(JSON.parse(init.body))) {
        if (t === 'class_items' && 'lang' in row && !langColumn) return new Response('{"message":"column lang does not exist"}', { status: 400 });
        const same = db[t].find(r => keyCols[t].every(k => r[k] === row[k]));
        if (same) { if ((init.headers.prefer || '').includes('merge-duplicates')) Object.assign(same, row); } else db[t].push({ ...row });
      }
      return new Response(null, { status: 201 });
    }
    return new Response(null, { status: 204 });
  };
  const E = { SUPABASE_SECRET_KEY: 'sb_secret_x' };
  const go = async (path, method = 'GET', body, tok = 'tl') => { const r = await w.fetch(new Request('https://piccab.com' + path, { method, headers: { 'content-type': 'application/json', authorization: 'Bearer ' + tok }, body: body && JSON.stringify(body) }), E); return { status: r.status, j: await r.json().catch(() => null) }; };
  // before the SQL: English still works, German asks for the update
  let r = await go('/api/classes/ClassLang01/items', 'POST', { share_id: 'ShareEn0001' }); assert.equal(r.status, 200);
  r = await go('/api/classes/ClassLang01/items', 'POST', { share_id: 'ShareDe0001', lang: 'de' }); assert.equal(r.j.error, 'needs_update');
  langColumn = true;
  r = await go('/api/classes/ClassLang01/items', 'POST', { share_id: 'ShareDe0001', lang: 'de' }); assert.equal(r.status, 200); assert.equal(r.j.lang, 'de');
  r = await go('/api/classes/ClassLang01/items', 'POST', { share_id: 'ShareDe0001', lang: 'xx' }); assert.equal(r.status, 400);
  r = await go('/api/classes/ClassLang01/items', 'POST', { share_id: 'ShareEn0001', lang: 'de' }); assert.equal(r.j.error, 'other_lang');   // already English
  r = await go('/api/classes/ClassLang01/items', 'POST', { share_id: 'ShareDe0001', lang: 'de' }); assert.equal(r.status, 200);           // same again: fine
  // teacher and student see the language and the German total
  r = await go('/api/classes/ClassLang01');
  assert.deepEqual(r.j.items.map(i => [i.share_id, i.lang, i.total]), [['ShareEn0001', 'en', 3], ['ShareDe0001', 'de', 2]]);
  r = await go('/api/classes/ClassLang01', 'GET', null, 'sl');
  assert.equal(r.j.items.find(i => i.share_id === 'ShareDe0001').lang, 'de');
  // progress for the German assignment is capped at its German total
  r = await go('/api/classes/progress', 'POST', { rows: [{ class_id: 'ClassLang01', share_id: 'ShareDe0001', total: 2, done: 2, star: 1 }] }, 'sl'); assert.equal(r.j.saved, 1);
  console.log('class language tests passed');
}

{
  // Claude: room for thinking (max_tokens 16000) and CLAUDE_EFFORT
  const { default: w, claudeEffort } = await import('../src/worker.js');
  assert.equal(claudeEffort({}), null); assert.equal(claudeEffort({ CLAUDE_EFFORT: ' Medium ' }), 'medium'); assert.equal(claudeEffort({ CLAUDE_EFFORT: 'turbo' }), null);
  let sent = null, reply = { stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '…' }, { type: 'text', text: '[{"word":"cup","box":[1,2,3,4]}]' }], usage: { input_tokens: 3000, output_tokens: 5200 } };
  globalThis.fetch = async (url, init = {}) => {
    if (url.includes('api.anthropic.com')) { sent = JSON.parse(init.body); return new Response(JSON.stringify(reply)); }
    if (url.includes('/rest/v1/')) return new Response(null, { status: 201 });
    throw new Error('unexpected ' + url);
  };
  const img = 'data:image/jpeg;base64,' + Buffer.from('fakejpeg').toString('base64');
  const scan = env => w.fetch(new Request('https://piccab.com/api/scan', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ image: img }) }), env);
  let r = await scan({ ANTHROPIC_API_KEY: 'k' }); let j = await r.json();
  assert.equal(r.status, 200); assert.equal(j.provider, 'claude'); assert.equal(j.model, 'claude-haiku-5-5'); assert.equal(j.items[0].word, 'cup');   // thinking block skipped
  assert.equal(sent.max_tokens, 16000); assert.ok(!('output_config' in sent)); assert.ok(!('temperature' in sent));
  assert.deepEqual(j.usage, { in: 3000, out: 5200 });
  r = await scan({ ANTHROPIC_API_KEY: 'k', CLAUDE_EFFORT: 'low' }); assert.deepEqual(sent.output_config, { effort: 'low' });
  // just adding the key switches from Gemini to Claude (unless AI_PROVIDER=gemini)
  r = await scan({ GEMINI_API_KEY: 'g', ANTHROPIC_API_KEY: 'k' }); assert.equal((await r.json()).provider, 'claude');
  console.log('claude settings tests passed');
}

// ---------- /api/wordlist: a photo of a teacher's word list → [{w, th}] ----------
{
  const saved = globalThis.fetch; let sentPrompt = '';
  globalThis.fetch = async (url, init) => {
    const b = JSON.parse(init.body); sentPrompt = JSON.stringify(b);
    return new Response(JSON.stringify({ stop_reason:'end_turn', content:[{ type:'text', text:'[{"w":"elephant","th":"ช้าง"},{"w":"2. giraffe"}]' }], usage:{ input_tokens:900, output_tokens:40 } }), { status:200 });
  };
  const wl = (body, env) => worker.fetch(new Request('https://piccab.com/api/wordlist', { method:'POST', headers:{ 'content-type':'application/json' }, body: JSON.stringify(body) }), { ASSETS: assets, ...env });
  assert.equal((await wl({ image: img }, {})).status, 503);                                   // AI not set up
  assert.equal((await (await wl({ image: 'data:text/html;base64,AAAA' }, KEY)).json()).error, 'bad_image');
  assert.equal((await worker.fetch(new Request('https://piccab.com/api/wordlist'), { ASSETS: assets, ...KEY })).status, 405);
  const r = await wl({ image: img }, KEY);
  assert.equal(r.status, 200);
  assert.deepEqual((await r.json()).items, [{ w:'elephant', th:'ช้าง' }, { w:'giraffe', th:'' }]);
  assert.match(sentPrompt, /dictation/);
  globalThis.fetch = saved;
  console.log('word list tests passed');
}

// ---------- /api/sentences: sentences for the ✍️ game, for your own scene (with its picture) or word sheet ----------
{
  const saved = globalThis.fetch; let sent = null;
  globalThis.fetch = async (url, init) => {
    sent = JSON.parse(init.body);
    return new Response(JSON.stringify({ stop_reason:'end_turn', content:[{ type:'text', text:'[{"en":"The cat is on the sofa.","th":"แมวอยู่บนโซฟา","words":["cat","sofa"]},{"en":"Hi."},{"en":"The cat is on the sofa."}]' }], usage:{ input_tokens:300, output_tokens:80 } }), { status:200 });
  };
  const sn = (body, env) => worker.fetch(new Request('https://piccab.com/api/sentences', { method:'POST', headers:{ 'content-type':'application/json' }, body: JSON.stringify(body) }), { ASSETS: assets, ...env });
  assert.equal((await worker.fetch(new Request('https://piccab.com/api/sentences'), { ASSETS: assets, ...KEY })).status, 405);
  assert.equal((await (await sn({ words:[{ w:'cat' }] }, KEY)).json()).error, 'too_few_words');
  assert.equal((await (await sn({ words:[{ w:'cat' },{ w:'sofa' }], image:'data:text/html;base64,AAAA' }, KEY)).json()).error, 'bad_image');
  // a word sheet: words only, example sentences
  let r = await sn({ words:[{ w:'cat', th:'แมว' },{ w:'sofa' },{ w:'cat' },{ w:'<b>' }], kind:'list' }, KEY);
  assert.equal(r.status, 200);
  assert.deepEqual((await r.json()).items, [{ en:'The cat is on the sofa.', th:'แมวอยู่บนโซฟา', words:['cat','sofa'] }]);
  let parts = sent.messages[0].content;
  assert.equal(parts.length, 1); assert.match(parts[0].text, /example sentences/); assert.match(parts[0].text, /cat \(แมว\), sofa\./); assert.match(parts[0].text, /suitable for children/);
  // a scene: its picture goes with it
  r = await sn({ words:[{ w:'cat' },{ w:'sofa' }], image: img, kind:'scene' }, KEY);
  assert.equal(r.status, 200);
  parts = sent.messages[0].content;
  assert.equal(parts[0].type, 'image'); assert.match(parts[1].text, /what is happening in the picture/);
  const { parseSentences } = await import('../src/worker.js');
  assert.equal(parseSentences('no'), null); assert.equal(parseSentences('[{"en":"Yes."}]'), null);
  globalThis.fetch = saved;
  console.log('sentence tests passed');
}

// ---------- 🎨 /api/wordpics: line pictures for word sheets (text AI writes SVG; cleaned to an allow-list) ----------
{
  const { cleanSvg, parsePics, picKey } = await import('../src/worker.js');
  const bad = cleanSvg('<svg onload="x()"><script>alert(1)</script><a href="javascript:x"><circle cx="5" cy="5" r="3"/></a><path d="M1 1 L9 9" onclick="y()" style="z" stroke="url(#g)"/><image href="http://x/y.png"/><text x="5" y="5">hello</text><text>12</text><foreignObject><div>x</div></foreignObject></svg>');
  assert.ok(!/script|onload|onclick|href|style|url\(|image|hello|foreignObject|div/i.test(bad), bad);
  assert.match(bad, /<path d="M1 1 L9 9"\/>/); assert.match(bad, />12<\/text>/); assert.match(bad, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0 0 100 100"/);
  assert.equal(cleanSvg('<svg><text>only text</text></svg>'), '');
  assert.equal(picKey('  Divided By! '), 'divided by');
  const { numberOf, numberPic } = await import('../src/worker.js');
  assert.match(cleanSvg('<svg><text x="50" y="60">100</text></svg>'), />100<\/text>/);          // digits alone are a picture
  assert.match(cleanSvg('<svg><text><tspan dy="4">1,000</tspan></text></svg>'), /<tspan dy="4">1,000<\/tspan>/);
  assert.deepEqual(['one hundred','one thousand','one million','twenty-five','a hundred and five','apple'].map(numberOf), [100, 1000, 1000000, 25, 105, null]);
  assert.match(numberPic('one million'), />1,000,000<\/text>/); assert.equal(numberPic('half'), '');
  assert.deepEqual(parsePics('x [{"w":"Minus","svg":"<svg><line x1=\\"10\\" y1=\\"50\\" x2=\\"90\\" y2=\\"50\\"/></svg>"},{"w":"y","svg":"<b>no</b>"}]').map(r => r.w), ['minus']);
  const saved = globalThis.fetch, prompts = [];
  globalThis.fetch = async (url, init) => {
    const b = JSON.parse(init.body); const text = b.messages[0].content.find(c => c.type === 'text').text; prompts.push(text);
    const ws = [...text.matchAll(/^\d+\. (.+)$/gm)].map(m => m[1]);
    return new Response(JSON.stringify({ stop_reason:'end_turn', content:[{ type:'text', text: JSON.stringify(ws.map(w => ({ w, svg:'<svg><circle cx="50" cy="50" r="30"/></svg>' }))) }], usage:{ input_tokens:300, output_tokens:800 } }), { status:200 });
  };
  const wp = (body, env) => worker.fetch(new Request('https://piccab.com/api/wordpics', { method:'POST', headers:{ 'content-type':'application/json' }, body: JSON.stringify(body) }), { ASSETS: assets, ...env });
  assert.equal((await wp({ words:[] }, KEY)).status, 400);
  // look-up only: nothing drawn, no AI
  let j = await (await wp({ words:['Minus','plus'] }, KEY)).json();
  assert.deepEqual(j, { pics:{}, missing:['minus','plus'] }); assert.equal(prompts.length, 0);
  // a free second try: signed note for the words left out (who, which words, 7 days)
  { const { picRetryToken, picRetryOk } = await import('../src/worker.js'); const E2 = { SUPABASE_SECRET_KEY:'k' };
    const t = await picRetryToken(E2, 'u1', ['past','half']);
    assert.equal(await picRetryOk(E2, 'u1', t, ['half']), true);                 // a subset is fine
    assert.equal(await picRetryOk(E2, 'u2', t, ['half']), false);                // someone else's note
    assert.equal(await picRetryOk(E2, 'u1', t, ['half','apple']), false);        // a word that wasn't left out
    assert.equal(await picRetryOk(E2, 'u1', t.replace('half','hal'), ['hal']), false);
    assert.equal(await picRetryOk({ SUPABASE_SECRET_KEY:'other' }, 'u1', t, ['half']), false);
    const old = t.replace(/^\d+/, String(Math.floor(Date.now() / 86400000) - 8));
    assert.equal(await picRetryOk(E2, 'u1', old, ['half']), false); }
  // number words are drawn here: free, no AI, no sign-in
  j = await (await wp({ words:['one hundred','One Million','minus'] }, KEY)).json();
  assert.deepEqual(Object.keys(j.pics), ['one hundred','one million']); assert.deepEqual(j.missing, ['minus']); assert.equal(prompts.length, 0);
  // draw: 14 words → two AI calls (12 a call), all pictures back
  const ws = Array.from({ length:14 }, (_, i) => 'word ' + String.fromCharCode(97 + i));
  j = await (await wp({ words: ws, draw:true }, KEY)).json();
  assert.equal(prompts.length, 2); assert.equal(Object.keys(j.pics).length, 14); assert.deepEqual(j.missing, []); assert.equal(j.drawn, 14);
  assert.match(prompts[0], /line art only/); assert.match(prompts[0], /never write letters or words/); assert.match(prompts[0], /unsuitable for children/);
  globalThis.fetch = saved;
  console.log('word picture tests passed');
}

// trial tools: feedback, client errors, usage counts
{
  const { cleanFeedback, cleanUsage } = await import('../src/worker.js');
  assert.deepEqual(cleanFeedback({ kind:'problem', message:'  กดแล้วไม่มีเสียง\r\n ', contact:'a@b.co', page:'play/quiz', ui:'en' }),
    { kind:'problem', message:'กดแล้วไม่มีเสียง', contact:'a@b.co', page:'play/quiz', ui:'en' });
  assert.equal(cleanFeedback({ kind:'hack', message:'x' }).kind, 'other');
  assert.equal(cleanFeedback({ message:'x', contact:'not an email' }).contact, '');
  assert.equal(cleanFeedback({ message:'y'.repeat(3000) }).message.length, 2000);
  assert.deepEqual(cleanUsage({ day:'2026-11-08', events:{ open:1, 'mode:quiz':3, evil:5, review:999, mock:-2, 'age:0':'x' } }),
    { day:'2026-11-08', events:{ open:1, 'mode:quiz':3, review:50 } });
  assert.equal(cleanUsage({ day:'bad', events:{} }).day, null);
  // 🧩 match and 📝 test sheets are counted; a day's match answers reach the teacher's report
  assert.deepEqual(cleanUsage({ day:'2026-11-21', events:{ match:2, test_sheet:1 } }).events, { match:2, test_sheet:1 });
  { const { cleanReport } = await import('../src/worker.js');
    const r = cleanReport({ days:[['2026-11-21', 6, 3, 0, { match:6, quiz:2, hack:9 }]] });
    assert.deepEqual(r.days[0][4], { quiz:2, match:6 }); }
  const saved = globalThis.fetch; const seen = [];
  globalThis.fetch = async (url, init) => { seen.push({ url:String(url), body: init && init.body ? JSON.parse(init.body) : null }); return new Response(null, { status: 201 }); };
  const DB = { SUPABASE_SECRET_KEY:'sb_secret_test' };
  assert.equal((await call('/api/feedback', post({ message:'' }), DB)).status, 400);
  assert.equal((await call('/api/feedback', post({ message:'hi' }), {})).status, 503);
  const fr = await call('/api/feedback', post({ kind:'idea', message:'อยากให้มีเกม', page:'home' }), DB);
  assert.equal(fr.status, 200);
  assert.match(seen.at(-1).url, /\/rest\/v1\/feedback$/); assert.equal(seen.at(-1).body.kind, 'idea'); assert.equal(seen.at(-1).body.contact, null);
  assert.equal((await call('/api/log', post({ msg:'TypeError: x is null', src:'https://piccab.com/app?x=1', line:12, page:'home' }), DB)).status, 204);
  assert.match(seen.at(-1).url, /rpc\/client_error_add$/); assert.equal(seen.at(-1).body.p_src, '/app:12'); assert.equal(seen.at(-1).body.p_sig.length, 16);
  const n = seen.length;
  assert.equal((await call('/api/log', post({ msg:'boom', src:'chrome-extension://abc/x.js' }), DB)).status, 204);
  assert.equal(seen.length, n);                                                                 // extensions are ignored
  assert.equal((await call('/api/usage', post({ day:'1999-01-01', events:{ open:1, 'mode:learn':2 } }), DB)).status, 204);
  assert.match(seen.at(-1).url, /rpc\/usage_add$/); assert.deepEqual(seen.at(-1).body.p_events, { open:1, 'mode:learn':2 });
  assert.notEqual(seen.at(-1).body.p_day, '1999-01-01');                                        // only today or yesterday
  globalThis.fetch = saved;
  console.log('trial tools tests passed');
}

// picture library: cleaning what the admin saves, and the public list
{
  const { cleanGalleryScene } = await import('../src/worker.js');
  const o = cleanGalleryScene({ category:'home', title:'  Kitchen ', title_th:'ห้องครัว', level:'expert', w:1600, h:1200,
    items:{ a:{ word:' kettle ', th:'กาต้มน้ำ', alts:['electric kettle', 5], x:-20, y:100, w:300, h:5000, l:{ de:{ w:'Wasserkocher', a:'der', alts:[] } } }, 'bad id!':{ word:'x', x:0,y:0,w:9,h:9 }, b:{ word:'', x:0,y:0,w:9,h:9 } } }, false);
  assert.equal(o.title, 'Kitchen'); assert.equal(o.level, 'beginner'); assert.equal(o.word_count, 1);
  assert.deepEqual(o.items.a, { word:'kettle', th:'กาต้มน้ำ', alts:['electric kettle'], x:0, y:100, w:300, h:1100, l:{ de:{ w:'Wasserkocher', a:'der', alts:[] } } });
  assert.equal(cleanGalleryScene({ category:'Home!', title:'x', w:100, h:100, items:{} }, false).error, 'bad_category');
  assert.equal(cleanGalleryScene({ category:'home', title:'x', w:10, h:100, items:{} }, false).error, 'bad_size');
  assert.deepEqual(cleanGalleryScene({ published:1 }, true), { published:true });
  // sentences for the sentence game
  // the learning path: school years and CEFR, from the level when not given
  assert.deepEqual([cleanGalleryScene({ stage:'m13', cefr:'A2' }, true).stage, cleanGalleryScene({ stage:'m13', cefr:'A2' }, true).cefr], ['m13', 'A2']);
  assert.deepEqual(cleanGalleryScene({ stage:'p9', cefr:'Z1' }, true), { stage:'p12', cefr:'preA1' });
  assert.deepEqual(cleanGalleryScene({ cefr:'B1' }, true), { cefr:'B1' });
  { const o = cleanGalleryScene({ category:'home', title:'T', level:'intermediate', w:100, h:100, items:{} }, false); assert.deepEqual([o.stage, o.cefr], ['p56', 'A1']); }
  // a word's CEFR level
  const { cleanCefr, parseCefr, buildCefrPrompt, parseItems: pItems, cleanGalleryItems } = await import('../src/worker.js');
  assert.deepEqual(['pre-A1', 'PreA1', 'a1', ' B2 ', 'C3', 'x', null].map(cleanCefr), ['preA1', 'preA1', 'A1', 'B2', '', '', '']);
  assert.deepEqual(parseCefr('ok {"Cat":"pre-A1","get dressed":"a1","x":"Z9"}'), { cat:'preA1', 'get dressed':'A1' });
  assert.equal(parseCefr('nothing'), null);
  assert.deepEqual(parseCefr('[{"word":"Wake up","level":"A1"},{"word":"sleep","cefr":"pre-A1"}]'), { 'wake up':'A1', sleep:'preA1' });
  assert.deepEqual(parseCefr('{"levels":{"wake up":"A1"}}'), { 'wake up':'A1' });
  assert.deepEqual(parseCefr('{"wake up":{"level":"A2"}}'), { 'wake up':'A2' });
  assert.match(buildCefrPrompt(['cat', 'get dressed']), /Words: cat, get dressed$/);
  assert.equal(pItems('[{"word":"cat","box":[1,2,30,40],"cefr":"A1"}]')[0].cefr, 'A1');
  assert.equal(cleanGalleryItems({ a1:{ word:'cat', x:1, y:1, w:9, h:9, cefr:'pre-a1' }, a2:{ word:'dog', x:1, y:1, w:9, h:9, cefr:'Q' } }, 100, 100).a1.cefr, 'preA1');
  assert.equal('cefr' in cleanGalleryItems({ a2:{ word:'dog', x:1, y:1, w:9, h:9, cefr:'Q' } }, 100, 100).a2, false);
  const { cleanGallerySentences } = await import('../src/worker.js');
  assert.deepEqual(cleanGallerySentences([{ en:'  The girl is   sleeping. ', th:' เด็กหลับ ', words:['Bed','bed',' ',7] }, { en:'the girl is sleeping.' }, { en:'' }, null, 'x']),
    [{ en:'The girl is sleeping.', th:'เด็กหลับ', words:['bed','7'] }]);
  assert.equal(cleanGallerySentences(Array.from({ length:20 }, (_, i) => ({ en:'Sentence '+i }))).length, 12);
  assert.deepEqual(cleanGallerySentences('nope'), []);
  assert.deepEqual(cleanGalleryScene({ sentences:[{ en:'A cat.', th:'แมว', words:['cat'] }] }, true), { sentences:[{ en:'A cat.', th:'แมว', words:['cat'] }] });
  const saved = globalThis.fetch;
  globalThis.fetch = async (url) => { const u = String(url);
    if (u.includes('gallery_categories')) return new Response(JSON.stringify([{ id:'home', name_th:'บ้าน', name_en:'Home', emoji:'🏠', sort:10 }]), { status:200 });
    if (u.includes('gallery_scenes')) { assert.match(u, /published=is\.true/); assert.match(u, /img_ver=gt\.0/); return new Response(JSON.stringify([{ id:'abc123def', category:'home', title:'Kitchen', word_count:12, img_ver:1 }]), { status:200 }); }
    return new Response('{}', { status:404 }); };
  const DB = { SUPABASE_SECRET_KEY:'sb_secret_test' };
  const r = await call('/api/gallery', { method:'GET' }, DB);
  assert.equal(r.status, 200); const j = await r.json(); assert.equal(j.scenes[0].title, 'Kitchen'); assert.equal(j.categories[0].id, 'home');
  assert.equal((await call('/api/gallery/Bad-ID', { method:'GET' }, DB)).status, 404);
  assert.equal((await call('/g/abc123def.webp', { method:'GET' }, {})).status, 404);
  assert.equal((await call('/api/admin/gallery', { method:'GET' }, DB)).status, 404);           // not an admin
  globalThis.fetch = saved;
  console.log('picture library tests passed');
}

// feedback e-mail goes to FEEDBACK_EMAIL (reports stay on ADMIN_NOTIFY_EMAIL), reply-to = the sender
{
  const { notifyTo } = await import('../src/worker.js');
  assert.deepEqual(notifyTo({}), ['contact@piccab.com']);
  assert.deepEqual(notifyTo({ ADMIN_NOTIFY_EMAIL:'a@x.co, b@x.co' }), ['a@x.co','b@x.co']);
  assert.deepEqual(notifyTo({ ADMIN_NOTIFY_EMAIL:'a@x.co' }, { to:'feedback@piccab.com' }), ['feedback@piccab.com']);
  assert.deepEqual(notifyTo({ ADMIN_NOTIFY_EMAIL:'a@x.co' }, { to:undefined }), ['a@x.co']);
  const saved = globalThis.fetch; const sent = [];
  globalThis.fetch = async (url, init) => { if (String(url).includes('resend.com')) sent.push(JSON.parse(init.body)); return new Response(null, { status: 201 }); };
  const waits = []; const ctx = { waitUntil: p => waits.push(p) };
  const env = { SUPABASE_SECRET_KEY:'sb_secret_test', RESEND_API_KEY:'re_test', ADMIN_NOTIFY_EMAIL:'contact@piccab.com', FEEDBACK_EMAIL:'feedback@piccab.com' };
  const r = await worker.fetch(new Request('https://piccab.com/api/feedback', post({ kind:'problem', message:'เสียงไม่ออก', contact:'mom@example.com' })), { ASSETS: assets, ...env }, ctx);
  assert.equal(r.status, 200); await Promise.all(waits);
  assert.deepEqual(sent.at(-1).to, ['feedback@piccab.com']); assert.equal(sent.at(-1).reply_to, 'mom@example.com');
  assert.match(sent.at(-1).subject, /^\[Piccab\] ความเห็น \(แจ้งปัญหา\): เสียงไม่ออก$/);
  assert.ok(sent.at(-1).html.indexOf('เสียงไม่ออก') < sent.at(-1).html.indexOf('ตอบกลับที่'));                 // the message comes first
  assert.ok(!sent.at(-1).html.includes('⚠️') && sent.at(-1).html.includes('/admin?tab=feedback'));
  assert.ok(sent.at(-1).text.startsWith('เสียงไม่ออก'));
  await worker.fetch(new Request('https://piccab.com/api/feedback', post({ message:'no contact' })), { ASSETS: assets, ...env }, ctx); await Promise.all(waits);
  assert.equal('reply_to' in sent.at(-1), false);
  globalThis.fetch = saved;
  console.log('feedback e-mail tests passed');
}

// ---------- 🧪 admin: the same picture through Gemini and Claude ----------
{
  const saved = globalThis.fetch; const seen = []; let cmpOut = '', cmpSchema = false;
  globalThis.fetch = async (url, init = {}) => {
    url = String(url);
    if (url.endsWith('/auth/v1/user')) return new Response(JSON.stringify({ id: '33333333-3333-3333-3333-333333333333', email: init.headers.authorization === 'Bearer cmp-boss' ? 'boss@piccab.th' : 'kid@x.th' }));
    if (url.includes('/rest/v1/')) throw new Error('compare must not touch the database: ' + url);   // no credits, no ai_usage rows
    if (url.includes('generativelanguage')) { seen.push(url.split('/models/')[1]); cmpSchema = !!JSON.parse(init.body).generationConfig.responseSchema;
      if (cmpOut && url.includes(cmpOut)) return new Response('{"error":{"message":"Quota exceeded for metric: generate_content_free_tier_requests, limit: 20 per day"}}', { status: 429 });
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '[{"word":"cup","th":"ถ้วย","box_2d":[100,200,300,400]}]' }] } }], usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 200, thoughtsTokenCount: 800 } })); }
    if (url.includes('api.anthropic.com')) { const b = JSON.parse(init.body); seen.push(b.model);
      return new Response(JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text: '[{"word":"cup","th":"ถ้วย","box":[200,100,400,300]},{"word":"spoon","th":"ช้อน","box":[1,2,3,4]}]' }], usage: { input_tokens: 2000, output_tokens: 1000 } })); }
    throw new Error('unexpected ' + url);
  };
  const E = { ASSETS: assets, GEMINI_API_KEY: 'g', ANTHROPIC_API_KEY: 'a', SUPABASE_SECRET_KEY: 'sb_secret_x', ADMIN_EMAILS: 'boss@piccab.th' };
  const cmp = (body, who = 'cmp-boss') => worker.fetch(new Request('https://piccab.com/api/admin/compare', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + who }, body: JSON.stringify(body) }), E);
  let r = await cmp({ image: img, gemini: 'gemini-3.8-flash', claude: 'claude-haiku-5-5' });
  assert.equal(r.status, 200);
  const { results } = await r.json();
  const [g, c] = results;
  assert.equal(g.provider, 'gemini'); assert.equal(g.model, 'gemini-3.8-flash'); assert.equal(c.model, 'claude-haiku-5-5');
  assert.deepEqual(seen.sort(), ['claude-haiku-5-5', 'gemini-3.8-flash:generateContent']);   // only the chosen models
  assert.deepEqual(g.items[0].box, [200, 100, 400, 300]); assert.deepEqual(c.items[0].box, [200, 100, 400, 300]);   // same box format for both
  assert.equal(g.tok_out, 1000);                                                   // thinking counted
  assert.equal(cmpSchema, true);                                                   // compared the same way the app asks (structured output)
  assert.ok(Math.abs(g.cost_usd - (1000 * 0.75 + 1000 * 3.75) / 1e6) < 1e-12);
  assert.ok(Math.abs(c.cost_usd - (2000 * 0.1 + 1000 * 0.5) / 1e6) < 1e-12);
  // unknown models fall back to the cheapest of each; a missing key is reported, not fatal
  seen.length = 0;
  r = await worker.fetch(new Request('https://piccab.com/api/admin/compare', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer cmp-boss' }, body: JSON.stringify({ image: img, gemini: 'gpt-x', claude: 'x' }) }), { ...E, ANTHROPIC_API_KEY: '' });
  const two = (await r.json()).results;
  assert.equal(two[0].model, 'gemini-3.5-flash-lite'); assert.equal(two[1].error, 'not_configured'); assert.deepEqual(seen, ['gemini-3.5-flash-lite:generateContent']);
  // several models at once: the three free Gemini models and Claude, in the order asked; unknown ones dropped, at most 5
  seen.length = 0;
  r = await cmp({ image: img, models: ['gemini-3.5-flash-lite', 'gemini-3.8-flash', 'gpt-x', 'gemini-3.6-flash', 'claude-haiku-5-5', 'gemini-3.8-flash'] });
  const four = (await r.json()).results;
  assert.deepEqual(four.map(x => x.model), ['gemini-3.5-flash-lite', 'gemini-3.8-flash', 'gemini-3.6-flash', 'claude-haiku-5-5']);
  assert.deepEqual(four.map(x => x.provider), ['gemini', 'gemini', 'gemini', 'claude']);
  assert.ok(four.every(x => x.ok && x.items.length));
  assert.deepEqual(four.map(x => x.free_rpd), [500, 20, 20, null]);                // free daily quota shown for Gemini
  assert.deepEqual(seen.sort(), ['claude-haiku-5-5', 'gemini-3.5-flash-lite:generateContent', 'gemini-3.6-flash:generateContent', 'gemini-3.8-flash:generateContent']);
  r = await cmp({ image: img, models: [...COMPARE_MODELS.gemini, ...COMPARE_MODELS.claude, 'claude-sonnet-5-5', 'gemini-3.8-flash'] });
  assert.deepEqual((await r.json()).results.map(x => x.model), ['gemini-3.5-flash-lite', 'gemini-3.8-flash', 'gemini-3.6-flash', 'claude-haiku-5-5']);   // Sonnet isn't offered
  // one model out of free quota: only that column fails, and says why; no other model is tried in its place
  cmpOut = 'gemini-3.6-flash'; seen.length = 0;
  const q = (await (await cmp({ image: img, models: ['gemini-3.8-flash', 'gemini-3.6-flash'] })).json()).results;
  assert.equal(q[0].ok, true); assert.equal(q[1].ok, false); assert.equal(q[1].why, 'quota_day');
  assert.deepEqual(seen.sort(), ['gemini-3.6-flash:generateContent', 'gemini-3.8-flash:generateContent']);
  cmpOut = '';
  // an answer that can't be read: the column says why and shows its start and end (for the admin only)
  const bad = 'Sure! ' + 'x'.repeat(600) + ' the end';
  const keep = globalThis.fetch;
  globalThis.fetch = async (url, init) => url.includes('gemini-3.5-flash-lite')
    ? new Response(JSON.stringify({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: bad }] } }], usageMetadata: { promptTokenCount: 1500, candidatesTokenCount: 8192 } }))
    : keep(url, init);
  const [lite] = (await (await cmp({ image: img, models: ['gemini-3.5-flash-lite'] })).json()).results;
  assert.equal(lite.ok, false); assert.equal(lite.why, 'cut_off'); assert.equal(lite.finish, 'MAX_TOKENS'); assert.equal(lite.tok_out, 8192);
  assert.ok(lite.sample.startsWith('Sure! xxx') && lite.sample.endsWith('the end') && lite.sample.length < 420, lite.sample);
  // any other error from Google: the column shows the HTTP status and Google's message
  globalThis.fetch = async (url, init) => url.includes('gemini-3.8-flash')
    ? new Response('{"error":{"code":400,"message":"Request contains an invalid argument.","status":"INVALID_ARGUMENT"}}', { status: 400 })
    : keep(url, init);
  const [e38] = (await (await cmp({ image: img, models: ['gemini-3.8-flash'] })).json()).results;
  assert.equal(e38.ok, false); assert.equal(e38.error, 'upstream_error'); assert.equal(e38.why, 'http_400'); assert.equal(e38.finish, 'HTTP 400');
  assert.match(e38.sample, /INVALID_ARGUMENT/);
  globalThis.fetch = keep;
  assert.equal((await cmp({ image: 'data:text/html;base64,AAAA' })).status, 400);
  assert.equal((await cmp({ image: img }, 'cmp-kid')).status, 404);              // admins only
  globalThis.fetch = saved;
  console.log('AI compare tests passed');
}

// ---------- AI_PROVIDER as a list: every Gemini model first, then Claude ----------
{
  const saved = globalThis.fetch; let calls = [], gem = 'quota';
  globalThis.fetch = async (url, init = {}) => {
    url = String(url);
    if (url.includes('generativelanguage')) { const model = url.split('/models/')[1].split(':')[0]; calls.push(model);
      if (gem === 'quota') return new Response('{"error":{"message":"Quota exceeded for metric: generate_content_free_tier_requests, limit: 500 per day"}}', { status: 429 });
      if (gem === 'busy') return new Response('overloaded', { status: 503 });
      if (gem === 'refused') return new Response(JSON.stringify({ promptFeedback: { blockReason: 'SAFETY' } }));
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '[{"word":"cup","th":"ถ้วย","box_2d":[1,2,3,4]}]' }] } }] })); }
    if (url.includes('api.anthropic.com')) { calls.push('claude');
      return new Response(JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text: '[{"word":"mug","th":"แก้วมัค","box":[1,2,3,4]}]' }], usage: { input_tokens: 10, output_tokens: 5 } })); }
    throw new Error('unexpected ' + url);
  };
  const { pickProviders } = await import('../src/worker.js');
  assert.deepEqual(pickProviders({ AI_PROVIDER: 'gemini, claude', GEMINI_API_KEY: 'g', ANTHROPIC_API_KEY: 'a' }), ['gemini', 'claude']);
  assert.deepEqual(pickProviders({ AI_PROVIDER: 'gemini,claude', GEMINI_API_KEY: 'g' }), ['gemini']);               // no Claude key: Gemini only
  assert.deepEqual(pickProviders({ AI_PROVIDER: 'gemini', ANTHROPIC_API_KEY: 'a' }), ['claude']);                    // as before
  assert.deepEqual(pickProviders({ GEMINI_API_KEY: 'g', ANTHROPIC_API_KEY: 'a' }), ['claude']);
  // the Gemini models have their own quotas, so another skip cache key per test model
  const E = { ASSETS: assets, AI_PROVIDER: 'gemini,claude', GEMINI_API_KEY: 'g', GEMINI_MODEL: 'ch-a,ch-b,ch-c', ANTHROPIC_API_KEY: 'a', SCAN_CODE: 'tea' };
  const scanNow = () => worker.fetch(new Request('https://piccab.com/api/scan', post({ image: img }, { 'x-piccab-code': 'tea' })), E);
  // 1) all three Gemini models out of quota → Claude
  let r = await scanNow(); let b = await r.json();
  assert.equal(r.status, 200); assert.equal(b.provider, 'claude'); assert.deepEqual(calls, ['ch-a', 'ch-b', 'ch-c', 'claude']);
  // 2) a while later, still out of quota: the Gemini models are skipped first… but tried again (quick), then Claude
  calls = []; r = await scanNow(); assert.equal((await r.json()).provider, 'claude'); assert.equal(calls.at(-1), 'claude');
  // 3) Gemini answers → Claude isn't called
  const E2 = { ...E, GEMINI_MODEL: 'ok-a' }; gem = 'ok'; calls = [];
  r = await worker.fetch(new Request('https://piccab.com/api/scan', post({ image: img }, { 'x-piccab-code': 'tea' })), E2);
  assert.equal((await r.json()).provider, 'gemini'); assert.deepEqual(calls, ['ok-a']);
  // 4) Gemini refuses the picture → no second try with Claude
  gem = 'refused'; calls = [];
  r = await worker.fetch(new Request('https://piccab.com/api/scan', post({ image: img }, { 'x-piccab-code': 'tea' })), { ...E, GEMINI_MODEL: 'ref-a' });
  assert.equal(r.status, 422); assert.deepEqual(calls, ['ref-a']);
  // 5) Google busy → Claude; same for the word list and translations
  gem = 'busy'; calls = [];
  r = await worker.fetch(new Request('https://piccab.com/api/wordlist', post({ image: img }, { 'x-piccab-code': 'tea' })), { ...E, GEMINI_MODEL: 'busy-a' });
  assert.equal(r.status, 200); assert.deepEqual(calls, ['busy-a', 'claude']);
  globalThis.fetch = saved;
  console.log('AI provider order tests passed');
}

// ---------- 💎 Pro accounts: Claude first; free accounts keep AI_PROVIDER's order (Gemini first) ----------
{
  const saved = globalThis.fetch; let calls = [], claudeBusy = false;
  const users = { 'tok-pro': ['11111111-1111-4111-8111-111111111111', 'pro@school.th'], 'tok-free': ['22222222-2222-4222-8222-222222222222', 'free@school.th'],
    'tok-old': ['33333333-3333-4333-8333-333333333333', 'old@school.th'] };
  const plans = { 'pro@school.th': { plan: 'pro', until: null }, 'old@school.th': { plan: 'pro', until: '2020-01-01T00:00:00Z' } };
  globalThis.fetch = async (url, init = {}) => {
    url = String(url);
    if (url.includes('/auth/v1/user')) { const t = (init.headers.authorization || '').split(' ')[1], u = users[t];
      return u ? new Response(JSON.stringify({ id: u[0], email: u[1] })) : new Response('{}', { status: 401 }); }
    if (url.includes('/rest/v1/plans')) { const e = decodeURIComponent(url.split('email=eq.')[1].split('&')[0]); return new Response(JSON.stringify(plans[e] ? [plans[e]] : [])); }
    if (url.includes('/rest/v1/rpc/use_ai_credit') || url.includes('/rest/v1/rpc/refund_ai_credit')) return new Response('7');
    if (url.includes('/rest/v1/')) return new Response(null, { status: 201 });
    if (url.includes('generativelanguage')) { calls.push('gemini');
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '[{"word":"cup","th":"ถ้วย","box_2d":[1,2,3,4]}]' }] } }] })); }
    if (url.includes('api.anthropic.com')) { calls.push('claude');
      if (claudeBusy) return new Response('overloaded', { status: 529 });
      return new Response(JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text: '[{"word":"mug","th":"แก้วมัค","box":[1,2,3,4]}]' }], usage: { input_tokens: 10, output_tokens: 5 } })); }
    throw new Error('unexpected ' + url);
  };
  const { proProviders } = await import('../src/worker.js');
  assert.deepEqual(proProviders({ ANTHROPIC_API_KEY: 'a' }, ['gemini', 'claude']), ['claude', 'gemini']);
  assert.deepEqual(proProviders({ ANTHROPIC_API_KEY: 'a' }, ['gemini']), ['claude', 'gemini']);   // AI_PROVIDER=gemini only: Pro still gets Claude
  assert.deepEqual(proProviders({}, ['gemini']), ['gemini']);                                        // no Claude key: nothing changes
  const E = { ASSETS: assets, AI_PROVIDER: 'gemini,claude', GEMINI_API_KEY: 'g', GEMINI_MODEL: 'pro-test-a', ANTHROPIC_API_KEY: 'a',
    SUPABASE_URL: 'https://sb.test', SUPABASE_SECRET_KEY: 'sb_secret_test' };
  const scanAs = tok => worker.fetch(new Request('https://piccab.com/api/scan', post({ image: img }, { authorization: 'Bearer ' + tok })), E);
  let r = await scanAs('tok-pro'), b = await r.json();
  assert.equal(r.status, 200); assert.equal(b.provider, 'claude'); assert.deepEqual(calls, ['claude']);
  calls = []; r = await scanAs('tok-free'); b = await r.json();
  assert.equal(b.provider, 'gemini'); assert.deepEqual(calls, ['gemini']);
  calls = []; r = await scanAs('tok-old'); b = await r.json();                                       // Pro ended: like a free account
  assert.equal(b.provider, 'gemini'); assert.deepEqual(calls, ['gemini']);
  // Claude busy → a Pro account still gets its answer from Gemini
  claudeBusy = true; calls = []; r = await scanAs('tok-pro'); b = await r.json();
  assert.equal(r.status, 200); assert.equal(b.provider, 'gemini'); assert.deepEqual(calls, ['claude', 'gemini']);
  // the word list (sheet photo) the same way
  claudeBusy = false; calls = [];
  r = await worker.fetch(new Request('https://piccab.com/api/wordlist', post({ image: img }, { authorization: 'Bearer tok-pro' })), E);
  assert.equal(r.status, 200); assert.deepEqual(calls, ['claude']);
  globalThis.fetch = saved;
  console.log('Pro → Claude first tests passed');
}

// ---------- 📧 weekly summary e-mail to parents ----------
import { weeklyDigest, digestMail, weekSummary, unsubLink } from '../src/worker.js';
{
  const saved = globalThis.fetch;
  const NOW = Date.parse('2026-11-22T11:00:00Z');                       // Sunday 18:00 in Thailand
  const day = n => new Date(NOW + 7 * 3600e3 - n * 86400000).toISOString().slice(0, 10);
  const P1 = '11111111-1111-4111-8111-111111111111', P2 = '22222222-2222-4222-8222-222222222222', P3 = '33333333-3333-4333-8333-333333333333';
  const K1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', K2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const rep = { v: 1, s: { streak: 3, last: day(0) }, words: { done: 42 }, ach: { lv: 4, n: 3, total: 39 },
    days: [[day(0), 12, 6, 0, {}], [day(1), 8, 4, 0, {}], [day(2), 5, 3, 0, {}], [day(9), 40, 20, 0, {}]],
    learned: [['cat', 'แมว', day(1)], ['dog', 'สุนัข', day(3)], ['old', 'เก่า', day(20)]], weak: [['umbrella', 'ร่ม', 4], ['<b>x', '', 2]] };
  // one child's week: only the last 7 days count
  const w = weekSummary(rep, NOW);
  assert.equal(w.days, 3); assert.equal(w.mins, 13); assert.equal(w.answers, 25); assert.equal(w.streak, 3); assert.equal(w.lv, 4);
  assert.deepEqual(w.learned.map(x => x[0]), ['cat', 'dog']); assert.deepEqual(w.badges, [3, 39]);
  assert.equal(weekSummary({ ...rep, s: { streak: 9, last: day(4) } }, NOW).streak, 0);   // not practised lately → no streak
  // the e-mail: each child, new words, tricky words (escaped), the button, the way out
  const m = digestMail({ kids: [{ nick: 'น้องฟ้า', group: 'บ้าน', rep }, { nick: 'Tom', group: 'บ้าน', rep: null }], origin: 'https://piccab.com', unsub: 'https://piccab.com/api/email/unsub?u=x&t=y', now: NOW });
  assert.equal(m.subject, 'สรุปการเรียนสัปดาห์นี้ — Piccab');
  for (const t of ['น้องฟ้า', 'ฝึก 3 จาก 7 วัน', 'ประมาณ 13 นาที', '🔥 ฝึกติดกัน 3 วัน', '⭐ Lv.4', '<b>cat</b>', 'umbrella', '&lt;b&gt;x', 'ยังไม่มีข้อมูลการฝึก', 'https://piccab.com/app', 'เลิกรับอีเมลนี้']) assert.ok(m.html.includes(t), t);
  assert.ok(!m.html.includes('<b>x') && !m.html.includes('old'));
  assert.ok(m.text.includes('cat, dog') && m.text.includes('unsub'));
  assert.equal(digestMail({ lang: 'en', kids: [{ nick: 'Fah', group: 'Home', rep: { ...rep, days: [] } }], origin: 'https://piccab.com', unsub: 'u', now: NOW }).subject, "Fah's week of practice — Piccab");
  assert.ok(digestMail({ kids: [{ nick: 'Fah', group: 'H', rep: { ...rep, days: [] } }], origin: 'o', unsub: 'u', now: NOW }).html.includes('สัปดาห์นี้ยังไม่ได้ฝึก'));

  // the Sunday run: P1 gets one (two children), P2 switched it off, P3 has no child yet, an owner sent this week is skipped
  let db, mails;
  const reset = () => {
    db = { classes: [{ id: 'f1', name: 'บ้าน', owner: P1, kind: 'family' }, { id: 'f2', name: 'บ้านยาย', owner: P1, kind: 'family' }, { id: 'f3', name: 'x', owner: P2, kind: 'family' }, { id: 'f4', name: 'y', owner: P3, kind: 'family' }],
      class_members: [{ class_id: 'f1', user_id: K1, nickname: 'ฟ้า' }, { class_id: 'f2', user_id: K2, nickname: 'ภู' }, { class_id: 'f3', user_id: K2, nickname: 'ภู' }],
      learner_reports: [{ user_id: K1, data: rep }], email_prefs: [{ user_id: P2, weekly: false }] };
    mails = [];
  };
  const E = { SUPABASE_SECRET_KEY: 'sb_secret_x', RESEND_API_KEY: 're_x', SUPABASE_URL: 'https://db.test' };
  globalThis.fetch = async (url, init = {}) => {
    url = String(url);
    if (url.startsWith('https://api.resend.com')) { mails.push(JSON.parse(init.body)); return new Response('{"id":"1"}', { status: 200 }); }
    const au = url.match(/\/auth\/v1\/admin\/users\/([0-9a-f-]+)/); if (au) return new Response(JSON.stringify({ id: au[1], email: au[1].slice(0, 2) + '@parent.th' }), { status: 200 });
    const mt = url.match(/\/rest\/v1\/(\w+)\??(.*)/); const t = mt[1], qs = new URLSearchParams(mt[2]);
    if ((init.method || 'GET') === 'POST') { const rows = [].concat(JSON.parse(init.body)); for (const r of rows) { const i = db[t].findIndex(x => x.user_id === r.user_id); if (i >= 0) db[t][i] = { ...db[t][i], ...r }; else db[t].push(r); } return new Response(null, { status: 201 }); }
    let rows = db[t] || [];
    for (const [k, v] of qs) { if (['select', 'order', 'limit'].includes(k)) continue;
      if (v.startsWith('eq.')) rows = rows.filter(r => String(r[k]) === v.slice(3));
      if (v.startsWith('in.(')) { const set = v.slice(4, -1).split(',').map(x => x.replace(/"/g, '')); rows = rows.filter(r => set.includes(String(r[k]))); } }
    return new Response(JSON.stringify(rows), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  reset();
  let r = await weeklyDigest(E, NOW);
  assert.equal(r.sent, 1); assert.equal(mails.length, 1);
  assert.deepEqual(mails[0].to, ['11@parent.th']); assert.ok(mails[0].html.includes('ฟ้า') && mails[0].html.includes('ภู'));
  assert.match(mails[0].headers['List-Unsubscribe'], /\/api\/email\/unsub\?u=11111111-.*&t=[0-9a-f]{32}>$/);
  assert.equal(db.email_prefs.find(x => x.user_id === P1).last_sent, day(0));
  assert.equal(db.email_prefs.find(x => x.user_id === P3).last_sent, day(0));            // no child: looked at, nothing sent
  assert.equal(db.email_prefs.find(x => x.user_id === P2).weekly, false);
  // the next run (30 minutes later): nobody twice
  mails = []; r = await weeklyDigest(E, NOW + 1800e3); assert.equal(mails.length, 0); assert.equal(r.why, 'done');
  // next Sunday: P1 again
  mails = []; await weeklyDigest(E, NOW + 7 * 86400e3); assert.equal(mails.length, 1);
  // with PRO_REQUIRED=1: only Pro parents
  reset(); db.plans = [];
  await weeklyDigest({ ...E, PRO_REQUIRED: '1' }, NOW); assert.equal(mails.length, 0);
  reset(); db.plans = [{ email: '11@parent.th', until: null }];
  await weeklyDigest({ ...E, PRO_REQUIRED: '1' }, NOW); assert.equal(mails.length, 1);
  // the link in the e-mail turns it off (no sign-in); a changed link doesn't
  reset();
  const link = await unsubLink(E, 'https://piccab.com', P1);
  let res = await worker.fetch(new Request(link.replace(/.$/, c => c === '0' ? '1' : '0')), { ...E, ASSETS: assets });
  assert.equal(res.status, 400); assert.equal(db.email_prefs.find(x => x.user_id === P1), undefined);
  res = await worker.fetch(new Request(link), { ...E, ASSETS: assets });
  assert.equal(res.status, 200); assert.ok((await res.text()).includes('เลิกส่งอีเมลสรุปรายสัปดาห์แล้ว'));
  assert.equal(db.email_prefs.find(x => x.user_id === P1).weekly, false);
  assert.ok(res.headers.get('content-security-policy').includes("frame-ancestors 'none'"));
  mails = []; await weeklyDigest(E, NOW); assert.ok(!mails.some(x => x.to[0] === '11@parent.th'));
  // nothing set up → nothing sent
  assert.equal((await weeklyDigest({}, NOW)).why, 'not_configured');
  // the cron handler is there
  assert.equal(typeof worker.scheduled, 'function');
  globalThis.fetch = saved;
  console.log('weekly e-mail tests passed');
}
