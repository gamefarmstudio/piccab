// Cloudflare cron triggers: weekdays are 1–7 (1 = Sunday) or SUN–SAT; "0" makes `wrangler deploy` fail.
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, '');
const crons = (JSON.parse(src).triggers || {}).crons || [];
const DAY = /^(\*|([1-7]|SUN|MON|TUE|WED|THU|FRI|SAT)([-,]([1-7]|SUN|MON|TUE|WED|THU|FRI|SAT))*)(\/\d+)?(L|#[1-5])?$/i;
let bad = 0;
for (const c of crons) {
  const f = c.trim().split(/\s+/);
  if (f.length !== 5) { console.log(`✗ ${c}: needs 5 fields`); bad++; continue; }
  if (!DAY.test(f[4])) { console.log(`✗ ${c}: weekday must be 1–7 (1 = Sunday) or SUN–SAT`); bad++; }
}
console.log(`${crons.length} cron triggers, ${bad} problems`);
process.exit(bad ? 1 : 0);
