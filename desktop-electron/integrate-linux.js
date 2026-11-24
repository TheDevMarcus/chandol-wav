const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const ID = 'chandol-wav';
const MARKER = 'X-Wav-Integrated=true';
const SIZES = [16, 24, 32, 48, 64, 128, 256, 512];
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

const dataHome = () => process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
const entryPath = () => path.join(dataHome(), 'applications', ID + '.desktop');
const iconPath = (s) => path.join(dataHome(), 'icons', 'hicolor', s + 'x' + s, 'apps', ID + '.png');

function buildEntry(appImage) {
  return [
    '[Desktop Entry]',
    'Type=Application',
    'Name=.wav',
    'Comment=Every chandol & BoyWithUke song in one place',
    'Exec="' + appImage + '" --no-sandbox %U',
    'Icon=' + ID,
    'Terminal=false',
    'Categories=AudioVideo;Audio;Player;',
    'StartupWMClass=' + ID,
    'StartupNotify=true',
    MARKER,
    ''
  ].join('\n');
}

function refreshCaches() {
  const run = (cmd, args) => {
    try { spawn(cmd, args, { stdio: 'ignore', detached: true }).on('error', () => {}).unref(); } catch (e) {}
  };
  run('update-desktop-database', [path.join(dataHome(), 'applications')]);
  run('gtk-update-icon-cache', ['-f', '-t', path.join(dataHome(), 'icons', 'hicolor')]);
}

function writeIntegration(appImage, nativeImage, sourceIcon) {
  fs.mkdirSync(path.dirname(entryPath()), { recursive: true });
  fs.writeFileSync(entryPath(), buildEntry(appImage), { mode: 0o644 });
  const src = nativeImage.createFromPath(sourceIcon);
  if (src.isEmpty()) throw new Error('icon not found: ' + sourceIcon);
  for (const s of SIZES) {
    fs.mkdirSync(path.dirname(iconPath(s)), { recursive: true });
    fs.writeFileSync(iconPath(s), src.resize({ width: s, height: s, quality: 'best' }).toPNG());
  }
  refreshCaches();
}

function readState(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return {}; }
}
function writeState(file, state) {
  try { fs.writeFileSync(file, JSON.stringify(state)); } catch (e) {}
}

function supported() {
  const a = process.env.APPIMAGE;
  return process.platform === 'linux' && !!a && !/["`$\\%\n]/.test(a);
}

function status() {
  if (!supported()) return { supported: false, installed: false, ours: false };
  let installed = false, ours = false;
  try {
    const text = fs.readFileSync(entryPath(), 'utf8');
    installed = true;
    ours = text.includes(MARKER);
  } catch (e) {}
  return { supported: true, installed, ours };
}

function add({ nativeImage, icon, userDataDir }) {
  if (!supported()) return { ok: false, reason: 'unsupported', ...status() };
  const s = status();
  if (s.installed && !s.ours) return { ok: false, reason: 'exists', ...s };
  writeIntegration(process.env.APPIMAGE, nativeImage, icon);
  writeState(path.join(userDataDir, 'integration.json'), {});
  return { ok: true, ...status() };
}

function remove({ userDataDir }) {
  const s = status();
  if (!s.ours) return { ok: false, reason: 'not-ours', ...s };
  fs.rmSync(entryPath(), { force: true });
  for (const size of SIZES) fs.rmSync(iconPath(size), { force: true });
  refreshCaches();
  writeState(path.join(userDataDir, 'integration.json'), { declined: true });
  return { ok: true, ...status() };
}

async function maybeIntegrate({ dialog, nativeImage, userDataDir, icon, win }) {
  try {
    if (process.platform !== 'linux') return 'skipped: not linux';
    const appImage = process.env.APPIMAGE;
    if (!appImage) return 'skipped: not an AppImage';
    if (/["`$\\%\n]/.test(appImage)) return 'skipped: unsupported characters in path';

    const entry = entryPath();
    if (fs.existsSync(entry)) {
      const text = fs.readFileSync(entry, 'utf8');
      if (!text.includes(MARKER)) return 'skipped: entry exists and is not ours';
      if (!text.includes('Exec="' + appImage + '"') || !fs.existsSync(iconPath(256))) {
        writeIntegration(appImage, nativeImage, icon);
        return 'updated';
      }
      return 'ok: already integrated';
    }

    const stateFile = path.join(userDataDir, 'integration.json');
    const state = readState(stateFile);
    if (state.declined) return 'skipped: declined';
    if (state.snoozedUntil && Date.now() < state.snoozedUntil) return 'skipped: snoozed';

    const opts = {
      type: 'question',
      title: '.wav',
      message: 'Add .wav to your app menu?',
      detail: 'This lets you find and pin .wav like any other app. It adds a launcher ' +
        'entry and icons under ~/.local/share, and nothing else. You can delete them any time.',
      buttons: ['Add', 'Not now', "Don't ask again"],
      defaultId: 0,
      cancelId: 1,
      noLink: true
    };
    const { response } = (win && !win.isDestroyed() && win.isVisible())
      ? await dialog.showMessageBox(win, opts)
      : await dialog.showMessageBox(opts);

    if (response === 0) {
      writeIntegration(appImage, nativeImage, icon);
      return 'added';
    }
    if (response === 2) { writeState(stateFile, { declined: true }); return 'declined'; }
    writeState(stateFile, { snoozedUntil: Date.now() + SNOOZE_MS });
    return 'snoozed';
  } catch (e) {
    console.error('launcher integration failed:', e && e.message);
    return 'error: ' + (e && e.message);
  }
}

module.exports = { status, add, remove, maybeIntegrate, buildEntry, entryPath, iconPath, MARKER };
