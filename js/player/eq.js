
import { $, showAnimated, hideAnimated, el } from '../core/util.js';
import { audio, on, emit } from '../core/state.js';

const BANDS = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
const MAX_DB = 12;
const PRESETS = {
  'Flat':         [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  'Bass Boost':   [6, 5.5, 4.5, 3, 1, 0, 0, 0, 0, 0],
  'Bass Cut':     [-6, -5, -4, -2.5, -1, 0, 0, 0, 0, 0],
  'Treble Boost': [0, 0, 0, 0, 0, 1, 2.5, 4, 5, 6],
  'Vocal':        [-2, -2, -1, 1, 3, 4, 3.5, 2, 0, -1],
  'Pop':          [-1, 0, 1.5, 3, 3.5, 2, 0, -0.5, -0.5, -1],
  'Rock':         [4, 3, 2, 0.5, -1, -0.5, 1.5, 3, 4, 4.5],
  'Hip-Hop':      [5, 4.5, 2.5, 1, -0.5, -0.5, 1, 0.5, 1.5, 2.5],
  'Acoustic':     [3, 3, 2, 0.5, 1, 1, 2, 2.5, 2, 1.5],
  'Loudness':     [5, 4, 1, 0, -1, 0, 0, 1, 3, 4],
  'Lo-fi':        [2, 2, 1, 0, 0, -1, -3, -5, -7, -9],
  'Late Night':   [-3, -2, -1, 0, 1, 1.5, 1, 0, -1, -2],
};
const KEY = 'chandol-eq';

const label = (f) => (f >= 1000 ? f / 1000 + 'k' : String(f));
const dbStr = (v) => (v > 0 ? '+' : '') + (Math.round(v * 10) / 10) + ' dB';

let cfg = { on: false, gains: PRESETS.Flat.slice(), preset: 'Flat' };
try {
  const s = JSON.parse(localStorage.getItem(KEY) || 'null');
  if (s && Array.isArray(s.gains) && s.gains.length === BANDS.length) cfg = { on: !!s.on, gains: s.gains.map(Number), preset: s.preset || 'Custom' };
} catch (e) {}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) {} };

const FX_KEY = 'chandol-fx';
const FX_PRESETS = {
  'Normal':          { speed: 1,    reverb: 0,    room: 2.5 },
  'Slowed':          { speed: 0.85, reverb: 0,    room: 2.5 },
  'Slowed + Reverb': { speed: 0.8,  reverb: 0.45, room: 3.2 },
  'Sped Up':         { speed: 1.2,  reverb: 0,    room: 2.5 },
  'Nightcore':       { speed: 1.3,  reverb: 0.08, room: 1.6 },
  'Daycore':         { speed: 0.75, reverb: 0.25, room: 2.6 },
  'Dreamy':          { speed: 0.9,  reverb: 0.65, room: 4.5 },
  'Concert Hall':    { speed: 1,    reverb: 0.4,  room: 3.8 },
};
let fx = { speed: 1, reverb: 0, room: 2.5, keepPitch: false, preset: 'Normal' };
try {
  const s = JSON.parse(localStorage.getItem(FX_KEY) || 'null');
  if (s && typeof s.speed === 'number') fx = { ...fx, ...s };
} catch (e) {}
const saveFx = () => { try { localStorage.setItem(FX_KEY, JSON.stringify(fx)); } catch (e) {} };
const fxActive = () => fx.speed !== 1 || fx.reverb > 0;
const eqActive = () => cfg.on && cfg.preset !== 'Flat';

let ctx = null, pre, filters = [], limiter, analyser, dry, wet, conv, irRoom = 0, irTimer = 0;

function build() {
  if (ctx) return true;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return false;
  try {
    ctx = new AC();
    const src = ctx.createMediaElementSource(audio);
    pre = ctx.createGain();
    filters = BANDS.map((f, i) => {
      const b = ctx.createBiquadFilter();
      b.type = i === 0 ? 'lowshelf' : i === BANDS.length - 1 ? 'highshelf' : 'peaking';
      b.frequency.value = f;
      b.Q.value = 1.1;
      return b;
    });
    limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -1;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.25;
    analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.82;
    let node = src.connect(pre);
    filters.forEach((f) => { node = node.connect(f); });
    dry = ctx.createGain();
    wet = ctx.createGain();
    conv = ctx.createConvolver();
    node.connect(dry).connect(limiter);
    node.connect(conv).connect(wet).connect(limiter);
    limiter.connect(analyser).connect(ctx.destination);
    makeIR();
    apply(true);
    applyFx(true);
    return true;
  } catch (e) {
    console.warn('EQ unavailable:', e);
    ctx = null;
    return false;
  }
}

function apply(instant) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const gains = cfg.on ? cfg.gains : BANDS.map(() => 0);
  filters.forEach((f, i) => {
    if (instant) f.gain.value = gains[i];
    else f.gain.setTargetAtTime(gains[i], t, 0.03);
  });
  const boost = Math.max(0, ...gains);
  const preDb = -boost * 0.6;
  const g = Math.pow(10, preDb / 20);
  if (instant) pre.gain.value = g; else pre.gain.setTargetAtTime(g, t, 0.03);
}

function makeIR() {
  irRoom = fx.room;
  const rate = ctx.sampleRate;
  const len = Math.max(1, Math.floor(rate * fx.room));
  const delay = Math.floor(rate * 0.018);
  const buf = ctx.createBuffer(2, len, rate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      if (i < delay) { d[i] = 0; continue; }
      const x = (i - delay) / (len - delay);
      lp += (0.62 - 0.5 * x) * ((Math.random() * 2 - 1) - lp);
      d[i] = lp * Math.pow(1 - x, 2.4);
    }
  }
  conv.buffer = buf;
}

function applyRate() {
  audio.defaultPlaybackRate = fx.speed;
  audio.playbackRate = fx.speed;
  audio.preservesPitch = fx.keepPitch;
  audio.mozPreservesPitch = fx.keepPitch;
  audio.webkitPreservesPitch = fx.keepPitch;
}

function applyFx(instant) {
  applyRate();
  if (!ctx) return;
  if (irRoom !== fx.room) { clearTimeout(irTimer); irTimer = setTimeout(makeIR, instant ? 0 : 150); }
  const t = ctx.currentTime;
  const d = 1 - fx.reverb * 0.45, w = fx.reverb * 1.3;
  if (instant) { dry.gain.value = d; wet.gain.value = w; }
  else { dry.gain.setTargetAtTime(d, t, 0.05); wet.gain.setTargetAtTime(w, t, 0.05); }
}

function wake() {
  if (!build()) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
}

let pop, btn, canvas, sliders = [], readouts = [], presetBtns = {}, toggle, isOpen = false, raf = 0;
let tab = 'fx', tabBtns = {}, panels = {}, fxBtns = {}, speedIn, speedOut, revIn, revOut, roomIn, roomOut, pitchBox;
try { tab = localStorage.getItem('chandol-sound-tab') || 'fx'; } catch (e) {}

function rangeRow(labelText, min, max, step, oninput) {
  const row = el('label', 'fx-row');
  const top = el('span', 'fx-top');
  const name = el('span', 'fx-name');
  name.textContent = labelText;
  const out = el('span', 'fx-val');
  top.append(name, out);
  const r = el('input', 'fx-range');
  r.type = 'range'; r.min = String(min); r.max = String(max); r.step = String(step);
  r.oninput = () => oninput(Number(r.value));
  row.append(top, r);
  return { row, input: r, out };
}

function buildFx(panel) {
  const grid = el('div', 'fx-presets');
  Object.keys(FX_PRESETS).forEach((name) => {
    const b = el('button', 'fx-preset');
    b.type = 'button';
    const p = FX_PRESETS[name];
    b.innerHTML = '<b></b><span></span>';
    b.querySelector('b').textContent = name;
    b.querySelector('span').textContent = (p.speed === 1 ? '1×' : p.speed + '×') + (p.reverb ? ' · reverb ' + Math.round(p.reverb * 100) + '%' : '');
    b.onclick = () => setFxPreset(name);
    grid.appendChild(b);
    fxBtns[name] = b;
  });
  panel.appendChild(grid);

  const sp = rangeRow('Speed', 0.5, 1.5, 0.01, (v) => { fx.speed = Math.round(v * 100) / 100; fxChanged(); });
  const rv = rangeRow('Reverb', 0, 100, 1, (v) => { fx.reverb = v / 100; if (fx.reverb > 0) wake(); fxChanged(); });
  const rm = rangeRow('Room size', 0.8, 6, 0.1, (v) => { fx.room = Math.round(v * 10) / 10; fxChanged(); });
  speedIn = sp.input; speedOut = sp.out; revIn = rv.input; revOut = rv.out; roomIn = rm.input; roomOut = rm.out;
  speedIn.ondblclick = () => { fx.speed = 1; fxChanged(); };
  revIn.ondblclick = () => { fx.reverb = 0; fxChanged(); };
  panel.append(sp.row, rv.row, rm.row);

  const pr = el('label', 'srow swrow fx-pitch');
  pr.innerHTML = '<span class="stext"><strong>Keep original pitch</strong><br><small>Off = slowed sounds deeper, sped up sounds higher (the classic sound)</small></span>';
  pitchBox = el('input', 'sw');
  pitchBox.type = 'checkbox';
  pitchBox.setAttribute('role', 'switch');
  pitchBox.onchange = () => { fx.keepPitch = pitchBox.checked; fxChanged(); };
  pr.appendChild(pitchBox);
  panel.appendChild(pr);
  panel.appendChild(el('p', 'eq-tip', 'Double-click a slider to reset it. Effects stay on for every song until you pick Normal.'));
}

function buildEq(panel) {
  const bar = el('div', 'eq-bar');
  const lbl = el('span', 'eq-onlbl', 'Equalizer');
  const right = el('div', 'eq-headr');
  const reset = el('button', 'eq-reset', 'Reset');
  reset.type = 'button';
  reset.onclick = () => setPreset('Flat');
  toggle = el('input', 'sw');
  toggle.type = 'checkbox';
  toggle.setAttribute('role', 'switch');
  toggle.setAttribute('aria-label', 'Equalizer on');
  toggle.title = 'Turn the EQ on or off';
  toggle.onchange = () => setOn(toggle.checked);
  right.append(reset, toggle);
  bar.append(lbl, right);
  panel.appendChild(bar);

  canvas = el('canvas', 'eq-graph');
  panel.appendChild(canvas);

  const bands = el('div', 'eq-bands');
  BANDS.forEach((f, i) => {
    const col = el('div', 'eq-band');
    const rd = el('span', 'eq-db');
    const s = el('input', 'eq-slider');
    s.type = 'range'; s.min = String(-MAX_DB); s.max = String(MAX_DB); s.step = '0.5';
    s.setAttribute('orient', 'vertical');
    s.setAttribute('aria-label', label(f) + ' Hz');
    s.oninput = () => {
      cfg.gains[i] = Number(s.value);
      if (!cfg.on) { cfg.on = true; toggle.checked = true; }
      cfg.preset = matchPreset();
      sync();
      wake(); apply(); save();
    };
    s.ondblclick = () => { cfg.gains[i] = 0; cfg.preset = matchPreset(); sync(); apply(); save(); };
    col.append(rd, s, el('span', 'eq-hz', label(f)));
    bands.appendChild(col);
    sliders.push(s); readouts.push(rd);
  });
  panel.appendChild(bands);

  const pre = el('div', 'eq-presets');
  Object.keys(PRESETS).forEach((name) => {
    const b = el('button', 'eq-preset', name);
    b.type = 'button';
    b.onclick = () => setPreset(name);
    pre.appendChild(b);
    presetBtns[name] = b;
  });
  panel.appendChild(pre);
  panel.appendChild(el('p', 'eq-tip', 'Double-click a slider to reset it. E opens and closes this panel.'));
}

function setTab(t) {
  tab = t;
  try { localStorage.setItem('chandol-sound-tab', t); } catch (e) {}
  Object.entries(tabBtns).forEach(([k, b]) => { b.classList.toggle('active', k === t); b.setAttribute('aria-selected', k === t ? 'true' : 'false'); });
  Object.entries(panels).forEach(([k, p]) => { p.hidden = k !== t; });
  pop.dataset.tab = t;
  if (t === 'eq' && isOpen && !raf) raf = requestAnimationFrame(loop);
}

function buildUI() {
  const wrap = el('div', 'eq-wrap');
  pop = el('section', 'eq');
  pop.hidden = true;
  pop.setAttribute('aria-label', 'Sound');

  const head = el('div', 'eq-head');
  head.appendChild(el('h3', null, '<svg viewBox="0 0 24 24"><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/></svg>Sound'));
  const tabs = el('div', 'snd-tabs');
  tabs.setAttribute('role', 'tablist');
  [['fx', 'Effects'], ['eq', 'Equalizer']].forEach(([k, name]) => {
    const b = el('button', 'snd-tab');
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.innerHTML = '<span></span><i class="snd-dot"></i>';
    b.querySelector('span').textContent = name;
    b.onclick = () => setTab(k);
    tabs.appendChild(b);
    tabBtns[k] = b;
  });
  head.appendChild(tabs);
  pop.appendChild(head);

  panels.fx = el('div', 'snd-panel');
  panels.eq = el('div', 'snd-panel');
  buildFx(panels.fx);
  buildEq(panels.eq);
  pop.append(panels.fx, panels.eq);

  wrap.appendChild(pop);
  document.body.appendChild(wrap);
  setTab(tab === 'eq' ? 'eq' : 'fx');
}

function matchFx() {
  for (const [name, p] of Object.entries(FX_PRESETS)) {
    if (Math.abs(p.speed - fx.speed) < 0.001 && Math.abs(p.reverb - fx.reverb) < 0.001 && (p.reverb === 0 || Math.abs(p.room - fx.room) < 0.05)) return name;
  }
  return 'Custom';
}

function fxChanged() {
  fx.preset = matchFx();
  applyFx();
  saveFx();
  sync();
}

function setFxPreset(name) {
  const p = FX_PRESETS[name];
  fx.speed = p.speed; fx.reverb = p.reverb; fx.room = p.room; fx.preset = name;
  if (fx.reverb > 0) wake();
  applyFx(); saveFx(); sync();
}

function syncFx() {
  if (!speedIn) return;
  speedIn.value = String(fx.speed);
  speedOut.textContent = fx.speed.toFixed(2) + '×';
  revIn.value = String(Math.round(fx.reverb * 100));
  revOut.textContent = Math.round(fx.reverb * 100) + '%';
  roomIn.value = String(fx.room);
  roomOut.textContent = fx.room.toFixed(1) + ' s';
  roomIn.disabled = fx.reverb === 0;
  roomIn.closest('.fx-row').classList.toggle('dim', fx.reverb === 0);
  pitchBox.checked = fx.keepPitch;
  [speedIn, revIn, roomIn].forEach((r) => r.style.setProperty('--fill', ((r.value - r.min) / (r.max - r.min) * 100) + '%'));
  Object.entries(fxBtns).forEach(([name, b]) => b.classList.toggle('active', name === fx.preset));
}

function matchPreset() {
  for (const [name, g] of Object.entries(PRESETS)) if (g.every((v, i) => v === cfg.gains[i])) return name;
  return 'Custom';
}

function sync() {
  toggle.checked = cfg.on;
  pop.classList.toggle('off', !cfg.on);
  btn.classList.toggle('on', eqActive() || fxActive());
  const bits = [];
  if (fxActive()) bits.push(fx.preset === 'Custom' ? fx.speed.toFixed(2) + '\u00d7' + (fx.reverb ? ' + reverb' : '') : fx.preset);
  if (eqActive()) bits.push('EQ ' + cfg.preset);
  btn.title = 'Sound' + (bits.length ? ': ' + bits.join(', ') : '') + ' (E)';
  if (tabBtns.fx) { tabBtns.fx.classList.toggle('lit', fxActive()); tabBtns.eq.classList.toggle('lit', eqActive()); }
  syncFx();
  sliders.forEach((s, i) => {
    s.value = String(cfg.gains[i]);
    s.style.setProperty('--fill', ((cfg.gains[i] + MAX_DB) / (2 * MAX_DB) * 100) + '%');
    readouts[i].textContent = cfg.gains[i] === 0 ? '0' : (cfg.gains[i] > 0 ? '+' : '') + cfg.gains[i];
    readouts[i].title = dbStr(cfg.gains[i]);
  });
  Object.entries(presetBtns).forEach(([name, b]) => b.classList.toggle('active', cfg.on && name === cfg.preset));
  draw();
}

function setPreset(name) {
  cfg.gains = PRESETS[name].slice();
  cfg.preset = name;
  cfg.on = name !== 'Flat' ? true : cfg.on;
  wake(); apply(); save(); sync();
}

function setOn(v) {
  cfg.on = v;
  if (v) wake();
  apply(); save(); sync();
}

const F_MIN = 20, F_MAX = 20000;
const xOf = (f, w) => (Math.log10(f / F_MIN) / Math.log10(F_MAX / F_MIN)) * w;

let measure = null;
function curveDb(freqs) {
  const out = new Float32Array(freqs.length);
  if (!measure) {
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (OAC) {
      try {
        const oc = new OAC(1, 1, 44100);
        measure = BANDS.map((f, i) => {
          const b = oc.createBiquadFilter();
          b.type = i === 0 ? 'lowshelf' : i === BANDS.length - 1 ? 'highshelf' : 'peaking';
          b.frequency.value = f;
          b.Q.value = 1.1;
          return b;
        });
      } catch (e) { measure = []; }
    } else measure = [];
  }
  if (measure.length) {
    const mag = new Float32Array(freqs.length), ph = new Float32Array(freqs.length);
    measure.forEach((f, k) => {
      f.gain.value = cfg.on ? cfg.gains[k] : 0;
      f.getFrequencyResponse(freqs, mag, ph);
      for (let i = 0; i < freqs.length; i++) out[i] += 20 * Math.log10(mag[i] || 1e-6);
    });
    return out;
  }
  for (let i = 0; i < freqs.length; i++) {
    let s = 0;
    BANDS.forEach((b, k) => {
      const g = cfg.on ? cfg.gains[k] : 0;
      const d = Math.log2(freqs[i] / b);
      if (k === 0) s += g / (1 + Math.exp(d * 3));
      else if (k === BANDS.length - 1) s += g / (1 + Math.exp(-d * 3));
      else s += g * Math.exp(-d * d * 1.6);
    });
    out[i] = s;
  }
  return out;
}

function draw() {
  if (!canvas || !isOpen || tab !== 'eq') return;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  }
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  const mid = h / 2;
  const yOf = (db) => mid - (db / (MAX_DB + 3)) * (h / 2 - 6);

  g.strokeStyle = 'rgba(255,255,255,.06)';
  g.lineWidth = 1;
  [100, 1000, 10000].forEach((f) => { const x = Math.round(xOf(f, w)) + 0.5; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); });
  [-12, -6, 6, 12].forEach((db) => { const y = Math.round(yOf(db)) + 0.5; g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); });
  g.strokeStyle = 'rgba(255,255,255,.14)';
  g.beginPath(); g.moveTo(0, Math.round(mid) + 0.5); g.lineTo(w, Math.round(mid) + 0.5); g.stroke();

  if (analyser && !audio.paused) {
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(data);
    const nyq = ctx.sampleRate / 2;
    const cols = Math.floor(w / 4);
    const grad = g.createLinearGradient(0, h, 0, 0);
    grad.addColorStop(0, 'rgba(59,140,240,.05)');
    grad.addColorStop(1, 'rgba(234,169,240,.35)');
    g.fillStyle = grad;
    for (let c = 0; c < cols; c++) {
      const f0 = F_MIN * Math.pow(F_MAX / F_MIN, c / cols), f1 = F_MIN * Math.pow(F_MAX / F_MIN, (c + 1) / cols);
      const i0 = Math.max(1, Math.floor((f0 / nyq) * data.length)), i1 = Math.max(i0 + 1, Math.ceil((f1 / nyq) * data.length));
      let v = 0;
      for (let i = i0; i < i1 && i < data.length; i++) v = Math.max(v, data[i]);
      const bh = (v / 255) * (h - 4);
      g.fillRect(c * 4, h - bh, 3, bh);
    }
  }

  const n = 160;
  const freqs = new Float32Array(n);
  for (let i = 0; i < n; i++) freqs[i] = F_MIN * Math.pow(F_MAX / F_MIN, i / (n - 1));
  const db = curveDb(freqs);
  g.beginPath();
  for (let i = 0; i < n; i++) { const x = xOf(freqs[i], w), y = yOf(Math.max(-MAX_DB - 3, Math.min(MAX_DB + 3, db[i]))); i ? g.lineTo(x, y) : g.moveTo(x, y); }
  g.strokeStyle = cfg.on ? '#eaa9f0' : 'rgba(255,255,255,.3)';
  g.lineWidth = 2.2;
  g.shadowColor = cfg.on ? 'rgba(234,169,240,.6)' : 'transparent';
  g.shadowBlur = 10;
  g.stroke();
  g.shadowBlur = 0;
  BANDS.forEach((f, k) => {
    const x = xOf(f, w), y = yOf(cfg.on ? cfg.gains[k] : 0);
    g.beginPath(); g.arc(x, y, 3.2, 0, Math.PI * 2);
    g.fillStyle = cfg.on ? '#fff' : 'rgba(255,255,255,.4)';
    g.fill();
  });
}

function loop() {
  draw();
  raf = isOpen && tab === 'eq' ? requestAnimationFrame(loop) : 0;
}

export function openEq() {
  if (isOpen) return;
  isOpen = true;
  emit('popup', 'eq');
  btn.classList.add('active');
  btn.setAttribute('aria-expanded', 'true');
  showAnimated(pop);
  sync();
  if (!raf && tab === 'eq') raf = requestAnimationFrame(loop);
}

export function closeEq() {
  if (!isOpen) return;
  isOpen = false;
  btn.classList.remove('active');
  btn.setAttribute('aria-expanded', 'false');
  hideAnimated(pop, 200);
}

export function initEq() {
  btn = $('eqBtn');
  if (!btn) return;
  audio.crossOrigin = 'anonymous';
  buildUI();
  sync();

  btn.onclick = () => (isOpen ? closeEq() : openEq());
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen) { closeEq(); return; }
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'e' || e.key === 'E') btn.click();
  });
  document.addEventListener('pointerdown', (e) => {
    if (isOpen && !pop.contains(e.target) && !e.target.closest('.dock')) closeEq();
  });
  on('popup', (who) => { if (who !== 'eq') closeEq(); });
  audio.addEventListener('play', () => { if (cfg.on || ctx || fx.reverb > 0) wake(); applyRate(); });
  audio.addEventListener('loadedmetadata', applyRate);
  applyRate();
  window.addEventListener('resize', () => { if (isOpen) draw(); });
}
