
import { $, PLAY, PAUSE, fmt, imgWithFallback } from '../core/util.js';
import { state, audio, on } from '../core/state.js';
import { play, togglePlay } from '../player/player.js';
import { loadTracker, trackerData, searchTracker, entryRow } from '../core/tracker.js';
import { openInfo } from '../ui/info.js';

function appendTracker(box, raw, anim) {
  if (!trackerData()) {
    loadTracker().then(() => { if (!$('missingView').hidden && trackerData()) renderMiss(); });
    return;
  }
  const found = searchTracker(raw, 6);
  if (!found.length) return;
  const sec = document.createElement('div');
  sec.className = 'mtk' + (anim ? ' enter' : '');
  const h = document.createElement('h3');
  h.textContent = 'In the tracker';
  const p = document.createElement('p');
  p.textContent = 'What\u2019s known about songs with that name \u2014 including ones that aren\u2019t on this site.';
  const ul = document.createElement('ul');
  ul.className = 'tklist';
  found.forEach((e) => ul.appendChild(entryRow(e, {
    showEra: true,
    play: (t) => { state.queue = null; state.queueName = ''; play(state.tracks.indexOf(t)); },
    info: (t) => openInfo(t),
  })));
  sec.append(h, p, ul);
  box.appendChild(sec);
}

function normTitle(s) {
  return String(s || '').toLowerCase().replace(/[\[(][^\])]*[\])]/g, ' ').replace(/[^a-z0-9\u00c0-\uffff]+/g, ' ').trim();
}
function normFull(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9\u00c0-\uffff]+/g, ' ').trim();
}
function lev(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  let i, j;
  if (!m) return n;
  if (!n) return m;
  let prev = [];
  for (j = 0; j <= n; j++) prev[j] = j;
  for (i = 1; i <= m; i++) {
    const row = [i];
    for (j = 1; j <= n; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1));
    }
    prev = row;
  }
  return prev[n];
}
function sim(a, b) {
  if (!a || !b) return 0;
  return 1 - lev(a, b) / Math.max(a.length, b.length);
}
function score(q, t) {
  let best = 0;
  const qt = q.split(' ').filter(Boolean);
  [normTitle(t.name), normFull(t.name)].forEach((c) => {
    if (!c) return;
    let s = sim(q, c);
    if (q.length >= 3 && c.indexOf(q) !== -1) s = Math.max(s, 0.6 + 0.35 * q.length / c.length);
    if (c.length >= 3 && q.indexOf(c) !== -1) s = Math.max(s, 0.6 + 0.3 * c.length / q.length);
    const ct = c.split(' ').filter(Boolean);
    if (qt.length && ct.length) {
      let total = 0;
      qt.forEach((w) => {
        let bw = 0;
        ct.forEach((x) => { bw = Math.max(bw, sim(w, x)); });
        total += bw;
      });
      s = Math.max(s, (total / qt.length) * 0.9);
    }
    best = Math.max(best, s);
  });
  return best;
}

function miniCard(t, anim, n) {
  const el = document.createElement('div');
  el.className = 'mini' + (anim ? ' enter' : '');
  if (anim) el.style.setProperty('--i', String(n));
  el.dataset.id = String(state.tracks.indexOf(t));
  const art = document.createElement('span'); art.className = 'art';
  if (t.cover) art.appendChild(imgWithFallback(t.cover));
  const info = document.createElement('div'); info.className = 'info2';
  const mt = document.createElement('div'); mt.className = 'mt'; mt.textContent = t.name;
  const ms = document.createElement('div'); ms.className = 'ms';
  ms.textContent = t.artist + (t.status ? ' \u00b7 ' + t.status : '');
  const row = document.createElement('div'); row.className = 'mrow';
  const bar = document.createElement('div'); bar.className = 'mbar';
  const fill = document.createElement('span'); fill.className = 'mfill';
  bar.appendChild(fill);
  const time = document.createElement('span'); time.className = 'mtime';
  row.appendChild(bar); row.appendChild(time);
  info.appendChild(mt); info.appendChild(ms); info.appendChild(row);
  const btn = document.createElement('button');
  btn.className = 'mbtn'; btn.type = 'button'; btn.setAttribute('aria-label', 'Play ' + t.name);
  btn.innerHTML = '<svg viewBox="0 0 24 24"><path d="' + PLAY + '"/></svg>';
  const idx = Number(el.dataset.id);
  btn.onclick = () => { if (state.cur === idx) togglePlay(); else play(idx); };
  bar.onclick = (e) => {
    if (state.cur !== idx || !audio.duration) return;
    const r = bar.getBoundingClientRect();
    audio.currentTime = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * audio.duration;
  };
  el.appendChild(art); el.appendChild(info); el.appendChild(btn);
  return el;
}

function refreshMinis() {
  document.querySelectorAll('.mini').forEach((el) => {
    const i = Number(el.dataset.id), t = state.tracks[i];
    const isCur = i === state.cur;
    const path = el.querySelector('.mbtn path');
    if (path) path.setAttribute('d', isCur && !audio.paused ? PAUSE : PLAY);
    const pct = isCur && audio.duration ? audio.currentTime / audio.duration * 100 : 0;
    el.querySelector('.mfill').style.width = pct + '%';
    el.querySelector('.mtime').textContent = isCur && audio.duration
      ? fmt(audio.currentTime) + ' / ' + fmt(audio.duration)
      : (t && t.dur ? fmt(t.dur) : '');
  });
}

export function renderMiss() {
  const box = $('missResults');
  const raw = $('missInput').value.trim();
  const anim = !box.firstChild;
  box.textContent = '';
  if (raw.length < 2) return;
  function say(text) {
    const d = document.createElement('div'); d.className = 'mnone' + (anim ? ' enter' : ''); d.textContent = text; box.appendChild(d);
  }
  if (!state.tracks.length) { say('The song list is still loading. Try again in a moment.'); return; }
  const q = normFull(raw);
  const found = state.tracks
    .map((t) => ({ t: t, s: score(q, t) }))
    .filter((x) => x.s >= 0.6)
    .sort((a, b) => b.s - a.s)
    .slice(0, 5);
  if (!found.length) {
    const inTracker = trackerData() && searchTracker(raw, 1).length;
    say(inTracker ? "It's not on this site \u2014 here's what the tracker knows." : "Nothing close to that here. It looks like it's missing.");
    appendTracker(box, raw, anim);
    return;
  }
  const head = document.createElement('div');
  head.className = 'mhead' + (anim ? ' enter' : '');
  head.textContent = found[0].s >= 0.97 ? "Good news, it's here." : "Are you sure this isn't it?";
  box.appendChild(head);
  found.forEach((x, n) => box.appendChild(miniCard(x.t, anim, n + 1)));
  refreshMinis();
  appendTracker(box, raw, anim);
}

export function onShowMissing() {
  renderMiss();
  setTimeout(() => $('missInput').focus(), 0);
}

export function initMissing() {
  ['play', 'pause', 'timeupdate', 'loadedmetadata', 'loadstart'].forEach((ev) => {
    audio.addEventListener(ev, refreshMinis);
  });

  on('rendered', () => { if (!$('missingView').hidden) renderMiss(); });

  let missTimer = null;
  $('missInput').addEventListener('input', () => {
    clearTimeout(missTimer);
    missTimer = setTimeout(renderMiss, 150);
  });
}
