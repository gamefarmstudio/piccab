// Checks the app's modules (app/main.js + app/js/*.js) for mistakes the build doesn't catch:
//   - a name used but not declared or imported in that file (it would only fail when that code runs)
//   - a value from another file changed directly (imports are read-only; shared values go on G in js/core.js)
//   npm ci --prefix tests && node tests/modules-check.mjs   (also runs on every pull request)
import fs from 'fs';
import * as acorn from 'acorn';
import * as es from 'eslint-scope';
import globals from 'globals';
const root = new URL('../app/', import.meta.url).pathname;
const files = ['main.js', ...fs.readdirSync(root + 'js').filter(f => f.endsWith('.js')).sort().map(f => 'js/' + f)];
const known = new Set([...Object.keys(globals.browser), ...Object.keys(globals.builtin)]);
let bad = 0;
for (const f of files) {
  const ast = acorn.parse(fs.readFileSync(root + f, 'utf8'), { ecmaVersion: 'latest', sourceType: 'module', locations: true, ranges: true });
  const sm = es.analyze(ast, { ecmaVersion: 2022, sourceType: 'module' });
  for (const r of sm.globalScope.through) {
    const n = r.identifier.name;
    if (known.has(n)) continue;
    bad++; console.log(`app/${f}:${r.identifier.loc.start.line}  "${n}" is not declared or imported here`);
  }
  for (const v of sm.globalScope.childScopes[0].variables) {
    if (v.defs[0].type !== 'ImportBinding') continue;
    for (const r of v.references) if (r.isWrite()) { bad++; console.log(`app/${f}:${r.identifier.loc.start.line}  "${v.name}" comes from another file and can't be changed here (put it on G in js/core.js)`); }
  }
}
console.log(`${files.length} files, ${bad} problems`);
process.exit(bad ? 1 : 0);
