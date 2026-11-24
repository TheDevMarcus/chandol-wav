
import { $, fmt, el, txt } from '../core/util.js';
import { state, on } from '../core/state.js';
import { explicitBadge } from '../core/data.js';
import { playList } from './albums.js';
import { openMenu } from '../ui/menu.js';
import { toast } from '../ui/toast.js';
import {
  keyOf, isLiked, toggleLike, likedTracks, playlists, getPlaylist, playlistTracks,
  createPlaylist, renamePlaylist, deletePlaylist, movePlaylistTrack,
} from '../core/library.js';
import { go, path } from '../core/router.js';

const PLAY_SVG = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
const SHUF_SVG = '<svg viewBox="0 0 24 24"><path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/></svg>';
const MORE_SVG = '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>';
const BACK_SVG = '<svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg>';
const HEART_SVG = '<svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-9.3-9A5.2 5.2 0 0 1 12 6a5.2 5.2 0 0 1 9.3 5c-2.3 4.6-9.3 9-9.3 9z"/></svg>';
const PLUS_SVG = '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>';
const EDIT_SVG = '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>';
const TRASH_SVG = '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>';
const GRIP_SVG = '<svg viewBox="0 0 24 24"><path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01"/></svg>';

const mins = (sec) => { const m = Math.round(sec / 60); return m >= 60 ? Math.floor(m / 60) + ' hr ' + (m % 60) + ' min' : m + ' min'; };
const songs = (n) => n + (n === 1 ? ' song' : ' songs');

function coverFor(kind, tracks, cls) {
  const box = el('span', cls + (kind === 'liked' ? ' likedart' : ' collage'));
  if (kind === 'liked') { box.innerHTML = HEART_SVG; return box; }
  const covers = [...new Set(tracks.map((t) => t.cover).filter(Boolean))].slice(0, 4);
  if (!covers.length) { box.classList.add('emptyart'); box.innerHTML = '<svg viewBox="0 0 24 24"><path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/></svg>'; return box; }
  if (covers.length < 4) covers.splice(1);
  box.classList.toggle('one', covers.length === 1);
  covers.forEach((c) => {
    const img = el('img');
    img.alt = ''; img.loading = 'lazy';
    img.onload = () => img.classList.add('loaded');
    img.onerror = () => img.remove();
    img.src = c;
    box.appendChild(img);
  });
  return box;
}

function card(kind, title, sub, tracks, href, i, onPlay) {
  const li = el('li', 'alb enter');
  li.style.setProperty('--i', String(Math.min(i, 20)));
  const b = el('button', 'albcard');
  b.type = 'button';
  const art = coverFor(kind, tracks, 'albart');
  if (tracks.length) {
    const pb = el('span', 'albplay', PLAY_SVG);
    pb.setAttribute('role', 'button');
    pb.setAttribute('aria-label', 'Play ' + title);
    pb.onclick = (e) => { e.stopPropagation(); onPlay(); };
    art.appendChild(pb);
  }
  b.appendChild(art);
  b.appendChild(txt('span', 'albname', title));
  b.appendChild(txt('span', 'albsub', sub));
  b.onclick = () => { go(href); };
  li.appendChild(b);
  return li;
}

function newPlaylistCard(i) {
  const li = el('li', 'alb enter');
  li.style.setProperty('--i', String(i));
  const b = el('button', 'albcard newpl');
  b.type = 'button';
  b.appendChild(el('span', 'albart newart', PLUS_SVG));
  b.appendChild(txt('span', 'albname', 'New playlist'));
  b.appendChild(txt('span', 'albsub', 'Name it, then add songs from ⋯'));
  b.onclick = () => {
    const name = window.prompt('Name your playlist', 'My playlist #' + (playlists().length + 1));
    if (name === null) return;
    const p = createPlaylist(name);
    go('/playlist/' + p.id);
  };
  li.appendChild(b);
  return li;
}

function renderLibrary() {
  const root = $('libraryView');
  root.textContent = '';
  const head = el('div', 'albhead');
  head.appendChild(txt('h2', null, 'Your Library'));
  const liked = likedTracks();
  const pls = playlists();
  head.appendChild(txt('span', 'albstat', `${songs(liked.length)} liked · ${pls.length} playlist${pls.length === 1 ? '' : 's'}`));
  root.appendChild(head);

  const ul = el('ul', 'albgrid');
  let i = 0;
  ul.appendChild(card('liked', 'Liked Songs', songs(liked.length), liked, '/liked', i++, () => playList(liked, null, false, 'Liked Songs')));
  pls.forEach((p) => {
    const tr = playlistTracks(p);
    ul.appendChild(card('pl', p.name, 'Playlist · ' + songs(tr.length), tr, 'playlist/' + p.id, i++, () => playList(tr, null, false, p.name)));
  });
  ul.appendChild(newPlaylistCard(i++));
  root.appendChild(ul);

  if (!state.tracks.length) root.appendChild(txt('p', 'albempty', 'Loading songs…'));
  else if (!liked.length && !pls.length) {
    root.appendChild(txt('p', 'libtip', 'Tip: tap ♡ on the player bar to like what’s playing, or use ⋯ on any song to like it, queue it, or add it to a playlist.'));
  }
}

function trackRow(t, i, ctx) {
  const li = el('li', 'atr enter');
  li.style.setProperty('--i', String(Math.min(i, 20)));
  const b = el('button', 'atrbtn' + (state.tracks[state.cur] === t ? ' on' : ''));
  b.type = 'button';
  b.dataset.id = String(state.tracks.indexOf(t));
  b.appendChild(txt('span', 'atrn', String(i + 1)));
  const mid = el('span', 'atrmid');
  mid.appendChild(txt('b', null, t.name));
  const sub = el('span');
  const badge = explicitBadge(t);
  if (badge) sub.appendChild(badge);
  const where = t.meta && t.meta.album ? t.meta.album : t.era ? t.era + ' era' : t.status || '';
  sub.appendChild(document.createTextNode([t.artist, where].filter(Boolean).join(' · ')));
  mid.appendChild(sub);
  b.appendChild(mid);
  b.appendChild(txt('span', 'atrdur', t.dur ? fmt(t.dur) : ''));
  const more = el('span', 'ibtn', MORE_SVG);
  more.setAttribute('role', 'button');
  more.setAttribute('aria-label', 'More options for ' + t.name);
  more.title = 'More';
  more.onclick = (e) => { e.stopPropagation(); openMenu(t, more, { playlistId: ctx.playlistId, onPlay: () => playList(ctx.tracks, t, false, ctx.name) }); };
  b.appendChild(more);
  b.onclick = () => playList(ctx.tracks, t, false, ctx.name);
  b.oncontextmenu = (e) => { e.preventDefault(); openMenu(t, { x: e.clientX, y: e.clientY }, { playlistId: ctx.playlistId, onPlay: () => playList(ctx.tracks, t, false, ctx.name) }); };
  li.appendChild(b);
  if (ctx.playlistId) {
    li.classList.add('dragrow');
    li.draggable = true;
    li.dataset.k = keyOf(t);
    li.prepend(el('span', 'rowgrip', GRIP_SVG));
  }
  return li;
}

function enableReorder(ul, id) {
  let fromKey = null;
  ul.querySelectorAll('li.dragrow').forEach((li) => {
    li.addEventListener('dragstart', (e) => {
      fromKey = li.dataset.k; li.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', fromKey); } catch (err) {}
    });
    li.addEventListener('dragend', () => { li.classList.remove('dragging'); ul.querySelectorAll('.dropover').forEach((x) => x.classList.remove('dropover')); });
    li.addEventListener('dragover', (e) => { if (!fromKey) return; e.preventDefault(); li.classList.add('dropover'); });
    li.addEventListener('dragleave', () => li.classList.remove('dropover'));
    li.addEventListener('drop', (e) => {
      e.preventDefault();
      const p = getPlaylist(id);
      if (p && fromKey) movePlaylistTrack(id, p.tracks.indexOf(fromKey), p.tracks.indexOf(li.dataset.k));
      fromKey = null;
    });
  });
}

function renderList(kind, id) {
  const root = $('libraryView');
  root.textContent = '';
  const back = el('button', 'albback', BACK_SVG + 'Library');
  back.type = 'button';
  back.onclick = () => { go('/library'); };
  root.appendChild(back);

  const p = kind === 'pl' ? getPlaylist(id) : null;
  if (kind === 'pl' && !p) { root.appendChild(txt('p', 'albempty', 'That playlist doesn’t exist anymore.')); return; }
  const tracks = kind === 'liked' ? likedTracks() : playlistTracks(p);
  const name = kind === 'liked' ? 'Liked Songs' : p.name;
  const ctx = { tracks, name, playlistId: p ? p.id : null };

  const hero = el('section', 'ahero');
  hero.appendChild(coverFor(kind === 'liked' ? 'liked' : 'pl', tracks, 'aheroart'));
  const info = el('div', 'aheroinfo');
  info.appendChild(txt('span', 'atype', kind === 'liked' ? 'Your favourites' : 'Playlist'));
  const h1 = txt('h1', null, name);
  info.appendChild(h1);
  const dur = tracks.reduce((s, t) => s + (t.dur || 0), 0);
  info.appendChild(txt('p', 'afacts', [songs(tracks.length), dur ? mins(dur) : ''].filter(Boolean).join(' · ')));
  const btns = el('div', 'abtns');
  if (tracks.length) {
    const pl = el('button', 'abtn pri', PLAY_SVG + 'Play');
    pl.type = 'button';
    pl.onclick = () => playList(tracks, null, false, name);
    const sh = el('button', 'abtn', SHUF_SVG + 'Shuffle');
    sh.type = 'button';
    sh.onclick = () => playList(tracks, null, true, name);
    btns.append(pl, sh);
  }
  if (p) {
    const rn = el('button', 'abtn', EDIT_SVG + 'Rename');
    rn.type = 'button';
    rn.onclick = () => {
      const n = window.prompt('Rename playlist', p.name);
      if (n && n.trim()) { renamePlaylist(p.id, n); toast('Renamed to “' + n.trim() + '”'); }
    };
    const del = el('button', 'abtn danger', TRASH_SVG + 'Delete');
    del.type = 'button';
    del.onclick = () => {
      if (!window.confirm('Delete “' + p.name + '”? This can’t be undone.')) return;
      deletePlaylist(p.id);
      toast('Deleted “' + p.name + '”');
      go('/library');
    };
    btns.append(rn, del);
  }
  info.appendChild(btns);
  hero.appendChild(info);
  root.appendChild(hero);

  if (!tracks.length) {
    root.appendChild(txt('p', 'albempty', kind === 'liked'
      ? 'No liked songs yet. Tap ♡ on the player bar, or use ⋯ on any song → Add to Liked Songs.'
      : 'This playlist is empty. Use ⋯ on any song → Add to playlist → ' + name + '.'));
    return;
  }
  const ul = el('ul', 'atracks');
  tracks.forEach((t, i) => ul.appendChild(trackRow(t, i, ctx)));
  root.appendChild(ul);
  if (p) { enableReorder(ul, p.id); root.appendChild(txt('p', 'libtip', 'Drag songs to reorder.')); }
}

let current = '';
export function onShowLibrary(p) {
  current = p;
  if (p === '/liked') renderList('liked');
  else if (p.indexOf('/playlist/') === 0) renderList('pl', decodeURIComponent(p.slice(10)));
  else renderLibrary();
}

function syncHearts() {
  const t = state.tracks[state.cur];
  const liked = isLiked(t);
  ['dockLike', 'ovLike'].forEach((id) => {
    const b = $(id);
    if (!b) return;
    b.classList.toggle('/liked', liked);
    b.disabled = !t;
    b.setAttribute('aria-pressed', liked ? 'true' : 'false');
    b.title = liked ? 'Remove from Liked Songs' : 'Add to Liked Songs';
  });
}

export function initLibraryPage() {
  ['dockLike', 'ovLike'].forEach((id) => {
    const b = $(id);
    if (!b) return;
    b.onclick = (e) => {
      e.stopPropagation();
      const t = state.tracks[state.cur];
      if (!t) return;
      const now = toggleLike(t);
      b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
      toast(now ? 'Added to Liked Songs' : 'Removed from Liked Songs');
    };
  });
  on('library', () => {
    syncHearts();
    if (!$('libraryView').hidden) onShowLibrary(current || path());
  });
  on('trackchange', () => {
    syncHearts();
    document.querySelectorAll('#libraryView .atrbtn').forEach((b) => b.classList.toggle('on', Number(b.dataset.id) === state.cur));
  });
  on('rendered', () => { if (!$('libraryView').hidden) onShowLibrary(current || path()); });
  syncHearts();
}
