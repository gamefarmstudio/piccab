// After a merge into main: wait until piccab.com runs that commit (or a newer one). If it doesn't within the time,
// the Cloudflare deploy most likely failed — exit 1, so GitHub marks the check red and emails about it.
//   node tools/deploy-check.mjs <commit sha>
// DEPLOY_URL, DEPLOY_WAIT_SECONDS and DEPLOY_EVERY_SECONDS change where and how long it looks (for the tests).
import { execSync } from 'child_process';
const want = process.argv[2];
const url = process.env.DEPLOY_URL || 'https://piccab.com/version.json';
const waitS = +(process.env.DEPLOY_WAIT_SECONDS || 900), everyS = +(process.env.DEPLOY_EVERY_SECONDS || 20);
if (!/^[0-9a-f]{7,40}$/.test(want || '')) { console.log('usage: node tools/deploy-check.mjs <commit sha>'); process.exit(2); }
// the live commit came after ours (a later merge): that's fine too
const newer = live => { try { execSync(`git merge-base --is-ancestor ${want} ${live}`, { stdio: 'ignore' }); return true; } catch { return false; } };
const short = s => String(s || '?').slice(0, 7);
let live = null, note = '';
const end = Date.now() + waitS * 1000;
for (;;) {
  try {
    const r = await fetch(`${url}?t=${Date.now()}`, { headers: { 'cache-control': 'no-cache', 'user-agent': 'piccab-deploy-check' } });
    const text = await r.text();
    let j = null; try { j = JSON.parse(text); } catch {}
    if (j && /^[0-9a-f]{7,40}$/.test(j.commit || '')) {
      live = j.commit; note = '';
      if (live === want || live.startsWith(want) || newer(live)) { console.log(`✓ ${url} runs ${short(live)}${live === want ? '' : ` (newer than ${short(want)})`}`); process.exit(0); }
    } else note = `HTTP ${r.status}, not the version file yet`;
  } catch (e) { note = `could not reach it: ${e.message}`; }
  if (Date.now() >= end) break;
  console.log(`… waiting: live ${short(live)}, want ${short(want)}${note ? ` (${note})` : ''}`);
  await new Promise(r => setTimeout(r, everyS * 1000));
}
const msg = `piccab.com still runs ${short(live)}, not ${short(want)}, after ${Math.round(waitS / 60)} min — the Cloudflare deploy most likely failed. `
  + 'Open Cloudflare → Workers & Pages → piccab → Deployments, read the failed build log, then fix and merge again (or Retry build).';
console.log(`::error title=piccab.com was not updated::${msg}`);
console.log(`✗ ${msg}`);
process.exit(1);
