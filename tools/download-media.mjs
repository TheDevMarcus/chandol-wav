#!/usr/bin/env node

import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MEDIA = join(ROOT, '..', 'chandol-songs-backup');
const BASE = 'https://YOUR-R2-PUBLIC-BUCKET.r2.dev';
const ARTISTS = [
  { json: 'chandol.json', folder: 'artists/chandol' },
  { json: 'boywithuke.json', folder: 'artists/boywithuke' },
];
const AUDIO_RE = /\.(mp3|m4a|aac|wav|flac|ogg|opus|wma|aiff)$/i;
const PARALLEL = 4;
const CHECK_ONLY = process.argv.includes('--check');

function bucketPath(file, folder) {
  let raw = String(file || '').trim().replace(/^\/+/, '');
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) {
    if (raw.indexOf(BASE + '/') !== 0) return null;
    raw = raw.slice(BASE.length + 1).split('/').map((p) => { try { return decodeURIComponent(p); } catch { return p; } }).join('/');
  }
  if (!raw.includes('/')) raw = folder + '/' + (AUDIO_RE.test(raw) ? 'songs' : 'covers') + '/' + raw;
  return raw;
}
const urlOf = (p) => BASE + '/' + p.split('/').map(encodeURIComponent).join('/');
const mb = (n) => (n / 1e6).toFixed(1) + ' MB';

async function localSize(p) {
  try { return (await stat(join(MEDIA, p))).size; } catch { return -1; }
}

async function download(item) {
  const dest = join(MEDIA, item.path);
  const part = dest + '.part';
  await mkdir(dirname(dest), { recursive: true });
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(urlOf(item.path));
      if (res.status === 404) return 'missing';
      if (!res.ok) throw new Error('HTTP ' + res.status);
      await pipeline(Readable.fromWeb(res.body), createWriteStream(part));
      await rename(part, dest);
      return 'ok';
    } catch (e) {
      await rm(part, { force: true });
      if (attempt === 3) return 'failed: ' + e.message;
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
}

async function main() {
  await mkdir(MEDIA, { recursive: true });
  const items = new Map();

  for (const a of ARTISTS) {
    const res = await fetch(BASE + '/' + a.json, { cache: 'no-store' });
    if (!res.ok) throw new Error(`couldn't get ${a.json}: HTTP ${res.status}`);
    const text = await res.text();
    if (!CHECK_ONLY) await writeFile(join(MEDIA, a.json), text);
    const data = JSON.parse(text);
    const list = Array.isArray(data) ? data : data.songs || [];
    for (const s of list) {
      if (!s) continue;
      const song = bucketPath(s.file || s.url || s.path, a.folder);
      if (song) items.set(song, { path: song, optional: false });
      if (s.cover !== undefined) {
        const c = bucketPath(s.cover, a.folder);
        if (c && !items.has(c)) items.set(c, { path: c, optional: false });
      } else if (s.file) {
        const guess = bucketPath(String(s.file).replace(/(^|\/)songs\//, '$1covers/').replace(/\.[^.\/]+$/, '') + '.jpg', a.folder);
        if (guess && !items.has(guess)) items.set(guess, { path: guess, optional: true });
      }
    }
  }

  const all = [...items.values()];
  console.log(`${all.length} files in the bucket's song lists. Checking what you already have...`);

  const todo = [];
  let haveBytes = 0, needBytes = 0, absent = 0;
  const queue = all.slice();
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (queue.length) {
      const it = queue.shift();
      const head = await fetch(urlOf(it.path), { method: 'HEAD' }).catch(() => null);
      if (!head || !head.ok) { if (!it.optional) absent++; continue; }
      it.size = Number(head.headers.get('content-length') || 0);
      const have = await localSize(it.path);
      if (have >= 0 && (!it.size || have === it.size)) haveBytes += have;
      else { todo.push(it); needBytes += it.size; }
    }
  }));
  console.log(`Already downloaded: ${all.length - todo.length - absent} files (${mb(haveBytes)})`);
  console.log(`To download:        ${todo.length} files (${mb(needBytes)})`);
  if (absent) console.log(`Listed but not in the bucket: ${absent}`);
  if (CHECK_ONLY || !todo.length) { console.log(todo.length ? '\n(--check: nothing downloaded)' : '\nEverything is downloaded.'); return; }

  todo.sort((a, b) => b.size - a.size);
  let done = 0, doneBytes = 0;
  const failed = [];
  const start = Date.now();
  const work = todo.slice();
  await Promise.all(Array.from({ length: PARALLEL }, async () => {
    while (work.length) {
      const it = work.shift();
      const r = await download(it);
      done++;
      if (r === 'ok') doneBytes += it.size;
      else if (r !== 'missing' || !it.optional) failed.push(`${it.path} (${r})`);
      const secs = (Date.now() - start) / 1000;
      const speed = doneBytes / Math.max(secs, 0.1);
      const left = speed ? Math.round((needBytes - doneBytes) / speed) : 0;
      console.log(`[${done}/${todo.length}] ${r === 'ok' ? 'ok ' : '-- '} ${it.path}   ${mb(doneBytes)} / ${mb(needBytes)}  ~${left}s left`);
    }
  }));

  console.log(`\nDone in ${Math.round((Date.now() - start) / 1000)}s: ${mb(doneBytes)} downloaded into ${MEDIA}`);
  if (failed.length) console.log(`\n${failed.length} failed (run again to retry):\n  ` + failed.join('\n  '));
}

main().catch((e) => { console.error(e); process.exit(1); });
