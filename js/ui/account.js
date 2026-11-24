import { $, showAnimated, hideAnimated, el, txt } from '../core/util.js';
import { on, emit } from '../core/state.js';
import { libraryData, setLibraryData, mergeLibrary } from '../core/library.js';
import { toast } from './toast.js';
import { avatarImg, defaultBanner, favRow, trackByKey, keyOf, setProfileContext, openProfile, badgesFor } from './profile.js';
import { state } from '../core/state.js';
import { go, path } from '../core/router.js';

const API = 'https://chandolwav-radio.codename1121111.workers.dev';
const TK = 'chandol-token', UK = 'chandol-user';
const USER_SVG = '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 20c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>';
const EYE_SVG = '<svg viewBox="0 0 24 24"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const CHECK_SVG = '<svg viewBox="0 0 24 24"><path d="M5 12l5 5 9-10"/></svg>';

const read = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const write = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} };

let token = read(TK) || '';
queueMicrotask(() => setProfileContext(() => openAccount(), user ? user.id : 0));
let user = (() => { try { return JSON.parse(read(UK) || 'null'); } catch (e) { return null; } })();
let sheet, card, mode = 'login', pushTimer = 0, syncing = false, lastSync = 0, syncState = '';

export const getToken = () => token;
export const getUser = () => user;
export const isLoggedIn = () => !!(token && user);
export const isAdmin = () => isLoggedIn() && user.role === 'admin';
export const apiCall = (method, path, body) => call(method, path, body);

async function call(method, path, body) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = 'Bearer ' + token;
  let r;
  try { r = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined }); }
  catch (e) { return { status: 0, data: { error: 'Can’t reach the server. Check your connection.' } }; }
  let data = {};
  try { data = await r.json(); } catch (e) {}
  return { status: r.status, data };
}

function avatarEl(cls, u) { return avatarImg(cls, u); }
export { avatarEl };

function squareJpeg(file, size, wide) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) return reject(new Error('Pick a picture file.'));
    if (file.size > 15 * 1024 * 1024) return reject(new Error('That picture is over 15 MB.'));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const W = img.naturalWidth, H = img.naturalHeight, ratio = wide ? 3 : 1;
      let sw = W, sh = W / ratio;
      if (sh > H) { sh = H; sw = H * ratio; }
      const c = document.createElement('canvas');
      c.width = size; c.height = Math.round(size / ratio);
      const g = c.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.drawImage(img, (W - sw) / 2, (H - sh) / 2, sw, sh, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.88));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That picture couldn’t be opened.')); };
    img.src = url;
  });
}

function setSession(t, u) {
  token = t || ''; user = u || null;
  setProfileContext(() => openAccount(), user ? user.id : 0);
  write(TK, token || null);
  write(UK, user ? JSON.stringify(user) : null);
  paintButton();
  emit('account', user);
}

async function pull(firstLogin) {
  if (!isLoggedIn() || syncing) return;
  syncing = true; syncState = 'syncing'; paintSync();
  const r = await call('GET', '/me/library');
  if (r.status === 401) { syncing = false; setSession('', null); toast('You were logged out'); return; }
  if (r.status !== 200) { syncing = false; syncState = 'error'; paintSync(); return; }
  const local = libraryData();
  const remote = r.data.library ? { ...r.data.library, updated: r.data.updated } : null;
  if (firstLogin) {
    const merged = remote ? mergeLibrary(remote, local) : { ...local, updated: Date.now() };
    setLibraryData(merged);
    await push(true);
  } else if (remote && remote.updated > (local.updated || 0)) {
    setLibraryData(remote);
  } else if ((local.updated || 0) > (remote ? remote.updated : 0)) {
    await push(true);
  }
  syncing = false; lastSync = Date.now(); syncState = 'ok'; paintSync();
}
async function push(now) {
  clearTimeout(pushTimer);
  if (!isLoggedIn()) return;
  const go = async () => {
    const d = libraryData();
    const r = await call('PUT', '/me/library', { library: { liked: d.liked, playlists: d.playlists }, updated: d.updated || Date.now() });
    if (r.status === 401) { setSession('', null); return; }
    syncState = r.status === 200 ? 'ok' : 'error';
    if (r.status === 200) lastSync = Date.now();
    else if (r.data && r.data.error) toast(r.data.error);
    paintSync();
  };
  if (now) return go();
  pushTimer = setTimeout(go, 1200);
}

function paintButton() {
  const b = $('acctBtn');
  if (!b) return;
  if (isLoggedIn()) {
    b.classList.add('in');
    b.innerHTML = '';
    b.appendChild(avatarEl('aav', user));
    b.appendChild(txt('span', 'aname', user.username));
    b.title = 'Your account';
  } else {
    b.classList.remove('in');
    b.innerHTML = USER_SVG + '<span class="aname">Log in</span>';
    b.title = 'Log in or sign up';
  }
}

function field(label, name, type, auto, extra) {
  const w = el('label', 'afield');
  w.appendChild(txt('span', null, label));
  const box = el('div', 'abox');
  const i = el('input');
  i.name = name; i.type = type; i.autocomplete = auto; i.required = true;
  i.spellcheck = false; i.autocapitalize = 'none';
  Object.assign(i, extra || {});
  box.appendChild(i);
  if (type === 'password') {
    const eye = el('button', 'aeye', EYE_SVG);
    eye.type = 'button'; eye.tabIndex = -1; eye.title = 'Show password'; eye.setAttribute('aria-label', 'Show password');
    eye.onclick = () => { i.type = i.type === 'password' ? 'text' : 'password'; eye.classList.toggle('on', i.type === 'text'); };
    box.appendChild(eye);
  }
  w.appendChild(box);
  return w;
}

function busy(form, on, label) {
  const b = form.querySelector('button[type=submit]');
  b.disabled = on;
  if (label) b.textContent = label;
  form.querySelectorAll('input').forEach((i) => { i.readOnly = on; });
}
function err(form, msg) { const e = form.querySelector('.aerr'); e.textContent = msg || ''; e.hidden = !msg; }

function renderAuth() {
  card.innerHTML = '<button class="x" type="button" aria-label="Close">&times;</button>';
  card.querySelector('.x').onclick = close;
  card.appendChild(el('div', 'ahero', '<span class="abig">' + USER_SVG + '</span>'));
  card.appendChild(txt('h2', 'atitle', mode === 'login' ? 'Welcome back' : 'Make an account'));
  card.appendChild(txt('p', 'asub', mode === 'login' ? 'Log in to get your liked songs and playlists on any device.' : 'Your liked songs and playlists sync everywhere, and your name is yours alone.'));
  const tabs = el('div', 'atabs');
  [['login', 'Log in'], ['signup', 'Sign up']].forEach(([k, label]) => {
    const t = txt('button', 'atab' + (mode === k ? ' active' : ''), label);
    t.type = 'button';
    t.onclick = () => { if (mode !== k) { mode = k; renderAuth(); } };
    tabs.appendChild(t);
  });
  card.appendChild(tabs);

  const f = el('form', 'aform');
  f.noValidate = true;
  f.appendChild(field('Username', 'username', 'text', 'username', { maxLength: 20, placeholder: mode === 'signup' ? '3–20 letters, numbers, _ . -' : '' }));
  f.appendChild(field('Password', 'password', 'password', mode === 'login' ? 'current-password' : 'new-password', { maxLength: 200, placeholder: mode === 'signup' ? 'At least 8 characters' : '' }));
  if (mode === 'signup') f.appendChild(field('Confirm password', 'confirm', 'password', 'new-password', { maxLength: 200 }));
  const e = txt('p', 'aerr', ''); e.hidden = true; e.setAttribute('role', 'alert');
  f.appendChild(e);
  const sb = txt('button', 'abtn pri', mode === 'login' ? 'Log in' : 'Create account');
  sb.type = 'submit';
  f.appendChild(sb);
  if (mode === 'signup') f.appendChild(txt('p', 'anote', 'There’s no email, so there’s no way to reset a forgotten password. Save it in your password manager.'));
  f.onsubmit = async (ev) => {
    ev.preventDefault();
    const username = f.username.value.trim();
    const password = f.password.value;
    if (!username || !password) return err(f, 'Fill in your username and password.');
    if (mode === 'signup') {
      if (!/^[A-Za-z0-9_.-]{3,20}$/.test(username)) return err(f, 'Usernames are 3–20 characters: letters, numbers, _ . or -');
      if (password.length < 8) return err(f, 'Use at least 8 characters for your password.');
      if (password !== f.confirm.value) return err(f, 'The passwords don’t match.');
    }
    err(f, '');
    busy(f, true, mode === 'login' ? 'Logging in…' : 'Creating…');
    const r = await call('POST', mode === 'login' ? '/auth/login' : '/auth/signup', { username, password });
    if (r.status !== 200) { busy(f, false, mode === 'login' ? 'Log in' : 'Create account'); err(f, r.data.error || 'Something went wrong. Try again.'); return; }
    setSession(r.data.token, r.data.user);
    toast(mode === 'login' ? 'Logged in as ' + r.data.user.username : 'Welcome, ' + r.data.user.username + '!');
    renderAccount();
    pull(true);
  };
  card.appendChild(f);
  setTimeout(() => { const i = f.querySelector('input'); if (i && matchMedia('(pointer: fine)').matches) i.focus(); }, 60);
}

function paintSync() {
  const s = card && card.querySelector('.async');
  if (!s) return;
  s.className = 'async ' + syncState;
  s.innerHTML = '';
  const label = syncState === 'syncing' ? 'Syncing…' : syncState === 'error' ? 'Couldn’t sync just now' : lastSync ? 'Liked songs and playlists synced' : 'Liked songs and playlists sync to this account';
  s.innerHTML = (syncState === 'ok' ? CHECK_SVG : '') + '<span></span>';
  s.querySelector('span').textContent = label;
}

function renderAccount() {
  card.innerHTML = '<button class="x" type="button" aria-label="Close">&times;</button>';
  card.querySelector('.x').onclick = close;
  const ban = el('div', 'aban');
  if (user.banner) { const bi = el('img'); bi.alt = ''; bi.referrerPolicy = 'no-referrer'; bi.src = user.banner; ban.appendChild(bi); }
  else ban.style.background = defaultBanner(user.username);
  const bfile = el('input'); bfile.type = 'file'; bfile.accept = 'image/*'; bfile.hidden = true;
  const bbtn = el('button', 'abanbtn', '<svg viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg><span>' + (user.banner ? 'Change banner' : 'Add banner') + '</span>');
  bbtn.type = 'button';
  bbtn.onclick = () => bfile.click();
  bfile.onchange = async () => {
    const f = bfile.files[0]; bfile.value = '';
    if (!f) return;
    ban.classList.add('busy');
    try {
      const image = await squareJpeg(f, 1200, true);
      const r = await call('POST', '/me/banner', { image });
      if (r.status !== 200) throw new Error(r.data.error || 'Upload failed.');
      setSession(token, r.data.user); toast('Banner updated'); renderAccount();
    } catch (e) { toast(e.message || 'Upload failed.'); ban.classList.remove('busy'); }
  };
  const bgrp = el('div', 'abanacts');
  bgrp.appendChild(bbtn);
  if (user.banner) {
    const brm = el('button', 'abanbtn', '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg><span>Remove</span>');
    brm.type = 'button'; brm.title = 'Remove banner';
    brm.onclick = async () => { const r = await call('POST', '/me/banner', { image: '' }); if (r.status === 200) { setSession(token, r.data.user); renderAccount(); toast('Banner removed'); } };
    bgrp.appendChild(brm);
  }
  ban.appendChild(bgrp); ban.appendChild(bfile);
  card.appendChild(ban);
  const top = el('div', 'aprof');
  const pic = el('div', 'apic');
  pic.appendChild(avatarEl('aavbig', user));
  const file = el('input');
  file.type = 'file'; file.accept = 'image/*'; file.hidden = true;
  const change = el('button', 'apicbtn', '<svg viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>');
  change.type = 'button'; change.title = 'Change profile picture'; change.setAttribute('aria-label', 'Change profile picture');
  change.onclick = () => file.click();
  file.onchange = async () => {
    const f = file.files[0];
    file.value = '';
    if (!f) return;
    pic.classList.add('busy');
    try {
      const image = await squareJpeg(f, 320);
      const r = await call('POST', '/me/avatar', { image });
      if (r.status !== 200) throw new Error(r.data.error || 'Upload failed.');
      setSession(token, r.data.user);
      toast('Profile picture updated');
      renderAccount();
    } catch (e) { toast(e.message || 'Upload failed.'); pic.classList.remove('busy'); }
  };
  pic.appendChild(change);
  pic.appendChild(file);
  top.appendChild(pic);
  const who = el('div');
  const nm = el('div', 'anamerow');
  nm.appendChild(txt('h2', 'atitle', user.username));
  nm.appendChild(badgesFor(user));
  who.appendChild(nm);
  if (user.created) who.appendChild(txt('p', 'asub', 'Member since ' + new Date(user.created).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })));
  top.appendChild(who);
  card.appendChild(top);
  const prof = el('form', 'aform aprofile');
  prof.noValidate = true;
  const bl = el('label', 'afield');
  bl.appendChild(txt('span', null, 'Bio'));
  const bio = el('textarea', 'abio');
  bio.name = 'bio'; bio.maxLength = 160; bio.rows = 2; bio.placeholder = 'Favorite era, favorite song, anything…';
  bio.value = user.bio || '';
  bl.appendChild(bio);
  const count = txt('span', 'acount', (user.bio || '').length + '/160');
  bl.appendChild(count);
  prof.appendChild(bl);
  const fl = el('div', 'afield');
  fl.appendChild(txt('span', null, 'Favorite song'));
  const favBox = el('div', 'afavbox');
  const paintFav = () => {
    favBox.innerHTML = '';
    favBox.appendChild(favRow(user.fav, 'pfav small'));
    const row = el('div', 'afavacts');
    const ch = txt('button', 'alink', user.fav ? 'Change' : 'Pick a song'); ch.type = 'button';
    ch.onclick = () => picker();
    row.appendChild(ch);
    if (user.fav) {
      const rm = txt('button', 'alink', 'Remove'); rm.type = 'button';
      rm.onclick = () => saveFav('');
      row.appendChild(rm);
    }
    favBox.appendChild(row);
  };
  const saveFav = async (k) => {
    const r = await call('POST', '/me/profile', { fav: k, bio: user.bio || '' });
    if (r.status !== 200) { toast(r.data.error || 'Couldn’t save.'); return; }
    setSession(token, r.data.user); paintFav(); toast(k ? 'Favorite song saved' : 'Favorite song removed');
  };
  const picker = () => {
    favBox.innerHTML = '';
    const inp = el('input', 'afavq'); inp.type = 'search'; inp.placeholder = 'Search for your favorite song…';
    const res = el('ul', 'afavres');
    const show = () => {
      res.innerHTML = '';
      const q = inp.value.trim().toLowerCase();
      const hits = (q ? state.tracks.filter((t) => (t.name + ' ' + t.artist).toLowerCase().includes(q)) : state.tracks).slice(0, 6);
      hits.forEach((t) => {
        const li = el('li'); const b = el('button', 'afavpick'); b.type = 'button';
        b.appendChild(txt('b', null, t.name)); b.appendChild(txt('span', null, t.artist));
        b.onclick = () => saveFav(keyOf(t));
        li.appendChild(b); res.appendChild(li);
      });
      if (!hits.length) res.appendChild(txt('li', 'pfavnone', 'No songs match'));
    };
    inp.oninput = show;
    const cancel = txt('button', 'alink', 'Cancel'); cancel.type = 'button'; cancel.onclick = paintFav;
    favBox.appendChild(inp); favBox.appendChild(res); favBox.appendChild(cancel);
    show(); inp.focus();
  };
  paintFav();
  fl.appendChild(favBox);
  prof.insertBefore(fl, bl.nextSibling);
  const pe2 = txt('p', 'aerr', ''); pe2.hidden = true; prof.appendChild(pe2);
  const save = txt('button', 'abtn', 'Save bio'); save.type = 'submit'; save.disabled = true;
  prof.appendChild(save);
  bio.oninput = () => { count.textContent = bio.value.length + '/160'; save.disabled = bio.value.trim() === (user.bio || ''); };
  prof.onsubmit = async (ev) => {
    ev.preventDefault();
    busy(prof, true, 'Saving…');
    const r = await call('POST', '/me/profile', { bio: bio.value });
    busy(prof, false, 'Save bio');
    if (r.status !== 200) return err(prof, r.data.error || 'Couldn’t save.');
    err(prof, '');
    setSession(token, r.data.user);
    save.disabled = true;
    toast('Bio saved');
  };
  if (user.avatar) {
    const rm = txt('button', 'alink', 'Remove profile picture');
    rm.type = 'button';
    rm.onclick = async () => {
      const r = await call('POST', '/me/avatar', { image: '' });
      if (r.status !== 200) { toast(r.data.error || 'Couldn’t remove it.'); return; }
      setSession(token, r.data.user);
      renderAccount();
    };
    prof.appendChild(rm);
  }
  card.appendChild(prof);
  const vp = txt('button', 'alink aview', 'See how others see your profile');
  vp.type = 'button'; vp.onclick = () => { close(); openProfile(user); };
  card.appendChild(vp);
  card.appendChild(el('p', 'async'));
  paintSync();

  const list = el('div', 'aacts');
  if (isAdmin()) {
    const ap = txt('button', 'abtn pri', 'Open admin panel');
    ap.type = 'button';
    ap.onclick = () => { close(); go('/admin'); };
    list.appendChild(ap);
  }
  const pw = el('details', 'adet');
  pw.appendChild(txt('summary', null, 'Change password'));
  const pf = el('form', 'aform');
  pf.noValidate = true;
  const hidden = el('input'); hidden.type = 'text'; hidden.name = 'username'; hidden.autocomplete = 'username'; hidden.value = user.username; hidden.hidden = true;
  pf.appendChild(hidden);
  pf.appendChild(field('Current password', 'old', 'password', 'current-password'));
  pf.appendChild(field('New password', 'password', 'password', 'new-password', { placeholder: 'At least 8 characters' }));
  const pe = txt('p', 'aerr', ''); pe.hidden = true; pf.appendChild(pe);
  const psb = txt('button', 'abtn', 'Update password'); psb.type = 'submit'; pf.appendChild(psb);
  pf.onsubmit = async (ev) => {
    ev.preventDefault();
    if (pf.password.value.length < 8) return err(pf, 'Use at least 8 characters for your new password.');
    err(pf, ''); busy(pf, true, 'Updating…');
    const r = await call('POST', '/auth/password', { old: pf.old.value, password: pf.password.value });
    busy(pf, false, 'Update password');
    if (r.status !== 200) return err(pf, r.data.error || 'Something went wrong.');
    pf.reset(); pw.open = false;
    toast('Password changed. Other devices were logged out.');
  };
  pw.appendChild(pf);
  list.appendChild(pw);

  const out = txt('button', 'abtn', 'Log out');
  out.type = 'button';
  out.onclick = async () => {
    clearTimeout(pushTimer);
    await call('POST', '/auth/logout');
    setSession('', null);
    toast('Logged out');
    mode = 'login';
    renderAuth();
  };
  list.appendChild(out);

  const del = el('details', 'adet danger');
  del.appendChild(txt('summary', null, 'Delete account'));
  const df = el('form', 'aform');
  df.noValidate = true;
  df.appendChild(txt('p', 'anote', 'This deletes your account and its synced library for good. Liked songs stay on this device.'));
  df.appendChild(field('Password', 'password', 'password', 'current-password'));
  const de = txt('p', 'aerr', ''); de.hidden = true; df.appendChild(de);
  const dsb = txt('button', 'abtn red', 'Delete my account'); dsb.type = 'submit'; df.appendChild(dsb);
  df.onsubmit = async (ev) => {
    ev.preventDefault();
    err(df, ''); busy(df, true, 'Deleting…');
    const r = await call('POST', '/auth/delete', { password: df.password.value });
    busy(df, false, 'Delete my account');
    if (r.status !== 200) return err(df, r.data.error || 'Something went wrong.');
    setSession('', null);
    toast('Your account was deleted');
    mode = 'signup';
    renderAuth();
  };
  del.appendChild(df);
  list.appendChild(del);
  card.appendChild(list);
}

export function openAccount(m) {
  if (m) mode = m;
  if (isLoggedIn()) renderAccount(); else renderAuth();
  showAnimated(sheet);
  document.body.style.overflow = 'hidden';
}
function close() {
  hideAnimated(sheet, 260);
  document.body.style.overflow = '';
}

export function initAccount() {
  const b = el('button', 'acct');
  b.id = 'acctBtn';
  b.type = 'button';
  b.onclick = () => openAccount();
  document.querySelector('header').appendChild(b);
  paintButton();

  sheet = el('div', 'isheet asheet');
  sheet.hidden = true;
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', 'Account');
  card = el('div', 'icard acard');
  sheet.appendChild(card);
  document.body.appendChild(sheet);
  sheet.addEventListener('click', (e) => { if (e.target === sheet) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !sheet.hidden) close(); });

  on('library', (why) => { if (why !== 'sync' && isLoggedIn()) { syncState = 'syncing'; push(false); } });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && isLoggedIn() && Date.now() - lastSync > 30000) pull(false); });

  if (token) {
    call('GET', '/auth/me').then((r) => {
      if (r.status === 200) { user = r.data.user; write(UK, JSON.stringify(user)); paintButton(); emit('account', user); pull(false); }
      else if (r.status === 401) setSession('', null);
    });
  }
}
