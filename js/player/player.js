
import { $, PLAY, PAUSE, fmt, setFill, retrigger, showAnimated, hideAnimated } from '../core/util.js';
import { state, audio, emit } from '../core/state.js';
import { createWave } from './waveform.js';

export const volEl = $('volume');

const waveEl = $('wave');
const wave = createWave(waveEl, 80);
let seeking = false;

// when another device is being controlled, connect.js takes over playing
let remoteHook = null;
export function setRemoteHook(h) { remoteHook = h; }

function showToast() { showAnimated($('toast')); }
function hideToast() { hideAnimated($('toast'), 300); }

let lastSec = -1;

function mediaState(st) {
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = st;
}

function mediaPosition() {
  if (!('mediaSession' in navigator) || !navigator.mediaSession.setPositionState) return;
  if (!audio.duration || !isFinite(audio.duration)) return;
  try {
    navigator.mediaSession.setPositionState({
      duration: audio.duration,
      position: Math.min(Math.max(audio.currentTime, 0), audio.duration),
      playbackRate: audio.playbackRate || 1
    });
  } catch (e) {}
}

function updateNow() {
  const t = state.tracks[state.cur];
  if (!t) return;
  $('title').textContent = t.name;
  $('artist').textContent = t.artist;
  retrigger($('title'), 'swap');
  retrigger($('artist'), 'swap');
  const cover = $('cover');
  if (t.cover) { cover.hidden = false; cover.onerror = () => { cover.hidden = true; }; cover.src = t.cover; retrigger(cover, 'swapimg'); }
  else cover.hidden = true;
  document.title = t.name + ' \u2013 chandol.wav';
  wave.seed(t.id); wave.reset(); wave.paint(0);
  $('cur').textContent = '0:00'; $('dur').textContent = t.dur ? fmt(t.dur) : '0:00';
  if ('mediaSession' in navigator && window.MediaMetadata) {
    navigator.mediaSession.metadata = new MediaMetadata({ title: t.name, artist: t.artist, artwork: t.cover ? [{ src: t.cover, sizes: '512x512' }] : [] });
  }
  emit('trackchange', t);
}

export function refreshNow() {
  if (state.cur >= 0) updateNow();
  $('toggleIcon').firstElementChild.setAttribute('d', audio.paused ? PLAY : PAUSE);
}

export function play(i) {
  if (i < 0 || i >= state.tracks.length) return;
  if (remoteHook && remoteHook.play(state.tracks[i])) return;
  hideToast();
  state.cur = i;
  audio.src = state.tracks[i].url;
  audio.play().catch(() => {});
  updateNow();
}

export function step(dir, auto) {
  if (remoteHook && !auto) { remoteHook.cmd(dir > 0 ? 'next' : 'prev'); return; }
  const view = state.queue || state.view;
  if (dir > 0 && state.upNext.length && !(auto && state.repeatMode === 'one')) {
    const q = state.upNext.shift();
    emit('queuechange', 'shift');
    play(state.tracks.indexOf(q));
    return;
  }
  if (!view.length) return;
  if (auto && state.repeatMode === 'one') { audio.currentTime = 0; audio.play().catch(() => {}); return; }
  let pos = view.indexOf(state.tracks[state.cur]);
  if (pos < 0 && state.lastCtx) pos = view.indexOf(state.lastCtx);
  let nextPos;
  if (state.shuffleOn && view.length > 1) {
    do { nextPos = Math.floor(Math.random() * view.length); } while (nextPos === pos);
  } else {
    nextPos = pos + dir;
    if (nextPos >= view.length) {
      if (auto && state.repeatMode === 'off') { audio.pause(); return; }
      nextPos = 0;
    }
    if (nextPos < 0) nextPos = view.length - 1;
  }
  play(state.tracks.indexOf(view[nextPos]));
}

export function togglePlay() {
  if (remoteHook) { remoteHook.cmd('toggle'); return; }
  if (state.cur < 0) { if ((state.queue || state.view).length) step(1, false); return; }
  if (audio.paused) audio.play().catch(() => {}); else audio.pause();
}

function seekFromEvent(e) {
  const rect = waveEl.getBoundingClientRect();
  const f = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
  wave.paint(f);
  if (audio.duration) $('cur').textContent = fmt(f * audio.duration);
  return f;
}

export function initPlayer() {
  wave.seed(1); wave.paint(0);

  waveEl.addEventListener('pointerdown', (e) => {
    if (!audio.duration) return;
    seeking = true; waveEl.setPointerCapture(e.pointerId); seekFromEvent(e);
  });
  waveEl.addEventListener('pointermove', (e) => { if (seeking) seekFromEvent(e); });
  waveEl.addEventListener('pointerup', (e) => {
    if (!seeking) return;
    audio.currentTime = seekFromEvent(e) * audio.duration;
    mediaPosition();
    seeking = false;
  });

  audio.addEventListener('play', () => {
    $('toggleIcon').firstElementChild.setAttribute('d', PAUSE);
    $('toggle').setAttribute('aria-label', 'Pause');
    document.body.classList.add('is-playing');
    retrigger($('toggleIcon'), 'pop');
    mediaState('playing');
    mediaPosition();
  });
  audio.addEventListener('pause', () => {
    $('toggleIcon').firstElementChild.setAttribute('d', PLAY);
    $('toggle').setAttribute('aria-label', 'Play');
    document.body.classList.remove('is-playing');
    retrigger($('toggleIcon'), 'pop');
    mediaState('paused');
    mediaPosition();
  });
  audio.addEventListener('ended', () => step(1, true));
  audio.addEventListener('loadedmetadata', () => { $('dur').textContent = fmt(audio.duration); mediaPosition(); });
  audio.addEventListener('timeupdate', () => {
    if (seeking || !audio.duration) return;
    wave.paint(audio.currentTime / audio.duration);
    $('cur').textContent = fmt(audio.currentTime);
    const sec = Math.floor(audio.currentTime);
    if (sec !== lastSec) { lastSec = sec; mediaPosition(); }
  });

  audio.addEventListener('error', () => { if (state.cur >= 0) showToast(); });
  $('toastX').onclick = hideToast;
  $('skip').onclick = () => { hideToast(); step(1, false); };
  $('retry').onclick = () => {
    hideToast();
    const t = audio.currentTime || 0;
    audio.load();
    audio.addEventListener('loadedmetadata', function once() {
      audio.removeEventListener('loadedmetadata', once);
      if (t > 0) audio.currentTime = t;
      audio.play().catch(() => {});
    });
  };

  try { const sv = localStorage.getItem('chandol-vol'); if (sv !== null) volEl.value = sv; } catch (e) {}
  audio.volume = volEl.value / 100; setFill(volEl);
  volEl.addEventListener('input', () => {
    audio.volume = volEl.value / 100; setFill(volEl);
    try { localStorage.setItem('chandol-vol', volEl.value); } catch (e) {}
  });

  $('toggle').onclick = togglePlay;
  $('next').onclick = () => step(1, false);
  $('prev').onclick = () => { if (audio.currentTime > 3) { audio.currentTime = 0; return; } step(-1, false); };
  $('shuffle').onclick = function () {
    state.shuffleOn = !state.shuffleOn;
    this.classList.toggle('on', state.shuffleOn);
    this.title = 'Shuffle: ' + (state.shuffleOn ? 'on' : 'off');
  };
  $('repeat').onclick = function () {
    state.repeatMode = state.repeatMode === 'off' ? 'all' : state.repeatMode === 'all' ? 'one' : 'off';
    this.classList.toggle('on', state.repeatMode !== 'off');
    this.title = 'Repeat: ' + state.repeatMode;
  };

  document.addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' && (e.target.type === 'search' || e.target.type === 'text')) return;
    if (e.code === 'Space' && tag !== 'button') { e.preventDefault(); togglePlay(); }
    else if (e.key === 'ArrowRight' && tag !== 'input') audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 5);
    else if (e.key === 'ArrowLeft' && tag !== 'input') audio.currentTime = Math.max(0, audio.currentTime - 5);
    else if (e.key === 'n' || e.key === 'N') step(1, false);
    else if (e.key === 'p' || e.key === 'P') $('prev').click();
  });

  if ('mediaSession' in navigator) {
    const handler = (name, fn) => {
      try { navigator.mediaSession.setActionHandler(name, fn); } catch (e) {}
    };
    handler('play', () => audio.play());
    handler('pause', () => audio.pause());
    handler('stop', () => audio.pause());
    handler('nexttrack', () => step(1, false));
    handler('previoustrack', () => step(-1, false));
    handler('seekto', (d) => {
      if (!d || typeof d.seekTime !== 'number') return;
      audio.currentTime = d.seekTime;
      mediaPosition();
    });
    handler('seekbackward', (d) => {
      audio.currentTime = Math.max(0, audio.currentTime - ((d && d.seekOffset) || 10));
      mediaPosition();
    });
    handler('seekforward', (d) => {
      audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + ((d && d.seekOffset) || 10));
      mediaPosition();
    });
  }
}
