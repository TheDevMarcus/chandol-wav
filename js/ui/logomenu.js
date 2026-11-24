import { $ } from '../core/util.js';
import { go } from '../core/router.js';
import { setArtist } from '../pages/tracks.js';
import { juiceOn, toggleJuice } from '../core/juice.js';

let menu = null;
let mark = null;

function item(label, sub, fn) {
  const b = document.createElement('button');
  b.className = 'mitem';
  b.type = 'button';
  b.setAttribute('role', 'menuitem');
  const wrap = document.createElement('span');
  const t = document.createElement('b');
  t.textContent = label;
  wrap.appendChild(t);
  if (sub) {
    const m = document.createElement('small');
    m.textContent = sub;
    wrap.appendChild(m);
  }
  b.appendChild(wrap);
  b.addEventListener('click', () => { close(); fn(); });
  return b;
}

function build() {
  menu.textContent = '';
  const j = juiceOn();
  menu.appendChild(item('Home', 'Every song', () => { setArtist('all'); go('/tracks'); }));
  menu.appendChild(item('chandol.wav', j ? 'Switch back' : 'Playing now', () => {
    if (j) toggleJuice();
    go('/tracks');
  }));
  menu.appendChild(item('juice.wav', j ? 'Playing now' : 'Juice WRLD vault', () => {
    if (!j) toggleJuice();
  }));
}

function isOpen() {
  return menu && !menu.hidden;
}

function open() {
  if (!menu) return;
  build();
  menu.hidden = false;
  if (mark) mark.setAttribute('aria-expanded', 'true');
}

function close() {
  if (!menu || menu.hidden) return;
  menu.hidden = true;
  if (mark) mark.setAttribute('aria-expanded', 'false');
}

export function initLogoMenu() {
  menu = $('logoMenu');
  mark = document.querySelector('.mark');
  if (!menu || !mark) return;
  mark.setAttribute('aria-haspopup', 'true');
  mark.setAttribute('aria-expanded', 'false');
  mark.addEventListener('click', (e) => {
    e.preventDefault();
    if (isOpen()) close(); else open();
  });
  document.addEventListener('click', (e) => {
    if (!isOpen()) return;
    if (menu.contains(e.target) || mark.contains(e.target)) return;
    close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });
}
