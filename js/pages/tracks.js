
import { $, fmt, imgWithFallback } from '../core/util.js';
import { state, on, emit } from '../core/state.js';
import { fetchTracks, ARTISTS, subline, explicitBadge } from '../core/data.js';
import { juiceOn, juiceTotal, restoreJuice, juiceWanted } from '../core/juice.js';
import { play } from '../player/player.js';
import { ovOpen } from '../player/overlay.js';
import { getOverlayTrigger, getGroupVersions } from './settings.js';
import { collapseVersions } from '../core/versions.js';
import { openInfo } from '../ui/info.js';
import { openMenu } from '../ui/menu.js';

const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let activeArtist = 'all';
let pageQuery = '';
let sortMode = 'default';
try { sortMode = localStorage.getItem('chandol-sort') || 'default'; } catch (e) {}

const VERS_SVG = '<svg viewBox="0 0 24 24"><path d="M4 8l8-4 8 4-8 4z"/><path d="M4 12l8 4 8-4M4 16l8 4 8-4"/></svg>';
const MORE_SVG = '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>';
const INFO_SVG = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>';
const dateOf = (t) => (t.meta && (t.meta.releaseDate || t.meta.albumReleaseDate)) || '';
const albumKey = (t) => ((t.meta && t.meta.album) || t.era || '\uffff').toLowerCase();
function sortList(list) {
  if (sortMode === 'default') return list;
  const pos = new Map(list.map((t, i) => [t, i]));
  const by = {
    new: (a, b) => (!dateOf(a) - !dateOf(b)) || dateOf(b).localeCompare(dateOf(a)),
    old: (a, b) => (!dateOf(a) - !dateOf(b)) || dateOf(a).localeCompare(dateOf(b)),
    az: (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }),
    album: (a, b) => albumKey(a).localeCompare(albumKey(b)) || ((a.meta && a.meta.trackNumber) || 999) - ((b.meta && b.meta.trackNumber) || 999) || a.name.localeCompare(b.name),
    long: (a, b) => (b.dur || 0) - (a.dur || 0),
    short: (a, b) => (!a.dur - !b.dur) || (a.dur || 0) - (b.dur || 0),
  }[sortMode];
  return by ? list.slice().sort((a, b) => by(a, b) || pos.get(a) - pos.get(b)) : list;
}

export function setPageQuery(q) {
  pageQuery = String(q || '').trim();
  $('tracksTitle').textContent = pageQuery ? 'Results for “' + pageQuery + '”' : 'Tracks';
  $('clearQuery').hidden = !pageQuery;
  if (state.tracks.length) render(true);
}

function showSkeleton() {
  const list = $('list');
  list.textContent = '';
  list.setAttribute('aria-busy', 'true');
  const frag = document.createDocumentFragment();
  for (let i = 0; i < 12; i++) {
    const li = document.createElement('li');
    li.className = 'skel';
    ['art', 'line', 'line l2'].forEach((c) => {
      const s = document.createElement('span');
      s.className = c;
      li.appendChild(s);
    });
    frag.appendChild(li);
  }
  list.appendChild(frag);
  $('count').textContent = '';
}

function showStatus(msg, retry) {
  const list = $('list');
  list.setAttribute('aria-busy', 'false');
  list.textContent = '';
  const li = document.createElement('li');
  li.className = 'status';
  li.textContent = msg;
  if (retry) {
    li.appendChild(document.createElement('br'));
    const btn = document.createElement('button');
    btn.textContent = 'Try again';
    btn.onclick = loadTracks;
    li.appendChild(btn);
  }
  list.appendChild(li);
  $('count').textContent = '';
}

function renderList(animate) {
  const q = pageQuery.toLowerCase();
  const filtered = sortList(state.tracks.filter((t) => {
    if (activeArtist !== 'all' && t.artistKey !== activeArtist) return false;
    return !q || (t.name + ' ' + t.artist + ' ' + (t.meta ? t.meta.album : '') + ' ' + (t.era || '')).toLowerCase().indexOf(q) !== -1;
  }));
  state.view = getGroupVersions() ? collapseVersions(filtered) : filtered;
  const list = $('list');
  if (!state.view.length) { showStatus(q ? 'No songs match “' + pageQuery + '”.' : 'No songs here yet.'); $('count').textContent = '0 tracks'; return; }
  list.textContent = '';
  list.setAttribute('aria-busy', 'false');
  const whole = juiceOn() && !q && activeArtist === 'all';
  const tot = juiceTotal();
  $('count').textContent = whole
    ? (tot > 0 ? tot.toLocaleString() : '1000+') + ' tracks'
    : state.view.length + (state.view.length === 1 ? ' track' : ' tracks');
  const frag = document.createDocumentFragment();
  const triggerMode = getOverlayTrigger();
  state.view.forEach((t, n) => {
    const li = document.createElement('li');
    if (animate) { li.className = 'enter'; li.style.setProperty('--i', String(Math.min(n, 24))); }
    const card = document.createElement('button');
    card.className = 'card' + (state.tracks[state.cur] === t ? ' active' : '');
    card.dataset.id = String(state.tracks.indexOf(t));

    const num = document.createElement('span'); num.className = 'num'; num.textContent = String(n + 1);
    const art = document.createElement('span'); art.className = 'art';
    if (t.cover) art.appendChild(imgWithFallback(t.cover));
    const mid = document.createElement('span'); mid.style.minWidth = '0';
    const title = document.createElement('span'); title.className = 't'; title.textContent = t.name;
    const sub = document.createElement('span'); sub.className = 'a';
    const badge = explicitBadge(t);
    if (badge) sub.appendChild(badge);
    sub.appendChild(document.createTextNode(subline(t)));
    sub.title = subline(t);
    mid.appendChild(title); mid.appendChild(sub);
    const d = document.createElement('span'); d.className = 'dur'; d.textContent = t.dur ? fmt(t.dur) : '';

    if (list.classList.contains('list')) { card.appendChild(num); card.appendChild(art); card.appendChild(mid); card.appendChild(d); }
    else { card.appendChild(art); card.appendChild(title); card.appendChild(sub); }
    if (triggerMode === 'title') {
      card.onclick = () => play(Number(card.dataset.id));
      title.classList.add('title-link');
      title.title = 'Open full player';
      title.onclick = (e) => { e.stopPropagation(); play(Number(card.dataset.id)); ovOpen(); };
    } else {
      card.onclick = () => { play(Number(card.dataset.id)); ovOpen(); };
    }
    const ib = document.createElement('span');
    ib.className = 'ibtn cardi';
    ib.innerHTML = MORE_SVG;
    ib.setAttribute('role', 'button');
    ib.setAttribute('aria-label', 'More options for ' + t.name);
    ib.title = 'More';
    ib.onclick = (e) => { e.stopPropagation(); openMenu(t, ib); };
    card.appendChild(ib);
    if (t.vgroup && getGroupVersions()) {
      const n = t.vgroup.length;
      const vb = document.createElement('span');
      vb.className = 'vbadge';
      vb.innerHTML = VERS_SVG + '<span>' + n + ' versions</span>';
      vb.setAttribute('role', 'button');
      vb.title = 'See all ' + n + ' versions';
      vb.onclick = (e) => { e.stopPropagation(); openInfo(t, 'versions'); };
      if (list.classList.contains('list')) mid.appendChild(vb);
      else art.appendChild(vb);
    }
    card.oncontextmenu = (e) => { e.preventDefault(); openMenu(t, { x: e.clientX, y: e.clientY }); };
    li.appendChild(card);
    frag.appendChild(li);
  });
  list.appendChild(frag);
}

function render(animate) {
  renderList(animate === true);
  emit('rendered');
}

function setMode(mode) {
  $('list').classList.toggle('list', mode === 'list');
  $('gridBtn').classList.toggle('active', mode === 'grid');
  $('listBtn').classList.toggle('active', mode === 'list');
  try { localStorage.setItem('chandol-view', mode); } catch (e) {}
  if (state.tracks.length) render(true);
}

export function loadTracks() {
  showSkeleton();
  fetchTracks()
    .then((tracks) => {
      state.tracks = tracks;
      if (!tracks.length) { showStatus('No songs found.', true); return; }
      if (juiceWanted()) { restoreJuice(); return; }
      render(true);
    })
    .catch(() => { showStatus("Couldn't load the song list. Check your internet connection.", true); });
}

export function setArtist(key) {
  activeArtist = key || 'all';
  const wrap = $('artistFilter');
  if (wrap) wrap.querySelectorAll('.afpill').forEach((b) => b.classList.toggle('active', b.dataset.key === activeArtist));
  if (state.tracks.length) render(false);
}

function buildArtistFilter() {
  const wrap = $('artistFilter');
  if (!wrap) return;
  const all = document.createElement('button');
  all.className = 'afpill active';
  all.textContent = 'All';
  all.dataset.key = 'all';
  wrap.appendChild(all);
  ARTISTS.forEach((a) => {
    const btn = document.createElement('button');
    btn.className = 'afpill';
    btn.textContent = a.label;
    btn.dataset.key = a.key;
    wrap.appendChild(btn);
  });
  wrap.addEventListener('click', (e) => {
    const btn = e.target.closest('.afpill');
    if (!btn) return;
    activeArtist = btn.dataset.key;
    wrap.querySelectorAll('.afpill').forEach((b) => b.classList.toggle('active', b === btn));
    render(false);
  });
}

export function initTracks() {
  buildArtistFilter();
  $('gridBtn').onclick = () => setMode('grid');
  $('listBtn').onclick = () => setMode('list');
  $('clearQuery').onclick = () => setPageQuery('');
  const sortSel = $('sortSel');
  sortSel.value = sortMode;
  sortSel.onchange = () => {
    sortMode = sortSel.value;
    try { localStorage.setItem('chandol-sort', sortMode); } catch (e) {}
    if (state.tracks.length) render(true);
  };
  on('librarysettings', () => { if (state.tracks.length) render(true); });
  $('list').addEventListener('click', (e) => {
    if (e.target.closest('.card') && !e.target.closest('.ibtn') && !e.target.closest('.vbadge')) { state.queue = null; state.queueName = ''; state.lastCtx = null; }
  }, true);

  if (!reduceMotion) {
    const list = $('list');
    let tiltEv = null, tiltRaf = 0;
    function applyTilt() {
      tiltRaf = 0;
      const e = tiltEv; tiltEv = null;
      if (!e) return;
      const card = e.target.closest && e.target.closest('.card');
      const art = card && card.querySelector('.art');
      if (!art) return;
      const r = art.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      art.style.setProperty('--ry', (x * 14).toFixed(2) + 'deg');
      art.style.setProperty('--rx', (-y * 14).toFixed(2) + 'deg');
    }
    list.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse' || list.classList.contains('list') || document.documentElement.classList.contains('lite')) return;
      tiltEv = e;
      if (!tiltRaf) tiltRaf = requestAnimationFrame(applyTilt);
    }, { passive: true });
    list.addEventListener('pointerout', (e) => {
      const card = e.target.closest && e.target.closest('.card');
      if (!card || card.contains(e.relatedTarget)) return;
      const art = card.querySelector('.art');
      if (art) { art.style.removeProperty('--rx'); art.style.removeProperty('--ry'); }
    });
  }

  on('trackchange', () => {
    document.querySelectorAll('.card').forEach((c) => {
      c.classList.toggle('active', Number(c.dataset.id) === state.cur);
    });
  });

  let savedMode = 'grid';
  try { savedMode = localStorage.getItem('chandol-view') || 'grid'; } catch (e) {}
  $('list').classList.toggle('list', savedMode === 'list');
  $('gridBtn').classList.toggle('active', savedMode !== 'list');
  $('listBtn').classList.toggle('active', savedMode === 'list');
}

export function onShowTracks() {
  if (typeof renderList === 'function') renderList(false);
}
