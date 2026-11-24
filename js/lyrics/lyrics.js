import { vaultLyrics } from '../core/juice.js';

const cache = {};
const LOCAL = 'data/lyrics/';
let indexSet = null, indexPromise = null;

function loadIndex() {
  if (indexSet) return Promise.resolve(indexSet);
  if (!indexPromise) {
    indexPromise = fetch('data/lyrics-index.json', { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : []))
      .catch(() => [])
      .then((a) => { indexSet = new Set(Array.isArray(a) ? a : []); return indexSet; });
  }
  return indexPromise;
}

function hosted(key) {
  return fetch(LOCAL + encodeURIComponent(key) + '.json', { cache: 'force-cache' })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => (d && (d.synced || d.plain) ? d : null))
    .catch(() => null);
}

export function parseLrc(text) {
  const out = [];
  String(text).split(/\r?\n/).forEach((line) => {
    const re = /\[(\d+):(\d+(?:\.\d+)?)\]/g;
    const times = [];
    let m, last = 0;
    while ((m = re.exec(line))) { times.push(Number(m[1]) * 60 + parseFloat(m[2])); last = re.lastIndex; }
    const txt = line.slice(last).trim();
    if (!times.length || !txt) return;
    times.forEach((tm) => out.push({ t: tm, text: txt }));
  });
  out.sort((a, b) => a.t - b.t);
  return out;
}

function lrcNorm(s) {
  return String(s || '').toLowerCase().replace(/[\[(][^\])]*[\])]/g, ' ').replace(/[^a-z0-9\u00c0-\uffff]+/g, ' ').trim();
}

function lrclib(params) {
  return fetch('https://lrclib.net/api/search?' + new URLSearchParams(params).toString()).then((r) => {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  });
}

function pickLyrics(rows, t) {
  const want = lrcNorm(t.name);
  const artists = [lrcNorm(t.artist), 'chandol', 'boywithuke', 'boy with uke'];
  let best = null, bestScore = -1;
  (Array.isArray(rows) ? rows : []).forEach((r) => {
    if (!r || r.instrumental) return;
    const name = lrcNorm(r.trackName || r.name), by = lrcNorm(r.artistName);
    if (!want || !name) return;
    if (!(name === want || name.indexOf(want) !== -1 || want.indexOf(name) !== -1)) return;
    if (by && !artists.some((a) => a && (by.indexOf(a) !== -1 || a.indexOf(by) !== -1))) return;
    const synced = typeof r.syncedLyrics === 'string' && r.syncedLyrics.trim() ? r.syncedLyrics : '';
    const plain = typeof r.plainLyrics === 'string' && r.plainLyrics.trim() ? r.plainLyrics : '';
    if (!synced && !plain) return;
    let s = (name === want ? 100 : 40) + (synced ? 50 : 0);
    if (t.dur && r.duration) s -= Math.min(Math.abs(r.duration - t.dur), 30);
    if (s > bestScore) { bestScore = s; best = { synced: synced, plain: plain }; }
  });
  return best;
}

function fromLrclib(t) {
  const title = t.name.replace(/[\[(][^\])]*[\])]/g, ' ').replace(/\s+/g, ' ').trim() || t.name;
  return lrclib({ track_name: title, artist_name: t.artist })
    .then((rows) => pickLyrics(rows, t))
    .then((r) => r || lrclib({ q: (title + ' ' + t.artist).trim() }).then((rows) => pickLyrics(rows, t)))
    .catch(() => null);
}

const keyOf = (t) => (t.artistKey ? t.artistKey + '-' : '') + t.id;

export function fetchLrclib(t) {
  const key = keyOf(t);
  return fromLrclib(t).then((r) => {
    if (r) cache[key] = r;
    return r || null;
  });
}

export function fetchLyrics(t) {
  const key = keyOf(t);
  if (cache[key] !== undefined) return Promise.resolve(cache[key]);

  if (t.juice) {
    return vaultLyrics(t.id).then((r) => { cache[key] = r || null; return r || null; });
  }

  return loadIndex()
    .then((set) => (set.has(key) ? hosted(key) : null))
    .then((r) => r || fromLrclib(t))
    .then((r) => { cache[key] = r || null; return r || null; });
}
