// Security headers for Piccab's pages (shared by the Worker and tools/csp-headers.mjs, which writes dist/_headers).
//
// Content-Security-Policy: scripts only from piccab.com itself, the inline scripts of our own pages (by their sha256),
// and Cloudflare Turnstile (the sign-in check). Network calls only to piccab.com and our Supabase project.
// Pictures from piccab.com, data: and blob: (scenes are kept in the browser). Nobody may put Piccab in a frame.
// Inline style attributes stay allowed (the app sets sizes and colours with style="…").
export const SUPABASE_ORIGIN = 'https://oftzpfyydnmahkntucnj.supabase.co';
const TURNSTILE = 'https://challenges.cloudflare.com';

// <script> blocks without src that the browser runs (not JSON-LD or templates)
export function inlineScripts(html) {
  const out = [];
  for (const m of String(html).matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi)) {
    const attrs = m[1] || '';
    if (/\ssrc\s*=/i.test(attrs)) continue;
    const t = (attrs.match(/\stype\s*=\s*["']?([^"'\s>]+)/i) || [])[1];
    if (t && !/^(text\/javascript|module|application\/javascript)$/i.test(t)) continue;
    out.push(m[2]);
  }
  return out;
}
async function sha256b64(text) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  let s = ''; for (const b of new Uint8Array(d)) s += String.fromCharCode(b);
  return btoa(s);
}
export async function scriptHashes(htmls) {
  const set = new Set();
  for (const h of [].concat(htmls)) for (const s of inlineScripts(h)) set.add(`'sha256-${await sha256b64(s)}'`);
  return [...set].sort();
}
export function cspFrom(hashes) {
  return [
    "default-src 'self'",
    `script-src 'self' ${hashes.join(' ')} ${TURNSTILE}`.replace(/\s+/g, ' ').trim(),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self' ${SUPABASE_ORIGIN} ${SUPABASE_ORIGIN.replace('https:', 'wss:')}`,
    "media-src 'self' data: blob:",
    `frame-src ${TURNSTILE}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}
// The other headers, for every page and file
export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(self), microphone=(self), geolocation=(), payment=(), usb=()',
  'Strict-Transport-Security': 'max-age=15552000',
};
// For an HTML page the Worker builds (from /app): its own policy plus the other headers
export async function pageHeaders(html, extra = {}) {
  return { ...SECURITY_HEADERS, 'Content-Security-Policy': cspFrom(await scriptHashes(html)), ...extra };
}
