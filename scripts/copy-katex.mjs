// Copie la feuille de style et les polices de KaTeX dans app/vendor (servies localement, sans internet).
import { cp, mkdir, rm } from 'node:fs/promises';

const dest = 'app/vendor/katex';
await rm(dest, { recursive: true, force: true });
await mkdir(dest, { recursive: true });
await cp('node_modules/katex/dist/katex.min.css', `${dest}/katex.min.css`);
// woff2 suffit pour Chromium : inutile d'embarquer les formats ttf/woff.
await cp('node_modules/katex/dist/fonts', `${dest}/fonts`, { recursive: true, filter: (f) => !/\.(ttf|woff)$/.test(f) });
