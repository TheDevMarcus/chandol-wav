import fs from 'fs';
import path from 'path';
import { songSlugs } from '../js/core/slugs.js';

const SITE = 'https://chandolwav.pages.dev';
const R2 = 'https://YOUR-R2-PUBLIC-BUCKET.r2.dev';
const ARTISTS = [
  { key: 'chandol', json: 'chandol.json', name: 'chandol' },
  { key: 'boywithuke', json: 'boywithuke.json', name: 'BoyWithUke' },
];
const out = process.argv[2];
if (!out) throw new Error('usage: build-song-pages.mjs <output dir>');
const here = path.dirname(new URL(import.meta.url).pathname);
const meta = JSON.parse(fs.readFileSync(path.join(here, '../data/released-meta.json'), 'utf8'));

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fileUrl = (p) => (/^https?:/.test(p) ? p : R2 + '/' + String(p).replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/'));

const tracks = [];
for (const a of ARTISTS) {
  const res = await fetch(R2 + '/' + a.json, { cache: 'no-store' });
  if (!res.ok) throw new Error(a.json + ' HTTP ' + res.status);
  const data = await res.json();
  (Array.isArray(data) ? data : data.songs || []).forEach((s, i) => {
    if (!s || !(s.file || s.url || s.path)) return;
    tracks.push({ name: s.title || s.name || 'Untitled', artist: s.artist || a.name, artistKey: a.key, id: s.id != null ? s.id : i,
      era: (s.era || '').trim(), status: (s.status || '').trim(), cover: s.cover ? fileUrl(s.cover) : '' });
  });
}
const slugs = songSlugs(tracks);
const dir = path.join(out, 'song');
fs.rmSync(dir, { recursive: true, force: true });

for (const t of tracks) {
  const slug = slugs.get(t);
  const m = meta[t.artistKey + ':' + t.id];
  const rel = m && m.found;
  const year = rel ? (m.releaseDate || '').slice(0, 4) : '';
  const bits = [t.artist, rel ? m.album + (year ? ' (' + year + ')' : '') : (t.era ? t.era + ' era' : ''), rel ? '' : (t.status || 'Unreleased')].filter(Boolean);
  const desc = bits.join(' · ') + ' – listen on chandol.wav';
  const page = SITE + '/song/' + slug + '/';
  const target = '/?song=' + encodeURIComponent(slug);
  const img = (rel && m.artwork) || t.cover || SITE + '/img/og.jpg?v=2';
  const embed = { component: { type: 17, accent_color: 0xeaa9f0, components: [
    { type: 9, components: [{ type: 10, content: '### ' + t.name + '\n' + bits.join(' · ') }], accessory: { type: 11, media: { url: img } } },
    { type: 1, components: [{ type: 2, style: 5, label: 'Listen on chandol.wav', emoji: { name: '🎧' }, url: page }] },
  ] } };
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(t.name)} – ${esc(t.artist)} | chandol.wav</title>
<meta name="description" content="${esc(desc)}">
<meta name="theme-color" content="#eaa9f0">
<link rel="icon" type="image/png" href="/img/logo.png">
<meta property="og:type" content="music.song">
<meta property="og:site_name" content="chandol.wav">
<meta property="og:url" content="${page}">
<meta property="og:title" content="${esc(t.name)} – ${esc(t.artist)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(img)}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${esc(t.name)} – ${esc(t.artist)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(img)}">
<script id="discord:component-embed" type="application/json">${JSON.stringify(embed).replace(/</g, '\\u003c')}</script>
<meta http-equiv="refresh" content="0; url=${target}">
<script>location.replace(${JSON.stringify(target)});</script>
<style>body{background:#04040a;color:#f3f3f7;font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0}a{color:#eaa9f0}</style>
</head>
<body><p>Opening <a href="${target}">${esc(t.name)}</a> on chandol.wav…</p></body>
</html>
`;
  fs.mkdirSync(path.join(dir, slug), { recursive: true });
  fs.writeFileSync(path.join(dir, slug, 'index.html'), html);
}
console.log('song pages:', tracks.length, '->', dir);
