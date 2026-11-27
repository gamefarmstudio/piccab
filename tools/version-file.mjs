// After the build: dist/version.json says which commit this is, so we can check what piccab.com really runs
// (.github/workflows/deploy-check.yml). Workers Builds gives the commit as WORKERS_CI_COMMIT_SHA; elsewhere: git.
import fs from 'fs';
import { execSync } from 'child_process';
const DIST = new URL('../dist/', import.meta.url).pathname;
const git = c => { try { return execSync(c, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return ''; } };
const commit = process.env.WORKERS_CI_COMMIT_SHA || git('git rev-parse HEAD') || 'dev';
const branch = process.env.WORKERS_CI_BRANCH || git('git rev-parse --abbrev-ref HEAD') || '';
fs.writeFileSync(DIST + 'version.json', JSON.stringify({ commit, branch, built: new Date().toISOString() }) + '\n');
fs.appendFileSync(DIST + '_headers', '\n# Always the version that is live now\n/version.json\n  Cache-Control: no-store\n');
console.log(`version.json: ${commit.slice(0, 7)} (${branch || '?'})`);
