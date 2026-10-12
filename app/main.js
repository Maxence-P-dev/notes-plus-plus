'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell, nativeTheme, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;

const EXT = '.cours';
const SETTINGS_FILE = path.join(app.getPath('userData'), 'settings.json');

const THEME_COLORS = {
  light: { color: '#f6f6f4', symbolColor: '#3a3a3a' },
  dark: { color: '#18181b', symbolColor: '#e4e4e7' },
};

let win = null;
let settings = loadSettings();

/* ---------------------------------------------------------------- settings */

function defaultSettings() {
  return {
    root: path.join(app.getPath('documents'), 'Mes Cours'),
    theme: 'system',
    lastFile: null,
    expanded: [],
    sidebarWidth: 280,
    bounds: { width: 1320, height: 860 },
    maximized: false,
  };
}

function loadSettings() {
  try {
    return { ...defaultSettings(), ...JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) };
  } catch {
    return defaultSettings();
  }
}

function saveSettings() {
  try {
    fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
  } catch (err) {
    console.error('settings save failed', err);
  }
}

function effectiveTheme() {
  if (settings.theme === 'light' || settings.theme === 'dark') return settings.theme;
  return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
}

function applyTitleBarColors() {
  if (!win || process.platform !== 'win32') return;
  try {
    win.setTitleBarOverlay({ ...THEME_COLORS[effectiveTheme()], height: 44 });
  } catch {}
}

/* ------------------------------------------------------------- filesystem */

// Every path coming from the renderer is relative to the root folder.
// Resolve it and refuse anything that escapes the root.
function abs(rel = '') {
  const root = path.resolve(settings.root);
  const full = path.resolve(root, rel || '');
  if (full !== root && !full.startsWith(root + path.sep)) {
    throw new Error('Chemin invalide');
  }
  return full;
}

function rel(full) {
  return path.relative(path.resolve(settings.root), full).split(path.sep).join('/');
}

function cleanName(name) {
  return String(name || '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .replace(/[. ]+$/, '')
    .trim()
    .slice(0, 120);
}

async function exists(p) {
  try {
    await fsp.access(p);
    return true;
  } catch {
    return false;
  }
}

async function uniquePath(dir, base, ext = '') {
  let candidate = path.join(dir, base + ext);
  let i = 2;
  while (await exists(candidate)) candidate = path.join(dir, `${base} (${i++})${ext}`);
  return candidate;
}

const collator = new Intl.Collator('fr', { numeric: true, sensitivity: 'base' });

async function readTree(dir) {
  let entries;
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      out.push({ type: 'dir', name: e.name, path: rel(full), children: await readTree(full) });
    } else if (e.isFile() && e.name.toLowerCase().endsWith(EXT)) {
      out.push({ type: 'file', name: e.name.slice(0, -EXT.length), path: rel(full) });
    }
  }
  out.sort((a, b) => (a.type !== b.type ? (a.type === 'dir' ? -1 : 1) : collator.compare(a.name, b.name)));
  return out;
}

async function* walkFiles(dir) {
  let entries;
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) yield* walkFiles(full);
    else if (e.name.toLowerCase().endsWith(EXT)) yield full;
  }
}

function htmlToText(html) {
  return html
    .replace(/<img[^>]*>/gi, ' ')
    .replace(/<\/(p|h\d|li|div|blockquote|pre|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ');
}

function normalize(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

async function search(query) {
  const q = normalize(query.trim());
  if (!q) return [];
  const results = [];
  for await (const full of walkFiles(abs())) {
    const name = path.basename(full, EXT);
    const nameHit = normalize(name).includes(q);
    let snippet = '';
    try {
      const text = htmlToText(await fsp.readFile(full, 'utf8'));
      const idx = normalize(text).indexOf(q);
      if (idx >= 0) {
        const start = Math.max(0, idx - 40);
        snippet = (start > 0 ? '…' : '') + text.slice(start, idx + q.length + 60).replace(/\s+/g, ' ').trim() + '…';
      }
    } catch {}
    if (nameHit || snippet) {
      results.push({ name, path: rel(full), folder: rel(path.dirname(full)), snippet, score: nameHit ? 0 : 1 });
    }
    if (results.length >= 80) break;
  }
  results.sort((a, b) => a.score - b.score || collator.compare(a.name, b.name));
  return results;
}

const WELCOME = `<p>Notes++ est ton cahier de cours. Tout est <strong>enregistré automatiquement</strong> pendant que tu écris.</p>
<div data-callout="info"><p><strong>Astuce :</strong> tape <code>/</code> au début d'une ligne pour insérer un titre, une liste, un tableau, un encadré…</p></div>
<h2>Organiser ses cours</h2>
<ul>
<li><p>Crée des <strong>dossiers</strong> et des <strong>sous-dossiers</strong> avec les boutons en haut de la barre latérale.</p></li>
<li><p>Fais un <strong>clic droit</strong> sur un élément pour le renommer, le supprimer ou y ajouter un cours.</p></li>
<li><p><strong>Glisse-dépose</strong> un cours ou un dossier pour le déplacer.</p></li>
</ul>
<h2>Mettre en forme</h2>
<p>Clique sur une <strong>image</strong> pour la placer à gauche, au centre, à droite, ou avec du texte à côté. Tu peux aussi la redimensionner avec les poignées.</p>
<p>Du texte en <strong>gras</strong>, en <em>italique</em>, <u>souligné</u>, <mark data-color="rgba(255, 212, 0, 0.4)" style="background-color: rgba(255, 212, 0, 0.4)">surligné</mark> ou en <span style="color: #2f80ed">couleur</span>.</p>
<div data-callout="definition"><p><strong>Définition :</strong> un encadré met en valeur une notion importante du cours.</p></div>
<div data-callout="warning"><p><strong>Attention :</strong> les encadrés « attention » sont parfaits pour les pièges à éviter.</p></div>
<ul data-type="taskList">
<li data-type="taskItem" data-checked="true"><p>Découvrir Notes++</p></li>
<li data-type="taskItem" data-checked="false"><p>Créer mon premier cours</p></li>
</ul>
<h2>Raccourcis utiles</h2>
<table><tbody>
<tr><th><p>Action</p></th><th><p>Raccourci</p></th></tr>
<tr><td><p>Nouveau cours</p></td><td><p>Ctrl + N</p></td></tr>
<tr><td><p>Nouveau dossier</p></td><td><p>Ctrl + Maj + N</p></td></tr>
<tr><td><p>Rechercher</p></td><td><p>Ctrl + P</p></td></tr>
<tr><td><p>Thème clair / sombre</p></td><td><p>Ctrl + Maj + L</p></td></tr>
<tr><td><p>Mode concentration</p></td><td><p>F11</p></td></tr>
<tr><td><p>Exporter en PDF</p></td><td><p>Ctrl + Maj + E</p></td></tr>
</tbody></table>
<blockquote><p>« Le savoir est la seule richesse qui s'accroît quand on la partage. »</p></blockquote>`;

async function ensureRoot() {
  const root = abs();
  if (!(await exists(root))) {
    await fsp.mkdir(root, { recursive: true });
    await fsp.writeFile(path.join(root, 'Bienvenue' + EXT), WELCOME, 'utf8');
    settings.lastFile = 'Bienvenue' + EXT;
    saveSettings();
  }
}

/* -------------------------------------------------------------------- ipc */

function handle(channel, fn) {
  ipcMain.handle(channel, async (_e, ...args) => fn(...args));
}

handle('settings:get', () => ({ ...settings, effectiveTheme: effectiveTheme() }));

handle('settings:set', (patch) => {
  const allowed = ['theme', 'lastFile', 'expanded', 'sidebarWidth'];
  for (const k of allowed) if (k in patch) settings[k] = patch[k];
  saveSettings();
  if ('theme' in patch) {
    nativeTheme.themeSource = settings.theme;
    applyTitleBarColors();
  }
  return { ...settings, effectiveTheme: effectiveTheme() };
});

handle('root:choose', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Choisir le dossier de mes cours',
    defaultPath: settings.root,
    properties: ['openDirectory', 'createDirectory'],
  });
  if (r.canceled || !r.filePaths[0]) return null;
  settings.root = r.filePaths[0];
  settings.lastFile = null;
  settings.expanded = [];
  saveSettings();
  return settings.root;
});

handle('fs:tree', async () => {
  await ensureRoot();
  return { root: abs(), tree: await readTree(abs()) };
});

handle('fs:read', async (p) => fsp.readFile(abs(p), 'utf8'));

handle('fs:write', async (p, content) => {
  await fsp.writeFile(abs(p), content, 'utf8');
  return true;
});

ipcMain.on('fs:writeSync', (e, p, content) => {
  try {
    fs.writeFileSync(abs(p), content, 'utf8');
    e.returnValue = true;
  } catch {
    e.returnValue = false;
  }
});

handle('fs:createFile', async (parent, name) => {
  const dir = abs(parent);
  await fsp.mkdir(dir, { recursive: true });
  const target = await uniquePath(dir, cleanName(name) || 'Nouveau cours', EXT);
  await fsp.writeFile(target, '', 'utf8');
  return rel(target);
});

handle('fs:createFolder', async (parent, name) => {
  const dir = abs(parent);
  const target = await uniquePath(dir, cleanName(name) || 'Nouveau dossier');
  await fsp.mkdir(target, { recursive: true });
  return rel(target);
});

handle('fs:rename', async (p, newName) => {
  const from = abs(p);
  const stat = await fsp.stat(from);
  const ext = stat.isDirectory() ? '' : EXT;
  const name = cleanName(newName);
  if (!name) throw new Error('Nom invalide');
  const current = path.basename(from, ext);
  if (name === current) return p;
  // Case-only rename on Windows: the target "exists" because it is the same file.
  const sameIgnoringCase = name.toLowerCase() === current.toLowerCase();
  const to = sameIgnoringCase ? path.join(path.dirname(from), name + ext) : await uniquePath(path.dirname(from), name, ext);
  await fsp.rename(from, to);
  return rel(to);
});

handle('fs:move', async (p, targetDir) => {
  const from = abs(p);
  const dir = abs(targetDir);
  if (dir === from || dir.startsWith(from + path.sep)) throw new Error('Impossible de déplacer un dossier dans lui-même');
  if (path.dirname(from) === dir) return p;
  const stat = await fsp.stat(from);
  const ext = stat.isDirectory() ? '' : EXT;
  const to = await uniquePath(dir, path.basename(from, ext), ext);
  await fsp.rename(from, to);
  return rel(to);
});

handle('fs:delete', async (p) => {
  const target = abs(p);
  if (target === abs()) throw new Error('Impossible de supprimer le dossier racine');
  await shell.trashItem(target);
  return true;
});

handle('fs:search', (q) => search(q));

handle('fs:reveal', (p) => {
  shell.showItemInFolder(abs(p));
});

handle('image:pick', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Insérer une image',
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'] }],
  });
  if (r.canceled || !r.filePaths[0]) return null;
  const file = r.filePaths[0];
  const ext = path.extname(file).slice(1).toLowerCase();
  const mime = ext === 'svg' ? 'image/svg+xml' : ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
  const data = await fsp.readFile(file);
  return `data:${mime};base64,${data.toString('base64')}`;
});

handle('export:pdf', async (title, bodyHtml) => {
  const r = await dialog.showSaveDialog(win, {
    title: 'Exporter en PDF',
    defaultPath: path.join(app.getPath('documents'), `${cleanName(title) || 'cours'}.pdf`),
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (r.canceled || !r.filePath) return null;

  const css = await fsp.readFile(path.join(__dirname, 'content.css'), 'utf8');
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const html = `<!doctype html><html data-theme="light"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>${css}
html,body{background:#fff;margin:0}
body{padding:0 4px;font-family:"Segoe UI Variable Text","Segoe UI",system-ui,sans-serif}
.doc-title{font-family:"Segoe UI Variable Display","Segoe UI",system-ui,sans-serif;font-size:30pt;font-weight:700;letter-spacing:-.02em;margin:0 0 18px;padding-bottom:14px;border-bottom:3px solid var(--p-accent)}
</style></head><body><div class="doc-title">${esc(title)}</div><div class="prose">${bodyHtml}</div></body></html>`;

  const tmp = path.join(app.getPath('temp'), `notes-export-${Date.now()}.html`);
  await fsp.writeFile(tmp, html, 'utf8');
  const pdfWin = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } });
  try {
    await pdfWin.loadFile(tmp);
    const pdf = await pdfWin.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: true,
      margins: { top: 0.6, bottom: 0.6, left: 0.6, right: 0.6 },
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate:
        '<div style="width:100%;font-size:8px;color:#999;text-align:center;font-family:Segoe UI,sans-serif"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
    });
    await fsp.writeFile(r.filePath, pdf);
    shell.openPath(r.filePath);
    return r.filePath;
  } finally {
    pdfWin.destroy();
    fsp.unlink(tmp).catch(() => {});
  }
});

handle('win:fullscreen', () => {
  if (!win) return false;
  win.setFullScreen(!win.isFullScreen());
  return win.isFullScreen();
});

/* ----------------------------------------------------------------- window */

function createWindow() {
  const b = settings.bounds || {};
  const theme = effectiveTheme();
  win = new BrowserWindow({
    width: b.width || 1320,
    height: b.height || 860,
    x: b.x,
    y: b.y,
    minWidth: 760,
    minHeight: 480,
    show: false,
    title: 'Notes++',
    backgroundColor: THEME_COLORS[theme].color,
    titleBarStyle: 'hidden',
    titleBarOverlay: { ...THEME_COLORS[theme], height: 44 },
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });

  win.webContents.session.setSpellCheckerLanguages(['fr', 'en-US']);
  if (settings.maximized) win.maximize();
  win.once('ready-to-show', () => win.show());

  // Links open in the default browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:|^mailto:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (url !== win.webContents.getURL()) {
      e.preventDefault();
      if (/^https?:|^mailto:/i.test(url)) shell.openExternal(url);
    }
  });

  // Spellcheck suggestions on right-click inside the editor.
  win.webContents.on('context-menu', (_e, params) => {
    if (!params.isEditable || !params.misspelledWord) return;
    const items = params.dictionarySuggestions.slice(0, 6).map((s) => ({
      label: s,
      click: () => win.webContents.replaceMisspelling(s),
    }));
    if (!items.length) items.push({ label: 'Aucune suggestion', enabled: false });
    items.push({ type: 'separator' });
    items.push({
      label: 'Ajouter au dictionnaire',
      click: () => win.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord),
    });
    Menu.buildFromTemplate(items).popup();
  });

  const remember = () => {
    if (!win) return;
    settings.maximized = win.isMaximized();
    if (!win.isMaximized() && !win.isMinimized() && !win.isFullScreen()) settings.bounds = win.getBounds();
  };
  win.on('resize', remember);
  win.on('move', remember);
  win.on('close', () => {
    remember();
    saveSettings();
  });
  win.on('closed', () => (win = null));
  win.on('enter-full-screen', () => win.webContents.send('fullscreen', true));
  win.on('leave-full-screen', () => win.webContents.send('fullscreen', false));

  win.loadFile(path.join(__dirname, 'index.html'));
}

nativeTheme.themeSource = settings.theme;
nativeTheme.on('updated', () => {
  applyTitleBarColors();
  win?.webContents.send('theme:system', effectiveTheme());
});

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });
  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    createWindow();
  });
  app.on('window-all-closed', () => app.quit());
}
