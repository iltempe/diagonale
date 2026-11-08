// Diagonale desktop (Electron). Serves the web app from the app:// protocol so IndexedDB, Web Crypto
// and WebCodecs behave like on https, and adds desktop-only conveniences.
const { app, BrowserWindow, Menu, dialog, ipcMain, net, protocol, session, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const SITE = 'https://diagonalecalcio.it/';
const REPO = 'https://github.com/iltempe/diagonale';
const WEB_ROOT = path.join(__dirname, 'web');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

let win = null;
let rendererReady = false;
const pendingFiles = [];

const isBoardFile = (p) => typeof p === 'string' && /\.json$/i.test(p) && fs.existsSync(p);

function sendFile(file) {
  try {
    const json = fs.readFileSync(file, 'utf8');
    if (win && rendererReady) win.webContents.send('open-board', json);
    else pendingFiles.push(file);
  } catch (e) {
    dialog.showErrorBox('Diagonale', String(e));
  }
}

function isLocalAI(url) {
  try {
    const u = new URL(url);
    return (u.protocol === 'http:' || u.protocol === 'ws:') && (u.hostname === 'localhost' || u.hostname === '127.0.0.1');
  } catch {
    return false;
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0B2B20',
    title: 'Diagonale',
    autoHideMenuBar: process.platform !== 'darwin',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      additionalArguments: [`--diagonale-version=${app.getVersion()}`],
    },
  });
  win.loadURL('app://diagonale/index.html');
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('app://')) {
      e.preventDefault();
      void shell.openExternal(url);
    }
  });
  win.on('closed', () => {
    win = null;
    rendererReady = false;
  });
}

async function openDialog() {
  const r = await dialog.showOpenDialog(win, {
    properties: ['openFile'],
    filters: [{ name: 'Diagonale', extensions: ['json'] }],
  });
  if (!r.canceled && r.filePaths[0]) sendFile(r.filePaths[0]);
}

function buildMenu() {
  const it = app.getLocale().startsWith('it');
  const L = (itText, enText) => (it ? itText : enText);
  const template = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    {
      label: L('File', 'File'),
      submenu: [
        { label: L('Apri .diagonale.json…', 'Open .diagonale.json…'), accelerator: 'CmdOrCtrl+O', click: () => void openDialog() },
        { type: 'separator' },
        process.platform === 'darwin' ? { role: 'close' } : { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    {
      label: L('Vista', 'View'),
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        { label: L('Sito di Diagonale', 'Diagonale website'), click: () => void shell.openExternal(SITE) },
        { label: L('Codice sorgente (GitHub)', 'Source code (GitHub)'), click: () => void shell.openExternal(REPO) },
        { label: L('Aggiornamenti', 'Check for updates'), click: () => void shell.openExternal(`${REPO}/releases/latest`) },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    const file = argv.slice(1).find(isBoardFile);
    if (file) sendFile(file);
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  // macOS: files dropped on the dock icon / "Open with"
  app.on('open-file', (e, file) => {
    e.preventDefault();
    sendFile(file);
  });

  ipcMain.on('renderer-ready', () => {
    rendererReady = true;
    while (pendingFiles.length) sendFile(pendingFiles.shift());
  });

  app.whenReady().then(() => {
    protocol.handle('app', (req) => {
      const { pathname } = new URL(req.url);
      let rel = decodeURIComponent(pathname);
      if (!rel || rel === '/') rel = '/index.html';
      const file = path.normalize(path.join(WEB_ROOT, rel));
      if (!file.startsWith(WEB_ROOT)) return new Response('Forbidden', { status: 403 });
      const target = fs.existsSync(file) && fs.statSync(file).isFile() ? file : path.join(WEB_ROOT, 'index.html');
      return net.fetch(pathToFileURL(target).toString());
    });

    // Local AI servers (Ollama, LM Studio) and the MCP live bridge work without CORS configuration.
    const ses = session.defaultSession;
    ses.webRequest.onBeforeSendHeaders({ urls: ['<all_urls>'] }, (d, cb) => {
      if (!isLocalAI(d.url)) return cb({});
      const requestHeaders = { ...d.requestHeaders };
      delete requestHeaders.Origin;
      delete requestHeaders.origin;
      cb({ requestHeaders });
    });
    ses.webRequest.onHeadersReceived({ urls: ['<all_urls>'] }, (d, cb) => {
      if (!isLocalAI(d.url)) return cb({});
      const responseHeaders = {};
      for (const [k, v] of Object.entries(d.responseHeaders ?? {})) if (!k.toLowerCase().startsWith('access-control-')) responseHeaders[k] = v;
      responseHeaders['Access-Control-Allow-Origin'] = ['*'];
      responseHeaders['Access-Control-Allow-Headers'] = ['*'];
      responseHeaders['Access-Control-Allow-Methods'] = ['GET, POST, OPTIONS'];
      cb(d.method === 'OPTIONS' ? { responseHeaders, statusLine: 'HTTP/1.1 204 No Content' } : { responseHeaders });
    });
    ses.setPermissionRequestHandler((_wc, permission, cb) => cb(['media', 'clipboard-sanitized-write', 'fullscreen'].includes(permission)));

    buildMenu();
    createWindow();
    const file = process.argv.slice(1).find(isBoardFile);
    if (file) sendFile(file);
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
