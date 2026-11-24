
import { groupVersions } from './versions.js';
import { loadTracker, attachTracker } from './tracker.js';

const R2 = 'https://YOUR-R2-PUBLIC-BUCKET.r2.dev';
const AUDIO_RE = /\.(mp3|m4a|aac|wav|flac|ogg|opus|wma|aiff)$/i;

export const ARTISTS = [
  { key: 'chandol',    label: 'chandol',    json: 'chandol.json',    folder: 'artists/chandol',    defaultArtist: 'chandol' },
  { key: 'boywithuke', label: 'BoyWithUke', json: 'boywithuke.json', folder: 'artists/boywithuke', defaultArtist: 'BoyWithUke' },
];

function fileUrl(file, base) {
  const raw = String(file || '').trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  return base + '/' + raw.replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/');
}

function upgrade(url, folder, base) {
  if (!url || url.indexOf(base + '/') !== 0) return url;
  const rest = url.slice(base.length + 1);
  if (!rest || /[\/?#]/.test(rest)) return url;
  let name = rest;
  try { name = decodeURIComponent(rest); } catch (e) {}
  return base + '/' + folder + '/' + (AUDIO_RE.test(name) ? 'songs' : 'covers') + '/' + rest;
}

function toTrack(s, i, artist, base) {
  const file = s.file || s.url || s.path;
  if (!file) return null;
  const guess = String(s.file || '').replace(/(^|\/)songs\//, '$1covers/').replace(/\.[^.\/]+$/, '') + '.jpg';
  const dur = Number(s.dur);
  return {
    id: s.id != null ? s.id : i,
    name: s.title || s.name || 'Untitled',
    artist: s.artist || artist.defaultArtist,
    artistKey: artist.key,
    status: typeof s.status === 'string' ? s.status.trim() : '',
    era: typeof s.era === 'string' ? s.era.trim() : '',
    url: upgrade(fileUrl(file, base), artist.folder, base),
    cover: upgrade(fileUrl(s.cover !== undefined ? s.cover : guess, base), artist.folder, base),
    dur: dur > 0 ? dur : 0
  };
}

function getList(base, artist) {
  return fetch(base + '/' + artist.json, { cache: 'no-cache' })
    .then((res) => { if (!res.ok) throw new Error('HTTP ' + res.status); return res.json(); });
}

function fetchArtist(artist) {
  return getList(R2, artist)
    .then((data) => {
      const base = R2;
      const list = Array.isArray(data) ? data : (data && Array.isArray(data.songs) ? data.songs : []);
      return list.map((s, i) => (s ? toTrack(s, i, artist, base) : null)).filter(Boolean);
    });
}

function fetchMeta() {
  return fetch('data/released-meta.json', { cache: 'no-cache' })
    .then((res) => (res.ok ? res.json() : {}))
    .catch(() => ({}));
}

function attachMeta(t, m) {
  if (!m || !m.found) return;
  t.meta = {
    album: m.album || '',
    albumType: m.albumType || '',
    releaseDate: m.releaseDate || '',
    albumReleaseDate: m.albumReleaseDate || '',
    trackNumber: m.trackNumber || null,
    trackCount: m.trackCount || null,
    discNumber: m.discNumber || null,
    genre: m.genre || '',
    link: m.link || '',
    artwork: m.artwork || '',
    appearsOn: Array.isArray(m.appearsOn) ? m.appearsOn : [],
  };
  if (m.explicit) t.explicit = true;
  t.year = (m.releaseDate || m.albumReleaseDate || '').slice(0, 4);
}

export function fetchTracks() {
  return Promise.all([Promise.allSettled(ARTISTS.map(fetchArtist)), fetchMeta(), loadTracker()]).then(([results, meta]) => {
    const tracks = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
    const failed = results.find((r) => r.status === 'rejected');
    if (failed && !tracks.length) throw failed.reason;
    tracks.forEach((t) => attachMeta(t, meta[t.artistKey + ':' + t.id]));
    attachTracker(tracks);
    groupVersions(tracks);
    return tracks;
  });
}

const QUALITY_FLAG = { 'Low Quality': 'LQ', Recording: 'Recording', Abysmal: 'Rough' };
const SHORT_SECS = 45;

export function tagsFor(t) {
  if (t.juice) return (t.tags && t.tags.length) ? t.tags : ['Vault'];
  const out = [];
  const tk = t.tk || null;
  const name = String(t.name || '').toLowerCase();
  const type = tk ? String(tk.type || '').trim() : '';
  const portion = tk ? String(tk.portion || '').trim() : '';

  if (t.status && /old version/i.test(t.status)) out.push('Old version');

  if (type === 'Instrumental' || /\(inst\b|\binstrumental\b/.test(name)) out.push('Instrumental');
  else if (type === 'Acapella' || /\bacapella\b/.test(name)) out.push('Acapella');
  if (type === 'Live' || /\(live\b|live performance/.test(name)) out.push('Live');
  if (type === 'Remix' || type === 'Rem') out.push('Remix');
  if (/\bcover\)?$|\(.*cover\)/.test(name)) out.push('Cover');

  if (portion === 'Snippet') out.push('Snippet');
  else if (portion === 'Partial') out.push('Partial');
  else if (portion === 'Beat Only') out.push('Beat only');
  else if (portion === 'Stem Bounce') out.push('Stems');
  else if (!t.meta && t.dur > 0 && t.dur < SHORT_SECS) out.push('Snippet');
  else if (portion === 'Full' || portion === 'OG File' || type === 'OG File') out.push('Full');

  if (type === 'Throwaway') out.push('Throwaway');

  const q = tk ? QUALITY_FLAG[String(tk.quality || '').trim()] : '';
  if (q) out.push(q);

  if (!out.length) out.push(t.status || 'Unreleased');
  return out.filter((v, i, a) => a.indexOf(v) === i);
}

export const primaryTag = (t) => (t.meta ? '' : tagsFor(t)[0] || '');

export function subline(t) {
  if (t.juice) return [t.artist, t.era].filter(Boolean).join(' \u00b7 ');
  if (t.meta && t.meta.album) {
    const album = t.meta.albumType === 'Single' ? t.meta.album + ' (Single)' : t.meta.album;
    return [t.artist, album, t.year].filter(Boolean).join(' · ');
  }
  return [t.artist].concat(tagsFor(t).slice(0, 3)).join(' · ');
}

export function explicitBadge(t) {
  if (!t.explicit) return null;
  const b = document.createElement('span');
  b.className = 'ebadge';
  b.textContent = 'E';
  b.title = 'Explicit';
  b.setAttribute('aria-label', 'Explicit');
  return b;
}
