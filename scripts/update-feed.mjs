// Writes update/latest.yml (read by installed apps) from the freshly built release/latest.yml.
// File links point straight at the GitHub release, so the release itself only holds .exe/.dmg/.zip.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
const base = `https://github.com/Maxence-P-dev/notes-plus-plus/releases/download/v${version}/`;
const yml = readFileSync('release/latest.yml', 'utf8')
  .replace(/^(\s*-?\s*url:\s*)(\S+)$/gm, (_, k, f) => k + base + f)
  .replace(/^(path:\s*)(\S+)$/m, (_, k, f) => k + base + f);
mkdirSync('update', { recursive: true });
writeFileSync('update/latest.yml', yml);
console.log(yml);
