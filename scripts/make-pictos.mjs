// Builds app/pictos.json: every Twemoji drawing with its French name and tags.
// Drawings: Twemoji (CC-BY 4.0). Names and tags: emojibase (MIT).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const out = 'app/pictos.json';
if (existsSync(out) && !process.argv.includes('--force')) process.exit(0);

const data = require('emojibase-data/fr/data.json');
const svgDir = path.dirname(require.resolve('@twemoji/svg/package.json'));
const SKIP_GROUPS = new Set([2]); // skin-tone components

const pictos = [];
for (const e of data) {
  if (SKIP_GROUPS.has(e.group) || !e.label) continue;
  const hex = e.hexcode.toLowerCase();
  const file = [hex, hex.replace(/-fe0f/g, '')].map((h) => path.join(svgDir, `${h}.svg`)).find(existsSync);
  if (!file) continue;
  pictos.push({ l: e.label, t: (e.tags || []).join(' '), g: e.group, s: readFileSync(file, 'utf8').trim() });
}
writeFileSync(out, JSON.stringify(pictos));
console.log(`${pictos.length} pictogrammes`);
