'use strict';

const { contextBridge, ipcRenderer, webUtils } = require('electron');

const invoke = (channel) => (...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld('notesApp', {
  platform: process.platform,
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
  pdf: {
    import: invoke('pdf:import'),
    importFiles: (dir, files) => ipcRenderer.invoke('pdf:importPaths', dir, [...files].map((f) => webUtils.getPathForFile(f))),
    url: invoke('pdf:url'),
    openExternal: invoke('pdf:openExternal'),
  },
  revision: {
    load: invoke('revision:load'),
    save: invoke('revision:save'),
  },
  update: {
    get: invoke('update:get'),
    check: invoke('update:check'),
    download: invoke('update:download'),
    install: invoke('update:install'),
    notes: invoke('update:notes'),
  },
  ai: {
    status: invoke('llm:status'),
    install: invoke('llm:install'),
    cancelInstall: invoke('llm:cancelInstall'),
    use: invoke('llm:use'),
    remove: invoke('llm:remove'),
    cancel: invoke('llm:cancel'),
    correct: invoke('llm:correct'),
    diagram: invoke('llm:diagram'),
    keywords: invoke('llm:keywords'),
  },
  onAiStatus: (cb) => ipcRenderer.on('llm:status', (_e, s) => cb(s)),
  onAiProgress: (cb) => ipcRenderer.on('llm:progress', (_e, p) => cb(p)),
  onUpdate: (cb) => ipcRenderer.on('update:status', (_e, s) => cb(s)),
  onSystemTheme: (cb) => ipcRenderer.on('theme:system', (_e, t) => cb(t)),
  onFullscreen: (cb) => ipcRenderer.on('fullscreen', (_e, v) => cb(v)),
});
