// Dev helper: launches Notes++ on a throwaway profile and saves screenshots.
// Usage: electron scripts/shot.cjs <outDir> [steps.json]
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const out = path.resolve(process.argv[2] || 'shots');
// Never pop an error dialog on the desktop: log and quit instead.
process.on('uncaughtException', (err) => {
  console.error('shot error:', err.message);
  process.exit(1);
});
const steps = process.argv[3] && fs.existsSync(process.argv[3]) ? JSON.parse(fs.readFileSync(process.argv[3], 'utf8')) : [];
const profile = path.join(out, 'profile');
fs.rmSync(profile, { recursive: true, force: true });
fs.mkdirSync(profile, { recursive: true });
app.setPath('userData', profile);
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify({ root: path.join(profile, 'Mes Cours'), theme: 'light', bounds: { width: 1400, height: 900 } }));
// Skip native dialogs so exports can be tested unattended.
const electron = require('electron');
electron.dialog.showSaveDialog = async () => ({ canceled: false, filePath: path.join(out, 'export.pdf') });
electron.shell.openPath = async () => '';
electron.dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path.join(__dirname, '..', 'docs', 'sample.png')] });
require('../app/main.js');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// MOCK_AI=1 replaces the Claude calls with canned answers (no key, no cost).
function mockAi() {
  const { ipcMain } = require('electron');
  const reply = (ch, fn) => { ipcMain.removeHandler(ch); ipcMain.handle(ch, async (_e, ...a) => { await wait(600); return { ok: true, value: fn(...a) }; }); };
  reply('ai:status', () => ({ configured: true, model: 'claude-opus-5-5' }));
  reply('ai:correct', (_id, text) => [
    { original: 'Les plante', replacement: 'Les plantes', reason: 'accord du nom au pluriel' },
    { original: 'grace', replacement: 'grâce', reason: 'accent circonflexe' },
    { original: 'ils produise', replacement: 'ils produisent', reason: 'conjugaison au présent (3e personne du pluriel)' },
  ].filter((c) => text.includes(c.original)));
  reply('ai:diagram', (_id, { kind }) => ({ title: 'Photosynthèse', items: [
    { title: 'Lumière', text: 'Énergie captée par la chlorophylle', children: ['Soleil', 'Chlorophylle'] },
    { title: 'Eau', text: 'Absorbée par les racines', children: ['Racines', 'Sève brute'] },
    { title: 'CO₂', text: 'Entre par les stomates', children: ['Stomates', 'Air'] },
    { title: 'Glucose', text: 'Énergie chimique stockée', children: ['Sucres', 'Amidon'] },
    { title: 'Oxygène', text: 'Rejeté dans l’air', children: ['Respiration'] },
  ] }));
  reply('ai:illustration', () => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 520"><rect width="800" height="520" fill="#eef6ff"/><circle cx="640" cy="110" r="60" fill="#ffd166"/><rect x="0" y="400" width="800" height="120" fill="#7ac74f"/><rect x="380" y="250" width="40" height="160" fill="#8d6e63"/><circle cx="400" cy="220" r="110" fill="#43a047"/><text x="40" y="60" font-size="28" font-family="Segoe UI" fill="#1f3b57">La photosynthèse</text></svg>');
}

app.on('browser-window-created', (_e, win) => {
  if (BrowserWindow.getAllWindows().length > 1) return;
  if (process.env.MOCK_AI) mockAi();
  win.webContents.on('console-message', (e) => console.log('[renderer]', e.message || e));
  win.webContents.once('did-finish-load', async () => {
    await wait(1200);
    for (const s of steps) {
      if (s.js) {
        try { const r = await win.webContents.executeJavaScript(s.js); if (r !== undefined) console.log('js>', JSON.stringify(r)); }
        catch (err) { console.log('js error', err.message); }
      }
      if (s.key) win.webContents.sendInputEvent({ type: 'keyDown', keyCode: s.key, modifiers: s.mods || [] }), win.webContents.sendInputEvent({ type: 'char', keyCode: s.key, modifiers: s.mods || [] }), win.webContents.sendInputEvent({ type: 'keyUp', keyCode: s.key, modifiers: s.mods || [] });
      if (s.type) win.webContents.insertText(s.type);
      await wait(s.wait || 400);
      if (s.shot) fs.writeFileSync(path.join(out, s.shot + '.png'), (await win.webContents.capturePage()).toPNG());
    }
    app.quit();
  });
});
