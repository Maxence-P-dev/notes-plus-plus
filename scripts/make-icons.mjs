// Generates the app icon (PNG + multi-size ICO) from an inline SVG.
import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import { mkdir, writeFile } from 'node:fs/promises';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 64 64">
<defs>
  <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#9a8cff"/><stop offset="1" stop-color="#5233f2"/>
  </linearGradient>
  <linearGradient id="p" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#ece9ff"/>
  </linearGradient>
</defs>
<rect x="2" y="2" width="60" height="60" rx="15" fill="url(#g)"/>
<path d="M19 15h17.5a8.5 8.5 0 0 1 8.5 8.5V49H27.5a8.5 8.5 0 0 1-8.5-8.5z" fill="url(#p)"/>
<path d="M26.5 26h12M26.5 32.5h12M26.5 39h8" stroke="#6d5dfc" stroke-width="3.2" stroke-linecap="round"/>
</svg>`;

await mkdir('build', { recursive: true });
const buf = Buffer.from(svg);
await sharp(buf).resize(512, 512).png().toFile('build/icon.png');
await sharp(buf).resize(256, 256).png().toFile('app/icon.png');
const sizes = await Promise.all([16, 24, 32, 48, 64, 128, 256].map((s) => sharp(buf).resize(s, s).png().toBuffer()));
await writeFile('build/icon.ico', await pngToIco(sizes));
console.log('icons ok');
