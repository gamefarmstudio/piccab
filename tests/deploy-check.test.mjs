// tools/deploy-check.mjs against a pretend piccab.com: the right commit (or a newer one) passes; an old one fails.
import http from 'http';
import { execSync } from 'child_process';
import assert from 'assert';
const head = execSync('git rev-parse HEAD').toString().trim(), prev = execSync('git rev-parse HEAD~1').toString().trim();
let live = null;
const srv = http.createServer((q, r) => { if (live) { r.writeHead(200, { 'content-type': 'application/json' }); r.end(JSON.stringify({ commit: live })); } else { r.writeHead(404); r.end('<html>not found</html>'); } });
await new Promise(ok => srv.listen(0, ok));
const env = { ...process.env, DEPLOY_URL: `http://127.0.0.1:${srv.address().port}/version.json`, DEPLOY_WAIT_SECONDS: '1', DEPLOY_EVERY_SECONDS: '0.3' };
const check = async sha => {
  const { spawn } = await import('child_process');
  return new Promise(ok => { const p = spawn('node', ['tools/deploy-check.mjs', sha], { env }); let out = ''; p.stdout.on('data', d => out += d); p.on('close', code => ok({ code, out })); });
};
live = head;  let r = await check(head);  assert.equal(r.code, 0, r.out); assert.match(r.out, /✓/);
live = head;  r = await check(prev);      assert.equal(r.code, 0, r.out); assert.match(r.out, /newer than/);          // a later merge is live
live = prev;  r = await check(head);      assert.equal(r.code, 1, r.out); assert.match(r.out, /::error title=piccab.com was not updated::/);
live = null;  r = await check(head);      assert.equal(r.code, 1, r.out); assert.match(r.out, /not the version file yet/);
r = await check('not-a-sha'); assert.equal(r.code, 2);
srv.close();
console.log('deploy check: 5 passed');
