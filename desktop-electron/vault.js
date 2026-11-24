const WORKER = 'https://chandolwav-radio.codename1121111.workers.dev';
const TTL_MS = 10 * 60 * 1000;

let cfg = null;
let cfgAt = 0;

async function config() {
  if (cfg && Date.now() - cfgAt < TTL_MS) return cfg;
  const r = await fetch(WORKER + '/vault/config', { headers: { 'x-chandol-app': '1' } });
  const d = await r.json();
  if (!d || !d.api) throw new Error('no vault config');
  cfg = d;
  cfgAt = Date.now();
  return cfg;
}

function encPath(p) {
  return String(p).split('/').filter(Boolean).map((seg) => {
    try { return encodeURIComponent(decodeURIComponent(seg)); } catch (e) { return encodeURIComponent(seg); }
  }).join('/');
}

function decorate(song, c) {
  if (!song || typeof song !== 'object') return song;
  let audioUrl = null;
  const sp = song.song_path;
  if (sp) {
    if (/^https?:\/\//i.test(sp)) audioUrl = sp;
    else {
      let p = String(sp).replace(/^\/+/, '');
      if (!p.startsWith('songs/')) p = 'songs/' + p;
      audioUrl = c.media + '/' + encPath(p);
    }
  } else if (song.id != null) {
    audioUrl = c.api + '/download-song?id=' + encodeURIComponent(song.id);
  }
  let coverUrl = null;
  const ip = song.image_path;
  if (ip) coverUrl = /^https?:\/\//i.test(ip) ? ip : c.media + '/images/' + encPath(ip);
  return Object.assign({}, song, { audioUrl, coverUrl });
}

function decorateList(data, c) {
  return data && Array.isArray(data.songs) ? Object.assign({}, data, { songs: data.songs.map((s) => decorate(s, c)) }) : data;
}

async function get(path) {
  const c = await config();
  const r = await fetch(c.api + String(path || ''));
  return decorateList(await r.json(), c);
}

async function post(path, body) {
  const c = await config();
  const r = await fetch(c.api + String(path || ''), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body || {})
  });
  return decorateList(await r.json(), c);
}

async function lyrics(id) {
  const r = await fetch(WORKER + '/vault/lyrics?id=' + encodeURIComponent(String(id || '')), { headers: { 'x-chandol-app': '1' } });
  return r.json();
}

async function stream(u, req, res) {
  try {
    const c = await config();
    const rel = u.searchParams.get('p');
    const abs = u.searchParams.get('u');
    let target = '';
    if (rel) target = c.api + rel;
    else if (abs && ((c.media && abs.startsWith(c.media)) || abs.startsWith(c.api))) target = abs;
    if (!target) { res.writeHead(403); return res.end('no'); }
    const headers = {};
    if (req.headers.range) headers.range = req.headers.range;
    const up = await fetch(target, { headers });
    const out = {};
    for (const k of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'cache-control']) {
      const v = up.headers.get(k);
      if (v) out[k] = v;
    }
    res.writeHead(up.status, out);
    if (!up.body) return res.end();
    const reader = up.body.getReader();
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      if (!res.write(Buffer.from(chunk.value))) {
        await new Promise((r2) => res.once('drain', r2));
      }
    }
    res.end();
  } catch (e) {
    try { res.writeHead(502); res.end('vault error'); } catch (e2) {}
  }
}

module.exports = { get, post, lyrics, stream };
