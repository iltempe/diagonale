const { contextBridge, ipcRenderer } = require('electron');

const versionArg = process.argv.find((a) => a.startsWith('--diagonale-version='));

contextBridge.exposeInMainWorld('diagonaleDesktop', {
  platform: process.platform,
  version: versionArg ? versionArg.split('=')[1] : '',
  onOpenBoard: (cb) => {
    ipcRenderer.on('open-board', (_e, json) => cb(json));
    ipcRenderer.send('renderer-ready');
  },
});
