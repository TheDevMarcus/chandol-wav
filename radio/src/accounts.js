import { DurableObject } from 'cloudflare:workers';

const ITER = 100000;
const SESSION_DAYS = 180;
const USER_RE = /^[A-Za-z0-9_.-]{3,20}$/;
const LIB_MAX = 200000;
const enc = new TextEncoder();

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const sha = async (s) => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));

async function hashPw(pw, salt) {
  const key = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
  return b64(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITER }, key, 256));
}
function same(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
const fail = (status, error) => ({ status, body: { error } });
const ok = (body) => ({ status: 200, body });

export class Accounts extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, uname TEXT UNIQUE, display TEXT, hash TEXT, salt TEXT, created INTEGER, lib TEXT, lib_at INTEGER DEFAULT 0)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS sessions (th TEXT PRIMARY KEY, uid INTEGER, created INTEGER, expires INTEGER)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS limits (k TEXT PRIMARY KEY, n INTEGER, until INTEGER)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS ipbans (ip TEXT PRIMARY KEY, uid INTEGER, at INTEGER)`);
    for (const c of ['banner TEXT DEFAULT \'\'', 'fav TEXT DEFAULT \'\'', 'avatar TEXT DEFAULT \'\'', 'bio TEXT DEFAULT \'\'', 'role TEXT DEFAULT \'\'', 'banned INTEGER DEFAULT 0', 'ban_reason TEXT DEFAULT \'\'', 'last_ip TEXT DEFAULT \'\'', 'last_seen INTEGER DEFAULT 0']) {
      try { this.sql.exec('ALTER TABLE users ADD COLUMN ' + c); } catch (e) {}
    }
  }

  limited(k) {
    const r = this.sql.exec('SELECT n, until FROM limits WHERE k = ?', k).toArray()[0];
    return r && r.until > Date.now() && r.n >= 0 ? r : null;
  }
  bump(k, max, windowMs) {
    const now = Date.now();
    const r = this.sql.exec('SELECT n, until FROM limits WHERE k = ?', k).toArray()[0];
    const n = r && r.until > now ? r.n + 1 : 1;
    const until = r && r.until > now ? r.until : now + windowMs;
    this.sql.exec('INSERT INTO limits (k, n, until) VALUES (?, ?, ?) ON CONFLICT(k) DO UPDATE SET n = excluded.n, until = excluded.until', k, n, until);
    return n > max;
  }
  blocked(k, max) {
    const r = this.sql.exec('SELECT n, until FROM limits WHERE k = ?', k).toArray()[0];
    return !!(r && r.until > Date.now() && r.n >= max);
  }

  async session(uid) {
    const token = hex(crypto.getRandomValues(new Uint8Array(32)));
    const now = Date.now();
    this.sql.exec('INSERT INTO sessions (th, uid, created, expires) VALUES (?, ?, ?, ?)', await sha(token), uid, now, now + SESSION_DAYS * 86400000);
    this.sql.exec('DELETE FROM sessions WHERE expires < ?', now);
    return token;
  }
  async userFor(token) {
    if (!token || typeof token !== 'string' || token.length !== 64) return null;
    const r = this.sql.exec('SELECT u.id, u.display, u.created, u.role, u.avatar, u.bio, u.banner, u.fav, s.th FROM sessions s JOIN users u ON u.id = s.uid WHERE s.th = ? AND s.expires > ? AND u.banned = 0', await sha(token), Date.now()).toArray()[0];
    if (r) this.sql.exec('UPDATE users SET last_seen = ? WHERE id = ?', Date.now(), r.id);
    return r || null;
  }
  pub(u) { return { id: u.id, username: u.display, created: u.created, role: u.role || '', avatar: u.avatar || '', bio: u.bio || '', banner: u.banner || '', fav: u.fav || '' }; }

  async signup({ username, password }, ip) {
    username = String(username || '').trim();
    password = String(password || '');
    if (!USER_RE.test(username)) return fail(400, 'Usernames are 3–20 characters: letters, numbers, _ . or -');
    if (password.length < 8) return fail(400, 'Use at least 8 characters for your password.');
    if (password.length > 200) return fail(400, 'That password is too long.');
    if (password.toLowerCase() === username.toLowerCase()) return fail(400, 'Your password can’t be your username.');
    if (this.blocked('su:' + ip, 5)) return fail(429, 'Too many new accounts from here. Try again later.');
    const uname = username.toLowerCase();
    if (this.sql.exec('SELECT 1 FROM users WHERE uname = ?', uname).toArray().length) return fail(409, 'That username is taken.');
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const hash = await hashPw(password, salt);
    if (this.ipBanned(ip)) return fail(403, 'You can’t make an account right now.');
    const id = this.sql.exec('INSERT INTO users (uname, display, hash, salt, created, last_ip) VALUES (?, ?, ?, ?, ?, ?) RETURNING id', uname, username, hash, b64(salt), Date.now(), ip).one().id;
    this.bump('su:' + ip, 5, 3600000);
    const u = this.sql.exec('SELECT * FROM users WHERE id = ?', id).one();
    return ok({ token: await this.session(id), user: this.pub(u) });
  }

  async login({ username, password }, ip) {
    const uname = String(username || '').trim().toLowerCase();
    password = String(password || '');
    if (this.blocked('li:' + ip, 20) || this.blocked('lu:' + uname, 8)) return fail(429, 'Too many tries. Wait a few minutes and try again.');
    const u = this.sql.exec('SELECT * FROM users WHERE uname = ?', uname).toArray()[0];
    const salt = u ? unb64(u.salt) : crypto.getRandomValues(new Uint8Array(16));
    const h = await hashPw(password, salt);
    if (!u || !same(h, u.hash)) {
      this.bump('li:' + ip, 20, 900000);
      this.bump('lu:' + uname, 8, 600000);
      return fail(401, 'Wrong username or password.');
    }
    this.sql.exec('DELETE FROM limits WHERE k = ?', 'lu:' + uname);
    if (u.banned) return fail(403, 'This account is banned' + (u.ban_reason ? ': ' + u.ban_reason : '.'));
    this.sql.exec('UPDATE users SET last_ip = ?, last_seen = ? WHERE id = ?', ip, Date.now(), u.id);
    return ok({ token: await this.session(u.id), user: this.pub(u) });
  }

  async me(token) {
    const u = await this.userFor(token);
    return u ? ok({ user: this.pub(u) }) : fail(401, 'Not logged in.');
  }

  async logout(token) {
    if (token) this.sql.exec('DELETE FROM sessions WHERE th = ?', await sha(String(token)));
    return ok({ ok: true });
  }

  async password(token, { old, password }) {
    const s = await this.userFor(token);
    if (!s) return fail(401, 'Not logged in.');
    const u = this.sql.exec('SELECT * FROM users WHERE id = ?', s.id).one();
    if (this.blocked('pw:' + u.id, 8)) return fail(429, 'Too many tries. Wait a few minutes.');
    if (!same(await hashPw(String(old || ''), unb64(u.salt)), u.hash)) { this.bump('pw:' + u.id, 8, 600000); return fail(401, 'Your current password is wrong.'); }
    password = String(password || '');
    if (password.length < 8 || password.length > 200) return fail(400, 'Use 8 to 200 characters for your new password.');
    const salt = crypto.getRandomValues(new Uint8Array(16));
    this.sql.exec('UPDATE users SET hash = ?, salt = ? WHERE id = ?', await hashPw(password, salt), b64(salt), u.id);
    this.sql.exec('DELETE FROM sessions WHERE uid = ? AND th != ?', u.id, s.th);
    return ok({ ok: true });
  }

  async remove(token, { password }) {
    const s = await this.userFor(token);
    if (!s) return fail(401, 'Not logged in.');
    const u = this.sql.exec('SELECT * FROM users WHERE id = ?', s.id).one();
    if (this.blocked('pw:' + u.id, 8)) return fail(429, 'Too many tries. Wait a few minutes.');
    if (!same(await hashPw(String(password || ''), unb64(u.salt)), u.hash)) { this.bump('pw:' + u.id, 8, 600000); return fail(401, 'Wrong password.'); }
    this.sql.exec('DELETE FROM sessions WHERE uid = ?', u.id);
    this.sql.exec('DELETE FROM users WHERE id = ?', u.id);
    return ok({ ok: true });
  }

  async getLib(token) {
    const s = await this.userFor(token);
    if (!s) return fail(401, 'Not logged in.');
    const u = this.sql.exec('SELECT lib, lib_at FROM users WHERE id = ?', s.id).one();
    return ok({ library: u.lib ? JSON.parse(u.lib) : null, updated: u.lib_at || 0 });
  }

  async putLib(token, { library, updated }) {
    const s = await this.userFor(token);
    if (!s) return fail(401, 'Not logged in.');
    if (!library || !Array.isArray(library.liked) || !Array.isArray(library.playlists)) return fail(400, 'Bad library.');
    const text = JSON.stringify({ liked: library.liked, playlists: library.playlists });
    if (text.length > LIB_MAX) return fail(413, 'Your library is too big to sync.');
    const at = Number(updated) || Date.now();
    this.sql.exec('UPDATE users SET lib = ?, lib_at = ? WHERE id = ?', text, at, s.id);
    return ok({ ok: true, updated: at });
  }

  async verify(token) {
    const u = await this.userFor(token);
    return u ? { id: u.id, username: u.display, admin: u.role === 'admin', avatar: u.avatar || '' } : null;
  }
  ipBanned(ip) { return !!ip && this.sql.exec('SELECT 1 FROM ipbans WHERE ip = ?', ip).toArray().length > 0; }
  async isIpBanned(ip) { return this.ipBanned(ip); }

  async requireAdmin(token) {
    const u = await this.userFor(token);
    return u && u.role === 'admin' ? u : null;
  }
  row(u) { return { avatar: u.avatar || '', bio: u.bio || '', id: u.id, username: u.display, created: u.created, lastSeen: u.last_seen || 0, role: u.role || '', banned: !!u.banned, reason: u.ban_reason || '' }; }
  async adminUsers(token, q) {
    if (!(await this.requireAdmin(token))) return fail(403, 'Admins only.');
    q = String(q || '').trim().toLowerCase().slice(0, 40).replace(/[\\%_]/g, (c) => '\\' + c);
    const rows = q
      ? this.sql.exec("SELECT * FROM users WHERE uname LIKE ? ESCAPE '\\' ORDER BY id DESC LIMIT 100", '%' + q + '%').toArray()
      : this.sql.exec('SELECT * FROM users ORDER BY id DESC LIMIT 100').toArray();
    const total = this.sql.exec('SELECT COUNT(*) AS n FROM users').one().n;
    const banned = this.sql.exec('SELECT COUNT(*) AS n FROM users WHERE banned = 1').one().n;
    return ok({ users: rows.map((u) => this.row(u)), total, banned });
  }
  async adminBan(token, { id, reason, ban }) {
    const me = await this.requireAdmin(token);
    if (!me) return fail(403, 'Admins only.');
    const u = this.sql.exec('SELECT * FROM users WHERE id = ?', Number(id)).toArray()[0];
    if (!u) return fail(404, 'No such user.');
    if (u.role === 'admin') return fail(400, 'You can’t ban an admin.');
    if (ban === false) {
      this.sql.exec('UPDATE users SET banned = 0, ban_reason = ? WHERE id = ?', '', u.id);
      this.sql.exec('DELETE FROM ipbans WHERE uid = ?', u.id);
      return ok({ user: this.row({ ...u, banned: 0, ban_reason: '' }) });
    }
    const why = String(reason || '').replace(/\s+/g, ' ').trim().slice(0, 120);
    this.sql.exec('UPDATE users SET banned = 1, ban_reason = ? WHERE id = ?', why, u.id);
    this.sql.exec('DELETE FROM sessions WHERE uid = ?', u.id);
    if (u.last_ip) this.sql.exec('INSERT INTO ipbans (ip, uid, at) VALUES (?, ?, ?) ON CONFLICT(ip) DO UPDATE SET uid = excluded.uid, at = excluded.at', u.last_ip, u.id, Date.now());
    return ok({ user: this.row({ ...u, banned: 1, ban_reason: why }), kick: { uid: u.id, ip: u.last_ip || '' } });
  }
  async adminDelete(token, { id }) {
    const me = await this.requireAdmin(token);
    if (!me) return fail(403, 'Admins only.');
    const u = this.sql.exec('SELECT * FROM users WHERE id = ?', Number(id)).toArray()[0];
    if (!u) return fail(404, 'No such user.');
    if (u.role === 'admin') return fail(400, 'You can’t delete an admin.');
    this.sql.exec('DELETE FROM sessions WHERE uid = ?', u.id);
    this.sql.exec('DELETE FROM users WHERE id = ?', u.id);
    return ok({ ok: true, kick: { uid: u.id, ip: '' } });
  }
  async setRole(id, role) {
    const u = this.sql.exec('SELECT id, display FROM users WHERE id = ?', Number(id)).toArray()[0];
    if (!u) return { error: 'no such user' };
    this.sql.exec('UPDATE users SET role = ? WHERE id = ?', role === 'admin' ? 'admin' : '', u.id);
    return { ok: true, id: u.id, username: u.display, role };
  }
  async setAvatar(token, image, key, kind) {
    const col = kind === 'banner' ? 'banner' : 'avatar';
    const s = await this.userFor(token);
    if (!s) return fail(401, 'Not logged in.');
    if (!key) return fail(500, 'Photo uploads aren’t set up.');
    image = String(image || '').replace(/^data:image\/(png|jpe?g|webp|gif);base64,/, '');
    if (!image) { this.sql.exec('UPDATE users SET ' + col + ' = ? WHERE id = ?', '', s.id); return ok({ user: this.pub({ ...s, [col]: '' }) }); }
    if (image.length > 2800000) return fail(413, 'That picture is too big.');
    if (!/^[A-Za-z0-9+/=]+$/.test(image)) return fail(400, 'That isn’t a picture.');
    if (this.blocked('av:' + s.id, 10)) return fail(429, 'You’ve changed your picture a lot. Try again in an hour.');
    this.bump('av:' + s.id, 10, 3600000);
    const form = new FormData();
    form.append('image', image);
    form.append('name', 'chandolwav-' + col + '-' + s.id + '-' + Date.now());
    let data;
    try {
      const res = await fetch('https://api.imgbb.com/1/upload?key=' + encodeURIComponent(key), { method: 'POST', body: form });
      data = await res.json();
    } catch (e) { return fail(502, 'Couldn’t reach the picture host. Try again.'); }
    const url = data && data.data && (data.data.display_url || data.data.url);
    if (!url || !/^https:\/\/i\.ibb\.co\//.test(url)) return fail(502, (data && data.error && data.error.message) || 'The picture host said no. Try a different picture.');
    this.sql.exec('UPDATE users SET ' + col + ' = ? WHERE id = ?', url, s.id);
    return ok({ user: this.pub({ ...s, [col]: url }) });
  }
  async setProfile(token, { bio, fav }) {
    const s = await this.userFor(token);
    if (!s) return fail(401, 'Not logged in.');
    const b = String(bio == null ? s.bio || '' : bio).replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, 160);
    let f = s.fav || '';
    if (fav !== undefined) { f = String(fav || ''); if (f && !/^[a-z]{2,20}:[0-9]{1,12}$/.test(f)) return fail(400, 'Bad song.'); }
    this.sql.exec('UPDATE users SET bio = ?, fav = ? WHERE id = ?', b, f, s.id);
    return ok({ user: this.pub({ ...s, bio: b, fav: f }) });
  }
  async adminClearProfile(token, { id }) {
    if (!(await this.requireAdmin(token))) return fail(403, 'Admins only.');
    this.sql.exec("UPDATE users SET avatar = '', bio = '', banner = '', fav = '' WHERE id = ?", Number(id));
    return ok({ ok: true });
  }
  async profile(id) {
    const u = this.sql.exec('SELECT * FROM users WHERE id = ? AND banned = 0', Number(id)).toArray()[0];
    return u ? ok({ user: this.pub(u) }) : fail(404, 'No such user.');
  }
  async resetLimits() { this.sql.exec('DELETE FROM limits'); return { ok: true }; }
  async findUser(name) {
    const u = this.sql.exec('SELECT id, display, created FROM users WHERE uname = ?', name.trim().toLowerCase()).toArray()[0];
    return u ? { exists: true, id: u.id, username: u.display, created: new Date(u.created).toISOString() } : { exists: false };
  }
  async taken(name) {
    return this.sql.exec('SELECT 1 FROM users WHERE uname = ?', String(name || '').trim().toLowerCase()).toArray().length > 0;
  }
}
