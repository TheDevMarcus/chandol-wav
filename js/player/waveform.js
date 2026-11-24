
export function createWave(el, count) {
  const bars = [];
  for (let i = 0; i < count; i++) {
    const b = document.createElement('i');
    el.appendChild(b);
    bars.push(b);
  }
  let done = -1;

  return {
    seed(seed) {
      let x = (Number(seed) || 1) * 9301 + 49297;
      for (let i = 0; i < count; i++) {
        x = (x * 9301 + 49297) % 233280;
        const r = x / 233280;
        const env = 0.5 + 0.5 * Math.sin(i / count * Math.PI);
        bars[i].style.height = Math.round(18 + (r * 0.75 + 0.25 * env) * 82) + '%';
      }
    },
    paint(frac) {
      const n = Math.round(frac * count);
      if (n === done) return;
      for (let i = 0; i < count; i++) bars[i].classList.toggle('done', i < n);
      done = n;
      el.setAttribute('aria-valuenow', String(Math.round(frac * 100)));
    },
    reset() { done = -1; }
  };
}
