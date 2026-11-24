import { $, fmt, PAUSE, el, txt } from '../core/util.js';
import { state, audio, on, emit } from '../core/state.js';
import { refreshNow } from '../player/player.js';
import { toast } from '../ui/toast.js';
import { getToken, getUser, isLoggedIn, openAccount, apiCall } from '../ui/account.js';
import { avatarImg, openProfile, badgesFor } from '../ui/profile.js';
import { buildStage, setSong, tickLyrics } from './stage.js';
import * as viz from '../player/viz.js';

const WS_URL = 'wss://YOUR-RADIO-WORKER.YOUR-SUBDOMAIN.workers.dev/ws';
const GAP = 1500;
const LIVE_SVG = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="2.2"/><path d="M8.5 15.5a5 5 0 0 1 0-7M15.5 8.5a5 5 0 0 1 0 7M5.6 18.4a9 9 0 0 1 0-12.8M18.4 5.6a9 9 0 0 1 0 12.8"/></svg>';
const SKIP_SVG = '<svg viewBox="0 0 24 24"><path d="M5 5l10 7-10 7z"/><path d="M19 5v14"/></svg>';
const VOL_SVG = '<svg viewBox="0 0 24 24"><path d="M4 10v4h3l6 4V6L7 10H4z"/><path d="M16.5 9a4 4 0 0 1 0 6"/></svg>';
const X_SVG = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>';
const SEND_SVG = '<svg viewBox="0 0 24 24"><path d="M4 12l16-8-6 16-2-6z"/></svg>';

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
};
const cid = store.get('chandol-radio-id', '') || (() => {
  const id = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()).slice(0, 36);
  store.set('chandol-radio-id', id);
  return id;
})();
let guestName = store.get('chandol-radio-name', '');
let name = isLoggedIn() ? getUser().username : guestName;
const helloMsg = () => ({ type: 'hello', cid, name: isLoggedIn() ? '' : guestName, token: isLoggedIn() ? getToken() : '' });
let admin = false, banned = false;
const TRASH_SVG = '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>';
const BAN_SVG = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/></svg>';
async function adminAct(body, done) {
  const res = await apiCall('POST', '/admin/radio', body);
  if (res.status !== 200) { toast((res.data && res.data.error) || 'That didn’t work'); return; }
  if (done) toast(done);
}
const mine = new Set((() => { try { return JSON.parse(store.get('chandol-radio-mine', '[]')); } catch (e) { return []; } })());
const saveMine = () => store.set('chandol-radio-mine', JSON.stringify([...mine].slice(-10)));

const ra = new Audio();
ra.crossOrigin = 'anonymous';
ra.preload = 'auto';
ra.volume = Number(store.get('chandol-radio-vol', '0.9'));
if (new URLSearchParams(location.search).has('radiodebug')) window.__radio = ra;

let ws = null, wsOpen = false, retry = 0, retryTimer = 0;
let snap = null, skew = null, lastQ = '', lastBg = '', tuned = false, loadedKey = '', built = false, rafId = 0, driftTimer = 0;
const messages = [];

const serverNow = () => Date.now() + (skew || 0);
const elapsed = () => (snap && snap.now ? (serverNow() - snap.now.startedAt) / 1000 : 0);
const trackKey = (t) => t.artistKey + ':' + t.id;

function connect() {
  if (ws && (ws.readyState === 0 || ws.readyState === 1)) return;
  clearTimeout(retryTimer);
  try { ws = new WebSocket(WS_URL); } catch (e) { return later(); }
  ws.onopen = () => {
    wsOpen = true; retry = 0;
    send(helloMsg());
    if (tuned) send({ type: 'tune', on: true });
    paintStatus();
  };
  ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch (x) { return; } handle(m); };
  ws.onclose = () => { wsOpen = false; paintStatus(); later(); };
  ws.onerror = () => {};
}
function later() {
  clearTimeout(retryTimer);
  const need = tuned || !$('radioView').hidden;
  if (!need) return;
  retryTimer = setTimeout(connect, Math.min(15000, 1000 * 2 ** retry++));
}
function send(m) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); }

function handle(m) {
  if (m.type === 'state') {
    const sample = m.serverNow - Date.now();
    if (skew == null || sample > skew || sample < skew - 1500) skew = sample;
    const prev = snap && snap.now && snap.now.song.key;
    snap = m;
    if (m.queue) { const keep = new Set(m.queue.map((x) => x.song.key)); let ch = false; [...mine].forEach((k) => { if (!keep.has(k)) { mine.delete(k); ch = true; } }); if (ch) saveMine(); }
    paint();
    if (built) { if (m.now) setSong(m.now.song); }
    if (tuned) syncAudio(false);
    return;
  }
  if (m.type === 'chat-history') { messages.length = 0; messages.push(...m.messages); paintChat(true); return; }
  if (m.type === 'chat') { messages.push(m.message); if (messages.length > 200) messages.shift(); addMsg(m.message); return; }
  if (m.type === 'name-taken') { toast(m.text); guestName = ''; store.set('chandol-radio-name', ''); if (!isLoggedIn()) { name = ''; paintForm(); } return; }
  if (m.type === 'you') { if (isLoggedIn() && m.name) name = m.name; admin = !!m.admin; banned = !!m.banned; document.body.classList.toggle('radio-admin', admin); paint(); paintChat(); return; }
  if (m.type === 'banned') { banned = true; toast('You’ve been banned from the radio'); return; }
  if (m.type === 'error') { toast(m.text); return; }
  if (m.type === 'ok') { toast(m.text); }
}

function syncAudio(force) {
  if (!tuned || !snap || !snap.now) return;
  const s = snap.now.song;
  const at = elapsed();
  if (at < 0) { setTimeout(() => syncAudio(true), -at * 1000 + 20); return; }
  if (at > s.dur) return;
  if (loadedKey !== s.key) {
    loadedKey = s.key;
    ra.src = s.url;
    ra.addEventListener('loadedmetadata', () => { ra.currentTime = Math.min(elapsed(), s.dur - 0.5); ra.play().catch(blocked); }, { once: true });
    mediaSession(s);
    return;
  }
  if (ra.readyState >= 1 && !ra.seeking && (force || Math.abs(ra.currentTime - at) > 2)) ra.currentTime = at;
  if (ra.paused) ra.play().catch(blocked);
}
function blocked() {
  if (!tuned) return;
  toast('Tap Tune in to start the radio');
  setTuned(false);
}

function mediaSession(s) {
  if (!('mediaSession' in navigator)) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({ title: s.name, artist: s.artist + ' · chandol.wav radio', album: 'Radio', artwork: s.cover ? [{ src: s.cover, sizes: '512x512' }] : [] });
  } catch (e) {}
}

function setTuned(v) {
  tuned = v;
  document.body.classList.toggle('radio-on', v);
  if (v) {
    if (!audio.paused) audio.pause();
    viz.wire(ra);
    viz.resume();
    startViz();
    connect();
    send({ type: 'tune', on: true });
    syncAudio(true);
    clearInterval(driftTimer);
    driftTimer = setInterval(() => syncAudio(false), 5000);
  } else {
    ra.pause();
    loadedKey = '';
    clearInterval(driftTimer);
    viz.stop();
    send({ type: 'tune', on: false });
  }
  paint();
  paintChip();
}

ra.addEventListener('ended', () => { setTimeout(() => send({ type: 'sync' }), GAP + 200); });

/* ---------- page ---------- */
const smallScreen = () => window.matchMedia('(max-width: 700px)').matches;

function scene() {
  const root = $('radioView');
  return root ? root.querySelector('.stg') : null;
}

function startViz() {
  const sc = scene();
  if (!sc || smallScreen()) return;
  viz.start(sc, [].slice.call($('radioView').querySelectorAll('.stg-eq i')));
}

function applyGlow(cover) {
  const sc = scene();
  if (!sc) return;
  const on = viz.getGlow();
  sc.classList.toggle('noglow', !on);
  if (!on) return;
  if (viz.getGlowAuto()) viz.colorFor(cover).then((c) => { const s2 = scene(); if (s2) s2.style.setProperty('--glow', c); });
  else sc.style.setProperty('--glow', viz.getGlowColor());
}

function build() {
  if (built) return;
  built = true;
  const root = $('radioView');
  root.innerHTML = '';
  if (smallScreen()) {
    const no = el('div', 'rno');
    no.innerHTML = '<h2>Radio is desktop only</h2><p>The live radio needs a bigger screen for the stage, lyrics and chat. Open chandol.wav on a computer to tune in.</p>';
    root.appendChild(no);
    return;
  }
  const head = el('div', 'rhead');
  const h = el('h2', null, '<span class="rlive"><i></i>LIVE</span>Radio');
  head.appendChild(h);
  head.appendChild(txt('span', 'rcount', ''));
  root.appendChild(head);
  root.appendChild(txt('p', 'rsub', 'One station, everyone hears the same song at the same time. Request a song and it plays for everybody.'));

  buildStage(root);
  const grid = el('div', 'rgrid');
  const left = el('div', 'rleft');

  const np = el('section', 'rctl');
  np.innerHTML = '<div class="rinfo">' +
    '<div class="rbar"><span class="rpos">0:00</span><div class="rtrack"><i></i></div><span class="rdur">0:00</span></div>' +
    '<div class="rbtns"><button type="button" class="rtune pri">' + LIVE_SVG + '<span>Tune in</span></button>' +
    '<button type="button" class="rskip" title="Skip this song (admin)" hidden>' + SKIP_SVG + '<span>Skip</span></button>' +
    '<label class="rvol" title="Volume">' + VOL_SVG + '<input type="range" min="0" max="1" step="0.01" aria-label="Volume"></label></div></div>';
  root.appendChild(np);
  np.querySelector('.rtune').onclick = () => setTuned(!tuned);
  np.querySelector('.rskip').onclick = () => { if (admin) send({ type: 'skip' }); };
  const vol = np.querySelector('.rvol input');
  vol.value = String(ra.volume);
  vol.oninput = () => { ra.volume = Number(vol.value); store.set('chandol-radio-vol', vol.value); };

  const chat = el('section', 'rchat');
  chat.innerHTML = '<div class="rchead"><h4>Chat</h4><span>clears every 24 hours</span></div><ul class="rmsgs" aria-live="polite"></ul><form class="rform" autocomplete="off"></form>';
  left.appendChild(chat);
  grid.appendChild(left);

  const up = el('section', 'rup');
  up.innerHTML = '<h4>Up next <span class="rqn"></span></h4><ul class="rqueue"></ul>';
  grid.appendChild(up);
  root.appendChild(grid);

  const rq = el('section', 'rreq');
  rq.innerHTML = '<h4>Request a song</h4><div class="rsearch"><input type="search" placeholder="Search songs to request…" aria-label="Search songs to request"></div><ul class="rresults"></ul>';
  root.appendChild(rq);
  const input = rq.querySelector('input');
  input.oninput = () => paintResults(input.value);
  input.onfocus = () => paintResults(input.value);
  paintForm();
  paintChat(true);
}

function paintForm() {
  const f = $('radioView').querySelector('.rform');
  if (!f) return;
  f.innerHTML = '';
  if (!name) {
    f.classList.add('naming');
    f.innerHTML = '<input class="rin" maxlength="24" placeholder="Pick a name to chat and request" aria-label="Your name"><button class="rsend pri" type="submit">Join</button><button type="button" class="rlogin">or log in</button>';
    f.querySelector('.rlogin').onclick = () => openAccount('login');
    f.onsubmit = (e) => {
      e.preventDefault();
      const v = f.querySelector('input').value.replace(/\s+/g, ' ').trim().slice(0, 24);
      if (v.length < 2) { toast('Pick a name with at least 2 letters'); return; }
      guestName = v; name = v; store.set('chandol-radio-name', v);
      send({ type: 'name', name: v, token: '' });
      paintForm();
      f.querySelector('input').focus();
    };
    return;
  }
  f.classList.remove('naming');
  f.innerHTML = '<button type="button" class="rme" title="Change name"></button><input class="rin" maxlength="300" placeholder="Say something…" aria-label="Chat message"><button class="rsend" type="submit" aria-label="Send">' + SEND_SVG + '</button>';
  const me = f.querySelector('.rme');
  me.textContent = name;
  if (isLoggedIn()) { me.classList.add('v'); me.title = 'Your account'; me.onclick = () => openAccount(); }
  else me.onclick = () => { guestName = ''; name = ''; store.set('chandol-radio-name', ''); paintForm(); };
  f.onsubmit = (e) => {
    e.preventDefault();
    const i = f.querySelector('.rin');
    const v = i.value.trim();
    if (!v) return;
    connect();
    send({ type: 'chat', text: v });
    i.value = '';
  };
}

function msgEl(m) {
  const li = el('li', m.name ? 'rmsg' : 'rmsg sys');
  const d = new Date(m.ts);
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (m.name && m.uid) {
    const av = avatarImg('rav', { username: m.name, avatar: m.av });
    av.setAttribute('role', 'button'); av.title = 'See ' + m.name + '’s profile';
    av.onclick = () => openProfile(m.uid);
    li.appendChild(av);
  }
  if (m.name) {
    const nb = txt('b', m.v === 2 ? 'v adm' : m.v ? 'v' : null, m.name);
    if (m.v) nb.title = m.v === 2 ? 'Admin' : 'Logged-in account';
    if (m.uid) { nb.classList.add('plink'); nb.setAttribute('role', 'button'); nb.onclick = () => openProfile(m.uid); }
    li.appendChild(nb);
    if (m.v === 2) li.appendChild(badgesFor({ v: 2 }));
    li.appendChild(txt('span', 'rtext', m.text));
  } else li.appendChild(txt('span', 'rtext', m.text));
  li.appendChild(txt('time', null, time));
  if (admin) {
    const tools = el('span', 'rmod');
    const del = el('button', null, TRASH_SVG);
    del.type = 'button'; del.title = 'Delete message';
    del.onclick = () => adminAct({ action: 'delete', id: m.id });
    tools.appendChild(del);
    if (m.uid && m.v !== 2) {
      const ban = el('button', null, BAN_SVG);
      ban.type = 'button'; ban.title = 'Ban ' + m.name;
      ban.onclick = async () => {
        const why = prompt('Ban ' + m.name + '? They won’t be able to log in or use the radio.\n\nReason (optional):', '');
        if (why === null) return;
        const res = await apiCall('POST', '/admin/ban', { id: m.uid, reason: why });
        if (res.status !== 200) { toast((res.data && res.data.error) || 'Couldn’t ban'); return; }
        await adminAct({ action: 'delete-uid', uid: m.uid });
        toast(m.name + ' was banned');
      };
      tools.appendChild(ban);
    }
    li.appendChild(tools);
  }
  return li;
}
function paintChat() {
  const ul = $('radioView').querySelector('.rmsgs');
  if (!ul) return;
  ul.innerHTML = '';
  if (!messages.length) ul.appendChild(txt('li', 'rempty', wsOpen ? 'No messages yet. Say hi!' : 'Connecting…'));
  messages.forEach((m) => ul.appendChild(msgEl(m)));
  ul.scrollTop = ul.scrollHeight;
}
function addMsg(m) {
  const ul = $('radioView').querySelector('.rmsgs');
  if (!ul) return;
  const near = ul.scrollHeight - ul.scrollTop - ul.clientHeight < 80;
  const empty = ul.querySelector('.rempty');
  if (empty) empty.remove();
  ul.appendChild(msgEl(m));
  while (ul.children.length > 200) ul.firstChild.remove();
  if (near) ul.scrollTop = ul.scrollHeight;
}

function paintResults(q) {
  const ul = $('radioView').querySelector('.rresults');
  if (!ul) return;
  ul.innerHTML = '';
  q = q.trim().toLowerCase();
  if (!q) return;
  const queued = new Set((snap ? snap.queue : []).map((x) => x.song.key));
  const cur = snap && snap.now && snap.now.song.key;
  const hits = state.tracks.filter((t) => (t.name + ' ' + t.artist + ' ' + (t.era || '') + ' ' + (t.meta ? t.meta.album : '')).toLowerCase().includes(q)).slice(0, 8);
  if (!hits.length) { ul.appendChild(txt('li', 'rempty', 'No songs match')); return; }
  hits.forEach((t) => {
    const k = trackKey(t);
    const li = el('li', 'rrow');
    const art = el('span', 'rsart');
    if (t.cover) { const i = el('img'); i.alt = ''; i.loading = 'lazy'; i.src = t.cover; art.appendChild(i); }
    li.appendChild(art);
    const mid = el('span', 'rmid');
    mid.appendChild(txt('b', null, t.name));
    mid.appendChild(txt('span', null, t.artist + (t.dur ? ' · ' + fmt(t.dur) : '')));
    li.appendChild(mid);
    const b = el('button', 'rreqbtn');
    b.type = 'button';
    const busy = queued.has(k) || cur === k;
    b.textContent = cur === k ? 'Playing' : queued.has(k) ? 'Queued' : 'Request';
    b.disabled = busy;
    b.onclick = () => requestKey(k, t.name, () => { $('radioView').querySelector('.rsearch input').value = ''; paintResults(''); });
    li.appendChild(b);
    ul.appendChild(li);
  });
}

function requestKey(k, label, done) {
  if (!name) { toast('Pick a name in the radio chat first'); if ($('radioView').hidden) location.hash = 'radio'; return; }
  connect();
  const go = () => { send({ type: 'request', key: k }); mine.add(k); saveMine(); if (done) done(); };
  if (wsOpen) go(); else setTimeout(go, 1200);
}
export function requestOnRadio(t) { requestKey(trackKey(t), t.name); }

function paintStatus() {
  const c = $('radioView').querySelector('.rcount');
  if (!c) return;
  if (!wsOpen) { c.textContent = 'connecting…'; return; }
  if (!snap) return;
  const l = snap.listeners, p = snap.people;
  c.textContent = l + (l === 1 ? ' listening' : ' listening') + (p > l ? ' · ' + (p - l) + ' just looking' : '');
}

function paint() {
  paintStatus();
  paintChip();
  if (!built || !snap || !snap.now) return;
  const root = $('radioView');
  const s = snap.now.song;
  const img = root.querySelector('.rart img');
  if (img.dataset.src !== s.cover) { img.classList.remove('loaded'); img.dataset.src = s.cover || ''; if (s.cover) img.src = s.cover; else img.removeAttribute('src'); }
  if (lastBg !== s.cover) { lastBg = s.cover; root.querySelector('.rnbg').style.backgroundImage = s.cover ? 'url("' + s.cover + '")' : ''; applyGlow(s.cover); }
  root.querySelector('.rtag').textContent = snap.now.by ? 'Requested by ' + snap.now.by : 'Auto DJ';
  root.querySelector('.rtitle').textContent = s.name;
  root.querySelector('.rby').textContent = [s.artist, s.era ? s.era + ' era' : ''].filter(Boolean).join(' · ');
  root.querySelector('.rdur').textContent = fmt(s.dur);
  const tb = root.querySelector('.rtune');
  tb.classList.toggle('on', tuned);
  tb.querySelector('span').textContent = tuned ? 'Tuned in' : 'Tune in';
  const sk = root.querySelector('.rskip');
  sk.hidden = !admin;

  const q = root.querySelector('.rqueue');
  const qKey = (admin ? 'a' : '') + snap.now.startedAt + '|' + snap.queue.map((x) => x.song.key + x.by).join(',') + '|' + [...mine].join(',');
  const sameQ = qKey === lastQ;
  lastQ = qKey;
  if (!sameQ) q.innerHTML = '';
  root.querySelector('.rqn').textContent = snap.queue.length ? String(snap.queue.length) : '';
  if (sameQ) { const input0 = root.querySelector('.rsearch input'); if (input0 && input0.value) paintResults(input0.value); return; }
  if (!snap.queue.length) q.appendChild(txt('li', 'rempty', 'Nothing requested. The auto DJ is picking songs.'));
  let start = snap.now.startedAt + s.dur * 1000 + GAP;
  snap.queue.forEach((x, i) => {
    const li = el('li', 'rrow');
    li.appendChild(txt('span', 'rnum', String(i + 1)));
    const art = el('span', 'rsart');
    if (x.song.cover) { const im = el('img'); im.alt = ''; im.loading = 'lazy'; im.src = x.song.cover; art.appendChild(im); }
    li.appendChild(art);
    const mid = el('span', 'rmid');
    mid.appendChild(txt('b', null, x.song.name));
    const when = new Date(start - (skew || 0)).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    mid.appendChild(txt('span', null, x.song.artist + ' · by ' + x.by + ' · ~' + when));
    li.appendChild(mid);
    start += x.song.dur * 1000 + GAP;
    if (admin && !mine.has(x.song.key)) {
      const rm = el('button', 'rrm', X_SVG);
      rm.type = 'button'; rm.title = 'Remove from queue (admin)';
      rm.onclick = () => adminAct({ action: 'drop', songKey: x.song.key });
      li.appendChild(rm);
    }
    if (mine.has(x.song.key)) {
      const rm = el('button', 'rrm', X_SVG);
      rm.type = 'button'; rm.title = 'Remove your request';
      rm.onclick = () => { send({ type: 'unrequest', key: x.song.key }); mine.delete(x.song.key); saveMine(); };
      li.appendChild(rm);
    }
    q.appendChild(li);
  });
  const input = root.querySelector('.rsearch input');
  if (input && input.value) paintResults(input.value);
}

function tick() {
  rafId = 0;
  if (snap && snap.now && built && !$('radioView').hidden) {
    const s = snap.now.song;
    const at = Math.max(0, Math.min(s.dur, elapsed()));
    const root = $('radioView');
    root.querySelector('.rpos').textContent = fmt(at);
    root.querySelector('.rtrack i').style.transform = 'scaleX(' + (at / s.dur) + ')';
    tickLyrics(at);
    if (elapsed() > s.dur + GAP / 1000 + 2) { send({ type: 'sync' }); }
  }
  if (!$('radioView').hidden) rafId = setTimeout(tick, 500);
}

/* ---------- little "on air" chip while you browse ---------- */
let chip;
function paintChip() {
  if (!chip) {
    chip = el('button', 'rchip');
    chip.type = 'button';
    chip.onclick = (e) => { if (e.target.closest('.rchipx')) { setTuned(false); return; } location.hash = 'radio'; };
    document.body.appendChild(chip);
  }
  chip.hidden = true;
  paintDock();
  const show = false;
  if (!show) return;
  chip.innerHTML = '<span class="rlive"><i></i>LIVE</span><span class="rchipt"></span><span class="rchipx" role="button" aria-label="Stop radio">' + X_SVG + '</span>';
  chip.querySelector('.rchipt').textContent = snap.now.song.name + ' – ' + snap.now.song.artist;
}

/* ---------- the player bar shows the live song while tuned in ---------- */
let dockTimer = 0, dockOn = false, dockCover = '';
function paintDock() {
  const dock = document.querySelector('.dock');
  if (!dock) return;
  if (!tuned || !snap || !snap.now) {
    if (dockOn) {
      dockOn = false; dockCover = '';
      clearInterval(dockTimer);
      dock.classList.remove('radio-mode');
      refreshNow();
      if (state.cur < 0) emit('trackchange', undefined);
    }
    return;
  }
  const s = snap.now.song;
  dockOn = true;
  dock.classList.add('radio-mode');
  dock.classList.remove('idle');
  $('title').textContent = s.name;
  $('artist').textContent = 'LIVE radio · ' + s.artist;
  const c = $('cover');
  if (s.cover && dockCover !== s.cover) { dockCover = s.cover; c.src = s.cover; c.hidden = false; }
  $('toggleIcon').firstElementChild.setAttribute('d', PAUSE);
  $('toggle').setAttribute('aria-label', 'Stop the radio');
  $('dur').textContent = fmt(s.dur);
  const upd = () => { if (snap && snap.now) $('cur').textContent = fmt(Math.max(0, Math.min(snap.now.song.dur, elapsed()))); };
  upd();
  clearInterval(dockTimer);
  dockTimer = setInterval(upd, 500);
}
function pageClass() { document.body.classList.toggle('page-radio', !$('radioView').hidden); }

export function onShowRadio() {
  pageClass();
  build();
  if (smallScreen()) return;
  if (snap) { if (snap.now) setSong(snap.now.song); }
  connect();
  paint();
  paintChat();
  applyGlow(lastBg);
  if (tuned) startViz();
  clearTimeout(rafId);
  tick();
}

export function initRadio() {
  on('account', () => {
    name = isLoggedIn() ? getUser().username : guestName;
    send(helloMsg());
    paintForm();
  });
  audio.addEventListener('play', () => { if (tuned) setTuned(false); });
  window.addEventListener('hashchange', () => setTimeout(() => {
    pageClass();
    paintChip();
    if (location.hash !== '#radio') viz.stop();
    else if (tuned) startViz();
  }, 0));
  on('radiosettings', () => { applyGlow(lastBg); });
  const mq = window.matchMedia('(max-width: 700px)');
  const onCross = () => {
    built = false;
    if (tuned && mq.matches) setTuned(false);
    if (!$('radioView').hidden) onShowRadio();
  };
  if (mq.addEventListener) mq.addEventListener('change', onCross);
  else if (mq.addListener) mq.addListener(onCross);
  document.addEventListener('click', (e) => {
    if (!tuned) return;
    if (e.target.closest('#toggle')) { e.stopImmediatePropagation(); e.preventDefault(); setTuned(false); toast('Radio stopped'); return; }
    if (e.target.closest('#dock-info, #dock-cv')) { e.stopImmediatePropagation(); location.hash = 'radio'; }
  }, true);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && tuned) { connect(); send({ type: 'sync' }); } });
  on('rendered', () => { const i = $('radioView').querySelector('.rsearch input'); if (i && i.value) paintResults(i.value); });
}
