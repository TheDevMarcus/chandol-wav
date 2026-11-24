
import { $, showAnimated, hideAnimated, txt as el } from '../core/util.js';
import { state, audio, on, emit } from '../core/state.js';
import { fetchLyrics, fetchLrclib, parseLrc } from './lyrics.js';
import { censor } from '../core/censor.js';

let wrap, pop, body, sub, btn;
let isOpen = false;
let token = 0;
let loadedFor = null;
let lines = [], els = [], active = -2;
let userScrollUntil = 0;
let lastRes = null;

function cur() { return state.tracks[state.cur] || null; }

function popRetry(t) {
  const b = document.createElement('button');
  b.className = 'ovpill lyrtry';
  b.type = 'button';
  b.textContent = 'Try lrclib';
  b.addEventListener('click', () => {
    b.disabled = true;
    b.textContent = 'Searching\u2026';
    fetchLrclib(t).then((r) => {
      if (loadedFor !== t) return;
      if (r) render(r);
      else { b.textContent = 'Nothing on lrclib'; }
    }).catch(() => { b.disabled = false; b.textContent = 'Try lrclib'; });
  });
  const card = body.querySelector('.lp-empty');
  (card || body).appendChild(b);
}

function empty(title, msg) {
  body.textContent = '';
  lines = []; els = []; active = -2;
  const card = el('div', 'lp-empty');
  card.appendChild(el('b', null, title));
  card.appendChild(el('p', null, msg));
  body.appendChild(card);
}

function loading() {
  body.textContent = '';
  lines = []; els = []; active = -2;
  const box = el('div', 'lp-load');
  box.setAttribute('role', 'status'); box.setAttribute('aria-label', 'Loading lyrics');
  [78, 92, 64, 85, 70, 58].forEach((w, i) => {
    const s = el('span');
    s.style.width = w + '%';
    s.style.setProperty('--i', i);
    box.appendChild(s);
  });
  body.appendChild(box);
}

function render(res) {
  lastRes = res;
  body.textContent = '';
  lines = []; els = []; active = -2;
  const synced = res.synced ? parseLrc(res.synced) : [];
  if (synced.length) {
    lines = synced;
    synced.forEach((l, i) => {
      const p = el('p', 'lp-line', censor(l.text));
      p.style.setProperty('--i', Math.min(i, 14));
      p.onclick = () => { audio.currentTime = l.t; if (audio.paused) audio.play().catch(() => {}); userScrollUntil = 0; };
      body.appendChild(p);
      els.push(p);
    });
    body.scrollTop = 0;
    sync(true);
  } else {
    String(res.plain || '').split(/\r?\n/).forEach((txt, i) => {
      const p = el('p', 'lp-line plain', censor(txt) || ' ');
      p.style.setProperty('--i', Math.min(i, 14));
      body.appendChild(p);
    });
    body.appendChild(el('p', 'lp-foot', 'These lyrics aren’t synced to the song.'));
    body.scrollTop = 0;
  }
}

function load() {
  const t = cur();
  if (!t) {
    loadedFor = null;
    sub.textContent = 'Nothing playing';
    empty('Nothing playing', 'Pick a song and its lyrics will show up here.');
    return;
  }
  sub.textContent = t.name + ' — ' + t.artist;
  if (loadedFor === t) return;
  loadedFor = t;
  lastRes = null;
  const my = ++token;
  loading();
  fetchLyrics(t)
    .then((res) => {
      if (my !== token) return;
      if (!res) {
        if (t.juice) {
          empty('No lyrics in the vault', 'Nothing saved for this one yet.');
          popRetry(t);
        } else {
          empty('No lyrics saved yet', 'This track doesn’t have lyrics available right now.');
        }
      }
      else render(res);
    })
    .catch(() => {
      if (my !== token) return;
      loadedFor = null;
      empty('Couldn’t load lyrics', 'Check your connection and try again.');
    });
}

function sync(instant) {
  if (!isOpen || !lines.length) return;
  const ts = audio.currentTime + 0.25;
  let idx = -1;
  for (let i = 0; i < lines.length; i++) { if (lines[i].t <= ts) idx = i; else break; }
  if (idx === active && !instant) return;
  active = idx;
  els.forEach((p, j) => {
    p.classList.toggle('on', j === idx);
    p.classList.toggle('past', j < idx);
  });
  if (idx < 0 || Date.now() < userScrollUntil) return;
  const p = els[idx];
  const top = p.offsetTop - body.clientHeight / 2 + p.offsetHeight / 2;
  body.scrollTo({ top: Math.max(0, top), behavior: instant ? 'auto' : 'smooth' });
}

export function openLyricsPop() {
  if (isOpen) return;
  isOpen = true;
  emit('popup', 'lyrics');
  btn.classList.add('active');
  btn.setAttribute('aria-expanded', 'true');
  showAnimated(pop);
  load();
  requestAnimationFrame(() => sync(true));
}

export function closeLyricsPop() {
  if (!isOpen) return;
  isOpen = false;
  btn.classList.remove('active');
  btn.setAttribute('aria-expanded', 'false');
  hideAnimated(pop, 200);
}

export function initLyricsPop() {
  wrap = $('lyrWrap');
  pop = $('lyrPop');
  body = $('lyrBody');
  sub = $('lyrSub');
  btn = $('lyrBtn');

  btn.onclick = () => (isOpen ? closeLyricsPop() : openLyricsPop());

  const hold = () => { userScrollUntil = Date.now() + 3000; };
  body.addEventListener('wheel', hold, { passive: true });
  body.addEventListener('touchmove', hold, { passive: true });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen) { closeLyricsPop(); return; }
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'l' || e.key === 'L') btn.click();
  });
  document.addEventListener('pointerdown', (e) => {
    if (isOpen && !pop.contains(e.target) && !e.target.closest('.dock')) closeLyricsPop();
  });

  audio.addEventListener('timeupdate', () => sync(false));
  audio.addEventListener('seeked', () => { userScrollUntil = 0; sync(true); });
  on('trackchange', () => { if (isOpen) load(); else loadedFor = null; });
  on('popup', (who) => { if (who !== 'lyrics') closeLyricsPop(); });
  on('lyricsettings', () => {
    if (!lastRes) return;
    const keep = body.scrollTop;
    render(lastRes);
    body.scrollTop = keep;
    sync(true);
  });
}
