import { state, audio, on } from '../core/state.js';
import * as viz from './viz.js';

const SIDES = ['top', 'bottom', 'left', 'right'];

let box = null, wired = false, lastCover = '', fadeId = 0, lowAvg = 0, gate = 0;
const strips = {};
const sm = { top: 0, bottom: 0, left: 0, right: 0 };

function mount() {
  if (box) return box;
  box = document.createElement('div');
  box.className = 'edge';
  box.setAttribute('aria-hidden', 'true');
  SIDES.forEach((s) => {
    const i = document.createElement('i');
    i.className = s;
    box.appendChild(i);
    strips[s] = i;
  });
  document.body.appendChild(box);
  return box;
}

function paintSides(low, mid, high) {
  lowAvg += (low - lowAvg) * 0.05;
  const pulse = lowAvg > 0.03 ? Math.min(1, Math.max(0, (low - lowAvg) / lowAvg)) : 0;
  const beat = low * 0.5 + pulse * 0.62;
  const want = {
    left: beat + high * 0.12,
    right: beat + high * 0.22,
    top: beat * 0.92 + mid * 0.24,
    bottom: beat * 0.96 + mid * 0.17
  };
  gate += (1 - gate) * 0.045;
  if (gate > 0.999) gate = 1;
  SIDES.forEach((s) => {
    const t = Math.min(1, want[s] * 1.3);
    sm[s] += (t - sm[s]) * (t > sm[s] ? 0.55 : 0.1);
    strips[s].style.opacity = (Math.min(1, 0.08 + sm[s] * 0.92) * gate).toFixed(3);
  });
}

function stopFade() {
  if (fadeId) cancelAnimationFrame(fadeId);
  fadeId = 0;
}

function peakOpacity() {
  let m = 0;
  SIDES.forEach((s) => {
    const v = strips[s] ? parseFloat(strips[s].style.opacity || '0') || 0 : 0;
    if (v > m) m = v;
  });
  return m;
}

function fadeOut() {
  stopFade();
  SIDES.forEach((s) => { sm[s] = 0; });
  lowAvg = 0;
  gate = 0;
  const from = {};
  let any = false;
  SIDES.forEach((s) => {
    const v = strips[s] ? parseFloat(strips[s].style.opacity || '0') || 0 : 0;
    from[s] = v;
    if (v > 0.004) any = true;
  });
  if (!any || document.documentElement.classList.contains('no-anim')) {
    SIDES.forEach((s) => { if (strips[s]) strips[s].style.opacity = '0'; });
    return;
  }
  const t0 = performance.now();
  const step = (ts) => {
    const k = Math.min(1, (ts - t0) / 760);
    const e = 1 - Math.pow(1 - k, 3);
    SIDES.forEach((s) => { if (strips[s]) strips[s].style.opacity = (from[s] * (1 - e)).toFixed(3); });
    fadeId = k < 1 ? requestAnimationFrame(step) : 0;
  };
  fadeId = requestAnimationFrame(step);
}

function setGlow(c) {
  document.documentElement.style.setProperty('--glow', c);
}

function baseGlow() {
  lastCover = '';
  if (viz.getGlowSource() === 'cover') setGlow(viz.themeColor());
}

function colorFrom(t) {
  const src = viz.getGlowSource();
  if (src === 'theme') { lastCover = ''; setGlow(viz.themeColor()); return; }
  if (src === 'custom') { lastCover = ''; setGlow(viz.getGlowColor()); return; }
  const cover = (t && t.cover) || '';
  if (cover === lastCover) return;
  lastCover = cover;
  viz.colorFor(cover).then((c) => {
    if (cover === lastCover) setGlow(c);
  });
}

function run() {
  if (!viz.getGlow()) return;
  stopFade();
  mount();
  gate = document.documentElement.classList.contains('no-anim') ? 1 : Math.min(1, peakOpacity());
  colorFrom(state.tracks[state.cur]);
  if (!wired) wired = viz.wire(audio);
  viz.resume();
  viz.start(document.documentElement, [], paintSides);
}

function halt() {
  viz.stop();
  document.documentElement.style.setProperty('--amp', '0');
  fadeOut();
}

function apply() {
  if (!viz.getGlow()) {
    halt();
    setTimeout(() => { if (!viz.getGlow()) document.documentElement.classList.add('noedge'); }, 800);
    return;
  }
  stopFade();
  document.documentElement.classList.remove('noedge');
  lastCover = '';
  if (audio.paused) { baseGlow(); return; }
  run();
}

export function initEdgeGlow() {
  apply();
  audio.addEventListener('play', run);
  audio.addEventListener('pause', halt);
  audio.addEventListener('ended', halt);
  on('trackchange', (t) => {
    if (!viz.getGlow()) return;
    if (audio.paused) baseGlow(); else colorFrom(t);
  });
  on('glowsettings', apply);
}
