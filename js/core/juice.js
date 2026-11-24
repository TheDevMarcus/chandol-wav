import { state, emit } from './state.js';
import { go, path } from './router.js';

const PROXY = 'https://YOUR-JUICE-BACKEND.example.com';
const API = PROXY + '/api';
const CHUNK = 300;
const SEARCH_LIMIT = 30;
const K_ON = 'chandol-juice';
const OFF_LIMITS = /^\/(albums|album\/|tracker|missing|about)/;
const TAG_MASTER = /[\[({][^\])}]*\bmaster\b/i;
const TAG_RAW = /[\[({][^\])}]*\braw\b/i;
const TAG_INST = /[\[({][^\])}]*\binstrumentals?\b/i;
const TAG_SESSION = /[\[({][^\])}]*\bsessions?\b/i;
const TAG_STEM = /[\[({][^\])}]*\bstems?\b/i;
const TAG_REMASTER = /[\[({][^\])}]*\bremaster/i;
const TAG_LIVE = /[\[({][^\])}]*\blive\b/i;
const TAG_SNIPPET = /[\[({][^\])}]*\bsnippet\b/i;
const TAG_REF = /[\[({][^\])}]*\breference\b/i;
const TAG_VER = /[\[({]\s*v\d+(\.\d+)?\s*[\])}]/i;
const TAG_REMIX = /[\[({][^\])}]*\bremix\b/i;
const SHORT = 45;
let rawIds = new Set();
let instIds = new Set();

const shuffle = (a) => {
  const out = a.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const k = Math.floor(Math.random() * (i + 1));
    const t = out[i]; out[i] = out[k]; out[k] = t;
  }
  return out;
};

let on = false;
let juiceTracks = null;
const byId = new Map();
let saved = null;
let loading = false;
let pending = [];
let total = 0;
let fetching = false;
let scrollWired = false;

export const juiceTotal = () => total;

export const juiceOn = () => on;

const save = (v) => { try { localStorage.setItem(K_ON, v ? '1' : '0'); } catch (e) {} };
const wanted = () => { try { return localStorage.getItem(K_ON) === '1'; } catch (e) { return false; } };

export const juiceWanted = () => wanted();

function parseLen(v) {
  const m = String(v || '').match(/^(\d+):(\d+)$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
}

function metaOf(s) {
  const m = s.source_metadata;
  if (!m) return null;
  if (typeof m === 'string') { try { return JSON.parse(m); } catch (e) { return null; } }
  return typeof m === 'object' ? m : null;
}

function subOf(s) {
  const m = metaOf(s);
  if (!m) return '';
  return String(m.subCategory || m.sub_category || m.subcategory || '').trim().toLowerCase();
}

function statusOf(s) {
  const c = String(s.source_category || '').trim().toLowerCase();
  if (c === 'released') return 'Released';
  if (c === 'unreleased' || c === 'recording_session' || c === 'remasters') return 'Unreleased';
  return '';
}

function tagsOf(s, name, sub, status, dur) {
  const out = [];
  const known = (re) => re.test(name);
  const cat = String(s.source_category || '').toLowerCase();
  if (sub === 'instrumentals' || sub === 'instrumental' || known(TAG_INST) || instIds.has(String(s.id))) out.push('Instrumental');
  if (sub.indexOf('raw') === 0 || known(TAG_RAW) || rawIds.has(String(s.id))) out.push('Raw');
  if (sub.indexOf('live') === 0 || known(TAG_LIVE)) out.push('Live');
  if (sub === 'masters' || known(TAG_MASTER)) out.push('Master');
  if (known(TAG_REMASTER)) out.push('Remaster');
  if (cat === 'recording_session' || sub.indexOf('session') === 0 || known(TAG_SESSION)) out.push('Session');
  if (sub.indexOf('stem') === 0 || known(TAG_STEM)) out.push('Stems');
  if (cat === 'miscellaneous') out.push('Misc');
  if (known(TAG_REMIX)) out.push('Remix');
  if (known(TAG_REF)) out.push('Reference');
  if (known(TAG_SNIPPET) || (dur > 0 && dur < SHORT)) out.push('Snippet');
  if (known(TAG_VER)) out.push('Alt version');
  if (status) out.push(status);
  return out.filter((v, i, a) => a.indexOf(v) === i);
}

function toTrack(s) {
  const name = s.title || 'Untitled';
  const secs = Number(s.duration_seconds);
  const dur = secs > 0 ? secs : parseLen(s.length);
  const sub = subOf(s);
  const status = statusOf(s);
  const meta = metaOf(s);
  return {
    id: 'j' + s.id,
    name: name,
    artist: s.author || 'Juice WRLD',
    artistKey: 'juice',
    juice: true,
    status: status,
    era: String(s.era || (meta && meta.era) || ''),
    live: sub.indexOf('live') === 0 || TAG_LIVE.test(name),
    tags: tagsOf(s, name, sub, status, dur),
    url: s.audioUrl || (API + '/download-song?id=' + encodeURIComponent(s.id)),
    cover: s.coverUrl || '',
    dur: dur,
  };
}

function keep(list) {
  const fresh = [];
  const out = list.map((t) => {
    const have = byId.get(t.id);
    if (have) return have;
    byId.set(t.id, t);
    fresh.push(t);
    return t;
  });
  if (fresh.length) {
    if (juiceTracks) juiceTracks = juiceTracks.concat(fresh);
    if (on) state.tracks = state.tracks.concat(fresh);
  }
  return out;
}

async function fetchChunk(ids) {
  const res = await fetch(API + '/player/queue-songs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  }).then((r) => r.json());
  return (res.songs || []).filter((s) => s && s.id != null).map(toTrack);
}

async function load() {
  const pool = await fetch(API + '/songs/shuffle-pool', { cache: 'no-store' }).then((r) => r.json());
  rawIds = new Set((pool.rawIds || []).map(String));
  instIds = new Set((pool.instrumentalIds || []).map(String));
  const ids = shuffle(pool.ids || []);
  if (!ids.length) throw new Error('no ids');
  total = ids.length;
  pending = ids.slice(CHUNK);
  const list = await fetchChunk(ids.slice(0, CHUNK));
  list.forEach((t) => { if (!byId.has(t.id)) byId.set(t.id, t); });
  return list;
}

export async function loadMoreJuice() {
  if (!on || fetching || !pending.length) return;
  fetching = true;
  try {
    const next = pending.slice(0, CHUNK);
    pending = pending.slice(CHUNK);
    const list = await fetchChunk(next);
    if (!on) return;
    const before = state.tracks.length;
    keep(list);
    if (state.tracks.length !== before) emit('librarysettings');
  } catch (e) {
  } finally {
    fetching = false;
  }
}

function onScroll() {
  if (!on || fetching || !pending.length) return;
  const doc = document.documentElement;
  const left = doc.scrollHeight - window.innerHeight - (window.scrollY || doc.scrollTop || 0);
  if (left < 1200) loadMoreJuice();
}

export function vaultLyrics(id) {
  const n = String(id || '').replace(/^j/, '');
  if (!n) return Promise.resolve(null);
  return fetch(API + '/lyrics?id=' + encodeURIComponent(n))
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      const text = d && typeof d.lyrics === 'string' ? d.lyrics.trim() : '';
      if (!text) return null;
      return /\[\d+:\d+/.test(text) ? { synced: text } : { plain: text };
    })
    .catch(() => null);
}

export async function searchJuice(q, signal) {
  const params = new URLSearchParams({ q: q, limit: String(SEARCH_LIMIT), offset: '0' });
  const res = await fetch(API + '/search/songs?' + params.toString(), { signal }).then((r) => r.json());
  const list = (res.songs || []).filter((s) => s && s.id != null).map(toTrack);
  return keep(list);
}

function brand(j) {
  document.documentElement.classList.toggle('juice', j);
  const logo = document.querySelector('.logo');
  if (logo) logo.innerHTML = j ? 'juice<span>.wav</span>' : 'chandol<span>.wav</span>';
  const mark = document.querySelector('.mark');
  if (mark) {
    mark.setAttribute('aria-label', (j ? 'juice.wav' : 'chandol.wav') + ', home');
    const img = mark.querySelector('img');
    if (img) img.src = j ? 'img/juice.png' : 'img/logo.png';
  }
  document.title = j
    ? 'juice.wav'
    : 'chandol.wav | every chandol & BoyWithUke song, released and unreleased';
}

function paint() {
  setTimeout(() => emit('glowsettings'), 0);
  brand(on);
}

export function bootJuice() {
  if (!wanted()) return false;
  brand(true);
  if (OFF_LIMITS.test(path())) go('/tracks');
  return true;
}

async function enable() {
  if (!juiceTracks) juiceTracks = await load();
  if (!juiceTracks.length) return false;
  saved = state.tracks;
  state.tracks = shuffle(juiceTracks);
  on = true;
  if (OFF_LIMITS.test(path())) go('/tracks');
  if (!scrollWired) {
    scrollWired = true;
    window.addEventListener('scroll', onScroll, { passive: true });
  }
  paint();
  emit('librarysettings');
  return true;
}

export async function toggleJuice() {
  if (loading) return;
  if (on) {
    on = false;
    save(false);
    if (saved) state.tracks = saved;
    paint();
    emit('librarysettings');
    return;
  }
  loading = true;
  try {
    if (await enable()) save(true);
  } catch (e) {
    on = false;
  } finally {
    loading = false;
  }
}

export async function restoreJuice() {
  if (on || loading || !wanted()) return;
  loading = true;
  try {
    if (!(await enable())) { save(false); paint(); emit('librarysettings'); }
  } catch (e) {
    on = false;
    paint();
    emit('librarysettings');
  } finally {
    loading = false;
  }
}
