import { state, on } from '../core/state.js';
import { songSlugs } from '../core/slugs.js';
import { toast } from './toast.js';
import { openInfo } from './info.js';

const SITE = 'https://chandolwav.pages.dev';
let slugs = null, builtFor = null, pending = '';

function map() {
  if (builtFor !== state.tracks) { slugs = songSlugs(state.tracks); builtFor = state.tracks; }
  return slugs;
}

export function songUrl(t) {
  return SITE + '/song/' + map().get(t) + '/';
}

export function shareSong(t) {
  if (!t) return;
  const url = songUrl(t);
  const title = t.name + ' – ' + t.artist;
  const touch = matchMedia('(pointer: coarse)').matches;
  if (touch && navigator.share) {
    navigator.share({ title, url }).catch(() => {});
    return;
  }
  const done = () => toast('Link copied – paste it anywhere');
  if (navigator.clipboard) navigator.clipboard.writeText(url).then(done).catch(() => prompt('Copy this link:', url));
  else prompt('Copy this link:', url);
}

function findBySlug(s) {
  for (const [t, v] of map()) if (v === s) return t;
  return null;
}

function openPending() {
  if (!pending || !state.tracks.length) return;
  const t = findBySlug(pending);
  pending = '';
  history.replaceState(null, '', location.pathname + location.search);
  if (t) setTimeout(() => openInfo(t), 250);
  else toast('That song isn’t here anymore');
}

export function songFromUrl() {
  const s = new URLSearchParams(location.search).get('song');
  if (!s) return false;
  pending = decodeURIComponent(s).replace(/\/$/, '');
  openPending();
  return true;
}

export function initShare() {
  on('rendered', openPending);
}
