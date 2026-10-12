'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel) => (...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld('notesApp', {
  getSettings: invoke('settings:get'),
  setSettings: invoke('settings:set'),
  chooseRoot: invoke('root:choose'),
  tree: invoke('fs:tree'),
  read: invoke('fs:read'),
  write: invoke('fs:write'),
  writeSync: (p, content) => ipcRenderer.sendSync('fs:writeSync', p, content),
  createFile: invoke('fs:createFile'),
  createFolder: invoke('fs:createFolder'),
  rename: invoke('fs:rename'),
  move: invoke('fs:move'),
  remove: invoke('fs:delete'),
  search: invoke('fs:search'),
  reveal: invoke('fs:reveal'),
  pickImage: invoke('image:pick'),
  exportPdf: invoke('export:pdf'),
  toggleFullscreen: invoke('win:fullscreen'),
  onSystemTheme: (cb) => ipcRenderer.on('theme:system', (_e, t) => cb(t)),
  onFullscreen: (cb) => ipcRenderer.on('fullscreen', (_e, v) => cb(v)),
});
