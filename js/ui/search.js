
import { $, fmt, el } from '../core/util.js';
import { state, on, emit } from '../core/state.js';
import { play } from '../player/player.js';
import { setPageQuery } from '../pages/tracks.js';
import { subline, explicitBadge } from '../core/data.js';
import { openMenu } from './menu.js';
import { go, path } from '../core/router.js';
import { juiceOn, searchJuice } from '../core/juice.js';

const CLOSE_MS = 220;
const TOP_COUNT = 10;
const SECTION_COUNT = 12;
const COVER_WAIT_MS = 6000;

const SEARCH_SVG = '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>';
const CLOSE_SVG = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>';
const NOTE_SVG = '<svg viewBox="0 0 24 24"><path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/></svg>';
const LEFT_SVG = '<svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg>';
const RIGHT_SVG = '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>';

const LIVE_RE = /[\[(][^\])]*\blive\b/i;
const statusOf = (t) => String(t.status || '').trim().toLowerCase();
const isLive = (t) => t.live === true || LIVE_RE.test(t.name || '');
const GROUPS = [
  { label: 'Released', test: (t) => !isLive(t) && ((!statusOf(t) && !t.juice) || statusOf(t) === 'released') },
  { label: 'Unreleased', test: (t) => !isLive(t) && statusOf(t) === 'unreleased' },
  { label: 'Live', test: isLive },
  { label: 'Old Versions', test: (t) => statusOf(t) === 'old version' }
];

function group(list) {
  const out = GROUPS.map((g) => ({ label: g.label, items: [] }));
  const rest = [];
  for (const t of list) {
    let hit = false;
    GROUPS.forEach((g, i) => { if (g.test(t)) { out[i].items.push(t); hit = true; } });
    if (!hit) rest.push(t);
  }
  if (rest.length) out.push({ label: 'Other', items: rest });
  return out.filter((g) => g.items.length);
}

function search(q) {
  const scored = [];
  for (const t of state.tracks) {
    const name = (t.name || '').toLowerCase();
    const artist = ((t.artist || '') + ' ' + (t.meta ? t.meta.album : '')).toLowerCase();
    let s = -1;
    if (name === q) s = 0;
    else if (name.startsWith(q)) s = 1;
    else if ((' ' + name).includes(' ' + q)) s = 2;
    else if (name.includes(q)) s = 3;
    else if (artist.includes(q) || (name + ' ' + artist).includes(q)) s = 4;
    if (s >= 0) scored.push([s, t]);
  }
  return scored.sort((a, b) => a[0] - b[0]).map((x) => x[1]);
}

const LOADED = new Set();
function preload(src) {
  if (LOADED.has(src)) return Promise.resolve();
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => { LOADED.add(src); resolve(); };
    img.onerror = () => resolve();
    img.src = src;
  });
}

let dock, panel, input, icon, btn;
let isOpen = false;
let closeTimer = 0;
let token = 0;
let showingResults = false;
let lastResults = [];
let indexOf = new Map();
let indexedFor = null;
let prevEls = new Map();

function idx(t) {
  if (indexedFor !== state.tracks) {
    indexOf = new Map(state.tracks.map((x, i) => [x, i]));
    indexedFor = state.tracks;
  }
  return indexOf.get(t);
}

function cover(t, cls) {
  if (t.cover) {
    const img = el('img', cls);
    img.alt = ''; img.decoding = 'async'; img.src = t.cover;
    img.onerror = () => img.replaceWith(el('span', cls + ' sd-ph', NOTE_SVG));
    return img;
  }
  return el('span', cls + ' sd-ph', NOTE_SVG);
}

function pick(t) {
  const i = idx(t);
  if (i == null) return;
  state.queue = null;
  state.queueName = '';
  state.lastCtx = null;
  play(i);
  close(true);
}

export function openSearch() {
  if (isOpen) { input.focus(); return; }
  isOpen = true;
  emit('popup', 'search');
  clearTimeout(closeTimer);
  dock.classList.remove('closing');
  dock.classList.add('open');
  input.hidden = false; icon.hidden = false; input.readOnly = false;
  btn.innerHTML = CLOSE_SVG;
  btn.setAttribute('aria-label', 'Close search'); btn.title = 'Close search';
  input.focus({ preventScroll: true });
  update();
}

function close(clear) {
  if (!isOpen) return;
  isOpen = false;
  token++;
  dock.classList.add('closing');
  input.readOnly = true;
  btn.innerHTML = SEARCH_SVG;
  btn.setAttribute('aria-label', 'Search songs'); btn.title = 'Search songs';
  clearTimeout(closeTimer);
  closeTimer = setTimeout(() => {
    dock.classList.remove('open', 'closing');
    input.hidden = true; icon.hidden = true; input.readOnly = false;
    panel.hidden = true; panel.textContent = '';
    showingResults = false; prevEls = new Map();
    if (clear) input.value = '';
  }, CLOSE_MS);
}

function showPanel() {
  if (panel.hidden) panel.hidden = false;
}

function renderNote(msg) {
  showPanel();
  panel.textContent = '';
  panel.appendChild(el('p', 'sd-note')).textContent = msg;
  showingResults = false; prevEls = new Map();
}

function renderLoading() {
  showPanel();
  if (panel.querySelector('.sd-load')) return;
  panel.textContent = '';
  const box = el('div', 'sd-load');
  box.setAttribute('role', 'status'); box.setAttribute('aria-label', 'Searching');
  for (let i = 0; i < 24; i++) { const s = el('span'); s.style.setProperty('--i', i); box.appendChild(s); }
  panel.appendChild(box);
  showingResults = false; prevEls = new Map();
}

function keyed(next, key, i, build) {
  let e = prevEls.get(key);
  if (e) e.classList.add('seen');
  else { e = build(); e.style.setProperty('--i', String(i)); }
  next.set(key, e);
  return e;
}

function row(t) {
  const li = el('li', 'sd-li');
  const b = el('button', 'sd-item');
  b.type = 'button'; b.title = t.name;
  b.appendChild(cover(t, 'sd-thumb'));
  const meta = el('span', 'sd-meta');
  meta.appendChild(el('b')).textContent = t.name;
  const sub = meta.appendChild(el('span'));
  const badge = explicitBadge(t);
  if (badge) sub.appendChild(badge);
  sub.appendChild(document.createTextNode(subline(t) || 'Song'));
  b.appendChild(meta);
  if (t.dur) b.appendChild(el('em')).textContent = fmt(t.dur);
  b.onclick = () => pick(t);
  b.oncontextmenu = (e) => { e.preventDefault(); openMenu(t, { x: e.clientX, y: e.clientY }); };
  b.dataset.id = String(idx(t));
  li.appendChild(b);
  return li;
}

function card(t) {
  const wrap = el('div', 'sd-cardwrap');
  const b = el('button', 'sd-card');
  b.type = 'button'; b.title = t.name;
  b.appendChild(cover(t, 'sd-cover'));
  b.appendChild(el('b')).textContent = t.name;
  b.appendChild(el('span')).textContent = (t.meta && t.meta.album) || t.artist || 'Song';
  b.onclick = () => pick(t);
  b.dataset.id = String(idx(t));
  wrap.appendChild(b);
  return wrap;
}

function updateArrows(strip, l, r) {
  l.hidden = strip.scrollLeft <= 2;
  r.hidden = strip.scrollLeft + strip.clientWidth >= strip.scrollWidth - 2;
}

function renderResults(text, results) {
  showPanel();
  const next = new Map();
  const frag = document.createDocumentFragment();

  const top = el('div', 'sd-bar');
  const lbl = el('span', 'sd-q');
  lbl.textContent = results.length + (results.length === 1 ? ' result' : ' results') + ' for “' + text + '”';
  const all = el('button', 'sd-all');
  all.type = 'button';
  all.innerHTML = 'View all' + RIGHT_SVG;
  all.onclick = () => viewAll(text);
  top.append(lbl, all);
  frag.appendChild(top);

  const best = results.slice(0, TOP_COUNT);
  frag.appendChild(el('h3', 'sd-head')).textContent = 'Top Results';
  const stripWrap = el('div', 'sd-topwrap');
  const strip = el('div', 'sd-top');
  best.forEach((t, i) => strip.appendChild(keyed(next, 'top|' + idx(t), Math.min(i, 8), () => card(t))));
  const l = el('button', 'sd-arrow l', LEFT_SVG);
  const r = el('button', 'sd-arrow r', RIGHT_SVG);
  l.type = r.type = 'button';
  l.setAttribute('aria-label', 'Scroll left'); r.setAttribute('aria-label', 'Scroll right');
  l.onclick = () => strip.scrollBy({ left: -236, behavior: 'smooth' });
  r.onclick = () => strip.scrollBy({ left: 236, behavior: 'smooth' });
  strip.addEventListener('scroll', () => updateArrows(strip, l, r), { passive: true });
  stripWrap.append(strip, l, r);
  frag.appendChild(stripWrap);

  group(results).forEach((g) => {
    frag.appendChild(el('h3', 'sd-head')).textContent = g.label;
    const ul = el('ul', 'sd-list');
    g.items.slice(0, SECTION_COUNT).forEach((t, i) => ul.appendChild(keyed(next, g.label + '|' + idx(t), Math.min(i, 11), () => row(t))));
    frag.appendChild(ul);
  });

  panel.textContent = '';
  panel.appendChild(frag);
  prevEls = next;
  showingResults = true;
  lastResults = results;
  markPlaying();
  requestAnimationFrame(() => { strip.scrollLeft = 0; updateArrows(strip, l, r); });
}

function markPlaying() {
  panel.querySelectorAll('.sd-item, .sd-card').forEach((b) => b.classList.toggle('on', Number(b.dataset.id) === state.cur));
}

let jctrl = null;
let jtimer = 0;

function juiceSearch(text, my) {
  if (jtimer) clearTimeout(jtimer);
  if (jctrl) jctrl.abort();
  if (!showingResults) renderLoading();
  jtimer = setTimeout(() => {
    jctrl = new AbortController();
    searchJuice(text, jctrl.signal).then((results) => {
      if (my !== token || !isOpen) return;
      if (!results.length) { renderNote('No songs found for “' + text + '”.'); return; }
      renderResults(text, results);
    }).catch((e) => {
      if (my !== token || !isOpen || (e && e.name === 'AbortError')) return;
      renderNote('Couldn’t search right now.');
    });
  }, 240);
}

function update() {
  if (!isOpen) return;
  const text = input.value.trim();
  const my = ++token;
  if (!text) { panel.hidden = true; panel.textContent = ''; showingResults = false; prevEls = new Map(); return; }
  if (!state.tracks.length) { renderLoading(); return; }
  if (text.length < 2) { renderNote('Keep typing to search…'); return; }
  if (juiceOn()) { juiceSearch(text, my); return; }

  const results = search(text.toLowerCase());
  if (!results.length) { renderNote('No songs found for “' + text + '”.'); return; }

  const shown = results.slice(0, TOP_COUNT).concat(group(results).flatMap((g) => g.items.slice(0, SECTION_COUNT)));
  const srcs = [...new Set(shown.map((t) => t.cover).filter(Boolean))];
  if (srcs.every((s) => LOADED.has(s))) { renderResults(text, results); return; }

  if (!showingResults) renderLoading();
  let done = false;
  const finish = () => {
    if (done || my !== token || !isOpen) return;
    done = true;
    renderResults(text, results);
  };
  Promise.all(srcs.map(preload)).then(finish);
  setTimeout(finish, COVER_WAIT_MS);
}

function viewAll(text) {
  setPageQuery(text);
  close(true);
  if (path() !== '/' && path() !== '/tracks') go('/tracks');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

export function initSearch() {
  dock = $('searchDock');
  panel = $('sdPanel');
  input = $('sdInput');
  icon = $('sdIcon');
  btn = $('sdBtn');

  btn.onclick = () => (isOpen ? close(false) : openSearch());
  input.addEventListener('input', update);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close(false); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (showingResults && lastResults[0]) pick(lastResults[0]);
    }
  });

  document.addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) return;
    if (e.key === '/' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) {
      e.preventDefault();
      openSearch();
    }
  });

  document.addEventListener('pointerdown', (e) => {
    if (isOpen && !dock.contains(e.target) && !e.target.closest('.dock') && !e.target.closest('.cmenu')) close(false);
  });

  on('rendered', () => { if (isOpen && !showingResults) update(); });
  on('trackchange', () => { if (showingResults) markPlaying(); });
  on('popup', (who) => { if (who !== 'search') close(false); });
}
