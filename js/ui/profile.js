import { showAnimated, hideAnimated, fmt, el, txt } from '../core/util.js';
import { state } from '../core/state.js';
import { play } from '../player/player.js';
import { toast } from './toast.js';

const API = 'https://YOUR-RADIO-WORKER.YOUR-SUBDOMAIN.workers.dev';
const HUES = [[292, 330], [262, 300], [210, 262], [330, 12], [180, 230], [20, 48], [140, 190], [248, 288]];
const IMG_OK = /^https:\/\/i\.ibb\.co\//;
const PLAY_SVG = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';

function hash(s) { let h = 2166136261; for (const c of String(s || '').toLowerCase()) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }
function pair(name) { return HUES[hash(name) % HUES.length]; }

// a plain "no picture yet" avatar, same colors every time for the same name
export function defaultAvatarUrl(name) {
  const [a, b] = pair(name);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${a} 55% 62%)"/><stop offset="1" stop-color="hsl(${b} 50% 38%)"/></linearGradient></defs><rect width="64" height="64" fill="url(#g)"/><circle cx="32" cy="25" r="11" fill="#fff" fill-opacity=".85"/><path d="M11 60c2.5-12 11-18 21-18s18.5 6 21 18z" fill="#fff" fill-opacity=".85"/></svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}
export function defaultBanner(name) {
  const [a, b] = pair(name);
  return `radial-gradient(120% 140% at 15% 0%, hsl(${a} 60% 45% / .9), transparent 60%), radial-gradient(120% 140% at 100% 100%, hsl(${b} 55% 35% / .9), transparent 60%), #0d0a14`;
}
export function avatarImg(cls, u) {
  const s = document.createElement('span');
  s.className = cls;
  const img = document.createElement('img');
  img.alt = ''; img.decoding = 'async'; img.referrerPolicy = 'no-referrer';
  const fallback = defaultAvatarUrl(u && u.username);
  img.onerror = () => { if (img.src !== fallback) img.src = fallback; };
  img.src = u && u.avatar && IMG_OK.test(u.avatar) ? u.avatar : fallback;
  s.appendChild(img);
  return s;
}

const BADGES = {
  admin: { img: 'img/badge-admin.png', tip: 'Admin · runs chandol.wav' },
};
// one floating tooltip for every badge, attached to the page so scroll boxes can't cut it off
let tipEl = null;
function showTip(target) {
  if (!tipEl) { tipEl = document.createElement('div'); tipEl.className = 'btip'; tipEl.setAttribute('role', 'tooltip'); document.body.appendChild(tipEl); }
  tipEl.textContent = target.dataset.tip;
  tipEl.classList.add('show');
  const r = target.getBoundingClientRect();
  const w = tipEl.offsetWidth, h = tipEl.offsetHeight;
  let x = r.left + r.width / 2 - w / 2;
  x = Math.max(8, Math.min(innerWidth - w - 8, x));
  let y = r.top - h - 8;
  if (y < 8) y = r.bottom + 8;
  tipEl.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px)';
}
function hideTip() { if (tipEl) tipEl.classList.remove('show'); }
document.addEventListener('pointerover', (e) => { const b = e.target.closest && e.target.closest('.badge'); if (b) showTip(b); });
document.addEventListener('pointerout', (e) => { const b = e.target.closest && e.target.closest('.badge'); if (b && !b.contains(e.relatedTarget)) hideTip(); });
document.addEventListener('focusin', (e) => { if (e.target.classList && e.target.classList.contains('badge')) showTip(e.target); });
document.addEventListener('focusout', (e) => { if (e.target.classList && e.target.classList.contains('badge')) hideTip(); });
document.addEventListener('scroll', hideTip, true);

export function badgesFor(u) {
  const wrap = document.createElement('span');
  wrap.className = 'badges';
  const list = [];
  if (u && (u.role === 'admin' || u.admin || u.v === 2)) list.push('admin');
  list.forEach((k) => {
    const b = BADGES[k];
    const s = document.createElement('span');
    s.className = 'badge';
    s.tabIndex = 0;
    s.dataset.tip = b.tip;
    s.setAttribute('aria-label', b.tip);
    const i = document.createElement('img');
    i.src = b.img; i.alt = ''; i.decoding = 'async';
    s.appendChild(i);
    wrap.appendChild(s);
  });
  return wrap;
}

const keyOf = (t) => t.artistKey + ':' + t.id;
export const trackByKey = (k) => (k ? state.tracks.find((t) => keyOf(t) === k) || null : null);
export { keyOf };

export function favRow(k, cls) {
  const t = trackByKey(k);
  const row = el('div', cls || 'pfav');
  if (!t) { row.appendChild(txt('span', 'pfavnone', k ? 'That song isn’t on the site anymore' : 'No favorite song yet')); return row; }
  const art = el('span', 'pfavart');
  if (t.cover) { const i = el('img'); i.alt = ''; i.src = t.cover; art.appendChild(i); }
  row.appendChild(art);
  const mid = el('span', 'pfavmid');
  mid.appendChild(txt('b', null, t.name));
  mid.appendChild(txt('span', null, t.artist + (t.dur ? ' · ' + fmt(t.dur) : '')));
  row.appendChild(mid);
  const pb = el('button', 'pfavplay', PLAY_SVG);
  pb.type = 'button'; pb.title = 'Play'; pb.setAttribute('aria-label', 'Play ' + t.name);
  pb.onclick = () => { state.queue = null; state.queueName = ''; play(state.tracks.indexOf(t)); };
  row.appendChild(pb);
  return row;
}

let sheet, card, onEdit = null, meId = 0;
export function setProfileContext(editFn, myId) { onEdit = editFn; meId = myId || 0; }

function close() { hideAnimated(sheet, 260); document.body.style.overflow = ''; }
function ensure() {
  if (sheet) return;
  sheet = el('div', 'isheet psheet');
  sheet.hidden = true;
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', 'Profile');
  card = el('div', 'icard pcard');
  sheet.appendChild(card);
  document.body.appendChild(sheet);
  sheet.addEventListener('click', (e) => { if (e.target === sheet) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !sheet.hidden) close(); });
}

function render(u) {
  card.innerHTML = '';
  const ban = el('div', 'pban');
  if (u.banner && IMG_OK.test(u.banner)) { const i = el('img'); i.alt = ''; i.referrerPolicy = 'no-referrer'; i.src = u.banner; ban.appendChild(i); }
  else ban.style.background = defaultBanner(u.username);
  const x = el('button', 'x', '&times;'); x.type = 'button'; x.setAttribute('aria-label', 'Close'); x.onclick = close;
  ban.appendChild(x);
  card.appendChild(ban);
  const body = el('div', 'pbody');
  body.appendChild(avatarImg('pav', u));
  const name = el('div', 'pname');
  name.appendChild(txt('h2', null, u.username));
  name.appendChild(badgesFor(u));
  body.appendChild(name);
  if (u.created) body.appendChild(txt('p', 'pjoined', 'Joined ' + new Date(u.created).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })));
  if (u.bio) body.appendChild(txt('p', 'pbio', u.bio));
  body.appendChild(txt('h4', 'psec', 'Favorite song'));
  body.appendChild(favRow(u.fav));
  if (meId && u.id === meId && onEdit) {
    const eb = txt('button', 'abtn', 'Edit profile');
    eb.type = 'button'; eb.onclick = () => { close(); onEdit(); };
    body.appendChild(eb);
  }
  card.appendChild(body);
}

export async function openProfile(idOrUser) {
  ensure();
  if (typeof idOrUser === 'object' && idOrUser) { render(idOrUser); }
  else {
    card.innerHTML = '<div class="pban"></div><div class="pbody"><p class="pjoined">Loading…</p></div>';
    let data;
    try { const r = await fetch(API + '/users/' + Number(idOrUser)); data = await r.json(); if (!r.ok) throw new Error(data.error); }
    catch (e) { toast('That profile isn’t available'); return; }
    render(data.user);
  }
  showAnimated(sheet);
  document.body.style.overflow = 'hidden';
}
