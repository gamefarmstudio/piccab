// After `vite build`: add the security headers to dist/_headers (Cloudflare serves the static pages and files with them).
// The Content-Security-Policy allows the inline scripts of our built pages by their sha256 (see src/csp.js).
import fs from 'fs';
import path from 'path';
import { cspFrom, scriptHashes, SECURITY_HEADERS } from '../src/csp.js';
const DIST = new URL('../dist/', import.meta.url).pathname;
const pages = [];
(function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (f.endsWith('.html')) pages.push(fs.readFileSync(p, 'utf8')); } })(DIST);
const hashes = await scriptHashes(pages);
const lines = ['', '# Security headers (tools/csp-headers.mjs, after the build)', '/*'];
for (const [k, v] of Object.entries(SECURITY_HEADERS)) lines.push(`  ${k}: ${v}`);
lines.push(`  Content-Security-Policy: ${cspFrom(hashes)}`);
fs.appendFileSync(path.join(DIST, '_headers'), lines.join('\n') + '\n');
console.log(`security headers: ${pages.length} pages, ${hashes.length} inline scripts allowed`);
