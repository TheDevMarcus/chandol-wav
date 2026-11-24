import fs from 'fs';
import path from 'path';

const R2 = 'https://YOUR-R2-PUBLIC-BUCKET.r2.dev';
const ARTISTS = [
  { key: 'chandol', json: 'chandol.json', defaultArtist: 'chandol' },
  { key: 'boywithuke', json: 'boywithuke.json', defaultArtist: 'BoyWithUke' },
];
const OUT = 'data/lyrics';
const INDEX = 'data/lyrics-index.json';
const UA = 'chandol.wav fan site (https://chandolwav.pages.dev)';
const DELAY = 220;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lrcNorm = (s) => String(s || '').toLowerCase().replace(/[\[(][^\])]*[\])]/g, ' ').replace(/[^a-z0-9À-￿]+/g, ' ').trim();

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
    if (s > bestScore) { bestScore = s; best = { synced, plain }; }
  });
  return best;
}

async function lrclib(params) {
  const url = 'https://lrclib.net/api/search?' + new URLSearchParams(params).toString();
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

async function tracksFor(a) {
  const r = await fetch(R2 + '/' + a.json);
  const d = await r.json();
  const list = Array.isArray(d) ? d : (d && Array.isArray(d.songs) ? d.songs : []);
  return list.map((s, i) => ({
    key: a.key + '-' + (s.id != null ? s.id : i),
    name: s.title || s.name || 'Untitled',
    artist: s.artist || a.defaultArtist,
    dur: Number(s.dur) > 0 ? Number(s.dur) : 0,
  }));
}

const force = process.argv.includes('--force');

fs.mkdirSync(OUT, { recursive: true });
let tracks = [];
for (const a of ARTISTS) tracks = tracks.concat(await tracksFor(a));
console.log('tracks:', tracks.length);

const seen = new Set();
tracks = tracks.filter((t) => (seen.has(t.key) ? false : seen.add(t.key)));

let found = 0, missed = 0, skipped = 0, failed = 0;
const have = [];

for (const t of tracks) {
  const file = path.join(OUT, t.key + '.json');
  if (!force && fs.existsSync(file)) { have.push(t.key); skipped++; continue; }
  const title = t.name.replace(/[\[(][^\])]*[\])]/g, ' ').replace(/\s+/g, ' ').trim() || t.name;
  let res = null;
  try {
    res = pickLyrics(await lrclib({ track_name: title, artist_name: t.artist }), t);
    await sleep(DELAY);
    if (!res) {
      res = pickLyrics(await lrclib({ q: (title + ' ' + t.artist).trim() }), t);
      await sleep(DELAY);
    }
  } catch (e) {
    failed++;
    console.log('ERR ', t.key, t.name, e.message);
    await sleep(1000);
    continue;
  }
  if (res) {
    fs.writeFileSync(file, JSON.stringify(res));
    have.push(t.key);
    found++;
    console.log('ok  ', t.key, '-', t.name, res.synced ? '(synced)' : '(plain)');
  } else {
    missed++;
  }
}

have.sort();
fs.writeFileSync(INDEX, JSON.stringify(have));
const bytes = have.reduce((s, k) => { try { return s + fs.statSync(path.join(OUT, k + '.json')).size; } catch (e) { return s; } }, 0);
console.log('\nfound', found, '| already had', skipped, '| no lyrics', missed, '| errors', failed);
console.log('index entries', have.length, '| total', (bytes / 1024).toFixed(0), 'KB');
