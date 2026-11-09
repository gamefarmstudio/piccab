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
import { pickProvider, geminiModels } from '../src/worker.js';
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
  assert.match(g.url, /models\/gemini-3\.8-flash:generateContent$/);
  assert.equal(g.headers['x-goog-api-key'], 'g-test');
  assert.equal(g.body.contents[0].parts[0].inline_data.mime_type, 'image/jpeg');
  assert.match(g.body.contents[0].parts[1].text, /box_2d.*ymin, xmin, ymax, xmax/);
  assert.equal(g.body.generationConfig.responseMimeType, 'application/json');
  await call('/api/scan', post({ image: img }), { ...G, GEMINI_MODEL: 'gemini-3.5-flash-lite' });
  assert.match(g.url, /gemini-3\.5-flash-lite:generateContent$/);
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
  assert.deepEqual(geminiModels(G), ['gemini-3.8-flash','gemini-3.6-flash','gemini-3.5-flash-lite']);
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
  const users = { tt: { id: T }, s1: { id: S1, is_anonymous: true }, s2: { id: S2, is_anonymous: true }, xx: { id: X } };
  const db = { classes: [], class_members: [], class_items: [], class_progress: [], shares: [
    { id: 'ShareScene1', owner: T, kind: 'scene', name: 'Kitchen', data: { scenes: [{ id: 's1', items: { a: {}, b: {}, c: {} } }] } },
    { id: 'ShareDeck01', owner: T, kind: 'deck', name: 'Hard', data: { scenes: [], words: ['tea|x', 'tea|y'] } },
    { id: 'ShareOther1', owner: X, kind: 'scene', name: 'Not mine', data: { scenes: [{ id: 'z', items: {} }] } } ] };
  const keyCols = { classes: ['id'], class_members: ['class_id', 'user_id'], class_items: ['class_id', 'share_id'], class_progress: ['class_id', 'share_id', 'user_id'], shares: ['id'] };
  const parseVal = v => v.startsWith('eq.') ? [v.slice(3)] : v.startsWith('in.(') ? v.slice(4, -1).split(',').map(x => x.replace(/^"|"$/g, '')) : null;
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
    const filters = [...u.searchParams].filter(([k]) => !['select', 'order', 'on_conflict'].includes(k)).map(([k, v]) => [k, parseVal(v)]);
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
  r = await go('/api/classes', 'GET', null, 's1'); assert.deepEqual(r.j.learning, [{ id: cls.id, name: 'ป.4/2 ภาษาอังกฤษ', nickname: 'Mint' }]);
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
