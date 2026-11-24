export const $ = (id) => document.getElementById(id);

export const PLAY = 'M8 5v14l11-7z';
export const PAUSE = 'M6 5h4v14H6zm8 0h4v14h-4z';

export function fmt(sec) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return m + ':' + (s < 10 ? '0' : '') + s;
}

export function setFill(el) {
  el.style.setProperty('--fill', ((el.value - el.min) / (el.max - el.min) * 100) + '%');
}

export function imgWithFallback(src) {
  const img = document.createElement('img');
  img.alt = ''; img.loading = 'lazy';
  img.onerror = () => img.remove();
  img.onload = () => img.classList.add('loaded');
  img.src = src;
  return img;
}

export function retrigger(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

export function showAnimated(el) {
  clearTimeout(el._hideTimer);
  el.classList.remove('leaving');
  el.hidden = false;
}

export function hideAnimated(el, ms = 320) {
  if (el.hidden || el.classList.contains('leaving')) return;
  el.classList.add('leaving');
  clearTimeout(el._hideTimer);
  el._hideTimer = setTimeout(() => {
    el.hidden = true;
    el.classList.remove('leaving');
  }, ms);
}

export function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}

export function txt(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
