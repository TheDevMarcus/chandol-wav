const { app, BrowserWindow, Tray, Menu, globalShortcut, nativeImage, shell } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { autoUpdater } = require('electron-updater');

app.setName('.wav');

const DIST = path.join(__dirname, 'dist');
const PORT = 8427;
const TOKEN_HEADER = 'x-chandol-app';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg'
};

let win = null;
let tray = null;
let server = null;
let quitting = false;

function startServer() {
  return new Promise((resolve, reject) => {
    server = http.createServer((req, res) => {
      let rel = decodeURIComponent((req.url || '/').split('?')[0]);
      rel = path.normalize(rel).replace(/^(\.\.[\\/])+/, '').replace(/^[\\/]+/, '');
      if (!rel) rel = 'index.html';
      let file = path.join(DIST, rel);
      fs.stat(file, (err, st) => {
        const send = (p) => {
          fs.readFile(p, (e, buf) => {
            if (e) { res.writeHead(500); return res.end('error'); }
            res.writeHead(200, {
              'Content-Type': TYPES[path.extname(p).toLowerCase()] || 'application/octet-stream',
              'Cache-Control': 'no-store',
              [TOKEN_HEADER]: '1'
            });
            res.end(buf);
          });
        };
        if (!err && st.isDirectory()) return send(path.join(file, 'index.html'));
        if (!err) return send(file);
        send(path.join(DIST, 'index.html'));
      });
    });
    server.on('error', reject);
    server.listen(PORT, '127.0.0.1', () => resolve());
  });
}

function runInPage(js) {
  if (win && !win.isDestroyed()) {
    win.webContents.executeJavaScript(js).catch(() => {});
  }
}

const clickToggle = () => runInPage("document.getElementById('toggle')?.click()");
const clickNext = () => runInPage("document.getElementById('next')?.click()");
const clickPrev = () => runInPage("document.getElementById('prev')?.click()");

async function nowPlaying() {
  if (!win || win.isDestroyed()) return { title: '', paused: true };
  try {
    return await win.webContents.executeJavaScript(
      "({ title: (document.getElementById('title')?.textContent || '') + " +
      "(document.getElementById('artist')?.textContent ? ' - ' + document.getElementById('artist').textContent : ''), " +
      "paused: (document.querySelector('audio')?.paused !== false) })"
    );
  } catch (e) {
    return { title: '', paused: true };
  }
}

async function buildTrayMenu() {
  const np = await nowPlaying();
  const label = np.title && np.title.trim() ? np.title.trim() : 'Nothing playing';
  return Menu.buildFromTemplate([
    { label: label.slice(0, 60), enabled: false },
    { type: 'separator' },
    { label: np.paused ? 'Play' : 'Pause', click: clickToggle },
    { label: 'Previous', click: clickPrev },
    { label: 'Next', click: clickNext },
    { type: 'separator' },
    { label: 'Show window', click: () => { win.show(); win.focus(); } },
    { label: 'Quit', click: () => { quitting = true; app.quit(); } }
  ]);
}

async function refreshTray() {
  if (!tray || tray.isDestroyed()) return;
  tray.setContextMenu(await buildTrayMenu());
}

function createTray() {
  const iconPath = path.join(__dirname, 'build', 'tray.png');
  let img = nativeImage.createFromPath(iconPath);
  if (img.isEmpty()) img = nativeImage.createEmpty();
  tray = new Tray(img);
  tray.setToolTip('.wav');
  tray.on('click', () => {
    if (win.isVisible()) { win.focus(); } else { win.show(); win.focus(); }
  });
  refreshTray();
  setInterval(refreshTray, 5000);
}

function createWindow(serverOk) {
  win = new BrowserWindow({
    width: 1150,
    height: 780,
    minWidth: 420,
    minHeight: 560,
    backgroundColor: '#04040a',
    title: '.wav',
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });

  if (serverOk) {
    win.loadURL('http://localhost:' + PORT + '/');
  } else {
    const msg = 'chandol.wav could not start its local server on port ' + PORT +
      '. Another program is using that port. Close it and restart the app.';
    win.loadURL('data:text/html,' + encodeURIComponent(
      '<body style="background:#04040a;color:#f3f3f7;font:15px sans-serif;' +
      'display:grid;place-items:center;height:100vh;margin:0;text-align:center;padding:40px">' +
      '<div>' + msg + '</div></body>'));
  }

  win.on('close', (e) => {
    if (!quitting) { e.preventDefault(); win.hide(); }
  });

  win.on('page-title-updated', (e) => { e.preventDefault(); });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

const single = app.requestSingleInstanceLock();
if (!single) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) { win.show(); win.focus(); }
  });

  app.whenReady().then(async () => {
    let serverOk = true;
    try {
      await startServer();
    } catch (e) {
      serverOk = false;
      console.error('server failed on port ' + PORT + ':', e.message);
    }
    createWindow(serverOk);
    createTray();

    try {
      autoUpdater.autoDownload = true;
      autoUpdater.checkForUpdatesAndNotify();
      setInterval(() => autoUpdater.checkForUpdatesAndNotify(), 6 * 60 * 60 * 1000);
    } catch (e) {}

    globalShortcut.register('MediaPlayPause', clickToggle);
    globalShortcut.register('MediaNextTrack', clickNext);
    globalShortcut.register('MediaPreviousTrack', clickPrev);
  });

  app.on('before-quit', () => { quitting = true; });
  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    if (server) server.close();
  });
  app.on('window-all-closed', () => {});
}
