// Generates the branded installer artwork (NSIS needs 24-bit BMP files).
import sharp from 'sharp';
import { writeFile, mkdir } from 'node:fs/promises';

const LOGO = (x, y, s) => `
<g transform="translate(${x} ${y}) scale(${s / 64})">
  <rect x="2" y="2" width="60" height="60" rx="15" fill="url(#logo)"/>
  <path d="M19 15h17.5a8.5 8.5 0 0 1 8.5 8.5V49H27.5a8.5 8.5 0 0 1-8.5-8.5z" fill="#fff"/>
  <path d="M26.5 26h12M26.5 32.5h12M26.5 39h8" stroke="#6d5dfc" stroke-width="3.2" stroke-linecap="round"/>
</g>`;

const DEFS = `
<linearGradient id="logo" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9a8cff"/><stop offset="1" stop-color="#5233f2"/></linearGradient>
<linearGradient id="bg" x1="0" y1="0" x2="0.35" y2="1"><stop offset="0" stop-color="#7f6cff"/><stop offset="0.55" stop-color="#5a42f2"/><stop offset="1" stop-color="#2c1b94"/></linearGradient>
<radialGradient id="glow" cx="0.3" cy="0.18" r="0.7"><stop offset="0" stop-color="#ffffff" stop-opacity=".28"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>`;

const FONT = `font-family="Segoe UI, Arial, sans-serif"`;

// Welcome / finish pages: 164×314, drawn at 2× then downscaled for crisp edges.
const sidebar = `<svg xmlns="http://www.w3.org/2000/svg" width="328" height="628" viewBox="0 0 164 314">
<defs>${DEFS}</defs>
<rect width="164" height="314" fill="url(#bg)"/>
<rect width="164" height="314" fill="url(#glow)"/>
<circle cx="150" cy="292" r="70" fill="#fff" opacity=".06"/>
<circle cx="10" cy="250" r="38" fill="#fff" opacity=".05"/>
<g opacity=".16" stroke="#fff" stroke-width="1.4" stroke-linecap="round">
  <path d="M30 196h104M30 208h104M30 220h80M30 232h96M30 244h60"/>
</g>
<rect x="46" y="58" width="72" height="72" rx="20" fill="#000" opacity=".18" transform="translate(0 4)"/>
${LOGO(46, 58, 72)}
<text x="82" y="160" text-anchor="middle" ${FONT} font-size="23" font-weight="700" fill="#fff">Notes++</text>
<text x="82" y="178" text-anchor="middle" ${FONT} font-size="10.5" fill="#fff" opacity=".85">Ton cahier de cours</text>
<text x="82" y="296" text-anchor="middle" ${FONT} font-size="8.5" fill="#fff" opacity=".6">Gratuit · Windows</text>
</svg>`;

// Header of the inner pages: 150×57.
const header = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="114" viewBox="0 0 150 57">
<defs>${DEFS}</defs>
<rect width="150" height="57" fill="#fff"/>
${LOGO(102, 11, 35)}
<text x="96" y="34" text-anchor="end" ${FONT} font-size="15" font-weight="700" fill="#2c1b94">Notes++</text>
</svg>`;

function bmp24({ data, info }) {
  const { width, height, channels } = info;
  const rowSize = Math.ceil((width * 3) / 4) * 4;
  const size = 54 + rowSize * height;
  const b = Buffer.alloc(size);
  b.write('BM', 0);
  b.writeUInt32LE(size, 2);
  b.writeUInt32LE(54, 10);
  b.writeUInt32LE(40, 14);
  b.writeInt32LE(width, 18);
  b.writeInt32LE(height, 22);
  b.writeUInt16LE(1, 26);
  b.writeUInt16LE(24, 28);
  b.writeUInt32LE(rowSize * height, 34);
  b.writeInt32LE(2835, 38);
  b.writeInt32LE(2835, 42);
  for (let y = 0; y < height; y++) {
    const row = 54 + (height - 1 - y) * rowSize; // bottom-up
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      b[row + x * 3] = data[i + 2];
      b[row + x * 3 + 1] = data[i + 1];
      b[row + x * 3 + 2] = data[i];
    }
  }
  return b;
}

const render = (svg, w, h) => sharp(Buffer.from(svg)).resize(w, h, { kernel: 'lanczos3' }).flatten({ background: '#ffffff' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });

await mkdir('build', { recursive: true });
await writeFile('build/installerSidebar.bmp', bmp24(await render(sidebar, 164, 314)));
await writeFile('build/installerHeader.bmp', bmp24(await render(header, 150, 57)));
console.log('installer art ok');
