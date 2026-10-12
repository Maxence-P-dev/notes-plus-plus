// Dev helper: launches Notes++ on a throwaway profile and saves screenshots.
// Usage: electron scripts/shot.cjs <outDir> [steps.json]
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const out = path.resolve(process.argv[2] || 'shots');
const steps = process.argv[3] ? JSON.parse(fs.readFileSync(process.argv[3], 'utf8')) : [];
const profile = path.join(out, 'profile');
fs.rmSync(profile, { recursive: true, force: true });
fs.mkdirSync(profile, { recursive: true });
app.setPath('userData', profile);
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify({ root: path.join(profile, 'Mes Cours'), theme: 'light', bounds: { width: 1400, height: 900 } }));
// Skip native dialogs so exports can be tested unattended.
const electron = require('electron');
electron.dialog.showSaveDialog = async () => ({ canceled: false, filePath: path.join(out, 'export.pdf') });
electron.shell.openPath = async () => '';
require('../app/main.js');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
app.on('browser-window-created', (_e, win) => {
  if (BrowserWindow.getAllWindows().length > 1) return;
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
