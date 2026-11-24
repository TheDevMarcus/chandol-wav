const { app, BrowserWindow, Tray, Menu, globalShortcut, nativeImage, shell, dialog, ipcMain } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const launcher = require('./integrate-linux');
const { maybeIntegrate } = launcher;
const discord = require('./discord');
const vault = require('./vault');

app.setName('.wav');
app.setDesktopName('chandol-wav.desktop');
if (process.platform === 'win32') app.setAppUserModelId('dev.pages.chandolwav.desktop');
app.commandLine.appendSwitch('enable-features', 'MediaSessionService');

const DIST = path.join(__dirname, 'dist');
const PORTS = [8427, 8428, 8430, 8431, 8432, 8433];
let port = PORTS[0];
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

function handler(req, res) {
      if ((req.url || '').startsWith('/vault/stream')) {
        return vault.stream(new URL(req.url, 'http://localhost'), req, res);
      }
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
}

function listen(p) {
  return new Promise((resolve, reject) => {
    const s = http.createServer(handler);
    const fail = (e) => { s.removeListener('error', fail); s.close(); reject(e); };
    s.on('error', fail);
    s.listen(p, '127.0.0.1', () => {
      s.removeListener('error', fail);
      resolve(s);
    });
  });
}

async function startServer() {
  for (const p of PORTS) {
    try {
      server = await listen(p);
      port = p;
      return;
    } catch (e) {}
  }
  throw new Error('every port in ' + PORTS.join(', ') + ' is taken');
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
  let img = nativeImage.createFromPath(path.join(__dirname, 'build', 'tray.png'));
  if (img.isEmpty()) {
    img = nativeImage.createFromPath(path.join(__dirname, 'build', 'icon.png'));
    if (!img.isEmpty()) img = img.resize({ width: 32, height: 32 });
  }
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
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });

  if (serverOk) {
    win.loadURL('http://localhost:' + port + '/');
  } else {
    const msg = '.wav could not start its local server. Every port it uses (' +
      PORTS.join(', ') + ') is in use by another program.';
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
      console.error('server failed:', e.message);
    }
    createWindow(serverOk);
    createTray();

    const fromOurPage = (e) => !!(e.senderFrame && e.senderFrame.url.startsWith('http://localhost:' + port + '/'));
    const launcherOpts = () => ({
      nativeImage,
      userDataDir: app.getPath('userData'),
      icon: path.join(__dirname, 'build', 'icon.png')
    });
    ipcMain.on('presence:set', (e, payload) => { if (fromOurPage(e)) discord.setPresence(payload); });
    ipcMain.on('presence:clear', (e) => { if (fromOurPage(e)) discord.clear(); });
    ipcMain.handle('vault:get', (e, p) => (fromOurPage(e) ? vault.get(p) : null));
    ipcMain.handle('vault:post', (e, p, body) => (fromOurPage(e) ? vault.post(p, body) : null));
    ipcMain.handle('vault:lyrics', (e, id) => (fromOurPage(e) ? vault.lyrics(id) : null));
    ipcMain.handle('app:version', (e) => (fromOurPage(e) ? app.getVersion() : null));
    ipcMain.handle('launcher:status', (e) => (fromOurPage(e) ? launcher.status() : null));
    ipcMain.handle('launcher:set', (e, on) => {
      if (!fromOurPage(e)) return { ok: false, reason: 'denied' };
      try {
        return on ? launcher.add(launcherOpts()) : launcher.remove(launcherOpts());
      } catch (err) {
        console.error('launcher toggle failed:', err.message);
        return { ok: false, reason: 'error', ...launcher.status() };
      }
    });

    setTimeout(() => {
      maybeIntegrate({
        dialog, nativeImage, win,
        userDataDir: app.getPath('userData'),
        icon: path.join(__dirname, 'build', 'icon.png')
      });
    }, 3000);

    try {
      autoUpdater.autoDownload = true;
      let updateReady = false;
      let lastCheck = 0;
      autoUpdater.on('update-downloaded', () => { updateReady = true; });
      const checkUpdates = () => {
        if (updateReady || Date.now() - lastCheck < 5000) return;
        lastCheck = Date.now();
        Promise.resolve(autoUpdater.checkForUpdatesAndNotify()).catch(() => {});
      };
      checkUpdates();
      setInterval(checkUpdates, 30 * 1000);
      win.on('show', checkUpdates);
    } catch (e) {}

    globalShortcut.register('MediaPlayPause', clickToggle);
    globalShortcut.register('MediaNextTrack', clickNext);
    globalShortcut.register('MediaPreviousTrack', clickPrev);
  });

  app.on('before-quit', () => { quitting = true; discord.shutdown(); });
  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    if (server) server.close();
  });
  app.on('window-all-closed', () => {});
}
