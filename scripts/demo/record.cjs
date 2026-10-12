// Records the Notes++ demo video frames (offscreen, 1920×1080) on a throwaway profile.
// Usage: electron scripts/demo/record.cjs <outDir> <audioDir>
// Produces <outDir>/frames/*.jpg, frames.txt (ffmpeg concat list) and timeline.json.
const Module = require('module');
const fs = require('fs');
const path = require('path');

const out = path.resolve(process.argv[2] || 'demo-out');
const audioDir = path.resolve(process.argv[3] || path.join(out, 'audio'));
const narration = JSON.parse(fs.readFileSync(path.join(__dirname, 'narration.json'), 'utf8'));
const W = 1280;
const H = 720;
const Z = 1; // input coordinates = CSS pixels (layout 1280×720, rendered at 1.5× = 1080p)

const electron = require('electron');
const { app } = electron;
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');

// Every window renders offscreen, and native dialogs are skipped.
class OffscreenWindow extends electron.BrowserWindow {
  constructor(opts = {}) {
    super({ ...opts, width: W, height: H, x: 0, y: 0, show: false, enableLargerThanScreen: true, webPreferences: { ...opts.webPreferences, offscreen: { deviceScaleFactor: 1.5 } } });
  }
}
const dialog = new Proxy(electron.dialog, {
  get: (t, p) => (p === 'showSaveDialog' ? async () => ({ canceled: false, filePath: path.join(out, 'demo.pdf') }) : t[p]),
});
const shell = new Proxy(electron.shell, { get: (t, p) => (p === 'openPath' ? async () => '' : t[p]) });
const patched = new Proxy(electron, {
  get: (t, p) => (p === 'BrowserWindow' ? OffscreenWindow : p === 'dialog' ? dialog : p === 'shell' ? shell : t[p]),
});
const load = Module._load;
Module._load = function (req, ...rest) {
  return req === 'electron' ? patched : load.call(this, req, ...rest);
};

const profile = path.join(out, 'profile');
fs.rmSync(profile, { recursive: true, force: true });
fs.rmSync(path.join(out, 'frames'), { recursive: true, force: true });
fs.mkdirSync(profile, { recursive: true });
fs.mkdirSync(path.join(out, 'frames'), { recursive: true });
app.setPath('userData', profile);
fs.writeFileSync(
  path.join(profile, 'settings.json'),
  JSON.stringify({ root: path.join(profile, 'Mes Cours'), theme: 'light', bounds: { width: W, height: H } })
);
require('../../app/main.js');

/* ---------------------------------------------------------------- helpers */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const wavSeconds = (file) => {
  const b = fs.readFileSync(file);
  let o = 12;
  let rate = 0;
  while (o < b.length) {
    const id = b.toString('ascii', o, o + 4);
    const size = b.readUInt32LE(o + 4);
    if (id === 'fmt ') rate = b.readUInt32LE(o + 16);
    if (id === 'data') return size / rate;
    o += 8 + size;
  }
  return 0;
};

let win;
let wc;
let recStart = 0;
const frames = [];
const timeline = [];
const pos = { x: 640, y: 360 };

const js = (code) => wc.executeJavaScript(code);
const call = (fn, ...args) => js(`demo.${fn}(${args.map((a) => JSON.stringify(a)).join(',')})`);

function mouse(type, extra = {}) {
  wc.sendInputEvent({ type, x: Math.round(pos.x * Z), y: Math.round(pos.y * Z), ...extra });
}

async function move(x, y, ms = 650, buttons = []) {
  const sx = pos.x;
  const sy = pos.y;
  const steps = Math.max(8, Math.round(ms / 16));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    pos.x = sx + (x - sx) * e;
    pos.y = sy + (y - sy) * e;
    mouse('mouseMove', { modifiers: buttons });
    await sleep(16);
  }
}

async function to(sel, text, ms, ax, ay) {
  const r = await call('rect', sel, text ?? null, ax ?? 0.5, ay ?? 0.5);
  if (!r) throw new Error(`introuvable: ${sel} ${text || ''}`);
  await move(r.x, r.y, ms);
}

async function click(sel, text, { button = 'left', count = 1, ms } = {}) {
  if (sel) await to(sel, text, ms);
  await sleep(120);
  mouse('mouseDown', { button, clickCount: count });
  await sleep(70);
  mouse('mouseUp', { button, clickCount: count });
  await sleep(250);
}

function keyEvent(keyCode, modifiers = []) {
  wc.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
  if (keyCode.length === 1 && !modifiers.includes('control')) wc.sendInputEvent({ type: 'char', keyCode, modifiers });
  wc.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
}

async function key(keyCode, modifiers = [], wait = 180) {
  keyEvent(keyCode, modifiers);
  await sleep(wait);
}

async function type(text, cps = 17) {
  for (const ch of text) {
    if (ch === '\n') keyEvent('Enter');
    else wc.insertText(ch);
    await sleep((1000 / cps) * (0.55 + Math.random() * 0.9));
  }
}

async function select(text) {
  const r = await call('select', text);
  if (!r) throw new Error(`texte introuvable: ${text}`);
  await move(r.x, r.y + 4, 550);
  await sleep(250);
}

// Splits a narration into caption chunks timed by length.
function chunks(text, seconds) {
  const parts = text.split(/(?<=[.!?:])\s+/).flatMap((s) => {
    if (s.length <= 95) return [s];
    const mid = s.lastIndexOf(', ', Math.ceil(s.length / 2) + 10);
    return mid > 20 ? [s.slice(0, mid + 1), s.slice(mid + 2)] : [s];
  });
  const total = parts.reduce((n, p) => n + p.length, 0);
  let t = 0;
  return parts.map((p) => {
    const d = (p.length / total) * seconds;
    const c = { text: p, start: t, end: t + d };
    t += d;
    return c;
  });
}

async function segment(id, title, actions) {
  if (process.env.DEMO_UNTIL && timeline.some((s) => s.id === process.env.DEMO_UNTIL)) return;
  const seg = narration.find((n) => n.id === id);
  const dur = wavSeconds(path.join(audioDir, `${id}.wav`));
  const start = Date.now() - recStart;
  const caps = chunks(seg.text, dur);
  timeline.push({ id, title, start: start / 1000, duration: dur, captions: caps.map((c) => ({ ...c, start: c.start + start / 1000, end: c.end + start / 1000 })) });
  console.log(`[${(start / 1000).toFixed(1)}s] ${id} ${title}`);
  (async () => {
    for (const c of caps) {
      call('caption', c.text);
      await sleep(Math.max(0, start + (c.end * 1000) - (Date.now() - recStart)));
    }
    call('caption', '');
  })();
  await actions();
  const left = dur * 1000 + 450 - (Date.now() - recStart - start);
  if (left > 0) await sleep(left);
}

/* ------------------------------------------------------------- scénario */

async function scenario() {
  await segment('n00', 'Introduction', async () => {
    await sleep(dur('n00') * 1000 - 200);
  });

  await segment('n01', 'Installation', async () => {
    await call('card', 'install');
    await sleep(dur('n01') * 1000 - 400);
  });

  await segment('n02', 'Découverte de l’interface', async () => {
    await call('card', null);
    await sleep(900);
    await call('highlight', '#sidebar');
    await move(200, 330, 900);
    await sleep(2600);
    await call('highlight', '.page');
    await move(700, 420, 800);
    await sleep(2400);
    await call('highlight', '#toolbar');
    await move(780, 69, 700);
    await sleep(2000);
    await call('highlight', null);
  });

  await segment('n03', 'Créer un dossier', async () => {
    await click('#new-folder');
    await sleep(500);
    await type('Mathématiques');
    await sleep(300);
    await key('Enter', [], 600);
  });

  await segment('n04', 'Créer un sous-dossier', async () => {
    await to('#tree .row.dir', 'Mathématiques');
    await sleep(300);
    await click(null, null, { button: 'right' });
    await sleep(900);
    await click('.menu-item', 'Nouveau sous-dossier');
    await sleep(400);
    await type('Analyse');
    await key('Enter', [], 500);
  });

  await segment('n05', 'Créer un cours', async () => {
    await to('#tree .row.dir', 'Analyse', 600, 0.6);
    await sleep(500);
    await click('#tree .row.dir[data-path="Mathématiques/Analyse"] .row-add', null, { ms: 400 });
    await sleep(600);
    await type('Les dérivées');
    await sleep(300);
    await key('Enter', [], 500);
  });

  await segment('n06', 'Le menu /', async () => {
    await type('/');
    await sleep(1800);
    await type('tit', 6);
    await sleep(1200);
    await key('Enter', [], 300);
    await type('Définition\n');
    await type("La dérivée d'une fonction mesure sa vitesse de variation. Elle permet d'étudier le sens de variation et de trouver les extremums.", 26);
  });

  await segment('n07', 'Mettre en forme', async () => {
    await select('vitesse de variation');
    await click('#toolbar .tb-btn[title^="Gras"]');
    await sleep(500);
    await select('sens de variation');
    await click('#toolbar .tb-btn[title="Couleur du texte"]');
    await sleep(700);
    await click('.swatch[title="Bleu"]');
    await sleep(500);
    await select('extremums');
    await click('#toolbar .tb-btn[title="Surligner"]');
    await sleep(700);
    await click('.swatch[title="Jaune"]');
    await sleep(300);
    await click('.ProseMirror p', 'La dérivée', { ms: 500 });
    await key('End', ['control'], 300);
  });

  await segment('n08', 'Les encadrés', async () => {
    await key('Enter');
    await type('/def', 8);
    await sleep(700);
    await key('Enter', [], 300);
    await type("f'(a) est le coefficient directeur de la tangente à la courbe au point d'abscisse a.", 30);
    await key('Enter');
    await key('Enter');
    await type('/atten', 8);
    await sleep(500);
    await key('Enter', [], 300);
    await type("Ne pas confondre f(a) et f'(a) !", 26);
    await key('Enter');
    await key('Enter');
    await type('/reten', 8);
    await sleep(500);
    await key('Enter', [], 300);
    await type("Si f'(x) > 0, alors f est croissante.", 26);
    await key('Enter');
    await key('Enter');
  });

  await segment('n09', 'Listes et tableaux', async () => {
    await type('/tâches', 8);
    await sleep(500);
    await key('Enter', [], 300);
    await type('Revoir les formules\nFaire les exercices 12 à 15', 22);
    await key('Enter');
    await key('Enter');
    await click('#toolbar .tb-btn[title="Tableau"]');
    await sleep(500);
    await to('.grid-pick span[data-r="1"][data-c="1"]', null, 400);
    await to('.grid-pick span[data-r="3"][data-c="2"]', null, 700);
    await sleep(500);
    await click(null);
    await type('Fonction', 22);
    await key('Tab');
    await type('Dérivée', 22);
    await key('Tab');
    await type('x²', 14);
    await key('Tab');
    await type('2x', 14);
    await key('Tab');
    await type('√x', 14);
    await key('Tab');
    await type('1 / (2√x)', 18);
  });

  await segment('n10', 'Enregistrement automatique', async () => {
    await sleep(600);
    await call('highlight', '#st-save', null, 8);
    await move(1190, 700, 800);
    await sleep(3500);
    await call('highlight', null);
  });

  await segment('n11', 'Organiser ses cours', async () => {
    await to('#tree .row.file', 'Bienvenue');
    await sleep(300);
    mouse('mouseDown', { button: 'left', clickCount: 1 });
    await call('drag', '#tree .row.file', 'Bienvenue', null, null, 'start');
    await call('ghost', 'Bienvenue');
    const target = await call('rect', '#tree .row.dir', 'Mathématiques');
    await move(target.x, target.y, 1100, ['leftButtonDown']);
    await call('drag', null, null, '#tree .row.dir', 'Mathématiques', 'over');
    await sleep(600);
    await call('drag', '#tree .row.file', 'Bienvenue', '#tree .row.dir', 'Mathématiques', 'drop');
    mouse('mouseUp', { button: 'left', clickCount: 1 });
    await call('ghost', null);
    await sleep(1400);
    await to('#tree .row.file', 'Bienvenue');
    await click(null, null, { button: 'right' });
    await sleep(2600);
    await key('Escape', [], 400);
  });

  await segment('n12', 'Rechercher', async () => {
    await move(200, 120, 500);
    await key('P', ['control'], 500);
    await type('tangente', 10);
    await sleep(1800);
    await to('.result', 'Les dérivées');
    await sleep(800);
  });

  await segment('n13', 'Thème clair et sombre', async () => {
    await click('.result', 'Les dérivées');
    await sleep(300);
    await click('#btn-theme');
    await sleep(800);
    await click('.menu-item', 'Sombre');
    await sleep(1800);
  });

  await segment('n14', 'Mode concentration', async () => {
    await move(900, 500, 500);
    await js("document.body.classList.add('focus-mode')");
    await sleep(1400);
    await js("document.querySelector('#scroller').scrollTo({top:420})");
    await sleep(2200);
    await js("document.querySelector('#scroller').scrollTo({top:0})");
    await sleep(800);
    await js("document.body.classList.remove('focus-mode')");
  });

  await segment('n15', 'Exporter en PDF', async () => {
    await click('#btn-pdf');
    await sleep(1600);
    await call('pdf', true);
    await sleep(dur('n15') * 1000 - 3000);
  });

  await segment('n16', 'Conclusion', async () => {
    await call('pdf', false);
    await sleep(400);
    await call('card', 'outro');
    await sleep(dur('n16') * 1000 + 1500);
  });
}

const dur = (id) => wavSeconds(path.join(audioDir, `${id}.wav`));

/* ----------------------------------------------------------------- run */

app.on('browser-window-created', (_e, w) => {
  if (win) return;
  win = w;
  wc = w.webContents;
  wc.setFrameRate(30);
  wc.on('console-message', (e) => console.log('[page]', e.message || e));
  wc.once('did-finish-load', async () => {
    win.setContentSize(W, H);
    win.focusOnWebView(); // offscreen windows never get OS focus otherwise
    for (let i = 0; i < 50 && !(await js("document.body.classList.contains('ready')")); i++) await sleep(100);
    await sleep(800);
    await js(fs.readFileSync(path.join(__dirname, 'overlay.js'), 'utf8'));
    await call('card', 'intro');
    await call('place', pos.x, pos.y);
    await sleep(900);

    let n = 0;
    recStart = Date.now();
    wc.on('paint', (_ev, _dirty, image) => {
      const t = Date.now() - recStart;
      const file = `frames/${String(++n).padStart(6, '0')}.jpg`;
      fs.writeFileSync(path.join(out, file), image.toJPEG(90));
      frames.push({ file, t });
    });
    wc.invalidate();

    try {
      await scenario();
    } catch (err) {
      console.error('SCENARIO ERROR', err);
    }
    const end = Date.now() - recStart;
    const lines = [];
    frames.forEach((f, i) => {
      const next = i + 1 < frames.length ? frames[i + 1].t : end;
      lines.push(`file '${f.file}'`, `duration ${((next - f.t) / 1000).toFixed(4)}`);
    });
    lines.push(`file '${frames[frames.length - 1].file}'`);
    fs.writeFileSync(path.join(out, 'frames.txt'), lines.join('\n'));
    fs.writeFileSync(path.join(out, 'timeline.json'), JSON.stringify({ duration: end / 1000, segments: timeline }, null, 2));
    console.log(`done: ${frames.length} frames, ${(end / 1000).toFixed(1)}s`);
    app.exit(0);
  });
});
