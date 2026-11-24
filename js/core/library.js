
import { state, emit } from './state.js';

const KEY = 'chandol-library';
let lib = { liked: [], playlists: [] };
try {
  const s = JSON.parse(localStorage.getItem(KEY) || 'null');
  if (s && Array.isArray(s.liked) && Array.isArray(s.playlists)) lib = s;
} catch (e) {}
let likedSet = new Set(lib.liked.map((x) => x.k));

function save(silent) {
  if (!silent) lib.updated = Date.now();
  try { localStorage.setItem(KEY, JSON.stringify(lib)); } catch (e) {}
  likedSet = new Set(lib.liked.map((x) => x.k));
  emit('library', silent ? 'sync' : 'local');
}

export function libraryData() {
  return { liked: lib.liked, playlists: lib.playlists, updated: lib.updated || 0 };
}
export function setLibraryData(d) {
  if (!d || !Array.isArray(d.liked) || !Array.isArray(d.playlists)) return;
  lib = { liked: d.liked, playlists: d.playlists, updated: d.updated || Date.now() };
  save(true);
}
export function mergeLibrary(a, b) {
  const liked = new Map();
  [...(a.liked || []), ...(b.liked || [])].forEach((x) => { if (x && x.k && (!liked.has(x.k) || (x.at || 0) > (liked.get(x.k).at || 0))) liked.set(x.k, x); });
  const pls = new Map();
  [...(a.playlists || []), ...(b.playlists || [])].forEach((p) => { if (p && p.id && (!pls.has(p.id) || (p.updated || 0) > (pls.get(p.id).updated || 0))) pls.set(p.id, p); });
  return { liked: [...liked.values()].sort((x, y) => (y.at || 0) - (x.at || 0)), playlists: [...pls.values()], updated: Date.now() };
}

export const keyOf = (t) => t.artistKey + ':' + t.id;

let index = null, indexFor = null;
export function trackByKey(k) {
  if (indexFor !== state.tracks) { index = new Map(state.tracks.map((t) => [keyOf(t), t])); indexFor = state.tracks; }
  return index.get(k) || null;
}
const resolve = (keys) => keys.map(trackByKey).filter(Boolean);

export const isLiked = (t) => !!t && likedSet.has(keyOf(t));
export function toggleLike(t) {
  if (!t) return false;
  const k = keyOf(t);
  if (likedSet.has(k)) lib.liked = lib.liked.filter((x) => x.k !== k);
  else lib.liked.unshift({ k, at: Date.now() });
  save();
  return likedSet.has(k);
}
export const likedTracks = () => resolve(lib.liked.map((x) => x.k));
export const likedCount = () => likedTracks().length;

export const playlists = () => lib.playlists.slice().sort((a, b) => (b.updated || 0) - (a.updated || 0));
export const getPlaylist = (id) => lib.playlists.find((p) => p.id === id) || null;
export const playlistTracks = (p) => (p ? resolve(p.tracks) : []);

export function createPlaylist(name, tracks) {
  const n = String(name || '').trim() || 'My playlist #' + (lib.playlists.length + 1);
  const p = { id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: n.slice(0, 80), tracks: [], created: Date.now(), updated: Date.now() };
  (tracks || []).forEach((t) => { const k = keyOf(t); if (!p.tracks.includes(k)) p.tracks.push(k); });
  lib.playlists.push(p);
  save();
  return p;
}
export function addToPlaylist(id, tracks) {
  const p = getPlaylist(id);
  if (!p) return 0;
  let n = 0;
  [].concat(tracks).forEach((t) => { const k = keyOf(t); if (!p.tracks.includes(k)) { p.tracks.push(k); n++; } });
  if (n) { p.updated = Date.now(); save(); }
  return n;
}
export const inPlaylist = (id, t) => { const p = getPlaylist(id); return !!p && p.tracks.includes(keyOf(t)); };
export function removeFromPlaylist(id, t) {
  const p = getPlaylist(id);
  if (!p) return;
  p.tracks = p.tracks.filter((k) => k !== keyOf(t));
  p.updated = Date.now();
  save();
}
export function movePlaylistTrack(id, from, to) {
  const p = getPlaylist(id);
  if (!p || from === to) return;
  const [k] = p.tracks.splice(from, 1);
  p.tracks.splice(to, 0, k);
  p.updated = Date.now();
  save();
}
export function renamePlaylist(id, name) {
  const p = getPlaylist(id);
  const n = String(name || '').trim();
  if (!p || !n) return;
  p.name = n.slice(0, 80);
  p.updated = Date.now();
  save();
}
export function deletePlaylist(id) {
  lib.playlists = lib.playlists.filter((p) => p.id !== id);
  save();
}
