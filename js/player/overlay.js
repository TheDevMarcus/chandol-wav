
import { $, PLAY, PAUSE, fmt, setFill, imgWithFallback, retrigger, showAnimated, hideAnimated } from '../core/util.js';
import { state, audio, on } from '../core/state.js';
import { play, step, togglePlay, volEl } from './player.js';
import { createWave } from './waveform.js';
import { drawStaticStars } from '../ui/stars.js';
import { fetchLyrics, fetchLrclib, parseLrc } from '../lyrics/lyrics.js';
import { censor } from '../core/censor.js';
import { subline, explicitBadge } from '../core/data.js';
import { openInfo } from '../ui/info.js';
import { renderQueueInto } from './queue.js';
import { shareSong } from '../ui/share.js';

const ov = $('ov');
const ovWaveEl = $('ovWave');
const ovWave = createWave(ovWaveEl, 64);
let ovDrag = false;

let lyrToken = 0, lyrLines = [], lyrEls = [], lyrSynced = false, lyrActive = -2;
let lyrRes = null;

export function fitPlayer() {
  if (ov.hidden) return;
  ov.classList.remove('compact');
  if (window.innerWidth <= 900) { ov.style.removeProperty('--cvh'); return; }
  const grid = ov.querySelector('.ovgrid'), left = ov.querySelector('.ovleft'), cover = ov.querySelector('.ovcover');
  const cs = getComputedStyle(grid);
  const rest = left.offsetHeight - cover.offsetHeight;
  const room = ov.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - rest - 6;
  if (room < 200) {
    ov.style.removeProperty('--cvh');
    ov.classList.add('compact');
  } else {
    ov.style.setProperty('--cvh', Math.floor(room) + 'px');
  }
}
function fitSoon() { fitPlayer(); }

export function ovOpen() {
  if (state.cur < 0) return;
  showAnimated(ov);
  document.body.style.overflow = 'hidden';
  document.body.classList.add('ov-open');
  drawStaticStars($('ovStarsCv'));
  lyrActive = -2;
  updateOverlay();
  fitPlayer();
  setTimeout(fitPlayer, 120); setTimeout(fitPlayer, 800); setTimeout(fitPlayer, 1500);
}

function ovClose() {
  if (ov.hidden || ov.classList.contains('leaving')) return;
  hideAnimated(ov, 320);
  document.body.style.overflow = '';
  document.body.classList.remove('ov-open');
  hideAnimated($('ovQueue'), 300);
  $('ovQueueBtn').classList.remove('on');
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
}

function syncOv() {
  $('ovPlayIcon').firstElementChild.setAttribute('d', audio.paused ? PLAY : PAUSE);
  $('ovToggle').setAttribute('aria-label', audio.paused ? 'Play' : 'Pause');
  $('ovShuffle').classList.toggle('on', state.shuffleOn);
  $('ovRepeat').classList.toggle('on', state.repeatMode !== 'off');
  $('ovVol').value = volEl.value;
  setFill($('ovVol'));
}

function ovTime() {
  if (ov.hidden || ovDrag) return;
  const d = audio.duration || 0;
  ovWave.paint(d ? audio.currentTime / d : 0);
  $('ovCur').textContent = fmt(audio.currentTime);
  $('ovRem').textContent = '-' + fmt(d ? d - audio.currentTime : 0);
}

function updateOverlay() {
  if (ov.hidden) return;
  const t = state.tracks[state.cur];
  if (!t) return;
  $('ovTitle').textContent = t.name;
  retrigger($('ovTitle'), 'swap');
  retrigger($('ovArtist'), 'swap');
  const artistEl = $('ovArtist');
  artistEl.textContent = '';
  const badge = explicitBadge(t);
  if (badge) artistEl.appendChild(badge);
  artistEl.appendChild(document.createTextNode(subline(t)));
  const from = document.querySelector('.ovfrom');
  if (from) {
    const m = t.meta;
    const b = document.createElement('b');
    b.textContent = m && m.album ? m.album.toUpperCase() : 'CHANDOL.WAV';
    from.textContent = 'PLAYING FROM ';
    from.appendChild(b);
    if (m && m.trackNumber && m.trackCount > 1) from.appendChild(document.createTextNode(' · TRACK ' + m.trackNumber + ' OF ' + m.trackCount));
  }

  const c = $('ovCover');
  if (t.cover) { c.hidden = false; c.onerror = () => { c.hidden = true; }; c.src = t.cover; retrigger(c, 'swapimg'); } else { c.hidden = true; }
  ovWave.seed(t.id); ovWave.reset();
  loadLyrics(t);
  renderQueue();
  syncOv();
  ovTime();
}

function showLyr(msg) {
  const box = $('lyr');
  box.textContent = '';
  retrigger(box, 'fresh');
  lyrLines = []; lyrEls = []; lyrSynced = false;
  const d = document.createElement('div');
  d.className = 'lmsg'; d.textContent = msg;
  box.appendChild(d);
}

function lyrRetry(t) {
  const b = document.createElement('button');
  b.className = 'ovpill lyrtry';
  b.type = 'button';
  b.textContent = 'Try lrclib';
  b.addEventListener('click', () => {
    b.disabled = true;
    b.textContent = 'Searching\u2026';
    fetchLrclib(t).then((r) => {
      if (state.tracks[state.cur] !== t) return;
      if (r) applyLyrics(r);
      else { b.textContent = 'Nothing on lrclib'; }
    }).catch(() => { b.disabled = false; b.textContent = 'Try lrclib'; });
  });
  $('lyr').appendChild(b);
}

function applyLyrics(res) {
  lyrRes = res;
  if (!res) {
    const t = state.tracks[state.cur];
    const juice = t && t.juice;
    showLyr(juice ? 'No lyrics in the vault for this one.' : 'No lyrics found for this one.');
    if (juice) lyrRetry(t);
    return;
  }
  const box = $('lyr');
  const lines = res.synced ? parseLrc(res.synced) : [];
  box.textContent = '';
  retrigger(box, 'fresh');
  lyrEls = [];
  if (lines.length) {
    lyrSynced = true; lyrLines = lines; lyrActive = -2;
    lines.forEach((ln) => {
      const el = document.createElement('div');
      el.className = 'll'; el.textContent = censor(ln.text);
      el.onclick = () => { audio.currentTime = ln.t; };
      box.appendChild(el); lyrEls.push(el);
    });
    updateLyrics();
  } else {
    lyrSynced = false; lyrLines = [];
    String(res.plain || res.synced).split(/\r?\n/).forEach((txt) => {
      if (!txt.trim()) return;
      const el = document.createElement('div');
      el.className = 'll plain'; el.textContent = censor(txt.trim());
      box.appendChild(el);
    });
    $('ovLyrics').scrollTop = 0;
  }
}

function loadLyrics(t) {
  const token = ++lyrToken;
  lyrRes = null;
  showLyr('Loading lyrics...');
  fetchLyrics(t)
    .then((res) => { if (token === lyrToken) applyLyrics(res); })
    .catch(() => { if (token === lyrToken) showLyr("Couldn't load lyrics."); });
}

function updateLyrics() {
  if (ov.hidden || !lyrSynced || !lyrLines.length) return;
  const ts = audio.currentTime + 0.2;
  let idx = -1;
  for (let i = 0; i < lyrLines.length; i++) { if (lyrLines[i].t <= ts) idx = i; else break; }
  if (idx === lyrActive) return;
  lyrActive = idx;
  const base = idx < 0 ? 0 : idx;
  for (let j = 0; j < lyrEls.length; j++) {
    const dist = Math.abs(j - base), el = lyrEls[j];
    el.style.opacity = dist === 0 ? (idx < 0 ? 0.7 : 1) : Math.max(0.12, 0.6 - dist * 0.14);
    el.style.filter = dist === 0 ? 'none' : 'blur(' + Math.min(dist * 0.8, 4) + 'px)';
    el.classList.toggle('on', j === idx);
  }
  const cur2 = lyrEls[base], box = $('ovLyrics');
  if (cur2) box.scrollTo({ top: cur2.offsetTop - box.clientHeight / 2 + cur2.offsetHeight / 2, behavior: 'smooth' });
}

function renderQueue(animate) {
  renderQueueInto($('ovQueueList'), animate);
}

function ovSeekAt(e) {
  const rect = ovWaveEl.getBoundingClientRect();
  const f = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
  ovWave.paint(f);
  if (audio.duration) {
    $('ovCur').textContent = fmt(f * audio.duration);
    $('ovRem').textContent = '-' + fmt(audio.duration * (1 - f));
  }
  return f;
}

function initCoverTilt() {
  const cover = ov.querySelector('.ovcover');
  if (!cover || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const MAX = 10, SCALE = 1.025;
  const cur = { x: 0, y: 0, s: 1 }, tgt = { x: 0, y: 0, s: 1 };
  let rect = null, hovering = false, raf = 0, last = 0;

  const tf = (x, y, sc) => 'perspective(900px) rotateX(' + x.toFixed(2) + 'deg) rotateY(' + y.toFixed(2) + 'deg) scale(' + sc.toFixed(4) + ')';
  function frame(t) {
    const dt = Math.min(48, t - last || 16); last = t;
    const k = 1 - Math.exp(-dt / (hovering ? 85 : 170));
    cur.x += (tgt.x - cur.x) * k; cur.y += (tgt.y - cur.y) * k; cur.s += (tgt.s - cur.s) * k;
    const settled = Math.abs(tgt.x - cur.x) < 0.02 && Math.abs(tgt.y - cur.y) < 0.02 && Math.abs(tgt.s - cur.s) < 0.0005;
    if (settled) {
      raf = 0;
      if (hovering) cover.style.transform = tf(tgt.x, tgt.y, tgt.s);
      else { cover.style.transform = ''; cover.classList.remove('tilting'); }
      return;
    }
    cover.style.transform = tf(cur.x, cur.y, cur.s);
    raf = requestAnimationFrame(frame);
  }
  const kick = () => { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } };
  const aim = (px, py) => {
    const nx = Math.min(1, Math.max(0, (px - rect.left) / rect.width)) - 0.5;
    const ny = Math.min(1, Math.max(0, (py - rect.top) / rect.height)) - 0.5;
    tgt.y = nx * 2 * MAX; tgt.x = -ny * 2 * MAX; tgt.s = SCALE;
  };
  const leave = () => { hovering = false; rect = null; tgt.x = tgt.y = 0; tgt.s = 1; };

  cover.addEventListener('pointerenter', (e) => {
    if (e.pointerType !== 'mouse' || reduce.matches || document.documentElement.classList.contains('lite')) return;
    if (!raf) { cur.x = cur.y = 0; cur.s = 1; }
    rect = cover.getBoundingClientRect();
    hovering = true; cover.classList.add('tilting');
    aim(e.clientX, e.clientY); kick();
  });
  cover.addEventListener('pointermove', (e) => { if (rect) { aim(e.clientX, e.clientY); kick(); } }, { passive: true });
  cover.addEventListener('pointerleave', () => { leave(); kick(); });
  window.addEventListener('resize', () => { if (hovering) { leave(); kick(); } });
}

export function initOverlay() {
  initCoverTilt();
  on('trackchange', updateOverlay);

  ['play', 'pause'].forEach((ev) => audio.addEventListener(ev, syncOv));
  ['play', 'pause'].forEach((ev) => audio.addEventListener(ev, () => retrigger($('ovPlayIcon'), 'pop')));
  ['timeupdate', 'loadedmetadata', 'loadstart'].forEach((ev) => audio.addEventListener(ev, ovTime));
  audio.addEventListener('timeupdate', updateLyrics);
  on('lyricsettings', () => { if (lyrRes) applyLyrics(lyrRes); });
  volEl.addEventListener('input', () => { if (!ov.hidden) syncOv(); });
  window.addEventListener('resize', () => { if (!ov.hidden) { drawStaticStars($('ovStarsCv')); fitSoon(); } });
  window.addEventListener('orientationchange', fitSoon);
  if (window.ResizeObserver) new ResizeObserver(fitSoon).observe(ov);
  const mo = new MutationObserver(fitSoon);
  ['ovTitle', 'ovArtist'].forEach((id) => mo.observe($(id), { childList: true, characterData: true, subtree: true }));
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitSoon);

  $('ovClose').onclick = ovClose;
  $('ovFull').onclick = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else if (ov.requestFullscreen) ov.requestFullscreen().catch(() => {});
  };
  $('ovInfoBtn').onclick = () => openInfo(state.tracks[state.cur]);
  $('ovShareBtn').onclick = () => shareSong(state.tracks[state.cur]);
  $('ovQueueBtn').onclick = function () {
    const q = $('ovQueue');
    const isOpen = !q.hidden && !q.classList.contains('leaving');
    this.classList.toggle('on', !isOpen);
    if (isOpen) { hideAnimated(q, 300); return; }
    renderQueue(true);
    showAnimated(q);
    const active = q.querySelector('.qrow.active');
    if (active) active.scrollIntoView({ block: 'center' });
  };

  $('ovToggle').onclick = togglePlay;
  $('ovPrev').onclick = () => $('prev').click();
  $('ovNext').onclick = () => step(1, false);
  $('ovShuffle').onclick = () => { $('shuffle').click(); syncOv(); };
  $('ovRepeat').onclick = () => { $('repeat').click(); syncOv(); };
  $('ovVol').addEventListener('input', function () {
    volEl.value = this.value;
    volEl.dispatchEvent(new Event('input'));
    setFill(this);
  });

  ovWaveEl.addEventListener('pointerdown', (e) => {
    if (!audio.duration) return;
    ovDrag = true; ovWaveEl.setPointerCapture(e.pointerId); ovSeekAt(e);
  });
  ovWaveEl.addEventListener('pointermove', (e) => { if (ovDrag) ovSeekAt(e); });
  ovWaveEl.addEventListener('pointerup', (e) => {
    if (!ovDrag) return;
    audio.currentTime = ovSeekAt(e) * audio.duration;
    ovDrag = false;
  });

  $('dock-cv').onclick = ovOpen;
  $('dock-info').onclick = ovOpen;
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') ovClose(); });
}
