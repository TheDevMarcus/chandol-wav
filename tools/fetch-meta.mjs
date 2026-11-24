#!/usr/bin/env node

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'data');
const OUT_JSON = join(OUT_DIR, 'released-meta.json');
const OUT_CSV = join(OUT_DIR, 'released-meta.csv');
const catPath = (key) => join(OUT_DIR, `itunes-catalog-${key}.json`);

const BASE = 'https://YOUR-R2-PUBLIC-BUCKET.r2.dev';
const ARTISTS = [
  { key: 'chandol', json: 'chandol.json', name: 'chandol', names: ['chandol'], itunesId: 1779133611 },
  { key: 'boywithuke', json: 'boywithuke.json', name: 'BoyWithUke', names: ['boywithuke', 'boy with uke'], itunesId: 1546517368 },
];

const ITUNES_GAP_MS = 3200;
const DEEZER_GAP_MS = 250;
const FRESH = process.argv.includes('--fresh');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => String(s || '').toLowerCase()
  .replace(/[\[(][^\])]*[\])]/g, ' ')
  .replace(/\s-\s.*$/, ' ')
  .normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '').trim();
const normFull = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '');

const isReleased = (s, a) => {
  const st = String(s.status || '').trim().toLowerCase();
  return st === 'released' || (a.key === 'chandol' && !st);
};

let lastItunes = 0;
async function itunes(path, params) {
  const wait = lastItunes + ITUNES_GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastItunes = Date.now();
  return getJSON(`https://itunes.apple.com/${path}?` + new URLSearchParams({ country: 'US', ...params }));
}

async function getJSON(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'chandol.wav-meta/1.0' } });
      if (res.status === 403 || res.status === 429 || res.status >= 500) {
        const wait = 20000 * (i + 1);
        console.log(`   rate-limited (${res.status}), waiting ${wait / 1000}s...`);
        await sleep(wait); continue;
      }
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } catch (e) {
      if (i === tries - 1) throw e;
      await sleep(3000 * (i + 1));
    }
  }
}

const artistMatches = (found, a) => a.names.some((n) => normFull(found).includes(normFull(n)));
const kindOf = (name, count) =>
  / - single$/i.test(name) || count === 1 ? 'Single' : / - ep$/i.test(name) || count <= 6 ? 'EP' : 'Album';
const kindRank = { Album: 0, EP: 1, Single: 2 };
const cleanAlbum = (n) => String(n || '').replace(/ - (Single|EP)$/i, '');

async function loadCatalog(a) {
  if (!FRESH) {
    try {
      const c = JSON.parse(await readFile(catPath(a.key), 'utf8'));
      console.log(`${a.name}: using saved catalog (${c.tracks.length} tracks, ${c.fetchedAt.slice(0, 10)})`);
      return c.tracks;
    } catch {}
  }
  let id = a.itunesId;
  if (!id) {
    const r = await itunes('search', { term: a.name, entity: 'musicArtist', limit: '5' });
    const hit = (r.results || []).find((x) => artistMatches(x.artistName, a));
    if (!hit) { console.log(`${a.name}: not on iTunes`); return []; }
    id = hit.artistId;
  }
  const albumsRes = await itunes('lookup', { id: String(id), entity: 'album', limit: '200' });
  const albums = (albumsRes.results || []).filter((x) => x.wrapperType === 'collection');
  console.log(`${a.name}: ${albums.length} releases on iTunes, downloading track lists...`);

  const tracks = new Map();
  for (let i = 0; i < albums.length; i++) {
    const al = albums[i];
    process.stdout.write(`   [${i + 1}/${albums.length}] ${al.collectionName}\n`);
    try {
      const res = await itunes('lookup', { id: String(al.collectionId), entity: 'song', limit: '200' });
      (res.results || []).filter((x) => x.wrapperType === 'track' && x.kind === 'song').forEach((t) => {
        const prev = tracks.get(t.trackId);
        if (!prev) tracks.set(t.trackId, { ...t, albumDate: (al.releaseDate || '').slice(0, 10) });
      });
    } catch (e) { console.log(`     skipped: ${e.message}`); }
  }
  const list = [...tracks.values()];
  await writeFile(catPath(a.key), JSON.stringify({ artistId: id, fetchedAt: new Date().toISOString(), tracks: list }, null, 1));
  console.log(`${a.name}: saved ${list.length} tracks\n`);
  return list;
}

function matchItunes(song, a, catalog) {
  const want = norm(song.title), wantFull = normFull(song.title);
  if (!want) return null;
  const scored = catalog
    .filter((t) => artistMatches(t.artistName, a) || artistMatches(t.collectionArtistName, a))
    .map((t) => {
      const full = normFull(t.trackName), short = norm(t.trackName);
      let s = 0;
      if (full === wantFull) s = 100;
      else if (short === want) s = 90;
      else if (short.startsWith(want) || want.startsWith(short)) s = 60;
      return { t, s };
    })
    .filter((x) => x.s >= 60 && x.t.trackName);
  if (!scored.length) return null;
  const best = Math.max(...scored.map((x) => x.s));
  const releases = scored.filter((x) => x.s === best).map(({ t }) => ({
    t, album: cleanAlbum(t.collectionName), type: kindOf(t.collectionName, t.trackCount),
    date: t.albumDate || (t.releaseDate || '').slice(0, 10),
    trackDate: (t.releaseDate || '').slice(0, 10),
  }));
  releases.sort((x, y) => kindRank[x.type] - kindRank[y.type] || x.date.localeCompare(y.date));
  const main = releases[0];
  const firstOut = releases.map((x) => x.trackDate || x.date).filter(Boolean).sort()[0] || main.date;
  return {
    source: 'iTunes',
    matchedTitle: main.t.trackName,
    matchedArtist: main.t.artistName,
    album: main.album,
    albumType: main.type,
    releaseDate: firstOut,
    albumReleaseDate: main.date,
    trackNumber: main.t.trackNumber || null,
    trackCount: main.t.trackCount || null,
    discNumber: main.t.discNumber || null,
    genre: main.t.primaryGenreName || '',
    explicit: main.t.trackExplicitness === 'explicit',
    durationSec: main.t.trackTimeMillis ? Math.round(main.t.trackTimeMillis / 1000) : null,
    artwork: (main.t.artworkUrl100 || '').replace('100x100bb', '1000x1000bb'),
    link: main.t.trackViewUrl || '',
    appearsOn: [...new Map(releases.map((x) => [x.album + '|' + x.type, { album: x.album, type: x.type, date: x.date }])).values()],
    confidence: best >= 90 ? 'exact' : 'close',
  };
}

async function fromDeezer(song, a) {
  const q = `artist:"${a.name}" track:"${song.title.replace(/[\[(][^\])]*[\])]/g, ' ').trim()}"`;
  const data = await getJSON('https://api.deezer.com/search?' + new URLSearchParams({ q, limit: '25' }));
  const want = norm(song.title);
  const hits = (data.data || [])
    .filter((r) => artistMatches(r.artist && r.artist.name, a))
    .map((r) => ({ r, s: normFull(r.title) === normFull(song.title) ? 100 : norm(r.title) === want ? 90 : norm(r.title).startsWith(want) ? 60 : 0 }))
    .filter((x) => x.s >= 60)
    .sort((x, y) => y.s - x.s);
  if (!hits.length) return null;
  const { r, s } = hits[0];
  await sleep(DEEZER_GAP_MS);
  const album = r.album && r.album.id ? await getJSON('https://api.deezer.com/album/' + r.album.id).catch(() => null) : null;
  const rt = album && album.record_type ? album.record_type : '';
  return {
    source: 'Deezer',
    matchedTitle: r.title,
    matchedArtist: r.artist.name,
    album: album ? album.title : (r.album && r.album.title) || '',
    albumType: rt === 'ep' ? 'EP' : rt ? rt[0].toUpperCase() + rt.slice(1) : '',
    releaseDate: album ? album.release_date : '',
    albumReleaseDate: album ? album.release_date : '',
    trackNumber: null,
    trackCount: album ? album.nb_tracks : null,
    discNumber: null,
    genre: album && album.genres && album.genres.data[0] ? album.genres.data[0].name : '',
    explicit: !!r.explicit_lyrics,
    durationSec: r.duration || null,
    artwork: (album && album.cover_xl) || '',
    link: r.link || '',
    appearsOn: [],
    label: album ? album.label || '' : '',
    confidence: s >= 90 ? 'exact' : 'close',
  };
}

function toCsv(rows) {
  const cols = ['artist', 'title', 'era', 'found', 'source', 'confidence', 'album', 'albumType', 'releaseDate',
    'albumReleaseDate', 'trackNumber', 'trackCount', 'genre', 'explicit', 'durationSec', 'matchedTitle', 'link'];
  const esc = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n') + '\n';
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const songs = [];
  const catalogs = {};
  for (const a of ARTISTS) {
    const data = await getJSON(BASE + '/' + a.json);
    const list = Array.isArray(data) ? data : data.songs || [];
    list.filter((s) => s && s.title && isReleased(s, a)).forEach((s) => songs.push({ s, a }));
    catalogs[a.key] = await loadCatalog(a);
  }
  console.log(`Matching ${songs.length} released songs...\n`);

  const out = {};
  const viaDeezer = [];
  for (const { s, a } of songs) {
    const key = `${a.key}:${s.id}`;
    const base = { artistKey: a.key, id: s.id, artist: s.artist || a.name, title: s.title, era: s.era || '' };
    let info = matchItunes(s, a, catalogs[a.key]);
    if (!info) {
      try { info = await fromDeezer(s, a); } catch (e) { console.log(`   Deezer error on ${s.title}: ${e.message}`); }
      await sleep(DEEZER_GAP_MS);
      if (info) viaDeezer.push(s.title);
    }
    out[key] = { ...base, found: !!info, ...(info || {}), checkedAt: new Date().toISOString() };
  }

  await writeFile(OUT_JSON, JSON.stringify(out, null, 2));
  const rows = Object.values(out).sort((x, y) => x.artist.localeCompare(y.artist) || (x.releaseDate || '9').localeCompare(y.releaseDate || '9') || (x.trackNumber || 0) - (y.trackNumber || 0));
  await writeFile(OUT_CSV, toCsv(rows));

  const found = rows.filter((r) => r.found);
  console.log(`Found ${found.length}/${rows.length}` + (viaDeezer.length ? ` (${viaDeezer.length} via Deezer)` : ''));
  const byAlbum = {};
  found.forEach((r) => { const k = `${r.artist} - ${r.album} (${r.albumType}, ${r.albumReleaseDate})`; byAlbum[k] = (byAlbum[k] || 0) + 1; });
  console.log('\nBy release:\n' + Object.entries(byAlbum).sort().map(([k, n]) => `  ${k}: ${n}`).join('\n'));
  const close = found.filter((r) => r.confidence === 'close');
  if (close.length) console.log(`\nClose (not exact) matches - worth a glance:\n` + close.map((r) => `  ${r.title}  ->  ${r.matchedTitle} [${r.album}]`).join('\n'));
  const missing = rows.filter((r) => !r.found);
  if (missing.length) console.log(`\nNot found anywhere:\n` + missing.map((r) => `  ${r.artist} - ${r.title}`).join('\n'));
  console.log(`\nSaved data/released-meta.json and data/released-meta.csv`);
}

main().catch((e) => { console.error(e); process.exit(1); });
