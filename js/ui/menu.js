
import { state } from '../core/state.js';
import { play } from '../player/player.js';
import { isLiked, toggleLike, playlists, addToPlaylist, createPlaylist, inPlaylist, removeFromPlaylist, getPlaylist } from '../core/library.js';
import { playNext, addToQueue } from '../player/queue.js';
import { openInfo } from './info.js';
import { albumOf } from '../pages/albums.js';
import { shareSong } from './share.js';
import { go, path } from '../core/router.js';

const I = {
  play: '<path d="M8 5v14l11-7z" class="f"/>',
  next: '<path d="M4 6h10M4 12h10M4 18h6M16 14l5 3.5-5 3.5z" />',
  queue: '<path d="M4 6h12M4 12h12M4 18h8M18 15v6M15 18h6"/>',
  heart: '<path d="M12 20s-7-4.4-9.3-9A5.2 5.2 0 0 1 12 6a5.2 5.2 0 0 1 9.3 5c-2.3 4.6-9.3 9-9.3 9z"/>',
  heartf: '<path class="f" d="M12 20s-7-4.4-9.3-9A5.2 5.2 0 0 1 12 6a5.2 5.2 0 0 1 9.3 5c-2.3 4.6-9.3 9-9.3 9z"/>',
  list: '<path d="M4 6h11M4 11h11M4 16h7M18 13v8M14 17h8"/>',
  album: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  remove: '<path d="M5 12h14"/>',
  back: '<path d="M15 6l-6 6 6 6"/>',
  chev: '<path d="M9 6l6 6-6 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  radio: '<circle cx="12" cy="12" r="2.2"/><path d="M8.5 15.5a5 5 0 0 1 0-7M15.5 8.5a5 5 0 0 1 0 7M5.6 18.4a9 9 0 0 1 0-12.8M18.4 5.6a9 9 0 0 1 0 12.8"/>',
  share: '<path d="M12 15V3M7 8l5-5 5 5"/><path d="M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7"/>',
};
const svg = (k) => '<svg viewBox="0 0 24 24">' + I[k] + '</svg>';

let menu, anchor, opts = {}, track = null;

function close() {
  if (!menu) return;
  const m = menu;
  menu = null;
  m.classList.add('leaving');
  setTimeout(() => m.remove(), 140);
  document.removeEventListener('pointerdown', outside, true);
  document.removeEventListener('keydown', keys, true);
  window.removeEventListener('resize', close);
  window.removeEventListener('scroll', onScroll, true);
}
export const closeMenu = close;
function outside(e) { if (menu && !menu.contains(e.target)) close(); }
function onScroll(e) { if (menu && !menu.contains(e.target)) close(); }
function keys(e) {
  if (!menu) return;
  if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); close(); return; }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const items = [...menu.querySelectorAll('button:not([disabled]), input')];
    const i = items.indexOf(document.activeElement);
    const n = items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length];
    if (n) n.focus();
  }
}

function item(icon, text, fn, cls) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'cm-item' + (cls ? ' ' + cls : '');
  b.innerHTML = svg(icon) + '<span></span>';
  b.querySelector('span').textContent = text;
  b.onclick = fn;
  return b;
}
const sep = () => { const d = document.createElement('div'); d.className = 'cm-sep'; return d; };

function place() {
  const r = menu.getBoundingClientRect();
  const vw = window.innerWidth, vh = window.innerHeight;
  let x, y;
  if (anchor && anchor.getBoundingClientRect) {
    const a = anchor.getBoundingClientRect();
    x = a.right - r.width; y = a.bottom + 6;
    if (y + r.height > vh - 8) y = a.top - r.height - 6;
  } else { x = anchor.x; y = anchor.y; }
  x = Math.max(8, Math.min(x, vw - r.width - 8));
  y = Math.max(8, Math.min(y, vh - r.height - 8));
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';
}

function mainPage() {
  const t = track;
  menu.textContent = '';
  const head = document.createElement('div');
  head.className = 'cm-head';
  const th = document.createElement('span');
  th.className = 'cm-th';
  if (t.cover) { const im = document.createElement('img'); im.alt = ''; im.src = t.cover; im.onerror = () => im.remove(); th.appendChild(im); }
  const tx = document.createElement('span');
  tx.className = 'cm-tx';
  const b = document.createElement('b'); b.textContent = t.name;
  const s = document.createElement('i'); s.textContent = t.artist + (t.vlabel ? ' · ' + t.vlabel : '');
  tx.append(b, s);
  head.append(th, tx);
  menu.appendChild(head);

  const isCur = state.tracks[state.cur] === t;
  if (!isCur) menu.appendChild(item('play', 'Play', () => { close(); if (opts.onPlay) opts.onPlay(); else { state.queue = null; state.queueName = ''; play(state.tracks.indexOf(t)); } }));
  menu.appendChild(item('next', 'Play next', () => { close(); playNext(t); toast('“' + t.name + '” plays next'); }));
  menu.appendChild(item('queue', 'Add to queue', () => { close(); addToQueue(t); toast('Added to queue'); }));
  menu.appendChild(sep());
  const liked = isLiked(t);
  menu.appendChild(item(liked ? 'heartf' : 'heart', liked ? 'Remove from Liked Songs' : 'Add to Liked Songs', () => {
    close();
    toast(toggleLike(t) ? 'Added to Liked Songs' : 'Removed from Liked Songs');
  }, liked ? 'liked' : ''));
  const pl = item('list', 'Add to playlist', () => playlistPage(), 'sub');
  pl.insertAdjacentHTML('beforeend', svg('chev'));
  menu.appendChild(pl);
  if (opts.playlistId && getPlaylist(opts.playlistId)) {
    const p = getPlaylist(opts.playlistId);
    menu.appendChild(item('remove', 'Remove from this playlist', () => { close(); removeFromPlaylist(p.id, t); toast('Removed from ' + p.name); }));
  }
  menu.appendChild(sep());
  const a = albumOf(t);
  if (a && !opts.hideAlbum && !t.juice) {
    menu.appendChild(item('album', a.type === 'Era' ? 'Go to ' + a.name + ' era' : 'Go to ' + (a.type === 'Single' ? 'single' : 'album'), () => {
      close();
      const ov = document.getElementById('ov');
      if (ov && !ov.hidden) document.getElementById('ovClose').click();
      go('/album/' + a.key);
    }));
  }
  if (!opts.hideInfo && !t.juice) menu.appendChild(item('info', 'Song info', () => { close(); openInfo(t); }));
  menu.appendChild(item('share', 'Share', () => { close(); shareSong(t); }));
}

function playlistPage() {
  const t = track;
  menu.textContent = '';
  const back = item('back', 'Add to playlist', () => { mainPage(); place(); }, 'cm-back');
  menu.appendChild(back);

  const form = document.createElement('form');
  form.className = 'cm-new';
  const inp = document.createElement('input');
  inp.type = 'text'; inp.placeholder = 'New playlist name'; inp.maxLength = 80;
  inp.setAttribute('aria-label', 'New playlist name');
  const go = document.createElement('button');
  go.type = 'submit'; go.innerHTML = svg('plus'); go.title = 'Create playlist';
  form.append(inp, go);
  form.onsubmit = (e) => {
    e.preventDefault();
    const p = createPlaylist(inp.value, [t]);
    close();
    toast('Created “' + p.name + '”');
  };
  menu.appendChild(form);

  const list = playlists();
  if (list.length) {
    const box = document.createElement('div');
    box.className = 'cm-scroll';
    list.forEach((p) => {
      const has = inPlaylist(p.id, t);
      const b = item(has ? 'check' : 'list', p.name, () => {
        close();
        if (has) { toast('Already in ' + p.name); return; }
        addToPlaylist(p.id, t);
        toast('Added to ' + p.name);
      }, has ? 'has' : '');
      const c = document.createElement('em');
      c.textContent = String(p.tracks.length);
      b.appendChild(c);
      box.appendChild(b);
    });
    menu.appendChild(box);
  } else {
    const p = document.createElement('p');
    p.className = 'cm-note';
    p.textContent = 'No playlists yet — name one above.';
    menu.appendChild(p);
  }
  setTimeout(() => inp.focus({ preventScroll: true }), 30);
}

export function openMenu(t, at, options) {
  if (!t) return;
  close();
  track = t; anchor = at; opts = options || {};
  menu = document.createElement('div');
  menu.className = 'cmenu';
  menu.setAttribute('role', 'menu');
  document.body.appendChild(menu);
  if (opts.page === 'playlists') playlistPage(); else mainPage();
  place();
  setTimeout(() => {
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', keys, true);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', onScroll, true);
  }, 0);
  const first = menu.querySelector('.cm-item');
  if (first && !(opts.page === 'playlists')) first.focus({ preventScroll: true });
}

export function menuOnRightClick(el, t, options) {
  el.addEventListener('contextmenu', (e) => { e.preventDefault(); openMenu(t, { x: e.clientX, y: e.clientY }, options); });
}
