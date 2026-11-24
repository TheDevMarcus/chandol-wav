
import { state, on } from '../core/state.js';
import { getMatchCover } from '../pages/settings.js';
import { setStarColor } from './stars.js';

const root = document.documentElement;
let layers = [], front = 0, lastCover = '', token = 0;
let ovLayers = [], ovFront = 0;

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  return [h, s, l];
}
function hsl(h, s, l) { return `hsl(${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%)`; }
function hslToRgb(h, s, l) {
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)].map((x) => Math.round(x * 255));
}
const lum = ([r, g, b]) => {
  const c = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b);
};
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

function paletteOf(img) {
  const c = document.createElement('canvas');
  c.width = c.height = 40;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, 40, 40);
  const px = g.getImageData(0, 0, 40, 40).data;
  const buckets = Array.from({ length: 24 }, () => ({ w: 0, h: 0, s: 0, l: 0 }));
  let grey = { w: 0, l: 0 };
  for (let i = 0; i < px.length; i += 4) {
    const [h, s, l] = rgbToHsl(px[i], px[i + 1], px[i + 2]);
    if (l < 0.07 || l > 0.95) continue;
    if (s < 0.12) { grey.w++; grey.l += l; continue; }
    const w = s * (1 - Math.abs(l - 0.5) * 1.2);
    const bkt = buckets[Math.floor(h / 15) % 24];
    bkt.w += w; bkt.h += h * w; bkt.s += s * w; bkt.l += l * w;
  }
  const ranked = buckets.map((b, i) => ({ ...b, i })).filter((b) => b.w > 0).sort((a, b) => b.w - a.w);
  const col = (b) => [b.h / b.w, b.s / b.w, b.l / b.w];
  if (!ranked.length) return null;
  const a = col(ranked[0]);
  const far = ranked.find((b) => Math.min(Math.abs(b.i - ranked[0].i), 24 - Math.abs(b.i - ranked[0].i)) >= 3 && b.w > ranked[0].w * 0.12);
  const b = far ? col(far) : [(a[0] + 40) % 360, a[1], a[2]];
  return [a, b];
}

function ensureLayers() {
  if (layers.length) return;
  for (let i = 0; i < 2; i++) {
    const d = document.createElement('div');
    d.className = 'covertheme';
    d.setAttribute('aria-hidden', 'true');
    document.body.prepend(d);
    layers.push(d);
  }
}

function ensureOvLayers() {
  if (ovLayers.length) return true;
  const ov = document.getElementById('ov');
  if (!ov) return false;
  for (let i = 0; i < 2; i++) {
    const d = document.createElement('div');
    d.className = 'ovtheme';
    d.setAttribute('aria-hidden', 'true');
    ov.prepend(d);
    ovLayers.push(d);
  }
  return true;
}

function apply(pal) {
  ensureLayers();
  const [[h1, s1], [h2, s2]] = pal;
  const sat1 = Math.min(0.85, Math.max(0.45, s1)), sat2 = Math.min(0.85, Math.max(0.4, s2));
  const back = layers[1 - front];
  back.style.background =
    `radial-gradient(70% 60% at 15% 10%, ${hsl(h1, sat1, 0.26)} 0%, transparent 70%),` +
    `radial-gradient(60% 55% at 90% 85%, ${hsl(h2, sat2, 0.22)} 0%, transparent 70%),` +
    `radial-gradient(80% 70% at 60% 40%, ${hsl(h1, sat1 * 0.7, 0.1)} 0%, transparent 80%)`;
  back.classList.add('show');
  layers[front].classList.remove('show');
  front = 1 - front;

  const ovBg =
    `radial-gradient(ellipse at 28% 42%, ${hsl(h1, sat1, 0.24)}, transparent 62%),` +
    `radial-gradient(ellipse at 85% 90%, ${hsl(h2, sat2, 0.18)}, transparent 60%)`;
  root.style.setProperty('--ov-bg', ovBg + ', #05050a');
  if (ensureOvLayers()) {
    const ovBack = ovLayers[1 - ovFront];
    ovBack.style.background = ovBg;
    ovBack.classList.add('show');
    ovLayers[ovFront].classList.remove('show');
    ovFront = 1 - ovFront;
  }
  root.style.setProperty('--ov-glow', hsl(h1, sat1, 0.45).replace(')', ' / 0.22)'));

  root.style.setProperty('--pink', hsl(h1, Math.min(0.9, sat1 + 0.1), 0.78));
  root.style.setProperty('--pink2', hsl(h1, sat1, 0.64));
  root.style.setProperty('--active', hsl(h1, sat1 * 0.6, 0.17));
  root.classList.add('cover-themed');

  const bgRgb = hslToRgb(h1, sat1, 0.26);
  const sh = (h1 + 180) % 360;
  let l = 0.86, star = hslToRgb(sh, 0.7, l);
  while (contrast(star, bgRgb) < 7 && l < 0.97) { l += 0.02; star = hslToRgb(sh, 0.6, l); }
  setStarColor(`rgb(${star.join(',')})`);
}

function reset() {
  layers.forEach((d) => d.classList.remove('show'));
  ovLayers.forEach((d) => d.classList.remove('show'));
  ['--pink', '--pink2', '--active', '--ov-bg', '--ov-glow'].forEach((v) => root.style.removeProperty(v));
  root.classList.remove('cover-themed');
  setStarColor('#ffffff');
  lastCover = '';
}

function update() {
  const t = state.tracks[state.cur];
  if (!getMatchCover() || !t || !t.cover) { if (!getMatchCover() || !t) reset(); return; }
  if (t.cover === lastCover) return;
  lastCover = t.cover;
  const my = ++token;
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.decoding = 'async';
  img.onload = () => {
    if (my !== token) return;
    try {
      const pal = paletteOf(img);
      if (pal) apply(pal); else reset();
    } catch (e) { reset(); }
  };
  img.onerror = () => { if (my === token) reset(); };
  img.src = t.cover;
}

export function refreshCoverTheme() { lastCover = ''; update(); }

export function initCoverTheme() {
  on('trackchange', update);
  on('coversetting', refreshCoverTheme);
  update();
}
