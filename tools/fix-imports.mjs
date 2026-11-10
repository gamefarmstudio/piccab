// Rewrites the import/export lines of the app's modules (app/main.js + app/js/*.js) from what each file uses.
// Use it after moving code between files:   node tools/fix-imports.mjs        (needs: npm ci --prefix tests)
//   - every name a file uses but doesn't declare is imported from the file that declares it
//   - every name another file uses is exported (one `export { … }` line at the end)
//   - `export const G` in core.js stays as it is; main.js imports every part in ORDER (load order matters)
//   - files only loaded with import() (LAZY_EXPORTS) are never imported by name — the tool stops if one would be;
//     they export what their loader calls
import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(new URL('../tests/package.json', import.meta.url));
const acorn = require('acorn'), es = require('eslint-scope'), globals = require('globals');
const APP = new URL('../app/', import.meta.url).pathname;
// load order of the parts (main.js imports them in this order; core imports nothing)
export const ORDER = ['core', 'progress', 'scene', 'home', 'decks', 'games', 'editor', 'sheets', 'account', 'classes',
  'friends', 'admin', 'gallery', 'share', 'pwa', 'sync', 'layout'];
const LAZY_EXPORTS = { 'admin-page': ['renderAdmin'] };   // loaded with import() when needed → what the loader calls
const LAZY = Object.keys(LAZY_EXPORTS);
const known = new Set([...Object.keys(globals.browser), ...Object.keys(globals.builtin)]);
const parts = [...ORDER, ...LAZY];
for (const f of fs.readdirSync(APP + 'js')) if (f.endsWith('.js') && !parts.includes(f.slice(0, -3))) throw new Error(`app/js/${f} is not in ORDER or LAZY in tools/fix-imports.mjs`);
const files = [...parts.filter(p => fs.existsSync(APP + 'js/' + p + '.js')).map(p => 'js/' + p + '.js'), 'main.js'];
const src = {}, declared = {}, free = {};
for (const f of files) {
  let t = fs.readFileSync(APP + f, 'utf8');
  // drop the import lines and the generated export line
  t = t.split('\n').filter(l => !/^import [\s\S]*from '\.[^']+';$|^import '\.[^']+';$|^export \{[^}]*\};$/.test(l)).join('\n');
  src[f] = t;
  const ast = acorn.parse(t, { ecmaVersion: 'latest', sourceType: 'module', ranges: true });
  const sm = es.analyze(ast, { ecmaVersion: 2022, sourceType: 'module' });
  declared[f] = new Set(sm.globalScope.childScopes[0].variables.map(v => v.name));
  free[f] = new Set(sm.globalScope.through.map(r => r.identifier.name).filter(n => !known.has(n)));
}
const owners = {};
for (const f of files) for (const n of declared[f]) (owners[n] ??= []).push(f);
const imports = Object.fromEntries(files.map(f => [f, new Map()])), exports = Object.fromEntries(files.map(f => [f, new Set()]));
for (const f of files) for (const n of free[f]) {
  let os = owners[n] || [];
  if (os.length > 1) os = os.filter(o => !LAZY.some(l => o === 'js/' + l + '.js'));   // the loader stub wins over the lazy file
  if (os.length !== 1) throw new Error(`app/${f}: "${n}" is ${os.length ? 'declared in several files: ' + os.join(', ') : 'not declared anywhere'}`);
  const o = os[0];
  if (LAZY.some(l => o === 'js/' + l + '.js')) throw new Error(`app/${f} uses "${n}" from ${o}, which only loads with import() — move it or load it lazily`);
  if (!imports[f].has(o)) imports[f].set(o, new Set());
  imports[f].get(o).add(n);
  if (!(o === 'js/core.js' && n === 'G')) exports[o].add(n);
}
for (const [l, names] of Object.entries(LAZY_EXPORTS)) if (exports['js/' + l + '.js']) names.forEach(n => exports['js/' + l + '.js'].add(n));
const sortNames = s => [...s].sort((a, b) => a === 'G' ? -1 : b === 'G' ? 1 : a.localeCompare(b));
for (const f of files) {
  const rel = o => f === 'main.js' ? './' + o : './' + o.slice(3);
  const deps = [...imports[f].keys()];
  if (f === 'main.js') for (const p of ORDER) if (!imports[f].has('js/' + p + '.js')) deps.push('js/' + p + '.js');
  deps.sort((a, b) => files.indexOf(a) - files.indexOf(b));
  const lines = deps.map(o => imports[f].has(o) ? `import { ${sortNames(imports[f].get(o)).join(', ')} } from '${rel(o)}';` : `import '${rel(o)}';`);
  // imports go right after the file's opening comment lines
  const body = src[f].split('\n'); let i = 0; while (i < body.length && body[i].startsWith('//')) i++;
  while (body.length && body[body.length - 1].trim() === '') body.pop();
  const ex = exports[f].size ? ['', `export { ${sortNames(exports[f]).join(', ')} };`] : [];
  const rest = body.slice(i); while (rest.length && rest[0].trim() === '') rest.shift();
  fs.writeFileSync(APP + f, [...body.slice(0, i), ...lines, '', ...rest, ...ex, ''].join('\n'));
}
console.log(`imports and exports rewritten in ${files.length} files`);
