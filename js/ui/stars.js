
let starColor = '#ffffff';
let cur = [255, 255, 255], goal = [255, 255, 255], tweening = false;
let redraw = null;
let staticCanvas = null, staticPts = null, staticW = 0, staticH = 0;

const noAnim = () => document.documentElement.classList.contains('no-anim');

function parseRgb(c) {
  if (!c) return [255, 255, 255];
  if (c.charAt(0) === '#') {
    const h = c.length === 4 ? c.slice(1).split('').map((x) => x + x).join('') : c.slice(1);
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  const m = c.match(/-?\d+(\.\d+)?/g);
  return m && m.length >= 3 ? [+m[0], +m[1], +m[2]] : [255, 255, 255];
}

function starRgba(a) {
  return 'rgba(' + Math.round(cur[0]) + ',' + Math.round(cur[1]) + ',' + Math.round(cur[2]) + ',' + a + ')';
}

function paintAll() {
  starColor = 'rgb(' + Math.round(cur[0]) + ',' + Math.round(cur[1]) + ',' + Math.round(cur[2]) + ')';
  if (redraw) redraw();
  if (staticCanvas && staticCanvas.isConnected) paintStatic();
}

export function setStarColor(c) {
  goal = parseRgb(c);
  if (noAnim()) { cur = goal.slice(); paintAll(); return; }
  if (tweening) return;
  tweening = true;
  const step = () => {
    let done = true;
    for (let i = 0; i < 3; i++) {
      cur[i] += (goal[i] - cur[i]) * 0.08;
      if (Math.abs(goal[i] - cur[i]) > 0.6) done = false;
    }
    if (done) cur = goal.slice();
    paintAll();
    if (done) { tweening = false; return; }
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export function initStars(canvas) {
  const ctx = canvas.getContext('2d');
  let stars = [];
  const meteors = [];
  let nextMeteor = 4000, lastT = 0;
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function spawnMeteor() {
    const dir = Math.random() < 0.5 ? 1 : -1;
    const ang = (18 + Math.random() * 22) * Math.PI / 180;
    const sp = 0.9 + Math.random() * 0.6;
    meteors.push({
      x: dir > 0 ? Math.random() * innerWidth * 0.7 : innerWidth * 0.3 + Math.random() * innerWidth * 0.7,
      y: Math.random() * innerHeight * 0.45,
      ux: dir * Math.cos(ang), uy: Math.sin(ang), sp: sp,
      len: 90 + Math.random() * 90, life: 0, max: 650 + Math.random() * 500
    });
  }
  function drawMeteors(t, dt) {
    if (!reduce && !document.documentElement.classList.contains('lite') && t > nextMeteor) { spawnMeteor(); nextMeteor = t + 6000 + Math.random() * 9000; }
    for (let i = meteors.length - 1; i >= 0; i--) {
      const m = meteors[i];
      m.life += dt;
      if (m.life >= m.max) { meteors.splice(i, 1); continue; }
      m.x += m.ux * m.sp * dt; m.y += m.uy * m.sp * dt;
      const a = Math.sin(Math.PI * m.life / m.max);
      const tx = m.x - m.ux * m.len, ty = m.y - m.uy * m.len;
      const g = ctx.createLinearGradient(m.x, m.y, tx, ty);
      g.addColorStop(0, starColor);
      g.addColorStop(0.02, starRgba(a));
      g.addColorStop(1, starRgba(0));
      ctx.strokeStyle = g; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(tx, ty); ctx.stroke();
    }
  }

  function resizeStars() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.round(innerWidth * innerHeight / 5500);
    stars = [];
    for (let i = 0; i < n; i++) {
      stars.push({
        x: Math.random() * innerWidth, y: Math.random() * innerHeight,
        r: Math.random() * 1.1 + 0.25, base: Math.random() * 0.6 + 0.25,
        sp: Math.random() * 1.6 + 0.4, ph: Math.random() * 6.28
      });
    }
    drawStars(0);
  }
  function drawStars(t) {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      const a = (reduce || noAnim()) ? s.base : s.base * (0.65 + 0.35 * Math.sin(t / 1000 * s.sp + s.ph));
      ctx.globalAlpha = a;
      ctx.fillStyle = starColor;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.2832); ctx.fill();
    }
    ctx.globalAlpha = 1;
    const dt = Math.max(0, Math.min(t - lastT, 50));
    lastT = t;
    drawMeteors(t, dt);
  }
  let lastFrame = 0;
  function loopStars(t) {
    requestAnimationFrame(loopStars);
    if (document.body.classList.contains('ov-open') || t - lastFrame < 33) return;
    lastFrame = t;
    drawStars(t);
  }

  window.addEventListener('resize', resizeStars);
  redraw = () => drawStars(performance.now());
  resizeStars();
  if (!reduce) requestAnimationFrame(loopStars);
}

function paintStatic() {
  const cv = staticCanvas;
  if (!cv) return;
  const c = cv.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = innerWidth, h = innerHeight;
  if (!staticPts || staticW !== w || staticH !== h) {
    staticW = w; staticH = h;
    const n = Math.round(w * h / 6000);
    staticPts = [];
    for (let i = 0; i < n; i++) {
      staticPts.push({ x: Math.random() * w, y: Math.random() * h, r: Math.random() * 1.1 + 0.25, a: Math.random() * 0.6 + 0.2 });
    }
  }
  cv.width = w * dpr; cv.height = h * dpr;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, w, h);
  c.fillStyle = starColor;
  for (let i = 0; i < staticPts.length; i++) {
    const p = staticPts[i];
    c.globalAlpha = p.a;
    c.beginPath(); c.arc(p.x, p.y, p.r, 0, 6.2832); c.fill();
  }
  c.globalAlpha = 1;
}

export function drawStaticStars(cv) {
  staticCanvas = cv;
  paintStatic();
}
