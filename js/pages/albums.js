
import { $, fmt, el, txt } from '../core/util.js';
import { state, on } from '../core/state.js';
import { play } from '../player/player.js';
import { ARTISTS, explicitBadge } from '../core/data.js';
import { openInfo } from '../ui/info.js';
import { openMenu } from '../ui/menu.js';
import { renderTimeline, loadEras } from './timeline.js';
import { go, path } from '../core/router.js';

const RANK = { Album: 0, EP: 1, Single: 2, Era: 3 };
const PLAY_SVG = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
const SHUF_SVG = '<svg viewBox="0 0 24 24"><path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/></svg>';
const MORE_SVG = '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>';
const INFO_SVG = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>';
const BACK_SVG = '<svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg>';
const LINK_SVG = '<svg viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>';

const slug = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

let builtFor = null;
let albums = [];
const byKey = new Map();
let artistFilter = 'all';
let view = (() => { try { return localStorage.getItem('chandol-albview') || 'shelves'; } catch (e) { return 'shelves'; } })();

export function buildAlbums() {
  if (builtFor === state.tracks) return;
  builtFor = state.tracks;
  byKey.clear();
  const get = (t, name) => {
    const key = t.artistKey + '--' + slug(name);
    let a = byKey.get(key);
    if (!a) {
      a = { key, artistKey: t.artistKey, artist: t.artist, name, type: '', date: '', released: [], unreleased: [], cover: '', artwork: '', link: '' };
      byKey.set(key, a);
    }
    return a;
  };

  state.tracks.forEach((t) => {
    const m = t.meta;
    if (!m || !m.album) return;
    const a = get(t, m.album);
    a.released.push(t);
    if (!a.type || RANK[m.albumType] < RANK[a.type]) a.type = m.albumType || 'Album';
    const d = m.albumReleaseDate || m.releaseDate;
    if (d && d > a.date) a.date = d;
    if (!a.artwork && m.artwork) a.artwork = m.artwork;
    if (!a.link && m.link) a.link = m.link.split('?')[0];
  });
  state.tracks.forEach((t) => {
    if ((t.meta && t.meta.album) || !t.era) return;
    const a = get(t, t.era);
    if (!a.type) a.type = 'Era';
    a.unreleased.push(t);
  });

  albums = [...byKey.values()];
  albums.forEach((a) => {
    a.released.sort((x, y) => (x.meta.discNumber || 1) - (y.meta.discNumber || 1) || (x.meta.trackNumber || 0) - (y.meta.trackNumber || 0));
    a.unreleased.sort((x, y) => x.name.localeCompare(y.name));
    a.tracks = a.released.concat(a.unreleased);
    const first = a.released[0] || a.unreleased[0];
    a.cover = (first && first.cover) || a.artwork;
    a.dur = a.tracks.reduce((s, t) => s + (t.dur || 0), 0);
    a.year = a.date.slice(0, 4);
  });
  const shelf = (a) => (a.type === 'EP' ? RANK.Album : RANK[a.type]);
  albums.sort((x, y) => shelf(x) - shelf(y) || y.date.localeCompare(x.date) || x.name.localeCompare(y.name));
}

export function albumOf(t) {
  buildAlbums();
  const name = (t.meta && t.meta.album) || t.era;
  return name ? byKey.get(t.artistKey + '--' + slug(name)) || null : null;
}

export function playList(list, start, shuffle, name) {
  if (!list.length) return;
  let q = list.slice();
  if (shuffle) {
    for (let i = q.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [q[i], q[j]] = [q[j], q[i]]; }
  }
  state.queue = q;
  state.queueName = name || '';
  state.lastCtx = null;
  const first = start || q[0];
  play(state.tracks.indexOf(first));
}

function coverEl(src, cls) {
  const box = el('span', cls);
  if (src) {
    const img = el('img');
    img.alt = ''; img.loading = 'lazy'; img.decoding = 'async';
    img.onload = () => img.classList.add('loaded');
    img.onerror = () => img.remove();
    img.src = src;
    box.appendChild(img);
  }
  return box;
}
const typeLabel = (a) => (a.type === 'Era' ? 'Era' : a.type);
const mins = (sec) => {
  const m = Math.round(sec / 60);
  return m >= 60 ? Math.floor(m / 60) + ' hr ' + (m % 60) + ' min' : m + ' min';
};

function albumCard(a, i) {
  const li = el('li', 'alb enter');
  li.style.setProperty('--i', String(Math.min(i, 20)));
  const b = el('button', 'albcard');
  b.type = 'button';
  b.title = a.name;
  const art = coverEl(a.cover, 'albart');
  const pb = el('span', 'albplay', PLAY_SVG);
  pb.setAttribute('role', 'button');
  pb.setAttribute('aria-label', 'Play ' + a.name);
  pb.onclick = (e) => { e.stopPropagation(); playList(a.tracks, null, false, a.name); };
  art.appendChild(pb);
  b.appendChild(art);
  b.appendChild(txt('span', 'albname', a.name));
  const bits = [typeLabel(a), a.year].filter(Boolean).join(' · ');
  b.appendChild(txt('span', 'albsub', bits));
  const counts = [];
  if (a.released.length) counts.push(a.released.length + (a.released.length === 1 ? ' song' : ' songs'));
  if (a.unreleased.length) counts.push(a.unreleased.length + ' unreleased');
  b.appendChild(txt('span', 'albcount', counts.join(' · ')));
  b.onclick = () => { go('/album/' + a.key); };
  li.appendChild(b);
  return li;
}

function renderGrid() {
  const root = $('albumsView');
  root.textContent = '';
  if (!state.tracks.length) { root.appendChild(txt('p', 'albempty', 'Loading albums…')); return; }

  const head = el('div', 'albhead');
  head.appendChild(txt('h2', null, 'Albums'));
  const shown = albums.filter((a) => artistFilter === 'all' || a.artistKey === artistFilter);
  const rel = shown.reduce((s, a) => s + a.released.length, 0);
  const unrel = shown.reduce((s, a) => s + a.unreleased.length, 0);
  head.appendChild(txt('span', 'albstat', `${shown.filter((a) => a.type !== 'Era').length} releases · ${rel} released songs · ${unrel} unreleased`));
  root.appendChild(head);

  const pills = el('div', 'af');
  [{ key: 'all', label: 'All' }].concat(ARTISTS).forEach((a) => {
    const p = txt('button', 'afpill' + (artistFilter === a.key ? ' active' : ''), a.label);
    p.type = 'button';
    p.onclick = () => { artistFilter = a.key; renderGrid(); };
    pills.appendChild(p);
  });
  const seg = el('div', 'albview');
  seg.setAttribute('role', 'tablist');
  [['shelves', 'Shelves'], ['timeline', 'Timeline']].forEach(([k, label]) => {
    const b = txt('button', 'albvbtn' + (view === k ? ' active' : ''), label);
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', view === k ? 'true' : 'false');
    b.onclick = () => {
      if (view === k) return;
      view = k;
      try { localStorage.setItem('chandol-albview', k); } catch (e) {}
      renderGrid();
    };
    seg.appendChild(b);
  });
  pills.appendChild(seg);
  root.appendChild(pills);

  if (view === 'timeline') { renderTimeline(root, albums, artistFilter, playList); return; }

  const sections = [
    ['Albums & EPs', (a) => a.type === 'Album' || a.type === 'EP'],
    ['Singles', (a) => a.type === 'Single'],
    ['Eras & unreleased collections', (a) => a.type === 'Era'],
  ];
  let n = 0;
  sections.forEach(([label, test]) => {
    const list = shown.filter(test);
    if (!list.length) return;
    root.appendChild(txt('h3', 'albsec', label));
    const ul = el('ul', 'albgrid');
    list.forEach((a) => ul.appendChild(albumCard(a, n++)));
    root.appendChild(ul);
  });
  if (!n) root.appendChild(txt('p', 'albempty', 'No albums yet. Run tools/fetch-meta.mjs to add release info.'));
}

function trackRow(t, a, num, i) {
  const li = el('li', 'atr enter');
  li.style.setProperty('--i', String(Math.min(i, 20)));
  const b = el('button', 'atrbtn' + (state.tracks[state.cur] === t ? ' on' : ''));
  b.type = 'button';
  b.dataset.id = String(state.tracks.indexOf(t));
  b.appendChild(txt('span', 'atrn', num));
  const mid = el('span', 'atrmid');
  mid.appendChild(txt('b', null, t.name));
  const sub = el('span');
  const badge = explicitBadge(t);
  if (badge) sub.appendChild(badge);
  const extra = t.meta ? '' : (t.status || 'Unreleased');
  sub.appendChild(document.createTextNode([t.artist, extra].filter(Boolean).join(' · ')));
  mid.appendChild(sub);
  b.appendChild(mid);
  if (t.vgroup) {
    const vc = txt('span', 'vchip', t.vgroup.length + ' versions');
    vc.setAttribute('role', 'button');
    vc.title = 'See all versions';
    vc.onclick = (e) => { e.stopPropagation(); openInfo(t, 'versions'); };
    sub.appendChild(vc);
  }
  b.appendChild(txt('span', 'atrdur', t.dur ? fmt(t.dur) : ''));
  const ib = el('span', 'ibtn', MORE_SVG);
  ib.setAttribute('role', 'button');
  ib.setAttribute('aria-label', 'More options for ' + t.name);
  ib.title = 'More';
  const menuOpts = { onPlay: () => playList(a.tracks, t, false, a.name), hideAlbum: true };
  ib.onclick = (e) => { e.stopPropagation(); openMenu(t, ib, menuOpts); };
  b.appendChild(ib);
  b.onclick = () => playList(a.tracks, t, false, a.name);
  b.oncontextmenu = (e) => { e.preventDefault(); openMenu(t, { x: e.clientX, y: e.clientY }, menuOpts); };
  li.appendChild(b);
  return li;
}

function renderAlbum(key) {
  const root = $('albumsView');
  root.textContent = '';
  const a = byKey.get(key);
  const back = el('button', 'albback', BACK_SVG + 'Albums');
  back.type = 'button';
  back.onclick = () => { go('/albums'); };
  root.appendChild(back);
  if (!a) { root.appendChild(txt('p', 'albempty', state.tracks.length ? 'That album isn’t here.' : 'Loading…')); return; }

  const hero = el('section', 'ahero');
  const cv = coverEl(a.cover, 'aheroart');
  hero.appendChild(cv);
  const info = el('div', 'aheroinfo');
  info.appendChild(txt('span', 'atype', a.type === 'Era' ? 'Unreleased era' : a.type));
  info.appendChild(txt('h1', null, a.name));
  const facts = [a.artist, a.year];
  if (a.released.length) facts.push(a.released.length + (a.released.length === 1 ? ' song' : ' songs'));
  if (a.unreleased.length) facts.push(a.unreleased.length + ' unreleased');
  if (a.dur) facts.push(mins(a.dur));
  info.appendChild(txt('p', 'afacts', facts.filter(Boolean).join(' · ')));
  if (a.date && a.type !== 'Era') {
    const d = new Date(a.date + 'T12:00:00');
    info.appendChild(txt('p', 'adate', 'Released ' + d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })));
  }
  const btns = el('div', 'abtns');
  const pl = el('button', 'abtn pri', PLAY_SVG + 'Play');
  pl.type = 'button';
  pl.onclick = () => playList(a.tracks, null, false, a.name);
  const sh = el('button', 'abtn', SHUF_SVG + 'Shuffle');
  sh.type = 'button';
  sh.onclick = () => playList(a.tracks, null, true, a.name);
  btns.append(pl, sh);
  if (a.link) {
    const lk = el('a', 'abtn', LINK_SVG + 'Apple Music');
    lk.href = a.link; lk.target = '_blank'; lk.rel = 'noopener';
    btns.appendChild(lk);
  }
  info.appendChild(btns);
  hero.appendChild(info);
  root.appendChild(hero);

  let i = 0;
  if (a.released.length) {
    if (a.unreleased.length) root.appendChild(txt('h3', 'albsec', 'Tracklist'));
    const ul = el('ul', 'atracks');
    a.released.forEach((t) => ul.appendChild(trackRow(t, a, t.meta.trackNumber || '•', i++)));
    root.appendChild(ul);
  }
  if (a.unreleased.length) {
    root.appendChild(txt('h3', 'albsec', a.released.length ? 'Unreleased from this era' : 'Songs'));
    const ul = el('ul', 'atracks');
    a.unreleased.forEach((t, n) => ul.appendChild(trackRow(t, a, n + 1, i++)));
    root.appendChild(ul);
  }

  const more = albums.filter((x) => x.artistKey === a.artistKey && x !== a && x.type !== 'Era').slice(0, 12);
  if (more.length) {
    root.appendChild(txt('h3', 'albsec', 'More from ' + a.artist));
    const ul = el('ul', 'albgrid row');
    more.forEach((x, n) => ul.appendChild(albumCard(x, n)));
    root.appendChild(ul);
  }
}

let current = '';
export function onShowAlbums(hash) {
  current = hash;
  buildAlbums();
  if (hash.startsWith('/album/')) renderAlbum(decodeURIComponent(hash.slice(7)));
  else renderGrid();
}

export function initAlbums() {
  if (view === 'timeline') loadEras();
  on('rendered', () => {
    if ($('albumsView').hidden || builtFor === state.tracks) return;
    onShowAlbums(current || path());
  });
  on('trackchange', () => {
    document.querySelectorAll('.atrbtn').forEach((b) => b.classList.toggle('on', Number(b.dataset.id) === state.cur));
  });
}
