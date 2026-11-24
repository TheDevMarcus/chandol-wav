const K_ON = 'chandol-radio-glow';
const K_AUTO = 'chandol-radio-glowauto';
const K_SRC = 'chandol-glow-source';
const K_COLOR = 'chandol-radio-glowcolor';
const DEFAULT_COLOR = '#eaa9f0';

function flag(key, fallback) {
  try { const v = localStorage.getItem(key); return v == null ? fallback : v === '1'; } catch (e) { return fallback; }
}
function setFlagRaw(key, on) {
  try { localStorage.setItem(key, on ? '1' : '0'); } catch (e) {}
}

export const getGlow = () => flag(K_ON, true);
export const getGlowAuto = () => flag(K_AUTO, true);

export function getGlowSource() {
  try {
    const v = localStorage.getItem(K_SRC);
    if (v === 'cover' || v === 'theme' || v === 'custom') return v;
    if (localStorage.getItem(K_AUTO) === '0') return 'custom';
  } catch (e) {}
  return 'cover';
}

export function setGlowSource(v) {
  try { localStorage.setItem(K_SRC, v); } catch (e) {}
}

export function themeColor() {
  const c = getComputedStyle(document.documentElement).getPropertyValue('--pink');
  return c.trim() || DEFAULT_COLOR;
}
export function getGlowColor() {
  try { return localStorage.getItem(K_COLOR) || DEFAULT_COLOR; } catch (e) { return DEFAULT_COLOR; }
}
export const setGlow = (on) => setFlagRaw(K_ON, on);
export const setGlowAuto = (on) => setFlagRaw(K_AUTO, on);
export function setGlowColor(hex) {
  try { localStorage.setItem(K_COLOR, hex); } catch (e) {}
}

let actx = null, analyser = null, freq = null, wired = false, failed = false;

export function wire(audio) {
  if (wired || failed) return wired;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) { failed = true; return false; }
  try {
    actx = new AC();
    const src = actx.createMediaElementSource(audio);
    analyser = actx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.55;
    src.connect(analyser);
    analyser.connect(actx.destination);
    freq = new Uint8Array(analyser.frequencyBinCount);
    setBands();
    wired = true;
  } catch (e) {
    failed = true;
    wired = false;
  }
  return wired;
}

export function resume() {
  if (actx && actx.state === 'suspended') actx.resume().catch(() => {});
}

export const isLive = () => wired;

let bands = { low: [0, 1], mid: [3, 16], high: [21, 60] };

function setBands() {
  const w = actx.sampleRate / analyser.fftSize;
  const b = (hz) => Math.max(0, Math.min(freq.length - 1, Math.round(hz / w)));
  const lo = b(35), loEnd = Math.max(lo + 1, b(230));
  bands = { low: [lo, loEnd], mid: [Math.max(loEnd + 1, b(500)), b(3000)], high: [b(4200), b(11000)] };
}

const avg = (from, to) => {
  let s = 0, n = 0;
  for (let i = from; i <= to && i < freq.length; i++) { s += freq[i]; n++; }
  return n ? s / n / 255 : 0;
};

let rafId = 0, scene = null, bars = [], amp = 0, lastPaint = 0, bandSmooth = [], onFrame = null;

function frame(ts) {
  rafId = requestAnimationFrame(frame);
  if (ts - lastPaint < 33) return;
  lastPaint = ts;
  if (!wired || !scene) return;
  analyser.getByteFrequencyData(freq);
  const low = avg(bands.low[0], bands.low[1]);
  const target = Math.min(1, low * 1.25);
  amp += (target - amp) * 0.35;
  scene.style.setProperty('--amp', amp.toFixed(3));
  if (onFrame) onFrame(low, avg(bands.mid[0], bands.mid[1]), avg(bands.high[0], bands.high[1]), amp);
  if (!bars.length) return;
  const top = Math.max(bars.length + 1, bands.high[1]);
  const step = Math.max(1, Math.floor((top - 1) / bars.length));
  for (let i = 0; i < bars.length; i++) {
    const v = avg(1 + i * step, 1 + i * step + step - 1);
    const prev = bandSmooth[i] || 0;
    const next = prev + (v - prev) * 0.45;
    bandSmooth[i] = next;
    bars[i].style.transform = 'scaleY(' + (0.14 + Math.min(1, next * 1.5) * 0.86).toFixed(3) + ')';
  }
}

export function start(sceneEl, barEls, cb) {
  scene = sceneEl;
  bars = barEls || [];
  onFrame = cb || null;
  bandSmooth = bars.map(() => 0);
  if (!wired) return;
  if (!rafId) rafId = requestAnimationFrame(frame);
}

export function stop() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = 0;
  amp = 0;
  onFrame = null;
  if (scene) scene.style.setProperty('--amp', '0');
  bars.forEach((b) => { b.style.transform = ''; });
}

const colorCache = new Map();

function hueOf(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (d === 0) return -1;
  let h;
  if (mx === r) h = ((g - b) / d) % 6;
  else if (mx === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

function pick(img) {
  const n = 32;
  const c = document.createElement('canvas');
  c.width = n; c.height = n;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, n, n);
  const d = g.getImageData(0, 0, n, n).data;
  const BINS = 18;
  const w = new Float64Array(BINS), rr = new Float64Array(BINS), gg = new Float64Array(BINS), bb = new Float64Array(BINS);
  let gw = 0, gr = 0, gg2 = 0, gb = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 24) continue;
    const r = d[i], g1 = d[i + 1], b = d[i + 2];
    const mx = Math.max(r, g1, b) / 255, mn = Math.min(r, g1, b) / 255;
    const lum = (mx + mn) / 2;
    const sat = mx === 0 ? 0 : (mx - mn) / mx;
    const weight = (0.25 + sat * sat * 2.4) * (1 - Math.abs(lum - 0.52) * 1.25);
    if (weight <= 0) continue;
    gw += weight; gr += r * weight; gg2 += g1 * weight; gb += b * weight;
    const h = hueOf(r, g1, b);
    if (h < 0 || lum < 0.08 || lum > 0.96) continue;
    const k = Math.min(BINS - 1, Math.floor(h / (360 / BINS)));
    w[k] += weight; rr[k] += r * weight; gg[k] += g1 * weight; bb[k] += b * weight;
  }
  let best = -1, bestW = 0;
  for (let k = 0; k < BINS; k++) {
    const near = w[(k + BINS - 1) % BINS] * 0.5 + w[k] + w[(k + 1) % BINS] * 0.5;
    if (near > bestW) { bestW = near; best = k; }
  }
  let r2, g3, b2;
  if (best >= 0 && bestW > 0) {
    const a = (best + BINS - 1) % BINS, z = (best + 1) % BINS;
    const tw = w[a] * 0.5 + w[best] + w[z] * 0.5;
    r2 = (rr[a] * 0.5 + rr[best] + rr[z] * 0.5) / tw;
    g3 = (gg[a] * 0.5 + gg[best] + gg[z] * 0.5) / tw;
    b2 = (bb[a] * 0.5 + bb[best] + bb[z] * 0.5) / tw;
  } else if (gw > 0) {
    r2 = gr / gw; g3 = gg2 / gw; b2 = gb / gw;
  } else {
    return DEFAULT_COLOR;
  }
  r2 = Math.round(r2); g3 = Math.round(g3); b2 = Math.round(b2);
  const mx = Math.max(r2, g3, b2) / 255, mn = Math.min(r2, g3, b2) / 255;
  if (mx - mn < 0.05) return DEFAULT_COLOR;
  const l = (mx + mn) / 2;
  if (l < 0.42) {
    const boost = Math.min(1.7, 0.46 / Math.max(0.12, l));
    r2 = Math.min(255, Math.round(r2 * boost));
    g3 = Math.min(255, Math.round(g3 * boost));
    b2 = Math.min(255, Math.round(b2 * boost));
  } else if (l > 0.82) {
    r2 = Math.round(r2 * 0.88); g3 = Math.round(g3 * 0.88); b2 = Math.round(b2 * 0.88);
  }
  return 'rgb(' + r2 + ',' + g3 + ',' + b2 + ')';
}

export function colorFor(url) {
  if (!url) return Promise.resolve(DEFAULT_COLOR);
  if (colorCache.has(url)) return Promise.resolve(colorCache.get(url));
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      let col = DEFAULT_COLOR;
      try { col = pick(img); } catch (e) { col = DEFAULT_COLOR; }
      colorCache.set(url, col);
      resolve(col);
    };
    img.onerror = () => { colorCache.set(url, DEFAULT_COLOR); resolve(DEFAULT_COLOR); };
    img.src = url;
  });
}
